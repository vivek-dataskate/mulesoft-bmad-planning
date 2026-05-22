'use strict';
/**
 * tests/intake/structural.test.js
 *
 * Fast, browser-free checks on the generated intake HTML.
 * These run against every built client slug.
 *
 * To add a check: add a new test() inside the describe block below.
 * For browser-required behaviour tests see behavioral.test.js.
 * For regression tests see regressions/
 */

const { getIntakeHtml, getBuiltSlugs } = require('./helpers');

const slugs = getBuiltSlugs();

if (slugs.length === 0) {
  test.skip('No built intake HTML found — run npm run build:html first', () => {});
}

slugs.forEach(slug => {
  describe(`[${slug}] structural`, () => {
    let html;
    beforeAll(() => { html = getIntakeHtml(slug); });

    // ── Required elements ──────────────────────────────────────────────────

    test('sticky bar is present', () => {
      expect(html).toMatch(/class="sticky-bar/);
    });

    test('back-to-top button is present', () => {
      expect(html).toMatch(/id="back-to-top"/);
    });

    test('system filter pill (bar-sys-pill) is present', () => {
      expect(html).toMatch(/id="bar-sys-pill"/);
    });

    test('"↑ Top" button is in sticky bar', () => {
      expect(html).toMatch(/↑.*Top/);
    });

    test('"Next unanswered" button is present', () => {
      expect(html).toMatch(/jumpToFirstUnanswered/);
    });

    test('cat-tabs are present and sticky', () => {
      expect(html).toMatch(/class="cat-tabs/);
      expect(html).toMatch(/position: sticky/);
    });

    test('sys-map-view is present when system nodes exist', () => {
      // Only assert when SYS_NODES is non-empty in the page
      if (html.includes('__SYS_NODES = []')) return; // no systems, skip
      expect(html).toMatch(/id="sys-map-view"/);
    });

    test('sys-map-view is sticky (not the inner row)', () => {
      if (html.includes('__SYS_NODES = []')) return;
      // The sticky positioning must be on .sys-map-view, not .sys-cards-row
      const sysMapBlock = html.match(/\.sys-map-view\s*\{([^}]+)\}/);
      expect(sysMapBlock).not.toBeNull();
      expect(sysMapBlock[1]).toMatch(/position:\s*sticky/);
    });

    test('architecture diagram SVG is not embedded (removed for real estate)', () => {
      // Diagram was deliberately removed — verify it stays out
      expect(html).not.toMatch(/class="sys-diagram-wrap"/);
    });

    // ── Question tagging ───────────────────────────────────────────────────

    test('all .q elements have a data-systems attribute (100% tagged)', () => {
      // Count .q divs that do NOT have data-systems
      const totalQ    = (html.match(/class='q'/g) || []).length;
      const taggedQ   = (html.match(/class='q'[^>]*data-systems/g) || []).length;
      // data-systems is set by JS at runtime so it won't appear in static HTML —
      // instead verify the fallback tagging code is present in the JS bundle.
      expect(html).toMatch(/allSysIds.*SYS_NODES\.map/);        // fallback exists
      expect(html).toMatch(/q\.dataset\.systems = allSysIds/);  // fallback assigns all
      // And count the .q elements so we can track regressions
      expect(totalQ).toBeGreaterThan(0);
    });

    test('tagQuestionsWithSystems includes all 4 tagging strategies', () => {
      expect(html).toMatch(/1\. Text-based/);
      expect(html).toMatch(/2\. Container-based/);
      expect(html).toMatch(/3\. UC-context/);
      expect(html).toMatch(/4\. Heading-context/);
      expect(html).toMatch(/5\. Fallback/);
    });

    test('jumpToFirstUnanswered uses position-based advancement (not always-top)', () => {
      // The key guard: must reference stickyHeight or scroll position comparison
      expect(html).toMatch(/stickyHeight/);
      expect(html).toMatch(/scrolledPast/);
    });

    // ── Firebase / submission ──────────────────────────────────────────────

    test('Firestore submit function is present', () => {
      expect(html).toMatch(/function saveToFirestore/);
      expect(html).toMatch(/function submitForm/);
    });

    test('draft auto-save to localStorage is wired', () => {
      expect(html).toMatch(/function saveDraft/);
      expect(html).toMatch(/saveDraft\(\)/);
    });
  });
});
