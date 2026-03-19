/**
 * IffSmusExporter.ts — Export TrackerSong as IFF SMUS (Simple Musical Score) format
 *
 * Produces a valid IFF FORM/SMUS file with:
 *   FORM header (SMUS)
 *   NAME chunk — song name
 *   AUTH chunk — author (if present)
 *   SHDR chunk — score header: uint16 tempo, uint8 globalVol, uint8 numChannels
 *   INS1 chunks — instrument definitions (register, type=0, data1=0, data2=0, name)
 *   TRAK chunks — one per channel, event stream (2 bytes per event)
 *
 * TRAK event encoding (2 bytes per event):
 *   type 0-127:  MIDI note on; data = duration index (nibble, 0x0F masked)
 *   type 128:    rest; data = duration index
 *   type 129:    instrument change; data = register number
 *   type 255:    end-of-track mark
 *
 * DURATION_TABLE: [32,16,8,4,2,-1,-1,-1, 48,24,12,6,3,-1,-1,-1]
 *
 * Note mapping (matches IffSmusParser):
 *   XM note (1-96) → MIDI note = xmNote + 11
 *   MIDI 60 = middle C = XM 49
 *
 * Tempo: SHDR uint16 = rawTempo. We reverse the parser's smusTempoToSpeedBPM
 *   by searching the tempo table for the best match.
 *
 * Reference: IffSmusParser.ts, IffSmusEncoder.ts (variable-length encoder)
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';

// -- Duration table (from IffSmusParser) ----------------------------------------

const DURATION_TABLE: number[] = [
  32, 16, 8, 4, 2, -1, -1, -1,
  48, 24, 12, 6, 3, -1, -1, -1,
];

// Reverse lookup: tick count → SMUS data nibble
const DURATION_TO_INDEX = new Map<number, number>();
for (let i = 0; i < DURATION_TABLE.length; i++) {
  if (DURATION_TABLE[i] > 0) {
    DURATION_TO_INDEX.set(DURATION_TABLE[i], i);
  }
}

// -- Event type constants -------------------------------------------------------

const EVENT_REST = 128;
const EVENT_INSTRUMENT = 129;
const EVENT_MARK = 255;

// -- Tempo table (from IffSmusParser) -------------------------------------------

const TEMPO_TABLE: number[] = [
  0xFA83, 0xF525, 0xEFE4, 0xEAC0, 0xE5B9, 0xE0CC, 0xDBFB, 0xD744,
  0xD2A8, 0xCE24, 0xC9B9, 0xC567, 0xC12C, 0xBD08, 0xB8FB, 0xB504,
  0xB123, 0xAD58, 0xA9A1, 0xA5FE, 0xA270, 0x9EF5, 0x9B8D, 0x9837,
  0x94F4, 0x91C3, 0x8EA4, 0x8B95, 0x8898, 0x85AA, 0x82CD, 0x8000,
  0x7D41, 0x7A92, 0x77F2, 0x7560, 0x72DC, 0x7066, 0x6DFD, 0x6BA2,
  0x6954, 0x6712, 0x64DC, 0x62B3, 0x6096, 0x5E84, 0x5C7D, 0x5A82,
  0x5891, 0x56AC, 0x54D0, 0x52FF, 0x5138, 0x4F7A, 0x4DC6, 0x4C1B,
  0x4A7A, 0x48E1, 0x4752, 0x45CA, 0x444C, 0x42D5, 0x4166, 0x4000,
  0x3EA0, 0x3D49, 0x3BF9, 0x3AB0, 0x396E, 0x3833, 0x36FE, 0x35D1,
  0x34AA, 0x3389, 0x326E, 0x3159, 0x304B, 0x2F42, 0x2E3E, 0x2D41,
  0x2C48, 0x2B56, 0x2A68, 0x297F, 0x289C, 0x27BD, 0x26E3, 0x260D,
  0x253D, 0x2470, 0x23A9, 0x22E5, 0x2226, 0x216A, 0x20B3, 0x2000,
  0x1F50, 0x1EA4, 0x1DFC, 0x1D58, 0x1CB7, 0x1C19, 0x1B7F, 0x1AE8,
  0x1A55, 0x19C4, 0x1937, 0x18AC, 0x1825, 0x17A1, 0x171F, 0x16A0,
  0x1624, 0x15AB, 0x1534, 0x14BF, 0x144E, 0x13DE, 0x1371, 0x1306,
  0x129E, 0x1238, 0x11D4, 0x1172, 0x1113, 0x10B5, 0x1059, 0x1000,
];

// -- Helper functions -----------------------------------------------------------

/**
 * Find closest SMUS duration index for a tick count.
 */
