/**
 * Format Compatibility Guard — centralized format limit checking.
 *
 * Defines per-format constraints (channels, patterns, instruments, etc.)
 * and provides a single checkFormatViolation() function that shows a
 * confirmation dialog when the user exceeds a native format's limits.
 *
 * Used by ALL stores that mutate song state (tracker, instrument, transport,
 * audio, automation). The dialog only fires once per violation type per song.
 */

import { useFormatStore } from '@stores/useFormatStore';
import { showConfirm } from '@stores/useConfirmStore';

// ── Format Constraints ──────────────────────────────────────────────────────

export interface FormatConstraints {
  name: string;
  maxChannels: number;
  maxPatterns: number;
  maxPatternLength: number;
  maxInstruments: number;
  maxPositions: number;
  maxSampleSize: number;
  sampleBitDepth: (8 | 16)[];
  supportsPanning: boolean;
  supportsEnvelopes: boolean;
  supportsGroove: boolean;
  bpmRange: [number, number];
  speedRange: [number, number];
  /** Chip type for format-specific effect mappings (e.g., 'c64', 'ay', 'opn') */
  chipType?: string;
}

/** Generate Furnace chip format entries. All share the same base constraints. */
function makeFurnaceChipFormats(): Record<string, FormatConstraints> {
  const base: Omit<FormatConstraints, 'name' | 'chipType' | 'maxChannels' | 'supportsPanning'> = {
    maxPatterns: 256, maxPatternLength: 256, maxInstruments: 256,
    maxPositions: 256, maxSampleSize: Infinity, sampleBitDepth: [8, 16],
    supportsEnvelopes: true, supportsGroove: true, bpmRange: [1, 255], speedRange: [1, 255],
  };
  const chips: Array<[string, string, number, boolean]> = [
    // [key suffix, chipType, maxChannels, supportsPanning]
    ['C64',     'c64',     3,  false],
    ['AY',      'ay',      3,  false],
    ['SAA',     'saa',     6,  false],
    ['SMS',     'sms',     4,  false],
    ['GB',      'gb',      4,  false],
    ['NES',     'nes',     5,  false],
    ['FDS',     'fds',     1,  false],
    ['PCE',     'pce',     6,  true],
    ['VRC6',    'vrc6',    3,  false],
    ['OPN',     'opn',     6,  true],
    ['OPN2',    'opn2',    10, true],
    ['OPM',     'opm',     8,  true],
    ['OPL',     'opl',     9,  false],
    ['OPL2',    'opl2',    9,  false],
    ['OPL3',    'opl3',    18, true],
    ['OPLL',    'opll',    9,  false],
    ['VRC7',    'vrc7',    6,  false],
    ['OPZ',     'opz',     8,  true],
    ['ESFM',    'esfm',    18, true],
    ['SNES',    'snes',    8,  true],
    ['AMIGA',   'amiga',   4,  true],
    ['POKEY',   'pokey',   4,  false],
    ['TIA',     'tia',     2,  false],
    ['N163',    'n163',    8,  false],
    ['ES5506',  'es5506',  32, true],
    ['QSOUND',  'qsound',  16, true],
    ['ARCADE',  'arcade',  8,  true],
  ];
  const result: Record<string, FormatConstraints> = {};
  for (const [key, chipType, maxChannels, supportsPanning] of chips) {
    result[`FUR_${key}`] = { ...base, name: `FUR_${key}`, chipType, maxChannels, supportsPanning };
  }
  // Generic fallback for unknown chips
  result['FUR_GENERIC'] = { ...base, name: 'FUR_GENERIC', maxChannels: 64, supportsPanning: true };
  return result;
}

export const FORMAT_LIMITS: Record<string, FormatConstraints> = {
  MOD: {
    name: 'MOD',
    maxChannels: 8,
    maxPatterns: 64,
    maxPatternLength: 64,
    maxInstruments: 31,
    maxPositions: 128,
    maxSampleSize: 131070,
    sampleBitDepth: [8],
    supportsPanning: false,
    supportsEnvelopes: false,
    supportsGroove: false,
    bpmRange: [32, 255],
    speedRange: [1, 31],
  },
  XM: {
    name: 'XM',
    maxChannels: 32,
    maxPatterns: 256,
    maxPatternLength: 256,
    maxInstruments: 128,
    maxPositions: 256,
    maxSampleSize: Infinity,
    sampleBitDepth: [8, 16],
    supportsPanning: true,
    supportsEnvelopes: true,
    supportsGroove: false,
    bpmRange: [32, 255],
    speedRange: [1, 31],
  },
  IT: {
    name: 'IT',
    maxChannels: 64,
    maxPatterns: 200,
    maxPatternLength: 200,
    maxInstruments: 99,
    maxPositions: 256,
    maxSampleSize: Infinity,
    sampleBitDepth: [8, 16],
    supportsPanning: true,
    supportsEnvelopes: true,
    supportsGroove: true,
    bpmRange: [32, 255],
    speedRange: [1, 255],
  },
  S3M: {
    name: 'S3M',
    maxChannels: 32,
    maxPatterns: 100,
    maxPatternLength: 64,
    maxInstruments: 99,
    maxPositions: 256,
    maxSampleSize: Infinity,
    sampleBitDepth: [8],
    supportsPanning: true,
    supportsEnvelopes: false,
    supportsGroove: false,
    bpmRange: [33, 255],
    speedRange: [1, 255],
  },
  HVL: {
    name: 'HVL',
    maxChannels: 16,
    maxPatterns: 256,
    maxPatternLength: 64,
    maxInstruments: 63,
    maxPositions: 1000,
    maxSampleSize: 0,
    sampleBitDepth: [],
    supportsPanning: false,
    supportsEnvelopes: false,
    supportsGroove: false,
    bpmRange: [1, 255],
    speedRange: [1, 255],
  },
  AHX: {
    name: 'AHX',
    maxChannels: 4,
    maxPatterns: 256,
    maxPatternLength: 64,
    maxInstruments: 63,
    maxPositions: 1000,
    maxSampleSize: 0,
    sampleBitDepth: [],
    supportsPanning: false,
    supportsEnvelopes: false,
    supportsGroove: false,
    bpmRange: [1, 255],
    speedRange: [1, 255],
  },
  FC: {
    name: 'FC',
    maxChannels: 4,
    maxPatterns: 256,
    maxPatternLength: 32,
    maxInstruments: 10,
    maxPositions: 128,
    maxSampleSize: 131070,
    sampleBitDepth: [8],
    supportsPanning: false,
    supportsEnvelopes: false,
    supportsGroove: false,
    bpmRange: [1, 255],
    speedRange: [1, 255],
  },
  // ── Furnace chip-specific formats ──────────────────────────────────────
  // All share base Furnace constraints, differ by chipType and channel count
  ...makeFurnaceChipFormats(),
};

