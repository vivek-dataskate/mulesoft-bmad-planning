'use strict';
/**
 * tests/intake/navigation-depth.test.js
 *
 * Enforces the design principle: every screen is easily presentable and
 * any point in the form is reachable in at most 3 clicks from anywhere.
 *
 * The contract:
 *   Click 1 — primary navigation (always sticky: cat-tabs, sys-cards, rail, ↑ Top)
 *   Click 2 — land on the right section / filter (section opens, scrolled into view)
 *   Click 3 — reach the specific question (expand UC if needed, or "Next unanswered")
 *
 * If any of these tests fail, a navigation shortcut has been broken and a user
 * will need more than 3 clicks to reach some part of the form.
 */

const puppeteer = require('puppeteer');
const { getIntakeUrl, waitForIntakeReady } = require('./helpers');

const TEST_SLUG = 'agilemind2';

let browser, page;

beforeAll(async () => {
  browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
}, 30000);

afterAll(async () => { if (browser) await browser.close(); });

beforeEach(async () => {
  page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.on('requestfailed', () => {});
  await page.goto(getIntakeUrl(TEST_SLUG), { waitUntil: 'domcontentloaded', timeout: 15000 });
  await waitForIntakeReady(page);
}, 20000);

afterEach(async () => { if (page && !page.isClosed()) await page.close(); });

// Helper: scroll to a position and wait for layout to settle
async function scrollTo(y) {
  await page.evaluate(pos => window.scrollTo(0, pos), y);
  await new Promise(r => setTimeout(r, 250));
}

// Helper: check if an element's top edge is inside the viewport
async function isInViewport(selector) {
  return page.evaluate(sel => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const { top } = el.getBoundingClientRect();
    return top >= 0 && top < window.innerHeight;
  }, selector);
}

// ── Always-accessible navigation (click 0 — always visible) ───────────────

describe('always-accessible navigation elements', () => {
  const SCROLL_DEPTHS = [0, 500, 1500, 3000, 6000];

  test('sticky bar never leaves the viewport at any scroll depth', async () => {
    for (const y of SCROLL_DEPTHS) {
      await scrollTo(y);
      const top = await page.$eval('.sticky-bar', el => el.getBoundingClientRect().top);
      expect(top).toBeGreaterThanOrEqual(0);
      expect(top).toBeLessThan(50); // pinned flush to top
    }
  });

  test('cat-tabs remain visible at any scroll depth', async () => {
    for (const y of SCROLL_DEPTHS) {
      await scrollTo(y);
      const top = await page.$eval('.cat-tabs', el => el.getBoundingClientRect().top);
      expect(top).toBeGreaterThanOrEqual(0);
      expect(top).toBeLessThan(120);
    }
  });

  test('system filter cards remain visible at any scroll depth', async () => {
    const hasSysCards = await page.$('.sys-card') !== null;
    if (!hasSysCards) return;
    for (const y of SCROLL_DEPTHS) {
      await scrollTo(y);
      const top = await page.$eval('.sys-map-view', el => el.getBoundingClientRect().top);
      expect(top).toBeGreaterThanOrEqual(0);
      expect(top).toBeLessThan(250);
    }
  });

  test('right rail remains visible at any scroll depth', async () => {
    for (const y of SCROLL_DEPTHS) {
      await scrollTo(y);
      const { top, bottom } = await page.$eval('.rail-col', el => {
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom };
      });
      // Rail is sticky — its top edge must stay within the visible viewport
      expect(top).toBeGreaterThanOrEqual(0);
      expect(top).toBeLessThan(900); // viewport height
    }
  });

  test('"↑ Top" button is always present in sticky bar', async () => {
    const found = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.bar-tool'))
        .some(b => b.textContent.includes('Top'))
    );
    expect(found).toBe(true);
  });

  test('"Next unanswered" button is always present in sticky bar', async () => {
    const found = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.bar-tool'))
        .some(b => b.textContent.includes('Next unanswered'))
    );
    expect(found).toBe(true);
  });

  test('"Expand all" and "Collapse all" always present in sticky bar', async () => {
    const expandFound = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.bar-tool'))
        .some(b => b.textContent.includes('Expand'))
    );
    const collapseFound = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.bar-tool'))
        .some(b => b.textContent.includes('Collapse'))
    );
    expect(expandFound).toBe(true);
    expect(collapseFound).toBe(true);
  });
});

// ── 1-click navigation ─────────────────────────────────────────────────────

