/**
 * NativeFormatMetadata.ts — Fast header-only metadata extraction for native tracker formats.
 *
 * Does NOT run a full simulation — only reads file headers to display
 * counts in the Import dialog. All fields are -1 when unknown/unsupported.
 */

export interface NativeFormatMeta {
  channels: number;    // -1 = unknown
  patterns: number;    // -1 = unknown
  orders: number;      // -1 = unknown
  instruments: number; // -1 = unknown
  samples: number;     // -1 = unknown
}

const UNKNOWN: NativeFormatMeta = {
  channels: -1, patterns: -1, orders: -1, instruments: -1, samples: -1,
};

// ── Byte helpers ──────────────────────────────────────────────────────────────

function u16BE(b: Uint8Array, o: number): number {
  return (b[o] << 8) | b[o + 1];
}

function u32BE(b: Uint8Array, o: number): number {
  return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
}

function str(b: Uint8Array, o: number, n: number): string {
  let s = '';
  for (let i = 0; i < n && o + i < b.length; i++) s += String.fromCharCode(b[o + i]);
  return s;
}

// ── Format extractors ─────────────────────────────────────────────────────────

/** Future Composer: FC13 / FC14 / SMOD */
function fcMeta(buf: Uint8Array): NativeFormatMeta {
  if (buf.length < 100) return UNKNOWN;
  const magic = str(buf, 0, 4);
  if (magic !== 'FC13' && magic !== 'FC14' && magic !== 'SMOD') return UNKNOWN;
  const seqLen      = u32BE(buf, 4);
  const patLen      = u32BE(buf, 12);
  const volMacroLen = u32BE(buf, 28);
  const orders      = Math.floor(seqLen / 13);
  const patterns    = Math.floor(patLen / 64);
  const instruments = Math.floor(volMacroLen / 64);
  let samples = 0;
  for (let i = 0; i < 10; i++) {
    if (u16BE(buf, 40 + i * 6) > 0) samples++;
  }
  return { channels: 4, patterns, orders, instruments, samples };
}

/** HivelyTracker (HVL) / AHX */
function hvlMeta(buf: Uint8Array): NativeFormatMeta {
  if (buf.length < 14) return UNKNOWN;
  const magic      = str(buf, 0, 3);
  const orders     = ((buf[6] & 0x0f) << 8) | buf[7];
  const patterns   = buf[11];
  const instruments = buf[12];
  if (magic === 'THX') {  // AHX: always 4 channels, no PCM samples
    return { channels: 4, patterns, orders, instruments, samples: -1 };
  }
  if (magic === 'HVL') {  // HVL: channels encoded in byte 8
    const channels = (buf[8] >> 2) + 4;
    return { channels, patterns, orders, instruments, samples: -1 };
  }
  return UNKNOWN;
}

/** Oktalyzer: IFF FORM/OKTA container */
function oktMeta(buf: Uint8Array): NativeFormatMeta {
  if (buf.length < 16) return UNKNOWN;
  if (str(buf, 0, 4) !== 'FORM' || str(buf, 8, 4) !== 'OKTA') return UNKNOWN;
  let offset = 12;
  let orders = -1, patterns = -1, samples = -1;
  while (offset + 8 <= buf.length) {
    const id     = str(buf, offset, 4);
    const size   = u32BE(buf, offset + 4);
    const data   = offset + 8;
    offset      += 8 + size + (size & 1);  // IFF chunks are word-aligned
    if      (id === 'SLEN') orders   = u16BE(buf, data);
    else if (id === 'PLEN') patterns = u16BE(buf, data);
    else if (id === 'SAMP') samples  = Math.floor(size / 32);
    if (orders !== -1 && patterns !== -1 && samples !== -1) break;
  }
  // In Oktalyzer, instruments = samples (one sample slot per instrument)
  return { channels: 8, patterns, orders, instruments: samples, samples };
}

