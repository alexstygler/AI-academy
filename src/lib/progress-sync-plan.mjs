import { blankRecord, blankProgress } from './progress-store.mjs';

const stableJson = (value) => JSON.stringify(value, (_, item) =>
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]]))
    : item);

export const sameProgress = (left, right) => stableJson(left) === stableJson(right);

export function mergeProgress(base, local, cloud, preference = 'cloud') {
  const data = blankProgress();
  const conflicts = [];
  const ids = new Set([...Object.keys(local.lessons), ...Object.keys(cloud.lessons)]);
  for (const id of ids) {
    const before = base.lessons[id] ?? blankRecord();
    const here = local.lessons[id] ?? blankRecord();
    const there = cloud.lessons[id] ?? blankRecord();
    if (!cloud.lessons[id] && sameProgress(here, before)) continue;
    const fields = {};
    for (const field of ['note', 'rubric']) {
      const localChanged = !sameProgress(here[field], before[field]);
      const cloudChanged = !sameProgress(there[field], before[field]);
      const conflict = localChanged && cloudChanged && !sameProgress(here[field], there[field]);
      if (conflict) conflicts.push({ id, field });
      fields[field] = localChanged && (!conflict || preference === 'local') ? here[field] : there[field];
    }
    const previousAttempts = new Set(before.attempts.map(stableJson));
    const attempts = new Map(there.attempts.map((attempt) => [stableJson(attempt), attempt]));
    for (const attempt of here.attempts) {
      const key = stableJson(attempt);
      if (!previousAttempts.has(key)) attempts.set(key, attempt);
    }
    data.lessons[id] = {
      opened: there.opened || (here.opened && !before.opened),
      completed: there.completed || (here.completed && !before.completed),
      attempts: [...attempts.entries()].sort(([leftKey, left], [rightKey, right]) =>
        Date.parse(left.at) - Date.parse(right.at) || (leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0))
        .slice(-100).map(([, attempt]) => attempt),
      ...fields,
    };
  }
  return { data, conflicts };
}

export function planProgressSync(base, local, cloud, preference) {
  if (sameProgress(local, base.data)) return { action: 'adopt', data: cloud.data };
  if (cloud.generation !== base.generation) {
    if (preference === 'cloud') return { action: 'adopt', data: cloud.data };
    if (preference === 'local') return { action: 'save', data: local, replace: true };
    return { action: 'conflict', reason: 'replacement' };
  }

  const merged = mergeProgress(base.data, local, cloud.data, preference);
  if (merged.conflicts.length && !preference) return { action: 'conflict', reason: 'notes' };
  return sameProgress(merged.data, cloud.data)
    ? { action: 'adopt', data: cloud.data }
    : { action: 'save', data: merged.data, replace: false };
}
