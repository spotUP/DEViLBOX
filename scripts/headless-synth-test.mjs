#!/usr/bin/env node
/**
 * Headless synth volume test via Puppeteer.
 * Usage: node scripts/headless-synth-test.mjs [filter]
 *   filter: optional comma-separated synth names or /regex/
 *   e.g.  node scripts/headless-synth-test.mjs "FurnaceOPN,FurnaceOPM"
 *         node scripts/headless-synth-test.mjs "/^Furnace/"
 */

import puppeteer from 'puppeteer';

const BASE_URL = process.env.TEST_URL || 'http://localhost:5173';
const filter = process.argv[2] || '';
const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes max

async function run() {
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      '--autoplay-policy=no-user-gesture-required',
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  });

  const page = await browser.newPage();

  // Capture console output
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    if (type === 'error') {
      console.error(`[ERR] ${text}`);
    } else if (type === 'warning') {
      // skip warnings unless relevant
      if (text.includes('Audio') || text.includes('synth')) console.log(`[WARN] ${text}`);
    } else {
      console.log(`[LOG] ${text}`);
    }
  });

  page.on('pageerror', err => console.error(`[PAGE ERROR] ${err.message}`));

  console.log(`Navigating to ${BASE_URL}/synth-test.html ...`);
  await page.goto(`${BASE_URL}/synth-test.html`, { waitUntil: 'networkidle0', timeout: 60000 });

  // Wait for test runner module to finish loading (it sets window.runFilteredVolume)
  console.log('Waiting for test runner module to load ...');
  await page.waitForFunction('typeof window.runFilteredVolume === "function"', { timeout: 120000 });
  console.log('Test runner module loaded.');

  // Click on the page body first to establish user gesture context
  await page.click('body');
  await new Promise(r => setTimeout(r, 1000));

  // If filter is provided, type it and call the function directly
  if (filter) {
    console.log(`Setting filter: ${filter}`);
    await page.type('#synthFilter', filter);
    await new Promise(r => setTimeout(r, 300));
    console.log('Calling runFilteredVolume() via evaluate ...');
    // Call the function directly and catch errors
    page.evaluate(() => {
      const fn = window.runFilteredVolume;
      if (!fn) { document.title = 'ERROR: runFilteredVolume not found'; return; }
      fn().then(() => {
        console.log('[Puppeteer] runFilteredVolume completed');
      }).catch(err => {
        console.error('[Puppeteer] runFilteredVolume error:', err);
        document.title = 'ERROR: ' + (err.message || err);
      });
    }).catch(err => console.error('evaluate error:', err));
  } else {
    console.log('Clicking "Run Volume Level Tests" ...');
    await page.click('#runVolumeTests');
  }

  // Poll for completion via document title change
  console.log('Waiting for tests to complete (timeout: 10 min) ...');
  const startTime = Date.now();
  let done = false;
  let lastLogTime = Date.now();
  while (!done && (Date.now() - startTime) < TIMEOUT_MS) {
    await new Promise(r => setTimeout(r, 3000));
    try {
      const title = await page.title();
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      if (Date.now() - lastLogTime > 15000) {
        console.log(`  [${elapsed}s] title="${title}"`);
        lastLogTime = Date.now();
      }
      if (title.startsWith('DONE ')) {
        console.log(`\n=== ${title} === (${elapsed}s)\n`);
        done = true;
      }
    } catch (e) {
      console.error('Page became unresponsive:', e.message);
      break;
    }
  }

  if (!done) {
    console.error('TIMEOUT: Tests did not complete within 10 minutes');
    await browser.close();
    process.exit(1);
  }

  // Extract results
  const results = await page.evaluate(() => {
    const r = window.SYNTH_TEST_RESULTS;
    if (!r) return null;
    return {
      passed: r.passed,
      failed: r.failed,
      wasmUnavailable: r.wasmUnavailable,
      fallbacks: r.fallbacks || [],
      natives: r.natives || [],
      errors: (r.errors || []).map(e => ({ name: e.name, error: e.error || e.message || '' })),
      wasmUnavailSynths: r.wasmUnavailSynths || [],
      volumeResults: r.volumeResults || [],
    };
  });

  if (!results) {
    console.error('No test results found');
    await browser.close();
    process.exit(1);
  }

  // Print volume results
  console.log(`Passed: ${results.passed}  |  Failed: ${results.failed}  |  WASM Unavailable: ${results.wasmUnavailable}`);

  if (results.volumeResults && results.volumeResults.length > 0) {
    // Sort: silent first, then by peak
    const sorted = [...results.volumeResults].sort((a, b) => a.peakDb - b.peakDb);

    const silent = sorted.filter(v => v.peakDb === -Infinity || v.peakDb < -60);
    const quiet = sorted.filter(v => v.peakDb >= -60 && v.peakDb < -30);
    const ok = sorted.filter(v => v.peakDb >= -30);

    if (silent.length > 0) {
      console.log(`\n🔇 SILENT (${silent.length}):`);
      for (const v of silent) {
        console.log(`  ${v.name}: ${v.peakDb === -Infinity ? '-∞' : v.peakDb.toFixed(1)} dB ${v.judgment || ''} ${v.reason || ''}`);
      }
    }

    if (quiet.length > 0) {
      console.log(`\n🔉 QUIET (${quiet.length}):`);
      for (const v of quiet) {
        console.log(`  ${v.name}: ${v.peakDb.toFixed(1)} dB ${v.judgment || ''}`);
      }
    }

    console.log(`\n✅ OK (${ok.length}):`);
    for (const v of ok) {
      console.log(`  ${v.name}: ${v.peakDb.toFixed(1)} dB`);
    }
  }

  if (results.errors.length > 0) {
    console.log(`\n❌ ERRORS (${results.errors.length}):`);
    for (const e of results.errors) {
      console.log(`  ${e.name}: ${e.error}`);
    }
  }

  if (results.wasmUnavailSynths.length > 0) {
    console.log(`\n⚠️  WASM UNAVAILABLE (${results.wasmUnavailSynths.length}): ${results.wasmUnavailSynths.join(', ')}`);
  }

  if (results.fallbacks.length > 0) {
    console.log(`\n🔄 FALLBACKS (${results.fallbacks.length}): ${results.fallbacks.join(', ')}`);
  }

  await browser.close();
  process.exit(results.failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
