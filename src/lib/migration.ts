/**
 * Migration utilities for converting old DEViLBOX formats to new XM-aligned format
 */

import type { TrackerCell, Pattern } from '@typedefs';
import type { InstrumentConfig } from '@typedefs/instrument';
import { stringNoteToXM, effectStringToXM } from './xmConversions';

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

  // Second pass: Apply ID mapping and add type field
  return instruments.map(inst => {
    const newId = idMapping.get(inst.id) ?? inst.id;

    // Determine instrument type
    const type = inst.synthType === 'Sampler' || inst.synthType === 'Player'
      ? 'sample' as const
      : 'synth' as const;

    return {
      ...inst,
      id: newId,
      type: (inst as any).type || type, // Preserve existing type or infer
    };
  });
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

  return hasOldCells || hasOldIds || missingTypeField;
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
