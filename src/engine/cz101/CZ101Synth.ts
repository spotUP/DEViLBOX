/**
 * CZ101Synth - Casio CZ-101 Phase Distortion Synthesizer
 * Based on the NEC uPD933 chip emulation from MAME
 *
 * 8 chip voices: a note takes one voice, or a pair of voices (two lines) when the
 * patch has a second line, ring modulation or noise. The worklet sequences each
 * voice's DCA / DCW / DCO envelope stages; this class turns a patch into chip
 * registers and envelope messages.
 *
 * Sound source of truth: the base patch, either the Init bank entry (cz101Presets.ts,
 * loadPreset(index)) or a user patch imported from a CZ SysEx dump (setParam('_userPatch', id),
 * cz101Sysex.ts). The editor modifies it with setParam(knob, value); the patch actually
 * played is applyCzKnobs(base patch, knobs).
 */

import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, noteToMidi } from '@utils/audio-context';
import { cz101Transform } from './cz101Transform';
import { CZ101_PRESET_BANK, CZ101_PRESET_NAMES, applyCzKnobs, cz101PresetByName } from './cz101Presets';
import type { CZKnobs } from './cz101Presets';
import { getCz101UserPatch } from '@stores/useCz101UserPatchStore';
import { CZWaveform, CZWindow } from './cz101Types';
import type { CZEnvelopeStage, CZLine, CZPatch } from './cz101Types';

export { CZWaveform, CZWindow };
export type { CZEnvelopeStage, CZLine, CZPatch };

// UPD933 register bases (voice number is added)
const UPD933_REG = {
  PITCH: 0x60,
  WAVEFORM: 0x68,
  PHASE: 0x98,
};

/**
 * Voice pairs in the chip's processing order: the odd voice (line 1) is processed
 * just before its even partner (line 2), which is the one ring modulation and
 * pitch modulation act on (MAME upd933.cpp voice_map).
 */
const VOICE_PAIRS: readonly (readonly [number, number])[] = [[5, 0], [7, 2], [1, 4], [3, 6]];
/** Single-line notes prefer odd voices so the even voices stay free for pairs. */
const SINGLE_VOICE_ORDER = [1, 3, 5, 7, 0, 2, 4, 6];

const CENTS_TO_PITCH_UNITS = 512 / 100; // pitch register: 1/512 semitone
const KNOB_KEYS: ReadonlySet<string> = new Set([
  'waveform1', 'waveform2', 'window', 'ring_mod', 'dcw_depth', 'dca_rate', 'dcw_rate', 'dco_rate', 'dco_depth',
]);

interface VoiceState {
  note: number;
  velocity: number;
  active: boolean;
  /** Order of allocation, for stealing the oldest */
  age: number;
}

export class CZ101Synth implements DevilboxSynth {
  readonly name = 'CZ101Synth';
  readonly output: GainNode;
  private audioContext: AudioContext;

  private workletNode: AudioWorkletNode | null = null;
  private voices: VoiceState[] = [];
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;
  private allocationCounter = 0;

  /** Base patch being played (the one source of the sound) and the knob changes on top of it. */
  private basePatch: CZPatch = CZ101_PRESET_BANK[0].patch;
  private programIndex = 0;
  private knobs: CZKnobs = {};
  /** Waveform register shadow (bits 15-6) and the modulation bits aimed at each voice */
  private waveBits: number[] = new Array(8).fill(0);
  private modBits: number[] = new Array(8).fill(0);
  /** Which line (1 or 2) each voice plays, 0 = none, for live oscillator edits */
  private voiceLine: (0 | 1 | 2)[] = new Array(8).fill(0);

  constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();

