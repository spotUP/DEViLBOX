/**
 * TFMMusicMakerParser.ts - TFM Music Maker (.tfe, ZX Spectrum TurboFM).
 *
 * Playback is TFMEngine (tfm-wasm: ZXTune's TFM Music Maker player driving
 * two ymfm YM2203); this parser draws the grid and carries the file as
 * `tfmFileData`. Layout from ZXTune src/formats/chiptune/fm/tfmmusicmaker.cpp
 * (thoughts/shared/research/2026-10-05_tfm-music-maker-port.md):
 *
 * - v0.1-1.2 has no signature; v1.3+ starts 'TFMfmtV2'. Everything after the
 *   signature is one RLE stream (0x80 + 7-bit varint counter repeats the last
 *   byte) that unpacks to the fixed header, patterns included.
 * - Patterns are 6 channels x 256 lines, column-planar: notes (XOR 0xFF;
 *   0xFE key off, 0xFF empty), volumes, instruments, then effects.
 * - The player note is `note - 12`; note 0 sounds C-1 (block 0, F-num 707 at
 *   3.5 MHz), so the XM note is `note - 12 + 13`.
 *
 * The grid shows notes, key-offs, instruments and volumes; effects stay in the
 * file, which the engine plays whole.
 */
import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, ChannelData, InstrumentConfig } from '@/types';

const SIGNATURE = 'TFMfmtV2';
const CHANNELS = 6;
const LINES = 256;
const XM_KEY_OFF = 97;

interface Layout {
  v13: boolean;
  signature: number;
  headerSize: number;
  interleave: number;
  positionsCount: number;
  loopPosition: number;
  creationDate: number;
  saveDate: number;
  author: number;
  title: number;
  positions: number;
  instrumentNames: number;
  patternsSizes: number;
  patterns: number;
  patternSize: number;
  channelSize: number;
}

// ZXTune Version05 / Version13 RawHeader offsets (sizes 1981904 / 4341209).
const V05: Layout = {
  v13: false, signature: 0, headerSize: 1981904, interleave: 1, positionsCount: 2, loopPosition: 3,
  creationDate: 4, saveDate: 6, author: 10, title: 74, positions: 522, instrumentNames: 778,
  patternsSizes: 15568, patterns: 15824, patternSize: 7680, channelSize: 1280,
};
const V13: Layout = {
  v13: true, signature: 8, headerSize: 4341209, interleave: 10, positionsCount: 11, loopPosition: 12,
  creationDate: 13, saveDate: 15, author: 19, title: 83, positions: 531, instrumentNames: 787,
  patternsSizes: 15577, patterns: 15833, patternSize: 16896, channelSize: 2816,
};

const hasSignature = (b: Uint8Array): boolean =>
  b.length >= 8 && [...SIGNATURE].every((c, i) => b[i] === c.charCodeAt(0));

/**
 * The RLE stream after `layout.signature` bytes, unpacked to the full header;
 * null when the stream ends early or breaks ZXTune's checks.
 */
export function decompressTfm(bytes: Uint8Array, layout: Layout = hasSignature(bytes) ? V13 : V05): Uint8Array | null {
  const out = new Uint8Array(layout.headerSize);
  let pos = 0, n = 0;
  for (; n < layout.signature; n++) out[n] = bytes[pos++];
  let last = -1;
  while (n < out.length) {
    if (pos >= bytes.length) return null;
    const sym = bytes[pos++];
    if (sym !== 0x80) { out[n++] = last = sym; continue; }
    let counter = 0;
    for (let shift = 0; ; shift += 7) {
      if (shift > 21 || pos >= bytes.length) return null;
      const s = bytes[pos++];
      counter |= (s & 0x7f) << shift;
      if (s & 0x80) break;
    }
    if (counter === 0) { out[n++] = 0x80; continue; }
    if (counter < 2 || last === -1 || n + counter - 1 > out.length) return null;
    out.fill(last, n, n + counter - 1);
    n += counter - 1;
    last = -1; // ZXTune: disable doubled sequences
  }
  return out;
}

const validDate = (h: Uint8Array, at: number): boolean => {
  const year = h[at] & 127;
  const month = 1 + (((h[at + 1] & 7) << 1) | (h[at] >> 7));
  const day = h[at + 1] >> 3;
  return year <= 99 && month >= 1 && month <= 12 && day >= 1 && day <= 31;
};

