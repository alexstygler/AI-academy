import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonicalUrl, createDraft, previousWeek, publicEditionSchema } from '../src/lib/editions.mjs';
import { editorialStore, digest } from '../server/editorial-store.mjs';
import { collectSources, fixtureRecords } from '../scripts/feeds.mjs';

const window = previousWeek('2026-11-16');
const link = 'https://github.com/openai/openai-node/releases/tag/v1.0';
const mondayData = { sourceId:'openai-sdk', title:'Zkušební položka', url:link, sourceDate:window.startAt };
const token = 'fixture-editor-test-token-not-for-use';
const reviewerHash = digest(token).toString('hex');
const review = { title:'Přehled', intro:'Úvod', deepDive:'Kontext', experiment:'Pokus', corrections:[],
  items:[{url:link,summary:'Popis',why:'Dopad',announced:'2026-11-09',availability:'Rozsah ověřen v příkladu'}] };

test('pražský týden odpovídá místnímu kalendáři i přes změnu času', () => {
  const spring = previousWeek('2026-03-30');
  assert.equal(spring.startAt,'2026-03-22T23:00:00.000Z');
  assert.equal(spring.endAt,'2026-03-29T22:00:00.000Z');
  const autumn = previousWeek('2026-10-26');
  assert.equal(autumn.endAt,'2026-10-25T23:00:00.000Z');
  assert.equal(autumn.startAt,'2026-10-18T22:00:00.000Z');
  assert.deepEqual(previousWeek('2026-11-17'),window);
  assert.equal(previousWeek('2026-11-15T23:00:00.000Z').id, window.id);
  assert.notEqual(previousWeek('2026-11-15T22:59:59.999Z').id, window.id);
  assert.throws(() => previousWeek('2026-02-31'), /Neplatné datum/);
});

test('hranice okna a deduplikace URL', () => {
  const records = [
    mondayData,
    { ...mondayData, url:link+'/?utm_source=fixture#part', title:'stejná zpráva' },
    { ...mondayData, url:link+'-last', sourceDate:'2026-11-15T22:59:59.999Z' },
    { ...mondayData, url:link+'-next', sourceDate:window.endAt },
    { ...mondayData, url:link+'-before', sourceDate:'2026-11-08T22:59:59.999Z' },
  ];
  assert.equal(canonicalUrl(records[1].url),link);
  const draft = createDraft(window, records);
  assert.deepEqual(draft.items.map(({url}) => url), [link+'-last',link]);
  assert.equal(draft.status,'k revizi');
  assert.equal(publicEditionSchema.safeParse(draft).success,false);
});

test('výpadek části zdrojů zachová primární data, datum aktualizace a mezeru', async () => {
  const fetchFixture = async (url) => {
    if (!url.includes('openai')) return new Response('',{status:503});
    return new Response(`<feed><entry><title>v1.0</title><updated>${window.startAt}</updated>
      <link rel="alternate" href="${link}"/></entry></feed>`);
  };
  const { records, gaps } = await collectSources(fetchFixture);
  assert.equal(gaps.length,2);
  assert.equal(records[0].url,link);
  assert.equal(records[0].announced,null);
  assert.equal(records[0].dateKind,'aktualizace zdroje');
});

test('SQLite opakuje jedno ID, odmítá přístup, fiktivní revizi i starou verzi', async () => {
  const folder = await mkdtemp(join(tmpdir(),'academy-editorial-'));
  const path = join(folder,'issues.sqlite');
  let store = editorialStore(path);
  try {
    const fixture = createDraft(window,fixtureRecords(window),{fixture:true});
    const v1 = store.upsert(fixture);
    assert.deepEqual(store.upsert(fixture),v1);
    assert.throws(() => store.approve({id:window.id,version:1,token,reviewerHash,review}), /Zkušební/);
    const v2 = store.upsert(createDraft(window,[mondayData]));
    assert.equal(v2.version,2);
    assert.deepEqual(store.upsert(fixture),v2);
    store.close();
    store = editorialStore(path);
    assert.throws(() => store.approve({id:window.id,version:2,token:'student',reviewerHash,review}), /oprávnění/);
    assert.throws(() => store.approve({id:window.id,version:1,token,reviewerHash,review}), /aktuální/);
    assert.throws(() => store.approve({id:window.id,version:2,token,reviewerHash,
      review:{...review,items:[{...review.items[0],url:'https://example.com/'}]}}), /neznámý/);
    assert.deepEqual(store.get(window.id),v2);
    const approval = store.approve({id:window.id,version:2,token,reviewerHash,review});
    assert.equal(approval.status,'schváleno');
    assert.deepEqual(store.approve({id:window.id,version:2,token,reviewerHash,review}),approval);
    assert.deepEqual(store.upsert(createDraft(window,[{...mondayData,title:'pozdní úprava'}])),approval);
  } finally { store.close(); await rm(folder,{recursive:true,force:true}); }
});
