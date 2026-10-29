// Collega lib/calendar.ts alla configurazione del Worker (astro:env, KV, waitUntil).
// Resta separato da calendar.ts così la logica si testa senza runtime Cloudflare.
import {
  CALENDAR_QUERY,
  CALENDAR_SOURCE,
  GOOGLE_CALENDAR_ID,
  GOOGLE_SA_EMAIL,
  GOOGLE_SA_PRIVATE_KEY,
} from 'astro:env/server';
import { env } from 'cloudflare:workers';
import {
  fetchGoogleEvents,
  loadConcerts,
  type Concert,
  type ConcertsResult,
  type GoogleEvent,
} from '~/lib/calendar';
import { getAccessToken } from '~/lib/google-auth';

const bindings = env as unknown as Partial<Env>;

async function loadFixture(): Promise<GoogleEvent[]> {
  const data = await import('../../../tests/fixtures/calendar-events.json');
  return (data.default as { items: GoogleEvent[] }).items;
}

async function loadGoogle(): Promise<GoogleEvent[]> {
  // In produzione niente ripiego sulla fixture: meglio "calendario non raggiungibile" che concerti finti.
  if (!GOOGLE_CALENDAR_ID || !GOOGLE_SA_EMAIL || !GOOGLE_SA_PRIVATE_KEY) {
    throw new Error('credenziali Google mancanti');
  }
  const accessToken = await getAccessToken(
    { email: GOOGLE_SA_EMAIL, privateKey: GOOGLE_SA_PRIVATE_KEY },
    undefined,
    { kv: bindings.CACHE },
  );
  return fetchGoogleEvents({ calendarId: GOOGLE_CALENDAR_ID, query: CALENDAR_QUERY, accessToken });
}

export function getConcerts(waitUntil?: (p: Promise<unknown>) => void): Promise<ConcertsResult> {
  const fixture = CALENDAR_SOURCE === 'fixture';
  return loadConcerts({
    load: fixture ? loadFixture : loadGoogle,
    query: CALENDAR_QUERY,
    // la fixture non passa da KV: cambiandola si vede subito
    kv: fixture ? undefined : bindings.CACHE,
    waitUntil,
  });
}

export async function getConcert(
  slug: string,
  waitUntil?: (p: Promise<unknown>) => void,
): Promise<{ concert: Concert | undefined; result: ConcertsResult }> {
  const result = await getConcerts(waitUntil);
  return { concert: result.concerts.find((c) => c.slug === slug), result };
}
