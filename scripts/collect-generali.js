const { chromium } = require('/home/user/Monitoring/node_modules/playwright');
const fs = require('fs');

const CONTACT = { phone: '949414398', email: 'janko.mrkvicka@gmail.com' };
const CHROME_PATH = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const PROFILES = {
  'byt-bratislava': { type: 'FLAT', psc: '85106', obecQuery: 'Bratislava', castObceQuery: 'Petržalka', ulica: 'Lietavská', orient: '9', supisne: '3095', plocha: 65, rok: 1985, poschodie: 7, suma_nehnutelnost: 200000, suma_domacnost: 25000 },
  'byt-kosice': { type: 'FLAT', psc: '04001', obecQuery: 'Košice', castObceQuery: 'Sever', ulica: 'Ostravská', orient: '12', supisne: '1014', plocha: 39, rok: 1979, poschodie: 4, suma_nehnutelnost: 150000, suma_domacnost: 20000 },
  'dom-male-dvorniky': { type: 'HOUSE', psc: '92901', obecQuery: 'Malé Dvorníky', ulica: 'Krátka', orient: '10', supisne: '389', plocha: 95, rok: 2023, material: 'Tehla', strecha: 'šikmá', suma_nehnutelnost: 200000, suma_domacnost: 25000 },
  'dom-vlckovce': { type: 'HOUSE', psc: '91923', ulica: 'Vlčkovce', orient: '', supisne: '447', plocha: 110, rok: 2023, material: 'Tehla', strecha: 'rovná', suma_nehnutelnost: 300000, suma_domacnost: 30000 },
};

