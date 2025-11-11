const { chromium } = require('playwright');

(async () => {
  const url = process.argv[2] || 'http://127.0.0.1:3000/users/bc1qryh7hv7quzceehet75udcta0u6lkm4hjvrt9mw';
  const browser = await chromium.launch();
  const page = await browser.newPage();

  page.on('console', msg => {
    try {
      console.log('[page console]', msg.type(), msg.text());
    } catch (e) {
      console.log('[page console]', msg.type(), msg);
    }
  });

  console.log('opening', url);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await browser.close();
  console.log('done');
})();