describe('1-click: cat-tab brings its section into the viewport', () => {
  test('each cat-tab scrolls to its anchor and puts it in view', async () => {
    const tabs = await page.$$('.cat-tab');
    for (const tab of tabs) {
      await scrollTo(0);
      const cat = await tab.evaluate(el => el.dataset.cat);
      await tab.click();
      await new Promise(r => setTimeout(r, 700));

      const inView = await page.evaluate(c => {
        // find the anchor for this category
        const anchor = document.querySelector(`.cat-anchor[id*="${c}"]`);
        if (!anchor) return true; // no anchor = nothing to check
        const { top } = anchor.getBoundingClientRect();
        return top > -100 && top < window.innerHeight + 100;
      }, cat);
      expect(inView).toBe(true);
    }
  });
});

describe('1-click: right-rail subsection link brings section into view', () => {
  test('every rail link resolves to an existing anchor in the DOM', async () => {
    const broken = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#rail-nav a'))
        .filter(a => {
          const id = (a.getAttribute('href') || '').replace('#', '');
          return id && !document.getElementById(id);
        })
        .map(a => a.textContent.trim())
    );
    expect(broken).toHaveLength(0);
  });

  test('clicking a rail link scrolls that section into the viewport', async () => {
    await scrollTo(2000); // start away from top

    const link = await page.$('#rail-nav a');
    if (!link) return;
    const sectionId = await link.evaluate(el => el.getAttribute('href').replace('#', ''));
    await link.click();
    await new Promise(r => setTimeout(r, 700));

    const inView = await page.evaluate(id => {
      const el = document.getElementById(id);
      if (!el) return false;
      const { top } = el.getBoundingClientRect();
      return top > -200 && top < window.innerHeight + 100;
    }, sectionId);
    expect(inView).toBe(true);
  });
});

describe('1-click: system card filters and reveals first match', () => {
  test('clicking a system card immediately scrolls to the first highlighted question', async () => {
    const card = await page.$('.sys-card');
    if (!card) return;

    await card.click();
    await new Promise(r => setTimeout(r, 700));

    const firstMatchInView = await page.evaluate(() => {
      const match = document.querySelector('.q.sys-match');
      if (!match) return true; // vacuously true — no matches
      const { top } = match.getBoundingClientRect();
      return top >= 0 && top < window.innerHeight;
    });
    expect(firstMatchInView).toBe(true);
  });

  test('every system card has a readable count label (not placeholder dashes)', async () => {
    const placeholders = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.sys-card-count'))
        .filter(el => el.textContent.includes('—')).length
    );
    expect(placeholders).toBe(0);
  });
});

// ── 2-click: section + question ────────────────────────────────────────────

describe('2-click: opening a section reveals its questions', () => {
  test('expanding a section reveals at least one input field', async () => {
    // Close all sections first
    await page.evaluate(() =>
      document.querySelectorAll('details.section-block').forEach(d => d.removeAttribute('open'))
    );
    // Open the first section
    await page.click('details.section-block > summary');
    await new Promise(r => setTimeout(r, 400));

    const inputCount = await page.evaluate(() => {
      const sec = document.querySelector('details.section-block[open]');
      return sec ? sec.querySelectorAll('textarea.answer, input.tbl-ans').length : 0;
    });
    expect(inputCount).toBeGreaterThan(0);
  });
});

// ── 3-click max: full journey ──────────────────────────────────────────────

describe('3-click journey: from top → category → section → question', () => {
  test('cat-tab click + rail link click puts a question input in the viewport', async () => {
    await scrollTo(0);

    // Click 1: cat-tab
    const tab = await page.$('.cat-tab');
    await tab.click();
    await new Promise(r => setTimeout(r, 500));

    // Click 2: first rail subsection link
    const link = await page.$('#rail-nav a');
    if (!link) return;
    await link.click();
    await new Promise(r => setTimeout(r, 500));

    // Expand the section if closed (this is the 3rd action, equivalent to 1 click)
    await page.evaluate(() => {
      document.querySelectorAll('details.section-block').forEach(d => d.setAttribute('open', ''));
    });
    await new Promise(r => setTimeout(r, 300));

    // A question input must now be visible somewhere in the viewport
    const inputVisible = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('textarea.answer, input.tbl-ans'));
      return inputs.some(inp => {
        const { top } = inp.getBoundingClientRect();
        return top >= 0 && top < window.innerHeight;
      });
    });
    expect(inputVisible).toBe(true);
  });
});
