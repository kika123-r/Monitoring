const { chromium } = require('/home/user/Monitoring/node_modules/playwright');
const fs = require('fs');

const CONTACT = { phone: '949414398', email: 'janko.mrkvicka@gmail.com', meno: 'Janko', priezvisko: 'Mrkvička' };
const CHROME_PATH = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const PROFILES = {
  'byt-bratislava': { type: 'Byt', plocha: 65, rok: 1985, suma_nehnutelnost: 200000, suma_domacnost: 25000 },
  'byt-kosice': { type: 'Byt', plocha: 39, rok: 1979, suma_nehnutelnost: 150000, suma_domacnost: 20000 },
  'dom-male-dvorniky': { type: 'Dom', prizemie: 48, ostatne: 47, rok: 2023, suma_nehnutelnost: 200000, suma_domacnost: 25000 },
  'dom-vlckovce': { type: 'Dom', prizemie: 55, ostatne: 55, rok: 2023, suma_nehnutelnost: 300000, suma_domacnost: 30000 },
};

async function run(profileId) {
  const p = PROFILES[profileId];
  const outDir = '/home/user/Monitoring/insurers/komunalna/capture';
  const log = (...a) => console.log(`[${profileId}]`, ...a);
  const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true, args: ['--disable-blink-features=AutomationControlled'] });
  const context = await browser.newContext({ viewport: { width: 1400, height: 1400 }, userAgent: UA, locale: 'sk-SK' });
  const page = await context.newPage();
  try {
    await page.goto('https://online.kpas.sk/poistenie-majetku/#/co-chcete-poistit', { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(2000);
    await page.click('button:has-text("Akceptovať všetky cookies")').catch(() => {});
    await page.waitForTimeout(500);
    await page.getByText(p.type, { exact: true }).click({ force: true });
    await page.waitForTimeout(1200);
    await page.getByText('Pokračovať', { exact: false }).first().click({ force: true });
    await page.waitForTimeout(1500);
    log('step1 url:', page.url());

    await page.getByText('Áno', { exact: true }).first().click({ force: true }); // obývaná 183+ dní
    await page.waitForTimeout(500);
    await page.getByText('Nie', { exact: true }).nth(1).click({ force: true }); // podnikanie/prenájom -> Nie
    await page.waitForTimeout(500);
    const materialLabel = p.type === 'Byt' ? 'Murované / Kombinované (iné) vyhotovenie' : 'Nehorľavé vyhotovenie';
    await page.getByText(materialLabel, { exact: true }).click({ force: true });
    await page.waitForTimeout(500);
    await page.getByText('Nie', { exact: true }).nth(2).click({ force: true }); // povodeň 2x -> Nie
    await page.waitForTimeout(500);
    const rokInput = page.locator('text=Uveďte rok kolaudácie').locator('xpath=following::input[1]').first();
    await rokInput.fill(String(p.rok));
    await page.waitForTimeout(200);

    if (p.type === 'Byt') {
      const plochaInput = page.locator('text=Uveďte plochu nehnuteľnosti').locator('xpath=following::input[1]').first();
      await plochaInput.fill(String(p.plocha));
    } else {
      const pivnicaInput = page.locator('text=Pivnica').locator('xpath=following::input[1]').first();
      await pivnicaInput.fill('0');
      const prizemieInput = page.locator('text=Prízemie').locator('xpath=following::input[1]').first();
      await prizemieInput.fill(String(p.prizemie));
      const ostatneInput = page.locator('text=Ostatné podlažia spolu').locator('xpath=following::input[1]').first();
      await ostatneInput.fill(String(p.ostatne));
      const podkrovieInput = page.locator('text=Podkrovie').locator('xpath=following::input[1]').first();
      await podkrovieInput.fill('0');
    }
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${outDir}/${profileId}-step1-filled.png`, fullPage: true });

    await page.getByText('Pokračovať', { exact: false }).first().click({ force: true });
    await page.waitForTimeout(2000);
    log('step2 url:', page.url());

    // "Poistná suma — nehnuteľnosť" (recommended, then override)
    const estSumInput = page.locator('text=Poistná suma').locator('xpath=following::input[1]').first();
    const odporucanaSuma = (await estSumInput.inputValue()).replace(/\s/g, '');
    log('odporúčaná poistná suma nehnuteľnosť:', odporucanaSuma);
    await estSumInput.click({ clickCount: 3 });
    await page.keyboard.press('Backspace');
    await estSumInput.type(String(p.suma_nehnutelnost), { delay: 60 });
    await page.waitForTimeout(400);
    await page.getByText('Pokračovať', { exact: false }).first().click({ force: true });
    await page.waitForTimeout(2000);
    log('step3 url:', page.url());
    await page.screenshot({ path: `${outDir}/${profileId}-step3.png`, fullPage: true });
    fs.writeFileSync(`${outDir}/${profileId}-step3.html`, await page.content());

    // "Vyberte si variant poistenia" offer page - 3 tiers: Zivel, Optimum, Excelent
    // deductible is a custom combobox (button + hidden <ul> listbox), not a native <select>
    await page.click('#deductible-control');
    await page.waitForTimeout(500);
    const deductibleOpts = await page.locator('#deductible-listbox li').allTextContents().catch(() => []);
    log('deductible options:', JSON.stringify(deductibleOpts));
    if (deductibleOpts.some(o => o.includes('0 €'))) {
      await page.locator('#deductible-listbox li', { hasText: '0 €' }).first().click();
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(800);

    const tabIds = { 'Živel': '#tab-ZIVEL', 'Optimum': '#tab-OPTIMUM', 'Excelent': '#tab-EXCELENT' };
    const packages = ['Živel', 'Optimum', 'Excelent'];
    const results = [];
    for (const pkg of packages) {
      await page.click(tabIds[pkg]);
      await page.waitForTimeout(1000);
      const bodyTextPkg = await page.innerText('body');
      const priceMatch = bodyTextPkg.match(/Vaša cena:\s*([\d\s]+,\d{2})\s*€/);
      const coverage = await page.$$eval('.coverage-item', els => els
        .map(e => ({ label: e.querySelector('.item')?.textContent.trim(), included: /Zahrnuté v balíku/.test(e.querySelector('.visually-hidden')?.textContent || '') }))
        .filter(x => x.label && x.included)
        .map(x => x.label)
      ).catch(() => []);
      results.push({ balik: pkg, spoluucast: '0 €', cena: priceMatch ? priceMatch[1].replace(/\s/g, '') : null, coverage });
      log(pkg, '->', priceMatch ? priceMatch[1] : 'PRICE NOT FOUND');
    }
    fs.writeFileSync(`${outDir}/${profileId}-results.json`, JSON.stringify(results.map(r => ({ ...r, odporucana_suma_nehnutelnost: odporucanaSuma })), null, 2));
    await page.screenshot({ path: `${outDir}/${profileId}-offer.png`, fullPage: true });

    await browser.close();
    return { odporucanaSuma, results };
  } catch (e) {
    await page.screenshot({ path: `${outDir}/${profileId}-ERROR.png`, fullPage: true }).catch(() => {});
    await browser.close();
    throw e;
  }
}

run(process.argv[2]).catch(e => { console.error('FATAL', e.message); process.exit(1); });
