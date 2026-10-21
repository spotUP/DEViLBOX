/**
 * OpenMPTEditBridge — PRIMARY edit path for libopenmpt formats (MOD/XM/IT/S3M).
 *
 * The OpenMPT soundlib (CSoundFile WASM) is the canonical document model: edits
 * flow into it directly, then a debounced hot-reload re-serializes the module
 * and feeds it to LibopenmptEngine for playback.
 *
 * Flow:
 *   User edit → TrackerStore (UI) + OpenMPTSoundlib (WASM CSoundFile)
 *               → debounced hot-reload (150ms) → LibopenmptEngine.hotReload(buf)
 *   On play  → flush() drains any pending hot-reload synchronously
 *
 * The soundlib stays loaded after import (parseWithOpenMPT doesn't destroy it).
 * Loaded via markLoaded() at the end of parseWithOpenMPT.
 */

import type { TrackerCell } from '@/types/tracker';
import type { InstrumentConfig, SampleConfig } from '@typedefs/instrument';
import type { SampleEdit } from '@/lib/song/sampleEdit';
import type { SaveFormat } from '@lib/import/wasm/OpenMPTSoundlib';
import { mapNoteToOpenMPT } from '@lib/import/wasm/OpenMPTConverter';
import { foldEffectColumnsForXM } from '@/lib/tracker/volumeColumn';
import { noteToMidi, xmNoteToToneJS } from '@/lib/xmConversions';
import { getNormalizedVolume, instrumentOffsetDb } from '@engine/factories/volumeNormalization';

let _dirty = false;
let _loaded = false;
let _format: SaveFormat = 'mod';
let _hotReloadTimer: ReturnType<typeof setTimeout> | null = null;
const HOT_RELOAD_DEBOUNCE_MS = 150;
/** True once any edit reached the module; cleared only when a new module is adopted. */
let _edited = false;
/**
 * The song buffers this module stands for: the bytes it was imported from or
 * built as, and every serialization of it. A song carrying one of them is this
 * module's song, so reloading it must keep the bridge (and its edits) active.
 */
let _owned = new WeakSet<ArrayBuffer>();
/** Store pattern id held in each module pattern slot; null until known. */
let _slotIds: string[] | null = null;
/**
 * Sample slots this bridge filled from an editor Sampler instrument (never an
 * imported sample), keyed by instrument id, with the sample source written
 * (the WAV bytes or the saved URL, see samplerSource).
 */
let _samplerSlots = new Map<number, ArrayBuffer | string>();
/**
 * The sample source and volume last looked at per instrument id, so an
 * unchanged instrument costs no module call and a volume change rewrites it.
 */
let _samplerSeen = new Map<number, { source: ArrayBuffer | string; volume: number | undefined }>();
/** Every module write runs on this chain, so a structural change and the cell edits after it land in order. */
let _queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(op: () => Promise<T>): Promise<T> {
  const run = _queue.then(op, op);
  _queue = run.catch(() => undefined);
  return run;
}

/** Debounced hot-reload: serialize the soundlib and send to LibopenmptEngine. */
function scheduleHotReload(): void {
  if (_hotReloadTimer) clearTimeout(_hotReloadTimer);
  _hotReloadTimer = setTimeout(async () => {
    _hotReloadTimer = null;
    if (!_loaded || !_dirty) return;
    try {
      const { LibopenmptEngine } = await import('@engine/libopenmpt/LibopenmptEngine');
      if (!LibopenmptEngine.hasInstance()) return;
      const osl = await import('@lib/import/wasm/OpenMPTSoundlib');
      const data = await enqueue(() => osl.saveModule(_format));
      if (data) {
        LibopenmptEngine.getInstance().hotReload(data);
        _dirty = false;
      }
    } catch {
      // Serialization or engine not available
    }
  }, HOT_RELOAD_DEBOUNCE_MS);
}

