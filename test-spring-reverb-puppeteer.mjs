#!/usr/bin/env node
/**
 * Puppeteer test: Switch dub presets and verify reverb is alive for each.
 * Runs against the dev server at localhost:5173.
 *
 * Usage: node test-spring-reverb-puppeteer.mjs
 */
import puppeteer from 'puppeteer';

const BASE = 'http://localhost:5173';
const TIMEOUT = 60_000;

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  console.log('🚀 Launching browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--autoplay-policy=no-user-gesture-required',
      '--no-sandbox',
    ],
  });

  const page = await browser.newPage();

  // Collect dub bus log lines
  const dubLogs = [];
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[DubBus]') || text.includes('[DubBusCtrl]') ||
        text.includes('[DubBusSnap]') || text.includes('[SpringTap]')) {
      dubLogs.push(text);
      console.log(`  🔈 ${text}`);
    }
  });
  page.on('pageerror', err => console.error('  ❌ PAGE ERROR:', err.message));

  console.log('📄 Navigating to app...');
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: TIMEOUT });
  await sleep(4000); // let stores + Tone.js init

  // Unlock AudioContext via user gesture
  console.log('🔊 Unlocking AudioContext...');
  await page.click('body').catch(() => {});
  await page.evaluate(() => {
    const ctx = window.Tone?.getContext()?.rawContext;
    if (ctx?.state !== 'running') ctx?.resume();
  });
  await sleep(500);

  // Check if Zustand stores are accessible
  console.log('🔍 Checking store access...');
  const storeCheck = await page.evaluate(() => {
    // Zustand stores expose getState() — try the known import path
    // In dev mode, modules are available via dynamic import
    return {
      hasTone: !!window.Tone,
      toneCtxState: window.Tone?.getContext()?.rawContext?.state,
    };
  });
  console.log('  Tone:', storeCheck);

  // Import store modules in page context and expose helpers.
  // Vite dev server modules are served with .ts extension.
  console.log('🔧 Setting up test helpers...');
  const setupOk = await page.evaluate(async () => {
    try {
      const padRoutingMod = await import('./src/hooks/drumpad/useMIDIPadRouting.ts');
      const drumPadStoreMod = await import('./src/stores/useDrumPadStore.ts');
      const trackerStoreMod = await import('./src/stores/useTrackerStore.ts');
      window.__test = {
        getDrumPadEngine: padRoutingMod.getDrumPadEngine,
        ensureDrumPadEngine: padRoutingMod.ensureDrumPadEngine,
        useDrumPadStore: drumPadStoreMod.useDrumPadStore,
        useTrackerStore: trackerStoreMod.useTrackerStore,
      };
      return { ok: true };
    } catch (e1) {
      // Fallback: try without extension
      try {
        const padRoutingMod = await import('./src/hooks/drumpad/useMIDIPadRouting');
        const drumPadStoreMod = await import('./src/stores/useDrumPadStore');
        const trackerStoreMod = await import('./src/stores/useTrackerStore');
        window.__test = {
          getDrumPadEngine: padRoutingMod.getDrumPadEngine,
          ensureDrumPadEngine: padRoutingMod.ensureDrumPadEngine,
          useDrumPadStore: drumPadStoreMod.useDrumPadStore,
          useTrackerStore: trackerStoreMod.useTrackerStore,
        };
        return { ok: true };
      } catch (e2) {
        return { error: e1.message + ' || ' + e2.message };
      }
    }
  });
  console.log('  Setup:', setupOk);
  if (setupOk.error) {
    console.error('  Failed to import stores. Aborting.');
    await browser.close();
    process.exit(1);
  }

  // Check if there's a song loaded, if not load one
  const hasSong = await page.evaluate(() => {
    const store = window.__test?.useTrackerStore;
    if (!store) return false;
    const state = store.getState();
    return state.patterns && state.patterns.length > 0;
  });
  console.log('  Song loaded:', hasSong);

  if (!hasSong) {
    console.log('📂 No song loaded. Generating test tone...');
    // Instead of loading a file, create a simple oscillator to feed the dub bus
    await page.evaluate(async () => {
      try {
        // Try loading a test file first
        const { handleFileDrop } = await import('./src/lib/import/handleFileDrop.ts');
        const resp = await fetch('/test-data/synth-effects-test.xm');
        if (resp.ok) {
          const buf = await resp.arrayBuffer();
          const file = new File([buf], 'test.xm');
          await handleFileDrop([file]);
          return;
        }
      } catch {}
      // Fallback: just ensure we have some audio flowing
      console.log('[test] No file loaded, will use dub bus noise floor');
    });
    await sleep(3000);
  }

  // Start playback
  console.log('▶️  Starting playback...');
  await page.evaluate(() => {
    const store = window.__test?.useTrackerStore;
    if (store) {
      const state = store.getState();
      if (state.play) state.play();
    }
  });
  await sleep(2000);

  // Ensure DrumPadEngine exists (creates DubBus)
  console.log('🔧 Ensuring DrumPadEngine...');
  await page.evaluate(() => {
    window.__test.ensureDrumPadEngine();
  });
  await sleep(500);

  // Step 1: Enable dub bus with custom preset
  console.log('\n━━━ Step 1: Enable dub bus (custom preset) ━━━');
  await page.evaluate(() => {
    const store = window.__test.useDrumPadStore;
    store.getState().setDubBus({
      enabled: true,
      characterPreset: 'custom',
      returnGain: 0.85,
      springWet: 0.55,
      echoWet: 0.70,
      echoIntensity: 0.62,
      sidechainAmount: 0.15,
    });
  });
  await sleep(3000);

  // Measure custom preset (baseline)
  const customResult = await measureSpring(page);
  console.log(`  custom: rms=${customResult.rmsDb?.toFixed(1)}dB peak=${customResult.peak?.toFixed(4)} returnGain=${customResult.returnGain} scThreshold=${customResult.scThreshold} scReduction=${customResult.scReduction}`);

  // Step 2: Switch to scientist (known working control)
  console.log('\n━━━ Step 2: Switch to scientist (control) ━━━');
  await page.evaluate(() => {
    window.__test.useDrumPadStore.getState().setDubBus({ characterPreset: 'scientist' });
  });
  await sleep(3000);
  const scientistResult = await measureSpring(page);
  console.log(`  scientist: rms=${scientistResult.rmsDb?.toFixed(1)}dB peak=${scientistResult.peak?.toFixed(4)} returnGain=${scientistResult.returnGain} scThreshold=${scientistResult.scThreshold} scReduction=${scientistResult.scReduction}`);

  // Step 3: Switch to tubby (the broken one)
  console.log('\n━━━ Step 3: Switch to tubby ━━━');
  dubLogs.length = 0; // clear log buffer
  await page.evaluate(() => {
    window.__test.useDrumPadStore.getState().setDubBus({ characterPreset: 'tubby' });
  });
  // Wait for full warmup (800ms hold + 20ms ramp + margin)
  await sleep(3000);
  const tubbyResult = await measureSpring(page);
  console.log(`  tubby: rms=${tubbyResult.rmsDb?.toFixed(1)}dB peak=${tubbyResult.peak?.toFixed(4)} returnGain=${tubbyResult.returnGain} scThreshold=${tubbyResult.scThreshold} scReduction=${tubbyResult.scReduction}`);

  // Step 4: Switch to madProfessor
  console.log('\n━━━ Step 4: Switch to madProfessor ━━━');
  dubLogs.length = 0;
  await page.evaluate(() => {
    window.__test.useDrumPadStore.getState().setDubBus({ characterPreset: 'madProfessor' });
  });
  await sleep(3000);
  const madProfResult = await measureSpring(page);
  console.log(`  madProfessor: rms=${madProfResult.rmsDb?.toFixed(1)}dB peak=${madProfResult.peak?.toFixed(4)} returnGain=${madProfResult.returnGain} scThreshold=${madProfResult.scThreshold} scReduction=${madProfResult.scReduction}`);

  // Step 5: Switch to perry
  console.log('\n━━━ Step 5: Switch to perry ━━━');
  await page.evaluate(() => {
    window.__test.useDrumPadStore.getState().setDubBus({ characterPreset: 'perry' });
  });
  await sleep(3000);
  const perryResult = await measureSpring(page);
  console.log(`  perry: rms=${perryResult.rmsDb?.toFixed(1)}dB peak=${perryResult.peak?.toFixed(4)} returnGain=${perryResult.returnGain} scThreshold=${perryResult.scThreshold} scReduction=${perryResult.scReduction}`);

  // Summary
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const results = { custom: customResult, scientist: scientistResult, tubby: tubbyResult, madProfessor: madProfResult, perry: perryResult };
  let allPass = true;
  for (const [name, r] of Object.entries(results)) {
    if (r.error) {
      console.log(`  ❌ ${name}: ERROR - ${r.error}`);
      allPass = false;
    } else if (r.rmsDb < -60) {
      console.log(`  ❌ ${name}: SILENT (rms=${r.rmsDb?.toFixed(1)}dB)`);
      allPass = false;
    } else if (r.rmsDb < -40) {
      console.log(`  ⚠️  ${name}: VERY QUIET (rms=${r.rmsDb?.toFixed(1)}dB)`);
      if (name === 'tubby' || name === 'madProfessor') allPass = false;
    } else {
      console.log(`  ✅ ${name}: ALIVE (rms=${r.rmsDb?.toFixed(1)}dB peak=${r.peak?.toFixed(3)})`);
    }
  }

  console.log(`\n${allPass ? '✅ ALL PASS' : '❌ SOME FAILED'}`);

  await browser.close();
  process.exit(allPass ? 0 : 1);
}

