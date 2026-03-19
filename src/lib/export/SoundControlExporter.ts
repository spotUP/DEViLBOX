/**
 * SoundControlExporter.ts — Export TrackerSong to Sound Control 4.0 binary format.
 *
 * Produces a valid Sound Control 4.0 module file with the following layout (big-endian):
 *
 *   Header (64 bytes):
 *     0x00   16 bytes   Song name (padded with zeroes)
 *     0x10   uint32 BE  tracksLen   — size of tracks section
 *     0x14   uint32 BE  samplesLen  — size of samples section
 *     0x18   uint32 BE  posListLen  — size of position list
 *     0x1C   uint32 BE  instrLen    — size of instruments section (0 for this exporter)
 *     0x20   uint16 BE  skip (0)
 *     0x22   uint16 BE  version (3 = SC 4.0)
 *     0x24   uint16 BE  speed
 *     0x26   26 bytes   padding (zeroes to fill to offset 0x40)
 *
 *   Tracks section (at offset 0x40):
 *     256 × uint16 BE   Track offset table (relative to 0x40)
 *     Track data:        16-byte name + event pairs/quads + 0xFF 0xFF end marker
 *
 *   Samples section:
 *     256 × uint32 BE   Sample offset table (relative to samples section start)
 *     Sample entries:    16-byte name + header (64 bytes) + PCM data
 *
 *   Position list:
 *     Each entry = 12 bytes: 6 channels × { uint8 trackNum, uint8 unused(0) }
 *
 * Detection requires:
 *   - tracksLen at offset 0x10 is even and < 0x8000
 *   - At (tracksLen + 64 - 2): uint16 = 0xFFFF
 *   - At (tracksLen + 64):     uint32 = 0x00000400
 *     → This means the first 4 bytes of the sample offset table must be 0x00000400 (1024),
 *       which is the offset from samplesBase to the first sample entry (256 × 4 = 1024 bytes).
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';

// ── Binary write helpers ────────────────────────────────────────────────────

function writeU16BE(buf: Uint8Array, off: number, val: number): void {
  buf[off] = (val >>> 8) & 0xFF;
  buf[off + 1] = val & 0xFF;
}

function writeU32BE(buf: Uint8Array, off: number, val: number): void {
  buf[off] = (val >>> 24) & 0xFF;
  buf[off + 1] = (val >>> 16) & 0xFF;
  buf[off + 2] = (val >>> 8) & 0xFF;
  buf[off + 3] = val & 0xFF;
}

function writeStr(buf: Uint8Array, off: number, str: string, len: number): void {
  for (let i = 0; i < len; i++) {
    buf[off + i] = i < str.length ? str.charCodeAt(i) & 0xFF : 0;
  }
}

function writeS16BE(buf: Uint8Array, off: number, val: number): void {
  const v = val < 0 ? val + 65536 : val;
  writeU16BE(buf, off, v & 0xFFFF);
}

// ── Note encoding ───────────────────────────────────────────────────────────

/**
 * Reverse of sc40NoteToXm from the parser.
 * Parser: xmNote = idx + 13 (where idx is 0-based period table index)
 * SC 4.0 note byte = idx + 1 (1-based), 0 = no note.
 */
function xmToSc40Note(xmNote: number): number {
  if (xmNote === 0 || xmNote === 97) return 0;
  const idx = xmNote - 13; // 0-based index
  if (idx < 0 || idx >= 36) return 0;
  return idx + 1; // 1-based
}

// ── Sample extraction ───────────────────────────────────────────────────────

interface SCSampleExport {
  name: string;
  pcmSigned: Uint8Array;  // 8-bit signed PCM
  length: number;         // in words (for the header field)
  loopStart: number;      // in words
  loopEnd: number;        // in words
  noteTranspose: number;
}

/**
 * Extract 8-bit signed PCM from a WAV audioBuffer stored in an instrument.
 */
