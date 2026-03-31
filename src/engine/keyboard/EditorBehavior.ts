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
  /** Preview note audio when entering in edit mode */
  readonly previewNoteOnEntry: boolean;
  /** Preview note audio when navigating (arrow keys) — PT does this */
  readonly previewNoteOnNavigate: boolean;

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
  /** Page Up/Down jump size (number of rows) */
  readonly pageJumpSize: number;
  /** Whether volume column cursor positions are skipped when volume column is hidden */
  readonly skipHiddenVolumeColumn: boolean;

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
  /** What bare Delete clears:
   *  'note-inst-vol' = clears note + instrument + volume (FT2)
   *  'cursor-field'  = clears only the field at cursor (IT)
   *  'note-sample'   = clears note + sample number (PT) */
  readonly deleteClearsWhat: 'note-inst-vol' | 'cursor-field' | 'note-sample';
  /** FT2-style modifier delete variants:
   *  Shift+Del = clear entire row, Ctrl+Del = clear vol+eff, Alt+Del = clear eff only */
  readonly deleteModifierVariants: boolean;

  // ── Backspace behavior ──────────────────────────────────────────────────
  /** What Backspace does:
   *  'pull-delete' = pull rows up (FT2)
   *  'clear-prev'  = move up then clear (alternative)
   *  'pull-channel' = pull only current channel (IT) */
  readonly backspaceBehavior: 'pull-delete' | 'clear-prev' | 'pull-channel';

  // ── Insert row behavior ─────────────────────────────────────────────────
  /** Insert key in edit mode pushes rows down.
   *  Shift+Insert = insert in all channels (FT2) */
  readonly insertShiftAllChannels: boolean;
  /** Insert key when NOT in edit mode toggles insert/overwrite mode (FT2) */
  readonly insertTogglesMode: boolean;

  // ── Selection ───────────────────────────────────────────────────────────
  /** Modifier key for extending selection with arrows:
   *  'alt'   = Alt+arrows (FT2)
   *  'shift' = Shift+arrows (IT/Renoise) */
  readonly selectionModifier: 'alt' | 'shift';

  // ── Space key behavior ──────────────────────────────────────────────────
  /** What Space does:
   *  'play-stop-or-edit' = If playing: stop. If stopped: toggle edit mode. (FT2)
   *  'toggle-edit'       = Always toggles edit mode regardless of play state. (IT)
   *  'play-stop'         = Always play/stop, never toggles edit. (Renoise) */
  readonly spaceBehavior: 'play-stop-or-edit' | 'toggle-edit' | 'play-stop';

  // ── Record quantization ─────────────────────────────────────────────────
  /** Whether this scheme supports record quantization during playback */
  readonly recordQuantization: boolean;

  // ── Volume column ───────────────────────────────────────────────────────
  /** Whether this scheme uses a volume column */
  readonly volumeColumnEnabled: boolean;

  // ── Pattern operations ──────────────────────────────────────────────────
  /** Whether F3/F4/F5 are used for cut/copy/paste with scope modifiers
   *  (Shift=track, Ctrl=pattern, Alt=block) — FT2 style */
  readonly fKeyCutCopyPaste: boolean;
  /** Whether F7/F8 are used for transpose with scope modifiers — FT2 style */
  readonly fKeyTranspose: boolean;

  // ── Row highlighting ────────────────────────────────────────────────────
  /** Primary highlight interval (beat, typically 4) — 0 to disable */
  readonly primaryHighlight: number;
  /** Secondary highlight interval (bar, typically 16) — 0 to disable */
  readonly secondaryHighlight: number;

  // ── Scheme-specific feature flags ───────────────────────────────────────
  /** ProTracker: numpad selects samples (not octave) */
  readonly ptNumpadSampleSelect: boolean;
  /** ProTracker: Alt+0-9 effect macro slots */
  readonly ptEffectMacros: boolean;
  /** Impulse Tracker: comma toggles copy/paste masks */
  readonly itMaskVariables: boolean;
  /** Impulse Tracker: three note-off types */
  readonly itThreeNoteTypes: boolean;
  /** Impulse Tracker: space copies last note data from mask when on empty cell */
  readonly itSpaceCopyMask: boolean;
  /** Maximum number of channels */
  readonly maxChannels: number;
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
  previewNoteOnEntry: true,
  previewNoteOnNavigate: false,
  cursorWrapVertical: true,
  cursorWrapHorizontal: true,
  tabBehavior: 'next-channel',
  homeEndBehavior: 'row-jump',
  pageJumpSize: 16,
  skipHiddenVolumeColumn: true,
  advanceOnNote: true,
  advanceOnInstrument: true,
  advanceOnVolume: true,
  advanceOnEffect: true,
  advanceOnDelete: true,
  deleteClearsWhat: 'note-inst-vol',
  deleteModifierVariants: true,
  backspaceBehavior: 'pull-delete',
  insertShiftAllChannels: true,
  insertTogglesMode: true,
  selectionModifier: 'alt',
  spaceBehavior: 'play-stop-or-edit',
  recordQuantization: true,
  volumeColumnEnabled: true,
  fKeyCutCopyPaste: true,
  fKeyTranspose: true,
  primaryHighlight: 4,
  secondaryHighlight: 16,
  ptNumpadSampleSelect: false,
  ptEffectMacros: false,
  itMaskVariables: false,
  itThreeNoteTypes: false,
  itSpaceCopyMask: false,
  maxChannels: 32,
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
  previewNoteOnEntry: true,
  previewNoteOnNavigate: false,
  cursorWrapVertical: true,
  cursorWrapHorizontal: true,
  tabBehavior: 'next-channel',
  homeEndBehavior: 'row-jump',
  pageJumpSize: 16,
  skipHiddenVolumeColumn: false,
  advanceOnNote: true,
  advanceOnInstrument: true,
  advanceOnVolume: false,
  advanceOnEffect: true,
  advanceOnDelete: false,
  deleteClearsWhat: 'note-sample',
  deleteModifierVariants: false,
  backspaceBehavior: 'clear-prev',
  insertShiftAllChannels: false,
  insertTogglesMode: false,
  selectionModifier: 'shift',
  spaceBehavior: 'play-stop-or-edit',
  recordQuantization: false,
  volumeColumnEnabled: false,
  fKeyCutCopyPaste: false,
  fKeyTranspose: false,
  primaryHighlight: 4,
  secondaryHighlight: 16,
  ptNumpadSampleSelect: true,
  ptEffectMacros: true,
  itMaskVariables: false,
  itThreeNoteTypes: false,
  itSpaceCopyMask: false,
  maxChannels: 4,
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
  previewNoteOnEntry: true,
  previewNoteOnNavigate: false,
  cursorWrapVertical: false,
  cursorWrapHorizontal: true,
  tabBehavior: 'cycle-columns',
  homeEndBehavior: 'double-press',
  pageJumpSize: 16,
  skipHiddenVolumeColumn: false,
  advanceOnNote: true,
  advanceOnInstrument: false,
  advanceOnVolume: false,
  advanceOnEffect: false,
  advanceOnDelete: false,
  deleteClearsWhat: 'cursor-field',
  deleteModifierVariants: false,
  backspaceBehavior: 'pull-channel',
  insertShiftAllChannels: false,
  insertTogglesMode: false,
  selectionModifier: 'shift',
  spaceBehavior: 'toggle-edit',
  recordQuantization: false,
  volumeColumnEnabled: true,
  fKeyCutCopyPaste: false,
  fKeyTranspose: false,
  primaryHighlight: 4,
  secondaryHighlight: 16,
  ptNumpadSampleSelect: false,
  ptEffectMacros: false,
  itMaskVariables: true,
  itThreeNoteTypes: true,
  itSpaceCopyMask: true,
  maxChannels: 64,
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
  previewNoteOnEntry: true,
  previewNoteOnNavigate: false,
  cursorWrapVertical: true,
  cursorWrapHorizontal: true,
  tabBehavior: 'cycle-columns',
  homeEndBehavior: 'row-jump',
  pageJumpSize: 16,
  skipHiddenVolumeColumn: false,
  advanceOnNote: true,
  advanceOnInstrument: true,
  advanceOnVolume: true,
  advanceOnEffect: true,
  advanceOnDelete: true,
  deleteClearsWhat: 'cursor-field',
  deleteModifierVariants: false,
  backspaceBehavior: 'pull-channel',
  insertShiftAllChannels: true,
  insertTogglesMode: false,
  selectionModifier: 'shift',
  spaceBehavior: 'play-stop',
  recordQuantization: false,
  volumeColumnEnabled: true,
  fKeyCutCopyPaste: false,
  fKeyTranspose: false,
  primaryHighlight: 4,
  secondaryHighlight: 16,
  ptNumpadSampleSelect: false,
  ptEffectMacros: false,
  itMaskVariables: false,
  itThreeNoteTypes: false,
  itSpaceCopyMask: false,
  maxChannels: 64,
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
  previewNoteOnEntry: true,
  previewNoteOnNavigate: false,
  cursorWrapVertical: true,
  cursorWrapHorizontal: true,
  tabBehavior: 'cycle-columns',
  homeEndBehavior: 'row-jump',
  pageJumpSize: 16,
  skipHiddenVolumeColumn: false,
  advanceOnNote: true,
  advanceOnInstrument: true,
  advanceOnVolume: true,
  advanceOnEffect: true,
  advanceOnDelete: true,
  deleteClearsWhat: 'note-inst-vol',
  deleteModifierVariants: true,
  backspaceBehavior: 'pull-delete',
  insertShiftAllChannels: true,
  insertTogglesMode: true,
  selectionModifier: 'shift',
  spaceBehavior: 'play-stop-or-edit',
  recordQuantization: true,
  volumeColumnEnabled: true,
  fKeyCutCopyPaste: false,
  fKeyTranspose: false,
  primaryHighlight: 4,
  secondaryHighlight: 16,
  ptNumpadSampleSelect: false,
  ptEffectMacros: false,
  itMaskVariables: true,
  itThreeNoteTypes: true,
  itSpaceCopyMask: false,
  maxChannels: 127,
};

const octamedBehavior: EditorBehavior = {
  ...ft2Behavior,
  name: 'octamed',
  maxChannels: 16,
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
