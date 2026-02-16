/**
 * FurnaceEffectRouter - Maps tracker effect commands to Furnace DivCmd dispatch calls
 *
 * Effect code → DivCmd mappings derived directly from Furnace source:
 *   Reference Code/furnace-master/src/engine/sysDef.cpp
 *
 * Each chip has its own effectHandlerMap (pre-note-on) and postEffectHandlerMap
 * (post-note-on). Currently DEViLBOX processes all effects together.
 *
 * Effect ranges:
 * - 0x00-0x0F: Standard effects (common to all chips, handled by routeEffect)
 * - 0x10-0x6F: Chip-specific effects (meaning varies by platform)
 * - 0x80-0xFF: Global effects (handled by TrackerReplayer, not this router)
 */

import { DivCmd, FurnaceDispatchPlatform } from './FurnaceDispatchEngine';
import type { ImportMetadata } from '../../types/tracker';

/**
 * Dispatch command result from effect routing
 */
export interface DispatchCommand {
  cmd: number;
  chan: number;
  val1: number;
  val2: number;
}

/**
 * Platform family for effect routing.
 * Derived from Furnace sysDef.cpp effect handler map assignments.
 */
export type PlatformFamily =
  | 'fm_opn2'   // YM2612 (Genesis/Mega Drive) — fmOPN2PostEffectHandlerMap
  | 'fm_opn'    // YM2203, YM2608, YM2610 (with AY PSG) — fmOPNPostEffectHandlerMap
  | 'fm_opm'    // YM2151, TX81Z (Arcade) — fmOPMPostEffectHandlerMap
  | 'fm_opl'    // OPL, OPL2, OPL3, ESFM — fmOPLPostEffectHandlerMap
  | 'fm_opll'   // OPLL, VRC7 — fmOPLLPostEffectHandlerMap
  | 'psg'       // AY-3-8910, AY8930 — ayPostEffectHandlerMap
  | 'sms'       // SN76489, T6W28
  | 'c64'       // SID 6581/8580 — c64PostEffectHandlerMap
  | 'snes'      // SNES S-DSP
  | 'gb'        // Game Boy APU
  | 'nes'       // NES APU
  | 'fds'       // Famicom Disk System
  | 'vrc6'      // VRC6 expansion
  | 'mmc5'      // MMC5 expansion
  | 'pce'       // PC Engine / HuC6280
  | 'namco'     // Namco WSG / N163
  | 'amiga'     // Amiga Paula
  | 'segapcm'   // Sega PCM
  | 'sample'    // Other sample-based chips
  | 'other';

/**
 * Get the platform family for a given platform type
 */
export function getPlatformFamily(platform: number): PlatformFamily {
  switch (platform) {
    // FM OPN2 (YM2612 / Genesis)
    case FurnaceDispatchPlatform.GENESIS:
    case FurnaceDispatchPlatform.GENESIS_EXT:
    case FurnaceDispatchPlatform.YM2612:
    case FurnaceDispatchPlatform.YM2612_EXT:
    case FurnaceDispatchPlatform.YM2612_DUALPCM:
    case FurnaceDispatchPlatform.YM2612_DUALPCM_EXT:
    case FurnaceDispatchPlatform.YM2612_CSM:
      return 'fm_opn2';

    // FM OPN (with AY PSG channels)
    case FurnaceDispatchPlatform.YM2203:
    case FurnaceDispatchPlatform.YM2203_EXT:
    case FurnaceDispatchPlatform.YM2203_CSM:
    case FurnaceDispatchPlatform.YM2608:
    case FurnaceDispatchPlatform.YM2608_EXT:
    case FurnaceDispatchPlatform.YM2608_CSM:
    case FurnaceDispatchPlatform.YM2610:
    case FurnaceDispatchPlatform.YM2610_EXT:
    case FurnaceDispatchPlatform.YM2610_CRAP:
    case FurnaceDispatchPlatform.YM2610_CRAP_EXT:
    case FurnaceDispatchPlatform.YM2610_CSM:
    case FurnaceDispatchPlatform.YM2610B:
    case FurnaceDispatchPlatform.YM2610B_EXT:
    case FurnaceDispatchPlatform.YM2610B_CSM:
      return 'fm_opn';

    // FM OPM (YM2151)
    case FurnaceDispatchPlatform.YM2151:
    case FurnaceDispatchPlatform.ARCADE:
    case FurnaceDispatchPlatform.TX81Z:
      return 'fm_opm';

    // FM OPL
    case FurnaceDispatchPlatform.OPL:
    case FurnaceDispatchPlatform.OPL2:
    case FurnaceDispatchPlatform.OPL3:
    case FurnaceDispatchPlatform.OPL4:
    case FurnaceDispatchPlatform.OPL_DRUMS:
    case FurnaceDispatchPlatform.OPL2_DRUMS:
    case FurnaceDispatchPlatform.OPL3_DRUMS:
    case FurnaceDispatchPlatform.OPL4_DRUMS:
    case FurnaceDispatchPlatform.Y8950:
    case FurnaceDispatchPlatform.Y8950_DRUMS:
    case FurnaceDispatchPlatform.ESFM:
      return 'fm_opl';

    // FM OPLL
    case FurnaceDispatchPlatform.OPLL:
    case FurnaceDispatchPlatform.OPLL_DRUMS:
    case FurnaceDispatchPlatform.VRC7:
    case FurnaceDispatchPlatform.NES_VRC7:
      return 'fm_opll';

    // PSG (AY-3-8910 family)
    case FurnaceDispatchPlatform.AY8910:
    case FurnaceDispatchPlatform.AY8930:
    case FurnaceDispatchPlatform.SAA1099:
      return 'psg';

    // SMS (SN76489)
    case FurnaceDispatchPlatform.SMS:
    case FurnaceDispatchPlatform.T6W28:
      return 'sms';

    // C64/SID
    case FurnaceDispatchPlatform.C64_6581:
    case FurnaceDispatchPlatform.C64_8580:
    case FurnaceDispatchPlatform.SID2:
    case FurnaceDispatchPlatform.SID3:
      return 'c64';

    // SNES
    case FurnaceDispatchPlatform.SNES:
      return 'snes';

    // Game Boy
    case FurnaceDispatchPlatform.GB:
      return 'gb';

    // NES APU
    case FurnaceDispatchPlatform.NES:
      return 'nes';

    // FDS
    case FurnaceDispatchPlatform.FDS:
    case FurnaceDispatchPlatform.NES_FDS:
      return 'fds';

    // VRC6
    case FurnaceDispatchPlatform.VRC6:
      return 'vrc6';

    // MMC5
    case FurnaceDispatchPlatform.MMC5:
      return 'mmc5';

    // PC Engine
    case FurnaceDispatchPlatform.PCE:
      return 'pce';

    // Namco
    case FurnaceDispatchPlatform.NAMCO:
    case FurnaceDispatchPlatform.NAMCO_15XX:
    case FurnaceDispatchPlatform.NAMCO_CUS30:
    case FurnaceDispatchPlatform.N163:
      return 'namco';

    // Amiga
    case FurnaceDispatchPlatform.AMIGA:
      return 'amiga';

    // Sega PCM
    case FurnaceDispatchPlatform.SEGAPCM:
      return 'segapcm';

    // Sample-based
    case FurnaceDispatchPlatform.QSOUND:
    case FurnaceDispatchPlatform.MULTIPCM:
    case FurnaceDispatchPlatform.RF5C68:
    case FurnaceDispatchPlatform.MSM6295:
    case FurnaceDispatchPlatform.MSM6258:
    case FurnaceDispatchPlatform.YMZ280B:
    case FurnaceDispatchPlatform.K007232:
    case FurnaceDispatchPlatform.K053260:
    case FurnaceDispatchPlatform.GA20:
    case FurnaceDispatchPlatform.C140:
    case FurnaceDispatchPlatform.ES5506:
    case FurnaceDispatchPlatform.PCM_DAC:
      return 'sample';

    default:
      return 'other';
  }
}

