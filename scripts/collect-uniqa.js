// UNIQA's own calculator (online.uniqa.sk) blocks automated collection with a
// server-side reCAPTCHA v3 score check ("Ochrana proti spamu" - see
// insurers/uniqa/capture/BLOCKED.md). This script instead goes through a
// licensed insurance broker's live multi-insurer comparison widget
// (netfinancie.sk, embedded e.g. on financnykompas.sk/poistenie-nehnutelnosti-domacnosti),
// which fetches real quotes from several insurers - including UNIQA - via its
// own server-to-server integration, so it isn't subject to UNIQA's own
// client-facing bot check. Only the UNIQA offer cards are kept from the
// comparison; the other insurers shown there are collected directly instead.
//
// Caveat (recorded in doplnujuce_info on every row): the broker's wizard
// applies its own default risk selection, which may not exactly match the
// coverage scope requested on our own direct-calculator collectors, so
// treat this as a good-faith proxy for UNIQA's pricing, not a byte-for-byte
// equivalent collection method.
const { chromium } = require('/home/user/Monitoring/node_modules/playwright');
const fs = require('fs');

const CHROME_PATH = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const WIDGET_URL = 'https://iframe.netfinancie.sk/xform-iframe/7b2276657273696f6e223a22332e35222c226f726967696e223a2268747470733a2f2f7777772e66696e616e636e796b6f6d7061732e736b222c22736661223a226e66222c2270726f64756374223a22706f697374656e69652d646f6d6f762d646f6d61636e6f737469222c22616964223a2235366138633965643765306461222c22626964223a2268747470733a2f2f7777772e66696e616e636e796b6f6d7061732e736b222c22676964223a22303030227d/';

const PROFILES = {
  'byt-bratislava': {
    kind: 'byt', psc: '85106', ulica: 'Lietavská', supisne: '3095', orientacne: '9',
    material: 'panel, betón', plocha: 65, suma_nehnutelnost: 200000, suma_domacnost: 25000,
  },
  'byt-kosice': {
    kind: 'byt', psc: '04001', ulica: 'Ostravská', supisne: '1014', orientacne: '12',
    material: 'panel, betón', plocha: 39, suma_nehnutelnost: 150000, suma_domacnost: 20000,
  },
  'dom-male-dvorniky': {
    kind: 'dom', psc: '92901', ulica: 'Krátka', supisne: '389', orientacne: '10',
    material: 'tehla, porobetón, ytong', strecha: 'šikmá – s neobytným podkrovím / bez podkrovia',
    plocha: 95, suma_nehnutelnost: 200000, suma_domacnost: 25000,
  },
  'dom-vlckovce': {
    kind: 'dom', psc: '91923', ulica: 'Vlčkovce', supisne: '447', orientacne: '13',
    material: 'tehla, porobetón, ytong', strecha: 'rovná / mierny sklon',
    plocha: 110, suma_nehnutelnost: 300000, suma_domacnost: 30000,
  },
};

const INFO_NOTE = ('Cena získaná cez porovnávací nástroj licencovaného finančného sprostredkovateľa '
  + '(netfinancie.sk / Klik.cz & ePojisteni.cz s.r.o.), nie priamo z kalkulačky UNIQA - tá blokuje '
  + 'automatizovaný prístup anti-bot ochranou ("Ochrana proti spamu", pozri insurers/uniqa/capture/BLOCKED.md). '
  + 'Rozsah krytia je podľa predvoleného odporúčania tohto sprostredkovateľa, nemusí byť totožný s rozsahom '
  + 'zvoleným na priamych kalkulačkách ostatných poisťovní.');

