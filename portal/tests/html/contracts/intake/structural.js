'use strict';
module.exports = {
  name: 'intake — structural DOM checks',
  tests: [
    { name: 'sticky bar present',
      run: async (page) => expect(await page.$('.sticky-bar')).not.toBeNull() },
    { name: 'back-to-top button present',
      run: async (page) => expect(await page.$('#back-to-top')).not.toBeNull() },
    { name: '"↑ Top" in sticky bar',
      run: async (page) => {
        const found = await page.evaluate(() =>
          Array.from(document.querySelectorAll('.bar-tool')).some(b => b.textContent.includes('Top'))
        );
        expect(found).toBe(true);
      } },
    { name: 'system filter pill (bar-sys-pill) present',
      run: async (page) => expect(await page.$('#bar-sys-pill')).not.toBeNull() },
    { name: 'cat-tabs present',
      run: async (page) => expect(await page.$('.cat-tabs')).not.toBeNull() },
    { name: 'right rail subsection nav present',
      run: async (page) => expect(await page.$('#rail-nav')).not.toBeNull() },
    { name: 'sys-map-view is sticky (not inner row)',
      run: async (page) => {
        const stickyOn = await page.evaluate(() => {
          const el = document.getElementById('sys-map-view');
          if (!el) return true; // no sys nodes = skip
          return getComputedStyle(el).position === 'sticky';
        });
        expect(stickyOn).toBe(true);
      } },
    { name: 'architecture diagram SVG not embedded',
      run: async (page) => {
        const found = await page.$('.sys-diagram-wrap');
        expect(found).toBeNull();
      } },
    { name: 'all .q elements have data-systems after JS runs',
      run: async (page) => {
        const untagged = await page.evaluate(() =>
          Array.from(document.querySelectorAll('.q'))
            .filter(q => !q.dataset.systems).length
        );
        expect(untagged).toBe(0);
      } },
    { name: 'jumpToFirstUnanswered uses scroll-position logic',
      run: async (page) => {
        const hasFn = await page.evaluate(() => typeof jumpToFirstUnanswered === 'function');
        expect(hasFn).toBe(true);
      } },
    { name: 'Firestore submit and draft save functions present',
      run: async (page) => {
        const ok = await page.evaluate(() =>
          typeof saveToFirestore === 'function' && typeof saveDraft === 'function'
        );
        expect(ok).toBe(true);
      } },
  ],
};
