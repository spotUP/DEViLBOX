/**
 * UADEChipRAMPatternReader — Read pattern data from UADE's emulated chip RAM
 * after a song is loaded, and populate the TrackerStore with decoded cells.
 *
 * This is the key mechanism for displaying pattern data for packed/compiled
 * Amiga formats. The 68k replayer has already unpacked the data into chip RAM;
 * we read it back and decode it using the format's uadePatternLayout.
 *
 * Architecture:
 *   UADE loads packed module → unpacks into chip RAM → 68k replayer plays
 *   → this reader reads chip RAM → decodeCell() → TrackerStore patterns
 */

import type { UADEPatternLayout } from './UADEPatternEncoder';
import { getCellFileOffset, decodeModCell } from './UADEPatternEncoder';
import type { UADEChipEditor } from './UADEChipEditor';

/**
 * Read patterns from chip RAM and update the TrackerStore.
 * Call this after UADE has loaded a song that has stub patterns.
 */
export async function populatePatternsFromChipRAM(
  chipEditor: UADEChipEditor,
  layout: UADEPatternLayout,
): Promise<{ patternsRead: number; cellsDecoded: number; nonEmptyCells: number }> {
  const moduleBase = await chipEditor.getModuleBase();
  if (!moduleBase || moduleBase === 0) {
    console.warn('[ChipRAMReader] No module base address — cannot read patterns');
    return { patternsRead: 0, cellsDecoded: 0, nonEmptyCells: 0 };
  }

  const decode = layout.decodeCell ?? decodeModCell;

  // Read entire pattern data block in one read for efficiency
  const totalPatternBytes = layout.numPatterns * layout.rowsPerPattern * layout.numChannels * layout.bytesPerCell;
  const allBytes = await chipEditor.readBytes(
    moduleBase + layout.patternDataFileOffset,
    totalPatternBytes,
  );

  if (allBytes.length === 0) {
    console.warn('[ChipRAMReader] Empty pattern data block');
    return { patternsRead: 0, cellsDecoded: 0, nonEmptyCells: 0 };
  }

  // Import TrackerStore dynamically to avoid circular deps
  const { useTrackerStore } = await import('@/stores/useTrackerStore');
  const { setCellInPattern } = await import('@/stores/tracker/patternEditActions');
  const store = useTrackerStore.getState();

  let cellsDecoded = 0;
  let nonEmptyCells = 0;

  for (let pat = 0; pat < layout.numPatterns && pat < store.patterns.length; pat++) {
    const pattern = store.patterns[pat];
    if (!pattern) continue;

    for (let row = 0; row < layout.rowsPerPattern; row++) {
      for (let ch = 0; ch < layout.numChannels; ch++) {
        // Calculate offset within the bulk read
        const fileOffset = getCellFileOffset(layout, pat, row, ch) - layout.patternDataFileOffset;
        if (fileOffset < 0 || fileOffset + layout.bytesPerCell > allBytes.length) continue;

        const cellBytes = allBytes.slice(fileOffset, fileOffset + layout.bytesPerCell);
        const cell = decode(cellBytes);
        cellsDecoded++;

        if (cell.note > 0 || cell.instrument > 0 || cell.effTyp > 0) {
          nonEmptyCells++;
          setCellInPattern(pattern, ch, row, cell);
        }
      }
    }
  }

  console.log(`[ChipRAMReader] Read ${layout.numPatterns} patterns, ${cellsDecoded} cells, ${nonEmptyCells} non-empty`);
  return { patternsRead: layout.numPatterns, cellsDecoded, nonEmptyCells };
}
