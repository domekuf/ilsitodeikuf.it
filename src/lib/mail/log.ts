// Sviluppo e test: le mail non partono, si stampano in console e restano in memoria
// (le legge l'endpoint /api/dev/outbox, che esiste solo con MAIL_PROVIDER=log).
import type { MailMessage, MailProvider } from './types';

const outbox: (MailMessage & { at: string })[] = [];

export function logProvider(): MailProvider {
  return {
    name: 'log',
    async send(m: MailMessage) {
      outbox.unshift({ ...m, at: new Date().toISOString() });
      outbox.length = Math.min(outbox.length, 50);
      console.log(
        `[mail:log] → ${m.to} | ${m.subject}${m.replyTo ? ` | reply-to ${m.replyTo}` : ''}\n${m.text}`,
      );
    },
  };
}

export function readOutbox(): readonly (MailMessage & { at: string })[] {
  return outbox;
}
