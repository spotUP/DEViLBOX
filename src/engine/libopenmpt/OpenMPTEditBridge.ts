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

/** Get the current format for serialization. */
export function getFormat(): SaveFormat {
  return _format;
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
  const fx = mapEffectToOpenMPT(fullCell.effTyp, fullCell.eff);

  await osl.setPatternCell(patternIndex, rowIndex, channelIndex, {
    note,
    instrument: fullCell.instrument,
    volcmd,
    vol: volval,
    command: fx.cmd,
    param: fx.param,
  });

  _dirty = true;
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
