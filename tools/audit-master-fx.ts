#!/usr/bin/env npx tsx
/**
 * Master Effects Audit Script
 * Tests all registered master effects for:
 * 1. Can be added without error
 * 2. Passes audio (not silent when active)
 * 3. Parameters can be updated at runtime
 * Reports results to localhost:4444 format tracker
 */

import WebSocket from 'ws';
import { randomUUID } from 'crypto';

const WS_URL = 'ws://localhost:4003/mcp';
const TRACKER_URL = 'http://localhost:4444';
const TIMEOUT = 15000;
const SETTLE_MS = 800;

interface EffectTest {
  type: string;
  params: Record<string, number | string>;
  group: string;
}

const EFFECTS: EffectTest[] = [
  // --- Tone.js built-in ---
  { type: 'Distortion', params: { drive: 0.6 }, group: 'tonejs' },
  { type: 'Reverb', params: { decay: 3.0 }, group: 'tonejs' },
  { type: 'Delay', params: { time: 0.25, feedback: 0.4 }, group: 'tonejs' },
  { type: 'FeedbackDelay', params: { time: 0.3, feedback: 0.5 }, group: 'tonejs' },
  { type: 'PingPongDelay', params: { time: 0.25, feedback: 0.4 }, group: 'tonejs' },
  { type: 'Chorus', params: { frequency: 2.0, depth: 0.8 }, group: 'tonejs' },
  { type: 'Phaser', params: { frequency: 1.0, octaves: 3 }, group: 'tonejs' },
  { type: 'Tremolo', params: { frequency: 4.0, depth: 0.8 }, group: 'tonejs' },
  { type: 'Vibrato', params: { frequency: 5.0, depth: 0.5 }, group: 'tonejs' },
  { type: 'AutoFilter', params: { frequency: 1.0 }, group: 'tonejs' },
  { type: 'AutoPanner', params: { frequency: 1.0, depth: 0.8 }, group: 'tonejs' },
  { type: 'AutoWah', params: { baseFrequency: 200 }, group: 'tonejs' },
  { type: 'BitCrusher', params: { bits: 4 }, group: 'tonejs' },
  { type: 'Chebyshev', params: { order: 50 }, group: 'tonejs' },
  { type: 'FrequencyShifter', params: { frequency: 50 }, group: 'tonejs' },
  { type: 'PitchShift', params: { pitch: 7 }, group: 'tonejs' },
  { type: 'Compressor', params: { threshold: -20, ratio: 4 }, group: 'tonejs' },
  { type: 'EQ3', params: { low: 3, mid: 0, high: -2 }, group: 'tonejs' },
  { type: 'Filter', params: { frequency: 2000, Q: 2 }, group: 'tonejs' },
  { type: 'JCReverb', params: { roomSize: 0.7 }, group: 'tonejs' },
  { type: 'StereoWidener', params: { width: 0.6 }, group: 'tonejs' },
  { type: 'TapeSaturation', params: { drive: 60, tone: 3000 }, group: 'tonejs' },
  { type: 'SidechainCompressor', params: { threshold: -20, ratio: 6 }, group: 'tonejs' },

  // --- Custom Tone.js / Worklet effects ---
  { type: 'SpaceEcho', params: { rate: 50, intensity: 60 }, group: 'tonejs' },
  { type: 'SpaceyDelayer', params: { firstTap: 200, feedback: 40 }, group: 'tonejs' },
  { type: 'RETapeEcho', params: { repeatRate: 300, intensity: 50 }, group: 'tonejs' },
  { type: 'BiPhase', params: { rateA: 0.5, depthA: 0.7 }, group: 'tonejs' },
  { type: 'DubFilter', params: { cutoff: 1500, resonance: 5 }, group: 'tonejs' },
  { type: 'VinylNoise', params: { hiss: 40, dust: 30 }, group: 'tonejs' },
  { type: 'ToneArm', params: { wow: 30, flutter: 20 }, group: 'tonejs' },
  { type: 'TapeSimulator', params: { drive: 50, character: 40 }, group: 'tonejs' },
  { type: 'Tumult', params: {}, group: 'tonejs' },
  { type: 'TapeDegradation', params: { wow: 40, flutter: 30, hiss: 20 }, group: 'tonejs' },
  { type: 'AmbientDelay', params: { time: 400, feedback: 50, taps: 2 }, group: 'tonejs' },

  // --- WASM effects ---
  { type: 'MoogFilter', params: { cutoff: 1500, resonance: 30 }, group: 'wasm' },
  { type: 'MVerb', params: { decay: 0.7, size: 0.6 }, group: 'wasm' },
  { type: 'Leslie', params: { speed: 1 }, group: 'wasm' },
  { type: 'SpringReverb', params: { decay: 0.6, tension: 0.5 }, group: 'wasm' },
  { type: 'ShimmerReverb', params: { decay: 70, shimmer: 50 }, group: 'wasm' },
  { type: 'Vocoder', params: { bands: 16 }, group: 'wasm' },
  { type: 'AutoTune', params: { key: 0, strength: 80 }, group: 'wasm' },
  { type: 'GranularFreeze', params: { grainSize: 80, density: 12 }, group: 'wasm' },

  // --- Buzzmachine effects ---
  { type: 'BuzzDistortion', params: {}, group: 'buzz' },
  { type: 'BuzzOverdrive', params: {}, group: 'buzz' },
  { type: 'BuzzDistortion2', params: {}, group: 'buzz' },
  { type: 'BuzzDist2', params: {}, group: 'buzz' },
  { type: 'BuzzSoftSat', params: {}, group: 'buzz' },
  { type: 'BuzzStereoDist', params: {}, group: 'buzz' },
  { type: 'BuzzSVF', params: {}, group: 'buzz' },
  { type: 'BuzzPhilta', params: {}, group: 'buzz' },
  { type: 'BuzzNotch', params: {}, group: 'buzz' },
  { type: 'BuzzZfilter', params: {}, group: 'buzz' },
  { type: 'BuzzDelay', params: {}, group: 'buzz' },
  { type: 'BuzzCrossDelay', params: {}, group: 'buzz' },
  { type: 'BuzzFreeverb', params: {}, group: 'buzz' },
  { type: 'BuzzPanzerDelay', params: {}, group: 'buzz' },
  { type: 'BuzzChorus', params: {}, group: 'buzz' },
  { type: 'BuzzChorus2', params: {}, group: 'buzz' },
  { type: 'BuzzWhiteChorus', params: {}, group: 'buzz' },
  { type: 'BuzzFreqShift', params: {}, group: 'buzz' },
  { type: 'BuzzCompressor', params: {}, group: 'buzz' },
  { type: 'BuzzLimiter', params: {}, group: 'buzz' },
  { type: 'BuzzExciter', params: {}, group: 'buzz' },
  { type: 'BuzzMasterizer', params: {}, group: 'buzz' },
  { type: 'BuzzStereoGain', params: {}, group: 'buzz' },
];

