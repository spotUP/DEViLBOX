/**
 * CZ101Synth - Casio CZ-101 Phase Distortion Synthesizer
 * Based on the NEC uPD933 chip emulation from MAME
 *
 * This is an 8-voice Phase Distortion synthesizer with:
 * - 8 PD waveforms (Saw, Square, Pulse, Double Sine, Saw Pulse, Resonance, etc.)
 * - 5 window functions for amplitude modulation
 * - DCA (Digitally Controlled Amplifier) envelope
 * - DCW (Digitally Controlled Waveform) envelope
 * - DCO (Digitally Controlled Oscillator) pitch envelope
 * - Ring modulation and pitch modulation between voice pairs
 */

import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

// CZ-101 Waveform types
export const CZWaveform = {
  SAW: 0,        // Sawtooth
  SQUARE: 1,     // Square wave
  PULSE: 2,      // Pulse wave
  SILENT: 3,     // Silent (undocumented)
  DOUBLE_SINE: 4, // Double sine
  SAW_PULSE: 5,  // Saw-pulse hybrid
  RESONANCE: 6,  // Resonant waveform
  DOUBLE_PULSE: 7 // Double pulse (undocumented)
} as const;
export type CZWaveform = typeof CZWaveform[keyof typeof CZWaveform];

// CZ-101 Window functions
export const CZWindow = {
  NONE: 0,
  SAW: 1,
  TRIANGLE: 2,
  TRAPEZOID: 3,
  PULSE: 4,
  DOUBLE_SAW: 5
} as const;
export type CZWindow = typeof CZWindow[keyof typeof CZWindow];

// Envelope stage
export interface CZEnvelopeStage {
  rate: number;   // 0-127
  level: number;  // 0-127
}

// Complete CZ patch definition
export interface CZPatch {
  name?: string;
  line1: CZLine;
  line2?: CZLine;
  detune?: number;      // -7 to +7 fine tune
  octave?: number;      // -2 to +2 octave shift
  vibrato?: {
    wave: number;       // 0-3 (triangle, saw up, saw down, square)
    delay: number;      // 0-99
    rate: number;       // 0-99
    depth: number;      // 0-99
  };
  ringMod?: boolean;
  noiseMode?: boolean;
}

// Single line (oscillator) configuration
export interface CZLine {
  waveform1: CZWaveform;
  waveform2?: CZWaveform;  // Only used if enabled
  dcaEnvelope: CZEnvelopeStage[];  // 8 stages
  dcwEnvelope: CZEnvelopeStage[];  // 8 stages
  dcoEnvelope?: CZEnvelopeStage[]; // 8 stages (pitch envelope)
  dcwEnd?: number;      // End level for DCW
  dcaEnd?: number;      // End level (sustain)
}

// UPD933 Register addresses
const UPD933_REG = {
  DCA_STEP: 0x00,    // 0x00-0x07: DCA envelope step per voice
  DCO_STEP: 0x10,    // 0x10-0x17: DCO envelope step per voice
  DCW_STEP: 0x20,    // 0x20-0x27: DCW envelope step per voice
  PITCH: 0x60,       // 0x60-0x67: Pitch per voice (7.9 fixed point)
  WAVEFORM: 0x68,    // 0x68-0x6F: Waveform per voice
  PHASE: 0x98,       // 0x98-0x9F: Phase counter per voice
  PM_LEVEL: 0xB8,    // 0xB8-0xBB: Pitch modulator level
};

// Voice state
interface VoiceState {
  note: number;
  velocity: number;
  active: boolean;
  envStage: number;
}

export class CZ101Synth extends Tone.ToneAudioNode {
  readonly name = 'CZ101Synth';
  readonly input: undefined = undefined;
  readonly output: Tone.Gain;

  private workletNode: AudioWorkletNode | null = null;
  private voices: VoiceState[] = [];
  private currentPatch: CZPatch | null = null;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;

