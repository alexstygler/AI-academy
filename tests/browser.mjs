import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const base = process.env.ACADEMY_TEST_URL || 'http://127.0.0.1:4321/AI-academy/';
const liveBase = process.env.ACADEMY_LIVE_TEST_URL || 'http://127.0.0.1:4322/AI-academy/';
const route = (path, root = base) => new URL(path, root).href;
let browser;
before(async () => {
  browser = await chromium.launch({
    executablePath: process.env.ACADEMY_CHROMIUM || undefined,
    args: ['--no-sandbox'],
  });
});
after(async () => browser?.close());

async function withPage(options, action) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try { await action(page); assert.deepEqual(errors, []); }
  finally { await context.close(); }
}

test('desktop: cesta, klávesnicový kvíz, uložení a návrat k další lekci', async () => {
  await withPage({viewport:{width:1440,height:900}}, async (page) => {
    const response = await page.goto(base);
    assert.equal(response.status(),200);
    await page.keyboard.press('Tab');
    assert.equal(await page.locator(':focus').textContent(), 'Přeskočit na obsah');
    await page.getByRole('link',{name:'Začít lekci'}).click();
    assert.equal(page.url(),route('lekce/jak-model-pracuje/'));
    assert.equal(await page.locator('[data-lesson-status]').textContent(),'Otevřeno');
    const quiz = page.locator('#overeni');
    assert.equal(await page.getByText('Zobrazit nápovědu').locator('..').getAttribute('open'), null);
    await quiz.getByRole('radio',{name:'Váhy modelu během tréninku'}).check();
    await quiz.getByRole('radio',{name:'Vyberu údaj, který model zopakuje'}).check();
    await quiz.getByRole('button',{name:'Odevzdat odpovědi'}).click();
    await quiz.getByText('0 z 2.',{exact:false}).waitFor();
    const first = quiz.getByRole('radio',{name:'Pracovní kontext aktuálního běhu'});
    await first.focus();
    await page.keyboard.press('Space');
    const second = quiz.getByRole('radio',{name:'Otevřu původní pasáž a zkontroluji účinnost'});
    await second.focus();
    await page.keyboard.press('Space');
    await quiz.getByRole('button',{name:'Odevzdat odpovědi'}).focus();
    await page.keyboard.press('Enter');
    await quiz.getByText('Ověření splněno.',{exact:false}).waitFor();
    await page.getByLabel('Tvoje řešení a poznámka').fill('Ověřuji T02 podle data účinnosti.');
    await page.getByRole('checkbox').first().check();
    await page.getByRole('button',{name:'Uložit poznámku'}).click();
    await page.getByText('Poznámka je uložená', {exact:false}).waitFor();
    await page.reload();
    assert.equal(await page.locator('[data-lesson-status]').textContent(),'Splněno');
    assert.equal(await page.getByLabel('Tvoje řešení a poznámka').inputValue(),'Ověřuji T02 podle data účinnosti.');
    assert.equal(await page.getByRole('checkbox').first().isChecked(),true);
    await page.getByText('Poslední uložený pokus.', {exact:false}).waitFor();
    await page.goBack();
    assert.equal(await page.locator('[data-progress-count]').textContent(),'1');
    assert.equal(await page.locator('[data-next-link]').getAttribute('href'),'/AI-academy/lekce/prompting/');
  });
});

test('mobil: bez vodorovného přetečení, navigace a ukázkový tutor', async () => {
  await withPage({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true }, async (page) => {
    await page.goto(base);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
    await page.getByRole('button',{name:'Otevřít navigaci'}).click();
    await page.getByRole('link',{name:'Studijní plán',exact:true}).click();
    assert.equal(await page.locator('.module-panel').count(),9);
    await page.getByRole('link',{name:/01 Jak model pracuje/}).click();
    await page.getByText('Vysvětli tuto lekci',{exact:true}).click();
    await page.getByLabel('Otázka k lekci').fill('Co je pracovní kontext?');
    await page.getByRole('button',{name:'Zeptat se tutora'}).click();
    await page.locator('#tutor').getByText('Rozděl odpověď na tvrzení.',{exact:false}).waitFor();
    assert.equal(await page.getByRole('link',{name:'Přejít na související pasáž'}).getAttribute('href'),'#vyklad');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
    await page.getByRole('link',{name:'Další lekce'}).click();
    await page.getByRole('heading',{name:'Prompting a kontext',exact:true}).waitFor();
  });
});

test('přístupnost lekce a dialogu hledání', async () => {
  await withPage({viewport:{width:390,height:844}}, async (page) => {
    await page.goto(route('lekce/jak-model-pracuje/'));
    await page.getByText('Vysvětli tuto lekci',{exact:true}).click();
    const audit = async () => {
      const result = await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
      assert.deepEqual(result.violations.map((violation) => [violation.id,violation.nodes.map((node) => node.target)]), []);
    };
    await audit();
    await page.getByRole('button',{name:'Vyhledat v akademii'}).click();
    await page.getByRole('searchbox',{name:'Vyhledat v akademii'}).fill('claude sheets');
    await page.getByRole('link',{name:/Claude Sheets Atlas/}).waitFor();
    await audit();
    await page.keyboard.press('Escape');
    await page.locator('.search-dialog').waitFor({state:'hidden'});
  });
});

