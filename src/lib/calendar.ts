// Concerti da Google Calendar (§8.1): lettura, normalizzazione e cache.
//
// Il calendario è "Kuf che fanno i concerti". Dentro ci sono anche altre cose (prove, date rosse,
// eventi annullati rinominati "annullato @ …"): teniamo solo gli eventi il cui titolo comincia
// con CALENDAR_QUERY (default "Kuf @"). Della descrizione leggiamo SOLO le righe `link:` e `foto:`,
// il resto può contenere note private e non esce mai da qui.

import { addDays, dayOf, isUpcoming, sortKey } from './dates';
import { slugify, uniqueSlugs } from './slug';

export const CALENDAR_API = 'https://www.googleapis.com/calendar/v3/calendars';

/** Evento come lo restituisce events.list (solo i campi che ci servono). */
export type GoogleEvent = {
  id: string;
  status?: string;
  summary?: string;
  location?: string;
  description?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
};

export type ConcertLink = { label: string; url: string };

export type ConcertData = {
  id: string;
  slug: string;
  /** titolo senza il prefisso "Kuf @", es. "Ravenna - Almagià w/ Nemesi" */
  title: string;
  /** il locale, es. "Almagià" */
  venue: string;
  /** "Ravenna": dal titolo ("Città - Locale") o, in mancanza, dalla location */
  city?: string | undefined;
  /** chi suona con noi, dal "w/ …" del titolo */
  guests?: string | undefined;
  /** 'YYYY-MM-DD' (tutto il giorno) o ISO con offset, in ora italiana */
  start: string;
  /** tutto il giorno: ultimo giorno incluso, solo se diverso dal primo */
  end?: string | undefined;
  allDay: boolean;
  location?: string | undefined;
  links: ConcertLink[];
  photoOverride?: string[] | undefined;
};

export type Concert = ConcertData & { status: 'upcoming' | 'past' };

export const DEFAULT_LINK_LABEL = 'Evento / biglietti';

// --- titolo -------------------------------------------------------------------------------------

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Regex per il prefisso: "Kuf @" accetta anche "kuf@", "KUF  @ " e così via. */
function prefixPattern(query: string): RegExp {
  const q = squash(query);
  const body = q ? escapeRegExp(q).replace(/ /g, '\\s*') : 'kuf\\s*@';
  return new RegExp(`^\\s*${body}\\s*`, 'i');
}

/** Città dalla location: cerca "CAP Città [PR]" in una delle parti separate da virgole o a capo. */
export function cityFromLocation(location: string | undefined): string | undefined {
  if (!location) return undefined;
  for (const part of location.split(/[\n,]/)) {
    const m = /\b\d{5}\s+(.+?)(?:\s+[A-Z]{2})?$/.exec(part.trim());
    const city = m?.[1]?.trim();
    if (city && city.split(' ').length <= 4 && !/\d/.test(city)) return city;
  }
  return undefined;
}

/**
 * "Kuf @ Ravenna - Almagià w/ Nemesi" → { title: "Ravenna - Almagià w/ Nemesi", city: "Ravenna",
 * venue: "Almagià", guests: "Nemesi" }. null se il titolo non comincia con la query.
 */
export function parseSummary(
  summary: string,
  query: string,
): { title: string; venue: string; city?: string; guests?: string } | null {
  const pattern = prefixPattern(query);
  const clean = squash(summary);
  if (squash(query) && !pattern.test(clean)) return null;
  const title = squash(clean.replace(pattern, ''));
  if (!title) return null;

  let rest = title;
  let guests: string | undefined;
  const w = /\s*\bw\/\s*(.+?)(?=\s+-\s+|$)/i.exec(rest);
  if (w?.[1]) {
    guests = w[1].trim();
    rest = squash(rest.slice(0, w.index) + rest.slice(w.index + w[0].length));
  }
  const dash = /\s+-\s+/.exec(rest);
  if (dash) {
    const city = rest.slice(0, dash.index).trim();
    const venue = rest.slice(dash.index + dash[0].length).trim();
    return { title, venue: venue || city, ...(venue && city ? { city } : {}), ...(guests ? { guests } : {}) };
  }
  return { title, venue: rest, ...(guests ? { guests } : {}) };
}

// --- descrizione --------------------------------------------------------------------------------

