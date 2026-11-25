/**
 * AxsParser.ts - AXS songs (IFF "FORM" ... "AXSF"): up to 16 tracks of synth instruments and a
 * drum sampler. Playback is the axs WASM replayer (axs-wasm, AxsEngine), which reads the file
 * bytes itself.
 *
 * The grid is the C++ block parse (axs-wasm/src/axs.cpp, via axsEditWasm): one pattern per block,
 * the song order as the position list, one channel per track (the widest block sets the count).
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell } from '@/types';
import { axsGrid, type AxsCell, type CreateAxsEdit } from '@/engine/axs/axsEditWasm';

const tag = (b: Uint8Array, o: number): string => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);

/** Content test: IFF FORM of type AXSF. */
export function isAxsFormat(b: Uint8Array): boolean {
  return b.length >= 12 && tag(b, 0) === 'FORM' && tag(b, 8) === 'AXSF';
}

const NOTE_OFF = 0xff;
const emptyCell = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

/** Stored cell to tracker cell: MIDI note (stored + 1) to tracker note (MIDI 12 = C-0 = 1), off = 97. */
export function axsCellToTracker(c: AxsCell, trackByte: number): TrackerCell {
  const cell = emptyCell();
  if (c.note === NOTE_OFF) cell.note = 97;
  else if (c.note > 0) {
    cell.note = Math.max(1, Math.min(96, c.note - 1 - 11));
    cell.instrument = (trackByte & 0x0f) + 1;
    cell.volume = 0x10 + (c.vel >> 1);
  }
  if (c.cmd) { cell.effTyp = c.cmd; cell.eff = c.par; }
  return cell;
}

export async function parseAxsFile(bytes: Uint8Array, filename: string, create?: CreateAxsEdit): Promise<TrackerSong | null> {
  if (!isAxsFormat(bytes)) return null;
  const grid = await axsGrid(bytes, create);
  if (grid.blocks.length === 0) return null;
  const numChannels = Math.max(1, ...grid.blocks.map(b => b.tracks));
  const patterns: Pattern[] = grid.blocks.map((blk, p) => ({
    id: `pattern-${p}`,
    name: `Block ${p}`,
    length: Math.max(1, blk.rows),
    channels: Array.from({ length: numChannels }, (_, ch) => ({
      id: `channel-${ch}`, name: `Track ${ch + 1}`, muted: false, solo: false, collapsed: false,
      volume: 100, pan: 0, instrumentId: null, color: null,
      rows: Array.from({ length: Math.max(1, blk.rows) }, (_, r) => {
        const c = blk.cells[ch]?.[r];
        return c ? axsCellToTracker(c, blk.trackBytes[ch] ?? 0) : emptyCell();
      }),
    })),
    importMetadata: {
      sourceFormat: 'AXS', sourceFile: filename, importedAt: new Date().toISOString(),
      originalChannelCount: numChannels, originalPatternCount: grid.blocks.length, originalInstrumentCount: 0,
    },
  }));
  const order = grid.order.filter(i => i >= 0 && i < patterns.length);
  return {
    name: filename.replace(/\.[^/.]+$/, ''),
    format: 'AXS',
    patterns,
    instruments: [],
    songPositions: order.length ? order : [0],
    songLength: order.length || 1,
    restartPosition: 0,
    numChannels,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    axsFileData: bytes.slice().buffer as ArrayBuffer,
  };
}
