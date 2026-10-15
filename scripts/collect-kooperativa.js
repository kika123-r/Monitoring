const { chromium } = require('/home/user/Monitoring/node_modules/playwright');
const fs = require('fs');

const CHROME_PATH = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const PROFILES = {
  'byt-bratislava': { kind: 'byt', plocha: 65, rok: 1985, suma_nehnutelnost: 200000, suma_domacnost: 25000 },
  'byt-kosice': { kind: 'byt', plocha: 39, rok: 1979, suma_nehnutelnost: 150000, suma_domacnost: 20000 },
  'dom-male-dvorniky': { kind: 'dom', prizemie: 48, ostatne: 47, rok: 2023, suma_nehnutelnost: 200000, suma_domacnost: 25000 },
  'dom-vlckovce': { kind: 'dom', prizemie: 55, ostatne: 55, rok: 2023, suma_nehnutelnost: 300000, suma_domacnost: 30000 },
};

async function run(profileId) {
  const p = PROFILES[profileId];
  const outDir = '/home/user/Monitoring/insurers/kooperativa/capture';
  const log = (...a) => console.log(`[${profileId}]`, ...a);
  const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true, args: ['--disable-blink-features=AutomationControlled'] });
  const context = await browser.newContext({ viewport: { width: 1400, height: 1400 }, userAgent: UA, locale: 'sk-SK' });
  const page = await context.newPage();
  try {
    await page.goto('https://online.koop.sk/poistenie-majetku/#/uvod', { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(2000);

    const typeLabel = p.kind === 'byt' ? 'Byt' : 'Rodinný dom';
    await page.getByText(typeLabel, { exact: true }).click({ force: true });
    await page.waitForTimeout(800);
    await page.getByText('Nie', { exact: true }).click({ force: true }); // nie je vo vystavbe
    await page.waitForTimeout(800);
    await page.locator('text=Uveďte rok kolaudácie').locator('xpath=following::input[1]').first().fill(String(p.rok));
    await page.waitForTimeout(400);
    await page.getByText('Pokračovať', { exact: false }).first().click({ force: true });
    await page.waitForTimeout(1500);
    log('step1 (kontakt) url:', page.url());

    await page.fill('input[placeholder="email@email.sk"]', 'janko.mrkvicka@gmail.com');
    await page.fill('input[placeholder="+421900123456"]', '+421949414398');
    await page.getByText('Nie', { exact: true }).click({ force: true }); // podnikanie/prenajom -> Nie
    await page.waitForTimeout(500);
    await page.getByText('Pokračovať', { exact: false }).first().click({ force: true });
    await page.waitForTimeout(1500);
    log('step2 url:', page.url());

    if (p.kind === 'dom') {
      await page.getByText('Panel, tehla, pórobetónové tvárnice', { exact: true }).click({ force: true });
      await page.waitForTimeout(500);
      await page.getByText('Pokračovať', { exact: false }).first().click({ force: true });
      await page.waitForTimeout(1500);
      log('step3 (material) url:', page.url());

      await page.locator('text=1. podlažie').locator('xpath=following::input[1]').first().fill(String(p.prizemie));
      await page.locator('text=2. (a ďalšie) podlažie').locator('xpath=following::input[1]').first().fill(String(p.ostatne));
    } else {
      await page.locator('text=Celková plocha bytu').locator('xpath=following::input[1]').first().fill(String(p.plocha));
    }
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${outDir}/${profileId}-plocha.png`, fullPage: true });
    await page.getByText('Pokračovať', { exact: false }).first().click({ force: true });
    await page.waitForTimeout(2000);
    log('step4 (poistna suma) url:', page.url());

    const buildingInput = page.locator('#buildingInsuranceAmount-price');
    const householdInput = page.locator('#householdInsuranceAmount-price');
    const odporucanaNehnutelnost = (await buildingInput.inputValue()).replace(/[^\d]/g, '');
    const odporucanaDomacnost = (await householdInput.inputValue()).replace(/[^\d]/g, '');
    log('odporúčaná suma nehnuteľnosť:', odporucanaNehnutelnost, 'domácnosť:', odporucanaDomacnost);

    await buildingInput.click({ clickCount: 3 });
    await page.keyboard.press('Backspace');
    await buildingInput.type(String(p.suma_nehnutelnost), { delay: 50 });
    await page.keyboard.press('Tab');
    await householdInput.click({ clickCount: 3 });
    await page.keyboard.press('Backspace');
    await householdInput.type(String(p.suma_domacnost), { delay: 50 });
    await page.keyboard.press('Tab');
    await page.waitForTimeout(500);
    await page.getByText('Pokračovať', { exact: false }).first().click({ force: true });
    await page.waitForTimeout(2500);
    log('step5 (ponuka) url:', page.url());
    await page.screenshot({ path: `${outDir}/${profileId}-offer.png`, fullPage: true });
    fs.writeFileSync(`${outDir}/${profileId}-offer.html`, await page.content());

    // 3 fixed tiers, all visible on one page via tab buttons
    const tabs = [
      { id: '#tab-prima', name: 'Prima' },
      { id: '#tab-optimum', name: 'Optimum' },
      { id: '#tab-excelent', name: 'Excelent' },
    ];
    const results = [];
    for (const tab of tabs) {
      await page.click(tab.id);
      await page.waitForTimeout(1000);
      const priceText = await page.locator(`${tab.id} .price`).innerText();
      const priceMatch = priceText.match(/([\d\s]+,\d{2})/);
      const cena = priceMatch ? priceMatch[1].replace(/\s/g, '').replace(/ /g, '') : null;

      const coverage = await page.$$eval('tr.coverage-item', rows => rows
        .map(r => {
          const label = r.querySelector('th')?.textContent.trim();
          const tds = Array.from(r.querySelectorAll('td.coverage-status'));
          const buildingCovered = tds[0] ? tds[0].classList.contains('available') : false;
          return { label, buildingCovered };
        })
        .filter(x => x.label && x.buildingCovered)
        .map(x => x.label)
      ).catch(() => []);

      results.push({ balik: tab.name, spoluucast: '0 €', cena, coverage, odporucana_suma_nehnutelnost: odporucanaNehnutelnost });
      log(tab.name, '->', cena, 'coverage items:', coverage.length);
    }

    fs.writeFileSync(`${outDir}/${profileId}-results.json`, JSON.stringify(results, null, 2));

    await browser.close();
    return results;
  } catch (e) {
    await page.screenshot({ path: `${outDir}/${profileId}-ERROR.png`, fullPage: true }).catch(() => {});
    fs.writeFileSync(`${outDir}/${profileId}-ERROR.html`, await page.content().catch(() => '')).catch?.(() => {});
    await browser.close();
    throw e;
  }
}

run(process.argv[2]).catch(e => { console.error('FATAL', e.message); process.exit(1); });
