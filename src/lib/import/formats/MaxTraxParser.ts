/**
 * MaxTraxParser.ts — MaxTrax (MXTX) native import.
 *
 * MaxTrax is a MIDI-like event format (see maxtrax/maxtraxFormat.ts for the lossless codec).
 * UADE cannot play it in this build (ret=-1), so it's handled natively: this parser decodes
 * the scores into a QUANTIZED tracker-pattern view for display, and stores the raw file bytes
 * (uadeEditableFileData) so export round-trips byte-exactly via encodeMaxTrax (dispatched by
 * the MXTX magic in nativeExportRouter). No DEViLBOX playback yet — the event stream would
 * need a MaxTrax replayer.
 *
 * Score events (6-byte CookedEvent): command 0x00-0x7F = MIDI note (data = velocity<<... | chan,
 * startTime/stopTime in ticks); 0x80 tempo, 0xA0 special, 0xB0 CC, 0xC0 prog, 0xE0 bend, 0xFF end.
 */
import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, TrackerCell } from '@/types';
import { parseMaxTrax, isMaxTraxFormat, type MaxTraxEvent } from './maxtrax/maxtraxFormat';

const ROWS_PER_PATTERN = 64;
const MAX_CHANNELS = 8;
const TICKS_PER_ROW = 24; // display quantization only (export uses the raw event ticks)

export { isMaxTraxFormat };

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

export function parseMaxTraxFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const bytes = new Uint8Array(buffer);
  if (!isMaxTraxFormat(bytes)) throw new Error('Not a MaxTrax (MXTX) file');
  const data = parseMaxTrax(bytes);

  const baseName = (filename.split('/').pop() ?? filename).replace(/^mxtx\./i, '').replace(/\.mxtx$/i, '');

  // Use the first non-empty score for the display view.
  const score = data.scores.find((s) => s.events.some((e) => e.command < 0x80)) ?? data.scores[0] ?? { events: [] };
  const notes = score.events.filter((e) => e.command >= 1 && e.command < 0x80) as MaxTraxEvent[];

  // Determine channel count + total rows from quantized event times.
  let maxChannel = 0;
  let maxRow = 0;
  for (const ev of notes) {
    const ch = ev.data & 0x0f;
    if (ch > maxChannel) maxChannel = ch;
    const row = Math.floor(ev.startTime / TICKS_PER_ROW);
    if (row > maxRow) maxRow = row;
  }
  const numChannels = Math.min(MAX_CHANNELS, Math.max(1, maxChannel + 1));
  const numPatterns = Math.max(1, Math.ceil((maxRow + 1) / ROWS_PER_PATTERN));

  // Build empty patterns, then place notes at their quantized row/channel.
  const patterns = Array.from({ length: numPatterns }, (_, p) => ({
    id: `pattern-${p}`,
    name: `Score part ${p}`,
    length: ROWS_PER_PATTERN,
    channels: Array.from({ length: numChannels }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Voice ${ch + 1}`,
      muted: false, solo: false, collapsed: false,
      volume: 100, pan: ch % 2 === 0 ? -50 : 50,
      instrumentId: null, color: null,
      rows: Array.from({ length: ROWS_PER_PATTERN }, emptyCell),
    })),
  }));

  for (const ev of notes) {
    const absRow = Math.floor(ev.startTime / TICKS_PER_ROW);
    const patIdx = Math.floor(absRow / ROWS_PER_PATTERN);
    const row = absRow % ROWS_PER_PATTERN;
    const ch = Math.min(numChannels - 1, ev.data & 0x0f);
    const cell = patterns[patIdx]?.channels[ch]?.rows[row];
    if (cell && cell.note === 0) {
      cell.note = ev.command; // MIDI note number (display)
      cell.instrument = 1;
    }
  }

  const instruments: InstrumentConfig[] = Array.from({ length: 16 }, (_, i) => ({
    id: i + 1, name: `Patch ${i + 1}`, type: 'synth' as const, synthType: 'Synth' as const,
    effects: [], volume: 0, pan: 0,
  }) as InstrumentConfig);

  return {
    name: `${baseName} [MaxTrax]`,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions: Array.from({ length: numPatterns }, (_, i) => i),
    songLength: numPatterns,
    restartPosition: 0,
    numChannels,
    initialSpeed: 6,
    initialBPM: data.tempo || 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
  };
}
