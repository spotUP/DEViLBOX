/**
 * FX Preset Volume Audit — Measures output level of every FX preset
 * using a rich full-spectrum test tone (sub bass → air + noise).
 *
 * Phase 1: Individual effects at default params (wet=50%), updates effectGainCompensation.ts
 * Phase 2: Full preset chains with their specific wet/params, outputs per-preset gainDb
 *
 * Usage:
 *   npx tsx tools/fx-preset-audit.ts                    # both phases
 *   npx tsx tools/fx-preset-audit.ts --phase 1          # individual effects only
 *   npx tsx tools/fx-preset-audit.ts --phase 2          # presets only
 *   npx tsx tools/fx-preset-audit.ts --only "DJ Booth"  # single preset
 *
 * Prerequisites: npm run dev running, browser open at localhost:5173
 */
import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WS_URL = 'ws://localhost:4003/mcp';

// ── All individual effect types ──────────────────────────────────────────────

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
  'Aelapse', 'SwedishChainsaw', 'WAMStonePhaser', 'WAMBigMuff', 'WAMTS9',
  'WAMDistoMachine', 'WAMQuadraFuzz', 'WAMVoxAmp',
];

// ── Preset list (inline import not possible from .ts in tools — read dynamically) ──

interface PresetDef {
  name: string;
  gainCompensationDb?: number;
  effects: Array<{
    category: string;
    type: string;
    enabled: boolean;
    wet: number;
    parameters: Record<string, unknown>;
  }>;
}

function loadPresets(): PresetDef[] {
  // Parse presets from the source file — extract name + effects array
  const src = fs.readFileSync(
    path.join(__dirname, '../src/constants/fxPresets.ts'), 'utf-8'
  );

  // Use a simple state machine: find each `{ name: '...'` block
  const presets: PresetDef[] = [];
  const nameRe = /\{\s*name:\s*'([^']+)'/g;
  let m: RegExpExecArray | null;

  // Find each preset entry in the FX_PRESETS array
  const arrayStart = src.indexOf('export const FX_PRESETS');
  if (arrayStart < 0) return presets;

  const arrayBody = src.slice(arrayStart);

  // Split by `{ name:` — each segment is one preset
  const segments = arrayBody.split(/(?=\{\s*name:\s*')/);

  for (const seg of segments) {
    m = /^\{\s*name:\s*'([^']+)'/.exec(seg);
    if (!m) continue;
    const name = m[1];

    // Extract gainCompensationDb if present
    const compMatch = seg.match(/gainCompensationDb:\s*(-?\d+(?:\.\d+)?)/);
    const gainCompensationDb = compMatch ? parseFloat(compMatch[1]) : undefined;

    // Extract effects array
    const effectsMatch = seg.match(/effects:\s*\[([\s\S]*?)\]\s*\}/);
    if (!effectsMatch) continue;

    const effectsStr = effectsMatch[1];
    // Parse each effect object
    const effects: PresetDef['effects'] = [];
    const fxRe = /\{\s*category:\s*'([^']+)',\s*type:\s*'([^']+)',\s*enabled:\s*(true|false),\s*wet:\s*(\d+(?:\.\d+)?)/g;
    let fxM: RegExpExecArray | null;
    while ((fxM = fxRe.exec(effectsStr))) {
      effects.push({
        category: fxM[1],
        type: fxM[2],
        enabled: fxM[3] === 'true',
        wet: parseFloat(fxM[4]),
        parameters: {},
      });
    }

    // Re-parse to get parameters for each effect
    const fullFxRe = /\{\s*category:\s*'[^']+',\s*type:\s*'[^']+',\s*enabled:\s*(?:true|false),\s*wet:\s*\d+(?:\.\d+)?,\s*parameters:\s*(\{[^}]*\})/g;
    let idx = 0;
    let pfxM: RegExpExecArray | null;
    while ((pfxM = fullFxRe.exec(effectsStr))) {
      if (idx < effects.length) {
        try {
          // Convert JS object literal to JSON (add quotes to keys)
          let paramStr = pfxM[1]
            .replace(/(\w+)\s*:/g, '"$1":')
            .replace(/'/g, '"');
          effects[idx].parameters = JSON.parse(paramStr);
        } catch { /* use empty params */ }
      }
      idx++;
    }

    if (effects.length > 0) {
      presets.push({ name, gainCompensationDb, effects });
    }
  }

  return presets;
}

// ── MCP communication ────────────────────────────────────────────────────────

let ws: WebSocket;

function mcpCall(method: string, params: Record<string, unknown> = {}, timeoutMs = 20000): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const timeout = setTimeout(() => reject(new Error('timeout: ' + method)), timeoutMs);
    const handler = (data: WebSocket.Data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.id === id) {
          clearTimeout(timeout);
          ws.removeListener('message', handler);
          if (msg.type === 'error') reject(new Error(msg.error));
          else resolve(msg.result?.data ?? msg.data ?? msg.result ?? msg);
        }
      } catch { /* */ }
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id, type: 'call', method, params }));
  });
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
function toDb(rms: number): number { return rms > 0 ? 20 * Math.log10(rms) : -100; }

