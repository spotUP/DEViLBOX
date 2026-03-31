/**
 * EditorBehavior — Per-scheme behavior profiles.
 *
 * When a user selects a keyboard scheme (FT2, ProTracker, IT, etc.),
 * the editor doesn't just remap keys — it changes HOW the editor behaves:
 * cursor movement, edit step triggers, delete semantics, note-off types, etc.
 *
 * Each scheme gets a behavior profile that input handlers consult.
 */

// ── Note-off configuration ──────────────────────────────────────────────────

export interface NoteOffConfig {
  /** Key that enters note-off (=== in XM). null = not available */
  noteOffKey: 'CapsLock' | '`' | null;
  /** Key that enters note-cut (^^^ in IT). null = not available */
  noteCutKey: '1' | 'CapsLock' | null;
  /** Key that enters note-fade (~~~ in IT). null = not available */
  noteFadeKey: 'Shift+`' | null;
  /** Display strings */
  noteOffDisplay: string;   // '===' or 'OFF'
  noteCutDisplay: string;   // '^^^' or ''
  noteFadeDisplay: string;  // '~~~' or ''
}

// ── Main behavior interface ─────────────────────────────────────────────────

export interface EditorBehavior {
  readonly name: string;

  // ── Note entry ──────────────────────────────────────────────────────────
  /** Valid octave range */
  readonly octaveRange: readonly [number, number];
  /** How octave is selected:
   *  'fkeys-direct' = F1-F7 set octave directly (FT2)
   *  'fkeys-lohi'   = F1/F2 toggle low/high octave (PT)
   *  'numpad-only'  = only numpad +/- adjusts octave (IT) */
  readonly octaveSelectMode: 'fkeys-direct' | 'fkeys-lohi' | 'numpad-only';
  /** Edit step range [min, max] */
  readonly editStepRange: readonly [number, number];
  /** Key that cycles edit step, or null if no cycle key */
  readonly editStepCycleKey: '`' | null;
  /** Note-off/cut/fade configuration */
  readonly noteOff: NoteOffConfig;

  // ── Cursor behavior ─────────────────────────────────────────────────────
  /** Cursor wraps top↔bottom at pattern boundaries */
  readonly cursorWrapVertical: boolean;
  /** Cursor wraps left↔right across channels */
  readonly cursorWrapHorizontal: boolean;
  /** Tab key behavior:
   *  'next-channel' = jump to next channel's note column (FT2/PT)
   *  'cycle-columns' = cycle through columns within channel, then next channel (IT) */
  readonly tabBehavior: 'next-channel' | 'cycle-columns';
  /** Home/End behavior:
   *  'row-jump' = Home=row 0, End=last row (FT2/PT)
   *  'double-press' = first press=start/end of row, second=row 0/last (IT) */
  readonly homeEndBehavior: 'row-jump' | 'double-press';

  // ── Edit step advancement ───────────────────────────────────────────────
  /** Advance cursor after entering a note */
  readonly advanceOnNote: boolean;
  /** Advance after entering instrument digit */
  readonly advanceOnInstrument: boolean;
  /** Advance after entering volume digit */
  readonly advanceOnVolume: boolean;
  /** Advance after entering effect/param digit */
  readonly advanceOnEffect: boolean;
  /** Advance after pressing Delete */
  readonly advanceOnDelete: boolean;

  // ── Delete behavior ─────────────────────────────────────────────────────
  /** What Delete clears:
   *  'note-inst-vol' = clears note + instrument + volume (FT2)
   *  'cursor-field'  = clears only the field at cursor (IT)
   *  'note-sample'   = clears note + sample number (PT) */
  readonly deleteClearsWhat: 'note-inst-vol' | 'cursor-field' | 'note-sample';

  // ── Selection ───────────────────────────────────────────────────────────
  /** Modifier key for extending selection with arrows:
   *  'alt'   = Alt+arrows (FT2)
   *  'shift' = Shift+arrows (IT/Renoise) */
  readonly selectionModifier: 'alt' | 'shift';

  // ── Volume column ───────────────────────────────────────────────────────
  /** Whether this scheme uses a volume column */
  readonly volumeColumnEnabled: boolean;

  // ── Scheme-specific feature flags ───────────────────────────────────────
  /** ProTracker: numpad selects samples (not octave) */
  readonly ptNumpadSampleSelect: boolean;
  /** ProTracker: Alt+0-9 effect macro slots */
  readonly ptEffectMacros: boolean;
  /** Impulse Tracker: comma toggles copy/paste masks */
  readonly itMaskVariables: boolean;
  /** Impulse Tracker: three note-off types */
  readonly itThreeNoteTypes: boolean;
}

// ── Behavior profiles ───────────────────────────────────────────────────────

const ft2Behavior: EditorBehavior = {
  name: 'fasttracker2',
  octaveRange: [0, 7],
  octaveSelectMode: 'fkeys-direct',
  editStepRange: [0, 16],
  editStepCycleKey: '`',
  noteOff: {
    noteOffKey: 'CapsLock',
    noteCutKey: null,
    noteFadeKey: null,
    noteOffDisplay: '===',
    noteCutDisplay: '',
    noteFadeDisplay: '',
  },
  cursorWrapVertical: true,
  cursorWrapHorizontal: true,
  tabBehavior: 'next-channel',
  homeEndBehavior: 'row-jump',
  advanceOnNote: true,
  advanceOnInstrument: true,
  advanceOnVolume: true,
  advanceOnEffect: true,
  advanceOnDelete: true,
  deleteClearsWhat: 'note-inst-vol',
  selectionModifier: 'alt',
  volumeColumnEnabled: true,
  ptNumpadSampleSelect: false,
  ptEffectMacros: false,
  itMaskVariables: false,
  itThreeNoteTypes: false,
};