  // Default CZ-101 patch (Electric Piano style)
  private static readonly DEFAULT_PATCH: CZPatch = {
    name: 'Init',
    line1: {
      waveform1: CZWaveform.SAW,
      dcaEnvelope: [
        { rate: 99, level: 99 },
        { rate: 60, level: 80 },
        { rate: 40, level: 60 },
        { rate: 30, level: 40 },
        { rate: 20, level: 20 },
        { rate: 10, level: 10 },
        { rate: 5, level: 5 },
        { rate: 0, level: 0 }
      ],
      dcwEnvelope: [
        { rate: 99, level: 99 },
        { rate: 50, level: 70 },
        { rate: 30, level: 40 },
        { rate: 20, level: 20 },
        { rate: 10, level: 10 },
        { rate: 5, level: 5 },
        { rate: 2, level: 2 },
        { rate: 0, level: 0 }
      ]
    }
  };

  constructor() {
    super();
    this.output = new Tone.Gain(1);

    // Initialize 8 voices
    for (let i = 0; i < 8; i++) {
      this.voices.push({
        note: 0,
        velocity: 0,
        active: false,
        envStage: 0
      });
    }
  }

  async init(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.doInit();
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    const ctx = Tone.getContext().rawContext as AudioContext;

    if (!ctx.audioWorklet) {
      throw new Error('AudioWorklet not supported');
    }

    const baseUrl = import.meta.env.BASE_URL || '/';

    try {
      await ctx.audioWorklet.addModule(`${baseUrl}cz101/CZ101.worklet.js`);
    } catch (err: any) {
      if (!err?.message?.includes('already')) {
        throw err;
      }
    }

    this.workletNode = new AudioWorkletNode(ctx, 'cz101-processor', {
      numberOfOutputs: 1,
      outputChannelCount: [2]
    });

    // Connect to output
    const nativeOutput = getNativeAudioNode(this.output);
    if (nativeOutput) {
      this.workletNode.connect(nativeOutput);
    } else {
      throw new Error('Could not find native AudioNode for connection');
    }

    // Wait for worklet ready
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('CZ101 init timeout')), 5000);

      const handler = (event: MessageEvent) => {
        if (event.data.type === 'initialized') {
          clearTimeout(timeout);
          this.workletNode?.port.removeEventListener('message', handler);
          resolve();
        }
      };

      this.workletNode!.port.addEventListener('message', handler);
      this.workletNode!.port.start();
      this.workletNode!.port.postMessage({ type: 'init' });
    });

    this.isInitialized = true;

    // Load default patch
    this.loadPatch(CZ101Synth.DEFAULT_PATCH);

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
   * A4 (MIDI 69) = note 62 in UPD933 = 442Hz
   */
  private midiNoteToPitch(midiNote: number, detune: number = 0): number {
    // UPD933 uses note 62 for A4
    // MIDI uses note 69 for A4
    // So UPD933 note = MIDI note - 7
    const upd933Note = midiNote - 7;

    // 7.9 fixed point: 9 bits for fractional semitone
    // Add detune (each unit is roughly 1/512 of a semitone)
    return (upd933Note << 9) + (detune * 4);
  }

  /**
   * Encode DCA envelope step register value
   */
  private encodeDCAStep(direction: number, rate: number, sustain: number, level: number): number {
    return ((direction & 1) << 15) |
           ((rate & 0x7F) << 8) |
           ((sustain & 1) << 7) |
           (level & 0x7F);
  }

  /**
   * Encode DCO envelope step register value (for pitch envelope)
   */
  private _encodeDCOStep(direction: number, rate: number, sustain: number, units: number, level: number): number {
    return ((direction & 1) << 15) |
           ((rate & 0x7F) << 8) |
           ((sustain & 1) << 7) |
           ((units & 1) << 6) |
           (level & 0x3F);
  }

  /**
   * Encode waveform register value
   */
  private encodeWaveform(
    wave1: CZWaveform,
    wave2: CZWaveform | undefined,
    window: CZWindow,
    ringMod: boolean,
    pitchMod: number,
    muteOther: boolean
  ): number {
    const enable2 = wave2 !== undefined ? 1 : 0;
    const w2 = wave2 ?? wave1;

    return ((wave1 & 7) << 13) |
           ((w2 & 7) << 10) |
           (enable2 << 9) |
           ((window & 7) << 6) |
           ((ringMod ? 1 : 0) << 5) |
           ((pitchMod & 3) << 3) |
           ((muteOther ? 1 : 0) << 2);
  }

  /**
   * Load a CZ patch
   */
  loadPatch(patch: CZPatch): void {
    this.currentPatch = patch;

    if (!this.workletNode) return;

    // Configure all 8 voices with the patch parameters
    for (let voice = 0; voice < 8; voice++) {
      // Set waveform for line 1
      const wave = this.encodeWaveform(
        patch.line1.waveform1,
        patch.line1.waveform2,
        CZWindow.NONE,
        patch.ringMod ?? false,
        patch.noiseMode ? 2 : 0,
        false
      );
      this.writeReg(UPD933_REG.WAVEFORM + voice, wave);
    }

    console.log(`[CZ101Synth] Loaded patch: ${patch.name || 'Unnamed'}`);
  }

  /**
   * Trigger a note on
   */
  triggerAttack(note: string | number, _time?: number, velocity: number = 0.8): this {
    const midiNote = typeof note === 'string' ? Tone.Frequency(note).toMidi() : note;

    // Find a free voice
    let voiceIndex = this.voices.findIndex(v => !v.active);
    if (voiceIndex === -1) {
      // Steal oldest voice
      voiceIndex = 0;
    }

    const voice = this.voices[voiceIndex];
    voice.note = midiNote;
    voice.velocity = Math.floor(velocity * 127);
    voice.active = true;
    voice.envStage = 0;

    if (!this.workletNode || !this.currentPatch) return this;

    // Set pitch
    const pitch = this.midiNoteToPitch(midiNote, this.currentPatch.detune ?? 0);
    this.writeReg(UPD933_REG.PITCH + voiceIndex, pitch);

    // Reset phase counter (starts the note)
    this.writeReg(UPD933_REG.PHASE + voiceIndex, 0);

    // Set DCA envelope (attack)
    const dcaStage = this.currentPatch.line1.dcaEnvelope[0];
    const dcaValue = this.encodeDCAStep(
      0,  // direction up
      dcaStage.rate,
      0,  // no sustain on attack
      Math.floor(dcaStage.level * voice.velocity / 127)
    );
    this.writeReg(UPD933_REG.DCA_STEP + voiceIndex, dcaValue);

    // Set DCW envelope (attack)
    const dcwStage = this.currentPatch.line1.dcwEnvelope[0];
    const dcwValue = this.encodeDCAStep(
      0,
      dcwStage.rate,
      0,
      dcwStage.level
    );
    this.writeReg(UPD933_REG.DCW_STEP + voiceIndex, dcwValue);

    // Set DCO envelope (pitch) if defined
    if (this.currentPatch.line1.dcoEnvelope && this.currentPatch.line1.dcoEnvelope.length > 0) {
      const dcoStage = this.currentPatch.line1.dcoEnvelope[0];
      const dcoValue = this._encodeDCOStep(
        0,  // direction up
        dcoStage.rate,
        0,  // no sustain
        0,  // units
        dcoStage.level
      );
      this.writeReg(UPD933_REG.DCO_STEP + voiceIndex, dcoValue);
    }

    return this;
  }

  /**
   * Trigger a note off
   */
  triggerRelease(note: string | number, _time?: number): this {
    const midiNote = typeof note === 'string' ? Tone.Frequency(note).toMidi() : note;

    // Find the voice playing this note
    const voiceIndex = this.voices.findIndex(v => v.active && v.note === midiNote);
    if (voiceIndex === -1) return this;

    const voice = this.voices[voiceIndex];
    voice.active = false;

    if (!this.workletNode || !this.currentPatch) return this;

    // Set DCA envelope to release (direction down, target 0)
    const releaseRate = 40; // Default release rate
    const dcaValue = this.encodeDCAStep(1, releaseRate, 0, 0);
    this.writeReg(UPD933_REG.DCA_STEP + voiceIndex, dcaValue);

    return this;
  }

  /**
   * Set a parameter value
   */
  setParameter(param: string, value: number): void {
    // Parameter mapping to be implemented
    console.log(`[CZ101Synth] setParameter: ${param} = ${value}`);
  }

  /**
   * Get current parameter values
   */
  getParameters(): Record<string, number> {
    return {};
  }

  dispose(): this {
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    this.output.dispose();
    return this;
  }
}

