import { z } from 'zod';

const identifier = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80);
const attempt = z.object({
  at: z.string().datetime(),
  score: z.number().int().min(0),
  total: z.number().int().min(1).max(100),
  answers: z.record(identifier, z.number().int().min(0).max(30)),
}).strict().refine(({ score, total }) => score <= total);

const record = z.object({
  opened: z.boolean(),
  completed: z.boolean(),
  attempts: z.array(attempt).max(100),
  note: z.string().max(6000),
  rubric: z.array(z.number().int().min(0).max(30)).max(30),
}).strict();
const progress = z.object({ version: z.literal(1), lessons: z.record(identifier, record) }).strict();
export const key = 'ai-akademie-progress';
export const blankProgress = () => ({ version: 1, lessons: {} });
export const blankRecord = () => ({ opened: false, completed: false, attempts: [], note: '', rubric: [] });

export function parseProgress(text, allowed) {
  if (text.length > 2_000_000) throw new Error('Soubor je příliš velký.');
  const parsed = progress.safeParse(JSON.parse(text));
  if (!parsed.success || Object.keys(parsed.data.lessons).some((id) => !allowed.includes(id))) {
    throw new Error('Soubor neodpovídá formátu pokroku verze 1.');
  }
  return parsed.data;
}
