/**
 * MOD Export — converts a TrackerSong to ProTracker 31-sample .MOD ("M.K.").
 *
 * Produces a standard 1084-byte-header ProTracker module (20-byte title, 31×30-byte
 * sample headers, 1-byte songlength + 1-byte restart, 128-byte order table, "M.K." magic),
 * followed by 1024-byte patterns (64 rows × 4 channels × 4-byte cells) and concatenated
 * 8-bit signed PCM. It is the exact inverse of MODParser.parseMODFile:
 *   - note index → Amiga period uses MODParser's XM octave convention (period 856 = XM
 *     note 37 = C-3), matching MODEncoder/decodeMODCell. The 48-entry table spans the
 *     periods the parser can emit (1712 = XM note 25 = C-2 .. 113 = XM note 72 = B-5),
 *     so period = PERIODS[note - 25].
 *   - MOD cell effTyp is the raw 0-F ProTracker effect nibble (MODParser assigns
 *     effTyp = rawEffect directly), so effTyp/eff round-trip verbatim.
 */

import type { TrackerSong } from '@engine/TrackerReplayer';
import type { InstrumentConfig, TrackerCell } from '@/types';

export interface ModExportOptions {
  bakeSynths?: boolean;
}

export interface ModExportResult {
  blob: Blob;
  filename: string;
  warnings: string[];
}

// MODParser's period table in XM octave labels, C-2 (XM note 25) .. B-5 (XM note 72).
// period = PERIODS[note - 25], matching MODParser.periodToNote (856 = C-3 = XM note 37).
const PERIODS = [
  1712, 1616, 1525, 1440, 1357, 1281, 1209, 1141, 1077, 1017, 960, 907, // C-2..B-2
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,           // C-3..B-3
  428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,           // C-4..B-4
  214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,           // C-5..B-5
];

function noteToPeriod(note: number): number {
  if (note <= 0 || note >= 97) return 0; // 0 = empty, 97 = note-cut (no MOD encoding)
  const idx = note - 25;
  return idx >= 0 && idx < PERIODS.length ? PERIODS[idx] : 0;
}

/** Decode an instrument's stored 16-bit WAV back to 8-bit signed PCM (MOD sample format). */
function extractPCM8(inst: InstrumentConfig | undefined): Int8Array {
  const buf = inst?.sample?.audioBuffer;
  if (!buf || buf.byteLength < 44) return new Int8Array(0);
  const view = new DataView(buf);
  const dataLen = view.getUint32(40, true);
  const frames = Math.floor(dataLen / 2);
  const out = new Int8Array(frames);
  for (let i = 0; i < frames; i++) out[i] = view.getInt16(44 + i * 2, true) >> 8;
  return out;
}

function writeStr(buf: Uint8Array, off: number, str: string, len: number): void {
  for (let i = 0; i < len; i++) buf[off + i] = i < str.length ? str.charCodeAt(i) & 0xFF : 0;
}
function writeU16BE(buf: Uint8Array, off: number, val: number): void {
  buf[off] = (val >> 8) & 0xFF;
  buf[off + 1] = val & 0xFF;
}

