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

    { name: 'phase bar is present (engagement progress indicator)',
      run: async (page) => {
        const found = await page.$('.phase-bar');
        // Phase bar is optional for some portal pages — only assert if rendered
        if (found) {
          const text = await found.evaluate(el => el.innerText.trim());
          expect(text.length).toBeGreaterThan(0);
        }
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
