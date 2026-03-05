#!/usr/bin/env node
/**
 * Puppeteer FPS profiler for DEViLBOX GL mode.
 *
 * Runs multiple scenarios and compares frame timings:
 *   A) Idle (no playback, no input)
 *   B) Playback only (smooth scroll active)
 *   C) Playback + arrow key scrolling (the real-world stress test)
 *
 * Usage:
 *   node scripts/profile-fps.mjs [--duration 20] [--url http://localhost:5173]
 *   node scripts/profile-fps.mjs --trace   # also capture a CDP flame-chart trace
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

// ─── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? (args[i + 1] ?? true) : null; };
const durationSec = Number(flag('--duration')) || 20;
const url         = flag('--url') || 'http://localhost:5173';
const wantTrace   = args.includes('--trace');

// ─── Helpers ─────────────────────────────────────────────────────────────────
function analyse(frameTimes, label) {
  const sorted = [...frameTimes].sort((a, b) => a - b);
  const n = sorted.length;
  if (n < 2) { console.log(`  ${label}: not enough frames`); return; }
  const avgDt = sorted.reduce((s, v) => s + v, 0) / n;
  const p50 = sorted[Math.floor(n * 0.50)];
  const p95 = sorted[Math.floor(n * 0.95)];
  const p99 = sorted[Math.floor(n * 0.99)];
  const jank    = sorted.filter(dt => dt > 33.3).length;
  const stutter = sorted.filter(dt => dt > 50).length;

  const buckets = { '60+': 0, '50-60': 0, '30-50': 0, '20-30': 0, '<20': 0 };
  for (const dt of sorted) {
    const fps = 1000 / dt;
    if (fps >= 60) buckets['60+']++;
    else if (fps >= 50) buckets['50-60']++;
    else if (fps >= 30) buckets['30-50']++;
    else if (fps >= 20) buckets['20-30']++;
    else buckets['<20']++;
  }

  console.log(`\n${'═'.repeat(56)}`);
  console.log(`  ${label}  (${n} frames / ${(avgDt * n / 1000).toFixed(1)}s)`);
  console.log(`${'═'.repeat(56)}`);
  console.log(`  Avg FPS: ${(1000/avgDt).toFixed(1).padStart(6)}    Avg dt: ${avgDt.toFixed(2)}ms`);
  console.log(`  Min dt:  ${sorted[0].toFixed(2).padStart(6)}ms   Max dt: ${sorted[n-1].toFixed(2)}ms`);
  console.log(`  P50:     ${p50.toFixed(2).padStart(6)}ms   P95: ${p95.toFixed(2)}ms   P99: ${p99.toFixed(2)}ms`);
  console.log(`  Jank (>33ms): ${String(jank).padStart(4)} (${(jank/n*100).toFixed(1)}%)   Stutter (>50ms): ${stutter} (${(stutter/n*100).toFixed(1)}%)`);
  console.log(`  Distribution:`);
  for (const [range, count] of Object.entries(buckets)) {
    const bar = '█'.repeat(Math.round(count / n * 40));
    console.log(`    ${range.padStart(6)}: ${bar} ${count} (${(count/n*100).toFixed(1)}%)`);
  }
  console.log(`${'─'.repeat(56)}`);
  return { avgFps: 1000/avgDt, p50, p95, p99, jank: jank/n, stutter: stutter/n, n };
}

/** Measure rAF frame timings for `ms` milliseconds. Retries on context destruction. */
async function injectMeasurer(page, ms) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await page.evaluate((durationMs) => {
        return new Promise((resolve) => {
          const frameTimes = [];
          let start = 0, prev = 0;
          function tick(ts) {
            if (!start) { start = ts; prev = ts; }
            const dt = ts - prev;
            if (dt > 0) frameTimes.push(dt);
            prev = ts;
            if (ts - start < durationMs) requestAnimationFrame(tick);
            else resolve(frameTimes);
          }
          requestAnimationFrame(tick);
        });
      }, ms);
    } catch (e) {
      if (attempt < 2 && e.message?.includes('context')) {
        console.log(`  ⚠️  Context destroyed, retrying (attempt ${attempt + 2}/3)...`);
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      throw e;
    }
  }
}

/** Send arrow-down key presses at ~intervalMs for the given duration. */
async function scrollArrowKeys(page, durationMs, intervalMs = 120) {
  const end = Date.now() + durationMs;
  let down = true;
  let count = 0;
  while (Date.now() < end) {
    // Alternate between down and up every 40 presses to stay in range
    const key = down ? 'ArrowDown' : 'ArrowUp';
    await page.keyboard.press(key);
    count++;
    if (count % 40 === 0) down = !down;
    await new Promise(r => setTimeout(r, intervalMs));
  }
}

