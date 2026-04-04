/**
 * CalfMonoSynth.ts - Calf Monosynth WASM engine for DEViLBOX
 *
 * Features:
 * - 2 oscillators with 16 waveforms (saw/square/pulse/sine/triangle/varistep/skew + more)
 * - 2 ADSR envelopes with fade parameter
 * - Multi-mode filter (LP12/LP24/2xLP12/HP12/LP+Notch/HP+Notch/BP6/2xBP6)
 * - 2 LFOs with filter/pitch/PW modulation
 * - Osc2 unison mode
 * - Portamento with legato modes
 * - 55 parameters
 */

import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';
import { loadNativePatch, captureNativeState } from '@/engine/common/NativePatchLoader';
import { CALFMONO_NATIVE_FACTORY_PRESETS } from './calfMonoNativePresets';
export { CALFMONO_NATIVE_FACTORY_PRESETS };

// Parameter indices MUST match the C++ enum in calf_mono_standalone.h:60-74
export const CalfMonoParam = {
  O1_WAVE: 0, O2_WAVE: 1, O1_PW: 2, O2_PW: 3,          // par_wave1..par_pw2
  O12_DETUNE: 4, O2_XPOSE: 5, PHASE_MODE: 6,            // par_detune, par_osc2xpose, par_oscmode
  O12_MIX: 7, FILTER: 8, CUTOFF: 9, RES: 10,            // par_oscmix..par_resonance
  FILTER_SEP: 11,                                         // par_cutoffsep
  ENV1CUTOFF: 12, ENV1RES: 13, ENV1AMP: 14,              // par_env1tocutoff..par_env1toamp
  ADSR_A: 15, ADSR_D: 16, ADSR_S: 17, ADSR_F: 18,      // par_env1attack..par_env1fade
  ADSR_R: 19,                                             // par_env1release
  KEY_FOLLOW: 20, LEGATO: 21, PORTAMENTO: 22,            // par_keyfollow..par_portamento
  VEL2FILTER: 23, VEL2AMP: 24,                           // par_vel2filter, par_vel2amp
  MASTER: 25, PBEND_RANGE: 26,                           // par_master, par_pwhlrange
  LFO_RATE: 27, LFO_DELAY: 28,                           // par_lforate, par_lfodelay
  LFO2FILTER: 29, LFO2PITCH: 30, LFO2PW: 31,            // par_lfofilter..par_lfopw
  MWHL2LFO: 32, SCALE_DETUNE: 33,                        // par_mwhl_lfo, par_scaledetune
  ENV2CUTOFF: 34, ENV2RES: 35, ENV2AMP: 36,              // par_env2tocutoff..par_env2toamp
  ADSR2_A: 37, ADSR2_D: 38, ADSR2_S: 39,                // par_env2attack..par_env2sustain
  ADSR2_F: 40, ADSR2_R: 41,                              // par_env2fade, par_env2release
  O1_STRETCH: 42, O1_WINDOW: 43,                         // par_stretch1, par_window1
  LFO1_TRIG: 44, LFO2_TRIG: 45,                         // par_lfo1trig, par_lfo2trig
  LFO2_RATE: 46, LFO2_DELAY: 47,                        // par_lfo2rate, par_lfo2delay
  O2_UNISON: 48, O2_UNISON_FRQ: 49,                     // par_o2unison, par_o2unisonfrq
  O1_XPOSE: 50, MIDI: 51,                               // par_osc1xpose, par_midi
} as const;

