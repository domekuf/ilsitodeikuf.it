// Retention (§8.5, §7.10): richieste e messaggi più vecchi di N mesi si cancellano;
// i contatti senza richieste recenti e senza consenso attivo agli aggiornamenti anche.

export type RetentionResult = { submissions: number; contacts: number };

export async function runRetention(db: D1Database, months: number): Promise<RetentionResult> {
  if (!Number.isInteger(months) || months < 1) throw new Error(`RETENTION_MONTHS non valido: ${months}`);
  const cutoff = `-${months} months`;

  const [subs, contacts] = await db.batch([
    db.prepare(`DELETE FROM submissions WHERE created_at < datetime('now', ?1)`).bind(cutoff),
    db
      .prepare(
        `DELETE FROM contacts
         WHERE id NOT IN (SELECT contact_id FROM submissions)
           AND updated_at < datetime('now', ?1)
           AND id NOT IN (SELECT id FROM contacts_updates_optin WHERE updates_optin = 1)`,
      )
      .bind(cutoff),
  ]);
  return { submissions: subs?.meta.changes ?? 0, contacts: contacts?.meta.changes ?? 0 };
}
