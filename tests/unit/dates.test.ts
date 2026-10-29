import { describe, expect, it } from 'vitest';
import {
  addDays,
  dateParts,
  dayOf,
  formatLongDate,
  formatShortDate,
  formatTime,
  formatWhen,
  isUpcoming,
  romeDate,
  sortKey,
} from '~/lib/dates';

// Questi test non devono dipendere dal fuso della macchina: provali anche con TZ=America/Los_Angeles.

describe('formattazione in ora italiana', () => {
  it('data breve e lunga', () => {
    expect(formatShortDate('2017-11-17T21:30:00+01:00')).toBe('ven 17 nov 2017');
    expect(formatLongDate('2017-11-17T21:30:00+01:00')).toBe('venerdì 17 novembre 2017');
  });

  it('le date "tutto il giorno" non si spostano col fuso', () => {
    expect(formatShortDate('2026-11-01')).toBe('dom 1 nov 2026');
    expect(formatLongDate('2014-03-14')).toBe('venerdì 14 marzo 2014');
    expect(dateParts('2015-12-23')).toEqual({ weekday: 'mer', day: '23', month: 'dic', year: '2015' });
  });

  it('un istante UTC di sera è già il giorno dopo in Italia', () => {
    // 23:30 UTC del 31 dicembre = 00:30 del primo gennaio a Roma
    expect(romeDate(new Date('2025-12-31T23:30:00Z'))).toBe('2026-01-01');
    expect(dayOf('2025-12-31T23:30:00Z')).toBe('2026-01-01');
    expect(formatShortDate('2025-12-31T23:30:00Z')).toBe('gio 1 gen 2026');
  });

  it('solo l’ora di inizio, anche se c’è la fine', () => {
    const when = { start: '2017-11-17T21:30:00+01:00', end: '2017-11-17T23:30:00+01:00', allDay: false };
    expect(formatTime(when)).toBe('ore 21:30');
    expect(formatWhen(when, false)).toBe('venerdì 17 novembre 2017 · ore 21:30');
    expect(formatTime({ start: '2017-11-17T21:30:00+01:00', allDay: false })).toBe('ore 21:30');
  });

  it('a cavallo della mezzanotte: conta il giorno dell’inizio', () => {
    const when = { start: '2030-06-14T23:00:00+02:00', end: '2030-06-15T01:30:00+02:00', allDay: false };
    expect(formatWhen(when, true)).toBe('venerdì 14 giugno 2030 · ore 23:00');
  });

  it('cambio dell’ora: legale e solare', () => {
    // 29 marzo 2026: alle 01:00 UTC si passa da +01:00 a +02:00
    expect(formatTime({ start: '2026-03-29T00:30:00Z', allDay: false })).toBe('ore 01:30');
    expect(formatTime({ start: '2026-03-29T01:30:00Z', allDay: false })).toBe('ore 03:30');
    // 25 ottobre 2026: alle 01:00 UTC si torna a +01:00 (le 02:30 capitano due volte)
    expect(formatTime({ start: '2026-10-25T00:30:00Z', allDay: false })).toBe('ore 02:30');
    expect(formatTime({ start: '2026-10-25T01:30:00Z', allDay: false })).toBe('ore 02:30');
    // stesso orario "da orologio" d'estate e d'inverno
    expect(formatTime({ start: '2026-07-10T19:30:00Z', allDay: false })).toBe('ore 21:30');
    expect(formatTime({ start: '2026-12-10T20:30:00Z', allDay: false })).toBe('ore 21:30');
  });

  it('tutto il giorno: "Orario da definire" solo per i concerti futuri', () => {
    expect(formatWhen({ start: '2026-11-01', allDay: true }, true)).toBe(
      'domenica 1 novembre 2026 · Orario da definire',
    );
    expect(formatWhen({ start: '2014-03-14', allDay: true }, false)).toBe('venerdì 14 marzo 2014');
    expect(formatWhen({ start: '2018-08-22', end: '2018-08-23', allDay: true }, false)).toBe(
      'mercoledì 22 agosto 2018 – giovedì 23 agosto 2018',
    );
  });
});

describe('in programma o passato', () => {
  const allDay = { start: '2026-11-01', allDay: true };

  it('tutto il giorno: in programma fino a mezzanotte italiana', () => {
    expect(isUpcoming(allDay, new Date('2026-11-01T22:59:00Z'))).toBe(true); // 23:59 a Roma
    expect(isUpcoming(allDay, new Date('2026-11-01T23:00:00Z'))).toBe(false); // 00:00 del 2
  });

  it('con orario: finché non finisce (senza fine: 3 ore)', () => {
    const when = { start: '2030-06-14T21:30:00+02:00', end: '2030-06-14T23:30:00+02:00', allDay: false };
    expect(isUpcoming(when, new Date('2030-06-14T21:00:00Z'))).toBe(true);
    expect(isUpcoming(when, new Date('2030-06-14T21:31:00Z'))).toBe(false);
    const open = { start: '2030-06-14T21:30:00+02:00', allDay: false };
    expect(isUpcoming(open, new Date('2030-06-15T00:29:00+02:00'))).toBe(true);
    expect(isUpcoming(open, new Date('2030-06-15T00:31:00+02:00'))).toBe(false);
  });
});

describe('utilità', () => {
  it('addDays attraversa mesi, anni e cambi d’ora', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('sortKey: la data "tutto il giorno" parte dalla mezzanotte italiana', () => {
    expect(sortKey('2026-07-10')).toBe(Date.parse('2026-07-10T00:00:00+02:00'));
    expect(sortKey('2026-12-10')).toBe(Date.parse('2026-12-10T00:00:00+01:00'));
    expect(sortKey('2026-07-10') < sortKey('2026-07-10T21:00:00+02:00')).toBe(true);
  });
});