/** Map DEViLBOX volume byte → OpenMPT volcmd + vol */
function mapVolumeToOpenMPT(vol: number): { volcmd: number; volval: number } {
  if (vol === 0) return { volcmd: 0, volval: 0 };
  if (vol >= 0x10 && vol <= 0x50) return { volcmd: 1, volval: vol - 0x10 };
  if (vol >= 0x60 && vol <= 0x6F) return { volcmd: 3, volval: vol - 0x60 };
  if (vol >= 0x70 && vol <= 0x7F) return { volcmd: 4, volval: vol - 0x70 };
  if (vol >= 0x80 && vol <= 0x8F) return { volcmd: 5, volval: vol - 0x80 };
  if (vol >= 0x90 && vol <= 0x9F) return { volcmd: 6, volval: vol - 0x90 };
  if (vol >= 0xA0 && vol <= 0xAF) return { volcmd: 7, volval: vol - 0xA0 };
  if (vol >= 0xB0 && vol <= 0xBF) return { volcmd: 8, volval: vol - 0xB0 };
  if (vol >= 0xC0 && vol <= 0xCF) return { volcmd: 2, volval: (vol - 0xC0) << 2 };
  if (vol >= 0xF0 && vol <= 0xFF) return { volcmd: 11, volval: vol - 0xF0 };
  return { volcmd: 0, volval: 0 };
}

/** Map DEViLBOX/XM effTyp → OpenMPT CMD_* */
function mapEffectToOpenMPT(effTyp: number, eff: number): { cmd: number; param: number } {
  switch (effTyp) {
    case 0:  return eff === 0 ? { cmd: 0, param: 0 } : { cmd: 1, param: eff };
    case 1:  return { cmd: 2, param: eff };
    case 2:  return { cmd: 3, param: eff };
    case 3:  return { cmd: 4, param: eff };
    case 4:  return { cmd: 5, param: eff };
    case 5:  return { cmd: 6, param: eff };
    case 6:  return { cmd: 7, param: eff };
    case 7:  return { cmd: 8, param: eff };
    case 8:  return { cmd: 9, param: eff };
    case 9:  return { cmd: 10, param: eff };
    case 10: return { cmd: 11, param: eff };
    case 11: return { cmd: 12, param: eff };
    case 12: return { cmd: 13, param: eff };
    case 13: return { cmd: 14, param: eff };
    case 14: return { cmd: 19, param: eff };
    case 15: return eff < 0x20 ? { cmd: 16, param: eff } : { cmd: 17, param: eff };
    case 16: return { cmd: 23, param: eff };
    case 17: return { cmd: 24, param: eff };
    case 20: return { cmd: 25, param: eff };
    case 21: return { cmd: 30, param: eff };
    case 25: return { cmd: 29, param: eff };
    case 27: return { cmd: 15, param: eff };
    case 29: return { cmd: 18, param: eff };
    case 33: return { cmd: 28, param: eff };
    default: return { cmd: 0, param: 0 };
  }
}

type Soundlib = typeof import('@lib/import/wasm/OpenMPTSoundlib');

