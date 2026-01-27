import type { FurnaceConfig, FurnaceOperatorConfig } from '@typedefs/instrument';
import { FurnaceChipEngine, FurnaceChipType } from '@engine/chips/FurnaceChipEngine';

/**
 * FurnaceRegisterMapper
 * Translates Furnace instrument parameters into raw chip registers.
 * Currently supports OPN2 (Genesis) and OPM (Arcade).
 */
export class FurnaceRegisterMapper {
  /**
   * Map OPN2 (YM2612) registers for a single channel
   * @param engine FurnaceChipEngine instance
   * @param channel FM channel (0-5)
   * @param config Furnace instrument config
   */
  public static mapOPN2(engine: FurnaceChipEngine, channel: number, config: FurnaceConfig): void {
    const chip = FurnaceChipType.OPN2;
    const part = channel < 3 ? 0 : 1;
    const chanOffset = (channel % 3);
    const regBase = part === 0 ? 0x000 : 0x100;

    // 1. Map Global (Algorithm & Feedback)
    // Register 0xB0: FB (bits 3-5), ALG (bits 0-2)
    const b0Val = ((config.feedback & 7) << 3) | (config.algorithm & 7);
    engine.write(chip, regBase | (0xB0 + chanOffset), b0Val);

    // 2. Map Operators
    const opOffsets = [0x00, 0x08, 0x04, 0x0C]; // Op 1, 3, 2, 4 order in OPN2
    
    config.operators.forEach((op: FurnaceOperatorConfig, i: number) => {
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

      // 0x70: D2R (bits 0-4) - Secondary decay/Sustain rate
      // Furnace sl maps to D2R roughly
      engine.write(chip, regBase | (0x70 + opOff), op.dr & 0x1F); // Simplified

      // 0x80: SL (bits 4-7), RR (bits 0-3)
      engine.write(chip, regBase | (0x80 + opOff), ((op.sl & 0x0F) << 4) | (op.rr & 0x0F));

      // 0x90: SSG-EG (bits 0-3)
      engine.write(chip, regBase | (0x90 + opOff), op.ssg & 0x0F);
    });
  }

  /**
   * Map OPM (YM2151) registers
   */
  public static mapOPM(engine: FurnaceChipEngine, channel: number, config: FurnaceConfig): void {
    const chip = FurnaceChipType.OPM;
    const chan = channel & 7;

    // 0x20: RL (7), FB (3-5), ALG (0-2)
    const c20Val = 0xC0 | ((config.feedback & 7) << 3) | (config.algorithm & 7); // Default L+R
    engine.write(chip, 0x20 + chan, c20Val);

    const opOffsets = [0x00, 0x10, 0x08, 0x18]; // OPM Op order

    config.operators.forEach((op: FurnaceOperatorConfig, i: number) => {
      const opOff = opOffsets[i] + chan;

      // 0x40: DT (4-6), MULT (0-3)
      const dtNative = this.furnaceDtToOPN2(op.dt);
      engine.write(chip, 0x40 + opOff, ((dtNative & 7) << 4) | (op.mult & 0x0F));

      // 0x60: TL
      engine.write(chip, 0x60 + opOff, op.tl & 0x7F);

      // 0x80: RS (6-7), AR (0-4)
      engine.write(chip, 0x80 + opOff, ((op.rs & 3) << 6) | (op.ar & 0x1F));

      // 0xA0: AM (7), DR (0-4)
      engine.write(chip, 0xA0 + opOff, (op.am ? 0x80 : 0) | (op.dr & 0x1F));

      // 0xC0: DT2 (6-7), D2R (0-4)
      engine.write(chip, 0xC0 + opOff, op.dr & 0x1F);

      // 0xE0: SL (4-7), RR (0-3)
      engine.write(chip, 0xE0 + opOff, ((op.sl & 0x0F) << 4) | (op.rr & 0x0F));
    });
  }

