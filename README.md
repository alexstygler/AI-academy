# AI akademie pro Alexe

Český statický studijní web rozpracovává rozšířené vydání studijní příručky z 19. listopadu 2026. Obsahuje 18 týdnů, šest praktik, zkoušku přenosu, atlas, fiktivní dílnu o potrubní poště a archiv pondělních přehledů. Lekce, kvízy, poznámky, atlas a místní tutor fungují bez přihlášení a placeného API.

## Vývoj

Použij Node.js 24 podle [.nvmrc](.nvmrc). Projekt byl ověřen s Node.js 24.22.1 a npm 11.9.0. Výchozí podcesta je `/AI-academy/`.

```sh
npm ci
npm run dev
# Otevři http://localhost:4321/AI-academy/
npm run check
npm test
npm run build
npm run preview -- --host 0.0.0.0 --port 4321
```

V omezeném cloudovém prostředí nastav `ASTRO_TELEMETRY_DISABLED=1` pro příkazy Astro, protože účet nemá zapisovatelnou uživatelskou konfiguraci. V běžném místním prostředí je nastavení volitelné.

Pro testy v prohlížeči nech na portu 4321 běžet produkční preview. V druhém terminálu sestav a spusť testovací variantu. Testy simulují výpadek tutora a přihlášení i ukládání v Supabase.

```sh
PUBLIC_TUTOR_URL=https://tutor.academy.test/v1/tutor \
  PUBLIC_SUPABASE_URL=https://sync.academy.test \
  PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_browser_fixture \
  ACADEMY_BUILD_DIR=dist-test npm run build
ACADEMY_BUILD_DIR=dist-test npm run preview -- --host 127.0.0.1 --port 4322
```

Potom spusť testovací příkazy:

```sh
npx playwright install chromium
npm run test:browser
# Nebo použij systémový Chromium:
ACADEMY_CHROMIUM=/usr/bin/chromium npm run test:browser
```

Adresy můžeš změnit pomocí `ACADEMY_TEST_URL` a `ACADEMY_LIVE_TEST_URL`. Testy pokrývají mobilní i desktopový průchod, klávesnici, vybraná automatická pravidla WCAG v lekci a hledání, pokrok a jeho obnovu, atlas, fiktivní citace a výpadek tutora.

## Přidání lekce

1. Vytvoř JSON podle sousední lekce v [src/content/lessons](src/content/lessons). Jméno souboru a stabilní `id` sjednoť.
2. Políčko `week` je v hlavní trase jedinečné. Při rozšíření za 18 týdnů aktualizuj rozsah ve [schématu](src/content.config.ts), párování modulů a test osnovy. Doplň konkrétní cíl, zdrojovou kapitolu a stranu, externí zdroje, obě cvičení, vzor a alespoň dvě ověřovací otázky. Index `answer` čísluj od nuly a ke každé nabídce připoj vysvětlení.
3. Ověř `npm run check`, `npm test`, `npm run build` a hluboký odkaz v preview. Stabilní ID používá i tutor a záloha pokroku. Kvíz označuje lekci za splněnou po jednom plně správném pokusu. Stav, posledních 100 pokusů na položku a uložené poznámky zůstávají v prohlížeči.

Příručka PDF je zdrojový podklad. Do webu se sestavují zpracované lekce, citace, praktika a záznamy atlasu. U fiktivních pramenů a jejich výsledků je označení přímo v rozhraní.

## Pondělní přehled

```sh
# Stejný mechanismus pro plánovaný i ruční sběr:
npm run prehled -- draft
npm run prehled -- draft --as-of 2026-11-16
npm run prehled -- show --id tyden-2026-11-09

# Opakovatelný lokální pokus s vlastní databází:
npm run prehled -- draft --fixture --as-of 2026-11-16 --db .editorial/cviceni.sqlite
```

`--as-of` je pražské referenční datum. Příkaz sbírá kandidáty z oficiálních GitHub release feedů OpenAI, Anthropic a Google a ukládá jediný koncept pro poslední uzavřený pražský týden. U Atom položek eviduje dostupný datumový údaj, včetně případu, kdy jde jen o aktualizaci zdroje. Datum oznámení a dostupnost ověřuje redaktor samostatně. Chybějící feed se zobrazí jako mezera v pokrytí. Bez dostupných položek vznikne označený zkušební koncept. Výchozí neveřejnou databázi `.editorial/issues.sqlite` můžeš přesměrovat pomocí `EDITORIAL_DB` nebo `--db`.

