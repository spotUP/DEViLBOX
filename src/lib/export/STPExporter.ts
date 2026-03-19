/**
 * STPExporter.ts — Export TrackerSong as SoundTracker Pro II (.stp) format
 *
 * Produces a version 0 STP3 file (simplest variant, sequential patterns).
 * Only sample-based instruments are exported; synths become empty sample slots.
 *
 * STP3 version 0 layout:
 *   +0    "STP3" magic (4 bytes)
 *   +4    version (u16BE) = 0
 *   +6    numOrders (u8)
 *   +7    patternLength (u8)
 *   +8    orderList[128]
 *   +136  speed (u16BE)
 *   +138  speedFrac (u16BE) = 0
 *   +140  timerCount (u16BE) — CIA timer = round(3546 * 125 / BPM)
 *   +142  flags (u16BE) = 0
 *   +144  reserved (u32BE) = 0
 *   +148  midiCount (u16BE) = 50
 *   +150  midi[50] (zeroed)
 *   +200  numSamples (u16BE)
 *   +202  sampleStructSize (u16BE) — fixed size of each sample chunk
 *
 * Sample headers (version 0, per sample):
 *   actualSmp (u16BE) — 1-based
 *   Chunk (sampleStructSize bytes):
 *     path[31]         — null-terminated
 *     flags (u8) = 0
 *     name[30]         — null-terminated
 *     length (u32BE)   — sample length in bytes
 *     volume (u8)      — 0-64
 *     reserved1 (u8) = 0
 *     loopStart (u32BE)
 *     loopLength (u32BE)
 *     defaultCommand (u16BE) = 0
 *     defaultPeriod (u16BE) = 0
 *     finetune (u8) = 0
 *     reserved2 (u8) = 0
 *   Total chunk = 31 + 1 + 30 + 20 = 82 bytes
 *
 * Pattern block (version 0):
 *   numPatterns (u16BE)
 *   then sequential: 4ch × patternLength × 4 bytes per pattern
 *
 * Pattern cell (4 bytes, row-major):
 *   [0] instrument (1-based, 0=none)
 *   [1] note (1-based, 0=empty)
 *   [2] effect command
 *   [3] effect parameter
 *
 * Sample data: 8-bit signed PCM, sequential
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';

// ── Binary helpers ─────────────────────────────────────────────────────────────

function writeU8(view: DataView, off: number, val: number): void {
  view.setUint8(off, val & 0xFF);
}

function writeU16BE(view: DataView, off: number, val: number): void {
  view.setUint16(off, val & 0xFFFF, false);
}

function writeU32BE(view: DataView, off: number, val: number): void {
  view.setUint32(off, val >>> 0, false);
}

function writeStringFixed(buf: Uint8Array, off: number, str: string, len: number): void {
  for (let i = 0; i < len; i++) {
    buf[off + i] = i < str.length ? str.charCodeAt(i) & 0xFF : 0;
  }
}

// ── Note conversion ────────────────────────────────────────────────────────────

/**
 * XM note → STP note (1-based, 0=empty).
 * Parser uses: XM note = 25 + stpNote, so stpNote = xmNote - 25.
 */
const STP_NOTE_OFFSET = 25;

function xmNoteToSTP(xmNote: number): number {
  if (xmNote <= 0) return 0;
  if (xmNote === 97) return 0; // note-off has no STP equivalent
  const stp = xmNote - STP_NOTE_OFFSET;
  return stp > 0 ? Math.min(stp, 255) : 0;
}

// ── Effect reverse mapping (XM → STP) ──────────────────────────────────────────

/**
 * Reverse the parser's convertSTPEffect(). Maps XM effTyp/eff back to STP
 * command/param. This is a best-effort mapping — some XM effects have no STP
 * equivalent.
 */
