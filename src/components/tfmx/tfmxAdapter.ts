/**
 * TFMX Adapter — Maps TFMXNativeData to format-agnostic FormatChannel[].
 *
 * Single source of truth for TFMX data display. Both DOM and Pixi views
 * consume FormatChannel[] from these functions — no logic duplication.
 */

import type { ColumnDef, FormatCell, FormatChannel } from '@/components/shared/format-editor-types';
import type { TFMXNativeData, TFMXPatternCommand, TFMXTrackstepEntry } from '@/types/tfmxNative';

// ── Helpers ──────────────────────────────────────────────────────────────────

const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

/** Convert TFMX note index (0-63) to display string */
export function tfmxNoteToString(noteIdx: number): string {
  if (noteIdx < 0 || noteIdx > 63) return '---';
  const octave = Math.floor(noteIdx / 12);
  const semitone = noteIdx % 12;
  return `${NOTE_NAMES[semitone]}${octave}`;
}

function hex2(val: number): string {
  if (val < 0) return '--';
  return val.toString(16).toUpperCase().padStart(2, '0');
}

// ── EFFE command names ───────────────────────────────────────────────────────

const EFFE_NAMES: Record<number, string> = {
  0x0000: 'STOP',
  0x0001: 'LOOP',
  0x0002: 'TEMPO',
  0x0003: 'FADE DN',
  0x0004: 'FADE UP',
};

export function effeCommandToString(cmd: number, param: number): string {
  const name = EFFE_NAMES[cmd] ?? `CMD ${hex2(cmd >> 8)}${hex2(cmd & 0xFF)}`;
  return param > 0 ? `${name} ${hex2(param >> 8)}${hex2(param & 0xFF)}` : name;
}

// ── Pattern command type descriptions ────────────────────────────────────────

const CMD_NAMES: Record<string, string> = {
  note: 'Note',
  noteWait: 'Note+Wait',
  portamento: 'Porta',
  end: 'End',
  loop: 'Loop',
  jump: 'Jump',
  wait: 'Wait',
  stop: 'Stop',
  keyup: 'Key Up',
  vibrato: 'Vibrato',
  envelope: 'Envelope',
  command: 'Cmd',
};

function commandEffectString(cmd: TFMXPatternCommand): string {
  const base = CMD_NAMES[cmd.type] ?? cmd.type;
  if (cmd.type === 'wait' && cmd.wait !== undefined) return `Wait ${cmd.wait}`;
  if (cmd.type === 'loop') return `Loop ${hex2(cmd.byte1)}`;
  if (cmd.type === 'jump') return `Jump ${hex2(cmd.byte1)}`;
  if (cmd.type === 'vibrato') return `Vib ${hex2(cmd.byte1)}:${hex2(cmd.byte3)}`;
  if (cmd.type === 'envelope') return `Env ${hex2(cmd.byte1)}:${hex2(cmd.byte3)}`;
  if (cmd.type === 'command') return `F${cmd.byte0.toString(16).toUpperCase().slice(-1)} ${hex2(cmd.byte1)}`;
  return base;
}

// ── Trackstep Matrix Columns ─────────────────────────────────────────────────

function makeVoiceColumn(voiceIdx: number): ColumnDef {
  return {
    key: `v${voiceIdx}`,
    label: `Voice ${voiceIdx}`,
    charWidth: 7,
    type: 'hex' as const,
    color: '#e0a050',
    emptyColor: '#404040',
    emptyValue: -1,
    hexDigits: 2,
    pixiColor: 0xe0a050,
    pixiEmptyColor: 0x404040,
    formatter: (val: number) => {
      if (val === -1) return '  ---  ';
      if (val === -2) return ' HOLD  ';
      // val encodes: patternNum in bits 15-8, transpose in bits 7-0
      const pat = (val >> 8) & 0xFF;
      const transByte = val & 0xFF;
      const trans = transByte > 127 ? transByte - 256 : transByte;
      const sign = trans >= 0 ? '+' : '-';
      return `P${pat.toString().padStart(2, '0')}:${sign}${hex2(Math.abs(trans))}`;
    },
  };
}

export const TFMX_TRACKSTEP_COLUMNS: ColumnDef[] = [
  makeVoiceColumn(0),
  makeVoiceColumn(1),
  makeVoiceColumn(2),
  makeVoiceColumn(3),
];

// ── Pattern Editor Columns ───────────────────────────────────────────────────