// ─── Launch ──────────────────────────────────────────────────────────────────
console.log(`\n🎯 DEViLBOX FPS Profiler`);
console.log(`   URL:      ${url}`);
console.log(`   Duration: ${durationSec}s per scenario`);
console.log(`   Trace:    ${wantTrace ? 'yes' : 'no (use --trace to enable)'}\n`);

const browser = await puppeteer.launch({
  headless: false,
  args: [
    '--disable-features=CalculateNativeWinOcclusion',
    '--enable-gpu-rasterization',
    '--no-sandbox',
    '--autoplay-policy=no-user-gesture-required',
    '--disable-frame-rate-limit',
    '--disable-gpu-vsync',
  ],
  defaultViewport: { width: 1440, height: 900 },
});

const page = await browser.newPage();

// Grant MIDI sysex permission to avoid browser prompt blocking startup
const ctx = browser.defaultBrowserContext();
await ctx.overridePermissions(url, ['midi', 'midi-sysex']);

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
console.log('✅ Page loaded');

// Wait for app to initialize — check for canvas or the app root
await page.waitForFunction(() => {
  return document.querySelector('canvas') !== null || document.querySelector('#app')?.children.length > 0;
}, { timeout: 30000 });

// Debug: check what elements exist
const debugInfo = await page.evaluate(() => {
  const canvases = document.querySelectorAll('canvas');
  const appEl = document.querySelector('#app') || document.querySelector('#root');
  return {
    canvasCount: canvases.length,
    appChildren: appEl?.children.length ?? 0,
    bodyHTML: document.body.innerHTML.substring(0, 500),
    errors: (window.__consoleErrors || []).slice(-5),
  };
});
console.log('🔍 Debug:', JSON.stringify(debugInfo, null, 2));

if (debugInfo.canvasCount === 0) {
  console.log('⚠️  No canvas found — app may have errored. Taking screenshot...');
  await page.screenshot({ path: 'profiler-debug.png' });
  await browser.close();
  process.exit(1);
}
console.log('✅ Canvas found');

// Let WASM / fonts / Pixi fully init
await new Promise(r => setTimeout(r, 6000));

// Click canvas to ensure focus + resume AudioContext
await page.mouse.click(720, 450);
await new Promise(r => setTimeout(r, 1000));

// Dismiss any open modal via the store (Pixi modals are canvas-rendered, not DOM)
await page.evaluate(async () => {
  try {
    const { useUIStore } = await import('/src/stores/useUIStore.ts');
    useUIStore.getState().closeModal();
  } catch (e) { /* store not available yet */ }
});
// Also send Escape as fallback (PixiModal listens on window keydown)
await page.keyboard.press('Escape');
await new Promise(r => setTimeout(r, 500));
await page.keyboard.press('Escape');
await new Promise(r => setTimeout(r, 500));
console.log('✅ Modals dismissed');

// Click canvas again to resume AudioContext (needs user gesture)
await page.mouse.click(720, 450);
await new Promise(r => setTimeout(r, 1000));

// Load demo song
const loaded = await page.evaluate(async () => {
  try {
    const name = 'break the box.mod';
    const resp = await fetch(`/data/songs/mod/${encodeURIComponent(name)}`);
    if (!resp.ok) return `fetch ${resp.status}`;
    const blob = await resp.blob();
    const file = new File([blob], name);
    const { loadFile } = await import('/src/lib/file/UnifiedFileLoader.ts');
    await loadFile(file, { requireConfirmation: false });
    return name;
  } catch (e) { return `error: ${e.message}`; }
});
console.log(`📁 Loaded: ${loaded}`);

// Wait for song load + any deferred init to finish
await new Promise(r => setTimeout(r, 5000));

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario A: Idle — no playback, no input
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n🅰️  Scenario A: Idle (no playback, no input)...');
const idleFrames = await injectMeasurer(page, durationSec * 1000);
const idleStats = analyse(idleFrames, '🅰️  IDLE');

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario B: Playback only (smooth scroll)
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n🅱️  Scenario B: Playback only (smooth scroll)...');
await page.keyboard.press('Space'); // play
await new Promise(r => setTimeout(r, 1000)); // settle

const playFrames = await injectMeasurer(page, durationSec * 1000);

await page.keyboard.press('Space'); // stop
await new Promise(r => setTimeout(r, 500));
const playStats = analyse(playFrames, '🅱️  PLAYBACK ONLY');

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario C: Arrow key scrolling only (no playback)
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n🅲  Scenario C: Arrow key scrolling only (no playback)...');

