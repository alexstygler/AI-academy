import { getCollection } from 'astro:content';
export const lessons = (await getCollection('lessons')).map((entry) => entry.data).sort((a, b) => a.week - b.week);
export const base = import.meta.env.BASE_URL.replace(/\/$/, '');
export const url = (page = '') => `${base}/${page ? page.replace(/\/$/, '') + '/' : ''}`;
export const lessonUrl = (id: string) => url(`lekce/${id}`);
export const modules = [
  { title: 'Základy AI', weeks: '1–2', description: 'Modely, prompting a práce s kontextem.', color: 'blue' },
  { title: 'Rešerše a práce s daty', weeks: '3–4', description: 'Ověřování zdrojů, tabulky a multimodalita.', color: 'violet' },
  { title: 'Vývoj s AI', weeks: '5–6', description: 'Git, Codex a Claude Code.', color: 'peach' },
  { title: 'Skills a automatizace', weeks: '7–8', description: 'Opakovatelné postupy a n8n.', color: 'mint' },
  { title: 'API a vlastní bot', weeks: '9–10', description: 'Strukturovaný výstup a volání funkcí.', color: 'blue' },
  { title: 'RAG a citace', weeks: '11–12', description: 'Vyhledávání v dokumentech a paměť.', color: 'violet' },
  { title: 'MCP a agenti', weeks: '13–14', description: 'Nástroje, oprávnění a řízení běhu.', color: 'peach' },
  { title: 'Evaluace a provoz', weeks: '15–16', description: 'Měření kvality, náklady a odolnost.', color: 'mint' },
  { title: 'Vlastní akademie', weeks: '17–18', description: 'Studijní web, vydání a přejímka.', color: 'blue' },
];
