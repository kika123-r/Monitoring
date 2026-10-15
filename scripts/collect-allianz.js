const { chromium } = require('/home/user/Monitoring/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const DATE = '2026-10-15';
const CONTACT = { phone: '949414398', name: 'Janko', surname: 'Mrkvička', personalId: '9005150000' };

const PROFILES = {
  'byt-bratislava': {
    kind: 'byt', poschodie: 7, prizemie: 'nie', mesto: 'Bratislava', ulica: 'Lietavská', cislo: '3095/9', psc: '85106',
    pscPreferredLabel: 'Petržalka', floorArea: 65, rok: 1985, ucel: 'Na bývanie',
    suma_nehnutelnost: 200000, suma_domacnost: 25000,
  },
  'byt-kosice': {
    kind: 'byt', poschodie: 4, prizemie: 'nie', mesto: 'Košice', ulica: 'Ostravská', cislo: '1014/12', psc: '04001',
    floorArea: 39, rok: 1979, ucel: 'Na bývanie',
    suma_nehnutelnost: 150000, suma_domacnost: 20000,
  },
  'dom-male-dvorniky': {
    kind: 'dom', typ_strechy: 'Šikmá', pocet_podlazi: 2, mesto: 'Malé Dvorníky', ulica: 'Krátka', cislo: '389/10', psc: '92901',
    pscPreferredLabel: 'Malé Dvorníky', floorArea: 95, rok: 2023, material: 'Murovaný', ucel: 'Na bývanie',
    suma_nehnutelnost: 200000, suma_domacnost: 25000,
  },
  'dom-vlckovce': {
    kind: 'dom', typ_strechy: 'Rovná', pocet_podlazi: 2, mesto: 'Vlčkovce', ulica: 'Vlčkovce', cislo: '447', psc: '91923',
    floorArea: 110, rok: 2023, material: 'Murovaný', ucel: 'Na bývanie',
    suma_nehnutelnost: 300000, suma_domacnost: 30000,
  },
};

const CHROME_PATH = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

async function run(profileId) {
  const p = PROFILES[profileId];
  if (!p) throw new Error('unknown profile ' + profileId);
  const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } });
  const outDir = `/home/user/Monitoring/insurers/allianz/capture`;
  const log = (...args) => console.log(`[${profileId}]`, ...args);

  try {
    await page.goto('https://www.allianz.sk/sk/poistenie-majetku-online.html#/about-property/choose-property', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1500);
    try { await page.click('#onetrust-reject-all-handler', { timeout: 5000 }); } catch (e) {}
    await page.evaluate(() => { const el = document.getElementById('onetrust-consent-sdk'); if (el) el.remove(); });
    await page.getByText('Budovu aj domácnosť', { exact: false }).click();
    await page.getByText('POKRAČOVAŤ', { exact: false }).first().click();
    await page.waitForTimeout(1500);

    await page.click('nx-dropdown[formcontrolname="propertyType"]');
    await page.waitForTimeout(500);
    if (p.kind === 'dom') {
      await page.getByRole('option', { name: 'Samostatná stavba' }).click();
    } else {
      await page.getByRole('option', { name: 'Byt na 2. alebo vyššom podlaží' }).click();
    }
    await page.waitForTimeout(600);

    await page.click('nx-dropdown[formcontrolname="postalCode"]');
    let overlayInput = await page.waitForSelector('.cdk-overlay-container input', { timeout: 10000 });
    await overlayInput.type(p.psc, { delay: 100 });
    await page.waitForTimeout(1200);
    let opts = await page.getByRole('option').allTextContents();
    log('postal options:', JSON.stringify(opts));
    if (opts.length > 1 && p.pscPreferredLabel) {
      const match = opts.find(o => o.includes(p.pscPreferredLabel));
      await page.getByRole('option', { name: match || opts[0] }).click();
    } else {
      await page.getByRole('option').first().click();
    }
    await page.waitForTimeout(1500);
    await page.waitForSelector('.cdk-overlay-backdrop', { state: 'detached', timeout: 5000 }).catch(() => {});

    // street (may already be auto-filled/disabled for small villages; for cities may need explicit pick)
    const streetDd = page.locator('nx-dropdown[formcontrolname="street"]');
    const streetDisabled = await streetDd.getAttribute('aria-disabled');
    if (streetDisabled === 'false') {
      await streetDd.click();
      const streetOverlay = await page.waitForSelector('.cdk-overlay-container input', { timeout: 5000 }).catch(() => null);
      if (streetOverlay) {
        await streetOverlay.type(p.ulica, { delay: 100 });
        await page.waitForTimeout(1000);
      }
      const streetOpts = await page.getByRole('option').allTextContents();
      log('street options:', JSON.stringify(streetOpts));
      if (streetOpts.length) {
        const sMatch = streetOpts.find(o => o.toLowerCase().includes(p.ulica.toLowerCase())) || streetOpts[0];
        await page.getByRole('option', { name: sMatch, exact: true }).click().catch(async () => {
          await page.getByRole('option').first().click();
        });
      }
      await page.waitForTimeout(800);
      await page.waitForSelector('.cdk-overlay-backdrop', { state: 'detached', timeout: 5000 }).catch(() => {});
    }

    // house number
    await page.click('nx-dropdown[formcontrolname="streetNumber"]');
    overlayInput = await page.waitForSelector('.cdk-overlay-container input', { timeout: 10000 });
    const cisloDigits = p.cislo.split('/')[0];
    await overlayInput.type(cisloDigits, { delay: 100 });
    await page.waitForTimeout(1000);
    const hnOpts = await page.getByRole('option').allTextContents();
    log('house number options:', JSON.stringify(hnOpts));
    const hnMatch = hnOpts.find(o => o.trim() === p.cislo) || hnOpts.find(o => o.trim().startsWith(cisloDigits)) || hnOpts[0];
    log('house number chosen:', JSON.stringify(hnMatch));
    await page.getByRole('option', { name: hnMatch, exact: true }).click().catch(async () => { await page.getByRole('option').first().click(); });
    await page.waitForTimeout(800);
    // Allianz sometimes shows a "PSČ was corrected" confirmation dialog - dismiss it
    const pscCorrectedBtn = page.getByRole('button', { name: 'SÚHLASÍM', exact: false });
    if (await pscCorrectedBtn.count() > 0) {
      log('dismissing PSC-corrected dialog');
      await pscCorrectedBtn.first().click();
      await page.waitForTimeout(500);
    }
    await page.waitForSelector('.cdk-overlay-backdrop', { state: 'detached', timeout: 5000 }).catch(() => {});

    await page.click('nx-dropdown[formcontrolname="usagePurpose"]');
    await page.waitForTimeout(600);
    await page.getByRole('option', { name: p.ucel }).click();
    await page.waitForTimeout(500);

    await page.fill('input[formcontrolname="floorArea"]', String(p.floorArea));

    if (p.kind === 'dom') {
      await page.click('nx-dropdown[formcontrolname="roofType"]');
      await page.waitForTimeout(600);
      await page.getByRole('option', { name: p.typ_strechy }).click();
      await page.waitForTimeout(500);
    }

    await page.fill('input[formcontrolname="constructionYear"]', String(p.rok));

    if (p.kind === 'dom') {
      await page.click('nx-dropdown[formcontrolname="material"]');
      await page.waitForTimeout(600);
      await page.getByRole('option', { name: p.material }).click();
      await page.waitForTimeout(500);
    }

    await page.screenshot({ path: `${outDir}/${profileId}-step1-filled.png`, fullPage: true });

    await page.getByText('POKRAČOVAŤ', { exact: false }).first().click();
    await page.waitForTimeout(2000);

    await page.fill('input[type="tel"]', CONTACT.phone);
    await page.fill('input[formcontrolname="name"]', CONTACT.name);
    await page.fill('input[formcontrolname="surname"]', CONTACT.surname);
    await page.fill('input[formcontrolname="valueOfContent"]', String(p.suma_domacnost));
    await page.fill('input[formcontrolname="personalId"]', CONTACT.personalId);
    await page.click('nx-dropdown[formcontrolname="numberOfClaims"]');
    await page.waitForTimeout(600);
    await page.getByRole('option', { name: '0-3' }).click();
    await page.keyboard.press('Tab');
    await page.waitForTimeout(1200);

    const invalids = await page.$$eval('.ng-invalid[formcontrolname]', els => els.map(e => e.getAttribute('formcontrolname')));
    log('invalid fields before continue:', JSON.stringify(invalids));
    await page.waitForTimeout(1500); // let debounced async validators (personalId check) settle

    for (let i = 0; i < 6 && !page.url().includes('offer-for-you'); i++) {
      await page.getByText('POKRAČOVAŤ', { exact: false }).first().click();
      await page.waitForTimeout(1500);
    }
    log('offer url:', page.url());

    if (!page.url().includes('offer-for-you')) {
      await page.screenshot({ path: `${outDir}/${profileId}-FAILED.png`, fullPage: true });
      throw new Error('did not reach offer page');
    }

    // capture the calculator's own recommended sum (shown before we override it)
    const preEditText = await page.innerText('body');
    const recMatch = preEditText.match(/Budova:\s*([\d\s]+)[,.]?\d*\s*€/);
    const odporucanaSuma = recMatch ? recMatch[1].replace(/\s/g, '') : null;
    log('odporúčaná poistná suma nehnuteľnosť (default):', odporucanaSuma);

    // edit sums to match target
    await page.getByText('Upraviť sumy', { exact: false }).first().click();
    await page.waitForTimeout(800);
    const rangeTexts = await page.$$eval('.nx-formfield__hints, [nxformfieldhint]', els => els.map(e => e.textContent.trim()));
    log('sum range hints:', JSON.stringify(rangeTexts));

    const propInput = page.locator('input[formcontrolname="insuredSumProperty"]');
    await propInput.click({ clickCount: 3 });
    await page.keyboard.press('Backspace');
    await propInput.type(String(p.suma_nehnutelnost), { delay: 60 });
    const contentInput = page.locator('input[formcontrolname="insuredSumContent"]');
    await contentInput.click({ clickCount: 3 });
    await page.keyboard.press('Backspace');
    await contentInput.type(String(p.suma_domacnost), { delay: 60 });
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Potvrdiť', exact: true }).click();
    await page.waitForTimeout(1800);

    // read actual applied sums (may be clamped to allowed range)
    const appliedSums = await page.innerText('body');
    const sumMatch = appliedSums.match(/Budova:\s*([\d\s]+)[,.]?\d*\s*€[\s\S]{0,40}?Domácnosť:\s*([\d\s]+)/);
    log('applied sums raw match:', sumMatch ? sumMatch[0].replace(/\s+/g,' ') : 'NOT FOUND');

    const packages = ['Comfort', 'Extra', 'Max'];
    const deductibles = ['0 €', '100 €'];
    const results = [];

    for (const pkg of packages) {
      await page.getByText(pkg, { exact: true }).first().click();
      await page.waitForTimeout(1800);
      const pkgPageText = await page.innerText('body');
      const covMatch = pkgPageText.match(/Čo je poistením kryté\?\s*\n([\s\S]*?)\n\s*Detail balíčka/);
      const coverageList = covMatch ? covMatch[1].split('\n').map(s => s.trim()).filter(Boolean) : [];
      log(pkg, 'coverage:', JSON.stringify(coverageList));
      for (const ded of deductibles) {
        let curSel = '';
        for (let attempt = 0; attempt < 3; attempt++) {
          await page.locator('nx-dropdown[formcontrolname="deductible"]').scrollIntoViewIfNeeded();
          await page.click('nx-dropdown[formcontrolname="deductible"]');
          await page.waitForTimeout(700);
          await page.getByRole('option', { name: ded, exact: true }).click();
          await page.waitForTimeout(1300);
          curSel = (await page.locator('nx-dropdown[formcontrolname="deductible"]').innerText()).trim();
          if (curSel === ded) break;
          log(`  deductible mismatch (want ${ded}, got ${curSel}), retrying...`);
          await page.waitForTimeout(500);
        }
        log('  deductible dropdown now shows:', curSel);
        await page.waitForTimeout(1200); // let price recalculation settle after dropdown value is confirmed

        let fullText = await page.innerText('body');
        let priceMatch = fullText.match(/([\d\s]+,\d{2})\s*€\s*\n?\s*Platené ročne/);
        const prevForPkg = results.find(r => r.balik === pkg);
        if (prevForPkg && priceMatch && prevForPkg.cena === priceMatch[1].replace(/\s/g, '') && ded !== prevForPkg.spoluucast) {
          log('  price unchanged from other deductible, waiting longer and re-reading...');
          await page.waitForTimeout(1500);
          fullText = await page.innerText('body');
          priceMatch = fullText.match(/([\d\s]+,\d{2})\s*€\s*\n?\s*Platené ročne/);
        }
        const limitMatch = fullText.match(/Limit\s*\n?\s*([\d\s]+)\s*€/);

        results.push({
          balik: pkg,
          spoluucast: ded,
          cena: priceMatch ? priceMatch[1].replace(/\s/g, '') : null,
          limit: limitMatch ? limitMatch[1].replace(/\s/g, '') : null,
          coverage: coverageList,
          odporucana_suma_nehnutelnost: odporucanaSuma,
        });
        log(pkg, ded, '->', JSON.stringify(results[results.length - 1]));
      }
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

const profileId = process.argv[2];
run(profileId).then(r => {
  console.log('DONE', profileId, JSON.stringify(r, null, 2));
}).catch(e => {
  console.error('FATAL', e.message);
  process.exit(1);
});
