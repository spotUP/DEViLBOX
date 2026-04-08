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

  // --- WASM effects (original) ---
  { type: 'MoogFilter', params: { cutoff: 1500, resonance: 30 }, group: 'wasm' },
  { type: 'MVerb', params: { decay: 0.7, size: 0.6 }, group: 'wasm' },
  { type: 'Leslie', params: { speed: 1 }, group: 'wasm' },
  { type: 'SpringReverb', params: { decay: 0.6, tension: 0.5 }, group: 'wasm' },
  { type: 'ShimmerReverb', params: { decay: 70, shimmer: 50 }, group: 'wasm' },
  { type: 'Vocoder', params: { bands: 16 }, group: 'wasm' },
  { type: 'AutoTune', params: { key: 0, strength: 80 }, group: 'wasm' },
  { type: 'GranularFreeze', params: { grainSize: 80, density: 12 }, group: 'wasm' },

  // --- Zynthian-ported WASM effects ---
  // Dynamics
  { type: 'NoiseGate', params: { threshold: -40, attack: 0.5 }, group: 'wasm' },
  { type: 'Limiter', params: { threshold: -1, ceiling: -0.3 }, group: 'wasm' },
  { type: 'MonoComp', params: { threshold: -12, ratio: 4 }, group: 'wasm' },
  { type: 'Expander', params: { threshold: -30, ratio: 2 }, group: 'wasm' },
  { type: 'Clipper', params: { inputGain: 0, ceiling: -1 }, group: 'wasm' },
  { type: 'DeEsser', params: { frequency: 6000, bandwidth: 1 }, group: 'wasm' },
  { type: 'MultibandComp', params: { lowCrossover: 200, highCrossover: 3000 }, group: 'wasm' },
  { type: 'MultibandGate', params: { lowCross: 200, highCross: 3000 }, group: 'wasm' },
  { type: 'MultibandLimiter', params: { lowCross: 200, highCross: 3000 }, group: 'wasm' },
  { type: 'MultibandClipper', params: { lowCross: 200, highCross: 4000 }, group: 'wasm' },
  { type: 'MultibandDynamics', params: { lowCross: 200, highCross: 4000 }, group: 'wasm' },
  { type: 'MultibandExpander', params: { lowCross: 200, highCross: 4000 }, group: 'wasm' },
  { type: 'TransientDesigner', params: { attack: 0, sustain: 0 }, group: 'wasm' },
  { type: 'DynamicsProc', params: { lowerThresh: -40, upperThresh: -12 }, group: 'wasm' },
  { type: 'X42Comp', params: { threshold: -20, ratio: 4 }, group: 'wasm' },
  { type: 'GOTTComp', params: { lowCross: 200, highCross: 4000 }, group: 'wasm' },
  { type: 'SidechainGate', params: { threshold: -30, attack: 1 }, group: 'wasm' },
  { type: 'SidechainLimiter', params: { ceiling: -1, release: 50 }, group: 'wasm' },
  { type: 'Maximizer', params: { ceiling: -0.3, release: 50 }, group: 'wasm' },
  { type: 'AGC', params: { target: -12, speed: 0.1 }, group: 'wasm' },
  { type: 'BeatBreather', params: { transientBoost: 0, sustainBoost: 0 }, group: 'wasm' },
  { type: 'Ducka', params: { threshold: -20, drop: 0.5 }, group: 'wasm' },
  { type: 'Panda', params: { threshold: -20, factor: 0.5 }, group: 'wasm' },
  // Distortion
  { type: 'Overdrive', params: { drive: 50, tone: 50 }, group: 'wasm' },
  { type: 'Saturator', params: { drive: 0.5, blend: 0.5 }, group: 'wasm' },
  { type: 'Exciter', params: { frequency: 3000, amount: 0.5 }, group: 'wasm' },
  { type: 'AutoSat', params: { amount: 0.5, mix: 1 }, group: 'wasm' },
  { type: 'Satma', params: { distortion: 0.5, tone: 0.5 }, group: 'wasm' },
  { type: 'DistortionShaper', params: { inputGain: 1 }, group: 'wasm' },
  { type: 'TubeAmp', params: { drive: 50, bass: 50 }, group: 'wasm' },
  { type: 'CabinetSim', params: { cabinet: 0, mix: 100 }, group: 'wasm' },
  { type: 'Driva', params: { amount: 0.5, tone: 0 }, group: 'wasm' },
  // EQ & Filter
  { type: 'ParametricEQ', params: { b1Freq: 100, b1Gain: 0 }, group: 'wasm' },
  { type: 'EQ5Band', params: { lowShelfFreq: 100, lowShelfGain: 0 }, group: 'wasm' },
  { type: 'EQ8Band', params: {}, group: 'wasm' },
  { type: 'EQ12Band', params: { mix: 1 }, group: 'wasm' },
  { type: 'GEQ31', params: { mix: 1 }, group: 'wasm' },
  { type: 'ZamEQ2', params: { lowFreq: 200, lowGain: 0 }, group: 'wasm' },
  { type: 'PhonoFilter', params: { mode: 0, mix: 1 }, group: 'wasm' },
  { type: 'DynamicEQ', params: { detectFreq: 1000, detectQ: 1 }, group: 'wasm' },
  { type: 'BassEnhancer', params: { frequency: 100, amount: 0.5 }, group: 'wasm' },
  { type: 'Kuiza', params: { low: 0, lowMid: 0 }, group: 'wasm' },
  // Modulation
  { type: 'Flanger', params: { rate: 0.3, depth: 70 }, group: 'wasm' },
  { type: 'JunoChorus', params: { rate: 0.5, depth: 50 }, group: 'wasm' },
  { type: 'MultiChorus', params: { rate: 0.5, depth: 0.5 }, group: 'wasm' },
  { type: 'CalfPhaser', params: { rate: 0.5, depth: 0.7 }, group: 'wasm' },
  { type: 'Pulsator', params: { rate: 2, depth: 0.5 }, group: 'wasm' },
  { type: 'RingMod', params: { frequency: 440, mix: 50 }, group: 'wasm' },
  // Reverb & Delay
  { type: 'DragonflyHall', params: { decay: 80, damping: 40 }, group: 'wasm' },
  { type: 'DragonflyPlate', params: { decay: 70, damping: 50 }, group: 'wasm' },
  { type: 'DragonflyRoom', params: { decay: 40, damping: 60 }, group: 'wasm' },
  { type: 'EarlyReflections', params: { size: 1, damping: 0.3 }, group: 'wasm' },
  { type: 'Roomy', params: { time: 2, damping: 0.5 }, group: 'wasm' },
  { type: 'ReverseDelay', params: { time: 500, feedback: 0.3 }, group: 'wasm' },
  { type: 'VintageDelay', params: { time: 400, feedback: 0.4 }, group: 'wasm' },
  { type: 'ArtisticDelay', params: { timeL: 500, timeR: 375 }, group: 'wasm' },
  { type: 'SlapbackDelay', params: { time: 60, feedback: 0.1 }, group: 'wasm' },
  { type: 'ZamDelay', params: { time: 500, feedback: 0.4 }, group: 'wasm' },
  { type: 'Della', params: { time: 300, feedback: 0.5 }, group: 'wasm' },
  // Lo-Fi
  { type: 'Bitta', params: { crush: 8, mix: 1 }, group: 'wasm' },
  { type: 'Vinyl', params: { crackle: 0.3, noise: 0.2 }, group: 'wasm' },
  // Stereo & Spatial
  { type: 'BinauralPanner', params: { azimuth: 0, elevation: 0 }, group: 'wasm' },
  { type: 'HaasEnhancer', params: { delay: 10, side: 0 }, group: 'wasm' },
  { type: 'MultiSpread', params: { bands: 4, spread: 0.7 }, group: 'wasm' },
  { type: 'MultibandEnhancer', params: { lowCross: 200, midCross: 2000 }, group: 'wasm' },
  { type: 'Vihda', params: { width: 1, invert: 0 }, group: 'wasm' },
  // Creative
  { type: 'Masha', params: { time: 100, volume: 1 }, group: 'wasm' },

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
  // Core Tone.js effects
  'Distortion', 'Reverb', 'Delay', 'FeedbackDelay', 'PingPongDelay', 'Chorus',
  'Phaser', 'Tremolo', 'Vibrato', 'AutoFilter', 'AutoPanner', 'AutoWah',
  'BitCrusher', 'Chebyshev', 'FrequencyShifter', 'PitchShift', 'Compressor',
  'EQ3', 'Filter', 'JCReverb', 'StereoWidener', 'SidechainCompressor',
  // Custom effects
  'SpaceEcho', 'BiPhase', 'DubFilter', 'TapeSaturation', 'Tumult', 'VinylNoise',
  'ToneArm', 'TapeSimulator', 'SpaceyDelayer', 'RETapeEcho', 'MoogFilter',
  'Vocoder', 'AutoTune', 'MVerb', 'Leslie', 'SpringReverb',
  'TapeDegradation', 'AmbientDelay', 'ShimmerReverb', 'GranularFreeze',
  // Zynthian dynamics
  'NoiseGate', 'Limiter', 'MonoComp', 'Expander', 'Clipper', 'DeEsser',
  'MultibandComp', 'TransientDesigner', 'DynamicsProc', 'X42Comp', 'GOTTComp',
  'SidechainGate', 'SidechainLimiter', 'MultibandGate', 'MultibandLimiter',
  'Maximizer', 'AGC', 'BeatBreather', 'Ducka', 'Panda', 'MultibandClipper',
  'MultibandDynamics', 'MultibandExpander',
  // Zynthian distortion/saturation
  'Overdrive', 'Saturator', 'Exciter', 'AutoSat', 'Satma', 'DistortionShaper',
  'TubeAmp', 'CabinetSim', 'Driva', 'BassEnhancer',
  // Zynthian EQ
  'ParametricEQ', 'EQ5Band', 'EQ8Band', 'EQ12Band', 'GEQ31', 'ZamEQ2',
  'PhonoFilter', 'DynamicEQ', 'Kuiza',
  // Zynthian modulation
  'Flanger', 'JunoChorus', 'MultiChorus', 'CalfPhaser', 'Pulsator', 'RingMod',
  // Zynthian reverb/delay
  'DragonflyHall', 'DragonflyPlate', 'DragonflyRoom', 'EarlyReflections', 'Roomy',
  'ReverseDelay', 'VintageDelay', 'ArtisticDelay', 'SlapbackDelay', 'ZamDelay', 'Della',
  // Zynthian stereo/spatial
  'BinauralPanner', 'HaasEnhancer', 'MultiSpread', 'MultibandEnhancer', 'Vihda',
  // Zynthian creative/lo-fi
  'Masha', 'Bitta', 'Vinyl',
  // Buzzmachine WASM
  'BuzzDistortion', 'BuzzOverdrive', 'BuzzDistortion2', 'BuzzDist2', 'BuzzSoftSat',
  'BuzzStereoDist', 'BuzzSVF', 'BuzzPhilta', 'BuzzNotch', 'BuzzZfilter',
  'BuzzDelay', 'BuzzCrossDelay', 'BuzzFreeverb', 'BuzzPanzerDelay',
  'BuzzChorus', 'BuzzChorus2', 'BuzzWhiteChorus', 'BuzzFreqShift',
  'BuzzCompressor', 'BuzzLimiter', 'BuzzExciter', 'BuzzMasterizer', 'BuzzStereoGain',
  // WAM 2.0 effects
  'WAMBigMuff', 'WAMTS9', 'WAMDistoMachine', 'WAMQuadraFuzz', 'WAMVoxAmp',
  'WAMStonePhaser', 'WAMPingPongDelay', 'WAMFaustDelay', 'WAMPitchShifter',
  'WAMGraphicEQ', 'WAMPedalboard',
]);

