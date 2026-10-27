import { describe, expect, it } from 'vitest';
import { cleanPath, isActive } from '~/lib/site';

describe('isActive', () => {
  it('la home è attiva solo sulla home', () => {
    expect(isActive('/', '/')).toBe(true);
    expect(isActive('/', '/index.html')).toBe(true);
    expect(isActive('/', '/concerti')).toBe(false);
  });

  it('le sezioni sono attive anche sui dettagli', () => {
    expect(isActive('/concerti', '/concerti')).toBe(true);
    expect(isActive('/concerti', '/concerti.html')).toBe(true);
    expect(isActive('/concerti', '/concerti/2017-11-17-almagia')).toBe(true);
    expect(isActive('/concerti', '/concertini')).toBe(false);
  });
});

describe('cleanPath', () => {
  it('toglie .html, /index e lo slash finale', () => {
    expect(cleanPath('/index.html')).toBe('/');
    expect(cleanPath('/concerti.html')).toBe('/concerti');
    expect(cleanPath('/press/')).toBe('/press');
  });
});
