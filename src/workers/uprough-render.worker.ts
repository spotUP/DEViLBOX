/** Renders an Up Rough song off the main thread. The per-section cache lives here (plan 2026-10-20 O6k2). */
import { runRenderJob, type SectionEvent } from '@/lib/uprough/songRenderJob';
import type { SectionMixCache } from '@engine/uprough/songRenderCache';
import type { BarEvents } from '@/lib/uprough/barEvents';
import type { RenderSongOptions } from '@engine/uprough/songRender';
import type { R2Event } from '@engine/uprough/r2Events';

export interface RenderRequest { id: number; events: BarEvents; options: RenderSongOptions }
export type RenderResponse =
  | { type: 'section'; id: number; event: SectionEvent }
  | { type: 'done'; id: number; mix: Float64Array }
  /** An R2 render event (spec 3.4). Distinguished by `kind`, so the audio messages keep their shape. */
  | { kind: 'r2'; id: number; event: R2Event }
  | { type: 'error'; id: number; message: string };

const cache: SectionMixCache = new Map();

self.onmessage = (e: MessageEvent<RenderRequest>) => {
  const { id, events, options } = e.data;
  try {
    const post = (m: RenderResponse): void => (self as unknown as Worker).postMessage(m);
    // `done` is held back: the audio message goes first, so the UI has the audio when it sees `done`. An error posts neither.
    let doneEvent: R2Event | null = null;
    const mix = runRenderJob(events, options, cache, (event) => post({ type: 'section', id, event }),
      (event) => { if (event.type === 'done') doneEvent = event; else post({ kind: 'r2', id, event }); });
    (self as unknown as Worker).postMessage({ type: 'done', id, mix } satisfies RenderResponse, [mix.buffer]);
    if (doneEvent) post({ kind: 'r2', id, event: doneEvent });
  } catch (err) {
    (self as unknown as Worker).postMessage({ type: 'error', id, message: err instanceof Error ? err.message : String(err) } satisfies RenderResponse);
  }
};
