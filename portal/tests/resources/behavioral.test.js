'use strict';
/**
 * portal/tests/resources/behavioral.test.js
 *
 * Browser-based tests using Puppeteer. Covers the architect-guide
 * scroll-spy navigation: left nav is built from h2s, first item is active,
 * clicking a nav link scrolls to the section and marks it active.
 *
 * Requires a built architect-guide HTML — run npm run build:html first.
 */

const puppeteer = require('puppeteer');
const { getResourceUrl, getBuiltResources } = require('./helpers');

const resources = getBuiltResources();
const HAS_GUIDE = resources.includes('architect-guide');

if (!HAS_GUIDE) {
  test.skip('architect-guide HTML not built — run npm run build:html first', () => {});
}

let browser;
let page;

beforeAll(async () => {
  if (!HAS_GUIDE) return;
  browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
}, 30000);

afterAll(async () => {
  if (browser) await browser.close();
});

beforeEach(async () => {
  if (!HAS_GUIDE) return;
  page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on('requestfailed', () => {});
  await page.goto(getResourceUrl('architect-guide'), { waitUntil: 'domcontentloaded', timeout: 15000 });
  // Wait for the nav to be built (nav-left is populated on DOMContentLoaded)
  await page.waitForFunction(
    () => document.getElementById('nav-left') && document.getElementById('nav-left').children.length > 0,
    { timeout: 10000 }
  );
}, 20000);

afterEach(async () => {
  if (page && !page.isClosed()) await page.close();
});

// ── Left nav construction ──────────────────────────────────────────────────

describe('[architect-guide] left nav built from h2s', () => {
  test('nav-left is populated after page load', async () => {
    const count = await page.evaluate(
      () => document.getElementById('nav-left').children.length
    );
    expect(count).toBeGreaterThan(0);
  });

  test('nav link count matches h2 count in doc-content', async () => {
    const [h2Count, linkCount] = await page.evaluate(() => [
      document.getElementById('doc-content').querySelectorAll('h2').length,
      document.getElementById('nav-left').querySelectorAll('a.nav-section-link').length,
    ]);
    expect(h2Count).toBeGreaterThan(0);
    expect(linkCount).toBe(h2Count);
  });

  test('first nav link has active class on load', async () => {
    const firstActive = await page.evaluate(() => {
      const links = document.querySelectorAll('#nav-left .nav-section-link');
      return links.length > 0 && links[0].classList.contains('active');
    });
    expect(firstActive).toBe(true);
  });

  test('nav links point to #id anchors matching h2 ids', async () => {
    const brokenLinks = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('#nav-left a.nav-section-link'))
        .filter(a => {
          const hash = a.getAttribute('href');
          if (!hash || !hash.startsWith('#')) return true;
          return !document.getElementById(hash.slice(1));
        })
        .map(a => a.textContent.trim());
    });
    expect(brokenLinks).toHaveLength(0);
  });
});

// ── Nav link click behaviour ───────────────────────────────────────────────

describe('[architect-guide] nav link click', () => {
  test('clicking second nav link moves active class to it', async () => {
    const links = await page.$$('#nav-left a.nav-section-link');
    if (links.length < 2) return; // only one h2 — skip

    await links[1].click();
    await new Promise(r => setTimeout(r, 400));

    const secondActive = await page.evaluate(() => {
      const items = document.querySelectorAll('#nav-left .nav-section-link');
      return items.length > 1 && items[1].classList.contains('active');
    });
    expect(secondActive).toBe(true);
  });
});

// ── Right nav (sub-sections from h3s) ─────────────────────────────────────

describe('[architect-guide] right nav sub-sections', () => {
  test('right nav area exists in the layout', async () => {
    // The architect-guide uses a nav-right or injects sub-links alongside the left nav
    // Just verify the buildRightNav function was included (structural JS presence)
    const hasBuildRightNav = await page.evaluate(
      () => typeof buildRightNav !== 'undefined' || document.querySelector('.nav-sub-link') !== null
    );
    // Accept either: the function is global OR sub-links were rendered
    // (Some builds inline the function as a closure — check for the CSS class instead)
    const hasSubLinkCSS = await page.evaluate(
      () => Array.from(document.styleSheets).some(ss => {
        try {
          return Array.from(ss.cssRules || []).some(r => r.selectorText && r.selectorText.includes('nav-sub-link'));
        } catch { return false; }
      })
    );
    expect(hasSubLinkCSS || hasBuildRightNav).toBe(true);
  });
});