export const CALF_MONO_PARAM_NAMES: Record<number, string> = {
  0: 'Osc1 Wave', 1: 'Osc2 Wave', 2: 'Osc1 PW', 3: 'Osc2 PW',
  4: 'Osc Detune', 5: 'Osc2 Transpose', 6: 'Phase Mode', 7: 'Osc Mix',
  8: 'Filter Type', 9: 'Cutoff', 10: 'Resonance', 11: 'Filter Sep',
  12: 'EG1→Cutoff', 13: 'EG1→Res', 14: 'EG1→Amp',
  15: 'EG1 Attack', 16: 'EG1 Decay', 17: 'EG1 Sustain', 18: 'EG1 Fade', 19: 'EG1 Release',
  20: 'Key Follow', 21: 'Legato', 22: 'Portamento', 23: 'Vel→Filter', 24: 'Vel→Amp',
  25: 'Master', 26: 'P.Bend Range',
  27: 'LFO1 Rate', 28: 'LFO1 Delay', 29: 'LFO→Filter', 30: 'LFO→Pitch', 31: 'LFO→PW',
  32: 'ModWheel→LFO', 33: 'Scale Detune',
  34: 'EG2→Cutoff', 35: 'EG2→Res', 36: 'EG2→Amp',
  37: 'EG2 Attack', 38: 'EG2 Decay', 39: 'EG2 Sustain', 40: 'EG2 Fade', 41: 'EG2 Release',
  42: 'Osc1 Stretch', 43: 'Osc1 Window',
  44: 'LFO1 Trigger', 45: 'LFO2 Trigger',
  46: 'LFO2 Rate', 47: 'LFO2 Delay',
  48: 'Osc2 Unison', 49: 'Unison Freq',
  50: 'Osc1 Transpose', 51: 'MIDI Ch',
};

export interface CalfMonoConfig {
  o1Wave?: number;         // 0-15 waveform
  o2Wave?: number;
  o1Pw?: number;           // -1 to 1
  o2Pw?: number;
  o1Xpose?: number;        // -24 to 24 semitones
  o2Xpose?: number;
  o1Stretch?: number;      // 1-16
  o1Window?: number;       // 0-1
  o12Detune?: number;      // 0-100 cents
  scaleDetune?: number;    // 0-1
  o2Unison?: number;       // 0-1
  o2UnisonFrq?: number;    // 0.01-20 Hz
  phaseMode?: number;      // 0-5
  o12Mix?: number;         // 0-1
  filter?: number;         // 0-7 type
  cutoff?: number;         // 10-16000 Hz
  res?: number;            // 0.7-8
  filterSep?: number;      // -2400 to 2400 cents
  keyFollow?: number;      // 0-2
  adsrA?: number;          // 1-20000 ms
  adsrD?: number;          // 10-20000 ms
  adsrS?: number;          // 0-1
  adsrF?: number;          // -10000 to 10000 ms
  adsrR?: number;          // 10-20000 ms
  env2cutoff?: number;     // -10800 to 10800 cents
  env2res?: number;        // 0-1
  env2amp?: number;        // 0 or 1
  adsr2A?: number;         // 1-20000 ms
  adsr2D?: number;         // 10-20000 ms
  adsr2S?: number;         // 0-1
  adsr2F?: number;         // -10000 to 10000 ms
  adsr2R?: number;         // 10-20000 ms
  adsr2Cutoff?: number;    // -10800 to 10800 cents
  adsr2Res?: number;       // 0-1
  adsr2Amp?: number;       // 0 or 1
  lfoRate?: number;        // 0.01-20 Hz
  lfoDelay?: number;       // 0-5 sec
  lfo1Trig?: number;       // 0-1
  lfo2filter?: number;     // -4800 to 4800 cents
  lfo2pitch?: number;      // 0-1200 cents
  lfo2pw?: number;         // 0-1
  mwhl2lfo?: number;       // 0-1
  lfo2Rate?: number;       // 0.01-20 Hz
  lfo2Delay?: number;      // 0.1-5 sec
  lfo2Trig?: number;       // 0-1
  vel2filter?: number;     // 0-1
  vel2amp?: number;        // 0-1
  portamento?: number;     // 1-2000 ms
  legato?: number;         // 0-3
  master?: number;         // 0-100
  pbendRange?: number;     // 0-2400 cents
  midi?: number;           // 0-16
}

