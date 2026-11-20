import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankProgress, blankRecord } from '../src/lib/progress-store.mjs';
import { mergeProgress, planProgressSync, sameProgress } from '../src/lib/progress-sync-plan.mjs';

const snapshot = (data, revision = 1, generation = 0) => ({ data, revision, generation });
const progress = (lessons) => ({ version: 1, lessons });
const record = (values) => ({ ...blankRecord(), opened: true, ...values });
const attempt = (minute, answers = { q1: 0, q2: 1 }) => ({
  at: `2026-11-20T09:${String(minute).padStart(2, '0')}:00.000Z`,
  score: 2, total: 2, answers,
});

test('souběžné pokusy se spojí bez duplikátů bez ohledu na pořadí klíčů ze serveru', () => {
  const base = blankProgress();
  const local = progress({ prompting: record({ attempts: [attempt(0), attempt(1)], completed: true, note: 'Poznámka z telefonu' }) });
  const cloud = progress({
    resers: record({ note:'Rešerše z počítače' }),
    prompting: record({ attempts: [attempt(0, { q2: 1, q1: 0 }), attempt(2)], rubric: [1] }),
  });
  const { data, conflicts } = mergeProgress(base, local, cloud);
  assert.deepEqual(conflicts, []);
  assert.ok(sameProgress(data.lessons.prompting.attempts, [attempt(0), attempt(1), attempt(2)]));
  assert.equal(data.lessons.prompting.completed, true);
  assert.equal(data.lessons.prompting.note, 'Poznámka z telefonu');
  assert.deepEqual(data.lessons.prompting.rubric, [1]);
  assert.equal(data.lessons.resers.note, 'Rešerše z počítače');
});
test('současné úpravy poznámky vyžadují volbu a zachovají ostatní změny', () => {
  const base = snapshot(progress({ prompting: record({ note:'Původní' }) }));
  const local = progress({ prompting: record({ note:'Z telefonu', completed:true }) });
  const cloud = snapshot(progress({ prompting: record({ note:'Z počítače', attempts:[attempt(0)] }) }), 2);
  assert.deepEqual(planProgressSync(base,local,cloud), {action:'conflict',reason:'notes'});
  const keepMine = planProgressSync(base,local,cloud,'local');
  assert.equal(keepMine.data.lessons.prompting.note,'Z telefonu');
  assert.equal(keepMine.data.lessons.prompting.completed,true);
  assert.deepEqual(keepMine.data.lessons.prompting.attempts,[attempt(0)]);
  assert.equal(planProgressSync(base,local,cloud,'cloud').data.lessons.prompting.note,'Z počítače');
});
test('reset se promítne na čisté kopie a zabrání automatickému návratu starých pokusů', () => {
  const base = snapshot(progress({ prompting: record({ completed:true, attempts:[attempt(0)] }) }));
  const reset = snapshot(blankProgress(), 2, 1);
  assert.deepEqual(planProgressSync(base,base.data,reset), { action:'adopt',data:reset.data });
  const offline = progress({ prompting: record({ completed:true, attempts:[attempt(0),attempt(1)] }) });
  assert.deepEqual(planProgressSync(base,offline,reset), { action:'conflict',reason:'replacement' });
  assert.deepEqual(planProgressSync(base,offline,reset,'cloud'), { action:'adopt',data:reset.data });
  assert.deepEqual(planProgressSync(base,offline,reset,'local'), { action:'save',data:offline,replace:true });
});
test('při zápisu se po nahrazení uloží jen pokusy vzniklé po výchozí kopii', () => {
  const base = progress({ prompting: record({ completed:true, attempts:[attempt(0)] }), resers: record({}) });
  const local = progress({ ...base.lessons, prompting: record({ completed:true, attempts:[attempt(0),attempt(1)] }) });
  const merged = mergeProgress(base,local,blankProgress(),'local');
  assert.deepEqual(merged.data.lessons.prompting.attempts,[attempt(1)]);
  assert.equal(merged.data.lessons.prompting.completed,false);
  assert.equal(merged.data.lessons.resers,undefined);
});
