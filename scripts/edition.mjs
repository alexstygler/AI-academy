import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { editorialStore, hasReviewerAccess } from '../server/editorial-store.mjs';
import { createDraft, previousWeek } from '../src/lib/editions.mjs';
import { collectSources, fixtureRecords } from './feeds.mjs';

process.umask(0o077);
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    fixture: { type: 'boolean' }, 'as-of': { type: 'string' }, id: { type: 'string' },
    version: { type: 'string' }, 'review-file': { type: 'string' }, db: { type: 'string' },
  },
});

async function main() {
  const operation = positionals[0] ?? 'draft';
  const { EDITORIAL_DB, EDITORIAL_REVIEW_TOKEN, EDITORIAL_REVIEW_TOKEN_HASH } = process.env;
  if (positionals.length > 1 || !['draft','show','approve'].includes(operation)) throw new Error('Použij draft, show nebo approve.');
  if (operation === 'approve' && !hasReviewerAccess(EDITORIAL_REVIEW_TOKEN, EDITORIAL_REVIEW_TOKEN_HASH)) {
    throw new Error('Schválení vyžaduje oprávnění redaktora.');
  }
  const path = resolve(values.db || EDITORIAL_DB || '.editorial/issues.sqlite');
  await mkdir(dirname(path), { recursive: true });
  const store = editorialStore(path);
  try {
    if (operation === 'show') {
      const value = store.get(values.id || previousWeek(values['as-of']).id);
      if (!value) throw new Error('Vydání v tomto úložišti neexistuje.');
      return value;
    }
    if (operation === 'approve') {
      const version = Number(values.version);
      if (!values.id || !Number.isSafeInteger(version) || version < 1 || !values['review-file']) {
        throw new Error('Schválení potřebuje --id, --version a --review-file.');
      }
      const review = JSON.parse(await readFile(values['review-file'], 'utf8'));
      return store.approve({ id: values.id, version, token: EDITORIAL_REVIEW_TOKEN, reviewerHash: EDITORIAL_REVIEW_TOKEN_HASH, review });
    }
    const window = previousWeek(values['as-of']);
    const input = values.fixture ? { records: [], gaps: ['Ruční zkušební režim.'] } : await collectSources();
    let draft = createDraft(window, input.records, input);
    if (!draft.items.length) {
      draft = createDraft(window, fixtureRecords(window), {
        fixture: true,
        gaps: [...input.gaps, 'Za období nejsou dostupné žádné ověřitelné položky. Použita zkušební data.'],
      });
    }
    return store.upsert(draft);
  } finally { store.close(); }
}

try { console.log(JSON.stringify(await main(), null, 2)); }
catch (error) { console.error(error.message); process.exitCode = 1; }
