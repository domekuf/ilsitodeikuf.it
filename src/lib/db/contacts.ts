// Contatti, richieste e consensi su D1 (§8.5). Query sempre parametrizzate.

export type SubmissionType = 'contact' | 'download' | 'articolo';

export type SaveInput = {
  name: string;
  email: string;
  type: SubmissionType;
  ref?: string | null;
  subject?: string | null;
  message?: string | null;
  page?: string | null;
  /** checkbox degli aggiornamenti spuntata: si registra il consenso. Non spuntata: nessuna riga. */
  updatesConsent: boolean;
  consentSource: string;
  consentTextVersion: string;
};

export type SaveResult = { contactId: number; submissionId: number; unsubscribeSalt: string };

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function randomSalt(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Upsert del contatto per email, poi la richiesta (e il consenso, se dato) in un unico batch.
 * D1 esegue il batch come una transazione: o tutto o niente.
 */
export async function saveSubmission(db: D1Database, input: SaveInput): Promise<SaveResult> {
  const email = normalizeEmail(input.email);
  const name = input.name.trim();

  const contactSql = `
    INSERT INTO contacts (email, name, unsubscribe_salt) VALUES (?1, ?2, ?3)
    ON CONFLICT(email) DO UPDATE SET name = excluded.name, updated_at = datetime('now')
    RETURNING id, unsubscribe_salt`;
  const lookup = `(SELECT id FROM contacts WHERE email = ?1)`;

  const statements = [
    db.prepare(contactSql).bind(email, name, randomSalt()),
    db
      .prepare(
        `INSERT INTO submissions (contact_id, type, ref, subject, message, page)
         VALUES (${lookup}, ?2, ?3, ?4, ?5, ?6) RETURNING id`,
      )
      .bind(
        email,
        input.type,
        input.ref ?? null,
        input.subject ?? null,
        input.message ?? null,
        input.page ?? null,
      ),
  ];
  if (input.updatesConsent) {
    statements.push(
      db
        .prepare(
          `INSERT INTO consents (contact_id, purpose, granted, text_version, source)
           VALUES (${lookup}, 'updates', 1, ?2, ?3)`,
        )
        .bind(email, input.consentTextVersion, input.consentSource),
    );
  }

  const [contact, submission] = await db.batch<{ id: number; unsubscribe_salt?: string }>(statements);
  const c = contact?.results[0];
  const s = submission?.results[0];
  if (!c || !s || !c.unsubscribe_salt) throw new Error('salvataggio su D1 non riuscito');
  return { contactId: c.id, submissionId: s.id, unsubscribeSalt: c.unsubscribe_salt };
}

export async function incrementDownload(db: D1Database, submissionId: number): Promise<void> {
  await db
    .prepare(`UPDATE submissions SET download_count = download_count + 1 WHERE id = ?1 AND type = 'download'`)
    .bind(submissionId)
    .run();
}

export async function getUnsubscribeSalt(db: D1Database, contactId: number): Promise<string | null> {
  const row = await db
    .prepare(`SELECT unsubscribe_salt FROM contacts WHERE id = ?1`)
    .bind(contactId)
    .first<{ unsubscribe_salt: string }>();
  return row?.unsubscribe_salt ?? null;
}

/** Revoca: una riga nuova granted=0 (il registro resta append-only). */
export async function revokeUpdates(db: D1Database, contactId: number, textVersion: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO consents (contact_id, purpose, granted, text_version, source) VALUES (?1, 'updates', 0, ?2, 'unsubscribe')`,
    )
    .bind(contactId, textVersion)
    .run();
}

export async function updatesOptIn(db: D1Database, contactId: number): Promise<boolean> {
  const row = await db
    .prepare(`SELECT updates_optin FROM contacts_updates_optin WHERE id = ?1`)
    .bind(contactId)
    .first<{ updates_optin: number | null }>();
  return row?.updates_optin === 1;
}
