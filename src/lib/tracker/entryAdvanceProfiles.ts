/**
 * Entry-advance profiles: what the cursor does after a DATA entry (instrument,
 * volume, effect command, effect parameter digit), as DATA. One profile per
 * original tracker; `computeNibbleAdvance` (nibbleAdvance.ts) is the only reader.
 *
 * Every value is sourced in thoughts/shared/research/2026-10-15_pattern-editor-edit-behaviour.md.
 * Note entry is not here: every verified tracker steps down by the edit step after a note.
 */

/** What the cursor does after one keystroke in a column.
 *  stay          - cursor does not move
 *  down          - down by the edit step, same column, same digit slot (PT2 and FT2 keep the slot)
 *  downFirstDigit - down by the edit step, same column, back on the first digit (a fresh entry)
 *  nextDigit     - next digit of the same cell (never valid on a last digit)
 *  toParam       - effect command -> effect parameter, first digit, same row
 *  downToCommand - down by the edit step, into the effect command column (IT after the last parameter digit) */
export type EntryMove = 'stay' | 'down' | 'downFirstDigit' | 'nextDigit' | 'toParam' | 'downToCommand';

export type EntryProfileId = 'devilbox' | 'protracker' | 'fasttracker2' | 'impulse-tracker' | 'openmpt';

export interface EntryAdvanceProfile {
  readonly id: EntryProfileId;
  readonly label: string;
  readonly description: string;
  /** [first digit, second digit] */
  readonly instrument: readonly [EntryMove, EntryMove];
  readonly volume: readonly [EntryMove, EntryMove];
  readonly effectCommand: EntryMove;
  readonly effectParam: readonly [EntryMove, EntryMove];
}

export const ENTRY_PROFILES: Readonly<Record<EntryProfileId, EntryAdvanceProfile>> = {
  devilbox: {
    id: 'devilbox',
    label: 'DEViLBOX default',
    description: 'Digit by digit inside the cell, the effect command jumps to its parameter, the last digit moves down.',
    instrument: ['nextDigit', 'downFirstDigit'],
    volume: ['nextDigit', 'downFirstDigit'],
    effectCommand: 'toParam',
    effectParam: ['nextDigit', 'downFirstDigit'],
  },
  protracker: {
    id: 'protracker',
    label: 'ProTracker',
    description: 'Every entry moves down one edit step in the same column (pt2-clone, pt2_edit.c).',
    instrument: ['down', 'down'],
    volume: ['down', 'down'],
    effectCommand: 'down',
    effectParam: ['down', 'down'],
  },
  fasttracker2: {
    id: 'fasttracker2',
    label: 'FastTracker 2',
    description: 'Every entry moves down one edit step in the same column (ft2-clone, ft2_edit.c).',
    instrument: ['down', 'down'],
    volume: ['down', 'down'],
    effectCommand: 'down',
    effectParam: ['down', 'down'],
  },
  'impulse-tracker': {
    id: 'impulse-tracker',
    label: 'Impulse Tracker',
    description: 'Digit by digit; the effect command moves down; the last parameter digit moves down to the command column (Schism Tracker).',
    instrument: ['nextDigit', 'downFirstDigit'],
    volume: ['nextDigit', 'downFirstDigit'],
    effectCommand: 'down',
    effectParam: ['nextDigit', 'downToCommand'],
  },
  openmpt: {
    id: 'openmpt',
    label: 'OpenMPT',
    description: 'The cursor stays where it is after instrument, volume and effect entry (OpenMPT View_pat.cpp).',
    instrument: ['stay', 'stay'],
    volume: ['stay', 'stay'],
    effectCommand: 'stay',
    effectParam: ['stay', 'stay'],
  },
};

export const ENTRY_PROFILE_IDS = Object.keys(ENTRY_PROFILES) as EntryProfileId[];

export type EditBehaviourChoice = 'follow-keymap' | 'follow-format' | EntryProfileId;

export const DEFAULT_EDIT_BEHAVIOUR: EditBehaviourChoice = 'follow-keymap';

export const EDIT_BEHAVIOUR_OPTIONS: ReadonlyArray<{ value: EditBehaviourChoice; label: string }> = [
  { value: 'follow-keymap', label: 'Follow keyboard scheme' },
  { value: 'follow-format', label: 'Follow song format' },
  ...ENTRY_PROFILE_IDS.map((id) => ({ value: id, label: ENTRY_PROFILES[id].label })),
];

/** Keyboard scheme -> profile. Schemes without a verified original (octamed, renoise)
 *  and fasttracker2 (owner decision pending, plan 2026-10-15) keep the DEViLBOX default. */
const KEYMAP_PROFILE: Readonly<Record<string, EntryProfileId>> = {
  protracker: 'protracker',
  'impulse-tracker': 'impulse-tracker',
  openmpt: 'openmpt',
};

/** Song source format -> profile (the tracker that format came from). */
const FORMAT_PROFILE: Readonly<Record<string, EntryProfileId>> = {
  MOD: 'protracker',
  XM: 'fasttracker2',
  IT: 'impulse-tracker',
  S3M: 'impulse-tracker',
};

export interface EntryProfileQuery {
  choice: EditBehaviourChoice;
  /** Name of the active keyboard scheme (custom resolves to its base scheme before this). */
  keymap: string;
  /** Pattern importMetadata.sourceFormat of the loaded song, when known. */
  sourceFormat?: string;
}

export function isEditBehaviourChoice(v: unknown): v is EditBehaviourChoice {
  return v === 'follow-keymap' || v === 'follow-format' || (typeof v === 'string' && v in ENTRY_PROFILES);
}

/** Explicit profile > follow song format (falls back to keymap) > follow keymap. */
export function resolveEntryProfile(q: EntryProfileQuery): EntryAdvanceProfile {
  if (q.choice in ENTRY_PROFILES) return ENTRY_PROFILES[q.choice as EntryProfileId];
  if (q.choice === 'follow-format' && q.sourceFormat && FORMAT_PROFILE[q.sourceFormat]) {
    return ENTRY_PROFILES[FORMAT_PROFILE[q.sourceFormat]];
  }
  return ENTRY_PROFILES[KEYMAP_PROFILE[q.keymap] ?? 'devilbox'];
}
