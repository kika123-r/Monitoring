const { chromium } = require('/home/user/Monitoring/node_modules/playwright');
const url = process.argv[2];
const out = process.argv[3] || '/tmp/dump';
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(()=>{});
  await page.waitForTimeout(1500);
  const buttons = await page.$$eval('button, a[role=button], [class*=button], [class*=btn]', els => els.map(e => ({tag:e.tagName, text: e.textContent.trim().slice(0,80), href: e.href||null, cls: e.className})).filter(x=>x.text));
  require('fs').writeFileSync(out + '-buttons.json', JSON.stringify(buttons, null, 2));
  await page.screenshot({ path: out + '.png', fullPage: true });
  const allLinks = await page.$$eval('a', as => as.map(a => ({href:a.href, text:a.textContent.trim()})).filter(x=>x.text));
  require('fs').writeFileSync(out + '-links.json', JSON.stringify(allLinks, null, 2));
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
