/**
 * On-demand whole-song render of the loaded Up Rough song, for explicit export paths and the R2 event log.
 * Nothing renders in the background: generated songs play live through the softsynth instruments.
 * - renderUpRoughSong(): builds the current doc, asks the backend (a Worker in the app) for the mix.
 */
import { useUpRoughRenderStore } from '@stores/useUpRoughRenderStore';
import type { RenderSongOptions } from '@engine/uprough/songRender';
import type { BarEvents } from './barEvents';
import { buildCurrentSong } from './currentSongRender';
import type { SectionEvent } from './songRenderJob';
import type { R2Event } from '@engine/uprough/r2Events';
import { useUpRoughR2Store } from '@stores/useUpRoughR2Store';

export interface RenderBackend {
  render(
    events: BarEvents, options: RenderSongOptions, onSection: (e: SectionEvent) => void, onR2?: (e: R2Event) => void,
  ): Promise<Float64Array>;
}
export interface RenderedSong { mix: Float64Array; rate: number; bpm: number; version: number }

/** The app backend: one Worker, one request at a time (the service serialises). */
function workerBackend(): RenderBackend {
  let worker: Worker | null = null;
  let nextId = 0;
  return {
    async render(events, options, onSection, onR2) {
      if (!worker) {
        const { default: Factory } = await import('@/workers/uprough-render.worker.ts?worker');
        worker = new Factory();
      }
      const w = worker;
      const id = nextId++;
      return new Promise<Float64Array>((resolve, reject) => {
        w.onmessage = (e: MessageEvent<import('@/workers/uprough-render.worker').RenderResponse>) => {
          const m = e.data;
          if (m.id !== id) return;
          if ('kind' in m) onR2?.(m.event);
          else if (m.type === 'partial') return;
          else if (m.type === 'section') onSection(m.event);
          else if (m.type === 'done') resolve(m.mix);
          else reject(new Error(m.message));
        };
        w.onerror = (err) => reject(new Error(err.message));
        w.postMessage({ id, events, options });
      });
    },
  };
}

let backend: RenderBackend | null = null;
let current: RenderedSong | null = null;
let inFlight: Promise<RenderedSong> | null = null;
let rerun = false;
/** Bumped by every reset: events of a render started before it are dropped (a cancelled render posts no more events). */
let epoch = 0;

export function setRenderBackendForTests(b: RenderBackend | null): void { backend = b; resetUpRoughSong(); }
export function currentRenderedSong(): RenderedSong | null { return current; }

export function resetUpRoughSong(): void {
  current = null; inFlight = null; rerun = false; epoch++;
  useUpRoughRenderStore.getState().set({ status: 'idle', sectionsDone: 0, sectionCount: 0, error: null });
}

async function renderOnce(): Promise<RenderedSong> {
  const store = useUpRoughRenderStore.getState();
  const mine = epoch;
  store.set({ status: 'rendering', sectionsDone: 0, sectionCount: 0, error: null });
  useUpRoughR2Store.getState().begin();
  try {
    const song = buildCurrentSong();
    const mix = await (backend ??= workerBackend()).render(song.events, song.options, (e) => {
      useUpRoughRenderStore.getState().set({ sectionsDone: e.section + 1, sectionCount: e.sectionCount });
    }, (event) => { if (epoch === mine) useUpRoughR2Store.getState().append(event); });
    const out: RenderedSong = { mix, rate: song.rate, bpm: song.bpm, version: useUpRoughRenderStore.getState().version + 1 };
    current = out;
    useUpRoughRenderStore.getState().set({ status: 'ready', version: out.version });
    return out;
  } catch (err) {
    useUpRoughRenderStore.getState().set({ status: 'error', error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}

/** Render now (or join the render in flight; an edit that arrived meanwhile queues exactly one more). */
export function renderUpRoughSong(): Promise<RenderedSong> {
  if (inFlight) { rerun = true; return inFlight; }
  const run = renderOnce().finally(() => {
    inFlight = null;
    if (rerun) { rerun = false; void renderUpRoughSong().catch(() => undefined); }
  });
  inFlight = run;
  return run;
}
