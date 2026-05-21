'use strict';
const puppeteer = require('puppeteer');
const helpers = require('/workspaces/mulesoft-bmad-planning/tests/html/helpers');
const path = require('path');

const BUILD = '/workspaces/mulesoft-bmad-planning/portal/_build';

async function check(file) {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(helpers.fileUrl(path.join(BUILD, file)), { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 800));

  const h1 = await page.evaluate(() => document.querySelectorAll('h1').length);
  const title = await page.title();
  const topClasses = await page.evaluate(() =>
    Array.from(document.body.children).slice(0, 5).map(el => el.tagName + (el.className ? '.' + el.className.split(' ')[0] : ''))
  );

  // print check
  await page.emulateMediaType('print');
  const h1PrintDisplay = await page.evaluate(() => {
    const h1 = document.querySelector('h1');
    if (!h1) return 'NO_H1';
    return window.getComputedStyle(h1).display;
  });
  await page.emulateMediaType('screen');

  console.log(`\n=== ${file} ===`);
  console.log(`  title: ${title}`);
  console.log(`  h1 count: ${h1}`);
  console.log(`  h1 in print: ${h1PrintDisplay}`);
  console.log(`  top elements: ${topClasses.join(', ')}`);
  if (errs.length) console.log(`  JS errors: ${errs[0].slice(0, 100)}`);

  await browser.close();
}

(async () => {
  await check('portal/agilemind.html');
  await check('internal/integration-deck-agilemind.html');
  await check('resources/ds-pricing-model.html');
  await check('intake/proposal-agilemind.html');
})().catch(e => { console.error(e.message); process.exit(1); });