/**
 * FurnaceEffectRouter class
 * Routes tracker effects to platform-specific dispatch commands
 *
 * Effect handler maps sourced from sysDef.cpp — all chip-specific
 * effect codes are mapped exactly as defined in Furnace source.
 */
export class FurnaceEffectRouter {
  private platformType: number;
  private family: PlatformFamily;

  // Effect memory per channel (Furnace-style parameter persistence)
  private effectMemory: Map<number, Map<number, number>> = new Map();

  // Furnace compatibility flags for legacy behavior
  private _compatFlags: NonNullable<NonNullable<ImportMetadata['furnaceData']>['compatFlags']> = {};

  constructor(platformType: number = FurnaceDispatchPlatform.GB) {
    this.platformType = platformType;
    this.family = getPlatformFamily(platformType);
  }

  /**
   * Set the active platform
   */
  setPlatform(platformType: number): void {
    this.platformType = platformType;
    this.family = getPlatformFamily(platformType);
  }

  /**
   * Set compatibility flags from ImportMetadata
   */
  setCompatFlags(metadata: ImportMetadata | undefined): void {
    this._compatFlags = metadata?.furnaceData?.compatFlags || {};
  }

  /**
   * Get current compatibility flags (for external queries)
   */
  getCompatFlags(): NonNullable<NonNullable<ImportMetadata['furnaceData']>['compatFlags']> {
    return this._compatFlags;
  }

  private getMemory(chan: number, effect: number): number {
    return this.effectMemory.get(chan)?.get(effect) ?? 0;
  }

  private setMemory(chan: number, effect: number, value: number): void {
    if (!this.effectMemory.has(chan)) {
      this.effectMemory.set(chan, new Map());
    }
    this.effectMemory.get(chan)!.set(effect, value);
  }

  resetMemory(): void {
    this.effectMemory.clear();
  }

  /**
   * Route an effect to dispatch commands
   */
  routeEffect(platform: number, chan: number, effect: number, param: number): DispatchCommand[] {
    if (platform !== this.platformType) {
      this.setPlatform(platform);
    }
    const commands: DispatchCommand[] = [];

    // Use parameter memory if param is 0
    if (param === 0) {
      param = this.getMemory(chan, effect);
    } else {
      this.setMemory(chan, effect, param);
    }

    const x = (param >> 4) & 0x0F;
    const y = param & 0x0F;

    // Standard effects (0x00-0x0F, all platforms)
    switch (effect) {
      case 0x00: // Arpeggio
        if (param !== 0) {
          commands.push({ cmd: DivCmd.HINT_ARPEGGIO, chan, val1: x, val2: y });
        }
        break;

      case 0x01: // Pitch slide up
        commands.push({ cmd: DivCmd.PITCH, chan, val1: param, val2: 0 });
        break;

      case 0x02: // Pitch slide down
        commands.push({ cmd: DivCmd.PITCH, chan, val1: -param, val2: 0 });
        break;

      case 0x03: // Tone portamento
        commands.push({ cmd: DivCmd.NOTE_PORTA, chan, val1: param, val2: 1 });
        break;

      case 0x04: // Vibrato
        commands.push({ cmd: DivCmd.HINT_VIBRATO, chan, val1: x, val2: y });
        break;

      case 0x05: // Vibrato + volume slide
        commands.push({ cmd: DivCmd.HINT_VIBRATO, chan, val1: 0, val2: 0 });
        commands.push({ cmd: DivCmd.HINT_VOL_SLIDE, chan, val1: x, val2: y });
        break;

      case 0x06: // Portamento + volume slide
        commands.push({ cmd: DivCmd.HINT_PORTA, chan, val1: 0, val2: 0 });
        commands.push({ cmd: DivCmd.HINT_VOL_SLIDE, chan, val1: x, val2: y });
        break;

      case 0x07: // Tremolo
        commands.push({ cmd: DivCmd.HINT_TREMOLO, chan, val1: x, val2: y });
        break;

      case 0x08: // Panning
        commands.push({ cmd: DivCmd.PANNING, chan, val1: param, val2: param });
        commands.push({ cmd: DivCmd.HINT_PANNING, chan, val1: param, val2: param });
        break;

      case 0x0A: // Volume slide
        commands.push({ cmd: DivCmd.HINT_VOL_SLIDE, chan, val1: x, val2: y });
        break;

      case 0x0C: // Set volume
        commands.push({ cmd: DivCmd.VOLUME, chan, val1: param, val2: 0 });
        commands.push({ cmd: DivCmd.HINT_VOLUME, chan, val1: param, val2: 0 });
        break;

      case 0x0E: // Extended effects (Exy)
        commands.push(...this.routeExtendedEffect(this.platformType, chan, x, y));
        break;

      // Platform-specific effects (0x10+)
      default:
        commands.push(...this.routePlatformEffect(this.platformType, chan, effect, param));
        break;
    }

    return commands;
  }

  /**
   * Route extended effects (Exy format)
   */
  routeExtendedEffect(platform: number, chan: number, x: number, y: number): DispatchCommand[] {
    if (platform !== this.platformType) {
      this.setPlatform(platform);
    }
    const commands: DispatchCommand[] = [];

    switch (x) {
      case 0x1: // E1y - Fine pitch slide up
        commands.push({ cmd: DivCmd.PITCH, chan, val1: y, val2: 0 });
        break;
      case 0x2: // E2y - Fine pitch slide down
        commands.push({ cmd: DivCmd.PITCH, chan, val1: -y, val2: 0 });
        break;
      case 0x3: // E3y - Glissando control
        commands.push({ cmd: DivCmd.LEGATO, chan, val1: y, val2: 0 });
        break;
      case 0x4: // E4y - Vibrato waveform
        commands.push({ cmd: DivCmd.HINT_VIBRATO_SHAPE, chan, val1: y, val2: 0 });
        break;
      case 0x5: // E5y - Set finetune
        commands.push({ cmd: DivCmd.PITCH, chan, val1: y - 8, val2: 1 });
        break;
      case 0x9: // E9y - Retrigger note
        commands.push({ cmd: DivCmd.NOTE_ON, chan, val1: -1, val2: y });
        break;
      case 0xA: // EAy - Fine volume slide up
        commands.push({ cmd: DivCmd.HINT_VOL_SLIDE, chan, val1: y, val2: 0 });
        break;
      case 0xB: // EBy - Fine volume slide down
        commands.push({ cmd: DivCmd.HINT_VOL_SLIDE, chan, val1: 0, val2: y });
        break;
      case 0xC: // ECy - Note cut after y ticks
        commands.push({ cmd: DivCmd.NOTE_OFF, chan, val1: y, val2: 0 });
        break;
      case 0xD: // EDy - Note delay
        commands.push({ cmd: DivCmd.PRE_NOTE, chan, val1: y, val2: 0 });
        break;
      case 0xF: // EFy - Set active macro
        commands.push({ cmd: DivCmd.MACRO_ON, chan, val1: y, val2: 0 });
        break;
    }

    return commands;
  }

