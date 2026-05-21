'use strict';
/**
 * portal/tests/resources/structural.test.js
 *
 * Fast, browser-free checks on generated resource HTML files.
 * Covers architect-guide (docs-shell layout) and ds-pricing-model.
 *
 * For architect-guide scroll-spy behaviour see behavioral.test.js.
 */

const { getResourceHtml, getBuiltResources } = require('./helpers');

const resources = getBuiltResources();

if (resources.length === 0) {
  test.skip('No built resource HTML found — run npm run build:html first', () => {});
}

// ── Shared checks for every resource ──────────────────────────────────────

resources.forEach(name => {
  describe(`[${name}] resource structural`, () => {
    let html;
    beforeAll(() => { html = getResourceHtml(name); });

    test('page has a non-empty <title>', () => {
      const match = html.match(/<title>([^<]+)<\/title>/i);
      expect(match).not.toBeNull();
      expect(match[1].trim().length).toBeGreaterThan(0);
    });

    test('page has substantive content (>500 chars)', () => {
      // Strip all tags and measure raw text length
      const text = html.replace(/<[^>]+>/g, '').trim();
      expect(text.length).toBeGreaterThan(500);
    });

    test('DataSkate branding is present', () => {
      expect(html).toMatch(/[Dd]ata[Ss]kate/);
    });

    test('no Firebase scripts are included (static resource templates)', () => {
      expect(html).not.toMatch(/firebase-app-compat/);
    });
  });
});

// ── Architect-guide specific checks ───────────────────────────────────────

if (resources.includes('architect-guide')) {
  describe('[architect-guide] docs-shell structure', () => {
    let html;
    beforeAll(() => { html = getResourceHtml('architect-guide'); });

    test('docs-shell wrapper is present', () => {
      expect(html).toMatch(/class="docs-shell/);
    });

    test('nav-left element is present', () => {
      expect(html).toMatch(/id="nav-left"/);
    });

    test('doc-content main area is present', () => {
      expect(html).toMatch(/id="doc-content"/);
    });

    test('buildNav / scroll-spy JS is included', () => {
      // The nav is built dynamically from h2s on page load
      expect(html).toMatch(/querySelectorAll\(['"]h2['"]\)/);
    });

    test('nav-section-link active class is defined in CSS', () => {
      expect(html).toMatch(/nav-section-link\.active/);
    });
  });
}

// ── Pricing-model specific checks ─────────────────────────────────────────

if (resources.includes('ds-pricing-model')) {
  describe('[ds-pricing-model] structure', () => {
    let html;
    beforeAll(() => { html = getResourceHtml('ds-pricing-model'); });

    test('page has a heading or title element', () => {
      expect(html).toMatch(/<h[1-4]|class="[^"]*title[^"]*"|class="[^"]*header[^"]*"/);
    });

    test('pricing-related content is present', () => {
      expect(html).toMatch(/pric|rate|tier|model/i);
    });
  });
}
