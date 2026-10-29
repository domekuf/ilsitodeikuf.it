// /sitemap.xml (§10): pagine statiche, articoli e tutti i concerti (anche quelli passati).
// Endpoint nostro invece di @astrojs/sitemap: quello vede solo le pagine generate in build,
// mentre i concerti arrivano dal calendario a runtime (ADR-061).
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getConcerts } from '~/lib/server/concerts';

export const prerender = false;

const STATIC_PAGES = [
  '/',
  '/concerti',
  '/pigna',
  '/via-trieste',
  '/articoli',
  '/press',
  '/contattaci',
  '/privacy',
];

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const GET: APIRoute = async ({ site, locals }) => {
  const base = site ?? new URL('https://ilsitodeikuf.it');
  const articoli = await getCollection('articoli');
  const { concerts } = await getConcerts((p) => locals.cfContext.waitUntil(p));
  const paths = [
    ...STATIC_PAGES,
    ...articoli.map((a) => `/articoli/${a.id}`),
    ...concerts.map((c) => `/concerti/${c.slug}`),
  ];
  const body =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    paths.map((p) => `  <url><loc>${escapeXml(new URL(p, base).href)}</loc></url>`).join('\n') +
    '\n</urlset>\n';
  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
};
