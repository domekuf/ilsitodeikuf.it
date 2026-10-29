// Notifica alla band: qualcuno ha chiesto un disco.
import { escapeHtml } from '~/lib/html';
import { cleanSubject } from './contactNotification';
import { fields, layout, paragraph, userText, type Rendered } from './layout';

export type DownloadNotificationData = {
  name: string;
  email: string;
  message?: string | undefined;
  albumTitle: string;
  updates: boolean;
};

export function downloadNotification(d: DownloadNotificationData): Rendered {
  const html = layout({
    preheader: `${d.name} ha scaricato ${d.albumTitle}`,
    body:
      paragraph(
        `<strong>${escapeHtml(d.name)}</strong> ha chiesto <strong>${escapeHtml(d.albumTitle)}</strong>.`,
      ) +
      fields([
        ['Nome', escapeHtml(d.name)],
        ['Email', escapeHtml(d.email)],
        ['Notizie dai Kuf', d.updates ? 'sì, ha dato il consenso' : 'no'],
      ]) +
      (d.message?.trim()
        ? `<div style="padding:16px;border-left:2px solid #141414;background:#FBFAF7;font:15px/1.6 Helvetica,Arial,sans-serif;color:#141414">${userText(d.message)}</div>`
        : ''),
  });
  const text = [
    `${d.name} ha chiesto ${d.albumTitle}.`,
    '',
    `Nome: ${d.name}`,
    `Email: ${d.email}`,
    `Notizie dai Kuf: ${d.updates ? 'sì' : 'no'}`,
    ...(d.message?.trim() ? ['', d.message] : []),
  ].join('\n');
  return { subject: cleanSubject(`[download] ${d.albumTitle}`), html, text };
}
