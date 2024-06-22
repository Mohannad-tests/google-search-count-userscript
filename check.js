import { Octokit } from '@octokit/rest';
import puppeteer from 'puppeteer';

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

const OWNER = 'Mohannad-tests';
const REPO = 'google-search-count-userscript';

(async () => {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.goto('https://www.google.com/search?q=puppeteer');

  const exists = await page.evaluate(() => {
    return !!document.getElementById('result-stats') && document.getElementById('appbar');
  });

  if (!exists) {
    const content = await page.content();
    console.log(content);

    const issues = await octokit.issues.listForRepo({
      owner: OWNER,
      repo: REPO,
      state: 'open'
    });

    const existingIssue = issues.data.find(issue => issue.title === 'Element not found error in check-google.js');

    if (!existingIssue) {
      await octokit.issues.create({
        owner: OWNER,
        repo: REPO,
        title: 'Element not found error in check-google.js',
        body: 'The expected element was not found on the page. The cron job will be paused until this issue is resolved.'
      });
    }

    throw new Error('Element not found');
  }

  console.log('All good');

  await browser.close();
})();
