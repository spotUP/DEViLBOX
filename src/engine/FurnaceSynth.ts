import * as Tone from 'tone';
import type { FurnaceConfig } from '../types/instrument';
import { DEFAULT_FURNACE } from '../types/instrument';
import { FurnaceChipEngine, FurnaceChipType } from './chips/FurnaceChipEngine';
import { FurnaceRegisterMapper } from '../lib/import/formats/FurnaceRegisterMapper';
import { FurnacePitchUtils } from '../lib/import/formats/FurnacePitchUtils';

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

  // Fallback synth when WASM engine isn't available
  private fallbackSynth: Tone.PolySynth | null = null;
  private useWasmEngine: boolean = false;
  private initInProgress: boolean = false;

  constructor(config: FurnaceConfig = DEFAULT_FURNACE, channelIndex: number = 0) {
    super();
    this.config = config;
    this.channelIndex = channelIndex;

    // Output
    this.outputGain = new Tone.Gain(1);
    this.output = this.outputGain;

    // Create fallback synth immediately (always available)
    this.createFallbackSynth();

    // Initialize WASM engine asynchronously - don't block constructor
    this.initEngine();

    this.updateParameters();
  }

  /**
   * Ensure WASM engine is initialized - call before playing notes
   */
  public async ensureInitialized(): Promise<void> {
    if (this.useWasmEngine) return; // Already using WASM
    if (this.initInProgress) return; // Init in progress
    await this.initEngine();
  }

  /**
   * Create a Tone.js-based FM synth as fallback when WASM isn't available
   * Maps Furnace FM parameters to Tone.js FMSynth parameters
   */
  private createFallbackSynth(): void {
    // Get carrier operator (last one that outputs based on algorithm)
    // Simplified: for most algorithms, op3 (index 3) is carrier
    const carrierOp = this.config.operators[3] || this.config.operators[0];
    const modulatorOp = this.config.operators[1] || this.config.operators[0];

    // Convert FM operator rates to Tone.js envelope times
    // AR: 0-31 (31 = instant, 0 = very slow) -> attack time in seconds
    // DR: 0-31 -> decay time
    // RR: 0-15 -> release time
    // SL: 0-15 -> sustain level (15 = no sustain, 0 = full sustain)
    const arToTime = (ar: number) => ar >= 31 ? 0.001 : Math.max(0.001, (31 - ar) / 31 * 2);
    const drToTime = (dr: number) => dr >= 31 ? 0.01 : Math.max(0.01, (31 - dr) / 31 * 1.5);
    const rrToTime = (rr: number) => rr >= 15 ? 0.05 : Math.max(0.05, (15 - rr) / 15 * 2);
    const slToLevel = (sl: number) => Math.max(0, 1 - (sl / 15));

    // Harmonicity from modulator mult ratio
    const carrierMult = carrierOp.mult || 1;
    const modMult = modulatorOp.mult || 1;
    const harmonicity = modMult / Math.max(1, carrierMult);

    // Modulation index from feedback and modulator TL
    // Higher TL = quieter modulator = less modulation
    const modIndex = Math.max(1, (127 - (modulatorOp.tl || 0)) / 10) * (1 + (this.config.feedback || 0) / 7);

    // Create the fallback FM synth with mapped parameters
    this.fallbackSynth = new Tone.PolySynth({
      maxPolyphony: 8,
      voice: Tone.FMSynth,
      options: {
        harmonicity: Math.max(0.5, Math.min(10, harmonicity)),
        modulationIndex: Math.max(1, Math.min(20, modIndex)),
        envelope: {
          attack: arToTime(carrierOp.ar ?? 31),
          decay: drToTime(carrierOp.dr ?? 10),
          sustain: slToLevel(carrierOp.sl ?? 0),
          release: rrToTime(carrierOp.rr ?? 8),
        },
        modulation: {
          type: 'sine',
        },
        modulationEnvelope: {
          attack: arToTime(modulatorOp.ar ?? 31),
          decay: drToTime(modulatorOp.dr ?? 10),
          sustain: slToLevel(modulatorOp.sl ?? 0) * 0.8,
          release: rrToTime(modulatorOp.rr ?? 8),
        },
      },
    });

    // Apply carrier TL as volume
    const volume = -6 - (carrierOp.tl || 0) / 4; // TL affects volume, -6 to -38 dB range
    this.fallbackSynth.volume.value = Math.max(-40, volume);

    // Connect to output
    this.fallbackSynth.connect(this.outputGain);
  }

  private async initEngine(): Promise<void> {
    // Prevent concurrent init attempts
    if (this.initInProgress) return;
    if (this.useWasmEngine) return;

    this.initInProgress = true;

    try {
      // Get the native AudioContext - try multiple approaches
      const toneContext = Tone.getContext();
      let rawContext: AudioContext | null = null;

      // Method 1: Direct rawContext property
      const rawCtx = toneContext.rawContext;
      if (rawCtx && rawCtx instanceof AudioContext) {
        rawContext = rawCtx;
      }

      // Method 2: Get from internal property
      if (!rawContext) {
        const internalContext = (toneContext as any)._context;
        if (internalContext instanceof AudioContext) {
          rawContext = internalContext;
        }
      }

      if (!rawContext || !rawContext.audioWorklet) {
        console.warn('[FurnaceSynth] No AudioContext available, using fallback');
        this.initInProgress = false;
        return;
      }

      // Wait for context to be running (with timeout)
      if (rawContext.state !== 'running') {
        const started = await Promise.race([
          new Promise<boolean>((resolve) => {
            const checkState = () => {
              if (rawContext!.state === 'running') {
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
          console.warn('[FurnaceSynth] AudioContext not running after 5s, using fallback');
          this.initInProgress = false;
          return;
        }
      }

      // Initialize chip engine
      await this.chipEngine.init(rawContext);

      // Check if WASM engine is actually available
      if (this.chipEngine.isInitialized()) {
        // Connect to the global WASM chip engine output
        try {
          const output = this.chipEngine.getOutput();
          output.connect(this.outputGain as any);
          this.useWasmEngine = true;

          // Disconnect fallback synth when WASM is available
          if (this.fallbackSynth) {
            this.fallbackSynth.disconnect();
          }
          console.log('[FurnaceSynth] ✓ WASM chip engine connected');
        } catch (err) {
          console.warn('[FurnaceSynth] Failed to connect WASM output:', err);
        }
      } else {
        console.warn('[FurnaceSynth] WASM engine not initialized, using fallback');
      }
    } catch (err) {
      console.warn('[FurnaceSynth] Init error:', err);
    } finally {
      this.initInProgress = false;
    }
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

      // Total Level (amplitude)
      if (opMacros.tl && opMacros.tl.data.length > 0) {
        const val = this.advanceOpMacro(opMacros.tl, opIndex, 'tl');
        this.config.operators[opIndex].tl = val;
        this.writeOperatorTL(opIndex, val);
      }

      // Multiplier (frequency ratio)
      if (opMacros.mult && opMacros.mult.data.length > 0) {
        const val = this.advanceOpMacro(opMacros.mult, opIndex, 'mult');
        this.config.operators[opIndex].mult = val;
        this.writeOperatorMult(opIndex, val);
      }

      // Attack Rate
      if (opMacros.ar && opMacros.ar.data.length > 0) {
        const val = this.advanceOpMacro(opMacros.ar, opIndex, 'ar');
        this.config.operators[opIndex].ar = val;
        this.writeOperatorAR(opIndex, val);
      }

      // Decay Rate
      if (opMacros.dr && opMacros.dr.data.length > 0) {
        const val = this.advanceOpMacro(opMacros.dr, opIndex, 'dr');
        this.config.operators[opIndex].dr = val;
        this.writeOperatorDR(opIndex, val);
      }

      // Sustain Level
      if (opMacros.sl && opMacros.sl.data.length > 0) {
        const val = this.advanceOpMacro(opMacros.sl, opIndex, 'sl');
        this.config.operators[opIndex].sl = val;
        this.writeOperatorSL(opIndex, val);
      }

      // Release Rate
      if (opMacros.rr && opMacros.rr.data.length > 0) {
        const val = this.advanceOpMacro(opMacros.rr, opIndex, 'rr');
        this.config.operators[opIndex].rr = val;
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

    if (this.config.chipType === 34) { // NES
      if (chan < 2) { // Pulse channels only
        const base = 0x4000 + (chan * 4);
        // Duty is bits 6-7 of $4000/$4004
        const currentVol = this.config.operators[0]?.tl || 15;
        const volReg = 0x30 | (currentVol & 0x0F); // Constant volume mode
        this.chipEngine.write(FurnaceChipType.NES, base, ((duty & 3) << 6) | volReg);
      }
    } else if (this.config.chipType === 2) { // Game Boy
      if (chan < 2) { // Pulse channels
        const base = chan === 0 ? 0x11 : 0x16;
        // Duty is bits 6-7 of NR11/NR21
        this.chipEngine.write(FurnaceChipType.GB, base, (duty & 3) << 6);
      }
    } else if (this.config.chipType === 8) { // PSG (SN76489)
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

    if (this.config.chipType === 1) { // OPN2
      // OPN2 has L/R bits in register 0xB4-0xB6 (bits 6-7)
      const part = chan < 3 ? 0 : 1;
      const chanOffset = chan % 3;
      const regBase = part === 0 ? 0x000 : 0x100;

      let lr = 0xC0; // Both L+R by default
      if (pan < -32) lr = 0x80;      // Left only
      else if (pan > 32) lr = 0x40;  // Right only

      // Combine with AMS/FMS (preserve existing values)
      this.chipEngine.write(FurnaceChipType.OPN2, regBase | (0xB4 + chanOffset), lr);
    } else if (this.config.chipType === 33) { // OPM
      // OPM has L/R bits in register 0x20 (bits 6-7)
      let lr = 0xC0;
      if (pan < -32) lr = 0x80;
      else if (pan > 32) lr = 0x40;

      const current = ((this.config.feedback & 7) << 3) | (this.config.algorithm & 7);
      this.chipEngine.write(FurnaceChipType.OPM, 0x20 + (chan & 7), lr | current);
    } else if (this.config.chipType === 2) { // Game Boy
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
    if (this.config.chipType === 1) { // OPN2
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

    if (this.config.chipType === 1) { // OPN2
      const part = chan < 3 ? 0 : 1;
      const chanOffset = chan % 3;
      const regBase = part === 0 ? 0x000 : 0x100;
      const opOffsets = [0x00, 0x08, 0x04, 0x0C];
      const opOff = opOffsets[opIndex] + chanOffset;
      this.chipEngine.write(FurnaceChipType.OPN2, regBase | (0x40 + opOff), tl & 0x7F);
    } else if (this.config.chipType === 33) { // OPM
      const opOffsets = [0x00, 0x10, 0x08, 0x18];
      const opOff = opOffsets[opIndex] + (chan & 7);
      this.chipEngine.write(FurnaceChipType.OPM, 0x60 + opOff, tl & 0x7F);
    }
  }

  /**
   * Write operator Multiplier (0-15)
   */
  private writeOperatorMult(opIndex: number, mult: number): void {
    const chan = this.channelIndex;
    const op = this.config.operators[opIndex];
    const dtNative = this.furnaceDtToOPN2(op.dt);

    if (this.config.chipType === 1) { // OPN2
      const part = chan < 3 ? 0 : 1;
      const chanOffset = chan % 3;
      const regBase = part === 0 ? 0x000 : 0x100;
      const opOffsets = [0x00, 0x08, 0x04, 0x0C];
      const opOff = opOffsets[opIndex] + chanOffset;
      this.chipEngine.write(FurnaceChipType.OPN2, regBase | (0x30 + opOff), ((dtNative & 7) << 4) | (mult & 0x0F));
    } else if (this.config.chipType === 33) { // OPM
      const opOffsets = [0x00, 0x10, 0x08, 0x18];
      const opOff = opOffsets[opIndex] + (chan & 7);
      this.chipEngine.write(FurnaceChipType.OPM, 0x40 + opOff, ((dtNative & 7) << 4) | (mult & 0x0F));
    }
  }

  /**
   * Write operator Attack Rate (0-31)
   */
  private writeOperatorAR(opIndex: number, ar: number): void {
    const chan = this.channelIndex;
    const op = this.config.operators[opIndex];

    if (this.config.chipType === 1) { // OPN2
      const part = chan < 3 ? 0 : 1;
      const chanOffset = chan % 3;
      const regBase = part === 0 ? 0x000 : 0x100;
      const opOffsets = [0x00, 0x08, 0x04, 0x0C];
      const opOff = opOffsets[opIndex] + chanOffset;
      // 0x50: RS (bits 6-7), AR (bits 0-4)
      this.chipEngine.write(FurnaceChipType.OPN2, regBase | (0x50 + opOff), ((op.rs & 3) << 6) | (ar & 0x1F));
    } else if (this.config.chipType === 33) { // OPM
      const opOffsets = [0x00, 0x10, 0x08, 0x18];
      const opOff = opOffsets[opIndex] + (chan & 7);
      this.chipEngine.write(FurnaceChipType.OPM, 0x80 + opOff, ((op.rs & 3) << 6) | (ar & 0x1F));
    }
  }

  /**
   * Write operator Decay Rate (0-31)
   */
  private writeOperatorDR(opIndex: number, dr: number): void {
    const chan = this.channelIndex;
    const op = this.config.operators[opIndex];

    if (this.config.chipType === 1) { // OPN2
      const part = chan < 3 ? 0 : 1;
      const chanOffset = chan % 3;
      const regBase = part === 0 ? 0x000 : 0x100;
      const opOffsets = [0x00, 0x08, 0x04, 0x0C];
      const opOff = opOffsets[opIndex] + chanOffset;
      // 0x60: AM (bit 7), DR (bits 0-4)
      this.chipEngine.write(FurnaceChipType.OPN2, regBase | (0x60 + opOff), (op.am ? 0x80 : 0) | (dr & 0x1F));
    } else if (this.config.chipType === 33) { // OPM
      const opOffsets = [0x00, 0x10, 0x08, 0x18];
      const opOff = opOffsets[opIndex] + (chan & 7);
      this.chipEngine.write(FurnaceChipType.OPM, 0xA0 + opOff, (op.am ? 0x80 : 0) | (dr & 0x1F));
    }
  }

  /**
   * Write operator Sustain Level (0-15)
   */
  private writeOperatorSL(opIndex: number, sl: number): void {
    const chan = this.channelIndex;
    const op = this.config.operators[opIndex];

    if (this.config.chipType === 1) { // OPN2
      const part = chan < 3 ? 0 : 1;
      const chanOffset = chan % 3;
      const regBase = part === 0 ? 0x000 : 0x100;
      const opOffsets = [0x00, 0x08, 0x04, 0x0C];
      const opOff = opOffsets[opIndex] + chanOffset;
      // 0x80: SL (bits 4-7), RR (bits 0-3)
      this.chipEngine.write(FurnaceChipType.OPN2, regBase | (0x80 + opOff), ((sl & 0x0F) << 4) | (op.rr & 0x0F));
    } else if (this.config.chipType === 33) { // OPM
      const opOffsets = [0x00, 0x10, 0x08, 0x18];
      const opOff = opOffsets[opIndex] + (chan & 7);
      this.chipEngine.write(FurnaceChipType.OPM, 0xE0 + opOff, ((sl & 0x0F) << 4) | (op.rr & 0x0F));
    }
  }

  /**
   * Write operator Release Rate (0-15)
   */
  private writeOperatorRR(opIndex: number, rr: number): void {
    const chan = this.channelIndex;
    const op = this.config.operators[opIndex];

    if (this.config.chipType === 1) { // OPN2
      const part = chan < 3 ? 0 : 1;
      const chanOffset = chan % 3;
      const regBase = part === 0 ? 0x000 : 0x100;
      const opOffsets = [0x00, 0x08, 0x04, 0x0C];
      const opOff = opOffsets[opIndex] + chanOffset;
      // 0x80: SL (bits 4-7), RR (bits 0-3)
      this.chipEngine.write(FurnaceChipType.OPN2, regBase | (0x80 + opOff), ((op.sl & 0x0F) << 4) | (rr & 0x0F));
    } else if (this.config.chipType === 33) { // OPM
      const opOffsets = [0x00, 0x10, 0x08, 0x18];
      const opOff = opOffsets[opIndex] + (chan & 7);
      this.chipEngine.write(FurnaceChipType.OPM, 0xE0 + opOff, ((op.sl & 0x0F) << 4) | (rr & 0x0F));
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

    if (this.config.chipType === 1) { // OPN2
      const { block, fnum } = FurnacePitchUtils.freqToOPN2(freq);
      
      // Register A0-A2: F-Number low (8 bits)
      this.chipEngine.write(FurnaceChipType.OPN2, regBase | (0xA0 + chanOffset), fnum & 0xFF);
      // Register A4-A6: Block (bits 3-5), F-Number high (bits 0-2)
      this.chipEngine.write(FurnaceChipType.OPN2, regBase | (0xA4 + chanOffset), ((block & 7) << 3) | ((fnum >> 8) & 7));
    } else if (this.config.chipType === 33) { // OPM
      const { kc, kf } = FurnacePitchUtils.freqToOPM(freq);
      
      // Register 28-2F: Key Code
      this.chipEngine.write(FurnaceChipType.OPM, 0x28 + (this.channelIndex & 7), kc);
      // Register 30-37: Key Fraction
      this.chipEngine.write(FurnaceChipType.OPM, 0x30 + (this.channelIndex & 7), kf << 2);
    } else if (this.config.chipType === 14) { // OPL3
      const chanOff = this.channelIndex % 9;
      const part = this.channelIndex < 9 ? 0x000 : 0x100;
      // Simplified OPL F-Number calculation
      const fnum = Math.floor((freq * (1 << 19)) / 50000) & 0x3FF; 
      this.chipEngine.write(FurnaceChipType.OPL3, part | (0xA0 + chanOff), fnum & 0xFF);
      this.chipEngine.write(FurnaceChipType.OPL3, part | (0xB0 + chanOff), 0x20 | ((fnum >> 8) & 3)); // Octave 4 default
    } else if (this.config.chipType === 8 || this.config.chipType === 34) { // PSG / NES
      // Note: Chip 34 is actually NES in Furnace, but 8 is TIA/PSG-like
      // We'll separate them
      if (this.config.chipType === 34) { // NES
        const period = FurnacePitchUtils.freqToNES(freq);
        const chan = this.channelIndex; // 0=Pulse1, 1=Pulse2, 2=Tri, 3=Noise, 4=DMC
        
        if (chan < 2) { // Pulse
          const base = 0x4000 + (chan * 4);
          this.chipEngine.write(FurnaceChipType.NES, base + 2, period & 0xFF);
          this.chipEngine.write(FurnaceChipType.NES, base + 3, (period >> 8) & 0x07); // Keep length counter
        } else if (chan === 2) { // Triangle
          this.chipEngine.write(FurnaceChipType.NES, 0x400A, period & 0xFF);
          this.chipEngine.write(FurnaceChipType.NES, 0x400B, (period >> 8) & 0x07);
        }
      } else { // PSG (SN76489)
        const period = Math.floor(3579545 / (32 * freq)) & 0x3FF;
        const chan = this.channelIndex & 3;
        this.chipEngine.write(FurnaceChipType.PSG, 0, 0x80 | (chan << 5) | (period & 0x0F));
        this.chipEngine.write(FurnaceChipType.PSG, 0, (period >> 4) & 0x3F);
      }
    } else if (this.config.chipType === 2) { // Game Boy
      const freqVal = FurnacePitchUtils.freqToGB(freq);
      const chan = this.channelIndex; // 0=Pulse1, 1=Pulse2, 2=Wave, 3=Noise
      
      const bases = [0x10, 0x16, 0x1A, 0x20];
      const base = bases[chan];
      
      if (chan !== 3) {
        this.chipEngine.write(FurnaceChipType.GB, base + 3, freqVal & 0xFF);
        this.chipEngine.write(FurnaceChipType.GB, base + 4, 0x80 | ((freqVal >> 8) & 0x07)); // Trigger + High bits
      }
    }
  }

  public updateParameters(): void {
    // If using fallback synth, recreate it with updated parameters
    if (!this.useWasmEngine && this.fallbackSynth) {
      this.fallbackSynth.disconnect();
      this.fallbackSynth.dispose();
      this.createFallbackSynth();
    }

    // Use the mapper to write all registers based on chip type
    switch (this.config.chipType) {
      case 1: // OPN2/Genesis
        FurnaceRegisterMapper.mapOPN2(this.chipEngine, this.channelIndex, this.config);
        break;

      case 33: // OPM/Arcade
        FurnaceRegisterMapper.mapOPM(this.chipEngine, this.channelIndex, this.config);
        break;

      case 14: // OPL3
        FurnaceRegisterMapper.mapOPL3(this.chipEngine, this.channelIndex, this.config);
        break;

      case 8: // PSG (SN76489)
        FurnaceRegisterMapper.mapPSG(this.chipEngine, this.channelIndex, this.config);
        break;

      case 34: // NES APU
        FurnaceRegisterMapper.mapNES(this.chipEngine, this.channelIndex, this.config);
        break;

      case 2: // Game Boy
        FurnaceRegisterMapper.mapGB(this.chipEngine, this.channelIndex, this.config);
        // Upload wavetable if available (for wave channel)
        if (this.config.wavetables.length > 0) {
          FurnaceRegisterMapper.uploadWavetable(this.chipEngine, 2, this.config.wavetables[0].data);
        }
        break;

      case 3: // C64 SID
        FurnaceRegisterMapper.mapC64(this.chipEngine, this.channelIndex, this.config);
        break;

      case 7: // SCC
        if (this.config.wavetables.length > 0) {
          FurnaceRegisterMapper.uploadWavetable(this.chipEngine, 7, this.config.wavetables[0].data);
        }
        break;

      case 17: // N163
        if (this.config.wavetables.length > 0) {
          FurnaceRegisterMapper.uploadWavetable(this.chipEngine, 17, this.config.wavetables[0].data);
        }
        break;
    }
  }

  public triggerAttack(note: string, time?: number, velocity?: number): this {
    const freq = Tone.Frequency(note).toFrequency();
    this.activeNoteFreq = freq;
    this.isNoteOn = true;

    // Store velocity for macro modulation (0.0 to 1.0)
    this.velocity = velocity !== undefined ? velocity : 1.0;

    const scheduledTime = time || Tone.now();

    // Try to init WASM if not yet available (user interaction should have started AudioContext)
    if (!this.useWasmEngine && !this.initInProgress) {
      this.initEngine(); // Fire and forget - will use WASM on next note if successful
    }

    // Use fallback synth if WASM engine isn't available
    if (!this.useWasmEngine && this.fallbackSynth) {
      this.fallbackSynth.triggerAttack(note, scheduledTime, this.velocity);
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
    this.updateParameters();
    this.updateFrequency(freq);

    // 2. Write Key ON (chip-specific)
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
    if (this.config.chipType !== 1 && this.config.chipType !== 33) {
      return; // Only apply to FM chips (OPN2, OPM)
    }

    // Carrier operators by algorithm (0-7)
    // Carrier = operator that outputs directly to DAC
    const carriersByAlgorithm: number[][] = [
      [3],           // Alg 0: Op4 is carrier
      [3],           // Alg 1: Op4 is carrier
      [3],           // Alg 2: Op4 is carrier
      [3],           // Alg 3: Op4 is carrier
      [1, 3],        // Alg 4: Op2, Op4 are carriers
      [1, 2, 3],     // Alg 5: Op2, Op3, Op4 are carriers
      [1, 2, 3],     // Alg 6: Op2, Op3, Op4 are carriers
      [0, 1, 2, 3],  // Alg 7: All operators are carriers
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
      case 1: // OPN2
        const chanOffset = chan % 3;
        const part = chan < 3 ? 0 : 1;
        const keyOnVal = 0xF0 | (part << 2) | chanOffset; // All 4 operators ON
        this.chipEngine.write(FurnaceChipType.OPN2, 0x28, keyOnVal);
        break;

      case 33: // OPM
        // OPM key-on is register 0x08, bits 0-2 = channel, bits 3-6 = operators
        this.chipEngine.write(FurnaceChipType.OPM, 0x08, 0x78 | (chan & 7));
        break;

      case 34: // NES
        if (chan < 2) { // Pulse
          const base = 0x4000 + (chan * 4);
          this.chipEngine.write(FurnaceChipType.NES, base, ((this.currentDuty & 3) << 6) | 0x30 | vol);
          this.chipEngine.write(FurnaceChipType.NES, base + 3, 0x08); // Length counter load
        } else if (chan === 2) { // Triangle
          this.chipEngine.write(FurnaceChipType.NES, 0x4008, 0xFF); // Linear counter
          this.chipEngine.write(FurnaceChipType.NES, 0x400B, 0x08);
        } else if (chan === 3) { // Noise
          this.chipEngine.write(FurnaceChipType.NES, 0x400C, 0x30 | vol);
          this.chipEngine.write(FurnaceChipType.NES, 0x400F, 0x08);
        }
        this.chipEngine.write(FurnaceChipType.NES, 0x4015, 0x0F); // Enable all channels
        break;

      case 2: // Game Boy
        if (chan < 2) { // Pulse
          const base = chan === 0 ? 0x10 : 0x15;
          this.chipEngine.write(FurnaceChipType.GB, base + 1, ((this.currentDuty & 3) << 6));
          this.chipEngine.write(FurnaceChipType.GB, base + 2, (vol << 4) | 0x08); // Volume envelope
          this.chipEngine.write(FurnaceChipType.GB, base + 4, 0x80); // Trigger
        } else if (chan === 2) { // Wave
          this.chipEngine.write(FurnaceChipType.GB, 0x1A, 0x80); // Enable wave
          this.chipEngine.write(FurnaceChipType.GB, 0x1C, 0x20); // Volume
          this.chipEngine.write(FurnaceChipType.GB, 0x1E, 0x80); // Trigger
        } else if (chan === 3) { // Noise
          this.chipEngine.write(FurnaceChipType.GB, 0x21, (vol << 4) | 0x08);
          this.chipEngine.write(FurnaceChipType.GB, 0x23, 0x80); // Trigger
        }
        this.chipEngine.write(FurnaceChipType.GB, 0x26, 0x80); // Master enable
        break;

      case 8: // PSG (SN76489)
        const atten = 15 - Math.min(15, vol);
        this.chipEngine.write(FurnaceChipType.PSG, 0, 0x90 | ((chan & 3) << 5) | atten);
        break;
    }
  }

  public triggerRelease(time?: number): this {
    this.isNoteOn = false;

    // Use fallback synth if WASM engine isn't available
    if (!this.useWasmEngine && this.fallbackSynth) {
      this.fallbackSynth.releaseAll(time);
      return this;
    }

    this.writeKeyOff();
    return this;
  }

  /**
   * Write chip-specific key-off command
   */
  private writeKeyOff(): void {
    const chan = this.channelIndex;

    switch (this.config.chipType) {
      case 1: // OPN2
        const chanOffset = chan % 3;
        const part = chan < 3 ? 0 : 1;
        const keyOffVal = (part << 2) | chanOffset; // All 4 operators OFF
        this.chipEngine.write(FurnaceChipType.OPN2, 0x28, keyOffVal);
        break;

      case 33: // OPM
        // OPM key-off: write 0 to operator bits
        this.chipEngine.write(FurnaceChipType.OPM, 0x08, chan & 7);
        break;

      case 34: // NES
        // NES doesn't have true key-off, silence the channel
        if (chan < 2) {
          const base = 0x4000 + (chan * 4);
          this.chipEngine.write(FurnaceChipType.NES, base, 0x30); // Vol = 0
        } else if (chan === 2) {
          this.chipEngine.write(FurnaceChipType.NES, 0x4008, 0x00); // Disable triangle
        } else if (chan === 3) {
          this.chipEngine.write(FurnaceChipType.NES, 0x400C, 0x30); // Vol = 0
        }
        break;

      case 2: // Game Boy
        if (chan < 2) {
          const base = chan === 0 ? 0x10 : 0x15;
          this.chipEngine.write(FurnaceChipType.GB, base + 2, 0x00); // Volume = 0
        } else if (chan === 2) {
          this.chipEngine.write(FurnaceChipType.GB, 0x1A, 0x00); // Disable wave
        } else if (chan === 3) {
          this.chipEngine.write(FurnaceChipType.GB, 0x21, 0x00); // Volume = 0
        }
        break;

      case 8: // PSG (SN76489)
        // Set attenuation to max (silence)
        this.chipEngine.write(FurnaceChipType.PSG, 0, 0x9F | ((chan & 3) << 5));
        break;
    }
  }

  dispose(): this {
    if (this.fallbackSynth) {
      this.fallbackSynth.dispose();
      this.fallbackSynth = null;
    }
    this.outputGain.dispose();
    super.dispose();
    return this;
  }
}