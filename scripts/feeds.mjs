import { XMLParser } from 'fast-xml-parser';
import { SyntaxValidator } from 'fast-xml-validator';

export const sources = [
  { id: 'openai-sdk', label: 'OpenAI Node SDK', repo: 'openai/openai-node' },
  { id: 'anthropic-sdk', label: 'Anthropic Python SDK', repo: 'anthropics/anthropic-sdk-python' },
  { id: 'google-sdk', label: 'Google Gen AI SDK', repo: 'googleapis/js-genai' },
];

function excerpt(content) {
  const raw = typeof content === 'string' ? content : content?.['#text'];
  if (typeof raw !== 'string') return '';
  return raw.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 380);
}

export async function collectSources(fetchSource = fetch) {
  const results = await Promise.allSettled(sources.map(async ({ id, label, repo }) => {
    const origin = 'https://github.com/' + repo;
    const response = await fetchSource(origin + '/releases.atom', {
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
      headers: { Accept: 'application/atom+xml' },
    });
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    let xml = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.length;
        if (bytes > 2_000_000) { await reader.cancel(); throw new Error('Feed překročil limit.'); }
        xml += decoder.decode(value, { stream: true });
      }
      xml += decoder.decode();
    } finally { reader.releaseLock(); }
    if (/<!DOCTYPE|<!ENTITY/i.test(xml) || SyntaxValidator.validate(xml) !== true) throw new Error('Neplatný feed.');
    const feed = new XMLParser({ ignoreAttributes: false, parseTagValue: false, processEntities: false, isArray: (name) => ['entry','link'].includes(name) }).parse(xml).feed;
    if (!feed) throw new Error('Chybí Atom feed.');
    return (feed.entry || []).flatMap((entry) => {
      const url = entry.link?.find((link) => link['@_rel'] === 'alternate')?.['@_href'];
      if (typeof url !== 'string' || !url.startsWith(origin + '/releases/tag/') || typeof entry.title !== 'string') return [];
      const published = typeof entry.published === 'string' ? entry.published : null;
      const sourceDate = published || entry.updated;
      if (typeof sourceDate !== 'string' || !Number.isFinite(Date.parse(sourceDate))) return [];
      return [{
        sourceId: id, title: `${label} · ${entry.title.slice(0,120)}`, url, sourceDate,
        dateKind: published ? 'publikováno' : 'aktualizace zdroje',
        announced: null,
        availability: 'Neověřena. Ověř v poznámkách vydání a v cílovém účtu.',
        excerpt: excerpt(entry.content || entry.summary),
        evidence: 'Primární zdroj · čeká na redakční kontrolu.',
      }];
    });
  }));
  return {
    records: results.flatMap((result) => result.status === 'fulfilled' ? result.value : []),
    gaps: results.flatMap((result, index) => result.status === 'rejected' ? [sources[index].label + ' · feed se nepodařilo načíst'] : []),
  };
}

export function fixtureRecords(window) {
  return sources.map(({ id, label, repo }, index) => ({
    sourceId: id, title: label + ' · fiktivní zkušební oznámení',
    url: `https://github.com/${repo}/releases`,
    sourceDate: new Date(Date.parse(window.startAt) + (index + 1) * 86_400_000).toISOString(),
    dateKind: 'simulovaný čas',
    announced: null, availability: 'Simulace', excerpt: 'Cvičná položka pro ruční kontrolu času a zdroje.', evidence: 'Zkušební data. Odkaz vede na skutečný katalog, příklad nepopisuje skutečné vydání.',
  }));
}