/** Write one TrackerCell into the soundlib pattern, in the bridge's current format. */
async function writeCell(
  osl: Soundlib,
  patternIndex: number,
  rowIndex: number,
  channelIndex: number,
  cell: TrackerCell,
): Promise<void> {
  const note = mapNoteToOpenMPT(cell.note, _format);
  let volume = cell.volume;

  let command: number;
  let param: number;

  if (cell.effTyp === osl.DSP_EFFECT_MARKER) {
    // Symphonie DSP effect — encode as MIDI macro (CMD_MIDI = 31)
    // effTyp2 = 0x50+type, eff = bufLen, eff2 = feedback
    const type     = (cell.effTyp2 - osl.DSP_EFFECT_MARKER) & 0x07;
    const bufLen   = cell.eff    & 0x7F;
    const feedback = cell.eff2   & 0x7F;
    const slot = await allocateDSPMacro(osl, type, bufLen, feedback);
    command = slot >= 0 ? 31 : 0;
    param   = slot >= 0 ? (0x80 | slot) : 0;
  } else {
    // An XM cell holds one command plus the volume column, so effect columns
    // 2-8 are folded into those two slots rather than silently ignored.
    const folded = foldEffectColumnsForXM(cell.volume, [
      { effTyp: cell.effTyp, eff: cell.eff },
      { effTyp: cell.effTyp2, eff: cell.eff2 },
      { effTyp: cell.effTyp3 ?? 0, eff: cell.eff3 ?? 0 },
      { effTyp: cell.effTyp4 ?? 0, eff: cell.eff4 ?? 0 },
      { effTyp: cell.effTyp5 ?? 0, eff: cell.eff5 ?? 0 },
      { effTyp: cell.effTyp6 ?? 0, eff: cell.eff6 ?? 0 },
      { effTyp: cell.effTyp7 ?? 0, eff: cell.eff7 ?? 0 },
      { effTyp: cell.effTyp8 ?? 0, eff: cell.eff8 ?? 0 },
    ]);
    volume = folded.volume;
    const fx = mapEffectToOpenMPT(folded.command.effTyp, folded.command.eff);
    command = fx.cmd;
    param   = fx.param;
  }
  const { volcmd, volval } = mapVolumeToOpenMPT(volume);

  await osl.setPatternCell(patternIndex, rowIndex, channelIndex, {
    note,
    instrument: cell.instrument,
    volcmd,
    vol: volval,
    command,
    param,
  });
}

