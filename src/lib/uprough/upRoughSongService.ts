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
import type { PartialMix, SectionEvent } from './songRenderJob';
import type { R2Event } from '@engine/uprough/r2Events';
import { useUpRoughR2Store } from '@stores/useUpRoughR2Store';

export interface RenderBackend {
  /** `onPartial` (optional) receives each section's PRE-master mix, in order, before the promise resolves (R2f-33). */
  render(
    events: BarEvents, options: RenderSongOptions, onSection: (e: SectionEvent) => void, onR2?: (e: R2Event) => void,
    onPartial?: (p: PartialMix) => void,
  ): Promise<Float64Array>;
}
/** One section's pre-master mix as it landed, with the song's rate and tempo. */
export interface PartialSong extends PartialMix { rate: number; bpm: number }
export interface RenderedSong { mix: Float64Array; rate: number; bpm: number; version: number }

const DEBOUNCE_MS = 400;

/** The app backend: one Worker, one request at a time (the service serialises). */
function workerBackend(): RenderBackend {
  let worker: Worker | null = null;
  let nextId = 0;
  return {
    async render(events, options, onSection, onR2, onPartial) {
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
          else if (m.type === 'partial') onPartial?.({ section: m.section, start: m.start, mix: m.mix });
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
const partialListeners = new Set<(p: PartialSong) => void>();
/** The pre-master sections of the render in flight, assembled by `start` into one growing array (capacity doubles). */
let partialBuf = new Float64Array(0);
let partialLength = 0;
let partialSections = 0;
let partialRate = 22050;

export function setRenderBackendForTests(b: RenderBackend | null, ms = DEBOUNCE_MS): void { backend = b; debounceMs = ms; resetUpRoughSong(); }
export function onUpRoughSongRendered(fn: (song: RenderedSong) => void): () => void { listeners.add(fn); return () => listeners.delete(fn); }
/** Every pre-master section mix as it lands (R2f-33). Level differs from the final mix: no texture, no master bus. */
export function onUpRoughSongPartial(fn: (p: PartialSong) => void): () => void { partialListeners.add(fn); return () => partialListeners.delete(fn); }
/** The pre-master sections landed so far, joined in order (a view: later partials only append behind it), or null. */
export function currentPartialMix(): Float64Array | null { return partialSections ? partialBuf.subarray(0, partialLength) : null; }
/** Sample rate of the sections in currentPartialMix(). */
export function currentPartialRate(): number { return partialRate; }
function clearPartials(): void { partialLength = 0; partialSections = 0; }
function appendPartial(p: PartialMix): void {
  if (p.start !== partialLength) return; // sections arrive in order; anything else is not a prefix
  if (partialLength + p.mix.length > partialBuf.length) {
    const grown = new Float64Array(Math.max(partialBuf.length * 2, partialLength + p.mix.length));
    grown.set(partialBuf.subarray(0, partialLength));
    partialBuf = grown;
  }
  partialBuf.set(p.mix, p.start);
  partialLength += p.mix.length; partialSections++;
}
export function currentRenderedSong(): RenderedSong | null { return current; }

export function resetUpRoughSong(): void {
  current = null; inFlight = null; rerun = false; epoch++; clearPartials();
  if (debounce) clearTimeout(debounce);
  debounce = null;
  useUpRoughRenderStore.getState().set({ status: 'idle', sectionsDone: 0, sectionCount: 0, error: null });
}

async function renderOnce(): Promise<RenderedSong> {
  const store = useUpRoughRenderStore.getState();
  const mine = epoch;
  clearPartials(); // before 'rendering' is announced: a preview that starts on it must not see the last render's sections
  store.set({ status: 'rendering', sectionsDone: 0, sectionCount: 0, error: null });
  useUpRoughR2Store.getState().begin();
  try {
    const song = buildCurrentSong();
    const mix = await (backend ??= workerBackend()).render(song.events, song.options, (e) => {
      useUpRoughRenderStore.getState().set({ sectionsDone: e.section + 1, sectionCount: e.sectionCount });
    }, (event) => { if (epoch === mine) useUpRoughR2Store.getState().append(event); },
    (p) => {
      if (epoch !== mine) return;
      appendPartial(p); partialRate = song.rate;
      for (const fn of partialListeners) fn({ ...p, rate: song.rate, bpm: song.bpm });
    });
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
