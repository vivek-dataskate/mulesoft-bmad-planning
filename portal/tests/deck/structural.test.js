'use strict';
/**
 * portal/tests/deck/structural.test.js
 *
 * Fast, browser-free checks on generated integration-deck HTML.
 * Decks are Firebase auth-gated — only the shell structure is verified here.
 * Authenticated content (renderDeck output) requires a live Firestore connection
 * and cannot be tested in a file:// context.
 *
 * Runs against every built deck slug.
 */

const { getDeckHtml, getBuiltSlugs } = require('./helpers');

const slugs = getBuiltSlugs();

if (slugs.length === 0) {
  test.skip('No built integration-deck HTML found — run npm run build:html first', () => {});
}

slugs.forEach(slug => {
  describe(`[${slug}] deck structural`, () => {
    let html;
    beforeAll(() => { html = getDeckHtml(slug); });

    // ── Auth gate shell ─────────────────────────────────────────────────────

    test('#login-screen is present', () => {
      expect(html).toMatch(/id="login-screen"/);
    });

    test('#deck-loading element is present', () => {
      expect(html).toMatch(/id="deck-loading"/);
    });

    test('#deck-content shell is present', () => {
      expect(html).toMatch(/id="deck-content"/);
    });

    test('#deck-loading starts hidden (display:none)', () => {
      expect(html).toMatch(/deck-loading[^>]*display:\s*none|display:\s*none[^<]*deck-loading/);
    });

    test('#deck-content starts hidden (display:none)', () => {
      expect(html).toMatch(/deck-content[^>]*display:\s*none|display:\s*none[^<]*deck-content/);
    });

    // ── Firebase integration ────────────────────────────────────────────────

    test('Firebase app-compat script is included', () => {
      expect(html).toMatch(/firebase-app-compat/);
    });

    test('Firebase auth-compat script is included', () => {
      expect(html).toMatch(/firebase-auth-compat/);
    });

    test('Firebase firestore-compat script is included', () => {
      expect(html).toMatch(/firebase-firestore-compat/);
    });

    test('signIn function is defined', () => {
      expect(html).toMatch(/window\.signIn\s*=|function signIn/);
    });

    test('Google auth provider is used', () => {
      expect(html).toMatch(/GoogleAuthProvider/);
    });
  });
});
