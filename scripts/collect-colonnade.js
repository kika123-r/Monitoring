const { chromium } = require('/home/user/Monitoring/node_modules/playwright');
const fs = require('fs');

const CONTACT = { phone: '0949414398', email: 'janko.mrkvicka@gmail.com' };
const CHROME_PATH = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const GID = '706e98666419c22a962070061c6ef89f9ab5a8081c240becc7a90902470fddbf';

const PROFILES = {
  'byt-bratislava': {
    type: 'FLAT', plocha: 65, material: 'Betón', mesto: 'Bratislava', ulica: 'Lietavská', cislo: '3095/9', psc: '85106',
    suma_nehnutelnost: 200000, suma_domacnost: 25000,
  },
  'byt-kosice': {
    type: 'FLAT', plocha: 39, material: 'Betón', mesto: 'Košice', ulica: 'Ostravská', cislo: '1014/12', psc: '04001',
    suma_nehnutelnost: 150000, suma_domacnost: 20000,
  },
  'dom-male-dvorniky': {
    type: 'HOUSE', plocha: 95, material: 'Tehla', mesto: 'Malé Dvorníky', ulica: 'Krátka', cislo: '389/10', psc: '92901',
    suma_nehnutelnost: 200000, suma_domacnost: 25000,
  },
  'dom-vlckovce': {
    type: 'HOUSE', plocha: 110, material: 'Tehla', mesto: 'Vlčkovce', ulica: 'Vlčkovce', cislo: '447', psc: '91923',
    suma_nehnutelnost: 300000, suma_domacnost: 30000,
  },
};

async function run(profileId) {
  const p = PROFILES[profileId];
  const outDir = '/home/user/Monitoring/insurers/colonnade/capture';
  const log = (...a) => console.log(`[${profileId}]`, ...a);
  const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1400 } });
  try {
    await page.goto(`https://hh.colonnade.sk/formular?type=${p.type}&gid=${GID}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2000);

    await page.selectOption('select[name="est_standard"]', 'Štandard');
    await page.selectOption('select[name="hh_standard"]', 'Štandard');
    await page.fill('input[placeholder="Napr. 144"]', String(p.plocha));
    await page.selectOption('select[name="InGoodCondition"]', 'áno');
    await page.selectOption('select[name="HouseholdState"]', 'dokončená');
    await page.selectOption('select[name="EstateMaterial"]', p.material);
    await page.selectOption('select[name="WasFlooded"]', 'nie');
    await page.selectOption('select[name="HasBurglarAlarm"]', 'nie');
    await page.selectOption('select[name="HasFireAlarm"]', 'nie');
    await page.selectOption('select[name="HasWaterAlarm"]', 'nie');
    await page.fill('#StreetName', p.ulica);
    await page.fill('#StreetNumber', p.cislo.split('/')[0]);
    await page.fill('#PostCode', p.psc);
    await page.fill('#CityName', p.mesto);
    await page.fill('#EstInsuredAmount', String(p.suma_nehnutelnost));
    await page.fill('#HomeInsuredAmount', String(p.suma_domacnost));
    await page.fill('#ph_mobile_number', CONTACT.phone);
    await page.fill('#ph_email', CONTACT.email);

    await page.getByText('VYPOČÍTAŤ POISTNÉ', { exact: false }).click();
    await page.waitForTimeout(3000);
    log('url after submit:', page.url());
    if (!page.url().includes('/cena')) throw new Error('did not reach price page');

    await page.selectOption('select[name="global_liability"]', '200 000 €');
    await page.selectOption('select[name="global_deductible"]', '0 €');
    await page.waitForTimeout(2000);

    const rows = await page.$$eval('.table-row', trs => trs.map(tr => {
      const cells = Array.from(tr.querySelectorAll(':scope > .cell'));
      const label = cells[0] ? cells[0].innerText.trim().replace(/\s+/g, ' ') : '';
      const states = cells.slice(1).map(c => {
        const icon = c.querySelector('i.fa-check, i.fa-times');
        if (icon) return icon.classList.contains('fa-check') ? 'YES' : 'NO';
        const btn = c.innerText.trim();
        return btn || '';
      });
      return [label, ...states];
    }));

    // only keep 3-column rows (per-package coverage rows), ignore 1-col description/summary rows, dedupe by label
    const seen = new Set();
    const coverageRows = [];
    for (const r of rows) {
      if (r.length === 4 && !seen.has(r[0])) {
        seen.add(r[0]);
        coverageRows.push(r);
      }
    }
    log('coverage rows:', JSON.stringify(coverageRows));

    const priceTexts = await page.$$eval('.cena, [class*="cena"]', els => els.map(e => e.innerText.trim())).catch(() => []);
    const fullText = await page.innerText('body');
    const priceBlockMatch = fullText.match(/Cena\s*\n\s*([\d.,]+)\s*€\s*\n\s*Cena\s*\n\s*([\d.,]+)\s*€\s*\n\s*Cena\s*\n\s*([\d.,]+)\s*€/);
    log('priceBlockMatch:', priceBlockMatch ? priceBlockMatch.slice(1,4) : 'NOT FOUND');

    const packages = ['GOLD', 'SILVER', 'BRONZE'];
    const prices = priceBlockMatch ? priceBlockMatch.slice(1,4) : [null,null,null];

    const coverageByPkg = { GOLD: [], SILVER: [], BRONZE: [] };
    for (const row of coverageRows) {
      const [label, g, s, b] = row;
      const vals = { GOLD: g, SILVER: s, BRONZE: b };
      for (const pkg of packages) {
        const v = vals[pkg];
        if (v === 'YES' || v === 'Odobrať') coverageByPkg[pkg].push(label);
      }
    }

    const results = packages.map((pkg, i) => ({
      balik: pkg.charAt(0) + pkg.slice(1).toLowerCase(),
      spoluucast: '0 €',
      cena: prices[i],
      limit: '200000',
      coverage: coverageByPkg[pkg],
    }));

    fs.writeFileSync(`${outDir}/${profileId}-results.json`, JSON.stringify(results, null, 2));
    await page.screenshot({ path: `${outDir}/${profileId}-final.png`, fullPage: true });
    log('DONE', JSON.stringify(results.map(r => [r.balik, r.cena])));

    await browser.close();
    return results;
  } catch (e) {
    await page.screenshot({ path: `${outDir}/${profileId}-ERROR.png`, fullPage: true }).catch(() => {});
    await browser.close();
    throw e;
  }
}

run(process.argv[2]).catch(e => { console.error('FATAL', e.message); process.exit(1); });
