/**
 * A per-section cache over renderSong (plan 2026-10-20 O6k1). A section's pre-texture mix depends only on the inputs of
 * renderSectionMix: the section's content (its bars, arrangement row and melody window), its starting bseed, the
 * song-wide params (seed keys the drum bank; rate, style, stem, section) and the render options. The key is the JSON of
 * exactly those, so an edit re-renders its section only, and one that changes a section's bar count shifts the bseed of
 * every later section and misses there. No hash: the key string is exact, so a collision cannot return another section's audio.
 * joinSections, applyTexture and masterBus always rerun (they are whole-song).
 */
import type { BarEvents } from '@/lib/uprough/barEvents';
import { beginRender, finishSong, renderSectionMix, sectionSeeds, type RenderSongOptions } from './songRender';

export type SectionMixCache = Map<string, Float64Array | null>;

/** The renderSectionMix inputs of section `index`, as one string. */
export function sectionKey(events: BarEvents, index: number, bseed: number, options: RenderSongOptions): string {
  const { masterRev, masterRevMix, onEvent, bankSeen, ...sectionOptions } = options;
  void masterRev; void masterRevMix; // finishSong's inputs, not the section's
  void onEvent; void bankSeen; // the event listener never changes a section's audio
  return JSON.stringify([
    events.sections[index], events.arrangement[index], events.melody_windows ? events.melody_windows[index] : null,
    events.params, bseed, sectionOptions,
  ]);
}

/** renderSong, rendering only the sections whose key misses `cache`. The cache only grows; the caller clears it. */
export function renderSongCached(
  events: BarEvents, options: RenderSongOptions, cache: SectionMixCache,
  /** Called once per section, in order, after its mix is known (`cached` = it came from the cache). */
  onSection?: (index: number, cached: boolean) => void,
  /**
   * Called right after `onSection` with the section's PRE-master mix (no join, no texture, no master bus: its level
   * differs from the final). Cached sections included; bar-less (null) sections are skipped, as the join skips them.
   * The array is the cache's own: a caller that keeps or transfers it copies it. Never changes the returned mix.
   */
  onSectionMix?: (index: number, mix: Float64Array) => void,
): Float64Array {
  const seeds = sectionSeeds(events);
  const keys = events.sections.map((_, i) => sectionKey(events, i, seeds[i]!, options));
  const ctx = beginRender(events, options);
  const mixes = events.sections.map((_, i) => {
    const key = keys[i]!;
    const cached = cache.has(key);
    if (cached) {
      ctx.em?.emit({ type: 'section', section: i, name: String(events.arrangement[i]![0]), bars: events.sections[i]!.drums.length, cached: true });
    } else {
      cache.set(key, renderSectionMix(events, i, seeds[i]!, options, ctx));
    }
    onSection?.(i, cached);
    const mix = cache.get(key)!;
    if (mix) onSectionMix?.(i, mix);
    return mix;
  });
  return finishSong(mixes, events, options, ctx);
}
