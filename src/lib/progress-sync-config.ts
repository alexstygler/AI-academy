const url = import.meta.env.PUBLIC_SUPABASE_URL?.trim() || '';
const key = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || '';

if (Boolean(url) !== Boolean(key)) {
  throw new Error('Nastav společně PUBLIC_SUPABASE_URL a PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
}
if (url) {
  const origin = new URL(url);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  if (origin.origin !== url.replace(/\/$/, '') || (origin.protocol !== 'https:' && !(local && origin.protocol === 'http:'))) {
    throw new Error('PUBLIC_SUPABASE_URL musí obsahovat pouze adresu projektu.');
  }
  if (!/^sb_publishable_[a-zA-Z0-9_-]+$/.test(key)) {
    throw new Error('Použij veřejný klíč Supabase začínající sb_publishable_.');
  }
}

export const progressSyncConfig = url ? { url, key, scope: new URL(url).host } : null;
