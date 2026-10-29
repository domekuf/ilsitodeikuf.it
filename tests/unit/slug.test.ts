import { describe, expect, it } from 'vitest';
import { slugify, uniqueSlugs } from '~/lib/slug';

describe('slugify', () => {
  it.each([
    ['Almagià', 'almagia'],
    ['Artificierie Almagià', 'artificierie-almagia'],
    ['Lughè', 'lughe'],
    ['Diki Diki Cafè', 'diki-diki-cafe'],
    ["L'Urlo", 'lurlo'],
    ['Sant’Alberto', 'santalberto'],
    ['C.S.A. Spartaco', 'c-s-a-spartaco'],
    ['Mazapégul Brewpub', 'mazapegul-brewpub'],
    ['Notte d’oro', 'notte-doro'],
    ['  Rock   & Roll!! ', 'rock-e-roll'],
    ['(re)offender', 're-offender'],
    ['ÀÉÎÕÜ', 'aeiou'],
    ['', ''],
  ])('%s → %s', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });
});

describe('uniqueSlugs', () => {
  it('le collisioni prendono -2, -3 nell’ordine dato', () => {
    expect(uniqueSlugs(['a', 'b', 'a', 'a', 'a-2'])).toEqual(['a', 'b', 'a-2', 'a-3', 'a-2-2']);
  });
});
