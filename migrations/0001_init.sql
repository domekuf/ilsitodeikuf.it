-- Contatti, richieste e registro dei consensi (§8.5).
-- Le date sono in UTC, formato SQLite 'YYYY-MM-DD HH:MM:SS'.

CREATE TABLE contacts (
  id               INTEGER PRIMARY KEY,
  email            TEXT NOT NULL UNIQUE COLLATE NOCASE,  -- normalizzata (trim, lowercase)
  name             TEXT NOT NULL,                         -- ultimo nome usato
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  unsubscribe_salt TEXT NOT NULL                          -- entra nei token di disiscrizione
);

CREATE TABLE submissions (
  id             INTEGER PRIMARY KEY,
  contact_id     INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  type           TEXT NOT NULL CHECK (type IN ('contact','download','articolo')),
  ref            TEXT,              -- slug album o articolo
  subject        TEXT,
  message        TEXT,
  page           TEXT,              -- path di provenienza
  download_count INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Registro append-only: ogni concessione o revoca è una riga nuova (prova del consenso)
CREATE TABLE consents (
  id           INTEGER PRIMARY KEY,
  contact_id   INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  purpose      TEXT NOT NULL CHECK (purpose IN ('updates')),
  granted      INTEGER NOT NULL CHECK (granted IN (0,1)),
  text_version TEXT NOT NULL,       -- CONSENT_TEXT_VERSION
  source       TEXT NOT NULL,       -- 'form:download:pigna', 'form:contact', 'unsubscribe', …
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_submissions_contact ON submissions(contact_id);
CREATE INDEX idx_submissions_created ON submissions(created_at);
CREATE INDEX idx_consents_contact ON consents(contact_id, purpose, created_at);

-- Stato attuale del consenso agli aggiornamenti per contatto (NULL = mai dato)
CREATE VIEW contacts_updates_optin AS
SELECT c.*, (SELECT granted FROM consents k
             WHERE k.contact_id = c.id AND k.purpose = 'updates'
             ORDER BY k.created_at DESC, k.id DESC LIMIT 1) AS updates_optin
FROM contacts c;
