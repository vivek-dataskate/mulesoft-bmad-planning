'use strict';
/**
 * portal/tests/client-portal/structural.test.js
 *
 * Fast, browser-free checks on generated client-portal HTML.
 * Client portals are Firebase-dependent for dynamic content — only static
 * shell structure is verified here.
 *
 * Runs against every built portal slug.
 */

const { getPortalHtml, getBuiltSlugs } = require('./helpers');

const slugs = getBuiltSlugs();

if (slugs.length === 0) {
  test.skip('No built client-portal HTML found — run npm run build:html first', () => {});
}

slugs.forEach(slug => {
  describe(`[${slug}] client-portal structural`, () => {
    let html;
    beforeAll(() => { html = getPortalHtml(slug); });

    // ── Required layout elements ────────────────────────────────────────────

    test('header is present', () => {
      expect(html).toMatch(/class="header/);
    });

    test('container element is present', () => {
      expect(html).toMatch(/class="container/);
    });

    test('phase-bar element is present', () => {
      expect(html).toMatch(/class="phase-bar/);
    });

    test('at least one .section element is present', () => {
      expect(html).toMatch(/class="section/);
    });

    test('doc-grid element is present', () => {
      expect(html).toMatch(/class="doc-grid/);
    });

    // ── Identity / branding ─────────────────────────────────────────────────

    test('"Engagement Portal" eyebrow is present', () => {
      expect(html).toMatch(/Engagement Portal/);
    });

    test('"Powered by DataSkate" footer is present', () => {
      expect(html).toMatch(/Powered by.*DataSkate|DataSkate/);
    });

    // ── No broken internal anchors ──────────────────────────────────────────

    test('all internal anchor hrefs reference existing ids', () => {
      const anchors = [...html.matchAll(/href="#([^"]+)"/g)].map(m => m[1]);
      const ids     = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
      const broken  = anchors.filter(a => a.length > 0 && !ids.has(a));
      expect(broken).toHaveLength(0);
    });
  });
});
