/**
 * JxsParser.ts - JayTrax (.jxs) native parser.
 *
 * The module is decoded by jxsGrid.ts (the original image is the carrier; subsong 0 is laid
 * on a 64 row timeline, one grid channel per JayTrax channel). Playback is the JXS WASM
 * replayer (jxs-wasm, JxsEngine), which reads the same image.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { Pattern } from '@/types';
import type { InstrumentConfig } from '@typedefs/instrument';
import { decodeJxsModule, isJxsModule, jxsPlayRange, jxsPlacement, jxsRowCell, JXS_ROWS, type JxsModule } from './jxsGrid';

export function isJxsFormat(bytes: Uint8Array): boolean {
  return isJxsModule(bytes);
}

export function parseJxsFile(bytes: Uint8Array, filename: string): TrackerSong | null {
  try {
    const m = decodeJxsModule(bytes);
    return m ? buildSong(m, filename, bytes) : null;
  } catch (e) {
    console.warn('[JxsParser] Parse failed:', e);
    return null;
  }
}

function buildSong(m: JxsModule, filename: string, bytes: Uint8Array): TrackerSong {
  const patterns: Pattern[] = Array.from({ length: m.bars }, (_, b) => ({
    id: `pattern-${b}`,
    name: `Bar ${b}`,
    length: JXS_ROWS,
    channels: Array.from({ length: m.channels }, (_, ch) => ({
      id: `channel-${ch}`, name: `Channel ${ch + 1}`, muted: false, solo: false, collapsed: false,
      volume: 100, pan: 0, instrumentId: null, color: null,
      rows: Array.from({ length: JXS_ROWS }, (_, row) => {
        const where = jxsPlacement(m, ch, b * JXS_ROWS + row);
        return where
          ? jxsRowCell(m.image, m, where[0], where[1])
          : { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
      }),
    })),
    importMetadata: {
      sourceFormat: 'JXS', sourceFile: filename, importedAt: new Date().toISOString(),
      originalChannelCount: m.channels, originalPatternCount: m.patterns, originalInstrumentCount: m.instruments,
    },
  }));
  // Pattern index = bar (edits and export address patterns by bar, so none are trimmed); the order is the bars
  // one engine pass plays. A replay restarts at the first of them (the engine has no in-pass loop jump).
  const { firstBar, lastBar } = jxsPlayRange(m);
  const positions = Array.from({ length: lastBar - firstBar + 1 }, (_, i) => firstBar + i);
  // One entry per JayTrax instrument, id = the 1-based number the grid cells carry. The name is the file's.
  const instruments = m.instrumentNames.map((name, i) => ({
    id: i + 1, name, type: 'synth' as const, synthType: 'JxsWasmSynth' as const, effects: [], volume: 0, pan: 0,
  })) as unknown as InstrumentConfig[];
  const song = {
    name: m.title || filename.replace(/\.[^/.]+$/, ''),
    format: 'JXS',
    patterns,
    instruments,
    songPositions: positions,
    songLength: positions.length,
    restartPosition: 0,
    numChannels: m.channels,
    initialSpeed: 6,
    initialBPM: m.bpm >= 32 && m.bpm <= 255 ? m.bpm : 125,
    linearPeriods: false,
    jxsFileData: bytes.slice().buffer as ArrayBuffer,
  };
  // The 'JXS' format name and jxsFileData field are declared in TrackerReplayer.ts (shared wiring).
  return song as unknown as TrackerSong;
}
