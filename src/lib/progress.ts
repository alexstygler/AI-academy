import { blankProgress, blankRecord, key, parseProgress } from './progress-store.mjs';
import { progressSyncConfig } from './progress-sync-config';
export { parseProgress };

export type Problem = 'damaged' | 'unavailable';
export type Data = ReturnType<typeof parseProgress>;
export type Snapshot = { revision: number; generation: number; data: Data };
export type AccountProgress = { base: Snapshot; data: Data; migratedGuest?: boolean };
export const progressEvent = 'academy-progress';
export const activeAccountKey = key + ':account:' + (progressSyncConfig?.scope ?? 'local');

export const allowedIds = () => [...JSON.parse(document.body.dataset.lessonIds || '[]') as string[], 'projekt-kviz', 'zkouska-prenosu', 'znalostni-bot'];
export const emptyProgress = (): Data => blankProgress() as Data;
export const emptySnapshot = (): Snapshot => ({ revision: 0, generation: 0, data: emptyProgress() });
export const accountStorageKey = (id: string) => activeAccountKey + ':' + id;
export const notifyProgress = (source: 'local' | 'cloud' | 'account') =>
  document.dispatchEvent(new CustomEvent(progressEvent, { detail: source }));

export function readActiveAccount() {
  if (!progressSyncConfig) return null;
  try {
    const id = localStorage.getItem(activeAccountKey);
    return id && /^[a-f0-9-]{36}$/i.test(id) ? id : null;
  } catch { return null; }
}

export function setActiveAccount(id: string | null) {
  if (id) localStorage.setItem(activeAccountKey, id);
  else localStorage.removeItem(activeAccountKey);
  notifyProgress('account');
}

export function readSnapshot(value: unknown): Snapshot {
  const row = value as Snapshot | null;
  if (!row || !Number.isSafeInteger(row.revision) || row.revision < 0 ||
      !Number.isSafeInteger(row.generation) || row.generation < 0) throw new Error('Neplatná revize pokroku.');
  return {
    revision: row.revision,
    generation: row.generation,
    data: parseProgress(JSON.stringify(row.data), allowedIds()),
  };
}

export function readAccountProgress(id: string): AccountProgress {
  const raw = localStorage.getItem(accountStorageKey(id));
  if (raw === null) return { base: emptySnapshot(), data: emptyProgress() };
  const cached = JSON.parse(raw);
  return {
    base: readSnapshot(cached.base),
    data: parseProgress(JSON.stringify(cached.data), allowedIds()),
    migratedGuest: cached.migratedGuest === true,
  };
}

export function saveAccountProgress(id: string, state: AccountProgress) {
  localStorage.setItem(accountStorageKey(id), JSON.stringify(state));
}

function readStorage(local: () => Data): { data: Data; problem?: Problem } {
  try { return { data: local() }; }
  catch (error) {
    return { data: emptyProgress(), problem: error instanceof DOMException ? 'unavailable' : 'damaged' };
  }
}

export function readGuestProgress() {
  return readStorage(() => {
    const raw = localStorage.getItem(key);
    return raw === null ? emptyProgress() : parseProgress(raw, allowedIds());
  });
}

export function readProgress(): { data: Data; problem?: Problem } {
  const id = readActiveAccount();
  return id ? readStorage(() => readAccountProgress(id).data) : readGuestProgress();
}

export function writeProgress(data: Data) {
  const id = readActiveAccount();
  if (id) saveAccountProgress(id, { ...readAccountProgress(id), data });
  else localStorage.setItem(key, JSON.stringify(data));
  notifyProgress('local');
}

export function resetGuestProgress() {
  localStorage.removeItem(key);
  notifyProgress('local');
}

export function updateRecord(id: string, change: (record: Data['lessons'][string]) => void) {
  const state = readProgress();
  if (state.problem) return state.problem;
  const existing = state.data.lessons[id];
  const before = existing && JSON.stringify(existing);
  const entry = existing ?? blankRecord();
  change(entry);
  if (before === JSON.stringify(entry)) return;
  state.data.lessons[id] = entry;
  try { writeProgress(state.data); }
  catch { return 'unavailable'; }
}

export function progressMessage(problem: Problem) {
  return problem === 'damaged'
    ? 'Pokrok nejde načíst. Na stránce Můj pokrok můžeš obnovit zálohu nebo data resetovat.'
    : 'Prohlížeč teď neumožňuje uložit pokrok. Zkontroluj nastavení místního úložiště.';
}