  /**
   * Route platform-specific effects (0x10+)
   * Dispatches to the correct chip handler based on platform family.
   */
  routePlatformEffect(platform: number, chan: number, effect: number, param: number): DispatchCommand[] {
    if (platform !== this.platformType) {
      this.setPlatform(platform);
    }

    switch (this.family) {
      case 'fm_opn2':  return this.routeOPN2Effect(chan, effect, param);
      case 'fm_opn':   return this.routeOPNEffect(chan, effect, param);
      case 'fm_opm':   return this.routeOPMEffect(chan, effect, param);
      case 'fm_opl':   return this.routeOPLEffect(chan, effect, param);
      case 'fm_opll':  return this.routeOPLLEffect(chan, effect, param);
      case 'psg':      return this.routePSGEffect(chan, effect, param);
      case 'sms':      return this.routeSMSEffect(chan, effect, param);
      case 'c64':      return this.routeC64Effect(chan, effect, param);
      case 'snes':     return this.routeSNESEffect(chan, effect, param);
      case 'gb':       return this.routeGBEffect(chan, effect, param);
      case 'nes':      return this.routeNESEffect(chan, effect, param);
      case 'fds':      return this.routeFDSEffect(chan, effect, param);
      case 'vrc6':     return this.routeVRC6Effect(chan, effect, param);
      case 'mmc5':     return this.routeMMC5Effect(chan, effect, param);
      case 'pce':      return this.routePCEEffect(chan, effect, param);
      case 'namco':    return this.routeNamcoEffect(chan, effect, param);
      case 'amiga':    return this.routeAmigaEffect(chan, effect, param);
      case 'segapcm':  return this.routeSegaPCMEffect(chan, effect, param);
      case 'sample':   return this.routeSampleEffect(chan, effect, param);
      default:         return [];
    }
  }

  // ======== Shared FM effect helpers ========

  /**
   * Base OPN FM post-effects (0x11-0x63)
   * Shared by OPN2, OPN, OPM, OPL (with overrides for variant-specific codes).
   * From fmOPNPostEffectHandlerMap in sysDef.cpp.
   */
  private routeBaseFMEffect(chan: number, effect: number, param: number): DispatchCommand[] {
    const commands: DispatchCommand[] = [];

    switch (effect) {
      // 0x11: Set feedback (0 to 7)
      case 0x11:
        commands.push({ cmd: DivCmd.FM_FB, chan, val1: param, val2: 0 });
        break;

      // 0x12-0x15: Set TL per operator (constVal<op>, effectVal)
      case 0x12:
        commands.push({ cmd: DivCmd.FM_TL, chan, val1: 0, val2: param });
        break;
      case 0x13:
        commands.push({ cmd: DivCmd.FM_TL, chan, val1: 1, val2: param });
        break;
      case 0x14:
        commands.push({ cmd: DivCmd.FM_TL, chan, val1: 2, val2: param });
        break;
      case 0x15:
        commands.push({ cmd: DivCmd.FM_TL, chan, val1: 3, val2: param });
        break;

      // 0x16: Set operator multiplier (effectOpValNoZero<4>, effectValAnd<15>)
      // xy format: x=op (1-4), y=multiplier
      case 0x16: {
        const op = (param >> 4);
        if (op >= 1 && op <= 4) {
          commands.push({ cmd: DivCmd.FM_MULT, chan, val1: op - 1, val2: param & 15 });
        }
        break;
      }

      // 0x19-0x1d: Set AR (constVal<op>, effectValAnd<31>)
      case 0x19:
        commands.push({ cmd: DivCmd.FM_AR, chan, val1: -1, val2: param & 31 });
        break;
      case 0x1a:
        commands.push({ cmd: DivCmd.FM_AR, chan, val1: 0, val2: param & 31 });
        break;
      case 0x1b:
        commands.push({ cmd: DivCmd.FM_AR, chan, val1: 1, val2: param & 31 });
        break;
      case 0x1c:
        commands.push({ cmd: DivCmd.FM_AR, chan, val1: 2, val2: param & 31 });
        break;
      case 0x1d:
        commands.push({ cmd: DivCmd.FM_AR, chan, val1: 3, val2: param & 31 });
        break;

      // 0x50: Set AM (effectOpVal<4>, effectValAnd<1>)
      case 0x50: {
        const op = (param >> 4);
        if (op <= 4) {
          commands.push({ cmd: DivCmd.FM_AM, chan, val1: op - 1, val2: param & 1 });
        }
        break;
      }

      // 0x51: Set SL (effectOpVal<4>, effectValAnd<15>)
      case 0x51: {
        const op = (param >> 4);
        if (op <= 4) {
          commands.push({ cmd: DivCmd.FM_SL, chan, val1: op - 1, val2: param & 15 });
        }
        break;
      }

      // 0x52: Set RR (effectOpVal<4>, effectValAnd<15>)
      case 0x52: {
        const op = (param >> 4);
        if (op <= 4) {
          commands.push({ cmd: DivCmd.FM_RR, chan, val1: op - 1, val2: param & 15 });
        }
        break;
      }

      // 0x53: Set DT (effectOpVal<4>, effectValAnd<7>)
      case 0x53: {
        const op = (param >> 4);
        if (op <= 4) {
          commands.push({ cmd: DivCmd.FM_DT, chan, val1: op - 1, val2: param & 7 });
        }
        break;
      }

      // 0x54: Set RS/KS (effectOpVal<4>, effectValAnd<3>)
      case 0x54: {
        const op = (param >> 4);
        if (op <= 4) {
          commands.push({ cmd: DivCmd.FM_RS, chan, val1: op - 1, val2: param & 3 });
        }
        break;
      }

      // 0x56-0x5a: Set DR (constVal<op>, effectValAnd<31>)
      case 0x56:
        commands.push({ cmd: DivCmd.FM_DR, chan, val1: -1, val2: param & 31 });
        break;
      case 0x57:
        commands.push({ cmd: DivCmd.FM_DR, chan, val1: 0, val2: param & 31 });
        break;
      case 0x58:
        commands.push({ cmd: DivCmd.FM_DR, chan, val1: 1, val2: param & 31 });
        break;
      case 0x59:
        commands.push({ cmd: DivCmd.FM_DR, chan, val1: 2, val2: param & 31 });
        break;
      case 0x5a:
        commands.push({ cmd: DivCmd.FM_DR, chan, val1: 3, val2: param & 31 });
        break;

      // 0x5b-0x5f: Set D2R (constVal<op>, effectValAnd<31>)
      case 0x5b:
        commands.push({ cmd: DivCmd.FM_D2R, chan, val1: -1, val2: param & 31 });
        break;
      case 0x5c:
        commands.push({ cmd: DivCmd.FM_D2R, chan, val1: 0, val2: param & 31 });
        break;
      case 0x5d:
        commands.push({ cmd: DivCmd.FM_D2R, chan, val1: 1, val2: param & 31 });
        break;
      case 0x5e:
        commands.push({ cmd: DivCmd.FM_D2R, chan, val1: 2, val2: param & 31 });
        break;
      case 0x5f:
        commands.push({ cmd: DivCmd.FM_D2R, chan, val1: 3, val2: param & 31 });
        break;

      // 0x60: Set operator mask (bits 0-3)
      case 0x60:
        commands.push({ cmd: DivCmd.FM_OPMASK, chan, val1: param, val2: 0 });
        break;

      // 0x61: Set algorithm (0 to 7)
      case 0x61:
        commands.push({ cmd: DivCmd.FM_ALG, chan, val1: param, val2: 0 });
        break;

      // 0x62: Set LFO FM depth (0 to 7)
      case 0x62:
        commands.push({ cmd: DivCmd.FM_FMS, chan, val1: param, val2: 0 });
        break;

      // 0x63: Set LFO AM depth (0 to 3)
      case 0x63:
        commands.push({ cmd: DivCmd.FM_AMS, chan, val1: param, val2: 0 });
        break;
    }

    return commands;
  }

