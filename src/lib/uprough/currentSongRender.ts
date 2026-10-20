/**
 * The song the tracker holds right now, ready for the ported renderer (plan 2026-10-20 O6k2).
 * meta + patterns + instruments go through the export path (exportUpRoughSong -> songToSongFile), then the same
 * reader the reference tests use (songFileToBarEvents + songRenderOptions). Nothing is re-implemented here.
 */
import { useTrackerStore } from '@stores/useTrackerStore';
import type { BarEvents } from './barEvents';
import { songFileToBarEvents } from './barEvents';
import { parseSongFile } from './songFile';
import { songRenderOptions, type RenderSongOptions } from '@engine/uprough/songRender';

export interface CurrentSong {
  events: BarEvents;
  options: RenderSongOptions;
  /** events.params.rate */
  rate: number;
  /** song.bpm (the render's tempo, not the transport's) */
  bpm: number;
}

/** The loaded Up Rough song as renderSongCached inputs. Throws (by the export path's own message) without one. */
export function buildCurrentSong(): CurrentSong {
  const doc = parseSongFile(useTrackerStore.getState().exportUpRoughSong());
  const events = songFileToBarEvents(doc);
  return { events, options: songRenderOptions(doc), rate: events.params.rate as number, bpm: doc.song.bpm as number };
}

/** Samples of one grid row: the host's stepSamp = trunc(rate * 60 / (bpm * 4)). */
export function stepSamples(rate: number, bpm: number): number {
  return Math.trunc((rate * 60) / (bpm * 4));
}

/**
 * Sample of the rendered mix at which (order index, row) starts. rowsBefore is the row count of every pattern the
 * order lists before it; with 16-row patterns that is the (orderIndex * 16 + row) * stepSamp of the port map.
 */
export function startSample(patternLengths: readonly number[], order: readonly number[], orderIndex: number, row: number, rate: number, bpm: number): number {
  let rows = row;
  for (let i = 0; i < orderIndex; i++) rows += patternLengths[order[i]!] ?? 0;
  return rows * stepSamples(rate, bpm);
}
