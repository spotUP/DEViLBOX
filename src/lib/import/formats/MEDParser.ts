/**
 * MEDParser.ts — OctaMED/MED format parser (.med, .mmd0, .mmd1, .mmd2, .mmd3)
 *
 * Parses MED (Music EDitor) files for the Amiga. Handles:
 *   - MMD0: Original MED format (4 channels)
 *   - MMD1: OctaMED format (up to 64 channels)
 *   - MMD2/MMD3: Extended OctaMED (larger files, same structure)
 *
 * The format is well-documented in the OctaMED SDK and OpenMPT sources.
 *
 * File layout:
 *   Header (descriptor with offsets)
 *   MMD0Song (instruments, song positions, speeds, name)
 *   Block array (patterns)
 *   InstrExt/InstrInfo (extended instrument data)
 *   Sample data (raw PCM)
 *
 * References:
 *   - OctaMED SDK documentation
 *   - https://wiki.multimedia.cx/index.php/MED
 *   - OpenMPT MED loader (soundlib/Load_med.cpp)
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import type { OctaMEDConfig } from '@/types/instrument';
import { createSamplerInstrument } from './AmigaUtils';

const TEXT_DECODER = new TextDecoder('iso-8859-1');

function str4(buf: Uint8Array, offset: number): string {
  return TEXT_DECODER.decode(buf.subarray(offset, offset + 4));
}

function readStr(buf: Uint8Array, offset: number, len: number): string {
  let end = offset;
  while (end < offset + len && buf[end] !== 0) end++;
  return TEXT_DECODER.decode(buf.subarray(offset, end)).replace(/\0/g, '').trim();
}

function u16(buf: Uint8Array, off: number): number {
  return (buf[off] << 8) | buf[off + 1];
}

function u32(buf: Uint8Array, off: number): number {
  return ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0;
}

function s8(buf: Uint8Array, off: number): number {
  const v = buf[off];
  return v >= 128 ? v - 256 : v;
}

/**
 * MED/MMD0 period to note conversion.
 * The period table is identical to ProTracker.
 */
const MED_PERIODS = [
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,  // oct 1
  428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,  // oct 2
  214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,  // oct 3
];

