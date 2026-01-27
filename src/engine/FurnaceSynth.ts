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

  constructor(config: FurnaceConfig = DEFAULT_FURNACE, channelIndex: number = 0) {
    super();
    this.config = config;
    this.channelIndex = channelIndex;

    // Output
    this.outputGain = new Tone.Gain(1);
    this.output = this.outputGain;

    // Initialize engine if needed
    this.chipEngine.init(Tone.getContext().rawContext as AudioContext);

    // Connect to the global WASM chip engine output
    this.chipEngine.getOutput().connect(this.outputGain as any);

    this.updateParameters();
  }

  /**
   * Process a single tracker tick for macro modulation
   */
  public processTick(time: number = Tone.now()): void {
    if (!this.isNoteOn) return;

    let needsRegisterUpdate = false;

    // 1. Global Macros (Volume, Arp, Pitch)
    this.config.macros.forEach(macro => {
      let pos = this.macroPositions.get(macro.type) || 0;
      const val = macro.data[pos];

      switch (macro.type) {
        case 0: // Volume (0-127)
          const volGain = Math.max(0, val / 127);
          this.outputGain.gain.setValueAtTime(volGain, time);
          break;
        case 1: // Arpeggio (relative semitones)
          this.updateFrequency(this.activeNoteFreq * Math.pow(2, val / 12));
          break;
        case 4: // Pitch (relative cents)
          this.updateFrequency(this.activeNoteFreq * Math.pow(2, val / 1200));
          break;
      }

      pos++;
      if (pos >= macro.data.length) {
        pos = macro.loop >= 0 ? macro.loop : macro.data.length - 1;
      }
      this.macroPositions.set(macro.type, pos);
    });

    // 2. Operator Macros (TL)
    this.config.opMacros.forEach((opMacros, i) => {
      if (opMacros.tl) {
        const macro = opMacros.tl;
        let pos = this.opMacroPositions[i].tl || 0;
        const val = macro.data[pos];

        // Update Total Level via register
        this.config.operators[i].tl = val;
        needsRegisterUpdate = true;

        pos++;
        if (pos >= macro.data.length) {
          pos = macro.loop >= 0 ? macro.loop : macro.data.length - 1;
        }
        this.opMacroPositions[i].tl = pos;
      }
    });

    if (needsRegisterUpdate) {
      this.updateParameters();
    }
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
    // Use the mapper to write all registers based on chip type
    if (this.config.chipType === 1) { // OPN2/Genesis
      FurnaceRegisterMapper.mapOPN2(this.chipEngine, this.channelIndex, this.config);
    } else if (this.config.chipType === 33) { // OPM/Arcade
      FurnaceRegisterMapper.mapOPM(this.chipEngine, this.channelIndex, this.config);
    } else if (this.config.chipType === 14) { // OPL3
      FurnaceRegisterMapper.mapOPL3(this.chipEngine, this.channelIndex, this.config);
    } else if (this.config.chipType === 8 || this.config.chipType === 34) { // PSG / NES
      FurnaceRegisterMapper.mapPSG(this.chipEngine, this.channelIndex, this.config);
    } else if (this.config.chipType === 2) { // Game Boy
      // Upload wavetable if available
      if (this.config.wavetables.length > 0) {
        FurnaceRegisterMapper.uploadWavetable(this.chipEngine, 2, this.config.wavetables[0].data);
      }
    } else if (this.config.chipType === 7) { // SCC
      if (this.config.wavetables.length > 0) {
        FurnaceRegisterMapper.uploadWavetable(this.chipEngine, 7, this.config.wavetables[0].data);
      }
    } else if (this.config.chipType === 17) { // N163
      if (this.config.wavetables.length > 0) {
        FurnaceRegisterMapper.uploadWavetable(this.chipEngine, 17, this.config.wavetables[0].data);
      }
    }
  }

  public triggerAttack(note: string, time?: number, _velocity?: number): this {
    const freq = Tone.Frequency(note).toFrequency();
    this.activeNoteFreq = freq;
    this.isNoteOn = true;
    
    this.macroPositions.clear();
    this.opMacroPositions = Array.from({ length: 4 }, () => ({}));

    // 1. Setup registers
    const scheduledTime = time || Tone.now();
    
    this.updateParameters();
    this.updateFrequency(freq);
    
    // 2. Write Key ON
    const chanOffset = (this.channelIndex % 3);
    const part = this.channelIndex < 3 ? 0 : 1;
    const keyOnVal = 0xF0 | (part << 2) | chanOffset; // All 4 operators ON
    
    // Key ON must be precise
    this.chipEngine.write(FurnaceChipType.OPN2, 0x28, keyOnVal);

    // Initial macro process (velocity could affect starting volume)
    this.processTick(scheduledTime);

    return this;
  }

  public triggerRelease(_time?: number): this {
    this.isNoteOn = false;
    
    // Write Key OFF
    const chanOffset = (this.channelIndex % 3);
    const part = this.channelIndex < 3 ? 0 : 1;
    const keyOffVal = (part << 2) | chanOffset; // All 4 operators OFF
    this.chipEngine.write(FurnaceChipType.OPN2, 0x28, keyOffVal);
    
    return this;
  }

  dispose(): this {
    super.dispose();
    this.outputGain.dispose();
    return this;
  }
}