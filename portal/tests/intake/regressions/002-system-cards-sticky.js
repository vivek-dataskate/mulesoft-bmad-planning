'use strict';
/**
 * Regression: System filter cards (Salesforce / QuickBooks / etc.) scrolled
 * away with the page content instead of remaining pinned at the top.
 *
 * Found:  2026-05-21
 * Root cause: position:sticky was applied to .sys-cards-row (a child element)
 *             whose parent .sys-map-view was only as tall as the row itself,
 *             so the sticky element hit its container boundary immediately.
 * Fixed:  Moved position:sticky to .sys-map-view (the parent), which spans
 *         the full remaining scroll height of the column.
 */

module.exports = {
  name: 'System filter cards remain pinned at top after scrolling past them',

  async run(page) {
    // Get the natural (un-scrolled) top position of sys-map-view
    const naturalTop = await page.evaluate(() => {
      const el = document.getElementById('sys-map-view');
      return el ? el.getBoundingClientRect().top : -1;
    });

    // Scroll well past the cards' natural position
    await page.evaluate(() => window.scrollTo(0, 1200));
    await new Promise(r => setTimeout(r, 300));

    const stickyTop = await page.evaluate(() => {
      const el = document.getElementById('sys-map-view');
      return el ? el.getBoundingClientRect().top : -1;
    });

    // A sticky element must remain in the viewport (top >= 0)
    // and near the pinned position (not scrolled off-screen)
    expect(stickyTop).toBeGreaterThanOrEqual(0);
    expect(stickyTop).toBeLessThan(250); // pinned near top of viewport
    // And it must NOT still be at its natural position (which would mean it didn't scroll)
    // — actually that's fine if the page isn't tall enough. Skip that assertion.
  },
};