export const DEFAULT_CALF_MONO: CalfMonoConfig = {
  o1Wave: 0, o2Wave: 1, o1Pw: 0, o2Pw: 0,
  o1Xpose: 0, o2Xpose: 0, o1Stretch: 1, o1Window: 0,
  o12Detune: 10, scaleDetune: 0,
  o2Unison: 0, o2UnisonFrq: 0.5,
  phaseMode: 0, o12Mix: 0.5,
  filter: 0, cutoff: 2000, res: 1.5, filterSep: 0, keyFollow: 0.5,
  adsrA: 5, adsrD: 200, adsrS: 0.7, adsrF: 0, adsrR: 200,
  env2cutoff: 4000, env2res: 0, env2amp: 1,
  adsr2A: 5, adsr2D: 200, adsr2S: 0.5, adsr2F: 0, adsr2R: 200,
  adsr2Cutoff: 0, adsr2Res: 0, adsr2Amp: 0,
  lfoRate: 2, lfoDelay: 0, lfo1Trig: 0,
  lfo2filter: 0, lfo2pitch: 0, lfo2pw: 0, mwhl2lfo: 0.5,
  lfo2Rate: 2, lfo2Delay: 0.1, lfo2Trig: 0,
  vel2filter: 0.3, vel2amp: 0.5,
  portamento: 10, legato: 0,
  master: 50, pbendRange: 200, midi: 0,
};

// Must match C++ enum in calf_mono_standalone.h:60-74
const CONFIG_TO_PARAM: [keyof CalfMonoConfig, number][] = [
  ['o1Wave', CalfMonoParam.O1_WAVE], ['o2Wave', CalfMonoParam.O2_WAVE],
  ['o1Pw', CalfMonoParam.O1_PW], ['o2Pw', CalfMonoParam.O2_PW],
  ['o12Detune', CalfMonoParam.O12_DETUNE], ['o2Xpose', CalfMonoParam.O2_XPOSE],
  ['phaseMode', CalfMonoParam.PHASE_MODE], ['o12Mix', CalfMonoParam.O12_MIX],
  ['filter', CalfMonoParam.FILTER], ['cutoff', CalfMonoParam.CUTOFF],
  ['res', CalfMonoParam.RES], ['filterSep', CalfMonoParam.FILTER_SEP],
  ['env2cutoff', CalfMonoParam.ENV1CUTOFF], ['env2res', CalfMonoParam.ENV1RES],
  ['env2amp', CalfMonoParam.ENV1AMP],
  ['adsrA', CalfMonoParam.ADSR_A], ['adsrD', CalfMonoParam.ADSR_D],
  ['adsrS', CalfMonoParam.ADSR_S], ['adsrF', CalfMonoParam.ADSR_F],
  ['adsrR', CalfMonoParam.ADSR_R],
  ['keyFollow', CalfMonoParam.KEY_FOLLOW], ['legato', CalfMonoParam.LEGATO],
  ['portamento', CalfMonoParam.PORTAMENTO],
  ['vel2filter', CalfMonoParam.VEL2FILTER], ['vel2amp', CalfMonoParam.VEL2AMP],
  ['master', CalfMonoParam.MASTER], ['pbendRange', CalfMonoParam.PBEND_RANGE],
  ['lfoRate', CalfMonoParam.LFO_RATE], ['lfoDelay', CalfMonoParam.LFO_DELAY],
  ['lfo2filter', CalfMonoParam.LFO2FILTER], ['lfo2pitch', CalfMonoParam.LFO2PITCH],
  ['lfo2pw', CalfMonoParam.LFO2PW], ['mwhl2lfo', CalfMonoParam.MWHL2LFO],
  ['scaleDetune', CalfMonoParam.SCALE_DETUNE],
  ['adsr2Cutoff', CalfMonoParam.ENV2CUTOFF], ['adsr2Res', CalfMonoParam.ENV2RES],
  ['adsr2Amp', CalfMonoParam.ENV2AMP],
  ['adsr2A', CalfMonoParam.ADSR2_A], ['adsr2D', CalfMonoParam.ADSR2_D],
  ['adsr2S', CalfMonoParam.ADSR2_S], ['adsr2F', CalfMonoParam.ADSR2_F],
  ['adsr2R', CalfMonoParam.ADSR2_R],
  ['o1Stretch', CalfMonoParam.O1_STRETCH], ['o1Window', CalfMonoParam.O1_WINDOW],
  ['lfo1Trig', CalfMonoParam.LFO1_TRIG], ['lfo2Trig', CalfMonoParam.LFO2_TRIG],
  ['lfo2Rate', CalfMonoParam.LFO2_RATE], ['lfo2Delay', CalfMonoParam.LFO2_DELAY],
  ['o2Unison', CalfMonoParam.O2_UNISON], ['o2UnisonFrq', CalfMonoParam.O2_UNISON_FRQ],
  ['o1Xpose', CalfMonoParam.O1_XPOSE], ['midi', CalfMonoParam.MIDI],
];

