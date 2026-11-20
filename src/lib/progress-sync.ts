import { createClient, type User } from '@supabase/supabase-js';
import {
  accountStorageKey, activeAccountKey, emptyProgress, emptySnapshot, notifyProgress, progressEvent,
  readAccountProgress, readActiveAccount, readGuestProgress, readSnapshot, saveAccountProgress, setActiveAccount,
  type AccountProgress, type Data, type Snapshot,
} from './progress';
import { progressSyncConfig } from './progress-sync-config';
import { mergeProgress, planProgressSync, sameProgress } from './progress-sync-plan.mjs';

type Preference = 'local' | 'cloud';
type Status = 'pending' | 'saved' | 'offline' | 'notes' | 'replacement';

if (!progressSyncConfig) throw new Error('Synchronizace nemá nastavený Supabase.');
const client = createClient(progressSyncConfig.url, progressSyncConfig.key, {
  auth: { storageKey: 'ai-akademie-auth:' + progressSyncConfig.scope, detectSessionInUrl: false },
  global: {
    fetch: (input, init) => {
      const timeout = AbortSignal.timeout(12_000);
      const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
      return fetch(input, { ...init, signal });
    },
  },
});
const stateEvent = 'academy-sync-state';
let user: User | null = null;
let status: Status = 'pending';
let queue: Promise<unknown> = Promise.resolve();
let timer: number | undefined;

function changed() {
  document.dispatchEvent(new Event(stateEvent));
}
function report(next: Status) {
  status = next;
  changed();
}
function isActive(id: string) {
  return user?.id === id && readActiveAccount() === id;
}
function enqueue<T>(operation: () => Promise<T>) {
  const task = queue.then(operation);
  queue = task.catch(() => {});
  return task;
}
function schedule() {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => { void syncProgress(); }, 200);
}

async function fetchProgress(id: string) {
  const { data, error } = await client.from('academy_progress')
    .select('revision,generation,data').eq('user_id', id).maybeSingle();
  if (error) throw error;
  return data ? readSnapshot(data) : emptySnapshot();
}

async function saveProgress(id: string, revision: number, data: Data, replace: boolean) {
  const response = await client.rpc('save_academy_progress', {
    account_id: id,
    expected_revision: revision,
    progress_payload: data,
    replace_progress: replace,
  }).maybeSingle();
  if (response.error) throw response.error;
  return response.data ? readSnapshot(response.data) : null;
}

function applyCloud(id: string, snapshot: Snapshot, observed: AccountProgress) {
  if (!isActive(id)) return false;
  const latest = readAccountProgress(id);
  if (latest.base.revision > snapshot.revision) return true;
  const data = sameProgress(latest.data, observed.data)
    ? snapshot.data
    : mergeProgress(observed.data, latest.data, snapshot.data, 'local').data as Data;
  if (!sameProgress(latest, { ...latest, base: snapshot, data })) {
    saveAccountProgress(id, { ...latest, base: snapshot, data });
    notifyProgress('cloud');
  }
  return !sameProgress(data, snapshot.data);
}

async function synchronize(id: string, preference?: Preference) {
  if (!isActive(id)) return false;
  report('pending');
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const cloud = await fetchProgress(id);
      if (!isActive(id)) return false;
      const cached = readAccountProgress(id);
      if (cached.base.revision > cloud.revision) continue;
      const plan = planProgressSync(cached.base, cached.data, cloud, preference);
      if (plan.action === 'conflict') {
        report(plan.reason === 'replacement' ? 'replacement' : 'notes');
        return false;
      }
      const snapshot = plan.action === 'adopt' ? cloud : await saveProgress(id, cloud.revision, plan.data as Data, plan.replace === true);
      if (!snapshot) continue;
      const dirty = applyCloud(id, snapshot, cached);
      preference = undefined;
      if (isActive(id) && !dirty) {
        report('saved');
        return true;
      }
    }
  } catch {
    // The browser copy carries pending changes into the next retry.
  }
  if (isActive(id)) report('offline');
  return false;
}

