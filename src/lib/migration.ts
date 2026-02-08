/**
 * Migration utilities for converting old DEViLBOX formats to new XM-aligned format
 */

import type { TrackerCell, Pattern } from '@typedefs';
import type { InstrumentConfig } from '@typedefs/instrument';
import {
  DEFAULT_TB303,
  DEFAULT_DUB_SIREN,
  DEFAULT_SPACE_LASER,
  DEFAULT_V2,
  DEFAULT_SAM,
  DEFAULT_SYNARE,
  DEFAULT_BUZZMACHINE,
  DEFAULT_DRUM_MACHINE,
  DEFAULT_CHIP_SYNTH,
  DEFAULT_PWM_SYNTH,
  DEFAULT_WAVETABLE,
  DEFAULT_GRANULAR,
  DEFAULT_SUPERSAW,
  DEFAULT_POLYSYNTH,
  DEFAULT_ORGAN,
  DEFAULT_STRING_MACHINE,
  DEFAULT_FORMANT_SYNTH,
  DEFAULT_WOBBLE_BASS,
  DEFAULT_DEXED,
  DEFAULT_OBXD,
  DEFAULT_DRUMKIT,
  DEFAULT_FURNACE,
} from '@typedefs/instrument';
import { stringNoteToXM, effectStringToXM } from './xmConversions';

/**
 * Deep merge two objects, with source values taking precedence
 */
function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  const result = { ...target };
  for (const key of Object.keys(source) as (keyof T)[]) {
    const sourceVal = source[key];
    const targetVal = target[key];
    if (sourceVal !== undefined && sourceVal !== null) {
      if (typeof sourceVal === 'object' && !Array.isArray(sourceVal) && typeof targetVal === 'object' && !Array.isArray(targetVal)) {
        result[key] = deepMerge(targetVal as any, sourceVal as any);
      } else {
        result[key] = sourceVal as T[keyof T];
      }
    }
  }
  return result;
}

/**
 * Ensure an instrument has complete config for its synthType
 */
export function ensureCompleteInstrumentConfig(inst: InstrumentConfig): InstrumentConfig {
  const result = { ...inst };
  
  switch (inst.synthType) {
    case 'TB303':
    case 'Buzz3o3':
      result.tb303 = deepMerge(DEFAULT_TB303, inst.tb303 || {});
      break;
    case 'DrumMachine':
      result.drumMachine = deepMerge(DEFAULT_DRUM_MACHINE, inst.drumMachine || {});
      break;
    case 'ChipSynth':
      result.chipSynth = deepMerge(DEFAULT_CHIP_SYNTH, inst.chipSynth || {});
      break;
    case 'PWMSynth':
      result.pwmSynth = deepMerge(DEFAULT_PWM_SYNTH, inst.pwmSynth || {});
      break;
    case 'Wavetable':
      result.wavetable = deepMerge(DEFAULT_WAVETABLE, inst.wavetable || {});
      break;
    case 'GranularSynth':
      result.granular = deepMerge(DEFAULT_GRANULAR, inst.granular || {});
      break;
    case 'SuperSaw':
      result.superSaw = deepMerge(DEFAULT_SUPERSAW, inst.superSaw || {});
      break;
    case 'PolySynth':
      result.polySynth = deepMerge(DEFAULT_POLYSYNTH, inst.polySynth || {});
      break;
    case 'Organ':
      result.organ = deepMerge(DEFAULT_ORGAN, inst.organ || {});
      break;
    case 'StringMachine':
      result.stringMachine = deepMerge(DEFAULT_STRING_MACHINE, inst.stringMachine || {});
      break;
    case 'FormantSynth':
      result.formantSynth = deepMerge(DEFAULT_FORMANT_SYNTH, inst.formantSynth || {});
      break;
    case 'WobbleBass':
      result.wobbleBass = deepMerge(DEFAULT_WOBBLE_BASS, inst.wobbleBass || {});
      break;
    case 'DubSiren':
      result.dubSiren = deepMerge(DEFAULT_DUB_SIREN, inst.dubSiren || {});
      break;
    case 'SpaceLaser':
      result.spaceLaser = deepMerge(DEFAULT_SPACE_LASER, inst.spaceLaser || {});
      break;
    case 'V2':
      result.v2 = deepMerge(DEFAULT_V2, inst.v2 || {});
      break;
    case 'Sam':
      result.sam = deepMerge(DEFAULT_SAM, inst.sam || {});
      break;
    case 'Synare':
      result.synare = deepMerge(DEFAULT_SYNARE, inst.synare || {});
      break;
    case 'Buzzmachine':
      result.buzzmachine = deepMerge(DEFAULT_BUZZMACHINE, inst.buzzmachine || {});
      break;
    case 'Dexed':
      result.dexed = deepMerge(DEFAULT_DEXED, inst.dexed || {});
      break;
    case 'OBXd':
      result.obxd = deepMerge(DEFAULT_OBXD, inst.obxd || {});
      break;
    case 'DrumKit':
      result.drumKit = deepMerge(DEFAULT_DRUMKIT, inst.drumKit || {});
      break;
    case 'Furnace':
      result.furnace = deepMerge(DEFAULT_FURNACE, inst.furnace || {});
      break;
    // Synth, MonoSynth, FMSynth, AMSynth, PluckSynth, MetalSynth, MembraneSynth, NoiseSynth
    // don't have specific config objects - they use Tone.js defaults
  }
  
  return result;
}

