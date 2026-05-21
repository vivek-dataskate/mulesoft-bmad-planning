'use strict';
// Internal structural contracts — architect pitch kits and integration decks.

module.exports = {
  name: 'internal — structural DOM checks',
  tests: [
    { name: 'header is present',
      run: async (page) => expect(await page.$('.header')).not.toBeNull() },

    { name: '"INTERNAL" badge is present',
      run: async (page) => {
        const bodyText = await page.$eval('body', el => el.innerText);
        expect(bodyText).toMatch(/internal/i);
      } },

    { name: 'at least one section element is present',
      run: async (page) => {
        const count = await page.$$eval('section', els => els.length);
        expect(count).toBeGreaterThan(0);
      } },

    { name: 'page element is present (main content wrapper)',
      run: async (page) => expect(await page.$('.page')).not.toBeNull() },

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
