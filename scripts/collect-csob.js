const { chromium } = require('/home/user/Monitoring/node_modules/playwright');
const fs = require('fs');

const CHROME_PATH = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const PROFILES = {
  'byt-bratislava': {
    kind: 'byt', plocha: 65, vekBracket: 1, psc: '85106', obec: 'Bratislava', ulica: 'Lietavská', cislo: '3095',
    suma_nehnutelnost: 200000, suma_domacnost: 25000,
  },
  'byt-kosice': {
    kind: 'byt', plocha: 39, vekBracket: 1, psc: '04001', obec: 'Košice - Sever', ulica: 'Ostravská', cislo: '1014',
    suma_nehnutelnost: 150000, suma_domacnost: 20000,
  },
  'dom-male-dvorniky': {
    kind: 'dom', plocha: 95, vekBracket: 0, psc: '92901', obec: 'Malé Dvorníky', ulica: 'Krátka', cislo: '389',
    suma_nehnutelnost: 200000, suma_domacnost: 25000,
  },
  'dom-vlckovce': {
    kind: 'dom', plocha: 110, vekBracket: 0, psc: '91923', obec: 'Vlčkovce', ulica: 'Vlčkovce', cislo: '447',
    suma_nehnutelnost: 300000, suma_domacnost: 30000,
  },
};

const VEK_OPTIONS = ['Do 25 rokov / novostavba', 'Od 26 rokov do 150 rokov', '151 rokov a viac'];

async function readVal(slider) {
  return parseInt(await slider.getAttribute('aria-valuenow'), 10);
}

async function setSlider(frame, page, nth, target, log) {
  const slider = frame.locator('mat-slider').nth(nth);
  await slider.focus();
  await page.waitForTimeout(300);
  await page.keyboard.press('Home');
  await page.waitForTimeout(500);
  const min = parseInt(await slider.getAttribute('aria-valuemin'), 10);
  const max = parseInt(await slider.getAttribute('aria-valuemax'), 10);
  const afterHome = await readVal(slider);

  // measure the actual arrow/page step sizes empirically (they vary per slider's range)
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(250);
  const arrowStep = (await readVal(slider)) - afterHome;
  await page.keyboard.press('PageUp');
  await page.waitForTimeout(250);
  const afterArrowAndPage = await readVal(slider);
  const pageStep = afterArrowAndPage - afterHome - arrowStep;
  await page.keyboard.press('Home');
  await page.waitForTimeout(400);

  const clamped = Math.max(min, Math.min(max, target));
  const diff = clamped - afterHome;
  const pageUps = pageStep > 0 ? Math.floor(diff / pageStep) : 0;
  const remainder = diff - pageUps * pageStep;
  const arrowRights = arrowStep > 0 ? Math.round(remainder / arrowStep) : 0;
  if (log) log(`slider#${nth} min=${min} max=${max} afterHome=${afterHome} arrowStep=${arrowStep} pageStep=${pageStep} target=${target} pageUps=${pageUps} arrowRights=${arrowRights}`);
  for (let i = 0; i < pageUps; i++) { await page.keyboard.press('PageUp'); await page.waitForTimeout(80); }
  for (let i = 0; i < arrowRights; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(80); }
  await page.waitForTimeout(500);
  const final = await readVal(slider);
  if (log) log(`slider#${nth} final=${final}`);
  return final;
}

