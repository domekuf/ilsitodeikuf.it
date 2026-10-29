import { cloudflareProvider } from './cloudflare';
import { logProvider } from './log';
import { resendProvider } from './resend';
import type { MailProvider } from './types';

export type { MailMessage, MailProvider } from './types';

export type MailConfig = {
  provider: 'resend' | 'cloudflare' | 'log';
  resendApiKey?: string | undefined;
  emailBinding?: unknown;
};

export function getMailProvider(config: MailConfig): MailProvider {
  switch (config.provider) {
    case 'resend':
      if (!config.resendApiKey) throw new Error('RESEND_API_KEY mancante');
      return resendProvider(config.resendApiKey);
    case 'cloudflare':
      return cloudflareProvider(config.emailBinding as Parameters<typeof cloudflareProvider>[0]);
    case 'log':
      return logProvider();
  }
}
