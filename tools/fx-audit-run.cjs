const WebSocket = require('ws');
const { randomUUID } = require('crypto');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let ws = null;

function connect() {
  return new Promise((resolve, reject) => {
    ws = new WebSocket('ws://localhost:4003/mcp');
    ws.on('open', () => resolve());
    ws.on('error', (e) => reject(e));
    // Give it 5s
    setTimeout(() => reject(new Error('WS connect timeout')), 5000);
  });
}

function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return reject(new Error('No browser connected'));
    }
    const id = randomUUID();
    const timeout = setTimeout(() => {
      ws.removeListener('message', handler);
      reject(new Error(`Timeout: ${method}`));
    }, 15000);
    const handler = (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.id === id) {
          clearTimeout(timeout);
          ws.removeListener('message', handler);
          if (msg.type === 'error') reject(new Error(msg.error));
          else resolve(msg.data);
        }
      } catch {}
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id, type: 'call', method, params }));
  });
}

async function ensureConnected() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      await call('get_playback_state');
      return true;
    } catch {}
  }
  // Reconnect
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      if (ws) try { ws.close(); } catch {}
      await connect();
      await call('get_playback_state');
      return true;
    } catch {
      await sleep(2000);
    }
  }
  return false;
}

async function ensurePlayback() {
  // Start the test tone if not already playing
  try {
    const result = await call('test_tone', { action: 'start', frequency: 440, level: -12 });
    if (result.error) {
      // Fallback to loading a song
      const fs = require('fs');
      const path = require('path');
      const filePath = path.join(__dirname, '..', 'public', 'data', 'songs', 'formats', 'a sleep so deep.mod');
      const data = fs.readFileSync(filePath);
      const base64 = data.toString('base64');
      await call('load_file', { filename: path.basename(filePath), data: base64 });
      await sleep(1500);
      await call('play');
      await sleep(2000);
    } else {
      await sleep(500);
    }
  } catch {
    return false;
  }
  const level = await call('get_audio_level', { durationMs: 500 });
  return !level.silent;
}

async function cleanEffects() {
  try {
    const state = await call('get_audio_state');
    for (const fx of (state.masterEffects || [])) {
      await call('remove_master_effect', { effectId: fx.id });
    }
    await sleep(500);
  } catch {}
}

const FX_TYPES = [
  // Tone.js effects
  'Distortion', 'Reverb', 'Delay', 'Chorus', 'Phaser', 'Tremolo', 'Vibrato',
  'AutoFilter', 'AutoPanner', 'AutoWah', 'BitCrusher', 'Chebyshev',
  'Compressor', 'EQ3', 'FeedbackDelay', 'Filter', 'FrequencyShifter',
  'JCReverb', 'PingPongDelay', 'PitchShift', 'StereoWidener',
  'TapeSaturation', 'BiPhase', 'DubFilter', 'SidechainCompressor',
  // WASM — original batch
  'MoogFilter', 'SpaceEcho', 'SpaceyDelayer', 'RETapeEcho', 'MVerb', 'Leslie',
  'SpringReverb', 'VinylNoise', 'ToneArm', 'ShimmerReverb',
  'GranularFreeze', 'TapeDegradation', 'AmbientDelay',
  'NoiseGate', 'Limiter', 'Flanger', 'Overdrive', 'RingMod',
  'DragonflyPlate', 'DragonflyHall', 'DragonflyRoom',
  'JunoChorus', 'ParametricEQ', 'CabinetSim', 'TubeAmp', 'DeEsser',
  'MultibandComp', 'TransientDesigner', 'BassEnhancer', 'Expander',
  // WASM — Delays
  'ReverseDelay', 'VintageDelay', 'ArtisticDelay', 'SlapbackDelay', 'ZamDelay',
  // WASM — Distortion
  'Saturator', 'Exciter', 'AutoSat', 'Satma', 'DistortionShaper',
  // WASM — Dynamics
  'MonoComp', 'SidechainGate', 'MultibandGate', 'MultibandLimiter',
  'SidechainLimiter', 'Clipper', 'DynamicsProc', 'X42Comp',
  'Ducka', 'BeatBreather', 'MultibandClipper', 'MultibandDynamics',
  'MultibandExpander', 'GOTTComp', 'Maximizer', 'AGC', 'Panda',
  // WASM — EQ & Filter
  'EQ5Band', 'EQ8Band', 'EQ12Band', 'GEQ31', 'ZamEQ2', 'PhonoFilter', 'DynamicEQ', 'Kuiza',
  // WASM — Stereo & Spatial
  'HaasEnhancer', 'MultiSpread', 'MultibandEnhancer', 'BinauralPanner', 'Vihda',
  // WASM — Creative / Modulation
  'EarlyReflections', 'Pulsator', 'Masha', 'Vinyl',
  'MultiChorus', 'CalfPhaser',
  // WASM — Remaining
  'Della', 'Driva', 'Roomy', 'Bitta',
];

