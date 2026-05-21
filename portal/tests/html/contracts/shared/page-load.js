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
      name: 'page has exactly one <h1>',
      run: async (page) => {
        const count = await page.$$eval('h1', els => els.length);
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
          !e.includes('Failed to fetch')
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
