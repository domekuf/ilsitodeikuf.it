// File .ics di un concerto (RFC 5545), per "Aggiungi al calendario".
import type { Concert } from './calendar';
import { addDays } from './dates';

/** Testo con i caratteri speciali di iCalendar protetti. */
export function escapeIcsText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Righe piegate a 75 ottetti, come chiede la RFC (continuazione con uno spazio). */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const out: string[] = [];
  let current = '';
  let size = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (size + bytes > (out.length ? 74 : 75)) {
      out.push(current);
      current = '';
      size = 0;
    }
    current += char;
    size += bytes;
  }
  out.push(current);
  return out.join('\r\n ');
}

const utcStamp = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
const dateStamp = (day: string) => day.replace(/-/g, '');

export function concertIcs(concert: Concert, opts: { url: string; now?: Date }): string {
  const summary = `Kuf @ ${concert.title}`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Il Sito dei Kuf//Concerti//IT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${concert.id}@ilsitodeikuf.it`,
    `DTSTAMP:${utcStamp(opts.now ?? new Date())}`,
  ];
  if (concert.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${dateStamp(concert.start)}`);
    lines.push(`DTEND;VALUE=DATE:${dateStamp(addDays(concert.end ?? concert.start, 1))}`);
  } else {
    const start = new Date(concert.start);
    const end = concert.end ? new Date(concert.end) : new Date(start.getTime() + 2 * 3600_000);
    lines.push(`DTSTART:${utcStamp(start)}`, `DTEND:${utcStamp(end)}`);
  }
  lines.push(`SUMMARY:${escapeIcsText(summary)}`);
  if (concert.location) lines.push(`LOCATION:${escapeIcsText(concert.location)}`);
  lines.push(`URL:${opts.url}`);
  lines.push(`DESCRIPTION:${escapeIcsText(`I Kuf in concerto. Dettagli: ${opts.url}`)}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}