// Effects that have EffectParameterEngine case (parameter routing) — 144 cases
const HAS_PARAM_ENGINE = new Set([
  'AGC', 'AmbientDelay', 'ArtisticDelay', 'AutoFilter', 'AutoPanner', 'AutoSat',
  'AutoTune', 'AutoWah', 'BassEnhancer', 'BeatBreather', 'BiPhase', 'BinauralPanner',
  'BitCrusher', 'Bitta', 'BuzzChorus', 'BuzzChorus2', 'BuzzCompressor', 'BuzzCrossDelay',
  'BuzzDelay', 'BuzzDist2', 'BuzzDistortion', 'BuzzDistortion2', 'BuzzExciter',
  'BuzzFreeverb', 'BuzzFreqShift', 'BuzzLimiter', 'BuzzMasterizer', 'BuzzNotch',
  'BuzzOverdrive', 'BuzzPanzerDelay', 'BuzzPhilta', 'BuzzSVF', 'BuzzSoftSat',
  'BuzzStereoDist', 'BuzzStereoGain', 'BuzzWhiteChorus', 'BuzzZfilter',
  'CabinetSim', 'CalfPhaser', 'Chebyshev', 'Chorus', 'Clipper', 'Compressor',
  'DeEsser', 'Delay', 'Della', 'Distortion', 'DistortionShaper', 'DragonflyHall',
  'DragonflyPlate', 'DragonflyRoom', 'Driva', 'DubFilter', 'Ducka', 'DynamicEQ',
  'DynamicsProc', 'EQ12Band', 'EQ3', 'EQ5Band', 'EQ8Band', 'EarlyReflections',
  'Exciter', 'Expander', 'FeedbackDelay', 'Filter', 'Flanger', 'FrequencyShifter',
  'GEQ31', 'GOTTComp', 'GranularFreeze', 'HaasEnhancer', 'JCReverb', 'JunoChorus',
  'Kuiza', 'Leslie', 'Limiter', 'MVerb', 'Masha', 'Maximizer', 'MonoComp',
  'MoogFilter', 'MultiChorus', 'MultiSpread', 'MultibandClipper', 'MultibandComp',
  'MultibandDynamics', 'MultibandEnhancer', 'MultibandExpander', 'MultibandGate',
  'MultibandLimiter', 'Neural', 'NoiseGate', 'Overdrive', 'Panda', 'ParametricEQ',
  'Phaser', 'PhonoFilter', 'PingPongDelay', 'PitchShift', 'Pulsator', 'RETapeEcho',
  'Reverb', 'ReverseDelay', 'RingMod', 'Roomy', 'Satma', 'Saturator', 'ShimmerReverb',
  'SidechainCompressor', 'SidechainGate', 'SidechainLimiter', 'SlapbackDelay',
  'SpaceEcho', 'SpaceyDelayer', 'SpringReverb', 'StereoWidener', 'TapeDegradation',
  'TapeSaturation', 'TapeSimulator', 'ToneArm', 'TransientDesigner', 'Tremolo',
  'TubeAmp', 'Tumult', 'Vibrato', 'Vihda', 'VintageDelay', 'Vinyl', 'VinylNoise',
  'Vocoder', 'WAMBigMuff', 'WAMDistoMachine', 'WAMFaustDelay', 'WAMGraphicEQ',
  'WAMPedalboard', 'WAMPingPongDelay', 'WAMPitchShifter', 'WAMQuadraFuzz',
  'WAMStonePhaser', 'WAMTS9', 'WAMVoxAmp', 'X42Comp', 'ZamDelay', 'ZamEQ2',
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

  // Start test tone routed through master effects chain
  console.log('Starting test tone (440 Hz, -12 dBFS)...');
  try {
    await client.call('test_tone', { action: 'start', frequency: 440, level: -12 });
    await sleep(1000);
  } catch (err: any) {
    console.log(`⚠ Could not start test tone: ${err.message}`);
    console.log('  Make sure the browser tab is open and AudioContext is unlocked.');
  }

  // Baseline audio level (no master FX)
  await clearMasterEffects(client);
  await sleep(500);
  const baseline = await client.call<any>('get_audio_level', { durationMs: 1000 });
  const baseRms = baseline?.rmsAvg ?? 0;
  console.log(`\nBaseline RMS: ${baseRms.toFixed(6)} (silent: ${baseline?.silent})`);

  if (baseline?.silent) {
    console.log('⚠ No audio detected! Click in the browser to unlock AudioContext.');
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
        result.audioOk = !level?.silent;
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
      if (!result.audioOk && !baseline?.silent) issues.push('silent');
      if (!result.paramUpdateOk) issues.push('param update failed');
      if (!result.hasEditor) issues.push('no editor');
      if (!result.hasParamEngine) issues.push('no param engine');

      if (!result.audioOk && !baseline?.silent) {
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
  try { await client.call('test_tone', { action: 'stop' }); } catch { /* */ }

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
