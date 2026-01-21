/**
 * EffectProcessor - FastTracker II Effect Parsing & Processing
 *
 * Handles FT2-style pattern effects including:
 * - Extended E-commands (E0-EF sub-commands)
 * - Per-tick effect processing
 * - Volume column effects
 */

// Effect parsing result
export interface ParsedEffect {
  command: string;      // Effect letter (e.g., 'E', 'A', 'T')
  subCommand?: number;  // 0-F for E-effects
  param: number;        // Effect parameter (0-FF)
}

/**
 * Parse an effect string into structured data
 * @param effectString - Effect string (e.g., "EC5", "A08", "T120")
 * @returns Parsed effect object
 */
export function parseEffect(effectString: string | null): ParsedEffect | null {
  if (!effectString || effectString.length < 2) return null;

  const command = effectString[0].toUpperCase();

  // E-effects have sub-commands (second character is hex digit 0-F)
  if (command === 'E' && effectString.length >= 3) {
    const subCommandChar = effectString[1];
    const paramChar = effectString[2];

    return {
      command: 'E',
      subCommand: parseInt(subCommandChar, 16),
      param: parseInt(paramChar, 16),
    };
  }

  // Regular effects (non-E-effects)
  const paramString = effectString.slice(1);
  return {
    command,
    param: parseInt(paramString, 16),
  };
}

/**
 * E-effect types (FT2 standard)
 */
export const EEffect = {
  // E0x - Set filter (Amiga only, not implemented)
  SET_FILTER: 0x0,

  // E1x - Fine porta up
  FINE_PORTA_UP: 0x1,

  // E2x - Fine porta down
  FINE_PORTA_DOWN: 0x2,

  // E3x - Set glissando control
  SET_GLISSANDO: 0x3,

  // E4x - Set vibrato waveform
  SET_VIBRATO_WAVEFORM: 0x4,

  // E5x - Set finetune
  SET_FINETUNE: 0x5,

  // E6x - Pattern loop
  PATTERN_LOOP: 0x6,

  // E7x - Set tremolo waveform
  SET_TREMOLO_WAVEFORM: 0x7,

  // E8x - Set panning (0-F = left to right)
  SET_PANNING: 0x8,

  // E9x - Retrigger note every X ticks
  RETRIGGER_NOTE: 0x9,

  // EAx - Fine volume slide up
  FINE_VOLUME_SLIDE_UP: 0xA,

  // EBx - Fine volume slide down
  FINE_VOLUME_SLIDE_DOWN: 0xB,

  // ECx - Note cut after X ticks
  NOTE_CUT: 0xC,

  // EDx - Note delay X ticks
  NOTE_DELAY: 0xD,

  // EEx - Pattern delay X rows
  PATTERN_DELAY: 0xE,

  // EFx - Invert loop (Amiga only, not implemented)
  INVERT_LOOP: 0xF,
} as const;

export type EEffectType = typeof EEffect[keyof typeof EEffect];

/**
 * Volume column effect types (FT2 standard)
 * Volume column value encoding:
 * 0x00-0x40: Set volume (0-64)
 * 0x60-0x6F: Volume slide down
 * 0x70-0x7F: Volume slide up
 * 0x80-0x8F: Fine volume slide down
 * 0x90-0x9F: Fine volume slide up
 * 0xA0-0xAF: Set vibrato speed
 * 0xB0-0xBF: Vibrato
 * 0xC0-0xCF: Set panning
 * 0xD0-0xDF: Panning slide left
 * 0xE0-0xEF: Panning slide right
 * 0xF0-0xFF: Porta to note
 */
export interface VolumeColumnEffect {
  type: 'set' | 'slideDown' | 'slideUp' | 'fineSlideDown' | 'fineSlideUp' |
        'vibrato' | 'vibratoSpeed' | 'pan' | 'panSlideLeft' | 'panSlideRight' | 'porta';
  param: number;
}

/**
 * Decode volume column value into effect type and parameter
 * @param value - Volume column value (0x00-0xFF)
 * @returns Decoded volume effect
 */
export function decodeVolumeColumn(value: number | null): VolumeColumnEffect | null {
  if (value === null || value === undefined) return null;

  const high = (value >> 4) & 0xF;
  const low = value & 0xF;

  // 0x00-0x40: Set volume
  if (value <= 0x40) {
    return { type: 'set', param: value };
  }

  // 0x60-0x6F: Volume slide down
  if (high === 0x6) {
    return { type: 'slideDown', param: low };
  }

  // 0x70-0x7F: Volume slide up
  if (high === 0x7) {
    return { type: 'slideUp', param: low };
  }

  // 0x80-0x8F: Fine volume slide down
  if (high === 0x8) {
    return { type: 'fineSlideDown', param: low };
  }

  // 0x90-0x9F: Fine volume slide up
  if (high === 0x9) {
    return { type: 'fineSlideUp', param: low };
  }

  // 0xA0-0xAF: Set vibrato speed
  if (high === 0xA) {
    return { type: 'vibratoSpeed', param: low };
  }

  // 0xB0-0xBF: Vibrato
  if (high === 0xB) {
    return { type: 'vibrato', param: low };
  }

  // 0xC0-0xCF: Set panning
  if (high === 0xC) {
    return { type: 'pan', param: low };
  }

  // 0xD0-0xDF: Panning slide left
  if (high === 0xD) {
    return { type: 'panSlideLeft', param: low };
  }

  // 0xE0-0xEF: Panning slide right
  if (high === 0xE) {
    return { type: 'panSlideRight', param: low };
  }

  // 0xF0-0xFF: Porta to note
  if (high === 0xF) {
    return { type: 'porta', param: low };
  }

  return null;
}

