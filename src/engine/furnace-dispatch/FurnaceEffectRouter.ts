/**
 * FurnaceEffectRouter - Maps tracker effect commands to Furnace DivCmd dispatch calls
 *
 * This router translates standard tracker effect codes (Exx, etc.) to chip-specific
 * Furnace dispatch commands based on the active platform type.
 *
 * Effect mapping follows Furnace tracker conventions:
 * - Effects 10xx-1Fxx: Standard effects (common to all chips)
 * - Effects 20xx-2Fxx: Extended chip-specific effects (varies by platform)
 * - Effects E0x-EFx: Extended commands (Exy format)
 */

import { DivCmd, FurnaceDispatchPlatform } from './FurnaceDispatchEngine';

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
 * Platform family for effect routing
 */
export type PlatformFamily =
  | 'fm'        // OPN, OPM, OPL, OPLL, etc.
  | 'psg'       // AY, SN76489, etc.
  | 'c64'       // SID variants
  | 'snes'      // S-DSP
  | 'gb'        // Game Boy APU
  | 'nes'       // NES APU, FDS, VRC6, etc.
  | 'pce'       // PC Engine
  | 'namco'     // Namco WSG, N163
  | 'sample'    // Sample-based chips (Amiga, SegaPCM, etc.)
  | 'other';    // Other/generic

/**
 * Get the platform family for a given platform type
 */
export function getPlatformFamily(platform: number): PlatformFamily {
  switch (platform) {
    // FM platforms
    case FurnaceDispatchPlatform.GENESIS:
    case FurnaceDispatchPlatform.GENESIS_EXT:
    case FurnaceDispatchPlatform.YM2151:
    case FurnaceDispatchPlatform.YM2612:
    case FurnaceDispatchPlatform.YM2203:
    case FurnaceDispatchPlatform.YM2203_EXT:
    case FurnaceDispatchPlatform.YM2608:
    case FurnaceDispatchPlatform.YM2608_EXT:
    case FurnaceDispatchPlatform.YM2610:
    case FurnaceDispatchPlatform.YM2610_EXT:
    case FurnaceDispatchPlatform.YM2610B:
    case FurnaceDispatchPlatform.YM2610B_EXT:
    case FurnaceDispatchPlatform.ARCADE:
    case FurnaceDispatchPlatform.TX81Z:
    case FurnaceDispatchPlatform.OPL:
    case FurnaceDispatchPlatform.OPL2:
    case FurnaceDispatchPlatform.OPL3:
    case FurnaceDispatchPlatform.OPL4:
    case FurnaceDispatchPlatform.OPLL:
    case FurnaceDispatchPlatform.VRC7:
    case FurnaceDispatchPlatform.ESFM:
      return 'fm';

    // PSG platforms
    case FurnaceDispatchPlatform.AY8910:
    case FurnaceDispatchPlatform.AY8930:
    case FurnaceDispatchPlatform.SMS:
    case FurnaceDispatchPlatform.SAA1099:
    case FurnaceDispatchPlatform.T6W28:
      return 'psg';

    // C64/SID platforms
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

    // NES family
    case FurnaceDispatchPlatform.NES:
    case FurnaceDispatchPlatform.NES_VRC7:
    case FurnaceDispatchPlatform.NES_FDS:
    case FurnaceDispatchPlatform.VRC6:
    case FurnaceDispatchPlatform.MMC5:
    case FurnaceDispatchPlatform.FDS:
      return 'nes';

    // PC Engine
    case FurnaceDispatchPlatform.PCE:
      return 'pce';

    // Namco
    case FurnaceDispatchPlatform.NAMCO:
    case FurnaceDispatchPlatform.NAMCO_15XX:
    case FurnaceDispatchPlatform.NAMCO_CUS30:
    case FurnaceDispatchPlatform.N163:
      return 'namco';

    // Sample-based
    case FurnaceDispatchPlatform.AMIGA:
    case FurnaceDispatchPlatform.SEGAPCM:
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
      return 'sample';

    default:
      return 'other';
  }
}

/**
 * FurnaceEffectRouter class
 * Routes tracker effects to platform-specific dispatch commands
 */
export class FurnaceEffectRouter {
  private platformType: number;
  private family: PlatformFamily;