/** OctaMED / MED: MMD0–MMD3 */
function medMeta(buf: Uint8Array): NativeFormatMeta {
  if (buf.length < 16) return UNKNOWN;
  const magic = str(buf, 0, 4);
  if (magic !== 'MMD0' && magic !== 'MMD1' && magic !== 'MMD2' && magic !== 'MMD3') return UNKNOWN;
  const songOffset = u32BE(buf, 0x08);
  // MMD0Song layout: 63 × 8-byte InstrHdr (=504 bytes), then numblocks(2), songlen(2), playseq[256], ...
  const so = songOffset + 63 * 8;  // songOffset + 504
  if (so + 268 > buf.length) return UNKNOWN;
  const patterns   = u16BE(buf, so);      // numblocks
  const orders     = u16BE(buf, so + 2);  // songlen
  const numSamples = buf[so + 267];       // numsamples (at so+4+256+4+1+1+1 = so+267)
  // MMD1+ channels: read numtracks from first block header
  let channels = magic === 'MMD0' ? 4 : -1;
  if (magic !== 'MMD0') {
    const blockOffset = u32BE(buf, 0x10);  // pointer array of MMD0Block*
    if (blockOffset > 0 && blockOffset + 4 <= buf.length) {
      const firstBlockPtr = u32BE(buf, blockOffset);
      if (firstBlockPtr > 0 && firstBlockPtr + 2 <= buf.length) {
        channels = Math.max(1, Math.min(64, u16BE(buf, firstBlockPtr)));
      }
    }
  }
  return { channels, patterns, orders, instruments: numSamples, samples: numSamples };
}

/** DigiBooster Pro: DBM0 / DBMX — IFF-style chunks */
function digiMeta(buf: Uint8Array): NativeFormatMeta {
  if (buf.length < 8) return UNKNOWN;
  const magic = str(buf, 0, 4);
  if (magic !== 'DBM0' && magic !== 'DBMX') return UNKNOWN;
  let offset = magic === 'DBM0' ? 12 : 4;  // DBM0 has 8-byte version header after magic
  let channels = -1, patterns = -1, orders = -1, instruments = -1, samples = -1;
  while (offset + 8 < buf.length) {
    const id   = str(buf, offset, 4);
    const size = u32BE(buf, offset + 4);
    const data = offset + 8;
    offset    += 8 + size;
    if (id === 'INFO') {
      if (magic === 'DBM0') {
        // INFO: instruments(2) + samples(2) + songs(2) + patterns(2) + channels(2)
        instruments = u16BE(buf, data);
        samples     = u16BE(buf, data + 2);
        patterns    = u16BE(buf, data + 6);
        channels    = u16BE(buf, data + 8);
      } else {
        // DBMX INFO: channels(2) + patterns(2) + instruments(2) + samples(2)
        channels    = u16BE(buf, data);
        patterns    = u16BE(buf, data + 2);
        instruments = u16BE(buf, data + 4);
        samples     = u16BE(buf, data + 6);
      }
    } else if (id === 'SONG' && orders === -1) {
      // SONG chunk: each entry is name[44] + length(2) + positions[128×2]
      // First song's length field gives the order count
      if (data + 46 <= buf.length) {
        orders = u16BE(buf, data + 44);
      }
    }
    if (channels !== -1 && patterns !== -1 && orders !== -1 && instruments !== -1 && samples !== -1) break;
  }
  return { channels, patterns, orders, instruments, samples };
}

