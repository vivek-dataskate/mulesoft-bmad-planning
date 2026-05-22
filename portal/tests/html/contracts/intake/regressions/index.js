'use strict';
// Intake regression contracts — one contract per fixed bug.
// Each export must conform to { name, tests: [{ name, run(page) }] }.

module.exports = [
  {
    name: 'regression: "Next unanswered" advances forward, not always to top',
    tests: [{
      name: 'clicking "Next unanswered" from mid-page stays below current position when blanks remain',
      run: async (page) => {
        // Expand all so fields are reachable
        await page.evaluate(() =>
          document.querySelectorAll('details.section-block, details.uc')
            .forEach(d => d.setAttribute('open', ''))
        );
        await page.evaluate(() => window.scrollTo(0, 800));
        await new Promise(r => setTimeout(r, 200));

        await page.evaluate(() => {
          const btn = Array.from(document.querySelectorAll('.bar-tool'))
            .find(b => b.textContent.includes('Next unanswered'));
          if (btn) btn.click();
        });
        await new Promise(r => setTimeout(r, 600));

        const scrollAfter = await page.evaluate(() => window.scrollY);
        const hasUnansweredBelow = await page.evaluate(() => {
          const fields = Array.from(
            document.querySelectorAll('textarea.answer, input.tbl-ans')
          ).filter(f => (f.value || '').trim().length === 0);
          return fields.some(f => f.getBoundingClientRect().top + window.scrollY > window.scrollY + 180);
        });

        if (hasUnansweredBelow) {
          // Must NOT have reset scroll to near-top when we started at 800
          expect(scrollAfter).toBeGreaterThan(200);
        }
      },
    }],
  },

  {
    name: 'regression: system filter cards pinned at top after scrolling',
    tests: [{
      name: '#sys-map-view stays within viewport after scrolling 1200px',
      run: async (page) => {
        const hasSysMap = await page.$('#sys-map-view') !== null;
        if (!hasSysMap) return;

        await page.evaluate(() => window.scrollTo(0, 1200));
        await new Promise(r => setTimeout(r, 300));

        const top = await page.$eval('#sys-map-view', el => el.getBoundingClientRect().top);
        expect(top).toBeGreaterThanOrEqual(0);
        expect(top).toBeLessThan(250);

        await page.evaluate(() => window.scrollTo(0, 0));
      },
    }],
  },

  {
    name: 'regression: 100% question tagging — no untagged questions',
    tests: [{
      name: 'every .q element has data-systems after JS initialises',
      run: async (page) => {
        const untagged = await page.evaluate(() =>
          Array.from(document.querySelectorAll('.q'))
            .filter(q => !q.dataset.systems || q.dataset.systems.trim() === '')
            .length
        );
        expect(untagged).toBe(0);
      },
    }, {
      name: 'no questions are dimmed (sys-cross) when a system filter is active',
      run: async (page) => {
        const card = await page.$('.sys-card');
        if (!card) return;
        await card.click();
        await new Promise(r => setTimeout(r, 300));
        const cross = await page.evaluate(() =>
          document.querySelectorAll('.q.sys-cross').length
        );
        await page.evaluate(() => { if (typeof clearSysFilter === 'function') clearSysFilter(); });
        expect(cross).toBe(0);
      },
    }],
  },
];