function ticksToDurationIndex(ticks: number): number {
  if (DURATION_TO_INDEX.has(ticks)) {
    return DURATION_TO_INDEX.get(ticks)!;
  }
  let bestIdx = 3; // default: 4 ticks (quarter note)
  let bestDist = Infinity;
  for (let i = 0; i < DURATION_TABLE.length; i++) {
    if (DURATION_TABLE[i] < 0) continue;
    const dist = Math.abs(DURATION_TABLE[i] - ticks);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * Reverse the parser's smusTempoToSpeedBPM: given BPM + speed, find the
 * closest SHDR rawTempo value. We iterate tempoIndex values, compute what
 * BPM each would produce, and pick the closest match.
 */
function bpmSpeedToRawTempo(bpm: number, speed: number): number {
  if (bpm <= 0 || speed <= 0) return 0x1F57; // fallback default

  // For each tempoIndex, compute the resulting BPM via the same pipeline
  // the parser uses, and find the closest match.
  let bestRawTempo = 0x1F57;
  let bestDist = Infinity;

  for (let idx = 0; idx < TEMPO_TABLE.length; idx++) {
    const tableVal = TEMPO_TABLE[idx];
    const tSpeed = tableVal >>> 12;
    if (tSpeed === 0) continue;

    const speedShifted = tSpeed << 12;
    const calculatedTempo = Math.floor((tableVal * 32768) / speedShifted);
    const ciaTimer = Math.floor((calculatedTempo * 0x2E9C) / 32768);
    if (ciaTimer === 0) continue;

    const resultBpm = Math.round((709379 * 5) / (2 * ciaTimer));

    // Match both BPM and speed
    const dist = Math.abs(resultBpm - bpm) + Math.abs(tSpeed - speed) * 10;
    if (dist < bestDist) {
      bestDist = dist;

      // Reverse: from tempoIndex, recover rawTempo
      // Parser: quotient = 0x0E100000 / rawTempo, then finds first table entry <= quotient
      // So quotient ~= TEMPO_TABLE[idx], rawTempo = 0x0E100000 / TEMPO_TABLE[idx]
      const quotient = TEMPO_TABLE[idx];
      bestRawTempo = Math.floor(0x0E100000 / quotient);
    }
  }

  return Math.max(0, Math.min(0xFFFF, bestRawTempo));
}

function writeFourCC(buf: Uint8Array, off: number, str: string): void {
  for (let i = 0; i < 4; i++) {
    buf[off + i] = str.charCodeAt(i) & 0xFF;
  }
}

function writeU32BE(buf: Uint8Array, off: number, val: number): void {
  buf[off]     = (val >>> 24) & 0xFF;
  buf[off + 1] = (val >>> 16) & 0xFF;
  buf[off + 2] = (val >>> 8) & 0xFF;
  buf[off + 3] = val & 0xFF;
}

function writeU16BE(buf: Uint8Array, off: number, val: number): void {
  buf[off]     = (val >>> 8) & 0xFF;
  buf[off + 1] = val & 0xFF;
}

function writeString(buf: Uint8Array, off: number, str: string, len: number): void {
  for (let i = 0; i < len; i++) {
    buf[off + i] = i < str.length ? (str.charCodeAt(i) & 0xFF) : 0;
  }
}

/**
 * Build an IFF chunk: [FourCC (4)] [size BE u32 (4)] [data (size)] [pad if odd]
 * Returns a Uint8Array containing the full chunk (header + data + optional pad byte).
 */
function makeChunk(id: string, data: Uint8Array): Uint8Array {
  const padded = (data.length & 1) !== 0;
  const chunkSize = 8 + data.length + (padded ? 1 : 0);
  const chunk = new Uint8Array(chunkSize);
  writeFourCC(chunk, 0, id);
  writeU32BE(chunk, 4, data.length);
  chunk.set(data, 8);
  // pad byte is already 0
  return chunk;
}

// -- Main export function -------------------------------------------------------

export async function exportIffSmus(
  song: TrackerSong,
): Promise<{ data: Blob; filename: string; warnings: string[] }> {
  const warnings: string[] = [];
  const numChannels = Math.max(1, Math.min(4, song.numChannels));

  if (song.numChannels > 4) {
    warnings.push(`SMUS supports max 4 channels; truncating from ${song.numChannels} to 4`);
  }

  // -- Extract song name and author from TrackerSong name -----------------------
  // Parser encodes as "SongName (Author) [SMUS]"
  let songName = song.name || 'Untitled';
  let author = '';

  // Strip [SMUS] suffix if present
  songName = songName.replace(/\s*\[SMUS\]\s*$/, '');

  // Extract "(Author)" if present
  const authorMatch = songName.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (authorMatch) {
    songName = authorMatch[1].trim();
    author = authorMatch[2].trim();
  }

  // -- Build NAME chunk ---------------------------------------------------------
  const nameBytes = new Uint8Array(songName.length);
  writeString(nameBytes, 0, songName, songName.length);
  const nameChunk = makeChunk('NAME', nameBytes);

  // -- Build AUTH chunk (optional) ----------------------------------------------
  let authChunk: Uint8Array | null = null;
  if (author.length > 0) {
    const authBytes = new Uint8Array(author.length);
    writeString(authBytes, 0, author, author.length);
    authChunk = makeChunk('AUTH', authBytes);
  }

  // -- Build SHDR chunk ---------------------------------------------------------
  // SHDR: uint16 tempo, uint8 globalVol, uint8 numChannels
  const rawTempo = bpmSpeedToRawTempo(song.initialBPM, song.initialSpeed);
  const shdrData = new Uint8Array(4);
  writeU16BE(shdrData, 0, rawTempo);
  shdrData[2] = 0x7F; // globalVol (127 → after *2 clamping in parser = 254 ≈ max)
  shdrData[3] = numChannels;
  const shdrChunk = makeChunk('SHDR', shdrData);

  // -- Build INS1 chunks --------------------------------------------------------
  const ins1Chunks: Uint8Array[] = [];
  const numInstruments = Math.min(255, song.instruments.length);

  for (let i = 0; i < numInstruments; i++) {
    const inst = song.instruments[i];
    const instName = inst.name || `Instrument ${i + 1}`;
    // INS1: uint8 register, uint8 type(0=sampled), uint8 data1, uint8 data2, string name
    const ins1Data = new Uint8Array(4 + instName.length);
    ins1Data[0] = i;     // register number
    ins1Data[1] = 0;     // type = sampled sound
    ins1Data[2] = 0;     // data1
    ins1Data[3] = 0;     // data2
    writeString(ins1Data, 4, instName, instName.length);
    ins1Chunks.push(makeChunk('INS1', ins1Data));
  }

  // -- Build TRAK chunks --------------------------------------------------------
  // Flatten all pattern data per channel across all song positions,
  // then encode as SMUS event streams.
  const trakChunks: Uint8Array[] = [];

  for (let ch = 0; ch < numChannels; ch++) {
    const events: Array<{ type: number; data: number }> = [];
    let lastInstr = -1;
    let i = 0;

    // Flatten all rows for this channel across the song order
    const flatRows: Array<{ note: number; instrument: number }> = [];
    for (const posIdx of song.songPositions) {
      const pat = song.patterns[posIdx];
      if (!pat || ch >= pat.channels.length) continue;
      const channel = pat.channels[ch];
      for (let row = 0; row < pat.length; row++) {
        const cell = channel.rows[row];
        flatRows.push({
          note: cell?.note ?? 0,
          instrument: cell?.instrument ?? 0,
        });
      }
    }

    while (i < flatRows.length) {
      const cell = flatRows[i];

      if (cell.note > 0 && cell.note <= 96) {
        // Emit instrument change if needed
        if (cell.instrument > 0 && cell.instrument !== lastInstr) {
          // Register = instrument - 1 (parser: instrumentMapper[register] = 1-based)
          events.push({ type: EVENT_INSTRUMENT, data: (cell.instrument - 1) & 0xFF });
          lastInstr = cell.instrument;
        }

        // Count duration: this note + consecutive empty rows
        let duration = 1;
        let j = i + 1;
        while (j < flatRows.length) {
          const next = flatRows[j];
          if (next.note !== 0 || next.instrument !== 0) break;
          duration++;
          j++;
        }

        // Note event: type = MIDI note, data = duration index
        const midiNote = Math.max(0, Math.min(127, cell.note + 11));
        const durIdx = ticksToDurationIndex(duration);
        events.push({ type: midiNote, data: durIdx & 0x0F });
        i = j;
      } else {
        // Rest: count consecutive empty rows
        let duration = 0;
        let j = i;
        while (j < flatRows.length) {
          const next = flatRows[j];
          if (next.note !== 0) break;
          if (next.instrument !== 0) break;
          duration++;
          j++;
        }
        if (duration === 0) { duration = 1; j = i + 1; }

        const durIdx = ticksToDurationIndex(duration);
        events.push({ type: EVENT_REST, data: durIdx & 0x0F });
        i = j;
      }
    }

    // End-of-track marker
    events.push({ type: EVENT_MARK, data: 0xFF });

    // Serialize events (2 bytes each)
    const trakData = new Uint8Array(events.length * 2);
    for (let e = 0; e < events.length; e++) {
      trakData[e * 2] = events[e].type & 0xFF;
      trakData[e * 2 + 1] = events[e].data & 0xFF;
    }

    trakChunks.push(makeChunk('TRAK', trakData));
  }

  // -- Assemble the IFF FORM/SMUS file ------------------------------------------
  // Calculate total inner content size (everything after "FORM" + size + "SMUS")
  let innerSize = 4; // "SMUS" type
  innerSize += nameChunk.length;
  if (authChunk) innerSize += authChunk.length;
  innerSize += shdrChunk.length;
  for (const ins of ins1Chunks) innerSize += ins.length;
  for (const trk of trakChunks) innerSize += trk.length;

  const totalSize = 8 + innerSize; // "FORM" + u32 size + inner
  const output = new Uint8Array(totalSize);

  let pos = 0;

  // FORM header
  writeFourCC(output, pos, 'FORM'); pos += 4;
  writeU32BE(output, pos, innerSize); pos += 4;
  writeFourCC(output, pos, 'SMUS'); pos += 4;

  // NAME chunk
  output.set(nameChunk, pos); pos += nameChunk.length;

  // AUTH chunk (optional)
  if (authChunk) {
    output.set(authChunk, pos); pos += authChunk.length;
  }

  // SHDR chunk
  output.set(shdrChunk, pos); pos += shdrChunk.length;

  // INS1 chunks
  for (const ins of ins1Chunks) {
    output.set(ins, pos); pos += ins.length;
  }

  // TRAK chunks
  for (const trk of trakChunks) {
    output.set(trk, pos); pos += trk.length;
  }

  // -- Generate filename --------------------------------------------------------
  const baseName = songName.replace(/[^a-zA-Z0-9_\- ]/g, '').trim() || 'untitled';
  const filename = `${baseName}.smus`;

  return {
    data: new Blob([output], { type: 'application/octet-stream' }),
    filename,
    warnings,
  };
}
