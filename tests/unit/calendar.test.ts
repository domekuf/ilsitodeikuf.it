import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CACHE_KEY,
  DEFAULT_LINK_LABEL,
  cityFromLocation,
  fetchGoogleEvents,
  groupByYear,
  loadConcerts,
  mapEvents,
  parseDescription,
  parseSummary,
  resetCalendarMemo,
  splitConcerts,
  withStatus,
  type GoogleEvent,
} from '~/lib/calendar';
import { memoryKV } from './helpers/kv';

const fixture = JSON.parse(readFileSync('tests/fixtures/calendar-events.json', 'utf8')) as {
  items: GoogleEvent[];
};
const Q = 'Kuf @';

describe('parseSummary', () => {
  it.each([
    [
      'Kuf @ Ravenna - Almagià w/ Nemesi',
      { title: 'Ravenna - Almagià w/ Nemesi', city: 'Ravenna', venue: 'Almagià', guests: 'Nemesi' },
    ],
    ['Kuf @ Ravenna - Almagià ', { title: 'Ravenna - Almagià', city: 'Ravenna', venue: 'Almagià' }],
    ['kuf@ Forlì -  XRay', { title: 'Forlì - XRay', city: 'Forlì', venue: 'XRay' }],
    ['Kuf @ Longiano', { title: 'Longiano', venue: 'Longiano' }],
    [
      'Kuf @ CISIM w/ Pierpaolo Capovilla e i Cattivi Maestri',
      {
        title: 'CISIM w/ Pierpaolo Capovilla e i Cattivi Maestri',
        venue: 'CISIM',
        guests: 'Pierpaolo Capovilla e i Cattivi Maestri',
      },
    ],
    [
      'Kuf @ Riolo Terme w/ Zen Circus - Frogstock',
      {
        title: 'Riolo Terme w/ Zen Circus - Frogstock',
        city: 'Riolo Terme',
        venue: 'Frogstock',
        guests: 'Zen Circus',
      },
    ],
  ])('%s', (summary, expected) => {
    expect(parseSummary(summary, Q)).toEqual(expected);
  });

  it('scarta quello che non comincia con la query', () => {
    expect(parseSummary('Data Rossa Andrea', Q)).toBeNull();
    expect(parseSummary('annullato @ Vicenza - Bocciodromo', Q)).toBeNull();
    expect(parseSummary('Prove: Kuf @ sala', Q)).toBeNull();
  });

  it('con la query vuota non filtra, ma toglie comunque "Kuf @"', () => {
    expect(parseSummary('Prove in sala', '')).toEqual({ title: 'Prove in sala', venue: 'Prove in sala' });
    expect(parseSummary('Kuf @ Lugo - Lughé', '')?.venue).toBe('Lughé');
  });
});

describe('cityFromLocation', () => {
  it.each([
    ['Cisim, Viale Giuseppe Parini, 48, 48122 Lido Adriano RA, Italia', 'Lido Adriano'],
    ["Bronson / Via Cella 50, 48124 Madonna dell'Albero, Province of Ravenna, Italy", "Madonna dell'Albero"],
    ["Artificerie Almagià\nVia dell'Almagià 2, 48122 Ravenna, Italia", 'Ravenna'],
    ['Parco Lungo Sillaro, Viale Terme, 40024 Castel San Pietro Terme BO, Italia', 'Castel San Pietro Terme'],
    ['CISIM', undefined],
    [undefined, undefined],
  ])('%s → %s', (location, city) => {
    expect(cityFromLocation(location)).toBe(city);
  });
});

describe('parseDescription', () => {
  it('legge solo link: e foto:, il resto non esce', () => {
    const d = parseDescription(
      'Cachet 200€, NON PUBBLICARE\nlink: Biglietti | https://example.com/b\nlink: https://example.com/e\n' +
        'link: javascript:alert(1)\nfoto: https://example.com/1.jpg\nfoto: http://example.com/insicura.jpg',
    );
    expect(d.links).toEqual([
      { label: 'Biglietti', url: 'https://example.com/b' },
      { label: DEFAULT_LINK_LABEL, url: 'https://example.com/e' },
    ]);
    expect(d.photos).toEqual(['https://example.com/1.jpg']);
    expect(JSON.stringify(d)).not.toContain('Cachet');
  });

  it('capisce l’HTML del sito di Google Calendar', () => {
    const d = parseDescription(
      'Note<br>link: Biglietti | <a href="https://example.com/b?x=1&amp;y=2" target="_blank">https://example.com/b?x=1&amp;y=2</a><br>foto:&nbsp;https://example.com/f.jpg',
    );
    expect(d.links).toEqual([{ label: 'Biglietti', url: 'https://example.com/b?x=1&y=2' }]);
    expect(d.photos).toEqual(['https://example.com/f.jpg']);
  });
});

