/**
 * SoundFXParser.ts -- SoundFX (.sfx, .sfx13) Amiga format parser
 *
 * SoundFX is a 4-channel Amiga tracker format by Linel Software.
 * Two versions:
 *   v1.0: magic "SONG" at offset 60, 16 sample slots
 *   v2.0: magic "SO31" at offset 124, 32 sample slots
 *
 * Pattern data: 64 rows per pattern, 4 bytes per row per channel:
 *   2-byte note (signed short, Amiga period), 1-byte effect+sample, 1-byte param
 *
 * Effects: arpeggio (1), pitch bend (2), filter on/off (3/4), volume +/- (5/6),
 *          step up/down (7/8), auto slide (9)
 *
 * Reference: FlodJS FXPlayer by Christian Corti (Neoart)
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import type { UADEChipRamInfo } from '@/types/instrument';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { decodeSoundFXCell, encodeSoundFXCell } from '@/engine/uade/encoders/soundfxCellCodec';
import { createSamplerInstrument } from './AmigaUtils';

// -- SoundFX period table (from FlodJS FXPlayer.PERIODS) ---------------------
// 67 entries: 3 octaves of Amiga periods plus padding, ending with -1 sentinel.
// Note conversion uses periodToNoteIndex() from AmigaUtils which matches against
// the standard ProTracker period table (same values minus the extended range).

// -- Binary reading helpers ---------------------------------------------------

function readUint32BE(buf: DataView, off: number): number {
  return buf.getUint32(off, false);
}

function readUint16BE(buf: DataView, off: number): number {
  return buf.getUint16(off, false);
}

function readUint8(buf: DataView, off: number): number {
  return buf.getUint8(off);
}

function readString(buf: DataView, off: number, len: number): string {
  let result = '';
  for (let i = 0; i < len; i++) {
    const ch = buf.getUint8(off + i);
    if (ch === 0) break;
    result += String.fromCharCode(ch);
  }
  return result;
}

// -- SoundFX sample metadata --------------------------------------------------

interface SFXSample {
  name: string;
  length: number;      // in bytes (after <<1)
  volume: number;      // 0-64
  loop: number;        // loop start offset in bytes
  repeat: number;      // loop length in bytes (after <<1)
  pointer: number;     // offset into sample data block
}

// -- SoundFX pattern row (raw parsed) -----------------------------------------

// -- Format detection ---------------------------------------------------------

/**
 * Detect if a buffer contains a SoundFX format file.
 * Checks for "SONG" at offset 60 (v1.0) or "SO31" at offset 124 (v2.0).
 */
export function isSoundFXFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 1686) return false;
  const view = new DataView(buffer);

  // Check v1.0: "SONG" at offset 60
  const magic1 = readString(view, 60, 4);
  if (magic1 === 'SONG') return true;

  // Check v2.0: "SO31" at offset 124
  if (buffer.byteLength >= 2350) {
    const magic2 = readString(view, 124, 4);
    if (magic2 === 'SO31') return true;
  }

  return false;
}

// -- Main parser --------------------------------------------------------------

/**
 * Parse a SoundFX (.sfx, .sfx13) file into a TrackerSong.
 * Produces a fully editable MOD-format song with real sampler instruments.
 */
