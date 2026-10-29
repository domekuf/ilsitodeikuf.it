import { describe, expect, it } from 'vitest';
import { embedUrl, getVideoMeta, parseStart, watchUrl } from '~/lib/youtube';

describe('parseStart', () => {
  it.each([
    [undefined, 0],
    [53, 53],
    ['53', 53],
    ['53s', 53],
    ['1m2s', 62],
    ['1h0m5s', 3605],
    ['boh', 0],
    [-4, 0],
  ])('%s → %i', (input, expected) => {
    expect(parseStart(input)).toBe(expected);
  });
});

describe('url', () => {
  it('embed su youtube-nocookie con start', () => {
    expect(embedUrl('dgj6n8ed7fg', 53)).toBe(
      'https://www.youtube-nocookie.com/embed/dgj6n8ed7fg?autoplay=1&rel=0&start=53',
    );
  });
  it('link di visione con t=', () => {
    expect(watchUrl('dgj6n8ed7fg', 53)).toBe('https://www.youtube.com/watch?v=dgj6n8ed7fg&t=53s');
  });
});

describe('getVideoMeta', () => {
  it('usa il titolo generato dallo script', () => {
    expect(getVideoMeta({ id: 'W5f-Ee0XWP4' })).toEqual({
      id: 'W5f-Ee0XWP4',
      title: 'Kuf - Matite',
      start: 0,
    });
  });
  it('se il titolo manca usa l’ID', () => {
    expect(getVideoMeta({ id: 'zzzzzzzzzzz', start: '10s' })).toEqual({
      id: 'zzzzzzzzzzz',
      title: 'Video zzzzzzzzzzz',
      start: 10,
    });
  });
  it('rifiuta ID non validi', () => {
    expect(() => getVideoMeta({ id: '<script>' })).toThrow();
  });
});
