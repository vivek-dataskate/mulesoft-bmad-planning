'use strict';
// Resources structural contracts — architect guide, pricing model, and other reference docs.
// Resource pages may use different layouts (docs-shell vs single-page), so checks are flexible.

module.exports = {
  name: 'resources — structural DOM checks',
  tests: [
    { name: 'page has a primary navigation or header element',
      run: async (page) => {
        const found = await page.$('.top-bar, nav, .header, .nav-left, .page');
        expect(found).not.toBeNull();
      } },

    { name: 'page has substantive content (>500 chars of text)',
      run: async (page) => {
        const text = await page.$eval('body', el => el.innerText.trim());
        expect(text.length).toBeGreaterThan(500);
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

    // Docs-shell specific — only assert if the layout is present
    { name: 'docs-shell: left nav exists when docs-shell layout is used',
      run: async (page) => {
        const shell = await page.$('.docs-shell');
        if (!shell) return; // not a docs-shell page — skip
        const nav = await page.$('.nav-left');
        expect(nav).not.toBeNull();
      } },

    { name: 'docs-shell: main content area exists when docs-shell layout is used',
      run: async (page) => {
        const shell = await page.$('.docs-shell');
        if (!shell) return;
        const main = await page.$('.docs-main, main, article, .main-content');
        expect(main).not.toBeNull();
      } },
  ],
};