describe('mapEvents sulla fixture (dati veri del calendario)', () => {
  const concerts = mapEvents(fixture.items, Q);

  it('tiene solo i concerti: niente prove, annullati o cancellati', () => {
    expect(concerts.find((c) => c.title.includes('Prove'))).toBeUndefined();
    expect(concerts.find((c) => c.title.toLowerCase().includes('annullato'))).toBeUndefined();
    expect(concerts.find((c) => c.id === 'esempio-cancellato')).toBeUndefined();
    expect(concerts.length).toBeGreaterThan(90);
  });

  it('ordinati per data, slug unici e nel formato giusto', () => {
    const slugs = concerts.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/);
    expect(slugs[0]).toBe('2014-03-14-artificierie-almagia');
    expect(slugs).toContain('2026-11-01-cisim');
    expect(slugs).toContain('2022-10-28-cisim');
  });

  it('tutto il giorno: data senza orario, nessuna fine se dura un giorno', () => {
    const c = concerts.find((x) => x.slug === '2026-11-01-cisim')!;
    expect(c).toMatchObject({ allDay: true, start: '2026-11-01', city: 'Lido Adriano', venue: 'Cisim' });
    expect(c.end).toBeUndefined();
  });

  it('con orario: ISO con offset, fine compresa', () => {
    const c = concerts.find((x) => x.slug === '2030-06-14-almagia')!;
    expect(c).toMatchObject({
      allDay: false,
      start: '2030-06-14T21:30:00+02:00',
      end: '2030-06-14T23:30:00+02:00',
      guests: 'Gli Ospiti (esempio)',
      links: [
        { label: 'Biglietti', url: 'https://example.com/biglietti' },
        { label: DEFAULT_LINK_LABEL, url: 'https://example.com/evento' },
      ],
    });
    expect(JSON.stringify(c)).not.toContain('NON PUBBLICARE');
    expect(c).not.toHaveProperty('description');
  });

  it('foto: nella descrizione → photoOverride', () => {
    expect(concerts.find((x) => x.slug === '2030-10-26-freak-out-esempio')?.photoOverride).toEqual([
      'https://example.com/foto-1.jpg',
      'https://example.com/foto-2.jpg',
    ]);
  });

  it('due concerti nello stesso giorno nello stesso posto: -2', () => {
    const ev = (id: string, h: string): GoogleEvent => ({
      id,
      summary: 'Kuf @ Ravenna - Almagià',
      start: { dateTime: `2026-12-20T${h}:00+01:00` },
      end: { dateTime: `2026-12-20T${h}:45+01:00` },
    });
    const out = mapEvents([ev('b', '22'), ev('a', '18')], Q);
    expect(out.map((c) => [c.id, c.slug])).toEqual([
      ['a', '2026-12-20-almagia'],
      ['b', '2026-12-20-almagia-2'],
    ]);
  });

  it('evento di più giorni: la fine (esclusa per Google) diventa l’ultimo giorno', () => {
    const [c] = mapEvents(
      [{ id: 'f', summary: 'Kuf @ Festival', start: { date: '2027-07-10' }, end: { date: '2027-07-12' } }],
      Q,
    );
    expect(c).toMatchObject({ start: '2027-07-10', end: '2027-07-11', allDay: true });
  });
});

describe('in programma e passati', () => {
  const now = new Date('2026-10-28T10:00:00Z');
  const { upcoming, past } = splitConcerts(withStatus(mapEvents(fixture.items, Q), now));

  it('in programma in ordine crescente, il primo è il prossimo', () => {
    expect(upcoming[0]?.slug).toBe('2026-11-01-cisim');
    expect(upcoming.map((c) => c.start)).toEqual([...upcoming.map((c) => c.start)].sort());
  });

  it('passati dal più recente, raggruppati per anno', () => {
    expect(past[0]?.slug).toBe('2026-03-21-around-the-rock-artificierie-almagia');
    const years = groupByYear(past);
    expect(years.map((y) => y.year)).toEqual([
      2026, 2025, 2024, 2023, 2022, 2021, 2019, 2018, 2017, 2016, 2015, 2014,
    ]);
    expect(years.find((y) => y.year === 2014)?.concerts.at(-1)?.slug).toBe('2014-03-14-artificierie-almagia');
  });
});

