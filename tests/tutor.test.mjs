import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTutorHandler, openAIAnswer, quotaStore, tutorConfig } from '../server/tutor-core.mjs';
import { digest } from '../server/editorial-store.mjs';
import lesson from '../src/content/lessons/jak-model-pracuje.json' with { type:'json' };

const token = 'fixture-tutor-test-token-never-use-live';
const reader = 'fixture-reader-test-token-never-use-live';
const validEnvironment = {
  TUTOR_MODE:'live',
  TUTOR_ORIGIN:'https://academy.example',
  TUTOR_DB:'/data/tutor.sqlite',
  TUTOR_IDENTITIES_JSON:JSON.stringify({
    [digest(token).toString('hex')]:{id:'alex',scopes:['tutor:ask']},
    [digest(reader).toString('hex')]:{id:'reader',scopes:[]},
  }),
  OPENAI_API_KEY:'test-provider-fixture',
  OPENAI_MODEL:'model-fixture',
};
const config = tutorConfig(validEnvironment);
const body = { lessonId:'jak-model-pracuje', question:'Jak funguje kontext?' };
const request = (overrides = {}, value = body, method = 'POST') => ({
  method,
  headers:{origin:config.origin, 'content-type':'application/json', authorization:'Bearer '+token, ...overrides},
  readBody: async () => JSON.stringify(value),
});

test('produkce se klíčem samotným nespustí', () => {
  assert.throws(() => tutorConfig({TUTOR_MODE:'live', OPENAI_API_KEY:'test-key'}), /vyžaduje HTTPS/);
  assert.throws(() => tutorConfig({ ...validEnvironment, TUTOR_DB:':memory:' }), /trvalý soubor/);
  assert.throws(() => tutorConfig({ ...validEnvironment,TUTOR_IDENTITIES_JSON:'{}' }), /oprávněná identita/);
});
test('tutor ověřuje origin, identitu, scope, typ, délku a ID před voláním', async () => {
  let calls = 0;
  const quota = quotaStore(':memory:', {perMinute:1,daily:2});
  try {
    const provider = async () => { calls++; return {explanation:'Kontext je pracovní vstup.',passage:'vyklad',question:null}; };
    const handle = createTutorHandler({config,quota,provider});
    assert.equal((await handle(request({},body,'OPTIONS'))).status,204);
    assert.equal((await handle(request({origin:'https://other.example'}))).status,403);
    assert.equal((await handle(request({authorization:''}))).status,401);
    assert.equal((await handle(request({authorization:'Bearer '+reader}))).status,403);
    assert.equal((await handle(request({'content-type':'text/plain'}))).status,415);
    assert.equal((await handle(request({'content-length':'10000'}))).status,413);
    assert.equal((await handle(request({}, {...body, question:'x'.repeat(601)}))).status,400);
    assert.equal((await handle(request({}, {...body, lessonId:'nezname'}))).status,404);
    assert.equal(calls,0);
    const answer = await handle(request());
    assert.equal(answer.status,200);
    assert.equal(answer.body.passage,'vyklad');
    assert.equal((await handle(request())).status,429);
    assert.equal(calls,1);
  } finally { quota.close(); }
});
test('výpadek poskytovatele vrací řízenou chybu a rezervace zůstává', async () => {
  const quota = quotaStore(':memory:',{perMinute:1,daily:1});
  try {
    const handle = createTutorHandler({config,quota, provider: async () => { throw new Error('timeout'); }});
    assert.equal((await handle(request())).status,503);
    assert.equal((await handle(request())).status,429);
  } finally { quota.close(); }
});
test('společný limit přetrvá mezi připojeními a resetuje se po začátku dne UTC', async () => {
  const path = await mkdtemp(join(tmpdir(),'academy-quota-'));
  const file = join(path,'quota.sqlite');
  const first = quotaStore(file,{perMinute:1,daily:2});
  const second = quotaStore(file,{perMinute:1,daily:2});
  try {
    const now = Date.UTC(2026,10,19,23,58);
    assert.equal(first.reserve('one',now),true);
    assert.equal(second.reserve('one',now+1),false);
    assert.equal(second.reserve('two',now+1),true);
    assert.equal(first.reserve('three',now+3),false);
    assert.equal(first.reserve('three',now+120_000),true);
  } finally { first.close(); second.close(); await rm(path,{recursive:true,force:true}); }
});
test('adaptér OpenAI používá serverové nastavení a validuje lokátor', async () => {
  const mock = async (url, init) => {
    assert.equal(url,'https://api.openai.com/v1/responses');
    assert.equal(init.headers.Authorization,'Bearer '+config.key);
    const payload = JSON.parse(init.body);
    assert.equal(payload.store,false);
    assert.equal(payload.max_output_tokens,320);
    assert.equal(payload.text.format.type,'json_schema');
    const output = { status:'completed',output:[{type:'message',content:[{type:'output_text',
      text:JSON.stringify({explanation:'Vysvětlení',passage:'priklad',question:'Co je token?'})}]}] };
    return Response.json(output);
  };
  assert.equal((await openAIAnswer(lesson,'Prosím o příklad.',config,mock)).passage,'priklad');
  const bad = async () => Response.json({status:'incomplete'});
  await assert.rejects(() => openAIAnswer(lesson,'Prosím o příklad.',config,bad), /úplnou odpověď/);
});
