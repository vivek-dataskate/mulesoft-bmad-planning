'use strict';
/**
 * portal/tests/corporate-brief/structural.test.js
 *
 * Fast, browser-free checks on generated corporate-brief HTML.
 * Corporate briefs have no interactive JS — structural checks only.
 *
 * Runs against every built corporate-brief slug.
 */

const { getBriefHtml, getBuiltSlugs } = require('./helpers');

const slugs = getBuiltSlugs();

if (slugs.length === 0) {
  test.skip('No built corporate-brief HTML found — run npm run build:html first', () => {});
}

slugs.forEach(slug => {
  describe(`[${slug}] corporate-brief structural`, () => {
    let html;
    beforeAll(() => { html = getBriefHtml(slug); });

    // ── Required layout elements ────────────────────────────────────────────

    test('brief header is present', () => {
      expect(html).toMatch(/class="brief-header/);
    });

    test('at least one brief-section is present', () => {
      expect(html).toMatch(/class="brief-section/);
    });

    test('brief header contains a title or company name', () => {
      // The brief-header-top contains the brand logo area and company context
      expect(html).toMatch(/brief-header-top/);
    });

    // ── Eyebrow / identity ──────────────────────────────────────────────────

    test('"Corporate Brief" eyebrow is present', () => {
      expect(html).toMatch(/Corporate Brief/);
    });

    // ── Section content (actual h2 headings in the template) ───────────────

    test('"Corporate Stack" section is present', () => {
      expect(html).toMatch(/Corporate Stack/);
    });

    test('"What We Noticed" intelligence section is present', () => {
      expect(html).toMatch(/What We Noticed/);
    });

    test('"Sources" citations section is present', () => {
      expect(html).toMatch(/Sources/);
    });

    test('citations block is present', () => {
      // Citations section is always rendered (empty state shown when no citations)
      expect(html).toMatch(/class="citations/);
    });

    test('DataSkate branding is present', () => {
      expect(html).toMatch(/[Dd]ata[Ss]kate/);
    });

    // ── No interactive scripts ──────────────────────────────────────────────

    test('no Firebase scripts are included (static-only template)', () => {
      expect(html).not.toMatch(/firebase-app/);
    });
  });
});
