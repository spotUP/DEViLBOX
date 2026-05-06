/**
 * Controller Layout Descriptors — data-driven physical layout definitions
 *
 * Each hardware controller is described by a ControllerLayout that lists
 * every physical control with its position, type, MIDI address, and LED
 * capabilities. A single generic renderer (ControllerLayoutView) draws
 * any layout as an interactive visual.
 *
 * To add a new controller: create a ControllerLayout object and register
 * it in CONTROLLER_LAYOUTS at the bottom of this file.
 */

// ============================================================================
// TYPES
// ============================================================================

export type ControlType = 'encoder' | 'fader' | 'button' | 'pad';

export interface ControlMidiAddress {
  type: 'cc' | 'note' | 'pitchbend';
  channel: number;      // 0-indexed MIDI channel
  number: number;       // CC#, note#, or pitchbend channel
  /** For encoders with a push button — separate note for the push */
  pushNote?: number;
  pushChannel?: number;
}

export interface ControlDescriptor {
  /** Unique ID within the layout (e.g. 'enc-1', 'fader-3', 'btn-row1-5') */
  id: string;
  type: ControlType;
  /** Position in layout grid units */
  x: number;
  y: number;
  /** Size in grid units (defaults: encoder=1×1, button=1×1, fader=1×4) */
  w?: number;
  h?: number;
  /** Label printed on the physical device (if any) */
  label?: string;
  /** MIDI address for this control */
  midi: ControlMidiAddress;
  /** Encoder has LED ring */
  hasRingLed?: boolean;
  /** Button/pad has LED */
  hasLed?: boolean;
  /** Visual grouping name for rendering */
  group?: string;
}

export interface ControllerLayout {
  /** Must match DJControllerPreset.id */
  id: string;
  name: string;
  manufacturer: string;
  /** Virtual canvas size in grid units */
  width: number;
  height: number;
  /** All physical controls */
  controls: ControlDescriptor[];
}

// ============================================================================
// HELPER — build controls in bulk
// ============================================================================

function encoderRow(
  startX: number, y: number, count: number,
  ccStart: number, noteStart: number, channel: number,
  group: string, labels?: string[],
): ControlDescriptor[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${group}-${i + 1}`,
    type: 'encoder' as const,
    x: startX + i * 2,
    y,
    midi: { type: 'cc' as const, channel, number: ccStart + i, pushNote: noteStart + i, pushChannel: channel },
    hasRingLed: true,
    hasLed: true,
    group,
    label: labels?.[i],
  }));
}

function buttonRow(
  startX: number, y: number, count: number,
  noteStart: number, channel: number,
  group: string, labels?: string[],
): ControlDescriptor[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${group}-${i + 1}`,
    type: 'button' as const,
    x: startX + i * 2,
    y,
    midi: { type: 'note' as const, channel, number: noteStart + i },
    hasLed: true,
    group,
    label: labels?.[i],
  }));
}

function faderColumn(
  x: number, y: number,
  cc: number, channel: number,
  id: string, label?: string, group?: string,
): ControlDescriptor {
  return {
    id,
    type: 'fader',
    x,
    y,
    w: 1,
    h: 4,
    midi: { type: 'cc', channel, number: cc },
    group: group ?? 'faders',
    label,
  };
}

// ============================================================================
// BEHRINGER X-TOUCH COMPACT
// ============================================================================

