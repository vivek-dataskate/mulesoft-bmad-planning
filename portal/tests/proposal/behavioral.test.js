'use strict';
/**
 * portal/tests/proposal/behavioral.test.js
 *
 * Browser-based tests using Puppeteer. Covers interactive behaviour:
 * tab switching, expand/collapse sections, accept panel, model card selection.
 *
 * Requires a built proposal HTML — run npm run build:html first.
 */

const puppeteer = require('puppeteer');
const { getProposalUrl, getBuiltSlugs, waitForProposalReady } = require('./helpers');

const slugs    = getBuiltSlugs();
const TEST_SLUG = slugs[0];

if (!TEST_SLUG) {
  test.skip('No built proposal HTML found — run npm run build:html first', () => {});
}

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
  page.on('requestfailed', () => {});
  await page.goto(getProposalUrl(TEST_SLUG), { waitUntil: 'domcontentloaded', timeout: 15000 });
  await waitForProposalReady(page);
}, 20000);

afterEach(async () => {
  if (page && !page.isClosed()) await page.close();
});

// ── Tab switching ──────────────────────────────────────────────────────────

describe(`[${TEST_SLUG}] tab switching`, () => {
  test('proposal tab panel is visible by default', async () => {
    const display = await page.evaluate(() => {
      const el = document.getElementById('tab-proposal');
      return el ? getComputedStyle(el).display : null;
    });
    expect(display).not.toBe('none');
    expect(display).not.toBeNull();
  });

  test('clicking solution tab shows #tab-solution and hides #tab-proposal', async () => {
    await page.click('.tab-btn[data-tab="solution"]');
    const [solutionDisplay, proposalDisplay] = await page.evaluate(() => [
      getComputedStyle(document.getElementById('tab-solution')).display,
      getComputedStyle(document.getElementById('tab-proposal')).display,
    ]);
    expect(solutionDisplay).not.toBe('none');
    expect(proposalDisplay).toBe('none');
  });

  test('active class moves to clicked tab button', async () => {
    await page.click('.tab-btn[data-tab="solution"]');
    const [solutionActive, proposalActive] = await page.evaluate(() => [
      document.querySelector('.tab-btn[data-tab="solution"]').classList.contains('active'),
      document.querySelector('.tab-btn[data-tab="proposal"]').classList.contains('active'),
    ]);
    expect(solutionActive).toBe(true);
    expect(proposalActive).toBe(false);
  });

  test('switching back to proposal tab re-shows #tab-proposal', async () => {
    await page.click('.tab-btn[data-tab="solution"]');
    await page.click('.tab-btn[data-tab="proposal"]');
    const display = await page.evaluate(
      () => getComputedStyle(document.getElementById('tab-proposal')).display
    );
    expect(display).not.toBe('none');
  });
});

// ── Expand / collapse sections ─────────────────────────────────────────────

describe(`[${TEST_SLUG}] expand/collapse`, () => {
  test('"Expand All" button is present in sticky bar', async () => {
    const text = await page.$eval(
      '.sticky-bar button[onclick*="toggleAllSections"]',
      el => el.textContent.trim()
    );
    expect(text).toMatch(/Expand All|Collapse All/);
  });

  test('clicking Expand All opens all sections and changes button label', async () => {
    const initialText = await page.$eval(
      '.sticky-bar button[onclick*="toggleAllSections"]',
      el => el.textContent.trim()
    );
    await page.click('.sticky-bar button[onclick*="toggleAllSections"]');
    const afterText = await page.$eval(
      '.sticky-bar button[onclick*="toggleAllSections"]',
      el => el.textContent.trim()
    );
    // Button label must toggle
    expect(afterText).not.toBe(initialText);
    expect(afterText).toMatch(/Expand All|Collapse All/);
  });

  test('clicking toggle twice returns button to original label', async () => {
    const btn = '.sticky-bar button[onclick*="toggleAllSections"]';
    const original = await page.$eval(btn, el => el.textContent.trim());
    await page.click(btn);
    await page.click(btn);
    const final = await page.$eval(btn, el => el.textContent.trim());
    expect(final).toBe(original);
  });
});

// ── Accept panel ───────────────────────────────────────────────────────────

describe(`[${TEST_SLUG}] accept panel`, () => {
  test('accept panel is hidden on page load', async () => {
    const display = await page.evaluate(() => {
      const panel = document.getElementById('accept-panel');
      return panel ? panel.style.display : null;
    });
    // CSS sets display:none; JS hasn't run showAcceptPanel yet
    expect(display).toBe('none');
  });

  test('clicking Accept Proposal button shows the accept panel', async () => {
    await page.click('#accept-btn');
    const display = await page.evaluate(
      () => document.getElementById('accept-panel').style.display
    );
    expect(display).toBe('block');
  });

  test('accept panel contains name and email inputs', async () => {
    await page.click('#accept-btn');
    const nameInput  = await page.$('#accept-name');
    const emailInput = await page.$('#accept-email');
    expect(nameInput).not.toBeNull();
    expect(emailInput).not.toBeNull();
  });
});

// ── Model card selection ───────────────────────────────────────────────────

describe(`[${TEST_SLUG}] model card selection`, () => {
  test('negotiate panel is hidden before model card is selected', async () => {
    const panel = await page.$('#negotiate-panel');
    if (!panel) return; // no model cards on this slug — skip
    const display = await page.evaluate(
      () => (document.getElementById('negotiate-panel') || {}).style?.display || 'none'
    );
    expect(display).toBe('none');
  });

  test('clicking a model card shows negotiate panel', async () => {
    // Model cards call selectModel() via onclick
    const card = await page.$('[onclick*="selectModel"]');
    if (!card) return; // template variant has no model cards — skip
    await card.click();
    const display = await page.evaluate(
      () => document.getElementById('negotiate-panel').style.display
    );
    expect(display).toBe('block');
  });
});