function periodToNote(period: number): number {
  if (period === 0) return 0;
  let best = 0, bestDist = Infinity;
  for (let i = 0; i < MED_PERIODS.length; i++) {
    const d = Math.abs(MED_PERIODS[i] - period);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  // Convert to XM note: PT octave 1 starts at note 13 (C-1 in XM)
  return best + 13;
}

export function parseMEDFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  const magic = str4(buf, 0);

  if (!['MMD0', 'MMD1', 'MMD2', 'MMD3'].includes(magic)) {
    throw new Error(`Not a MED file: magic="${magic}"`);
  }

  const isMMD1Plus = magic !== 'MMD0';

  // ── Parse header offsets ─────────────────────────────────────────────────
  // Offset 0x04: module length
  // Offset 0x08: pointer to MMD0Song structure
  // Offset 0x0C: unused
  // Offset 0x10: pointer to block (pattern) array
  // Offset 0x14: expansion pointer
  // ...

  const songOffset   = u32(buf, 0x08);  // → MMD0Song
  const blockOffset  = u32(buf, 0x10);  // → pointer array of MMD0Block*
  // sampleOffset at 0x14 (reserved for future sample parsing)
  const expOffset    = u32(buf, 0x18);  // → MMD0Exp (extension)

  // ── Parse MMD0Song ───────────────────────────────────────────────────────
  // struct MMD0Song {
  //   struct InstrHdr instrs[63]; // 63 instruments × 8 bytes = 504 bytes
  //   uint16 numblocks;           // Number of blocks (patterns)
  //   uint16 songlen;             // Song sequence length
  //   uint8  playseq[256];        // Song position sequence
  //   uint16 deftempo;            // Default tempo (BPM)
  //   int8   playtransp;          // Global transpose
  //   uint8  flags;               // Flags
  //   uint8  flags2;              // More flags
  //   uint8  tempo2;              // Secondary tempo (ticks)
  //   uint8  trkvol[16];          // Track volumes
  //   uint8  mastervol;           // Master volume
  //   uint8  numsamples;          // Number of samples actually used
  // };

  const INSTR_HDR_SIZE = 8;
  const MAX_INSTRUMENTS = 63;

  let so = songOffset;
  const instrs: Array<{ synth: boolean; waveLen: number; loopStart: number; loopLength: number; volume: number; finetune: number }> = [];

  for (let i = 0; i < MAX_INSTRUMENTS; i++) {
    const base = so + i * INSTR_HDR_SIZE;
    if (base + INSTR_HDR_SIZE > buf.length) break;
    const length = u32(buf, base);         // Length in words for samples, or 0 for synth
    const type = s8(buf, base + 4);        // -2=hybrid, -1=synth, 0+=sample
    const volume = buf[base + 5];
    const loopStart = u16(buf, base + 6) * 2;
    const loopLength = u16(buf, base + 8) * 2; // Note: might be at different offset
    instrs.push({
      synth: type < 0,
      waveLen: length * 2,  // Length is in words
      loopStart,
      loopLength,
      volume: volume || 64,
      finetune: 0,
    });
  }

  so += MAX_INSTRUMENTS * INSTR_HDR_SIZE;
  const numBlocks = u16(buf, so);
  const songLen   = u16(buf, so + 2);
  const playseq: number[] = [];
  for (let i = 0; i < 256; i++) playseq.push(buf[so + 4 + i]);
  const defTempo  = u16(buf, so + 260);  // BPM tempo
  const tempo2    = buf[so + 264];        // ticks per line (speed)
  const numSamples = buf[so + 267];

  // ── Parse block (pattern) pointers ──────────────────────────────────────
  // blockOffset → array of 4-byte pointers to MMD0Block structures
  const blockPtrs: number[] = [];
  for (let i = 0; i < numBlocks; i++) {
    const ptr = u32(buf, blockOffset + i * 4);
    if (ptr > 0 && ptr < buf.length) blockPtrs.push(ptr);
  }

  // ── Determine number of channels from first block ────────────────────────
  // MMD0Block: uint16 numtracks, uint16 lines, data[]
  // MMD1Block: uint16 numtracks, uint16 lines, uint32 blockinfo_offset (extra), data[]
  let numChannels = 4;
  if (blockPtrs.length > 0) {
    numChannels = u16(buf, blockPtrs[0]);
    numChannels = Math.max(1, Math.min(64, numChannels));
  }

  // ── Parse patterns ───────────────────────────────────────────────────────
  const trackerPatterns: Pattern[] = [];

  for (let patIdx = 0; patIdx < blockPtrs.length; patIdx++) {
    const bptr = blockPtrs[patIdx];

    // MMD0 block header: uint8 numtracks, uint8 numlines (2 bytes), data follows at bptr+2
    // MMD1+ block header: uint16 numtracks, uint16 numlines, uint32 blockinfo_offset (8 bytes)
    let nTracks: number;
    let nLines: number;
    let dataStart: number;
    if (isMMD1Plus) {
      nTracks   = u16(buf, bptr);
      nLines    = u16(buf, bptr + 2);
      dataStart = bptr + 8; // MMD1 has 4 extra bytes (blockinfo ptr)
    } else {
      nTracks   = buf[bptr];
      nLines    = buf[bptr + 1];
      dataStart = bptr + 2;
    }

    // For MMD0: 3 bytes/cell; for MMD1+: variable (usually 4 bytes/cell)
    const bytesPerCell = isMMD1Plus ? 4 : 3;

    const channels: ChannelData[] = Array.from({ length: nTracks }, (_, ch) => {
      const rows: TrackerCell[] = [];

      for (let row = 0; row <= nLines; row++) {
        const offset = dataStart + (row * nTracks + ch) * bytesPerCell;
        if (offset + bytesPerCell > buf.length) {
          rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
          continue;
        }

        let note = 0, inst = 0, effTyp = 0, eff = 0;

        if (isMMD1Plus) {
          // MMD1 cell format: byte0=note, byte1=inst, byte2=effect, byte3=param
          const rawNote = buf[offset];
          inst    = buf[offset + 1];
          effTyp  = buf[offset + 2];
          eff     = buf[offset + 3];
          // MMD1 notes are 0=none, 1=C-0, 2=C#0, ..., 96=B-7
          note = rawNote > 0 ? rawNote + 12 : 0; // Shift up one octave for XM
        } else {
          // MMD0 cell format: 3 bytes
          // byte0: high 4 bits = instrument high nibble, low 4 bits = note high
          // byte1: note low 8 bits (this is actually period, not note number in MMD0)
          // Actually: byte0[7:4]=inst high, byte0[3:0]=note-period high; byte1=note period low; byte2[7:4]=inst low, byte2[3:0]=eff; byte3=param
          const raw0 = buf[offset];
          const raw1 = buf[offset + 1];
          const raw2 = buf[offset + 2];
          const period = ((raw0 & 0x0F) << 8) | raw1;
          inst = ((raw0 >> 4) << 4) | (raw2 >> 4);
          const rawEff = raw2 & 0x0F;
          eff = offset + 3 < buf.length ? buf[offset + 3] : 0;
          note = periodToNote(period);
          const { effTyp: e, eff: ev } = mapMEDEffect(rawEff, eff);
          effTyp = e;
          eff = ev;
        }

        rows.push({ note, instrument: inst, volume: 0, effTyp, eff, effTyp2: 0, eff2: 0 });
      }

      return {
        id: `channel-${ch}`,
        name: `Track ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: ch % 2 === 0 ? -25 : 25,
        instrumentId: null,
        color: null,
        rows,
      };
    });

    trackerPatterns.push({
      id: `pattern-${patIdx}`,
      name: `Block ${patIdx}`,
      length: nLines + 1,
      channels,
      importMetadata: {
        sourceFormat: 'MED',
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: nTracks,
        originalPatternCount: numBlocks,
        originalInstrumentCount: numSamples || MAX_INSTRUMENTS,
      },
    });
  }

  // ── Parse sample data ────────────────────────────────────────────────────
  // Sample data follows immediately after the Song structure + patterns.
  // Each sample is a contiguous block of 8-bit signed PCM.
  // We need to find sample offsets from the instrument table.

  // Parse from MMD0Exp (if present) for instrument names and extra data
  let instrNames: string[] = [];
  if (expOffset > 0 && expOffset < buf.length) {
    // MMD0Exp.nextmod, hdrlen, instrext_offset, instrext_entries, ...
    // instrExt fields at expOffset+8..+14 (reserved for future instrument extension parsing)
    const instrInfoOff = u32(buf, expOffset + 16);
    const instrInfoEntries = u16(buf, expOffset + 20);
    const instrInfoSize = u16(buf, expOffset + 22);

    // Read instrument names from InstrInfo (40 bytes each: name[40])
    if (instrInfoOff > 0 && instrInfoOff < buf.length) {
      for (let i = 0; i < instrInfoEntries; i++) {
        const base = instrInfoOff + i * instrInfoSize;
        if (base + 40 > buf.length) break;
        instrNames.push(readStr(buf, base, 40));
      }
    }
  }

  // Build instruments — find sample PCM offsets
  // The samples are stored after all the structure data. We scan for them.
  // Since MED sample offsets aren't explicitly stored in older headers,
  // we calculate offsets based on cumulative lengths.

  // Find a reasonable sample data start offset
  // Heuristic: look for first block past the song structure
  let sampleDataStart = songOffset + MAX_INSTRUMENTS * INSTR_HDR_SIZE + 268 + numSamples * 8;
  // Round to word boundary
  sampleDataStart = (sampleDataStart + 1) & ~1;

  const instruments: InstrumentConfig[] = [];
  let samplePos = sampleDataStart;

  for (let i = 0; i < Math.min(MAX_INSTRUMENTS, numSamples || MAX_INSTRUMENTS); i++) {
    const instr = instrs[i];
    if (!instr) break;

    const name = instrNames[i] || `Instrument ${i + 1}`;

    if (instr.synth || instr.waveLen === 0) {
      const synthBase = samplePos;
      const synthLen  = u32(buf, synthBase);  // total struct size in bytes

      if (synthLen > 0 && synthBase + synthLen <= buf.length) {
        // SynthInstr layout (from OctaMED SDK / libxmp med.h):
        //   +0    u32  length      — total struct size in bytes
        //   +4    s16  type        — -1=synth, -2=hybrid
        //   +6    u8   defaultdecay
        //   +7    u8   reserved[3]
        //   +10   u16  rep         — loop start (in words)
        //   +12   u16  replen      — loop length (in words)
        //   +14   u16  voltbllen   — number of valid entries in voltbl
        //   +16   u16  wftbllen    — number of valid entries in wftbl
        //   +18   u8   volspeed    — vol-table execute rate
        //   +19   u8   wfspeed     — wf-table execute rate
        //   +20   u16  wforms      — number of waveforms (1-64)
        //   +22   u8   voltbl[128] — volume command table
        //   +150  u8   wftbl[128]  — waveform command table
        //   +278  u32  wf[wforms]  — per-waveform offsets from struct start to SynthWF
        //
        // Each SynthWF at wf[j]:
        //   +0   u16  length  — waveform length in words
        //   +2   s8   wfdata  — length*2 bytes of signed PCM

        const repWords    = u16(buf, synthBase + 10);
        const repLenWords = u16(buf, synthBase + 12);
        const voltblLen   = u16(buf, synthBase + 14);
        const wftblLen    = u16(buf, synthBase + 16);
        const volspeed    = buf[synthBase + 18];
        const wfspeed     = buf[synthBase + 19];
        const wforms      = u16(buf, synthBase + 20);

        const loopStartBytes = repWords * 2;
        const loopLenBytes   = repLenWords * 2;

        // Sanity-check wforms; emit a silent placeholder for degenerate instruments
        if (wforms === 0xFFFF || wforms === 0 || wforms > 64) {
          instruments.push({
            id: i + 1,
            name,
            type: 'synth' as const,
            synthType: 'OctaMEDSynth' as const,
            octamed: {
              volume: instr.volume & 0x3F,
              voltblSpeed: 0,
              wfSpeed: 0,
              vibratoSpeed: 0,
              loopStart: 0,
              loopLen: 0,
              voltbl: new Uint8Array(128).fill(0xFF),
              wftbl: new Uint8Array(128).fill(0xFF),
              waveforms: [new Int8Array(256)],
            },
            effects: [],
            volume: 0,
            pan: 0,
          } as InstrumentConfig);
          samplePos += synthLen;
          if (samplePos & 1) samplePos++;
          continue;
        }

        // Vol table: 128 bytes at offset 22 (clamp to voltblLen valid entries)
        const voltbl = new Uint8Array(128).fill(0xFF);
        const voltblCopy = Math.min(voltblLen, 128);
        for (let b = 0; b < voltblCopy; b++) voltbl[b] = buf[synthBase + 22 + b];

        // Wf table: 128 bytes at offset 150 (clamp to wftblLen valid entries)
        const wftbl = new Uint8Array(128).fill(0xFF);
        const wftblCopy = Math.min(wftblLen, 128);
        for (let b = 0; b < wftblCopy; b++) wftbl[b] = buf[synthBase + 150 + b];

        // Waveform pointer table: wforms × u32 at offset 278.
        // Each value is an offset from the SynthInstr struct start to a SynthWF.
        // SynthWF layout: u16 length (in words), then length*2 signed bytes.
        const waveforms: Int8Array[] = [];
        for (let w = 0; w < wforms; w++) {
          const ptrOff = synthBase + 278 + w * 4;
          if (ptrOff + 4 > buf.length) break;
          const wfOffset = u32(buf, ptrOff);  // offset from struct start
          const wfAbs    = synthBase + wfOffset;
          if (wfAbs + 2 > buf.length) {
            waveforms.push(new Int8Array(256)); // missing — silent
            continue;
          }
          const wfLenWords = u16(buf, wfAbs);
          const wfBytes    = wfLenWords * 2;
          const dataStart  = wfAbs + 2;
          if (dataStart + wfBytes > buf.length || wfBytes === 0) {
            waveforms.push(new Int8Array(256)); // truncated/empty — silent
            continue;
          }
          // Copy up to 256 bytes of signed PCM into a 256-byte Int8Array
          const wf = new Int8Array(256);
          const copyLen = Math.min(wfBytes, 256);
          for (let b = 0; b < copyLen; b++) {
            const raw = buf[dataStart + b];
            wf[b] = raw >= 128 ? raw - 256 : raw;
          }
          waveforms.push(wf);
        }
        if (waveforms.length === 0) {
          waveforms.push(new Int8Array(256)); // silent fallback
        }

        const octamedConfig: OctaMEDConfig = {
          volume: instr.volume & 0x3F,
          voltblSpeed: volspeed,
          wfSpeed: wfspeed,
          vibratoSpeed: 0,   // vibratoSpeed is per-note in OctaMED, not per-instrument
          loopStart: loopStartBytes,
          loopLen: loopLenBytes,
          voltbl,
          wftbl,
          waveforms,
        };

        instruments.push({
          id: i + 1,
          name,
          type: 'synth' as const,
          synthType: 'OctaMEDSynth' as const,
          octamed: octamedConfig,
          effects: [],
          volume: 0,
          pan: 0,
        } as InstrumentConfig);

        samplePos += synthLen;
        if (samplePos & 1) samplePos++;  // word-align
      } else {
        // Malformed SynthInstr — emit a silent OctaMEDSynth placeholder
        instruments.push({
          id: i + 1,
          name,
          type: 'synth' as const,
          synthType: 'OctaMEDSynth' as const,
          octamed: {
            volume: instr.volume & 0x3F,
            voltblSpeed: 0,
            wfSpeed: 0,
            vibratoSpeed: 0,
            loopStart: 0,
            loopLen: 0,
            voltbl: new Uint8Array(128).fill(0xFF),
            wftbl: new Uint8Array(128).fill(0xFF),
            waveforms: [new Int8Array(256)],
          },
          effects: [],
          volume: 0,
          pan: 0,
        } as InstrumentConfig);
      }
      continue;
    }

    // Extract PCM
    const len = Math.min(instr.waveLen, buf.length - samplePos);
    const pcm = len > 0 ? buf.slice(samplePos, samplePos + len) : new Uint8Array(0);
    samplePos += len;
    // Align to word boundary
    if (samplePos & 1) samplePos++;

    instruments.push(createSamplerInstrument(
      i + 1, name, pcm, instr.volume, 8287,
      instr.loopStart, instr.loopStart + instr.loopLength
    ));
  }

  // ── Build output ─────────────────────────────────────────────────────────
  const songPositions = playseq.slice(0, Math.max(1, songLen));

  return {
    name: filename.replace(/\.[^/.]+$/, ''),
    format: magic as TrackerFormat,
    patterns: trackerPatterns,
    instruments: instruments.length > 0 ? instruments : [],
    songPositions,
    songLength: songLen || 1,
    restartPosition: 0,
    numChannels,
    initialSpeed: tempo2 || 6,
    initialBPM: defTempo || 125,
    linearPeriods: false,
  };
}

function mapMEDEffect(cmd: number, param: number): { effTyp: number; eff: number } {
  switch (cmd) {
    case 0x0: return { effTyp: 0, eff: param };      // Arpeggio (or empty)
    case 0x1: return { effTyp: 0x01, eff: param };   // Portamento up
    case 0x2: return { effTyp: 0x02, eff: param };   // Portamento down
    case 0x3: return { effTyp: 0x03, eff: param };   // Tone portamento
    case 0x4: return { effTyp: 0x04, eff: param };   // Vibrato
    case 0x5: return { effTyp: 0x05, eff: param };   // Tone porta + volume slide
    case 0x6: return { effTyp: 0x06, eff: param };   // Vibrato + volume slide
    case 0x7: return { effTyp: 0x07, eff: param };   // Tremolo
    case 0x8: return { effTyp: 0x08, eff: param };   // Set panning
    case 0x9: return { effTyp: 0x09, eff: param };   // Sample offset
    case 0xA: return { effTyp: 0x0A, eff: param };   // Volume slide
    case 0xB: return { effTyp: 0x0B, eff: param };   // Position jump
    case 0xC: return { effTyp: 0x0C, eff: param };   // Set volume
    case 0xD: return { effTyp: 0x0D, eff: param };   // Pattern break
    case 0xE: {
      // Extended effects
      const sub = (param >> 4) & 0xF;
      const val = param & 0xF;
      return { effTyp: 0x0E, eff: (sub << 4) | val };
    }
    case 0xF: return { effTyp: 0x0F, eff: param };   // Set tempo
    default:  return { effTyp: 0, eff: 0 };
  }
}
