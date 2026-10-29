// Notifica alla band per un messaggio dal form contatti (o da un articolo).
import { escapeHtml } from '~/lib/html';
import { fields, layout, paragraph, userText, type Rendered } from './layout';

export type ContactNotificationData = {
  name: string;
  email: string;
  subject?: string | undefined;
  message: string;
  page?: string | undefined;
  articolo?: { slug: string; nome: string } | undefined;
  updates: boolean;
};

/** Oggetto senza a capo (niente header injection) e lunghezza contenuta. */
export function cleanSubject(s: string): string {
  return s
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);
}

export function contactNotification(d: ContactNotificationData): Rendered {
  const subject = d.articolo
    ? cleanSubject(`[articolo] ${d.articolo.nome}`)
    : cleanSubject(`[sito] ${d.subject?.trim() || 'Nuovo messaggio'}`);
  const rows: [string, string][] = [
    ['Nome', escapeHtml(d.name)],
    ['Email', escapeHtml(d.email)],
  ];
  if (d.articolo) rows.push(['Articolo', escapeHtml(d.articolo.nome)]);
  if (d.page) rows.push(['Pagina', escapeHtml(d.page)]);
  rows.push(['Notizie dai Kuf', d.updates ? 'sì, ha dato il consenso' : 'no']);

  const html = layout({
    preheader: `Messaggio da ${d.name}`,
    body:
      paragraph(
        `<strong>Nuovo messaggio dal sito.</strong> Rispondi a questa mail per scrivere a ${escapeHtml(d.name)}.`,
      ) +
      fields(rows) +
      `<div style="padding:16px;border-left:2px solid #141414;background:#FBFAF7;font:15px/1.6 Helvetica,Arial,sans-serif;color:#141414">${userText(d.message)}</div>`,
  });
  const text = [
    'Nuovo messaggio dal sito. Rispondi a questa mail per scrivere al mittente.',
    '',
    `Nome: ${d.name}`,
    `Email: ${d.email}`,
    ...(d.articolo ? [`Articolo: ${d.articolo.nome}`] : []),
    ...(d.page ? [`Pagina: ${d.page}`] : []),
    `Notizie dai Kuf: ${d.updates ? 'sì' : 'no'}`,
    '',
    d.message,
  ].join('\n');
  return { subject, html, text };
}
