import type { FurnaceConfig, FurnaceOperatorConfig } from '@typedefs/instrument';
import { FurnaceChipEngine, FurnaceChipType } from '@engine/chips/FurnaceChipEngine';
import { getWavetableForChip } from '@constants/furnaceWavetablePresets';

/**
 * FurnaceRegisterMapper
 * Translates Furnace instrument parameters into raw chip registers.
 * Currently supports OPN2 (Genesis) and OPM (Arcade).
 */
export class FurnaceRegisterMapper {
  /**
   * Map OPN2 (YM2612) registers for a single channel
   * Reference: Furnace genesis.cpp reset() and tick()
   * @param engine FurnaceChipEngine instance
   * @param channel FM channel (0-5)
   * @param config Furnace instrument config
   */
  public static mapOPN2(engine: FurnaceChipEngine, channel: number, config: FurnaceConfig): void {
    const chip = FurnaceChipType.OPN2;
    const part = channel < 3 ? 0 : 1;
    const chanOffset = (channel % 3);
    const regBase = part === 0 ? 0x000 : 0x100;

    // === INIT REGISTERS (from genesis.cpp reset()) ===
    // Reference: genesis.cpp line 1794: immWrite(0x22,lfoValue) where lfoValue=8
    // LFO register 0x22: bit 3 = LFO enable, bits 0-2 = LFO frequency
    // lfoValue=8 means: LFO enabled (bit 3=1), frequency=0 (slowest)
    engine.write(chip, 0x22, 0x08);

    // Override with specific LFO settings if fms or ams is set
    if (config.fms || config.ams) {
      // Reference: genesis.cpp line 799: lfoValue=(chan[i].std.ex3.val>7)?0:(8|(chan[i].std.ex3.val&7))
      const lfoFreq = config.fms ?? 0;
      engine.write(chip, 0x22, 0x08 | (lfoFreq & 0x07));
    }

    // 1. Map Global (Algorithm & Feedback)
    // Register 0xB0: FB (bits 3-5), ALG (bits 0-2)
    const b0Val = ((config.feedback & 7) << 3) | (config.algorithm & 7);
    engine.write(chip, regBase | (0xB0 + chanOffset), b0Val);

    // 2. Register 0xB4: Panning + AMS + FMS
    // bits 7-6: L/R output (default both on = 0xC0)
    // bits 4-5: AMS (0-3)
    // bits 0-2: FMS (0-7)
    const ams = config.ams ?? 0;
    const fms = config.fms ?? 0;
    const b4Val = 0xC0 | ((ams & 3) << 4) | (fms & 7);
    engine.write(chip, regBase | (0xB4 + chanOffset), b4Val);

    // 3. Map Operators - OPN2 slot offsets (from Furnace fmshared_OPN.h + fmsharedbase.h)
    // opOffs = {0x00, 0x04, 0x08, 0x0C} for slots 0,1,2,3
    // orderedOps = {0, 2, 1, 3} maps operator index to slot
    // So: Op1→slot0→0x00, Op2→slot2→0x08, Op3→slot1→0x04, Op4→slot3→0x0C
    const opOffsets = [0x00, 0x08, 0x04, 0x0C];

    console.log(`[mapOPN2] config.operators.length: ${config.operators.length}, operators:`, config.operators.map(op => ({ mult: op.mult, tl: op.tl, ar: op.ar })));

    config.operators.forEach((op: FurnaceOperatorConfig, i: number) => {
      console.log(`[mapOPN2] Writing operator ${i+1}, opOff=${opOffsets[i] + chanOffset}, mult=${op.mult}, tl=${op.tl}`);
      const opOff = opOffsets[i] + chanOffset;

      // 0x30: DT (bits 4-6), MULT (bits 0-3)
      // DT in Furnace: -3 to +3 mapped to OPN2 native values
      const dtNative = this.furnaceDtToOPN2(op.dt);
      engine.write(chip, regBase | (0x30 + opOff), ((dtNative & 7) << 4) | (op.mult & 0x0F));

      // 0x40: Total Level (0-127)
      engine.write(chip, regBase | (0x40 + opOff), op.tl & 0x7F);

      // 0x50: RS (bits 6-7), AR (bits 0-4)
      engine.write(chip, regBase | (0x50 + opOff), ((op.rs & 3) << 6) | (op.ar & 0x1F));

      // 0x60: AM (bit 7), DR (bits 0-4)
      engine.write(chip, regBase | (0x60 + opOff), (op.am ? 0x80 : 0) | (op.dr & 0x1F));

      // 0x70: D2R (bits 0-4) - Secondary decay rate (Furnace d2r)
      engine.write(chip, regBase | (0x70 + opOff), op.d2r & 0x1F);

      // 0x80: SL (bits 4-7), RR (bits 0-3)
      engine.write(chip, regBase | (0x80 + opOff), ((op.sl & 0x0F) << 4) | (op.rr & 0x0F));

      // 0x90: SSG-EG (bits 0-3)
      engine.write(chip, regBase | (0x90 + opOff), op.ssg & 0x0F);
    });
  }

  /**
   * Map OPM (YM2151) registers
   * Reference: Furnace arcade.cpp reset() and tick()
   */
  public static mapOPM(engine: FurnaceChipEngine, channel: number, config: FurnaceConfig): void {
    const chip = FurnaceChipType.OPM;
    const chan = channel & 7;

    // === INIT REGISTERS (from arcade.cpp reset()) ===
    // Reference: arcade.cpp lines 986-990
    // amDepth=0x7f, pmDepth=0x7f at init
    engine.write(chip, 0x01, 0x02);  // LFO reset off (allow LFO to run)
    engine.write(chip, 0x18, 0x00);  // LFO frequency = 0 (slowest)
    engine.write(chip, 0x19, 0x7F);  // AMD (AM depth) = 0x7F (max)
    engine.write(chip, 0x19, 0xFF);  // PMD (PM depth) = 0x7F with bit 7 set = 0xFF

    // Override LFO settings if fms or ams is used
    if (config.fms || config.ams) {
      // Set LFO frequency based on fms value
      const lfoFreq = config.fms ?? 0;
      engine.write(chip, 0x18, (lfoFreq * 16) & 0xFF); // Scale fms to LFO freq
      // 0x19: bit 7 = 1 for PMD, bit 7 = 0 for AMD
      const pmd = config.fms ?? 0x7F;
      const amd = config.ams ?? 0x7F;
      engine.write(chip, 0x19, 0x80 | (pmd & 0x7F)); // Write PMD
      engine.write(chip, 0x19, amd & 0x7F);          // Write AMD
    }

    // 0x20: RL (7-6), FB (5-3), ALG (2-0)
    // Bits 6-7: Left/Right output (3 = both)
    const c20Val = 0xC0 | ((config.feedback & 7) << 3) | (config.algorithm & 7); // Default L+R
    engine.write(chip, 0x20 + chan, c20Val);

    // 0x38: PMS (4-6), AMS (0-1) per channel
    const pms = config.fms ?? 0;
    const amsPerChan = config.ams ?? 0;
    engine.write(chip, 0x38 + chan, ((pms & 7) << 4) | (amsPerChan & 3));

    const opOffsets = [0x00, 0x10, 0x08, 0x18]; // OPM Op order

    config.operators.forEach((op: FurnaceOperatorConfig, i: number) => {
      const opOff = opOffsets[i] + chan;

      // 0x40: DT1 (4-6), MULT (0-3)
      const dtNative = this.furnaceDtToOPN2(op.dt ?? 0);
      engine.write(chip, 0x40 + opOff, ((dtNative & 7) << 4) | ((op.mult ?? 1) & 0x0F));

      // 0x60: TL (0-6)
      engine.write(chip, 0x60 + opOff, (op.tl ?? 0) & 0x7F);

      // 0x80: KS (6-7), AR (0-4)
      engine.write(chip, 0x80 + opOff, (((op.rs ?? 0) & 3) << 6) | ((op.ar ?? 31) & 0x1F));

      // 0xA0: AMS-EN (7), DR (0-4)
      engine.write(chip, 0xA0 + opOff, (op.am ? 0x80 : 0) | ((op.dr ?? 0) & 0x1F));

      // 0xC0: DT2 (6-7), D2R (0-4)
      engine.write(chip, 0xC0 + opOff, (((op.dt2 ?? 0) & 3) << 6) | ((op.d2r ?? 0) & 0x1F));

      // 0xE0: SL (4-7), RR (0-3)
      engine.write(chip, 0xE0 + opOff, (((op.sl ?? 0) & 0x0F) << 4) | ((op.rr ?? 0) & 0x0F));
    });
  }