/** SoundMon V1 / V2 / V3 by Brian Postma */
function soundMonMeta(buf: Uint8Array): NativeFormatMeta {
  if (buf.length < 32) return UNKNOWN;
  const id  = str(buf, 26, 4);
  const id3 = id.substring(0, 3);
  if (id !== 'BPSM' && id3 !== 'V.2' && id3 !== 'V.3') return UNKNOWN;
  const orders = u16BE(buf, 30);
  // All 15 instrument slots are exactly 32 bytes (synth or PCM, all versions)
  // Layout: instrStart=32, 15×32 bytes → track data at offset 512
  const instrStart = 32;
  const trackStart = instrStart + 15 * 32;  // 512
  if (buf.length < trackStart) return { channels: 4, patterns: -1, orders, instruments: 15, samples: -1 };
  // Count PCM samples: first byte !== 0xFF and u16BE at base+24 > 0 (word-length field)
  let samples = 0;
  for (let i = 0; i < 15; i++) {
    const base = instrStart + i * 32;
    if (buf[base] !== 0xff && u16BE(buf, base + 24) > 0) samples++;
  }
  // Track entries: orders × 4 channels × 4 bytes (u16 patternIdx + s8 + s8)
  const entryCount = orders * 4;
  const trackEnd   = trackStart + entryCount * 4;
  let highest = 0;
  for (let i = 0; i < entryCount && (trackStart + i * 4 + 1) < buf.length && (trackStart + i * 4) < trackEnd; i++) {
    const p = u16BE(buf, trackStart + i * 4);
    if (p > highest) highest = p;
  }
  const patterns = highest > 0 ? highest : -1;
  return { channels: 4, patterns, orders, instruments: 15, samples };
}

/** SidMon II — The MIDI Version */
function sidMon2Meta(buf: Uint8Array): NativeFormatMeta {
  if (buf.length < 90) return UNKNOWN;
  if (str(buf, 58, 28) !== 'SIDMON II - THE MIDI VERSION') return UNKNOWN;
  const orders       = buf[2];                   // track position count at offset 2
  const samples      = u16BE(buf, 4) >> 6;       // raw u16 >> 6 = sample count
  const instruments  = u32BE(buf, 26) >> 5;      // waveDataLen / 32 = instrument count
  // trackDataLen (u32 at offset 14) = number of track steps; pattern numbers at offset 90
  const trackDataLen = u32BE(buf, 14);
  let highest = 0;
  const end = Math.min(90 + trackDataLen, buf.length);
  for (let i = 90; i < end; i++) {
    if (buf[i] > highest) highest = buf[i];
  }
  const patterns = end > 90 ? highest + 1 : -1;
  return { channels: 4, patterns, orders, instruments, samples };
}