const XTOUCH_COMPACT: ControllerLayout = {
  id: 'behringer-xtouch-compact',
  name: 'X-Touch Compact',
  manufacturer: 'Behringer',
  width: 22, // grid units
  height: 18,
  controls: [
    // ── Top encoder row (1 row × 8) ────────────────────────────
    ...encoderRow(0, 0, 8, 10, 0, 0, 'enc-top'),

    // ── Button rows (3 rows × 8) ──────────────────────────────
    ...buttonRow(0, 2, 8, 16, 0, 'btn-row1'),
    ...buttonRow(0, 4, 8, 24, 0, 'btn-row2'),
    ...buttonRow(0, 6, 8, 32, 0, 'btn-row3'),

    // ── Channel faders (8 + master) ────────────────────────────
    ...Array.from({ length: 8 }, (_, i) =>
      faderColumn(i * 2, 8, i + 1, 0, `fader-${i + 1}`, `${i + 1}`, 'faders'),
    ),
    faderColumn(16, 8, 9, 0, 'fader-master', 'M', 'faders'),

    // ── Select row (9 buttons below faders) ────────────────────
    ...buttonRow(0, 13, 9, 40, 0, 'select'),

    // ── Right encoder grid (2 columns × 4 rows) ───────────────
    ...Array.from({ length: 4 }, (_, row) => [
      {
        id: `enc-right-${row * 2 + 1}`,
        type: 'encoder' as const,
        x: 18, y: row * 2,
        midi: { type: 'cc' as const, channel: 0, number: 18 + row * 2, pushNote: 8 + row * 2, pushChannel: 0 },
        hasRingLed: true,
        hasLed: true,
        group: 'enc-right',
      },
      {
        id: `enc-right-${row * 2 + 2}`,
        type: 'encoder' as const,
        x: 20, y: row * 2,
        midi: { type: 'cc' as const, channel: 0, number: 19 + row * 2, pushNote: 9 + row * 2, pushChannel: 0 },
        hasRingLed: true,
        hasLed: true,
        group: 'enc-right',
      },
    ]).flat(),

    // ── Transport (4 rows × 2 columns) ────────────────────────
    ...([
      ['rew', 'fwd', 49, 50],
      ['loop', 'rec', 51, 52],
      ['stop', 'play', 53, 54],
    ] as const).flatMap(([labelA, labelB, noteA, noteB], row) => [
      {
        id: `transport-${labelA}`,
        type: 'button' as const,
        x: 18, y: 9 + row * 2,
        midi: { type: 'note' as const, channel: 0, number: noteA },
        hasLed: true,
        group: 'transport',
        label: labelA,
      },
      {
        id: `transport-${labelB}`,
        type: 'button' as const,
        x: 20, y: 9 + row * 2,
        midi: { type: 'note' as const, channel: 0, number: noteB },
        hasLed: true,
        group: 'transport',
        label: labelB,
      },
    ]),

    // Layer A / Layer B (program change — non-mappable indicators)
    {
      id: 'layer-a',
      type: 'button',
      x: 18, y: 15,
      midi: { type: 'note', channel: 0, number: -1 }, // program change, not note
      hasLed: true,
      group: 'transport',
      label: 'Layer A',
    },
    {
      id: 'layer-b',
      type: 'button',
      x: 20, y: 15,
      midi: { type: 'note', channel: 0, number: -2 }, // program change, not note
      hasLed: true,
      group: 'transport',
      label: 'Layer B',
    },
  ],
};

// ============================================================================
// NATIVE INSTRUMENTS MASCHINE MK2
// ============================================================================

// Button name → MIDI note on ch 14 (from MaschineHIDBridge.ts BUTTON_NOTES)
const MK2_BTN: Record<string, number> = {
  soft1: 104, soft2: 105, soft3: 106, soft4: 107,
  soft5: 108, soft6: 109, soft7: 110, soft8: 111,
  control: 88, step: 89, browse: 90, sampling: 91,
  pageRight: 92, pageLeft: 93, all: 94, auto: 95,
  volume: 96, swing: 97, tempo: 98,
  navLeft: 99, navRight: 100, enter: 101, noteRepeat: 102, nav: 103,
  groupA: 0, groupB: 1, groupC: 2, groupD: 3,
  groupE: 4, groupF: 5, groupG: 6, groupH: 7,
  restart: 119, stepLeft: 120, stepRight: 121, grid: 122,
  play: 116, rec: 117, erase: 118, shift: 123,
  scene: 80, pattern: 81, padMode: 82, navigate: 83,
  duplicate: 84, select: 85, solo: 86, mute: 87,
};

function mk2Button(
  x: number, y: number, name: string, label?: string, group?: string,
): ControlDescriptor {
  return {
    id: `btn-${name}`,
    type: 'button',
    x, y,
    midi: { type: 'note', channel: 14, number: MK2_BTN[name] ?? 0 },
    hasLed: true,
    group: group ?? 'buttons',
    label: label ?? name,
  };
}