  /**
   * Map OPL3 (YMF262) registers
   */
  public static mapOPL3(engine: FurnaceChipEngine, channel: number, config: FurnaceConfig): void {
    const chip = FurnaceChipType.OPL3;

    // === INIT REGISTERS (from opl.cpp reset()) ===
    // CRITICAL: Enable OPL3 mode - without this, OPL3 behaves as OPL2
    // Reference: opl.cpp line 1892: immWrite(0x105,0x01)
    engine.write(chip, 0x105, 0x01);  // OPL3 mode enable
    // Enable waveform select (required for non-sine waveforms)
    // Reference: opl.cpp line 1893: immWrite(0x01,0x20)
    engine.write(chip, 0x01, 0x20);   // Waveform select enable

    // OPL3 Channel mapping: 0-8 (Primary bank), 9-17 (Secondary bank)
    const part = channel < 9 ? 0x000 : 0x100;
    const chanOffset = channel % 9;
    
    // 1. Channel Register (0xC0): CHD (7), CHC (6), CHB (5), CHA (4), FB (1-3), ALG (0)
    // We default to L+R output (CHA+CHB)
    const c0Val = 0x30 | ((config.feedback & 7) << 1) | (config.algorithm & 1);
    engine.write(chip, part | (0xC0 + chanOffset), c0Val);

    // 2. Operator Slots
    // Each channel has two slots (operators) in OPL2/3
    // Slot mapping is complex, using standard AdLib slot offsets
    const slots = this.getOPL3Slots(chanOffset);
    
    config.operators.slice(0, 2).forEach((op, i) => {
      const slotOff = part | slots[i];

      // 0x20: AM (7), VIB (6), EG-TYP/Sustain (5), KSR (4), MULT (0-3)
      const v20 = (op.am ? 0x80 : 0) |
                  (op.vib ? 0x40 : 0) |
                  (op.sus ? 0x20 : 0) |
                  (op.ksr ? 0x10 : 0) |
                  (op.mult & 0x0F);
      engine.write(chip, 0x20 + slotOff, v20);

      // 0x40: KSL (6-7), TL (0-5)
      engine.write(chip, 0x40 + slotOff, ((op.ksl & 3) << 6) | (op.tl & 0x3F));

      // 0x60: AR (4-7), DR (0-3)
      engine.write(chip, 0x60 + slotOff, ((op.ar >> 1) << 4) | (op.dr >> 1));

      // 0x80: SL (4-7), RR (0-3)
      engine.write(chip, 0x80 + slotOff, ((op.sl & 0x0F) << 4) | (op.rr & 0x0F));

      // 0xE0: Waveform Select (0-7)
      engine.write(chip, 0xE0 + slotOff, op.ws & 0x07);
    });
  }

  /**
   * Map PSG (SN76489) registers
   */
  public static mapPSG(engine: FurnaceChipEngine, channel: number, config: FurnaceConfig): void {
    const chip = FurnaceChipType.PSG;

    // === INIT REGISTERS (from sms.cpp reset()) ===
    // Reference: sms.cpp line 423: rWrite(0,0xe7) noise mode
    // Reference: sms.cpp line 424: rWrite(1,0xff) stereo (all channels to both outputs)
    engine.write(chip, 0, 0xE7);   // Noise mode: periodic, shift rate
    engine.write(chip, 1, 0xFF);   // Stereo: all channels to both L+R

    // PSG uses a simple 8-bit latch system
    // 1ccc vvvv -> c=channel, v=value

    // Volume (Attenuation) mapping: 0-15 (0 is loudest)
    // Furnace TL is 0-127, map to 0-15
    const atten = Math.min(15, Math.floor(config.operators[0].tl / 8));
    const volLatch = 0x90 | ((channel & 3) << 5) | (atten & 0x0F);
    engine.write(chip, 0, volLatch);
  }

  /**
   * Map Game Boy (DMG) registers
   * GB has 4 channels: Square 1, Square 2, Wave, Noise
   *
   * Based on Furnace gb.cpp reset() sequence
   */
  public static mapGB(engine: FurnaceChipEngine, _channel: number, _config: FurnaceConfig): void {
    const chip = FurnaceChipType.GB;
    console.log('[mapGB] Writing GB init registers: NR10=0x00, NR52=0x8F, NR51=0xFF, NR50=0xFF');

    // Furnace reset sequence (gb.cpp lines 656-660):
    // immWrite(0x10,0);      // NR10 sweep = 0
    // immWrite(0x26,0x8f);   // NR52 master enable + channel status
    // immWrite(0x25,procMute());  // NR51 panning
    // immWrite(0x24,0xff);   // NR50 master volume
    engine.write(chip, 0x10, 0x00);   // NR10: Sweep = 0
    engine.write(chip, 0x26, 0x8F);   // NR52: Master enable (0x80) + all channels on (0x0F)
    engine.write(chip, 0x25, 0xFF);   // NR51: All channels to both L+R outputs
    engine.write(chip, 0x24, 0xFF);   // NR50: Max volume both outputs

    // NOTE: Furnace does NOT write envelope/duty in mapGB equivalent
    // Those are written during keyOn in tick()
    // We just do the init here
  }

