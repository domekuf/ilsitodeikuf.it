// Cloudflare Email Service (binding `send_email` chiamato EMAIL). In beta e con Workers Paid:
// è il provider alternativo, non quello di default (ADR-014).
import { parseAddress, type MailMessage, type MailProvider } from './types';

type EmailBinding = {
  send(message: {
    to: string;
    from: { email: string; name?: string } | string;
    subject: string;
    html: string;
    text: string;
    replyTo?: string;
    headers?: Record<string, string>;
  }): Promise<unknown>;
};

export function cloudflareProvider(binding: EmailBinding | undefined): MailProvider {
  return {
    name: 'cloudflare',
    async send(m: MailMessage) {
      if (!binding) throw new Error('Cloudflare Email: binding EMAIL non configurato');
      await binding.send({
        to: m.to,
        from: parseAddress(m.from),
        subject: m.subject,
        html: m.html,
        text: m.text,
        // l'API è in beta: mettiamo il Reply-To sia come campo sia come header
        ...(m.replyTo ? { replyTo: m.replyTo, headers: { 'Reply-To': m.replyTo } } : {}),
      });
    },
  };
}
