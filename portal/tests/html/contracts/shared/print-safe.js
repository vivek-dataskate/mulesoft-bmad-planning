'use strict';
// Shared contract: page must not break when printed / saved as PDF.

module.exports = {
  name: 'print safe',
  tests: [
    {
      name: '@media print does not hide the entire body',
      run: async (page) => {
        // Inject print media and check body visibility
        await page.emulateMediaType('print');
        const bodyVisible = await page.$eval('body', el => {
          const s = window.getComputedStyle(el);
          return s.display !== 'none' && s.visibility !== 'hidden';
        });
        await page.emulateMediaType('screen');
        expect(bodyVisible).toBe(true);
      },
    },
    {
      name: 'main content is visible in print mode',
      run: async (page) => {
        await page.emulateMediaType('print');
        const hasContent = await page.evaluate(() => {
          const h1 = document.querySelector('h1');
          if (!h1) return false;
          const s = window.getComputedStyle(h1);
          return s.display !== 'none';
        });
        await page.emulateMediaType('screen');
        expect(hasContent).toBe(true);
      },
    },
  ],
};
