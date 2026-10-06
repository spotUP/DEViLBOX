/**
 * Where an engine that can only run forward starts a grid row.
 *
 * Playback that begins at a row (Play from Cursor, row preview) has to begin
 * there in the engine that makes the sound. libopenmpt and the Furnace
 * sequencer take a start position (TrackerReplayer.play passes it). The
 * engines below run a format's real player, which knows no rows: they start
 * at a row by running silently from the song's first tick until the clock
 * the grid follows reaches the row's first tick (the worklets' 'seekToTick').
 * The clock and grid are the ones the playhead follow already uses, so a
 * seeked start and the playhead agree.
 *
 * Pure: no engine import (the registry and the keyboard ask it cold).
 */

import type { TrackerSong } from '../TrackerReplayer';
import { gridRowStartTick, playerGridRowStartTick, type TickGrid } from '@/lib/tracker/tickGridPosition';

/** The engine runs to `tick` of `clock` before it is heard. */
export interface RowSeekTarget { clock: 'player' | 'cia'; tick: number }

/** An engine instance that can start at a tick (UADEEngine, EaglePlayerEngine). */
export interface TickSeekable { seekToTick(tick: number, clock: 'player' | 'cia'): void }

export function isTickSeekable(instance: unknown): instance is TickSeekable {
  return typeof (instance as Partial<TickSeekable> | null)?.seekToTick === 'function';
}

/** The grid geometry the EaglePlayer's tick count maps onto (tickGridPosition). */
export function eaglePlayerGrid(song: Pick<TrackerSong, 'initialSpeed' | 'songPositions' | 'patterns' | 'restartPosition' | 'eaglePlayerTickGrid'>): TickGrid {
  return {
    // Where the parser measured it: the tick of row 0 and the pass length.
    ...song.eaglePlayerTickGrid,
    speed: song.initialSpeed || 6,
    songPositions: song.songPositions,
    patternLengths: song.patterns.map((p) => p.length),
    // The player loops its song; the grid goes round with it.
    loopFrom: song.restartPosition ?? 0,
  };
}

type SeekSong = Pick<TrackerSong, 'initialSpeed' | 'songPositions' | 'patterns' | 'restartPosition'
  | 'eaglePlayerTickGrid' | 'uadeFirstTick' | 'uadePlayerTickGrid'>;

/**
 * Why `engineKey` (a WASM_ENGINES key, playingEngineFor) cannot start at a
 * grid row for `song`, or null when it can (rowSeekTarget answers where).
 */
export function rowSeekUnsupportedReason(engineKey: string, song: SeekSong): string | null {
  if (engineKey === 'EaglePlayer') return null;
  if (engineKey === 'UADEEditable') {
    if (song.uadePlayerTickGrid === true || song.uadeFirstTick != null) return null;
    return 'UADE has no tick for row 0 of this song (its scan found no row clock), so no row maps to a tick';
  }
  if (engineKey === 'UADE classic') {
    return 'the opaque UADE player draws its grid from a fixed frames-per-row estimate, not from the player\'s clock';
  }
  return `the ${engineKey} engine has no way to start at a row (no seek in its worklet)`;
}

/** Where `engineKey` must run to so that (`songPos`, `row`) is the first row heard; null if it cannot. */
export function rowSeekTarget(engineKey: string, song: SeekSong, songPos: number, row: number): RowSeekTarget | null {
  if (rowSeekUnsupportedReason(engineKey, song) !== null) return null;
  if (engineKey === 'EaglePlayer') {
    return { clock: 'player', tick: gridRowStartTick(eaglePlayerGrid(song), songPos, row) };
  }
  const grid: TickGrid = {
    speed: song.initialSpeed || 6,
    songPositions: song.songPositions,
    patternLengths: song.patterns.map((p) => p.length),
  };
  if (song.uadePlayerTickGrid === true) {
    return { clock: 'player', tick: playerGridRowStartTick(grid, songPos, row) };
  }
  return { clock: 'cia', tick: gridRowStartTick({ ...grid, firstTick: song.uadeFirstTick ?? 0 }, songPos, row) };
}
