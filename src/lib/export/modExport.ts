/**
 * MOD Export — converts a TrackerSong to ProTracker 31-sample .MOD ("M.K.").
 *
 * Produces a standard 1084-byte-header ProTracker module (20-byte title, 31×30-byte
 * sample headers, 1-byte songlength + 1-byte restart, 128-byte order table, "M.K." magic),
 * followed by 1024-byte patterns (64 rows × 4 channels × 4-byte cells) and concatenated
 * 8-bit signed PCM. It is the exact inverse of MODParser.parseMODFile:
 *   - a cell's own Amiga period while it still names its note (off-table and
 *     finetuned periods survive; an edited note's stale one does not), else the
 *     note's period in ProTracker naming
 *     (src/lib/amiga/periodNotes.ts: note 25 = C-2 = 428) - the naming every MOD path
 *     uses.
 *   - sample slots by instrument id (a song with empty slots keeps its gaps), with
 *     each sample's finetune and default volume.
 *   - MOD cell effTyp is the raw 0-F ProTracker effect nibble (MODParser assigns
 *     effTyp = rawEffect directly), so effTyp/eff round-trip verbatim.
 */

import type { TrackerSong } from '@engine/TrackerReplayer';
import type { InstrumentConfig, TrackerCell } from '@/types';
import { cellPeriod } from '@/lib/amiga/periodNotes';

export interface ModExportOptions {
  bakeSynths?: boolean;
  /** 4 (M.K., default), 6 (6CHN) or 8 (8CHN) channels. */
  channelCount?: 4 | 6 | 8;
  /** Title (20 characters); defaults to the song's name. */
  moduleName?: string;
}

const FORMAT_TAGS: Record<4 | 6 | 8, string> = { 4: 'M.K.', 6: '6CHN', 8: '8CHN' };

export interface ModExportResult {
  blob: Blob;
  filename: string;
  warnings: string[];
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
  const NUM_CHANNELS = options?.channelCount ?? 4;
  if (![4, 6, 8].includes(NUM_CHANNELS)) throw new Error(`MOD supports 4, 6 or 8 channels (got ${NUM_CHANNELS})`);
  const title = options?.moduleName ?? song.name ?? 'untitled';
  const importMetadata = song.patterns[0]?.importMetadata;

  // Automation curves become effect commands (MOD has no automation).
  let patterns = song.patterns;
  try {
    const { useAutomationStore } = await import('@stores/useAutomationStore');
    const curves = useAutomationStore.getState().curves;
    if (curves.length > 0) {
      const { bakeAutomationForExport } = await import('./AutomationBaker');
      const { FORMAT_LIMITS } = await import('@/lib/formatCompatibility');
      const baked = bakeAutomationForExport(song.patterns, curves, FORMAT_LIMITS.MOD);
      patterns = baked.patterns;
      if (baked.bakedCount > 0) warnings.push(`${baked.bakedCount} automation curve(s) baked into effect commands.`);
      if (baked.overflowRows > 0) warnings.push(`${baked.overflowRows} row(s) had no free effect slot - automation data lost on those rows.`);
      for (const w of baked.warnings) warnings.push(w);
    }
  } catch { /* automation store not available (headless) */ }
  const ROWS = 64;
  const MAX_SAMPLES = 31;

  // ── Samples: extract 8-bit signed PCM + header fields per instrument slot ────
  interface SampleSlot { name: string; pcm: Int8Array; finetune: number; volume: number; loopStart: number; loopLen: number; }
  const slots: SampleSlot[] = [];
  for (let i = 0; i < MAX_SAMPLES; i++) {
    // Slot i+1 is the instrument with that id - not the i-th in the list.
    const inst = song.instruments.find((x) => x.id === i + 1);
    // The sample as the import kept it (8-bit, lossless) wins over a decode of the WAV.
    const original = importMetadata?.originalSamples?.[i + 1];
    if (original && original.bitDepth === 8 && original.pcmData.byteLength > 0) {
      const pcm = new Int8Array(original.pcmData);
      const even = (pcm.length & 1) ? (() => { const p = new Int8Array(pcm.length + 1); p.set(pcm); return p; })() : pcm;
      slots.push({
        name: (original.name || inst?.name || '').slice(0, 22),
        pcm: even,
        finetune: original.finetune,
        volume: original.volume,
        loopStart: original.loopType === 'none' ? 0 : original.loopStart,
        loopLen: original.loopType === 'none' ? 0 : original.loopLength,
      });
      continue;
    }
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
    const defaultVolume = inst?.metadata?.modPlayback?.defaultVolume;
    if (typeof defaultVolume === 'number') {
      vol = Math.max(0, Math.min(64, Math.round(defaultVolume)));
    } else if (inst?.volume !== undefined) {
      vol = inst.volume <= -60 ? 0 : Math.round(Math.min(64, Math.max(0, ((inst.volume + 60) / 60) * 64)));
    }
    slots.push({
      name: (inst?.name ?? '').slice(0, 22),
      pcm: evenPcm,
      finetune: inst?.metadata?.modPlayback?.finetune ?? 0,
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
  patterns.forEach((pat, i) => {
    if ((pat?.length ?? 0) > ROWS) warnings.push(`Pattern ${i} has ${pat.length} rows but MOD holds 64; extra rows truncated.`);
  });
  if (song.numChannels > NUM_CHANNELS) warnings.push(`Exported as ${NUM_CHANNELS}-channel MOD; extra channels were dropped.`);

  // ── Size + allocate ─────────────────────────────────────────────────────────
  const HEADER = 1084;
  const patternBytes = numPatterns * ROWS * NUM_CHANNELS * 4;
  const pcmBytes = slots.reduce((s, sl) => s + sl.pcm.length, 0);
  const output = new Uint8Array(HEADER + patternBytes + pcmBytes);

  // ── Header ──────────────────────────────────────────────────────────────────
  writeStr(output, 0, title.slice(0, 20), 20);
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
  writeStr(output, 1080, FORMAT_TAGS[NUM_CHANNELS as 4 | 6 | 8], 4);

  // ── Patterns: 4-byte ProTracker cells (sample split across byte0/byte2) ──────
  let pos = HEADER;
  for (let p = 0; p < numPatterns; p++) {
    const pat = patterns[p];
    for (let row = 0; row < ROWS; row++) {
      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        const cell: TrackerCell | undefined = pat?.channels[ch]?.rows[row];
        const period = cellPeriod(cell);
        const sample = (cell?.instrument ?? 0) & 0x1F;
        let effect = (cell?.effTyp ?? 0) & 0x0F;
        let param = (cell?.eff ?? 0) & 0xFF;
        if (cell && (cell.effTyp ?? 0) > 0x0F) {
          warnings.push(`Effect ${cell.effTyp} has no MOD equivalent (row ${row}, channel ${ch + 1}); dropped.`);
          effect = 0; param = 0;
        }
        // MOD has no volume column: a set-volume (0x10-0x50) becomes Cxx when
        // the effect column is free; a note-off becomes C00.
        const vol = cell?.volume ?? 0;
        if (effect === 0 && param === 0) {
          if (cell?.note === 97) { effect = 0x0C; param = 0; }
          else if (vol >= 0x10 && vol <= 0x50) { effect = 0x0C; param = vol - 0x10; }
        }
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

  const baseName = title.replace(/[^a-zA-Z0-9_\-. ]/g, '').slice(0, 40) || 'untitled';
  return {
    blob: new Blob([output], { type: 'application/octet-stream' }),
    filename: `${baseName}.mod`,
    warnings,
  };
}
