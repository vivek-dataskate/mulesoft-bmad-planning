'use strict';
module.exports = {
  name: 'intake — system filter',
  tests: [
    { name: 'clicking a system card activates sys-filter-on',
      run: async (page) => {
        const card = await page.$('.sys-card');
        if (!card) return;
        await card.click();
        const on = await page.evaluate(() => document.body.classList.contains('sys-filter-on'));
        expect(on).toBe(true);
        await page.evaluate(() => clearSysFilter());
      } },
    { name: 'no questions remain untagged after filter activates',
      run: async (page) => {
        const card = await page.$('.sys-card');
        if (!card) return;
        await card.click();
        const cross = await page.evaluate(() => document.querySelectorAll('.q.sys-cross').length);
        expect(cross).toBe(0);
        await page.evaluate(() => clearSysFilter());
      } },
    { name: 'bar-sys-pill shows system label when filter is active',
      run: async (page) => {
        const card = await page.$('.sys-card');
        if (!card) return;
        await card.click();
        const visible = await page.evaluate(() =>
          document.getElementById('bar-sys-pill').classList.contains('is-visible')
        );
        expect(visible).toBe(true);
        await page.evaluate(() => clearSysFilter());
      } },
    { name: 'second click on same card clears the filter',
      run: async (page) => {
        const card = await page.$('.sys-card');
        if (!card) return;
        await card.click();
        await card.click();
        const on = await page.evaluate(() => document.body.classList.contains('sys-filter-on'));
        expect(on).toBe(false);
      } },
    { name: 'system card count labels show numbers, not placeholders',
      run: async (page) => {
        await new Promise(r => setTimeout(r, 300));
        const placeholders = await page.evaluate(() =>
          Array.from(document.querySelectorAll('.sys-card-count'))
            .filter(el => el.textContent.includes('—')).length
        );
        expect(placeholders).toBe(0);
      } },
  ],
};
