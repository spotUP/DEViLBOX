/**
 * The factory event store (R2f): the one seam between the R2 event sources and the panel. Sources call `onEvent`
 * (the TS render events through the bridge, the host decide events once R2c streams them, a scripted NDJSON in the
 * meantime); the panel only reads `state`. A host generate run's decide events also fill the real tracker patterns;
 * a replay never does, because no finished song follows it to replace the fill.
 */
import { create } from 'zustand';
import type { R2Event } from '@/engine/uprough/r2Events';
import { initialFactoryState, reduceFactory, type FactoryState } from './factoryModel';
import { STYLE_DRUMS, type HipHopStyle } from '@/engine/uprough/drumBank';
import { runActOne } from './actOne';
import { clearBank } from './voiceAudition';
import { beginPatternFill, endPatternFill, fillDecide } from './patternFill';

/** Where an event comes from: the host (or the TS render bridge), or the scripted Replay of the panel. */
export type FactorySource = 'host' | 'replay';

interface FactoryStoreState {
  state: FactoryState;
  /** Wall-clock ms of each act's first event, for the strict real-time acts; 0 = not started. */
  startedAt: number;
  /** True while a host generate run is filling the tracker; a replay or a render run leaves the song alone. */
  fillTracker: boolean;
  onEvent: (ev: R2Event, source?: FactorySource) => void;
  reset: () => void;
}

export const useFactoryStore = create<FactoryStoreState>((set, get) => ({
  state: initialFactoryState(),
  startedAt: 0,
  fillTracker: false,
  onEvent: (ev, source = 'host') => {
    const { state } = get();
    const fillTracker = ev.type === 'start' ? source === 'host' && ev.mode === 'generate' : get().fillTracker;
    let written = 0;
    // The wire carries no audio: the local bank at the start event's style and seed is the audition audio (same bytes as
    // the host by the parity suite). The one place the bank is built; a style with no local bank leaves nothing to play.
    if (ev.type === 'start') {
      if (ev.style in STYLE_DRUMS) runActOne(ev.style as HipHopStyle, ev.seed, ev.rate);
      else clearBank();
    }
    if (ev.type === 'start' && fillTracker) {
      beginPatternFill(ev).catch((err: unknown) => console.error('[factory] the blank song for the fill did not load:', err));
    } else if (ev.type === 'done' && fillTracker) endPatternFill();
    else if (ev.type === 'decide' && fillTracker && state.mode === 'generate') written = fillDecide(ev);
    set({
      fillTracker,
      state: reduceFactory(state, ev, written),
      startedAt: ev.type === 'start' ? performance.now() : get().startedAt,
    });
  },
  reset: () => set({ state: initialFactoryState(), startedAt: 0, fillTracker: false }),
}));

/** The seam as a plain function: every event source calls this. */
export const factoryOnEvent = (ev: R2Event): void => useFactoryStore.getState().onEvent(ev);

/** The Replay seam: drives the panel only, never the tracker song. */
export const factoryReplayEvent = (ev: R2Event): void => useFactoryStore.getState().onEvent(ev, 'replay');