// Effects that have custom editors (from EFFECT_EDITORS mapping)
const HAS_EDITOR = new Set([
  'Distortion', 'Reverb', 'Delay', 'FeedbackDelay', 'PingPongDelay', 'Chorus',
  'Phaser', 'Tremolo', 'Vibrato', 'AutoFilter', 'AutoPanner', 'AutoWah',
  'BitCrusher', 'Chebyshev', 'FrequencyShifter', 'PitchShift', 'Compressor',
  'EQ3', 'Filter', 'JCReverb', 'StereoWidener', 'SpaceEcho', 'BiPhase',
  'DubFilter', 'TapeSaturation', 'Tumult', 'VinylNoise', 'ToneArm',
  'TapeSimulator', 'SidechainCompressor', 'SpaceyDelayer', 'RETapeEcho',
  'MoogFilter', 'Vocoder', 'AutoTune', 'MVerb', 'Leslie', 'SpringReverb',
]);

// Effects that have EffectParameterEngine case (parameter routing)
const HAS_PARAM_ENGINE = new Set([
  'Distortion', 'Delay', 'FeedbackDelay', 'Chorus', 'Phaser', 'Tremolo',
  'Vibrato', 'BitCrusher', 'PingPongDelay', 'PitchShift', 'Compressor',
  'EQ3', 'Filter', 'AutoFilter', 'AutoPanner', 'StereoWidener',
  'SpaceyDelayer', 'RETapeEcho', 'SpaceEcho', 'BiPhase', 'DubFilter',
  'MoogFilter', 'MVerb', 'Leslie', 'SpringReverb', 'Reverb', 'JCReverb',
  'SidechainCompressor', 'TapeSaturation', 'VinylNoise', 'Tumult',
  'TapeSimulator', 'ToneArm', 'AutoWah', 'Chebyshev', 'FrequencyShifter',
  // Just added in last commit:
  'AmbientDelay', 'AutoTune', 'GranularFreeze', 'ShimmerReverb',
  'TapeDegradation', 'Vocoder',
]);

class MCPClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, (resp: any) => void>();

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(WS_URL);
      this.ws.on('open', () => {
        console.log('✓ Connected to MCP relay');
        resolve();
      });
      this.ws.on('error', (err) => reject(err));
      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          const handler = this.pending.get(msg.id);
          if (handler) {
            this.pending.delete(msg.id);
            handler(msg);
          }
        } catch { /* ignore non-JSON */ }
      });
    });
  }

  call<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error('Not connected'));
      }
      const id = randomUUID();
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out (${TIMEOUT}ms)`));
      }, TIMEOUT);
      this.pending.set(id, (resp: any) => {
        clearTimeout(timer);
        if (resp.type === 'error') reject(new Error(resp.error ?? 'unknown'));
        else resolve(resp.data as T);
      });
      this.ws.send(JSON.stringify({ id, type: 'call', method, params }));
    });
  }

  close() { this.ws?.close(); }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

interface AuditResult {
  type: string;
  group: string;
  addOk: boolean;
  addError?: string;
  audioOk: boolean;
  rmsLevel: number;
  paramUpdateOk: boolean;
  paramError?: string;
  hasEditor: boolean;
  hasParamEngine: boolean;
  status: 'works' | 'silent' | 'crashes' | 'partial';
  notes: string;
}

async function reportToTracker(results: AuditResult[]) {
  const updates: Record<string, any> = {};
  for (const r of results) {
    const key = `masterfx-${r.type.toLowerCase()}`;
    updates[key] = {
      auditStatus: r.status === 'works' ? 'fixed' : r.status === 'partial' ? 'needs-attention' : 'fail',
      notes: r.notes,
      group: r.group,
      hasEditor: r.hasEditor,
      hasParamEngine: r.hasParamEngine,
      rmsLevel: r.rmsLevel,
    };
  }
  try {
    await fetch(`${TRACKER_URL}/push-updates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    console.log(`\n✓ Reported ${results.length} results to ${TRACKER_URL}`);
  } catch (err) {
    console.error(`✗ Failed to report to tracker:`, err);
  }
}

async function clearMasterEffects(client: MCPClient) {
  const state = await client.call<any>('get_audio_state');
  if (state?.masterEffects?.length) {
    for (const fx of state.masterEffects) {
      try {
        await client.call('remove_master_effect', { effectId: fx.id });
      } catch { /* ok */ }
    }
    await sleep(200);
  }
}

