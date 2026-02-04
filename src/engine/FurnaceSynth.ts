import * as Tone from 'tone';
import type { FurnaceConfig } from '../types/instrument';
import { DEFAULT_FURNACE } from '../types/instrument';
import { FurnaceChipEngine, FurnaceChipType } from './chips/FurnaceChipEngine';
import { FurnaceRegisterMapper } from '../lib/import/formats/FurnaceRegisterMapper';
import { FurnacePitchUtils } from '../lib/import/formats/FurnacePitchUtils';
import { reportSynthError } from '../stores/useSynthErrorStore';

/**
 * FurnaceSynth - Accurate FM Engine for Furnace Tracker Instruments
 * 
 * Uses WASM-based chip emulators for cycle-accurate sound.
 */
export class FurnaceSynth extends Tone.ToneAudioNode {
  readonly name = 'FurnaceSynth';
  readonly input: undefined;
  readonly output: Tone.Gain;

  private chipEngine = FurnaceChipEngine.getInstance();
  private outputGain: Tone.Gain;
  private config: FurnaceConfig;
  private channelIndex: number = 0;

  // Macro playback state
  private macroPositions: Map<number, number> = new Map();
  private opMacroPositions: Array<Record<string, number>> = Array.from({ length: 4 }, () => ({}));
  private activeNoteFreq: number = 440;
  private isNoteOn: boolean = false;
  private currentDuty: number = 2; // Default 50% duty (for PSG/NES/GB)
  private currentPan: number = 0;  // -127 to 127 (0 = center)
  private velocity: number = 1.0;  // 0.0 to 1.0 for velocity modulation
  private baseTLValues: number[] = []; // Store original TL values for velocity scaling
  private _oplBlock: number = 0;   // OPL block (octave)
  private _oplFnum: number = 0;    // OPL F-number (frequency)

  // WASM engine state (no fallback - report errors instead)
  private useWasmEngine: boolean = false;
  private errorReported: boolean = false;

  // Chip state for register writes (exported for debugging/inspection)
  public gbFreqHigh: number = 0; // GB frequency high bits for trigger
  public gbFreqVal: number = 0; // GB frequency value (11-bit) for writeKeyOn
  public nesNoiseIndex: number = 0; // NES noise period index (0-15)

  private initInProgress: boolean = false;
  private wasmNoteTriggered: boolean = false; // Track if note was started via WASM
  private noteOnTime: number = 0; // Time when note was triggered (for minimum gate)
  private static MIN_GATE_TIME = 0.05; // Minimum 50ms gate to allow audio render

  constructor(config: FurnaceConfig = DEFAULT_FURNACE, channelIndex: number = 0) {
    super();
    // Deep clone config to allow velocity-based TL modifications
    this.config = {
      ...config,
      operators: config.operators?.map(op => ({ ...op })) || []
    };
    this.channelIndex = channelIndex;

    // Output
    this.outputGain = new Tone.Gain(1);
    this.output = this.outputGain;

    // Initialize WASM engine asynchronously - don't block constructor
    // No fallback - if WASM fails, an error will be reported
    // updateParameters() is called inside initEngine() after WASM is ready
    this.initEngine();
  }

  /**
   * Ensure WASM engine is initialized - call before playing notes
   */
  public async ensureInitialized(): Promise<void> {
    if (this.useWasmEngine) return; // Already using WASM

    // If init is in progress, wait for it to complete
    if (this.initInProgress) {
      // Poll until init completes (max 2 seconds)
      for (let i = 0; i < 40; i++) {
        await new Promise(resolve => setTimeout(resolve, 50));
        if (this.useWasmEngine || !this.initInProgress) break;
      }
      return;
    }

    await this.initEngine();
  }

  private async initEngine(): Promise<void> {
    // Prevent concurrent init attempts
    if (this.initInProgress) return;
    if (this.useWasmEngine) return;

    this.initInProgress = true;

    try {
      // Get the Tone.js context and pass it to the chip engine
      // The chip engine will handle extracting the native AudioContext
      const toneContext = Tone.getContext();

      // Check if context is in a usable state
      if (!toneContext) {
        this.reportInitError('audio', 'No Tone.js AudioContext available. Audio may not be initialized.');
        this.initInProgress = false;
        return;
      }

      // Wait for Tone.js context to be running (with timeout)
      const state = (toneContext as any).state || (toneContext as any)._context?.state;
      if (state !== 'running') {
        const started = await Promise.race([
          new Promise<boolean>((resolve) => {
            const checkState = () => {
              const currentState = (toneContext as any).state || (toneContext as any)._context?.state;
              if (currentState === 'running') {
                resolve(true);
              } else {
                setTimeout(checkState, 100);
              }
            };
            checkState();
          }),
          new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5000))
        ]);

        if (!started) {
          this.reportInitError('audio', 'AudioContext failed to start. Click anywhere to enable audio, then try again.');
          this.initInProgress = false;
          return;
        }
      }

      // Initialize chip engine - pass Tone.js context, engine will extract native context
      await this.chipEngine.init(toneContext);

