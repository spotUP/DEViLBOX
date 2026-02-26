/**
 * JamCrackerParser.ts -- JamCracker (.jam, .jc) Amiga format parser
 *
 * JamCracker is a 4-channel Amiga tracker by M. Gemmel (1990-1991).
 * Magic: "BeEp" at offset 0.
 *
 * Supports PCM samples and AM-synthesis instruments.
 * PCM instruments are extracted as Sampler instruments with WAV data.
 * AM instruments are silently skipped (no synthesis data available).
 *
 * Format reference:
 *   Reference Code/libxmp-master/docs/formats/JamCracker_TN.txt
 *   Reference Code/libxmp-master/docs/formats/JamCracker.txt
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument, amigaNoteToXM } from './AmigaUtils';

// -- Binary reading helpers ---------------------------------------------------

function u8(view: DataView, off: number): number  { return view.getUint8(off); }
function i8(view: DataView, off: number): number  { return view.getInt8(off); }
function u16(view: DataView, off: number): number { return view.getUint16(off, false); }
function u32(view: DataView, off: number): number { return view.getUint32(off, false); }

function readString(view: DataView, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    const ch = view.getUint8(off + i);
    if (ch === 0) break;
    s += String.fromCharCode(ch);
  }
  return s;
}

// -- JamCracker binary structures --------------------------------------------

interface JCInstrument {
  name: string;
  flags: number;   // bit0: loop, bit1: 1=AM (no PCM), 0=PCM
  size: number;    // sample data size in bytes (or AM data size)
}

interface JCPattern {
  rows: number;    // number of rows (pt_size)
}

interface JCNote {
  period:   number;  // 0=empty, 1-36=note index (C-1 to B-3)
  instr:    number;  // instrument (signed byte; positive = 1-based; 0=none)
  speed:    number;  // new speed/tempo, 0 = no change
  arpeggio: number;  // arpeggio param (e.g. 0x24 = up 2, up 4)
  vibrato:  number;  // vibrato param (high nibble = speed, low = depth)
  phase:    number;  // phase — no XM equivalent, ignored
  volume:   number;  // 0=no change, 1-65 → vol 0-64
  porta:    number;  // portamento speed
}

// -- Format detection --------------------------------------------------------

/**
 * Returns true if the buffer starts with the JamCracker "BeEp" magic.
 */
export function isJamCrackerFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 10) return false;
  const view = new DataView(buffer);
  return readString(view, 0, 4) === 'BeEp';
}

// -- Main parser -------------------------------------------------------------

/**
 * Parse a JamCracker (.jam, .jc) file into a TrackerSong.
 */
