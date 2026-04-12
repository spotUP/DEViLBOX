/**
 * FX Audit Script — Tests every master effect for:
 * 1. Audio passes through (not silent)
 * 2. Knob changes actually affect audio (param responsiveness)
 *
 * Results pushed live to format-status tracker at localhost:4444
 * Usage: npx tsx tools/fx-audit.ts [--only <effectType>]
 */
import WebSocket from 'ws';
import http from 'http';
import { randomUUID } from 'crypto';

const WS_URL = 'ws://localhost:4003/mcp';

// All effect types from unifiedEffects.ts
const ALL_EFFECTS = [
  'Compressor', 'EQ3', 'Distortion', 'BitCrusher', 'Chebyshev', 'TapeSaturation',
  'Reverb', 'JCReverb', 'Delay', 'FeedbackDelay', 'PingPongDelay',
  'Chorus', 'Phaser', 'Tremolo', 'Vibrato', 'AutoPanner',
  'Filter', 'AutoFilter', 'AutoWah', 'StereoWidener', 'PitchShift', 'FrequencyShifter',
  'BiPhase', 'DubFilter', 'MoogFilter', 'AmbientDelay', 'SidechainCompressor',
  'SpaceEcho', 'SpaceyDelayer', 'RETapeEcho', 'MVerb', 'Leslie', 'SpringReverb',
  'VinylNoise', 'ToneArm', 'Tumult', 'TapeSimulator', 'ShimmerReverb', 'GranularFreeze',
  'TapeDegradation', 'Masha',
  'Maximizer', 'Limiter', 'MonoComp', 'Expander', 'Clipper', 'NoiseGate',
  'GOTTComp', 'MultibandComp', 'MultibandClipper', 'MultibandExpander',
  'MultibandDynamics', 'MultibandGate', 'MultibandLimiter', 'X42Comp',
  'AGC', 'Panda', 'BeatBreather', 'Ducka', 'TransientDesigner', 'DeEsser',
  'Overdrive', 'Flanger', 'RingMod', 'DragonflyPlate', 'DragonflyHall', 'DragonflyRoom',
  'JunoChorus', 'ParametricEQ', 'CabinetSim', 'TubeAmp', 'BassEnhancer',
  'ReverseDelay', 'VintageDelay', 'ArtisticDelay', 'Della', 'SlapbackDelay', 'ZamDelay',
  'AutoSat', 'DistortionShaper', 'Driva', 'Exciter', 'Satma', 'Saturator',
  'DynamicsProc', 'DynamicEQ', 'EQ5Band', 'EQ8Band', 'EQ12Band', 'GEQ31',
  'PhonoFilter', 'Kuiza', 'ZamEQ2',
  'Bitta', 'Vinyl', 'Vocoder', 'AutoTune',
  'CalfPhaser', 'Roomy', 'EarlyReflections', 'Pulsator', 'MultiChorus', 'MultiSpread',
  'MultibandEnhancer', 'HaasEnhancer', 'BinauralPanner', 'Vihda',
  'SidechainGate', 'SidechainLimiter',
];

// Knob test params: set min then max, check if audio level changes
const KNOB_TESTS: Record<string, { key: string; min: number; max: number }[]> = {
  Distortion:      [{ key: 'distortion', min: 0, max: 1 }],
  Reverb:          [{ key: 'decay', min: 0.1, max: 8 }],
  JCReverb:        [{ key: 'roomSize', min: 0, max: 0.99 }],
  Delay:           [{ key: 'feedback', min: 0, max: 0.9 }],  // feedback affects level; time only shifts echoes
  FeedbackDelay:   [{ key: 'feedback', min: 0, max: 0.9 }],
  Chorus:          [{ key: 'depth', min: 0, max: 1 }],
  Phaser:          [{ key: 'Q', min: 0.1, max: 10 }],  // Q affects resonance/level; frequency only affects LFO speed
  Filter:          [{ key: 'frequency', min: 100, max: 5000 }],
  BitCrusher:      [{ key: 'bits', min: 1, max: 8 }],
  Compressor:      [{ key: 'threshold', min: -60, max: 0 }],
  SpringReverb:    [{ key: 'decay', min: 0, max: 1 }],
  SpaceyDelayer:   [{ key: 'feedback', min: 0, max: 95 }],
  RETapeEcho:      [{ key: 'intensity', min: 0, max: 1 }],
  MVerb:           [{ key: 'size', min: 0, max: 1 }],
  VinylNoise:      [{ key: 'hiss', min: 0, max: 100 }],
  Tremolo:         [{ key: 'depth', min: 0, max: 1 }],
  MoogFilter:      [{ key: 'cutoff', min: 100, max: 5000 }],
  Flanger:         [{ key: 'depth', min: 0, max: 1 }],
  Leslie:          [{ key: 'speed', min: 0, max: 1 }],
  TapeSaturation:  [{ key: 'drive', min: 0, max: 100 }],
  TapeSimulator:   [{ key: 'drive', min: 0, max: 1 }],
  Overdrive:       [{ key: 'drive', min: 0, max: 1 }],
  EQ3:             [{ key: 'low', min: -12, max: 12 }],
  Limiter:         [{ key: 'threshold', min: -30, max: 0 }],
};