async function measure(durationMs = 2500) {
  const r = await mcpCall('get_audio_level', { durationMs });
  return { rmsAvg: r?.rmsAvg ?? 0, peakMax: r?.peakMax ?? 0, silent: r?.silent ?? true };
}

async function clearFx() {
  await mcpCall('set_master_effects', { effects: [] });
  await sleep(1500);
}

async function startRichTone() {
  await mcpCall('test_tone', { action: 'start', mode: 'rich', level: -6 });
  await sleep(2000); // let signal stabilize
}

async function stopTone() {
  await mcpCall('test_tone', { action: 'stop' });
  await sleep(500);
}

// ── Phase 1: Individual effects ──────────────────────────────────────────────

interface EffectResult {
  type: string;
  rmsDb: number;
  diffDb: number;
  status: 'ok' | 'hot' | 'quiet' | 'silent' | 'error';
}

async function auditIndividualEffects(baseRms: number): Promise<EffectResult[]> {
  const results: EffectResult[] = [];
  const baseDb = toDb(baseRms);

  console.log('\n═══ PHASE 1: Individual Effects (wet=50%, default params, rich tone) ═══\n');
  console.log(`Baseline: ${baseDb.toFixed(1)} dBFS (rms=${baseRms.toFixed(6)})\n`);

  for (const type of ALL_EFFECTS) {
    process.stdout.write(`  [${type}] `);

    try {
      await clearFx();

      // Add single effect at wet=50%
      await mcpCall('add_master_effect', { effectType: type, force: true });
      await sleep(4000); // WASM effects need init time

      const lvl = await measure(3000);
      const rmsDb = toDb(lvl.rmsAvg);
      const diffDb = rmsDb - baseDb;

      let status: EffectResult['status'];
      if (lvl.rmsAvg < 0.001) status = 'silent';
      else if (diffDb > 2) status = 'hot';
      else if (diffDb < -2) status = 'quiet';
      else status = 'ok';

      const icon = status === 'ok' ? '✓' : status === 'hot' ? '🔥' : status === 'quiet' ? '🔇' : '❌';
      console.log(`${icon} ${diffDb >= 0 ? '+' : ''}${diffDb.toFixed(1)} dB (rms=${lvl.rmsAvg.toFixed(4)})`);

      results.push({ type, rmsDb, diffDb, status });
    } catch (err: any) {
      console.log(`ERROR: ${err.message}`);
      results.push({ type, rmsDb: -100, diffDb: -100, status: 'error' });
    }
  }

  return results;
}

// ── Phase 2: Full presets ────────────────────────────────────────────────────

interface PresetResult {
  name: string;
  rmsDb: number;
  diffDb: number;
  compensationDb: number;
  effectTypes: string[];
  status: 'ok' | 'hot' | 'quiet' | 'silent' | 'error';
}