export async function parseJamCrackerFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  const view  = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  if (buffer.byteLength < 10) throw new Error('JamCracker: file too small');

  const magic = readString(view, 0, 4);
  if (magic !== 'BeEp') throw new Error(`JamCracker: bad magic "${magic}"`);

  // ── Instrument table ──────────────────────────────────────────────────────
  // Offset 4: NOI (uint16BE)
  // Offset 6: NOI × 40-byte InstInfo
  //   [0..30] name (31 bytes, null-terminated)
  //   [31]    flags (uint8)
  //   [32..35] size (uint32BE)
  //   [36..39] runtime address pointer (ignored)

  const noi = u16(view, 4);
  const INST_STRIDE = 40;
  const INST_START  = 6;

  if (INST_START + noi * INST_STRIDE > buffer.byteLength) {
    throw new Error('JamCracker: truncated instrument table');
  }

  const jcInstruments: JCInstrument[] = [];
  for (let i = 0; i < noi; i++) {
    const base  = INST_START + i * INST_STRIDE;
    const name  = readString(view, base, 31).trim();
    const flags = u8(view, base + 31);
    const size  = u32(view, base + 32);
    jcInstruments.push({ name, flags, size });
  }

  // ── Pattern table ─────────────────────────────────────────────────────────
  // After instrument table: NOP (uint16BE)
  // NOP × 6-byte PattInfo:
  //   [0..1] pt_size (uint16BE — number of rows)
  //   [2..5] runtime address pointer (ignored)

  let pos = INST_START + noi * INST_STRIDE;
  if (pos + 2 > buffer.byteLength) throw new Error('JamCracker: truncated pattern count');

  const nop = u16(view, pos);
  pos += 2;

  const PATT_STRIDE = 6;
  if (pos + nop * PATT_STRIDE > buffer.byteLength) {
    throw new Error('JamCracker: truncated pattern table');
  }

  const jcPatterns: JCPattern[] = [];
  for (let i = 0; i < nop; i++) {
    const rows = u16(view, pos);
    jcPatterns.push({ rows: rows > 0 ? rows : 64 });
    pos += PATT_STRIDE;
  }

  // ── Song table ────────────────────────────────────────────────────────────
  // SL (uint16BE), then SL × uint16BE pattern numbers

  if (pos + 2 > buffer.byteLength) throw new Error('JamCracker: truncated song length');
  const songLen = u16(view, pos);
  pos += 2;

  const songTable: number[] = [];
  for (let i = 0; i < songLen; i++) {
    if (pos + 2 > buffer.byteLength) break;
    songTable.push(u16(view, pos));
    pos += 2;
  }

  // ── Pattern data ──────────────────────────────────────────────────────────
  // NOP patterns, each: pt_size rows × 4 channels × 8-byte NoteInfo
  //   [0] nt_period   (uint8, 0=empty, 1-36=note)
  //   [1] nt_instr    (int8,  1-based, 0=none)
  //   [2] nt_speed    (uint8)
  //   [3] nt_arpeggio (uint8)
  //   [4] nt_vibrato  (uint8)
  //   [5] nt_phase    (uint8, no XM equivalent)
  //   [6] nt_volume   (uint8, 0=no change, 1-65 → vol 0-64)
  //   [7] nt_porta    (uint8)

  const patternData: JCNote[][][] = [];
  for (let p = 0; p < nop; p++) {
    const rowCount = jcPatterns[p].rows;
    const pattRows: JCNote[][] = [];

    for (let row = 0; row < rowCount; row++) {
      const rowNotes: JCNote[] = [];

      for (let ch = 0; ch < 4; ch++) {
        if (pos + 8 > buffer.byteLength) {
          rowNotes.push({ period: 0, instr: 0, speed: 0, arpeggio: 0, vibrato: 0, phase: 0, volume: 0, porta: 0 });
          continue;
        }
        rowNotes.push({
          period:   u8(view, pos),
          instr:    i8(view, pos + 1),
          speed:    u8(view, pos + 2),
          arpeggio: u8(view, pos + 3),
          vibrato:  u8(view, pos + 4),
          phase:    u8(view, pos + 5),
          volume:   u8(view, pos + 6),
          porta:    u8(view, pos + 7),
        });
        pos += 8;
      }

      pattRows.push(rowNotes);
    }

    patternData.push(pattRows);
  }

  // ── Sample data ───────────────────────────────────────────────────────────
  // NOI samples concatenated. Advance pos even for AM instruments.

  const sampleBuffers: (Uint8Array | null)[] = [];
  for (let i = 0; i < noi; i++) {
    const size = jcInstruments[i].size;
    const isAM = (jcInstruments[i].flags & 0x02) !== 0;

    if (isAM || size === 0) {
      sampleBuffers.push(null);
      pos += size;
    } else {
      const avail = Math.min(size, Math.max(0, buffer.byteLength - pos));
      sampleBuffers.push(avail > 0 ? bytes.slice(pos, pos + avail) : null);
      pos += size;
    }
  }

  // ── Build InstrumentConfig list ───────────────────────────────────────────

  const instruments: InstrumentConfig[] = [];
  for (let i = 0; i < noi; i++) {
    const inst    = jcInstruments[i];
    const isAM    = (inst.flags & 0x02) !== 0;
    const hasLoop = (inst.flags & 0x01) !== 0;
    const pcm     = sampleBuffers[i];
    const name    = inst.name || `Sample ${i + 1}`;

    if (isAM || pcm === null) {
      // AM instrument or empty sample — silent placeholder
      instruments.push({
        id: i + 1,
        name,
        type: 'sample' as const,
        synthType: 'Sampler' as const,
        effects: [],
        volume: -60,
        pan: 0,
      } as unknown as InstrumentConfig);
    } else {
      // PCM sample. JamCracker has no loop points — loop the entire sample
      // if the loop flag is set.
      const loopStart = 0;
      const loopEnd   = hasLoop ? pcm.length : 0;
      instruments.push(createSamplerInstrument(i + 1, name, pcm, 64, 8287, loopStart, loopEnd));
    }
  }

  // ── Build TrackerSong patterns ────────────────────────────────────────────

  const PANNING = [-50, 50, 50, -50] as const;  // Amiga LRRL

  const patterns: Pattern[] = patternData.map((pRows, pIdx) => {
    const channels: ChannelData[] = Array.from({ length: 4 }, (_, ch) => {
      const rows: TrackerCell[] = pRows.map(rowNotes => {
        const n = rowNotes[ch];

        // Note: amigaNoteToXM(1) = 13 (C-1) through amigaNoteToXM(36) = 48 (B-3)
        const xmNote    = n.period > 0 ? amigaNoteToXM(n.period) : 0;
        const instrNum  = n.instr > 0 ? n.instr : 0;

        // Volume column: 0x10..0x50 = set volume 0..64
        const volCol = n.volume > 0
          ? 0x10 + Math.min(n.volume - 1, 64)
          : 0;

        // Effects: map highest-priority non-zero effect to XM
        let effTyp = 0, eff = 0;
        if (n.speed > 0) {
          // Set tempo/speed — XM Fxx
          effTyp = 0x0F; eff = n.speed;
        } else if (n.arpeggio > 0) {
          // Arpeggio — XM 0xy
          effTyp = 0x00; eff = n.arpeggio;
        } else if (n.vibrato > 0) {
          // Vibrato — XM 4xy (high nibble = speed, low = depth — same encoding)
          effTyp = 0x04; eff = n.vibrato;
        } else if (n.porta > 0) {
          // Portamento to note — XM 3xx
          effTyp = 0x03; eff = n.porta;
        }
        // nt_phase has no XM equivalent — ignored

        return {
          note: xmNote,
          instrument: instrNum,
          volume: volCol,
          effTyp,
          eff,
          effTyp2: 0,
          eff2: 0,
        };
      });

      return {
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: PANNING[ch],
        instrumentId: null,
        color: null,
        rows,
      };
    });

    return {
      id: `pattern-${pIdx}`,
      name: `Pattern ${pIdx}`,
      length: pRows.length,
      channels,
      importMetadata: {
        sourceFormat: 'JamCracker',
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: 4,
        originalPatternCount: nop,
        originalInstrumentCount: noi,
      },
    };
  });

  // Fallback: at least one empty pattern
  if (patterns.length === 0) {
    patterns.push({
      id: 'pattern-0',
      name: 'Pattern 0',
      length: 64,
      channels: Array.from({ length: 4 }, (_, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: PANNING[ch],
        instrumentId: null,
        color: null,
        rows: Array.from({ length: 64 }, (): TrackerCell => ({
          note: 0, instrument: 0, volume: 0,
          effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
        })),
      })),
      importMetadata: {
        sourceFormat: 'JamCracker',
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: 4,
        originalPatternCount: 0,
        originalInstrumentCount: 0,
      },
    });
  }

  // ── Build song order ──────────────────────────────────────────────────────
  // Map original pattern indices in song table to our patterns array indices.
  // patternData indices match jcPatterns indices, so songTable entries are valid.
  const songPositions = songTable
    .filter(idx => idx < nop)
    .map(idx => idx);

  if (songPositions.length === 0) songPositions.push(0);

  // ── Initial speed/BPM ─────────────────────────────────────────────────────
  // JamCracker doesn't store a global tempo. Scan first row for speed command.
  let initialSpeed = 6;
  if (songPositions.length > 0) {
    const firstPatt = patternData[songPositions[0]];
    if (firstPatt?.length > 0) {
      for (const cell of firstPatt[0]) {
        if (cell.speed > 0) { initialSpeed = cell.speed; break; }
      }
    }
  }

  const moduleName = filename.replace(/\.[^/.]+$/, '');

  return {
    name: moduleName,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed,
    initialBPM: 125,
    linearPeriods: false,
  };
}
