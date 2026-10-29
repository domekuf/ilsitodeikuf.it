// YouTube: facade leggera (§6.6). Titoli e miniature li prepara scripts/build-video-thumbs.mjs
// (src/content/video-meta.json e src/assets/video/<id>.jpg): la build non usa la rete.
import videoMeta from '~/content/video-meta.json';

export type VideoRef = { id: string; start?: number | string | undefined };
export type VideoMeta = { id: string; title: string; start: number };

const ID_RE = /^[\w-]{11}$/;

/** "53", "53s", "1m2s", 53 → secondi. Valori non validi → 0. */
export function parseStart(value: number | string | undefined): number {
  if (value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(value.trim());
  if (!m || (!m[1] && !m[2] && !m[3])) return 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

export function embedUrl(id: string, start = 0): string {
  const params = new URLSearchParams({ autoplay: '1', rel: '0' });
  if (start > 0) params.set('start', String(start));
  return `https://www.youtube-nocookie.com/embed/${id}?${params}`;
}

export function watchUrl(id: string, start = 0): string {
  return `https://www.youtube.com/watch?v=${id}${start > 0 ? `&t=${start}s` : ''}`;
}

const META = videoMeta as Record<string, { title?: string } | undefined>;

/** Titolo dal file generato; se manca (video aggiunto senza rilanciare lo script) si usa l'ID. */
export function getVideoMeta(ref: VideoRef): VideoMeta {
  if (!ID_RE.test(ref.id)) throw new Error(`ID YouTube non valido: ${ref.id}`);
  const title = META[ref.id]?.title?.trim();
  return { id: ref.id, title: title || `Video ${ref.id}`, start: parseStart(ref.start) };
}
