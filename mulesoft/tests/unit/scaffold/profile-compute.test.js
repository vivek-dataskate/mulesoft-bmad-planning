'use strict';

const { computeProfile } = require('../../../mulesoft/generate');

describe('computeProfile', () => {
  // ── Regulated ─────────────────────────────────────────────────────────────
  test('security=regulated → regulated', () => {
    expect(computeProfile({ security: { level: 'regulated' } })).toBe('regulated');
  });

  test('security=government → regulated', () => {
    expect(computeProfile({ security: { level: 'government' } })).toBe('regulated');
  });

  test('regulated takes precedence over 99.99 availability', () => {
    expect(computeProfile({
      security: { level: 'regulated' },
      nfr: { availability: '99.99' },
    })).toBe('regulated');
  });

  // ── Enterprise ────────────────────────────────────────────────────────────
  test('availability=99.99 → enterprise', () => {
    expect(computeProfile({ nfr: { availability: '99.99' } })).toBe('enterprise');
  });

  test('customDashboard=true → enterprise', () => {
    expect(computeProfile({ observability: { customDashboard: true } })).toBe('enterprise');
  });

  test('compensationStrategy=compensating-transaction → enterprise', () => {
    expect(computeProfile({ errorHandling: { compensationStrategy: 'compensating-transaction' } })).toBe('enterprise');
  });

  test('enterprise: 99.99 + compensating-transaction still enterprise (not regulated)', () => {
    expect(computeProfile({
      security: { level: 'partner' },
      nfr: { availability: '99.99' },
      errorHandling: { compensationStrategy: 'compensating-transaction' },
    })).toBe('enterprise');
  });

  // ── Minimal ───────────────────────────────────────────────────────────────
  test('internal + best-effort + outbound-notification → minimal', () => {
    expect(computeProfile({
      security: { level: 'internal' },
      nfr: { availability: 'best-effort' },
      integration: { primaryPattern: 'outbound-notification' },
    })).toBe('minimal');
  });

  test('internal + best-effort + event-driven → standard (not minimal)', () => {
    expect(computeProfile({
      security: { level: 'internal' },
      nfr: { availability: 'best-effort' },
      integration: { primaryPattern: 'event-driven' },
    })).toBe('standard');
  });

  test('internal + 99.9 + outbound-notification → standard (not minimal, avail not best-effort)', () => {
    expect(computeProfile({
      security: { level: 'internal' },
      nfr: { availability: '99.9' },
      integration: { primaryPattern: 'outbound-notification' },
    })).toBe('standard');
  });

  // ── Standard ──────────────────────────────────────────────────────────────
  test('empty decisions → standard (all defaults)', () => {
    expect(computeProfile({})).toBe('standard');
  });

  test('internal + 99.9 + event-driven → standard', () => {
    expect(computeProfile({
      security: { level: 'internal' },
      nfr: { availability: '99.9' },
      integration: { primaryPattern: 'event-driven' },
    })).toBe('standard');
  });

  test('partner + 99.9 + retry → standard', () => {
    expect(computeProfile({
      security: { level: 'partner' },
      nfr: { availability: '99.9' },
      errorHandling: { compensationStrategy: 'retry' },
    })).toBe('standard');
  });
});