async function run(profileId) {
  const p = PROFILES[profileId];
  const outDir = '/home/user/Monitoring/insurers/generali/capture';
  const log = (...a) => console.log(`[${profileId}]`, ...a);
  const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true, args: ['--disable-blink-features=AutomationControlled'] });
  const context = await browser.newContext({ viewport: { width: 1400, height: 1400 }, userAgent: UA, locale: 'sk-SK' });
  const page = await context.newPage();
  try {
    await page.goto('https://www.generali.sk/poistna-kalkulacka/majetok/', { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(2000);
    await page.getByText('Akceptovať cookies', { exact: false }).click().catch(() => {});
    await page.waitForTimeout(500);
    await page.getByText('Začať nezáväznú kalkuláciu', { exact: false }).click();
    await page.waitForTimeout(1500);
    await page.getByText(p.type === 'HOUSE' ? 'Rodinný dom' : 'Byt', { exact: true }).click();
    await page.waitForTimeout(400);
    await page.getByText('Pokračovať', { exact: true }).click();
    await page.waitForTimeout(1500);
    await page.getByText('Domácnosť aj nehnuteľnosť', { exact: true }).click();
    await page.waitForTimeout(400);
    await page.getByText('Pokračovať', { exact: true }).click();
    await page.waitForTimeout(2000);
    log('step3 url:', page.url());

    await page.locator('input').nth(0).fill(p.psc);
    await page.waitForTimeout(1200);
    const obecOptions = await page.locator('select').nth(0).locator('option').allTextContents();
    log('obec options:', JSON.stringify(obecOptions));
    const obecMatch = p.obecQuery ? obecOptions.find(o => o.includes(p.obecQuery)) : obecOptions[0];
    await page.selectOption('select >> nth=0', obecMatch);
    await page.waitForTimeout(600);
    const castObceOptions = await page.locator('select').nth(1).locator('option').allTextContents();
    log('cast obce options:', JSON.stringify(castObceOptions));
    if (castObceOptions.length) {
      const castMatch = p.castObceQuery ? castObceOptions.find(o => o.includes(p.castObceQuery)) : castObceOptions[0];
      await page.selectOption('select >> nth=1', castMatch).catch(() => {});
    }
    await page.waitForTimeout(400);

    if (p.ulica) await page.locator('input').nth(1).fill(p.ulica).catch(() => {});
    if (p.orient) await page.locator('input').nth(2).fill(p.orient).catch(() => {});
    if (p.supisne) await page.locator('input').nth(3).fill(p.supisne).catch(() => {});
    await page.getByText('V obci', { exact: true }).click();
    await page.waitForTimeout(300);
    await page.locator('input').nth(6).fill(CONTACT.phone);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${outDir}/${profileId}-step3-filled.png`, fullPage: true });

    await page.getByText('Pokračovať', { exact: true }).click();
    await page.waitForTimeout(2500);
    log('step4 url:', page.url());

    // step 4 (HOUSE): "Informácie o nehnuteľnosti"
    if (p.type === 'HOUSE') {
      await page.getByText('Dokončená skolaudovaná', { exact: true }).click();
      await page.waitForTimeout(250);
      const rokInput = page.locator('text=Rok kolaudácie').locator('xpath=following::input[1]');
      await rokInput.fill(String(p.rok));
      await page.waitForTimeout(250);
      const q2 = page.locator('text=Prebehla rozsiahla rekonštrukcia').locator('xpath=following::label[contains(.,"Nie")][1]');
      await q2.click().catch(() => {});
      await page.waitForTimeout(250);
      await page.getByText('Murovaná', { exact: true }).click();
      await page.waitForTimeout(250);
      const plochaInput = page.locator('text=Zastavaná plocha').locator('xpath=following::input[1]');
      await plochaInput.fill(String(p.plocha));
      await page.waitForTimeout(250);
      const podlaziaLabel = p.pocetPodlazi === 1 ? '1' : '2 a viac';
      await page.getByText(podlaziaLabel, { exact: true }).click();
      await page.waitForTimeout(250);
      const strechaLabel = p.strecha === 'šikmá' ? 'Šikmá obytná' : 'Rovná';
      await page.getByText(strechaLabel, { exact: true }).click();
      await page.waitForTimeout(250);
      await page.getByText('Žiadnu', { exact: true }).click();
      await page.waitForTimeout(250);
      const q7 = page.locator('text=Postihla vašu nehnuteľnosť').locator('xpath=following::label[contains(.,"Nie")][1]');
      await q7.click().catch(() => {});
      const q8 = page.locator('text=Je nehnuteľnosť trvalo obývaná').locator('xpath=following::label[contains(.,"Áno")][1]');
      await q8.click().catch(() => {});
      const q9 = page.locator('text=Slúži daná nehnuteľnosť').locator('xpath=following::label[contains(.,"Nie")][1]');
      await q9.click().catch(() => {});
      await page.waitForTimeout(400);
    } else {
      // FLAT: Poschodie bytu, Dokončená, Rekonštrukcia Nie, Konštrukcia, Podlahová plocha, then same Nie/Áno/Nie/Áno/Áno tail
      const poschodieInput = page.locator('text=Poschodie bytu').locator('xpath=following::input[1]');
      await poschodieInput.fill(String(p.poschodie));
      await page.waitForTimeout(250);
      await page.getByText('Dokončená skolaudovaná', { exact: true }).click();
      await page.waitForTimeout(250);
      const rokInputF = page.locator('text=Rok kolaudácie').locator('xpath=following::input[1]');
      await rokInputF.fill(String(p.rok));
      await page.waitForTimeout(250);
      const q2f = page.locator('text=Prebehla rozsiahla rekonštrukcia').locator('xpath=following::label[contains(.,"Nie")][1]');
      await q2f.click().catch(() => {});
      await page.waitForTimeout(250);
      await page.getByText('Murovaná', { exact: true }).click();
      await page.waitForTimeout(250);
      const plochaInputF = page.locator('text=Podlahová plocha').locator('xpath=following::input[1]');
      await plochaInputF.fill(String(p.plocha));
      await page.waitForTimeout(250);
      const q4f = page.locator('text=Postihla vašu nehnuteľnosť').locator('xpath=following::label[contains(.,"Nie")][1]');
      await q4f.click().catch(() => {});
      const q5f = page.locator('text=Je nehnuteľnosť trvalo obývaná').locator('xpath=following::label[contains(.,"Áno")][1]');
      await q5f.click().catch(() => {});
      const q6f = page.locator('text=Slúži daná nehnuteľnosť').locator('xpath=following::label[contains(.,"Nie")][1]');
      await q6f.click().catch(() => {});
      await page.waitForTimeout(400);
    }

    await page.screenshot({ path: `${outDir}/${profileId}-step4-filled.png`, fullPage: true });
    await page.getByText('Pokračovať', { exact: true }).click();
    await page.waitForTimeout(2500);
    log('step5 url:', page.url());
    // "Návrh poistnej sumy domácnosti" - override recommended household sum
    const homeSumInput = page.locator('input').first();
    await homeSumInput.click({ clickCount: 3 });
    await page.keyboard.press('Backspace');
    await homeSumInput.type(String(p.suma_domacnost), { delay: 60 });
    await page.waitForTimeout(400);
    await page.getByText('Pokračovať', { exact: true }).click();
    await page.waitForTimeout(2500);
    log('step6 url:', page.url());
    await page.screenshot({ path: `${outDir}/${profileId}-step6.png`, fullPage: true });
    fs.writeFileSync(`${outDir}/${profileId}-step6.html`, await page.content());

    await page.getByText('Pokračovať na balíčky', { exact: true }).click();
    await page.waitForTimeout(2500);
    log('step7 url:', page.url());
    await page.screenshot({ path: `${outDir}/${profileId}-step7.png`, fullPage: true });
    fs.writeFileSync(`${outDir}/${profileId}-step7.html`, await page.content());

    // "Vyberte si balíček poistenia" - package comparison table (Standard/Comfort/Exclusive) with inline sum editing
    let odporucanaSuma = await page.locator('text=Poistná suma nehnuteľnosti').locator('xpath=following::div[contains(@class,"") ][1]').innerText().catch(() => null);
    const estateSumText = await page.locator('text=/^\\d[\\d\\s]*\\s*€$/').first().innerText().catch(() => null);
    log('odporúčaná poistná suma nehnuteľnosť (raw):', estateSumText);
    odporucanaSuma = estateSumText ? estateSumText.replace(/[^\d]/g, '') : null;

    await page.getByText('Upraviť poistnú sumu', { exact: true }).first().click();
    await page.waitForTimeout(800);
    const modalInput = page.locator('input:visible').first();
    await modalInput.click({ clickCount: 3 });
    await page.keyboard.press('Backspace');
    await modalInput.type(String(p.suma_nehnutelnost), { delay: 60 });
    await page.waitForTimeout(300);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(300);
    await page.locator('div.content:visible', { hasText: 'Uložiť a zavrieť' }).click();
    await page.waitForTimeout(1500);

    // switch to "Poistenie domácnosti" tab and set its sum too
    await page.getByText('Poistenie domácnosti', { exact: true }).click({ force: true });
    await page.waitForTimeout(1200);
    await page.getByText('Upraviť poistnú sumu', { exact: true }).first().click();
    await page.waitForTimeout(800);
    const modalInput2 = page.locator('input:visible').first();
    await modalInput2.click({ clickCount: 3 });
    await page.keyboard.press('Backspace');
    await modalInput2.type(String(p.suma_domacnost), { delay: 60 });
    await page.waitForTimeout(300);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(300);
    await page.locator('div.content:visible', { hasText: 'Uložiť a zavrieť' }).click();
    await page.waitForTimeout(1500);

    // back to "Poistenie nehnuteľnosti" tab to read final package table
    await page.getByText('Poistenie nehnuteľnosti', { exact: true }).click({ force: true });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${outDir}/${profileId}-final-table.png`, fullPage: true });
    fs.writeFileSync(`${outDir}/${profileId}-final-table.html`, await page.content());

    const packages = ['Standard', 'Comfort', 'Exclusive'];
    const fullText = await page.innerText('body');
    const block = fullText.slice(fullText.indexOf('Celkové ročné poistenie po zľave'));
    const priceMatches = [...block.matchAll(/([\d\s]+,\d{2})\s*€/g)].map(m => m[1].replace(/\s/g, ''));
    // pattern per package: [discounted, original] repeated 3x
    const prices = [priceMatches[0], priceMatches[2], priceMatches[4]];
    log('package prices (Standard/Comfort/Exclusive):', JSON.stringify(prices));

    const coverageByPackage = {
      Standard: ['Požiar', 'Živel', 'Voda z vodovodného zariadenia', 'Povodeň a záplava', 'Spodná voda', 'Poškodenie vecí skratom', 'Zodpovednosť z vlastníctva a/alebo prenájmu nehnuteľnosti (50 000 €)', 'Asistenčné služby'],
      Comfort: ['Požiar', 'Živel', 'Voda z vodovodného zariadenia', 'Povodeň a záplava', 'Spodná voda', 'Poškodenie vecí skratom', 'Zodpovednosť z vlastníctva a/alebo prenájmu nehnuteľnosti (100 000 €)', 'Asistenčné služby'],
      Exclusive: ['Požiar', 'Živel', 'Voda z vodovodného zariadenia', 'Povodeň a záplava', 'Spodná voda', 'Poškodenie vecí skratom', 'Zodpovednosť z vlastníctva a/alebo prenájmu nehnuteľnosti (200 000 €)', 'Asistenčné služby'],
    };
    const results = packages.map((pkg, i) => ({
      balik: pkg,
      spoluucast: '0 €',
      cena: prices[i],
      coverage: coverageByPackage[pkg],
      odporucana_suma_nehnutelnost: odporucanaSuma,
    }));
    fs.writeFileSync(`${outDir}/${profileId}-results.json`, JSON.stringify(results, null, 2));
    log('results:', JSON.stringify(results));

    await browser.close();
    return { odporucanaSuma, results };
  } catch (e) {
    await page.screenshot({ path: `${outDir}/${profileId}-ERROR.png`, fullPage: true }).catch(() => {});
    await browser.close();
    throw e;
  }
}

run(process.argv[2]).catch(e => { console.error('FATAL', e.message); process.exit(1); });
