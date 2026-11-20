import { z } from 'zod';
import atlasData from '../content/atlas.json';
import workshopData from '../content/project/workshops.json';

const text = z.string().min(1);
const id = text.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const hasUniqueIds = (entries: { id: string }[]) => new Set(entries.map((entry) => entry.id)).size === entries.length;

export const atlas = z.object({
  version: z.literal(1),
  tools: z.array(z.object({
    id,
    name: text,
    provider: text,
    type: z.enum(['Model','Aplikace','Vývojový nástroj','API']),
    task: z.enum(['Rešerše','Studium','Tabulky','Vývoj','Automatizace','Média']),
    description: text,
    url: z.string().url().startsWith('https://'),
    source: text.regex(/^[A-Z][0-9]{2}$/),
    checkedAt: z.string().date(),
  })).min(1).refine(hasUniqueIds, 'Duplicitní ID položky atlasu.'),
}).parse(atlasData);

export const workshop = z.object({
  version: z.literal(1),
  labs: z.array(z.object({
    id, title: text, week: z.number().int().min(1).max(18), page: z.number().int().positive(),
    goal: text, steps: z.array(text).min(1), solo: text, sample: text,
  })).length(6).refine(hasUniqueIds, 'Duplicitní ID praktika.'),
  transfer: z.array(z.object({question: text, sample: text})).length(6),
}).parse(workshopData);