// Factory presets (classic CZ-101 sounds)
export const CZ101_PRESETS: Record<string, CZPatch> = {
  'Brass 1': {
    name: 'Brass 1',
    line1: {
      waveform1: CZWaveform.RESONANCE,
      dcaEnvelope: [
        { rate: 80, level: 99 },
        { rate: 70, level: 85 },
        { rate: 50, level: 70 },
        { rate: 40, level: 60 },
        { rate: 0, level: 60 },
        { rate: 30, level: 40 },
        { rate: 20, level: 20 },
        { rate: 10, level: 0 }
      ],
      dcwEnvelope: [
        { rate: 99, level: 99 },
        { rate: 60, level: 60 },
        { rate: 40, level: 40 },
        { rate: 30, level: 30 },
        { rate: 0, level: 30 },
        { rate: 20, level: 20 },
        { rate: 10, level: 10 },
        { rate: 5, level: 0 }
      ]
    }
  },
  'Electric Piano': {
    name: 'Electric Piano',
    line1: {
      waveform1: CZWaveform.SAW_PULSE,
      dcaEnvelope: [
        { rate: 99, level: 99 },
        { rate: 75, level: 70 },
        { rate: 55, level: 50 },
        { rate: 40, level: 35 },
        { rate: 30, level: 25 },
        { rate: 20, level: 15 },
        { rate: 10, level: 5 },
        { rate: 0, level: 0 }
      ],
      dcwEnvelope: [
        { rate: 99, level: 80 },
        { rate: 70, level: 50 },
        { rate: 50, level: 30 },
        { rate: 35, level: 20 },
        { rate: 25, level: 15 },
        { rate: 15, level: 10 },
        { rate: 8, level: 5 },
        { rate: 0, level: 0 }
      ]
    }
  },
  'Synth Bass': {
    name: 'Synth Bass',
    line1: {
      waveform1: CZWaveform.SQUARE,
      dcaEnvelope: [
        { rate: 99, level: 99 },
        { rate: 99, level: 90 },
        { rate: 0, level: 90 },
        { rate: 0, level: 90 },
        { rate: 0, level: 90 },
        { rate: 0, level: 90 },
        { rate: 50, level: 0 },
        { rate: 0, level: 0 }
      ],
      dcwEnvelope: [
        { rate: 99, level: 99 },
        { rate: 70, level: 40 },
        { rate: 0, level: 40 },
        { rate: 0, level: 40 },
        { rate: 0, level: 40 },
        { rate: 0, level: 40 },
        { rate: 30, level: 0 },
        { rate: 0, level: 0 }
      ]
    },
    octave: -1
  },
  'Pad': {
    name: 'Pad',
    line1: {
      waveform1: CZWaveform.DOUBLE_SINE,
      dcaEnvelope: [
        { rate: 30, level: 40 },
        { rate: 25, level: 60 },
        { rate: 20, level: 75 },
        { rate: 15, level: 85 },
        { rate: 0, level: 85 },
        { rate: 20, level: 60 },
        { rate: 15, level: 30 },
        { rate: 10, level: 0 }
      ],
      dcwEnvelope: [
        { rate: 25, level: 30 },
        { rate: 20, level: 45 },
        { rate: 15, level: 55 },
        { rate: 10, level: 60 },
        { rate: 0, level: 60 },
        { rate: 15, level: 40 },
        { rate: 10, level: 20 },
        { rate: 5, level: 0 }
      ]
    }
  }
};

export default CZ101Synth;
