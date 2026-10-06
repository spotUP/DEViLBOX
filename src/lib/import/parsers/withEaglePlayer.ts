/**
 * withEaglePlayer - a format whose sound comes from its own eagleplayer on
 * the Musashi host (EaglePlayerEngine; formats in
 * src/engine/eagleplayer/eaglePlayerFormats.ts).
 *
 * The grid comes from the format's native parser; a parser that finds no
 * notes (or refuses the file) leaves the grid to UADE's scan, as
 * withNativeThenUADE does (a placeholder grid must not pre-empt it, ledger
 * F6). Either way the song carries the module as `eaglePlayerFileData`, so
 * the EaglePlayer descriptor plays it - UADE builds a grid at most, it never
 * plays these formats.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { EAGLE_PLAYER_FORMATS } from '@/engine/eagleplayer/eaglePlayerFormats';
import { callUADE, countNotes, type FallbackContext } from './withFallback';

type NativeParse = (buffer: ArrayBuffer, name: string) => Promise<TrackerSong | null> | TrackerSong | null;

const UADE_SYNTHS = new Set(['UADESynth', 'UADEEditableSynth']);

/**
 * Hand `song` to EaglePlayerEngine: the module bytes and the player id ride
 * on it, UADE's playback fields come off, and instruments that would start
 * UADE (classic UADESynth / UADEEditableSynth) become plain samplers.
 */
export function playOnEaglePlayer(song: TrackerSong, formatId: string, module: ArrayBuffer, fileName: string): TrackerSong {
  if (!EAGLE_PLAYER_FORMATS[formatId]) throw new Error(`withEaglePlayer: unknown format ${formatId}`);
  song.eaglePlayerFileData = module.slice(0);
  song.eaglePlayerId = formatId;
  // The player opens the module (and its companions) by file name: the real
  // one, not the song's display name ('primemover 07 [Anders 0land]' left
  // suffix-named songs silent in the app, 2026-10-06).
  song.eaglePlayerFileName = fileName;
  delete song.uadeEditableFileData;
  delete song.uadeEditableFileName;
  for (const inst of song.instruments) {
    if (UADE_SYNTHS.has(inst.synthType)) inst.synthType = 'Sampler';
  }
  return song;
}

/**
 * `nativeParse` null: no native parser, the grid is UADE's scan.
 * `uadeFileName`: the name UADE's scan needs to pick the player (the Amiga
 * `<prefix>.<tune>` form, toUADEPrefixName); the native parser gets the file's
 * own name.
 */
export async function withEaglePlayer(
  formatId: string,
  ctx: FallbackContext,
  nativeParse: NativeParse | null,
  uadeFileName: string = ctx.originalFileName,
): Promise<TrackerSong> {
  let song: TrackerSong | null = null;
  try {
    song = nativeParse ? await nativeParse(ctx.buffer, ctx.originalFileName) : null;
  } catch (e) {
    console.warn(`[withEaglePlayer] ${formatId} parser refused ${ctx.originalFileName}: ${(e as Error).message}`);
  }
  if (!song || countNotes(song) === 0) {
    try {
      song = await callUADE({ ...ctx, originalFileName: uadeFileName });
    } catch (e) {
      // No UADE scan (headless, or UADE refused): an empty grid still plays.
      if (!song) throw e;
      console.warn(`[withEaglePlayer] ${formatId}: no UADE grid for ${ctx.originalFileName}: ${(e as Error).message}`);
    }
  }
  return playOnEaglePlayer(song, formatId, ctx.buffer, ctx.originalFileName);
}