/**
 * Detect if a TrackerCell uses the old string-based format
 */
export function isOldFormatCell(cell: TrackerCell): boolean {
  return typeof cell.note === 'string';
}

/**
 * Detect if instruments use old ID numbering (0, 100, 200, 300, ...)
 */
export function hasOldInstrumentIds(instruments: InstrumentConfig[]): boolean {
  // Check if any instrument ID is a multiple of 100 or 0
  return instruments.some(inst => {
    const id = inst.id;
    return (id === 0 || (id > 0 && id % 100 === 0 && id < 3200));
  });
}

/**
 * Migrate old instrument ID (0, 100, 200, ...) to new ID (1, 2, 3, ...)
 */
export function migrateInstrumentId(oldId: number): number {
  if (oldId === 0) return 1;
  if (oldId % 100 === 0 && oldId < 3200) {
    return (oldId / 100) + 1;
  }
  return oldId;
}

/**
 * Migrate a single TrackerCell from old format to new XM format
 */
export function migrateCell(cell: TrackerCell): TrackerCell {
  const migratedCell: TrackerCell = { ...cell };

  // Migrate note (string → number)
  if (typeof cell.note === 'string') {
    migratedCell.note = stringNoteToXM(cell.note);
  } else if (cell.note === null || cell.note === undefined) {
    migratedCell.note = 0; // null/undefined → 0 (no note)
  }

  // Migrate instrument (null → 0, remap old IDs)
  if (cell.instrument === null || cell.instrument === undefined) {
    migratedCell.instrument = 0;
  } else if (typeof cell.instrument === 'number') {
    migratedCell.instrument = migrateInstrumentId(cell.instrument);
  }

  // Migrate volume (null → 0, old format → XM format)
  if (cell.volume === null || cell.volume === undefined) {
    migratedCell.volume = 0;
  } else if (typeof cell.volume === 'number' && cell.volume <= 64) {
    // Old format: direct volume 0-64 → XM format: 0x10-0x50
    migratedCell.volume = 0x10 + cell.volume;
  }

  // Migrate effects (string → effTyp + eff)
  if ('effect' in cell && typeof (cell as any).effect === 'string') {
    const effectStr = (cell as any).effect;
    if (effectStr && effectStr !== '...' && effectStr !== '000') {
      const [effTyp, eff] = effectStringToXM(effectStr);
      migratedCell.effTyp = effTyp;
      migratedCell.eff = eff;
    } else {
      migratedCell.effTyp = 0;
      migratedCell.eff = 0;
    }
    // Remove old effect field
    delete (migratedCell as any).effect;
  }

  // Ensure effTyp and eff fields exist (if not already set)
  if (!(migratedCell as any).effTyp && migratedCell.effTyp !== 0) {
    (migratedCell as any).effTyp = 0;
  }
  if (!(migratedCell as any).eff && migratedCell.eff !== 0) {
    (migratedCell as any).eff = 0;
  }

  // Migrate effect2 (old string format → numeric effTyp2 + eff2)
  if ('effect2' in cell && typeof (cell as any).effect2 === 'string') {
    const effect2Str = (cell as any).effect2 as string;
    if (effect2Str && effect2Str !== '...' && effect2Str !== '000') {
      // Parse: first char → effect type (hex 0-F → 0-15), remaining → param (hex 00-FF → 0-255)
      const [effTyp2, eff2] = effectStringToXM(effect2Str);
      migratedCell.effTyp2 = effTyp2;
      migratedCell.eff2 = eff2;
    } else {
      migratedCell.effTyp2 = 0;
      migratedCell.eff2 = 0;
    }
    // Remove old effect2 field
    delete (migratedCell as any).effect2;
  }

  // Ensure effTyp2 and eff2 fields exist
  if (migratedCell.effTyp2 === undefined || migratedCell.effTyp2 === null) {
    migratedCell.effTyp2 = 0;
  }
  if (migratedCell.eff2 === undefined || migratedCell.eff2 === null) {
    migratedCell.eff2 = 0;
  }

  return migratedCell;
}

