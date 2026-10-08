/*
 * Every url the app is about to render or open passes through here first. It answers one question
 * — does this text already spell a protocol? — and the answer used to be "does `new URL` parse it?",
 * which conflated "no protocol" with "unparseable" and turned `https://t.me:99999/x` into the
 * nonsense `https://https://t.me:99999/x`.
 */

import {describe, expect, test} from 'vitest';
import matchUrlProtocol, {normalizeUrlProtocol} from '@lib/richTextProcessor/matchUrlProtocol';

describe('normalizeUrlProtocol', () => {
  test.each([
    'https://t.me/durov',
    'http://example.com/',
    'tg://resolve?domain=durov',
    'tg:resolve?domain=durov',
    'mailto:durov@example.com',
    'data:text/plain,hi',
    'HTTPS://T.ME/durov'
  ])('leaves %s alone', (url) => {
    expect(normalizeUrlProtocol(url)).toBe(url);
  });

  test.each([
    'https://t.me:99999/durov', // a port out of range
    'https://[not-an-address]/x',
    'http://a b/'
  ])('leaves %s alone even though the parser rejects it', (url) => {
    expect(normalizeUrlProtocol(url)).toBe(url);
    expect(matchUrlProtocol(url)).toBeNull(); // i.e. the old parse-based test would have prefixed it
  });

  test.each([
    ['t.me/durov', 'https://t.me/durov'],
    ['example.com', 'https://example.com'],
    ['/k/#durov', 'https:///k/#durov'],
    ['//example.com/x', 'https:////example.com/x'],
    ['1password://open', 'https://1password://open'] // a protocol may not start with a digit
  ])('gives %s the https it was written without', (url, expected) => {
    expect(normalizeUrlProtocol(url)).toBe(expected);
  });

  test.each([
    'javascript:alert(document.domain)',
    'JavaScript:alert(1)',
    ' javascript:alert(1)', // the parser skips leading C0 and space before reading the protocol
    'javascript:alert(1)',
    'java\nscript:alert(1)', // …and drops tabs and newlines wherever they sit
    'java\tscript:alert(1)',
    'javascript\r\n:alert(1)'
  ])('defuses %j into an https url', (url) => {
    const normalized = normalizeUrlProtocol(url);
    expect(normalized).toBe('https://' + url);
    // the point of the prefix: whatever this string is now, it is not a script the browser runs
    expect(normalized.replace(/[\t\n\r]/g, '').trimStart().startsWith('javascript:')).toBe(false);
  });
});