/**
 * Encode volume effect into volume column value
 * @param effect - Volume effect
 * @returns Encoded volume column value
 */
export function encodeVolumeColumn(effect: VolumeColumnEffect): number {
  switch (effect.type) {
    case 'set':
      return Math.min(0x40, Math.max(0, effect.param));
    case 'slideDown':
      return 0x60 | (effect.param & 0xF);
    case 'slideUp':
      return 0x70 | (effect.param & 0xF);
    case 'fineSlideDown':
      return 0x80 | (effect.param & 0xF);
    case 'fineSlideUp':
      return 0x90 | (effect.param & 0xF);
    case 'vibratoSpeed':
      return 0xA0 | (effect.param & 0xF);
    case 'vibrato':
      return 0xB0 | (effect.param & 0xF);
    case 'pan':
      return 0xC0 | (effect.param & 0xF);
    case 'panSlideLeft':
      return 0xD0 | (effect.param & 0xF);
    case 'panSlideRight':
      return 0xE0 | (effect.param & 0xF);
    case 'porta':
      return 0xF0 | (effect.param & 0xF);
    default:
      return 0;
  }
}

/**
 * Format effect for display in tracker
 * @param effectString - Effect string (e.g., "EC5", "A08")
 * @returns Formatted display string
 */
export function formatEffect(effectString: string | null): string {
  if (!effectString) return '...';

  const parsed = parseEffect(effectString);
  if (!parsed) return '...';

  if (parsed.command === 'E' && parsed.subCommand !== undefined) {
    // E-effects: display as "EXY" where X is sub-command, Y is param
    return `E${parsed.subCommand.toString(16).toUpperCase()}${parsed.param.toString(16).toUpperCase()}`;
  }

  // Regular effects: display as "CXX" where C is command, XX is param
  return `${parsed.command}${parsed.param.toString(16).padStart(2, '0').toUpperCase()}`;
}

/**
 * Format volume column for display
 * @param volume - Volume value (0x00-0xFF)
 * @returns Formatted display string
 */
export function formatVolumeColumn(volume: number | null): string {
  if (volume === null || volume === undefined) return '..';

  // Simple volume values (0x00-0x40) display as decimal
  if (volume <= 0x40) {
    return volume.toString().padStart(2, '0');
  }

  // Effect values display as hex
  return volume.toString(16).padStart(2, '0').toUpperCase();
}

/**
 * Check if an effect should be processed per-tick (vs per-row)
 * @param effect - Parsed effect
 * @returns True if effect should be processed every tick
 */
export function isPerTickEffect(effect: ParsedEffect): boolean {
  if (effect.command === 'E' && effect.subCommand !== undefined) {
    switch (effect.subCommand) {
      case EEffect.NOTE_CUT:
      case EEffect.NOTE_DELAY:
      case EEffect.RETRIGGER_NOTE:
        return true;
      default:
        return false;
    }
  }

  // Other per-tick effects can be added here
  return false;
}

/**
 * Get effect description for tooltip/help
 * @param effect - Parsed effect
 * @returns Human-readable effect description
 */
export function getEffectDescription(effect: ParsedEffect): string {
  if (effect.command === 'E' && effect.subCommand !== undefined) {
    switch (effect.subCommand) {
      case EEffect.FINE_PORTA_UP:
        return `Fine portamento up (${effect.param})`;
      case EEffect.FINE_PORTA_DOWN:
        return `Fine portamento down (${effect.param})`;
      case EEffect.PATTERN_LOOP:
        return effect.param === 0 ? 'Set loop point' : `Loop ${effect.param} times`;
      case EEffect.RETRIGGER_NOTE:
        return `Retrigger every ${effect.param} ticks`;
      case EEffect.FINE_VOLUME_SLIDE_UP:
        return `Fine volume slide up (${effect.param})`;
      case EEffect.FINE_VOLUME_SLIDE_DOWN:
        return `Fine volume slide down (${effect.param})`;
      case EEffect.NOTE_CUT:
        return `Note cut after ${effect.param} ticks`;
      case EEffect.NOTE_DELAY:
        return `Note delay ${effect.param} ticks`;
      case EEffect.PATTERN_DELAY:
        return `Pattern delay ${effect.param} rows`;
      case EEffect.SET_PANNING:
        return `Set panning (${effect.param}/15)`;
      default:
        return `E-effect ${effect.subCommand.toString(16).toUpperCase()}${effect.param.toString(16).toUpperCase()}`;
    }
  }

  // Add descriptions for other effect types here
  return `Effect ${effect.command}${effect.param.toString(16).padStart(2, '0').toUpperCase()}`;
}
