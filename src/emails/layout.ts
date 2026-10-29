// Layout HTML per le mail: tabelle e stili inline, compatibile con i client di posta.
// Tutto ciò che arriva dall'utente passa da escapeHtml prima di entrare qui.
import { escapeHtml } from '~/lib/html';

export const SITE_URL = 'https://ilsitodeikuf.it';
const INK = '#141414';
const PAPER = '#FBFAF7';
const WARM = '#6E675A';

export type Rendered = { subject: string; html: string; text: string };

export function paragraph(html: string): string {
  return `<p style="margin:0 0 16px;font:16px/1.6 Helvetica,Arial,sans-serif;color:${INK}">${html}</p>`;
}

export function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px"><tr><td style="background:${INK};border-radius:4px">
<a href="${escapeHtml(href)}" style="display:inline-block;padding:14px 22px;font:600 14px/1 Helvetica,Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:${PAPER};text-decoration:none">${escapeHtml(label)}</a>
</td></tr></table>`;
}

/** Tabella "campo: valore" per le notifiche alla band (valori già escapati dal chiamante). */
export function fields(rows: [string, string][]): string {
  const tr = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 16px 6px 0;font:13px/1.5 Helvetica,Arial,sans-serif;color:${WARM};vertical-align:top;white-space:nowrap">${escapeHtml(k)}</td><td style="padding:6px 0;font:15px/1.5 Helvetica,Arial,sans-serif;color:${INK}">${v}</td></tr>`,
    )
    .join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px">${tr}</table>`;
}

/** Testo libero dell'utente: escapato e con gli a capo conservati. */
export function userText(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, '<br>');
}

export function layout({
  preheader,
  body,
  footer,
}: {
  preheader: string;
  body: string;
  footer?: string;
}): string {
  return `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Il Sito dei Kuf</title></head>
<body style="margin:0;padding:0;background:${PAPER}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER}"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid rgba(20,20,20,.15);border-radius:6px">
<tr><td style="padding:28px 32px 8px"><img src="${SITE_URL}/press/loghi/kuf-logo-nero.png" width="96" alt="KUF" style="display:block;border:0;width:96px;height:auto"></td></tr>
<tr><td style="padding:16px 32px 8px">${body}</td></tr>
</table>
<p style="margin:16px 0 0;font:12px/1.5 Helvetica,Arial,sans-serif;color:${WARM}">${footer ?? `Il Sito dei Kuf · <a href="${SITE_URL}" style="color:${WARM}">ilsitodeikuf.it</a>`}</p>
</td></tr></table>
</body></html>`;
}