function extractSample(
  inst: TrackerSong['instruments'][number],
): SCSampleExport | null {
  if (!inst?.sample?.audioBuffer) return null;

  const wavBuf = inst.sample.audioBuffer;
  if (wavBuf.byteLength < 44) return null;

  const wav = new DataView(wavBuf);
  const dataLen = wav.getUint32(40, true);
  const bitsPerSample = wav.getUint16(34, true);
  const frames = bitsPerSample === 16
    ? Math.floor(dataLen / 2)
    : dataLen;

  if (frames === 0) return null;

  const pcm = new Uint8Array(frames);
  if (bitsPerSample === 16) {
    for (let j = 0; j < frames; j++) {
      const s16 = wav.getInt16(44 + j * 2, true);
      pcm[j] = (s16 >> 8) & 0xFF;
    }
  } else {
    for (let j = 0; j < frames; j++) {
      pcm[j] = (wav.getUint8(44 + j) ^ 0x80) & 0xFF;
    }
  }

  const loopStartSamples = inst.sample?.loopStart ?? 0;
  const loopEndSamples = inst.sample?.loopEnd ?? 0;

  return {
    name: inst.name ?? '',
    pcmSigned: pcm,
    length: Math.floor(frames / 2),         // in words
    loopStart: Math.floor(loopStartSamples / 2),  // in words
    loopEnd: Math.floor(loopEndSamples / 2),      // in words
    noteTranspose: 0,
  };
}

// ── Main exporter ───────────────────────────────────────────────────────────

const HEADER_SIZE = 64;         // 0x40
const TRACK_NAME_SIZE = 16;
const SAMPLE_HEADER_SIZE = 64;  // 0x40 (name + fields + padding before PCM)
const MAX_SAMPLES = 256;
const MAX_TRACKS = 256;
const NUM_CHANNELS = 6;