/**
 * Measure spring output + bus state via an AnalyserNode.
 * Returns { rmsDb, peak, returnGain, scThreshold, scReduction, error? }
 */
async function measureSpring(page) {
  return page.evaluate(async () => {
    try {
      const engine = window.__test.getDrumPadEngine();
      if (!engine) return { error: 'No engine' };
      const bus = engine.getDubBus();
      if (!bus) return { error: 'No bus' };

      const ctx = bus.context;
      if (!ctx) return { error: 'No context' };

      // Get native spring output node
      const spring = bus.spring;
      if (!spring) return { error: 'No spring on bus' };

      // Dig through Tone.js wrapper to find native AudioNode
      const findNative = (node) => {
        if (node instanceof AudioNode) return node;
        // Tone.js common patterns
        for (const k of ['_gainNode', 'input', '_nativeAudioNode', '_node', 'output']) {
          const child = node?.[k];
          if (child instanceof AudioNode) return child;
          // One level deeper
          if (child) {
            for (const k2 of ['_gainNode', 'input', '_nativeAudioNode']) {
              if (child[k2] instanceof AudioNode) return child[k2];
            }
          }
        }
        return null;
      };

      const springNative = findNative(spring.output);
      if (!springNative) {
        return { error: 'Cannot find native spring output node', keys: Object.keys(spring.output || {}).join(',') };
      }

      // Analyser on spring output
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0;
      springNative.connect(analyser);

      // Take 5 measurements over 1s, report max
      let maxRms = 0, maxPeak = 0;
      for (let i = 0; i < 5; i++) {
        await new Promise(r => setTimeout(r, 200));
        const buf = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(buf);
        let sumSq = 0, peak = 0;
        for (let j = 0; j < buf.length; j++) {
          sumSq += buf[j] * buf[j];
          const a = Math.abs(buf[j]);
          if (a > peak) peak = a;
        }
        const rms = Math.sqrt(sumSq / buf.length);
        if (rms > maxRms) maxRms = rms;
        if (peak > maxPeak) maxPeak = peak;
      }

      try { springNative.disconnect(analyser); } catch {}

      const rmsDb = maxRms > 0 ? 20 * Math.log10(maxRms) : -Infinity;

      // Bus state
      const returnGain = bus.return_?.gain?.value ?? 'N/A';
      const scThreshold = bus.sidechain?.threshold?.value ?? 'N/A';
      const scReduction = bus.sidechain?.reduction ?? 'N/A';
      const inputGain = bus.input?.gain?.value ?? 'N/A';
      const feedbackGain = bus.feedback?.gain?.value ?? 'N/A';
      const enabled = bus.enabled;
      const echoType = bus._currentEchoEngine ?? 'unknown';

      return {
        rmsDb, rms: maxRms, peak: maxPeak,
        returnGain, scThreshold, scReduction,
        inputGain, feedbackGain, enabled, echoType,
      };
    } catch (e) {
      return { error: e.message, stack: e.stack?.split('\n').slice(0, 3).join(' | ') };
    }
  });
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