function reverseEffect(effTyp: number, eff: number): { cmd: number; param: number } {
  if (effTyp === 0 && eff === 0) return { cmd: 0, param: 0 };

  switch (effTyp) {
    case 0x00: // Arpeggio
      return eff ? { cmd: 0x00, param: eff } : { cmd: 0, param: 0 };
    case 0x01: // Portamento up → STP 0x01
      return { cmd: 0x01, param: eff };
    case 0x02: // Portamento down → STP 0x02
      return { cmd: 0x02, param: eff };
    case 0x03: // Tone portamento → STP 0x13
      return { cmd: 0x13, param: eff };
    case 0x04: // Vibrato → STP 0x10
      return { cmd: 0x10, param: eff };
    case 0x07: // Tremolo → STP 0x11
      return { cmd: 0x11, param: eff };
    case 0x09: // Sample offset → STP 0x49
      return { cmd: 0x49, param: eff };
    case 0x0A: { // Volume slide → STP 0x0D (nibbles swapped)
      // XM: hi=up, lo=down → STP: hi=down, lo=up
      const up = (eff >> 4) & 0x0F;
      const down = eff & 0x0F;
      return { cmd: 0x0D, param: (down << 4) | up };
    }
    case 0x0B: // Position jump → STP 0x14
      return { cmd: 0x14, param: eff };
    case 0x0C: // Set volume → STP 0x0C
      return { cmd: 0x0C, param: Math.min(eff, 64) };
    case 0x0D: // Pattern break → STP 0x12
      return { cmd: 0x12, param: 0 };
    case 0x0E: { // Extended effects
      const subCmd = (eff >> 4) & 0x0F;
      const subParam = eff & 0x0F;
      switch (subCmd) {
        case 0x0: // Filter → STP 0x0E
          return { cmd: 0x0E, param: subParam ? 0 : 1 };
        case 0x1: // Fine portamento up → STP 0x09
          return { cmd: 0x09, param: subParam };
        case 0x2: // Fine portamento down → STP 0x0A
          return { cmd: 0x0A, param: subParam };
        case 0x9: // Retrigger → STP 0x22
          return { cmd: 0x22, param: subParam };
        case 0xA: // Fine volume slide up → STP 0x1D
          return { cmd: 0x1D, param: subParam }; // up in lo nibble
        case 0xB: // Fine volume slide down → STP 0x1D
          return { cmd: 0x1D, param: (subParam << 4) }; // down in hi nibble
        case 0xC: // Note cut → STP 0x20
          return { cmd: 0x20, param: subParam };
        case 0xD: // Note delay → STP 0x21
          return { cmd: 0x21, param: subParam };
        case 0x6: // Pattern loop → STP 0x4E
        case 0xE: // Pattern delay → STP 0x4E
          return { cmd: 0x4E, param: eff };
        default:
          return { cmd: 0, param: 0 };
      }
    }
    case 0x0F: // Set speed/tempo → STP 0x4F
      return { cmd: 0x4F, param: eff };
    case 0x10: // Set global volume → STP 0x07
      return { cmd: 0x07, param: Math.min(eff, 64) };
    default:
      return { cmd: 0, param: 0 };
  }
}

// ── CIA tempo helper ───────────────────────────────────────────────────────────

/** BPM → CIA timer count. 3546 = CIA timer for 125 BPM. */
function bpmToCIATimer(bpm: number): number {
  if (bpm <= 0) return 3546;
  return Math.round((125.0 * 3546.0) / bpm);
}

// ── Sample PCM extraction ──────────────────────────────────────────────────────

interface SampleData {
  name: string;
  pcm: Uint8Array;    // 8-bit signed PCM
  volume: number;     // 0-64
  loopStart: number;  // in bytes
  loopLength: number; // in bytes
}

function extractSample(inst: { name?: string; sample?: { audioBuffer?: ArrayBuffer; loopStart?: number; loopEnd?: number }; volume?: number }): SampleData | null {
  if (!inst.sample?.audioBuffer || inst.sample.audioBuffer.byteLength < 44) return null;

  const wav = new DataView(inst.sample.audioBuffer);
  const bitsPerSample = wav.getUint16(34, true);
  const dataChunkSize = wav.getUint32(40, true);

  let pcm: Uint8Array;
  if (bitsPerSample === 16) {
    const frames = Math.floor(dataChunkSize / 2);
    pcm = new Uint8Array(frames);
    for (let j = 0; j < frames; j++) {
      pcm[j] = (wav.getInt16(44 + j * 2, true) >> 8) & 0xFF;
    }
  } else {
    // 8-bit WAV is unsigned; convert to signed
    const frames = dataChunkSize;
    pcm = new Uint8Array(frames);
    for (let j = 0; j < frames; j++) {
      pcm[j] = (wav.getUint8(44 + j) - 128) & 0xFF;
    }
  }

  const loopStart = inst.sample.loopStart ?? 0;
  const loopEnd = inst.sample.loopEnd ?? 0;
  const loopLength = loopEnd > loopStart ? loopEnd - loopStart : 0;

  // Volume: instrument volume is in dB (-60..0), map to 0-64
  let vol = 64;
  if (inst.volume !== undefined && inst.volume < 0) {
    vol = Math.round(Math.pow(10, inst.volume / 20) * 64);
    vol = Math.max(0, Math.min(64, vol));
  }

  return {
    name: inst.name ?? '',
    pcm,
    volume: vol,
    loopStart,
    loopLength,
  };
}

