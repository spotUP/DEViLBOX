/**
 * MaxTraxParser.ts — MaxTrax (MXTX) native import.
 *
 * MaxTrax is a MIDI-like event format (see maxtrax/maxtraxFormat.ts for the lossless codec).
 * UADE cannot play it (ret=-1).  Audio is handled by the MaxTraxEngine WASM replayer, which
 * is activated whenever maxTraxFileData is present (NativeEngineRouting entry, formats:null).
 * The parser decodes scores into a tracker-pattern view using the lossless bijection
 * (deriveGrid), so note durations and polyphony are preserved on display.
 * maxTraxFileData is deliberately NOT uadeEditableFileData — that field routes to UADE.
 *
 * Score events (6-byte CookedEvent): command 0x00-0x7F = MIDI note (data = velocity<<... | chan,
 * startTime/stopTime in ticks); 0x80 tempo, 0xA0 special, 0xB0 CC, 0xC0 prog, 0xE0 bend, 0xFF end.
 * startTime is a DELTA (max.asm:1343-1348); stopTime on a note is a DURATION (max.asm:1390-1391).
 */
import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';
import { parseMaxTrax, isMaxTraxFormat, decodeMaxTraxSamples } from './maxtrax/maxtraxFormat';
import { deriveGrid } from '@/lib/maxtrax/maxtraxGrid';
import { createSamplerInstrument } from './AmigaUtils';

const ROWS_PER_PATTERN = 64;

export { isMaxTraxFormat };

function emptyCell() {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

export function parseMaxTraxFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const bytes = new Uint8Array(buffer);
  if (!isMaxTraxFormat(bytes)) throw new Error('Not a MaxTrax (MXTX) file');
  const data = parseMaxTrax(bytes);

  const baseName = (filename.split('/').pop() ?? filename).replace(/^mxtx\./i, '').replace(/\.mxtx$/i, '');

  // Use the first score that has real note events for the display view.
  const scoreIndex = data.scores.findIndex((s) => s.events.some((e) => e.command >= 1 && e.command < 0x80));
  const score = data.scores[scoreIndex >= 0 ? scoreIndex : 0] ?? { events: [] };

  // Derive the display grid from the lossless bijection. startTime values are DELTAS;
  // deriveGrid accumulates them into absolute ticks and assigns voice columns for polyphony.
  const TPR = 24;
  const grid = deriveGrid(score, TPR);
  const numChannels = Math.max(1, grid.columns.length);
  const numPatterns = Math.max(1, Math.ceil(grid.rowCount / ROWS_PER_PATTERN));

  // Build empty patterns.
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

  // Real instruments from the sample bank. Each MaxTrax sample becomes a Sampler
  // with its first-octave PCM. Built BEFORE placing notes so cells map to valid IDs.
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

  // MaxTraxSynth control instrument — gives NativeEngineRouting a handle to wire
  // the WASM engine. High ID (255) avoids collision with sample IDs (which start at 1).
  instruments.push({ id: 255, name: 'MaxTrax Engine', type: 'synth' as const, synthType: 'MaxTraxSynth' as const, effects: [], volume: 0, pan: 0 } as InstrumentConfig);
  const validIds = new Set(instruments.map((i) => i.id));
  const firstId = instruments[0].id;
  const patchToId = (patch: number): number => (validIds.has(patch + 1) ? patch + 1 : firstId);

  // Pre-compute the active patch (program) for each event index via a single linear pass.
  // Program change (0xC0) sets the patch for its channel; all later notes on that channel
  // see the new patch. The returned array is indexed by event index.
  const channelPatch = new Array(16).fill(0);
  const patchAtEvent: number[] = score.events.map((ev) => {
    const ch = ev.data & 0x0f;
    if (ev.command === 0xc0) channelPatch[ch] = ev.stopTime & 0xff;
    return channelPatch[ch];
  });

  // Place note-on and derived note-off cells from the grid.
  // Note: 97 is the tracker key-off sentinel (TrackerCell convention: note=97 means note off).
  for (const c of grid.noteCells) {
    const patIdx = Math.floor(c.row / ROWS_PER_PATTERN);
    const rowInPat = c.row % ROWS_PER_PATTERN;
    const cell = patterns[patIdx]?.channels[c.column]?.rows[rowInPat];
    if (!cell) continue;
    if (c.kind === 'noteOn') {
      if (cell.note === 0) {
        cell.note = c.pitch;
        cell.instrument = patchToId(patchAtEvent[c.eventIndex]);
        cell.volume = c.velocity;
      }
    } else { // noteOff
      // Don't overwrite a note-on that shares the same display row.
      if (cell.note === 0) {
        cell.note = 97; // key-off (TrackerCell: 0=empty, 1-96=notes, 97=note off)
      }
    }
  }

  const song = {
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
  } as TrackerSong;

  // Attach the parsed MaxTraxData so applyEditorMode can persist it as the edit authority.
  (song as unknown as { maxTraxData: typeof data }).maxTraxData = data;

  return song;
}
