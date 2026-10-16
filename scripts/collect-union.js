const { chromium } = require('/home/user/Monitoring/node_modules/playwright');
const fs = require('fs');

const CONTACT = { phone: '949414398', email: 'janko.mrkvicka@gmail.com' };
const CHROME_PATH = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const PROFILES = {
  'byt-bratislava': { type: 'FLAT', mestoQuery: 'Bratislava - Petržalka', mesto: 'Bratislava', ulica: 'Lietavská', cislo: '3095/9', psc: '85106', plocha: 65, rok: 1985, material: 'Panel', poschodie: 7, celkovePoschodi: 9, suma_nehnutelnost: 200000, suma_domacnost: 25000 },
  'byt-kosice': { type: 'FLAT', mestoQuery: 'Košice - Sever', mesto: 'Košice', ulica: 'Ostravská', cislo: '1014/12', psc: '04001', plocha: 39, rok: 1979, material: 'Panel', poschodie: 4, celkovePoschodi: 6, suma_nehnutelnost: 150000, suma_domacnost: 20000 },
  'dom-male-dvorniky': { type: 'HOUSE', mesto: 'Malé Dvorníky', ulica: 'Krátka', cislo: '389/10', psc: '92901', plocha: 95, rok: 2023, material: 'Tehla', strecha: 'šikmá', suma_nehnutelnost: 200000, suma_domacnost: 25000 },
  'dom-vlckovce': { type: 'HOUSE', mesto: 'Vlčkovce', ulica: 'Vlčkovce', cislo: '447', psc: '91923', plocha: 110, rok: 2023, material: 'Tehla', strecha: 'rovná', suma_nehnutelnost: 300000, suma_domacnost: 30000 },
};