test('obnova poškozených dat, import, export a potvrzený reset', async () => {
  await withPage({acceptDownloads:true}, async (page) => {
    await page.goto(route('pokrok/'));
    await page.evaluate(() => localStorage.setItem('ai-akademie-progress','{poškozeno'));
    await page.reload();
    await page.getByText('Pokrok nejde načíst.',{exact:false}).waitFor();
    await page.locator('#progress-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"version":5}')});
    await page.getByText('Soubor nelze importovat.',{exact:false}).waitFor();
    const entry = {opened:true,completed:false,attempts:[],note:'Záloha',rubric:[]};
    const data = {version:1,lessons:{prompting:entry}};
    page.once('dialog',(dialog)=>dialog.accept());
    await page.locator('#progress-file').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
    await page.getByText('Pokrok byl obnoven ze zálohy.').waitFor();
    assert.equal(await page.locator('[data-progress-row=prompting] [data-state]').textContent(),'Otevřeno');
    const download = page.waitForEvent('download');
    await page.getByRole('button',{name:'Exportovat JSON'}).click();
    assert.equal((await download).suggestedFilename(),'ai-akademie-pokrok.json');
    page.once('dialog',(dialog)=>dialog.dismiss());
    await page.getByRole('button',{name:'Resetovat pokrok'}).click();
    assert.equal(await page.locator('[data-progress-row=prompting] [data-state]').textContent(),'Otevřeno');
    page.once('dialog',(dialog)=>dialog.accept());
    await page.getByRole('button',{name:'Resetovat pokrok'}).click();
    await page.getByText('Pokrok byl resetován.').waitFor();
    assert.equal(await page.locator('[data-progress-row=prompting] [data-state]').textContent(),'Neotevřeno');
  });
});

test('dílna: citace na přelomu tarifu, fikce a chybějící důkaz', async () => {
  await withPage({}, async (page) => {
    await page.goto(route('dilna/#bot'));
    const result = page.locator('#post-result');
    await page.getByLabel('Datum u otázky na cenu').fill('1937-02-28');
    await page.getByRole('button',{name:'Najít odpověď'}).click();
    await result.getByText('Fiktivní údaje').waitFor();
    await result.getByText('40 haléřů',{exact:false}).waitFor();
    await page.getByLabel('Datum u otázky na cenu').fill('1937-03-01');
    await page.getByRole('button',{name:'Najít odpověď'}).click();
    await result.getByText('60 haléřů',{exact:false}).waitFor();
    assert.equal(await result.getByRole('link',{name:'T02'}).getAttribute('href'),'#T02');
    await page.getByLabel('Otázka',{exact:true}).selectOption('express');
    await page.getByRole('button',{name:'Najít odpověď'}).click();
    await result.getByText('Nedoloženo.',{exact:false}).waitFor();
  });
});

test('atlas kombinuje filtry a dá se najít českým dotazem bez diakritiky', async () => {
  await withPage({}, async (page) => {
    await page.goto(route('atlas/'));
    await page.getByLabel('Poskytovatel').selectOption('Google');
    await page.getByLabel('Podle práce').selectOption('Média');
    assert.deepEqual(await page.locator('[data-tool]:visible h2').allTextContents(),['Gemini Omni','Flow','Veo']);
    await page.getByLabel('Hledat',{exact:true}).fill('multimodalni');
    assert.deepEqual(await page.locator('[data-tool]:visible h2').allTextContents(),['Gemini Omni']);
    await page.getByLabel('Typ',{exact:true}).selectOption('API');
    await page.getByText('Žádná položka.',{exact:false}).waitFor();
  });
});

test('výpadek živého tutora nabídne připravenou nápovědu a kvíz funguje dál', async () => {
  await withPage({}, async (page) => {
    let requests = 0;
    await page.route('https://tutor.academy.test/v1/tutor', (request) => {
      const options = request.request().method() === 'OPTIONS';
      if (!options) requests++;
      return request.fulfill({
      status:options ? 204 : 503,
      headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'POST, OPTIONS'},
      contentType:'application/json', body:options ? undefined : JSON.stringify({error:'Simulovaný výpadek'}),
    }); });
    await page.goto(route('lekce/jak-model-pracuje/',liveBase));
    await page.getByText('Živý režim pro oprávněné').waitFor({timeout:5000});
    await page.getByText('Vysvětli tuto lekci',{exact:true}).click();
    await page.getByLabel('Přístupový kód').fill('fixture-browser-token-without-live-access');
    await page.getByLabel('Otázka k lekci').fill('Jak funguje kontext?');
    await page.getByRole('button',{name:'Zeptat se tutora'}).click();
    await page.getByText('Živý tutor je nedostupný.',{exact:false}).waitFor();
    assert.equal(requests,1);
    assert.equal(await page.getByRole('link',{name:'Přejít na související pasáž'}).getAttribute('href'),'#vyklad');
    await page.getByRole('radio',{name:'Pracovní kontext aktuálního běhu'}).check();
    await page.getByRole('radio',{name:'Otevřu původní pasáž a zkontroluji účinnost'}).check();
    await page.getByRole('button',{name:'Odevzdat odpovědi'}).click();
    await page.getByText('Ověření splněno.',{exact:false}).waitFor();
  });
});


test('bez JavaScriptu formulář neposílá kód tutora ani osobní poznámku v URL', async () => {
  await withPage({javaScriptEnabled:false}, async (page) => {
    const address = route('lekce/jak-model-pracuje/',liveBase);
    await page.goto(address);
    await page.getByText('Vysvětli tuto lekci',{exact:true}).click();
    await page.getByLabel('Přístupový kód').fill('fixture-browser-private-code');
    await page.getByLabel('Otázka k lekci').fill('Tento dotaz je soukromý.');
    await page.getByRole('button',{name:'Zeptat se tutora'}).click();
    assert.equal(page.url(),address);
    await page.getByLabel('Tvoje řešení a poznámka').fill('Tato poznámka má zůstat místní.');
    await page.getByRole('button',{name:'Uložit poznámku'}).click();
    assert.equal(page.url(),address);
  });
});