  /**
   * Map OPL3 (YMF262) registers
   */
  public static mapOPL3(engine: FurnaceChipEngine, channel: number, config: FurnaceConfig): void {
    const chip = FurnaceChipType.OPL3;
    
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

      // 0x20: AM (7), VIB (6), SUSTAIN (5), KSR (4), MULT (0-3)
      const v20 = (op.am ? 0x80 : 0) | (op.mult & 0x0F); // Simplified
      engine.write(chip, 0x20 + slotOff, v20);

      // 0x40: KSL (6-7), TL (0-5)
      engine.write(chip, 0x40 + slotOff, op.tl & 0x3F);

      // 0x60: AR (4-7), DR (0-3)
      engine.write(chip, 0x60 + slotOff, ((op.ar >> 1) << 4) | (op.dr >> 1));

      // 0x80: SL (4-7), RR (0-3)
      engine.write(chip, 0x80 + slotOff, ((op.sl & 0x0F) << 4) | (op.rr & 0x0F));
    });
  }

  /**
   * Map PSG (SN76489) registers
   */
  public static mapPSG(engine: FurnaceChipEngine, channel: number, config: FurnaceConfig): void {
    const chip = FurnaceChipType.PSG;
    // PSG uses a simple 8-bit latch system
    // 1ccc vvvv -> c=channel, v=value
    
    // Volume (Attenuation) mapping: 0-15 (0 is loudest)
    // Furnace TL is 0-127, map to 0-15
    const atten = Math.min(15, Math.floor(config.operators[0].tl / 8));
    const volLatch = 0x90 | ((channel & 3) << 5) | (atten & 0x0F);
    engine.write(chip, 0, volLatch);
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
  public static uploadWavetable(engine: FurnaceChipEngine, type: number, data: number[]): void {
    const chip = this.getChipType(type);
    if (chip === undefined) return;

    switch (type) {
      case 2: // Game Boy
        // GB Wave RAM is 16 bytes (32 4-bit samples) at 0x30
        for (let i = 0; i < 16; i++) {
          const high = (data[i * 2] || 0) & 0x0F;
          const low = (data[i * 2 + 1] || 0) & 0x0F;
          engine.write(FurnaceChipType.GB, 0x30 + i, (high << 4) | low);
        }
        break;

      case 7: // SCC
        // SCC has 5 wave slots of 32 bytes each at 0x00-0x9F
        // For simplicity, we upload to the first 32 bytes
        for (let i = 0; i < 32; i++) {
          engine.write(FurnaceChipType.SCC, i, data[i] & 0xFF);
        }
        break;

      case 17: // N163
        // N163 has 128 bytes of RAM accessed via Addr/Data registers
        engine.write(FurnaceChipType.N163, 0xE000, 0x80); // Set addr 0 with auto-increment
        for (let i = 0; i < Math.min(128, data.length); i++) {
          engine.write(FurnaceChipType.N163, 0xF800, data[i] & 0xFF);
        }
        break;

      case 66: // Bubble System
        // Bubble System has 2 channels of 32-byte wavetables
        // For simplicity, we upload to the first channel (index 0)
        // Convert number array to Uint8Array for the WASM bridge
        engine.setWavetable(FurnaceChipType.BUBBLE, 0, new Uint8Array(data.slice(0, 32)));
        break;
    }
  }

  private static getChipType(type: number): number | undefined {
    switch (type) {
      case 1: return FurnaceChipType.OPN2; // DIV_INS_FM (Generic FM)
      case 2: return FurnaceChipType.GB;
      case 3: return FurnaceChipType.SID;
      case 5: return FurnaceChipType.PCE;
      case 6: return FurnaceChipType.AY;
      case 7: return FurnaceChipType.AY; // AY8930 -> AY
      case 8: return FurnaceChipType.TIA;
      case 9: return FurnaceChipType.SAA;
      case 10: return FurnaceChipType.VIC;
      case 12: return FurnaceChipType.VRC6;
      case 13: return FurnaceChipType.OPLL;
      case 14: return FurnaceChipType.OPL3; // OPL -> OPL3
      case 15: return FurnaceChipType.FDS;
      case 17: return FurnaceChipType.N163;
      case 18: return FurnaceChipType.SCC;
      case 19: return FurnaceChipType.OPZ;
      case 20: return FurnaceChipType.OPN2; // POKEY -> OPN2 (Fallback)
      case 22: return FurnaceChipType.SWAN;
      case 24: return FurnaceChipType.VERA;
      case 25: return FurnaceChipType.X1_010;
      case 26: return FurnaceChipType.VRC6; // VRC6 SAW -> VRC6
      case 27: return FurnaceChipType.ES5506;
      case 29: return FurnaceChipType.SNES;
      case 31: return FurnaceChipType.C140; // NAMCO -> C140
      case 32: return FurnaceChipType.OPL3; // OPL DRUMS -> OPL3
      case 33: return FurnaceChipType.OPM;
      case 34: return FurnaceChipType.NES;
      case 36: return FurnaceChipType.OKI; // MSM6295
      case 39: return FurnaceChipType.SEGAPCM;
      case 40: return FurnaceChipType.QSOUND;
      case 41: return FurnaceChipType.YMZ280B;
      case 42: return FurnaceChipType.RF5C68;
      case 44: return FurnaceChipType.T6W28;
      case 45: return FurnaceChipType.K007232;
      case 46: return FurnaceChipType.GA20;
      case 48: return FurnaceChipType.SM8521;
      case 50: return FurnaceChipType.K053260;
      case 52: return FurnaceChipType.TED;
      case 53: return FurnaceChipType.C140;
      case 64: return FurnaceChipType.SUPERVISION;
      case 65: return FurnaceChipType.UPD1771;
      case 66: return FurnaceChipType.BUBBLE;
      // Derived IDs or guesses for missing ones:
      // OPNA/OPNB are usually type 1 or specific if enabled.
      // If we see unknown ID, default to undefined.
      default: return undefined;
    }
  }
}
