const puppeteer = require('puppeteer');

(async () => {
  const url = process.argv[2] || 'http://127.0.0.1:3000/users/bc1qryh7hv7quzceehet75udcta0u6lkm4hjvrt9mw';
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();

  page.on('console', msg => {
    const args = msg.args();
    Promise.all(args.map(a => a.jsonValue())).then(vals => {
      console.log('[page console]', msg.type(), ...vals);
    }).catch(() => {
      console.log('[page console]', msg.type(), msg.text());
    });
  });

  console.log('opening', url);
  await page.goto(url, { waitUntil: 'networkidle2' });

  // wait a bit for client rendering
  await page.waitForTimeout(2000);

  await browser.close();
  console.log('done');
})();
