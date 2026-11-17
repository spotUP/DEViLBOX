/**
 * SpeedySystemParser.ts — Speedy System (.ss) and Speedy A1 System (.sas)
 * Amiga music format detector/stub loader
 *
 * Two distinct Amiga formats share this parser:
 *
 * 1. Speedy System (.ss) by Michael Winterberg
 *    Magic: 'SPEEDY-SYSTEM\x00' (14 ASCII bytes) at offset 0.
 *    UADE eagleplayer.conf: SpeedySystem  prefixes=ss
 *
 * 2. Speedy A1 System (.sas) — a variant by the same author
 *    No ASCII magic. Heuristic detection (empirical from reference files):
 *      bytes[0..2]  == 0x00, 0x00, 0x00
 *      bytes[3]     in 1..31  (track/channel count — always small and nonzero)
 *      bytes[14..15] == 0x02, 0x00
 *    UADE eagleplayer.conf: SpeedyA1System  prefixes=sas
 *
 * Actual audio playback is always delegated to UADE. This parser creates a
 * metadata-only TrackerSong stub.
 *
 * Reference: UADE eagleplayer.conf, empirical analysis of reference files.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, Pattern } from '@/types';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { speedySystemEncoder, unpackSpeedySystemPattern, SS_ROWS } from '@/engine/uade/encoders/SpeedySystemEncoder';

// ── Constants ─────────────────────────────────────────────────────────────────

const SS_MAGIC     = 'SPEEDY-SYSTEM\x00'; // 14 bytes
const NUM_CHANNELS = 4;
const MIN_SS_SIZE  = 14;
const MIN_SAS_SIZE = 16;

// ── Format detection ──────────────────────────────────────────────────────────

function checkSSMagic(buf: Uint8Array): boolean {
  if (buf.length < MIN_SS_SIZE) return false;
  for (let i = 0; i < SS_MAGIC.length; i++) {
    if (buf[i] !== SS_MAGIC.charCodeAt(i)) return false;
  }
  return true;
}

function checkSASSignature(buf: Uint8Array): boolean {
  if (buf.length < MIN_SAS_SIZE) return false;
  // bytes[0..2] must all be 0x00
  if (buf[0] !== 0x00 || buf[1] !== 0x00 || buf[2] !== 0x00) return false;
  // bytes[3] must be a small nonzero value (track/channel count)
  if (buf[3] === 0x00 || buf[3] > 31) return false;
  // bytes[14..15] == 0x02, 0x00 (observed in all reference .sas files)
  if (buf[14] !== 0x02 || buf[15] !== 0x00) return false;
  return true;
}

/**
 * Returns true if the buffer is a Speedy System (.ss) or Speedy A1 System (.sas) module.
 */
export function isSpeedySystemFormat(buffer: ArrayBuffer): boolean {
  const buf = new Uint8Array(buffer);
  return checkSSMagic(buf) || checkSASSignature(buf);
}

// ── Pattern grid (ss_module.c): pointer tables of 4 voices x 256 longs at the marker, offsets relative to it ──

const MARKER = 0x00001190;
const POSITIONS = 256;
const VOICE_TABLE = 0x400;

const u32 = (b: Uint8Array, o: number): number => o >= 0 && o + 4 <= b.length ? ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0 : 0;

function findBase(b: Uint8Array): number {
  for (let o = 0x12; o + 4 <= b.length; o += 2) if (u32(b, o) === MARKER) return o;
  return -1;
}