async function run(profileId) {
  const p = PROFILES[profileId];
  const outDir = '/home/user/Monitoring/insurers/csob/capture';
  const log = (...a) => console.log(`[${profileId}]`, ...a);
  const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true, args: ['--disable-blink-features=AutomationControlled'] });
  const context = await browser.newContext({ viewport: { width: 1400, height: 1400 }, userAgent: UA, locale: 'sk-SK' });
  const page = await context.newPage();
  try {
    await page.goto('https://www.csob.sk/poistenie-nehnutelnosti-s-domacnostou-kalkulacka', { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(1500);
    await page.click('button:has-text("Prijať všetky cookies")').catch(() => {});
    await page.waitForTimeout(1500);

    const frame = page.frameLocator('iframe[src*="poistenieb2c.csob.sk"]');
    await frame.locator(`button:has-text("${p.kind === 'byt' ? 'Byt' : 'Dom'}")`).click();
    await page.waitForTimeout(1000);
    await frame.locator('text=Nehnuteľnosť').click({ force: true });
    await page.waitForTimeout(300);
    await frame.locator('text=Domácnosť').click({ force: true });
    await page.waitForTimeout(500);

    if (p.kind === 'byt') {
      await frame.locator('text=Podlahová plocha bytu').locator('xpath=following::input[1]').first().fill(String(p.plocha));
    } else {
      await frame.locator('text=Obývaná plocha').locator('xpath=following::input[1]').first().fill(String(p.plocha));
    }
    await page.waitForTimeout(500);
    await frame.locator('button:has-text("Pokračovať")').click();
    await page.waitForTimeout(1500);
    log('step2 (doplnujuce udaje)');

    await frame.locator('[formcontrolname="zip"]').fill(p.psc);
    const obecInput = frame.locator('.ui-autocomplete-input').first();
    let obecVal = '';
    for (let i = 0; i < 8; i++) {
      await page.waitForTimeout(500);
      obecVal = await obecInput.inputValue().catch(() => '');
      if (obecVal.trim()) break;
    }
    if (!obecVal.trim()) {
      log('obec did not auto-fill from PSC, typing manually:', p.obec);
      await obecInput.click();
      await obecInput.type(p.obec, { delay: 80 });
      await page.waitForTimeout(1200);
      const suggestion = frame.locator('.ui-autocomplete-items li, .ui-autocomplete-panel li').first();
      if (await suggestion.count() > 0) {
        await suggestion.click();
      } else {
        await page.keyboard.press('Escape');
      }
      await page.waitForTimeout(500);
    }
    await frame.locator('[formcontrolname="street"]').fill(p.ulica);
    await frame.locator('[formcontrolname="number"]').fill(p.cislo);
    await frame.locator('[formcontrolname="telephone"]').fill('0949414398');
    await frame.locator('#email').fill('janko.mrkvicka@gmail.com');
    await page.waitForTimeout(1500);
    // manually-entered addresses (PSC -> obec lookup failed) need an extra confirmation checkbox
    const confirmBox = frame.locator('text=Potvrdzujem, že údaje o mieste poistenia sú správne');
    try {
      await confirmBox.waitFor({ timeout: 3000 });
      await confirmBox.click({ force: true });
      log('clicked address-confirmation checkbox');
      await page.waitForTimeout(300);
    } catch (e) { /* not shown for auto-verified addresses */ }

    if (p.vekBracket !== 0) {
      await frame.locator('[formcontrolname="propertyAge"]').click();
      await page.waitForTimeout(300);
      await frame.locator('[formcontrolname="propertyAge"] .custom-select-options li span', { hasText: VEK_OPTIONS[p.vekBracket] }).first().click();
      await page.waitForTimeout(400);
    }

    await frame.locator('[formcontrolname="photovoltaic"]').click();
    await page.waitForTimeout(300);
    await frame.locator('[formcontrolname="photovoltaic"] .custom-select-options li span', { hasText: 'Nie' }).first().click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${outDir}/${profileId}-step2-filled.png`, fullPage: true });

    await frame.locator('button:has-text("Pokračovať")').click();
    await page.waitForTimeout(2000);
    log('step3 (vyber balika) url reached');

    // spoluucast = 0 EUR
    await frame.locator('button:has-text("0 EUR")').first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(1000);

    const nehnutelnostActual = await setSlider(frame, page, 0, p.suma_nehnutelnost, log);
    log('nehnutelnost slider set to', nehnutelnostActual);
    await page.waitForTimeout(1000);
    const domacnostActual = await setSlider(frame, page, 1, p.suma_domacnost, log);
    log('domacnost slider set to', domacnostActual);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${outDir}/${profileId}-offer.png`, fullPage: true });

    const names = (await frame.locator('.package-header-wrapper .name').allTextContents()).map(s => s.trim());
    const prices = (await frame.locator('.package-header-wrapper .price b').allTextContents()).map(s => s.replace(/\s/g, '').replace('EUR', '').trim());
    const allCovers = await frame.locator('.package-cover').evaluateAll(els => els.map(el => ({
      label: (el.querySelector('span:last-child')?.textContent || '').trim(),
      included: !el.classList.contains('cover-disabled'),
    })));
    const perPkg = Math.floor(allCovers.length / names.length);
    const results = names.map((name, i) => {
      const chunk = allCovers.slice(i * perPkg, (i + 1) * perPkg);
      return {
        balik: name,
        spoluucast: '0 €',
        cena: prices[i],
        coverage: chunk.filter(c => c.included).map(c => c.label),
        odporucana_suma_nehnutelnost: String(nehnutelnostActual),
      };
    });
    log('DONE', JSON.stringify(results.map(r => [r.balik, r.cena])));
    fs.writeFileSync(`${outDir}/${profileId}-results.json`, JSON.stringify(results, null, 2));

    await browser.close();
    return results;
  } catch (e) {
    await page.screenshot({ path: `${outDir}/${profileId}-ERROR.png`, fullPage: true }).catch(() => {});
    await browser.close();
    throw e;
  }
}

run(process.argv[2]).catch(e => { console.error('FATAL', e.message); process.exit(1); });
