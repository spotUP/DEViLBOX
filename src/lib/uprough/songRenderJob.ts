/**
 * One render job (plan 2026-10-20 O6k2): renderSongCached plus one R2a `section` event per section
 * ({seq, type:'section', section, name, bars, cached}, plus sectionCount for a progress bar).
 * The worker and the in-process backend both run this, so the cache semantics are the same.
 */
import { renderSongCached, type SectionMixCache } from '@engine/uprough/songRenderCache';
import type { RenderSongOptions } from '@engine/uprough/songRender';
import type { OnEvent } from '@engine/uprough/r2Events';
import type { BarEvents } from './barEvents';

export interface SectionEvent {
  seq: number; type: 'section'; section: number; name: string; bars: number; cached: boolean; sectionCount: number;
}

/** A pre-master section mix (R2f-33): `start` is its first sample in the joined song (sections join by plain concatenation). */
export interface PartialMix { section: number; start: number; mix: Float64Array }

/** `onEvent` (optional) receives the R2 render events of the same job; the progress `emit` is unchanged. */
export function runRenderJob(
  events: BarEvents, options: RenderSongOptions, cache: SectionMixCache, emit: (e: SectionEvent) => void, onEvent?: OnEvent,
  /** Receives each section's pre-master mix as it lands (the cache's own array: copy before keeping or transferring). */
  onPartial?: (p: PartialMix) => void,
): Float64Array {
  let seq = 0;
  let start = 0;
  return renderSongCached(events, onEvent ? { ...options, onEvent } : options, cache, (i, cached) => {
    const s = events.sections[i]!;
    emit({ seq: seq++, type: 'section', section: i, name: String(s.header.name ?? ''), bars: s.drums.length, cached, sectionCount: events.sections.length });
  }, onPartial ? (section, mix) => { onPartial({ section, start, mix }); start += mix.length; } : undefined);
}