Na Linuxu se systemd připrav systémového uživatele a skupinu `akademie-editor` a checkout na `/opt/ai-akademie` s instalací `npm ci`. Uprav cestu k Node.js 24 v [službě](deploy/akademie-editorial.service), pokud je jinde. Zkopíruj službu a [timer](deploy/akademie-editorial.timer) do `/etc/systemd/system` a spusť `sudo systemctl daemon-reload`, `sudo systemctl enable --now akademie-editorial.timer` a `systemctl list-timers akademie-editorial.timer`. Ruční kontrolu stejného běhu můžeš spustit pomocí `sudo systemctl start akademie-editorial.service`. Pro starší interval použij CLI s `--as-of` pod uživatelem služby. Hostitel potřebuje HTTPS přístup k `github.com`. Časovač používá pondělí 07:15 v `Europe/Prague` včetně změn letního času.

### Přidání vydání do archivu

1. V privátním úložišti otevři `show --id …`. Zkontroluj primární odkazy, rozsah dostupnosti a věcnou přesnost. Z příručky použij šablonu 2 + 7 + 7 + 4 minuty. Vytvoř revizní JSON s poli `title`, `intro`, `deepDive`, `experiment`, `corrections` a `items`. Položka má `url` z konceptu, `summary`, `why`, `announced` (ISO datum nebo `null`) a `availability`.
2. Pro redaktora vygeneruj náhodný přístupový kód o síle alespoň 256 bitů a bezpečně ulož jeho SHA-256 v `EDITORIAL_REVIEW_TOKEN_HASH`. Při revizi zadej kód jako `EDITORIAL_REVIEW_TOKEN` neveřejným způsobem do běžícího procesu. Zaměstnanecká či týmová instalace chrání SQLite soubor systémovými oprávněními. Práva k zápisu do SQLite a správě služby dej jen důvěryhodným procesům a správcům.
3. Schval aktuální verzi a ulož schválený JSON. Příkaz ověřuje přístup, revizní schéma a existenci primárních odkazů ze sběru.

   ```sh
   node scripts/edition.mjs approve --id tyden-2026-11-09 --version 1 --review-file review.json > approved.json
   ```

4. Po úspěšném příkazu vlož JSON jako `src/content/editions/<id>.json`. Build přijímá jen validní schválená vydání a zkontroluje shodu názvu souboru s ID. Publikuj až samostatným ručním krokem. Schválený záznam v SQLite se při opakování sběru nepřepíše. Případnou opravu v archivu projednej jako ruční revizi existujícího JSON se záznamem v `corrections`.

## GitHub Pages

1. Po schválení uživatelem ulož projekt na GitHub do `main`. V **Settings → Pages** nastav **GitHub Actions** jako zdroj.
2. Pro předvydání spusť kontrolu a místní náhled se skutečnou podcestou. Pro režim živého tutora nastav v **Actions Variables** pouze veřejnou adresu `PUBLIC_TUTOR_URL`.
3. V Actions spusť **Ruční vydání na GitHub Pages** z ověřené větve nebo tagu. Otevři `https://alexstygler.github.io/AI-academy/` a přímý odkaz na lekci. Do protokolu zapiš SHA, kvíz, obnovu pokroku, mobil, zdroje a reakci tutora.
4. Pro návrat spusť ruční vydání z posledního ověřeného tagu. Pro vypnutí živého tutora odeber proměnnou `PUBLIC_TUTOR_URL` a sestav i vydej ověřenou revizi znovu. Pro lokální origin nebo jiný název repozitáře uprav `site` a `base` v [astro.config.mjs](astro.config.mjs).

## Synchronizace pokroku mezi zařízeními

Synchronizace je volitelná. Bez nastaveného projektu funguje učení, ukládání místního pokroku i zálohy JSON. Po přihlášení se pokrok, pokusy, poznámky a sebehodnocení ukládají pod vlastním účtem v Supabase.

