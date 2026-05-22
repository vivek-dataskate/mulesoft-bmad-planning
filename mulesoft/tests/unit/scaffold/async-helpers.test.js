'use strict';

const { isAsyncPattern, isAsyncTrigger } = require('../../../generate');

describe('isAsyncPattern', () => {
  test.each([
    'event-driven',
    'pubsub-fanout',
    'cdc-streaming',
    'transactional-outbox',
    'streaming-pipeline',
    'b2b-edi',
    'process-orchestration',
    'idp-document-processing',
  ])('%s is an async pattern', (pattern) => {
    expect(isAsyncPattern({ integration: { primaryPattern: pattern } })).toBe(true);
  });

  test.each([
    'request-reply',
    'scheduled-sync',
    'webhook-ingestion',
    'file-based-etl',
    'outbound-notification',
    'api-aggregation',
    'reverse-etl',
    'ai-gateway',
  ])('%s is NOT an async pattern', (pattern) => {
    expect(isAsyncPattern({ integration: { primaryPattern: pattern } })).toBe(false);
  });

  test('async secondary pattern makes result async', () => {
    expect(isAsyncPattern({
      integration: {
        primaryPattern: 'request-reply',
        secondaryPatterns: ['event-driven'],
      },
    })).toBe(true);
  });

  test('no async secondary → primary drives result', () => {
    expect(isAsyncPattern({
      integration: {
        primaryPattern: 'request-reply',
        secondaryPatterns: ['outbound-notification'],
      },
    })).toBe(false);
  });

  test('empty decisions → false (defaults to request-reply-ish)', () => {
    expect(isAsyncPattern({})).toBe(false);
  });

  test('missing secondaryPatterns → no crash', () => {
    expect(isAsyncPattern({ integration: { primaryPattern: 'event-driven' } })).toBe(true);
  });
});

describe('isAsyncTrigger', () => {
  test.each([
    'mq-subscriber',
    'kafka',
    'platform-event',
    'cdc',
  ])('%s is an async trigger', (trigger) => {
    expect(isAsyncTrigger(trigger)).toBe(true);
  });

  test.each([
    'http',
    'scheduler',
    'sftp-on-new-file',
    'db-poll',
    's3-event',
    '',
    undefined,
  ])('%s is NOT an async trigger', (trigger) => {
    expect(isAsyncTrigger(trigger)).toBe(false);
  });
});
