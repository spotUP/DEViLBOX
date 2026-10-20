/**
 * A per-section cache over renderSong (plan 2026-10-20 O6k1). A section's pre-texture mix depends only on the inputs of
 * renderSectionMix: the section's content (its bars, arrangement row and melody window), its starting bseed, the
 * song-wide params (seed keys the drum bank; rate, style, stem, section) and the render options. The key is the JSON of
 * exactly those, so an edit re-renders its section only, and one that changes a section's bar count shifts the bseed of
 * every later section and misses there. No hash: the key string is exact, so a collision cannot return another section's audio.
 * joinSections, applyTexture and masterBus always rerun (they are whole-song).
 */
import type { BarEvents } from '@/lib/uprough/barEvents';
import { finishSong, renderSectionMix, sectionSeeds, type RenderSongOptions } from './songRender';

export type SectionMixCache = Map<string, Float64Array | null>;

/** The renderSectionMix inputs of section `index`, as one string. */
export function sectionKey(events: BarEvents, index: number, bseed: number, options: RenderSongOptions): string {
  const { masterRev, masterRevMix, ...sectionOptions } = options;
  void masterRev; void masterRevMix; // finishSong's inputs, not the section's
  return JSON.stringify([
    events.sections[index], events.arrangement[index], events.melody_windows ? events.melody_windows[index] : null,
    events.params, bseed, sectionOptions,
  ]);
}

/** renderSong, rendering only the sections whose key misses `cache`. The cache only grows; the caller clears it. */
export function renderSongCached(events: BarEvents, options: RenderSongOptions, cache: SectionMixCache): Float64Array {
  const seeds = sectionSeeds(events);
  const keys = events.sections.map((_, i) => sectionKey(events, i, seeds[i]!, options));
  const mixes = events.sections.map((_, i) => {
    const key = keys[i]!;
    if (!cache.has(key)) cache.set(key, renderSectionMix(events, i, seeds[i]!, options));
    return cache.get(key)!;
  });
  return finishSong(mixes, events, options);
}
