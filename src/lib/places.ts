// Foto delle venue da Google Places API (New) (§8.2).
//
// 1. Text Search (New) con field mask `places.id` (SKU "IDs Only", gratuito) → place_id, salvato in KV
//    senza scadenza: è l'unico dato di Places che si può conservare a tempo indeterminato.
// 2. Place Details (New) con field mask `photos` → nomi delle foto e attribuzioni.
// 3. Place Photos (New) `…/media?skipHttpRedirect=true` → photoUri da mostrare (1.000 richieste/mese gratis).
// Niente immagini salvate da noi: la risposta si tiene solo qualche ora in cache, come chiedono i termini.
// Su errore, chiave mancante o quota giornaliera finita: nessuna foto (la galleria non si mostra).

export const PLACES_API = 'https://places.googleapis.com/v1';
export const PHOTOS_PER_VENUE = 3;
/** Ricerche "nuove" al giorno (ogni venue mai vista costa 1 Details + 3 Photos). */
export const DAILY_LIMIT = 40;

export type Attribution = { name: string; uri?: string | undefined };
export type VenuePhoto = { url: string; width?: number; height?: number; attributions: Attribution[] };
export type VenuePhotos = { photos: VenuePhoto[]; source: 'google' | 'override' | 'none' };

type Deps = {
  apiKey: string;
  kv?: KVNamespace | undefined;
  fetch?: typeof fetch;
  now?: () => Date;
};

/** Hash stabile e corto (FNV-1a 32 bit) per le chiavi KV. */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Testo per la ricerca: la location dell'evento, completata con locale e città se è troppo vaga. */
export function searchQuery(c: {
  venue: string;
  city?: string | undefined;
  location?: string | undefined;
}): string {
  const location = c.location?.replace(/\s*\n\s*/g, ', ').trim();
  if (location && /\d/.test(location)) return location; // c'è un indirizzo
  const parts = [location ?? c.venue];
  if (location && !location.toLowerCase().includes(c.venue.toLowerCase())) parts.unshift(c.venue);
  if (c.city && !parts.join(' ').toLowerCase().includes(c.city.toLowerCase())) parts.push(c.city);
  return parts.join(', ');
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

async function googleJson<T>(doFetch: typeof fetch, url: string, init: RequestInit): Promise<T> {
  const res = await doFetch(url, init);
  if (!res.ok) throw new Error(`Places: HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** place_id per il testo di ricerca, da KV o con una Text Search. '' se Google non trova niente. */
export async function findPlaceId(query: string, deps: Deps): Promise<string> {
  const doFetch = deps.fetch ?? fetch;
  const key = `place:v1:${hashString(normalize(query)).toString(36)}`;
  const cached = await deps.kv?.get(key).catch(() => null);
  if (cached !== null && cached !== undefined) return cached === '-' ? '' : cached;

  const data = await googleJson<{ places?: { id: string }[] }>(doFetch, `${PLACES_API}/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': deps.apiKey,
      'X-Goog-FieldMask': 'places.id',
    },
    body: JSON.stringify({ textQuery: query, languageCode: 'it', regionCode: 'IT', pageSize: 1 }),
  });
  const id = data.places?.[0]?.id ?? '';
  // "non trovato" lo ricordiamo per un mese, il place_id per sempre
  await deps.kv?.put(key, id || '-', id ? undefined : { expirationTtl: 30 * 86400 }).catch(() => undefined);
  return id;
}

type PlacePhoto = {
  name: string;
  widthPx?: number;
  heightPx?: number;
  authorAttributions?: { displayName?: string; uri?: string }[];
};

/** Prime foto di un luogo, con URL pronti e attribuzioni. */
export async function placePhotos(placeId: string, deps: Deps): Promise<VenuePhoto[]> {
  const doFetch = deps.fetch ?? fetch;
  const headers = { 'X-Goog-Api-Key': deps.apiKey };
  const details = await googleJson<{ photos?: PlacePhoto[] }>(
    doFetch,
    `${PLACES_API}/places/${encodeURIComponent(placeId)}`,
    { headers: { ...headers, 'X-Goog-FieldMask': 'photos' } },
  );
  const photos = (details.photos ?? []).slice(0, PHOTOS_PER_VENUE);
  const results = await Promise.all(
    photos.map(async (p): Promise<VenuePhoto | null> => {
      try {
        const media = await googleJson<{ photoUri?: string }>(
          doFetch,
          `${PLACES_API}/${p.name}/media?maxWidthPx=1200&skipHttpRedirect=true`,
          { headers },
        );
        if (!media.photoUri?.startsWith('https://')) return null;
        const ratio = p.widthPx && p.heightPx ? p.heightPx / p.widthPx : undefined;
        const width = p.widthPx ? Math.min(1200, p.widthPx) : undefined;
        return {
          url: media.photoUri,
          ...(width ? { width } : {}),
          ...(width && ratio ? { height: Math.round(width * ratio) } : {}),
          attributions: (p.authorAttributions ?? [])
            .filter((a) => a.displayName)
            .map((a) => ({
              name: a.displayName!,
              ...(a.uri?.startsWith('https://') ? { uri: a.uri } : {}),
            })),
        };
      } catch {
        return null;
      }
    }),
  );
  return results.filter((p): p is VenuePhoto => p !== null);
}

/** Contatore giornaliero in KV (non atomico: va bene, è un tetto di sicurezza, non una fattura). */
async function takeQuota(deps: Deps): Promise<boolean> {
  if (!deps.kv) return true;
  const day = (deps.now?.() ?? new Date()).toISOString().slice(0, 10);
  const key = `places:count:${day}`;
  const used = Number((await deps.kv.get(key).catch(() => null)) ?? 0);
  if (used >= DAILY_LIMIT) return false;
  await deps.kv.put(key, String(used + 1), { expirationTtl: 2 * 86400 }).catch(() => undefined);
  return true;
}

/** Foto per un concerto: override dalla descrizione, poi Google, poi niente. */
export async function venuePhotos(
  concert: {
    venue: string;
    city?: string | undefined;
    location?: string | undefined;
    photoOverride?: string[] | undefined;
  },
  deps: Omit<Deps, 'apiKey'> & { apiKey?: string | undefined },
): Promise<VenuePhotos> {
  if (concert.photoOverride?.length) {
    return {
      source: 'override',
      photos: concert.photoOverride.slice(0, PHOTOS_PER_VENUE).map((url) => ({ url, attributions: [] })),
    };
  }
  if (!deps.apiKey) return { source: 'none', photos: [] };
  const full = { ...deps, apiKey: deps.apiKey };
  try {
    if (!(await takeQuota(full))) return { source: 'none', photos: [] };
    const placeId = await findPlaceId(searchQuery(concert), full);
    if (!placeId) return { source: 'none', photos: [] };
    const photos = await placePhotos(placeId, full);
    return photos.length ? { source: 'google', photos } : { source: 'none', photos: [] };
  } catch {
    return { source: 'none', photos: [] };
  }
}
