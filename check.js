import { Octokit } from '@octokit/rest';
import puppeteer from 'puppeteer';
import fs from 'fs';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

const OWNER = 'Mohannad-tests';
const REPO = 'google-search-count-userscript';

(async () => {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--lang=en-US']
  });
  const page = await browser.newPage();

  await page.setViewport({ width: 400, height: 300 });
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US'
  });

  await page.goto('https://www.google.com/search?hl=en&q=Google+Search+Results+Count');

  // Take a screenshot before running the script
  await page.screenshot({ path: './screenshot_before.png' });

  const exists = await page.evaluate(() => {
    return !!document.getElementById('result-stats') && document.getElementById('appbar');
  });

  if (!exists) {
    await handleIssue(page, 'The expected element was not found on the page before running the script.');
    await browser.close();
    process.exit(1);
  }

  await page.addScriptTag({ path: 'userscript.js' });

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('load'));
  });

  // Take a screenshot after running the script
  await page.screenshot({ path: './screenshot_after.png' });

  const visible = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('#result-stats')).some(el => el.getBoundingClientRect().top > 0);
  });

  if (!visible) {
    await handleIssue(page, 'The expected element was not found on the page after running the script.');
    await browser.close();
    process.exit(1);
  }

  const before = PNG.sync.read(fs.readFileSync('./screenshot_before.png'));
  const after = PNG.sync.read(fs.readFileSync('./screenshot_after.png'));
  const { width, height } = before;
  const diff = new PNG({ width, height });

  const numDiffPixels = pixelmatch(before.data, after.data, diff.data, width, height, { threshold: 0.1 });

  if (numDiffPixels > 0) {
    await createPR();
  }

  console.log('All good');
  await browser.close();
})();

async function handleIssue(page, errorMessage) {
  const issues = await octokit.issues.listForRepo({
    owner: OWNER,
    repo: REPO,
    state: 'open'
  });

  const existingIssue = issues.data.find(issue => issue.title === 'Error: Something is not working');

  if (!existingIssue) {
    const beforeScreenshot = fs.readFileSync('./screenshot_before.png', { encoding: 'base64' });
    const afterScreenshot = fs.readFileSync('./screenshot_after.png', { encoding: 'base64' });

    await octokit.issues.create({
      owner: OWNER,
      repo: REPO,
      title: 'Error: Something is not working',
      body: `${errorMessage}

Before Screenshot:
![Before](data:image/png;base64,${beforeScreenshot})

After Screenshot:
![After](data:image/png;base64,${afterScreenshot})`,
      labels: ['bug']
    });
  }
}

async function createPR() {
  const branchName = `screenshot-update-${Date.now()}`;
  const { data: refData } = await octokit.git.getRef({
    owner: OWNER,
    repo: REPO,
    ref: 'heads/main'
  });

  const baseSha = refData.object.sha;

  // Create a new branch from main
  await octokit.git.createRef({
    owner: OWNER,
    repo: REPO,
    ref: `refs/heads/${branchName}`,
    sha: baseSha
  });

  // Fetch the current SHA for screenshot_before.png
  const { data: beforeFileData } = await octokit.repos.getContent({
    owner: OWNER,
    repo: REPO,
    path: 'screenshot_before.png',
    ref: branchName
  });

  // Fetch the current SHA for screenshot_after.png
  const { data: afterFileData } = await octokit.repos.getContent({
    owner: OWNER,
    repo: REPO,
    path: 'screenshot_after.png',
    ref: branchName
  });

  const beforeScreenshot = fs.readFileSync('./screenshot_before.png', { encoding: 'base64' });
  const afterScreenshot = fs.readFileSync('./screenshot_after.png', { encoding: 'base64' });

  // Update screenshot_before.png
  await octokit.repos.createOrUpdateFileContents({
    owner: OWNER,
    repo: REPO,
    path: 'screenshot_before.png',
    message: 'Update screenshot_before.png',
    content: beforeScreenshot,
    branch: branchName,
    sha: beforeFileData.sha
  });

  // Update screenshot_after.png
  await octokit.repos.createOrUpdateFileContents({
    owner: OWNER,
    repo: REPO,
    path: 'screenshot_after.png',
    message: 'Update screenshot_after.png',
    content: afterScreenshot,
    branch: branchName,
    sha: afterFileData.sha
  });

  // Create a pull request
  await octokit.pulls.create({
    owner: OWNER,
    repo: REPO,
    title: 'Update screenshots',
    head: branchName,
    base: 'main',
    body: 'Automated PR to update screenshots after running the script.'
  });
}

