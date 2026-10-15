const { chromium } = require('/home/user/Monitoring/node_modules/playwright');
const url = process.argv[2];
const keyword = process.argv[3] || 'majetk';
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForTimeout(1500);
  const links = await page.$$eval('a', as => as.map(a => ({ href: a.href, text: a.textContent.trim() })));
  const re = new RegExp(keyword, 'i');
  const filtered = links.filter(l => re.test(l.text) || re.test(l.href));
  console.log(JSON.stringify(filtered.slice(0, 40), null, 2));
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
