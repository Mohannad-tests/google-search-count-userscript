import { Octokit } from '@octokit/rest';
import puppeteer from 'puppeteer';

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

const OWNER = 'Mohannad-tests';
const REPO = 'google-search-count-userscript';

(async () => {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--lang=en-US']
  });
  const page = await browser.newPage();

  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US'
  });

  await page.goto('https://www.google.com/search?hl=en&q=puppeteer');

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

    const existingIssue = issues.data.find(issue => issue.title === 'Google: Element not found error');

    if (!existingIssue) {
      await octokit.issues.create({
        owner: OWNER,
        repo: REPO,
        title: 'Google: Element not found error',
        body: 'The expected element was not found on the page. The cron job will be paused until this issue is resolved.'
      });
    }

    throw new Error('Element not found');
  }

  if (await page.evaluate(() => {
    const elRect = document.getElementById('result-stats').getBoundingClientRect();
    return elRect.top > 0;
  })) {
    throw new Error('Element is visible before appending');
  }

  await page.addScriptTag({ path: 'userscript.js' });

  await page.waitForFunction(() => {
    return window.dispatchEvent(new CustomEvent('load'));
  });

  if (! (await page.evaluate(() => {
    return Array.from(document.querySelectorAll('#result-stats')).some(el => el.getBoundingClientRect().top > 0);
  }))) {
    throw new Error('Element is not visible after appending');
  }

  console.log('All good');

  await browser.close();
})();
