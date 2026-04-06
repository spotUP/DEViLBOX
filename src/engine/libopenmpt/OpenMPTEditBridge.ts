/**
 * OpenMPTEditBridge — Coordinates edits between TrackerStore, OpenMPT Soundlib,
 * and LibopenmptEngine so that pattern edits are reflected in playback.
 *
 * Flow:
 *   User edit → TrackerStore (UI) + OpenMPTSoundlib (WASM CSoundFile)
 *   On play → if dirty, serialize from soundlib → reload into LibopenmptEngine
 *
 * The soundlib stays loaded after import (parseWithOpenMPT doesn't destroy it).
 * This bridge tracks whether edits have been made since the last serialization.
 */

import type { TrackerCell } from '@/types/tracker';
import type { SaveFormat } from '@lib/import/wasm/OpenMPTSoundlib';

let _dirty = false;
let _loaded = false;
let _format: SaveFormat = 'mod';
let _hotReloadTimer: ReturnType<typeof setTimeout> | null = null;
const HOT_RELOAD_DEBOUNCE_MS = 150;

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
      const data = await osl.saveModule(_format);
      if (data) {
        LibopenmptEngine.getInstance().hotReload(data);
        _dirty = false;
      }
    } catch {
      // Serialization or engine not available
    }
  }, HOT_RELOAD_DEBOUNCE_MS);
}

/** Map DEViLBOX note → OpenMPT note value */
function mapNoteToOpenMPT(note: number): number {
  if (note === 0) return 0;
  if (note === 97) return 255;    // Note-off → NOTE_KEYOFF
  if (note >= 1 && note <= 96) return note;
  return 0;
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Mark the bridge as active after a successful parseWithOpenMPT import. */
export function markLoaded(format: SaveFormat): void {
  _loaded = true;
  _dirty = false;
  _format = format;
}

/** Whether the soundlib module is loaded and the bridge is active. */
export function isActive(): boolean {
  return _loaded;
}

/** Whether edits have been made since the last serialization. */
export function isDirty(): boolean {
  return _dirty;
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

  const note = mapNoteToOpenMPT(fullCell.note);
  const { volcmd, volval } = mapVolumeToOpenMPT(fullCell.volume);

  let cmdFinal: number;
  let paramFinal: number;

  if (fullCell.effTyp === osl.DSP_EFFECT_MARKER) {
    // Symphonie DSP effect — encode as MIDI macro (CMD_MIDI = 31)
    // effTyp2 = 0x50+type, eff = bufLen, eff2 = feedback
    const type     = (fullCell.effTyp2 - osl.DSP_EFFECT_MARKER) & 0x07;
    const bufLen   = fullCell.eff    & 0x7F;
    const feedback = fullCell.eff2   & 0x7F;
    const slot = await allocateDSPMacro(osl, type, bufLen, feedback);
    cmdFinal   = slot >= 0 ? 31 : 0;
    paramFinal = slot >= 0 ? (0x80 | slot) : 0;
  } else {
    const fx = mapEffectToOpenMPT(fullCell.effTyp, fullCell.eff);
    cmdFinal   = fx.cmd;
    paramFinal = fx.param;
  }

  await osl.setPatternCell(patternIndex, rowIndex, channelIndex, {
    note,
    instrument: fullCell.instrument,
    volcmd,
    vol: volval,
    command: cmdFinal,
    param: paramFinal,
  });

  _dirty = true;
  scheduleHotReload();
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
  await osl.setPatternCell(patternIndex, rowIndex, channelIndex, {
    note: 0,
    instrument: 0,
    volcmd: 0,
    vol: 0,
    command: 0,
    param: 0,
  });

  _dirty = true;
  scheduleHotReload();
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

  for (let ch = 0; ch < channels.length; ch++) {
    const rows = channels[ch].rows;
    for (let row = 0; row < rows.length; row++) {
      const cell = rows[row];
      const note = mapNoteToOpenMPT(cell.note);
      const { volcmd, volval } = mapVolumeToOpenMPT(cell.volume);
      const fx = mapEffectToOpenMPT(cell.effTyp, cell.eff);
      await osl.setPatternCell(patternIndex, row, ch, {
        note,
        instrument: cell.instrument,
        volcmd,
        vol: volval,
        command: fx.cmd,
        param: fx.param,
      });
    }
  }

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

  const osl = await import('@lib/import/wasm/OpenMPTSoundlib');
  const result = await osl.saveModule(_format);
  if (result) {
    _dirty = false;
  }
  return result;
}

/** Reset the bridge state (on song unload / new import). */
export function reset(): void {
  _loaded = false;
  _dirty = false;
  _format = 'mod';
}