/** Fred Editor — locate dataPtr/basePtr via 68k JMP pattern, then count samples/patterns */
function fredMeta(buf: Uint8Array): NativeFormatMeta {
  const base: NativeFormatMeta = { channels: 4, patterns: -1, orders: -1, instruments: -1, samples: -1 };
  if (buf.length < 1024) return base;
  // Verify four JMP (0x4efa) opcodes at bytes 0,4,8,12
  for (let i = 0; i < 16; i += 4) {
    if (((buf[i] << 8) | buf[i + 1]) !== 0x4efa) return base;
  }
  // Scan for 68k patterns to find dataPtr (0x123a/0xb001) and basePtr (0x214a/0x47fa)
  let dataPtr = 0, basePtr = 0;
  let pos = 16;
  while (pos < 1024 && pos + 6 <= buf.length) {
    const v = (buf[pos] << 8) | buf[pos + 1];
    if (v === 0x123a && pos + 5 < buf.length) {
      const offset  = (buf[pos + 2] << 8) | buf[pos + 3];
      const next    = (buf[pos + 4] << 8) | buf[pos + 5];
      if (next === 0xb001) dataPtr = (pos + 2 + offset) - 0x895;
    } else if (v === 0x214a && pos + 7 < buf.length) {
      const next = (buf[pos + 4] << 8) | buf[pos + 5];
      if (next === 0x47fa) {
        const d = (buf[pos + 6] << 8) | buf[pos + 7];
        basePtr = pos + 6 + (d >= 0x8000 ? d - 0x10000 : d);
        break;
      }
    }
    pos += 2;
  }
  if (basePtr === 0) return base;
  // Read sampleDataOffset and patternDataOffset from the two u32s at stOff
  const stOff = dataPtr + 0x8a2;
  if (stOff + 8 > buf.length) return base;
  const sampleDataOffset  = u32BE(buf, stOff);
  const patternDataOffset = u32BE(buf, stOff + 4);
  // Walk 64-byte sample structs until sentinel (pointer = 0 or out of range)
  let readPos = basePtr + sampleDataOffset;
  let sampleCount = 0;
  while (readPos + 64 <= buf.length) {
    const ptr = u32BE(buf, readPos);
    if (ptr === 0 || ptr >= buf.length || ptr < readPos) break;
    sampleCount++;
    readPos += 64;
  }
  // Track table: song 0 channels 0-3, each with a startOff u16 at tracksBase+[0,2,4,6]
  // tracksLen gives the byte extent of the entire track data area (used for ch 3's end)
  const tracksBase   = dataPtr + 0xb0e;
  const patternStart = basePtr + patternDataOffset;
  const tracksLen    = patternStart - tracksBase;
  let orders = -1, patterns = -1;
  if (tracksBase + 8 <= buf.length && tracksLen > 0) {
    const s0 = u16BE(buf, tracksBase);
    const s1 = u16BE(buf, tracksBase + 2);
    const s2 = u16BE(buf, tracksBase + 4);
    const s3 = u16BE(buf, tracksBase + 6);
    const len0 = (s1 - s0) >> 1;
    const len1 = (s2 - s1) >> 1;
    const len2 = (s3 - s2) >> 1;
    const len3 = (tracksLen - s3) >> 1;
    const maxLen = Math.max(len0, len1, len2);  // orders = max length across ch 0-2
    if (maxLen > 0) orders = maxLen;
    // Count unique pattern byte-offsets across all 4 channels of song 0.
    // Entry values with the high bit set (≥ 0x8000) are loop/end markers — skip them.
    const startOffs = [s0, s1, s2, s3];
    const lengths   = [len0, len1, len2, len3];
    const seen = new Set<number>();
    for (let ch = 0; ch < 4; ch++) {
      for (let ptr = 0; ptr < lengths[ch]; ptr++) {
        const entryAddr = tracksBase + startOffs[ch] + ptr * 2;
        if (entryAddr + 2 > buf.length) break;
        const offset = u16BE(buf, entryAddr);
        if ((offset & 0x8000) === 0) seen.add(offset);
      }
    }
    if (seen.size > 0) patterns = seen.size;
  }
  return { channels: 4, patterns, orders, instruments: sampleCount, samples: sampleCount };
}

/** Sound-FX v1.0 ("SONG" at 60) / v2.0 ("SO31" at 124) */
function soundFXMeta(buf: Uint8Array): NativeFormatMeta {
  if (buf.length < 64) return UNKNOWN;
  let sampleTableOffset: number;
  let numSampleSlots: number;
  if (str(buf, 60, 4) === 'SONG') {
    sampleTableOffset = 0;
    numSampleSlots    = 16;
  } else {
    if (buf.length < 128 || str(buf, 124, 4) !== 'SO31') return UNKNOWN;
    sampleTableOffset = 544;
    numSampleSlots    = 32;
  }
  const songInfoOffset = 530 + sampleTableOffset;
  if (songInfoOffset >= buf.length) return UNKNOWN;
  const orders = buf[songInfoOffset];
  // Scan song positions to find highest pattern index → pattern count
  let highest = -1;
  for (let i = 0; i < orders && (songInfoOffset + 2 + i) < buf.length; i++) {
    const val = buf[songInfoOffset + 2 + i];
    if (val > highest) highest = val;
  }
  const patterns = highest >= 0 ? highest + 1 : -1;
  // Count sample slots with non-zero size (sample sizes at offsets 0..numSampleSlots*4-4)
  let samples = 0;
  for (let i = 1; i < numSampleSlots; i++) {
    if (u32BE(buf, i * 4) > 0) samples++;
  }
  return { channels: 4, patterns, orders, instruments: numSampleSlots - 1, samples };
}

