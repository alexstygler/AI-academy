import { z } from 'zod';

export const timezone = 'Europe/Prague';
const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
const localCalendar = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
const localClock = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', hourCycle: 'h23' });
const label = z.string().trim().min(1).max(180);
const article = z.string().trim().min(1).max(2200);
const https = z.string().url().startsWith('https://');
const calendarDate = z.string().date();
const sourceDate = calendarDate.nullable();
export const reviewSchema = z.object({
  title: label,
  intro: article,
  deepDive: article,
  experiment: article,
  items: z.array(z.object({ url: https, summary: article, why: article, announced: sourceDate, availability: label })).min(1).max(12),
  corrections: z.array(label).max(20),
}).strict();
export const publicEditionSchema = reviewSchema.extend({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^tyden-\d{4}-\d{2}-\d{2}$/),
  status: z.literal('schváleno'),
  version: z.number().int().positive(),
  windowStart: calendarDate,
  windowEndExclusive: calendarDate,
  timezone: z.literal(timezone),
  reviewedAt: z.string().datetime(),
});

function moveDate(date, days) {
  const adjusted = new Date(date + 'T00:00:00Z');
  adjusted.setUTCDate(adjusted.getUTCDate() + days);
  return adjusted.toISOString().slice(0,10);
}

function pragueMidnight(date) {
  const midnightUTC = new Date(date + 'T00:00:00Z');
  const hour = Number(localClock.format(midnightUTC));
  return new Date(+midnightUTC - hour * 3_600_000).toISOString();
}

export function previousWeek(reference = new Date()) {
  if (typeof reference === 'string' && dateOnly.test(reference) && reference !== moveDate(reference, 0)) {
    throw new Error('Neplatné datum pro pražský kalendář.');
  }
  const date = typeof reference === 'string' && dateOnly.test(reference) ? reference : localCalendar.format(new Date(reference));
  const utcDay = new Date(date + 'T00:00:00Z').getUTCDay();
  const windowEndExclusive = moveDate(date, -((utcDay + 6) % 7));
  const windowStart = moveDate(windowEndExclusive, -7);
  return {
    id: 'tyden-' + windowStart,
    timezone,
    windowStart,
    windowEndExclusive,
    startAt: pragueMidnight(windowStart),
    endAt: pragueMidnight(windowEndExclusive),
  };
}

export function canonicalUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Nepovolený odkaz.');
  url.hash = '';
  for (const name of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$)/i.test(name)) url.searchParams.delete(name);
  }
  url.searchParams.sort();
  if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '');
  return url.href;
}

export function createDraft(window, records, { fixture = false, gaps = [] } = {}) {
  const candidates = new Map();
  for (const item of records) {
    const timestamp = +new Date(item.sourceDate);
    if (!Number.isFinite(timestamp) || timestamp < Date.parse(window.startAt) || timestamp >= Date.parse(window.endAt)) continue;
    const url = canonicalUrl(item.url);
    const existing = candidates.get(url);
    if (existing && Date.parse(existing.sourceDate) >= timestamp) continue;
    candidates.set(url, { ...item, url, sourceDate: new Date(timestamp).toISOString() });
  }
  return {
    schemaVersion: 1,
    ...window,
    status: 'k revizi',
    outline: {
      title: `AI přehled · týden od ${window.windowStart}`,
      intro: 'Vyber nejdůležitější změny z níže uvedených primárních podkladů a napiš, komu pomohou.',
      deepDive: 'Popiš jednu změnu do hloubky. Odděl tvrzení výrobce, podmínky dostupnosti a vlastní měření.',
      experiment: 'Na stejném malém vzorku porovnej dosavadní a novou verzi. Sleduj správnost, čas a náklady.',
    },
    fixture,
    gaps: [...new Set(gaps)].sort(),
    items: [...candidates.values()].sort((a,b) => b.sourceDate.localeCompare(a.sourceDate) || a.url.localeCompare(b.url)).slice(0,18),
  };
}

export function reviewedEdition(current, input, now = new Date()) {
  const review = reviewSchema.parse(input);
  const allowed = new Set(current.items.map(({ url }) => url));
  const links = review.items.map(({ url }) => canonicalUrl(url));
  if (new Set(links).size !== links.length || links.some((url) => !allowed.has(url))) throw new Error('Revize obsahuje neznámý nebo duplicitní primární odkaz.');
  return publicEditionSchema.parse({
    ...review,
    items: review.items.map((item, index) => ({ ...item, url: links[index] })),
    schemaVersion: 1,
    id: current.id,
    status: 'schváleno',
    version: current.version,
    windowStart: current.windowStart,
    windowEndExclusive: current.windowEndExclusive,
    timezone: current.timezone,
    reviewedAt: now.toISOString(),
  });
}