// ── Violation Tracking ──────────────────────────────────────────────────────

export type ViolationType =
  | 'synthInstrument'
  | 'channelCount'
  | 'patternCount'
  | 'patternLength'
  | 'instrumentCount'
  | 'positionCount'
  | 'sampleSize'
  | 'sampleBitDepth'
  | 'masterEffects'
  | 'instrumentEffects'
  | 'automation'
  | 'groove'
  | 'bpmRange'
  | 'speedRange';

const _confirmedViolations = new Set<ViolationType>();

/** When > 0, all format violation checks are suppressed (returns true immediately).
 *  Use suppressFormatChecks() / restoreFormatChecks() around file-loading paths. */
let _suppressDepth = 0;

/** Suppress format violation dialogs (e.g. during file import).
 *  Must be paired with restoreFormatChecks(). Supports nesting. */
export function suppressFormatChecks(): void {
  _suppressDepth++;
}

/** Restore format violation dialogs after a suppress call. */
export function restoreFormatChecks(): void {
  if (_suppressDepth > 0) _suppressDepth--;
}

/** Reset all violation confirmations (call on song load) */
export function resetFormatViolations(): void {
  _confirmedViolations.clear();
}

// ── Format Detection ────────────────────────────────────────────────────────

/** Detect the active native format from the format store */
export function getActiveFormatLimits(): FormatConstraints | null {
  try {
    const fmt = useFormatStore.getState();
    const hasNative = !!(
      fmt.libopenmptFileData || fmt.uadeEditableFileData || fmt.hivelyFileData ||
      fmt.klysFileData || fmt.c64SidFileData || fmt.musiclineFileData ||
      fmt.jamCrackerFileData || fmt.futurePlayerFileData || fmt.preTrackerFileData ||
      fmt.maFileData || fmt.hippelFileData || fmt.sonixFileData || fmt.pxtoneFileData ||
      fmt.organyaFileData || fmt.eupFileData || fmt.sc68FileData || fmt.zxtuneFileData ||
      fmt.pumaTrackerFileData || fmt.artOfNoiseFileData || fmt.qsfFileData || fmt.bdFileData ||
      fmt.sd2FileData || fmt.symphonieFileData
    );
    if (!hasNative) return null;

    // Detect format from editorMode or fileData
    if (fmt.hivelyFileData) return FORMAT_LIMITS.HVL ?? null;
    if (fmt.editorMode === 'furnace') return null; // Furnace has its own limits
    if (fmt.editorMode === 'klystrack') return null; // Klystrack has its own limits

    // For libopenmpt formats, detect from the editorMode or default to MOD
    if (fmt.libopenmptFileData) {
      // The format is stored in the song — check TrackerSong.format
      // For now, default to MOD limits (most restrictive of the PC tracker formats)
      return FORMAT_LIMITS.MOD;
    }

    // UADE / Amiga formats — use FC limits as a safe default
    if (fmt.uadeEditableFileData) return FORMAT_LIMITS.FC ?? null;

    return FORMAT_LIMITS.MOD; // safe default
  } catch {
    return null;
  }
}

// ── Violation Check ─────────────────────────────────────────────────────────

/**
 * Check if an action violates the active format's constraints.
 * Shows a confirmation dialog if it does. Returns true if OK to proceed.
 *
 * Usage in store actions:
 *   const ok = await checkFormatViolation('channelCount',
 *     `Adding channel ${n+1} exceeds MOD limit of 8 channels.`);
 *   if (!ok) return; // user cancelled
 */
export async function checkFormatViolation(
  type: ViolationType,
  message: string,
): Promise<boolean> {
  if (_suppressDepth > 0) return true; // suppressed during file import
  if (_confirmedViolations.has(type)) return true;

  const limits = getActiveFormatLimits();
  if (!limits) return true; // no native format loaded

  const confirmed = await showConfirm({
    title: 'Format Compatibility Warning',
    message: `${message}\n\nThe song can no longer be saved as ${limits.name} — save as .dbx instead.`,
    confirmLabel: 'Continue',
    danger: true,
  });
  if (confirmed) _confirmedViolations.add(type);
  return confirmed;
}

/**
 * Synchronous check — returns the format name if a violation would occur.
 * Used for quick pre-checks before async dialog. Returns null if no violation.
 */
export function wouldViolateFormat(type: ViolationType): string | null {
  if (_suppressDepth > 0) return null;
  if (_confirmedViolations.has(type)) return null;
  const limits = getActiveFormatLimits();
  return limits?.name ?? null;
}
