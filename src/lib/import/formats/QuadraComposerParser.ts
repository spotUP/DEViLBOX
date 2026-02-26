/**
 * QuadraComposerParser.ts -- Quadra Composer (.emod, .qc) Amiga format parser
 *
 * Quadra Composer is a 4-channel IFF-based Amiga tracker by Arne Johansen.
 * File structure: IFF FORM/EMOD with three sub-chunks:
 *   EMIC — module info: instruments, patterns, song order
 *   PATT — pattern data (4 bytes per cell, 4 channels, variable row count)
 *   8SMP — 8-bit PCM sample data (all samples concatenated)
 *
 * Notes differ from ProTracker: EMOD note byte 0-35 = C-1 to B-3 (0-based).
 * Effects are ProTracker-compatible with minor differences (see below).
 *
 * References:
 *   Reference Code/libxmp-master/docs/formats/QuadraComposer.txt
 *   Reference Code/libxmp-master/src/loaders/emod_load.c
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';

// -- Binary helpers -----------------------------------------------------------

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

// -- Instrument info (from EMIC chunk) ----------------------------------------

interface QCInstrument {
  name: string;
  volume: number;     // 0-64
  length: number;     // sample data size in bytes
  hasLoop: boolean;   // bit0 of control byte
  loopStart: number;  // bytes
  loopEnd: number;    // bytes
}

// -- Pattern info (from EMIC chunk) -------------------------------------------

interface QCPatternInfo {
  origNumber: number;  // original pattern number (EMOD file numbering)
  rows: number;        // number of rows (rowByte + 1)
}

// -- Format detection ---------------------------------------------------------

/**
 * Returns true if the buffer is an IFF FORM/EMOD file (Quadra Composer).
 */
export function isQuadraComposerFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 12) return false;
  const view = new DataView(buffer);
  return readString(view, 0, 4) === 'FORM' && readString(view, 8, 4) === 'EMOD';
}

// -- Main parser --------------------------------------------------------------

/**
 * Parse a Quadra Composer (.emod, .qc) file into a TrackerSong.
 */
