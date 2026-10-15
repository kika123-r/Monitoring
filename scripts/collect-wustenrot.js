const { chromium } = require('/home/user/Monitoring/node_modules/playwright');
const fs = require('fs');

const CHROME_PATH = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const PROFILES = {
  'byt-bratislava': {
    kind: 'byt', ulica: 'Lietavská', cisloSupisne: '3095', cisloOrientacne: '9', cisloBytu: '9', poschodie: '7',
    obec: 'Bratislava', psc: '85106', rok: 1985, plocha: 65, prizemieAleboVrchne: false, mezonetovy: false,
    suma_nehnutelnost: 200000, suma_domacnost: 25000,
  },
  'byt-kosice': {
    kind: 'byt', ulica: 'Ostravská', cisloSupisne: '1014', cisloOrientacne: '12', cisloBytu: '12', poschodie: '4',
    obec: 'Košice', psc: '04001', rok: 1979, plocha: 39, prizemieAleboVrchne: false, mezonetovy: false,
    suma_nehnutelnost: 150000, suma_domacnost: 20000,
  },
  'dom-male-dvorniky': {
    kind: 'dom', ulica: 'Krátka', cisloSupisne: '389', cisloOrientacne: '10',
    obec: 'Malé Dvorníky', psc: '92901', rok: 2023, floorsEqual: false, plocha1: 48, plocha2: 47, pivnica: 0,
    suma_nehnutelnost: 200000, suma_domacnost: 25000,
  },
  'dom-vlckovce': {
    kind: 'dom', ulica: 'Vlčkovce', cisloSupisne: '447', cisloOrientacne: '447',
    obec: 'Vlčkovce', psc: '91923', rok: 2023, floorsEqual: true, plocha1: 55, pivnica: 0,
    suma_nehnutelnost: 300000, suma_domacnost: 30000,
    overCalculatorCap: true, // recommended + custom sum > 235 800 EUR cap -> online calculator refuses, requires branch visit
  },
};

const PACKAGES = ['Standard', 'Komfort', 'Premium'];
const SKUPINA2_LIMIT = { Standard: '5 000', Komfort: '7 500', Premium: '10 000' };

const SKUPINA1_TEXT = 'Požiar, priamy úder blesku, výbuch, pád lietadla, krupobitie, tiaž snehu alebo námrazy, zosuv pôdy, zrútenie skál alebo zemín, pád stromov, stožiarov a iných predmetov, pád lavín, výbuch sopky, zemetrasenie, víchrica, atmosférické zrážky, povodeň alebo záplava, implózia, nadzvuková vlna, náraz vozidla, dym (zadymenie), voda z vodovodných zariadení, spodná voda, spätné vystúpenie vody z kanalizácie, zmrznutie vody v meračoch';
const SKUPINA2_TEXT = 'Búrlivý vietor, nepriamy úder blesku, prepätie, podpätie alebo skrat, rozbitie skla, vandalizmus, sprejerstvo, odcudzenie, deštruktívna činnosť voľne žijúcich živočíchov, stavebný materiál, stavebné mechanizmy a náradie, vybrané veci na pozemku, náklady na odvrátenie a odpratanie škody';

