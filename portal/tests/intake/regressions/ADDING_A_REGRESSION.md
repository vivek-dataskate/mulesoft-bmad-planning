# Adding a Regression Test

When a bug is found in the intake HTML, add a regression test here so it **never recurs**.

## Steps

1. Create a file: `NNN-short-bug-name.js` (next available number)
2. Export an object with `name` (string) and `run` (async function):

```js
'use strict';
/**
 * Regression: one-line description of the bug
 *
 * Found:  YYYY-MM-DD
 * Fixed:  brief description of the fix applied
 */

module.exports = {
  name: 'Human-readable test name shown in CI output',

  async run(page) {
    // page is a Puppeteer Page already loaded with the intake HTML.
    // The intake JS has already run (waitForIntakeReady was called).

    // Example: assert a button exists
    const el = await page.$('#my-element');
    expect(el).not.toBeNull();

    // Example: scroll and assert position
    await page.evaluate(() => window.scrollTo(0, 1000));
    await new Promise(r => setTimeout(r, 300));
    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBeGreaterThan(100);
  },
};
```

## Useful Puppeteer patterns

```js
// Click an element
await page.click('.sys-card');

// Read a DOM value
const text = await page.$eval('#bar-sys-label', el => el.textContent.trim());

// Count elements
const count = await page.$$eval('.q', els => els.length);

// Check a class
const active = await page.evaluate(() =>
  document.body.classList.contains('sys-filter-on')
);

// Scroll and wait
await page.evaluate(() => window.scrollTo(0, 800));
await new Promise(r => setTimeout(r, 300));

// Run arbitrary JS in the page
await page.evaluate(() => document.querySelector('.bar-tool').click());
```

## What runs these tests

- **CI**: every `portal.yml` workflow run — structural then behavioral then BackstopJS
- **Locally**: `npm run test:intake`
- **Structural only** (fast, no browser): `npm run test:intake:structural`
- **Behavioral only** (Puppeteer): `npm run test:intake:behavioral`
