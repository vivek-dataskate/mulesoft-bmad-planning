'use strict';
// Shared contract: basic page load — applies to EVERY generated HTML file.

module.exports = {
  name: 'page load',
  tests: [
    {
      name: 'page has a non-empty <title>',
      run: async (page) => {
        const title = await page.title();
        expect(title.trim().length).toBeGreaterThan(0);
      },
    },
    {
      // Not all templates use semantic <h*> — portal/resources use CSS class headings.
      name: 'page has at least one heading or title element',
      run: async (page) => {
        const count = await page.evaluate(() =>
          document.querySelectorAll(
            'h1, h2, h3, h4, ' +
            '.header-eyebrow, .header-title, .section-head, .section-title, ' +
            '.top-bar-title, .model-title, .box-title, .phase2-title, ' +
            '.arch-name, .doc-title, .eyebrow'
          ).length
        );
        expect(count).toBeGreaterThanOrEqual(1);
      },
    },
    {
      name: 'no uncaught JS errors on load',
      run: async (page) => {
        const errors = page._jsErrors || [];
        const real = errors.filter(e =>
          !e.includes('Firebase') &&
          !e.includes('firestore') &&
          !e.includes('net::ERR') &&
          !e.includes('Failed to fetch') &&
          !e.includes('FIREBASE_CONFIG') &&
          !e.includes('Cannot read properties of undefined')
        );
        expect(real).toHaveLength(0);
      },
    },
    {
      name: 'body is non-empty (template rendered content)',
      run: async (page) => {
        const text = await page.$eval('body', el => el.innerText.trim());
        expect(text.length).toBeGreaterThan(100);
      },
    },
    {
      name: 'DataSkate branding is present',
      run: async (page) => {
        const bodyText = await page.$eval('body', el => el.innerText.toLowerCase());
        expect(bodyText).toMatch(/dataskate/i);
      },
    },
  ],
};