let ws: WebSocket;

function mcpCall(method: string, params: Record<string, unknown> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    const timeout = setTimeout(() => reject(new Error('timeout: ' + method)), 15000);
    const handler = (data: WebSocket.Data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.id === id) {
          clearTimeout(timeout);
          ws.removeListener('message', handler);
          if (msg.type === 'error') reject(new Error(msg.error));
          else resolve(msg.result?.data ?? msg.data ?? msg.result ?? msg);
        }
      } catch { /* ignore parse errors for other messages */ }
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id, type: 'call', method, params }));
  });
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function pushTracker(key: string, data: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ [key]: data });
    const req = http.request({
      hostname: 'localhost', port: 4444, path: '/push-updates', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => { let r = ''; res.on('data', c => r += c); res.on('end', () => resolve()); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function fxKey(type: string): string {
  return 'fx-' + type.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function toDb(rms: number): number {
  return rms > 0 ? 20 * Math.log10(rms) : -100;
}

async function measure(durationMs = 2000) {
  await ensurePlaying(); // Restart song if it ended during the test
  const r = await mcpCall('get_audio_level', { durationMs });
  return { rmsAvg: r?.rmsAvg ?? 0, peakMax: r?.peakMax ?? 0, silent: r?.silent ?? (r?.isSilent ?? true) };
}

async function ensurePlaying() {
  const pb = await mcpCall('get_playback_state');
  if (!pb?.isPlaying) {
    // Song ended — restart from the beginning
    await mcpCall('seek_to', { position: 0, row: 0 }).catch(() => {});
    await mcpCall('play', { mode: 'song' });
    await sleep(1500); // Let audio settle
  }
}

async function removeAll() {
  try {
    const state = await mcpCall('get_audio_state');
    for (const fx of (state?.masterEffects ?? [])) {
      await mcpCall('remove_master_effect', { effectId: fx.id }).catch(() => {});
    }
  } catch { /* connection lost — effects will be gone after browser reload anyway */ }
  await sleep(1500);
}

async function auditOne(type: string, baseRms: number) {
  const key = fxKey(type);
  process.stdout.write('[' + type + '] ');

  try {
    await ensurePlaying();
    await mcpCall('clear_console_errors');
    await mcpCall('add_master_effect', { effectType: type });
    await sleep(4000); // WASM effects need time to init worklet + connect

    let state = await mcpCall('get_audio_state');
    let fx = (state?.masterEffects ?? []).find((f: any) => f.type === type);
    if (!fx) {
      // Debug: show what IS in the chain, then retry
      const types = (state?.masterEffects ?? []).map((f: any) => f.type).join(', ') || '(empty)';
      process.stdout.write('(retry, chain: [' + types + ']) ');
      await sleep(3000);
      state = await mcpCall('get_audio_state');
      fx = (state?.masterEffects ?? []).find((f: any) => f.type === type);
      if (!fx) {
        const types2 = (state?.masterEffects ?? []).map((f: any) => f.type).join(', ') || '(empty)';
        console.log('FAIL: not found [' + types2 + ']');
        await pushTracker(key, { auditStatus: 'fail', notes: 'Not in store after 7s. Chain: ' + types2 });
        return;
      }
    }

    const lvl = await measure(2500);
    const rmsDb = toDb(lvl.rmsAvg);
    const diffDb = rmsDb - toDb(baseRms);
    const isSilent = lvl.rmsAvg < 0.001 || diffDb < -20;

    const errs = await mcpCall('get_console_errors');
    const errCount = ((errs?.entries ?? []) as any[]).filter((e: any) => e.level === 'error').length;

    // Knob test
    let knobResult: string | null = null;
    let knobsWork: boolean | null = null;
    const tests = KNOB_TESTS[type];
    if (tests && !isSilent) {
      for (const t of tests) {
        await mcpCall('update_master_effect', { effectId: fx.id, updates: { parameters: { ...fx.parameters, [t.key]: t.min } } });
        await sleep(800);
        const lo = await measure(1500);
        await mcpCall('update_master_effect', { effectId: fx.id, updates: { parameters: { ...fx.parameters, [t.key]: t.max } } });
        await sleep(800);
        const hi = await measure(1500);
        const d = Math.abs(toDb(hi.rmsAvg) - toDb(lo.rmsAvg));
        knobResult = t.key + ':' + d.toFixed(1) + 'dB';
        knobsWork = d > 0.5;
      }
    }

    // Status
    let status: string, notes: string;
    if (isSilent) {
      status = 'fail'; notes = 'SILENT rms=' + lvl.rmsAvg.toFixed(6) + ' diff=' + diffDb.toFixed(1) + 'dB';
    } else if (knobsWork === false) {
      status = 'fail'; notes = 'Audio OK, KNOBS DEAD [' + knobResult + '] diff=' + diffDb.toFixed(1) + 'dB';
    } else if (knobsWork === true) {
      status = 'fixed'; notes = 'OK [' + knobResult + '] diff=' + diffDb.toFixed(1) + 'dB';
    } else {
      status = lvl.rmsAvg > 0.005 ? 'fixed' : 'fail';
      notes = (status === 'fixed' ? 'OK' : 'weak') + ' rms=' + lvl.rmsAvg.toFixed(4) + ' diff=' + diffDb.toFixed(1) + 'dB';
    }
    if (errCount > 0) notes += ' | ' + errCount + ' errors';

    console.log((status === 'fixed' ? 'PASS' : 'FAIL') + ' ' + notes);
    await pushTracker(key, { auditStatus: status, notes, rmsDb: Math.round(rmsDb * 10) / 10, diffDb: Math.round(diffDb * 10) / 10, knobsWork });

  } catch (err: any) {
    console.log('CRASH: ' + err.message);
    await pushTracker(key, { auditStatus: 'fail', notes: 'CRASH: ' + err.message });
  } finally {
    await removeAll();
    await sleep(1000);
  }
}

/** Reconnect the WebSocket if it was closed */
async function ensureConnected(): Promise<void> {
  if (ws && ws.readyState === WebSocket.OPEN) return;
  console.log('  (reconnecting...)');
  ws = new WebSocket(WS_URL);
  await new Promise<void>((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });
  await sleep(2000); // Let browser settle after reconnect
}

/** Fetch current tracker state and return set of already-passing effect keys */
async function getPassingEffects(): Promise<Set<string>> {
  const passing = new Set<string>();
  try {
    const resp = await fetch('http://localhost:4444/get-data');
    const data = await resp.json() as Record<string, { auditStatus?: string }>;
    for (const [key, val] of Object.entries(data)) {
      if (val.auditStatus === 'fixed' || val.auditStatus === 'works') {
        passing.add(key);
      }
    }
  } catch { /* tracker not running */ }
  return passing;
}

async function main() {
  const onlyIdx = process.argv.indexOf('--only');
  const onlyType = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : null;
  const effects = onlyType ? ALL_EFFECTS.filter(e => e === onlyType) : ALL_EFFECTS;

  if (onlyType && effects.length === 0) { console.error('Unknown: ' + onlyType); process.exit(1); }

  // Skip effects that already pass in the tracker
  const alreadyPassing = await getPassingEffects();
  const toTest = effects.filter(fx => !alreadyPassing.has(fxKey(fx)));
  const skipped = effects.length - toTest.length;

  console.log('FX Audit: ' + toTest.length + ' to test (' + skipped + ' already passing) -> http://localhost:4444\n');
  if (toTest.length === 0) { console.log('All effects already passing!'); process.exit(0); }

  ws = new WebSocket(WS_URL);
  await new Promise<void>((resolve, reject) => { ws.on('open', resolve); ws.on('error', reject); });

  // Ensure song is playing AND looping so it doesn't end mid-audit
  await ensurePlaying();
  try { await mcpCall('execute_command', { command: 'setLooping', args: [true] }); } catch { /* */ }
  const pb = await mcpCall('get_playback_state');
  if (!pb?.isPlaying) { console.error('Nothing playing!'); ws.close(); process.exit(1); }
  console.log('Playing at ' + pb.bpm + ' BPM (looping)');

  await removeAll();
  let base = await measure(3000);
  console.log('Baseline: ' + toDb(base.rmsAvg).toFixed(1) + ' dBFS\n');

  if (base.rmsAvg < 0.01) console.error('WARNING: Baseline very low!');

  await pushTracker('fx-baseline', { auditStatus: 'fixed', notes: 'Baseline: ' + toDb(base.rmsAvg).toFixed(1) + ' dBFS', rmsDb: Math.round(toDb(base.rmsAvg) * 10) / 10 });

  for (const fx of toTest) {
    try {
      await ensureConnected();
      await auditOne(fx, base.rmsAvg);
    } catch (err: any) {
      console.log('[' + fx + '] CONNECTION ERROR: ' + err.message + ' — reconnecting...');
      await pushTracker(fxKey(fx), { auditStatus: 'fail', notes: 'Connection lost: ' + err.message });
      await sleep(5000);
      try {
        await ensureConnected();
        await ensurePlaying();
        const newBase = await measure(2000);
        if (newBase.rmsAvg > 0.001) base.rmsAvg = newBase.rmsAvg;
      } catch { /* will retry on next iteration */ }
    }
  }

  console.log('\nDone.');
  ws.close();
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
