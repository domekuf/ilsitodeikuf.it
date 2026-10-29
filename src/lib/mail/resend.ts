// Resend via HTTP (niente SDK: una sola chiamata POST).
import type { MailMessage, MailProvider } from './types';

export function resendProvider(apiKey: string, fetcher: typeof fetch = fetch): MailProvider {
  return {
    name: 'resend',
    async send(m: MailMessage) {
      const res = await fetcher('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: m.from,
          to: [m.to],
          subject: m.subject,
          html: m.html,
          text: m.text,
          ...(m.replyTo ? { reply_to: m.replyTo } : {}),
        }),
      });
      if (!res.ok) {
        // niente dati personali nel messaggio d'errore: solo lo stato
        throw new Error(`Resend: HTTP ${res.status}`);
      }
    },
  };
}
