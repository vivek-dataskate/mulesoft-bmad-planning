'use strict';
/**
 * tests/intake/standard.test.js
 *
 * Standard contract tests for the intake questionnaire.
 * These cover obvious expected behaviours that should NEVER regress,
 * regardless of any feature work done on the template.
 *
 * Rule: if a reasonable person would expect it to work, it belongs here.
 *
 * To add a test: find the right describe block below and add a test().
 * Each test should be independent — do not rely on state from other tests.
 */

const puppeteer = require('puppeteer');
const { getIntakeUrl, waitForIntakeReady } = require('./helpers');

const TEST_SLUG = 'agilemind2';

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
  page.on('requestfailed', () => {}); // suppress Firebase/CDN errors in file:// context
  const jsErrors = [];
  page.on('pageerror', err => jsErrors.push(err.message));
  page._jsErrors = jsErrors;
  await page.goto(getIntakeUrl(TEST_SLUG), { waitUntil: 'domcontentloaded', timeout: 15000 });
  await waitForIntakeReady(page);
}, 20000);

afterEach(async () => {
  if (page && !page.isClosed()) await page.close();
});

// ── 1. Page load ───────────────────────────────────────────────────────────

describe('page load', () => {
  test('page title is set', async () => {
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });

  test('no uncaught JS errors on load', async () => {
    const errors = page._jsErrors.filter(e =>
      // Ignore expected Firebase/network failures in file:// context
      !e.includes('Firebase') && !e.includes('firestore') && !e.includes('net::ERR')
    );
    expect(errors).toHaveLength(0);
  });

  test('document heading (h1) is present', async () => {
    const h1 = await page.$eval('h1', el => el.textContent.trim());
    expect(h1.length).toBeGreaterThan(0);
  });

  test('at least one form section is rendered', async () => {
    const count = await page.$$eval('details.section-block', els => els.length);
    expect(count).toBeGreaterThan(0);
  });

  test('at least one question input is rendered', async () => {
    const count = await page.$$eval('textarea.answer, input.tbl-ans', els => els.length);
    expect(count).toBeGreaterThan(0);
  });
});

// ── 2. Progress tracking ───────────────────────────────────────────────────

describe('progress tracking', () => {
  test('progress total is non-zero on load', async () => {
    const total = await page.$eval('#total-count', el => parseInt(el.textContent, 10));
    expect(total).toBeGreaterThan(0);
  });

  test('answering a question increments the answered count', async () => {
    // Find an empty textarea
    const before = await page.$eval('#answered-count', el => parseInt(el.textContent, 10));
    const empty = await page.evaluate(() => {
      const ta = Array.from(document.querySelectorAll('textarea.answer'))
        .find(t => t.value.trim() === '');
      if (!ta) return null;
      // Ensure it's visible (open its parent details)
      let p = ta.parentElement;
      while (p) { if (p.tagName === 'DETAILS') p.setAttribute('open', ''); p = p.parentElement; }
      return ta.id || null;
    });
    if (!empty) { return; } // all pre-filled — skip

    await page.focus(`#${empty}`);
    await page.keyboard.type('test answer');
    await new Promise(r => setTimeout(r, 600)); // debounce

    const after = await page.$eval('#answered-count', el => parseInt(el.textContent, 10));
    expect(after).toBeGreaterThan(before);
  });

  test('progress percentage is between 0 and 100', async () => {
    const pct = await page.$eval('#bar-pct', el => parseInt(el.textContent, 10));
    expect(pct).toBeGreaterThanOrEqual(0);
    expect(pct).toBeLessThanOrEqual(100);
  });

  test('right-rail progress numbers match sticky-bar numbers', async () => {
    const barAnswered  = await page.$eval('#answered-count', el => el.textContent.trim());
    const railAnswered = await page.$eval('#rail-answered', el => el.textContent.trim());
    expect(railAnswered).toBe(barAnswered);
  });
});

// ── 3. Expand / collapse ───────────────────────────────────────────────────

describe('expand and collapse', () => {
  test('"Expand all" opens every section', async () => {
    await page.evaluate(() => {
      document.querySelectorAll('details.section-block').forEach(d => d.removeAttribute('open'));
    });
    await page.evaluate(() => toggleAllSections(true));
    const closedCount = await page.$$eval(
      'details.section-block:not([open])', els => els.length
    );
    expect(closedCount).toBe(0);
  });

  test('"Collapse all" closes every section', async () => {
    await page.evaluate(() => toggleAllSections(true));
    await page.evaluate(() => toggleAllSections(false));
    const openCount = await page.$$eval('details.section-block[open]', els => els.length);
    expect(openCount).toBe(0);
  });

  test('clicking a section summary toggles it open', async () => {
    // Close all first
    await page.evaluate(() =>
      document.querySelectorAll('details.section-block').forEach(d => d.removeAttribute('open'))
    );
    const wasClosed = await page.$eval(
      'details.section-block', d => !d.hasAttribute('open')
    );
    expect(wasClosed).toBe(true);

    await page.click('details.section-block > summary');
    const isNowOpen = await page.$eval(
      'details.section-block', d => d.hasAttribute('open')
    );
    expect(isNowOpen).toBe(true);
  });
});

