// JSON-LD schema.org per i concerti (§7.2, §10).
import type { Concert } from './calendar';
import site from '~/content/site.json';

export function concertJsonLd(c: Concert, url: string): Record<string, unknown> {
  const placeName = c.location?.split('\n')[0]?.trim() || c.venue;
  return {
    '@context': 'https://schema.org',
    '@type': 'MusicEvent',
    name: `Kuf @ ${c.title}`,
    url,
    startDate: c.start,
    ...(c.end ? { endDate: c.end } : {}),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place',
      name: placeName,
      address: c.location
        ? c.location.replace(/\s*\n\s*/g, ', ')
        : [c.venue, c.city].filter(Boolean).join(', '),
    },
    performer: {
      '@type': 'MusicGroup',
      name: 'Kuf',
      url: 'https://ilsitodeikuf.it/',
      sameAs: site.social.map((s) => s.url),
    },
  };
}

/** JSON dentro <script>: niente "</script>" che chiude il tag prima del tempo. */
export const safeJson = (value: unknown): string => JSON.stringify(value).replace(/</g, '\\u003c');