export function syncProgress(preference?: Preference) {
  const id = user?.id;
  return id ? enqueue(() => synchronize(id, preference)) : Promise.resolve(false);
}

export async function replaceSyncedProgress(id: string, data: Data) {
  return enqueue(async () => {
    if (!isActive(id)) throw new Error('Nejdřív obnov přihlášení k synchronizaci.');
    const cloud = await fetchProgress(id);
    if (!isActive(id)) throw new Error('Účet se mezitím změnil.');
    let cached: AccountProgress | undefined;
    try { cached = readAccountProgress(id); } catch { /* Explicit replacement can recover a damaged cache. */ }
    if (cached && cached.base.revision !== cloud.revision) {
      await synchronize(id);
      throw new Error('Pokrok se mezitím změnil. Zkontroluj aktuální stav a zkus akci znovu.');
    }
    const snapshot = await saveProgress(id, cloud.revision, data, true);
    if (!snapshot || !isActive(id)) throw new Error('Pokrok se mezitím změnil. Zkus synchronizovat znovu.');
    if (cached) {
      if (applyCloud(id, snapshot, cached)) schedule();
    } else {
      saveAccountProgress(id, { base: snapshot, data: snapshot.data });
      notifyProgress('cloud');
    }
    report('saved');
  });
}

async function migrateGuest() {
  const id = user?.id;
  if (!id || !await syncProgress() || !isActive(id)) return;
  const guest = readGuestProgress();
  if (guest.problem || !Object.keys(guest.data.lessons).length) return;
  const cached = readAccountProgress(id);
  const proposed = mergeProgress(emptyProgress(), guest.data, cached.data);
  if (proposed.conflicts.length && !confirm('Některé poznámky nebo sebehodnocení existují v obou kopiích. Přenést pokrok a v těchto případech použít verzi z účtu?')) return;
  saveAccountProgress(id, { ...cached, data: proposed.data as Data, migratedGuest: true });
  notifyProgress('local');
  await syncProgress();
}

client.auth.onAuthStateChange((_, session) => {
  const next = session?.user ?? null;
  const different = next?.id !== user?.id;
  user = next;
  try {
    if (readActiveAccount() !== (next?.id ?? null)) setActiveAccount(next?.id ?? null);
    if (different && next) report('pending');
    else changed();
    if (next) schedule();
  } catch {
    report('offline');
  }
});

document.addEventListener(progressEvent, (event) => {
  if ((event as CustomEvent).detail === 'local' && user) schedule();
});
window.addEventListener('online', schedule);
window.addEventListener('pageshow', (event) => { if (event.persisted) schedule(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && user) schedule(); });
window.addEventListener('storage', (event) => {
  const id = readActiveAccount();
  if (event.key === activeAccountKey || (id && event.key === accountStorageKey(id))) {
    notifyProgress(event.key === activeAccountKey ? 'account' : 'cloud');
    changed();
  }
});
window.setInterval(() => { if (user && !document.hidden) schedule(); }, 30_000);