export async function parseQuadraComposerFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  const view  = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  if (buffer.byteLength < 12) throw new Error('QC: file too small');
  if (readString(view, 0, 4) !== 'FORM') throw new Error('QC: missing FORM magic');
  if (readString(view, 8, 4) !== 'EMOD') throw new Error('QC: not an EMOD file');

  // ── Walk IFF chunks after FORM+size+EMOD header (starts at offset 12) ────

  let pos = 12;

  let songName = filename.replace(/\.[^/.]+$/, '');
  let initialBPM = 125;
  const instruments: QCInstrument[] = [];
  const patternInfos: QCPatternInfo[] = [];
  const reorder = new Uint8Array(256);
  let songTable: number[] = [];
  let pattStart = -1;
  let pattSize  = 0;
  let smpStart  = -1;
  let smpSize   = 0;

  while (pos + 8 <= buffer.byteLength) {
    const id   = readString(view, pos, 4);
    const size = u32(view, pos + 4);
    const data = pos + 8;
    pos = data + size;
    if (pos & 1) pos++;  // IFF word-alignment

    if (id === 'EMIC') {
      let p = data;

      /* version */ u16(view, p); p += 2;
      const name = readString(view, p, 20).trim(); p += 20;
      if (name) songName = name;
      p += 20;  // composer (skip)

      initialBPM = u8(view, p); p += 1;
      const numSamples = u8(view, p); p += 1;

      for (let i = 0; i < numSamples; i++) {
        p += 1;  // sample nr (original index, ignored)
        const vol       = u8(view, p); p += 1;
        const len       = u16(view, p) * 2; p += 2;
        const smpName   = readString(view, p, 20).trim(); p += 20;
        const ctrl      = u8(view, p); p += 1;
        /* finetune */  i8(view, p); p += 1;  // (not used in createSamplerInstrument)
        const lps       = u16(view, p) * 2; p += 2;
        const lpl       = u16(view, p) * 2; p += 2;
        p += 4;  // skip file-offset pointer

        instruments.push({
          name: smpName || `Sample ${i + 1}`,
          volume: vol,
          length: len,
          hasLoop: (ctrl & 1) !== 0,
          loopStart: lps,
          loopEnd: lpl > 0 ? lps + lpl : 0,
        });
      }

      p += 1;  // pad byte
      const numPatterns = u8(view, p); p += 1;

      for (let i = 0; i < numPatterns; i++) {
        const origNum = u8(view, p); p += 1;
        const rows    = u8(view, p) + 1; p += 1;
        p += 20;  // skip pattern name
        p += 4;   // skip file-offset pointer
        reorder[origNum] = i;
        patternInfos.push({ origNumber: origNum, rows });
      }

      const numPositions = u8(view, p); p += 1;
      for (let i = 0; i < numPositions; i++) {
        songTable.push(reorder[u8(view, p)]); p += 1;
      }

    } else if (id === 'PATT') {
      pattStart = data;
      pattSize  = size;
    } else if (id === '8SMP') {
      smpStart = data;
      smpSize  = size;
    }
  }

  // ── Parse PATT chunk ──────────────────────────────────────────────────────
  //
  // Pattern cell (4 bytes):
  //   byte 0: instrument (1-based; 0 = no new instrument)
  //   byte 1: note (0-35 = C-1 to B-3; >35 = no note)
  //   byte 2: low nibble = effect type (high nibble unused)
  //   byte 3: effect param
  //
  // Effect differences vs ProTracker / XM:
  //   4yz: vibrato depth doubled — fxp = (fxp & 0xF0) | ((fxp & 0x0F) << 1)
  //   9yz: sample offset × 0x200 (vs XM × 0x100) → double param (cap at 0xFF)
  //   Cyz: set volume → moved to volume column (0x10 + vol)

  type RawCell = { ins: number; note: number; fxt: number; fxp: number };
  const patternData: RawCell[][][] = [];

  {
    let p = pattStart >= 0 ? pattStart : 0;
    const end = pattStart >= 0 ? Math.min(pattStart + pattSize, buffer.byteLength) : 0;

    for (const pi of patternInfos) {
      const pattRows: RawCell[][] = [];

      for (let row = 0; row < pi.rows; row++) {
        const rowCells: RawCell[] = [];

        for (let ch = 0; ch < 4; ch++) {
          if (pattStart < 0 || p + 4 > end) {
            rowCells.push({ ins: 0, note: 0xFF, fxt: 0, fxp: 0 });
            continue;
          }

          const ins  = u8(view, p);
          const note = u8(view, p + 1);
          const fxt  = u8(view, p + 2) & 0x0F;
          let   fxp  = u8(view, p + 3);
          p += 4;

          // Fix effect 4 (vibrato): double depth nibble
          if (fxt === 0x04) {
            fxp = (fxp & 0xF0) | ((fxp << 1) & 0x0F);
          }
          // Fix effect 9 (sample offset): EMOD uses fxp×0x200; XM uses fxp×0x100
          if (fxt === 0x09) {
            fxp = Math.min(fxp * 2, 0xFF);
          }

          rowCells.push({ ins, note, fxt, fxp });
        }

        pattRows.push(rowCells);
      }

      patternData.push(pattRows);
    }
  }

  // ── Extract PCM samples from 8SMP chunk ───────────────────────────────────

  const sampleBuffers: (Uint8Array | null)[] = [];
  {
    let p = smpStart >= 0 ? smpStart : 0;
    const end = smpStart >= 0 ? Math.min(smpStart + smpSize, buffer.byteLength) : 0;

    for (const inst of instruments) {
      if (smpStart < 0 || inst.length === 0) {
        sampleBuffers.push(null);
      } else {
        const avail = Math.min(inst.length, Math.max(0, end - p));
        sampleBuffers.push(avail > 0 ? bytes.slice(p, p + avail) : null);
        p += inst.length;
      }
    }
  }

  // ── Build InstrumentConfig list ───────────────────────────────────────────

  const instrConfigs: InstrumentConfig[] = instruments.map((inst, i) => {
    const pcm = sampleBuffers[i];
    if (!pcm || pcm.length === 0) {
      return {
        id: i + 1,
        name: inst.name,
        type: 'sample' as const,
        synthType: 'Sampler' as const,
        effects: [],
        volume: -60,
        pan: 0,
      } as unknown as InstrumentConfig;
    }
    return createSamplerInstrument(
      i + 1, inst.name, pcm, inst.volume,
      8287,
      inst.hasLoop ? inst.loopStart : 0,
      inst.hasLoop ? inst.loopEnd   : 0,
    );
  });

  // ── Build TrackerSong patterns ────────────────────────────────────────────

  const PANNING = [-50, 50, 50, -50] as const;  // Amiga LRRL

  const patterns: Pattern[] = patternData.map((pRows, pIdx) => {
    const channels: ChannelData[] = Array.from({ length: 4 }, (_, ch) => {
      const rows: TrackerCell[] = pRows.map(rowCells => {
        const c = rowCells[ch];

        // Note: EMOD 0-35 = C-1 to B-3 → XM 13-48 (Amiga octave 1-3 = DEViLBOX XM 13-48)
        const xmNote = c.note <= 35 ? c.note + 13 : 0;

        // Effect C (set volume) → XM volume column; clear effect
        let volCol = 0;
        let effTyp = c.fxt;
        let eff    = c.fxp;

        if (c.fxt === 0x0C) {
          volCol = 0x10 + Math.min(c.fxp, 64);
          effTyp = 0;
          eff    = 0;
        }

        return {
          note: xmNote,
          instrument: c.ins,
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
        sourceFormat: 'QuadraComposer',
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: 4,
        originalPatternCount: patternInfos.length,
        originalInstrumentCount: instruments.length,
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
        sourceFormat: 'QuadraComposer',
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: 4,
        originalPatternCount: 0,
        originalInstrumentCount: 0,
      },
    });
  }

  // ── Song order ───────────────────────────────────────────────────────────

  const songPositions = songTable.length > 0
    ? songTable.filter(idx => idx < patterns.length)
    : [0];

  if (songPositions.length === 0) songPositions.push(0);

  return {
    name: songName,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments: instrConfigs,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: Math.max(32, Math.min(255, initialBPM || 125)),
    linearPeriods: false,
  };
}
