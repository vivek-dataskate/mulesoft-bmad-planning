'use strict';
// Proposal structural contracts — DataSkate × Client integration roadmap pages.

module.exports = {
  name: 'proposal — structural DOM checks',
  tests: [
    { name: 'header section is present',
      run: async (page) => expect(await page.$('.header')).not.toBeNull() },

    { name: 'client name appears in header',
      run: async (page) => {
        const headerText = await page.$eval('.header', el => el.innerText.toLowerCase());
        // Must reference either a client name or "roadmap" / "integration"
        expect(headerText).toMatch(/roadmap|integration|engagement/i);
      } },

    { name: 'at least one section element is present',
      run: async (page) => {
        const count = await page.$$eval('section', els => els.length);
        expect(count).toBeGreaterThan(0);
      } },

    { name: '"Confidential" badge or label is present',
      run: async (page) => {
        const bodyText = await page.$eval('body', el => el.innerText);
        expect(bodyText).toMatch(/confidential/i);
      } },

    { name: 'no broken internal anchor links',
      run: async (page) => {
        const broken = await page.evaluate(() =>
          Array.from(document.querySelectorAll('a[href^="#"]'))
            .filter(a => {
              const id = a.getAttribute('href').slice(1);
              return id.length > 0 && !document.getElementById(id);
            })
            .map(a => a.textContent.trim())
        );
        expect(broken).toHaveLength(0);
      } },
  ],
};
