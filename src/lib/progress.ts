import { blankProgress, blankRecord, key, parseProgress } from './progress-store.mjs';
export { key, parseProgress };

export type Problem = 'damaged' | 'unavailable';
type Data = ReturnType<typeof parseProgress>;
export const allowedIds = () => [...JSON.parse(document.body.dataset.lessonIds || '[]') as string[], 'projekt-kviz', 'zkouska-prenosu', 'znalostni-bot'];
export function readProgress(): { data: Data; problem?: Problem } {
  let raw: string | null;
  try { raw = localStorage.getItem(key); }
  catch { return { data: blankProgress() as Data, problem: 'unavailable' }; }
  if (raw === null) return { data: blankProgress() as Data };
  try { return { data: parseProgress(raw, allowedIds()) }; }
  catch { return { data: blankProgress() as Data, problem: 'damaged' }; }
}
export function writeProgress(data: Data) {
  localStorage.setItem(key, JSON.stringify(data));
}
export function updateRecord(id: string, change: (record: ReturnType<typeof parseProgress>['lessons'][string]) => void) {
  const state = readProgress();
  if (state.problem) return state.problem;
  const entry = state.data.lessons[id] ?? blankRecord();
  change(entry);
  state.data.lessons[id] = entry;
  try { writeProgress(state.data); }
  catch { return 'unavailable'; }
}
export function progressMessage(problem: Problem) {
  return problem === 'damaged'
    ? 'Pokrok nejde načíst. Na stránce Můj pokrok můžeš obnovit zálohu nebo data resetovat.'
    : 'Prohlížeč teď neumožňuje uložit pokrok. Zkontroluj nastavení místního úložiště.';
}
