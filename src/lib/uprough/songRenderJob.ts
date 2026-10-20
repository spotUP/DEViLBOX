/**
 * One render job (plan 2026-10-20 O6k2): renderSongCached plus one R2a `section` event per section
 * ({seq, type:'section', section, name, bars, cached}, plus sectionCount for a progress bar).
 * The worker and the in-process backend both run this, so the cache semantics are the same.
 */
import { renderSongCached, type SectionMixCache } from '@engine/uprough/songRenderCache';
import type { RenderSongOptions } from '@engine/uprough/songRender';
import type { BarEvents } from './barEvents';

export interface SectionEvent {
  seq: number; type: 'section'; section: number; name: string; bars: number; cached: boolean; sectionCount: number;
}

export function runRenderJob(events: BarEvents, options: RenderSongOptions, cache: SectionMixCache, emit: (e: SectionEvent) => void): Float64Array {
  let seq = 0;
  return renderSongCached(events, options, cache, (i, cached) => {
    const s = events.sections[i]!;
    emit({ seq: seq++, type: 'section', section: i, name: String(s.header.name ?? ''), bars: s.drums.length, cached, sectionCount: events.sections.length });
  });
}
