'use strict';
/**
 * tests/intake/behavioral.test.js
 *
 * Browser-based tests using Puppeteer. Covers interactive behaviour that
 * cannot be verified from the HTML string alone: scroll, click, JS state.
 *
 * Auto-discovers and runs every file in regressions/ so new bugs only need
 * a single file to prevent them from ever recurring.
 *
 * To add a regression: create tests/intake/regressions/NNN-bug-name.js
 * (see existing files for the required export shape).
 */

const fs        = require('fs');
const path      = require('path');
const puppeteer = require('puppeteer');
const { getIntakeUrl, getBuiltSlugs, waitForIntakeReady } = require('./helpers');

const REGRESSIONS_DIR = path.join(__dirname, 'regressions');
const TEST_SLUG       = 'agilemind2'; // primary client used for behavioral tests

// ── Puppeteer lifecycle ────────────────────────────────────────────────────

let browser;
let page;

beforeAll(async () => {
  browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
}, 30000);

afterAll(async () => {
  if (browser) await browser.close();
});

beforeEach(async () => {
  page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  // Suppress Firebase network errors — they're expected in file:// context
  page.on('requestfailed', () => {});
  await page.goto(getIntakeUrl(TEST_SLUG), { waitUntil: 'domcontentloaded', timeout: 15000 });
  await waitForIntakeReady(page);
}, 20000);

afterEach(async () => {
  if (page && !page.isClosed()) await page.close();
});

// ── Core behavioural tests ─────────────────────────────────────────────────

describe(`[${TEST_SLUG}] system filter`, () => {
  test('system cards are rendered', async () => {
    const count = await page.$$eval('.sys-card', els => els.length);
    expect(count).toBeGreaterThan(0);
  });

  test('clicking a system card activates sys-filter-on on body', async () => {
    const card = await page.$('.sys-card');
    expect(card).not.toBeNull();
    await card.click();
    const filterOn = await page.evaluate(
      () => document.body.classList.contains('sys-filter-on')
    );
    expect(filterOn).toBe(true);
  });

  test('active filter shows bar-sys-pill with system label', async () => {
    const card = await page.$('.sys-card');
    await card.click();
    const pillVisible = await page.evaluate(
      () => document.getElementById('bar-sys-pill').classList.contains('is-visible')
    );
    expect(pillVisible).toBe(true);
    const label = await page.evaluate(
      () => document.getElementById('bar-sys-label').textContent.trim()
    );
    expect(label.length).toBeGreaterThan(0);
  });

  test('clicking active card again clears the filter', async () => {
    const card = await page.$('.sys-card');
    await card.click();
    await card.click();
    const filterOn = await page.evaluate(
      () => document.body.classList.contains('sys-filter-on')
    );
    expect(filterOn).toBe(false);
  });

  test('all questions have data-systems set after tagQuestionsWithSystems runs', async () => {
    const untagged = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.q'))
        .filter(q => !q.dataset.systems || q.dataset.systems.trim() === '').length
    );
    expect(untagged).toBe(0);
  });

  test('when filter is active, no questions are left in sys-cross (dimmed) state', async () => {
    // Every question should be sys-match because untagged ones are assigned to all systems
    const card = await page.$('.sys-card');
    await card.click();
    const crossCount = await page.evaluate(
      () => document.querySelectorAll('.q.sys-cross').length
    );
    expect(crossCount).toBe(0);
  });
});

describe(`[${TEST_SLUG}] back-to-top button`, () => {
  test('button is invisible before scrolling', async () => {
    const visible = await page.evaluate(
      () => document.getElementById('back-to-top').classList.contains('is-visible')
    );
    expect(visible).toBe(false);
  });

  test('button becomes visible after scrolling 150px', async () => {
    await page.evaluate(() => window.scrollTo(0, 200));
    await new Promise(r => setTimeout(r, 300));
    const visible = await page.evaluate(
      () => document.getElementById('back-to-top').classList.contains('is-visible')
    );
    expect(visible).toBe(true);
  });

  test('clicking button scrolls to top', async () => {
    await page.evaluate(() => window.scrollTo(0, 1000));
    await new Promise(r => setTimeout(r, 200));
    await page.click('#back-to-top');
    await new Promise(r => setTimeout(r, 600));
    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBeLessThan(100);
  });
});

describe(`[${TEST_SLUG}] sticky elements`, () => {
  test('sys-map-view remains in viewport after scrolling past it', async () => {
    // Scroll well past the system cards' natural position
    await page.evaluate(() => window.scrollTo(0, 1500));
    await new Promise(r => setTimeout(r, 200));
    const top = await page.evaluate(() => {
      const el = document.getElementById('sys-map-view');
      return el ? el.getBoundingClientRect().top : -1;
    });
    // Sticky element should be pinned near the top of the viewport (not far above)
    expect(top).toBeGreaterThanOrEqual(0);
    expect(top).toBeLessThan(300);
  });
});

// ── Auto-run all regression tests ─────────────────────────────────────────

const regressionFiles = fs.existsSync(REGRESSIONS_DIR)
  ? fs.readdirSync(REGRESSIONS_DIR)
      .filter(f => /^\d+-.+\.js$/.test(f))
      .sort()
  : [];

if (regressionFiles.length > 0) {
  describe(`[${TEST_SLUG}] regressions`, () => {
    regressionFiles.forEach(file => {
      const reg = require(path.join(REGRESSIONS_DIR, file));
      test(reg.name, async () => {
        await reg.run(page);
      }, 15000);
    });
  });
}