const protrackerBehavior: EditorBehavior = {
  name: 'protracker',
  octaveRange: [1, 3],
  octaveSelectMode: 'fkeys-lohi',
  editStepRange: [0, 9],
  editStepCycleKey: null,
  noteOff: {
    noteOffKey: null,
    noteCutKey: null,
    noteFadeKey: null,
    noteOffDisplay: '',
    noteCutDisplay: '',
    noteFadeDisplay: '',
  },
  cursorWrapVertical: true,
  cursorWrapHorizontal: true,
  tabBehavior: 'next-channel',
  homeEndBehavior: 'row-jump',
  advanceOnNote: true,
  advanceOnInstrument: true,
  advanceOnVolume: false,
  advanceOnEffect: true,
  advanceOnDelete: false,
  deleteClearsWhat: 'note-sample',
  selectionModifier: 'shift',
  volumeColumnEnabled: false,
  ptNumpadSampleSelect: true,
  ptEffectMacros: true,
  itMaskVariables: false,
  itThreeNoteTypes: false,
};

const impulseTrackerBehavior: EditorBehavior = {
  name: 'impulse-tracker',
  octaveRange: [0, 9],
  octaveSelectMode: 'numpad-only',
  editStepRange: [0, 16],
  editStepCycleKey: null,
  noteOff: {
    noteOffKey: '`',
    noteCutKey: '1',
    noteFadeKey: 'Shift+`',
    noteOffDisplay: '===',
    noteCutDisplay: '^^^',
    noteFadeDisplay: '~~~',
  },
  cursorWrapVertical: false,
  cursorWrapHorizontal: true,
  tabBehavior: 'cycle-columns',
  homeEndBehavior: 'double-press',
  advanceOnNote: true,
  advanceOnInstrument: false,
  advanceOnVolume: false,
  advanceOnEffect: false,
  advanceOnDelete: false,
  deleteClearsWhat: 'cursor-field',
  selectionModifier: 'shift',
  volumeColumnEnabled: true,
  ptNumpadSampleSelect: false,
  ptEffectMacros: false,
  itMaskVariables: true,
  itThreeNoteTypes: true,
};

const renoIseBehavior: EditorBehavior = {
  name: 'renoise',
  octaveRange: [0, 9],
  octaveSelectMode: 'numpad-only',
  editStepRange: [0, 16],
  editStepCycleKey: null,
  noteOff: {
    noteOffKey: 'CapsLock',
    noteCutKey: null,
    noteFadeKey: null,
    noteOffDisplay: 'OFF',
    noteCutDisplay: '',
    noteFadeDisplay: '',
  },
  cursorWrapVertical: true,
  cursorWrapHorizontal: true,
  tabBehavior: 'cycle-columns',
  homeEndBehavior: 'row-jump',
  advanceOnNote: true,
  advanceOnInstrument: true,
  advanceOnVolume: true,
  advanceOnEffect: true,
  advanceOnDelete: true,
  deleteClearsWhat: 'cursor-field',
  selectionModifier: 'shift',
  volumeColumnEnabled: true,
  ptNumpadSampleSelect: false,
  ptEffectMacros: false,
  itMaskVariables: false,
  itThreeNoteTypes: false,
};

const openmptBehavior: EditorBehavior = {
  name: 'openmpt',
  octaveRange: [0, 9],
  octaveSelectMode: 'fkeys-direct',
  editStepRange: [0, 16],
  editStepCycleKey: null,
  noteOff: {
    noteOffKey: 'CapsLock',
    noteCutKey: '1',
    noteFadeKey: null,
    noteOffDisplay: '===',
    noteCutDisplay: '^^^',
    noteFadeDisplay: '',
  },
  cursorWrapVertical: true,
  cursorWrapHorizontal: true,
  tabBehavior: 'cycle-columns',
  homeEndBehavior: 'row-jump',
  advanceOnNote: true,
  advanceOnInstrument: true,
  advanceOnVolume: true,
  advanceOnEffect: true,
  advanceOnDelete: true,
  deleteClearsWhat: 'note-inst-vol',
  selectionModifier: 'shift',
  volumeColumnEnabled: true,
  ptNumpadSampleSelect: false,
  ptEffectMacros: false,
  itMaskVariables: true,
  itThreeNoteTypes: true,
};

const octamedBehavior: EditorBehavior = {
  ...ft2Behavior,
  name: 'octamed',
};

// ── Registry ────────────────────────────────────────────────────────────────

const behaviorMap: Record<string, EditorBehavior> = {
  'fasttracker2': ft2Behavior,
  'protracker': protrackerBehavior,
  'impulse-tracker': impulseTrackerBehavior,
  'renoise': renoIseBehavior,
  'openmpt': openmptBehavior,
  'octamed': octamedBehavior,
};

/**
 * Get the editor behavior profile for a keyboard scheme name.
 * Falls back to FT2 behavior for unknown schemes.
 */
export function getBehaviorForScheme(schemeName: string): EditorBehavior {
  return behaviorMap[schemeName] ?? ft2Behavior;
}

/** Default behavior (FT2) */
export const DEFAULT_BEHAVIOR: EditorBehavior = ft2Behavior;