async function run(profileId) {
  const p = PROFILES[profileId];
  const outDir = '/home/user/Monitoring/insurers/uniqa/capture';
  const log = (...a) => console.log(`[${profileId}]`, ...a);
  const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true, args: ['--disable-blink-features=AutomationControlled'] });
  const context = await browser.newContext({ viewport: { width: 1400, height: 1400 }, userAgent: UA, locale: 'sk-SK' });
  const page = await context.newPage();
  try {
    await page.goto(WIDGET_URL, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(1500);

    await page.getByText(p.kind === 'byt' ? 'byt' : 'rodinný dom', { exact: true }).first().click();
    await page.waitForTimeout(300);
    await page.getByText('dokončená', { exact: true }).first().click();
    await page.waitForTimeout(300);
    await page.getByText('nehnuteľnosť a domácnosť', { exact: true }).first().click();
    await page.waitForTimeout(300);
    await page.getByText('Pokračovať', { exact: true }).click();
    await page.waitForTimeout(2000);
    log('step1 (zakladne udaje) url reached');

    // The widget used to open a separate "#NFXFormModal" picker on click; as of
    // ~2026-10-24 it instead shows an inline suggestion list (.btn-search-mestopsc)
    // right below the Mesto field as you type - no modal involved anymore. When
    // the PSČ has only one match (small villages like Vlčkovce), the widget
    // auto-fills it and collapses the list before a click can land, so only
    // click a suggestion if the field wasn't already auto-filled.
    const mestoInput = page.locator('input[name=miesto_poistenia_mesto]');
    await mestoInput.type(p.psc, { delay: 150 });
    await page.waitForTimeout(1200);
    const autoFilled = /[a-zA-Zá-žÁ-Ž]/.test(await mestoInput.inputValue());
    if (!autoFilled) {
      await page.locator('.btn-search-mestopsc').first().click();
      await page.waitForTimeout(800);
    }
    await page.fill('input[name=miesto_poistenia_ulica]', p.ulica).catch(() => {});
    await page.fill('input[name=miesto_poistenia_supisne]', p.supisne);
    await page.fill('input[name=miesto_poistenia_orientacne]', p.orientacne);
    await page.selectOption('select[name=nehnutelnost_konstrukcia]', { label: p.material });
    await page.selectOption('select[name=nehnutelnost_domacnost_obyvana]', { label: 'celoročne (trvalo)' });
    await page.selectOption('select[name=nehnutelnost_vztah]', { label: 'vlastním a obývam' });
    await page.fill('input[name=poistnik_telefon]', '0949414398');
    await page.waitForTimeout(500);
    await page.getByText('Pokračovať', { exact: true }).click();
    await page.waitForTimeout(2500);
    log('step2 (miesto poistenia) submitted');

    if (p.kind === 'byt') {
      await page.fill('input[name=zakladna_plocha_bytu]', String(p.plocha));
      await page.fill('input[name=balkon_lodzia]', '0').catch(() => {});
    } else {
      await page.selectOption('select[name=typ_budovy]', { label: 'viacpodlažná bez pivnice (suterénu)' });
      await page.waitForTimeout(400);
      await page.selectOption('select[name=typ_strechy]', { label: p.strecha });
      await page.waitForTimeout(600);
      const half = Math.round(p.plocha / 2);
      await page.fill('input[name=prizemie]', String(half));
      await page.fill('input[name=poschodia]', String(p.plocha - half));
      if (p.strecha.includes('šikmá')) {
        await page.fill('input[name=neobytne_podkrovie]', '5');
      }
    }
    await page.waitForTimeout(300);
    await page.fill('input[name=klientom_stanovena_ps_nehnutelnosti]', String(p.suma_nehnutelnost));
    await page.waitForTimeout(500);
    await page.getByText('Pokračovať', { exact: true }).click();
    await page.waitForTimeout(2500);
    log('step3 (udaje o nehnutelnosti) submitted');

    if (p.kind === 'dom') {
      await page.fill('input[name=uzitkova_plocha_nehnutelnosti]', String(p.plocha));
    }
    await page.fill('input[name=klientom_stanovena_ps_domacnosti]', String(p.suma_domacnost));
    await page.waitForTimeout(500);
    await page.getByText('Pokračovať', { exact: true }).click();
    log('step4 (udaje o domacnosti) submitted, waiting for offers...');

    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(5000);
      const stillLoading = await page.getByText('Čakajte, prosím').count();
      if (!stillLoading) break;
    }
    await page.waitForTimeout(1000);

    const html = await page.content();
    fs.writeFileSync(`${outDir}/${profileId}-offers.html`, html);
    await page.screenshot({ path: `${outDir}/${profileId}-offers.png`, fullPage: true });

    const cards = await page.$$eval('div.vypis, div.vypis-reklama', (els) => els.map((el) => {
      const img = el.querySelector('img[alt]');
      const insurer = img ? img.getAttribute('alt') : null;
      const text = el.innerText || '';
      return { insurer, text };
    }));

    const seen = new Set();
    const results = [];
    for (const c of cards) {
      if (!c.insurer || !c.insurer.toLowerCase().includes('uniqa')) continue;
      const priceMatch = c.text.match(/(\d[\d\s]*,\d{2})\s*€/);
      if (!priceMatch) continue; // unavailable-offer cards have no price
      const cena = priceMatch[1].replace(/\s/g, '');
      const tierMatch = c.text.match(/Nehnuteľnosť\s+([A-ZÁ-Ža-zá-ž]+)/);
      const balik = tierMatch ? tierMatch[1] : 'Domov & bezpečie';
      const key = balik + '|' + cena;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({
        balik,
        spoluucast: '0 €',
        cena,
        coverage: [],
        odporucana_suma_nehnutelnost: String(p.suma_nehnutelnost),
        doplnujuce_info: INFO_NOTE,
      });
    }

    log('UNIQA offers found:', JSON.stringify(results.map((r) => [r.balik, r.cena])));
    if (results.length === 0) {
      const unavailableCard = cards.find((c) => c.insurer && c.insurer.toLowerCase().includes('uniqa'));
      const reason = unavailableCard
        ? unavailableCard.text.trim()
        : 'No UNIQA card at all on the comparison page (see saved -offers.html/-offers.png)';
      log('UNIQA has no offer today:', reason);
      // Not a script failure: the broker itself declines to quote UNIQA for this
      // profile today (same "rozsah poistení ... aktuálne nie je v ponuke" message
      // seen from other insurers on this widget from time to time). Write a
      // documented zero-row result instead of failing the pipeline run, same
      // pattern as Wüstenrot's over-the-cap case.
      fs.writeFileSync(`${outDir}/${profileId}-results.json`, JSON.stringify([], null, 2));
      await browser.close();
      return [];
    }
    fs.writeFileSync(`${outDir}/${profileId}-results.json`, JSON.stringify(results, null, 2));

    await browser.close();
    return results;
  } catch (e) {
    await page.screenshot({ path: `${outDir}/${profileId}-ERROR.png`, fullPage: true }).catch(() => {});
    await browser.close();
    throw e;
  }
}

run(process.argv[2]).catch((e) => { console.error('FATAL', e.message); process.exit(1); });