export const TFMX_PATTERN_COLUMNS: ColumnDef[] = [
  {
    key: 'raw',
    label: 'Raw',
    charWidth: 9,
    type: 'hex',
    color: '#808080',
    emptyColor: '#303030',
    emptyValue: undefined,
    hexDigits: 4,
    pixiColor: 0x808080,
    pixiEmptyColor: 0x303030,
    formatter: (val: number) => {
      const b0 = (val >>> 24) & 0xFF;
      const b1 = (val >>> 16) & 0xFF;
      const b2 = (val >>> 8) & 0xFF;
      const b3 = val & 0xFF;
      return `${hex2(b0)} ${hex2(b1)} ${hex2(b2)}${hex2(b3)}`;
    },
  },
  {
    key: 'note',
    label: 'Note',
    charWidth: 3,
    type: 'note',
    color: '#e0c060',
    emptyColor: '#404030',
    emptyValue: -1,
    pixiColor: 0xe0c060,
    pixiEmptyColor: 0x404030,
    formatter: (val: number) => val < 0 ? '---' : tfmxNoteToString(val),
  },
  {
    key: 'macro',
    label: 'Mac',
    charWidth: 2,
    type: 'hex',
    color: '#60e060',
    emptyColor: '#304030',
    emptyValue: -1,
    hexDigits: 2,
    pixiColor: 0x60e060,
    pixiEmptyColor: 0x304030,
    formatter: (val: number) => val < 0 ? '--' : hex2(val),
  },
  {
    key: 'wait',
    label: 'Wt',
    charWidth: 2,
    type: 'hex',
    color: '#60c0e0',
    emptyColor: '#303840',
    emptyValue: -1,
    hexDigits: 2,
    pixiColor: 0x60c0e0,
    pixiEmptyColor: 0x303840,
    formatter: (val: number) => val < 0 ? '--' : hex2(val),
  },
  {
    key: 'detune',
    label: 'Dt',
    charWidth: 2,
    type: 'hex',
    color: '#c080e0',
    emptyColor: '#383040',
    emptyValue: -1,
    hexDigits: 2,
    pixiColor: 0xc080e0,
    pixiEmptyColor: 0x383040,
    formatter: (val: number) => val < 0 ? '--' : hex2(val),
  },
  {
    key: 'effect',
    label: 'Effect',
    charWidth: 9,
    type: 'hex',
    color: '#a0a0a0',
    emptyColor: '#383838',
    emptyValue: 0,
    hexDigits: 2,
    pixiColor: 0xa0a0a0,
    pixiEmptyColor: 0x383838,
    formatter: () => '',  // effect text is handled by commandEffectString in the cell
  },
];

// ── Trackstep → FormatChannel[] ──────────────────────────────────────────────

/**
 * Convert the trackstep matrix for the active subsong into FormatChannel[].
 * Returns one FormatChannel per voice (4 channels), where each row is a trackstep entry.
 * EFFE rows are encoded with a special flag value in all voice cells.
 */
export function tfmxTrackstepToChannels(native: TFMXNativeData): FormatChannel[] {
  const channels: FormatChannel[] = [];
  const activeSteps = native.tracksteps;

  for (let v = 0; v < native.numVoices; v++) {
    const rows: FormatCell[] = [];

    for (const step of activeSteps) {
      if (step.isEFFE) {
        // EFFE command: encode as special value in all voice columns
        // Use -3 to distinguish from hold (-2) and stop (-1)
        rows.push({
          [`v${v}`]: -3,
          effeCommand: step.effeCommand ?? 0,
          effeParam: step.effeParam ?? 0,
          stepIndex: step.stepIndex,
        });
      } else {
        const voice = step.voices[v];
        if (!voice || voice.isStop) {
          rows.push({ [`v${v}`]: -1, stepIndex: step.stepIndex });
        } else if (voice.isHold) {
          rows.push({ [`v${v}`]: -2, stepIndex: step.stepIndex });
        } else {
          // Pack pattern number + transpose into single value
          const transByte = voice.transpose < 0 ? voice.transpose + 256 : voice.transpose;
          rows.push({
            [`v${v}`]: (voice.patternNum << 8) | (transByte & 0xFF),
            stepIndex: step.stepIndex,
          });
        }
      }
    }

    channels.push({
      label: `Voice ${v}`,
      patternLength: rows.length,
      rows,
      isPatternChannel: true,
    });
  }

  return channels;
}

/**
 * Get the trackstep entries for the active subsong (for matrix rendering).
 */
export function tfmxGetActiveSteps(native: TFMXNativeData): TFMXTrackstepEntry[] {
  return native.tracksteps;
}

// ── Pattern → FormatChannel[] ────────────────────────────────────────────────

/**
 * Convert a single TFMX pattern from the pool into FormatChannel[] for the pattern editor.
 * Returns a single FormatChannel with TFMX_PATTERN_COLUMNS.
 */
export function tfmxPatternToChannels(
  native: TFMXNativeData,
  patternIdx: number,
): FormatChannel[] {
  if (patternIdx < 0 || patternIdx >= native.patterns.length) {
    return [{
      label: `Pattern ${patternIdx} (empty)`,
      patternLength: 0,
      rows: [],
      columns: TFMX_PATTERN_COLUMNS,
      isPatternChannel: true,
    }];
  }

  const commands = native.patterns[patternIdx];
  const rows: FormatCell[] = commands.map(cmd => ({
    raw: cmd.raw,
    note: cmd.note ?? -1,
    macro: cmd.macro ?? -1,
    wait: cmd.wait !== undefined ? cmd.wait : -1,
    detune: cmd.detune !== undefined ? cmd.detune : -1,
    effect: 0,  // placeholder — the actual text comes from commandEffectString
  }));

  return [{
    label: `Pattern ${patternIdx.toString().padStart(3, '0')} (${commands.length} cmds)`,
    patternLength: rows.length,
    rows,
    columns: TFMX_PATTERN_COLUMNS,
    isPatternChannel: true,
  }];
}

/**
 * Get a human-readable effect description for a pattern command.
 */
export { commandEffectString as tfmxCommandEffectString };