      // Check if WASM engine is actually available
      if (this.chipEngine.isInitialized()) {
        // WASM chip engine outputs directly to its own AudioContext destination
        // We don't connect to Tone.js - just mark as ready to use WASM
        this.useWasmEngine = true;
        console.log('[FurnaceSynth] ✓ WASM chip engine ready, chipType:', this.config.chipType);

        // Write parameters to WASM
        this.updateParameters();
        console.log('[FurnaceSynth] ✓ Initial parameters written to WASM');

        // If a note is already active (WASM finished loading mid-note), write frequency and key-on
        if (this.isNoteOn && this.activeNoteFreq > 0) {
          console.log('[FurnaceSynth] ✓ WASM ready mid-note, writing frequency and key-on for', this.activeNoteFreq.toFixed(1), 'Hz');
          this.updateFrequency(this.activeNoteFreq);
          this.writeKeyOn(this.velocity);
          this.wasmNoteTriggered = true;
        }
      } else {
        this.reportInitError('wasm', 'WASM chip engine failed to initialize. This synth requires WebAssembly support.');
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error('[FurnaceSynth] Init error:', err);
      this.reportInitError('wasm', error.message, error);
    } finally {
      this.initInProgress = false;
    }
  }

  /**
   * Report initialization error to the error store (only once per synth instance)
   */
  private reportInitError(errorType: 'wasm' | 'audio', message: string, error?: Error): void {
    if (this.errorReported) return;
    this.errorReported = true;

    reportSynthError(
      `Furnace/${this.config.chipType || 'Unknown'}`,
      message,
      {
        errorType,
        error,
        debugData: {
          chipType: this.config.chipType,
          channelIndex: this.channelIndex,
          synthConfig: this.config as any,
        },
      }
    );
  }

  /**
   * Process a single tracker tick for macro modulation
   * Furnace macro types:
   *   0 = Volume, 1 = Arpeggio, 2 = Duty/Noise, 3 = Wave, 4 = Pitch, 5 = Panning
   *   6 = Phase Reset, 7 = Extra 1, 8 = Extra 2, etc.
   */
  public processTick(time: number = Tone.now()): void {
    if (!this.isNoteOn) return;

    // 1. Global Macros (Volume, Arp, Duty, Pitch, Panning)
    this.config.macros.forEach(macro => {
      if (!macro.data || macro.data.length === 0) return;

      let pos = this.macroPositions.get(macro.type) || 0;
      if (pos >= macro.data.length) pos = macro.data.length - 1;
      const val = macro.data[pos];

      switch (macro.type) {
        case 0: // Volume (0-127) with velocity scaling
          const volGain = Math.max(0, (val / 127) * this.velocity);
          this.outputGain.gain.setValueAtTime(volGain, time);
          break;

        case 1: // Arpeggio (relative semitones)
          this.updateFrequency(this.activeNoteFreq * Math.pow(2, val / 12));
          break;

        case 2: // Duty cycle / Noise mode
          this.currentDuty = val;
          this.writeDutyRegister(val);
          break;

        case 3: // Wavetable select
          this.writeWavetableSelect(val);
          break;

        case 4: // Pitch (relative cents, signed)
          // Furnace pitch macro uses signed values (-128 to 127 typical range)
          const signedPitch = val > 127 ? val - 256 : val;
          this.updateFrequency(this.activeNoteFreq * Math.pow(2, signedPitch / 1200));
          break;

        case 5: // Panning (-127 to 127)
          this.currentPan = val > 127 ? val - 256 : val;
          this.writePanRegister(this.currentPan);
          break;

        case 6: // Phase Reset (trigger on non-zero)
          if (val !== 0) {
            this.writePhaseReset();
          }
          break;
      }

      // Advance position with loop handling
      pos++;
      if (pos >= macro.data.length) {
        pos = macro.loop >= 0 ? macro.loop : macro.data.length - 1;
      }
      this.macroPositions.set(macro.type, pos);
    });

    // 2. Operator Macros (TL, MULT, AR, DR, SL, RR)
    this.config.opMacros.forEach((opMacros, opIndex) => {
      if (!opMacros) return;
      const op = this.config.operators[opIndex];
      if (!op) return; // Skip if operator doesn't exist

      // Total Level (amplitude)
      if (opMacros.tl && opMacros.tl.data.length > 0) {
        const val = this.advanceOpMacro(opMacros.tl, opIndex, 'tl');
        op.tl = val;
        this.writeOperatorTL(opIndex, val);
      }

      // Multiplier (frequency ratio)
      if (opMacros.mult && opMacros.mult.data.length > 0) {
        const val = this.advanceOpMacro(opMacros.mult, opIndex, 'mult');
        op.mult = val;
        this.writeOperatorMult(opIndex, val);
      }

      // Attack Rate
      if (opMacros.ar && opMacros.ar.data.length > 0) {
        const val = this.advanceOpMacro(opMacros.ar, opIndex, 'ar');
        op.ar = val;
        this.writeOperatorAR(opIndex, val);
      }

      // Decay Rate
      if (opMacros.dr && opMacros.dr.data.length > 0) {
        const val = this.advanceOpMacro(opMacros.dr, opIndex, 'dr');
        op.dr = val;
        this.writeOperatorDR(opIndex, val);
      }

      // Sustain Level
      if (opMacros.sl && opMacros.sl.data.length > 0) {
        const val = this.advanceOpMacro(opMacros.sl, opIndex, 'sl');
        op.sl = val;
        this.writeOperatorSL(opIndex, val);
      }

      // Release Rate
      if (opMacros.rr && opMacros.rr.data.length > 0) {
        const val = this.advanceOpMacro(opMacros.rr, opIndex, 'rr');
        op.rr = val;
        this.writeOperatorRR(opIndex, val);
      }
    });
  }

  /**
   * Advance an operator macro position and return current value
   */
  private advanceOpMacro(macro: { data: number[]; loop: number }, opIndex: number, param: string): number {
    let pos = this.opMacroPositions[opIndex][param] || 0;
    if (pos >= macro.data.length) pos = macro.data.length - 1;
    const val = macro.data[pos];

    pos++;
    if (pos >= macro.data.length) {
      pos = macro.loop >= 0 ? macro.loop : macro.data.length - 1;
    }
    this.opMacroPositions[opIndex][param] = pos;

    return val;
  }

  // ============== Per-Parameter Register Writers ==============

  /**
   * Write duty cycle to PSG/NES/GB chips
   */
  private writeDutyRegister(duty: number): void {
    const chan = this.channelIndex;

    if (this.config.chipType === FurnaceChipType.NES) { // NES (4)
      if (chan < 2) { // Pulse channels only
        const base = 0x4000 + (chan * 4);
        // Duty is bits 6-7 of $4000/$4004
        const currentVol = this.config.operators[0]?.tl || 15;
        const volReg = 0x30 | (currentVol & 0x0F); // Constant volume mode
        this.chipEngine.write(FurnaceChipType.NES, base, ((duty & 3) << 6) | volReg);
      }
    } else if (this.config.chipType === FurnaceChipType.GB) { // Game Boy (5)
      if (chan < 2) { // Pulse channels
        const base = chan === 0 ? 0x11 : 0x16;
        // Duty is bits 6-7 of NR11/NR21
        this.chipEngine.write(FurnaceChipType.GB, base, (duty & 3) << 6);
      }
    } else if (this.config.chipType === FurnaceChipType.PSG) { // PSG (3)
      // SN76489 doesn't have duty control, but some variants do
      // For now, just ignore
    }
  }

  /**
   * Write wavetable index select
   */
  private writeWavetableSelect(index: number): void {
    if (this.config.wavetables && this.config.wavetables[index]) {
      const waveData = this.config.wavetables[index].data;
      FurnaceRegisterMapper.uploadWavetable(this.chipEngine, this.config.chipType, waveData);
    }
  }

  /**
   * Write panning register
   */
  private writePanRegister(pan: number): void {
    // pan: -127 (full left) to 127 (full right), 0 = center
    const chan = this.channelIndex;

    if (this.config.chipType === FurnaceChipType.OPN2) { // OPN2 (0)
      // OPN2 has L/R bits in register 0xB4-0xB6 (bits 6-7)
      const part = chan < 3 ? 0 : 1;
      const chanOffset = chan % 3;
      const regBase = part === 0 ? 0x000 : 0x100;

      let lr = 0xC0; // Both L+R by default
      if (pan < -32) lr = 0x80;      // Left only
      else if (pan > 32) lr = 0x40;  // Right only

      // Combine with AMS/FMS (preserve existing values)
      this.chipEngine.write(FurnaceChipType.OPN2, regBase | (0xB4 + chanOffset), lr);
    } else if (this.config.chipType === FurnaceChipType.OPM) { // OPM (1)
      // OPM has L/R bits in register 0x20 (bits 6-7)
      let lr = 0xC0;
      if (pan < -32) lr = 0x80;
      else if (pan > 32) lr = 0x40;

      const current = ((this.config.feedback & 7) << 3) | (this.config.algorithm & 7);
      this.chipEngine.write(FurnaceChipType.OPM, 0x20 + (chan & 7), lr | current);
    } else if (this.config.chipType === FurnaceChipType.GB) { // Game Boy (5)
      // GB has per-channel L/R in NR51 (0x25)
      // This is a global register, so we'd need to track all channels
      // For now, simplified implementation
      let lr = 0;
      if (pan <= 0) lr |= (1 << chan);       // Left
      if (pan >= 0) lr |= (1 << (chan + 4)); // Right
      this.chipEngine.write(FurnaceChipType.GB, 0x25, 0xFF); // All channels both
    }
  }

  /**
   * Write phase reset (retrigger oscillator)
   */
  private writePhaseReset(): void {
    // Most chips reset phase on key-on, but some have explicit control
    // For OPN2/OPM, we can briefly key-off then key-on
    if (this.config.chipType === FurnaceChipType.OPN2) { // OPN2 (0)
      const chanOffset = this.channelIndex % 3;
      const part = this.channelIndex < 3 ? 0 : 1;
      // Quick key-off/on cycle
      this.chipEngine.write(FurnaceChipType.OPN2, 0x28, (part << 2) | chanOffset);
      this.chipEngine.write(FurnaceChipType.OPN2, 0x28, 0xF0 | (part << 2) | chanOffset);
    }
  }

  /**
   * Write operator Total Level (0-127)
   */
  private writeOperatorTL(opIndex: number, tl: number): void {
    const chan = this.channelIndex;

    if (this.config.chipType === FurnaceChipType.OPN2) { // OPN2 (0)
      const part = chan < 3 ? 0 : 1;
      const chanOffset = chan % 3;
      const regBase = part === 0 ? 0x000 : 0x100;
      const opOffsets = [0x00, 0x08, 0x04, 0x0C];
      const opOff = opOffsets[opIndex] + chanOffset;
      this.chipEngine.write(FurnaceChipType.OPN2, regBase | (0x40 + opOff), tl & 0x7F);
    } else if (this.config.chipType === FurnaceChipType.OPM || this.config.chipType === FurnaceChipType.OPZ) { // OPM (1) / OPZ (22)
      const opOffsets = [0x00, 0x10, 0x08, 0x18];
      const opOff = opOffsets[opIndex] + (chan & 7);
      const chip = this.config.chipType;
      this.chipEngine.write(chip, 0x60 + opOff, tl & 0x7F);
    }
  }

  /**
   * Write operator Multiplier (0-15)
   */
  private writeOperatorMult(opIndex: number, mult: number): void {
    const chan = this.channelIndex;
    const op = this.config.operators[opIndex];
    if (!op) return;
    const dtNative = this.furnaceDtToOPN2(op.dt);

    if (this.config.chipType === FurnaceChipType.OPN2) { // OPN2 (0)
      const part = chan < 3 ? 0 : 1;
      const chanOffset = chan % 3;
      const regBase = part === 0 ? 0x000 : 0x100;
      const opOffsets = [0x00, 0x08, 0x04, 0x0C];
      const opOff = opOffsets[opIndex] + chanOffset;
      this.chipEngine.write(FurnaceChipType.OPN2, regBase | (0x30 + opOff), ((dtNative & 7) << 4) | (mult & 0x0F));
    } else if (this.config.chipType === FurnaceChipType.OPM || this.config.chipType === FurnaceChipType.OPZ) { // OPM (1) / OPZ (22)
      const opOffsets = [0x00, 0x10, 0x08, 0x18];
      const opOff = opOffsets[opIndex] + (chan & 7);
      const chip = this.config.chipType;
      this.chipEngine.write(chip, 0x40 + opOff, ((dtNative & 7) << 4) | (mult & 0x0F));
    }
  }

  /**
   * Write operator Attack Rate (0-31)
   */
  private writeOperatorAR(opIndex: number, ar: number): void {
    const chan = this.channelIndex;
    const op = this.config.operators[opIndex];
    if (!op) return;

    if (this.config.chipType === FurnaceChipType.OPN2) { // OPN2 (0)
      const part = chan < 3 ? 0 : 1;
      const chanOffset = chan % 3;
      const regBase = part === 0 ? 0x000 : 0x100;
      const opOffsets = [0x00, 0x08, 0x04, 0x0C];
      const opOff = opOffsets[opIndex] + chanOffset;
      // 0x50: RS (bits 6-7), AR (bits 0-4)
      this.chipEngine.write(FurnaceChipType.OPN2, regBase | (0x50 + opOff), ((op.rs & 3) << 6) | (ar & 0x1F));
    } else if (this.config.chipType === FurnaceChipType.OPM || this.config.chipType === FurnaceChipType.OPZ) { // OPM (1) / OPZ (22)
      const opOffsets = [0x00, 0x10, 0x08, 0x18];
      const opOff = opOffsets[opIndex] + (chan & 7);
      const chip = this.config.chipType;
      this.chipEngine.write(chip, 0x80 + opOff, ((op.rs & 3) << 6) | (ar & 0x1F));
    }
  }

  /**
   * Write operator Decay Rate (0-31)
   */
  private writeOperatorDR(opIndex: number, dr: number): void {
    const chan = this.channelIndex;
    const op = this.config.operators[opIndex];
    if (!op) return;

    if (this.config.chipType === FurnaceChipType.OPN2) { // OPN2 (0)
      const part = chan < 3 ? 0 : 1;
      const chanOffset = chan % 3;
      const regBase = part === 0 ? 0x000 : 0x100;
      const opOffsets = [0x00, 0x08, 0x04, 0x0C];
      const opOff = opOffsets[opIndex] + chanOffset;
      // 0x60: AM (bit 7), DR (bits 0-4)
      this.chipEngine.write(FurnaceChipType.OPN2, regBase | (0x60 + opOff), (op.am ? 0x80 : 0) | (dr & 0x1F));
    } else if (this.config.chipType === FurnaceChipType.OPM || this.config.chipType === FurnaceChipType.OPZ) { // OPM (1) / OPZ (22)
      const opOffsets = [0x00, 0x10, 0x08, 0x18];
      const opOff = opOffsets[opIndex] + (chan & 7);
      const chip = this.config.chipType;
      this.chipEngine.write(chip, 0xA0 + opOff, (op.am ? 0x80 : 0) | (dr & 0x1F));
    }
  }

  /**
   * Write operator Sustain Level (0-15)
   */
  private writeOperatorSL(opIndex: number, sl: number): void {
    const chan = this.channelIndex;
    const op = this.config.operators[opIndex];
    if (!op) return;

    if (this.config.chipType === FurnaceChipType.OPN2) { // OPN2 (0)
      const part = chan < 3 ? 0 : 1;
      const chanOffset = chan % 3;
      const regBase = part === 0 ? 0x000 : 0x100;
      const opOffsets = [0x00, 0x08, 0x04, 0x0C];
      const opOff = opOffsets[opIndex] + chanOffset;
      // 0x80: SL (bits 4-7), RR (bits 0-3)
      this.chipEngine.write(FurnaceChipType.OPN2, regBase | (0x80 + opOff), ((sl & 0x0F) << 4) | (op.rr & 0x0F));
    } else if (this.config.chipType === FurnaceChipType.OPM || this.config.chipType === FurnaceChipType.OPZ) { // OPM (1) / OPZ (22)
      const opOffsets = [0x00, 0x10, 0x08, 0x18];
      const opOff = opOffsets[opIndex] + (chan & 7);
      const chip = this.config.chipType;
      this.chipEngine.write(chip, 0xE0 + opOff, ((sl & 0x0F) << 4) | (op.rr & 0x0F));
    }
  }

  /**
   * Write operator Release Rate (0-15)
   */
  private writeOperatorRR(opIndex: number, rr: number): void {
    const chan = this.channelIndex;
    const op = this.config.operators[opIndex];
    if (!op) return;

    if (this.config.chipType === FurnaceChipType.OPN2) { // OPN2 (0)
      const part = chan < 3 ? 0 : 1;
      const chanOffset = chan % 3;
      const regBase = part === 0 ? 0x000 : 0x100;
      const opOffsets = [0x00, 0x08, 0x04, 0x0C];
      const opOff = opOffsets[opIndex] + chanOffset;
      // 0x80: SL (bits 4-7), RR (bits 0-3)
      this.chipEngine.write(FurnaceChipType.OPN2, regBase | (0x80 + opOff), ((op.sl & 0x0F) << 4) | (rr & 0x0F));
    } else if (this.config.chipType === FurnaceChipType.OPM || this.config.chipType === FurnaceChipType.OPZ) { // OPM (1) / OPZ (22)
      const opOffsets = [0x00, 0x10, 0x08, 0x18];
      const opOff = opOffsets[opIndex] + (chan & 7);
      const chip = this.config.chipType;
      this.chipEngine.write(chip, 0xE0 + opOff, ((op.sl & 0x0F) << 4) | (rr & 0x0F));
    }
  }

  /**
   * Convert Furnace DT to OPN2 native format
   */
  private furnaceDtToOPN2(dt: number): number {
    if (dt >= 0) return dt & 3;
    return (4 + Math.abs(dt)) & 7;
  }

  private updateFrequency(freq: number): void {
    const chanOffset = (this.channelIndex % 3);
    const part = this.channelIndex < 3 ? 0 : 1;
    const regBase = part === 0 ? 0x00 : 0x100;

    if (this.config.chipType === FurnaceChipType.OPN2) { // OPN2 (0)
      const { block, fnum } = FurnacePitchUtils.freqToOPN2(freq);

      // Register A0-A2: F-Number low (8 bits)
      this.chipEngine.write(FurnaceChipType.OPN2, regBase | (0xA0 + chanOffset), fnum & 0xFF);
      // Register A4-A6: Block (bits 3-5), F-Number high (bits 0-2)
      this.chipEngine.write(FurnaceChipType.OPN2, regBase | (0xA4 + chanOffset), ((block & 7) << 3) | ((fnum >> 8) & 7));
    } else if (this.config.chipType === FurnaceChipType.OPN) { // OPN/YM2203 (47)
      // OPN uses same frequency format as OPN2 but only has 3 channels (no second bank)
      const { block, fnum } = FurnacePitchUtils.freqToOPN2(freq);
      const opnChanOffset = this.channelIndex % 3;

      // Register A0-A2: F-Number low (8 bits)
      this.chipEngine.write(FurnaceChipType.OPN, 0xA0 + opnChanOffset, fnum & 0xFF);
      // Register A4-A6: Block (bits 3-5), F-Number high (bits 0-2)
      this.chipEngine.write(FurnaceChipType.OPN, 0xA4 + opnChanOffset, ((block & 7) << 3) | ((fnum >> 8) & 7));
    } else if (this.config.chipType === FurnaceChipType.OPM) { // OPM (1)
      const { kc, kf } = FurnacePitchUtils.freqToOPM(freq);

      // Register 28-2F: Key Code
      this.chipEngine.write(FurnaceChipType.OPM, 0x28 + (this.channelIndex & 7), kc);
      // Register 30-37: Key Fraction
      this.chipEngine.write(FurnaceChipType.OPM, 0x30 + (this.channelIndex & 7), kf << 2);
    } else if (this.config.chipType === FurnaceChipType.OPZ) { // OPZ (22) - TX81Z/YM2414
      // Reference: Furnace tx81z.cpp lines 429-430, hScale function
      // OPZ uses similar KC/KF system to OPM but with a different note mapping
      // noteMap[12] = {0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14}
      // KC = ((note/12)<<4) + noteMap[note%12]
      const noteMap = [0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14];
      const midi = Math.round(12 * Math.log2(freq / 440) + 69);
      const note = Math.max(0, Math.min(127, midi));
      const octave = Math.floor(note / 12);
      const noteInOctave = note % 12;
      const kc = ((octave & 7) << 4) | noteMap[noteInOctave];
      const fraction = (12 * Math.log2(freq / 440) + 69) - note;
      const kf = Math.floor(fraction * 64) & 0x3F;

      // Register 0x28+chan: Key Code (KC)
      this.chipEngine.write(FurnaceChipType.OPZ, 0x28 + (this.channelIndex & 7), kc);
      // Register 0x30+chan: Key Fraction (KF) - bits 2-7
      this.chipEngine.write(FurnaceChipType.OPZ, 0x30 + (this.channelIndex & 7), kf << 2);
    } else if (this.config.chipType === FurnaceChipType.OPL3) { // OPL3 (2)
      const chanOff = this.channelIndex % 9;
      const oplPart = this.channelIndex < 9 ? 0x000 : 0x100;
      // Simplified OPL F-Number calculation
      const fnum = Math.floor((freq * (1 << 19)) / 50000) & 0x3FF;
      this.chipEngine.write(FurnaceChipType.OPL3, oplPart | (0xA0 + chanOff), fnum & 0xFF);
      this.chipEngine.write(FurnaceChipType.OPL3, oplPart | (0xB0 + chanOff), 0x20 | ((fnum >> 8) & 3)); // Octave 4 default
    } else if (this.config.chipType === FurnaceChipType.PSG) { // PSG (3)
      const period = Math.floor(3579545 / (32 * freq)) & 0x3FF;
      const chan = this.channelIndex & 3;
      this.chipEngine.write(FurnaceChipType.PSG, 0, 0x80 | (chan << 5) | (period & 0x0F));
      this.chipEngine.write(FurnaceChipType.PSG, 0, (period >> 4) & 0x3F);
    } else if (this.config.chipType === FurnaceChipType.NES) { // NES (4)
      const chan = this.channelIndex; // 0=Pulse1, 1=Pulse2, 2=Tri, 3=Noise, 4=DMC

      if (chan < 2) { // Pulse
        const period = FurnacePitchUtils.freqToNES(freq);
        const base = 0x4000 + (chan * 4);
        this.chipEngine.write(FurnaceChipType.NES, base + 2, period & 0xFF);
        this.chipEngine.write(FurnaceChipType.NES, base + 3, (period >> 8) & 0x07); // Keep length counter
      } else if (chan === 2) { // Triangle
        const period = FurnacePitchUtils.freqToNES(freq);
        this.chipEngine.write(FurnaceChipType.NES, 0x400A, period & 0xFF);
        this.chipEngine.write(FurnaceChipType.NES, 0x400B, (period >> 8) & 0x07);
      } else if (chan === 3) { // Noise
        // NES noise uses a 4-bit period index (0-15) to select from a lookup table
        // Higher notes = lower period index (faster noise), lower notes = higher index (slower noise)
        // The noise period lookup table has 16 entries, we map frequency to an index
        // Reference: Furnace nes.cpp noise frequency handling
        const noiseIndex = FurnacePitchUtils.freqToNESNoise(freq);
        this.nesNoiseIndex = noiseIndex;
        this.chipEngine.write(FurnaceChipType.NES, 0x400E, noiseIndex & 0x0F);
      }
    } else if (this.config.chipType === FurnaceChipType.GB) { // Game Boy (5)
      // Furnace stores frequency and writes it during tick() with trigger
      // We store it here for writeKeyOn to use
      // Furnace formula: writes (2048 - freq) where freq is calculated from note
      // Our freqToGB already returns the value to write directly
      const freqVal = FurnacePitchUtils.freqToGB(freq);
      this.gbFreqVal = freqVal;
      console.log(`[FurnaceSynth] updateFrequency GB: freq=${freq}, freqVal=${freqVal} (will write in writeKeyOn)`);
      // Note: Actual register writes happen in writeKeyOn, matching Furnace's tick() behavior
    } else if (this.config.chipType === FurnaceChipType.PCE) { // PCE (6)
      // PC Engine frequency register is 12-bit
      // Reference: pce.cpp - freq register at 0x02-0x03
      // Formula: period = 3579545 / (32 * freq)
      const chan = this.channelIndex;
      const period = Math.floor(3579545 / (32 * freq)) & 0xFFF;
      this.chipEngine.write(FurnaceChipType.PCE, 0x00, chan & 7);  // Select channel
      this.chipEngine.write(FurnaceChipType.PCE, 0x02, period & 0xFF);       // Freq low
      this.chipEngine.write(FurnaceChipType.PCE, 0x03, (period >> 8) & 0x0F); // Freq high
    } else if (this.config.chipType === FurnaceChipType.SNES) { // SNES (24)
      // SNES pitch is 14-bit, calculated as: pitch = (freq * 4096) / sampleRate
      // Reference: snes.cpp pitch calculation
      const chan = this.channelIndex;
      const voiceBase = (chan & 7) * 0x10;
      // Simplified pitch calculation (assuming 32kHz sample rate)
      const pitch = Math.floor((freq * 4096) / 32000) & 0x3FFF;
      this.chipEngine.write(FurnaceChipType.SNES, voiceBase + 0x02, pitch & 0xFF);       // PITCH L
      this.chipEngine.write(FurnaceChipType.SNES, voiceBase + 0x03, (pitch >> 8) & 0x3F); // PITCH H
    }
  }

  public updateParameters(): void {
    // Use the mapper to write all registers based on chip type
    // NOTE: chipType uses FurnaceChipType enum values (0-44)
    switch (this.config.chipType) {
      // === FM SYNTHESIS CHIPS ===
      case 0: // OPN2/Genesis (FurnaceChipType.OPN2)
        FurnaceRegisterMapper.mapOPN2(this.chipEngine, this.channelIndex, this.config);
        break;

      case 1: // OPM/Arcade (FurnaceChipType.OPM)
        FurnaceRegisterMapper.mapOPM(this.chipEngine, this.channelIndex, this.config);
        break;

      case 2: // OPL3 (FurnaceChipType.OPL3)
        FurnaceRegisterMapper.mapOPL3(this.chipEngine, this.channelIndex, this.config);
        break;

      case 11: // OPLL (FurnaceChipType.OPLL)
        FurnaceRegisterMapper.mapOPLL(this.chipEngine, this.channelIndex, this.config);
        break;

      case 13: // OPNA (FurnaceChipType.OPNA)
        FurnaceRegisterMapper.mapOPNA(this.chipEngine, this.channelIndex, this.config);
        break;

      case 14: // OPNB (FurnaceChipType.OPNB)
        FurnaceRegisterMapper.mapOPNB(this.chipEngine, this.channelIndex, this.config);
        break;

      case 22: // OPZ (FurnaceChipType.OPZ)
        FurnaceRegisterMapper.mapOPZ(this.chipEngine, this.channelIndex, this.config);
        break;

      case 23: // Y8950 (FurnaceChipType.Y8950)
        FurnaceRegisterMapper.mapY8950(this.chipEngine, this.channelIndex, this.config);
        break;

      case 26: // OPL4 (FurnaceChipType.OPL4)
        FurnaceRegisterMapper.mapOPL4(this.chipEngine, this.channelIndex, this.config);
        break;

      case 47: // OPN/YM2203 (FurnaceChipType.OPN)
        // OPN is similar to OPNA but simpler (3 FM + 3 SSG channels, no ADPCM)
        FurnaceRegisterMapper.mapOPN(this.chipEngine, this.channelIndex, this.config);
        break;

      case 48: // OPNB-B/YM2610B (FurnaceChipType.OPNB_B)
        // Extended Neo Geo - similar to OPNB
        FurnaceRegisterMapper.mapOPNB(this.chipEngine, this.channelIndex, this.config);
        break;

      case 49: // ESFM (FurnaceChipType.ESFM)
        // Enhanced OPL3 - use OPL3 mapper
        FurnaceRegisterMapper.mapOPL3(this.chipEngine, this.channelIndex, this.config);
        break;

      // === PSG/SQUARE WAVE CHIPS ===
      case 3: // PSG (FurnaceChipType.PSG)
        FurnaceRegisterMapper.mapPSG(this.chipEngine, this.channelIndex, this.config);
        break;

      case 12: // AY (FurnaceChipType.AY)
        FurnaceRegisterMapper.mapAY(this.chipEngine, this.channelIndex, this.config);
        break;

      case 18: // SAA (FurnaceChipType.SAA)
        FurnaceRegisterMapper.mapSAA(this.chipEngine, this.channelIndex, this.config);
        break;

      case 43: // T6W28 (FurnaceChipType.T6W28)
        FurnaceRegisterMapper.mapT6W28(this.chipEngine, this.channelIndex, this.config);
        break;

      // === GAME CONSOLE CHIPS ===
      case 4: // NES (FurnaceChipType.NES)
        FurnaceRegisterMapper.mapNES(this.chipEngine, this.channelIndex, this.config);
        break;

      case 5: // Game Boy (FurnaceChipType.GB)
        FurnaceRegisterMapper.mapGB(this.chipEngine, this.channelIndex, this.config);
        // Upload wavetable if available (for wave channel)
        if (this.config.wavetables.length > 0) {
          FurnaceRegisterMapper.uploadWavetable(this.chipEngine, FurnaceChipType.GB, this.config.wavetables[0].data);
        }
        break;

      case 6: // PCE (FurnaceChipType.PCE)
        FurnaceRegisterMapper.mapPCE(this.chipEngine, this.channelIndex, this.config);
        if (this.config.wavetables.length > 0) {
          FurnaceRegisterMapper.uploadWavetable(this.chipEngine, FurnaceChipType.PCE, this.config.wavetables[0].data);
        }
        break;

      case 24: // SNES (FurnaceChipType.SNES)
        FurnaceRegisterMapper.mapSNES(this.chipEngine, this.channelIndex, this.config);
        break;

      case 44: // Virtual Boy (FurnaceChipType.VB)
        FurnaceRegisterMapper.mapVB(this.chipEngine, this.channelIndex, this.config);
        break;

      // === NES EXPANSION CHIPS ===
      case 16: // FDS (FurnaceChipType.FDS)
        FurnaceRegisterMapper.mapFDS(this.chipEngine, this.channelIndex, this.config);
        break;

      case 17: // MMC5 (FurnaceChipType.MMC5)
        FurnaceRegisterMapper.mapMMC5(this.chipEngine, this.channelIndex, this.config);
        break;

      case 8: // N163 (FurnaceChipType.N163)
        FurnaceRegisterMapper.mapN163(this.chipEngine, this.channelIndex, this.config);
        if (this.config.wavetables.length > 0) {
          FurnaceRegisterMapper.uploadWavetable(this.chipEngine, FurnaceChipType.N163, this.config.wavetables[0].data);
        }
        break;

      case 9: // VRC6 (FurnaceChipType.VRC6)
        FurnaceRegisterMapper.mapVRC6(this.chipEngine, this.channelIndex, this.config);
        break;

      // === WAVETABLE CHIPS ===
      case 7: // SCC (FurnaceChipType.SCC)
        FurnaceRegisterMapper.mapSCC(this.chipEngine, this.channelIndex, this.config);
        if (this.config.wavetables.length > 0) {
          FurnaceRegisterMapper.uploadWavetable(this.chipEngine, FurnaceChipType.SCC, this.config.wavetables[0].data);
        }
        break;

      case 19: // WonderSwan (FurnaceChipType.SWAN)
        FurnaceRegisterMapper.mapSWAN(this.chipEngine, this.channelIndex, this.config);
        if (this.config.wavetables.length > 0) {
          FurnaceRegisterMapper.uploadWavetable(this.chipEngine, FurnaceChipType.SWAN, this.config.wavetables[0].data);
        }
        break;

      case 36: // VERA (FurnaceChipType.VERA)
        FurnaceRegisterMapper.mapVERA(this.chipEngine, this.channelIndex, this.config);
        break;

      case 37: // SM8521 (FurnaceChipType.SM8521)
        FurnaceRegisterMapper.mapSM8521(this.chipEngine, this.channelIndex, this.config);
        break;

      case 38: // Bubble System (FurnaceChipType.BUBBLE)
        FurnaceRegisterMapper.mapBUBBLE(this.chipEngine, this.channelIndex, this.config);
        if (this.config.wavetables.length > 0) {
          FurnaceRegisterMapper.uploadWavetable(this.chipEngine, FurnaceChipType.BUBBLE, this.config.wavetables[0].data);
        }
        break;

      // === SID ===
      case 10: // C64 SID3 (FurnaceChipType.SID)
        FurnaceRegisterMapper.mapC64(this.chipEngine, this.channelIndex, this.config);
        break;

      case 45: // Classic SID 6581 (FurnaceChipType.SID_6581)
      case 46: // Classic SID 8580 (FurnaceChipType.SID_8580)
        FurnaceRegisterMapper.mapC64(this.chipEngine, this.channelIndex, this.config);
        break;

      // === SAMPLE PLAYBACK CHIPS ===
      case 20: // OKI (FurnaceChipType.OKI)
        FurnaceRegisterMapper.mapOKI(this.chipEngine, this.channelIndex, this.config);
        break;

      case 21: // ES5506 (FurnaceChipType.ES5506)
        FurnaceRegisterMapper.mapES5506(this.chipEngine, this.channelIndex, this.config);
        break;

      case 27: // Sega PCM (FurnaceChipType.SEGAPCM)
        FurnaceRegisterMapper.mapSEGAPCM(this.chipEngine, this.channelIndex, this.config);
        break;

      case 28: // YMZ280B (FurnaceChipType.YMZ280B)
        FurnaceRegisterMapper.mapYMZ280B(this.chipEngine, this.channelIndex, this.config);
        break;

      case 29: // RF5C68 (FurnaceChipType.RF5C68)
        FurnaceRegisterMapper.mapRF5C68(this.chipEngine, this.channelIndex, this.config);
        break;

      case 30: // GA20 (FurnaceChipType.GA20)
        FurnaceRegisterMapper.mapGA20(this.chipEngine, this.channelIndex, this.config);
        break;

      case 31: // C140 (FurnaceChipType.C140)
        FurnaceRegisterMapper.mapC140(this.chipEngine, this.channelIndex, this.config);
        break;

      case 32: // QSound (FurnaceChipType.QSOUND)
        FurnaceRegisterMapper.mapQSOUND(this.chipEngine, this.channelIndex, this.config);
        break;

      case 39: // K007232 (FurnaceChipType.K007232)
        FurnaceRegisterMapper.mapK007232(this.chipEngine, this.channelIndex, this.config);
        break;

      case 40: // K053260 (FurnaceChipType.K053260)
        FurnaceRegisterMapper.mapK053260(this.chipEngine, this.channelIndex, this.config);
        break;

      case 41: // X1-010 (FurnaceChipType.X1_010)
        FurnaceRegisterMapper.mapX1_010(this.chipEngine, this.channelIndex, this.config);
        if (this.config.wavetables.length > 0) {
          FurnaceRegisterMapper.uploadWavetable(this.chipEngine, FurnaceChipType.X1_010, this.config.wavetables[0].data);
        }
        break;

      // === OTHER CHIPS ===
      case 15: // TIA (FurnaceChipType.TIA)
        FurnaceRegisterMapper.mapTIA(this.chipEngine, this.channelIndex, this.config);
        break;

      case 33: // VIC (FurnaceChipType.VIC)
        FurnaceRegisterMapper.mapVIC(this.chipEngine, this.channelIndex, this.config);
        break;

      case 34: // TED (FurnaceChipType.TED)
        FurnaceRegisterMapper.mapTED(this.chipEngine, this.channelIndex, this.config);
        break;

      case 35: // Supervision (FurnaceChipType.SUPERVISION)
        FurnaceRegisterMapper.mapSUPERVISION(this.chipEngine, this.channelIndex, this.config);
        break;

      case 42: // UPD1771 (FurnaceChipType.UPD1771)
        FurnaceRegisterMapper.mapUPD1771(this.chipEngine, this.channelIndex, this.config);
        break;

      case 25: // Lynx (FurnaceChipType.LYNX)
        FurnaceRegisterMapper.mapLYNX(this.chipEngine, this.channelIndex, this.config);
        break;

      default:
        console.warn(`[FurnaceSynth] No mapper for chipType ${this.config.chipType}`);
    }
  }

  public triggerAttack(note: string, time?: number, velocity?: number): this {
    const freq = Tone.Frequency(note).toFrequency();
    this.activeNoteFreq = freq;
    this.isNoteOn = true;

    // Store velocity for macro modulation (0.0 to 1.0)
    this.velocity = velocity !== undefined ? velocity : 1.0;

    const scheduledTime = time || Tone.now();

    // Record note on time for minimum gate enforcement
    this.noteOnTime = Tone.now();

    // Try to use WASM if available (check even if initInProgress - engine may be pre-initialized)
    if (!this.useWasmEngine) {
      // Check if chip engine is already initialized (e.g., by ToneEngine.init())
      if (this.chipEngine.isInitialized()) {
        // WASM is ready, use it immediately
        this.useWasmEngine = true;
        // Write init parameters if not already done
        this.updateParameters();
        console.log('[FurnaceSynth] ✓ Using pre-initialized WASM engine, chipType:', this.config.chipType);
      } else if (!this.initInProgress) {
        // WASM not available - error was already reported during init
        // Try to re-init in case context is now available
        this.initEngine();
      }
    }

    // If WASM engine still isn't available, we can't play - just return silently
    // The error was already reported during initialization
    if (!this.useWasmEngine) {
      console.warn(`[FurnaceSynth] Cannot play note - WASM engine not available for ${this.config.chipType}`);
      return this;
    }

    // Reset all macro state for new note
    this.macroPositions.clear();
    this.opMacroPositions = Array.from({ length: 4 }, () => ({}));
    this.currentDuty = 2;  // Reset to 50% duty
    this.currentPan = 0;   // Reset to center

    // Store base TL values before velocity scaling
    this.baseTLValues = this.config.operators.map(op => op.tl);

    // Apply velocity scaling to carrier operators for FM chips
    this.applyVelocityToCarriers();

    // 1. Setup registers (with velocity-scaled TL)
    console.log(`[FurnaceSynth.triggerAttack] chipType=${this.config.chipType}, operators.length=${this.config.operators.length}, freq=${freq.toFixed(1)}`);
    this.updateParameters();
    this.updateFrequency(freq);

    // 2. Write Key ON (chip-specific)
    console.log(`[FurnaceSynth.triggerAttack] Writing KEY ON`);
    this.writeKeyOn(velocity);

    // 3. Process first macro tick
    this.processTick(scheduledTime);

    return this;
  }

  /**
   * Apply velocity scaling to carrier operators based on algorithm
   * FM algorithms have different carrier/modulator configurations
   * Only carriers (output operators) should be velocity-sensitive
   */
  private applyVelocityToCarriers(): void {
    if (this.config.chipType !== FurnaceChipType.OPN2 && this.config.chipType !== FurnaceChipType.OPM) {
      return; // Only apply to FM chips (OPN2=0, OPM=1)
    }

    // Carrier operators by algorithm (0-7) - 0-indexed
    // Reference: YM2612/OPN2 algorithm diagrams
    // Carrier = operator that outputs directly to DAC
    const carriersByAlgorithm: number[][] = [
      [3],           // Alg 0: OP1→OP2→OP3→OP4→OUT (Op4 carrier)
      [3],           // Alg 1: OP1+OP2→OP3→OP4→OUT (Op4 carrier)
      [3],           // Alg 2: OP1+(OP2→OP3)→OP4→OUT (Op4 carrier)
      [3],           // Alg 3: (OP1→OP2)+OP3→OP4→OUT (Op4 carrier)
      [2, 3],        // Alg 4: OP1→OP2→OP3→OUT, OP4→OUT (Op3,Op4 carriers)
      [2, 3],        // Alg 5: OP1→OP2→OUT, OP1→OP3→OUT, OP1→OP4→OUT (Op2,Op3,Op4 carriers... but OP1 is single modulator, carriers are 2,3,4)
      [1, 2, 3],     // Alg 6: OP1→OP2→OUT, OP3→OUT, OP4→OUT (Op2,Op3,Op4 carriers)
      [0, 1, 2, 3],  // Alg 7: All operators output directly (all carriers)
    ];

    const carriers = carriersByAlgorithm[this.config.algorithm & 7] || [3];

    // Velocity affects TL (total level) - lower TL = louder
    // Scale: velocity 1.0 = original TL, velocity 0.0 = TL + 32 (quieter)
    const tlOffset = Math.floor((1.0 - this.velocity) * 32);

    for (const opIndex of carriers) {
      if (this.config.operators[opIndex]) {
        const baseTL = this.baseTLValues[opIndex];
        // Clamp TL to 0-127 range
        this.config.operators[opIndex].tl = Math.min(127, baseTL + tlOffset);
      }
    }
  }

  /**
   * Write chip-specific key-on command
   */
  private writeKeyOn(velocity?: number): void {
    const chan = this.channelIndex;
    const vol = velocity !== undefined ? Math.floor(velocity * 15) : 15;

    switch (this.config.chipType) {
      case FurnaceChipType.OPN2: // OPN2 (0)
        const chanOffset = chan % 3;
        const part = chan < 3 ? 0 : 1;
        const keyOnVal = 0xF0 | (part << 2) | chanOffset; // All 4 operators ON
        this.chipEngine.write(FurnaceChipType.OPN2, 0x28, keyOnVal);
        break;

      case FurnaceChipType.OPM: // OPM (1)
        // OPM key-on is register 0x08, bits 0-2 = channel, bits 3-6 = operators
        this.chipEngine.write(FurnaceChipType.OPM, 0x08, 0x78 | (chan & 7));
        break;

      case FurnaceChipType.NES: { // NES (4)
        // Reference: Furnace nes.cpp:387-416 - EXACT byte order from source
        // Register layout: 0x4000+i*4 = vol/duty, +1 = sweep, +2 = freq low, +3 = length/freq high
        // Enable channels first
        this.chipEngine.write(FurnaceChipType.NES, 0x4015, 0x1F); // Enable all 5 channels

        if (chan < 2) { // Pulse channels
          const base = 0x4000 + (chan * 4);
          const period = FurnacePitchUtils.freqToNES(this.activeNoteFreq);
          // nes.cpp:309,587 - Volume/duty first
          this.chipEngine.write(FurnaceChipType.NES, base, ((this.currentDuty & 3) << 6) | 0x30 | vol);
          // nes.cpp:593 - Sweep register (0x08 = disabled)
          this.chipEngine.write(FurnaceChipType.NES, base + 1, 0x08);
          // nes.cpp:405-407 - Freq low, then length+freq high
          this.chipEngine.write(FurnaceChipType.NES, base + 2, period & 0xFF);
          this.chipEngine.write(FurnaceChipType.NES, base + 3, (0x01 << 3) | ((period >> 8) & 0x07)); // Length=1
        } else if (chan === 2) { // Triangle
          const period = FurnacePitchUtils.freqToNES(this.activeNoteFreq);
          // nes.cpp:306,585 - Linear counter
          this.chipEngine.write(FurnaceChipType.NES, 0x4008, 0xFF); // Max linear counter
          this.chipEngine.write(FurnaceChipType.NES, 0x400A, period & 0xFF);
          this.chipEngine.write(FurnaceChipType.NES, 0x400B, (0x01 << 3) | ((period >> 8) & 0x07));
        } else if (chan === 3) { // Noise
          // nes.cpp:402-403 - Noise uses different register layout
          this.chipEngine.write(FurnaceChipType.NES, 0x400C, 0x30 | vol); // Volume
          this.chipEngine.write(FurnaceChipType.NES, 0x400E, this.nesNoiseIndex & 0x0F); // Noise period
          this.chipEngine.write(FurnaceChipType.NES, 0x400F, 0x08); // Length counter
        }
        break;
      }

      case FurnaceChipType.GB: { // Game Boy (5)
        // Reference: Furnace gb.cpp:338-366 - EXACT byte order from source
        // Registers per channel: Pulse1=0x10-0x14, Pulse2=0x15-0x19 (skip 0x15), Wave=0x1A-0x1E, Noise=0x20-0x23
        // Furnace uses 16+i*5 addressing: CH0→0x10, CH1→0x15, CH2→0x1A, CH3→0x1F (but noise at 0x20)
        const gbFreqVal = this.gbFreqVal || 0;

        if (chan < 2) { // Pulse channels
          const base = chan === 0 ? 0x10 : 0x15;
          // gb.cpp:343-354 - Envelope/duty first, then freq with trigger
          this.chipEngine.write(FurnaceChipType.GB, base + 1, ((this.currentDuty & 3) << 6) | 63); // Duty + length
          this.chipEngine.write(FurnaceChipType.GB, base + 2, (vol << 4) | 0x08); // Volume envelope
          // gb.cpp:360-361 - Freq low, then freq high WITH trigger (0x80)
          this.chipEngine.write(FurnaceChipType.GB, base + 3, (2048 - gbFreqVal) & 0xFF);
          this.chipEngine.write(FurnaceChipType.GB, base + 4, (((2048 - gbFreqVal) >> 8) & 7) | 0x80);
        } else if (chan === 2) { // Wave channel
          // gb.cpp:339-342 - Wave enable, volume, then freq+trigger
          this.chipEngine.write(FurnaceChipType.GB, 0x1A, 0x80); // Enable wave
          this.chipEngine.write(FurnaceChipType.GB, 0x1B, 0xFF); // Length
          this.chipEngine.write(FurnaceChipType.GB, 0x1C, 0x20); // Volume (full)
          this.chipEngine.write(FurnaceChipType.GB, 0x1D, (2048 - gbFreqVal) & 0xFF);
          this.chipEngine.write(FurnaceChipType.GB, 0x1E, (((2048 - gbFreqVal) >> 8) & 7) | 0x80);
        } else if (chan === 3) { // Noise channel
          // gb.cpp:357-358 - Envelope, then noise params + trigger
          this.chipEngine.write(FurnaceChipType.GB, 0x20, 0x3F); // Length
          this.chipEngine.write(FurnaceChipType.GB, 0x21, (vol << 4) | 0x08); // Volume envelope
          this.chipEngine.write(FurnaceChipType.GB, 0x22, 0x00); // Noise frequency
          this.chipEngine.write(FurnaceChipType.GB, 0x23, 0x80); // Trigger
        }
        this.chipEngine.write(FurnaceChipType.GB, 0x26, 0x80); // Master enable (NR52)
        break;
      }

      case FurnaceChipType.PSG: // PSG (3)
        const atten = 15 - Math.min(15, vol);
        this.chipEngine.write(FurnaceChipType.PSG, 0, 0x90 | ((chan & 3) << 5) | atten);
        break;

      case FurnaceChipType.PCE: { // PCE (6)
        // Reference: Furnace pce.cpp:360 - EXACT byte order from source
        // Register layout: 0x00=chan select, 0x02/0x03=freq, 0x04=control, 0x05=pan
        const pceFreq = Math.floor(3579545 / (32 * this.activeNoteFreq)) & 0xFFF;
        this.chipEngine.write(FurnaceChipType.PCE, 0x00, chan & 7);  // Select channel
        this.chipEngine.write(FurnaceChipType.PCE, 0x02, pceFreq & 0xFF);  // Freq low
        this.chipEngine.write(FurnaceChipType.PCE, 0x03, (pceFreq >> 8) & 0x0F);  // Freq high
        // pce.cpp:360 - Control: bit 7 = enable, bits 0-4 = volume
        this.chipEngine.write(FurnaceChipType.PCE, 0x04, 0x80 | (vol & 0x1F));
        this.chipEngine.write(FurnaceChipType.PCE, 0x05, 0xFF);  // Pan: left+right max
        break;
      }

      case FurnaceChipType.SNES: { // SNES (24)
        // Reference: Furnace snes.cpp:221-248, 329-345 - EXACT byte order from source
        // Register layout per voice: +0=VOL_L, +1=VOL_R, +2=PITCH_L, +3=PITCH_H, +4=SRCN, +5=ADSR1, +6=ADSR2, +7=GAIN
        const voiceBase = (chan & 7) * 0x10;
        const chanMask = 1 << (chan & 7);

        // snes.cpp:275 - KOFF first to reset voice
        this.chipEngine.write(FurnaceChipType.SNES, 0x5C, chanMask);

        // Write pitch (calculated from frequency)
        // SNES pitch: (freq * 4096) / sampleRate, assuming 32kHz
        const pitch = Math.floor((this.activeNoteFreq * 4096) / 32000) & 0x3FFF;
        this.chipEngine.write(FurnaceChipType.SNES, voiceBase + 0x02, pitch & 0xFF);       // PITCH L
        this.chipEngine.write(FurnaceChipType.SNES, voiceBase + 0x03, (pitch >> 8) & 0x3F); // PITCH H

        // snes.cpp:329-333 - Write envelope (ADSR mode)
        this.chipEngine.write(FurnaceChipType.SNES, voiceBase + 0x05, 0xFF);     // ADSR1: fastest attack, slowest decay
        this.chipEngine.write(FurnaceChipType.SNES, voiceBase + 0x06, 0xE0);     // ADSR2: full sustain, slowest release

        // snes.cpp:338-342 - Write volume
        this.chipEngine.write(FurnaceChipType.SNES, voiceBase + 0x00, vol * 8);  // VOL L
        this.chipEngine.write(FurnaceChipType.SNES, voiceBase + 0x01, vol * 8);  // VOL R

        // snes.cpp:336 - Clear KOFF
        this.chipEngine.write(FurnaceChipType.SNES, 0x5C, 0);

        // snes.cpp:345 - KON last
        this.chipEngine.write(FurnaceChipType.SNES, 0x4C, chanMask);
        break;
      }

      // === FM CHIPS (additional) ===
      case FurnaceChipType.OPL3: { // 2
        const chanOff = chan % 9;
        const oplPart = chan < 9 ? 0x000 : 0x100;
        // Key-on: set bit 5
        const b0val = 0x20 | ((this._oplBlock & 7) << 2) | ((this._oplFnum >> 8) & 3);
        this.chipEngine.write(FurnaceChipType.OPL3, oplPart | (0xB0 + chanOff), b0val);
        break;
      }

      case FurnaceChipType.OPLL: { // 11
        const chanOff = chan % 9;
        // Key-on: set bit 4
        const freqH = 0x10 | ((this._oplBlock & 7) << 1) | ((this._oplFnum >> 8) & 1);
        this.chipEngine.write(FurnaceChipType.OPLL, 0x20 + chanOff, freqH);
        break;
      }

      case FurnaceChipType.OPNA: { // 13
        const opnaChanOff = chan % 3;
        const opnaPart = chan < 3 ? 0 : 1;
        const opnaKeyOn = 0xF0 | (opnaPart << 2) | opnaChanOff;
        this.chipEngine.write(FurnaceChipType.OPNA, 0x28, opnaKeyOn);
        break;
      }

      case FurnaceChipType.OPNB: { // 14
        const opnbKonOffs = [1, 2, 5, 6];
        const opnbKonOff = opnbKonOffs[chan & 3];
        this.chipEngine.write(FurnaceChipType.OPNB, 0x28, 0xF0 | opnbKonOff);
        break;
      }

      case FurnaceChipType.OPN: { // 47 - YM2203 (3 FM channels only)
        const opnChanOff = chan % 3;
        const opnKeyOn = 0xF0 | opnChanOff; // No second bank on OPN
        this.chipEngine.write(FurnaceChipType.OPN, 0x28, opnKeyOn);
        break;
      }

      case FurnaceChipType.OPZ: { // 22 - TX81Z/YM2414
        // Reference: Furnace tx81z.cpp line 435
        // Key-on is via the L_R_FB_ALG register (0x20+chan) with bit 6 set
        // Value: (alg & 7) | (fb << 3) | 0x40 (key-on) | (R << 7)
        const alg = (this.config.algorithm ?? 0) & 7;
        const fb = (this.config.feedback ?? 0) & 7;
        const chVolR = 1; // Right channel enabled
        const keyOnVal = alg | (fb << 3) | 0x40 | (chVolR << 7);
        console.log(`[FurnaceSynth] OPZ KEY ON: chan=${chan}, reg=0x${(0x20 + (chan & 7)).toString(16)}, val=0x${keyOnVal.toString(16)}`);
        this.chipEngine.write(FurnaceChipType.OPZ, 0x20 + (chan & 7), keyOnVal);
        break;
      }

      case FurnaceChipType.Y8950:   // 23
      case FurnaceChipType.OPL4: {  // 26
        const chip = this.config.chipType;
        const chanOff = chan % 9;
        const b0val = 0x20 | ((this._oplBlock & 7) << 2) | ((this._oplFnum >> 8) & 3);
        this.chipEngine.write(chip, 0xB0 + chanOff, b0val);
        break;
      }

      // === PSG CHIPS (additional) ===
      case FurnaceChipType.AY: { // 12
        // Reference: Furnace ay.cpp:634-639, 748-752 - EXACT byte order from source
        // Register layout: 0-1=ch0 freq, 2-3=ch1 freq, 4-5=ch2 freq, 6=noise, 7=mixer, 8-10=volume
        // Frequency = chipClock / (16 * freq)
        const ayFreq = Math.floor(1789773 / (16 * this.activeNoteFreq)) & 0xFFF;
        // ay.cpp:637-638 - Frequency low, then high
        this.chipEngine.write(FurnaceChipType.AY, chan * 2, ayFreq & 0xFF);
        this.chipEngine.write(FurnaceChipType.AY, chan * 2 + 1, (ayFreq >> 8) & 0x0F);
        // ay.cpp:748-752 - Volume to register 8+chan
        this.chipEngine.write(FurnaceChipType.AY, 0x08 + chan, vol & 0x0F);
        // ay.cpp:453-457 - Mixer: enable tone for this channel (bit clear = enabled)
        const mixerVal = ~(1 << chan) & 0x3F; // Tone enabled, noise disabled
        this.chipEngine.write(FurnaceChipType.AY, 0x07, mixerVal);
        break;
      }

      case FurnaceChipType.SAA: { // 18
        // Reference: Furnace saa.cpp - SAA1099 sound chip
        // Register layout: 0x00-0x05=amplitude, 0x08-0x0D=freq, 0x10-0x12=octave, 0x14-0x15=enable
        // Frequency: SAA uses octave + frequency (0-255) system
        // chipClock is typically 7159090 (NTSC) or 8000000
        const SAA_CLOCK = 8000000;
        // SAA formula: freq = chipClock / (512 * (256 - freqReg)) / 2^(7-octave)
        // Inverted: freqReg = 256 - (chipClock / (512 * freq * 2^(7-octave)))
        let octave = 4; // Start from middle octave
        let freqReg = Math.floor(256 - (SAA_CLOCK / (512 * this.activeNoteFreq * Math.pow(2, 7 - octave))));
        // Adjust octave to fit freqReg in valid range
        while (freqReg < 0 && octave < 7) {
          octave++;
          freqReg = Math.floor(256 - (SAA_CLOCK / (512 * this.activeNoteFreq * Math.pow(2, 7 - octave))));
        }
        while (freqReg > 255 && octave > 0) {
          octave--;
          freqReg = Math.floor(256 - (SAA_CLOCK / (512 * this.activeNoteFreq * Math.pow(2, 7 - octave))));
        }
        freqReg = Math.max(0, Math.min(255, freqReg));
        // Write amplitude (left + right in same register)
        this.chipEngine.write(FurnaceChipType.SAA, 0x00 + chan, (vol << 4) | vol);
        // Write frequency
        this.chipEngine.write(FurnaceChipType.SAA, 0x08 + chan, freqReg);
        // Write octave (two channels per register: 0x10=ch0+ch1, 0x11=ch2+ch3, 0x12=ch4+ch5)
        const octaveReg = 0x10 + Math.floor(chan / 2);
        const octaveShift = (chan % 2) * 4;
        // Read-modify-write for octave (we'll just write full value for simplicity)
        this.chipEngine.write(FurnaceChipType.SAA, octaveReg, (octave << octaveShift) | (octave << ((1 - (chan % 2)) * 4)));
        // Enable tone for this channel
        this.chipEngine.write(FurnaceChipType.SAA, 0x14, 1 << chan);
        break;
      }

      case FurnaceChipType.T6W28: { // 43
        // Reference: Furnace t6w28.cpp - NGP stereo PSG (similar to SN76489)
        // t6w28.cpp:160-170 - Format: 0x80|(ch<<5)|(freq&15) then freq>>4
        // CHIP_DIVIDER = 16 (15 for noise channel)
        const T6W_CLOCK = 3072000;
        const t6Divider = chan === 3 ? 15 : 16;
        const t6Freq = Math.floor(T6W_CLOCK / (t6Divider * this.activeNoteFreq)) - 1;
        const t6FreqClamped = Math.max(0, Math.min(1023, t6Freq));
        const t6Atten = 15 - Math.min(15, vol);
        // Write to both left (port 0) and right (port 1) channels
        // Frequency latch + low 4 bits
        this.chipEngine.write(FurnaceChipType.T6W28, 0, 0x80 | ((chan & 3) << 5) | (t6FreqClamped & 0x0F));
        this.chipEngine.write(FurnaceChipType.T6W28, 0, (t6FreqClamped >> 4) & 0x3F);
        this.chipEngine.write(FurnaceChipType.T6W28, 1, 0x80 | ((chan & 3) << 5) | (t6FreqClamped & 0x0F));
        this.chipEngine.write(FurnaceChipType.T6W28, 1, (t6FreqClamped >> 4) & 0x3F);
        // Volume for both sides
        this.chipEngine.write(FurnaceChipType.T6W28, 0, 0x90 | ((chan & 3) << 5) | t6Atten);
        this.chipEngine.write(FurnaceChipType.T6W28, 1, 0x90 | ((chan & 3) << 5) | t6Atten);
        break;
      }

      // === NES EXPANSION CHIPS ===
      case FurnaceChipType.VRC6: { // 9
        // Reference: Furnace vrc6.cpp:239-243 - EXACT byte order from source
        // Pulse: 0x9000/0xA000 base, Saw: 0xB000 base
        // Register layout: +0 = vol/duty, +1 = freq low, +2 = enable + freq high
        if (chan < 2) { // Pulse channels
          const base = chan === 0 ? 0x9000 : 0xA000;
          const period = Math.floor(3579545 / (16 * this.activeNoteFreq)) - 1;
          // vrc6.cpp:316-318 - Volume/duty, then freq
          this.chipEngine.write(FurnaceChipType.VRC6, base, ((this.currentDuty & 7) << 4) | vol);
          this.chipEngine.write(FurnaceChipType.VRC6, base + 1, period & 0xFF);
          this.chipEngine.write(FurnaceChipType.VRC6, base + 2, 0x80 | ((period >> 8) & 0x0F)); // Enable + freq high
        } else { // Sawtooth
          const period = Math.floor(3579545 / (14 * this.activeNoteFreq)) - 1;
          this.chipEngine.write(FurnaceChipType.VRC6, 0xB000, vol & 0x3F);
          this.chipEngine.write(FurnaceChipType.VRC6, 0xB001, period & 0xFF);
          this.chipEngine.write(FurnaceChipType.VRC6, 0xB002, 0x80 | ((period >> 8) & 0x0F));
        }
        break;
      }

      case FurnaceChipType.N163: { // 8
        // Reference: Furnace n163.cpp:278-285 - EXACT byte order from source
        // N163 channel registers are at 0x78-(chan*8), but for single-channel we use 0x78
        // Register layout: +0=freqL, +2=freqM, +4=waveLen+freqH, +6=wavePos, +7=vol
        const n163Period = Math.floor(15 * 524288 * this.activeNoteFreq / 3579545);
        this.chipEngine.write(FurnaceChipType.N163, 0x78 + 0, n163Period & 0xFF);
        this.chipEngine.write(FurnaceChipType.N163, 0x78 + 2, (n163Period >> 8) & 0xFF);
        this.chipEngine.write(FurnaceChipType.N163, 0x78 + 4, (256 - 32) | ((n163Period >> 16) & 0x03)); // 32-sample wave
        this.chipEngine.write(FurnaceChipType.N163, 0x78 + 7, vol | 0xF0); // Volume + enable (bits 4-7)
        break;
      }

      case FurnaceChipType.FDS: { // 16
        // Reference: Furnace fds.cpp:192-203, 275 - EXACT byte order from source
        // Register layout: 0x4080=volume, 0x4082=freq low, 0x4083=freq high
        // FDS frequency = (freq * 65536) / chipClock where chipClock is ~1789773
        const fdsFreq = Math.floor((this.activeNoteFreq * 65536) / 1789773) & 0xFFF;
        // fds.cpp:275 - Volume (bit 7 = direct mode, bits 0-5 = volume)
        this.chipEngine.write(FurnaceChipType.FDS, 0x4080, 0x80 | (vol * 2)); // 0-32 range
        // fds.cpp:202-203 - Frequency low, then high
        this.chipEngine.write(FurnaceChipType.FDS, 0x4082, fdsFreq & 0xFF);
        this.chipEngine.write(FurnaceChipType.FDS, 0x4083, (fdsFreq >> 8) & 0x0F);
        break;
      }

      case FurnaceChipType.MMC5: { // 17
        // Reference: Similar to NES pulse channels
        const mmc5Base = chan === 0 ? 0x5000 : 0x5004;
        const mmc5Period = FurnacePitchUtils.freqToNES(this.activeNoteFreq);
        this.chipEngine.write(FurnaceChipType.MMC5, mmc5Base, ((this.currentDuty & 3) << 6) | 0x30 | vol);
        this.chipEngine.write(FurnaceChipType.MMC5, mmc5Base + 2, mmc5Period & 0xFF);
        this.chipEngine.write(FurnaceChipType.MMC5, mmc5Base + 3, (0x01 << 3) | ((mmc5Period >> 8) & 0x07));
        break;
      }

      // === WAVETABLE CHIPS ===
      case FurnaceChipType.SCC: { // 7
        // Reference: Furnace scc.cpp:152-179 - EXACT byte order from source
        // SCC register base: 0x80 for freq, 0x8A for volume, 0x8F for output enable
        // Frequency = chipClock / (16 * freq) where chipClock is ~3579545
        const sccFreq = Math.floor(3579545 / (16 * this.activeNoteFreq)) - 1;
        const regBase = 0x80;
        // scc.cpp:153-156 - Frequency low, then high
        this.chipEngine.write(FurnaceChipType.SCC, regBase + chan * 2, sccFreq & 0xFF);
        this.chipEngine.write(FurnaceChipType.SCC, regBase + chan * 2 + 1, (sccFreq >> 8) & 0x0F);
        // scc.cpp:118 - Volume to regBase+10+chan (0x8A+chan)
        this.chipEngine.write(FurnaceChipType.SCC, regBase + 10 + chan, vol & 0x0F);
        // scc.cpp:179 - Enable channel in output register (regBase+15 = 0x8F)
        this.chipEngine.write(FurnaceChipType.SCC, regBase + 15, 1 << chan);
        break;
      }

      case FurnaceChipType.SWAN: { // 19
        // Reference: Furnace swan.cpp - WonderSwan sound chip
        // swan.cpp:32-55 - Register layout: 0x00-0x01=CH1 Pitch (16-bit), 0x02-0x03=CH2, etc.
        // Volume: 0x08-0x0B for channels 0-3, 0x10=Channel Ctrl, 0x11=Output Ctrl
        // CHIP_DIVIDER = 32, chipClock typically 3072000
        const SWAN_CLOCK = 3072000;
        // Frequency = chipClock / (32 * freq)
        const swanFreq = Math.floor(SWAN_CLOCK / (32 * this.activeNoteFreq)) & 0x7FF; // 11-bit
        // Write pitch (2 bytes per channel)
        this.chipEngine.write(FurnaceChipType.SWAN, chan * 2, swanFreq & 0xFF);
        this.chipEngine.write(FurnaceChipType.SWAN, chan * 2 + 1, (swanFreq >> 8) & 0x07);
        // Write volume (4 bits per side, combined)
        this.chipEngine.write(FurnaceChipType.SWAN, 0x08 + chan, (vol << 4) | vol);
        // Enable channel in control register
        this.chipEngine.write(FurnaceChipType.SWAN, 0x10, 1 << chan);
        // Output control (enable output)
        this.chipEngine.write(FurnaceChipType.SWAN, 0x11, 0x0F); // All channels to speaker
        break;
      }

      case FurnaceChipType.VERA: { // 36
        // Reference: Furnace vera.cpp - Commander X16 VERA PSG
        // vera.cpp:162 - calcBaseFreq(chipClock, 2097152, note)
        // Register layout per channel: +0=FreqL, +1=FreqH, +2=Vol+LR, +3=Wave
        // VERA frequency = (freq * 2097152) / chipClock
        const VERA_CLOCK = 25000000;
        const veraFreq = Math.floor((this.activeNoteFreq * 2097152) / VERA_CLOCK) & 0xFFFF;
        const veraBase = chan * 4;
        // Write frequency (16-bit)
        this.chipEngine.write(FurnaceChipType.VERA, veraBase + 0, veraFreq & 0xFF);
        this.chipEngine.write(FurnaceChipType.VERA, veraBase + 1, (veraFreq >> 8) & 0xFF);
        // Write volume (6 bits) + L/R enable (2 bits)
        this.chipEngine.write(FurnaceChipType.VERA, veraBase + 2, ((vol & 0x3F) << 2) | 0x03);
        // Write waveform (pulse at 50% duty)
        this.chipEngine.write(FurnaceChipType.VERA, veraBase + 3, 0x3F); // Pulse, 50% duty
        break;
      }

      case FurnaceChipType.SM8521: { // 37
        // Reference: Furnace sm8521.cpp - Sharp SM8521 (Game Boy-like wavetable)
        // sm8521.cpp:173-178 - Frequency registers, CHIP_DIVIDER = 32
        // Register layout: 0x40=SGC (control), 0x42=SG0L (vol), 0x46/0x47=SG0T (freq), etc.
        const SM8521_CLOCK = 756000; // Game.com clock
        // Frequency = chipClock / (32 * (4096 - freqReg))
        // freqReg = 4096 - (chipClock / (32 * freq))
        const sm8Freq = Math.floor(4096 - (SM8521_CLOCK / (32 * this.activeNoteFreq)));
        const sm8FreqClamped = Math.max(0, Math.min(4095, sm8Freq));
        const sm8FreqRegs = [[0x47, 0x46], [0x49, 0x48], [0x4D, 0x4C]]; // [H, L] pairs
        const sm8VolRegs = [0x42, 0x44, 0x4A];
        // Write volume
        this.chipEngine.write(FurnaceChipType.SM8521, sm8VolRegs[chan] || 0x42, (vol & 0x1F));
        // Write frequency (high byte first per Furnace)
        if (sm8FreqRegs[chan]) {
          this.chipEngine.write(FurnaceChipType.SM8521, sm8FreqRegs[chan][0], (sm8FreqClamped >> 8) & 0x0F);
          this.chipEngine.write(FurnaceChipType.SM8521, sm8FreqRegs[chan][1], sm8FreqClamped & 0xFF);
        }
        // Enable channel in SGC (0x40), bit 7 = sound on, bits 0-2 = channel enable
        this.chipEngine.write(FurnaceChipType.SM8521, 0x40, 0x80 | (1 << chan));
        break;
      }

      case FurnaceChipType.BUBBLE: { // 38
        // Reference: Furnace bubsyswsg.cpp - Konami Bubble System WSG (K005289)
        // bubsyswsg.cpp:135-139 - Frequency: 0x1000 - calcFreq(...)
        // CHIP_DIVIDER = 32, register layout: 0x0/0x1=freq ch0/ch1, 0x2/0x3=wave+vol
        const BUBBLE_CLOCK = 3579545;
        // Frequency = 0x1000 - (chipClock / (32 * freq))
        const bubbleFreq = Math.floor(0x1000 - (BUBBLE_CLOCK / (32 * this.activeNoteFreq)));
        const bubbleFreqClamped = Math.max(0, Math.min(4095, bubbleFreq));
        // Write frequency
        this.chipEngine.write(FurnaceChipType.BUBBLE, chan & 1, bubbleFreqClamped & 0xFF);
        // Write wave select (high nibble) + volume (low nibble)
        // Wave select uses wavetable index 0 (loaded separately via uploadWavetable)
        this.chipEngine.write(FurnaceChipType.BUBBLE, 0x02 + (chan & 1), (0 << 5) | (vol & 0x0F));
        break;
      }

      case FurnaceChipType.X1_010: { // 41
        // Reference: Furnace x1_010.cpp - Seta X1-010
        // x1_010.cpp:29-36 - Channel registers at (ch*8)
        // CHIP_FREQBASE = 4194304
        // Register layout: +0=Control, +1=Vol/WaveSel, +2=FreqL, +3=FreqH, +4=Start/EnvFreq, +5=End/EnvSel
        const X1_FREQBASE = 4194304;
        // X1-010 frequency is direct (not inverted)
        const x1Freq = Math.floor((this.activeNoteFreq * X1_FREQBASE) / 1000000) & 0xFFFF;
        const x1Base = chan << 3;
        // Write frequency
        this.chipEngine.write(FurnaceChipType.X1_010, x1Base + 2, x1Freq & 0xFF);
        this.chipEngine.write(FurnaceChipType.X1_010, x1Base + 3, (x1Freq >> 8) & 0xFF);
        // Write volume/wave select (wave index 0, loaded separately)
        this.chipEngine.write(FurnaceChipType.X1_010, x1Base + 1, (vol << 4) | 0);
        // Enable channel (control: bit 0 = enable, bit 1 = wavetable mode)
        this.chipEngine.write(FurnaceChipType.X1_010, x1Base, 0x03);
        break;
      }

      case FurnaceChipType.VB: { // 44
        // Reference: Furnace vb.cpp - Virtual Boy VSU
        // vb.cpp:28-29 - Register layout: 0x400+(ch*0x40): +0=INT, +1=LRV, +2=FQL, +3=FQH, +4=EV0, +5=EV1
        // CHIP_DIVIDER = 16, frequency stored as 2047-freq (inverted)
        const VB_CLOCK = 5000000;
        // Frequency = chipClock / (16 * (2048 - freqReg))
        // freqReg = 2048 - (chipClock / (16 * freq))
        const vbFreq = Math.floor(2048 - (VB_CLOCK / (16 * this.activeNoteFreq)));
        const vbFreqClamped = Math.max(0, Math.min(2047, vbFreq));
        const vbBase = 0x400 + (chan * 0x40);
        // Write frequency (stored inverted)
        this.chipEngine.write(FurnaceChipType.VB, vbBase + 0x08, (2047 - vbFreqClamped) & 0xFF); // FQL
        this.chipEngine.write(FurnaceChipType.VB, vbBase + 0x0C, ((2047 - vbFreqClamped) >> 8) & 0x07); // FQH
        // Write pan (LRV)
        this.chipEngine.write(FurnaceChipType.VB, vbBase + 0x04, 0xFF); // Full L+R
        // Write envelope (EV0 = volume, EV1 = envelope settings)
        this.chipEngine.write(FurnaceChipType.VB, vbBase + 0x10, (vol & 0x0F) << 4); // EV0
        this.chipEngine.write(FurnaceChipType.VB, vbBase + 0x14, 0x00); // EV1 (no envelope)
        // Write interval (INT) to start sound - bit 7 = enable
        this.chipEngine.write(FurnaceChipType.VB, vbBase + 0x00, 0x80);
        break;
      }

      case FurnaceChipType.LYNX: { // 25
        // Reference: Furnace lynx.cpp - Atari Lynx Mikey
        // lynx.cpp:27-34 - Register layout: 0x20+(ch*8): +0=Vol, +1=Feedback, +2=Output, +3=LFSR, +4=Backup, +5=Control
        // CHIP_FREQBASE = 16000000
        const LYNX_CLOCK = 16000000;
        // Lynx uses a backup register for counter reload
        // Frequency = chipClock / (freq * 256), so backup = chipClock / (256 * freq) - 1
        const lynxBackup = Math.floor(LYNX_CLOCK / (256 * this.activeNoteFreq)) - 1;
        const lynxBackupClamped = Math.max(0, Math.min(255, lynxBackup));
        const lynxBase = 0x20 + (chan * 8);
        // Write volume
        this.chipEngine.write(FurnaceChipType.LYNX, lynxBase + 0, (vol << 4) | vol);
        // Write feedback (for waveform generation)
        this.chipEngine.write(FurnaceChipType.LYNX, lynxBase + 1, 0x01); // Simple feedback for tone
        // Write backup (counter reload value = frequency)
        this.chipEngine.write(FurnaceChipType.LYNX, lynxBase + 4, lynxBackupClamped);
        // Write control (bit 7 = enable, bits 0-2 = clock select)
        this.chipEngine.write(FurnaceChipType.LYNX, lynxBase + 5, 0x80 | 0x00); // Enable, clock /1
        // Enable channel in stereo register (0x50)
        this.chipEngine.write(FurnaceChipType.LYNX, 0x50, 0xFF); // All channels to both speakers
        break;
      }

      // === SID ===
      case FurnaceChipType.SID: { // 10 - SID3
        const SID3_REGS_PER_CHAN = 64;
        const sidBase = chan * SID3_REGS_PER_CHAN;
        this.chipEngine.write(FurnaceChipType.SID, sidBase + 0, 0x01); // Gate on
        break;
      }

      case FurnaceChipType.SID_6581:
      case FurnaceChipType.SID_8580: {
        // Reference: Furnace c64.cpp:356-367 - EXACT byte order from source
        // Voice registers: i*7+0=FreqL, i*7+1=FreqH, i*7+2=PWL, i*7+3=PWH, i*7+4=Control, i*7+5=AtkDcy, i*7+6=StnRis
        const sidVoiceBase = chan * 7;
        const sidChip = this.config.chipType === 45 ? FurnaceChipType.SID_6581 : FurnaceChipType.SID_8580;

        // c64.cpp:357-359 - Attack/Decay, Sustain/Release, THEN Control with gate
        const attack = 0;  // Fast attack (0-15, 0=fastest)
        const decay = 8;   // Medium decay
        const sustain = 15; // Full sustain
        const release = 8;  // Medium release
        const waveform = 1; // Pulse wave (bit 6 of control)

        this.chipEngine.write(sidChip, sidVoiceBase + 5, (attack << 4) | decay);      // Attack/Decay
        this.chipEngine.write(sidChip, sidVoiceBase + 6, (sustain << 4) | release);   // Sustain/Release
        this.chipEngine.write(sidChip, sidVoiceBase + 4, (waveform << 4) | 0x01);     // Pulse + gate
        // Note: Frequency should be set by updateFrequency before keyOn
        break;
      }

      // === OTHER CHIPS ===
      case FurnaceChipType.TIA: { // 15
        // Reference: Furnace tia.cpp - Atari 2600 TIA sound
        // tia.cpp:140-164 - Register layout: 0x15=AUDC0, 0x16=AUDC1, 0x17=AUDF0, 0x18=AUDF1, 0x19=AUDV0, 0x1A=AUDV1
        // TIA has very limited pitch resolution (5-bit frequency)
        // Frequency = chipClock / (32 * (freqReg + 1)), chipClock = 31440
        const TIA_CLOCK = 31440;
        // freqReg = chipClock / (32 * freq) - 1
        const tiaFreq = Math.floor(TIA_CLOCK / (32 * this.activeNoteFreq)) - 1;
        const tiaFreqClamped = Math.max(0, Math.min(31, tiaFreq));
        // Channel 0: AUDC0=0x15, AUDF0=0x17, AUDV0=0x19
        // Channel 1: AUDC1=0x16, AUDF1=0x18, AUDV1=0x1A
        const tiaBase = chan === 0 ? 0x15 : 0x16;
        // Write audio control (waveform select) - 0x04 = pure tone
        this.chipEngine.write(FurnaceChipType.TIA, tiaBase, 0x04);
        // Write frequency
        this.chipEngine.write(FurnaceChipType.TIA, tiaBase + 2, tiaFreqClamped & 0x1F);
        // Write volume
        this.chipEngine.write(FurnaceChipType.TIA, tiaBase + 4, vol & 0x0F);
        break;
      }

      case FurnaceChipType.VIC: { // 33
        // Reference: Furnace vic20.cpp - VIC-20 sound chip
        // vic20.cpp:30-36 - Registers: 0x0A-0x0C = pitch ch0-2, 0x0D = noise pitch, 0x0E = volume
        // CHIP_DIVIDER = 32, frequency written as 255 - freq (inverted)
        // Frequency = chipClock / (32 * (256 - freqReg))
        const VIC_CLOCK = 1022727; // PAL: 1108405
        // freqReg = 256 - (chipClock / (32 * freq))
        let vicFreq = Math.floor(256 - (VIC_CLOCK / (32 * this.activeNoteFreq)));
        // Channels have different bit widths (ch0 = 7-bit >> 2, ch1 = 7-bit >> 1, ch2 = 7-bit)
        if (chan < 3) {
          vicFreq = vicFreq >> (2 - chan);
        } else {
          vicFreq = vicFreq >> 1; // Noise
        }
        const vicFreqClamped = Math.max(0, Math.min(127, vicFreq));
        // Write frequency to channel register
        this.chipEngine.write(FurnaceChipType.VIC, 0x0A + chan, 255 - vicFreqClamped);
        // Write volume
        this.chipEngine.write(FurnaceChipType.VIC, 0x0E, vol & 0x0F);
        break;
      }

      case FurnaceChipType.TED: { // 34
        // Reference: Furnace ted.cpp - Commodore Plus/4 TED sound
        // ted.cpp:100-112 - Registers: 0x0E=Freq0L, 0x0F=Freq1L, 0x10=Freq1H, 0x11=Control, 0x12=Freq0H
        // CHIP_DIVIDER = 8, frequency written as 1022 - freq (inverted)
        const TED_CLOCK = 1773447;
        // Frequency = chipClock / (8 * (1024 - freqReg))
        // freqReg = 1024 - (chipClock / (8 * freq))
        const tedFreq = Math.floor(1024 - (TED_CLOCK / (8 * this.activeNoteFreq)));
        const tedFreqClamped = Math.max(0, Math.min(1023, tedFreq));
        // Channel 0: 0x0E (low), 0x12 (high)
        // Channel 1: 0x0F (low), 0x10 (high)
        if (chan === 0) {
          this.chipEngine.write(FurnaceChipType.TED, 0x0E, (1022 - tedFreqClamped) & 0xFF);
          this.chipEngine.write(FurnaceChipType.TED, 0x12, ((1022 - tedFreqClamped) >> 8) & 0x03);
        } else {
          this.chipEngine.write(FurnaceChipType.TED, 0x0F, (1022 - tedFreqClamped) & 0xFF);
          this.chipEngine.write(FurnaceChipType.TED, 0x10, ((1022 - tedFreqClamped) >> 8) & 0x03);
        }
        // Control: bits 0-3 = volume, bit 4 = ch0 enable, bit 5 = ch1 enable, bit 6 = ch1 noise
        const tedCtrl = (vol & 0x0F) | (chan === 0 ? 0x10 : 0x20);
        this.chipEngine.write(FurnaceChipType.TED, 0x11, tedCtrl);
        break;
      }

      case FurnaceChipType.SUPERVISION: { // 35
        // Reference: Furnace supervision.cpp - Watara Supervision sound
        // supervision.cpp:141-150 - Registers: ch0=0x10-0x13, ch1=0x14-0x17, noise=0x28-0x2A
        // CHIP_DIVIDER = 32, chipClock << 1 for frequency
        const SV_CLOCK = 4000000;
        if (chan < 2) {
          // Pulse channels
          // Frequency = (chipClock * 2) / (32 * freq)
          const svFreq = Math.floor((SV_CLOCK * 2) / (32 * this.activeNoteFreq));
          const svFreqClamped = Math.max(1, Math.min(2047, svFreq));
          const svBase = 0x10 + (chan * 4);
          // Write frequency
          this.chipEngine.write(FurnaceChipType.SUPERVISION, svBase, svFreqClamped & 0xFF);
          this.chipEngine.write(FurnaceChipType.SUPERVISION, svBase + 1, (svFreqClamped >> 8) & 0x07);
          // Write control (duty + pan + enable)
          const svCtrl = ((this.currentDuty & 3) << 4) | 0x02 | 0x10 | 0x0C; // Duty, enable, pan L+R
          this.chipEngine.write(FurnaceChipType.SUPERVISION, svBase + 2, svCtrl);
          // Write length (not used for continuous tone)
          this.chipEngine.write(FurnaceChipType.SUPERVISION, svBase + 3, 0xFF);
        } else if (chan === 3) {
          // Noise channel
          // supervision.cpp:163 - Noise frequency is note-based, not Hz
          const svNoiseFreq = Math.floor(Math.log2(this.activeNoteFreq / 440) * 12 + 69);
          const svNoiseReg = (15 - (svNoiseFreq & 15)) << 4 | (vol & 0x0F);
          this.chipEngine.write(FurnaceChipType.SUPERVISION, 0x28, svNoiseReg);
          this.chipEngine.write(FurnaceChipType.SUPERVISION, 0x29, 0xC8); // Length
          this.chipEngine.write(FurnaceChipType.SUPERVISION, 0x2A, 0x12 | 0x0C); // Enable + pan
        }
        break;
      }

      case FurnaceChipType.UPD1771: { // 42
        // Reference: Furnace - µPD1771 is complex, primarily used for speech synthesis
        // Basic tone mode packet
        this.chipEngine.write(FurnaceChipType.UPD1771, 0, 0x02); // Mode 2 = tone
        break;
      }

      // === SAMPLE PLAYBACK CHIPS ===
      case FurnaceChipType.OKI: { // 20
        this.chipEngine.write(FurnaceChipType.OKI, chan, 0x80 | (vol << 3)); // Start + vol
        break;
      }

      case FurnaceChipType.SEGAPCM: { // 27
        const segaBase = chan * 8;
        this.chipEngine.write(FurnaceChipType.SEGAPCM, segaBase + 0x86, 0xFF); // Enable
        this.chipEngine.write(FurnaceChipType.SEGAPCM, segaBase + 0x02, vol << 3); // Volume L
        this.chipEngine.write(FurnaceChipType.SEGAPCM, segaBase + 0x03, vol << 3); // Volume R
        break;
      }

      case FurnaceChipType.YMZ280B: { // 28
        const ymzBase = chan * 4;
        this.chipEngine.write(FurnaceChipType.YMZ280B, 0x01 + ymzBase, 0xC0 | (vol << 1)); // Key-on + vol
        break;
      }

      case FurnaceChipType.RF5C68: { // 29
        this.chipEngine.write(FurnaceChipType.RF5C68, 0x07, chan); // Select channel
        this.chipEngine.write(FurnaceChipType.RF5C68, 0x08, ~(1 << chan) & 0xFF); // Enable this channel
        break;
      }

      case FurnaceChipType.GA20: { // 30
        this.chipEngine.write(FurnaceChipType.GA20, 0x00 + (chan * 8) + 5, 0x00); // Start
        break;
      }

      case FurnaceChipType.C140: { // 31
        const c140Base = chan * 0x10;
        this.chipEngine.write(FurnaceChipType.C140, c140Base + 0x05, 0x60); // L+R enable
        break;
      }

      case FurnaceChipType.QSOUND: { // 32
        // QSound key on is implicit when setting echo/volume
        this.chipEngine.write(FurnaceChipType.QSOUND, chan * 8 + 6, vol << 4);
        break;
      }

      case FurnaceChipType.K007232: { // 39
        this.chipEngine.write(FurnaceChipType.K007232, chan * 6 + 0, 0x80); // Start
        break;
      }

      case FurnaceChipType.K053260: { // 40
        this.chipEngine.write(FurnaceChipType.K053260, 0x28, 1 << chan); // Key on
        break;
      }

      case FurnaceChipType.ES5506: { // 21
        // ES5506 uses sample start, handled elsewhere
        break;
      }

      // === NEW CHIPS - FM ===
      case FurnaceChipType.OPN: { // 47 - YM2203
        // Reference: Furnace ym2203.cpp - 3 FM channels + 3 SSG channels
        // FM key-on same as OPN2 but only 3 channels
        const opnChanOff = chan % 3;
        this.chipEngine.write(FurnaceChipType.OPN, 0x28, 0xF0 | opnChanOff);
        break;
      }

      case FurnaceChipType.OPNB_B: { // 48 - YM2610B
        // Extended YM2610, same key-on format as OPNB
        const opnbBKonOffs = [1, 2, 5, 6, 0, 4]; // 6 FM channels
        const opnbBChan = chan % 6;
        const opnbBKonOff = opnbBKonOffs[opnbBChan];
        this.chipEngine.write(FurnaceChipType.OPNB_B, 0x28, 0xF0 | opnbBKonOff);
        break;
      }

      case FurnaceChipType.ESFM: { // 49 - Enhanced OPL3
        // ESFM has OPL3-compatible key-on
        const esfmChanOff = chan % 18;
        const esfmPart = esfmChanOff < 9 ? 0x000 : 0x100;
        const b0val = 0x20 | ((this._oplBlock & 7) << 2) | ((this._oplFnum >> 8) & 3);
        this.chipEngine.write(FurnaceChipType.ESFM, esfmPart | (0xB0 + (esfmChanOff % 9)), b0val);
        break;
      }

      // === NEW CHIPS - PSG ===
      case FurnaceChipType.AY8930: { // 50 - Enhanced AY
        // Reference: Furnace ay8930.cpp - Same as AY but 16-bit frequency and duty cycle
        const AY8930_CLOCK = 1789773;
        const ay8930Freq = Math.floor(AY8930_CLOCK / (8 * this.activeNoteFreq)) & 0xFFFF;
        // Write frequency (16-bit)
        this.chipEngine.write(FurnaceChipType.AY8930, chan * 2, ay8930Freq & 0xFF);
        this.chipEngine.write(FurnaceChipType.AY8930, chan * 2 + 1, (ay8930Freq >> 8) & 0xFF);
        // Write volume (5-bit)
        this.chipEngine.write(FurnaceChipType.AY8930, 0x08 + chan, vol & 0x1F);
        // Mixer: enable tone
        this.chipEngine.write(FurnaceChipType.AY8930, 0x07, ~(1 << chan) & 0x3F);
        // Duty cycle (50%)
        this.chipEngine.write(FurnaceChipType.AY8930, 0x16 + chan, 0x08);
        break;
      }

      // === NEW CHIPS - NINTENDO ===
      case FurnaceChipType.NDS: { // 51 - Nintendo DS
        // Reference: Furnace nds.cpp - 16-channel sample playback
        // Register layout: ch*0x10: +0=Control, +4=Start, +8=Freq, +A=LoopStart, +C=Length
        const ndsBase = chan * 0x10;
        // Frequency = (freq * 0x10000) / 32768
        const ndsFreq = Math.floor((this.activeNoteFreq * 0x10000) / 32768) & 0xFFFF;
        // Write frequency
        this.chipEngine.write(FurnaceChipType.NDS, ndsBase + 0x08, ndsFreq & 0xFF);
        this.chipEngine.write(FurnaceChipType.NDS, ndsBase + 0x09, (ndsFreq >> 8) & 0xFF);
        // Write control (start + volume + format)
        this.chipEngine.write(FurnaceChipType.NDS, ndsBase + 0x03, 0x80 | (vol << 1)); // Start + vol
        break;
      }

      case FurnaceChipType.GBA_DMA: { // 52 - GBA DMA Sound
        // GBA DMA is sample-based, no frequency control
        // Just enable output
        this.chipEngine.write(FurnaceChipType.GBA_DMA, 0x82, 0x0B); // Enable FIFO A
        break;
      }

      case FurnaceChipType.GBA_MINMOD: { // 53 - GBA MinMod
        // Similar to GBA DMA
        this.chipEngine.write(FurnaceChipType.GBA_MINMOD, 0x00, 0x80 | vol);
        break;
      }

      case FurnaceChipType.POKEMINI: { // 54 - Pokemon Mini
        // Reference: Furnace pokemini.cpp - Single channel with timer
        // Timer3 controls frequency: freq = chipClock / (preset * scale)
        const PM_CLOCK = 4000000;
        const pmPreset = Math.floor(PM_CLOCK / (16 * this.activeNoteFreq));
        const pmPresetClamped = Math.max(1, Math.min(65535, pmPreset));
        // Write preset (period)
        this.chipEngine.write(FurnaceChipType.POKEMINI, 0x4A, pmPresetClamped & 0xFF);
        this.chipEngine.write(FurnaceChipType.POKEMINI, 0x4B, (pmPresetClamped >> 8) & 0xFF);
        // Write pivot (duty cycle 50%)
        this.chipEngine.write(FurnaceChipType.POKEMINI, 0x4C, (pmPresetClamped >> 1) & 0xFF);
        this.chipEngine.write(FurnaceChipType.POKEMINI, 0x4D, ((pmPresetClamped >> 1) >> 8) & 0xFF);
        // Enable timer
        this.chipEngine.write(FurnaceChipType.POKEMINI, 0x48, 0x04);
        // Set volume
        this.chipEngine.write(FurnaceChipType.POKEMINI, 0x71, vol > 8 ? 3 : (vol > 4 ? 2 : 1));
        break;
      }

      // === NEW CHIPS - WAVETABLE ===
      case FurnaceChipType.NAMCO: { // 55 - Namco WSG (Pac-Man, Galaga)
        // Reference: Furnace namcowsg.cpp - 3 or 8 channel wavetable
        // CHIP_FREQBASE = 4194304
        // Register layout varies by chip variant, using WSG variant
        const NAMCO_FREQBASE = 4194304;
        const namcoFreq = Math.floor((this.activeNoteFreq * NAMCO_FREQBASE) / 192000) & 0xFFFFF;
        // Channel 0 has 5 frequency bytes, others have 4
        if (chan === 0) {
          this.chipEngine.write(FurnaceChipType.NAMCO, 0x10, (namcoFreq >> 4) & 0x0F);
          this.chipEngine.write(FurnaceChipType.NAMCO, 0x11, namcoFreq & 0x0F);
          this.chipEngine.write(FurnaceChipType.NAMCO, 0x12, (namcoFreq >> 8) & 0x0F);
          this.chipEngine.write(FurnaceChipType.NAMCO, 0x13, (namcoFreq >> 12) & 0x0F);
          this.chipEngine.write(FurnaceChipType.NAMCO, 0x14, (namcoFreq >> 16) & 0x0F);
        } else {
          const namcoBase = 0x15 + (chan - 1) * 5;
          this.chipEngine.write(FurnaceChipType.NAMCO, namcoBase + 1, namcoFreq & 0x0F);
          this.chipEngine.write(FurnaceChipType.NAMCO, namcoBase + 2, (namcoFreq >> 8) & 0x0F);
          this.chipEngine.write(FurnaceChipType.NAMCO, namcoBase + 3, (namcoFreq >> 12) & 0x0F);
          this.chipEngine.write(FurnaceChipType.NAMCO, namcoBase + 4, (namcoFreq >> 16) & 0x0F);
        }
        // Volume
        this.chipEngine.write(FurnaceChipType.NAMCO, 0x15 + chan * 5, vol & 0x0F);
        // Wave select
        this.chipEngine.write(FurnaceChipType.NAMCO, 0x05 + chan * 5, 0);
        break;
      }

      // === NEW CHIPS - COMMODORE ===
      case FurnaceChipType.PET: { // 56 - Commodore PET 6522
        // Reference: Furnace pet.cpp - Single channel shift register
        // Uses Timer 2 for frequency
        const PET_CLOCK = 1000000;
        // Frequency = chipClock / (16 * (reload + 1))
        const petReload = Math.floor(PET_CLOCK / (16 * this.activeNoteFreq)) - 1;
        const petReloadClamped = Math.max(0, Math.min(65535, petReload));
        // Write T2 low
        this.chipEngine.write(FurnaceChipType.PET, 0x08, petReloadClamped & 0xFF);
        // Write T2 high (also enables)
        this.chipEngine.write(FurnaceChipType.PET, 0x09, (petReloadClamped >> 8) & 0xFF);
        // ACR: enable shift register output
        this.chipEngine.write(FurnaceChipType.PET, 0x0B, 0x10);
        break;
      }

      // === NEW CHIPS - ATARI ===
      case FurnaceChipType.POKEY: { // 57 - Atari POKEY
        // Reference: Furnace pokey.cpp - 4 channel PSG
        // CHIP_DIVIDER = 1, registers: AUDFn=freq, AUDCn=control/vol
        // Frequency = chipClock / (2 * (AUDF + 1))
        const POKEY_CLOCK = 1789773;
        const pokeyFreq = Math.floor(POKEY_CLOCK / (2 * this.activeNoteFreq)) - 1;
        const pokeyFreqClamped = Math.max(0, Math.min(255, pokeyFreq));
        // Write frequency
        this.chipEngine.write(FurnaceChipType.POKEY, chan * 2, pokeyFreqClamped);
        // Write control: volume + distortion (0xAn = pure tone)
        this.chipEngine.write(FurnaceChipType.POKEY, chan * 2 + 1, 0xA0 | (vol & 0x0F));
        // AUDCTL: use 64kHz clock for better resolution
        this.chipEngine.write(FurnaceChipType.POKEY, 0x08, 0x00);
        // SKCTL: enable audio
        this.chipEngine.write(FurnaceChipType.POKEY, 0x0F, 0x03);
        break;
      }

      // === NEW CHIPS - SAMPLE PLAYBACK ===
      case FurnaceChipType.MSM6258: { // 58 - OKI ADPCM
        // Start playback
        this.chipEngine.write(FurnaceChipType.MSM6258, 0x00, 0x02); // Play
        break;
      }

      case FurnaceChipType.MSM5232: { // 59 - 8-voice wavetable
        // Reference: Furnace msm5232.cpp
        // Each voice has tone control register
        this.chipEngine.write(FurnaceChipType.MSM5232, chan, 0x80 | vol);
        break;
      }

      case FurnaceChipType.MULTIPCM: { // 60 - Sega Model 1/2 PCM
        // Reference: Furnace multipcm.cpp - 28 channel PCM
        // Register layout: ch*8 + offset
        const mpcmBase = chan << 3;
        // Key on
        this.chipEngine.write(FurnaceChipType.MULTIPCM, mpcmBase + 4, 0x80); // Key on
        // Total level
        this.chipEngine.write(FurnaceChipType.MULTIPCM, mpcmBase + 5, (15 - vol) << 3);
        break;
      }

      case FurnaceChipType.AMIGA: { // 61 - Amiga Paula
        // Reference: Furnace amiga.cpp - 4 channel sample playback
        // Register layout: AUDnLCH/L=sample addr, AUDnLEN=length, AUDnPER=period, AUDnVOL=volume
        const AMIGA_CLOCK = 3546895; // PAL
        // Period = chipClock / (freq * 2)
        const amigaPeriod = Math.floor(AMIGA_CLOCK / (this.activeNoteFreq * 2));
        const amigaPeriodClamped = Math.max(124, Math.min(65535, amigaPeriod));
        const amigaBase = 0xA0 + (chan * 0x10);
        // Write period
        this.chipEngine.write(FurnaceChipType.AMIGA, amigaBase + 0x06, (amigaPeriodClamped >> 8) & 0xFF);
        this.chipEngine.write(FurnaceChipType.AMIGA, amigaBase + 0x07, amigaPeriodClamped & 0xFF);
        // Write volume (0-64)
        this.chipEngine.write(FurnaceChipType.AMIGA, amigaBase + 0x08, (vol * 4) & 0x7F);
        // Enable DMA for this channel
        this.chipEngine.write(FurnaceChipType.AMIGA, 0x96, 0x8000 | (1 << chan));
        break;
      }

      // === NEW CHIPS - OTHER ===
      case FurnaceChipType.PCSPKR: { // 62 - PC Speaker
        // Reference: Furnace pcspkr.cpp - 1-bit PWM
        // Period register controls frequency
        const PCSPKR_CLOCK = 1193182;
        const pcspkrPeriod = Math.floor(PCSPKR_CLOCK / this.activeNoteFreq);
        const pcspkrPeriodClamped = Math.max(1, Math.min(65535, pcspkrPeriod));
        // Write period
        this.chipEngine.write(FurnaceChipType.PCSPKR, 0x00, pcspkrPeriodClamped & 0xFF);
        this.chipEngine.write(FurnaceChipType.PCSPKR, 0x01, (pcspkrPeriodClamped >> 8) & 0xFF);
        break;
      }

      case FurnaceChipType.PONG: { // 63 - Pong discrete
        // Very simple - just on/off
        this.chipEngine.write(FurnaceChipType.PONG, 0x00, 0x01);
        break;
      }

      case FurnaceChipType.PV1000: { // 64 - Casio PV-1000
        // Reference: Furnace pv1000.cpp - 3 channel
        // CHIP_DIVIDER = 1024, frequency = 0x3F - calcFreq
        const PV1000_CLOCK = 3579545;
        const pv1000Freq = Math.floor(0x3F - (PV1000_CLOCK / (1024 * this.activeNoteFreq)));
        const pv1000FreqClamped = Math.max(0, Math.min(62, pv1000Freq));
        // Write frequency (also acts as enable)
        this.chipEngine.write(FurnaceChipType.PV1000, chan, pv1000FreqClamped);
        break;
      }

      case FurnaceChipType.DAVE: { // 65 - Enterprise DAVE
        // Reference: Furnace dave.cpp - 3 tone + 1 noise + 2 DAC
        // CHIP_DIVIDER = 8
        const DAVE_CLOCK = 8000000;
        // Frequency = chipClock / (8 * (4096 - freqReg))
        const daveFreq = Math.floor(4096 - (DAVE_CLOCK / (8 * this.activeNoteFreq)));
        const daveFreqClamped = Math.max(0, Math.min(4095, daveFreq));
        // Write frequency (12-bit, split across 2 regs)
        this.chipEngine.write(FurnaceChipType.DAVE, chan * 2, daveFreqClamped & 0xFF);
        this.chipEngine.write(FurnaceChipType.DAVE, chan * 2 + 1, ((daveFreqClamped >> 8) & 0x0F) | 0x00); // Control bits
        // Write volume L
        this.chipEngine.write(FurnaceChipType.DAVE, 0x08 + chan, (vol << 2) & 0x3F);
        // Write volume R
        this.chipEngine.write(FurnaceChipType.DAVE, 0x0C + chan, (vol << 2) & 0x3F);
        // Sound control: enable
        this.chipEngine.write(FurnaceChipType.DAVE, 0x07, 0x0F);
        break;
      }

      case FurnaceChipType.SU: { // 66 - Sound Unit
        // Reference: Furnace su.cpp - Custom chip
        const suBase = chan << 3;
        this.chipEngine.write(FurnaceChipType.SU, suBase + 0x04, 0x80 | vol); // Enable + vol
        break;
      }

      case FurnaceChipType.BIFURCATOR: { // 67 - Experimental
        // Simple tone generator
        this.chipEngine.write(FurnaceChipType.BIFURCATOR, chan, vol);
        break;
      }

      case FurnaceChipType.POWERNOISE: { // 68 - Power Noise
        // Modern chip with various modes
        const pnBase = chan << 2;
        this.chipEngine.write(FurnaceChipType.POWERNOISE, pnBase + 0x00, 0x80 | vol);
        break;
      }

      case FurnaceChipType.ZXBEEPER: { // 69 - ZX Spectrum beeper
        // 1-bit output, frequency via CPU timing
        const ZX_CLOCK = 3500000;
        const zxPeriod = Math.floor(ZX_CLOCK / (2 * this.activeNoteFreq));
        this.chipEngine.write(FurnaceChipType.ZXBEEPER, 0x00, zxPeriod & 0xFF);
        this.chipEngine.write(FurnaceChipType.ZXBEEPER, 0x01, (zxPeriod >> 8) & 0xFF);
        break;
      }

      case FurnaceChipType.ZXBEEPER_QT: { // 70 - ZX Spectrum quadtone
        // 4-channel beeper engine
        const ZXQT_CLOCK = 3500000;
        const zxqtPeriod = Math.floor(ZXQT_CLOCK / (8 * this.activeNoteFreq));
        this.chipEngine.write(FurnaceChipType.ZXBEEPER_QT, chan * 2, zxqtPeriod & 0xFF);
        this.chipEngine.write(FurnaceChipType.ZXBEEPER_QT, chan * 2 + 1, (zxqtPeriod >> 8) & 0xFF);
        break;
      }

      case FurnaceChipType.SCVTONE: { // 71 - Epoch SCV
        // Simple tone generator
        const SCV_CLOCK = 3579545;
        const scvFreq = Math.floor(SCV_CLOCK / (32 * this.activeNoteFreq));
        this.chipEngine.write(FurnaceChipType.SCVTONE, chan * 2, scvFreq & 0xFF);
        this.chipEngine.write(FurnaceChipType.SCVTONE, chan * 2 + 1, ((scvFreq >> 8) & 0x0F) | (vol << 4));
        break;
      }

      case FurnaceChipType.PCMDAC: { // 72 - Generic PCM DAC
        // Sample playback, just enable
        this.chipEngine.write(FurnaceChipType.PCMDAC, 0x00, 0x80 | vol);
        break;
      }
    }
  }

  public triggerRelease(_time?: number): this {
    this.isNoteOn = false;

    // If WASM engine isn't available, nothing to release
    if (!this.useWasmEngine) {
      return this;
    }

    // Enforce minimum gate time to ensure audio has time to render
    const now = Tone.now();
    const timeSinceNoteOn = now - this.noteOnTime;
    console.log(`[FurnaceSynth] Gate check: now=${now.toFixed(3)}, noteOnTime=${this.noteOnTime.toFixed(3)}, elapsed=${(timeSinceNoteOn * 1000).toFixed(0)}ms, min=${FurnaceSynth.MIN_GATE_TIME * 1000}ms`);
    if (timeSinceNoteOn < FurnaceSynth.MIN_GATE_TIME) {
      const delayMs = (FurnaceSynth.MIN_GATE_TIME - timeSinceNoteOn) * 1000;
      console.log(`[FurnaceSynth] Delaying keyOff by ${delayMs.toFixed(0)}ms for minimum gate time`);
      setTimeout(() => this.writeKeyOff(), delayMs);
    } else {
      this.writeKeyOff();
    }
    return this;
  }

  /**
   * Write chip-specific key-off command
   */
  private writeKeyOff(): void {
    console.log(`[FurnaceSynth] writeKeyOff called, chipType=${this.config.chipType}, wasmNoteTriggered=${this.wasmNoteTriggered}`);
    // Only write key-off if we actually triggered a note via WASM
    if (!this.wasmNoteTriggered) {
      console.log(`[FurnaceSynth] writeKeyOff skipped - wasmNoteTriggered is false`);
      return;
    }
    this.wasmNoteTriggered = false;

    const chan = this.channelIndex;

    switch (this.config.chipType) {
      // === FM CHIPS ===
      case FurnaceChipType.OPN2: { // 0
        const chanOffset = chan % 3;
        const part = chan < 3 ? 0 : 1;
        const regBase = part === 0 ? 0x000 : 0x100;
        const keyOffVal = (part << 2) | chanOffset;
        console.log(`[FurnaceSynth] OPN2 KEY OFF: chan=${chan}, reg=0x28, val=0x${keyOffVal.toString(16)}`);

        // Send key-off
        this.chipEngine.write(FurnaceChipType.OPN2, 0x28, keyOffVal);

        // Mute all operators by setting TL to max (127 = silent)
        // OPN2 operator offsets: Op1→0x00, Op2→0x08, Op3→0x04, Op4→0x0C
        const opOffsets = [0x00, 0x08, 0x04, 0x0C];
        for (let opIdx = 0; opIdx < 4; opIdx++) {
          const opOff = opOffsets[opIdx] + chanOffset;
          this.chipEngine.write(FurnaceChipType.OPN2, regBase | (0x40 + opOff), 127);
        }

        // Deactivate chip to stop rendering entirely
        this.chipEngine.deactivate(FurnaceChipType.OPN2);
        break;
      }
      case FurnaceChipType.OPM: { // 1
        const keyOffVal = chan & 7;  // Channel only, no operator bits = key off
        console.log(`[FurnaceSynth] OPM KEY OFF: chan=${chan}, reg=0x08, val=0x${keyOffVal.toString(16)}`);

        // Send key-off
        this.chipEngine.write(FurnaceChipType.OPM, 0x08, keyOffVal);

        // Mute all operators by setting TL to max (127 = silent)
        const opOffsets = [0x00, 0x10, 0x08, 0x18];
        for (let opIdx = 0; opIdx < 4; opIdx++) {
          const opOff = opOffsets[opIdx] + (chan & 7);
          this.chipEngine.write(FurnaceChipType.OPM, 0x60 + opOff, 127);
        }

        // Deactivate chip to stop rendering entirely
        this.chipEngine.deactivate(FurnaceChipType.OPM);
        break;
      }
      case FurnaceChipType.OPL3: { // 2
        const chanOff = chan % 9;
        const oplPart = chan < 9 ? 0x000 : 0x100;
        // Key-off: clear bit 5, preserve block/fnum
        const b0val = ((this._oplBlock & 7) << 2) | ((this._oplFnum >> 8) & 3);
        this.chipEngine.write(FurnaceChipType.OPL3, oplPart | (0xB0 + chanOff), b0val);
        break;
      }
      case FurnaceChipType.OPLL: { // 11
        // Key-off: clear bit 4, preserve freqH
        const chanOff = chan % 9;
        const OPLL_CLOCK = 3579545;

        // Same calculation as updateFrequency/writeKeyOn
        let block = 0;
        let fnum = Math.round(this.activeNoteFreq * 72 * Math.pow(2, 19 - block) / OPLL_CLOCK);
        while (fnum > 511 && block < 7) {
          block++;
          fnum = Math.round(this.activeNoteFreq * 72 * Math.pow(2, 19 - block) / OPLL_CLOCK);
        }
        fnum = Math.min(511, Math.max(0, fnum));

        const freqH = ((block & 7) << 1) | ((fnum >> 8) & 1);
        // Key-off: just freqH, no key-on or sustain bits
        this.chipEngine.write(FurnaceChipType.OPLL, 0x20 + chanOff, freqH);
        break;
      }
      case FurnaceChipType.OPNA: { // 13 - YM2608 (6 FM channels)
        const chanOffset = chan % 3;
        const part = chan < 3 ? 0 : 1;
        const keyOffVal = (part << 2) | chanOffset;
        this.chipEngine.write(FurnaceChipType.OPNA, 0x28, keyOffVal);
        break;
      }
      case FurnaceChipType.OPNB: { // 14 - YM2610 (4 FM channels)
        // Reference: Furnace ym2610.cpp konOffs = {1, 2, 5, 6}
        const opnbKonOffs = [1, 2, 5, 6];
        const opnbKonOff = opnbKonOffs[chan & 3];
        this.chipEngine.write(FurnaceChipType.OPNB, 0x28, opnbKonOff);  // Key off (no 0xF0)
        break;
      }
      case FurnaceChipType.OPN: { // 47 - YM2203 (3 FM channels)
        const opnChanOff = chan % 3;
        this.chipEngine.write(FurnaceChipType.OPN, 0x28, opnChanOff);  // Key off (no 0xF0)
        break;
      }
      case FurnaceChipType.OPZ: { // 22 - TX81Z/YM2414
        // Reference: Furnace tx81z.cpp line 403
        // Key-off is via the L_R_FB_ALG register (0x20+chan) WITHOUT bit 6
        // Value: (alg & 7) | (fb << 3) | 0x00 (key-off) | (R << 7)
        const alg = (this.config.algorithm ?? 0) & 7;
        const fb = (this.config.feedback ?? 0) & 7;
        const chVolR = 1; // Right channel enabled
        const keyOffVal = alg | (fb << 3) | (chVolR << 7); // No 0x40 = key off
        console.log(`[FurnaceSynth] OPZ KEY OFF: chan=${chan}, reg=0x${(0x20 + (chan & 7)).toString(16)}, val=0x${keyOffVal.toString(16)}`);
        this.chipEngine.write(FurnaceChipType.OPZ, 0x20 + (chan & 7), keyOffVal);

        // Deactivate chip to stop rendering entirely
        this.chipEngine.deactivate(FurnaceChipType.OPZ);
        break;
      }
      case FurnaceChipType.Y8950: // 23
      case FurnaceChipType.OPL4: { // 26
        const chip = this.config.chipType;
        const chanOff = chan % 9;
        // Key-off: clear bit 5, preserve block/fnum
        const b0val = ((this._oplBlock & 7) << 2) | ((this._oplFnum >> 8) & 3);
        this.chipEngine.write(chip, 0xB0 + chanOff, b0val);
        break;
      }

      // === PSG CHIPS ===
      case FurnaceChipType.PSG: { // 3
        this.chipEngine.write(FurnaceChipType.PSG, 0, 0x9F | ((chan & 3) << 5));
        break;
      }
      case FurnaceChipType.AY: { // 12
        this.chipEngine.write(FurnaceChipType.AY, 0x08 + chan, 0);
        break;
      }
      case FurnaceChipType.SAA: { // 18
        // Clear volume
        this.chipEngine.write(FurnaceChipType.SAA, 0x00 + chan, 0);
        // Disable tone for this channel
        this.chipEngine.write(FurnaceChipType.SAA, 0x14, 0);
        break;
      }
      case FurnaceChipType.T6W28: { // 43
        // T6W28 is stereo: mute BOTH ports
        this.chipEngine.write(FurnaceChipType.T6W28, 0, 0x9F | ((chan & 3) << 5));  // Left
        this.chipEngine.write(FurnaceChipType.T6W28, 1, 0x9F | ((chan & 3) << 5));  // Right
        break;
      }

      // === GAME CONSOLE CHIPS ===
      case FurnaceChipType.NES: { // 4
        if (chan < 2) {
          const base = 0x4000 + (chan * 4);
          this.chipEngine.write(FurnaceChipType.NES, base, 0x30);
        } else if (chan === 2) {
          this.chipEngine.write(FurnaceChipType.NES, 0x4008, 0x00);
        } else if (chan === 3) {
          this.chipEngine.write(FurnaceChipType.NES, 0x400C, 0x30);
        }
        break;
      }
      case FurnaceChipType.GB: { // 5
        const gbBase = 0x10 + chan * 5;
        if (chan < 2) {
          this.chipEngine.write(FurnaceChipType.GB, gbBase + 2, 8);
        } else if (chan === 2) {
          this.chipEngine.write(FurnaceChipType.GB, 0x1C, 0);
        } else if (chan === 3) {
          this.chipEngine.write(FurnaceChipType.GB, 0x21, 8);
        }
        break;
      }
      case FurnaceChipType.PCE: { // 6
        this.chipEngine.write(FurnaceChipType.PCE, 0x00, chan & 7);
        this.chipEngine.write(FurnaceChipType.PCE, 0x05, 0x00);
        break;
      }
      case FurnaceChipType.SNES: { // 24
        this.chipEngine.write(FurnaceChipType.SNES, 0x5C, 1 << (chan & 7));
        break;
      }
      case FurnaceChipType.VB: { // 44
        // Reference: vb.cpp - chWrite(c, 0x04, 0) for keyOff
        const chanBase = 0x400 + (chan * 64);
        this.chipEngine.write(FurnaceChipType.VB, chanBase + 0x10, 0x00);  // EV0 = 0
        break;
      }
      case FurnaceChipType.LYNX: { // 25
        // Set volume to 0 to silence
        const chanBase = 0x20 + (chan * 8);
        this.chipEngine.write(FurnaceChipType.LYNX, chanBase + 0, 0x00);
        break;
      }

      // === NES EXPANSION CHIPS ===
      case FurnaceChipType.VRC6: { // 9
        if (chan < 2) {
          const base = chan === 0 ? 0x9000 : 0xA000;
          this.chipEngine.write(FurnaceChipType.VRC6, base, 0x00);
        } else {
          this.chipEngine.write(FurnaceChipType.VRC6, 0xB000, 0x00);
        }
        break;
      }
      case FurnaceChipType.N163: { // 8
        // Channel 0 at register base 0x78 (single-channel mode)
        this.chipEngine.write(FurnaceChipType.N163, 0x78 + 7, 0x00);
        break;
      }
      case FurnaceChipType.FDS: { // 16
        this.chipEngine.write(FurnaceChipType.FDS, 0x4080, 0x80);
        break;
      }
      case FurnaceChipType.MMC5: { // 17
        const base = chan === 0 ? 0x5000 : 0x5004;
        this.chipEngine.write(FurnaceChipType.MMC5, base, 0x30);
        break;
      }

      // === WAVETABLE CHIPS ===
      case FurnaceChipType.SCC: { // 7
        this.chipEngine.write(FurnaceChipType.SCC, 0xAA + chan, 0);
        break;
      }
      case FurnaceChipType.SWAN: { // 19
        this.chipEngine.write(FurnaceChipType.SWAN, 0x08 + chan, 0);
        break;
      }
      case FurnaceChipType.VERA: { // 36
        const chanBase = chan * 4;
        console.log(`[VERA keyOff] chan=${chan}, reg=${chanBase + 2}, val=0x00`);
        this.chipEngine.write(FurnaceChipType.VERA, chanBase + 2, 0x00); // Volume = 0
        break;
      }
      case FurnaceChipType.SM8521: { // 37
        // Set volume to 0: CH0=0x42, CH1=0x44, CH2=0x4A
        const volRegs = [0x42, 0x44, 0x4A];
        const volReg = volRegs[chan] || 0x42;
        this.chipEngine.write(FurnaceChipType.SM8521, volReg, 0);
        break;
      }
      case FurnaceChipType.BUBBLE: { // 38
        // Port 2/3 = volume for channel 0/1
        this.chipEngine.write(FurnaceChipType.BUBBLE, 0x02 + chan, 0);
        break;
      }
      case FurnaceChipType.X1_010: { // 41
        const chanBase = chan << 3; // 8 bytes per channel
        this.chipEngine.write(FurnaceChipType.X1_010, chanBase, 0x00); // Disable channel
        break;
      }

      // === SID3 ===
      case FurnaceChipType.SID: { // 10 - SID3
        // Clear gate flag (bit 0 of FLAGS register)
        const SID3_REGS_PER_CHAN = 64;
        const SID3_REG_FLAGS = 0;
        const chanBase = chan * SID3_REGS_PER_CHAN;
        this.chipEngine.write(FurnaceChipType.SID, chanBase + SID3_REG_FLAGS, 0x00);
        break;
      }

      // === Classic SID (6581/8580) ===
      case FurnaceChipType.SID_6581:
      case FurnaceChipType.SID_8580: {
        // Gate off - clear bit 0 of control register
        const voiceBase = chan * 7;
        const chipType = this.config.chipType === 45 ? FurnaceChipType.SID_6581 : FurnaceChipType.SID_8580;
        this.chipEngine.write(chipType, voiceBase + 4, 0x00);
        break;
      }

      // === OTHER CHIPS ===
      case FurnaceChipType.TIA: { // 15
        this.chipEngine.write(FurnaceChipType.TIA, 0x19 + chan, 0);
        break;
      }
      case FurnaceChipType.VIC: { // 33
        // Write 0 to pitch register - bit 7 clear = channel off
        this.chipEngine.write(FurnaceChipType.VIC, 0x0A + chan, 0);
        break;
      }
      case FurnaceChipType.TED: { // 34
        this.chipEngine.write(FurnaceChipType.TED, 0x11, 0);
        break;
      }
      case FurnaceChipType.SUPERVISION: { // 35
        const regBase = 0x10 + (chan * 4);
        this.chipEngine.write(FurnaceChipType.SUPERVISION, regBase + 2, 0);  // Control: volume=0
        break;
      }
      case FurnaceChipType.UPD1771: { // 42
        // Send Mode 0 (silence) - single byte packet
        this.chipEngine.write(FurnaceChipType.UPD1771, 0, 0x00);
        console.log(`[UPD1771 keyOff]`);
        break;
      }

      case FurnaceChipType.YMZ280B: { // 28
        // Key-off: clear keyon bit
        const regBase = chan * 4;
        this.chipEngine.write(FurnaceChipType.YMZ280B, 0x01 + regBase, 0x40);  // PCM8 format, key-off
        console.log(`[YMZ280B keyOff] chan=${chan}`);
        break;
      }

      case FurnaceChipType.RF5C68: { // 29
        // Key-off channel (bit SET = disabled due to inverted logic)
        this.chipEngine.write(FurnaceChipType.RF5C68, 0x08, 0xFF);  // Disable all channels
        console.log(`[RF5C68 keyOff] chan=${chan}`);
        break;
      }

      case FurnaceChipType.GA20: { // 30
        // Key-off: vol=0, ctrl=0
        const regBaseGA20 = chan * 8;
        this.chipEngine.write(FurnaceChipType.GA20, regBaseGA20 + 5, 0);
        this.chipEngine.write(FurnaceChipType.GA20, regBaseGA20 + 6, 0);
        console.log(`[GA20 keyOff] chan=${chan}`);
        break;
      }

      case FurnaceChipType.SEGAPCM: { // 27
        // Key-off: control register = 0 (stop playback)
        const regBaseSega = (chan & 15) * 8;
        this.chipEngine.write(FurnaceChipType.SEGAPCM, 0x86 + regBaseSega, 0);
        console.log(`[SegaPCM keyOff] chan=${chan}`);
        break;
      }

      case FurnaceChipType.K007232: { // 39
        // Key-off: just set volume to 0
        this.chipEngine.write(FurnaceChipType.K007232, 0x0C, 0);
        console.log(`[K007232 keyOff] chan=${chan}`);
        break;
      }

      case FurnaceChipType.K053260: { // 40
        // Key-off: clear key-on mask
        const voiceK53Off = chan & 3;
        this.chipEngine.write(FurnaceChipType.K053260, 0x28, 0);  // Clear all key-on bits
        console.log(`[K053260 keyOff] voice=${voiceK53Off}`);
        break;
      }

      case FurnaceChipType.QSOUND: { // 32
        // Key-off: set volume to 0
        const voiceQSOff = chan % 16;
        const volRegQS = voiceQSOff < 8 ? (6 + voiceQSOff * 8) : (0x46 + (voiceQSOff - 8) * 8);
        this.chipEngine.write(FurnaceChipType.QSOUND, 0, 0);
        this.chipEngine.write(FurnaceChipType.QSOUND, 1, 0);
        this.chipEngine.write(FurnaceChipType.QSOUND, 2, volRegQS);
        console.log(`[QSound keyOff] voice=${voiceQSOff}`);
        break;
      }

      case FurnaceChipType.C140: { // 31
        // Key-off: clear control register
        const voiceC140Off = chan % 24;
        const regBaseC140Off = voiceC140Off * 0x10;
        this.chipEngine.write(FurnaceChipType.C140, regBaseC140Off + 0x05, 0);
        console.log(`[C140 keyOff] voice=${voiceC140Off}`);
        break;
      }

      case FurnaceChipType.ES5506:
      case FurnaceChipType.OKI:
        break;

      // === NEW CHIP TYPES (47-72) ===
      case FurnaceChipType.OPN: { // 47 - YM2203
        // Like OPNA but simpler - key-off by clearing operator bits
        const chanOffset = chan % 3;
        this.chipEngine.write(FurnaceChipType.OPN, 0x28, chanOffset); // Key off
        break;
      }
      case FurnaceChipType.OPNB_B: { // 48 - YM2610B
        // Same as OPNB
        const opnbBKonOffs = [1, 2, 5, 6];
        const opnbBKonOff = opnbBKonOffs[chan & 3];
        this.chipEngine.write(FurnaceChipType.OPNB_B, 0x28, opnbBKonOff);
        break;
      }
      case FurnaceChipType.ESFM: { // 49 - Enhanced OPL3
        const chanOff = chan % 9;
        const esfmPart = chan < 9 ? 0x000 : 0x100;
        const b0val = ((this._oplBlock & 7) << 2) | ((this._oplFnum >> 8) & 3);
        this.chipEngine.write(FurnaceChipType.ESFM, esfmPart | (0xB0 + chanOff), b0val);
        break;
      }
      case FurnaceChipType.AY8930: { // 50 - Enhanced AY
        this.chipEngine.write(FurnaceChipType.AY8930, 0x08 + chan, 0);
        break;
      }
      case FurnaceChipType.NDS: { // 51 - Nintendo DS
        const ndsBase = chan * 16;
        this.chipEngine.write(FurnaceChipType.NDS, ndsBase + 0x03, 0x00); // CNT high byte - stop
        break;
      }
      case FurnaceChipType.GBA_DMA: { // 52 - GBA DMA Sound
        this.chipEngine.write(FurnaceChipType.GBA_DMA, 0x84, 0x00); // SOUNDCNT_X disable
        break;
      }
      case FurnaceChipType.GBA_MINMOD: { // 53 - GBA MinMod
        this.chipEngine.write(FurnaceChipType.GBA_MINMOD, 0x84, 0x00);
        break;
      }
      case FurnaceChipType.POKEMINI: { // 54 - Pokemon Mini
        this.chipEngine.write(FurnaceChipType.POKEMINI, 0x71, 0x00); // PRC_MODE disable
        break;
      }
      case FurnaceChipType.NAMCO: { // 55 - Namco WSG
        const namcoBase = chan * 8;
        this.chipEngine.write(FurnaceChipType.NAMCO, 0x15 + namcoBase, 0x00); // Volume = 0
        break;
      }
      case FurnaceChipType.PET: { // 56 - Commodore PET
        this.chipEngine.write(FurnaceChipType.PET, 0x00, 0x00); // Disable sound
        break;
      }
      case FurnaceChipType.POKEY: { // 57 - Atari POKEY
        this.chipEngine.write(FurnaceChipType.POKEY, chan * 2 + 1, 0x00); // Volume = 0
        break;
      }
      case FurnaceChipType.MSM6258: { // 58 - OKI ADPCM
        this.chipEngine.write(FurnaceChipType.MSM6258, 0x00, 0x01); // Stop command
        break;
      }
      case FurnaceChipType.MSM5232: { // 59 - 8-voice synth
        const msm5232Vol = 0x0A + chan;
        this.chipEngine.write(FurnaceChipType.MSM5232, msm5232Vol, 0x00);
        break;
      }
      case FurnaceChipType.MULTIPCM: { // 60 - Sega MultiPCM
        const mpcmBase = chan * 8;
        this.chipEngine.write(FurnaceChipType.MULTIPCM, mpcmBase + 0x05, 0x00); // Volume = 0
        break;
      }
      case FurnaceChipType.AMIGA: { // 61 - Amiga Paula
        this.chipEngine.write(FurnaceChipType.AMIGA, 0x96, 1 << chan); // DMACON disable
        break;
      }
      case FurnaceChipType.PCSPKR: { // 62 - PC Speaker
        this.chipEngine.write(FurnaceChipType.PCSPKR, 0x61, 0x00); // Disable speaker
        break;
      }
      case FurnaceChipType.PONG: { // 63 - AY-3-8500 (Pong chip)
        // No explicit key-off, just stop updating
        break;
      }
      case FurnaceChipType.PV1000: { // 64 - Casio PV-1000
        this.chipEngine.write(FurnaceChipType.PV1000, 0xFC + chan, 0x00);
        break;
      }
      case FurnaceChipType.DAVE: { // 65 - Enterprise DAVE
        const daveVolReg = 0x08 + (chan * 3) + 2;
        this.chipEngine.write(FurnaceChipType.DAVE, daveVolReg, 0x00);
        break;
      }
      case FurnaceChipType.SU: { // 66 - Sound Unit
        const suBase = chan << 5;
        this.chipEngine.write(FurnaceChipType.SU, suBase + 0x02, 0x00); // Control off
        break;
      }
      case FurnaceChipType.BIFURCATOR: { // 67 - Bifurcator
        // No explicit key-off
        break;
      }
      case FurnaceChipType.POWERNOISE: { // 68 - Power Noise
        const pnBase = chan * 4;
        this.chipEngine.write(FurnaceChipType.POWERNOISE, pnBase, 0x00);
        break;
      }
      case FurnaceChipType.ZXBEEPER: { // 69 - ZX Spectrum beeper
        // No explicit key-off, just stop toggling
        break;
      }
      case FurnaceChipType.ZXBEEPER_QT: { // 70 - ZX Beeper QuadTone
        // No explicit key-off
        break;
      }
      case FurnaceChipType.SCVTONE: { // 71 - Epoch SCV Tone
        this.chipEngine.write(FurnaceChipType.SCVTONE, chan, 0x00);
        break;
      }
      case FurnaceChipType.PCMDAC: { // 72 - Generic PCM DAC
        this.chipEngine.write(FurnaceChipType.PCMDAC, 0x00, 0x80); // Silence (center)
        break;
      }

      default:
        break;
    }
  }

  dispose(): this {
    this.outputGain.dispose();
    super.dispose();
    return this;
  }
}