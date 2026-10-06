/**
 * SoundMasterParser.ts - Sound Master (Michiel J. Soede, 1991-94) native parser
 *
 * A Sound Master module is its own replayer plus the song (sm., sm1.-sm3.,
 * smpro.; .sm/.sm3/.smpro). The grid is the song the replayer walks, decoded
 * from the module's positions, blocks and patterns where the player's own
 * code addresses them (SoundMasterModule.ts, soundMasterGrid.ts): one grid
 * pattern per block the song plays, the four voices in step, a row = `speed`
 * play calls. UADE plays the module; grid edits are written into its chip RAM
 * through the layout's writeCell.
 *
 * Detection (from UADE "Sound Master_v1.asm", DTP_Check2 routine):
 *   1. word[0] must be 0x6000 (BRA.W opcode).
 *   2. word[1] (D2) must be: non-negative (< 0x8000 signed), non-zero, even.
 *   3. word[2] must be 0x6000.
 *   4. word[3] (D3) must be: non-negative, non-zero, even.
 *   5. word[4] must be 0x6000.
 *   6. Scan from (2 + D2) up to 30 bytes for 0x47FA (LEA pc-relative opcode).
 *   7. From that position, scan forward for 0x4E75 (RTS opcode). Let rtsEnd be
 *      the position immediately after the RTS word.
 *   8. Optional new-format check: if 4 bytes at (rtsEnd - 8) == 0x177C0000,
 *      set checkOff = rtsEnd - 6; otherwise checkOff = rtsEnd.
 *   9. Required: 4 bytes at (checkOff - 6) must equal 0x00BFE001.
 *
 * UADE eagleplayer.conf: SoundMaster  prefixes=sm,sm1,sm2,sm3,smpro
 *
 * Research: thoughts/shared/research/2026-10-06_sound-master-format.md
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, Pattern } from '@/types';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { createSamplerInstrument } from './AmigaUtils';
import { SmSong, soundMasterGrid, smCellEffectColumns } from './soundMasterGrid';

const NUM_CHANNELS = 4;
/** Paula's C-2 rate (period 428): a sample played at grid note C-2 sounds at its recorded pitch. */
const SAMPLE_RATE = 8287;
const CHANNEL_PAN = [-50, 50, 50, -50];

// ── Binary helpers ──────────────────────────────────────────────────────────

function u16BE(buf: Uint8Array, off: number): number {
  if (off + 1 >= buf.length) return 0;
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  if (off + 3 >= buf.length) return 0;
  return (
    ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0
  );
}

// ── Format detection ────────────────────────────────────────────────────────

/**
 * Return true if the buffer passes the full DTP_Check2 detection algorithm for
 * the Sound Master format.
 *
 * When `filename` is supplied the basename is also checked for the expected
 * UADE prefixes (sm., sm1., sm2., sm3., smpro.). If a prefix does not match,
 * detection returns false immediately to avoid false positives. The binary
 * detection is always performed regardless of filename.
 *
 * @param buffer    Raw file bytes
 * @param filename  Original filename (optional; used for prefix check)
 */
export function isSoundMasterFormat(buffer: ArrayBuffer, filename?: string): boolean {
  const buf = new Uint8Array(buffer);

  // ── Extension check (optional fast-reject) ───────────────────────────────
  // UADE eagleplayer.conf declares: prefixes=sm,sm1,sm2,sm3,smpro
  // In practice the reference files use these as file extensions (.sm, .smpro, .sm3).
  if (filename !== undefined) {
    const base = (filename.split('/').pop() ?? filename).toLowerCase();
    const validExtensions = ['.sm', '.sm1', '.sm2', '.sm3', '.smpro'];
    if (!validExtensions.some(ext => base.endsWith(ext))) return false;
  }

  // Minimum bytes: three BRA.W words at offsets 0, 4, 8 → need at least 10;
  // subsequent scan requires more. Gate on specific reads below.
  if (buf.length < 14) return false;

  // ── Three consecutive 0x6000 BRA.W words at offsets 0, 4, 8 ─────────────
  if (u16BE(buf, 0) !== 0x6000) return false;

  const d2 = u16BE(buf, 2);
  // D2 must be non-zero, non-negative (signed < 0x8000), and even
  if (d2 === 0 || d2 >= 0x8000 || (d2 & 1) !== 0) return false;

  if (u16BE(buf, 4) !== 0x6000) return false;

  const d3 = u16BE(buf, 6);
  // D3 must be non-zero, non-negative, and even
  if (d3 === 0 || d3 >= 0x8000 || (d3 & 1) !== 0) return false;

  if (u16BE(buf, 8) !== 0x6000) return false;

  // ── Scan for 0x47FA (LEA pc-relative) starting at (2 + D2) ───────────────
  // Scan limit is scanBase + 30 bytes (lea 30(A1), A0 in assembly)
  const scanBase = 2 + d2;
  const scanLimit = scanBase + 30;
  if (scanLimit + 1 >= buf.length) return false;

  let leaPos = -1;
  for (let pos = scanBase; pos < scanLimit && pos + 1 < buf.length; pos += 2) {
    if (u16BE(buf, pos) === 0x47fa) {
      leaPos = pos;
      break;
    }
  }
  if (leaPos === -1) return false;

  // ── Scan forward from leaPos for 0x4E75 (RTS) ────────────────────────────
  let rtsPos = -1;
  for (let pos = leaPos; pos + 1 < buf.length; pos += 2) {
    if (u16BE(buf, pos) === 0x4e75) {
      rtsPos = pos;
      break;
    }
  }
  if (rtsPos === -1) return false;

  // rtsEnd = position of A1 after the FindRTS loop (2 bytes past the RTS word)
  const rtsEnd = rtsPos + 2;

  // ── Optional new-format adjustment ───────────────────────────────────────
  // If 4 bytes at (rtsEnd - 8) == 0x177C0000, adjust checkOff back by 6
  let checkOff = rtsEnd;
  if (rtsEnd >= 8 && rtsEnd - 8 + 3 < buf.length && u32BE(buf, rtsEnd - 8) === 0x177c0000) {
    checkOff = rtsEnd - 6;
  }

  // ── Required check: 4 bytes at (checkOff - 6) must be 0x00BFE001 ─────────
  if (checkOff < 6 || checkOff - 6 + 3 >= buf.length) return false;
  return u32BE(buf, checkOff - 6) === 0x00bfe001;
}

