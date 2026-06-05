/**
 * Shared constants for the LangGraph pipeline.
 * Import here — do not duplicate inline in runners.
 */

export const BANNED_PHRASES = [
  '"leverage AI"', '"data-driven"', '"unlock insights"', '"seamless integration"',
  '"digital transformation"', '"empower your team"', '"AI-powered"',
  '"data contracts"', '"future-proof"', '"scalable solution"',
  '"single source of truth"', '"end-to-end visibility"', '"cutting-edge"', '"best-in-class"',
].join(', ');

export const BANNED_PHRASES_INLINE = `BANNED PHRASES (never write): ${BANNED_PHRASES}.`;