  /**
   * Shared AY/PSG post-effects (0x20-0x2f)
   * From ayPostEffectHandlerMap in sysDef.cpp.
   */
  private routeAYEffect(chan: number, effect: number, param: number): DispatchCommand[] {
    const commands: DispatchCommand[] = [];

    switch (effect) {
      // 0x20: Set channel mode (bit 0: square; bit 1: noise; bit 2: envelope)
      case 0x20:
        commands.push({ cmd: DivCmd.STD_NOISE_MODE, chan, val1: param, val2: 0 });
        break;
      // 0x21: Set noise frequency (0 to 1F)
      case 0x21:
        commands.push({ cmd: DivCmd.STD_NOISE_FREQ, chan, val1: param, val2: 0 });
        break;
      // 0x22: Set envelope mode (x: shape, y: enable)
      case 0x22:
        commands.push({ cmd: DivCmd.AY_ENVELOPE_SET, chan, val1: param, val2: 0 });
        break;
      // 0x23: Set envelope period low byte
      case 0x23:
        commands.push({ cmd: DivCmd.AY_ENVELOPE_LOW, chan, val1: param, val2: 0 });
        break;
      // 0x24: Set envelope period high byte
      case 0x24:
        commands.push({ cmd: DivCmd.AY_ENVELOPE_HIGH, chan, val1: param, val2: 0 });
        break;
      // 0x25: Envelope slide up (negEffectVal → val1 = -param)
      case 0x25:
        commands.push({ cmd: DivCmd.AY_ENVELOPE_SLIDE, chan, val1: -param, val2: 0 });
        break;
      // 0x26: Envelope slide down
      case 0x26:
        commands.push({ cmd: DivCmd.AY_ENVELOPE_SLIDE, chan, val1: param, val2: 0 });
        break;
      // 0x29: Set auto-envelope (x: numerator; y: denominator)
      case 0x29:
        commands.push({ cmd: DivCmd.AY_AUTO_ENVELOPE, chan, val1: param, val2: 0 });
        break;
      // 0x2c: Set timer period offset / auto-PWM
      case 0x2c:
        commands.push({ cmd: DivCmd.AY_AUTO_PWM, chan, val1: param, val2: 0 });
        break;
      // 0x2e: Write to I/O port A (constVal<0>, effectVal)
      case 0x2e:
        commands.push({ cmd: DivCmd.AY_IO_WRITE, chan, val1: 0, val2: param });
        break;
      // 0x2f: Write to I/O port B (constVal<1>, effectVal)
      case 0x2f:
        commands.push({ cmd: DivCmd.AY_IO_WRITE, chan, val1: 1, val2: param });
        break;
    }

    return commands;
  }

  // ======== Platform-specific effect routers ========
  // All mappings from sysDef.cpp effectHandlerMap/postEffectHandlerMap

  /**
   * YM2612 / OPN2 (Genesis FM)
   * Pre: fmOPN2EffectHandlerMap (0x30→FM_HARD_RESET, 0xDF→SAMPLE_DIR)
   * Post: fmOPN2PostEffectHandlerMap (base FM + 0x10 LFO + 0x55 SSG, NO AY effects)
   */
  private routeOPN2Effect(chan: number, effect: number, param: number): DispatchCommand[] {
    const commands: DispatchCommand[] = [];

    switch (effect) {
      // Pre-effects
      case 0x30: // Toggle hard envelope reset on new notes
        commands.push({ cmd: DivCmd.FM_HARD_RESET, chan, val1: param, val2: 0 });
        break;
      case 0xdf: // Set sample playback direction (0: normal; 1: reverse)
        commands.push({ cmd: DivCmd.SAMPLE_DIR, chan, val1: param, val2: 0 });
        break;

      // Post-effects (OPN2-specific)
      case 0x10: // Setup LFO (x: enable; y: speed)
        commands.push({ cmd: DivCmd.FM_LFO, chan, val1: param, val2: 0 });
        break;
      case 0x55: { // Set SSG envelope (effectOpVal<4>, effectValAnd<15>)
        const op = (param >> 4);
        if (op <= 4) {
          commands.push({ cmd: DivCmd.FM_SSG, chan, val1: op - 1, val2: param & 15 });
        }
        break;
      }

      default:
        // Base FM post-effects (0x11-0x63)
        commands.push(...this.routeBaseFMEffect(chan, effect, param));
        break;
    }

    return commands;
  }

  /**
   * OPN family with AY channels (YM2203, YM2608, YM2610)
   * Pre: fmEffectHandlerMap (0x30→FM_HARD_RESET)
   * Post: fmOPNPostEffectHandlerMap (base FM + 0x10 LFO + 0x55 SSG + AY 0x20-0x2f)
   * Note: OPN-A chips (YM2608, YM2610) also have 0x1f→ADPCMA_GLOBAL_VOLUME
   */
  private routeOPNEffect(chan: number, effect: number, param: number): DispatchCommand[] {
    const commands: DispatchCommand[] = [];

    switch (effect) {
      // Pre-effects
      case 0x30: // Toggle hard envelope reset
        commands.push({ cmd: DivCmd.FM_HARD_RESET, chan, val1: param, val2: 0 });
        break;

      // Post-effects (OPN-specific)
      case 0x10: // Setup LFO
        commands.push({ cmd: DivCmd.FM_LFO, chan, val1: param, val2: 0 });
        break;
      case 0x1f: // ADPCM-A global volume (fmOPNAPostEffectHandlerMap)
        commands.push({ cmd: DivCmd.ADPCMA_GLOBAL_VOLUME, chan, val1: param, val2: 0 });
        break;
      case 0x55: { // Set SSG envelope
        const op = (param >> 4);
        if (op <= 4) {
          commands.push({ cmd: DivCmd.FM_SSG, chan, val1: op - 1, val2: param & 15 });
        }
        break;
      }

      default: {
        // Try AY effects (0x20-0x2f) first
        const ayResult = this.routeAYEffect(chan, effect, param);
        if (ayResult.length > 0) {
          commands.push(...ayResult);
        } else {
          // Base FM effects (0x11-0x63)
          commands.push(...this.routeBaseFMEffect(chan, effect, param));
        }
        break;
      }
    }

    return commands;
  }