/** One grid pattern per song position (up to the first end cell of voice 0), with the variable layout that repacks edits. */
function parseSpeedySystemGrid(buf: Uint8Array, base: number): { patterns: Pattern[]; layout: UADEVariablePatternLayout; filename: string } | null {
  const offsetOf = (voice: number, pos: number) => base + (u32(buf, base + voice * VOICE_TABLE + pos * 4) | 0);
  const fileIndex = new Map<number, number>(); // pattern offset -> file pattern index
  const addrs: number[] = [], sizes: number[] = [], refs: number[][] = [];
  const stored: ReturnType<typeof unpackSpeedySystemPattern>[] = [];
  for (let voice = 0; voice < 4; voice++) for (let pos = 0; pos < POSITIONS; pos++) {
    const off = offsetOf(voice, pos);
    const at = base + voice * VOICE_TABLE + pos * 4;
    if (!fileIndex.has(off)) {
      const u = unpackSpeedySystemPattern(buf, off);
      if (!u) continue;
      fileIndex.set(off, addrs.length); addrs.push(off); sizes.push(u.size); refs.push([]); stored.push(u);
    }
    refs[fileIndex.get(off)!]?.push(at);
  }
  const trackMap: number[][] = [];
  const patterns: Pattern[] = [];
  for (let pos = 0; pos < POSITIONS; pos++) {
    const fps = [0, 1, 2, 3].map((v) => fileIndex.get(offsetOf(v, pos)) ?? -1);
    if (fps.some((f) => f < 0)) break;
    trackMap.push(fps);
    patterns.push({
      id: `pattern-${pos}`, name: `Position ${pos}`, length: SS_ROWS,
      channels: fps.map((fp, ch) => ({
        id: `channel-${ch}`, name: `Channel ${ch + 1}`, muted: false, solo: false, collapsed: false, volume: 100,
        pan: [-50, 50, 50, -50][ch], instrumentId: null, color: null, rows: stored[fp]!.rows.map((r) => ({ ...r })),
      })),
    } as Pattern);
    if (stored[fps[0]]!.rows.some((r) => r.effTyp === 0xff)) break;
  }
  if (patterns.length === 0) return null;
  const layout: UADEVariablePatternLayout = {
    formatId: 'speedySystem', numChannels: 4, numFilePatterns: addrs.length, rowsPerPattern: SS_ROWS, moduleSize: buf.length,
    encoder: speedySystemEncoder, filePatternAddrs: addrs, filePatternSizes: sizes, trackMap,
    blockRows: stored.map((u) => u!.rows), blockRawBytes: addrs.map((a, i) => buf.slice(a, a + sizes[i])),
    // every pointer long that reaches a pattern, so a grown pattern can move to the file end and be repointed
    sectionRefs: { base, at: refs },
  };
  return { patterns, layout, filename: '' };
}

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Parse a Speedy System or Speedy A1 System module into a metadata-only
 * TrackerSong stub. Actual audio playback is delegated to UADE.
 * Returns a resolved promise (never throws).
 */
export async function parseSpeedySystemFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  const buf = new Uint8Array(buffer);
  const isSAS = !checkSSMagic(buf) && checkSASSignature(buf);
  const label = isSAS ? 'Speedy A1 System' : 'Speedy System';

  const songName = filename.replace(/\.[^/.]+$/, '');

  const instruments: InstrumentConfig[] = Array.from({ length: 16 }, (_, i) => ({
    id:        i + 1,
    name:      '',
    type:      'synth' as const,
    synthType: 'Synth' as const,
    effects:   [],
    volume:    0,
    pan:       0,
  } as InstrumentConfig));

  const emptyRows = Array.from({ length: 64 }, () => ({
    note: 0, instrument: 0, volume: 0,
    effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
  }));

  // Amiga LRRL panning
  const CHAN_PAN = [-50, 50, 50, -50];

  const grid = isSAS ? null : (() => { const base = findBase(buf); return base < 0 ? null : parseSpeedySystemGrid(buf, base); })();

  const pattern = {
    id:      'pattern-0',
    name:    'Pattern 0',
    length:  64,
    channels: Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
      id:           `channel-${ch}`,
      name:         `Channel ${ch + 1}`,
      muted:        false,
      solo:         false,
      collapsed:    false,
      volume:       100,
      pan:          CHAN_PAN[ch],
      instrumentId: null,
      color:        null,
      rows:         emptyRows,
    })),
    importMetadata: {
      sourceFormat:            'MOD' as const,
      sourceFile:              filename,
      importedAt:              new Date().toISOString(),
      originalChannelCount:    NUM_CHANNELS,
      originalPatternCount:    1,
      originalInstrumentCount: instruments.length,
    },
  };

  return {
    name:            `${songName} [${label}]`,
    format:          'MOD' as TrackerFormat,
    patterns:        grid ? grid.patterns : [pattern],
    instruments:     grid ? Array.from({ length: 50 }, (_, i) => ({ ...instruments[0], id: i + 1 })) : instruments,
    songPositions:   grid ? grid.patterns.map((_, i) => i) : [0],
    songLength:      grid ? grid.patterns.length : 1,
    ...(grid ? { uadeVariableLayout: grid.layout } : {}),
    restartPosition: 0,
    numChannels:     NUM_CHANNELS,
    initialSpeed:    6,
    initialBPM:      125,
    linearPeriods:   false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
  };
}