export async function exportSoundControl(
  song: TrackerSong,
): Promise<{ data: Blob; filename: string; warnings: string[] }> {
  const warnings: string[] = [];

  if (song.numChannels > NUM_CHANNELS) {
    warnings.push(
      `Sound Control supports 6 channels; ${song.numChannels - NUM_CHANNELS} channels will be dropped.`,
    );
  }

  // ── Collect samples ─────────────────────────────────────────────────────
  const sampleExports: (SCSampleExport | null)[] = [];
  for (let i = 0; i < Math.min(MAX_SAMPLES, song.instruments.length); i++) {
    sampleExports.push(extractSample(song.instruments[i]));
  }

  if (song.instruments.length > MAX_SAMPLES) {
    warnings.push(
      `Sound Control supports max ${MAX_SAMPLES} samples; ${song.instruments.length - MAX_SAMPLES} instruments were dropped.`,
    );
  }

  // ── Build unique tracks ─────────────────────────────────────────────────
  // Each (pattern, channel) pair becomes a unique track.
  // A track contains: 16-byte name + event data + 0xFF 0xFF end marker.
  //
  // Event data per row:
  //   - Note row: 4 bytes { noteByte, sampleOrInstr, 0, volume }
  //   - Wait (empty): 2 bytes { 0x00, numTicks } — we batch consecutive empties
  //   - End: 2 bytes { 0xFF, 0xFF }

  interface TrackData {
    name: string;
    events: Uint8Array;
  }

  const trackDataList: TrackData[] = [];
  // Map "patIdx:ch" → track index
  const trackMap = new Map<string, number>();

  // Track 0 is reserved as "empty track" (just end marker)
  const emptyTrackEvents = new Uint8Array([0xFF, 0xFF]);
  trackDataList.push({ name: 'Empty', events: emptyTrackEvents });

  for (let p = 0; p < song.patterns.length; p++) {
    const pat = song.patterns[p];
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const key = `${p}:${ch}`;
      const channel = pat.channels[ch];
      if (!channel) {
        trackMap.set(key, 0); // empty track
        continue;
      }

      // Build event bytes
      const eventBytes: number[] = [];
      let pendingWaits = 0;

      const flushWaits = () => {
        while (pendingWaits > 0) {
          const w = Math.min(255, pendingWaits);
          eventBytes.push(0x00, w);
          pendingWaits -= w;
        }
      };

      for (let row = 0; row < pat.length; row++) {
        const cell = channel.rows[row];
        const note = cell?.note ?? 0;
        const instr = cell?.instrument ?? 0;
        const vol = cell?.volume ?? 0;

        if (note === 0 && instr === 0 && vol === 0) {
          // Empty row → accumulate wait
          pendingWaits++;
          continue;
        }

        // Flush any pending waits before a note event
        flushWaits();

        // Note event: 4 bytes
        const scNote = xmToSc40Note(note);
        // Instrument: XM is 1-based, SC is 0-based
        const scInstr = instr > 0 ? instr - 1 : 0;
        eventBytes.push(
          scNote > 0 ? scNote : 1, // dat1 must be non-zero for note event
          scInstr & 0xFF,
          0,                        // unused byte (yy)
          vol & 0x7F,
        );
      }

      // Flush trailing waits
      flushWaits();

      // End marker
      eventBytes.push(0xFF, 0xFF);

      // Check if track is just the end marker (effectively empty)
      if (eventBytes.length === 2) {
        trackMap.set(key, 0);
      } else {
        const trackIdx = trackDataList.length;
        if (trackIdx >= MAX_TRACKS) {
          warnings.push(`Too many unique tracks (>${MAX_TRACKS}); some channels will be empty.`);
          trackMap.set(key, 0);
        } else {
          trackMap.set(key, trackIdx);
          trackDataList.push({
            name: `P${p}Ch${ch + 1}`,
            events: new Uint8Array(eventBytes),
          });
        }
      }
    }
  }

  // ── Build track offset table and track data blob ───────────────────────
  // Offset table: 256 × uint16 (512 bytes)
  // Each offset is relative to tracksBase (0x40).
  // Offset 0 means "no track".
  const trackOffsetTableSize = 256 * 2; // 512 bytes
  let trackDataSize = 0;
  const trackAbsOffsets: number[] = [];

  for (let i = 0; i < trackDataList.length; i++) {
    trackAbsOffsets.push(trackOffsetTableSize + trackDataSize);
    trackDataSize += TRACK_NAME_SIZE + trackDataList[i].events.length;
  }

  const tracksLen = trackOffsetTableSize + trackDataSize;

  // Ensure tracksLen is even (required by detection)
  const tracksPadding = (tracksLen & 1) ? 1 : 0;
  const tracksLenPadded = tracksLen + tracksPadding;

  // The detection routine checks that the last 2 bytes of the tracks section are 0xFFFF.
  // The last track's end marker (0xFF 0xFF) satisfies this. But we need to verify
  // the end of the padded tracks section ends with 0xFFFF.
  // If tracksPadding=1, the pad byte sits after the last 0xFF 0xFF which would break detection.
  // So we must ensure tracks end properly. We'll add the pad byte before the end marker of
  // the last track if needed — actually simpler: just ensure total is even and the last
  // track ends with 0xFF 0xFF which it always does.
  // If padding needed, we add an extra 0xFF byte so the last 2 bytes are still 0xFF 0xFF.

  // ── Build sample offset table and sample data blob ─────────────────────
  // Sample offset table: 256 × uint32 (1024 bytes)
  // Each offset is relative to samplesBase.
  // The detection check requires the first entry (sample 0) offset = 0x00000400 = 1024,
  // which equals the offset table size itself. This works if sample 0 data starts
  // right after the offset table.
  const sampleOffsetTableSize = 256 * 4; // 1024 bytes

  let sampleDataSize = 0;
  const sampleEntries: Array<{
    headerAndPcm: Uint8Array;
    offset: number;
  }> = [];

  for (let i = 0; i < Math.min(MAX_SAMPLES, song.instruments.length); i++) {
    const s = sampleExports[i];
    if (!s) continue;

    const pcmLen = s.pcmSigned.length;
    const entrySize = SAMPLE_HEADER_SIZE + pcmLen;
    const entry = new Uint8Array(entrySize);

    // Sample header (64 bytes):
    //   0x00  16 bytes  name
    //   0x10  uint16    length (in words)
    //   0x12  uint16    loopStart (in words)
    //   0x14  uint16    loopEnd (in words)
    //   0x16  20 bytes  skip
    //   0x2A  int16     noteTranspose
    //   0x2C  16 bytes  skip
    //   0x3C  uint32    totalLen (header + PCM = entrySize)
    writeStr(entry, 0x00, s.name, 16);
    writeU16BE(entry, 0x10, s.length);
    writeU16BE(entry, 0x12, s.loopStart);
    writeU16BE(entry, 0x14, s.loopEnd);
    writeS16BE(entry, 0x2A, s.noteTranspose);
    writeU32BE(entry, 0x3C, entrySize); // totalLen includes header

    // PCM data at offset 0x40
    entry.set(s.pcmSigned, SAMPLE_HEADER_SIZE);

    sampleEntries.push({
      headerAndPcm: entry,
      offset: sampleOffsetTableSize + sampleDataSize,
    });
    sampleDataSize += entrySize;
  }

  const samplesLen = sampleOffsetTableSize + sampleDataSize;

  // ── Build position list ────────────────────────────────────────────────
  // Each position entry = 12 bytes: 6 channels × { uint8 trackNum, uint8 0 }
  const songLen = Math.min(256, song.songPositions.length);
  if (songLen === 0) {
    warnings.push('Song has no order list entries.');
  }
  const posListLen = songLen * 12;

  // ── Calculate total file size ──────────────────────────────────────────
  const totalSize = HEADER_SIZE + tracksLenPadded + samplesLen + posListLen;
  const output = new Uint8Array(totalSize);

  // ── Write header ──────────────────────────────────────────────────────
  writeStr(output, 0x00, song.name || 'Untitled', 16);
  writeU32BE(output, 0x10, tracksLenPadded);
  writeU32BE(output, 0x14, samplesLen);
  writeU32BE(output, 0x18, posListLen);
  writeU32BE(output, 0x1C, 0); // instrLen = 0 (no instruments section)
  writeU16BE(output, 0x20, 0); // skip
  writeU16BE(output, 0x22, 3); // version = 3 (SC 4.0)
  const speed = Math.max(1, Math.min(31, song.initialSpeed ?? 6));
  writeU16BE(output, 0x24, speed);
  // 0x26 - 0x3F: padding (already zero)

  // ── Write tracks section ──────────────────────────────────────────────
  const tracksBase = HEADER_SIZE; // 0x40

  // Track offset table: 256 × uint16
  // Only write offsets for tracks that are referenced
  for (let t = 0; t < MAX_TRACKS; t++) {
    if (t < trackDataList.length && t > 0) {
      // Track t exists — write its offset
      writeU16BE(output, tracksBase + t * 2, trackAbsOffsets[t]);
    }
    // else: offset = 0 (no track)
  }

  // Write track data
  for (let t = 0; t < trackDataList.length; t++) {
    const absOff = tracksBase + trackAbsOffsets[t];
    // 16-byte track name
    writeStr(output, absOff, trackDataList[t].name, TRACK_NAME_SIZE);
    // Event data
    output.set(trackDataList[t].events, absOff + TRACK_NAME_SIZE);
  }

  // If padding needed, write 0xFF so detection still finds 0xFFFF at end
  if (tracksPadding > 0) {
    output[tracksBase + tracksLenPadded - 1] = 0xFF;
  }

  // ── Write samples section ─────────────────────────────────────────────
  const samplesBase = tracksBase + tracksLenPadded;

  // Sample offset table: 256 × uint32
  // Initialize all offsets to 0
  // Write offsets for samples that exist
  let sampleIdx = 0;
  for (let i = 0; i < Math.min(MAX_SAMPLES, song.instruments.length); i++) {
    const s = sampleExports[i];
    if (!s) continue;
    const entry = sampleEntries[sampleIdx];
    writeU32BE(output, samplesBase + i * 4, entry.offset);
    sampleIdx++;
  }

  // Write sample data
  for (const entry of sampleEntries) {
    output.set(entry.headerAndPcm, samplesBase + entry.offset);
  }

  // ── Write position list ───────────────────────────────────────────────
  const posListBase = samplesBase + samplesLen;

  for (let p = 0; p < songLen; p++) {
    const songPatIdx = song.songPositions[p] ?? 0;
    const base = posListBase + p * 12;

    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const key = `${songPatIdx}:${ch}`;
      const trackIdx = trackMap.get(key) ?? 0;
      output[base + ch * 2] = trackIdx & 0xFF;
      output[base + ch * 2 + 1] = 0; // unused byte
    }
  }

  // ── Generate filename ─────────────────────────────────────────────────
  const baseName = (song.name || 'untitled')
    .replace(/\s*\[Sound Control\]\s*/i, '')
    .replace(/[^a-zA-Z0-9_.-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    || 'untitled';
  const filename = `${baseName}.sc`;

  return {
    data: new Blob([output], { type: 'application/octet-stream' }),
    filename,
    warnings,
  };
}
