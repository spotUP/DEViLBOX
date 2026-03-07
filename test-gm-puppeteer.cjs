const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: false, args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();

  const logs = [];
  page.on('console', msg => {
    const text = msg.text();
    logs.push(text);
    if (text.includes('gm_process') || text.includes('peak=') || text.includes('Ready') ||
        text.includes('Error') || text.includes('render #') || text.includes('Note') ||
        text.includes('Clock speed') || text.includes('ESAI') || text.includes('HDI08') ||
        text.includes('writeTX') || text.includes('EsxiClock') || text.includes('execInterrupt') ||
        text.includes('VBA=') || text.includes('OMR=')) {
      console.log('[BROWSER]', text);
    }
  });

  console.log('Navigating...');
  await page.goto('http://localhost:5173/test-gearmulator.html', { waitUntil: 'domcontentloaded' });

  console.log('Clicking Initialize...');
  await page.click('#btnInit');

  try {
    await page.waitForFunction(() => {
      const s = document.getElementById('initStatus');
      return s && (s.textContent.includes('Ready') || s.textContent.includes('Failed'));
    }, { timeout: 60000 });
  } catch (e) { console.log('Timeout'); }

  const status = await page.$eval('#initStatus', el => el.textContent);
  console.log('Status:', status);

  if (status.includes('Ready')) {
    console.log('Waiting 3s for DSP to settle...');
    await new Promise(r => setTimeout(r, 3000));

    console.log('Clicking Play C4 (sustained, no note-off)...');
    await page.click('#btnNote');

    console.log('Waiting 60s for audio (DSP runs at ~0.016x real-time)...');
    await new Promise(r => setTimeout(r, 60000));

    console.log('\n=== KEY DIAGNOSTICS ===');
    for (const l of logs) {
      if (l.includes('gm_process #') || l.includes('render #') || l.includes('peak=')) {
        console.log(l);
      }
    }

    console.log('\n=== SAB MONITOR ===');
    for (const l of logs) {
      if (l.includes('[SAB]')) console.log(l);
    }

    console.log('\n=== EM LOGS (non-underrun) ===');
    let emCount = 0;
    for (const l of logs) {
      if (l.includes('[EM]') && !l.includes('underrun') && !l.includes('writeSlot') && !l.includes('TSMB') && !l.includes('ESSI')) {
        console.log(l);
        if (++emCount > 150) { console.log('... (truncated)'); break; }
      }
    }

    console.log('\nTotal log lines:', logs.length);
  }

  await browser.close();
})();
