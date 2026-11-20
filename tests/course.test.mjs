import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { grade } from '../src/lib/quiz.mjs';
import { parseProgress, blankRecord } from '../src/lib/progress-store.mjs';
import { postAnswer, findSources, documents } from '../src/lib/post.mjs';
import evaluations from '../src/content/project/evaluations.json' with { type: 'json' };
import atlas from '../src/content/atlas.json' with { type: 'json' };
import workshop from '../src/content/project/workshops.json' with { type: 'json' };

const directory = new URL('../src/content/lessons/', import.meta.url);
const lessons = readdirSync(directory).filter((file) => file.endsWith('.json'))
  .map((file) => JSON.parse(readFileSync(new URL(file,directory), 'utf8'))).sort((a,b) => a.week - b.week);

test('osnova má právě jednu lekci na týden a všechny předpoklady vedou zpět', () => {
  assert.deepEqual(lessons.map(({ week }) => week), Array.from({length:18}, (_, index) => index + 1));
  assert.equal(new Set(lessons.map(({ id }) => id)).size, 18);
  for (const lesson of lessons) {
    for (const id of lesson.prerequisites) assert.ok(lessons.find((candidate) => candidate.id === id && candidate.week < lesson.week));
    assert.equal(new Set(lesson.questions.map(({id}) => id)).size, lesson.questions.length);
    const allCorrect = Object.fromEntries(lesson.questions.map(({id,answer}) => [id,answer]));
    assert.equal(grade(lesson.questions, allCorrect).score, lesson.questions.length);
  }
  assert.equal(workshop.labs.length, 6);
  assert.equal(workshop.transfer.length, 6);
  assert.equal(new Set(atlas.tools.map(({id}) => id)).size, atlas.tools.length);
});

test('kvíz vysvětlí špatnou volbu a odmítne neúplný pokus', () => {
  const questions = lessons[0].questions;
  const result = grade(questions, { q1: 0, q2: 1 });
  assert.equal(result.score, 0);
  assert.equal(result.total, 2);
  assert.equal(result.results[0].feedback, questions[0].options[0].feedback);
  assert.throws(() => grade(questions, { q1: 0 }), /každé otázky/);
});

test('export verze 1, ověření formátu a odmítnutí neznámých ID', () => {
  const entry = { ...blankRecord(), opened: true, note: 'přenosná poznámka' };
  const data = { version:1, lessons:{ prompting: entry } };
  assert.deepEqual(parseProgress(JSON.stringify(data), ['prompting']), data);
  assert.throws(() => parseProgress('{', ['prompting']), SyntaxError);
  assert.throws(() => parseProgress('{"version":2,"lessons":{}}', ['prompting']), /formátu/);
  assert.throws(() => parseProgress(JSON.stringify(data), ['mcp']), /formátu/);
});

test('vyhledávání zachová ID a zobrazí prázdný výsledek', () => {
  assert.equal(findSources('T02')[0].id, 'T02');
  assert.deepEqual(findSources('nepřítomný_jev'), []);
  assert.equal(documents.length, 3);
});
test('bot odmítne neplatný 29. únor 1937', () => {
  const result = postAnswer('price','1937-02-29');
  assert.equal(result.state, 'invalid');
  assert.deepEqual(result.ids, []);
});
for (const { id, kind, intent, date, state, sources } of evaluations) {
  test(`průchozí projekt ${id} · ${kind}`, () => {
    const result = postAnswer(intent,date);
    assert.equal(result.state,state);
    assert.deepEqual(result.ids,sources);
    assert.equal(result.fiction,true);
  });
}