export async function parseSoundFXFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  if (buffer.byteLength < 1686) {
    throw new Error('SoundFX: file too small');
  }

  // -- Detect version ---------------------------------------------------------

  // Authoritative layout from Schism Tracker fmt/sfx.c (loader taken from XMP):
  //   v1 "SONG"@60: 15 samples; size table = 15 u32 BE @0 (samples 1-15); tag@60;
  //                 tempo u16@64; 14 reserved bytes; metadata 15*30 @80; songinfo@530;
  //                 order table 128 bytes @532; pattern data @660.
  //   v2 "SO31"@124: 31 samples; size table = 31 u32 BE @0; tag@124; tempo@128;
  //                  metadata @144; songinfo@1074; pattern data @1208 (+4 "dunno").
  let version: 'v1' | 'v2';
  let numSamples: number;        // real sample count (15 for v1, 31 for v2)
  let magicOffset: number;       // file offset of the format tag
  let sampleTableOffset: number; // extra offset for v2.0 songinfo / pattern data

  const magic1 = readString(view, 60, 4);
  if (magic1 === 'SONG') {
    version = 'v1';
    numSamples = 15;
    magicOffset = 60;
    sampleTableOffset = 0;
  } else {
    if (buffer.byteLength < 2350) {
      throw new Error('SoundFX: file too small for v2.0');
    }
    const magic2 = readString(view, 124, 4);
    if (magic2 !== 'SO31') {
      throw new Error(`SoundFX: unrecognized magic bytes`);
    }
    version = 'v2';
    numSamples = 31;
    magicOffset = 124;
    sampleTableOffset = 544; // v2.0 header is 544 bytes larger
  }
  // Slot count including the implicit dummy sample 0 (samples are stored 1-indexed).
  const numSampleSlots = numSamples + 1;

  // -- Sample metadata block base (= tag(4) + tempo(2) + 14 reserved after size table) --
  // v1: 60 + 20 = 80; v2: 124 + 20 = 144. Also the uadeChipRam.instrBase base.
  const metadataBase = magicOffset + 20;
  const sampleTableBase = metadataBase;

  // -- Read tempo (2 bytes after the format tag) ------------------------------
  const tempoOffset = magicOffset + 4;
  const tempo = readUint16BE(view, tempoOffset);

  // -- Read sample size table (numSamples u32 BE at offset 0) ------------------
  // smpsize[n] (0-based) is sample (n+1)'s length in BYTES (Schism: sample->length =
  // bswapBE32(smpsize[n])). Stored here 1-indexed; index 0 is the dummy sample.
  const sampleSizes: number[] = [0];
  for (let s = 1; s <= numSamples; s++) {
    sampleSizes.push(readUint32BE(view, (s - 1) * 4));
  }

  // Reconstruct sample pointers from sizes (cumulative offset into the PCM block).
  const samplePointers: number[] = [0];
  let ptrAccum = 0;
  for (let s = 1; s <= numSamples; s++) {
    samplePointers.push(ptrAccum);
    if (sampleSizes[s] > 0) ptrAccum += sampleSizes[s];
  }

  // -- Read sample metadata (30 bytes each: name[22] + oneshotWord(2) + finetune(1)
  //    + volume(1) + loopStart(2) + loopLengthWord(2)). Length comes from the size table. --
  const samples: (SFXSample | null)[] = [null]; // index 0 = dummy
  for (let s = 1; s <= numSamples; s++) {
    const mpos = metadataBase + (s - 1) * 30;
    const name = readString(view, mpos, 22);
    /* oneshot word */ readUint16BE(view, mpos + 22);  // read for correctness; length from size table
    /* finetune */ readUint8(view, mpos + 24);
    const volume = readUint8(view, mpos + 25);
    const loop = readUint16BE(view, mpos + 26);
    const repeat = readUint16BE(view, mpos + 28) << 1;

    if (sampleSizes[s] === 0) {
      samples.push(null);
      continue;
    }

    samples.push({
      name,
      length: sampleSizes[s],
      volume: Math.min(volume, 64),
      loop,
      repeat,
      pointer: samplePointers[s],
    });
  }

  // -- Read song length and positions -----------------------------------------
  // Position in file: 530 + sampleTableOffset
  const songInfoOffset = 530 + sampleTableOffset;
  const songLength = readUint8(view, songInfoOffset);
  // Skip 1 byte (FlodJS: stream.position++)
  let trackPos = songInfoOffset + 2;

  const songPositions: number[] = [];
  let highestPosition = 0;

  for (let i = 0; i < songLength; i++) {
    // Track entries are stored as (pattern_number << 8) in FlodJS
    // The byte at each position is the pattern number (multiplied by 256 for internal use)
    const value = readUint8(view, trackPos);
    songPositions.push(value);
    if (value > highestPosition) highestPosition = value;
    trackPos++;
  }

  // -- Read pattern data ------------------------------------------------------
  // Pattern data starts at offset 660 + adjusted offset
  let patternDataOffset = 660 + sampleTableOffset;
  if (version === 'v2') patternDataOffset += 4; // FlodJS: if (offset) offset += 4

  // Total pattern rows: (highestPosition + 1) * 256 rows
  // Each position entry selects a block of 256 rows (64 rows * 4 channels)
  // FlodJS: higher += 256; patterns.length = higher;
  const totalPatternEntries = (highestPosition + 1) * 256;

  // Pattern region is read straight from the file by the shared cell codec
  // (soundfxCellCodec.ts); entry = patNum * 256 + row * 4 + channel.
  const patternBytes = new Uint8Array(buffer);
  const readPos = patternDataOffset + totalPatternEntries * 4;

  // -- Extract sample PCM data ------------------------------------------------
  // Sample data follows pattern data in the file
  const sampleDataStart = readPos;

  // -- Build instruments from samples -----------------------------------------
  const instruments: InstrumentConfig[] = [];

  for (let i = 1; i < numSampleSlots; i++) {
    const sample = samples[i];
    if (!sample || sample.length === 0) {
      /* Empty slot — expose as a WASM-synth placeholder so the SoundFx
       * instrument editor can reach it. The chip-RAM header still exists
       * in the module file at sampleTableBase + (i-1)*30. */
      const emptyChipRam: UADEChipRamInfo = {
        moduleBase: 0,
        moduleSize: buffer.byteLength,
        instrBase: sampleTableBase + (i - 1) * 30,
        instrSize: 30,
        sections: { sampleTable: sampleTableBase },
      };
      instruments.push({
        id: i,
        name: sample?.name || '',
        type: 'synth' as const,
        synthType: 'SoundFxWasmSynth' as const,
        effects: [],
        volume: 0,
        pan: 0,
        uadeChipRam: emptyChipRam,
      } as unknown as InstrumentConfig);
      continue;
    }

    const pcmStart = sampleDataStart + sample.pointer;
    const pcmEnd = pcmStart + sample.length;

    if (pcmEnd > buffer.byteLength) continue;

    const pcm = bytes.slice(pcmStart, pcmEnd);

    // Determine loop points
    let loopStart = 0;
    let loopEnd = 0;

    if (sample.loop > 0 && sample.repeat > 2) {
      // Sample has a loop
      loopStart = sample.loop;
      loopEnd = sample.loop + sample.repeat;
    } else if (sample.repeat > 2) {
      // repeat > 2 but loop == 0: loop from start
      loopEnd = sample.repeat;
    }

    // Slot i (1-based) metadata sits at sampleTableBase + (i-1)*30 in the file.
    // moduleBase=0 because UADE loads the SoundFX file at Amiga address 0x000000.
    const chipRam: UADEChipRamInfo = {
      moduleBase: 0,
      moduleSize: buffer.byteLength,
      instrBase: sampleTableBase + (i - 1) * 30,
      instrSize: 30,
      sections: {
        sampleTable: sampleTableBase,
      },
    };

    const instr = createSamplerInstrument(
      i,
      sample.name || '',
      pcm,
      sample.volume,
      8287, // Standard Amiga C-3 sample rate
      loopStart,
      loopEnd,
    );
    instr.uadeChipRam = chipRam;
    instruments.push(instr);
  }

  // -- Build patterns ---------------------------------------------------------
  // Each song position points to a block of 256 entries (64 rows * 4 channels)
  // We deduplicate: unique pattern indices map to TrackerSong patterns

  const uniquePatternIndices = [...new Set(songPositions)].sort((a, b) => a - b);
  const patternIndexMap = new Map<number, number>();
  const patterns: Pattern[] = [];

  for (let pidx = 0; pidx < uniquePatternIndices.length; pidx++) {
    const srcIdx = uniquePatternIndices[pidx];
    patternIndexMap.set(srcIdx, pidx);

    const baseRow = srcIdx * 256; // FlodJS: track[trackPos] is (patNum << 8)
    const channels: ChannelData[] = [];

    for (let ch = 0; ch < 4; ch++) {
      const rows: TrackerCell[] = [];

      for (let row = 0; row < 64; row++) {
        // FlodJS layout: patterns[value + voice.index] where value = trackPos + patternPos
        // patternPos increments by 4 each row, voice.index is 0-3
        // So: entry = baseRow + (row * 4) + ch
        const entryIdx = baseRow + (row * 4) + ch;
        const off = patternDataOffset + entryIdx * 4;
        rows.push(off + 4 <= patternBytes.length
          ? decodeSoundFXCell(patternBytes.subarray(off, off + 4), version)
          : { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
      }

      // Amiga LRRL panning
      const pan = (ch === 0 || ch === 3) ? -50 : 50;

      channels.push({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan,
        instrumentId: null,
        color: null,
        rows,
      });
    }

    patterns.push({
      id: `pattern-${pidx}`,
      name: `Pattern ${pidx}`,
      length: 64,
      channels,
      importMetadata: {
        sourceFormat: 'MOD',
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: 4,
        originalPatternCount: uniquePatternIndices.length,
        originalInstrumentCount: instruments.length,
      },
    });
  }

  // -- Build song position order (map original indices to pattern array indices) --
  const mappedPositions = songPositions.map(idx => patternIndexMap.get(idx) ?? 0);

  // -- Fallback: ensure at least one pattern --
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
        pan: (ch === 0 || ch === 3) ? -50 : 50,
        instrumentId: null,
        color: null,
        rows: Array.from({ length: 64 }, (): TrackerCell => ({
          note: 0, instrument: 0, volume: 0,
          effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
        })),
      })),
      importMetadata: {
        sourceFormat: 'MOD',
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: 4,
        originalPatternCount: 0,
        originalInstrumentCount: 0,
      },
    });
    mappedPositions.push(0);
  }

  // -- Calculate BPM from tempo -----------------------------------------------
  // OpenMPT Load_sfx.cpp: BPM = (14565.0 * 122.0) / fileHeader.speed
  // where speed is the raw timer value (same as our `tempo` variable).
  const initialBPM = tempo > 0 ? Math.round((14565.0 * 122.0) / tempo) : 125;

  const moduleName = filename.replace(/\.[^/.]+$/, '');

  const uadePatternLayout: UADEPatternLayout = {
    formatId: 'soundfx',
    patternDataFileOffset: patternDataOffset,
    bytesPerCell: 4,
    rowsPerPattern: 64,
    numChannels: 4,
    numPatterns: highestPosition + 1,
    moduleSize: buffer.byteLength,
    encodeCell: (cell: TrackerCell) => encodeSoundFXCell(cell, version),
    decodeCell: (bytes: Uint8Array): TrackerCell => decodeSoundFXCell(bytes, version),
  };

  return {
    name: moduleName,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions: mappedPositions,
    songLength: mappedPositions.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: Math.max(32, Math.min(255, initialBPM || 125)),
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadePatternLayout,
    soundFxFileData: buffer.slice(0) as ArrayBuffer,
  };
}