/** A real TFM Music Maker file: signature or not, the stream unpacks and the dates hold (ZXTune's acceptance). */
export function isTfmMusicMakerFormat(bytes: Uint8Array): boolean {
  if (bytes.length < (hasSignature(bytes) ? 128 : 80)) return false;
  const layout = hasSignature(bytes) ? V13 : V05;
  const h = decompressTfm(bytes, layout);
  return !!h && validDate(h, layout.creationDate) && validDate(h, layout.saveDate);
}

const text = (h: Uint8Array, at: number, len: number): string => {
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = h[at + i];
    if (c === 0) break;
    s += c >= 0x20 && c < 0x7f ? String.fromCharCode(c) : ' ';
  }
  return s.trim();
};

const emptyCell = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

export async function parseTfmMusicMakerFile(buffer: ArrayBuffer | Uint8Array, filename = 'song.tfe'): Promise<TrackerSong> {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const layout = hasSignature(bytes) ? V13 : V05;
  const h = decompressTfm(bytes, layout);
  if (!h || !validDate(h, layout.creationDate) || !validDate(h, layout.saveDate)) {
    throw new Error(`${filename}: not a TFM Music Maker file`);
  }

  const evenTempo = layout.v13 ? h[8] : h[0] >> 4;
  const positionsCount = h[layout.positionsCount] || 256;
  const order = Array.from(h.subarray(layout.positions, layout.positions + positionsCount));

  // One grid pattern per used TFM pattern, in first-use order.
  const gridIndex = new Map<number, number>();
  const patterns: Pattern[] = [];
  const usedInstruments = new Set<number>([1]);
  for (const pat of order) {
    if (gridIndex.has(pat)) continue;
    const size = h[layout.patternsSizes + pat];
    const length = Math.max(1, size);
    const base = layout.patterns + pat * layout.patternSize;
    const channels = Array.from({ length: CHANNELS }, (_, ch): ChannelData => {
      const col = base + ch * layout.channelSize;
      const rows = Array.from({ length }, (_, line): TrackerCell => {
        const cell = emptyCell();
        if (line >= size) return cell;
        const note = h[col + line] ^ 0xff;
        const volume = h[col + LINES + line];
        const instrument = h[col + 2 * LINES + line];
        if (note === 0xfe) {
          cell.note = XM_KEY_OFF;
        } else if (note !== 0xff && note >= 12) {
          cell.note = Math.max(1, Math.min(96, note - 12 + 13));
          if (instrument) { cell.instrument = instrument; usedInstruments.add(instrument); }
        }
        // TFM volumes run 1-31; the volume column shows them on the XM 0-64 scale.
        if (volume) cell.volume = 0x10 + Math.min(64, Math.round(volume * 64 / 31));
        return cell;
      });
      return {
        id: `ch${ch}`, name: `FM ${ch + 1}`, muted: false, solo: false, collapsed: false,
        volume: 100, pan: 0, instrumentId: null, color: null, rows,
      };
    });
    gridIndex.set(pat, patterns.length);
    patterns.push({ id: `p${pat}`, name: `Pattern ${pat}`, length, channels });
  }

  const instruments: InstrumentConfig[] = [...usedInstruments].sort((a, b) => a - b).map((id) => {
    const at = layout.instrumentNames + (id - 1) * 16;
    const blank = h.subarray(at, at + 16).every((c) => c === 0xff);
    return {
      id, name: (blank ? '' : text(h, at, 16)) || `Instrument ${id}`,
      type: 'synth' as const, synthType: 'TFMSynth' as const, effects: [] as [], volume: 0, pan: 0,
    };
  });

  const songPositions = order.map((p) => gridIndex.get(p)!);
  const title = text(h, layout.title, 64);
  return {
    name: title || filename.replace(/\.tfe$/i, ''),
    format: 'TFM' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: Math.min(songPositions.length - 1, h[layout.loopPosition]),
    numChannels: CHANNELS,
    // 50 Hz frames: BPM 125 makes one tick a frame; the speed is the even-line tempo.
    initialSpeed: Math.max(1, evenTempo),
    initialBPM: 125,
    tfmFileData: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  };
}
