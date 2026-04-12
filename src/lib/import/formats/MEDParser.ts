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
import type { OctaMEDConfig, UADEChipRamInfo } from '@/types/instrument';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { encodeMED4Cell, encodeMED3Cell } from '@/engine/uade/encoders/MEDEncoder';
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

function s16(buf: Uint8Array, off: number): number {
  const v = (buf[off] << 8) | buf[off + 1];
  return v >= 32768 ? v - 65536 : v;
}


export function parseMEDFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  const magic = str4(buf, 0);

  if (!['MMD0', 'MMD1', 'MMD2', 'MMD3'].includes(magic)) {
    throw new Error(`Not a MED file: magic="${magic}"`);
  }

  const isMMD1Plus = magic !== 'MMD0';
  // OpenMPT uses transpose = NOTE_MIN(1) + 47 + playTranspose = 48 for MMD0/1/2,
  // and subtracts 24 for MMD3 (version > 2) → transpose = 24.
  // DEViLBOX note = OpenMPT note - 24 (period 428 = C-2 in DEViLBOX = C-4 in OpenMPT = note 49):
  //   MMD0/1/2: baseTranspose = 48 - 24 = 24
  //   MMD3:     baseTranspose = 24 - 24 = 0
  const noteBaseTranspose = magic === 'MMD3' ? 0 : 24;

  // ── Parse header offsets ─────────────────────────────────────────────────
  // MED file header (52 bytes):
  // 0x00: magic (4)  0x04: modLength (4)  0x08: songOffset (4)
  // 0x0C: playerSettings1 (4)  0x10: blockArrOffset (4)
  // 0x14: flags+reserved (4)  0x18: sampleArrOffset (4)
  // 0x1C: reserved2 (4)  0x20: expDataOffset (4)

  const songOffset      = u32(buf, 0x08);  // → MMD0Song
  const blockOffset     = u32(buf, 0x10);  // → pointer array of MMD0Block*
  const sampleArrOffset = u32(buf, 0x18);  // → array of sample pointers
  const expOffset       = u32(buf, 0x20);  // → MMD0Exp (extension)

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

  // sizeof(MMD0Sample) = 8
  // struct MMD0Sample { uint16 loopStart; uint16 loopLength; uint8 midiChannel; uint8 midiPreset; uint8 sampleVolume; int8 sampleTranspose; }
  const INSTR_HDR_SIZE = 8;
  const MAX_INSTRUMENTS = 63;

  let so = songOffset;
  // MMD0Sample structs: loopStart/loopLength come from here.
  // waveLen and synth flag come from MMDInstrHeader at the instrument pointer (loaded later).
  const instrs: Array<{ loopStart: number; loopLength: number; volume: number; finetune: number }> = [];

  for (let i = 0; i < MAX_INSTRUMENTS; i++) {
    const base = so + i * INSTR_HDR_SIZE;
    if (base + INSTR_HDR_SIZE > buf.length) break;
    // MMD0Sample fields (8 bytes):
    const loopStart  = u16(buf, base + 0) * 2;  // loop start in words → bytes
    const loopLength = u16(buf, base + 2) * 2;  // loop length in words → bytes
    // base+4: midiChannel (unused here)
    // base+5: midiPreset  (unused here)
    const volume = buf[base + 6];                // sampleVolume (0..64)
    // base+7: sampleTranspose (unused for MOD export)
    instrs.push({
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
  const defTempo  = u16(buf, so + 260);  // Default tempo (BPM or VBL counter)
  // MMD0Song layout after 256-byte playseq:
  //   so+260: deftempo (u16), so+262: playtransp (int8), so+263: flags (u8)
  //   so+264: flags2 (u8), so+265: tempo2 (u8 ticks-per-line = speed)
  const playTranspose = s8(buf, so + 262); // signed int8 global transpose
  const medFlags  = buf[so + 263];       // flags: bit6=8channel mode
  const medFlags2 = buf[so + 264];       // flags2: bit5=BPM mode, bit7=MIX, bits0-4=rowsPerBeat-1
  const tempo2    = buf[so + 265];        // ticks per line (speed)
  // so+266..so+281: trackVol[16]; so+282: masterVol; so+283: numSamples
  const numSamples = buf[so + 283];

  // Compute actual BPM using OpenMPT's MMDTempoToBPM() formula.
  const is8Ch         = (medFlags  & 0x40) !== 0;
  const bpmMode       = (medFlags2 & 0x20) !== 0;
  const softwareMix   = (medFlags2 & 0x80) !== 0;
  const rowsPerBeat   = 1 + (medFlags2 & 0x1F);

  let computedBPM: number;
  if (bpmMode && !is8Ch) {
    computedBPM = defTempo < 7 ? 111.5 : (defTempo * rowsPerBeat) / 4.0;
  } else if (is8Ch && defTempo > 0) {
    const MED_8CH_TEMPOS = [179, 164, 152, 141, 131, 123, 116, 110, 104, 99];
    computedBPM = MED_8CH_TEMPOS[Math.min(10, defTempo) - 1] ?? 125;
  } else if (!softwareMix && defTempo > 0 && defTempo <= 10) {
    computedBPM = (6.0 * 1773447 / 14500) / defTempo; // SoundTracker VBL formula
  } else if (softwareMix && defTempo < 8) {
    computedBPM = 157.86;
  } else {
    computedBPM = defTempo / 0.264;
  }
  const initialBPM = Math.max(32, Math.min(255, Math.round(computedBPM)));

  // ── Parse block (pattern) pointers ──────────────────────────────────────
  // blockOffset → array of 4-byte pointers to MMD0Block structures
  const blockPtrs: number[] = [];
  for (let i = 0; i < numBlocks; i++) {
    const ptr = u32(buf, blockOffset + i * 4);
    if (ptr > 0 && ptr < buf.length) blockPtrs.push(ptr);
  }

  // ── Determine number of channels from first block ────────────────────────
  // MMD0Block: uint8 numtracks, uint8 numlines, data[]
  // MMD1Block: uint16 numtracks, uint16 numlines, uint32 blockinfo_offset (extra), data[]
  // OpenMPT MEDScanNumChannels: version < 1 → ReadUint8(), else → ReadUint16BE()
  let numChannels = 4;
  if (blockPtrs.length > 0) {
    numChannels = isMMD1Plus ? u16(buf, blockPtrs[0]) : buf[blockPtrs[0]];
    numChannels = Math.max(1, Math.min(64, numChannels));
  }

  // volHex flag: bit 4 (0x10) of medFlags — volumes are hex (0-64) vs BCD
  const volHex = (medFlags & 0x10) !== 0;

  // Context for effect conversion (needed by mapMEDEffect for 0x0F tempo and 0x0C volume)
  const tempoCtx: MEDTempoCtx = { is8Ch, bpmMode, softwareMix, rowsPerBeat, volHex };

  // ── Parse patterns ───────────────────────────────────────────────────────
  const trackerPatterns: Pattern[] = [];
  // Track per-pattern data offsets for uadePatternLayout
  const blockDataOffsets: Array<{ dataStart: number; nTracks: number; nLines: number }> = [];

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

    // Record block data offset for uadePatternLayout
    blockDataOffsets.push({ dataStart, nTracks, nLines });

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
          // MMD1+ cell format (4 bytes): byte0=note, byte1=inst, byte2=effect, byte3=param
          // (From OpenMPT Load_med.cpp: const auto [noteVal, instr, command, param])
          // note = (noteVal & 0x7F) + transpose, transpose = NOTE_MIN+47+playTranspose = 48
          // DEViLBOX note = OpenMPT note - 36 → rawNote + 12 + playTranspose
          const rawNoteVal = buf[offset];
          inst    = buf[offset + 1];
          const rawEff1 = buf[offset + 2];
          const rawParm = buf[offset + 3];
          if (rawNoteVal === 0x80) {
            note = 97; // note cut
          } else {
            const rawNote = rawNoteVal & 0x7F;
            note = rawNote > 0 ? rawNote + noteBaseTranspose + playTranspose : 0;
          }
          // Apply effect mapping (same as MMD0 — MED effects need conversion)
          const mapped1 = mapMEDEffect(rawEff1, rawParm, tempoCtx);
          effTyp = mapped1.effTyp;
          eff    = mapped1.eff;
        } else {
          // MMD0 cell format (3 bytes), from OpenMPT Load_med.cpp:
          //   byte0[5:0] = note number (1-indexed, 0=no note)
          //   byte0[7:6] = instrument high 2 bits
          //   byte1[7:4] = instrument low 4 bits
          //   byte1[3:0] = command type
          //   byte2      = command param
          // note = (byte0 & 0x3F) + transpose, transpose = 48; DEViLBOX = OpenMPT - 36
          const raw0 = buf[offset];
          const raw1 = buf[offset + 1];
          const raw2 = buf[offset + 2];
          const rawNote = raw0 & 0x3F;
          inst = (raw1 >> 4) | ((raw0 & 0x80) >> 3) | ((raw0 & 0x40) >> 1);
          const rawEff = raw1 & 0x0F;
          note = rawNote > 0 ? rawNote + noteBaseTranspose + playTranspose : 0;
          const { effTyp: e, eff: ev } = mapMEDEffect(rawEff, raw2, tempoCtx);
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

  // Build instruments — use sampleArrOffset to read per-instrument pointers.
  // The header field at 0x18 (sampleArrOffset) points to an array of numSamples
  // u32 BE pointers, each pointing to the instrument's data block in the file.
  // For sample instruments, the data is: u32 length (bytes), u16 type, then PCM.
  // For synth instruments, the data is the SynthInstr struct directly.

  const instrPtrs: number[] = [];
  if (sampleArrOffset > 0 && sampleArrOffset + numSamples * 4 <= buf.length) {
    for (let i = 0; i < numSamples; i++) {
      instrPtrs.push(u32(buf, sampleArrOffset + i * 4));
    }
  }

  const instruments: InstrumentConfig[] = [];

  for (let i = 0; i < Math.min(MAX_INSTRUMENTS, numSamples || MAX_INSTRUMENTS); i++) {
    const instr = instrs[i];
    if (!instr) break;

    const name = instrNames[i] || `Instrument ${i + 1}`;

    // Get the absolute pointer to this instrument's data block
    const instrPtr = instrPtrs[i] || 0;

    // Read MMDInstrHeader (6 bytes) from instrPtr:
    //   instrPtr+0: uint32 length — byte length of sample data (for samples) or synth chunk
    //   instrPtr+4: int16  type   — negative = synth/hybrid, 0+ = sample
    let instrLength = 0;
    let instrType = 0;
    if (instrPtr > 0 && instrPtr + 6 <= buf.length) {
      instrLength = u32(buf, instrPtr);
      instrType   = s16(buf, instrPtr + 4);
    }
    const isSynth = instrType < 0;

    if (isSynth) {
      // Synth/hybrid instrument: MMDSynthInstr starts at instrPtr + 6.
      // All field offsets below are from instrPtr (matching OpenMPT's layout):
      //   instrPtr+0:  u32  length      — total chunk size in bytes (MMDInstrHeader.length)
      //   instrPtr+4:  s16  type        — -1=synth, -2=hybrid
      //   instrPtr+6:  u8   defaultdecay
      //   instrPtr+7:  u8   reserved[3]
      //   instrPtr+10: u16  loopStart   — loop start in words (hybrid only)
      //   instrPtr+12: u16  loopLength  — loop length in words (hybrid only)
      //   instrPtr+14: u16  voltblLen   — number of valid entries in voltbl
      //   instrPtr+16: u16  wftblLen    — number of valid entries in wftbl
      //   instrPtr+18: u8   volSpeed
      //   instrPtr+19: u8   wfSpeed
      //   instrPtr+20: u16  numWaveforms (1-64, or 0xFFFF)
      //   instrPtr+22: u8   voltbl[128]
      //   instrPtr+150: u8  wftbl[128]
      //   instrPtr+278: u32 wf[numWaveforms] — offsets from instrPtr to SynthWF
      //
      // Each SynthWF at instrPtr+wf[j]:
      //   +0: u16 length — waveform length in words
      //   +2: s8  wfdata — length*2 bytes of signed PCM

      const synthLen = instrLength;  // from MMDInstrHeader.length

      if (synthLen > 0 && instrPtr + 6 + synthLen <= buf.length) {
        const repWords    = u16(buf, instrPtr + 10);
        const repLenWords = u16(buf, instrPtr + 12);
        const voltblLen   = u16(buf, instrPtr + 14);
        const wftblLen    = u16(buf, instrPtr + 16);
        const volspeed    = buf[instrPtr + 18];
        const wfspeed     = buf[instrPtr + 19];
        const wforms      = u16(buf, instrPtr + 20);

        const loopStartBytes = repWords * 2;
        const loopLenBytes   = repLenWords * 2;

        // Sanity-check wforms; emit a silent placeholder for degenerate instruments
        if (wforms === 0xFFFF || wforms === 0 || wforms > 64) {
          const degenerateChipRam: UADEChipRamInfo = {
            moduleBase: 0,
            moduleSize: buf.length,
            instrBase: instrPtr + 6,
            instrSize: synthLen,
            sections: {
              voltbl: instrPtr + 22,
              wftbl: instrPtr + 150,
              waveforms: instrPtr + 278,
            },
          };
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
            uadeChipRam: degenerateChipRam,
          } as InstrumentConfig);
          continue;
        }

        // Vol table: 128 bytes at instrPtr+22 (clamp to voltblLen valid entries)
        const voltbl = new Uint8Array(128).fill(0xFF);
        const voltblCopy = Math.min(voltblLen, 128);
        for (let b = 0; b < voltblCopy; b++) voltbl[b] = buf[instrPtr + 22 + b];

        // Wf table: 128 bytes at instrPtr+150 (clamp to wftblLen valid entries)
        const wftbl = new Uint8Array(128).fill(0xFF);
        const wftblCopy = Math.min(wftblLen, 128);
        for (let b = 0; b < wftblCopy; b++) wftbl[b] = buf[instrPtr + 150 + b];

        // Waveform pointer table: wforms × u32 at instrPtr+278.
        // Each value is an offset from instrPtr to the SynthWF data.
        // SynthWF: u16 length (words) + PCM data.
        const waveforms: Int8Array[] = [];
        for (let w = 0; w < wforms; w++) {
          const ptrOff = instrPtr + 278 + w * 4;
          if (ptrOff + 4 > buf.length) break;
          const wfOffset = u32(buf, ptrOff);  // offset from instrPtr
          const wfAbs    = instrPtr + wfOffset;
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

        const octamedChipRam: UADEChipRamInfo = {
          moduleBase: 0,
          moduleSize: buf.length,
          instrBase: instrPtr + 6,
          instrSize: synthLen,
          sections: {
            voltbl: instrPtr + 22,
            wftbl: instrPtr + 150,
            waveforms: instrPtr + 278,
          },
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
          uadeChipRam: octamedChipRam,
        } as InstrumentConfig);

      } else {
        // Malformed SynthInstr — emit a silent OctaMEDSynth placeholder.
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

    // Sample instrument: PCM starts at instrPtr + 6 (after 6-byte MMDInstrHeader)
    // instrLength (from MMDInstrHeader.length) is the byte count of the PCM data.
    const pcmBase = instrPtr > 0 ? instrPtr + 6 : 0;
    const len = pcmBase > 0
      ? Math.min(instrLength, buf.length - pcmBase)
      : 0;
    const pcm = len > 0 ? buf.slice(pcmBase, pcmBase + len) : new Uint8Array(0);

    instruments.push(createSamplerInstrument(
      i + 1, name, pcm, instr.volume, 8287,
      instr.loopStart, instr.loopStart + instr.loopLength
    ));
  }

  // ── Build output ─────────────────────────────────────────────────────────
  let songPositions: number[];

  if (magic === 'MMD2' || magic === 'MMD3') {
    // MMD2/3 song positions come from the MMD2Song structure (at so+4) + PlaySeq tables.
    // The 256-byte song[] field of MMDSong is MMD2Song for version >= 2:
    //   so+4:  playSeqTableOffset (u32) — points to array of u32 pointers, one per PlaySeq
    //   so+8:  sectionTableOffset (u32) — points to array of songLen u16 section indices
    //   so+12: trackVolsOffset (u32)
    //   so+16: numTracks (u16)
    //   so+18: numPlaySeqs (u16)
    const playSeqTableOffset = u32(buf, so + 4);
    const sectionTableOffset = u32(buf, so + 8);

    const positions: number[] = [];
    if (sectionTableOffset > 0 && sectionTableOffset < buf.length &&
        playSeqTableOffset > 0 && playSeqTableOffset < buf.length) {
      // Read songLen section indices (u16 each) from sectionTableOffset
      for (let si = 0; si < songLen; si++) {
        const sectionIdx = u16(buf, sectionTableOffset + si * 2);
        // Get pointer to MMD2PlaySeq from playSeqTableOffset + sectionIdx * 4
        const ptrOff = playSeqTableOffset + sectionIdx * 4;
        if (ptrOff + 4 > buf.length) continue;
        const playSeqPtr = u32(buf, ptrOff);
        if (playSeqPtr === 0 || playSeqPtr >= buf.length) continue;
        // MMD2PlaySeq: name[32], commandTableOffset(u32), reserved(u32), length(u16) = 42 bytes
        if (playSeqPtr + 42 > buf.length) continue;
        const seqLen = u16(buf, playSeqPtr + 40);
        // Followed by seqLen u16 pattern indices
        for (let pi = 0; pi < seqLen; pi++) {
          const patOff = playSeqPtr + 42 + pi * 2;
          if (patOff + 2 > buf.length) break;
          const patIdx = u16(buf, patOff);
          if (patIdx < 0x8000 && patIdx < trackerPatterns.length) {
            positions.push(patIdx);
          }
        }
      }
    }
    songPositions = positions.length > 0 ? positions : playseq.slice(0, Math.max(1, songLen));
  } else {
    // MMD0/1: sequence is the raw u8 array in playseq[]
    songPositions = playseq.slice(0, Math.max(1, songLen));
  }

  const medBytesPerCell = isMMD1Plus ? 4 : 3;
  const uadePatternLayout: UADEPatternLayout = {
    formatId: isMMD1Plus ? 'med_mmd1' : 'med_mmd0',
    patternDataFileOffset: 0, // overridden by getCellFileOffset
    bytesPerCell: medBytesPerCell,
    rowsPerPattern: 64,
    numChannels,
    numPatterns: trackerPatterns.length,
    moduleSize: buffer.byteLength,
    encodeCell: isMMD1Plus ? encodeMED4Cell : encodeMED3Cell,
    decodeCell: isMMD1Plus
      ? (raw: Uint8Array): TrackerCell => {
          // MMD1+ (4 bytes): note, inst, effect, param
          const rawNoteVal = raw[0];
          const inst = raw[1];
          const rawEff = raw[2];
          const rawParam = raw[3];
          let note = 0;
          if (rawNoteVal === 0x80) {
            note = 97; // note cut
          } else {
            const rawNote = rawNoteVal & 0x7F;
            note = rawNote > 0 ? rawNote + noteBaseTranspose + playTranspose : 0;
          }
          const mapped = mapMEDEffect(rawEff, rawParam, tempoCtx);
          return { note, instrument: inst, volume: 0, effTyp: mapped.effTyp, eff: mapped.eff, effTyp2: 0, eff2: 0 };
        }
      : (raw: Uint8Array): TrackerCell => {
          // MMD0 (3 bytes): packed period/instrument/effect
          const raw0 = raw[0];
          const raw1 = raw[1];
          const raw2 = raw[2];
          const rawNote = raw0 & 0x3F;
          const inst = (raw1 >> 4) | ((raw0 & 0x80) >> 3) | ((raw0 & 0x40) >> 1);
          const rawEff = raw1 & 0x0F;
          const note = rawNote > 0 ? rawNote + noteBaseTranspose + playTranspose : 0;
          const mapped = mapMEDEffect(rawEff, raw2, tempoCtx);
          return { note, instrument: inst, volume: 0, effTyp: mapped.effTyp, eff: mapped.eff, effTyp2: 0, eff2: 0 };
        },
    getCellFileOffset: (pattern: number, row: number, channel: number): number => {
      const info = blockDataOffsets[pattern];
      if (!info) return 0;
      return info.dataStart + (row * info.nTracks + channel) * medBytesPerCell;
    },
  };

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
    initialBPM: initialBPM,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadePatternLayout,
  };
}

interface MEDTempoCtx {
  is8Ch: boolean;
  bpmMode: boolean;
  softwareMix: boolean;
  rowsPerBeat: number;
  volHex: boolean;
}

function medTempoToBPM(tempo: number, ctx: MEDTempoCtx): number {
  // Mirrors OpenMPT MMDTempoToBPM() exactly.
  if (ctx.bpmMode && !ctx.is8Ch) {
    if (tempo < 7) return 112;
    return Math.round((tempo * ctx.rowsPerBeat) / 4.0);
  }
  if (ctx.is8Ch && tempo > 0) {
    const tempos = [179, 164, 152, 141, 131, 123, 116, 110, 104, 99];
    return tempos[Math.min(10, tempo) - 1] ?? 125;
  }
  if (!ctx.softwareMix && tempo > 0 && tempo <= 10) {
    return Math.round((6.0 * 1773447.0 / 14500.0) / tempo);
  }
  if (ctx.softwareMix && tempo < 8) {
    return 158;
  }
  return Math.round(tempo / 0.264);
}

function mapMEDEffect(cmd: number, param: number, ctx: MEDTempoCtx): { effTyp: number; eff: number } {
  switch (cmd) {
    case 0x0: return { effTyp: 0, eff: param };      // Arpeggio (or empty)
    case 0x1: return { effTyp: 0x01, eff: param };   // Portamento up
    case 0x2: return { effTyp: 0x02, eff: param };   // Portamento down
    case 0x3: return { effTyp: 0x03, eff: param };   // Tone portamento
    case 0x4: {
      // Vibrato — MED vibrato depth is TWICE as deep as ProTracker (OpenMPT doubles it)
      const vibratoDepth = Math.min((param & 0x0F) * 2, 0x0F);
      return { effTyp: 0x04, eff: (param & 0xF0) | vibratoDepth };
    }
    case 0x5: return { effTyp: 0x05, eff: param };   // Tone porta + volume slide
    case 0x6: return { effTyp: 0x06, eff: param };   // Vibrato + volume slide
    case 0x7: return { effTyp: 0x07, eff: param };   // Tremolo
    case 0x8: return { effTyp: 0x08, eff: param };   // Set panning
    case 0x9:                                         // Set secondary speed (MED) — NOT sample offset
      if (param > 0 && param <= 0x20) return { effTyp: 0x0F, eff: param };
      return { effTyp: 0, eff: 0 };
    case 0xA: return { effTyp: 0x0A, eff: param };   // Volume slide
    case 0xB: return { effTyp: 0x0B, eff: param };   // Position jump
    case 0xC: {
      // Set Volume — mirrors OpenMPT ConvertMEDEffect case 0x0C
      // !volHex: BCD encoding (e.g. 0x40 = decimal 40), valid if param < 0x99
      // volHex: hex 0-127, clamp to 0-64 via min(param & 0x7F, 64)
      let vol: number;
      if (!ctx.volHex && param < 0x99) {
        vol = (param >> 4) * 10 + (param & 0x0F);
      } else {
        vol = Math.min(param & 0x7F, 64);
      }
      return { effTyp: 0x0C, eff: vol };
    }
    case 0xD: return { effTyp: 0x0A, eff: param };   // Volume slide (MED 0x0D = ProTracker 0x0A)
    case 0xE: {
      // Extended effects
      const sub = (param >> 4) & 0xF;
      const val = param & 0xF;
      return { effTyp: 0x0E, eff: (sub << 4) | val };
    }
    case 0xF: {
      // MED 0x0F (Misc/Tempo) — mirrors OpenMPT ConvertMEDEffect case 0x0F
      if (param === 0) return { effTyp: 0x0D, eff: 0 };  // pattern break
      if (param <= 0xF0) {
        // Tempo: convert from OctaMED VBL/BPM counter to actual BPM
        if (param < 3) return { effTyp: 0x0F, eff: 0x70 };  // bug-compat: ~112 BPM
        const bpm = Math.max(32, Math.min(255, medTempoToBPM(param, ctx)));
        return { effTyp: 0x0F, eff: bpm };
      }
      // Special params > 0xF0 (not tempo commands):
      switch (param) {
        case 0xF1: return { effTyp: 0x0E, eff: 0x93 }; // play note twice
        case 0xF2: return { effTyp: 0x0E, eff: 0xD3 }; // delay note
        case 0xF3: return { effTyp: 0x0E, eff: 0x92 }; // play note three times
        case 0xF8: return { effTyp: 0x0E, eff: 0x01 }; // filter off (E01)
        case 0xF9: return { effTyp: 0x0E, eff: 0x00 }; // filter on (E00)
        default:   return { effTyp: 0, eff: 0 };       // ignore (MIDI pedal, end-of-song, etc.)
      }
    }
    // MED extended commands (0x10+) — mirrors OpenMPT ConvertMEDEffect
    case 0x19: return { effTyp: 0x09, eff: param };  // Sample offset (MED uses 0x19, not 0x09)
    case 0x1D: return { effTyp: 0x0D, eff: param };  // Pattern break (hex param)
    case 0x1E: return { effTyp: 0x0E, eff: 0xE0 | Math.min(param, 0x0F) }; // Repeat row (EEx)
    case 0x16: return { effTyp: 0x0E, eff: 0x60 | (param & 0x0F) }; // Loop (E6x)
    case 0x18: return { effTyp: 0x0E, eff: 0xC0 | (param & 0x0F) }; // Stop note (ECx)
    case 0x1A: return { effTyp: 0x0E, eff: 0xA0 | (param & 0x0F) }; // Slide vol up once (EAx)
    case 0x1B: return { effTyp: 0x0E, eff: 0xB0 | (param & 0x0F) }; // Slide vol down once (EBx)
    case 0x1F: {                                                      // Note delay/retrigger
      if (param & 0xF0) return { effTyp: 0x0E, eff: 0xD0 | (param >> 4) };
      if (param & 0x0F) return { effTyp: 0x0E, eff: 0x90 | (param & 0x0F) };
      return { effTyp: 0, eff: 0 };
    }
    default:  return { effTyp: 0, eff: 0 };
  }
}