async function main() {
  const client = new MCPClient();
  await client.connect();

  // Check playback
  const pbState = await client.call<any>('get_playback_state');
  if (!pbState?.isPlaying) {
    console.log('⚠ Nothing playing — starting playback...');
    try {
      await client.call('play');
      await sleep(1000);
    } catch {
      console.log('⚠ Could not start playback. Load a song first!');
    }
  }

  // Baseline audio level (no master FX)
  await clearMasterEffects(client);
  await sleep(500);
  const baseline = await client.call<any>('get_audio_level', { durationMs: 1000 });
  const baseRms = baseline?.rmsAvg ?? 0;
  console.log(`\nBaseline RMS: ${baseRms.toFixed(6)} (silent: ${baseline?.isSilent})`);

  if (baseline?.isSilent) {
    console.log('⚠ No audio playing! Load a song and start playback first.');
    console.log('  Continuing anyway — silence results will be unreliable.\n');
  }

  const results: AuditResult[] = [];
  const total = EFFECTS.length;

  for (let i = 0; i < total; i++) {
    const fx = EFFECTS[i];
    const label = `[${i + 1}/${total}] ${fx.type}`;
    const result: AuditResult = {
      type: fx.type,
      group: fx.group,
      addOk: false,
      audioOk: false,
      rmsLevel: 0,
      paramUpdateOk: false,
      hasEditor: HAS_EDITOR.has(fx.type),
      hasParamEngine: HAS_PARAM_ENGINE.has(fx.type),
      status: 'crashes',
      notes: '',
    };

    try {
      // Clear previous effects
      await clearMasterEffects(client);

      // 1. Add effect
      try {
        await client.call('add_master_effect', { effectType: fx.type });
        result.addOk = true;
      } catch (err: any) {
        result.addError = err.message;
        result.notes = `add failed: ${err.message}`;
        console.log(`${label}: ✗ ADD FAILED — ${err.message}`);
        results.push(result);
        continue;
      }

      await sleep(SETTLE_MS);

      // 2. Check audio level
      try {
        const level = await client.call<any>('get_audio_level', { durationMs: 800 });
        result.rmsLevel = level?.rmsAvg ?? 0;
        result.audioOk = !level?.isSilent;
      } catch {
        result.rmsLevel = 0;
        result.audioOk = false;
      }

      // 3. Try parameter update
      if (Object.keys(fx.params).length > 0) {
        try {
          const state = await client.call<any>('get_audio_state');
          const effectId = state?.masterEffects?.[0]?.id;
          if (effectId) {
            await client.call('update_master_effect', {
              effectId,
              updates: { parameters: fx.params },
            });
            result.paramUpdateOk = true;
          } else {
            result.paramError = 'no effectId in audio state';
          }
        } catch (err: any) {
          result.paramError = err.message;
          if (i < 3) console.log(`  DEBUG ${fx.type} param error: ${err.message}`);
        }
      } else {
        // No test params defined — skip param test
        result.paramUpdateOk = true;
      }

      // Determine status
      const issues: string[] = [];
      if (!result.audioOk && !baseline?.isSilent) issues.push('silent');
      if (!result.paramUpdateOk) issues.push('param update failed');
      if (!result.hasEditor) issues.push('no editor');
      if (!result.hasParamEngine) issues.push('no param engine');

      if (!result.audioOk && !baseline?.isSilent) {
        result.status = 'silent';
      } else if (issues.length > 0) {
        result.status = 'partial';
      } else {
        result.status = 'works';
      }

      result.notes = issues.length ? issues.join('; ') : `OK rms=${result.rmsLevel.toFixed(6)}`;

      const icon = result.status === 'works' ? '✓' : result.status === 'silent' ? '🔇' : '⚠';
      console.log(`${label}: ${icon} ${result.status} — ${result.notes}`);

    } catch (err: any) {
      result.notes = `crash: ${err.message}`;
      console.log(`${label}: ✗ CRASH — ${err.message}`);
    }

    results.push(result);
  }

  // Clean up
  await clearMasterEffects(client);

  // Summary
  const works = results.filter(r => r.status === 'works').length;
  const silent = results.filter(r => r.status === 'silent').length;
  const partial = results.filter(r => r.status === 'partial').length;
  const crashes = results.filter(r => r.status === 'crashes').length;

  console.log('\n' + '='.repeat(60));
  console.log(`MASTER FX AUDIT SUMMARY`);
  console.log('='.repeat(60));
  console.log(`Total:   ${results.length}`);
  console.log(`Works:   ${works}`);
  console.log(`Silent:  ${silent}`);
  console.log(`Partial: ${partial} (missing editor/param engine)`);
  console.log(`Crashes: ${crashes}`);
  console.log('='.repeat(60));

  if (silent > 0) {
    console.log('\nSILENT EFFECTS:');
    for (const r of results.filter(r => r.status === 'silent')) {
      console.log(`  - ${r.type}: ${r.notes}`);
    }
  }
  if (crashes > 0) {
    console.log('\nCRASHED EFFECTS:');
    for (const r of results.filter(r => r.status === 'crashes')) {
      console.log(`  - ${r.type}: ${r.notes}`);
    }
  }
  if (partial > 0) {
    console.log('\nPARTIAL EFFECTS (missing editor/param engine):');
    for (const r of results.filter(r => r.status === 'partial')) {
      console.log(`  - ${r.type}: ${r.notes}`);
    }
  }

  // Report to tracker
  await reportToTracker(results);

  client.close();
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