/** Le descrizioni scritte dal sito di Google Calendar sono HTML: lo riportiamo a righe di testo. */
function descriptionLines(description: string): string[] {
  return description
    .replace(/<br\s*\/?>|<\/(p|div|li)>/gi, '\n')
    .replace(/<a\b[^>]*\bhref\s*=\s*"([^"]*)"[^>]*>.*?<\/a>/gi, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .split(/\r?\n/);
}

function safeUrl(raw: string, protocols: string[]): string | null {
  try {
    const url = new URL(raw);
    return protocols.includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

/** Solo le righe `link: [Etichetta |] https://…` e `foto: https://…`. Tutto il resto si ignora. */
export function parseDescription(description: string | undefined): {
  links: ConcertLink[];
  photos: string[];
} {
  const links: ConcertLink[] = [];
  const photos: string[] = [];
  if (!description) return { links, photos };
  for (const line of descriptionLines(description)) {
    const link = /^\s*link\s*:\s*(?:(.+?)\s*\|\s*)?(\S+)\s*$/i.exec(line);
    if (link?.[2]) {
      const url = safeUrl(link[2], ['https:', 'http:']);
      if (url) links.push({ label: squash(link[1] ?? '') || DEFAULT_LINK_LABEL, url });
      continue;
    }
    const photo = /^\s*foto\s*:\s*(\S+)\s*$/i.exec(line);
    if (photo?.[1]) {
      const url = safeUrl(photo[1], ['https:']);
      if (url) photos.push(url);
    }
  }
  return { links, photos };
}

// --- mapping ------------------------------------------------------------------------------------

/** Da eventi Google a concerti, ordinati per data crescente e con slug unici. */
export function mapEvents(events: readonly GoogleEvent[], query: string): ConcertData[] {
  const mapped: Omit<ConcertData, 'slug'>[] = [];
  for (const ev of events) {
    if (ev.status === 'cancelled' || !ev.summary || !ev.start) continue;
    const parsed = parseSummary(ev.summary, query);
    if (!parsed) continue;

    const allDay = Boolean(ev.start.date);
    const start = ev.start.date ?? ev.start.dateTime;
    if (!start) continue;
    let end: string | undefined;
    if (allDay) {
      // per Google la data di fine è esclusa: un concerto di un giorno finisce "il giorno dopo"
      const last = ev.end?.date ? addDays(ev.end.date, -1) : start;
      end = last > start ? last : undefined;
    } else {
      end = ev.end?.dateTime && ev.end.dateTime !== start ? ev.end.dateTime : undefined;
    }

    const location = ev.location ? ev.location.trim() || undefined : undefined;
    const { links, photos } = parseDescription(ev.description);
    const city = parsed.city ?? cityFromLocation(location);
    mapped.push({
      id: ev.id,
      title: parsed.title,
      venue: parsed.venue,
      ...(city ? { city } : {}),
      ...(parsed.guests ? { guests: parsed.guests } : {}),
      start,
      ...(end ? { end } : {}),
      allDay,
      ...(location ? { location } : {}),
      links,
      ...(photos.length ? { photoOverride: photos } : {}),
    });
  }
  mapped.sort((a, b) => sortKey(a.start) - sortKey(b.start) || a.id.localeCompare(b.id));
  const slugs = uniqueSlugs(mapped.map((c) => `${dayOf(c.start)}-${slugify(c.venue) || 'concerto'}`));
  return mapped.map((c, i) => ({ ...c, slug: slugs[i]! }));
}

export function withStatus(concerts: readonly ConcertData[], now: Date): Concert[] {
  return concerts.map((c) => ({ ...c, status: isUpcoming(c, now) ? 'upcoming' : 'past' }));
}

/** In programma (crescente) e passati (decrescente). */
export function splitConcerts(concerts: readonly Concert[]): { upcoming: Concert[]; past: Concert[] } {
  const upcoming = concerts.filter((c) => c.status === 'upcoming');
  const past = concerts.filter((c) => c.status === 'past').reverse();
  return { upcoming, past };
}

/** Passati raggruppati per anno, dal più recente. */
export function groupByYear(concerts: readonly Concert[]): { year: number; concerts: Concert[] }[] {
  const groups = new Map<number, Concert[]>();
  for (const c of concerts) {
    const year = Number(dayOf(c.start).slice(0, 4));
    groups.set(year, [...(groups.get(year) ?? []), c]);
  }
  return [...groups].sort(([a], [b]) => b - a).map(([year, list]) => ({ year, concerts: list }));
}

// --- Google -------------------------------------------------------------------------------------

/** events.list con paginazione. */
export async function fetchGoogleEvents(opts: {
  calendarId: string;
  query: string;
  accessToken: string;
  fetch?: typeof fetch;
}): Promise<GoogleEvent[]> {
  const doFetch = opts.fetch ?? fetch;
  const events: GoogleEvent[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 20; page++) {
    const url = new URL(`${CALENDAR_API}/${encodeURIComponent(opts.calendarId)}/events`);
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');
    url.searchParams.set('timeZone', 'Europe/Rome');
    url.searchParams.set('maxResults', '2500');
    url.searchParams.set('fields', 'items(id,status,summary,location,description,start,end),nextPageToken');
    if (squash(opts.query)) url.searchParams.set('q', squash(opts.query));
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const res = await doFetch(url, { headers: { Authorization: `Bearer ${opts.accessToken}` } });
    if (!res.ok) throw new Error(`Google Calendar: HTTP ${res.status}`);
    const data = (await res.json()) as { items?: GoogleEvent[]; nextPageToken?: string };
    events.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return events;
}

// --- cache --------------------------------------------------------------------------------------

export const CACHE_KEY = 'calendar:v1';
export const FRESH_MS = 15 * 60_000;
export const OUTDATED_MS = 2 * 3600_000;

type CacheEntry = { fetchedAt: number; concerts: ConcertData[] };

export type ConcertsResult = {
  concerts: Concert[];
  /** copia vecchia di più di 2 ore: Google non risponde da un po' */
  outdated: boolean;
  /** niente dati: né da Google né dalla cache */
  error: boolean;
};

export type LoadDeps = {
  /** scarica gli eventi grezzi (Google o fixture) */
  load: () => Promise<GoogleEvent[]>;
  query: string;
  kv?: KVNamespace | undefined;
  waitUntil?: ((p: Promise<unknown>) => void) | undefined;
  now?: () => Date;
  log?: (message: string) => void;
};

let memo: CacheEntry | null = null;
let refreshing: Promise<CacheEntry> | null = null;

/** Solo per i test. */
export function resetCalendarMemo(): void {
  memo = null;
  refreshing = null;
}

async function refresh(deps: LoadDeps): Promise<CacheEntry> {
  refreshing ??= (async () => {
    try {
      const entry: CacheEntry = {
        fetchedAt: (deps.now?.() ?? new Date()).getTime(),
        concerts: mapEvents(await deps.load(), deps.query),
      };
      memo = entry;
      // niente scadenza: l'ultima copia buona resta lì come riserva se Google non risponde
      await deps.kv?.put(CACHE_KEY, JSON.stringify(entry)).catch(() => undefined);
      return entry;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/**
 * Concerti con cache stale-while-revalidate: fresca per 15 minuti; poi si serve la copia vecchia e
 * la si aggiorna in background (waitUntil). Se Google fallisce si serve l'ultima copia buona.
 */
export async function loadConcerts(deps: LoadDeps): Promise<ConcertsResult> {
  const now = deps.now?.() ?? new Date();
  const log = deps.log ?? ((m: string) => console.warn(m));

  let entry = memo;
  if (!entry && deps.kv) {
    const raw = await deps.kv.get(CACHE_KEY).catch(() => null);
    if (raw) {
      try {
        entry = memo = JSON.parse(raw) as CacheEntry;
      } catch {
        entry = null;
      }
    }
  }

  if (entry && now.getTime() - entry.fetchedAt < FRESH_MS) {
    return { concerts: withStatus(entry.concerts, now), outdated: false, error: false };
  }

  if (entry) {
    const outdated = now.getTime() - entry.fetchedAt > OUTDATED_MS;
    const job = refresh(deps).catch((e: unknown) => {
      log(`calendario: aggiornamento fallito (${e instanceof Error ? e.message : 'errore'})`);
      return null;
    });
    if (deps.waitUntil) {
      deps.waitUntil(job);
      return { concerts: withStatus(entry.concerts, now), outdated, error: false };
    }
    const fresh = await job;
    return {
      concerts: withStatus((fresh ?? entry).concerts, now),
      outdated: !fresh && outdated,
      error: false,
    };
  }

  try {
    const fresh = await refresh(deps);
    return { concerts: withStatus(fresh.concerts, now), outdated: false, error: false };
  } catch (e) {
    log(`calendario: non raggiungibile (${e instanceof Error ? e.message : 'errore'})`);
    return { concerts: [], outdated: false, error: true };
  }
}
