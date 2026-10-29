// Vecchio /download.php?dl=Pigna.zip|ViaTrieste.zip → pagina del disco (§7.11).
import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = ({ url, redirect }) => {
  const dl = url.searchParams.get('dl') ?? '';
  return redirect(/via\s*trieste/i.test(dl) ? '/via-trieste' : '/pigna', 301);
};
