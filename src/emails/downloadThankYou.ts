// Ringraziamento a chi scarica un disco (dal vecchio mail/index.html, riscritto).
// Template fisso: l'unico dato dell'utente è il nome, escapato.
import { escapeHtml } from '~/lib/html';
import { button, layout, paragraph, type Rendered } from './layout';

export type DownloadThankYouData = {
  name: string;
  albumTitle: string;
  downloadUrl: string;
  days: number;
  unsubscribeUrl?: string | undefined;
};

export function downloadThankYou(d: DownloadThankYouData): Rendered {
  const name = escapeHtml(d.name);
  const footer = d.unsubscribeUrl
    ? `Ti scriviamo ogni tanto perché ce l'hai chiesto. <a href="${escapeHtml(d.unsubscribeUrl)}" style="color:#6E675A">Non voglio più ricevere notizie</a>.`
    : undefined;
  const html = layout({
    preheader: `Ecco ${d.albumTitle}. Il link vale ${d.days} giorni.`,
    body:
      `<h1 style="margin:0 0 16px;font:300 28px/1.2 Helvetica,Arial,sans-serif;letter-spacing:.04em;color:#141414">A presto, ${name}!</h1>` +
      paragraph('Sono quelli come te il motivo per cui facciamo tutto.') +
      paragraph(
        `Qui sotto c'è il link per scaricare <strong>${escapeHtml(d.albumTitle)}</strong>. Funziona per ${d.days} giorni.`,
      ) +
      button(d.downloadUrl, `Scarica ${d.albumTitle}`) +
      paragraph('Se il link è scaduto, puoi richiederlo quando vuoi dal sito.') +
      paragraph('I Kuf'),
    ...(footer ? { footer } : {}),
  });
  const text = [
    `A presto, ${d.name}! Sono quelli come te il motivo per cui facciamo tutto.`,
    '',
    `Ecco il link per scaricare ${d.albumTitle} (vale ${d.days} giorni):`,
    d.downloadUrl,
    '',
    'I Kuf',
    ...(d.unsubscribeUrl ? ['', `Non vuoi più ricevere notizie? ${d.unsubscribeUrl}`] : []),
  ].join('\n');
  return { subject: `Grazie dai Kuf: ecco ${d.albumTitle}`, html, text };
}
