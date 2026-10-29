import { describe, expect, it } from 'vitest';
import type { Concert } from '~/lib/calendar';
import { concertIcs, escapeIcsText, foldLine } from '~/lib/ics';

const base: Concert = {
  id: 'abc123',
  slug: '2030-06-14-almagia',
  title: 'Ravenna - Almagià w/ Gli Ospiti',
  venue: 'Almagià',
  city: 'Ravenna',
  start: '2030-06-14T21:30:00+02:00',
  end: '2030-06-14T23:30:00+02:00',
  allDay: false,
  location: "Artificerie Almagià\nVia dell'Almagià 2, 48122 Ravenna RA",
  links: [],
  status: 'upcoming',
};
const now = new Date('2026-10-28T10:00:00Z');
const url = 'https://ilsitodeikuf.it/concerti/2030-06-14-almagia';

describe('ics', () => {
  it('evento con orario: in UTC, CRLF, testo protetto', () => {
    const ics = concertIcs(base, { url, now });
    expect(ics).toContain('\r\nDTSTART:20300614T193000Z\r\n');
    expect(ics).toContain('\r\nDTEND:20300614T213000Z\r\n');
    expect(ics).toContain('UID:abc123@ilsitodeikuf.it');
    expect(ics).toContain('DTSTAMP:20261028T100000Z');
    expect(ics).toContain('SUMMARY:Kuf @ Ravenna - Almagià w/ Gli Ospiti');
    expect(ics).toContain("LOCATION:Artificerie Almagià\\nVia dell'Almagià 2\\, 48122 Ravenna RA");
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('tutto il giorno: date senza ora, fine esclusa', () => {
    const ics = concertIcs({ ...base, start: '2026-11-01', end: undefined, allDay: true }, { url, now });
    expect(ics).toContain('DTSTART;VALUE=DATE:20261101');
    expect(ics).toContain('DTEND;VALUE=DATE:20261102');
  });

  it('escape e righe piegate a 75 ottetti', () => {
    expect(escapeIcsText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
    const long = `DESCRIPTION:${'à'.repeat(80)}`;
    const folded = foldLine(long);
    for (const line of folded.split('\r\n'))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, '')).toBe(long);
  });
});
