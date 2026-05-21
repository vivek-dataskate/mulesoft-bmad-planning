'use strict';
/**
 * portal/tests/proposal/structural.test.js
 *
 * Fast, browser-free checks on the generated proposal HTML.
 * Runs against every built proposal slug.
 *
 * For browser-required behaviour tests see behavioral.test.js.
 */

const { getProposalHtml, getBuiltSlugs } = require('./helpers');

const slugs = getBuiltSlugs();

if (slugs.length === 0) {
  test.skip('No built proposal HTML found — run npm run build:html first', () => {});
}

slugs.forEach(slug => {
  describe(`[${slug}] proposal structural`, () => {
    let html;
    beforeAll(() => { html = getProposalHtml(slug); });

    // ── Required layout elements ────────────────────────────────────────────

    test('header section is present', () => {
      expect(html).toMatch(/class="header/);
    });

    test('"Confidential" label is present', () => {
      expect(html).toMatch(/[Cc]onfidential/);
    });

    test('sticky bar is present', () => {
      expect(html).toMatch(/class="sticky-bar/);
    });

    test('tab nav is present', () => {
      expect(html).toMatch(/class="tab-nav/);
    });

    test('all 4 tab buttons exist (proposal, solution, ai, about)', () => {
      expect(html).toMatch(/data-tab="proposal"/);
      expect(html).toMatch(/data-tab="solution"/);
      expect(html).toMatch(/data-tab="ai"/);
      expect(html).toMatch(/data-tab="about"/);
    });

    test('proposal tab is marked active by default', () => {
      expect(html).toMatch(/tab-btn active.*data-tab="proposal"|data-tab="proposal".*tab-btn active/);
    });

    test('tab panels exist for all 4 tabs', () => {
      expect(html).toMatch(/id="tab-proposal"/);
      expect(html).toMatch(/id="tab-solution"/);
      expect(html).toMatch(/id="tab-ai"/);
      expect(html).toMatch(/id="tab-about"/);
    });

    test('non-proposal tab panels start hidden', () => {
      expect(html).toMatch(/id="tab-solution"[^>]*style="display:none"/);
      expect(html).toMatch(/id="tab-ai"[^>]*style="display:none"/);
      expect(html).toMatch(/id="tab-about"[^>]*style="display:none"/);
    });

    // ── Expandable sections ─────────────────────────────────────────────────

    test('at least one details.section-block element is present', () => {
      expect(html).toMatch(/details class="section-block/);
    });

    // ── Accept panel ────────────────────────────────────────────────────────

    test('#accept-panel is present', () => {
      expect(html).toMatch(/id="accept-panel"/);
    });

    test('#accept-panel starts hidden (display:none)', () => {
      expect(html).toMatch(/accept-panel[^>]*display:\s*none|display:\s*none[^<]*accept-panel/);
    });

    test('#accept-btn is present', () => {
      expect(html).toMatch(/id="accept-btn"/);
    });

    test('#accept-panel contains name and email fields', () => {
      expect(html).toMatch(/id="accept-name"/);
      expect(html).toMatch(/id="accept-email"/);
    });

    // ── JavaScript functions ────────────────────────────────────────────────

    test('showTab function is defined', () => {
      expect(html).toMatch(/function showTab/);
    });

    test('toggleAllSections function is defined', () => {
      expect(html).toMatch(/function toggleAllSections/);
    });

    test('showAcceptPanel function is defined', () => {
      expect(html).toMatch(/function showAcceptPanel/);
    });

    test('selectModel function is defined', () => {
      expect(html).toMatch(/function selectModel/);
    });
  });
});
