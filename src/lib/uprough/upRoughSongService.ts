/**
 * Keeps a rendered mix of the loaded Up Rough song (plan 2026-10-20 O6k2).
 * - render(): builds the current doc, asks the backend (a Worker in the app) for the mix.
 * - Edits (patterns, order, instruments, meta, tempo) mark it dirty; a debounce later one re-render runs, which the
 *   worker's per-section cache turns into one section. The old mix keeps playing until the new one lands.
 * - Listeners (the player) get every mix that lands.
 */
import { useTrackerStore } from '@stores/useTrackerStore';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { useTransportStore } from '@stores/useTransportStore';
import { useUpRoughRenderStore } from '@stores/useUpRoughRenderStore';
import type { RenderSongOptions } from '@engine/uprough/songRender';
import type { BarEvents } from './barEvents';
import { buildCurrentSong } from './currentSongRender';
import type { SectionEvent } from './songRenderJob';
import type { R2Event } from '@engine/uprough/r2Events';
import { useUpRoughR2Store } from '@stores/useUpRoughR2Store';

export interface RenderBackend {
  render(events: BarEvents, options: RenderSongOptions, onSection: (e: SectionEvent) => void, onR2?: (e: R2Event) => void): Promise<Float64Array>;
}
export interface RenderedSong { mix: Float64Array; rate: number; bpm: number; version: number }

const DEBOUNCE_MS = 400;

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
let debounce: ReturnType<typeof setTimeout> | null = null;
let debounceMs = DEBOUNCE_MS;
/** Bumped by every reset: events of a render started before it are dropped (a cancelled render posts no more events). */
let epoch = 0;
const listeners = new Set<(song: RenderedSong) => void>();

export function setRenderBackendForTests(b: RenderBackend | null, ms = DEBOUNCE_MS): void { backend = b; debounceMs = ms; resetUpRoughSong(); }
export function onUpRoughSongRendered(fn: (song: RenderedSong) => void): () => void { listeners.add(fn); return () => listeners.delete(fn); }
export function currentRenderedSong(): RenderedSong | null { return current; }

export function resetUpRoughSong(): void {
  current = null; inFlight = null; rerun = false; epoch++;
  if (debounce) clearTimeout(debounce);
  debounce = null;
  useUpRoughRenderStore.getState().set({ status: 'idle', sectionsDone: 0, sectionCount: 0, error: null });
}

async function renderOnce(): Promise<RenderedSong> {
  const store = useUpRoughRenderStore.getState();
  store.set({ status: 'rendering', sectionsDone: 0, sectionCount: 0, error: null });
  const mine = epoch;
  useUpRoughR2Store.getState().begin();
  try {
    const song = buildCurrentSong();
    const mix = await (backend ??= workerBackend()).render(song.events, song.options, (e) => {
      useUpRoughRenderStore.getState().set({ sectionsDone: e.section + 1, sectionCount: e.sectionCount });
    }, (event) => { if (epoch === mine) useUpRoughR2Store.getState().append(event); });
    const out: RenderedSong = { mix, rate: song.rate, bpm: song.bpm, version: useUpRoughRenderStore.getState().version + 1 };
    current = out;
    useUpRoughRenderStore.getState().set({ status: 'ready', version: out.version });
    for (const fn of listeners) fn(out);
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

/** The mix to play: the current one, or a render if none exists yet. */
export function ensureUpRoughSong(): Promise<RenderedSong> {
  return current ? Promise.resolve(current) : renderUpRoughSong();
}

export function markUpRoughDirty(): void {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => { debounce = null; void renderUpRoughSong().catch(() => undefined); }, debounceMs);
}

/** Subscribe once to everything the renderer reads. Returns the unsubscribe. */
let installed: (() => void) | null = null;
export function installUpRoughAutoRender(): () => void {
  if (installed) return installed;
  const unsubs = [
    useTrackerStore.subscribe((s, prev) => {
      if (!s.upRoughMeta) { if (prev.upRoughMeta) resetUpRoughSong(); return; }
      if (s.patterns !== prev.patterns || s.patternOrder !== prev.patternOrder || s.upRoughMeta !== prev.upRoughMeta) markUpRoughDirty();
    }),
    useInstrumentStore.subscribe((s, prev) => {
      if (useTrackerStore.getState().upRoughMeta && s.instruments !== prev.instruments) markUpRoughDirty();
    }),
    useTransportStore.subscribe((s, prev) => {
      if (useTrackerStore.getState().upRoughMeta && s.bpm !== prev.bpm) markUpRoughDirty();
    }),
  ];
  installed = () => { unsubs.forEach((u) => u()); installed = null; };
  return installed;
}