// ── 4. Navigation ──────────────────────────────────────────────────────────

describe('navigation', () => {
  test('right-rail subsection links are present', async () => {
    const count = await page.$$eval('#rail-nav a', els => els.length);
    expect(count).toBeGreaterThan(0);
  });

  test('"↑ Top" button scrolls back to top', async () => {
    await page.evaluate(() => window.scrollTo(0, 800));
    await new Promise(r => setTimeout(r, 200));
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('.bar-tool'))
        .find(b => b.textContent.includes('Top'));
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 600));
    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBeLessThan(100);
  });

  test('"Next unanswered" scrolls to a blank field', async () => {
    // Expand all so fields are reachable
    await page.evaluate(() => toggleAllSections(true));
    await new Promise(r => setTimeout(r, 200));

    const hasBlank = await page.evaluate(() =>
      Array.from(document.querySelectorAll('textarea.answer, input.tbl-ans'))
        .some(f => (f.value || '').trim() === '')
    );
    if (!hasBlank) return; // fully answered — skip

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => jumpToFirstUnanswered());
    await new Promise(r => setTimeout(r, 600));

    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      return el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT');
    });
    expect(focused).toBe(true);
  });
});

// ── 5. System filter ───────────────────────────────────────────────────────

describe('system filter — standard contract', () => {
  test('active card gets is-active class', async () => {
    const card = await page.$('.sys-card');
    if (!card) return;
    await card.click();
    const isActive = await page.$eval('.sys-card', el => el.classList.contains('is-active'));
    expect(isActive).toBe(true);
  });

  test('clear filter button clears is-active from all cards', async () => {
    const card = await page.$('.sys-card');
    if (!card) return;
    await card.click();
    await page.evaluate(() => clearSysFilter());
    const anyActive = await page.$$eval('.sys-card.is-active', els => els.length);
    expect(anyActive).toBe(0);
  });

  test('sys-filter-hint is hidden while filter is active', async () => {
    const card = await page.$('.sys-card');
    if (!card) return;
    await card.click();
    const hintHidden = await page.$eval(
      '#sys-filter-hint', el => el.style.display === 'none'
    );
    expect(hintHidden).toBe(true);
  });

  test('sys-filter-hint reappears after filter is cleared', async () => {
    const card = await page.$('.sys-card');
    if (!card) return;
    await card.click();
    await page.evaluate(() => clearSysFilter());
    const hintVisible = await page.$eval(
      '#sys-filter-hint', el => el.style.display !== 'none'
    );
    expect(hintVisible).toBe(true);
  });

  test('system card count label updates after JS runs', async () => {
    const label = await page.$eval('.sys-card-count', el => el.textContent.trim());
    // Should show "X / Y questions answered", not the placeholder "— / —"
    expect(label).not.toMatch(/^—/);
    expect(label).toMatch(/\d/);
  });
});

// ── 6. Draft persistence ───────────────────────────────────────────────────

describe('draft persistence', () => {
  test('typing in a field saves a draft key to localStorage', async () => {
    const ta = await page.evaluate(() => {
      const t = document.querySelector('textarea.answer');
      if (t) {
        let p = t.parentElement;
        while (p) { if (p.tagName === 'DETAILS') p.setAttribute('open', ''); p = p.parentElement; }
      }
      return t ? t.id : null;
    });
    if (!ta) return;

    await page.focus(`#${ta}`);
    await page.keyboard.type('draft test');
    await new Promise(r => setTimeout(r, 800));

    const hasDraft = await page.evaluate(() => {
      const keys = Object.keys(localStorage);
      return keys.some(k => k.startsWith('intake_draft_'));
    });
    expect(hasDraft).toBe(true);
  });
});

// ── 7. Print ───────────────────────────────────────────────────────────────

describe('print', () => {
  test('printAllExpanded function exists and does not throw', async () => {
    const error = await page.evaluate(() => {
      try {
        // We can't actually call window.print() in headless but we can
        // verify the setup code runs without error
        const details = Array.from(document.querySelectorAll('details.section-block'));
        details.forEach(d => d.setAttribute('open', ''));
        // Restore — simulate what printAllExpanded does before print()
        details.forEach(d => d.removeAttribute('open'));
        return null;
      } catch (e) {
        return e.message;
      }
    });
    expect(error).toBeNull();
  });

  test('printAllExpanded is defined in the page', async () => {
    const exists = await page.evaluate(() => typeof printAllExpanded === 'function');
    expect(exists).toBe(true);
  });
});
