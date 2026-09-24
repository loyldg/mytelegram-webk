import {describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';
import getRichValueWithCaret from '@helpers/dom/getRichValueWithCaret';

vi.mock('@components/dotRenderer', () => ({default: {attachBluffTextSpoilerTarget: () => {}}}));
vi.mock('@lib/apiManagerProxy', () => ({
  default: {addEventListener: () => {}, getState: () => Promise.resolve({})}
}));

// The parser's module graph reaches wrapRichText and, through it, browser probes jsdom lacks.
vi.hoisted(() => {
  class IntersectionObserverMock {
    public observe() {}
    public unobserve() {}
    public disconnect() {}
    public takeRecords(): IntersectionObserverEntry[] { return []; }
  }

  Object.defineProperty(globalThis, 'IntersectionObserver', {configurable: true, value: IntersectionObserverMock});
  HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,';
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {configurable: true, value: (): null => null});
  Object.defineProperty(globalThis, 'Worker', {configurable: true, writable: true, value: class Worker {}});
  Object.defineProperty(globalThis, 'CSS', {configurable: true, value: {supports: () => true}});
});

// Same route as the composer's paste handler: foreign HTML → DOMParser → body.
function parsePastedHtml(html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return getRichValueWithCaret(doc.body, true, false);
}

describe('getRichElementValue: mention anchors', () => {
  it('turns a mention with a numeric user id into a messageEntityMentionName', () => {
    const {value, entities} = parsePastedHtml('<a class="follow" data-follow="61004386">Eduard</a> hi');
    expect(value).toBe('Eduard hi');
    expect(entities).toEqual([{_: 'messageEntityMentionName', offset: 0, length: 6, user_id: 61004386}]);
  });

  it.each([
    ['no data-follow', ''],
    ['empty', ' data-follow=""'],
    ['zero', ' data-follow="0"'],
    ['not a number', ' data-follow="abc"'],
    ['negative', ' data-follow="-1"'],
    ['not an integer', ' data-follow="1.5"']
  ])('keeps the text but no entity when data-follow is %s', (_, attr) => {
    const {value, entities} = parsePastedHtml(`<a class="follow"${attr}>text</a>`);
    expect(value).toBe('text');
    expect(entities).toEqual([]);
  });
});
