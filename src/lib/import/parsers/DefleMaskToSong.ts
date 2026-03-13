/**
 * DefleMaskToSong.ts — Convert a parsed DefleMask DMF module to a TrackerSong
 *
 * Uses the existing DefleMaskParser to parse the binary, then converts the
 * DMFModule structure to the TrackerSong format used by the replayer.
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, InstrumentConfig } from '@/types';
import { DefleMaskParser, type DMFModule, type DMFNote } from '@lib/import/formats/DefleMaskParser';

/**
 * Parse a DefleMask .dmf file and return a TrackerSong.
 */
export function parseDefleMaskToTrackerSong(buffer: ArrayBuffer, fileName: string): TrackerSong {
  const dmf = DefleMaskParser.parse(buffer, 'dmf') as DMFModule;

  const numChannels = dmf.channelCount;
  const numRows = dmf.patternRows;

  // Build patterns — each matrix position becomes one pattern
  const patterns: Pattern[] = [];
  const songPositions: number[] = [];

  for (let matrixPos = 0; matrixPos < dmf.matrixRows; matrixPos++) {
    const patIdx = patterns.length;
    songPositions.push(patIdx);

    const pattern: Pattern = Array.from({ length: numRows }, (_, row) => {
      const rowCells: TrackerCell[] = [];

      for (let ch = 0; ch < numChannels; ch++) {
        const patNum = dmf.patternMatrix[ch]?.[matrixPos] ?? 0;
        // Patterns stored: all for ch0, then all for ch1, etc.
        const patternOffset = ch * dmf.matrixRows + patNum;
        const dmfPat = dmf.patterns[patternOffset];
        const dmfNote = dmfPat?.rows?.[row]?.[ch];

        rowCells.push(convertDMFNote(dmfNote));
      }

      return rowCells;
    });

    patterns.push(pattern);
  }

  // Build instruments as ChipSynth placeholders
  const instruments: InstrumentConfig[] = dmf.instruments.map((inst, idx) => ({
    id: idx + 1,
    name: inst.name || `Instrument ${idx + 1}`,
    type: 'synth' as const,
    synthType: 'ChipSynth' as const,
    chipType: dmf.system.chipType,
    furnace: inst.config,
    effects: [],
    volume: -6,
    pan: 0,
  } as unknown as InstrumentConfig));

  // Calculate BPM: DefleMask BPM = Hz * 2.5 / speed
  const hz = 60; // NTSC default
  const speed = dmf.ticksPerRow[0] || 6;
  const bpm = Math.round((hz * 2.5) / speed);

  const song: TrackerSong = {
    name: dmf.name || fileName.replace(/\.[^.]+$/, ''),
    format: 'DMF' as any,
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels,
    initialSpeed: speed,
    initialBPM: bpm > 0 ? bpm : 125,
    linearPeriods: true,
  };

  return song;
}

/**
 * Convert a single DMFNote to a TrackerCell.
 */
function convertDMFNote(dmfNote: DMFNote | undefined): TrackerCell {
  const cell: TrackerCell = {
    note: 0, instrument: 0, volume: 0,
    effTyp: 0, eff: 0,
  };

  if (!dmfNote) return cell;

  // Note conversion
  if (dmfNote.note === 100) {
    cell.note = 97; // Key-off
  } else if (dmfNote.note >= 0 && dmfNote.note <= 11) {
    const octave = Math.max(0, Math.min(7, dmfNote.octave));
    cell.note = (octave * 12) + dmfNote.note + 1;
    if (cell.note > 96) cell.note = 96;
    if (cell.note < 1) cell.note = 0;
  }

  // Instrument (DMF uses -1 for none, 0-based; TrackerSong uses 0 for none, 1-based)
  if (dmfNote.instrument >= 0) {
    cell.instrument = dmfNote.instrument + 1;
  }

  // Volume (DMF 0-15 → XM volume column 0x10-0x50)
  if (dmfNote.volume >= 0) {
    cell.volume = 0x10 + Math.floor(dmfNote.volume * 4);
  }

  // First effect
  if (dmfNote.effects.length > 0) {
    const fx = dmfNote.effects[0];
    cell.effTyp = mapDMFEffect(fx.code);
    cell.eff = fx.value & 0xFF;
  }

  return cell;
}

/**
 * Map DefleMask effect codes to XM-compatible effect types.
 */
function mapDMFEffect(code: number): number {
  // DefleMask shares many effect codes with XM/ProTracker
  switch (code) {
    case 0x00: return 0x00; // Arpeggio
    case 0x01: return 0x01; // Porta up
    case 0x02: return 0x02; // Porta down
    case 0x03: return 0x03; // Tone porta
    case 0x04: return 0x04; // Vibrato
    case 0x07: return 0x07; // Tremolo
    case 0x08: return 0x08; // Panning
    case 0x09: return 0x09; // Sample offset
    case 0x0A: return 0x0A; // Volume slide
    case 0x0B: return 0x0B; // Position jump
    case 0x0C: return 0x0C; // Set volume
    case 0x0D: return 0x0D; // Pattern break
    case 0x0F: return 0x0F; // Set speed
    default:   return 0x00; // Unknown → arpeggio (no-op when param=0)
  }
}