const MASCHINE_MK2: ControllerLayout = {
  id: 'ni-maschine-mk2',
  name: 'Maschine MK2',
  manufacturer: 'Native Instruments',
  width: 22,
  height: 24,
  controls: [
    // ── Soft buttons (8, above screens) ─────────────────────────
    ...['soft1', 'soft2', 'soft3', 'soft4', 'soft5', 'soft6', 'soft7', 'soft8'].map(
      (name, i) => mk2Button(i * 2, 0, name, `S${i + 1}`, 'soft-buttons'),
    ),

    // ── 8 encoders (CC 70-77, ch 15) ────────────────────────────
    ...Array.from({ length: 8 }, (_, i): ControlDescriptor => ({
      id: `knob-${i + 1}`,
      type: 'encoder',
      x: i * 2, y: 2,
      midi: { type: 'cc', channel: 15, number: 70 + i },
      hasRingLed: false,
      group: 'knobs',
      label: `Knob ${i + 1}`,
    })),

    // ── Mode buttons row ────────────────────────────────────────
    mk2Button(0,  4, 'control',  'Control',  'mode'),
    mk2Button(2,  4, 'step',     'Step',     'mode'),
    mk2Button(4,  4, 'browse',   'Browse',   'mode'),
    mk2Button(6,  4, 'sampling', 'Sampling', 'mode'),
    mk2Button(10, 4, 'pageLeft', 'Page Left','navigate'),
    mk2Button(12, 4, 'pageRight','Page Right','navigate'),
    mk2Button(14, 4, 'all',      'All',      'mode'),
    mk2Button(16, 4, 'auto',     'Auto',     'mode'),

    // ── Left column buttons ─────────────────────────────────────
    mk2Button(0, 6,  'scene',     'Scene',     'left-col'),
    mk2Button(0, 8,  'pattern',   'Pattern',   'left-col'),
    mk2Button(0, 10, 'padMode',   'Pad Mode',  'left-col'),
    mk2Button(0, 12, 'navigate',  'Navigate',  'left-col'),
    mk2Button(0, 14, 'duplicate', 'Duplicate', 'left-col'),
    mk2Button(0, 16, 'select',    'Select',    'left-col'),
    mk2Button(0, 18, 'solo',      'Solo',      'left-col'),
    mk2Button(0, 20, 'mute',      'Mute',      'left-col'),

    // ── Encoder area (right of left column) ─────────────────────
    mk2Button(4, 6, 'volume', 'Volume', 'encoder-area'),
    mk2Button(6, 6, 'swing',  'Swing',  'encoder-area'),
    mk2Button(8, 6, 'tempo',  'Tempo',  'encoder-area'),
    // Main encoder (nav push)
    {
      id: 'main-encoder',
      type: 'encoder',
      x: 12, y: 6,
      midi: { type: 'note', channel: 14, number: MK2_BTN['nav'] },
      hasRingLed: false,
      group: 'encoder-area',
      label: 'Navigate',
    },
    mk2Button(10, 8, 'navLeft',    'Nav Left',    'encoder-area'),
    mk2Button(14, 8, 'navRight',   'Nav Right',   'encoder-area'),
    mk2Button(12, 8, 'enter',      'Enter',       'encoder-area'),
    mk2Button(16, 6, 'noteRepeat', 'Note Repeat', 'encoder-area'),

    // ── Group buttons A-H ───────────────────────────────────────
    ...['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map(
      (letter, i) => mk2Button(4 + i * 2, 10, `group${letter}`, `Group ${letter}`, 'groups'),
    ),

    // ── 4×4 pad grid (notes 36-51 on ch 15) ────────────────────
    // NI pads are numbered bottom-left to top-right:
    // Row 3 (top):    pad 13, 14, 15, 16
    // Row 2:          pad  9, 10, 11, 12
    // Row 1:          pad  5,  6,  7,  8
    // Row 0 (bottom): pad  1,  2,  3,  4
    ...Array.from({ length: 16 }, (_, i): ControlDescriptor => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      return {
        id: `pad-${i + 1}`,
        type: 'pad',
        x: 4 + col * 2,
        y: 18 - row * 2, // bottom row at y=18, top at y=12
        midi: { type: 'note', channel: 15, number: 36 + i },
        hasLed: true,
        group: 'pads',
        label: `${i + 1}`,
      };
    }),

    // ── Transport row ───────────────────────────────────────────
    mk2Button(4,  22, 'restart',   'Restart',   'transport'),
    mk2Button(6,  22, 'stepLeft',  'Step Left', 'transport'),
    mk2Button(8,  22, 'stepRight', 'Step Right','transport'),
    mk2Button(10, 22, 'grid',      'Grid',      'transport'),
    mk2Button(14, 22, 'play',      'Play',      'transport'),
    mk2Button(16, 22, 'rec',       'Record',    'transport'),
    mk2Button(18, 22, 'erase',     'Erase',     'transport'),
    mk2Button(20, 22, 'shift',     'Shift',     'transport'),
  ],
};