/** Digital Mugician V1 / V2 by Rob Hubbard */
function mugicianMeta(buf: Uint8Array): NativeFormatMeta {
  if (buf.length < 80) return UNKNOWN;
  const magic    = str(buf, 0, 24);
  const MAGIC_V1 = ' MUGICIAN/SOFTEYES 1990 ';
  const MAGIC_V2 = ' MUGICIAN2/SOFTEYES 1990';
  if (magic !== MAGIC_V1 && magic !== MAGIC_V2) return UNKNOWN;
  const sampleCount = u32BE(buf, 60);   // offset 60: UInt sample count
  // Song 0 header at offset 76: loop(1)+loopStep(1)+speed(1)+length(1) → orders = buf[79]
  const orders = buf[79];               // song 0 position count
  // Scan song 0's track entries (at offset 204) for max pattern index
  // songTrackCounts[0] = u32BE(buf, 28); total entries = that * 4; each entry 2 bytes
  const totalEntries = u32BE(buf, 28) << 2;
  const trackDataEnd = 204 + totalEntries * 2;
  let highest = -1;
  for (let i = 204; i + 1 < buf.length && i < trackDataEnd; i += 2) {
    if (buf[i] > highest) highest = buf[i];
  }
  const patterns = highest >= 0 ? highest + 1 : -1;
  return { channels: 4, patterns, orders, instruments: sampleCount, samples: sampleCount };
}

/** TFMX by Jochen Hippel — scan for "TFMX\0" header */
function tfmxMeta(buf: Uint8Array): NativeFormatMeta {
  // Scan the first 0xB80 bytes for the 5-byte magic "TFMX\0"
  const limit = Math.min(0xB80, buf.length - 5);
  let h = -1;
  for (let i = 0; i < limit; i++) {
    if (buf[i] === 0x54 && buf[i+1] === 0x46 && buf[i+2] === 0x4D &&
        buf[i+3] === 0x58 && buf[i+4] === 0x00) {
      h = i;
      break;
    }
  }
  if (h < 0 || h + 0x14 + 2 > buf.length) return UNKNOWN;
  const patterns    = u16BE(buf, h + 0x08) + 1;  // patternsMax + 1
  const orders      = u16BE(buf, h + 0x0A) + 1;  // trackStepsMax + 1
  const instruments = u16BE(buf, h + 0x06) + 1;  // volSeqsMax + 1
  const samples     = u16BE(buf, h + 0x12);       // sampleCount
  return { channels: 4, patterns, orders, instruments, samples };
}

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Extract header metadata for a native tracker format.
 *
 * @param key  The format key matching NATIVE_FORMAT_PATTERNS in ImportModuleDialog
 * @param buffer  Raw file bytes
 * @returns  NativeFormatMeta with -1 for any fields that could not be determined
 */
export function getNativeFormatMetadata(key: string, buffer: ArrayBuffer): NativeFormatMeta {
  const buf = new Uint8Array(buffer);
  switch (key) {
    case 'fc':       return fcMeta(buf);
    case 'hvl':      return hvlMeta(buf);
    case 'okt':      return oktMeta(buf);
    case 'med':      return medMeta(buf);
    case 'digi':     return digiMeta(buf);
    case 'soundmon': return soundMonMeta(buf);
    case 'sidmon2':  return sidMon2Meta(buf);
    case 'fred':     return fredMeta(buf);
    case 'soundfx':  return soundFXMeta(buf);
    case 'mugician': return mugicianMeta(buf);
    case 'tfmx':     return tfmxMeta(buf);
    default:         return { ...UNKNOWN };
  }
}