  /**
   * Map SID registers (supports both SID3 enhanced and classic 6581/8580)
   * Reference: Furnace c64.cpp for classic SID, sid3.h for SID3
   *
   * Classic SID register layout per voice (3 voices, 7 bytes each):
   *   +0: Freq Low, +1: Freq High
   *   +2: PW Low, +3: PW High (bits 0-3)
   *   +4: Control (waveform + gate + sync + ring + test)
   *   +5: Attack (4-7) / Decay (0-3)
   *   +6: Sustain (4-7) / Release (0-3)
   * Global: 0x15-0x16: Filter cutoff, 0x17: Filter res/routing, 0x18: Filter mode/volume
   */
  public static mapC64(engine: FurnaceChipEngine, channel: number, config: FurnaceConfig): void {
    const chip = FurnaceChipType.SID;
    const c64 = config.c64;

    // Detect if we're using SID3 or classic SID based on chip type
    // SID=10 is SID3, SID_6581=45 and SID_8580=46 are classic
    const isClassicSID = config.chipType === FurnaceChipType.SID_6581 ||
                         config.chipType === FurnaceChipType.SID_8580;

    if (isClassicSID) {
      // === CLASSIC SID (6581/8580) ===
      // Reference: c64.cpp reset() line 874: rWrite(0x18,0x0f)
      const voiceBase = channel * 7;

      // Attack/Decay: upper nibble = attack (0-15), lower nibble = decay (0-15)
      const attack = c64?.a ?? 0;
      const decay = c64?.d ?? 8;
      engine.write(chip, voiceBase + 5, ((attack & 0x0F) << 4) | (decay & 0x0F));

      // Sustain/Release: upper nibble = sustain (0-15), lower nibble = release (0-15)
      const sustain = c64?.s ?? 15;
      const release = c64?.r ?? 4;
      engine.write(chip, voiceBase + 6, ((sustain & 0x0F) << 4) | (release & 0x0F));

      // Pulse width (12-bit)
      const pulseWidth = c64?.duty ?? 2048;
      engine.write(chip, voiceBase + 2, pulseWidth & 0xFF);
      engine.write(chip, voiceBase + 3, (pulseWidth >> 8) & 0x0F);

      // Control register (waveform + gate)
      // bits: noise(7), pulse(6), saw(5), tri(4), test(3), ring(2), sync(1), gate(0)
      let control = 0;
      if (c64) {
        if (c64.noiseOn) control |= 0x80;
        if (c64.pulseOn) control |= 0x40;
        if (c64.sawOn) control |= 0x20;
        if (c64.triOn) control |= 0x10;
        if (c64.ringMod) control |= 0x04;
        if (c64.oscSync) control |= 0x02;
      } else {
        control = 0x40; // Default pulse wave
      }
      // Gate off initially
      engine.write(chip, voiceBase + 4, control);

      // Global filter/volume register (0x18)
      // Reference: c64.cpp line 874: rWrite(0x18,0x0f) -> volume=15
      // bits 7-4: filter mode (HP=6, BP=5, LP=4, 3=off), bits 3-0: volume
      engine.write(chip, 0x18, 0x0F);  // Volume max, no filter mode yet

      // Filter routing (0x17): bits 0-2 = voice routing, bits 4-7 = resonance
      const filterRes = c64?.filterResonance ?? c64?.filterRes ?? 0;
      let filterRoute = 0;
      if (c64?.filterOn && c64?.filterCh3Off !== true) {
        filterRoute |= (1 << channel);  // Route this channel through filter
      }
      engine.write(chip, 0x17, ((filterRes & 0x0F) << 4) | filterRoute);

    } else {
      // === SID3 (Enhanced SID) ===
      // SID3 has 7 channels with 64 registers each
      const SID3_REGS_PER_CHAN = 64;
      const SID3_REG_FLAGS = 0;
      const SID3_REG_ADSR_A = 1;
      const SID3_REG_ADSR_D = 2;
      const SID3_REG_ADSR_S = 3;
      const SID3_REG_ADSR_R = 5;
      const SID3_REG_WAVEFORM = 6;
      const SID3_REG_PW_HIGH = 7;
      const SID3_REG_PW_LOW = 8;
      const SID3_REG_VOL = 13;
      const SID3_REG_PAN_LEFT = 50;
      const SID3_REG_PAN_RIGHT = 51;

      const chanBase = channel * SID3_REGS_PER_CHAN;

      // Initialize with defaults if no c64 config
      const attack = (c64?.a ?? 0) * 17;    // Scale 4-bit to 8-bit
      const decay = (c64?.d ?? 8) * 17;
      const sustain = (c64?.s ?? 15) * 17;
      const release = (c64?.r ?? 4) * 17;

      // ADSR
      engine.write(chip, chanBase + SID3_REG_ADSR_A, attack & 0xFF);
      engine.write(chip, chanBase + SID3_REG_ADSR_D, decay & 0xFF);
      engine.write(chip, chanBase + SID3_REG_ADSR_S, sustain & 0xFF);
      engine.write(chip, chanBase + SID3_REG_ADSR_R, release & 0xFF);

      // Waveform: 1=tri, 2=saw, 4=pulse, 8=noise
      let waveform = 0;
      if (c64) {
        if (c64.triOn) waveform |= 1;
        if (c64.sawOn) waveform |= 2;
        if (c64.pulseOn) waveform |= 4;
        if (c64.noiseOn) waveform |= 8;
      } else {
        waveform = 4; // Default pulse
      }
      engine.write(chip, chanBase + SID3_REG_WAVEFORM, waveform);

      // Pulse width (16-bit)
      const pulseWidth = c64?.duty ?? 2048;
      engine.write(chip, chanBase + SID3_REG_PW_HIGH, (pulseWidth >> 8) & 0xFF);
      engine.write(chip, chanBase + SID3_REG_PW_LOW, pulseWidth & 0xFF);

      // Volume (max)
      engine.write(chip, chanBase + SID3_REG_VOL, 255);

      // Pan (center)
      engine.write(chip, chanBase + SID3_REG_PAN_LEFT, 255);
      engine.write(chip, chanBase + SID3_REG_PAN_RIGHT, 255);

      // Flags: gate off initially (will be set in writeKeyOn)
      engine.write(chip, chanBase + SID3_REG_FLAGS, 0);
    }
  }

  /**
   * Map NES APU registers
   * Reference: Furnace nes.cpp reset() and tick()
   */
  public static mapNES(engine: FurnaceChipEngine, channel: number, config: FurnaceConfig): void {
    const chip = FurnaceChipType.NES;

    // === INIT REGISTERS (from nes.cpp reset()) ===
    // Reference: nes.cpp line 877: rWrite(0x4015,0x1f)
    // 0x1F = Enable all channels: Square1, Square2, Triangle, Noise, DMC
    // Note: DMC won't play without sample data, but enable bit is still set
    engine.write(chip, 0x4015, 0x1F);

    // Reference: nes.cpp lines 878-879: Initialize sweep registers
    engine.write(chip, 0x4001, 0x08);  // Pulse 1 sweep (disabled)
    engine.write(chip, 0x4005, 0x08);  // Pulse 2 sweep (disabled)

    // NES APU channels:
    // 0: Pulse 1 (0x4000-0x4003)
    // 1: Pulse 2 (0x4004-0x4007)
    // 2: Triangle (0x4008-0x400B)
    // 3: Noise (0x400C-0x400F)
    // 4: DMC (0x4010-0x4013)

    if (channel < 2) {
      // Pulse channels
      const base = channel * 4;

      // 0x4000/0x4004: Duty (bits 6-7), LC halt (bit 5), Constant Vol (bit 4), Volume (bits 0-3)
      const duty = Math.floor((config.operators[0]?.mult ?? 2) / 4) & 3;
      const vol = Math.max(0, 15 - Math.floor(config.operators[0].tl / 8));
      engine.write(chip, 0x4000 + base, (duty << 6) | 0x30 | (vol & 0x0F));

    } else if (channel === 2) {
      // Triangle
      // 0x4008: Linear counter (bit 7 = control, bits 0-6 = reload value)
      engine.write(chip, 0x4008, 0xFF); // Max length

    } else if (channel === 3) {
      // Noise
      // 0x400C: LC halt (bit 5), Constant Vol (bit 4), Volume (bits 0-3)
      const vol = Math.max(0, 15 - Math.floor(config.operators[0].tl / 8));
      engine.write(chip, 0x400C, 0x30 | (vol & 0x0F));
      // NOTE: 0x400E (noise period) is NOT initialized at reset per Furnace nes.cpp
      // It only gets written when a note is played (with duty bit and freq)
    }
  }

  // ============== NEW CHIP MAPPERS ==============

  /**
   * Map AY-3-8910 / YM2149 registers
   * Reference: ay.cpp reset()
   */
  public static mapAY(engine: FurnaceChipEngine, _channel: number, _config: FurnaceConfig): void {
    const chip = FurnaceChipType.AY;
    // Reference: ay.cpp line 582: rWrite(0x07,0x38)
    // Mixer register: bits 0-2 = tone enable (0=on), bits 3-5 = noise enable (1=off)
    // 0x38 = 00111000 = tone on for all 3 channels, noise off for all
    engine.write(chip, 0x07, 0x38);
  }

  /**
   * Map PC Engine / TurboGrafx registers
   * Reference: pce.cpp reset()
   */
  public static mapPCE(engine: FurnaceChipEngine, _channel: number, _config: FurnaceConfig): void {
    const chip = FurnaceChipType.PCE;
    // Reference: pce.cpp line 390-391
    engine.write(chip, 0x00, 0x00);  // Channel select = global
    engine.write(chip, 0x01, 0xFF);  // Master volume = max (both L+R)
  }

