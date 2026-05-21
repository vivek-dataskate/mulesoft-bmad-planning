'use strict';
// Shared contract: internal anchor links must resolve to real elements.

module.exports = {
  name: 'no broken internal anchors',
  tests: [
    {
      name: 'every href="#..." points to an existing element id',
      run: async (page) => {
        const broken = await page.evaluate(() =>
          Array.from(document.querySelectorAll('a[href^="#"]'))
            .filter(a => {
              const id = a.getAttribute('href').slice(1);
              return id.length > 0 && !document.getElementById(id);
            })
            .map(a => `"${a.textContent.trim()}" → #${a.getAttribute('href').slice(1)}`)
        );
        expect(broken).toHaveLength(0);
      },
    },
  ],
};
