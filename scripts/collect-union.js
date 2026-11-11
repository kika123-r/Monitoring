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
    // "Čo chcete poistiť?" pill group added ~2026-10-30 - select both Nehnuteľnosť
    // and Domácnosť (we always price both together); without this the form fails
    // validation and "Pokračovať" silently stays on step 1.
    const targetGroup = page.locator('#insurance-target-group');
    if (await targetGroup.count()) {
      await targetGroup.getByText('Nehnuteľnosť', { exact: true }).click();
      await page.waitForTimeout(200);
      await targetGroup.getByText('Domácnosť', { exact: true }).click();
      await page.waitForTimeout(300);
    }
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
    // As of ~2026-11-01 the address step has a single combined "Súpisné / orientačné
    // číslo" field (floor-count/apartment-floor/apartment-number moved to step 3,
    // see below) instead of the old separate súpisné-číslo + číslo-bytu inputs.
    await page.fill('input[placeholder="Zadajte súpisné číslo"]', p.cislo);

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
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${outDir}/${profileId}-step2.png`, fullPage: true });

    await page.getByLabel('Pokračovať').click();
    await page.waitForTimeout(2500);
    log('step3 url:', page.url());

    // step 3: "Informácie o nehnuteľnosti" - as of ~2026-11-01 this is a single merged
    // step (used to be split across the address step + a separate "o dome/byte" step):
    // plocha, stav/material dropdown(s), historická hodnota, floor count/apartment floor/
    // apartment number (moved here from the address step), flood/damage history.
    if (p.type === 'HOUSE') {
      // "Informácie o dome" - as of ~2026-11-01 this step is just plocha, a single
      // material dropdown (the separate "typ domu"/"Samostatný rodinný dom" dropdown
      // and the roof-type/rekonštrukcia/historická questions are gone), floods, damage.
      await page.fill('input[name="estate-area"]', String(p.plocha));
      await page.waitForTimeout(400);

      const materialDropdown = page.locator('input[placeholder="Vyberte si z možností"]');
      await materialDropdown.click();
      await page.waitForTimeout(400);
      await page.getByText('Murovaná', { exact: true }).click();
      await page.waitForTimeout(400);

      // roof type + "Má dom historickú hodnotu?" reveal progressively after material is picked
      await page.getByText(p.strecha === 'šikmá' ? 'Sedlová' : 'Plochá', { exact: true }).click();
      await page.waitForTimeout(400);
      const histGroupH = await page.$('.uni-container.sc-union-true-false-switch');
      if (histGroupH) { const n = await histGroupH.$('button:has-text("Nie")'); if (n) await n.click(); }
      await page.waitForTimeout(400);

      await page.getByText('0 záplav', { exact: true }).click();
      await page.getByText('0 škôd', { exact: true }).click();
      await page.waitForTimeout(400);
    } else {
      // FLAT
      await page.fill('input[name="estate-area"]', String(p.plocha));
      await page.waitForTimeout(400);

      const stavDropdown = page.locator('input[placeholder="Vyberte si z možností"]');
      await stavDropdown.click();
      await page.waitForTimeout(400);
      await page.getByText('Pôvodný stav', { exact: true }).click();
      await page.waitForTimeout(400);

      // "Má byt historickú hodnotu?" -> Nie
      const histGroup = await page.$('.uni-container.sc-union-true-false-switch');
      if (histGroup) { const n = await histGroup.$('button:has-text("Nie")'); if (n) await n.click(); }
      await page.waitForTimeout(400);

      await page.fill('input[placeholder="Zadajte počet poschodí"]', String(p.celkovePoschodi));
      await page.waitForTimeout(300);
      const poschodieInput = page.locator('input[placeholder="Vyberte poschodie"]');
      await poschodieInput.click();
      await poschodieInput.type(String(p.poschodie), { delay: 100 });
      await page.waitForTimeout(900);
      await page.getByText(`${p.poschodie}. poschodie`, { exact: true }).click().catch(() => log('no poschodie suggestion'));
      await page.waitForTimeout(400);
      await page.fill('input[placeholder="Zadajte číslo bytu"]', p.cislo.split('/')[1] || p.cislo.split('/')[0]);
      await page.waitForTimeout(300);

      await page.getByText('0 záplav', { exact: true }).click();
      await page.getByText('0 škôd', { exact: true }).click();
      await page.waitForTimeout(400);
    }

    await page.screenshot({ path: `${outDir}/${profileId}-step3.png`, fullPage: true });
    fs.writeFileSync(`${outDir}/${profileId}-step3.html`, await page.content());

    await page.getByText('Pokračovať', { exact: true }).click();
    await page.waitForTimeout(2500);
    log('step4 url:', page.url());

    // step 4: "Poistenie nehnuteľnosti a domácnosti" - as of ~2026-11-01 this merges what
    // used to be 3 separate steps onto one page: poistná suma nehnuteľnosti (prefilled
    // with Union's recommendation), poistná suma domácnosti, "Poistenie vedľajších
    // objektov" (garáž/ostatné stavby - left off, not part of our profiles), and a
    // "Kontakt na vás" phone/e-mail block. Target each suma field by its label text,
    // not a generic input[type="text"]/first-input selector - with two sum fields now
    // on the same page those generic selectors both resolve to the first one.
    const estateSumInput = page.locator('text=Poistná suma nehnuteľnosti').first().locator('xpath=following::input[1]');
    const odporucanaSuma = (await estateSumInput.inputValue()).replace(/\s/g, '');
    log('odporúčaná poistná suma nehnuteľnosť:', odporucanaSuma);
    // .fill() sets the value atomically; typing char-by-char into this masked
    // field can scramble the digits (confirmed bug elsewhere, e.g. Generali).
    await estateSumInput.fill(String(p.suma_nehnutelnost));
    await page.waitForTimeout(400);
    log('estate sum input value after fill:', await estateSumInput.inputValue().catch(() => '?'));

    const householdSumInput = page.locator('text=Poistná suma domácnosti').first().locator('xpath=following::input[1]');
    await householdSumInput.fill(String(p.suma_domacnost));
    await page.waitForTimeout(400);
    log('household sum input value after fill:', await householdSumInput.inputValue().catch(() => '?'));

    await page.fill('input[placeholder="XXX XXX XXX"]', CONTACT.phone);
    await page.fill('input[placeholder="Napíšte svoj e-mail"]', CONTACT.email);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${outDir}/${profileId}-step4.png`, fullPage: true });

    await page.getByText('Pokračovať', { exact: true }).click();
    await page.waitForTimeout(2500);
    log('step5 url:', page.url());
    // step 5: Cena poistenia a poistné riziká. As of ~2026-11-01 this page dropped the
    // old binary "základné riziká" / "pridať všetky pripoistenia" toggle in favour of a
    // proper 3-tier Klasik/Komfort/Premium package table (same pattern as the other
    // insurers), with a coverage grid (checkmark = included) per tier, and 3 deductible
    // radios (DEDUCTIBLE_0/50/100).
    const deductibleRadios = await page.$$eval('input[type="radio"][value^="DEDUCTIBLE_"]', (els) => els.map((e) => e.value));
    log('deductible options:', JSON.stringify(deductibleRadios));

    const results = [];
    let prevCenas = null;
    for (const ded of deductibleRadios) {
      await page.click(`input[value="${ded}"]`, { force: true });
      await page.waitForTimeout(1200);
      const checked = await page.locator(`input[value="${ded}"]`).isChecked().catch(() => false);
      if (!checked) throw new Error(`deductible radio "${ded}" did not end up checked`);
      const spoluucastLabel = `${ded.replace('DEDUCTIBLE_', '')} €`;

      const readTiers = () => page.$$eval('.ssp-fun-table-column-header--top', (els) => els.map((e) => {
        const style = e.getAttribute('style') || '';
        const m = style.match(/grid-area:\s*\d+\s*\/\s*(\d+)/);
        return {
          col: m ? parseInt(m[1], 10) : null,
          name: e.querySelector('.ssp-fun-table-column-header__title')?.textContent.trim(),
          cena: e.querySelector('.ssp-fun-table-column-header__price-value')?.textContent.replace(/\xa0|\s/g, '').replace('€', '').trim(),
        };
      }).filter((t) => t.name && t.col !== null));

      // the table repeats its header row at the bottom too (same class minus --top) - scope to --top only
      let tiers = await readTiers();
      // the deductible toggle can flip to "selected" before the price table has
      // re-rendered (confirmed: dom-male-dvorniky silently returned identical 0€/50€
      // prices this way) - if the prices are unchanged from the previous deductible,
      // give the page more time and re-read before accepting.
      const cenasNow = tiers.map((t) => t.cena).join('|');
      if (prevCenas !== null && cenasNow === prevCenas) {
        log(`  prices unchanged from previous deductible, waiting longer and re-reading...`);
        await page.waitForTimeout(1500);
        tiers = await readTiers();
      }
      prevCenas = tiers.map((t) => t.cena).join('|');
      log(`${spoluucastLabel} tiers:`, JSON.stringify(tiers));

      const rows = await page.$$eval('.ssp-fun-table__row', (rowEls) => rowEls.map((row) => {
        const label = row.querySelector('.ssp-fun-table-label-cell__label')?.textContent.trim();
        const cells = Array.from(row.querySelectorAll('.ssp-fun-table-cell')).map((c) => {
          const style = c.getAttribute('style') || '';
          const m = style.match(/grid-area:\s*\d+\s*\/\s*(\d+)/);
          const icon = c.querySelector('union-icon');
          return { col: m ? parseInt(m[1], 10) : null, included: icon?.getAttribute('aria-label') === 'Zahrnuté' };
        });
        return { label, cells };
      }).filter((r) => r.label));

      for (const tier of tiers) {
        results.push({
          balik: tier.name,
          spoluucast: spoluucastLabel,
          cena: tier.cena,
          coverage: rows.filter((r) => r.cells.some((c) => c.col === tier.col && c.included)).map((r) => r.label),
        });
      }
    }
    await page.screenshot({ path: `${outDir}/${profileId}-step5-offer.png`, fullPage: true });
    fs.writeFileSync(`${outDir}/${profileId}-step5.html`, await page.content());
    log('results:', JSON.stringify(results.map((r) => [r.balik, r.spoluucast, r.cena, r.coverage.length])));
    fs.writeFileSync(`${outDir}/${profileId}-results.json`, JSON.stringify(results.map((r) => ({ ...r, odporucana_suma_nehnutelnost: odporucanaSuma, limit: '' })), null, 2));

    await browser.close();
    return results;
  } catch (e) {
    await page.screenshot({ path: `${outDir}/${profileId}-ERROR.png`, fullPage: true }).catch(() => {});
    await browser.close();
    throw e;
  }
}

run(process.argv[2]).catch(e => { console.error('FATAL', e.message); process.exit(1); });