  /**
   * Map SNES (SPC700/DSP) registers
   * Reference: snes.cpp reset()
   */
  public static mapSNES(engine: FurnaceChipEngine, _channel: number, _config: FurnaceConfig): void {
    const chip = FurnaceChipType.SNES;
    // Reference: snes.cpp reset() lines 873-877
    // Sample directory is at 0x200, so DIR register = 0x02
    engine.write(chip, 0x5D, 0x02);  // DIR - Sample directory base (0x200 >> 8)
    engine.write(chip, 0x0C, 127);   // MVOLL - Master volume left
    engine.write(chip, 0x1C, 127);   // MVOLR - Master volume right
    engine.write(chip, 0x6C, 0);     // FLG - DSP out of reset, echo off
    engine.write(chip, 0x4C, 0);     // KON - Key on (clear)
    engine.write(chip, 0x5C, 0);     // KOFF - Key off (clear)

    // Set source number for each channel to point to directory entry
    // Reference: snes.cpp line 884: chWrite(i, 4, i)
    for (let i = 0; i < 8; i++) {
      engine.write(chip, i * 0x10 + 0x04, i);  // SRCN - Source number
    }
  }

  /**
   * Map OPLL (YM2413) registers
   * Reference: opll.cpp reset()
   */
  public static mapOPLL(engine: FurnaceChipEngine, channel: number, config: FurnaceConfig): void {
    const chip = FurnaceChipType.OPLL;

    // OPLL register 0x30+ch: instrument (high nibble) + volume (low nibble)
    // Reference: opll.cpp line 168
    // Instruments: 0=user, 1=violin, 2=guitar, 3=piano, 4=flute, 5=clarinet,
    //              6=oboe, 7=trumpet, 8=organ, 9=horn, 10=synth, 11=harpsichord,
    //              12=vibraphone, 13=synth bass, 14=acoustic bass, 15=elec guitar
    const instrument = config.opllPreset ?? 3;  // Default to piano
    const volume = 0;  // 0 = max volume

    // If using user instrument (0), write custom operator data to registers 0x00-0x07
    // Reference: opll.cpp - user instrument registers
    if (instrument === 0 && config.operators.length >= 2) {
      const mod = config.operators[0];  // Modulator
      const car = config.operators[1];  // Carrier

      // 0x00: Modulator - AM(7), VIB(6), EG(5), KSR(4), MULT(0-3)
      const r00 = (mod.am ? 0x80 : 0) |
                  (mod.vib ? 0x40 : 0) |
                  (mod.sus ? 0x20 : 0) |
                  (mod.ksr ? 0x10 : 0) |
                  (mod.mult & 0x0F);
      engine.write(chip, 0x00, r00);

      // 0x01: Carrier - AM(7), VIB(6), EG(5), KSR(4), MULT(0-3)
      const r01 = (car.am ? 0x80 : 0) |
                  (car.vib ? 0x40 : 0) |
                  (car.sus ? 0x20 : 0) |
                  (car.ksr ? 0x10 : 0) |
                  (car.mult & 0x0F);
      engine.write(chip, 0x01, r01);

      // 0x02: Modulator KSL(6-7), TL(0-5)
      const modTL = Math.min(63, mod.tl >> 1);  // Scale 0-127 to 0-63
      engine.write(chip, 0x02, ((mod.ksl & 3) << 6) | (modTL & 0x3F));

      // 0x03: Carrier waveform(4), Modulator waveform(3), FB(1-3), unused(0)
      // OPLL only has 2 waveforms: 0=sine, 1=half-sine
      const carWs = (car.ws ?? 0) & 1;
      const modWs = (mod.ws ?? 0) & 1;
      engine.write(chip, 0x03, (carWs << 4) | (modWs << 3) | ((config.feedback & 7) << 0));

      // 0x04: Modulator AR(4-7), DR(0-3)
      engine.write(chip, 0x04, ((mod.ar & 0x0F) << 4) | (mod.dr & 0x0F));

      // 0x05: Carrier AR(4-7), DR(0-3)
      engine.write(chip, 0x05, ((car.ar & 0x0F) << 4) | (car.dr & 0x0F));

      // 0x06: Modulator SL(4-7), RR(0-3)
      engine.write(chip, 0x06, ((mod.sl & 0x0F) << 4) | (mod.rr & 0x0F));

      // 0x07: Carrier SL(4-7), RR(0-3)
      engine.write(chip, 0x07, ((car.sl & 0x0F) << 4) | (car.rr & 0x0F));

      console.log(`[mapOPLL] User instrument: mod.mult=${mod.mult}, car.mult=${car.mult}, fb=${config.feedback}`);
    }

    engine.write(chip, 0x30 + channel, ((instrument & 0x0F) << 4) | (volume & 0x0F));

    // Ensure rhythm mode is off
    engine.write(chip, 0x0E, 0x00);

    console.log(`[mapOPLL] channel=${channel}, instrument=${instrument}, volume=${volume}`);
  }

  /**
   * Map OPNA (YM2608) registers - uses same FM core as OPN2
   * Reference: ym2608.cpp reset()
   */
  public static mapOPNA(engine: FurnaceChipEngine, channel: number, config: FurnaceConfig): void {
    const chip = FurnaceChipType.OPNA;
    const part = channel < 3 ? 0 : 1;
    const chanOffset = (channel % 3);
    const regBase = part === 0 ? 0x000 : 0x100;

    // === INIT REGISTERS ===
    engine.write(chip, 0x22, 0x08);   // LFO enable (same as OPN2)
    engine.write(chip, 0x29, 0x9F);   // IRQ enable / prescaler
    engine.write(chip, 0x101, 0x3F);  // ADPCM-A master volume

    // === FM REGISTERS (same as OPN2) ===
    // Algorithm & Feedback
    const b0Val = ((config.feedback & 7) << 3) | (config.algorithm & 7);
    engine.write(chip, regBase | (0xB0 + chanOffset), b0Val);

    // Panning + AMS + FMS
    const ams = config.ams ?? 0;
    const fms = config.fms ?? 0;
    const b4Val = 0xC0 | ((ams & 3) << 4) | (fms & 7);
    engine.write(chip, regBase | (0xB4 + chanOffset), b4Val);

    // Operator parameters - same slot mapping as OPN2
    const opOffsets = [0x00, 0x08, 0x04, 0x0C];

    config.operators.forEach((op: FurnaceOperatorConfig, i: number) => {
      const opOff = opOffsets[i] + chanOffset;

      // DT + MULT
      const dtNative = this.furnaceDtToOPN2(op.dt);
      engine.write(chip, regBase | (0x30 + opOff), ((dtNative & 7) << 4) | (op.mult & 0x0F));

      // Total Level
      engine.write(chip, regBase | (0x40 + opOff), op.tl & 0x7F);

      // RS + AR
      engine.write(chip, regBase | (0x50 + opOff), ((op.rs & 3) << 6) | (op.ar & 0x1F));

      // AM + DR
      engine.write(chip, regBase | (0x60 + opOff), (op.am ? 0x80 : 0) | (op.dr & 0x1F));

      // D2R
      engine.write(chip, regBase | (0x70 + opOff), op.d2r & 0x1F);

      // SL + RR
      engine.write(chip, regBase | (0x80 + opOff), ((op.sl & 0x0F) << 4) | (op.rr & 0x0F));

      // SSG-EG
      engine.write(chip, regBase | (0x90 + opOff), op.ssg & 0x0F);
    });

    console.log(`[mapOPNA] channel=${channel}, algorithm=${config.algorithm}, feedback=${config.feedback}, operators=${config.operators.length}`);
  }

