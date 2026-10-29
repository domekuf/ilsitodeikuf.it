import { describe, expect, it, vi } from 'vitest';
import { DAILY_LIMIT, searchQuery, venuePhotos } from '~/lib/places';
import { memoryKV } from './helpers/kv';

describe('searchQuery', () => {
  it.each([
    [
      {
        venue: 'Cisim',
        city: 'Lido Adriano',
        location: 'Cisim, Viale Giuseppe Parini, 48, 48122 Lido Adriano RA',
      },
      'Cisim, Viale Giuseppe Parini, 48, 48122 Lido Adriano RA',
    ],
    [
      { venue: 'Marinamore', city: 'Marina di Ravenna', location: 'Bagno marinamore' },
      'Bagno marinamore, Marina di Ravenna',
    ],
    [
      { venue: 'Bukowsky', city: 'Marina di Ravenna', location: 'Taverna Bukowski' },
      'Bukowsky, Taverna Bukowski, Marina di Ravenna',
    ],
    [{ venue: 'Mosquito', city: 'Marina di Ravenna' }, 'Mosquito, Marina di Ravenna'],
  ])('%o', (concert, expected) => {
    expect(searchQuery(concert)).toBe(expected);
  });
});

function fakePlaces() {
  return vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = String(input);
    const headers = init?.headers as Record<string, string>;
    expect(headers['X-Goog-Api-Key']).toBe('k');
    if (url.endsWith('/places:searchText')) {
      expect(headers['X-Goog-FieldMask']).toBe('places.id');
      return Response.json({ places: [{ id: 'PLACE1' }] });
    }
    if (url.endsWith('/places/PLACE1')) {
      expect(headers['X-Goog-FieldMask']).toBe('photos');
      return Response.json({
        photos: [1, 2, 3, 4].map((n) => ({
          name: `places/PLACE1/photos/P${n}`,
          widthPx: 4000,
          heightPx: 3000,
          authorAttributions: [{ displayName: `Autore ${n}`, uri: `https://maps.google.com/u/${n}` }],
        })),
      });
    }
    const m = /photos\/(P\d)\/media\?maxWidthPx=1200&skipHttpRedirect=true$/.exec(url);
    if (m) return Response.json({ photoUri: `https://lh3.googleusercontent.com/${m[1]}` });
    return new Response('?', { status: 404 });
  });
}

describe('venuePhotos', () => {
  const concert = { venue: 'Cisim', city: 'Lido Adriano', location: 'Cisim, 48122 Lido Adriano RA' };

  it('override dalla descrizione: niente Google', async () => {
    const fetch = fakePlaces();
    const r = await venuePhotos(
      { ...concert, photoOverride: ['https://x.it/1.jpg'] },
      { apiKey: 'k', fetch },
    );
    expect(r).toEqual({ source: 'override', photos: [{ url: 'https://x.it/1.jpg', attributions: [] }] });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('senza chiave: nessuna foto', async () => {
    expect(await venuePhotos(concert, {})).toEqual({ source: 'none', photos: [] });
  });

  it('Google: prime 3 foto con attribuzioni; place_id in KV senza scadenza', async () => {
    const kv = memoryKV();
    const fetch = fakePlaces();
    const r = await venuePhotos(concert, { apiKey: 'k', kv, fetch });
    expect(r.source).toBe('google');
    expect(r.photos).toHaveLength(3);
    expect(r.photos[0]).toEqual({
      url: 'https://lh3.googleusercontent.com/P1',
      width: 1200,
      height: 900,
      attributions: [{ name: 'Autore 1', uri: 'https://maps.google.com/u/1' }],
    });
    const placeKey = kv.puts.find((p) => p.key.startsWith('place:v1:'));
    expect(placeKey?.ttl).toBeUndefined();

    // seconda volta: niente Text Search
    fetch.mockClear();
    await venuePhotos(concert, { apiKey: 'k', kv, fetch });
    expect(fetch.mock.calls.some(([u]) => String(u).endsWith(':searchText'))).toBe(false);
  });

  it('quota giornaliera finita: nessuna foto, senza chiamare Google', async () => {
    const kv = memoryKV();
    const now = () => new Date('2026-10-28T10:00:00Z');
    await kv.put('places:count:2026-10-28', String(DAILY_LIMIT));
    const fetch = fakePlaces();
    expect((await venuePhotos(concert, { apiKey: 'k', kv, fetch, now })).source).toBe('none');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('errore di Google: nessuna foto', async () => {
    const fetch = vi.fn(async () => new Response('quota', { status: 429 }));
    expect((await venuePhotos(concert, { apiKey: 'k', fetch })).source).toBe('none');
  });
});