  // Effect memory per channel (Furnace-style parameter persistence)
  private effectMemory: Map<number, Map<number, number>> = new Map();

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
   * Get effect memory for a channel
   */
  private getMemory(chan: number, effect: number): number {
    const chanMem = this.effectMemory.get(chan);
    if (!chanMem) return 0;
    return chanMem.get(effect) ?? 0;
  }

  /**
   * Set effect memory for a channel
   */
  private setMemory(chan: number, effect: number, value: number): void {
    if (!this.effectMemory.has(chan)) {
      this.effectMemory.set(chan, new Map());
    }
    this.effectMemory.get(chan)!.set(effect, value);
  }

  /**
   * Reset effect memory for all channels
   */
  resetMemory(): void {
    this.effectMemory.clear();
  }

  /**
   * Route an effect to dispatch commands
   * @param platform Platform type (from FurnaceDispatchPlatform)
   * @param chan Channel number
   * @param effect Effect code (e.g., 0x10 for volume, 0xE1 for extended)
   * @param param Effect parameter
   * @returns Array of dispatch commands to execute
   */
  routeEffect(platform: number, chan: number, effect: number, param: number): DispatchCommand[] {
    // Update platform if changed
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

    // Standard effects (all platforms)
    switch (effect) {
      case 0x00: // Arpeggio
        if (param !== 0) {
          commands.push({ cmd: DivCmd.NOTE_PORTA, chan, val1: x, val2: y });
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

      case 0x07: // Tremolo
        commands.push({ cmd: DivCmd.HINT_TREMOLO, chan, val1: x, val2: y });
        break;

      case 0x08: // Panning
        commands.push({ cmd: DivCmd.PANNING, chan, val1: param, val2: param });
        break;

      case 0x0A: // Volume slide
        commands.push({ cmd: DivCmd.HINT_VOL_SLIDE, chan, val1: x, val2: y });
        break;

      case 0x0C: // Set volume
        commands.push({ cmd: DivCmd.VOLUME, chan, val1: param, val2: 0 });
        break;

      case 0x0E: // Extended effects
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
   * Route extended effects (Exy)
   * @param platform Platform type (from FurnaceDispatchPlatform)
   * @param chan Channel number
   * @param x Effect subtype (0-F)
   * @param y Effect value (0-F)
   */
  routeExtendedEffect(platform: number, chan: number, x: number, y: number): DispatchCommand[] {
    // Update platform if changed
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
        commands.push({ cmd: DivCmd.PITCH, chan, val1: y - 8, val2: 1 }); // Center at 8
        break;

      case 0x9: // E9y - Retrigger note
        commands.push({ cmd: DivCmd.NOTE_ON, chan, val1: -1, val2: y }); // -1 = same note
        break;

      case 0xA: // EAy - Fine volume slide up
        commands.push({ cmd: DivCmd.HINT_VOL_SLIDE, chan, val1: y, val2: 0 });
        break;

      case 0xB: // EBy - Fine volume slide down
        commands.push({ cmd: DivCmd.HINT_VOL_SLIDE, chan, val1: 0, val2: y });
        break;

      case 0xC: // ECy - Note cut
        commands.push({ cmd: DivCmd.NOTE_OFF, chan, val1: y, val2: 0 }); // Delay ticks
        break;

      case 0xD: // EDy - Note delay
        commands.push({ cmd: DivCmd.PRE_NOTE, chan, val1: y, val2: 0 });
        break;

      case 0xF: // EFy - Set active macro
        commands.push({ cmd: DivCmd.MACRO_ON, chan, val1: y, val2: 0 });
        break;
    }

    // Platform-specific extended effects
    commands.push(...this.routePlatformExtendedEffect(this.platformType, chan, x, y));

    return commands;
  }

  /**
   * Route platform-specific effects (0x10+)
   * @param platform Platform type (from FurnaceDispatchPlatform)
   * @param chan Channel number
   * @param effect Effect code
   * @param param Effect parameter
   */
  routePlatformEffect(platform: number, chan: number, effect: number, param: number): DispatchCommand[] {
    // Update platform if changed
    if (platform !== this.platformType) {
      this.setPlatform(platform);
    }
    const commands: DispatchCommand[] = [];

    switch (this.family) {
      case 'fm':
        commands.push(...this.routeFMEffect(chan, effect, param));
        break;
      case 'c64':
        commands.push(...this.routeC64Effect(chan, effect, param));
        break;
      case 'snes':
        commands.push(...this.routeSNESEffect(chan, effect, param));
        break;
      case 'gb':
        commands.push(...this.routeGBEffect(chan, effect, param));
        break;
      case 'nes':
        commands.push(...this.routeNESEffect(chan, effect, param));
        break;
      case 'pce':
        commands.push(...this.routePCEEffect(chan, effect, param));
        break;
      case 'psg':
        commands.push(...this.routePSGEffect(chan, effect, param));
        break;
      case 'namco':
        commands.push(...this.routeNamcoEffect(chan, effect, param));
        break;
      case 'sample':
        commands.push(...this.routeSampleEffect(chan, effect, param));
        break;
    }

    return commands;
  }

  /**
   * Route platform-specific extended effects (Exy where x is platform-specific)
   */
  private routePlatformExtendedEffect(platform: number, chan: number, x: number, y: number): DispatchCommand[] {
    const commands: DispatchCommand[] = [];

    // Update platform if changed
    if (platform !== this.platformType) {
      this.setPlatform(platform);
    }

    // Platform-specific E6x, E7x, E8x effects
    switch (this.family) {
      case 'gb':
        if (x === 0x6) {
          // E6y - GB sweep
          commands.push({ cmd: DivCmd.GB_SWEEP_TIME, chan, val1: y, val2: 0 });
        }
        break;

      case 'nes':
        if (x === 0x6) {
          // E6y - NES sweep enable
          commands.push({ cmd: DivCmd.NES_SWEEP, chan, val1: y, val2: 0 });
        }
        break;

      case 'c64':
        if (x === 0x6) {
          // E6y - C64 filter mode
          commands.push({ cmd: DivCmd.C64_FILTER_MODE, chan, val1: y, val2: 0 });
        }
        break;
    }

    return commands;
  }

  // ======== Platform-specific effect routers ========

  /**
   * FM chip effects (OPN, OPM, OPL, etc.)
   */
  private routeFMEffect(chan: number, effect: number, param: number): DispatchCommand[] {
    const commands: DispatchCommand[] = [];
    const x = (param >> 4) & 0x0F;
    const y = param & 0x0F;

    switch (effect) {
      case 0x10: // 10xx - Set LFO frequency
        commands.push({ cmd: DivCmd.FM_LFO, chan, val1: param, val2: 0 });
        break;

      case 0x11: // 11xy - Set operator TL (x=op, y=value*8)
        commands.push({ cmd: DivCmd.FM_TL, chan, val1: x, val2: y * 8 });
        break;

      case 0x12: // 12xy - Set operator AR (x=op, y=value)
        commands.push({ cmd: DivCmd.FM_AR, chan, val1: x, val2: y * 2 });
        break;

      case 0x13: // 13xy - Set operator DR (x=op, y=value)
        commands.push({ cmd: DivCmd.FM_DR, chan, val1: x, val2: y * 2 });
        break;

      case 0x14: // 14xy - Set operator MULT (x=op, y=value)
        commands.push({ cmd: DivCmd.FM_MULT, chan, val1: x, val2: y });
        break;

      case 0x15: // 15xy - Set operator RR (x=op, y=value)
        commands.push({ cmd: DivCmd.FM_RR, chan, val1: x, val2: y });
        break;

      case 0x16: // 16xy - Set operator SL (x=op, y=value)
        commands.push({ cmd: DivCmd.FM_SL, chan, val1: x, val2: y });
        break;

      case 0x17: // 17xy - Set operator DT (x=op, y=value)
        commands.push({ cmd: DivCmd.FM_DT, chan, val1: x, val2: y });
        break;

      case 0x18: // 18xx - Set algorithm
        commands.push({ cmd: DivCmd.FM_FB, chan, val1: param >> 4, val2: 0 }); // FB in upper nibble
        break;

      case 0x19: // 19xx - Set feedback
        commands.push({ cmd: DivCmd.FM_FB, chan, val1: 0, val2: param & 0x07 });
        break;

      case 0x1A: // 1Axy - Set operator SSG-EG (x=op, y=mode)
        commands.push({ cmd: DivCmd.FM_SSG, chan, val1: x, val2: y });
        break;

      case 0x1B: // 1Bxy - Set AM depth / PM depth
        commands.push({ cmd: DivCmd.FM_AM_DEPTH, chan, val1: x, val2: 0 });
        commands.push({ cmd: DivCmd.FM_PM_DEPTH, chan, val1: y, val2: 0 });
        break;

      case 0x1F: // 1Fxx - Hard reset
        commands.push({ cmd: DivCmd.FM_HARD_RESET, chan, val1: param, val2: 0 });
        break;
    }

    return commands;
  }

  /**
   * C64/SID effects
   */
  private routeC64Effect(chan: number, effect: number, param: number): DispatchCommand[] {
    const commands: DispatchCommand[] = [];
    // x and y nibbles available for future extended effects
    const _x = (param >> 4) & 0x0F;
    const _y = param & 0x0F;
    void _x; void _y; // Suppress unused warnings

    switch (effect) {
      case 0x10: // 10xx - Set filter cutoff (coarse)
        commands.push({ cmd: DivCmd.C64_CUTOFF, chan, val1: param * 8, val2: 0 });
        break;

      case 0x11: // 11xx - Set filter cutoff (fine)
        commands.push({ cmd: DivCmd.C64_FINE_CUTOFF, chan, val1: param, val2: 0 });
        break;

      case 0x12: // 12xx - Set filter resonance
        commands.push({ cmd: DivCmd.C64_RESONANCE, chan, val1: param & 0x0F, val2: 0 });
        break;

      case 0x13: // 13xx - Set filter mode (LP/BP/HP/combinations)
        commands.push({ cmd: DivCmd.C64_FILTER_MODE, chan, val1: param & 0x07, val2: 0 });
        break;

      case 0x14: // 14xy - Set ring mod (x=enable, y=source)
        commands.push({ cmd: DivCmd.C64_EXTENDED, chan, val1: 0, val2: param });
        break;

      case 0x15: // 15xy - Set sync (x=enable, y=source)
        commands.push({ cmd: DivCmd.C64_EXTENDED, chan, val1: 1, val2: param });
        break;

      case 0x16: // 16xx - Set pulse width (coarse)
        commands.push({ cmd: DivCmd.C64_DUTY_RESET, chan, val1: param * 16, val2: 0 });
        break;

      case 0x17: // 17xx - Set pulse width (fine)
        commands.push({ cmd: DivCmd.C64_FINE_DUTY, chan, val1: param, val2: 0 });
        break;
    }

    return commands;
  }

  /**
   * SNES effects
   */
  private routeSNESEffect(chan: number, effect: number, param: number): DispatchCommand[] {
    const commands: DispatchCommand[] = [];

    switch (effect) {
      case 0x10: // 10xx - Enable/disable echo
        commands.push({ cmd: DivCmd.SNES_ECHO, chan, val1: param, val2: 0 });
        break;

      case 0x11: // 11xx - Set echo delay
        commands.push({ cmd: DivCmd.SNES_ECHO_DELAY, chan, val1: param & 0x0F, val2: 0 });
        break;

      case 0x12: // 12xx - Set echo feedback
        commands.push({ cmd: DivCmd.SNES_ECHO_FEEDBACK, chan, val1: param, val2: 0 });
        break;

      case 0x13: // 13xx - Set echo volume left
        commands.push({ cmd: DivCmd.SNES_ECHO_VOL_LEFT, chan, val1: param, val2: 0 });
        break;

      case 0x14: // 14xx - Set echo volume right
        commands.push({ cmd: DivCmd.SNES_ECHO_VOL_RIGHT, chan, val1: param, val2: 0 });
        break;

      case 0x15: // 15xx - Set FIR filter coefficient
        commands.push({ cmd: DivCmd.SNES_ECHO_FIR, chan, val1: param, val2: 0 });
        break;

      case 0x16: // 16xx - Enable pitch modulation
        commands.push({ cmd: DivCmd.SNES_PITCH_MOD, chan, val1: param, val2: 0 });
        break;

      case 0x17: // 17xx - Set gain mode
        commands.push({ cmd: DivCmd.SNES_GAIN_MODE, chan, val1: param, val2: 0 });
        break;

      case 0x18: // 18xx - Set gain value
        commands.push({ cmd: DivCmd.SNES_GAIN, chan, val1: param, val2: 0 });
        break;

      case 0x19: // 19xx - Set invert
        commands.push({ cmd: DivCmd.SNES_INVERT, chan, val1: param, val2: 0 });
        break;
    }

    return commands;
  }

  /**
   * Game Boy effects
   */
  private routeGBEffect(chan: number, effect: number, param: number): DispatchCommand[] {
    const commands: DispatchCommand[] = [];
    const x = (param >> 4) & 0x0F;
    const y = param & 0x0F;

    switch (effect) {
      case 0x10: // 10xy - Set sweep (x=time, y=shift)
        commands.push({ cmd: DivCmd.GB_SWEEP_TIME, chan, val1: x, val2: 0 });
        commands.push({ cmd: DivCmd.GB_SWEEP_DIR, chan, val1: y >> 3, val2: 0 });
        break;

      case 0x11: // 11xx - Set wave
        commands.push({ cmd: DivCmd.WAVE, chan, val1: param, val2: 0 });
        break;

      case 0x12: // 12xx - Set noise mode (for CH4)
        commands.push({ cmd: DivCmd.STD_NOISE_MODE, chan, val1: param, val2: 0 });
        break;
    }

    return commands;
  }

  /**
   * NES effects
   */
  private routeNESEffect(chan: number, effect: number, param: number): DispatchCommand[] {
    const commands: DispatchCommand[] = [];
    const x = (param >> 4) & 0x0F;
    const y = param & 0x0F;

    switch (effect) {
      case 0x10: // 10xy - Set sweep (x=params, y=period)
        commands.push({ cmd: DivCmd.NES_SWEEP, chan, val1: x, val2: y });
        break;

      case 0x11: // 11xx - Set DMC
        commands.push({ cmd: DivCmd.NES_DMC, chan, val1: param, val2: 0 });
        break;

      case 0x12: // 12xx - Set envelope mode
        commands.push({ cmd: DivCmd.NES_ENV_MODE, chan, val1: param, val2: 0 });
        break;

      case 0x13: // 13xx - Set length counter
        commands.push({ cmd: DivCmd.NES_LENGTH, chan, val1: param, val2: 0 });
        break;

      // FDS effects (for NES_FDS platform)
      case 0x14: // 14xx - Set FDS mod depth
        commands.push({ cmd: DivCmd.FDS_MOD_DEPTH, chan, val1: param, val2: 0 });
        break;

      case 0x15: // 15xx - Set FDS mod speed high
        commands.push({ cmd: DivCmd.FDS_MOD_HIGH, chan, val1: param, val2: 0 });
        break;

      case 0x16: // 16xx - Set FDS mod speed low
        commands.push({ cmd: DivCmd.FDS_MOD_LOW, chan, val1: param, val2: 0 });
        break;
    }

    return commands;
  }

  /**
   * PC Engine effects
   */
  private routePCEEffect(chan: number, effect: number, param: number): DispatchCommand[] {
    const commands: DispatchCommand[] = [];

    switch (effect) {
      case 0x10: // 10xx - Set LFO mode
        commands.push({ cmd: DivCmd.PCE_LFO_MODE, chan, val1: param, val2: 0 });
        break;

      case 0x11: // 11xx - Set LFO speed
        commands.push({ cmd: DivCmd.PCE_LFO_SPEED, chan, val1: param, val2: 0 });
        break;

      case 0x12: // 12xx - Set wave
        commands.push({ cmd: DivCmd.WAVE, chan, val1: param, val2: 0 });
        break;
    }

    return commands;
  }

  /**
   * PSG effects (AY, SN76489, etc.)
   */
  private routePSGEffect(chan: number, effect: number, param: number): DispatchCommand[] {
    const commands: DispatchCommand[] = [];

    switch (effect) {
      case 0x10: // 10xx - Set envelope shape
        commands.push({ cmd: DivCmd.AY_ENVELOPE_SET, chan, val1: param, val2: 0 });
        break;

      case 0x11: // 11xx - Set envelope period low
        commands.push({ cmd: DivCmd.AY_ENVELOPE_LOW, chan, val1: param, val2: 0 });
        break;

      case 0x12: // 12xx - Set envelope period high
        commands.push({ cmd: DivCmd.AY_ENVELOPE_HIGH, chan, val1: param, val2: 0 });
        break;

      case 0x13: // 13xx - Auto-envelope
        commands.push({ cmd: DivCmd.AY_AUTO_ENVELOPE, chan, val1: param, val2: 0 });
        break;

      case 0x14: // 14xx - Noise frequency
        commands.push({ cmd: DivCmd.STD_NOISE_FREQ, chan, val1: param, val2: 0 });
        break;

      case 0x15: // 15xx - Noise mode
        commands.push({ cmd: DivCmd.STD_NOISE_MODE, chan, val1: param, val2: 0 });
        break;
    }

    return commands;
  }

  /**
   * Namco effects (WSG, N163)
   */
  private routeNamcoEffect(chan: number, effect: number, param: number): DispatchCommand[] {
    const commands: DispatchCommand[] = [];

    switch (effect) {
      case 0x10: // 10xx - Set wave
        commands.push({ cmd: DivCmd.WAVE, chan, val1: param, val2: 0 });
        break;

      // N163-specific
      case 0x11: // 11xx - Set wave position
        commands.push({ cmd: DivCmd.N163_WAVE_POSITION, chan, val1: param, val2: 0 });
        break;

      case 0x12: // 12xx - Set wave length
        commands.push({ cmd: DivCmd.N163_WAVE_LENGTH, chan, val1: param, val2: 0 });
        break;

      case 0x13: // 13xx - Set wave load position
        commands.push({ cmd: DivCmd.N163_WAVE_LOADPOS, chan, val1: param, val2: 0 });
        break;

      case 0x14: // 14xx - Set channel limit
        commands.push({ cmd: DivCmd.N163_CHANNEL_LIMIT, chan, val1: param, val2: 0 });
        break;
    }

    return commands;
  }

  /**
   * Sample-based chip effects
   */
  private routeSampleEffect(chan: number, effect: number, param: number): DispatchCommand[] {
    const commands: DispatchCommand[] = [];

    switch (effect) {
      case 0x10: // 10xx - Sample mode
        commands.push({ cmd: DivCmd.SAMPLE_MODE, chan, val1: param, val2: 0 });
        break;

      case 0x11: // 11xx - Sample bank
        commands.push({ cmd: DivCmd.SAMPLE_BANK, chan, val1: param, val2: 0 });
        break;

      case 0x12: // 12xx - Sample direction
        commands.push({ cmd: DivCmd.SAMPLE_DIR, chan, val1: param, val2: 0 });
        break;

      case 0x13: // 13xx - Sample position (high byte)
        commands.push({ cmd: DivCmd.SAMPLE_POS, chan, val1: param << 8, val2: 0 });
        break;

      // ES5506-specific filter effects
      case 0x14: // 14xx - Filter mode
        commands.push({ cmd: DivCmd.ES5506_FILTER_MODE, chan, val1: param, val2: 0 });
        break;

      case 0x15: // 15xx - Filter K1 (high byte)
        commands.push({ cmd: DivCmd.ES5506_FILTER_K1, chan, val1: param << 8, val2: 0xFF00 });
        break;

      case 0x16: // 16xx - Filter K2 (high byte)
        commands.push({ cmd: DivCmd.ES5506_FILTER_K2, chan, val1: param << 8, val2: 0xFF00 });
        break;

      // QSound-specific
      case 0x17: // 17xx - Echo feedback
        commands.push({ cmd: DivCmd.QSOUND_ECHO_FEEDBACK, chan, val1: param, val2: 0 });
        break;

      case 0x18: // 18xx - Echo level
        commands.push({ cmd: DivCmd.QSOUND_ECHO_LEVEL, chan, val1: param, val2: 0 });
        break;

      case 0x19: // 19xx - Surround
        commands.push({ cmd: DivCmd.QSOUND_SURROUND, chan, val1: param, val2: 0 });
        break;
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
