// Date dei concerti, sempre in ora italiana (Europe/Rome), qualunque sia il fuso del server.
//
// Convenzione per i valori (come li restituisce Google Calendar):
// - evento "tutto il giorno": 'YYYY-MM-DD' (nessun orario, nessun fuso: è una data del calendario);
// - evento con orario: ISO 8601 con offset, es. '2017-11-17T21:30:00+01:00'.

export const TIME_ZONE = 'Europe/Rome';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export const isDateOnly = (value: string): boolean => DATE_ONLY.test(value);

type When = { start: string; end?: string | undefined; allDay: boolean };

const formatters = new Map<string, Intl.DateTimeFormat>();
function fmt(options: Intl.DateTimeFormatOptions, timeZone: string): Intl.DateTimeFormat {
  const key = JSON.stringify([options, timeZone]);
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat('it-IT', { ...options, timeZone });
    formatters.set(key, f);
  }
  return f;
}

/** Le date "tutto il giorno" si formattano in UTC a mezzogiorno: nessun fuso le può spostare. */
function dateOnlyToInstant(value: string): Date {
  return new Date(`${value}T12:00:00Z`);
}

/** Istante + fuso con cui formattarlo. */
function resolve(value: string): [Date, string] {
  return isDateOnly(value) ? [dateOnlyToInstant(value), 'UTC'] : [new Date(value), TIME_ZONE];
}

/** 'YYYY-MM-DD' del giorno in Italia per un istante. */
export function romeDate(instant: Date): string {
  // en-CA formatta come YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/** Giorno (in Italia) in cui cade un valore, che sia una data o un istante. */
export function dayOf(value: string): string {
  return isDateOnly(value) ? value : romeDate(new Date(value));
}

export function addDays(day: string, days: number): string {
  const d = dateOnlyToInstant(day);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Anno (in Italia) del concerto. */
export const yearOf = (when: When): number => Number(dayOf(when.start).slice(0, 4));

/** "ven 17 nov 2017" */
export function formatShortDate(value: string): string {
  const [d, tz] = resolve(value);
  return fmt({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }, tz).format(d);
}

/** "venerdì 17 novembre 2017" */
export function formatLongDate(value: string): string {
  const [d, tz] = resolve(value);
  return fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }, tz).format(d);
}

/** Pezzi per la data grande delle card: { weekday: 'ven', day: '17', month: 'nov', year: '2017' }. */
export function dateParts(value: string): { weekday: string; day: string; month: string; year: string } {
  const [d, tz] = resolve(value);
  const parts = fmt({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }, tz).formatToParts(
    d,
  );
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return { weekday: get('weekday'), day: get('day'), month: get('month'), year: get('year') };
}

/** "21:30" in ora italiana. */
export function formatClock(value: string): string {
  return fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, TIME_ZONE).format(new Date(value));
}

/**
 * "ore 21:30": solo l'inizio, anche se l'evento ha una fine (la fine nel calendario spesso è quella
 * di default di Google, non quella vera). null per gli eventi tutto il giorno.
 */
export function formatTime(when: When): string | null {
  if (when.allDay) return null;
  return `ore ${formatClock(when.start)}`;
}

/**
 * Riga completa del dettaglio: "venerdì 17 novembre 2017 · ore 21:30".
 * Tutto il giorno: data (o intervallo di date) + "Orario da definire" solo se il concerto deve ancora
 * arrivare: per quelli passati l'orario non interessa più ("A che ora? Questo non si chiede mai!").
 */
export function formatWhen(when: When, upcoming: boolean): string {
  const time = formatTime(when);
  let date = formatLongDate(when.start);
  if (when.allDay && when.end && when.end !== when.start) date += ` – ${formatLongDate(when.end)}`;
  if (time) return `${date} · ${time}`;
  return upcoming ? `${date} · Orario da definire` : date;
}

/** Un concerto è "in programma" finché non è finito (tutto il giorno: fino alla fine dell'ultimo giorno). */
export function isUpcoming(when: When, now: Date): boolean {
  if (when.allDay) return (when.end ?? when.start) >= romeDate(now);
  const end = when.end ? new Date(when.end) : new Date(new Date(when.start).getTime() + 3 * 3600_000);
  return end.getTime() > now.getTime();
}

/** Valore ordinabile (ms): le date "tutto il giorno" contano dalla mezzanotte italiana. */
export function sortKey(value: string): number {
  if (!isDateOnly(value)) return new Date(value).getTime();
  // mezzanotte a Roma: UTC meno l'offset di quel giorno (1 o 2 ore)
  const noon = dateOnlyToInstant(value);
  const offset =
    Number(
      fmt({ hour: 'numeric', hourCycle: 'h23' }, TIME_ZONE)
        .formatToParts(noon)
        .find((p) => p.type === 'hour')?.value ?? 13,
    ) - 12;
  return Date.UTC(noon.getUTCFullYear(), noon.getUTCMonth(), noon.getUTCDate()) - offset * 3600_000;
}