  /**
   * Map OPNB (YM2610/YM2610B) registers
   * Reference: ym2610.cpp reset()
   */
  public static mapOPNB(engine: FurnaceChipEngine, channel: number, config: FurnaceConfig): void {
    const chip = FurnaceChipType.OPNB;  // Use OPNB chip, not OPNA!
    const part = channel < 3 ? 0 : 1;
    const chanOffset = (channel % 3);
    const regBase = part === 0 ? 0x000 : 0x100;

    // === INIT REGISTERS (YM2610 specific) ===
    // Reference: ym2610.cpp reset()
    engine.write(chip, 0x22, 0x00);   // LFO off (YM2610 default)
    // Note: YM2610 doesn't have 0x29 prescaler like YM2608

    // === FM REGISTERS (same as OPN2/OPNA) ===
    const b0Val = ((config.feedback & 7) << 3) | (config.algorithm & 7);
    engine.write(chip, regBase | (0xB0 + chanOffset), b0Val);

    const ams = config.ams ?? 0;
    const fms = config.fms ?? 0;
    const b4Val = 0xC0 | ((ams & 3) << 4) | (fms & 7);
    engine.write(chip, regBase | (0xB4 + chanOffset), b4Val);

    const opOffsets = [0x00, 0x08, 0x04, 0x0C];

    config.operators.forEach((op: FurnaceOperatorConfig, i: number) => {
      const opOff = opOffsets[i] + chanOffset;

      const dtNative = this.furnaceDtToOPN2(op.dt);
      engine.write(chip, regBase | (0x30 + opOff), ((dtNative & 7) << 4) | (op.mult & 0x0F));
      engine.write(chip, regBase | (0x40 + opOff), op.tl & 0x7F);
      engine.write(chip, regBase | (0x50 + opOff), ((op.rs & 3) << 6) | (op.ar & 0x1F));
      engine.write(chip, regBase | (0x60 + opOff), (op.am ? 0x80 : 0) | (op.dr & 0x1F));
      engine.write(chip, regBase | (0x70 + opOff), op.d2r & 0x1F);
      engine.write(chip, regBase | (0x80 + opOff), ((op.sl & 0x0F) << 4) | (op.rr & 0x0F));
      engine.write(chip, regBase | (0x90 + opOff), op.ssg & 0x0F);
    });

    console.log(`[mapOPNB] channel=${channel}, algorithm=${config.algorithm}, feedback=${config.feedback}, operators=${config.operators.length}`);
  }

  /**
   * Map VRC6 registers
   * Reference: vrc6.cpp reset()
   */
  public static mapVRC6(engine: FurnaceChipEngine, _channel: number, _config: FurnaceConfig): void {
    const chip = FurnaceChipType.VRC6;
    // Reference: vrc6.cpp line 217-219
    engine.write(chip, 0x9003, 0x00);  // Control register (halt off)
  }

  /**
   * Map N163 registers
   * Reference: n163.cpp reset()
   */
  public static mapN163(engine: FurnaceChipEngine, _channel: number, _config: FurnaceConfig): void {
    const chip = FurnaceChipType.N163;
    // Reference: n163.cpp line 406
    // 0x7F = sound enable + channel count
    // bits 4-6 = (numChannels - 1), so 0x00 = 1 channel (single-channel mode)
    engine.write(chip, 0x7F, 0x00);  // Single channel mode
  }

  /**
   * Map SCC/SCC+ registers
   * Reference: scc.cpp reset()
   */
  public static mapSCC(engine: FurnaceChipEngine, _channel: number, _config: FurnaceConfig): void {
    const chip = FurnaceChipType.SCC;
    // Reference: scc.cpp line 303-307
    // Set all channel volumes to max
    for (let i = 0; i < 5; i++) {
      engine.write(chip, 0x8A + i, 0x0F);  // Volume registers
    }
    // Enable all channels
    engine.write(chip, 0x8F, 0x1F);  // Channel enable
  }

  /**
   * Map FDS registers
   * Reference: fds.cpp reset()
   */
  public static mapFDS(engine: FurnaceChipEngine, _channel: number, _config: FurnaceConfig): void {
    const chip = FurnaceChipType.FDS;
    // Reference: fds.cpp lines 234-237
    engine.write(chip, 0x4023, 0x00);  // Disable first
    engine.write(chip, 0x4023, 0x83);  // Enable (write enable + sound enable)
    engine.write(chip, 0x4089, 0x00);  // Wave write disable, volume = 0
  }

  /**
   * Map MMC5 registers
   * Reference: mmc5.cpp reset()
   */
  public static mapMMC5(engine: FurnaceChipEngine, _channel: number, _config: FurnaceConfig): void {
    const chip = FurnaceChipType.MMC5;
    // Reference: mmc5.cpp lines 188-189
    engine.write(chip, 0x5015, 0x03);  // Enable both pulse channels
    engine.write(chip, 0x5010, 0x00);  // PCM mode off
  }

  /**
   * Map TIA registers
   * Reference: tia.cpp reset()
   */
  public static mapTIA(engine: FurnaceChipEngine, _channel: number, _config: FurnaceConfig): void {
    const chip = FurnaceChipType.TIA;
    // Reference: tia.cpp - TIA is very simple, mostly self-initializing
    // Ensure volume is max
    engine.write(chip, 0x19, 0x0F);  // AUDV0 (ch0 volume)
    engine.write(chip, 0x1A, 0x0F);  // AUDV1 (ch1 volume)
  }

  /**
   * Map SAA1099 registers
   * Reference: saa.cpp reset()
   */
  public static mapSAA(engine: FurnaceChipEngine, _channel: number, _config: FurnaceConfig): void {
    const chip = FurnaceChipType.SAA;
    // Reference: saa.cpp lines 307-310
    // Reset sequence
    engine.write(chip, 0x1C, 0x02);  // Reset (set reset bit)
    engine.write(chip, 0x1C, 0x01);  // Release reset (sound enable)
  }

  /**
   * Map WonderSwan registers
   * Reference: swan.cpp reset()
   */
  public static mapSWAN(engine: FurnaceChipEngine, _channel: number, _config: FurnaceConfig): void {
    const chip = FurnaceChipType.SWAN;
    // Reference: swan.cpp lines 324-330
    // Set all channel volumes to max
    for (let i = 0; i < 4; i++) {
      engine.write(chip, 0x08 + i, 0xFF);  // Channel volumes (L+R)
    }
    engine.write(chip, 0x0F, 0x00);   // Sound DMA control off
    engine.write(chip, 0x11, 0x0F);   // Speaker enable, headphone output
  }

  /**
   * Map OKI MSM6295 registers
   * Reference: msm6295.cpp reset()
   */
  public static mapOKI(engine: FurnaceChipEngine, _channel: number, _config: FurnaceConfig): void {
    const chip = FurnaceChipType.OKI;
    // Reference: msm6295.cpp line 230
    engine.write(chip, 12, 0x00);  // Rate select (normal speed)
  }

  /**
   * Map ES5506 registers
   * Reference: es5506.cpp reset()
   */
  public static mapES5506(_engine: FurnaceChipEngine, _channel: number, _config: FurnaceConfig): void {
    // Reference: es5506.cpp - complex paging system
    // Minimal init - ES5506 has 32 voices with page-based registers
    // Most setup happens per-voice
    // No global init registers needed
  }