/**
 * Migrate a pattern from old format to new XM format
 */
export function migratePattern(pattern: Pattern): Pattern {
  return {
    ...pattern,
    channels: pattern.channels.map(channel => ({
      ...channel,
      rows: channel.rows.map(cell => migrateCell(cell)),
      // Migrate channel instrument ID
      instrumentId: channel.instrumentId !== null && channel.instrumentId !== undefined
        ? migrateInstrumentId(channel.instrumentId)
        : 1, // Default to instrument 1
    })),
  };
}

/**
 * Migrate instruments from old format to new XM format
 */
export function migrateInstruments(instruments: InstrumentConfig[]): InstrumentConfig[] {
  // Create ID mapping (old → new)
  const idMapping = new Map<number, number>();
  let nextNewId = 1;

  // First pass: Build ID mapping
  for (const inst of instruments) {
    if (!idMapping.has(inst.id)) {
      const newId = migrateInstrumentId(inst.id);
      // If the migration produces a conflict, assign a new sequential ID
      if (Array.from(idMapping.values()).includes(newId)) {
        idMapping.set(inst.id, nextNewId++);
      } else {
        idMapping.set(inst.id, newId);
        nextNewId = Math.max(nextNewId, newId + 1);
      }
    }
  }

  // Second pass: Apply ID mapping, add type field, and ensure complete configs
  return instruments.map(inst => {
    const newId = idMapping.get(inst.id) ?? inst.id;

    // Determine instrument type
    const type = inst.synthType === 'Sampler' || inst.synthType === 'Player'
      ? 'sample' as const
      : 'synth' as const;

    // Ensure the instrument has complete config for its synthType
    const completeInst = ensureCompleteInstrumentConfig(inst);

    return {
      ...completeInst,
      id: newId,
      type: (inst as any).type || type, // Preserve existing type or infer
    };
  });
}

/**
 * Check if an instrument has incomplete config for its synthType
 */
