/**
 * MaxTraxParser.ts — MaxTrax (MXTX) native import.
 *
 * MaxTrax is a MIDI-like event format (see maxtrax/maxtraxFormat.ts for the lossless codec).
 * UADE cannot play it (ret=-1).  Audio is handled by the MaxTraxEngine WASM replayer, which
 * is activated whenever maxTraxFileData is present (NativeEngineRouting entry, formats:null).
 * The parser also decodes scores into a quantized tracker-pattern view with Sampler
 * instruments so the pattern editor has something to display.
 * maxTraxFileData is deliberately NOT uadeEditableFileData — that field routes to UADE.
 *
 * Score events (6-byte CookedEvent): command 0x00-0x7F = MIDI note (data = velocity<<... | chan,
 * startTime/stopTime in ticks); 0x80 tempo, 0xA0 special, 0xB0 CC, 0xC0 prog, 0xE0 bend, 0xFF end.
 */
import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, TrackerCell } from '@/types';
import { parseMaxTrax, isMaxTraxFormat, decodeMaxTraxSamples, type MaxTraxEvent } from './maxtrax/maxtraxFormat';
import { createSamplerInstrument } from './AmigaUtils';

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
    // MOD (Amiga period) note math — without this, playback falls back to 'XM'
    // which treats note > 96 as key-off and silences most MaxTrax MIDI notes.
    importMetadata: {
      sourceFormat: 'MOD' as const, sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: numChannels, originalPatternCount: numPatterns,
      originalInstrumentCount: 0,
    },
  }));

  // Real instruments from the sample bank (was: 16 identical placeholders → every note
  // sounded the same). Each MaxTrax sample becomes a Sampler with its first-octave PCM.
  // Built BEFORE placing notes so cells can be mapped to instruments that actually exist:
  // sample Numbers can be sparse (e.g. 1,9,10,11,12 with no 0), and a MaxTrax patch is the
  // sample Number, so a note that plays before any program change (default patch 0) must
  // fall back to a real sample instead of referencing a non-existent instrument (silent).
  const samples = decodeMaxTraxSamples(data);
  const instruments: InstrumentConfig[] = [];
  for (const smp of samples) {
    const id = smp.number + 1;
    const loopStart = smp.attackLen;
    const loopEnd = smp.sustainLen > 0 ? smp.attackLen + smp.sustainLen : 0;
    instruments.push(createSamplerInstrument(
      id, `Sample ${smp.number}`, smp.pcm,
      Math.min(64, Math.max(1, smp.volume >> 2)), // MaxTrax vol 0-256ish → 0-64
      8287, // nominal Amiga C-3 rate; MaxTrax repitches per note
      loopStart, loopEnd,
    ));
  }
  // Fallback so the bank is never empty.
  if (instruments.length === 0) {
    instruments.push({ id: 1, name: 'Sample 0', type: 'synth' as const, synthType: 'Synth' as const, effects: [], volume: 0, pan: 0 } as InstrumentConfig);
  }

  // MaxTraxSynth control instrument appended at end — gives NativeEngineRouting a handle to wire
  // the WASM engine. High ID (255) avoids collision with sample IDs (which start at 1).
  instruments.push({ id: 255, name: 'MaxTrax Engine', type: 'synth' as const, synthType: 'MaxTraxSynth' as const, effects: [], volume: 0, pan: 0 } as InstrumentConfig);
  const validIds = new Set(instruments.map((i) => i.id));
  const firstId = instruments[0].id;
  const patchToId = (patch: number): number => (validIds.has(patch + 1) ? patch + 1 : firstId);

  // Walk events in order, tracking each channel's current program (0xC0) so notes get their
  // real patch, and place notes on the quantized grid.
  const channelPatch = new Array(16).fill(0);
  for (const ev of score.events) {
    const ch = ev.data & 0x0f;
    if (ev.command === 0xc0) { channelPatch[ch] = ev.stopTime & 0xff; continue; } // program change
    if (ev.command < 1 || ev.command >= 0x80) continue; // not a note
    const absRow = Math.floor(ev.startTime / TICKS_PER_ROW);
    const patIdx = Math.floor(absRow / ROWS_PER_PATTERN);
    const row = absRow % ROWS_PER_PATTERN;
    const cIdx = Math.min(numChannels - 1, ch);
    const cell = patterns[patIdx]?.channels[cIdx]?.rows[row];
    if (cell && cell.note === 0) {
      cell.note = ev.command;                    // MIDI note number
      cell.instrument = patchToId(channelPatch[ch]); // patch (=sample Number) → existing id
    }
  }

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
    // Raw bytes for lossless export (dispatched on MXTX magic in nativeExportRouter)
    // and for the WASM replayer (MaxTraxEngine) which drives all audio.
    // Deliberately NOT uadeEditableFileData: UADE cannot play MaxTrax (ret=-1).
    maxTraxFileData: buffer.slice(0) as ArrayBuffer,
    maxTraxFileName: filename,
  };
}