  /**
   * Map OPZ (TX81Z) registers
   * Reference: tx81z.cpp reset()
   */
  public static mapOPZ(engine: FurnaceChipEngine, channel: number, config: FurnaceConfig): void {
    const chip = FurnaceChipType.OPZ;
    const chan = channel & 7;

    // === INIT REGISTERS (from tx81z.cpp reset()) ===
    // Reference: tx81z.cpp lines 486-488
    engine.write(chip, 0x01, 0x02);  // LFO reset off
    engine.write(chip, 0x18, 0x00);  // LFO freq = 0
    engine.write(chip, 0x19, 0x7F);  // AMD = max
    engine.write(chip, 0x19, 0xFF);  // PMD = max (bit 7 = 1)

    // OPZ uses same register layout as OPM
    // 0x20: RL (7-6), FB (5-3), ALG (2-0)
    const c20Val = 0xC0 | ((config.feedback & 7) << 3) | (config.algorithm & 7); // Default L+R
    engine.write(chip, 0x20 + chan, c20Val);

    // 0x38: PMS (4-6), AMS (0-1) per channel
    const pms = config.fms ?? 0;
    const amsPerChan = config.ams ?? 0;
    engine.write(chip, 0x38 + chan, ((pms & 7) << 4) | (amsPerChan & 3));

    const opOffsets = [0x00, 0x10, 0x08, 0x18]; // OPM/OPZ Op order

    config.operators.forEach((op: FurnaceOperatorConfig, i: number) => {
      const opOff = opOffsets[i] + chan;

      // 0x40: DT1 (4-6), MULT (0-3)
      const dtNative = this.furnaceDtToOPN2(op.dt ?? 0);
      engine.write(chip, 0x40 + opOff, ((dtNative & 7) << 4) | ((op.mult ?? 1) & 0x0F));

      // 0x60: TL (0-6)
      engine.write(chip, 0x60 + opOff, (op.tl ?? 0) & 0x7F);

      // 0x80: KS (6-7), AR (0-4)
      engine.write(chip, 0x80 + opOff, (((op.rs ?? 0) & 3) << 6) | ((op.ar ?? 31) & 0x1F));

      // 0xA0: AMS-EN (7), DR (0-4)
      engine.write(chip, 0xA0 + opOff, (op.am ? 0x80 : 0) | ((op.dr ?? 0) & 0x1F));

      // 0xC0: DT2 (6-7), D2R (0-4)
      engine.write(chip, 0xC0 + opOff, (((op.dt2 ?? 0) & 3) << 6) | ((op.d2r ?? 0) & 0x1F));

      // 0xE0: SL (4-7), RR (0-3)
      engine.write(chip, 0xE0 + opOff, (((op.sl ?? 0) & 0x0F) << 4) | ((op.rr ?? 0) & 0x0F));
    });
  }

  /**
   * Map Y8950 (MSX-AUDIO) registers
   * Y8950 is OPL with ADPCM - same 2-operator FM as OPL2
   * Reference: opl.cpp reset() with Y8950 variant
   */
  public static mapY8950(engine: FurnaceChipEngine, channel: number, config: FurnaceConfig): void {
    const chip = FurnaceChipType.Y8950;

    // === INIT REGISTERS ===
    engine.write(chip, 0x01, 0x20);   // Waveform select enable
    engine.write(chip, 0x04, 0x00);   // Timer control
    engine.write(chip, 0x08, 0x00);   // CSM/Keyboard split

    // Y8950 has 9 FM channels (like OPL2), no secondary bank
    const chanOffset = channel % 9;

    // Channel Register (0xC0): FB (1-3), ALG (0) - Y8950 has no panning bits
    const c0Val = ((config.feedback & 7) << 1) | (config.algorithm & 1);
    engine.write(chip, 0xC0 + chanOffset, c0Val);

    // Operator Slots - same mapping as OPL2/3
    const slots = this.getOPL3Slots(chanOffset);

    config.operators.slice(0, 2).forEach((op: FurnaceOperatorConfig, i: number) => {
      const slotOff = slots[i];

      // 0x20: AM (7), VIB (6), EG-TYP/Sustain (5), KSR (4), MULT (0-3)
      const v20 = (op.am ? 0x80 : 0) |
                  ((op.vib ?? false) ? 0x40 : 0) |
                  ((op.sus ?? false) ? 0x20 : 0) |
                  ((op.ksr ?? false) ? 0x10 : 0) |
                  ((op.mult ?? 1) & 0x0F);
      engine.write(chip, 0x20 + slotOff, v20);

      // 0x40: KSL (6-7), TL (0-5)
      engine.write(chip, 0x40 + slotOff, (((op.ksl ?? 0) & 3) << 6) | ((op.tl ?? 0) & 0x3F));

      // 0x60: AR (4-7), DR (0-3)
      engine.write(chip, 0x60 + slotOff, (((op.ar ?? 15) >> 1) << 4) | ((op.dr ?? 0) >> 1));

      // 0x80: SL (4-7), RR (0-3)
      engine.write(chip, 0x80 + slotOff, (((op.sl ?? 0) & 0x0F) << 4) | ((op.rr ?? 0) & 0x0F));

      // 0xE0: Waveform Select (0-3 for Y8950)
      engine.write(chip, 0xE0 + slotOff, (op.ws ?? 0) & 0x03);
    });
  }

  /**
   * Map OPL4 (YMF278B) registers
   * OPL4 FM section is OPL3-compatible (18 2-op channels)
   * Reference: opl.cpp reset() with OPL4 variant
   */
  public static mapOPL4(engine: FurnaceChipEngine, channel: number, config: FurnaceConfig): void {
    const chip = FurnaceChipType.OPL4;

    // === INIT REGISTERS ===
    // Reference: opl.cpp line 1895-1896
    engine.write(chip, 0x105, 0x03);  // OPL3 + OPL4 enable
    engine.write(chip, 0x202, 0x10);  // Wave ROM enable
    engine.write(chip, 0x01, 0x20);   // Waveform select enable

    // OPL4 FM has 18 channels like OPL3
    const part = channel < 9 ? 0x000 : 0x100;
    const chanOffset = channel % 9;

    // Channel Register (0xC0): CHD/CHC/CHB/CHA (4-7), FB (1-3), ALG (0)
    const c0Val = 0x30 | ((config.feedback & 7) << 1) | (config.algorithm & 1);
    engine.write(chip, part | (0xC0 + chanOffset), c0Val);

    // Operator Slots
    const slots = this.getOPL3Slots(chanOffset);

    config.operators.slice(0, 2).forEach((op: FurnaceOperatorConfig, i: number) => {
      const slotOff = part | slots[i];

      // 0x20: AM (7), VIB (6), EG-TYP/Sustain (5), KSR (4), MULT (0-3)
      const v20 = (op.am ? 0x80 : 0) |
                  ((op.vib ?? false) ? 0x40 : 0) |
                  ((op.sus ?? false) ? 0x20 : 0) |
                  ((op.ksr ?? false) ? 0x10 : 0) |
                  ((op.mult ?? 1) & 0x0F);
      engine.write(chip, 0x20 + slotOff, v20);

      // 0x40: KSL (6-7), TL (0-5)
      engine.write(chip, 0x40 + slotOff, (((op.ksl ?? 0) & 3) << 6) | ((op.tl ?? 0) & 0x3F));

      // 0x60: AR (4-7), DR (0-3)
      engine.write(chip, 0x60 + slotOff, (((op.ar ?? 15) >> 1) << 4) | ((op.dr ?? 0) >> 1));

      // 0x80: SL (4-7), RR (0-3)
      engine.write(chip, 0x80 + slotOff, (((op.sl ?? 0) & 0x0F) << 4) | ((op.rr ?? 0) & 0x0F));

      // 0xE0: Waveform Select (0-7)
      engine.write(chip, 0xE0 + slotOff, (op.ws ?? 0) & 0x07);
    });
  }

  /**
   * Map Sega PCM registers
   * Reference: segapcm.cpp reset()
   */
  public static mapSEGAPCM(engine: FurnaceChipEngine, _channel: number, _config: FurnaceConfig): void {
    const chip = FurnaceChipType.SEGAPCM;
    // Reference: segapcm.cpp lines 193-198
    // Initialize all 16 channels
    for (let i = 0; i < 16; i++) {
      const base = i << 3;
      engine.write(chip, 0x86 + base, 3);      // Loop off, enable
      engine.write(chip, 0x02 + base, 0x7F);   // Volume left
      engine.write(chip, 0x03 + base, 0x7F);   // Volume right
    }
  }

  /**
   * Map YMZ280B registers
   * Reference: ymz280b.cpp reset()
   */
  public static mapYMZ280B(engine: FurnaceChipEngine, _channel: number, _config: FurnaceConfig): void {
    const chip = FurnaceChipType.YMZ280B;
    // Reference: ymz280b.cpp lines 294-298
    engine.write(chip, 0xFF, 0x80);  // Enable
    // Initialize channel volumes
    for (let i = 0; i < 8; i++) {
      engine.write(chip, 0x02 + i * 4, 255);  // Volume max
      engine.write(chip, 0x03 + i * 4, 8);    // Pan center
    }
  }

