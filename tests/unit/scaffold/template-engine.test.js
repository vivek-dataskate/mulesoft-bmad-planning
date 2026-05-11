'use strict';

const { sub, processIf, render, stripXmlDecl, extractMuleBody } = require('../../../scaffold/generate');

describe('sub — token substitution', () => {
  test('replaces a known token', () => {
    expect(sub('Hello {{NAME}}', { NAME: 'World' })).toBe('Hello World');
  });

  test('leaves unknown tokens intact', () => {
    expect(sub('Hello {{UNKNOWN}}', {})).toBe('Hello {{UNKNOWN}}');
  });

  test('replaces null value with empty string', () => {
    expect(sub('{{VAL}}', { VAL: null })).toBe('');
  });

  test('replaces undefined value with empty string', () => {
    expect(sub('{{VAL}}', { VAL: undefined })).toBe('');
  });

  test('replaces all occurrences of the same token', () => {
    expect(sub('{{A}} and {{A}}', { A: 'x' })).toBe('x and x');
  });

  test('replaces multiple different tokens', () => {
    expect(sub('{{A}}-{{B}}', { A: 'hello', B: 'world' })).toBe('hello-world');
  });

  test('handles numeric token values', () => {
    expect(sub('coverage={{FLOOR}}', { FLOOR: 80 })).toBe('coverage=80');
  });

  test('handles empty string value', () => {
    expect(sub('[{{VAL}}]', { VAL: '' })).toBe('[]');
  });

  test('handles template with no tokens', () => {
    expect(sub('no tokens here', { KEY: 'value' })).toBe('no tokens here');
  });
});

describe('processIf — conditional block rendering', () => {
  test('renders body when flag is true', () => {
    expect(processIf('{{#if FLAG}}body{{/if}}', { FLAG: true })).toBe('body');
  });

  test('removes body when flag is false', () => {
    expect(processIf('{{#if FLAG}}body{{/if}}', { FLAG: false })).toBe('');
  });

  test('removes body when flag is absent (falsy)', () => {
    expect(processIf('{{#if FLAG}}body{{/if}}', {})).toBe('');
  });

  test('handles multiline body', () => {
    const template = '{{#if DLQ}}\n  <dlq-publish/>\n  <logger/>\n{{/if}}';
    const result = processIf(template, { DLQ: true });
    expect(result).toContain('<dlq-publish/>');
    expect(result).toContain('<logger/>');
  });

  test('handles multiple independent if blocks', () => {
    const template = '{{#if A}}alpha{{/if}}{{#if B}}beta{{/if}}';
    expect(processIf(template, { A: true, B: false })).toBe('alpha');
    expect(processIf(template, { A: false, B: true })).toBe('beta');
    expect(processIf(template, { A: true, B: true })).toBe('alphabeta');
  });

  test('emits console.warn on nested {{#if}}', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    processIf('{{#if OUTER}}{{#if INNER}}deep{{/if}}{{/if}}', { OUTER: true });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Nested {{#if}}'));
    warnSpy.mockRestore();
  });
});

describe('render — full render pass', () => {
  test('processes conditionals before token substitution', () => {
    const template = '{{#if SHOW}}value={{TOKEN}}{{/if}}';
    expect(render(template, { TOKEN: '42' }, { SHOW: true })).toBe('value=42');
    expect(render(template, { TOKEN: '42' }, { SHOW: false })).toBe('');
  });

  test('handles empty tokens and flags', () => {
    expect(render('static text')).toBe('static text');
  });
});

describe('stripXmlDecl', () => {
  test('strips XML declaration from document', () => {
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<mule>';
    expect(stripXmlDecl(xml)).toBe('<mule>');
  });

  test('returns unchanged string when no XML declaration', () => {
    expect(stripXmlDecl('<mule>')).toBe('<mule>');
  });

  test('handles version + standalone attributes', () => {
    const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<root/>';
    expect(stripXmlDecl(xml)).toBe('<root/>');
  });
});

describe('extractMuleBody', () => {
  test('extracts inner content of <mule> element', () => {
    const xml = '<mule xmlns="...">\n  <config/>\n</mule>';
    expect(extractMuleBody(xml)).toBe('<config/>');
  });

  test('handles mule element with multiple attributes', () => {
    const xml = '<mule xmlns="http://..." xmlns:xsi="http://..." xsi:schemaLocation="...">\n  <http:config/>\n</mule>';
    expect(extractMuleBody(xml)).toBe('<http:config/>');
  });

  test('strips leading/trailing whitespace from extracted body', () => {
    const xml = '<mule>\n\n  <inner/>\n\n</mule>';
    expect(extractMuleBody(xml).trim()).toBe('<inner/>');
  });
});
