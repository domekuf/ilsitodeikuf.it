// D1 "finto" sopra node:sqlite, per testare le query senza Miniflare.
// D1 è SQLite: stesse query, stessi vincoli (foreign key attive come su D1).
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

type Row = Record<string, unknown>;
type Meta = { changes: number; last_row_id: number };
type Result<T = Row> = { results: T[]; success: true; meta: Meta };

class Stmt {
  constructor(
    private db: DatabaseSync,
    private sql: string,
    private args: unknown[] = [],
  ) {}
  bind(...args: unknown[]) {
    return new Stmt(this.db, this.sql, args);
  }
  private returnsRows() {
    return /^\s*(select|with)\b/i.test(this.sql) || /\breturning\b/i.test(this.sql);
  }
  exec<T = Row>(): Result<T> {
    const st = this.db.prepare(this.sql);
    const params = this.args as never[];
    if (this.returnsRows()) {
      const rows = st.all(...params) as T[];
      return {
        results: rows.map((r) => ({ ...(r as object) }) as T),
        success: true,
        meta: { changes: rows.length, last_row_id: 0 },
      };
    }
    const info = st.run(...params);
    return {
      results: [],
      success: true,
      meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) },
    };
  }
  async all<T = Row>() {
    return this.exec<T>();
  }
  async run<T = Row>() {
    return this.exec<T>();
  }
  async first<T = Row>(col?: string): Promise<T | null> {
    const row = this.exec<Row>().results[0];
    if (!row) return null;
    return (col ? row[col] : row) as T;
  }
}

export function createD1(): D1Database & { raw: DatabaseSync } {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  const dir = new URL('../../../migrations/', import.meta.url);
  for (const f of readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    db.exec(readFileSync(new URL(f, dir), 'utf8'));
  }
  const api = {
    raw: db,
    prepare: (sql: string) => new Stmt(db, sql),
    async batch(stmts: Stmt[]) {
      db.exec('BEGIN');
      try {
        const out = stmts.map((s) => s.exec());
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return api as unknown as D1Database & { raw: DatabaseSync };
}