  /**
   * Map RF5C68 registers
   * Reference: rf5c68.cpp reset()
   */
  public static mapRF5C68(engine: FurnaceChipEngine, _channel: number, _config: FurnaceConfig): void {
    const chip = FurnaceChipType.RF5C68;
    // Reference: rf5c68.cpp lines 189-194
    engine.write(chip, 0x08, 0xFF);  // Channel key-off all
    // Initialize channel volumes
    for (let i = 0; i < 8; i++) {
      engine.write(chip, 0x00 + i, 0x00);  // ENV (volume envelope)
      engine.write(chip, 0x01 + i, 0x00);  // PAN
    }
    engine.write(chip, 0x08, 0x00);  // Enable playback
  }

  /**
   * Map GA20 registers
   * Reference: ga20.cpp reset()
   */
  public static mapGA20(engine: FurnaceChipEngine, _channel: number, _config: FurnaceConfig): void {
    const chip = FurnaceChipType.GA20;
    // Reference: ga20.cpp lines 137-140
    for (let i = 0; i < 4; i++) {
      engine.write(chip, 0x05 + i * 8, 0x00);  // Key off
      engine.write(chip, 0x06 + i * 8, 0x00);  // Volume = 0
    }
  }

  /**
   * Map C140 registers
   * Reference: c140.cpp reset()
   */
  public static mapC140(engine: FurnaceChipEngine, _channel: number, _config: FurnaceConfig): void {
    const chip = FurnaceChipType.C140;
    // Reference: c140.cpp lines 286-290
    for (let i = 0; i < 24; i++) {
      engine.write(chip, 0x05 + (i << 4), 0x00);  // Volume/pan off
    }
  }

  /**
   * Map QSound registers
   * Reference: qsound.cpp reset()
   */
  public static mapQSOUND(engine: FurnaceChipEngine, _channel: number, _config: FurnaceConfig): void {
    const chip = FurnaceChipType.QSOUND;
    // Reference: qsound.cpp lines 339-342
    // QSound uses register-pair writes (data, address)
    // Echo/reverb setup
    engine.write(chip, 0x00, 0x00);  // Reset state
  }

  /**
   * Map VIC registers
   * Reference: vic20.cpp reset()
   */
  public static mapVIC(engine: FurnaceChipEngine, _channel: number, _config: FurnaceConfig): void {
    const chip = FurnaceChipType.VIC;
    // Reference: vic20.cpp line 173
    engine.write(chip, 14, 15);  // Volume = max
  }

  /**
   * Map TED registers
   * Reference: ted.cpp reset()
   */
  public static mapTED(engine: FurnaceChipEngine, _channel: number, _config: FurnaceConfig): void {
    const chip = FurnaceChipType.TED;
    // Reference: ted.cpp line 148
    engine.write(chip, 0x11, 15);  // Volume = max
  }

  /**
   * Map Supervision registers
   * Reference: supervision.cpp reset()
   */
  public static mapSUPERVISION(_engine: FurnaceChipEngine, _channel: number, _config: FurnaceConfig): void {
    // Reference: supervision.cpp - uses supervision_sound_reset()
    // Minimal init needed - chip self-initializes
  }

  /**
   * Map VERA registers
   * Reference: vera.cpp reset()
   */
  public static mapVERA(engine: FurnaceChipEngine, _channel: number, _config: FurnaceConfig): void {
    const chip = FurnaceChipType.VERA;
    // Reference: vera.cpp lines 319-324
    // VERA audio is at 0x1F9C0-0x1F9FF
    for (let i = 0; i < 16; i++) {
      // Each voice has 4 registers, +2 is pan register
      engine.write(chip, 0x1F9C0 + i * 4 + 2, 0x03);  // Pan = L+R
    }
  }

  /**
   * Map SM8521 registers
   * Reference: sm8521.cpp reset()
   */
  public static mapSM8521(engine: FurnaceChipEngine, _channel: number, _config: FurnaceConfig): void {
    const chip = FurnaceChipType.SM8521;
    // Reference: sm8521.cpp line 161
    engine.write(chip, 0x40, 0x80);  // SGC init (enable)
  }

  /**
   * Map Bubble System WSG registers
   * Reference: bubsyswsg.cpp reset()
   */
  public static mapBUBBLE(_engine: FurnaceChipEngine, _channel: number, _config: FurnaceConfig): void {
    // Reference: bubsyswsg.cpp - uses k005289.reset()
    // Minimal initialization - chip self-initializes via reset
  }

  /**
   * Map K007232 registers
   * Reference: k007232.cpp reset()
   */
  public static mapK007232(engine: FurnaceChipEngine, _channel: number, _config: FurnaceConfig): void {
    const chip = FurnaceChipType.K007232;
    // Reference: k007232.cpp - uses k007232.reset()
    // Initialize volumes
    engine.write(chip, 0x0C, 0xFF);  // Volume ch0
    engine.write(chip, 0x0D, 0x00);  // Volume ch1 (cross-fade)
  }

  /**
   * Map K053260 registers
   * Reference: k053260.cpp reset()
   */
  public static mapK053260(engine: FurnaceChipEngine, _channel: number, _config: FurnaceConfig): void {
    const chip = FurnaceChipType.K053260;
    // Reference: k053260.cpp lines 196-198
    engine.write(chip, 0x28, 0x00);  // Key off all
    engine.write(chip, 0x2F, 0x02);  // Enable sound
  }

  /**
   * Map X1-010 registers
   * Reference: x1_010.cpp reset()
   */
  public static mapX1_010(engine: FurnaceChipEngine, _channel: number, _config: FurnaceConfig): void {
    const chip = FurnaceChipType.X1_010;
    // Reference: x1_010.cpp lines 337-340
    for (let i = 0; i < 16; i++) {
      engine.write(chip, i * 8, 0x00);  // Pan/control = 0
    }
  }

  /**
   * Map UPD1771 registers
   * Reference: scvtone.cpp reset()
   */
  public static mapUPD1771(_engine: FurnaceChipEngine, _channel: number, _config: FurnaceConfig): void {
    // Reference: scvtone.cpp - uses device_reset()
    // Minimal init - chip self-initializes via device reset
  }

  /**
   * Map T6W28 registers
   * Reference: t6w28.cpp reset()
   */
  public static mapT6W28(engine: FurnaceChipEngine, _channel: number, _config: FurnaceConfig): void {
    const chip = FurnaceChipType.T6W28;
    // Reference: t6w28.cpp line 127
    engine.write(chip, 1, 0xE7);  // Noise mode
  }

  /**
   * Map Virtual Boy registers
   * Reference: vb.cpp reset()
   */
  public static mapVB(engine: FurnaceChipEngine, _channel: number, _config: FurnaceConfig): void {
    const chip = FurnaceChipType.VB;
    // Reference: vb.cpp - chWrite(c,a,v) = 0x400 + (c<<6) + (a<<2)
    // Registers: 0=INT, 1=LRV, 2=FQL, 3=FQH, 4=EV0, 5=EV1, 6=RAM
    for (let i = 0; i < 6; i++) {
      const chanBase = 0x400 + (i * 64);
      engine.write(chip, chanBase + 0x04, 0xFF);  // LRV (reg 1) - Pan L+R
      engine.write(chip, chanBase + 0x10, 0xF0);  // EV0 (reg 4) - Volume max, envelope off
    }
  }

  /**
   * Map Lynx (Mikey) registers
   * Reference: lynx.cpp reset()
   */
  public static mapLYNX(engine: FurnaceChipEngine, _channel: number, _config: FurnaceConfig): void {
    const chip = FurnaceChipType.LYNX;
    // Reference: Mikey.cpp - stereo bits are INVERTED (0 = enabled, 1 = disabled)
    // Bits 0-3: left enable for ch 0-3 (0=on)
    // Bits 4-7: right enable for ch 0-3 (0=on)
    engine.write(chip, 0x50, 0x00);  // Enable all channels on both L+R
  }

