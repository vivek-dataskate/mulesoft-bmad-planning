// One-shot preview screenshot — DO NOT COMMIT.
const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1480, height: 1100, deviceScaleFactor: 1 });
  await page.setRequestInterception(true);
  page.on('request', req => {
    if (/gstatic\.com|firebaseio|googleapis/.test(req.url())) return req.abort();
    req.continue();
  });
  const url = 'file://' + path.resolve(process.argv[2]);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 600));
  const out = process.argv[3] || '/tmp/intake-top.png';
  await page.screenshot({ path: out, fullPage: false });
  console.log('Top viewport →', out);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