  /**
   * YM2151 / OPM (Arcade)
   * Pre: fmEffectHandlerMap (0x30→FM_HARD_RESET)
   * Post: fmOPMPostEffectHandlerMap (base FM + OPM-specific: noise, LFO, DT2)
   */
  private routeOPMEffect(chan: number, effect: number, param: number): DispatchCommand[] {
    const commands: DispatchCommand[] = [];

    switch (effect) {
      // Pre-effects
      case 0x30:
        commands.push({ cmd: DivCmd.FM_HARD_RESET, chan, val1: param, val2: 0 });
        break;

      // OPM-specific post-effects
      case 0x10: // Set noise frequency (0 disables noise)
        commands.push({ cmd: DivCmd.STD_NOISE_FREQ, chan, val1: param, val2: 0 });
        break;
      case 0x17: // Set LFO speed
        commands.push({ cmd: DivCmd.FM_LFO, chan, val1: param, val2: 0 });
        break;
      case 0x18: // Set LFO waveform (0: saw, 1: square, 2: triangle, 3: noise)
        commands.push({ cmd: DivCmd.FM_LFO_WAVE, chan, val1: param, val2: 0 });
        break;
      case 0x1e: // Set AM depth (0 to 7F)
        commands.push({ cmd: DivCmd.FM_AM_DEPTH, chan, val1: param & 127, val2: 0 });
        break;
      case 0x1f: // Set PM depth (0 to 7F)
        commands.push({ cmd: DivCmd.FM_PM_DEPTH, chan, val1: param & 127, val2: 0 });
        break;
      case 0x55: { // Set DT2 (OPM uses 0x55 for DT2, not SSG)
        const op = (param >> 4);
        if (op <= 4) {
          commands.push({ cmd: DivCmd.FM_DT2, chan, val1: op - 1, val2: param & 3 });
        }
        break;
      }

      default:
        commands.push(...this.routeBaseFMEffect(chan, effect, param));
        break;
    }

    return commands;
  }

  /**
   * OPL / OPL2 / OPL3 / ESFM
   * Pre: fmEffectHandlerMap (0x30→FM_HARD_RESET)
   * Post: fmOPLPostEffectHandlerMap (2- or 4-op, with WS/VIB/SUS/KSR overrides)
   */
  private routeOPLEffect(chan: number, effect: number, param: number): DispatchCommand[] {
    const commands: DispatchCommand[] = [];

    switch (effect) {
      // Pre-effects
      case 0x30:
        commands.push({ cmd: DivCmd.FM_HARD_RESET, chan, val1: param, val2: 0 });
        break;

      // OPL-specific post-effects
      case 0x10: // Set global AM depth (0: 1dB, 1: 4.8dB)
        commands.push({ cmd: DivCmd.FM_LFO, chan, val1: param & 1, val2: 0 });
        break;
      case 0x17: // Set global vibrato depth (0: normal, 1: double) — mapped as LFO val+2
        commands.push({ cmd: DivCmd.FM_LFO, chan, val1: (param & 1) + 2, val2: 0 });
        break;
      case 0x2a: { // Set waveform select (effectOpVal<4>, effectValAnd<7>)
        const op = (param >> 4);
        if (op <= 4) {
          commands.push({ cmd: DivCmd.FM_WS, chan, val1: op - 1, val2: param & 7 });
        }
        break;
      }
      // OPL overrides: 0x53→VIB (not DT), 0x55→SUS (not SSG), 0x5b→KSR (not D2R)
      case 0x53: { // Set vibrato
        const op = (param >> 4);
        if (op <= 4) {
          commands.push({ cmd: DivCmd.FM_VIB, chan, val1: op - 1, val2: param & 1 });
        }
        break;
      }
      case 0x55: { // Set envelope sustain
        const op = (param >> 4);
        if (op <= 4) {
          commands.push({ cmd: DivCmd.FM_SUS, chan, val1: op - 1, val2: param & 1 });
        }
        break;
      }
      case 0x5b: { // Set KSR
        const op = (param >> 4);
        if (op <= 4) {
          commands.push({ cmd: DivCmd.FM_KSR, chan, val1: op - 1, val2: param & 1 });
        }
        break;
      }

      default:
        // Base FM effects (excluding OPL-overridden codes which are handled above)
        commands.push(...this.routeBaseFMEffect(chan, effect, param));
        break;
    }

    return commands;
  }

  /**
   * OPLL / VRC7
   * Pre: fmEffectHandlerMap (0x30→FM_HARD_RESET)
   * Post: fmOPLLPostEffectHandlerMap (2-operator only, VIB/SUS/KSR variants)
   */
  private routeOPLLEffect(chan: number, effect: number, param: number): DispatchCommand[] {
    const commands: DispatchCommand[] = [];

    switch (effect) {
      // Pre-effects
      case 0x30:
        commands.push({ cmd: DivCmd.FM_HARD_RESET, chan, val1: param, val2: 0 });
        break;

      // OPLL-specific post-effects (2-operator chip)
      case 0x10: // Set patch (0 to F)
        commands.push({ cmd: DivCmd.WAVE, chan, val1: param, val2: 0 });
        break;
      case 0x11: // Set feedback (0 to 7)
        commands.push({ cmd: DivCmd.FM_FB, chan, val1: param, val2: 0 });
        break;
      case 0x12: // Set TL op1
        commands.push({ cmd: DivCmd.FM_TL, chan, val1: 0, val2: param });
        break;
      case 0x13: // Set TL op2
        commands.push({ cmd: DivCmd.FM_TL, chan, val1: 1, val2: param });
        break;
      case 0x16: { // Set multiplier (2-op only)
        const op = (param >> 4);
        if (op >= 1 && op <= 2) {
          commands.push({ cmd: DivCmd.FM_MULT, chan, val1: op - 1, val2: param & 15 });
        }
        break;
      }
      case 0x19: // Set AR all ops
        commands.push({ cmd: DivCmd.FM_AR, chan, val1: -1, val2: param & 15 });
        break;
      case 0x1a: // Set AR op1
        commands.push({ cmd: DivCmd.FM_AR, chan, val1: 0, val2: param & 15 });
        break;
      case 0x1b: // Set AR op2
        commands.push({ cmd: DivCmd.FM_AR, chan, val1: 1, val2: param & 15 });
        break;
      case 0x50: { // Set AM
        const op = (param >> 4);
        if (op <= 2) {
          commands.push({ cmd: DivCmd.FM_AM, chan, val1: op - 1, val2: param & 1 });
        }
        break;
      }
      case 0x51: { // Set SL
        const op = (param >> 4);
        if (op <= 2) {
          commands.push({ cmd: DivCmd.FM_SL, chan, val1: op - 1, val2: param & 15 });
        }
        break;
      }
      case 0x52: { // Set RR
        const op = (param >> 4);
        if (op <= 2) {
          commands.push({ cmd: DivCmd.FM_RR, chan, val1: op - 1, val2: param & 15 });
        }
        break;
      }
      case 0x53: { // Set vibrato (OPLL uses VIB, not DT)
        const op = (param >> 4);
        if (op <= 2) {
          commands.push({ cmd: DivCmd.FM_VIB, chan, val1: op - 1, val2: param & 1 });
        }
        break;
      }
      case 0x54: { // Set RS/KS
        const op = (param >> 4);
        if (op <= 2) {
          commands.push({ cmd: DivCmd.FM_RS, chan, val1: op - 1, val2: param & 3 });
        }
        break;
      }
      case 0x55: { // Set envelope sustain (OPLL uses SUS, not SSG)
        const op = (param >> 4);
        if (op <= 2) {
          commands.push({ cmd: DivCmd.FM_SUS, chan, val1: op - 1, val2: param & 1 });
        }
        break;
      }
      case 0x56: // Set DR all ops
        commands.push({ cmd: DivCmd.FM_DR, chan, val1: -1, val2: param & 15 });
        break;
      case 0x57: // Set DR op1
        commands.push({ cmd: DivCmd.FM_DR, chan, val1: 0, val2: param & 15 });
        break;
      case 0x58: // Set DR op2
        commands.push({ cmd: DivCmd.FM_DR, chan, val1: 1, val2: param & 15 });
        break;
      case 0x5b: { // Set KSR (OPLL uses KSR, not D2R)
        const op = (param >> 4);
        if (op <= 2) {
          commands.push({ cmd: DivCmd.FM_KSR, chan, val1: op - 1, val2: param & 1 });
        }
        break;
      }
    }

    return commands;
  }

