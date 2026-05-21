'use strict';
/**
 * Regression: "Next unanswered" jumped to the top of the page instead of
 * advancing from the user's current scroll position.
 *
 * Found:  2026-05-21
 * Fixed:  jumpToFirstUnanswered() now compares each blank field's absolute
 *         position against (scrollY + stickyHeight) and only wraps to the
 *         top when no blanks remain below the current position.
 */

module.exports = {
  name: '"Next unanswered" advances forward from current position, not always to top',

  async run(page) {
    // Expand all so fields are reachable
    await page.evaluate(() => {
      document.querySelectorAll('details.section-block, details.uc')
        .forEach(d => d.setAttribute('open', ''));
    });

    // Scroll to mid-page
    await page.evaluate(() => window.scrollTo(0, 800));
    await new Promise(r => setTimeout(r, 200));
    const scrollBefore = await page.evaluate(() => window.scrollY);

    // Click "Next unanswered"
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('.bar-tool'));
      const btn = buttons.find(b => b.textContent.includes('Next unanswered'));
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 600));

    const scrollAfter = await page.evaluate(() => window.scrollY);

    // Must NOT jump back near the top (regression was scrollY becoming < 100)
    // It should either stay roughly in place or advance forward.
    // Allow a wide margin because scrollIntoView might scroll up slightly.
    // The hard constraint: it must not reset to < 200 when we were at 800.
    const hasUnansweredBelow = await page.evaluate(() => {
      const stickyHeight = 180;
      const scrolledPast = window.scrollY + stickyHeight;
      const fields = Array.from(
        document.querySelectorAll('textarea.answer, input.tbl-ans')
      ).filter(f => (f.value || '').trim().length === 0);
      return fields.some(
        f => f.getBoundingClientRect().top + window.scrollY > scrolledPast
      );
    });

    if (hasUnansweredBelow) {
      // If there are blanks below, the button must not have scrolled back to top
      expect(scrollAfter).toBeGreaterThan(200);
    }
    // If no blanks below (wrap-around case), any scroll position is valid
  },
};
