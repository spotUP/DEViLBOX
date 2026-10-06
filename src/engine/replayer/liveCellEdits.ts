/**
 * Grid cell edits reach the engine that plays the song.
 *
 * Every grid mutation in useTrackerStore (set, clear, and every bulk edit:
 * paste, cut, transpose, insert/delete row, block ops ...) hands its changed
 * cells to `sendCellEditsToEngine`. The engine is the one the registry starts
 * for the song (`WASM_ENGINES`, first descriptor whose file data the song
 * carries), so the edit goes where the sound comes from:
 *
 *   - a registry engine with `gridCellEdits` takes each cell through its
 *     setCell(pattern, row, channel, note, instrument, effTyp, eff, volume);
 *   - an eagleplayer song whose format re-encodes its whole module from
 *     grid edits (eaglePlayerModuleEdits: MIDI Loriciel) gets a new module;
 *   - a Fred Editor song (FredReplayer2) re-encodes its module and the
 *     replayer swaps it in where it plays (fredModuleEdits);
 *   - otherwise a song with a fixed chip-RAM layout takes it through
 *     writeCellToChipRam (UADE chip RAM, the Ron Klaren replayer, TFMX bytes).
 *
 * Before this, only setCell knew the native replayers (a list of format-store
 * keys copied from the registry); clearCell and the bulk edits wrote UADE chip
 * RAM only, so a cleared or pasted cell on a DSS or Face The Music song was
 * never heard.
 */

import type { TrackerSong } from '../TrackerReplayer';
import type { TrackerCell, Pattern } from '@/types/tracker';
import { takeRestoredEdits } from '@/lib/song/gridBaseline';
import { WASM_ENGINES, shouldActivate, type NativeEngineDescriptor } from './wasmEngineRegistry';

export interface LiveCellEdit {
  pattern: number;
  row: number;
  channel: number;
  cell: TrackerCell;
}

/** The setCell shape every `gridCellEdits` engine implements, in the grid's terms. */
interface GridCellEngine {
  setCell(pattern: number, row: number, channel: number, note: number, instrument: number, effTyp: number, eff: number, volume: number): void;
}

/** The registry descriptor that plays `song` (what startNativeEngines starts), or null. */
export function playingDescriptor(song: TrackerSong): NativeEngineDescriptor | null {
  return WASM_ENGINES.find((d) => shouldActivate(d, song)) ?? null;
}

/** Hand edited cells to the engine playing `song`. Safe no-op when nothing editable plays. */
export async function sendCellEditsToEngine(
  song: TrackerSong | null | undefined,
  edits: readonly LiveCellEdit[],
): Promise<void> {
  if (!song || edits.length === 0) return;
  const desc = playingDescriptor(song);

  // Fred Editor: a grid cell is a line of a pattern; the edit re-encodes the module.
  if (desc?.key === 'FredReplayer2') {
    const { applyFredModuleEdits } = await import('../fred-replayer/fredModuleEdits');
    await applyFredModuleEdits(song, edits);
    return;
  }

  if (desc?.gridCellEdits) {
    const Engine = desc.staticRef ?? (desc.dynamicResolver ? await desc.dynamicResolver() : null);
    if (!Engine) return;
    if (!Engine.hasInstance()) {
      for (const { pattern, row, channel, cell } of edits) Engine.patchModuleCell?.(pattern, row, channel, cell.note ?? 0, cell.instrument ?? 0);
      return;
    }
    const engine = Engine.getInstance() as unknown as GridCellEngine;
    for (const { pattern, row, channel, cell } of edits) {
      engine.setCell(
        pattern, row, channel,
        cell.note ?? 0, cell.instrument ?? 0,
        cell.effTyp ?? 0, cell.eff ?? 0,
        cell.volume ?? 0,
      );
    }
    return;
  }

  // An eagleplayer format whose grid is a reading of the module (MIDI
  // Loriciel: the player's schedule of a MIDI file) re-encodes the module.
  if (desc?.key === 'EaglePlayer' && song.eaglePlayerId) {
    const { hasModuleEncoder, applyEaglePlayerModuleEdits } = await import('../eagleplayer/eaglePlayerModuleEdits');
    if (hasModuleEncoder(song)) {
      await applyEaglePlayerModuleEdits(song, edits);
      return;
    }
  }

  if (song.uadePatternLayout) {
    const { writeCellToChipRam } = await import('../uade/writeCellToChipRam');
    await Promise.all(edits.map(({ pattern, row, channel, cell }) =>
      writeCellToChipRam(song, pattern, row, channel, cell)));
  }
}

/**
 * After a restore: send the user's edited cells (those that differ from the
 * decoded baseline) through the same path an interactive edit takes. Called
 * once the engine has loaded the module; a no-op unless a restore is pending.
 */
export async function replayRestoredEdits(song: TrackerSong): Promise<void> {
  const edits = takeRestoredEdits(song.patterns);
  if (edits.length === 0) return;
  console.log(`[restore] sending ${edits.length} edited cell(s) to the engine`);
  await sendCellEditsToEngine(song, edits);
}

function sameCell(a: TrackerCell, b: TrackerCell): boolean {
  if (a === b) return true;
  const ka = Object.keys(a) as (keyof TrackerCell)[];
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => a[k] === b[k]);
}

/**
 * The cells of `after` that differ from `before` (every cell when there is no
 * `before`). A bulk edit sends only what it changed, so an engine whose cell
 * write is lossy is never handed cells the user did not touch.
 */
export function changedCells(patternIndex: number, after: Pattern, before?: Pattern): LiveCellEdit[] {
  const edits: LiveCellEdit[] = [];
  after.channels.forEach((ch, c) => {
    const prev = before?.channels[c]?.rows;
    ch.rows.forEach((cell, r) => {
      const old = prev?.[r];
      if (!old || !sameCell(old, cell)) edits.push({ pattern: patternIndex, row: r, channel: c, cell });
    });
  });
  return edits;
}
