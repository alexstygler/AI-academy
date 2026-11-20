import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const nonempty = z.string().min(1);
const slug = nonempty.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const question = z.object({
  id: slug,
  prompt: nonempty,
  options: z.array(z.object({ text: nonempty, feedback: nonempty })).min(2),
  answer: z.number().int().nonnegative(),
}).refine((value) => value.answer < value.options.length, 'Index správné odpovědi je mimo rozsah.');

const lessons = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/lessons' }),
  schema: z.object({
    version: z.literal(1),
    id: slug,
    week: z.number().int().min(1).max(18),
    title: nonempty,
    goal: nonempty,
    minutes: z.number().int().positive(),
    prerequisites: z.array(slug),
    sourceChapter: nonempty,
    sourcePage: z.number().int().positive(),
    theory: nonempty,
    detail: nonempty,
    example: nonempty,
    guided: nonempty,
    independent: nonempty,
    hint: nonempty,
    sample: nonempty,
    rubric: z.array(nonempty).min(2),
    questions: z.array(question).min(2),
    sources: z.array(z.object({ label: nonempty, url: z.string().url().startsWith('https://') })).min(1),
    code: nonempty.nullable(),
  }),
});

export const collections = { lessons };
