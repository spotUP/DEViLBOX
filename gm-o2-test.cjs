const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      '--disable-web-security',
      '--allow-file-access-from-files',
      '--autoplay-policy=no-user-gesture-required',
      '--enable-features=SharedArrayBuffer',
    ]
  });
  const page = await browser.newPage();

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('HDI08 readRX') || text.includes('HDI08 writeRX') || text.includes('HDI08 inject'))
      return;
    if (text.includes('Audio underrun'))
      return;
    console.log('[B]', text);
  });
  page.on('pageerror', err => console.log('[PAGE ERROR]', err?.message || String(err)));

  console.log('Opening test-gearmulator.html...');
  await page.goto('http://localhost:5173/test-gearmulator.html', { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));

  // Click Initialize
  console.log('Clicking Initialize...');
  await page.click('#btnInit');

  // Wait for Ready
  let ready = false;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const status = await page.evaluate(() => document.getElementById('initStatus')?.textContent || '');
    if (status.includes('Ready') || status.includes('✓')) {
      ready = true;
      console.log(`Status: ${status}`);
      break;
    }
    if (i % 5 === 0) console.log(`Waiting for init... (${i}s) status="${status}"`);
  }

  if (!ready) {
    console.log('TIMEOUT waiting for Ready');
    await browser.close();
    process.exit(1);
  }

  console.log('DSP ready, waiting 5s...');
  await new Promise(r => setTimeout(r, 5000));

  // Send a note
  console.log('Clicking Play C4...');
  await page.click('#btnNote');

  // Monitor for 20 seconds after note
  let crashed = false;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 1000));
  }

  // Check for errors
  const errors = await page.evaluate(() => {
    const logEl = document.getElementById('log');
    const lines = logEl ? logEl.textContent : '';
    return lines.split('\n').filter(l =>
      l.includes('error') || l.includes('Error') || l.includes('unwind') || l.includes('RuntimeError') || l.includes('CRASHED')
    ).slice(0, 10);
  });

  const sabInfo = await page.evaluate(() => {
    const logEl = document.getElementById('log');
    const lines = logEl ? logEl.textContent : '';
    return lines.split('\n').filter(l => l.includes('SAB')).slice(-3);
  });

  if (errors.length > 0) {
    console.log('ERRORS:');
    errors.forEach(e => console.log('  ', e));
    crashed = true;
  } else {
    console.log('No errors detected!');
  }
  console.log('SAB status:', sabInfo);

  await browser.close();
  process.exit(crashed ? 1 : 0);
})();
