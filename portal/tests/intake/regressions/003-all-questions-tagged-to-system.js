'use strict';
/**
 * Regression: Only 41 of 87 questions were assigned to a system. The remaining
 * 46 generic/cross-system questions had no data-systems tag so they were dimmed
 * under every system filter instead of being highlighted.
 *
 * Found:  2026-05-21
 * Fixed:  tagQuestionsWithSystems() step 5 — fallback assigns every untagged
 *         question to ALL systems so it shows as sys-match regardless of which
 *         system card is active.
 */

module.exports = {
  name: 'Every question has a data-systems tag after JS initialises (no untagged questions)',

  async run(page) {
    const untagged = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.q'))
        .filter(q => !q.dataset.systems || q.dataset.systems.trim() === '')
        .length
    );

    expect(untagged).toBe(0);

    // Additionally: when a system filter is active, no questions are dimmed (sys-cross)
    const card = await page.$('.sys-card');
    if (card) {
      await card.click();
      const dimmed = await page.evaluate(
        () => document.querySelectorAll('.q.sys-cross').length
      );
      expect(dimmed).toBe(0);
    }
  },
};
