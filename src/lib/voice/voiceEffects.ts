/**
 * voiceEffects.ts - the tracker effect commands Voice to Notes can write.
 *
 * Pure, no imports. A VoiceEffect describes what the voice did on one note
 * (slid, wobbled, faded, came in late, was hit twice); a VoiceEffectSet turns
 * it into the effect column bytes of the pattern's notation. The detectors
 * (noteEffects.ts, drumToNotes.ts) produce VoiceEffects; the writer
 * (writeToPattern.ts) encodes them per channel, so the same take writes
 * `3xx` on an XM channel and `03xx` on a Furnace channel.
 */

export type VoiceEffectKind =
  | 'arpeggio'
  | 'portaUp'
  | 'portaDown'
  | 'tonePorta'
  | 'vibrato'
  | 'volumeSlide'
  | 'retrigger'
  | 'noteDelay';

/** One effect column: type and parameter as the pattern stores them. */
export interface EffectCommand {
  effTyp: number;
  eff: number;
}

/** An effect a note carries. */
export interface VoiceEffect {
  kind: VoiceEffectKind;
  /** The packed parameter byte (xy), 0..255. */
  param: number;
  /**
   * 0 = the note's own cell; > 0 = a later cell of the note's span (a slide
   * that starts after the note was struck).
   */
  rowOffset: number;
  /** When set, that cell also carries this note (the tone-portamento target). */
  midi?: number;
}

export type VoiceEffectNotation = 'tracker' | 'furnace';

/** Which effect wins a column when a note carries more than a channel can hold. */
const PRIORITY: readonly VoiceEffectKind[] = [
  'noteDelay',
  'tonePorta',
  'retrigger',
  'vibrato',
  'arpeggio',
  'volumeSlide',
  'portaUp',
  'portaDown',
];

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function clampNibble(v: number): number {
  return Math.max(1, Math.min(15, Math.round(v)));
}

/** XM / MOD / ProTracker notation: one hex type digit, Exy extended commands. */
function trackerCommand(kind: VoiceEffectKind, param: number): EffectCommand {
  const xy = clampByte(param);
  switch (kind) {
    case 'arpeggio':
      return { effTyp: 0x0, eff: xy };
    case 'portaUp':
      return { effTyp: 0x1, eff: xy };
    case 'portaDown':
      return { effTyp: 0x2, eff: xy };
    case 'tonePorta':
      return { effTyp: 0x3, eff: xy };
    case 'vibrato':
      return { effTyp: 0x4, eff: xy };
    case 'volumeSlide':
      return { effTyp: 0xa, eff: xy };
    case 'retrigger':
      return { effTyp: 0xe, eff: 0x90 | clampNibble(param) };
    case 'noteDelay':
      return { effTyp: 0xe, eff: 0xd0 | clampNibble(param) };
  }
}

/** Furnace notation: the raw 00..FF effect type. */
function furnaceCommand(kind: VoiceEffectKind, param: number): EffectCommand {
  const xy = clampByte(param);
  switch (kind) {
    case 'arpeggio':
      return { effTyp: 0x00, eff: xy };
    case 'portaUp':
      return { effTyp: 0x01, eff: xy };
    case 'portaDown':
      return { effTyp: 0x02, eff: xy };
    case 'tonePorta':
      return { effTyp: 0x03, eff: xy };
    case 'vibrato':
      return { effTyp: 0x04, eff: xy };
    case 'volumeSlide':
      return { effTyp: 0x0a, eff: xy };
    case 'retrigger':
      return { effTyp: 0x0c, eff: xy };
    case 'noteDelay':
      return { effTyp: 0xed, eff: xy };
  }
}

export interface VoiceEffectSet {
  notation: VoiceEffectNotation;
  /** Effect columns the channel can hold (1 on MOD, 2 on XM, more on Furnace). */
  maxColumns: number;
  /** One effect as a column; null when the notation cannot express it. */
  encode(kind: VoiceEffectKind, param: number): EffectCommand | null;
  /** The columns a cell gets for these effects: by priority, at most `maxColumns`. */
  commands(effects: readonly VoiceEffect[]): EffectCommand[];
}

/** The effect set for a channel's notation and column count. */
export function voiceEffectSet(notation: VoiceEffectNotation, maxEffectCols: number): VoiceEffectSet {
  const maxColumns = Math.max(1, Math.floor(maxEffectCols));
  const table = notation === 'furnace' ? furnaceCommand : trackerCommand;
  return {
    notation,
    maxColumns,
    encode: (kind, param) => table(kind, param),
    commands: (effects) =>
      [...effects]
        .sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind))
        .map((e) => table(e.kind, e.param))
        .slice(0, maxColumns),
  };
}

/** The effects of a note that land on its own cell (rowOffset 0). */
export function ownCellEffects(effects: readonly VoiceEffect[] | undefined): VoiceEffect[] {
  return (effects ?? []).filter((e) => e.rowOffset === 0);
}