describe('fetchGoogleEvents', () => {
  it('chiede i parametri giusti e segue la paginazione', async () => {
    const urls: URL[] = [];
    const fake = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = new URL(String(input));
      urls.push(url);
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer tok');
      const page = url.searchParams.get('pageToken');
      return Response.json(page ? { items: [{ id: '2' }] } : { items: [{ id: '1' }], nextPageToken: 'p2' });
    });
    const events = await fetchGoogleEvents({
      calendarId: 'abc@group.calendar.google.com',
      query: 'Kuf @',
      accessToken: 'tok',
      fetch: fake as typeof fetch,
    });
    expect(events.map((e) => e.id)).toEqual(['1', '2']);
    expect(urls[0]?.pathname).toBe('/calendar/v3/calendars/abc%40group.calendar.google.com/events');
    expect(Object.fromEntries(urls[0]!.searchParams)).toMatchObject({
      singleEvents: 'true',
      orderBy: 'startTime',
      timeZone: 'Europe/Rome',
      maxResults: '2500',
      q: 'Kuf @',
    });
    expect(urls[1]?.searchParams.get('pageToken')).toBe('p2');
  });

  it('errore HTTP → eccezione', async () => {
    const fake = async () => new Response('no', { status: 403 });
    await expect(
      fetchGoogleEvents({ calendarId: 'x', query: '', accessToken: 't', fetch: fake as typeof fetch }),
    ).rejects.toThrow('403');
  });
});

describe('loadConcerts (cache)', () => {
  beforeEach(() => resetCalendarMemo());
  const event: GoogleEvent = { id: 'x', summary: 'Kuf @ Lugo - Lughé', start: { date: '2030-01-01' } };
  let t = Date.parse('2026-10-28T10:00:00Z');
  const now = () => new Date(t);

  it('prima volta: scarica e salva in KV senza scadenza', async () => {
    const kv = memoryKV(() => t);
    const load = vi.fn(async () => [event]);
    const r = await loadConcerts({ load, query: Q, kv, now });
    expect(r).toMatchObject({ error: false, outdated: false });
    expect(r.concerts[0]).toMatchObject({ slug: '2030-01-01-lughe', status: 'upcoming' });
    expect(await kv.get(CACHE_KEY)).toContain('2030-01-01-lughe');
    expect(kv.puts.find((p) => p.key === CACHE_KEY)?.ttl).toBeUndefined();
  });

  it('entro 15 minuti non richiama Google; dopo serve la copia e aggiorna in background', async () => {
    const kv = memoryKV(() => t);
    const load = vi.fn(async () => [event]);
    await loadConcerts({ load, query: Q, kv, now });
    t += 10 * 60_000;
    await loadConcerts({ load, query: Q, kv, now });
    expect(load).toHaveBeenCalledTimes(1);

    t += 10 * 60_000;
    const jobs: Promise<unknown>[] = [];
    const r = await loadConcerts({ load, query: Q, kv, now, waitUntil: (p) => jobs.push(p) });
    expect(r.concerts).toHaveLength(1);
    expect(jobs).toHaveLength(1);
    await Promise.all(jobs);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('Google giù: si usa l’ultima copia buona da KV (anche dopo un riavvio)', async () => {
    const kv = memoryKV(() => t);
    await loadConcerts({ load: async () => [event], query: Q, kv, now });
    resetCalendarMemo(); // nuovo isolate: niente memoria, solo KV
    t += 3 * 3600_000;
    const r = await loadConcerts({
      load: async () => {
        throw new Error('503');
      },
      query: Q,
      kv,
      now,
      log: () => undefined,
    });
    expect(r).toMatchObject({ error: false, outdated: true });
    expect(r.concerts).toHaveLength(1);
  });

  it('Google giù e nessuna copia: errore gentile, lista vuota', async () => {
    const r = await loadConcerts({
      load: async () => {
        throw new Error('timeout');
      },
      query: Q,
      kv: memoryKV(),
      log: () => undefined,
    });
    expect(r).toEqual({ concerts: [], outdated: false, error: true });
  });
});
