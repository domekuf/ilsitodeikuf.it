// GET /api/venue-photos?slug=… (§8.2): foto della venue di un concerto, con cache edge di qualche ora.
import type { APIRoute } from 'astro';
import { GOOGLE_PLACES_API_KEY } from 'astro:env/server';
import { env } from 'cloudflare:workers';
import { venuePhotos, type VenuePhotos } from '~/lib/places';
import { getConcert } from '~/lib/server/concerts';

export const prerender = false;

const bindings = env as unknown as Partial<Env>;
const edgeCache = (): Cache | undefined =>
  typeof caches !== 'undefined' ? (caches as unknown as { default?: Cache }).default : undefined;

const json = (body: unknown, status: number, maxAge: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': maxAge ? `public, max-age=${maxAge}` : 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });

export const GET: APIRoute = async ({ url, locals }) => {
  const slug = url.searchParams.get('slug') ?? '';
  if (!/^[a-z0-9-]{1,120}$/.test(slug)) return json({ error: 'slug non valido' }, 400, 0);

  // chiave di cache con il solo slug: altri parametri non devono creare copie
  const cacheKey = new Request(new URL(`/api/venue-photos?slug=${slug}`, url.origin));
  const cache = edgeCache();
  const hit = await cache?.match(cacheKey).catch(() => undefined);
  if (hit) return hit;

  const waitUntil = (p: Promise<unknown>) => locals.cfContext.waitUntil(p);
  const { concert } = await getConcert(slug, waitUntil);
  if (!concert) return json({ error: 'concerto non trovato' }, 404, 0);

  const body: VenuePhotos = await venuePhotos(concert, { apiKey: GOOGLE_PLACES_API_KEY, kv: bindings.CACHE });

  // foto Google: 3 ore (i photoUri non vanno tenuti a lungo); override: 1 giorno;
  // nessuna foto: 1 ora, così dopo un errore o a quota finita si riprova presto
  const maxAge = { google: 3 * 3600, override: 86400, none: 3600 }[body.source];
  const response = json(body, 200, maxAge);
  if (cache) waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
  return response;
};