    for (let i = 0; i < 8; i++) {
      this.voices.push({ note: 0, velocity: 0, active: false, age: 0 });
    }
  }

  async init(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.doInit();
    return this.initPromise;
  }

  public async ensureInitialized(): Promise<void> {
    return this.init();
  }

  private async doInit(): Promise<void> {
    const ctx = this.audioContext;

    if (!ctx.audioWorklet) {
      throw new Error('AudioWorklet not supported');
    }

    const baseUrl = import.meta.env.BASE_URL || '/';

    try {
      await ctx.audioWorklet.addModule(`${baseUrl}cz101/CZ101.worklet.js`);
    } catch (err: unknown) {
      if (!(err instanceof Error && err.message?.includes('already'))) {
        throw err;
      }
    }

    this.workletNode = new AudioWorkletNode(ctx, 'cz101-processor', {
      numberOfOutputs: 1,
      outputChannelCount: [2]
    });

    // Connect to output
    this.workletNode.connect(this.output);

    // CRITICAL: Connect through silent keepalive to destination to force process() calls
    try {
      const keepalive = ctx.createGain();
      keepalive.gain.value = 0;
      this.workletNode.connect(keepalive);
      keepalive.connect(ctx.destination);
    } catch { /* keepalive failed */ }

    // Fetch WASM and its Emscripten glue on the main thread (fetch is not available
    // in AudioWorklets in some browsers); the worklet runs the glue itself.
    const [wasmResponse, jsResponse] = await Promise.all([
      fetch(`${baseUrl}cz101/CZ101.wasm`),
      fetch(`${baseUrl}cz101/CZ101.js`),
    ]);
    const wasmBinary = await wasmResponse.arrayBuffer();
    const jsCode = cz101Transform(await jsResponse.text());

    // Wait for worklet ready
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('CZ101 init timeout')), 5000);

      const handler = (event: MessageEvent) => {
        if (event.data.type === 'initialized' || event.data.type === 'ready') {
          clearTimeout(timeout);
          this.workletNode?.port.removeEventListener('message', handler);
          resolve();
        } else if (event.data.type === 'error') {
          clearTimeout(timeout);
          this.workletNode?.port.removeEventListener('message', handler);
          reject(new Error(`CZ101 worklet init failed: ${event.data.message}`));
        }
      };

      this.workletNode!.port.addEventListener('message', handler);
      this.workletNode!.port.start();
      this.workletNode!.port.postMessage({ type: 'init', wasmBinary, jsCode }, [wasmBinary]);
    });

    this.isInitialized = true;

    // Load default patch

    console.log('[CZ101Synth] Initialized');
  }

  /**
   * Write a register value to the UPD933
   */
  private writeReg(register: number, value: number): void {
    if (!this.workletNode) return;

    this.workletNode.port.postMessage({
      type: 'writeReg',
      register,
      value
    });
  }

  /**
   * Convert MIDI note to UPD933 pitch value (7.9 fixed point semitones)
   * A4 (MIDI 69) = note 62 in UPD933 = 442Hz, so chip note = MIDI note - 7.
   */
  private midiNoteToPitch(midiNote: number, units: number): number {
    return Math.max(0, Math.min(0xFFFF, Math.round(((midiNote - 7) << 9) + units)));
  }

  /** Waveform register bits 15-6 for a line: both waveforms enabled (the second defaults to the first). */
  private static waveBitsFor(line: CZLine): number {
    const w1 = line.waveform1 & 7;
    const w2 = (line.waveform2 ?? line.waveform1) & 7;
    return (w1 << 13) | (w2 << 10) | (1 << 9) | (((line.window ?? 0) & 7) << 6);
  }

  /** Register word for voice `v`: its own waveform plus, on even voices, the modulation bits of the voice it controls. */
  private writeWaveformRegister(v: number): void {
    const modulated = (v & 1) === 0 ? this.modBits[(v + 6) & 7] : 0;
    this.writeReg(UPD933_REG.WAVEFORM + v, this.waveBits[v] | modulated);
  }

  /** Point voice `v` at `line`; `modulation` = ring (bit 5) and pitch-mod (bits 4-3) bits aimed at this voice. */
  private assignLine(v: number, line: CZLine, lineNumber: 1 | 2, modulation: number): void {
    this.voiceLine[v] = lineNumber;
    this.waveBits[v] = CZ101Synth.waveBitsFor(line);
    this.writeWaveformRegister(v);
    if ((v & 1) === 0 && this.modBits[v] !== modulation) {
      this.modBits[v] = modulation;
      this.writeWaveformRegister((v + 2) & 7); // the register that controls voice v
    }
  }

  /**
   * Free a pair of voices, or one voice. Among the free ones the voice released longest ago is
   * taken, so a note that was just let go keeps ringing out its release instead of being cut
   * by the next key press; only when every voice is held is the oldest held one stolen.
   */
  private allocate(paired: boolean): number[] {
    const oldest = (candidates: readonly number[]) =>
      candidates.reduce((best, v) => (this.voices[v].age < this.voices[best].age ? v : best));
    if (paired) {
      const free = VOICE_PAIRS.filter(([a, b]) => !this.voices[a].active && !this.voices[b].active);
      const age = (pair: readonly [number, number]) => Math.min(this.voices[pair[0]].age, this.voices[pair[1]].age);
      const pool = free.length > 0 ? free : VOICE_PAIRS;
      return [...pool.reduce((best, pair) => (age(pair) < age(best) ? pair : best))];
    }
    const free = SINGLE_VOICE_ORDER.filter((v) => !this.voices[v].active);
    if (free.length > 0) {
      const odd = free.filter((v) => (v & 1) === 1); // odd voices first so the even ones stay free for pairs
      return [oldest(odd.length > 0 ? odd : free)];
    }
    return [oldest(SINGLE_VOICE_ORDER)];
  }

  /** The patch that plays: the bank entry with the editor knobs applied. */
  private effectivePatch(): CZPatch {
    return applyCzKnobs(this.basePatch, this.knobs);
  }

  /** Select a patch directly (not from the bank); knob changes are cleared. */
  loadPatch(patch: CZPatch): void {
    this.basePatch = patch;
    this.knobs = {};
    console.log(`[CZ101Synth] Loaded patch: ${patch.name || 'Unnamed'}`);
  }

  /** Select a bank preset by index. Knob changes are cleared. */
  loadPreset(index: number): void {
    const entry = CZ101_PRESET_BANK[index];
    if (!entry) return;
    this.programIndex = index;
    this.loadPatch(entry.patch);
  }

  getProgram(): number {
    return this.programIndex;
  }

  /**
   * Trigger a note on
   */
  triggerAttack(note: string | number, _time?: number, velocity: number = 0.8): void {
    // Numbers above 127 are frequencies in Hz (the engine's convention for chip synths)
    const midiNote = typeof note === 'string' || note > 127 ? noteToMidi(note) : note;
    if (!this.workletNode) return;

    const patch = this.effectivePatch();
    const lines: CZLine[] = [patch.line1];
    if (patch.line2) lines.push(patch.line2);
    const voices = this.allocate(lines.length > 1);

    // Stealing a voice: its partner (if it was a pair) is silenced too
    const keyedVelocity = Math.floor(Math.max(0, Math.min(1, velocity)) * 127);
    voices.forEach((v, i) => {
      if (this.voices[v].active) this.workletNode!.port.postMessage({ type: 'keyOff', voice: v });
      this.voices[v] = { note: midiNote, velocity: keyedVelocity, active: true, age: ++this.allocationCounter };
      const line = lines[i];
      // Line 2 is the even voice: ring modulation (bit 5) and noise pitch modulation (bits 4-3 = 3)
      const modulation = i === 1 ? (patch.ringMod ? 0x20 : 0) | (patch.noiseMode ? 0x18 : 0) | (patch.ringOnly ? 0x04 : 0) : 0;
      this.assignLine(v, line, i === 1 ? 2 : 1, modulation);

      const detuneUnits = (patch.detune ?? 0) * 4 + (line.detune ?? 0) * CENTS_TO_PITCH_UNITS;
      this.writeReg(UPD933_REG.PITCH + v, this.midiNoteToPitch(midiNote + 12 * (patch.octave ?? 0), detuneUnits));
      this.writeReg(UPD933_REG.PHASE + v, 0);

      this.sendEnvelope(0, v, line.dcaEnvelope, keyedVelocity / 127);
      this.sendEnvelope(1, v, line.dcwEnvelope, 1);
      if (line.dcoEnvelope && line.dcoEnvelope.length > 0) this.sendEnvelope(2, v, line.dcoEnvelope, 1);
    });
  }

  /** Patch levels are 0-99 on the CZ-101's panel; the chip's DCA/DCW level field is 7 bits. */
  private sendEnvelope(kind: 0 | 1 | 2, voice: number, stages: CZEnvelopeStage[], scale: number): void {
    const toChip = kind === 2 ? 1 : 127 / 99;
    this.workletNode?.port.postMessage({
      type: 'envelope',
      kind,
      voice,
      stages: stages.map((st) => ({
        rate: Math.min(127, Math.max(0, Math.round(st.rate))),
        level: Math.min(kind === 2 ? 63 : 127, Math.round(st.level * toChip * scale)),
        coarse: st.coarse,
      })),
    });
  }

  /**
   * Trigger a note off. With no note (the engine's mono-style release) every sounding
   * voice is released.
   */
  triggerRelease(note?: string | number, _time?: number): void {
    const midiNote = note === undefined ? undefined : (typeof note === 'string' ? noteToMidi(note) : note);
    if (!this.workletNode) return;

    this.voices.forEach((voice, v) => {
      if (!voice.active || (midiNote !== undefined && voice.note !== midiNote)) return;
      voice.active = false;
      this.workletNode!.port.postMessage({ type: 'keyOff', voice: v });
    });
  }

  /**
   * Release all active voices (panic button, song stop, etc.)
   */
  releaseAll(): void {
    this.triggerRelease();
  }

  /**
   * Editor knob / MIDI parameter change (the chip-synth contract the engine calls).
   * Oscillator knobs change sounding notes immediately; envelope knobs apply from
   * the next note.
   */
  setParam(param: string, value: number): void {
    if (param === 'volume') {
      this.output.gain.value = Math.max(0, Math.min(1, value));
      return;
    }
    if (param === '_program') {
      this.loadPreset(Math.round(value));
      return;
    }
    if (param === '_userPatch') {
      // An imported patch becomes the base sound. The knobs stay: they mirror the patch the
      // editor chose (or the user's tweaks on a reload), so they are not cleared like a bank load.
      const entry = value > 0 ? getCz101UserPatch(Math.round(value)) : undefined;
      if (entry) this.basePatch = entry.patch; // unknown id (patch lives in another browser): keep the current base
      return;
    }
    if (!KNOB_KEYS.has(param)) return; // stereo_width and unknown keys: no chip register
    (this.knobs as Record<string, number>)[param] = value;
    if (param === 'waveform1' || param === 'waveform2' || param === 'window') this.refreshOscillators();
  }

  /** Legacy name for setParam. */
  setParameter(param: string, value: number): void {
    this.setParam(param, value);
  }

  /** Rewrite the waveform registers of sounding voices from the current knobs. */
  private refreshOscillators(): void {
    if (!this.workletNode) return;
    const patch = this.effectivePatch();
    this.voices.forEach((voice, v) => {
      if (!voice.active || this.voiceLine[v] === 0) return;
      const line = this.voiceLine[v] === 2 ? patch.line2 : patch.line1;
      if (!line) return;
      this.waveBits[v] = CZ101Synth.waveBitsFor(line);
      this.writeWaveformRegister(v);
    });
  }

  /**
   * Get current parameter values
   */
  getParameters(): Record<string, number> {
    return { ...(this.knobs as Record<string, number>) };
  }

  set(param: string, value: number): void {
    this.setParam(param, value);
  }

  get(param: string): number | undefined {
    if (param === 'volume') return this.output.gain.value;
    return (this.knobs as Record<string, number | undefined>)[param];
  }

  dispose(): void {
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    this.output.disconnect();
  }
}

/** The bank as a name -> patch record (kept for callers that look presets up by name). */
export const CZ101_PRESETS: Record<string, CZPatch> = Object.fromEntries(
  CZ101_PRESET_NAMES.map((name) => [name, cz101PresetByName(name)]),
);

export default CZ101Synth;
