'use strict';

const { checkStaleness } = require('../../../scaffold/generate');

function monthsAgo(months) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

describe('checkStaleness', () => {
  let warnSpy;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  test('connector verified this month → no warning', () => {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    checkStaleness('test-conn', { lastVerified: thisMonth, displayName: 'Test' });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test('connector verified 1 month ago → no warning (within 30-day green zone)', () => {
    checkStaleness('test-conn', { lastVerified: monthsAgo(1), displayName: 'Test' });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test('connector verified 2 months ago → NOTICE warning (yellow zone 31-60 days)', () => {
    checkStaleness('test-conn', { lastVerified: monthsAgo(2), displayName: 'Test' });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('NOTICE'));
  });

  test('connector verified 3+ months ago → WARNING (red zone >60 days)', () => {
    checkStaleness('test-conn', { lastVerified: monthsAgo(3), displayName: 'Test' });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('WARNING'));
  });

  test('missing lastVerified → no crash, no warning', () => {
    expect(() => checkStaleness('test-conn', {})).not.toThrow();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test('undefined connector entry → no crash', () => {
    expect(() => checkStaleness('test-conn', { displayName: 'Test' })).not.toThrow();
  });

  test('malformed lastVerified string → no crash', () => {
    expect(() => checkStaleness('test-conn', { lastVerified: 'bad-date' })).not.toThrow();
  });

  test('partial lastVerified (year only) → no crash', () => {
    expect(() => checkStaleness('test-conn', { lastVerified: '2025' })).not.toThrow();
  });

  test('WARNING includes connector key and exchange URL', () => {
    checkStaleness('salesforce', {
      lastVerified: monthsAgo(4),
      displayName: 'Salesforce',
      exchangeUrl: 'https://anypoint.mulesoft.com/exchange/salesforce',
    });
    const allWarns = warnSpy.mock.calls.flat().join(' ');
    expect(allWarns).toContain('salesforce');
    expect(allWarns).toContain('anypoint.mulesoft.com/exchange/salesforce');
  });
});