// ── Main exporter ──────────────────────────────────────────────────────────────

const FILE_HEADER_SIZE = 204;
const SAMPLE_CHUNK_SIZE = 82; // 31 (path) + 1 (flags) + 30 (name) + 20 (fields)

export async function exportSTP(
  song: TrackerSong,
): Promise<{ data: Blob; filename: string; warnings: string[] }> {
  const warnings: string[] = [];

  // ── Gather song parameters ────────────────────────────────────────────────
  const numChannels = 4; // STP version 0 is always 4 channels
  if (song.numChannels > 4) {
    warnings.push(`STP supports 4 channels; channels 5-${song.numChannels} will be discarded`);
  }

  const songLen = Math.min(128, song.songPositions.length);
  const patternLength = song.patterns.length > 0
    ? Math.min(255, song.patterns[0].length)
    : 64;

  // Determine unique pattern indices referenced by song positions
  const usedPatternSet = new Set<number>();
  for (let i = 0; i < songLen; i++) {
    usedPatternSet.add(song.songPositions[i] ?? 0);
  }

  // Build a mapping: songPatternIdx → sequential STP pattern index
  const patternMap = new Map<number, number>();
  let nextPatIdx = 0;
  for (const idx of usedPatternSet) {
    if (idx < song.patterns.length) {
      patternMap.set(idx, nextPatIdx++);
    }
  }
  const numPatterns = nextPatIdx;

  // ── Gather sample data ────────────────────────────────────────────────────
  const maxSamples = Math.min(255, song.instruments.length);
  const samples: (SampleData | null)[] = [];
  let numSamples = 0;

  for (let i = 0; i < maxSamples; i++) {
    const inst = song.instruments[i];
    const sd = inst ? extractSample(inst) : null;
    samples.push(sd);
    if (sd) numSamples = i + 1; // track highest used sample index
  }

  // ── Calculate total file size ─────────────────────────────────────────────
  // Header: 204 bytes
  // Sample headers: numSamples × (2 + SAMPLE_CHUNK_SIZE)
  // Pattern block: 2 (numPatterns) + numPatterns × (numChannels × patternLength × 4)
  // Sample PCM data: sum of all sample lengths

  const sampleHeaderBytes = numSamples * (2 + SAMPLE_CHUNK_SIZE);
  const patternBlockBytes = 2 + numPatterns * (numChannels * patternLength * 4);
  let totalSamplePCM = 0;
  for (let i = 0; i < numSamples; i++) {
    totalSamplePCM += samples[i]?.pcm.length ?? 0;
  }

  const totalSize = FILE_HEADER_SIZE + sampleHeaderBytes + patternBlockBytes + totalSamplePCM;
  const buf = new ArrayBuffer(totalSize);
  const out = new Uint8Array(buf);
  const view = new DataView(buf);
  let cursor = 0;

  // ── Write file header (204 bytes) ─────────────────────────────────────────
  // Magic "STP3"
  out[0] = 0x53; out[1] = 0x54; out[2] = 0x50; out[3] = 0x33;
  cursor = 4;

  // Version = 0
  writeU16BE(view, cursor, 0); cursor += 2;

  // numOrders
  writeU8(view, cursor, songLen); cursor += 1;

  // patternLength
  writeU8(view, cursor, patternLength); cursor += 1;

  // orderList[128]
  for (let i = 0; i < 128; i++) {
    const songPatIdx = i < songLen ? (song.songPositions[i] ?? 0) : 0;
    const stpPatIdx = patternMap.get(songPatIdx) ?? 0;
    writeU8(view, cursor + i, stpPatIdx);
  }
  cursor += 128;

  // speed (u16BE)
  writeU16BE(view, cursor, song.initialSpeed ?? 6); cursor += 2;

  // speedFrac (u16BE)
  writeU16BE(view, cursor, 0); cursor += 2;

  // timerCount (u16BE) — CIA timer from BPM
  const bpm = song.initialBPM ?? 125;
  writeU16BE(view, cursor, bpmToCIATimer(bpm)); cursor += 2;

  // flags (u16BE)
  writeU16BE(view, cursor, 0); cursor += 2;

  // reserved (u32BE)
  writeU32BE(view, cursor, 0); cursor += 4;

  // midiCount (u16BE) — always 50
  writeU16BE(view, cursor, 50); cursor += 2;

  // midi[50] — zeroed
  cursor += 50;

  // numSamples (u16BE)
  writeU16BE(view, cursor, numSamples); cursor += 2;

  // sampleStructSize (u16BE)
  writeU16BE(view, cursor, SAMPLE_CHUNK_SIZE); cursor += 2;

  // ── Write sample headers ──────────────────────────────────────────────────
  for (let i = 0; i < numSamples; i++) {
    const sd = samples[i];
    const actualSmp = i + 1; // 1-based

    // actualSmp (u16BE)
    writeU16BE(view, cursor, actualSmp); cursor += 2;

    // Chunk starts here (SAMPLE_CHUNK_SIZE bytes)
    const chunkStart = cursor;

    // path[31]
    writeStringFixed(out, cursor, '', 31); cursor += 31;

    // flags (u8)
    writeU8(view, cursor, 0); cursor += 1;

    // name[30]
    writeStringFixed(out, cursor, sd?.name ?? `Sample ${actualSmp}`, 30); cursor += 30;

    // length (u32BE)
    const sampleLen = sd?.pcm.length ?? 0;
    writeU32BE(view, cursor, sampleLen); cursor += 4;

    // volume (u8)
    writeU8(view, cursor, sd?.volume ?? 64); cursor += 1;

    // reserved1 (u8)
    writeU8(view, cursor, 0); cursor += 1;

    // loopStart (u32BE)
    writeU32BE(view, cursor, sd?.loopStart ?? 0); cursor += 4;

    // loopLength (u32BE)
    writeU32BE(view, cursor, sd?.loopLength ?? 0); cursor += 4;

    // defaultCommand (u16BE)
    writeU16BE(view, cursor, 0); cursor += 2;

    // defaultPeriod (u16BE)
    writeU16BE(view, cursor, 0); cursor += 2;

    // finetune (u8)
    writeU8(view, cursor, 0); cursor += 1;

    // reserved2 (u8)
    writeU8(view, cursor, 0); cursor += 1;

    // Verify chunk size
    const written = cursor - chunkStart;
    if (written !== SAMPLE_CHUNK_SIZE) {
      // Shouldn't happen, but pad/skip if it does
      cursor = chunkStart + SAMPLE_CHUNK_SIZE;
    }
  }

  // ── Write pattern block (version 0) ───────────────────────────────────────
  // numPatterns (u16BE)
  writeU16BE(view, cursor, numPatterns); cursor += 2;

  // Patterns in sequential order
  for (const [songPatIdx] of [...patternMap.entries()].sort((a, b) => a[1] - b[1])) {
    const pat = song.patterns[songPatIdx];
    if (!pat) {
      // Write empty pattern
      cursor += numChannels * patternLength * 4;
      continue;
    }

    for (let row = 0; row < patternLength; row++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const cell = pat.channels[ch]?.rows[row];
        if (!cell || cursor + 4 > totalSize) {
          cursor += 4;
          continue;
        }

        // byte[0]: instrument (1-based)
        out[cursor] = (cell.instrument ?? 0) & 0xFF;

        // byte[1]: note (1-based STP note, 0=empty)
        out[cursor + 1] = xmNoteToSTP(cell.note ?? 0);

        // byte[2]: effect command
        // byte[3]: effect parameter
        const { cmd, param } = reverseEffect(cell.effTyp ?? 0, cell.eff ?? 0);
        out[cursor + 2] = cmd & 0xFF;
        out[cursor + 3] = param & 0xFF;

        cursor += 4;
      }
    }
  }

  // ── Write sample PCM data ─────────────────────────────────────────────────
  for (let i = 0; i < numSamples; i++) {
    const sd = samples[i];
    if (sd && sd.pcm.length > 0) {
      out.set(sd.pcm, cursor);
      cursor += sd.pcm.length;
    }
  }

  // ── Build result ──────────────────────────────────────────────────────────
  const filename = (song.name || 'export').replace(/[^a-zA-Z0-9_\-. ]/g, '_') + '.stp';

  return {
    data: new Blob([buf], { type: 'application/octet-stream' }),
    filename,
    warnings,
  };
}
