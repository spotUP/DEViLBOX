/**
 * MajorTomParser.ts - Major Tom (.arp, "ARP." magic) stored-cell grid.
 *
 * Layout from third-party/nuade/players/majortom (mt_module.c): 0x13a song length, 0x13c restart, 0x13e speed (u16),
 * 0x140 order list (256 B), 0x340 instrument block table, 0x6240 patterns of 1024 B = 64 rows x 4 voices x
 * [note, instrument, effect, param]. Playback is UADE; the grid is the file's own cells, edited in place.
 * shortcut: per-position transpose (0x240) is not applied to the grid, upgrade when a song uses a non-zero one.
 */
import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, Pattern } from '@/types';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { decodeMajorTomCell, encodeMajorTomCell } from '@/engine/uade/encoders/MajorTomEncoder';

const PAT_START = 0x6240;
const ORDER = 0x140;
const ROWS = 64;
const NUM_CH = 4;

export function isMajorTomFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const b = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return b.length >= PAT_START + 1024 && b[0] === 0x41 && b[1] === 0x52 && b[2] === 0x50 && b[3] === 0x2e;
}

export function parseMajorTomFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isMajorTomFormat(buf)) throw new Error('Not a Major Tom module');

  const fitting = Math.floor((buf.length - PAT_START) / 1024);
  const length = Math.max(1, buf[0x13a]);
  const order = Array.from({ length }, (_, i) => buf[ORDER + i]);
  const numPatterns = Math.min(fitting, Math.max(...order) + 1);
  const songPositions = order.filter((p) => p < numPatterns);
  const speed = ((buf[0x13e] << 8) | buf[0x13f]) || 6;

  const cellOffset = (p: number, row: number, ch: number): number =>
    p < 0 || p >= numPatterns || row < 0 || row >= ROWS || ch < 0 || ch >= NUM_CH ? -1 : PAT_START + p * 1024 + row * 16 + ch * 4;

  const patterns: Pattern[] = Array.from({ length: numPatterns }, (_, p) => ({
    id: `pattern-${p}`,
    name: `Pattern ${p}`,
    length: ROWS,
    channels: Array.from({ length: NUM_CH }, (_, ch) => ({
      id: `channel-${ch}`, name: `Channel ${ch + 1}`, muted: false, solo: false, collapsed: false, volume: 100,
      pan: ch === 0 || ch === 3 ? -50 : 50, instrumentId: null, color: null,
      rows: Array.from({ length: ROWS }, (_, r) => decodeMajorTomCell(buf.subarray(cellOffset(p, r, ch), cellOffset(p, r, ch) + 4))),
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const, sourceFile: filename, importedAt: new Date().toISOString(),
      originalChannelCount: NUM_CH, originalPatternCount: numPatterns, originalInstrumentCount: 64,
    },
  }));

  const instruments: InstrumentConfig[] = Array.from({ length: 64 }, (_, i) => ({
    id: i + 1, name: '', type: 'synth' as const, synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
  }) as InstrumentConfig);

  const base = (filename.split('/').pop() ?? filename).replace(/^arp\./i, '').replace(/\.arp$/i, '');
  return {
    name: `${base} [Major Tom]`,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions: songPositions.length ? songPositions : [0],
    songLength: songPositions.length || 1,
    restartPosition: Math.min(buf[0x13c], Math.max(0, songPositions.length - 1)),
    numChannels: NUM_CH,
    initialSpeed: speed,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadePatternLayout: {
      formatId: 'majortom',
      patternDataFileOffset: PAT_START,
      bytesPerCell: 4,
      rowsPerPattern: ROWS,
      numChannels: NUM_CH,
      numPatterns,
      moduleSize: buffer.byteLength,
      encodeCell: encodeMajorTomCell,
      encodeOverStored: true,
      decodeCell: decodeMajorTomCell,
      getCellFileOffset: cellOffset,
    } satisfies UADEPatternLayout,
  };
}
