// Astro Actions dei form (§6.2, §6.3). Tutta la logica è in src/lib/forms/handlers.ts.
import { ActionError, defineAction, type ActionAPIContext } from 'astro:actions';
import { getEntry } from 'astro:content';
import {
  CONSENT_TEXT_VERSION,
  DOWNLOAD_TOKEN_SECRET,
  MAIL_FROM,
  MAIL_PROVIDER,
  MAIL_TO,
  RESEND_API_KEY,
  TURNSTILE_SECRET_KEY,
  UNSUBSCRIBE_TOKEN_SECRET,
} from 'astro:env/server';
import { env } from 'cloudflare:workers';
import { FormError, handleContact, handleDownload, type Deps } from '~/lib/forms/handlers';
import { contactSchema, downloadSchema } from '~/lib/forms/schema';
import { getMailProvider } from '~/lib/mail';
import { checkRateLimit } from '~/lib/ratelimit';
import { verifyTurnstile } from '~/lib/turnstile';

function clientIp(context: ActionAPIContext): string | null {
  const header = context.request.headers.get('cf-connecting-ip');
  if (header) return header;
  try {
    return context.clientAddress;
  } catch {
    return null;
  }
}

function deps(context: ActionAPIContext, action: string): Deps {
  const ip = clientIp(context);
  const bindings = env as unknown as Partial<Env> & { EMAIL?: unknown };
  return {
    db: bindings.DB,
    mail: getMailProvider({
      provider: MAIL_PROVIDER,
      resendApiKey: RESEND_API_KEY,
      emailBinding: bindings.EMAIL,
    }),
    mailFrom: MAIL_FROM,
    mailTo: MAIL_TO,
    consentTextVersion: CONSENT_TEXT_VERSION,
    origin: context.url.origin,
    ip,
    rateLimit: () => checkRateLimit(bindings.FORM_LIMITER, ip, action),
    verifyHuman: (token, remoteIp) => verifyTurnstile(token, TURNSTILE_SECRET_KEY, remoteIp),
    log: (message) => console.error(message),
  };
}

function toActionError(e: unknown): never {
  if (e instanceof FormError) throw new ActionError({ code: e.code, message: e.message });
  console.error(`[form] errore inatteso: ${e instanceof Error ? e.name : 'errore'}`);
  throw new ActionError({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Qualcosa è andato storto. Riprova tra poco o scrivici a kuf.ravenna@gmail.com.',
  });
}

function secret(value: string | undefined, name: string): string {
  if (!value) throw new FormError('INTERNAL_SERVER_ERROR', `Configurazione incompleta (${name}).`);
  return value;
}

export const server = {
  contatto: defineAction({
    accept: 'form',
    input: contactSchema,
    handler: async (input, context) => {
      try {
        return await handleContact(input, deps(context, 'contatto'));
      } catch (e) {
        return toActionError(e);
      }
    },
  }),

  richiestaDownload: defineAction({
    accept: 'form',
    input: downloadSchema,
    handler: async (input, context) => {
      try {
        const entry = await getEntry('albums', input.album);
        if (!entry) throw new FormError('INTERNAL_SERVER_ERROR', 'Disco non trovato.');
        return await handleDownload(
          input,
          { slug: input.album, title: entry.data.titolo, filename: entry.data.download.filename },
          {
            ...deps(context, 'download'),
            downloadSecret: secret(DOWNLOAD_TOKEN_SECRET, 'DOWNLOAD_TOKEN_SECRET'),
            unsubscribeSecret: secret(UNSUBSCRIBE_TOKEN_SECRET, 'UNSUBSCRIBE_TOKEN_SECRET'),
          },
        );
      } catch (e) {
        return toActionError(e);
      }
    },
  }),
};