  /**
   * Game Boy APU
   * Pre: 0x10→WAVE, 0x11→STD_NOISE_MODE (noise length), 0x12→STD_NOISE_MODE (duty),
   *      0x13→GB_SWEEP_TIME, 0x14→GB_SWEEP_DIR
   */
  private routeGBEffect(chan: number, effect: number, param: number): DispatchCommand[] {
    const commands: DispatchCommand[] = [];
    switch (effect) {
      case 0x10: commands.push({ cmd: DivCmd.WAVE, chan, val1: param, val2: 0 }); break;
      case 0x11: commands.push({ cmd: DivCmd.STD_NOISE_MODE, chan, val1: param, val2: 0 }); break;
      case 0x12: commands.push({ cmd: DivCmd.STD_NOISE_MODE, chan, val1: param, val2: 0 }); break;
      case 0x13: commands.push({ cmd: DivCmd.GB_SWEEP_TIME, chan, val1: param, val2: 0 }); break;
      case 0x14: commands.push({ cmd: DivCmd.GB_SWEEP_DIR, chan, val1: param, val2: 0 }); break;
    }
    return commands;
  }

  /**
   * NES APU
   * Pre: 0x11→NES_DMC, 0x12→STD_NOISE_MODE, 0x13→NES_SWEEP(up, constVal<0>),
   *      0x14→NES_SWEEP(down, constVal<1>), 0x15→NES_ENV_MODE, 0x16→NES_LENGTH,
   *      0x17→NES_COUNT_MODE, 0x18→SAMPLE_MODE, 0x19→NES_LINEAR_LENGTH,
   *      0x20→SAMPLE_FREQ
   */
  private routeNESEffect(chan: number, effect: number, param: number): DispatchCommand[] {
    const commands: DispatchCommand[] = [];
    switch (effect) {
      case 0x11: commands.push({ cmd: DivCmd.NES_DMC, chan, val1: param, val2: 0 }); break;
      case 0x12: commands.push({ cmd: DivCmd.STD_NOISE_MODE, chan, val1: param, val2: 0 }); break;
      case 0x13: commands.push({ cmd: DivCmd.NES_SWEEP, chan, val1: 0, val2: param }); break;
      case 0x14: commands.push({ cmd: DivCmd.NES_SWEEP, chan, val1: 1, val2: param }); break;
      case 0x15: commands.push({ cmd: DivCmd.NES_ENV_MODE, chan, val1: param, val2: 0 }); break;
      case 0x16: commands.push({ cmd: DivCmd.NES_LENGTH, chan, val1: param, val2: 0 }); break;
      case 0x17: commands.push({ cmd: DivCmd.NES_COUNT_MODE, chan, val1: param, val2: 0 }); break;
      case 0x18: commands.push({ cmd: DivCmd.SAMPLE_MODE, chan, val1: param, val2: 0 }); break;
      case 0x19: commands.push({ cmd: DivCmd.NES_LINEAR_LENGTH, chan, val1: param, val2: 0 }); break;
      case 0x20: commands.push({ cmd: DivCmd.SAMPLE_FREQ, chan, val1: param, val2: 0 }); break;
    }
    return commands;
  }

  /**
   * Famicom Disk System (standalone chip)
   * Pre: 0x10→WAVE
   * Post: 0x11→FDS_MOD_DEPTH, 0x12→FDS_MOD_HIGH, 0x13→FDS_MOD_LOW,
   *       0x14→FDS_MOD_POS, 0x15→FDS_MOD_WAVE, 0x16→FDS_MOD_AUTO
   */
  private routeFDSEffect(chan: number, effect: number, param: number): DispatchCommand[] {
    const commands: DispatchCommand[] = [];
    switch (effect) {
      case 0x10: commands.push({ cmd: DivCmd.WAVE, chan, val1: param, val2: 0 }); break;
      case 0x11: commands.push({ cmd: DivCmd.FDS_MOD_DEPTH, chan, val1: param, val2: 0 }); break;
      case 0x12: commands.push({ cmd: DivCmd.FDS_MOD_HIGH, chan, val1: param, val2: 0 }); break;
      case 0x13: commands.push({ cmd: DivCmd.FDS_MOD_LOW, chan, val1: param, val2: 0 }); break;
      case 0x14: commands.push({ cmd: DivCmd.FDS_MOD_POS, chan, val1: param, val2: 0 }); break;
      case 0x15: commands.push({ cmd: DivCmd.FDS_MOD_WAVE, chan, val1: param, val2: 0 }); break;
      case 0x16: commands.push({ cmd: DivCmd.FDS_MOD_AUTO, chan, val1: param, val2: 0 }); break;
    }
    return commands;
  }

  /**
   * VRC6 expansion
   * Pre: 0x12→STD_NOISE_MODE (duty cycle, 0 to 7)
   */
  private routeVRC6Effect(chan: number, effect: number, param: number): DispatchCommand[] {
    const commands: DispatchCommand[] = [];
    if (effect === 0x12) {
      commands.push({ cmd: DivCmd.STD_NOISE_MODE, chan, val1: param, val2: 0 });
    }
    return commands;
  }

  /**
   * MMC5 expansion
   * Pre: 0x12→STD_NOISE_MODE (duty cycle/noise mode)
   */
  private routeMMC5Effect(chan: number, effect: number, param: number): DispatchCommand[] {
    const commands: DispatchCommand[] = [];
    if (effect === 0x12) {
      commands.push({ cmd: DivCmd.STD_NOISE_MODE, chan, val1: param, val2: 0 });
    }
    return commands;
  }

  /**
   * PC Engine / HuC6280
   * Pre: 0x10→WAVE, 0x11→STD_NOISE_MODE, 0x12→PCE_LFO_MODE, 0x13→PCE_LFO_SPEED
   */
  private routePCEEffect(chan: number, effect: number, param: number): DispatchCommand[] {
    const commands: DispatchCommand[] = [];
    switch (effect) {
      case 0x10: commands.push({ cmd: DivCmd.WAVE, chan, val1: param, val2: 0 }); break;
      case 0x11: commands.push({ cmd: DivCmd.STD_NOISE_MODE, chan, val1: param, val2: 0 }); break;
      case 0x12: commands.push({ cmd: DivCmd.PCE_LFO_MODE, chan, val1: param, val2: 0 }); break;
      case 0x13: commands.push({ cmd: DivCmd.PCE_LFO_SPEED, chan, val1: param, val2: 0 }); break;
    }
    return commands;
  }

