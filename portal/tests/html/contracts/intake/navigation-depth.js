'use strict';
// Contract: max-3-clicks design principle for intake questionnaire pages.
// Click 1 — sticky nav (always visible); Click 2 — section/filter; Click 3 — question.

module.exports = {
  name: 'intake — navigation depth (max 3 clicks)',
  tests: [
    { name: 'sticky bar never leaves the viewport after scrolling',
      run: async (page) => {
        for (const y of [0, 500, 1500, 3000]) {
          await page.evaluate(pos => window.scrollTo(0, pos), y);
          await new Promise(r => setTimeout(r, 150));
          const top = await page.$eval('.sticky-bar', el => el.getBoundingClientRect().top);
          expect(top).toBeGreaterThanOrEqual(0);
          expect(top).toBeLessThan(50);
        }
        await page.evaluate(() => window.scrollTo(0, 0));
      } },

    { name: 'cat-tabs remain visible at any scroll depth',
      run: async (page) => {
        for (const y of [0, 500, 1500, 3000]) {
          await page.evaluate(pos => window.scrollTo(0, pos), y);
          await new Promise(r => setTimeout(r, 150));
          const top = await page.$eval('.cat-tabs', el => el.getBoundingClientRect().top);
          expect(top).toBeGreaterThanOrEqual(0);
          expect(top).toBeLessThan(120);
        }
        await page.evaluate(() => window.scrollTo(0, 0));
      } },

    { name: 'system filter view remains pinned after scrolling (if present)',
      run: async (page) => {
        const hasSysCards = await page.$('.sys-card') !== null;
        if (!hasSysCards) return;
        for (const y of [0, 500, 1500, 3000]) {
          await page.evaluate(pos => window.scrollTo(0, pos), y);
          await new Promise(r => setTimeout(r, 150));
          const top = await page.$eval('.sys-map-view', el => el.getBoundingClientRect().top);
          expect(top).toBeGreaterThanOrEqual(0);
          expect(top).toBeLessThan(250);
        }
        await page.evaluate(() => window.scrollTo(0, 0));
      } },

    { name: '"↑ Top" button is always present in sticky bar',
      run: async (page) => {
        const found = await page.evaluate(() =>
          Array.from(document.querySelectorAll('.bar-tool'))
            .some(b => b.textContent.includes('Top'))
        );
        expect(found).toBe(true);
      } },

    { name: '"Next unanswered" button is always present in sticky bar',
      run: async (page) => {
        const found = await page.evaluate(() =>
          Array.from(document.querySelectorAll('.bar-tool'))
            .some(b => b.textContent.includes('Next unanswered'))
        );
        expect(found).toBe(true);
      } },

    { name: 'each cat-tab scrolls to its anchor section (1-click nav)',
      run: async (page) => {
        const tabs = await page.$$('.cat-tab');
        for (const tab of tabs) {
          await page.evaluate(() => window.scrollTo(0, 0));
          const cat = await tab.evaluate(el => el.dataset.cat);
          await tab.click();
          await new Promise(r => setTimeout(r, 600));

          const inView = await page.evaluate(c => {
            const anchor = document.querySelector(`.cat-anchor[id*="${c}"]`);
            if (!anchor) return true;
            const { top } = anchor.getBoundingClientRect();
            return top > -200 && top < window.innerHeight + 100;
          }, cat);
          expect(inView).toBe(true);
        }
        await page.evaluate(() => window.scrollTo(0, 0));
      } },

    { name: 'every rail link resolves to an existing element id',
      run: async (page) => {
        const broken = await page.evaluate(() =>
          Array.from(document.querySelectorAll('#rail-nav a'))
            .filter(a => {
              const id = (a.getAttribute('href') || '').replace('#', '');
              return id && !document.getElementById(id);
            })
            .map(a => a.textContent.trim())
        );
        expect(broken).toHaveLength(0);
      } },

    { name: 'expanding a section reveals at least one input field (2-click)',
      run: async (page) => {
        await page.evaluate(() =>
          document.querySelectorAll('details.section-block').forEach(d => d.removeAttribute('open'))
        );
        const summary = await page.$('details.section-block > summary');
        if (!summary) return;
        await summary.click();
        await new Promise(r => setTimeout(r, 400));

        const count = await page.evaluate(() => {
          const sec = document.querySelector('details.section-block[open]');
          return sec ? sec.querySelectorAll('textarea.answer, input.tbl-ans').length : 0;
        });
        expect(count).toBeGreaterThan(0);
        // reset
        await page.evaluate(() =>
          document.querySelectorAll('details.section-block').forEach(d => d.setAttribute('open', ''))
        );
      } },
  ],
};
