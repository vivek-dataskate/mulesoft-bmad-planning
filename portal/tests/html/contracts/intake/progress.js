'use strict';
// Contract: progress tracking — answered-count and total-count are wired up.

module.exports = {
  name: 'intake — progress tracking',
  tests: [
    { name: 'answered-count element is present',
      run: async (page) => expect(await page.$('#answered-count')).not.toBeNull() },

    { name: 'total-count element is present',
      run: async (page) => expect(await page.$('#total-count')).not.toBeNull() },

    { name: 'total-count shows a positive number',
      run: async (page) => {
        const text = await page.$eval('#total-count', el => el.textContent.trim());
        expect(parseInt(text, 10)).toBeGreaterThan(0);
      } },

    { name: 'answered-count is numeric (not placeholder)',
      run: async (page) => {
        const text = await page.$eval('#answered-count', el => el.textContent.trim());
        expect(text).toMatch(/^\d+$/);
      } },

    { name: 'answered-count does not exceed total-count',
      run: async (page) => {
        const answered = await page.$eval('#answered-count', el => parseInt(el.textContent.trim(), 10));
        const total    = await page.$eval('#total-count',    el => parseInt(el.textContent.trim(), 10));
        expect(answered).toBeLessThanOrEqual(total);
      } },

    { name: 'updateProgress function is defined',
      run: async (page) => {
        const ok = await page.evaluate(() => typeof updateProgress === 'function');
        expect(ok).toBe(true);
      } },
  ],
};