async function auditPresets(baseRms: number, only?: string): Promise<PresetResult[]> {
  const presets = loadPresets();
  const results: PresetResult[] = [];
  const baseDb = toDb(baseRms);

  const toTest = only
    ? presets.filter(p => p.name === only)
    : presets;

  console.log(`\n═══ PHASE 2: FX Presets (${toTest.length} presets, rich tone) ═══\n`);
  console.log(`Baseline: ${baseDb.toFixed(1)} dBFS\n`);

  for (const preset of toTest) {
    process.stdout.write(`  [${preset.name}] `);

    try {
      const hasNeural = preset.effects.some(e => e.type === 'Neural');
      const initWait = hasNeural ? 10000 : 5000; // Neural needs longer to load model

      // Set all effects WITH compensation — verify compensated volume
      await mcpCall('set_master_effects', {
        effects: preset.effects,
        gainCompensationDb: preset.gainCompensationDb ?? 0,
      });
      await sleep(initWait);

      const lvl = await measure(3000);
      const rmsDb = toDb(lvl.rmsAvg);
      const diffDb = rmsDb - baseDb;
      const compensationDb = -diffDb; // negate to bring back to baseline

      let status: PresetResult['status'];
      if (lvl.rmsAvg < 0.001) status = 'silent';
      else if (Math.abs(diffDb) > 2) status = diffDb > 0 ? 'hot' : 'quiet';
      else status = 'ok';

      const icon = status === 'ok' ? '✓' : status === 'hot' ? '🔥' : status === 'quiet' ? '🔇' : '❌';
      const types = preset.effects.map(e => e.type).join('+');
      console.log(`${icon} ${diffDb >= 0 ? '+' : ''}${diffDb.toFixed(1)} dB  [${types}]`);

      results.push({
        name: preset.name,
        rmsDb,
        diffDb,
        compensationDb: Math.round(compensationDb * 10) / 10,
        effectTypes: preset.effects.map(e => e.type),
        status,
      });
    } catch (err: any) {
      console.log(`ERROR: ${err.message}`);
      results.push({
        name: preset.name,
        rmsDb: -100,
        diffDb: -100,
        compensationDb: 0,
        effectTypes: preset.effects.map(e => e.type),
        status: 'error',
      });

      // If WS died, try to reconnect
      if (ws.readyState !== WebSocket.OPEN) {
        console.log('  ⚠️  Reconnecting WebSocket...');
        try {
          ws = new WebSocket(WS_URL);
          await new Promise<void>((resolve, reject) => {
            ws.on('open', resolve);
            ws.on('error', (e) => reject(e));
            setTimeout(() => reject(new Error('reconnect timeout')), 10000);
          });
          await sleep(2000);
          // Re-start the test tone after reconnect
          await startRichTone();
          await sleep(2000);
          console.log('  ✓ Reconnected, resuming...');
        } catch (reconErr: any) {
          console.error(`  ✗ Reconnect failed: ${reconErr.message} — aborting`);
          break;
        }
      }
    }

    // Clean up between presets
    await clearFx();
  }

  return results;
}

// ── Report ───────────────────────────────────────────────────────────────────