  /**
   * SNES S-DSP
   * Pre: 0x18-0x1f (echo/global config), 0x30-0x37 (FIR coefficients)
   * Post: 0x10-0x16 (per-channel), 0x1d (noise freq), 0x20-0x23 (ADSR)
   */
  private routeSNESEffect(chan: number, effect: number, param: number): DispatchCommand[] {
    const commands: DispatchCommand[] = [];
    switch (effect) {
      // Pre-effects (echo/global configuration)
      case 0x18: commands.push({ cmd: DivCmd.SNES_ECHO_ENABLE, chan, val1: param, val2: 0 }); break;
      case 0x19: commands.push({ cmd: DivCmd.SNES_ECHO_DELAY, chan, val1: param, val2: 0 }); break;
      case 0x1a: commands.push({ cmd: DivCmd.SNES_ECHO_VOL_LEFT, chan, val1: param, val2: 0 }); break;
      case 0x1b: commands.push({ cmd: DivCmd.SNES_ECHO_VOL_RIGHT, chan, val1: param, val2: 0 }); break;
      case 0x1c: commands.push({ cmd: DivCmd.SNES_ECHO_FEEDBACK, chan, val1: param, val2: 0 }); break;
      case 0x1e: commands.push({ cmd: DivCmd.SNES_GLOBAL_VOL_LEFT, chan, val1: param, val2: 0 }); break;
      case 0x1f: commands.push({ cmd: DivCmd.SNES_GLOBAL_VOL_RIGHT, chan, val1: param, val2: 0 }); break;

      // FIR filter coefficients (0x30-0x37 → coefficient 0-7, constVal<N>, effectVal)
      case 0x30: commands.push({ cmd: DivCmd.SNES_ECHO_FIR, chan, val1: 0, val2: param }); break;
      case 0x31: commands.push({ cmd: DivCmd.SNES_ECHO_FIR, chan, val1: 1, val2: param }); break;
      case 0x32: commands.push({ cmd: DivCmd.SNES_ECHO_FIR, chan, val1: 2, val2: param }); break;
      case 0x33: commands.push({ cmd: DivCmd.SNES_ECHO_FIR, chan, val1: 3, val2: param }); break;
      case 0x34: commands.push({ cmd: DivCmd.SNES_ECHO_FIR, chan, val1: 4, val2: param }); break;
      case 0x35: commands.push({ cmd: DivCmd.SNES_ECHO_FIR, chan, val1: 5, val2: param }); break;
      case 0x36: commands.push({ cmd: DivCmd.SNES_ECHO_FIR, chan, val1: 6, val2: param }); break;
      case 0x37: commands.push({ cmd: DivCmd.SNES_ECHO_FIR, chan, val1: 7, val2: param }); break;

      // Post-effects (per-channel)
      case 0x10: commands.push({ cmd: DivCmd.WAVE, chan, val1: param, val2: 0 }); break;
      case 0x11: commands.push({ cmd: DivCmd.STD_NOISE_MODE, chan, val1: param, val2: 0 }); break;
      case 0x12: commands.push({ cmd: DivCmd.SNES_ECHO, chan, val1: param, val2: 0 }); break;
      case 0x13: commands.push({ cmd: DivCmd.SNES_PITCH_MOD, chan, val1: param, val2: 0 }); break;
      case 0x14: commands.push({ cmd: DivCmd.SNES_INVERT, chan, val1: param, val2: 0 }); break;
      case 0x15: commands.push({ cmd: DivCmd.SNES_GAIN_MODE, chan, val1: param, val2: 0 }); break;
      case 0x16: commands.push({ cmd: DivCmd.SNES_GAIN, chan, val1: param, val2: 0 }); break;
      case 0x1d: commands.push({ cmd: DivCmd.STD_NOISE_FREQ, chan, val1: param, val2: 0 }); break;

      // ADSR controls (post-effects, using FM_AR/DR/SL/RR commands)
      case 0x20: commands.push({ cmd: DivCmd.FM_AR, chan, val1: param, val2: 0 }); break;
      case 0x21: commands.push({ cmd: DivCmd.FM_DR, chan, val1: param, val2: 0 }); break;
      case 0x22: commands.push({ cmd: DivCmd.FM_SL, chan, val1: param, val2: 0 }); break;
      case 0x23: commands.push({ cmd: DivCmd.FM_RR, chan, val1: param, val2: 0 }); break;
    }
    return commands;
  }

  /**
   * C64 / SID (6581, 8580)
   * Pre: NONE
   * Post: c64PostEffectHandlerMap (full SID control including 3xxx/4xxx long effects)
   */
  private routeC64Effect(chan: number, effect: number, param: number): DispatchCommand[] {
    const commands: DispatchCommand[] = [];

    switch (effect) {
      case 0x10: // Set waveform (bit 0: tri; bit 1: saw; bit 2: pulse; bit 3: noise)
        commands.push({ cmd: DivCmd.WAVE, chan, val1: param, val2: 0 });
        break;
      case 0x11: // Set coarse cutoff
        commands.push({ cmd: DivCmd.C64_CUTOFF, chan, val1: param, val2: 0 });
        break;
      case 0x12: // Set coarse pulse width
        commands.push({ cmd: DivCmd.STD_NOISE_MODE, chan, val1: param, val2: 0 });
        break;
      case 0x13: // Set resonance (0 to F)
        commands.push({ cmd: DivCmd.C64_RESONANCE, chan, val1: param, val2: 0 });
        break;
      case 0x14: // Set filter mode (bit 0: LP; bit 1: BP; bit 2: HP)
        commands.push({ cmd: DivCmd.C64_FILTER_MODE, chan, val1: param, val2: 0 });
        break;
      case 0x15: // Set envelope reset time
        commands.push({ cmd: DivCmd.C64_RESET_TIME, chan, val1: param, val2: 0 });
        break;
      case 0x1a: // Disable envelope reset for this channel
        commands.push({ cmd: DivCmd.C64_RESET_MASK, chan, val1: param, val2: 0 });
        break;
      case 0x1b: // Reset cutoff (x: on new note; y: now)
        commands.push({ cmd: DivCmd.C64_FILTER_RESET, chan, val1: param, val2: 0 });
        break;
      case 0x1c: // Reset pulse width (x: on new note; y: now)
        commands.push({ cmd: DivCmd.C64_DUTY_RESET, chan, val1: param, val2: 0 });
        break;
      case 0x1e: // Change other parameters (legacy)
        commands.push({ cmd: DivCmd.C64_EXTENDED, chan, val1: param, val2: 0 });
        break;
      case 0x20: // Set attack/decay (x: attack; y: decay)
        commands.push({ cmd: DivCmd.C64_AD, chan, val1: param, val2: 0 });
        break;
      case 0x21: // Set sustain/release (x: sustain; y: release)
        commands.push({ cmd: DivCmd.C64_SR, chan, val1: param, val2: 0 });
        break;
      case 0x22: // Pulse width slide up (effectVal, constVal<1>)
        commands.push({ cmd: DivCmd.C64_PW_SLIDE, chan, val1: param, val2: 1 });
        break;
      case 0x23: // Pulse width slide down (effectVal, constVal<-1>)
        commands.push({ cmd: DivCmd.C64_PW_SLIDE, chan, val1: param, val2: -1 });
        break;
      case 0x24: // Filter cutoff slide up (effectVal, constVal<1>)
        commands.push({ cmd: DivCmd.C64_CUTOFF_SLIDE, chan, val1: param, val2: 1 });
        break;
      case 0x25: // Filter cutoff slide down (effectVal, constVal<-1>)
        commands.push({ cmd: DivCmd.C64_CUTOFF_SLIDE, chan, val1: param, val2: -1 });
        break;
      default:
        // 0x30-0x3f: Set pulse width (effectValLong<12> → 12-bit value 0-FFF)
        if (effect >= 0x30 && effect <= 0x3f) {
          const dutyVal = ((effect & 0xF) << 8) | param;
          commands.push({ cmd: DivCmd.C64_FINE_DUTY, chan, val1: dutyVal, val2: 0 });
        }
        // 0x40-0x47: Set cutoff (effectValLong<11> → 11-bit value 0-7FF)
        else if (effect >= 0x40 && effect <= 0x47) {
          const cutoffVal = ((effect & 0x7) << 8) | param;
          commands.push({ cmd: DivCmd.C64_FINE_CUTOFF, chan, val1: cutoffVal, val2: 0 });
        }
        break;
    }

    return commands;
  }

