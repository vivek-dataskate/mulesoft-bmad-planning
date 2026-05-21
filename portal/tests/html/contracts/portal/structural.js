'use strict';
// Portal structural contracts — client engagement portal pages.

module.exports = {
  name: 'portal — structural DOM checks',
  tests: [
    { name: 'header is present',
      run: async (page) => expect(await page.$('.header')).not.toBeNull() },

    { name: 'container element is present',
      run: async (page) => expect(await page.$('.container')).not.toBeNull() },

    { name: 'at least one section element is present',
      run: async (page) => {
        const count = await page.$$eval('.section', els => els.length);
        expect(count).toBeGreaterThan(0);
      } },

    { name: 'phase bar element exists in the DOM',
      run: async (page) => {
        // Phase bar presence confirms the portal template rendered the engagement header.
        // It may be empty when no phase data is configured — that's acceptable.
        const found = await page.$('.phase-bar');
        expect(found).not.toBeNull();
      } },

    { name: 'no broken internal anchor links',
      run: async (page) => {
        const broken = await page.evaluate(() =>
          Array.from(document.querySelectorAll('a[href^="#"]'))
            .filter(a => {
              const id = a.getAttribute('href').slice(1);
              return id.length > 0 && !document.getElementById(id);
            })
            .map(a => a.textContent.trim())
        );
        expect(broken).toHaveLength(0);
      } },
  ],
};