async function main() {
  console.log('Connecting...');
  if (!await ensureConnected()) {
    console.log('Cannot connect to browser. Please open DEViLBOX and refresh.');
    process.exit(1);
  }

  // Start a steady -12dBFS 440Hz test tone routed through master effects chain
  console.log('Starting test tone (440Hz, -12dBFS)...');
  const toneResult = await call('test_tone', { action: 'start', frequency: 440, level: -12 });
  if (toneResult.error) {
    console.log(`test_tone failed: ${toneResult.error} — falling back to song playback`);
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(__dirname, '..', 'public', 'data', 'songs', 'formats', 'a sleep so deep.mod');
    const data = fs.readFileSync(filePath);
    const base64 = data.toString('base64');
    const filename = path.basename(filePath);
    await call('load_file', { filename, data: base64 });
    await sleep(1500);
    await call('play');
    await sleep(2000);
  } else {
    console.log(`Test tone: ${toneResult.status} @ ${toneResult.frequency}Hz, ${toneResult.levelDb}dBFS`);
    await sleep(1000);
  }

  // Clean any leftover effects from previous runs
  await cleanEffects();
  await sleep(500);

  // Measure baseline
  console.log('\n=== BASELINE ===');
  const baseline = await call('get_audio_level', { durationMs: 1500 });
  if (baseline.silent) {
    console.log('SILENT baseline! Click browser to resume AudioContext, then re-run.');
    process.exit(1);
  }
  const baselineDb = 20 * Math.log10(Math.max(baseline.rmsAvg, 1e-10));
  console.log(`RMS: ${baseline.rmsAvg.toFixed(4)}, Peak: ${baseline.peakMax.toFixed(4)}, Level: ${baselineDb.toFixed(1)} dBFS\n`);

  const results = [];

  for (const fxType of FX_TYPES) {
    process.stdout.write(`Testing ${fxType.padEnd(20)}... `);

    // Ensure connection and playback before each test
    if (!await ensureConnected()) {
      console.log('LOST CONNECTION - waiting for browser...');
      await sleep(5000);
      if (!await ensureConnected()) {
        console.log('SKIP - no browser');
        results.push({ type: fxType, error: 'no connection' });
        continue;
      }
    }

    // Clean any leftover effects
    await cleanEffects();

    // Verify audio is flowing
    if (!await ensurePlayback()) {
      console.log('SKIP - no audio');
      results.push({ type: fxType, error: 'no audio' });
      continue;
    }

    try {
      const t0 = Date.now();

      // Add effect
      await call('add_master_effect', { effectType: fxType, force: true });
      await sleep(800); // Wait for async React effect chain rebuild

      // Get effect ID
      const stateAfterAdd = await call('get_audio_state');
      const fxList = stateAfterAdd.masterEffects || [];
      const addedFx = fxList.find(f => f.type === fxType);

      if (!addedFx) {
        console.log('NOT ADDED');
        results.push({ type: fxType, error: 'not added' });
        continue;
      }

      const fxId = addedFx.id;

      // Wait for init — check every 500ms up to 5s
      let initTime = 0;
      let firstNonSilent = false;
      for (let i = 0; i < 10; i++) {
        await sleep(500);
        initTime = Date.now() - t0;
        const level = await call('get_audio_level', { durationMs: 300 });
        if (!level.silent) {
          firstNonSilent = true;
          break;
        }
      }

      // Final measurement
      const withFx = await call('get_audio_level', { durationMs: 1500 });
      const fxDb = 20 * Math.log10(Math.max(withFx.rmsAvg, 1e-10));
      const diffDb = fxDb - baselineDb;

      const status = withFx.silent ? 'SILENT'
        : diffDb < -12 ? 'VERY QUIET'
        : diffDb < -6 ? 'QUIET'
        : diffDb > 12 ? 'VERY LOUD'
        : diffDb > 6 ? 'LOUD'
        : 'OK';

      const initStatus = initTime > 3000 ? 'SLOW' : initTime > 1500 ? 'WARN' : 'OK';

      const diffStr = (diffDb > 0 ? '+' : '') + diffDb.toFixed(1);
      console.log(`${status.padEnd(10)} ${fxDb.toFixed(1).padStart(6)}dB (${diffStr}dB)  init:${String(initTime).padStart(5)}ms ${initStatus}`);

      results.push({
        type: fxType,
        rmsAvg: withFx.rmsAvg,
        rmsDb: +fxDb.toFixed(1),
        diffDb: +diffDb.toFixed(1),
        initMs: initTime,
        status,
        initStatus,
      });

      // Remove effect
      await call('remove_master_effect', { effectId: fxId });
      await sleep(1500); // Wait for async engine rebuild

    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      results.push({ type: fxType, error: err.message });
      await sleep(2000);
    }
  }

  // Stop test tone and playback
  try { await call('test_tone', { action: 'stop' }); } catch {}
  try { await call('stop'); } catch {}

  // Summary
  console.log('\n\n' + '='.repeat(70));
  console.log('FX AUDIT RESULTS');
  console.log('='.repeat(70));
  console.log(`Baseline: ${baselineDb.toFixed(1)} dBFS\n`);

  console.log('TYPE                    | dBFS   | vs BASE | INIT   | STATUS');
  console.log('------------------------+--------+---------+--------+-----------');
  for (const r of results) {
    if (r.error) {
      console.log(`${r.type.padEnd(24)}| ${'ERROR'.padStart(6)} |         |        | ${r.error}`);
    } else {
      const diffStr = (r.diffDb > 0 ? '+' : '') + r.diffDb.toFixed(1);
      const flags = [r.status];
      if (r.initStatus !== 'OK') flags.push(r.initStatus);
      console.log(`${r.type.padEnd(24)}| ${r.rmsDb.toFixed(1).padStart(6)} | ${diffStr.padStart(7)} | ${String(r.initMs + 'ms').padStart(6)} | ${flags.join(', ')}`);
    }
  }

  const silent = results.filter(r => r.status === 'SILENT');
  const quiet = results.filter(r => r.status === 'VERY QUIET' || r.status === 'QUIET');
  const loud = results.filter(r => r.status === 'LOUD' || r.status === 'VERY LOUD');
  const slow = results.filter(r => r.initStatus === 'SLOW' || r.initStatus === 'WARN');
  const errors = results.filter(r => r.error);

  console.log('\n--- Issues ---');
  if (silent.length) console.log(`SILENT (${silent.length}): ${silent.map(r => r.type).join(', ')}`);
  if (quiet.length)  console.log(`QUIET  (${quiet.length}): ${quiet.map(r => r.type + '(' + r.diffDb + 'dB)').join(', ')}`);
  if (loud.length)   console.log(`LOUD   (${loud.length}): ${loud.map(r => r.type + '(+' + r.diffDb + 'dB)').join(', ')}`);
  if (slow.length)   console.log(`SLOW   (${slow.length}): ${slow.map(r => r.type + '(' + r.initMs + 'ms)').join(', ')}`);
  if (errors.length) console.log(`ERRORS (${errors.length}): ${errors.map(r => r.type + ': ' + r.error).join(', ')}`);

  // Report results to format-status tracker at localhost:4444
  console.log('\n--- Reporting to localhost:4444 ---');
  const updates = {};
  for (const r of results) {
    const key = `fx-${r.type.toLowerCase()}`;
    if (r.error) {
      updates[key] = {
        auditStatus: 'fail',
        notes: `ERROR: ${r.error}`,
        rmsDb: null,
        diffDb: null,
        initMs: null,
      };
    } else {
      updates[key] = {
        auditStatus: r.status === 'SILENT' ? 'silent' : r.status === 'OK' ? 'fixed' : 'fail',
        notes: `${r.status} | init:${r.initMs}ms ${r.initStatus} | ${r.diffDb > 0 ? '+' : ''}${r.diffDb}dB vs baseline`,
        rmsDb: r.rmsDb,
        diffDb: r.diffDb,
        initMs: r.initMs,
      };
    }
  }
  // Add baseline entry
  updates['fx-baseline'] = {
    auditStatus: 'fixed',
    notes: `Baseline: ${baselineDb.toFixed(1)} dBFS`,
    rmsDb: +baselineDb.toFixed(1),
  };

  try {
    const http = require('http');
    const body = JSON.stringify(updates);
    await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: 'localhost',
        port: 4444,
        path: '/push-updates',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          console.log(`Pushed ${Object.keys(updates).length} results to localhost:4444 (HTTP ${res.statusCode})`);
          resolve();
        });
      });
      req.on('error', (e) => {
        console.log(`Could not reach localhost:4444: ${e.message}`);
        resolve(); // Don't fail the audit if tracker is down
      });
      req.write(body);
      req.end();
    });
  } catch (e) {
    console.log(`Tracker report failed: ${e.message}`);
  }
  process.exit(0);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
