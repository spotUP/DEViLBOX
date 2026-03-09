/**
 * FuturePlayerExporter.ts - Export FuturePlayer (.fp) files
 *
 * Exports the original binary file data bundled with a JSON sidecar
 * containing any in-session pattern edits from the WASM shadow array.
 *
 * If the FuturePlayer engine is running, the shadow array is read and
 * compared against the original parsed pattern data. Any differences
 * are included as a `.fp.edits.json` sidecar alongside the binary.
 *
 * If no engine is running, falls back to passthrough of the original binary.
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { FPCellData } from '@/engine/futureplayer/FuturePlayerEngine';

export interface FuturePlayerExportResult {
  data: Blob;
  filename: string;
  warnings: string[];
  /** Optional sidecar with edit data (JSON blob) */
  sidecar?: { data: Blob; filename: string };
}

/**
 * Compare shadow data against the song's parsed pattern data to find edits.
 * Returns an array of edit records, or empty array if no changes.
 */
function findEdits(
  shadowVoices: FPCellData[][],
  song: TrackerSong,
): Array<{ voice: number; row: number; note: number; instrument: number; effect: number; param: number }> {
  const edits: Array<{ voice: number; row: number; note: number; instrument: number; effect: number; param: number }> = [];

  // Build a reference map from the song's pattern data
  // The shadow array is linearized across all patterns, so we need to
  // reconstruct the linear row sequence from the song's patterns/positions
  for (let voice = 0; voice < Math.min(4, shadowVoices.length); voice++) {
    const shadowCells = shadowVoices[voice];
    let linearRow = 0;

    for (let ordIdx = 0; ordIdx < song.songLength; ordIdx++) {
      const patIdx = song.songPositions[ordIdx] ?? 0;
      const pat = song.patterns[patIdx];
      const channel = pat?.channels[voice];
      const numRows = pat?.length ?? 64;

      for (let row = 0; row < numRows; row++) {
        if (linearRow >= shadowCells.length) break;

        const shadowCell = shadowCells[linearRow];
        const songCell = channel?.rows[row];

        // Compare shadow cell to parsed song cell
        const songNote = songCell?.note ?? 0;
        const songInstr = songCell?.instrument ?? 0;
        const songEffTyp = songCell?.effTyp ?? 0;
        const songEff = songCell?.eff ?? 0;

        if (
          shadowCell.note !== songNote ||
          shadowCell.instrument !== songInstr ||
          shadowCell.effect !== songEffTyp ||
          shadowCell.param !== songEff
        ) {
          edits.push({
            voice,
            row: linearRow,
            note: shadowCell.note,
            instrument: shadowCell.instrument,
            effect: shadowCell.effect,
            param: shadowCell.param,
          });
        }

        linearRow++;
      }
    }

    // Check remaining shadow rows beyond parsed data
    for (let r = linearRow; r < shadowCells.length; r++) {
      const cell = shadowCells[r];
      if (cell.note !== 0 || cell.instrument !== 0 || cell.effect !== 0 || cell.param !== 0) {
        edits.push({
          voice,
          row: r,
          note: cell.note,
          instrument: cell.instrument,
          effect: cell.effect,
          param: cell.param,
        });
      }
    }
  }

  return edits;
}

/**
 * Export a FuturePlayer song.
 *
 * If the WASM engine is running, reads the shadow array and generates
 * an edits sidecar JSON alongside the original binary.
 */
export async function exportAsFuturePlayer(song: TrackerSong): Promise<FuturePlayerExportResult> {
  const warnings: string[] = [];

  const fileData = song.futurePlayerFileData;
  if (!fileData || fileData.byteLength === 0) {
    throw new Error('No FuturePlayer file data available for export');
  }

  const baseName = (song.name || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_');
  const binaryBlob = new Blob([fileData], { type: 'application/octet-stream' });

  // Try to get shadow data from the running engine
  try {
    const { FuturePlayerEngine } = await import('@/engine/futureplayer/FuturePlayerEngine');
    if (FuturePlayerEngine.hasInstance()) {
      const engine = FuturePlayerEngine.getInstance();
      const shadowVoices = await engine.getShadowData();

      if (shadowVoices && shadowVoices.length > 0) {
        const edits = findEdits(shadowVoices, song);

        if (edits.length > 0) {
          // Build sidecar with edit data
          const sidecarData = {
            format: 'FuturePlayer',
            version: 1,
            description: 'In-session pattern edits for FuturePlayer module. Apply these edits to the shadow array after loading the original binary.',
            editCount: edits.length,
            edits,
            // Also include the full shadow array for complete state
            shadowVoices: shadowVoices.map((cells, voice) => ({
              voice,
              length: cells.length,
              cells,
            })),
          };

          const sidecarJson = JSON.stringify(sidecarData, null, 2);
          const sidecarBlob = new Blob([sidecarJson], { type: 'application/json' });

          warnings.push(`${edits.length} pattern edit(s) saved to sidecar JSON file.`);
          warnings.push('Load the original .fp file, then apply edits from the .edits.json sidecar.');

          return {
            data: binaryBlob,
            filename: `${baseName}.fp`,
            warnings,
            sidecar: {
              data: sidecarBlob,
              filename: `${baseName}.fp.edits.json`,
            },
          };
        } else {
          warnings.push('No pattern edits detected — exporting original file.');
        }
      }
    }
  } catch {
    // Engine not available — fall back to passthrough
  }

  warnings.push('Exports original file — in-session edits could not be read from engine.');
  return { data: binaryBlob, filename: `${baseName}.fp`, warnings };
}