export const CALF_MONO_PRESETS: Record<string, Partial<CalfMonoConfig>> = {
  'Classic Bass': {
    o1Wave: 0, o2Wave: 1, o12Detune: 8, o12Mix: 0.6,
    filter: 1, cutoff: 800, res: 2.5,
    adsrA: 2, adsrD: 300, adsrS: 0.4, adsrR: 150,
    env2cutoff: 5000, vel2filter: 0.5, portamento: 30,
  },
  'Acid Lead': {
    o1Wave: 1, o2Wave: 1, o2Xpose: 12, o12Detune: 5,
    filter: 1, cutoff: 600, res: 5,
    adsrA: 1, adsrD: 150, adsrS: 0.2, adsrR: 100,
    env2cutoff: 8000, vel2filter: 0.7, portamento: 50, legato: 1,
  },
  'Warm Pad': {
    o1Wave: 0, o2Wave: 4, o12Detune: 15, o12Mix: 0.5,
    filter: 0, cutoff: 3000, res: 1.0,
    adsrA: 500, adsrD: 1000, adsrS: 0.8, adsrR: 800,
    env2cutoff: 2000, lfoRate: 0.3, lfo2filter: 500,
  },
  'Pluck Synth': {
    o1Wave: 3, o2Wave: 0, o12Detune: 3, o12Mix: 0.4,
    filter: 0, cutoff: 4000, res: 1.8,
    adsrA: 1, adsrD: 250, adsrS: 0.1, adsrR: 200,
    env2cutoff: 6000, vel2amp: 0.8,
  },
  'Screaming Lead': {
    o1Wave: 1, o2Wave: 2, o1Pw: 0.3, o2Xpose: -12,
    filter: 1, cutoff: 1200, res: 6,
    adsrA: 5, adsrD: 400, adsrS: 0.6, adsrR: 200,
    env2cutoff: 7000, portamento: 80, legato: 1,
  },
  'Deep Sub': {
    o1Wave: 0, o2Wave: 0, o2Xpose: -12, o12Detune: 3, o12Mix: 0.3,
    filter: 1, cutoff: 250, res: 1.5,
    adsrA: 5, adsrD: 500, adsrS: 0.7, adsrR: 300,
    env2cutoff: 2000, vel2amp: 0.4,
  },
  'Moog Lead': {
    o1Wave: 1, o2Wave: 1, o2Xpose: 7, o12Detune: 10, o12Mix: 0.5,
    filter: 1, cutoff: 1000, res: 4,
    adsrA: 3, adsrD: 200, adsrS: 0.5, adsrR: 150,
    env2cutoff: 6000, portamento: 60, legato: 1, vel2filter: 0.6,
  },
  'Sync Buzz': {
    o1Wave: 1, o2Wave: 1, o2Xpose: 12, o12Mix: 0.7,
    phaseMode: 3,
    filter: 0, cutoff: 2000, res: 3,
    adsrA: 1, adsrD: 180, adsrS: 0.3, adsrR: 120,
    env2cutoff: 7000, vel2filter: 0.5,
  },
  'Filtered Noise': {
    o1Wave: 5, o2Wave: 5, o12Mix: 0.5,
    filter: 1, cutoff: 1500, res: 5.5,
    adsrA: 10, adsrD: 400, adsrS: 0.3, adsrR: 250,
    env2cutoff: 4000, lfoRate: 2, lfo2filter: 1200,
  },
  'Wind Sound': {
    o1Wave: 5, o2Wave: 0, o12Mix: 0.8,
    filter: 0, cutoff: 800, res: 2,
    adsrA: 800, adsrD: 2000, adsrS: 0.5, adsrR: 1500,
    env2cutoff: 3000, lfoRate: 0.15, lfo2filter: 2000,
  },
  'Brass Stab': {
    o1Wave: 1, o2Wave: 1, o2Xpose: -12, o12Detune: 6, o12Mix: 0.55,
    filter: 1, cutoff: 500, res: 2,
    adsrA: 15, adsrD: 300, adsrS: 0.6, adsrR: 100,
    env2cutoff: 8000, vel2filter: 0.8, vel2amp: 0.7,
  },
  'Square Lead': {
    o1Wave: 3, o2Wave: 3, o1Pw: 0.0, o2Xpose: 12, o12Detune: 4, o12Mix: 0.4,
    filter: 0, cutoff: 3500, res: 1.5,
    adsrA: 2, adsrD: 250, adsrS: 0.7, adsrR: 180,
    env2cutoff: 3000, portamento: 40, legato: 1,
  },
  'PWM Pad': {
    o1Wave: 3, o2Wave: 3, o1Pw: 0.3, o2Pw: -0.3, o12Detune: 12, o12Mix: 0.5,
    filter: 0, cutoff: 2500, res: 1.2,
    adsrA: 600, adsrD: 1500, adsrS: 0.75, adsrR: 1000,
    env2cutoff: 1500, lfoRate: 0.5, lfo2pw: 0.6,
  },
  'Resonant Pluck': {
    o1Wave: 1, o2Wave: 0, o12Detune: 2, o12Mix: 0.35,
    filter: 0, cutoff: 5000, res: 4,
    adsrA: 1, adsrD: 120, adsrS: 0.0, adsrR: 100,
    env2cutoff: 9000, vel2amp: 0.9, vel2filter: 0.6,
  },
  'Dark Drone': {
    o1Wave: 0, o2Wave: 1, o2Xpose: -24, o12Detune: 20, o12Mix: 0.6,
    filter: 1, cutoff: 400, res: 3,
    adsrA: 1000, adsrD: 5000, adsrS: 0.9, adsrR: 3000,
    env2cutoff: 1000, lfoRate: 0.08, lfo2filter: 800,
  },
};

