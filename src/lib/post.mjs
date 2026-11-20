import corpus from '../content/project/corpus.json' with { type: 'json' };

export const documents = corpus.documents;

export function findSources(query) {
  const normalize = (text) => text.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  const terms = normalize(query).match(/[a-z0-9]+/g) || [];
  if (!terms.length) return [];
  return documents.map((document) => {
    const text = normalize([document.id, document.title, document.text, document.validity].join(' '));
    return { document, score: terms.filter((term) => text.includes(term)).length };
  }).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score).map(({ document }) => document);
}

export function postAnswer(intent, date = '') {
  const result = (text, ids = [], state = 'supported') => ({ text, ids, state, fiction: true });
  const [oldTariff, newTariff, ride] = documents;
  switch (intent) {
    case 'price': {
      if (!date) return result('Jaké datum tě zajímá? Podle období platí dvě různé sazby.', [oldTariff.id, newTariff.id], 'clarify');
      const parsed = new Date(date + 'T00:00:00Z');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(+parsed) || parsed.toISOString().slice(0, 10) !== date) {
        return result('Zadej platné kalendářní datum.', [], 'invalid');
      }
      const tariff = [oldTariff, newTariff].find(({ from, to }) => from && date >= from && (!to || date <= to));
      return tariff ? result(`Standardní pouzdro stojí ${tariff.amount} haléřů. Platnost dokládá ${tariff.id} ${tariff.locator}.`, [tariff.id]) :
        result('Nedoloženo. Potřebuji tarif platný k vybranému datu.', [], 'unsupported');
    }
    case 'published': return result('Tarif B byl vyhlášen 24. února 1937. Účinný je od 1. března.', [newTariff.id]);
    case 'ride': return result('Jedna zkušební jízda trvala 8 minut. Průměr z ní nevyplývá.', [ride.id]);
    case 'express': return result('Nedoloženo. V korpusu chybí expresní tarif.', [], 'unsupported');
    case 'average': return result('Nedoloženo. Korpus obsahuje jen jeden průjezd. Pro průměr potřebujeme další měření.', [ride.id], 'unsupported');
    default: return result('Tato otázka přesahuje dostupný korpus. Vyber některou z podporovaných otázek.', [], 'unsupported');
  }
}