/** Write every cell of one pattern into the soundlib. */
async function writePatternCells(
  osl: Soundlib,
  patternIndex: number,
  channels: { rows: TrackerCell[] }[],
): Promise<void> {
  for (let ch = 0; ch < channels.length; ch++) {
    const rows = channels[ch].rows;
    for (let row = 0; row < rows.length; row++) {
      await writeCell(osl, patternIndex, row, ch, rows[row]);
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Mark the bridge as active on a module that now holds the song: after a
 * parseWithOpenMPT import or after building one. `source` is the song buffer
 * the module stands for, `patternIds` the store pattern in each module slot.
 */
export function markLoaded(format: SaveFormat, source?: ArrayBuffer, patternIds?: string[]): void {
  _loaded = true;
  _dirty = false;
  _edited = false;
  _format = format;
  _owned = new WeakSet<ArrayBuffer>();
  if (source) _owned.add(source);
  _slotIds = patternIds ? [...patternIds] : null;
  _samplerSlots = new Map();
  _samplerSeen = new Map();
}

/** Whether `data` is a buffer this module stands for (see markLoaded). */
export function ownsSongData(data: ArrayBuffer | undefined | null): boolean {
  return _loaded && !!data && _owned.has(data);
}

/** Whether any edit reached the module since it was adopted. */
export function hasEdits(): boolean {
  return _edited;
}

/** Whether the soundlib module is loaded and the bridge is active. */
export function isActive(): boolean {
  return _loaded;
}

/** Whether edits have been made since the last serialization. */
export function isDirty(): boolean {
  return _dirty;
}

/** An edit reached the module: hot-reload it, and play it (not the import bytes) from now on. */
function markEdited(): void {
  _dirty = true;
  _edited = true;
  scheduleHotReload();
}

/** Mark the bridge as dirty (forces re-serialization on next play). */
export function markDirty(): void {
  _dirty = true;
}

/** Get the current format for serialization. */
export function getFormat(): SaveFormat {
  return _format;
}

/**
 * Find or allocate a MIDI macro slot for a Symphonie DSP echo event.
 * Returns the slot index (0-127), or -1 if all slots are full.
 */
async function allocateDSPMacro(
  osl: typeof import('@lib/import/wasm/OpenMPTSoundlib'),
  type: number,
  bufLen: number,
  feedback: number,
): Promise<number> {
  const target = osl.buildSymphonieDSPMacro(type, bufLen, feedback).toUpperCase();
  let firstFree = -1;
  for (let i = 0; i < 128; i++) {
    const str = await osl.getMidiMacroString(i);
    if (str.toUpperCase() === target) return i;
    if (firstFree === -1 && (!str || str === '')) firstFree = i;
  }
  if (firstFree !== -1) {
    await osl.setMidiMacroString(firstFree, target);
    return firstFree;
  }
  return -1;
}

/**
 * Forward a cell edit to the OpenMPT soundlib WASM module.
 * Called from useTrackerStore.setCell() after the store mutation.
 */
export async function syncCellEdit(
  patternIndex: number,
  channelIndex: number,
  rowIndex: number,
  _cellUpdate: Partial<TrackerCell>,
  fullCell: TrackerCell,
): Promise<void> {
  if (!_loaded) return;

  const osl = await import('@lib/import/wasm/OpenMPTSoundlib');

  await enqueue(() => writeCell(osl, patternIndex, rowIndex, channelIndex, fullCell));

  markEdited();
}

/**
 * Forward a cell clear to the OpenMPT soundlib WASM module.
 */
export async function syncCellClear(
  patternIndex: number,
  channelIndex: number,
  rowIndex: number,
): Promise<void> {
  if (!_loaded) return;

  const osl = await import('@lib/import/wasm/OpenMPTSoundlib');
  await enqueue(() => osl.setPatternCell(patternIndex, rowIndex, channelIndex, {
    note: 0,
    instrument: 0,
    volcmd: 0,
    vol: 0,
    command: 0,
    param: 0,
  }));

  markEdited();
}

/**
 * Sync an entire pattern from the TrackerStore to the OpenMPT soundlib.
 * Used after bulk operations (clearChannel, clearPattern, transpose, etc.)
 * that modify many cells at once.
 */
export async function syncFullPattern(
  patternIndex: number,
  channels: { rows: TrackerCell[] }[],
): Promise<void> {
  if (!_loaded) return;

  const osl = await import('@lib/import/wasm/OpenMPTSoundlib');

  await enqueue(() => writePatternCells(osl, patternIndex, channels));

  markEdited();
}

/** The song shape the module must match. */
export interface SongStructure {
  numChannels: number;
  patterns: { id?: string; length: number; channels: { rows: TrackerCell[] }[] }[];
  songPositions: number[];
  /** The song's instruments; createModuleForSong writes the Sampler ones' samples. */
  instruments?: readonly InstrumentConfig[];
}

/**
 * Give the module the song's channel count, pattern slots, pattern lengths and
 * order list. Returns the pattern indices whose cells the module no longer
 * holds: new slots, resized patterns, slots now holding another store pattern,
 * and every pattern when the channel count changed. `changed` also covers
 * order list and slot count edits, which leave every cell in place.
 */
async function shapeModule(osl: Soundlib, song: SongStructure): Promise<{ stale: number[]; changed: boolean }> {
  const stale = new Set<number>();
  let changed = false;
  const numCh = song.numChannels || song.patterns[0]?.channels.length || 4;
  if ((await osl.getNumChannels()) !== numCh) {
    await osl.setNumChannels(numCh);
    song.patterns.forEach((_, i) => stale.add(i));
  }
  const numPat = Math.max(song.patterns.length, 1);
  if ((await osl.getNumPatterns()) > numPat) {
    await osl.setNumPatterns(numPat);
    changed = true;
  }
  for (let i = 0; i < song.patterns.length; i++) {
    const rows = song.patterns[i].length;
    const have = await osl.getPatternNumRows(i);
    if (have === 0) {
      await osl.addPattern(rows);
      stale.add(i);
    } else if (have !== rows) {
      await osl.resizePattern(i, rows);
      stale.add(i);
    }
    const id = song.patterns[i].id;
    if (_slotIds && id !== undefined && _slotIds[i] !== id) stale.add(i);
  }
  for (let i = 0; i < song.songPositions.length; i++) {
    if ((await osl.getOrderPattern(i)) !== song.songPositions[i]) {
      await osl.setOrderPattern(i, song.songPositions[i]);
      changed = true;
    }
  }
  if ((await osl.getNumOrders()) !== song.songPositions.length) {
    await osl.setNumOrders(song.songPositions.length);
    changed = true;
  }
  return { stale: [...stale], changed: changed || stale.size > 0 };
}

function patternIdsOf(song: SongStructure): string[] | null {
  return song.patterns.every(p => p.id !== undefined) ? song.patterns.map(p => p.id as string) : null;
}

/**
 * Bring the module's structure to the song after the store added, removed,
 * cloned, reordered or resized patterns, changed the channel count or edited
 * the order list, then rewrite the cells of every pattern that changed and
 * hot-reload. Returns whether the module changed.
 */
export async function syncSongStructure(song: SongStructure): Promise<boolean> {
  if (!_loaded) return false;
  // A song sharing no pattern with the module is another song being loaded
  // (the store takes its patterns before the replayer releases this module).
  if (_slotIds && song.patterns.length > 0 && !song.patterns.some(p => p.id !== undefined && _slotIds!.includes(p.id))) return false;
  const osl = await import('@lib/import/wasm/OpenMPTSoundlib');
  const changed = await enqueue(async () => {
    const { stale, changed: shaped } = await shapeModule(osl, song);
    for (const p of stale) await writePatternCells(osl, p, song.patterns[p].channels);
    _slotIds = patternIdsOf(song);
    return shaped;
  });
  if (changed) markEdited();
  return changed;
}

/**
 * Build the soundlib module for a song that was never imported (a fresh song
 * or one made in the editor), and activate the bridge on it. Called at play
 * time, so a concurrent import cannot be clobbered by an async init.
 *
 * The module gets the song's channel count, pattern lengths, order list AND
 * every cell. libopenmpt plays every command (Bxx, Dxx, Fxx, E6x, EEx, sample
 * effects) from this module while the hybrid route plays the synth notes, so
 * a module without the cells plays none of the song's commands.
 *
 * Returns the serialized XM, or null when creation failed or `cancelled()`
 * turned true while it was being built.
 */
/**
 * The sample pre-amp at which libopenmpt plays a sample at volume 64 at the
 * sample's own level (measured: 48, the soundlib default and OpenMPT's level
 * for an imported XM, plays it at 0.187 of it; the mixer gain is linear in
 * the pre-amp). OpenMPT's NormalSamplePreAmp for MixLevels::Compatible.
 */
const UNITY_SAMPLE_PREAMP = 256;

/**
 * The sample pre-amp of a module DEViLBOX builds from its own song. On a key a
 * Sampler plays through ToneEngine at getNormalizedVolume: its volume (at most
 * 0 dB) plus the Sampler's normalization offset. The pattern plays the same
 * note through libopenmpt, which ignores the instrument volume, so at the
 * default pre-amp the pattern sounded 12.5 dB under the key (reported
 * 2026-10-21: "very silent"). This pre-amp carries the offset, the headroom a
 * Sampler at full volume needs over its sample; samplerSampleGain carries the
 * volume in the sample itself, so a pattern note at volume 64 plays at the
 * key's level. The XM keeps the pre-amp in its SPA. chunk, so the saved song
 * plays the same. Imported modules keep their own level.
 */
export function builtSongSamplePreAmp(): number {
  return Math.round(UNITY_SAMPLE_PREAMP * Math.pow(10, instrumentOffsetDb('Sampler') / 20));
}

/**
 * The gain a Sampler's PCM is written at in the play-time module: its key level
 * (getNormalizedVolume) relative to the headroom builtSongSamplePreAmp holds.
 * XM samples have no volume that multiplies the volume column, so the level
 * lives in the PCM. At most 1, where the sample is written as it is.
 */
export function samplerSampleGain(inst: Pick<InstrumentConfig, 'synthType' | 'volume'>): number {
  const db = getNormalizedVolume(inst.synthType, inst.volume) - instrumentOffsetDb('Sampler');
  return Math.min(1, Math.pow(10, db / 20));
}

export async function createModuleForSong(
  song: SongStructure,
  cancelled: () => boolean,
): Promise<ArrayBuffer | null> {
  const osl = await import('@lib/import/wasm/OpenMPTSoundlib');
  return enqueue(async () => {
    await osl.destroyModule();
    const numPat = song.patterns.length || 1;
    if (!(await osl.createNewModule(1 /* XM */, song.numChannels || 4, numPat))) return null;
    markLoaded('xm');
    await osl.setSamplePreAmp(builtSongSamplePreAmp());
    // createNewModule makes 64-row patterns and order [0, 1, 2, ...]; the song's
    // lengths (an 8-row song would play 56 rows of silence) and order list
    // ([0, 1, 0, 2]) differ, so the module takes the song's shape first.
    await shapeModule(osl, song);
    for (let p = 0; p < song.patterns.length; p++) {
      await writePatternCells(osl, p, song.patterns[p].channels);
    }
    _slotIds = patternIdsOf(song);
    for (const inst of song.instruments ?? []) await writeSamplerInstrument(osl, inst);
    if (cancelled()) return null;
    const data = await osl.saveModule('xm');
    if (data) _owned.add(data);
    return data;
  });
}

/**
 * The c5Speed at which libopenmpt plays a Sampler's WAV at the pitch ToneEngine
 * gives it. ToneEngine plays the WAV at its own rate on `baseNote` (C4 when
 * unset) and scales by the note distance; libopenmpt plays c5Speed on OpenMPT
 * note 61. The cell reaching note 61 comes from mapNoteToOpenMPT and its
 * ToneEngine name from xmNoteToToneJS, so the two routes agree by construction.
 */
export function samplerC5Speed(wavRate: number, baseNote: string | undefined, cellFormat: SaveFormat): number {
  const cellAt61 = 61 - (mapNoteToOpenMPT(1, cellFormat) - 1);
  const semitones = noteToMidi(xmNoteToToneJS(cellAt61)) - noteToMidi(baseNote || 'C4');
  return Math.round(wavRate * Math.pow(2, semitones / 12));
}

/**
 * Write a Sampler instrument's WAV into the current module's sample slot at its
 * id, at the pitch ToneEngine gives it (samplerC5Speed), growing the sample list
 * when the slot is past the end. A module with XM/IT instruments refuses (its
 * instrument ids are not sample slots). Shared by the play-time module and the
 * exporter so both carry the same sample; `gain` scales the PCM (the play-time
 * module passes samplerSampleGain). Returns whether the slot was written.
 */
export async function writeSamplerSlot(osl: Soundlib, inst: InstrumentConfig, cellFormat: SaveFormat, gain = 1): Promise<boolean> {
  if (inst.synthType !== 'Sampler' && inst.synthType !== 'Player') return false;
  const sample = inst.sample;
  if (!sample || !samplerSource(sample)) return false;
  if (!(await osl.ensureSampleSlot(inst.id))) return false;
  const bytes = await samplerWavBytes(sample);
  if (!bytes) return false;
  const wav = await samplerPcm(bytes);
  if (!wav || wav.pcm.length === 0) return false;
  const pcm = Int16Array.from(wav.pcm, (x) => Math.max(-32768, Math.min(32767, Math.round(x * gain * 32767))));
  if (!(await osl.setSampleData(inst.id, pcm, samplerC5Speed(wav.sampleRate, sample.baseNote, cellFormat), false))) return false;
  // The loop is written after the data: replacing the data leaves the old loop flags on the new length.
  const type = sample.loop ? (sample.loopType === 'pingpong' ? 'pingpong' : 'forward') : 'off';
  await osl.setSampleLoop(inst.id, sample.loopStart || 0, sample.loopEnd || 0, type);
  return true;
}

/**
 * What a Sampler instrument's sample data comes from: the WAV bytes the editor
 * decoded, or the URL the sample was saved with. A restored song carries only
 * the URL (snapshotSong drops the bytes), so the URL is the persisted truth and
 * the bytes a cache of it. Null when the instrument has neither.
 */
function samplerSource(sample: SampleConfig): ArrayBuffer | string | null {
  if (sample.audioBuffer && sample.audioBuffer.byteLength > 0) return sample.audioBuffer;
  return sample.url ? sample.url : null;
}

/**
 * The mono PCM of a Sampler sample's bytes. A WAV is read as it is; any other
 * file the keyboard plays (an MP3, OGG or FLAC dropped on the app) is decoded by
 * ToneEngine's decoder, the one the keyboard plays it through, at that decoder's
 * rate. Null when neither can read the bytes.
 */
async function samplerPcm(bytes: Uint8Array): Promise<{ pcm: Float32Array; sampleRate: number } | null> {
  const { decodeWavBytes } = await import('@/bridge/analysis/SampleSpectrum');
  const wav = decodeWavBytes(bytes);
  if (wav) return wav;
  try {
    const { getToneEngine } = await import('@engine/ToneEngine');
    const buffer = await getToneEngine().decodeAudioData(bytes);
    const pcm = new Float32Array(buffer.length);
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const channel = buffer.getChannelData(c);
      for (let i = 0; i < pcm.length; i++) pcm[i] += channel[i] / buffer.numberOfChannels;
    }
    return { pcm, sampleRate: buffer.sampleRate };
  } catch {
    return null;
  }
}

/** The WAV bytes of a Sampler sample, read from the URL when the bytes are not in memory. */
async function samplerWavBytes(sample: SampleConfig): Promise<Uint8Array | null> {
  const source = samplerSource(sample);
  if (source === null) return null;
  if (typeof source !== 'string') return new Uint8Array(source);
  try {
    const response = await fetch(source);
    return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

/**
 * writeSamplerSlot for the play-time module, which leaves a slot holding an
 * imported sample alone and remembers which slots it filled. Runs inside enqueue.
 * Returns whether the module changed.
 */
async function writeSamplerInstrument(osl: Soundlib, inst: InstrumentConfig): Promise<boolean> {
  if (inst.synthType !== 'Sampler' && inst.synthType !== 'Player') return false;
  const source = inst.sample ? samplerSource(inst.sample) : null;
  if (source === null) return false;
  _samplerSeen.set(inst.id, { source, volume: inst.volume });
  if (!_samplerSlots.has(inst.id)) {
    if (!(await osl.ensureSampleSlot(inst.id))) return false;
    const held = await osl.getSampleInfo(inst.id);
    if ((held?.length ?? 0) > 0) return false;
  }
  if (!(await writeSamplerSlot(osl, inst, _format, samplerSampleGain(inst)))) return false;
  _samplerSlots.set(inst.id, source);
  return true;
}

/**
 * Give the module the samples of Sampler instruments added or reloaded in the
 * editor after it was built: libopenmpt plays Sampler notes (ToneEngine leaves
 * them to it), so an instrument missing from the module is silent in the song.
 * Instruments whose sample source is unchanged since the last call cost nothing.
 * Returns whether the module changed (then it hot-reloads).
 */
export async function syncSamplerInstruments(instruments: readonly InstrumentConfig[]): Promise<boolean> {
  if (!_loaded) return false;
  const pending = instruments.filter((inst) =>
    (inst.synthType === 'Sampler' || inst.synthType === 'Player')
    && !!inst.sample && samplerSource(inst.sample) !== null
    && !sameSeen(_samplerSeen.get(inst.id), samplerSource(inst.sample), inst.volume));
  if (pending.length === 0) return false;
  const osl = await import('@lib/import/wasm/OpenMPTSoundlib');
  const changed = await enqueue(async () => {
    let any = false;
    for (const inst of pending) if (await writeSamplerInstrument(osl, inst)) any = true;
    return any;
  });
  if (changed) markEdited();
  return changed;
}

function sameSeen(seen: { source: ArrayBuffer | string; volume: number | undefined } | undefined,
  source: ArrayBuffer | string | null, volume: number | undefined): boolean {
  return !!seen && seen.source === source && seen.volume === volume;
}

/**
 * Forward a sample edit (loop moved, data replaced) to the OpenMPT soundlib, then hot-reload the
 * player: it holds its own copy of the module, so the instrument store's edit reaches it only here.
 * In a MOD / S3M the sample IS the instrument, so the sample number is the instrument id (as
 * parseWithOpenMPT numbered them).
 */
export async function syncSampleEdit(instrumentId: number, sample: SampleConfig, edit: SampleEdit): Promise<void> {
  if (!_loaded) return;
  const osl = await import('@lib/import/wasm/OpenMPTSoundlib');
  if (_samplerSlots.has(instrumentId)) {
    // A slot this bridge filled from a Sampler: write it the same way again, at the Sampler's pitch.
    const config = { id: instrumentId, synthType: 'Sampler', sample, volume: _samplerSeen.get(instrumentId)?.volume } as InstrumentConfig;
    if (await enqueue(() => writeSamplerInstrument(osl, config))) markEdited();
    return;
  }
  if (edit.data && sample.audioBuffer && sample.audioBuffer.byteLength > 0) {
    const { decodeWavBytes } = await import('@/bridge/analysis/SampleSpectrum');
    const wav = decodeWavBytes(new Uint8Array(sample.audioBuffer));
    if (wav && wav.pcm.length > 0) {
      const pcm = Int16Array.from(wav.pcm, (x) => Math.max(-32768, Math.min(32767, Math.round(x * 32767))));
      await osl.setSampleData(instrumentId, pcm, sample.sampleRate || 8363, false);
    }
  }
  // The loop is written after the data: replacing the data leaves the old loop flags on the new length.
  const type = sample.loop ? (sample.loopType === 'pingpong' ? 'pingpong' : 'forward') : 'off';
  await osl.setSampleLoop(instrumentId, sample.loopStart || 0, sample.loopEnd || 0, type);
  _dirty = true;
  scheduleHotReload();
}

/**
 * Serialize the current soundlib state to a binary module buffer.
 * Used to reload into LibopenmptEngine after edits.
 * Clears the dirty flag on success.
 */
export async function serialize(): Promise<ArrayBuffer | null> {
  if (!_loaded) return null;

  // Cancel any pending debounced hot-reload — the caller is taking ownership
  // of the serialized buffer (typically the play() path doing a fresh loadTune).
  if (_hotReloadTimer) {
    clearTimeout(_hotReloadTimer);
    _hotReloadTimer = null;
  }

  const osl = await import('@lib/import/wasm/OpenMPTSoundlib');
  const result = await enqueue(() => osl.saveModule(_format));
  if (result) {
    _dirty = false;
    _owned.add(result);
  }
  return result;
}

/**
 * Flush any pending hot-reload immediately.
 * Cancels the debounce timer and forces a serialization + LibopenmptEngine.hotReload
 * if the bridge is dirty. Call this from the play() path so the engine never plays
 * a stale buffer because edits were still queued.
 */
export async function flush(): Promise<void> {
  if (_hotReloadTimer) {
    clearTimeout(_hotReloadTimer);
    _hotReloadTimer = null;
  }
  if (!_loaded || !_dirty) return;
  try {
    const { LibopenmptEngine } = await import('@engine/libopenmpt/LibopenmptEngine');
    if (!LibopenmptEngine.hasInstance()) return;
    const osl = await import('@lib/import/wasm/OpenMPTSoundlib');
    const data = await enqueue(() => osl.saveModule(_format));
    if (data) {
      LibopenmptEngine.getInstance().hotReload(data);
      _dirty = false;
    }
  } catch {
    // Serialization or engine not available
  }
}

/** Reset the bridge state (on song unload / new import). */
export function reset(): void {
  if (_hotReloadTimer) {
    clearTimeout(_hotReloadTimer);
    _hotReloadTimer = null;
  }
  _loaded = false;
  _dirty = false;
  _edited = false;
  _format = 'mod';
  _owned = new WeakSet<ArrayBuffer>();
  _slotIds = null;
  _samplerSlots = new Map();
  _samplerSeen = new Map();
}