export async function exportSongToMOD(
  song: TrackerSong,
  options?: ModExportOptions,
): Promise<ModExportResult> {
  const warnings: string[] = [];
  const NUM_CHANNELS = 4;
  const ROWS = 64;
  const MAX_SAMPLES = 31;

  // ── Samples: extract 8-bit signed PCM + header fields per instrument slot ────
  interface SampleSlot { name: string; pcm: Int8Array; finetune: number; volume: number; loopStart: number; loopLen: number; }
  const slots: SampleSlot[] = [];
  for (let i = 0; i < MAX_SAMPLES; i++) {
    const inst = song.instruments[i];
    const pcm = extractPCM8(inst);
    if (inst && pcm.length === 0 && options?.bakeSynths && inst.type !== 'sample') {
      warnings.push(`Instrument ${i + 1} "${inst.name ?? ''}" is a synth without baked PCM; exported silent.`);
    }
    // MOD sample data is word-aligned; pad odd-length PCM by one byte.
    const evenPcm = (pcm.length & 1) ? (() => { const p = new Int8Array(pcm.length + 1); p.set(pcm); return p; })() : pcm;
    const loopStartBytes = inst?.sample?.loopStart ?? 0;
    const loopEndBytes = inst?.sample?.loopEnd ?? 0;
    const loopLenBytes = loopEndBytes > loopStartBytes ? loopEndBytes - loopStartBytes : 0;
    // MOD volume is 0-64; instrument volume is dB. Default to full for real samples.
    let vol = 64;
    if (inst?.volume !== undefined) {
      vol = inst.volume <= -60 ? 0 : Math.round(Math.min(64, Math.max(0, ((inst.volume + 60) / 60) * 64)));
    }
    slots.push({
      name: (inst?.name ?? '').slice(0, 22),
      pcm: evenPcm,
      finetune: 0,
      volume: evenPcm.length > 0 ? vol : 0,
      loopStart: loopStartBytes,
      loopLen: loopLenBytes,
    });
  }

  // ── Order table + pattern count ─────────────────────────────────────────────
  const order = song.songPositions.slice(0, 128).map((p) => p & 0xFF);
  const songLength = order.length;
  let maxOrder = 0;
  for (const p of order) if (p > maxOrder) maxOrder = p;
  const numPatterns = Math.max(song.patterns.length, maxOrder + 1);
  if (song.songPositions.length > 128) warnings.push(`Song has ${song.songPositions.length} positions; truncated to 128.`);
  if (song.numChannels > NUM_CHANNELS) warnings.push(`ProTracker MOD is 4-channel; extra channels were dropped.`);

  // ── Size + allocate ─────────────────────────────────────────────────────────
  const HEADER = 1084;
  const patternBytes = numPatterns * ROWS * NUM_CHANNELS * 4;
  const pcmBytes = slots.reduce((s, sl) => s + sl.pcm.length, 0);
  const output = new Uint8Array(HEADER + patternBytes + pcmBytes);

  // ── Header ──────────────────────────────────────────────────────────────────
  writeStr(output, 0, (song.name ?? 'untitled').slice(0, 20), 20);
  for (let i = 0; i < MAX_SAMPLES; i++) {
    const base = 20 + i * 30;
    const s = slots[i];
    writeStr(output, base, s.name, 22);
    writeU16BE(output, base + 22, Math.floor(s.pcm.length / 2)); // length in words
    output[base + 24] = s.finetune & 0x0F;
    output[base + 25] = s.volume & 0xFF;
    writeU16BE(output, base + 26, Math.floor(s.loopStart / 2));
    writeU16BE(output, base + 28, s.loopLen > 0 ? Math.floor(s.loopLen / 2) : 1); // 1 = no loop
  }
  output[950] = songLength & 0xFF;
  output[951] = 127; // restart position (standard)
  for (let i = 0; i < 128; i++) output[952 + i] = i < order.length ? order[i] : 0;
  writeStr(output, 1080, 'M.K.', 4);

  // ── Patterns: 4-byte ProTracker cells (sample split across byte0/byte2) ──────
  let pos = HEADER;
  for (let p = 0; p < numPatterns; p++) {
    const pat = song.patterns[p];
    for (let row = 0; row < ROWS; row++) {
      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        const cell: TrackerCell | undefined = pat?.channels[ch]?.rows[row];
        const period = noteToPeriod(cell?.note ?? 0);
        const sample = (cell?.instrument ?? 0) & 0x1F;
        const effect = (cell?.effTyp ?? 0) & 0x0F;
        const param = (cell?.eff ?? 0) & 0xFF;
        output[pos] = (sample & 0xF0) | ((period >> 8) & 0x0F);
        output[pos + 1] = period & 0xFF;
        output[pos + 2] = ((sample & 0x0F) << 4) | effect;
        output[pos + 3] = param;
        pos += 4;
      }
    }
  }

  // ── Sample PCM (8-bit signed) ───────────────────────────────────────────────
  for (const s of slots) {
    if (s.pcm.length > 0) {
      output.set(new Uint8Array(s.pcm.buffer, s.pcm.byteOffset, s.pcm.length), pos);
      pos += s.pcm.length;
    }
  }

  const baseName = (song.name ?? 'untitled').replace(/[^a-zA-Z0-9_\-. ]/g, '').slice(0, 40) || 'untitled';
  return {
    blob: new Blob([output], { type: 'application/octet-stream' }),
    filename: `${baseName}.mod`,
    warnings,
  };
}
