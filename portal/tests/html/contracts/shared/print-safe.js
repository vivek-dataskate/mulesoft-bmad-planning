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
          // Not all templates use <h1> — check for any primary heading class
          const headings = document.querySelectorAll('h1, h2, .header-title, .section-head, .doc-title, .arch-name');
          if (!headings.length) return true; // no headings at all — pass
          const first = headings[0];
          const s = window.getComputedStyle(first);
          return s.display !== 'none';
        });
        await page.emulateMediaType('screen');
        expect(hasContent).toBe(true);
      },
    },
  ],
};