  private static getOPL3Slots(chan: number): [number, number] {
    const slot1 = [0x00, 0x01, 0x02, 0x08, 0x09, 0x0A, 0x10, 0x11, 0x12];
    const slot2 = [0x03, 0x04, 0x05, 0x0B, 0x0C, 0x0D, 0x13, 0x14, 0x15];
    return [slot1[chan], slot2[chan]];
  }

  private static furnaceDtToOPN2(dt: number): number {
    // Furnace DT: -3 to +3
    // OPN2 DT: 0-3 (pos), 4-7 (neg)
    if (dt >= 0) return dt & 3;
    return (4 + Math.abs(dt)) & 7;
  }

  /**
   * Upload custom wavetable data to chip RAM
   */
  public static uploadWavetable(engine: FurnaceChipEngine, chipType: number, data: number[]): void {
    // chipType uses FurnaceChipType enum values (0-44)
    switch (chipType) {
      case FurnaceChipType.GB: // Game Boy (5)
        // GB Wave RAM is 16 bytes (32 4-bit samples) at 0x30
        for (let i = 0; i < 16; i++) {
          const high = (data[i * 2] || 0) & 0x0F;
          const low = (data[i * 2 + 1] || 0) & 0x0F;
          engine.write(FurnaceChipType.GB, 0x30 + i, (high << 4) | low);
        }
        break;

      case FurnaceChipType.SCC: // SCC (7)
        // SCC has 5 wave slots of 32 bytes each at 0x00-0x9F
        // For simplicity, we upload to the first 32 bytes
        for (let i = 0; i < 32; i++) {
          engine.write(FurnaceChipType.SCC, i, data[i] & 0xFF);
        }
        break;

      case FurnaceChipType.N163: // N163 (8)
        // N163 has 128 bytes of RAM accessed via Addr/Data registers
        engine.write(FurnaceChipType.N163, 0xE000, 0x80); // Set addr 0 with auto-increment
        for (let i = 0; i < Math.min(128, data.length); i++) {
          engine.write(FurnaceChipType.N163, 0xF800, data[i] & 0xFF);
        }
        break;

      case FurnaceChipType.PCE: // PC Engine (6)
        // PCE has 32 bytes of wave RAM per channel
        for (let i = 0; i < 32; i++) {
          engine.write(FurnaceChipType.PCE, 0x06, data[i] & 0x1F);
        }
        break;

      case FurnaceChipType.SWAN: // WonderSwan (19)
        // WonderSwan wave RAM
        for (let i = 0; i < 16; i++) {
          const high = (data[i * 2] || 0) & 0x0F;
          const low = (data[i * 2 + 1] || 0) & 0x0F;
          engine.write(FurnaceChipType.SWAN, 0x40 + i, (high << 4) | low);
        }
        break;

      case FurnaceChipType.BUBBLE: // Bubble System (38)
        // Bubble System has 2 channels of 32-byte wavetables
        // Upload same wavetable to both channels for consistent sound
        const bubbleWave = new Uint8Array(data.slice(0, 32));
        engine.setWavetable(FurnaceChipType.BUBBLE, 0, bubbleWave);
        engine.setWavetable(FurnaceChipType.BUBBLE, 1, bubbleWave);
        break;

      case FurnaceChipType.X1_010: // X1-010 (41)
        // X1-010 wavetable RAM: 128 bytes per channel at 0x1000+(waveBank<<11)+(chan<<7)
        // Reference: x1_010.cpp waveWrite macro: (v-128)&0xff
        // X1-010 uses signed 8-bit samples: -128 to +127 (stored as 0x80 to 0x7F)
        // IMPORTANT: Stretch/interpolate wavetable to 128 samples (don't repeat!)
        // Detect if input is signed (-32 to +31) or unsigned (0-15)
        const isSigned = data.some(v => v < 0);
        for (let ch = 0; ch < 16; ch++) {
          const waveBase = 0x1000 | (ch << 7);
          for (let i = 0; i < 128; i++) {
            // Linear interpolation to stretch wavetable to 128 samples
            const srcPos = (i * data.length) / 128;
            const srcIdx = Math.floor(srcPos);
            const frac = srcPos - srcIdx;
            const sample1 = data[srcIdx] || 0;
            const sample2 = data[(srcIdx + 1) % data.length] || 0;
            const interpolated = sample1 + (sample2 - sample1) * frac;
            let val: number;
            if (isSigned) {
              // Signed input (-32 to +31): scale to -128 to +127
              val = Math.round(interpolated * 4) & 0xff;
            } else {
              // Unsigned input (0-15): scale to 0-255, then center
              val = ((interpolated * 17) - 128) & 0xff;
            }
            engine.write(FurnaceChipType.X1_010, waveBase + i, val);
          }
        }
        break;
    }
  }

  /**
   * Load a Furnace wavetable preset and upload to chip
   * @param engine FurnaceChipEngine instance
   * @param chipType Chip type from FurnaceChipType enum
   * @param wavetableId ID from furnaceWavetablePresets (e.g., '32x16saw', '32x32piano')
   * @returns true if wavetable was loaded successfully
   */
  public static loadWavetablePreset(
    engine: FurnaceChipEngine,
    chipType: number,
    wavetableId: string
  ): boolean {
    // Map chip type to wavetable format
    let chipFormat: 'gb' | 'pce' | 'n163' | 'scc' | 'swan' | 'vb' | 'lynx';

    switch (chipType) {
      case FurnaceChipType.GB:
        chipFormat = 'gb';
        break;
      case FurnaceChipType.PCE:
        chipFormat = 'pce';
        break;
      case FurnaceChipType.N163:
        chipFormat = 'n163';
        break;
      case FurnaceChipType.SCC:
        chipFormat = 'scc';
        break;
      case FurnaceChipType.SWAN:
        chipFormat = 'swan';
        break;
      case FurnaceChipType.VB:
        chipFormat = 'vb';
        break;
      case FurnaceChipType.LYNX:
        chipFormat = 'lynx';
        break;
      default:
        console.warn(`[FurnaceRegisterMapper] No wavetable support for chip type ${chipType}`);
        return false;
    }

    const waveData = getWavetableForChip(wavetableId, chipFormat);
    if (!waveData) {
      console.warn(`[FurnaceRegisterMapper] Wavetable preset not found: ${wavetableId}`);
      return false;
    }

    this.uploadWavetable(engine, chipType, waveData);
    return true;
  }

  /**
   * Get list of recommended wavetable presets for a chip type
   * @param chipType Chip type from FurnaceChipType enum
   * @returns Array of wavetable preset IDs suitable for the chip
   */
  public static getRecommendedWavetables(chipType: number): string[] {
    // Different chips work better with different bit depths
    switch (chipType) {
      case FurnaceChipType.GB:
      case FurnaceChipType.N163:
      case FurnaceChipType.SWAN:
        // 4-bit chips work best with 32x16 wavetables
        return [
          '32x16saw', '32x16FunkyLead', '32x16NamcoBass', '32x16brass',
          '32x16clarinet', '32x16flute', '32x16guitar', '32x16opllpiano',
          '32x16synthbass', '32x16trumpet', '32x16voice'
        ];

      case FurnaceChipType.PCE:
      case FurnaceChipType.VB:
        // 5-bit chips work best with 32x32 wavetables
        return [
          '32x32piano', '32x32brass', '32x32flute', '32x32lead',
          '32x32organ', '32x32strings', '32x32synthbass', '32x32trumpet',
          '32x32voice', '32x32bell', '32x32choir', '32x32vibraphone'
        ];

      case FurnaceChipType.SCC:
        // SCC is 8-bit signed, but 32x32 presets convert well
        return [
          '32x32piano', '32x32brass', '32x32lead', '32x32organ',
          '32x32synthbass', '32x32trumpet', '32x32strings', '32x32flute'
        ];

      case FurnaceChipType.LYNX:
        // Lynx is 8-bit, can use larger wavetables
        return [
          '128x256bass', '128x256chime', '128x256lead',
          '32x32piano', '32x32brass', '32x32lead', '32x32synthbass'
        ];

      default:
        return [];
    }
  }
}
