// Logica dei form, separata dalle Actions per poterla testare (dipendenze iniettate).
// Ordine: honeypot → rate limit → Turnstile → D1 → mail. Mai dati personali nei log.
import { contactNotification } from '~/emails/contactNotification';
import { downloadNotification } from '~/emails/downloadNotification';
import { downloadThankYou } from '~/emails/downloadThankYou';
import { saveSubmission, type SaveResult } from '~/lib/db/contacts';
import type { MailProvider } from '~/lib/mail';
import { DOWNLOAD_DAYS, createDownloadToken, createUnsubscribeToken } from '~/lib/tokens';
import type { ContactInput, DownloadInput } from './schema';

export type FormErrorCode = 'TOO_MANY_REQUESTS' | 'FORBIDDEN' | 'INTERNAL_SERVER_ERROR';

export class FormError extends Error {
  constructor(
    public code: FormErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export type Deps = {
  db: D1Database | undefined;
  mail: MailProvider;
  mailFrom: string;
  mailTo: string;
  consentTextVersion: string;
  /** origine per i link nelle mail (https://ilsitodeikuf.it in produzione) */
  origin: string;
  ip: string | null;
  rateLimit: () => Promise<boolean>;
  verifyHuman: (token: string, ip: string | null) => Promise<boolean>;
  log?: (message: string) => void;
};

const FALLBACK = 'kuf.ravenna@gmail.com';

async function guard(input: { 'cf-turnstile-response': string }, deps: Deps) {
  if (!(await deps.rateLimit())) {
    throw new FormError('TOO_MANY_REQUESTS', 'Hai inviato troppi messaggi di fila. Riprova tra un minuto.');
  }
  if (!(await deps.verifyHuman(input['cf-turnstile-response'], deps.ip))) {
    throw new FormError(
      'FORBIDDEN',
      'La verifica anti-spam non è andata a buon fine. Ricarica la pagina e riprova.',
    );
  }
}

async function trySave(deps: Deps, fn: (db: D1Database) => Promise<SaveResult>): Promise<SaveResult | null> {
  if (!deps.db) return null;
  try {
    return await fn(deps.db);
  } catch (e) {
    // si prosegue con la mail: il messaggio non va perso (§6.2)
    deps.log?.(`[form] salvataggio D1 fallito: ${e instanceof Error ? e.name : 'errore'}`);
    return null;
  }
}

// ---- Contatti ----------------------------------------------------------------

export async function handleContact(input: ContactInput, deps: Deps): Promise<{ name: string }> {
  if (input.website) return { name: input.name }; // bot: facciamo finta di niente
  await guard(input, deps);

  const articolo = input.context?.type === 'articolo' ? input.context : undefined;
  await trySave(deps, (db) =>
    saveSubmission(db, {
      name: input.name,
      email: input.email,
      type: articolo ? 'articolo' : 'contact',
      ref: articolo?.slug ?? null,
      subject: input.subject ?? null,
      message: input.message,
      page: input.page ?? null,
      updatesConsent: input.updates,
      consentSource: articolo ? `form:articolo:${articolo.slug}` : 'form:contact',
      consentTextVersion: deps.consentTextVersion,
    }),
  );

  const mail = contactNotification({
    name: input.name,
    email: input.email,
    subject: input.subject,
    message: input.message,
    page: input.page,
    articolo,
    updates: input.updates,
  });
  try {
    await deps.mail.send({ to: deps.mailTo, from: deps.mailFrom, replyTo: input.email, ...mail });
  } catch (e) {
    deps.log?.(`[form] invio mail fallito (${deps.mail.name}): ${e instanceof Error ? e.message : 'errore'}`);
    throw new FormError(
      'INTERNAL_SERVER_ERROR',
      `Non siamo riusciti a inviare il messaggio. Scrivici direttamente a ${FALLBACK}.`,
    );
  }
  return { name: input.name };
}

// ---- Download ----------------------------------------------------------------

export type AlbumInfo = { slug: 'pigna' | 'via-trieste'; title: string; filename: string };

export async function handleDownload(
  input: DownloadInput,
  album: AlbumInfo,
  deps: Deps & { downloadSecret: string; unsubscribeSecret: string },
): Promise<{ name: string; url: string; filename: string }> {
  // anche ai bot "rispondiamo" senza link vero
  if (input.website) return { name: input.name, url: `/${album.slug}`, filename: album.filename };
  await guard(input, deps);

  const saved = await trySave(deps, (db) =>
    saveSubmission(db, {
      name: input.name,
      email: input.email,
      type: 'download',
      ref: album.slug,
      message: input.message || null,
      page: input.page ?? `/${album.slug}`,
      updatesConsent: input.updates,
      consentSource: `form:download:${album.slug}`,
      consentTextVersion: deps.consentTextVersion,
    }),
  );

  const token = await createDownloadToken(album.slug, saved?.submissionId ?? 0, deps.downloadSecret);
  const path = `/api/download/${token}`;
  const unsubscribeUrl =
    input.updates && saved
      ? `${deps.origin}/disiscriviti/${await createUnsubscribeToken(saved.contactId, saved.unsubscribeSalt, deps.unsubscribeSecret)}`
      : undefined;

  const results = await Promise.allSettled([
    deps.mail.send({
      to: deps.mailTo,
      from: deps.mailFrom,
      replyTo: input.email,
      ...downloadNotification({
        name: input.name,
        email: input.email,
        message: input.message,
        albumTitle: album.title,
        updates: input.updates,
      }),
    }),
    deps.mail.send({
      to: input.email,
      from: deps.mailFrom,
      replyTo: deps.mailTo,
      ...downloadThankYou({
        name: input.name,
        albumTitle: album.title,
        downloadUrl: `${deps.origin}${path}`,
        days: DOWNLOAD_DAYS,
        unsubscribeUrl,
      }),
    }),
  ]);
  for (const r of results) {
    if (r.status === 'rejected') {
      // il download parte comunque: la mail è un di più
      deps.log?.(
        `[form] mail di download fallita (${deps.mail.name}): ${r.reason instanceof Error ? r.reason.message : 'errore'}`,
      );
    }
  }
  return { name: input.name, url: path, filename: album.filename };
}
