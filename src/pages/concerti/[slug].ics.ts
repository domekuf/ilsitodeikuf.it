// /concerti/[slug].ics: il concerto da aggiungere al calendario.
import type { APIRoute } from 'astro';
import { concertIcs } from '~/lib/ics';
import { getConcert } from '~/lib/server/concerts';

export const prerender = false;

export const GET: APIRoute = async ({ params, site, locals }) => {
  const slug = params.slug ?? '';
  const { concert } = await getConcert(slug, (p) => locals.cfContext.waitUntil(p));
  if (!concert) return new Response('Concerto non trovato', { status: 404 });
  const url = new URL(`/concerti/${concert.slug}`, site).href;
  return new Response(concertIcs(concert, { url }), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="kuf-${concert.slug}.ics"`,
      'Cache-Control': 'public, max-age=300',
    },
  });
};