async function runOnePackage(profileId, packageName) {
  const p = PROFILES[profileId];
  const outDir = '/home/user/Monitoring/insurers/wustenrot/capture';
  const log = (...a) => console.log(`[${profileId}/${packageName}]`, ...a);
  const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true, args: ['--disable-blink-features=AutomationControlled'] });
  const context = await browser.newContext({ viewport: { width: 1400, height: 1400 }, userAgent: UA, locale: 'sk-SK' });
  const page = await context.newPage();
  try {
    await page.goto('https://online.wuestenrot.sk/w-dobrom-domov/', { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(1500);
    await page.click('button:has-text("Súhlasím so všetkým")').catch(() => {});
    await page.waitForTimeout(500);
    await page.click('text=Chcem sa poistiť');
    await page.waitForTimeout(1500);

    await page.waitForSelector('.radio-tile');
    await page.locator('.radio-tile').nth(0).click({ force: true }); // Fyzická osoba
    await page.waitForTimeout(300);
    await page.click('button:has-text("Pokračovať")');

    await page.waitForSelector('.radio-tile');
    await page.locator('.radio-tile').nth(p.kind === 'byt' ? 1 : 0).click({ force: true }); // Byt / Rodinný dom
    await page.waitForTimeout(300);
    await page.click('button:has-text("Pokračovať")');

    await page.waitForSelector('.radio-tile');
    await page.locator('.radio-tile').nth(2).click({ force: true }); // Chcem poistiť obe
    await page.waitForTimeout(300);
    await page.click('button:has-text("Pokračovať")');
    await page.waitForTimeout(1000);

    await page.waitForSelector('#property-address-street', { timeout: 15000 });
    await page.fill('#property-address-street', p.ulica);
    const cadastralInputs = page.locator('#property-address-streetCadastralParcel');
    await cadastralInputs.nth(0).fill(p.cisloSupisne);
    await cadastralInputs.nth(1).fill(p.cisloOrientacne);
    await page.fill('#property-address-city', p.obec);
    await page.fill('#property-address-zip', p.psc);
    if (p.kind === 'byt') {
      await page.locator('text=Číslo bytu').locator('xpath=following::input[1]').first().fill(p.cisloBytu);
      await page.locator('text=Poschodie').locator('xpath=following::input[1]').first().fill(p.poschodie);
    }
    await page.waitForTimeout(500);
    await page.click('button:has-text("Pokračovať")');
    await page.waitForTimeout(1000);
    log('after address, url:', page.url());

    await page.waitForSelector('.body button:has-text("Nie")');
    await page.locator('.body button:has-text("Nie")').first().click({ force: true }); // podnikanie -> Nie
    await page.waitForTimeout(400);
    await page.click('button:has-text("Pokračovať")');
    await page.waitForTimeout(1000);

    if (p.kind === 'dom') {
      await page.getByText('Panel, tehla, pórobetónové tvárnice', { exact: false }).click({ force: true }).catch(() => {});
    }
    // "Nemám znalecký posudok" (let the calculator estimate the value)
    await page.waitForSelector('.radio-tile');
    await page.locator('.radio-tile').nth(0).click({ force: true });
    await page.waitForTimeout(300);
    await page.click('button:has-text("Pokračovať")');
    await page.waitForTimeout(1000);
    log('value-calc page url:', page.url());

    const rokInput = page.locator('text=V ktorom roku bola nehnuteľnosť skolaudovaná?').locator('xpath=following::input[1]').first();
    await rokInput.fill(String(p.rok));
    await page.waitForTimeout(300);

    if (p.kind === 'byt') {
      const nieBtns = page.locator('.body button:visible', { hasText: 'Nie' });
      if (!p.prizemieAleboVrchne) await nieBtns.nth(0).click({ force: true });
      await page.waitForTimeout(200);
      if (!p.mezonetovy) await nieBtns.nth(1).click({ force: true });
      await page.waitForTimeout(400);
      const plochaInput = page.locator('text=Plocha podlažia').locator('xpath=following::input[1]').first();
      await plochaInput.fill(String(p.plocha));
      await plochaInput.press('Tab'); // blur triggers the calculate-insurance-sum API call
    } else {
      const equalBtn = p.floorsEqual ? 'Áno' : 'Nie';
      await page.locator('.body button:visible', { hasText: equalBtn }).first().click({ force: true });
      await page.waitForTimeout(400);
      if (p.floorsEqual) {
        await page.locator('text=Aká je zastavaná plocha jedného podlažia?').locator('xpath=following::input[1]').first().fill(String(p.plocha1));
        await page.waitForTimeout(300);
        await page.locator('.counter-field button.primary').first().click(); // 2 floors
      } else {
        await page.locator('text=Plocha podlažia 1').locator('xpath=following::input[1]').first().fill(String(p.plocha1));
        await page.waitForTimeout(300);
        for (let i = 0; i < 5; i++) {
          await page.click('button:has-text("Pridať podlažie")', { force: true });
          await page.waitForTimeout(600);
          if (await page.locator('text=Plocha podlažia 2').count() > 0) break;
        }
        await page.waitForSelector('text=Plocha podlažia 2', { timeout: 10000 });
        await page.locator('text=Plocha podlažia 2').locator('xpath=following::input[1]').first().fill(String(p.plocha2));
      }
      await page.waitForTimeout(300);
      const pivnicaInput = page.locator('text=Pivnica').locator('xpath=following::input[1]').first();
      await pivnicaInput.fill(String(p.pivnica));
      await pivnicaInput.press('Tab'); // blur triggers the calculate-insurance-sum API call
    }
    await page.waitForSelector('text=Zvoľte si vlastnú', { timeout: 15000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${outDir}/${profileId}-${packageName}-value.png`, fullPage: true });

    const odporucanaBlock = await page.locator('text=Vašu nehnuteľnosť sme ocenili na poistnú sumu').locator('xpath=ancestor::div[1]').innerText().catch(() => '?');
    const odporucanaMatch = odporucanaBlock.match(/([\d][\d\s]*\d|\d)\s*€/);
    const odporucanaSuma = odporucanaMatch ? odporucanaMatch[1].replace(/\s/g, '') : '?';
    log('odporúčaná suma:', odporucanaSuma);

    if (p.overCalculatorCap) {
      await browser.close();
      return { capped: true, odporucanaSuma };
    }

    const overrideInput = page.locator('text=Zvoľte si vlastnú').locator('xpath=following::input[1]').first();
    await overrideInput.fill(String(p.suma_nehnutelnost));
    await page.waitForTimeout(500);
    await page.click('button:has-text("Pokračovať")');
    await page.waitForTimeout(1500);
    log('package-select url:', page.url());
    if (!page.url().includes('poistny-balik-nehnutelnosti')) {
      await page.screenshot({ path: `${outDir}/${profileId}-${packageName}-CAPPED.png`, fullPage: true });
      await browser.close();
      return { capped: true, odporucanaSuma };
    }

    await page.waitForTimeout(500);
    await page.locator(`text=${packageName} >> visible=true`).first().click({ force: true });
    await page.waitForTimeout(400);
    await page.click('button:has-text("Pokračovať")');
    await page.waitForTimeout(1000);

    await page.waitForSelector('text=0 €');
    await page.getByText('0 €', { exact: true }).first().click({ force: true }); // spoluucast nehnutelnost
    await page.waitForTimeout(400);
    await page.click('button:has-text("Pokračovať")');
    await page.waitForTimeout(1000);

    await page.click('button:has-text("Pokračovať")'); // domacnosti package auto-matches
    await page.waitForTimeout(1000);

    await page.waitForSelector('text=Na akú sumu chcete domácnosť poistiť?');
    await page.locator('text=Na akú sumu chcete domácnosť poistiť?').locator('xpath=following::input[1]').first().fill(String(p.suma_domacnost));
    await page.waitForTimeout(500);
    await page.click('button:has-text("Pokračovať")');
    await page.waitForTimeout(1000);

    await page.waitForSelector('.body input');
    await page.locator('.body input').first().fill('0949414398');
    await page.waitForTimeout(500);
    await page.click('button:has-text("Pokračovať")');
    await page.waitForTimeout(1000);

    await page.waitForSelector('.body input');
    await page.locator('.body input').first().fill('janko.mrkvicka@gmail.com');
    await page.waitForTimeout(500);
    await page.click('button:has-text("Pokračovať")');
    await page.waitForTimeout(1500);
    log('frekvencia-platby url:', page.url());

    await page.waitForSelector('text=Ide o kúpu nehnuteľnosti?');
    await page.getByText('Platba ročne', { exact: true }).click({ force: true });
    await page.waitForTimeout(300);
    await page.locator('button:right-of(:text("Ide o kúpu nehnuteľnosti?"))', { hasText: 'Nie' }).first().click({ force: true });
    await page.waitForTimeout(300);
    await page.locator('button:right-of(:text("Je nehnuteľnosť / domácnosť poistená"))', { hasText: 'Nie' }).first().click({ force: true });
    await page.waitForTimeout(500);

    const priceText = await page.locator('text=Platba ročne').locator('xpath=preceding::*[1]').innerText().catch(() => null);
    const priceMatch = priceText ? priceText.match(/([\d\s]+,\d{2})/) : null;
    const cena = priceMatch ? priceMatch[1].replace(/\s/g, '') : null;
    log('CENA (rocne):', cena);
    await page.screenshot({ path: `${outDir}/${profileId}-${packageName}-price.png`, fullPage: true });

    await browser.close();
    return { cena, odporucanaSuma };
  } catch (e) {
    await page.screenshot({ path: `${outDir}/${profileId}-${packageName}-ERROR.png`, fullPage: true }).catch(() => {});
    await browser.close();
    throw e;
  }
}

async function run(profileId) {
  const p = PROFILES[profileId];
  const outDir = '/home/user/Monitoring/insurers/wustenrot/capture';
  const results = [];

  if (p.overCalculatorCap) {
    const { odporucanaSuma } = await runOnePackage(profileId, 'Standard');
    fs.writeFileSync(`${outDir}/${profileId}-results.json`, JSON.stringify([], null, 2));
    fs.writeFileSync(`${outDir}/${profileId}-CAPPED-NOTE.txt`,
      `Poistná suma nehnuteľnosti (${p.suma_nehnutelnost} EUR) presahuje limit online kalkulačky ` +
      `W dobrom domov (235 800 EUR), nad ktorý poisťovňa vyžaduje individuálne ocenenie na pobočke. ` +
      `Odporúčaná (automaticky vypočítaná) suma bola ${odporucanaSuma} EUR. Cenu preto nebolo možné cez kalkulačku získať.`);
    console.log(`[${profileId}] OVER CAP - no online price available, odporucana=${odporucanaSuma}`);
    return;
  }

  for (const pkg of PACKAGES) {
    const r = await runOnePackage(profileId, pkg);
    results.push({
      balik: pkg,
      spoluucast: '0 €',
      cena: r.cena,
      limit: '150000',
      coverage: [SKUPINA1_TEXT, `${SKUPINA2_TEXT} (limit ${SKUPINA2_LIMIT[pkg]} €)`, 'Zodpovednosť z vlastníctva nehnuteľnosti / domácnosti a bežného občianskeho života (150 000 €)', 'Asistenčné služby v cene poistenia'],
      odporucana_suma_nehnutelnost: r.odporucanaSuma,
    });
  }
  fs.writeFileSync(`${outDir}/${profileId}-results.json`, JSON.stringify(results, null, 2));
  console.log(`[${profileId}] DONE`, JSON.stringify(results.map(r => [r.balik, r.cena])));
}

run(process.argv[2]).catch(e => { console.error('FATAL', e.message); process.exit(1); });