const [scrollOnlyFrames] = await Promise.all([
  injectMeasurer(page, durationSec * 1000),
  scrollArrowKeys(page, durationSec * 1000, 100),
]);
await new Promise(r => setTimeout(r, 500));
const scrollOnlyStats = analyse(scrollOnlyFrames, '🅲  SCROLL ONLY (no playback)');

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario D: Playback + arrow key scrolling
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n🅳  Scenario D: Playback + arrow key scrolling...');
await page.keyboard.press('Space'); // play
await new Promise(r => setTimeout(r, 1000)); // settle

// Run rAF measurer and arrow keys concurrently
const [scrollPlayFrames] = await Promise.all([
  injectMeasurer(page, durationSec * 1000),
  scrollArrowKeys(page, durationSec * 1000, 100),
]);

await page.keyboard.press('Space'); // stop
await new Promise(r => setTimeout(r, 500));
const scrollPlayStats = analyse(scrollPlayFrames, '🅳  PLAYBACK + ARROW SCROLLING');

// ═══════════════════════════════════════════════════════════════════════════════
// Summary comparison
// ═══════════════════════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(68)}`);
console.log('  COMPARISON SUMMARY');
console.log(`${'═'.repeat(68)}`);
const cols = [idleStats, playStats, scrollOnlyStats, scrollPlayStats];
const hdrs = ['Idle', 'Playback', 'Scroll', 'Play+Scroll'];
const row = (label, fn) =>
  console.log(`  ${label.padEnd(16)} ${cols.map(s => fn(s).padStart(12)).join('')}`);
console.log(`  ${''.padEnd(16)} ${hdrs.map(h => h.padStart(12)).join('')}`);
console.log(`  ${'─'.repeat(64)}`);
row('Avg FPS',       s => s?.avgFps?.toFixed(1) ?? '-');
row('P50 dt (ms)',   s => s?.p50?.toFixed(2) ?? '-');
row('P95 dt (ms)',   s => s?.p95?.toFixed(2) ?? '-');
row('P99 dt (ms)',   s => s?.p99?.toFixed(2) ?? '-');
row('Jank %',        s => s ? (s.jank * 100).toFixed(1) + '%' : '-');
row('Stutter %',     s => s ? (s.stutter * 100).toFixed(1) + '%' : '-');
row('Frames',        s => String(s?.n ?? '-'));
console.log(`${'═'.repeat(68)}\n`);

// ═══════════════════════════════════════════════════════════════════════════════
// Optional: CDP flame-chart trace (scenario C)
// ═══════════════════════════════════════════════════════════════════════════════
if (wantTrace) {
  console.log('📊 Capturing 10s CDP trace (playback + scrolling)...');
  const client = await page.createCDPSession();

  await page.keyboard.press('Space'); // play
  await new Promise(r => setTimeout(r, 500));

  await client.send('Tracing.start', {
    categories: [
      'devtools.timeline',
      'v8.execute',
      'blink.user_timing',
      'disabled-by-default-devtools.timeline.frame',
      'disabled-by-default-v8.cpu_profiler',
    ].join(','),
    options: 'sampling-frequency=1000',
  });

  // Scroll while tracing
  await scrollArrowKeys(page, 10_000, 100);

  await page.keyboard.press('Space'); // stop

  const traceChunks = [];
  client.on('Tracing.dataCollected', (data) => traceChunks.push(...data.value));
  await new Promise((resolve) => {
    client.once('Tracing.tracingComplete', resolve);
    client.send('Tracing.end');
  });

  const tracePath = path.join(process.cwd(), 'logs', 'perf-trace.json');
  fs.mkdirSync(path.dirname(tracePath), { recursive: true });
  fs.writeFileSync(tracePath, JSON.stringify(traceChunks));
  console.log(`💾 Trace saved: ${tracePath}`);
  console.log(`   Open in Chrome → chrome://tracing → Load`);

  // Hot functions summary
  const byFn = new Map();
  for (const ev of traceChunks) {
    if (ev.name === 'FunctionCall' && ev.args?.data?.functionName) {
      const fn = ev.args.data.functionName;
      const dur = (ev.dur || 0) / 1000;
      const url = ev.args.data.url?.split('/').pop()?.split('?')[0] || '';
      const cur = byFn.get(fn) || { count: 0, totalMs: 0, url };
      cur.count++; cur.totalMs += dur;
      byFn.set(fn, cur);
    }
  }
  const hot = [...byFn.entries()].sort((a, b) => b[1].totalMs - a[1].totalMs).slice(0, 15);
  if (hot.length) {
    console.log('\n🔥 Top 15 hottest functions:');
    for (const [name, { count, totalMs, url: u }] of hot) {
      console.log(`   ${totalMs.toFixed(1).padStart(8)}ms  (${String(count).padStart(5)}×)  ${name}  [${u}]`);
    }
  }
  console.log('');
}

await browser.close();
console.log('Done.\n');