export function connectProgressPanel(panel: HTMLElement) {
  const emailForm = panel.querySelector<HTMLFormElement>('[data-sync-email]')!;
  const codeForm = panel.querySelector<HTMLFormElement>('[data-sync-code]')!;
  const signedIn = panel.querySelector<HTMLElement>('[data-sync-account]')!;
  const message = panel.querySelector<HTMLElement>('[data-sync-status]')!;
  const action = panel.querySelector<HTMLElement>('[data-sync-action]')!;
  const address = panel.querySelector<HTMLElement>('[data-sync-address]')!;
  const conflict = panel.querySelector<HTMLElement>('[data-sync-conflict]')!;
  const migrate = panel.querySelector<HTMLButtonElement>('[data-sync-migrate]')!;
  const messages: Record<Status, string> = {
    pending: 'Synchronizuji pokrok…',
    saved: 'Pokrok je synchronizovaný.',
    offline: 'Synchronizace teď není dostupná. Uložené změny zkusíme odeslat, až bude připojení fungovat.',
    notes: 'Poznámky nebo sebehodnocení se změnily na více zařízeních. Vyber verzi pro rozdílné položky. Ostatní změny se spojí.',
    replacement: 'Na jiném zařízení byl pokrok nahrazen nebo resetován. Vyber, kterou kopii chceš zachovat. Svoji kopii můžeš nejdřív exportovat.',
  };
  let email = '';
  let busy = false;
  function render() {
    emailForm.hidden = Boolean(user);
    codeForm.hidden = Boolean(user) || !email;
    signedIn.hidden = !user;
    address.textContent = user?.email || '';
    message.textContent = user ? messages[status] : '';
    conflict.hidden = status !== 'notes' && status !== 'replacement';
    try {
      migrate.hidden = !user || !isActive(user.id) || Boolean(readAccountProgress(user.id).migratedGuest) ||
        !Object.keys(readGuestProgress().data.lessons).length;
    } catch { migrate.hidden = true; }
    for (const button of panel.querySelectorAll<HTMLButtonElement>('button')) button.disabled = busy;
  }
  async function run(operation: () => Promise<void>, errorText: string) {
    if (busy) return;
    busy = true;
    action.textContent = '';
    render();
    try { await operation(); }
    catch { action.textContent = errorText; }
    finally { busy = false; render(); }
  }
  emailForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const requested = String(new FormData(emailForm).get('email') ?? '').trim();
    void run(async () => {
      const { error } = await client.auth.signInWithOtp({ email: requested });
      if (error) throw error;
      email = requested;
      codeForm.reset();
      action.textContent = 'Přihlašovací kód byl odeslán. Opiš ho z e-mailu.';
    }, 'Kód se nepodařilo odeslat. Zkontroluj adresu a zkus to znovu za chvíli.');
  });
  codeForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const token = String(new FormData(codeForm).get('code') ?? '').trim();
    void run(async () => {
      const { error } = await client.auth.verifyOtp({ email, token, type: 'email' });
      if (error) throw error;
      email = '';
      codeForm.reset();
      emailForm.reset();
    }, 'Kód je neplatný nebo vypršel. Zkus zadat nový kód.');
  });
  panel.querySelector('[data-sync-refresh]')!.addEventListener('click', () => {
    void run(async () => { await syncProgress(); }, messages.offline);
  });
  for (const button of panel.querySelectorAll<HTMLButtonElement>('[data-sync-resolve]')) {
    button.addEventListener('click', () => {
      void run(async () => { await syncProgress(button.dataset.syncResolve as Preference); }, messages.offline);
    });
  }
  migrate.addEventListener('click', () => {
    if (!confirm('Přenést pokrok, poznámky a pokusy z tohoto prohlížeče do přihlášeného účtu?')) return;
    void run(migrateGuest, 'Místní pokrok se nepodařilo přenést.');
  });
  panel.querySelector('[data-sync-signout]')!.addEventListener('click', () => {
    void run(async () => {
      const id = user?.id;
      if (!id) return;
      await syncProgress();
      let pending = true;
      try {
        const cached = readAccountProgress(id);
        pending = !sameProgress(cached.data, cached.base.data);
      } catch { /* Keep a damaged copy available for recovery. */ }
      if (pending && !confirm('Místní kopie účtu zůstane v tomto prohlížeči pro příští přihlášení. Odhlásit se?')) return;
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw error;
      if (!pending) localStorage.removeItem(accountStorageKey(id));
      action.textContent = 'Odhlášení proběhlo.';
    }, 'Odhlášení se nepodařilo. Zkus to znovu.');
  });
  document.addEventListener(stateEvent, render);
  render();
}
