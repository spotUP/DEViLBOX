/** Renders an Up Rough song off the main thread. The per-section cache lives here (plan 2026-10-20 O6k2). */
import { runRenderJob, type SectionEvent } from '@/lib/uprough/songRenderJob';
import type { SectionMixCache } from '@engine/uprough/songRenderCache';
import type { BarEvents } from '@/lib/uprough/barEvents';
import type { RenderSongOptions } from '@engine/uprough/songRender';

export interface RenderRequest { id: number; events: BarEvents; options: RenderSongOptions }
export type RenderResponse =
  | { type: 'section'; id: number; event: SectionEvent }
  | { type: 'done'; id: number; mix: Float64Array }
  | { type: 'error'; id: number; message: string };

const cache: SectionMixCache = new Map();

self.onmessage = (e: MessageEvent<RenderRequest>) => {
  const { id, events, options } = e.data;
  try {
    const mix = runRenderJob(events, options, cache, (event) => (self as unknown as Worker).postMessage({ type: 'section', id, event } satisfies RenderResponse));
    (self as unknown as Worker).postMessage({ type: 'done', id, mix } satisfies RenderResponse, [mix.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ type: 'error', id, message: err instanceof Error ? err.message : String(err) } satisfies RenderResponse);
  }
};
