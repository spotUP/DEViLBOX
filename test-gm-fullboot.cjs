const puppeteer = require('puppeteer');

// Full DSP boot test — expects 20+ minutes for Virus B firmware to boot on WASM
const INIT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const AUDIO_WAIT_MS = 120 * 1000; // 2 minutes after init for audio test

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--autoplay-policy=no-user-gesture-required']
  });
  const page = await browser.newPage();

  const logs = [];
  let nonZeroPeakSeen = false;

  page.on('console', msg => {
    const text = msg.text();
    logs.push(text);

    // Track non-zero audio peaks
    const peakMatch = text.match(/peak=([0-9.]+)/);
    if (peakMatch && parseFloat(peakMatch[1]) > 0.0001) {
      nonZeroPeakSeen = true;
      console.log('[AUDIO!]', text);
    }

    // Show key progress messages
    if (text.includes('FULL DSP boot') || text.includes('Boot wait') ||
        text.includes('Boot timeout') || text.includes('Ready') ||
        text.includes('Error') || text.includes('Clock speed') ||
        text.includes('[EM] gm_process') || text.includes('Timer') ||
        text.includes('PCTL') || text.includes('ESAI') ||
        text.includes('BootROM') || text.includes('CommandStream') ||
        text.includes('Program ') || text.includes('dspHasBooted') ||
        text.includes('HDI08 enabled') || text.includes('updateCycles')) {
      console.log('[BROWSER]', text);
    }
  });

  const startTime = Date.now();
  const elapsed = () => ((Date.now() - startTime) / 1000).toFixed(0) + 's';

  console.log(`[${elapsed()}] Navigating...`);
  await page.goto('http://localhost:5173/test-gearmulator.html', { waitUntil: 'domcontentloaded' });

  console.log(`[${elapsed()}] Clicking Initialize (full boot — may take 20+ minutes)...`);
  await page.click('#btnInit');

  // Progress monitor
  const progressInterval = setInterval(() => {
    const emLogs = logs.filter(l => l.includes('[EM]')).length;
    const hdiReads = logs.filter(l => l.includes('readRX')).length;
    const lastLog = logs.length > 0 ? logs[logs.length - 1].substring(0, 80) : '(none)';
    console.log(`[${elapsed()}] Waiting... EM=${emLogs} hdi08Reads=${hdiReads} total=${logs.length}`);
    console.log(`  Last: ${lastLog}`);
  }, 30000); // Every 30s

  try {
    await page.waitForFunction(() => {
      const s = document.getElementById('initStatus');
      return s && (s.textContent.includes('Ready') || s.textContent.includes('Failed'));
    }, { timeout: INIT_TIMEOUT_MS });
  } catch (e) {
    console.log(`[${elapsed()}] Init timeout after 30 minutes`);
  }

  clearInterval(progressInterval);

  const status = await page.$eval('#initStatus', el => el.textContent);
  console.log(`[${elapsed()}] Status: ${status}`);

  if (status.includes('Ready')) {
    console.log(`[${elapsed()}] Init succeeded! Sending MIDI note...`);

    // Wait a moment, then play note
    await new Promise(r => setTimeout(r, 3000));
    await page.click('#btnNote');
    console.log(`[${elapsed()}] Note sent. Waiting ${AUDIO_WAIT_MS/1000}s for audio output...`);

    await new Promise(r => setTimeout(r, AUDIO_WAIT_MS));

    console.log(`\n[${elapsed()}] === RESULTS ===`);
    console.log(`Non-zero audio peak seen: ${nonZeroPeakSeen}`);

    // Show gm_process peaks
    console.log('\n=== gm_process peaks ===');
    let peakCount = 0;
    for (const l of logs) {
      if (l.includes('gm_process')) {
        console.log(l);
        if (++peakCount > 50) { console.log('... (truncated)'); break; }
      }
    }

    console.log(`\nTotal log lines: ${logs.length}`);
  } else {
    console.log(`[${elapsed()}] Init did not succeed. Dumping last 50 EM logs:`);
    const emLogs = logs.filter(l => l.includes('[EM]'));
    for (const l of emLogs.slice(-50)) console.log(l);
  }

  await browser.close();
  process.exit(nonZeroPeakSeen ? 0 : 1);
})();
