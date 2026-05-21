'use strict';
// Resources structural contracts — architect guide, pricing model, and other reference docs.

module.exports = {
  name: 'resources — structural DOM checks',
  tests: [
    { name: 'top-bar navigation is present',
      run: async (page) => expect(await page.$('.top-bar')).not.toBeNull() },

    { name: 'docs-shell layout is present',
      run: async (page) => expect(await page.$('.docs-shell')).not.toBeNull() },

    { name: 'left navigation panel is present',
      run: async (page) => expect(await page.$('.nav-left')).not.toBeNull() },

    { name: 'main content area is present',
      run: async (page) => {
        const main = await page.$('.docs-main, main, .main-content, article');
        expect(main).not.toBeNull();
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