  /**
   * PSG / AY-3-8910 / AY8930
   * Pre: NONE
   * Post: ayPostEffectHandlerMap (effects at 0x20-0x2f)
   */
  private routePSGEffect(chan: number, effect: number, param: number): DispatchCommand[] {
    return this.routeAYEffect(chan, effect, param);
  }

  /**
   * SMS / SN76489 / T6W28
   * Pre: 0x20→STD_NOISE_MODE
   */
  private routeSMSEffect(chan: number, effect: number, param: number): DispatchCommand[] {
    const commands: DispatchCommand[] = [];
    if (effect === 0x20) {
      commands.push({ cmd: DivCmd.STD_NOISE_MODE, chan, val1: param, val2: 0 });
    }
    return commands;
  }

  /**
   * Namco N163
   * Pre: 0x18→N163_CHANNEL_LIMIT, 0x20→N163_GLOBAL_WAVE_LOAD,
   *      0x21→N163_GLOBAL_WAVE_LOADPOS
   * Post: 0x10→WAVE, 0x11→WAVE_POSITION(play, val2=1), 0x12→WAVE_LENGTH(play, val2=1),
   *       0x15→WAVE_POSITION(load, val2=2), 0x16→WAVE_LENGTH(load, val2=2),
   *       0x1a→WAVE_POSITION(play+load, val2=3), 0x1b→WAVE_LENGTH(play+load, val2=3)
   */
  private routeNamcoEffect(chan: number, effect: number, param: number): DispatchCommand[] {
    const commands: DispatchCommand[] = [];
    switch (effect) {
      // Pre-effects
      case 0x18: commands.push({ cmd: DivCmd.N163_CHANNEL_LIMIT, chan, val1: param, val2: 0 }); break;
      case 0x20: commands.push({ cmd: DivCmd.N163_GLOBAL_WAVE_LOAD, chan, val1: param, val2: 0 }); break;
      case 0x21: commands.push({ cmd: DivCmd.N163_GLOBAL_WAVE_LOADPOS, chan, val1: param, val2: 0 }); break;

      // Post-effects
      case 0x10: commands.push({ cmd: DivCmd.WAVE, chan, val1: param, val2: 0 }); break;
      case 0x11: commands.push({ cmd: DivCmd.N163_WAVE_POSITION, chan, val1: param, val2: 1 }); break;
      case 0x12: commands.push({ cmd: DivCmd.N163_WAVE_LENGTH, chan, val1: param, val2: 1 }); break;
      case 0x15: commands.push({ cmd: DivCmd.N163_WAVE_POSITION, chan, val1: param, val2: 2 }); break;
      case 0x16: commands.push({ cmd: DivCmd.N163_WAVE_LENGTH, chan, val1: param, val2: 2 }); break;
      case 0x1a: commands.push({ cmd: DivCmd.N163_WAVE_POSITION, chan, val1: param, val2: 3 }); break;
      case 0x1b: commands.push({ cmd: DivCmd.N163_WAVE_LENGTH, chan, val1: param, val2: 3 }); break;
    }
    return commands;
  }

  /**
   * Amiga Paula
   * Pre: NONE
   * Post: 0x10→AMIGA_FILTER, 0x11→AMIGA_AM, 0x12→AMIGA_PM, 0x13→WAVE
   */
  private routeAmigaEffect(chan: number, effect: number, param: number): DispatchCommand[] {
    const commands: DispatchCommand[] = [];
    switch (effect) {
      case 0x10: commands.push({ cmd: DivCmd.AMIGA_FILTER, chan, val1: param, val2: 0 }); break;
      case 0x11: commands.push({ cmd: DivCmd.AMIGA_AM, chan, val1: param, val2: 0 }); break;
      case 0x12: commands.push({ cmd: DivCmd.AMIGA_PM, chan, val1: param, val2: 0 }); break;
      case 0x13: commands.push({ cmd: DivCmd.WAVE, chan, val1: param, val2: 0 }); break;
    }
    return commands;
  }

  /**
   * Sega PCM
   * Pre: NONE
   * Post: 0x20→SAMPLE_FREQ
   */
  private routeSegaPCMEffect(chan: number, effect: number, param: number): DispatchCommand[] {
    const commands: DispatchCommand[] = [];
    if (effect === 0x20) {
      commands.push({ cmd: DivCmd.SAMPLE_FREQ, chan, val1: param, val2: 0 });
    }
    return commands;
  }

  /**
   * Generic sample-based chip effects (QSound, ES5506, etc.)
   * Various chips have their own post-effect maps; this covers common ones.
   */
  private routeSampleEffect(chan: number, effect: number, param: number): DispatchCommand[] {
    const commands: DispatchCommand[] = [];
    switch (effect) {
      case 0x10: commands.push({ cmd: DivCmd.SAMPLE_MODE, chan, val1: param, val2: 0 }); break;
      case 0x11: commands.push({ cmd: DivCmd.SAMPLE_BANK, chan, val1: param, val2: 0 }); break;
      case 0x12: commands.push({ cmd: DivCmd.SAMPLE_DIR, chan, val1: param, val2: 0 }); break;
      case 0x20: commands.push({ cmd: DivCmd.SAMPLE_FREQ, chan, val1: param, val2: 0 }); break;

      // ES5506-specific filter effects
      case 0x14: commands.push({ cmd: DivCmd.ES5506_FILTER_MODE, chan, val1: param, val2: 0 }); break;
      case 0x15: commands.push({ cmd: DivCmd.ES5506_FILTER_K1, chan, val1: param << 8, val2: 0xFF00 }); break;
      case 0x16: commands.push({ cmd: DivCmd.ES5506_FILTER_K2, chan, val1: param << 8, val2: 0xFF00 }); break;

      // QSound-specific
      case 0x17: commands.push({ cmd: DivCmd.QSOUND_ECHO_FEEDBACK, chan, val1: param, val2: 0 }); break;
      case 0x18: commands.push({ cmd: DivCmd.QSOUND_ECHO_LEVEL, chan, val1: param, val2: 0 }); break;
      case 0x19: commands.push({ cmd: DivCmd.QSOUND_SURROUND, chan, val1: param, val2: 0 }); break;
    }
    return commands;
  }

  /**
   * Clear all effect memory
   */
  clearMemory(): void {
    this.effectMemory.clear();
  }

  /**
   * Clear effect memory for a specific channel
   */
  clearChannelMemory(chan: number): void {
    this.effectMemory.delete(chan);
  }
}

// Export lazy-initialized singleton to avoid circular dependency issues
let _furnaceEffectRouterInstance: FurnaceEffectRouter | null = null;

export function getFurnaceEffectRouter(): FurnaceEffectRouter {
  if (!_furnaceEffectRouterInstance) {
    _furnaceEffectRouterInstance = new FurnaceEffectRouter();
  }
  return _furnaceEffectRouterInstance;
}

// Legacy export for backwards compatibility (lazy proxy)
export const furnaceEffectRouter = new Proxy({} as FurnaceEffectRouter, {
  get(_target, prop: string | symbol) {
    return (getFurnaceEffectRouter() as unknown as Record<string | symbol, unknown>)[prop];
  },
  set(_target, prop: string | symbol, value: unknown) {
    (getFurnaceEffectRouter() as unknown as Record<string | symbol, unknown>)[prop] = value;
    return true;
  }
});
