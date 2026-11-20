import { DatabaseSync } from 'node:sqlite';
import { createHash, timingSafeEqual } from 'node:crypto';
import { reviewedEdition } from '../src/lib/editions.mjs';

export const digest = (value) => createHash('sha256').update(value).digest();
export function hasReviewerAccess(token, hash) {
  return typeof token === 'string' && token.length >= 32 && token.length <= 160 &&
    typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash) &&
    timingSafeEqual(digest(token), Buffer.from(hash, 'hex'));
}

export function editorialStore(path) {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA busy_timeout=4000;
    CREATE TABLE IF NOT EXISTS issues (id TEXT PRIMARY KEY, version INTEGER NOT NULL, draft TEXT NOT NULL,
      generated TEXT NOT NULL, approved TEXT);
  `);
  const get = db.prepare('SELECT * FROM issues WHERE id = ?');
  const transaction = (action) => {
    db.exec('BEGIN IMMEDIATE');
    try { const result = action(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  const unpack = (row) => row && { ...JSON.parse(row.draft), version: row.version, generatedAt: row.generated };
  return {
    get(id) { const row = get.get(id); return row?.approved ? JSON.parse(row.approved) : unpack(row); },
    upsert(draft, now = new Date()) {
      return transaction(() => {
        const row = get.get(draft.id);
        if (row?.approved) return JSON.parse(row.approved);
        const payload = JSON.stringify(draft);
        if (row?.draft === payload || (row && !JSON.parse(row.draft).fixture && draft.fixture)) return unpack(row);
        const version = (row?.version ?? 0) + 1;
        const generated = now.toISOString();
        db.prepare(`INSERT INTO issues(id,version,draft,generated) VALUES (?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET version=excluded.version,draft=excluded.draft,generated=excluded.generated`)
          .run(draft.id, version, payload, generated);
        return { ...draft, version, generatedAt: generated };
      });
    },
    approve({ id, version, token, reviewerHash, review }) {
      if (!hasReviewerAccess(token, reviewerHash)) throw new Error('Schválení vyžaduje oprávnění redaktora.');
      return transaction(() => {
        const row = get.get(id);
        if (!row || row.version !== version) throw new Error('Koncept nebo tato verze už není aktuální.');
        if (row.approved) return JSON.parse(row.approved);
        const current = unpack(row);
        if (current.fixture || !current.items.length) throw new Error('Zkušební návrh ani návrh bez zdrojů nelze schválit.');
        const approval = reviewedEdition(current, review);
        db.prepare('UPDATE issues SET approved = ? WHERE id = ?').run(JSON.stringify(approval), id);
        return approval;
      });
    },
    close() { db.close(); },
  };
}
