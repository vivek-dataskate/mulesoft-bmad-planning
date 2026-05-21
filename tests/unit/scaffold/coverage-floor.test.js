'use strict';

const { getCoverageFloor } = require('../../../mulesoft/generate');

describe('getCoverageFloor', () => {
  // ── Fixed floors ──────────────────────────────────────────────────────────
  test.each([
    ['request-reply',           80],
    ['api-aggregation',         80],
    ['event-driven',            75],
    ['pubsub-fanout',           75],
    ['batch',                   75],
    ['data-migration',          75],
    ['outbound-notification',   60],
    ['idp-document-processing', 80],
    ['rpa-orchestration',       80],
    ['scheduled-sync',          80],  // not in COVERAGE_MAP → default 80
    ['webhook-ingestion',       80],  // default
    ['file-based-etl',          80],  // default
    ['cdc-streaming',           80],  // default
    ['b2b-edi',                 80],  // default
    ['streaming-pipeline',      80],  // default
    ['transactional-outbox',    80],  // default
    ['process-orchestration',   80],  // default
  ])('%s pattern → floor %d', (pattern, expected) => {
    expect(getCoverageFloor(pattern)).toBe(expected);
  });

  test('unknown pattern returns default floor of 80', () => {
    expect(getCoverageFloor('custom-xyz-pattern')).toBe(80);
  });

  // ── Hybrid: lowest floor wins ─────────────────────────────────────────────
  test('hybrid event-driven + outbound-notification → 60 (lowest)', () => {
    expect(getCoverageFloor('event-driven', ['outbound-notification'])).toBe(60);
  });

  test('hybrid request-reply + outbound-notification → 60 (lowest)', () => {
    expect(getCoverageFloor('request-reply', ['outbound-notification'])).toBe(60);
  });

  test('hybrid batch + api-aggregation → 75 (lowest of 75, 80)', () => {
    expect(getCoverageFloor('batch', ['api-aggregation'])).toBe(75);
  });

  test('hybrid all high floors → 80', () => {
    expect(getCoverageFloor('request-reply', ['webhook-ingestion', 'scheduled-sync'])).toBe(80);
  });

  test('empty secondary array uses primary floor', () => {
    expect(getCoverageFloor('batch', [])).toBe(75);
    expect(getCoverageFloor('request-reply', [])).toBe(80);
  });

  test('undefined secondary defaults to primary floor', () => {
    expect(getCoverageFloor('event-driven')).toBe(75);
  });

  test('secondary with unknown pattern still uses lowest known floor', () => {
    expect(getCoverageFloor('outbound-notification', ['unknown-pattern'])).toBe(60);
  });
});