// ============================================================================
// REGISTRY
// ============================================================================

/** All known controller layouts, keyed by preset ID */
export const CONTROLLER_LAYOUTS = new Map<string, ControllerLayout>([
  [XTOUCH_COMPACT.id, XTOUCH_COMPACT],
  [MASCHINE_MK2.id, MASCHINE_MK2],
]);

/** Get layout for a preset, or null if none defined */
export function getControllerLayout(presetId: string): ControllerLayout | null {
  return CONTROLLER_LAYOUTS.get(presetId) ?? null;
}

// ============================================================================
// PRESET MERGE — apply user overrides onto a factory DJControllerPreset
// ============================================================================

import type { ControlAssignment, ControllerOverrides } from '@/stores/useMIDIPresetStore';
import type {
  DJControllerPreset,
  DJControllerCCMapping,
  DJControllerNoteMapping,
} from '@/midi/djControllerPresets';

/**
 * Merge user overrides into a factory preset, producing a new preset.
 *
 * For each user override:
 * - If the control is a CC (encoder/fader), replaces or adds a ccMapping
 * - If the control is a note (button), replaces or adds a noteMapping
 */
export function mergeOverridesIntoPreset(
  preset: DJControllerPreset,
  overrides: ControllerOverrides,
  layout: ControllerLayout,
): DJControllerPreset {
  if (Object.keys(overrides).length === 0) return preset;

  const ccMappings = [...preset.ccMappings];
  const noteMappings = [...preset.noteMappings];

  for (const [controlId, assignment] of Object.entries(overrides)) {
    const control = layout.controls.find((c) => c.id === controlId);
    if (!control) continue;

    applyOverrideToMappings(control, assignment, ccMappings, noteMappings);
  }

  return { ...preset, ccMappings, noteMappings };
}

function applyOverrideToMappings(
  control: ControlDescriptor,
  assignment: ControlAssignment,
  ccMappings: DJControllerCCMapping[],
  noteMappings: DJControllerNoteMapping[],
): void {
  const { midi } = control;

  if (midi.type === 'cc') {
    // Remove existing CC mapping for this control
    const idx = ccMappings.findIndex(
      (m) => m.channel === midi.channel && m.cc === midi.number,
    );
    if (idx >= 0) ccMappings.splice(idx, 1);

    // Add new mapping
    if (assignment.kind === 'param' || assignment.kind === 'dub') {
      ccMappings.push({
        channel: midi.channel,
        cc: midi.number,
        param: assignment.target,
        invert: assignment.invert,
      });
    }
  }

  if (midi.type === 'note' || midi.pushNote !== undefined) {
    const noteNum = midi.type === 'note' ? midi.number : midi.pushNote!;
    const noteCh = midi.type === 'note' ? midi.channel : (midi.pushChannel ?? midi.channel);

    // Remove existing note mapping
    const idx = noteMappings.findIndex(
      (m) => m.channel === noteCh && m.note === noteNum,
    );
    if (idx >= 0) noteMappings.splice(idx, 1);

    // Add new mapping
    if (assignment.kind === 'action') {
      noteMappings.push({
        channel: noteCh,
        note: noteNum,
        action: assignment.target,
      });
    } else if (assignment.kind === 'param' || assignment.kind === 'dub') {
      noteMappings.push({
        channel: noteCh,
        note: noteNum,
        param: assignment.target,
        onValue: assignment.onValue,
        offValue: assignment.offValue,
      });
    }
  }
}