// ── Prefix helpers ──────────────────────────────────────────────────────────

/**
 * Strip the Sound Master UADE prefix from a basename to derive the module title.
 * Handles: smpro., sm3., sm2., sm1., sm.  (longest match first).
 */
function stripSoundMasterPrefix(name: string): string {
  return (
    name
      .replace(/^smpro\./i, '')
      .replace(/^sm3\./i, '')
      .replace(/^sm2\./i, '')
      .replace(/^sm1\./i, '')
      .replace(/^sm\./i, '')
      .replace(/\.(smpro|sm3|sm2|sm1|sm)$/i, '') || name
  );
}

// ── Instruments ─────────────────────────────────────────────────────────────

/**
 * Instrument record `i` as a sampler of the sample it starts with: record
 * byte 0 names the sample slot, or, when byte 10 (the wave sequence length)
 * is set, the wave table entry byte 9 points at does.
 */
function recordInstrument(song: SmSong, i: number): InstrumentConfig {
  const m = song.module;
  const rec = m.instruments[i];
  const name = `Instrument ${i + 1}`;
  const placeholder = { id: i + 1, name, type: 'synth' as const, synthType: 'Synth' as const, effects: [], volume: 0, pan: 0 } as InstrumentConfig;
  const sample = (rec[10] ? m.wave[rec[9]] ?? 0 : rec[0]) & 31;
  const slot = m.samples[sample];
  if (!slot || slot.offset < 0 || slot.length === 0) return placeholder;
  const startAt = slot.offset;
  const end = Math.min(startAt + slot.length * 2, m.sampleData.length);
  if (startAt >= end) return placeholder;
  const pcm = m.sampleData.slice(startAt, end);
  const loops = slot.repeatLength > 1 && slot.repeatOffset < pcm.length;
  const loopStart = loops ? slot.repeatOffset : 0;
  const loopEnd = loops ? Math.min(pcm.length, slot.repeatOffset + slot.repeatLength * 2) : 0;
  return createSamplerInstrument(i + 1, `${name} (sample ${sample})`, pcm, 64, SAMPLE_RATE, loopStart, loopEnd);
}

// ── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse a Sound Master module into the grid its replayer plays. Throws for a
 * module whose player is not a Sound Master player this decoder knows (the
 * import then refuses rather than show a grid that is not the file's).
 */
export async function parseSoundMasterFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  if (!isSoundMasterFormat(buffer, filename)) {
    throw new Error('Not a Sound Master module');
  }
  const song = new SmSong(new Uint8Array(buffer));
  const m = song.module;
  const base = filename.split('/').pop() ?? filename;
  const moduleName = stripSoundMasterPrefix(base) || base;

  const grid = soundMasterGrid(song);
  const patterns: Pattern[] = song.steps.map((s, p) => ({
    id: `pattern-${p}`,
    name: `Position ${s.position} block ${s.block}`,
    length: s.rows,
    channels: Array.from({ length: NUM_CHANNELS }, (_, ch) => {
      const rows = grid[p][ch];
      const effectCols = Math.max(2, ...rows.map(smCellEffectColumns));
      return {
        id: `channel-${ch}`, name: `Channel ${ch + 1}`, muted: false,
        solo: false, collapsed: false, volume: 100, pan: CHANNEL_PAN[ch],
        instrumentId: null, color: null, rows,
        ...(effectCols > 2 ? { channelMeta: { importedFromMOD: false, effectCols } } : {}),
      };
    }),
    importMetadata: {
      sourceFormat: 'MOD' as const, sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: NUM_CHANNELS, originalPatternCount: m.patterns.length,
      originalInstrumentCount: m.instruments.length,
    },
  }));

  const layout: UADEPatternLayout = {
    formatId: 'soundMaster',
    patternDataFileOffset: song.addrs.patterns,
    bytesPerCell: 2,
    rowsPerPattern: m.patternLength >> 1,
    numChannels: NUM_CHANNELS,
    numPatterns: patterns.length,
    moduleSize: buffer.byteLength,
    encodeCell: () => { throw new Error('Sound Master cells are written through writeCell (their bytes depend on the block and position)'); },
    getCellFileOffset: (p, row, ch) => song.cellOffset(p, row, ch),
    writeCell: (p, row, ch, cell) => song.edit(p, row, ch, cell) ?? [],
  };

  return {
    name: `${moduleName} [Sound Master]`,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments: m.instruments.map((_, i) => recordInstrument(song, i)),
    songPositions: patterns.map((_, i) => i),
    songLength: patterns.length,
    restartPosition: 0,
    numChannels: NUM_CHANNELS,
    initialSpeed: m.speed,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    // Rows are `speed` player interrupts from the first one (proven against
    // UADE's Paula log, soundMasterGridMatchesPlayer.test.ts).
    uadePlayerTickGrid: true,
    uadePatternLayout: layout,
  };
}