function printSummary(
  effectResults: EffectResult[],
  presetResults: PresetResult[],
) {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('                      AUDIT SUMMARY');
  console.log('══════════════════════════════════════════════════════════════\n');

  if (effectResults.length > 0) {
    const hot = effectResults.filter(r => r.status === 'hot');
    const quiet = effectResults.filter(r => r.status === 'quiet');
    const silent = effectResults.filter(r => r.status === 'silent');
    const ok = effectResults.filter(r => r.status === 'ok');

    console.log(`Individual Effects: ${ok.length} OK, ${hot.length} hot, ${quiet.length} quiet, ${silent.length} silent\n`);

    if (hot.length > 0) {
      console.log('  HOT (need negative compensation):');
      for (const r of hot.sort((a, b) => b.diffDb - a.diffDb))
        console.log(`    ${r.type}: +${r.diffDb.toFixed(1)} dB → needs ${(-r.diffDb).toFixed(1)} dB`);
    }
    if (quiet.length > 0) {
      console.log('  QUIET (need positive compensation):');
      for (const r of quiet.sort((a, b) => a.diffDb - b.diffDb))
        console.log(`    ${r.type}: ${r.diffDb.toFixed(1)} dB → needs +${(-r.diffDb).toFixed(1)} dB`);
    }
  }

  if (presetResults.length > 0) {
    const hot = presetResults.filter(r => r.status === 'hot');
    const quiet = presetResults.filter(r => r.status === 'quiet');
    const ok = presetResults.filter(r => r.status === 'ok');

    console.log(`\nPresets: ${ok.length} OK (±2dB), ${hot.length} hot, ${quiet.length} quiet\n`);

    console.log('  ALL PRESETS (sorted by delta):');
    for (const r of [...presetResults].sort((a, b) => b.diffDb - a.diffDb)) {
      const icon = r.status === 'ok' ? ' ' : r.status === 'hot' ? '🔥' : r.status === 'quiet' ? '🔇' : '❌';
      console.log(`  ${icon} ${(r.diffDb >= 0 ? '+' : '') + r.diffDb.toFixed(1).padStart(6)} dB  →  comp: ${(r.compensationDb >= 0 ? '+' : '') + r.compensationDb.toFixed(1).padStart(6)} dB  ${r.name}`);
    }

    // Output gainCompensation map for fxPresets.ts
    const needsComp = presetResults.filter(r => Math.abs(r.diffDb) > 1.0 && r.status !== 'error' && r.status !== 'silent');
    if (needsComp.length > 0) {
      console.log('\n  ── Suggested gainCompensation values for fxPresets.ts ──\n');
      for (const r of needsComp) {
        console.log(`  '${r.name}': ${r.compensationDb.toFixed(1)},`);
      }
    }
  }

  // Write full results JSON
  const outPath = path.join(__dirname, 'fx-preset-audit-results.json');
  fs.writeFileSync(outPath, JSON.stringify({ effectResults, presetResults }, null, 2));
  console.log(`\nFull results: ${outPath}`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const phaseIdx = args.indexOf('--phase');
  const phase = phaseIdx >= 0 ? parseInt(args[phaseIdx + 1]) : 0; // 0 = both
  const onlyIdx = args.indexOf('--only');
  const only = onlyIdx >= 0 ? args[onlyIdx + 1] : undefined;

  console.log('FX Preset Volume Audit');
  console.log('Test signal: Rich (5 oscillators + white noise, -12 dBFS)\n');

  ws = new WebSocket(WS_URL);
  await new Promise<void>((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', (e) => reject(new Error('Cannot connect to MCP relay at ' + WS_URL + ': ' + e.message)));
  });

  // Stop any playback, start rich test tone
  try { await mcpCall('stop'); } catch { /* not playing */ }
  await sleep(500);
  await clearFx();
  await startRichTone();

  // Measure baseline (no effects)
  const baseline = await measure(3000);
  const baseDb = toDb(baseline.rmsAvg);
  console.log(`Baseline (no FX): ${baseDb.toFixed(1)} dBFS (rms=${baseline.rmsAvg.toFixed(6)})`);

  if (baseline.rmsAvg < 0.001) {
    console.error('ERROR: Rich test tone is silent! Is the browser tab focused and AudioContext running?');
    await stopTone();
    ws.close();
    process.exit(1);
  }

  let effectResults: EffectResult[] = [];
  let presetResults: PresetResult[] = [];

  if (phase === 0 || phase === 1) {
    effectResults = await auditIndividualEffects(baseline.rmsAvg);
    await clearFx();

    // Re-verify baseline hasn't drifted
    const recheck = await measure(2000);
    const drift = Math.abs(toDb(recheck.rmsAvg) - baseDb);
    if (drift > 1) console.warn(`⚠️  Baseline drifted by ${drift.toFixed(1)} dB — results may be noisy`);
  }

  if (phase === 0 || phase === 2) {
    presetResults = await auditPresets(baseline.rmsAvg, only);
  }

  await clearFx();
  await stopTone();

  printSummary(effectResults, presetResults);

  ws.close();
  console.log('\nDone.');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