function hasIncompleteConfig(inst: InstrumentConfig): boolean {
  switch (inst.synthType) {
    case 'TB303':
    case 'Buzz3o3':
      return !inst.tb303 || !inst.tb303.filter || !inst.tb303.filterEnvelope;
    case 'DrumMachine':
      return !inst.drumMachine;
    case 'ChipSynth':
      return !inst.chipSynth || !inst.chipSynth.envelope;
    case 'PWMSynth':
      return !inst.pwmSynth || !inst.pwmSynth.envelope;
    case 'SuperSaw':
      return !inst.superSaw || !inst.superSaw.envelope;
    case 'PolySynth':
      return !inst.polySynth || !inst.polySynth.envelope;
    case 'Organ':
      return !inst.organ || !inst.organ.drawbars;
    case 'StringMachine':
      return !inst.stringMachine;
    case 'FormantSynth':
      return !inst.formantSynth || !inst.formantSynth.envelope;
    case 'WobbleBass':
      return !inst.wobbleBass || !inst.wobbleBass.envelope;
    case 'DubSiren':
      return !inst.dubSiren || !inst.dubSiren.reverb;
    case 'SpaceLaser':
      return !inst.spaceLaser;
    case 'Dexed':
      return !inst.dexed;
    case 'OBXd':
      return !inst.obxd;
    case 'DrumKit':
      return !inst.drumKit;
    case 'Furnace':
      return !inst.furnace;
    default:
      return false;
  }
}

/**
 * Detect if a project needs migration
 */
export function needsMigration(
  patterns: Pattern[],
  instruments: InstrumentConfig[]
): boolean {
  // Check if any pattern has old format cells
  const hasOldCells = patterns.some(pattern =>
    pattern.channels.some(channel =>
      channel.rows.some(cell => isOldFormatCell(cell))
    )
  );

  // Check if instruments have old IDs
  const hasOldIds = hasOldInstrumentIds(instruments);

  // Check if any instrument is missing the type field
  const missingTypeField = instruments.some(inst => !(inst as any).type);

  // Check if any instrument has incomplete config
  const hasIncomplete = instruments.some(inst => hasIncompleteConfig(inst));

  return hasOldCells || hasOldIds || missingTypeField || hasIncomplete;
}

/**
 * Migrate an entire project from old format to new XM format
 */
export function migrateProject(
  patterns: Pattern[],
  instruments: InstrumentConfig[]
): { patterns: Pattern[]; instruments: InstrumentConfig[] } {
  console.log('[Migration] Starting project migration...');
  console.log('[Migration] Old patterns:', patterns.length);
  console.log('[Migration] Old instruments:', instruments.length);

  // Migrate patterns
  const migratedPatterns = patterns.map(pattern => migratePattern(pattern));

  // Migrate instruments
  const migratedInstruments = migrateInstruments(instruments);

  console.log('[Migration] Migration complete!');
  console.log('[Migration] Sample old instrument ID:', instruments[0]?.id, '→', migratedInstruments[0]?.id);
  console.log('[Migration] Sample old note:', patterns[0]?.channels[0]?.rows[0]?.note, '→', migratedPatterns[0]?.channels[0]?.rows[0]?.note);

  return {
    patterns: migratedPatterns,
    instruments: migratedInstruments,
  };
}

/**
 * Get migration statistics for display to user
 */
export function getMigrationStats(
  patterns: Pattern[],
  instruments: InstrumentConfig[]
): {
  cellsToMigrate: number;
  instrumentsToMigrate: number;
  oldFormat: string;
  newFormat: string;
} {
  let cellsToMigrate = 0;
  for (const pattern of patterns) {
    for (const channel of pattern.channels) {
      for (const cell of channel.rows) {
        if (isOldFormatCell(cell)) {
          cellsToMigrate++;
        }
      }
    }
  }

  const instrumentsToMigrate = instruments.filter(inst =>
    hasOldInstrumentIds([inst])
  ).length;

  return {
    cellsToMigrate,
    instrumentsToMigrate,
    oldFormat: 'String notes, 0/100/200 IDs',
    newFormat: 'XM numeric notes, 1-128 IDs',
  };
}