async function run(profileId) {
  const p = PROFILES[profileId];
  const outDir = '/home/user/Monitoring/insurers/union/capture';
  const log = (...a) => console.log(`[${profileId}]`, ...a);
  const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1400 } });
  try {
    await page.goto('https://www.union.sk/poistenie-majetku-online/#/zakladne-informacie', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2000);
    const cookieBtns = await page.$$('button');
    for (const b of cookieBtns) { const t = await b.innerText().catch(() => ''); if (/súhlas|prijať|accept/i.test(t)) { await b.click().catch(() => {}); break; } }
    await page.waitForTimeout(500);

    await page.click(`input[value="${p.type}"]`, { force: true });
    await page.waitForTimeout(500);
    const groups = await page.$$('.uni-container.sc-union-true-false-switch');
    for (const g of groups) { const nieBtn = await g.$('button:has-text("Nie")'); if (nieBtn) await nieBtn.click(); }
    await page.waitForTimeout(500);
    await page.getByLabel('Pokračovať').click();
    await page.waitForTimeout(4000);
    log('step2 url:', page.url());

    await page.waitForSelector('input[placeholder="Zadajte PSČ"]', { timeout: 15000 });
    const mestoInput = page.locator('input[placeholder="Zadajte mesto"]');
    const mestoQuery = p.mestoQuery || p.mesto;
    await mestoInput.click();
    await mestoInput.type(mestoQuery, { delay: 90 });
    await page.waitForTimeout(1200);
    const mestoSuggestion = page.getByText(mestoQuery, { exact: true }).last();
    await mestoSuggestion.click().catch(() => log('no mesto suggestion to click'));
    await page.waitForTimeout(800);

    await page.fill('input[placeholder="Zadajte ulicu"]', p.ulica);

    if (p.type === 'FLAT') {
      await page.locator('input[placeholder="Zadajte celkový počet poschodí"]').locator('xpath=preceding::input[1]').fill(p.cislo.split('/')[0]);
      await page.fill('input[placeholder="Zadajte celkový počet poschodí"]', String(p.celkovePoschodi));
      const poschodieInput = page.locator('input[placeholder="Vyberte poschodie vášho bytu"]');
      await poschodieInput.click();
      await poschodieInput.type(String(p.poschodie), { delay: 100 });
      await page.waitForTimeout(900);
      await page.getByText(`${p.poschodie}. poschodie`, { exact: true }).click().catch(() => log('no poschodie suggestion'));
      await page.waitForTimeout(400);
      const cisloBytuInput = page.locator('input[placeholder="Zadajte PSČ"]').locator('xpath=preceding::input[1]');
      await cisloBytuInput.fill(p.cislo.split('/')[1] || p.cislo.split('/')[0]);
    } else {
      const cisloInput = page.locator('input[placeholder="Zadajte PSČ"]').locator('xpath=preceding::input[1]');
      await cisloInput.fill(p.cislo.split('/')[0]);
    }

    let pscVal = await page.locator('input[placeholder="Zadajte PSČ"]').inputValue();
    log('PSC after mesto selection:', pscVal);
    if (!pscVal) {
      const pscInput = page.locator('input[placeholder="Zadajte PSČ"]');
      await pscInput.click();
      await pscInput.type(p.psc, { delay: 90 });
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${outDir}/${profileId}-psc-typing.png`, fullPage: true });
      const pscSuggestion = page.getByText(p.psc, { exact: false }).last();
      await pscSuggestion.click().catch(() => log('no psc suggestion to click'));
      await page.waitForTimeout(600);
      pscVal = await pscInput.inputValue();
      log('PSC after suggestion click:', pscVal);
    }
    await page.waitForTimeout(400);
    const villageGroup = await page.$('.uni-container.sc-union-true-false-switch');
    if (villageGroup) { const anoBtn = await villageGroup.$('button:has-text("Áno")'); if (anoBtn) await anoBtn.click(); }
    await page.fill('input[placeholder="XXX XXX XXX"]', CONTACT.phone);
    await page.fill('input[placeholder="Napíšte svoj e-mail"]', CONTACT.email);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${outDir}/${profileId}-step2.png`, fullPage: true });
    const preContinueInvalids = await page.$$eval('.uni-input-container[aria-invalid="true"], [aria-invalid="true"]', els => els.length);
    log('invalid-looking fields before step2 continue:', preContinueInvalids);

    await page.getByText('Pokračovať', { exact: true }).click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${outDir}/${profileId}-step2-after-continue.png`, fullPage: true });
    await page.waitForTimeout(2500);
    log('step3 url:', page.url());

    // step 3: Informácie o dome/byte
    const allGroups3 = await page.$$('.uni-container.sc-union-true-false-switch');
    // "Je dom/byt v rekonštrukcii?" -> Nie (first group on this page)
    if (allGroups3[0]) { const n = await allGroups3[0].$('button:has-text("Nie")'); if (n) await n.click(); }
    await page.waitForTimeout(400);

    const dds = await page.$$('union-select');

    if (p.type === 'HOUSE') {
      await dds[0].click();
      await page.waitForTimeout(500);
      await page.getByText('Samostatný rodinný dom', { exact: true }).click();
      await page.waitForTimeout(400);

      await page.fill('#estate-area', String(p.plocha));

      await page.getByText('0 záplav', { exact: true }).click();
      await page.getByText('0 škôd', { exact: true }).click();
      await page.waitForTimeout(400);

      await dds[1].click();
      await page.waitForTimeout(500);
      await page.getByText('Murovaná', { exact: true }).click();
      await page.waitForTimeout(400);

      await page.getByText(p.strecha === 'šikmá' ? 'Sedlová' : 'Plochá', { exact: true }).click();
      await page.waitForTimeout(400);
    } else {
      // FLAT: "Z akého materiálu je byt postavený?" dropdown (first union-select on this step), then plocha
      log('union-select count on FLAT step3:', dds.length);
      await dds[0].click();
      await page.waitForTimeout(500);
      await page.getByText(p.material, { exact: true }).click();
      await page.waitForTimeout(400);

      await dds[1].click();
      await page.waitForTimeout(500);
      await page.getByText('Pôvodný stav', { exact: true }).click();
      await page.waitForTimeout(400);

      const plochaInput = page.locator('text=/podlahová plocha/i').first().locator('xpath=following::input[1]');
      await plochaInput.fill(String(p.plocha));
      await page.waitForTimeout(400);

      await page.getByText('0 záplav', { exact: true }).click();
      await page.getByText('0 škôd', { exact: true }).click();
      await page.waitForTimeout(400);
      const garazGroups = await page.$$('.uni-container.sc-union-true-false-switch');
      // groups order: [0]=rekonstrukcia(already Nie), [1]=garazovy box, [2]=historicka hodnota
      if (garazGroups[1]) { const n = await garazGroups[1].$('button:has-text("Nie")'); if (n) await n.click(); }
      await page.waitForTimeout(400);
    }

    const allGroups3b = await page.$$('.uni-container.sc-union-true-false-switch');
    const histGroup = allGroups3b[allGroups3b.length - 1];
    if (histGroup) { const n = await histGroup.$('button:has-text("Nie")'); if (n) await n.click(); }
    await page.waitForTimeout(400);

    await page.screenshot({ path: `${outDir}/${profileId}-step3.png`, fullPage: true });
    fs.writeFileSync(`${outDir}/${profileId}-step3.html`, await page.content());

    await page.getByText('Pokračovať', { exact: true }).click();
    await page.waitForTimeout(2500);
    log('step4 url:', page.url());

    // step 4: Poistná suma nehnuteľnosti (prefilled with Union's own recommendation)
    const estateSumInput = page.locator('input').first();
    const odporucanaSuma = (await estateSumInput.inputValue()).replace(/\s/g, '');
    log('odporúčaná poistná suma nehnuteľnosť:', odporucanaSuma);
    // .fill() sets the value atomically; typing char-by-char into this masked
    // field can scramble the digits (confirmed bug elsewhere, e.g. Generali).
    await estateSumInput.fill(String(p.suma_nehnutelnost));
    await page.waitForTimeout(500);
    log('estate sum input value after fill:', await estateSumInput.inputValue().catch(() => '?'));
    await page.screenshot({ path: `${outDir}/${profileId}-step4.png`, fullPage: true });

    await page.getByText('Pokračovať', { exact: true }).click();
    await page.waitForTimeout(2500);
    log('step5 url:', page.url());

    // step 5: Poistná suma domácnosti
    await page.fill('input[type="text"]', String(p.suma_domacnost));
    await page.waitForTimeout(400);
    await page.getByText('Pokračovať', { exact: true }).click();
    await page.waitForTimeout(2500);
    log('step6 url:', page.url());
    // step 6: Cena poistenia a poistné riziká - select deductible 0 EUR, capture base-only price, then all-addons price
    await page.click('input[value="DEDUCTIBLE_0"]', { force: true });
    await page.waitForTimeout(1200);
    let bodyText = await page.innerText('body');
    let zakladneMatch = bodyText.match(/Celkom\s*\n([\d\s]+,\d{2})\s*€/);
    const zakladneCena = zakladneMatch ? zakladneMatch[1].replace(/\s/g, '') : null;
    log('Základné riziká cena (0 EUR spoluúčasť):', zakladneCena);
    await page.screenshot({ path: `${outDir}/${profileId}-step6-zakladne.png`, fullPage: true });

    await page.getByText('Pridať všetky pripoistenia', { exact: true }).click();
    await page.waitForTimeout(1200);
    bodyText = await page.innerText('body');
    let kompletMatch = bodyText.match(/Celkom\s*\n([\d\s]+,\d{2})\s*€/);
    const kompletCena = kompletMatch ? kompletMatch[1].replace(/\s/g, '') : null;
    log('Komplet (všetky pripoistenia) cena:', kompletCena);
    await page.screenshot({ path: `${outDir}/${profileId}-step6-komplet.png`, fullPage: true });
    fs.writeFileSync(`${outDir}/${profileId}-step6.html`, await page.content());

    const results = [
      { balik: 'Základné riziká', spoluucast: '0 €', cena: zakladneCena, coverage: ['Požiar, výbuch, víchrica, krupobitie, priamy úder blesku, pád lietadla, imlózia', 'Asistenčné služby 24/7'] },
      { balik: 'Komplet (všetky pripoistenia)', spoluucast: '0 €', cena: kompletCena, coverage: ['Základné riziká', 'Prírodné katastrofy', 'Ostatné živelné riziká', 'Škody z vody', 'Ľudská zlomyseľnosť (krádež, vandalizmus, rozbitie skla)', 'Drobnosti pre domácnosť', 'Drobnosti pre nehnuteľnosť', 'Skrat'] },
    ];
    fs.writeFileSync(`${outDir}/${profileId}-results.json`, JSON.stringify(results.map(r => ({ ...r, odporucana_suma_nehnutelnost: odporucanaSuma, limit: '' })), null, 2));

    await browser.close();
    return { odporucanaSuma, zakladneCena, kompletCena };
  } catch (e) {
    await page.screenshot({ path: `${outDir}/${profileId}-ERROR.png`, fullPage: true }).catch(() => {});
    await browser.close();
    throw e;
  }
}

run(process.argv[2]).catch(e => { console.error('FATAL', e.message); process.exit(1); });
