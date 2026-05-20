// One-shot preview screenshot — DO NOT COMMIT.
const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1480, height: 1100, deviceScaleFactor: 2 });
  await page.setRequestInterception(true);
  page.on('request', req => {
    if (/gstatic\.com|firebaseio|googleapis/.test(req.url())) return req.abort();
    req.continue();
  });
  const url = 'file://' + path.resolve(process.argv[2]);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 600));

  const mode = process.argv[4] || '';
  const out  = process.argv[3] || '/tmp/intake-top.png';

  if (mode === 'closeup') {
    // Expand all and crop tightly around the first .q.is-unanswered
    const rect = await page.evaluate(() => {
      document.querySelectorAll('details.section-block, details.uc').forEach(d => d.setAttribute('open', ''));
      if (typeof updateProgress === 'function') updateProgress();
      const t = document.querySelector('.q.is-unanswered');
      if (!t) return null;
      t.scrollIntoView({ behavior: 'instant', block: 'center' });
      const r = t.getBoundingClientRect();
      return { x: Math.max(0, r.left - 20), y: Math.max(0, r.top - 20), width: r.width + 60, height: r.height + 60 };
    });
    await new Promise(r => setTimeout(r, 400));
    if (rect) {
      await page.screenshot({ path: out, clip: rect });
    } else {
      await page.screenshot({ path: out });
    }
  } else if (mode === 'expand') {
    await page.evaluate(() => {
      document.querySelectorAll('details.section-block, details.uc').forEach(d => d.setAttribute('open', ''));
      if (typeof updateProgress === 'function') updateProgress();
      const t = document.querySelector('.q.is-unanswered');
      if (t) t.scrollIntoView({ behavior: 'instant', block: 'center' });
    });
    await new Promise(r => setTimeout(r, 400));
    await page.screenshot({ path: out, fullPage: false });
  } else {
    await page.screenshot({ path: out, fullPage: false });
  }
  console.log('→', out);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