1. V Supabase vytvoř nebo otevři projekt. V **SQL Editoru** spusť celý soubor [deploy/supabase/progress.sql](deploy/supabase/progress.sql). Vytvoří tabulku s oprávněními pro čtení vlastního záznamu a funkci, která ověřuje účet a očekávanou revizi při ukládání.
2. V **Authentication → Providers** zapni e-mailové přihlášení. V **Authentication → Email Templates** vlož do šablon **Magic Link** a **Confirm signup** kód `{{ .Token }}`. Můžeš použít text `<p>Tvůj kód pro AI akademii je <strong>{{ .Token }}</strong>.</p>`. Výchozí SMTP Supabase doručuje jen na adresy členů organizace v Supabase. Pro ostatní uživatele nastav vlastní SMTP. [Dokumentace e-mailových kódů](https://supabase.com/docs/guides/auth/auth-email-passwordless?flow=otp)
3. V repozitáři otevři **Settings → Secrets and variables → Actions → Variables**. Přidej `PUBLIC_SUPABASE_URL` s adresou projektu a `PUBLIC_SUPABASE_PUBLISHABLE_KEY` s veřejným klíčem začínajícím `sb_publishable_`. Tyto dvě hodnoty se použijí v klientském buildu. Použij výhradně veřejný klíč.
4. Spusť ruční vydání na GitHub Pages. Potom v **Můj pokrok** vyžádej e-mailový kód a přihlas se. Pokud už máš studijní výsledky v prohlížeči, zvol **Přenést místní pokrok do účtu**. Na dalším zařízení použij stejný e-mail.
5. Ověř synchronizaci v druhém prohlížeči nebo na telefonu. Zvol jiný e-mail a zkontroluj, že se zobrazí jeho vlastní stav. Po změně v otevřeném okně se účet průběžně obnovuje přibližně každých 30 sekund. Ručně můžeš použít **Synchronizovat teď**.

Souběžné pokusy se spojí a při současné úpravě stejné poznámky nebo sebehodnocení stránka nabídne volbu verze. Import nebo reset během přihlášení nahradí pokrok účtu na všech zařízeních. Když mezitím zařízení pracovalo bez připojení, aplikace odloží odeslání jeho změn a nabídne volbu kopie. Záznamy zůstávají v místní kopii, dokud je aplikace úspěšně neuloží do účtu nebo uživatel nevybere verzi z účtu.

## Samostatný tutor na jednom Linux serveru

Místní demonstrace API je dostupná přes `npm run tutor`. Server naslouchá na loopbacku. Po spuštění ověř odpověď simulátoru příkazem níže.

```sh
curl --fail-with-body http://127.0.0.1:8787/v1/tutor \
  -H 'Origin: http://localhost:4321' -H 'Content-Type: application/json' \
  --data '{"lessonId":"jak-model-pracuje","question":"Co je kontext?"}'
```

Pro produkci použij Node.js 24 za HTTPS reverzní proxy na jednom hostiteli. Příjem žádostí a kvóty jsou společné pro procesy, které otevírají stejný trvalý lokální soubor SQLite. Pro více hostitelů by bylo potřeba sdílené transakční úložiště dostupné všem instancím.

1. Připrav účelový systémový účet a skupinu `akademie-tutor`, checkout `/opt/ai-akademie` a `npm ci --omit=dev`. Přenes [systemd službu](deploy/akademie-tutor.service) do `/etc/systemd/system` a uprav cestu k Node.js podle hostitele.
2. V neveřejném `/etc/ai-akademie/tutor.env` s oprávněním 0600 vyplň `TUTOR_MODE=live`, `TUTOR_ORIGIN` (přesný HTTPS origin studijní stránky bez podcesty), `TUTOR_DB` (soubor v `/var/lib/akademie-tutor`), `OPENAI_API_KEY`, `OPENAI_MODEL` a `TUTOR_IDENTITIES_JSON`. Pro každou povolenou identitu vydej samostatný kryptograficky náhodný base64url kód. Konfigurace mapuje hex SHA-256 kódu na objekt ve tvaru `{"id":"identita","scopes":["tutor:ask"]}`. Kód předá uživatel v dialogu. Odebrání hashe a restart služby přístup odvolá. Konfigurační pole bez hodnot najdeš v [.env.example](.env.example).
3. Nastav `TUTOR_RATE_PER_MINUTE` podle identity a `TUTOR_DAILY_REQUESTS` pro celou službu. Denní kvóta se resetuje v UTC. Požadavek může použít maximálně 600 znaků otázky, 320 výstupních tokenů a devět sekund čekání na model. Volba modelu musí podporovat strukturovaný výstup Responses API. Klíč může mít vlastní rozpočet a oprávnění v projektu API.
4. Na hostiteli s platným HTTPS certifikátem přidej do serverového bloku [ukázku konfigurace Nginx](deploy/akademie-tutor.nginx.conf). Potom spusť `sudo systemctl daemon-reload`, `sudo systemctl enable --now akademie-tutor.service`, `sudo nginx -t` a načti konfiguraci proxy. Místně ověř `curl --fail http://127.0.0.1:8787/healthz`. Hostitel potřebuje HTTPS přístup k `api.openai.com`.
5. Nastav `PUBLIC_TUTOR_URL` na HTTPS URL končící `/v1/tutor` a sestav web. Ověř odmítnutí dotazu bez kódu, autorizovaný dotaz s citací a výpadek služby. Při chybě web ukáže připravený výklad. Tajné údaje zůstávají v konfiguraci serveru. Pro vypnutí zastav službu a vydej build bez `PUBLIC_TUTOR_URL`.

Web ukládá poznámky a pokrok místně. V živém režimu server posílá dotaz a pasáže dané lekce poskytovateli modelu. Parametr `store: false` řídí uložení odpovědi v API. Podmínky retence a obsahu ověř podle nastavení projektu poskytovatele.