// Native factory presets re-exported above from calfMonoNativePresets.ts

export class CalfMonoSynthImpl implements DevilboxSynth {
  readonly name = 'CalfMonoSynth';
  readonly output: GainNode;
  private node: AudioWorkletNode | null = null;
  private ready = false;
  private config: CalfMonoConfig;
  private pendingPatch: number[] | null = null;
  private _initPromise: Promise<void> | null = null;

  constructor() {
    this.config = { ...DEFAULT_CALF_MONO };
    const ctx = getDevilboxAudioContext();
    this.output = ctx.createGain();
  }

  async ensureInitialized(): Promise<void> {
    if (!this._initPromise) {
      this._initPromise = this._doInit();
    }
    return this._initPromise;
  }

  /** Alias for ensureInitialized() — kept for backward compatibility */
  async init(): Promise<void> {
    return this.ensureInitialized();
  }

  private async _doInit(): Promise<void> {
    const ctx = getDevilboxAudioContext();
    if (!ctx) throw new Error('No audio context');

    const baseUrl = new URL('/calf-mono/', window.location.origin).href;

    // Fetch WASM binary and JS code in parallel
    const [wasmRes, jsRes] = await Promise.all([
      fetch(`${baseUrl}CalfMonoSynth.wasm`),
      fetch(`${baseUrl}CalfMonoSynth.js`),
    ]);
    if (!wasmRes.ok) throw new Error(`Failed to load CalfMonoSynth.wasm: ${wasmRes.status}`);
    if (!jsRes.ok) throw new Error(`Failed to load CalfMonoSynth.js: ${jsRes.status}`);

    const [wasmBinary, jsCodeRaw] = await Promise.all([
      wasmRes.arrayBuffer(),
      jsRes.text(),
    ]);

    // Patch JS for worklet environment
    const urlPolyfill = 'if(typeof URL==="undefined"){globalThis.URL=class{constructor(p,b){this.href=(b||"")+p;this.pathname=p;}};}\n';
    const jsCode = urlPolyfill + jsCodeRaw
      .replace(/import\.meta\.url/g, `'${baseUrl}CalfMonoSynth.js'`)
      .replace(/export\s+default\s+\w+;?\s*$/, '')
      .replace(/if\s*\(ENVIRONMENT_IS_NODE\)\s*\{[^}]*await\s+import\([^)]*\)[^}]*\}/g, '')
      .replace(/(wasmMemory\s*=\s*wasmExports\[['"][\w]+['"]\])/, '$1;Module["wasmMemory"]=wasmMemory')
      .replace(/new\s+URL\(([^,]+),\s*([^)]+)\)\.href/g, '($2 + $1)');

    // Load worklet
    await ctx.audioWorklet.addModule(`${baseUrl}CalfMonoSynth.worklet.js`);
    this.node = new AudioWorkletNode(ctx, 'calf-mono-processor', {
      numberOfInputs: 0, numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    this.node.connect(this.output);

    // Wait for worklet to initialize
    await new Promise<void>((resolve, reject) => {
      const handler = (e: MessageEvent) => {
        if (e.data?.type === 'ready') {
          this.ready = true;
          this.node!.port.removeEventListener('message', handler);
          resolve();
        } else if (e.data?.type === 'error') {
          this.node!.port.removeEventListener('message', handler);
          reject(new Error(e.data.message || 'CalfMono worklet init failed'));
        }
      };
      this.node!.port.addEventListener('message', handler);
      this.node!.port.start();

      // Send init message with WASM binary and JS code
      this.node!.port.postMessage(
        { type: 'init', sampleRate: ctx.sampleRate, wasmBinary, jsCode },
        [wasmBinary]
      );
    });

    if (this.pendingPatch) {
      void loadNativePatch(this.node!, this.pendingPatch).catch(() => {});
      this.pendingPatch = null;
    } else {
      this.applyConfig(this.config);
    }
  }

  getNode(): AudioNode | null { return this.node; }

  triggerAttack(note: string | number, _time?: number, velocity = 0.8): void {
    if (!this.ready || !this.node) return;
    const midi = typeof note === 'string' ? noteToMidi(note) : note;
    this.node.port.postMessage({ type: 'noteOn', note: midi, velocity: Math.round(velocity * 127) });
  }

  triggerRelease(note?: string | number): void {
    if (!this.ready || !this.node) return;
    if (note === undefined) { this.allNotesOff(); return; }
    const midi = typeof note === 'string' ? noteToMidi(note) : note;
    this.node.port.postMessage({ type: 'noteOff', note: midi });
  }

  allNotesOff(): void {
    this.node?.port.postMessage({ type: 'allNotesOff' });
  }

  setParam(index: number, value: number): void {
    if (!this.ready || !this.node) return;
    this.node.port.postMessage({ type: 'setParam', index, value });
  }

  getConfig(): CalfMonoConfig { return { ...this.config }; }

  applyConfig(cfg: Partial<CalfMonoConfig>): void {
    const prev = this.config;
    this.config = { ...prev, ...cfg };
    // Only send params that actually changed — avoids audio glitches from redundant messages
    for (const [key, idx] of CONFIG_TO_PARAM) {
      const val = this.config[key];
      if (val !== undefined && val !== prev[key]) this.setParam(idx, val);
    }
  }

  getPresets(): Record<string, Partial<CalfMonoConfig>> {
    return CALF_MONO_PRESETS;
  }

  /**
   * Load a native patch (complete engine state snapshot).
   * If not yet initialized, queues the patch for loading on ready.
   */
  loadPatch(values: number[]): void {
    if (this.ready && this.node) {
      void loadNativePatch(this.node, values).catch(() => {});
    } else {
      this.pendingPatch = values;
    }
  }

  /**
   * Load a native preset by name from the CALFMONO_NATIVE_FACTORY_PRESETS map.
   */
  loadNativePreset(name: string): void {
    const preset = CALFMONO_NATIVE_FACTORY_PRESETS.find(p => p.name === name);
    if (preset) {
      this.loadPatch(preset.values);
    } else {
      console.warn(`[CalfMono] Native preset not found: ${name}`);
    }
  }

  /**
   * Capture the current complete engine state (for preset creation).
   */
  async getState(): Promise<number[] | null> {
    if (!this.ready || !this.node) return null;
    try {
      const result = await captureNativeState(this.node);
      return result.values;
    } catch {
      return null;
    }
  }

  dispose(): void {
    if (this.node) {
      this.node.disconnect();
      this.node.port.postMessage({ type: 'destroy' });
      this.node = null;
    }
    this.ready = false;
  }
}

export function createCalfMonoSynth(): CalfMonoSynthImpl {
  return new CalfMonoSynthImpl();
}
