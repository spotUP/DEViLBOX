/**
 * The factory event store (R2f): the one seam between the R2 event sources and the panel. Sources call `onEvent`
 * (the TS render events through the bridge, the host decide events once R2c streams them, a scripted NDJSON in the
 * meantime); the panel only reads `state`. A generate run's decide events also fill the real tracker patterns.
 */
import { create } from 'zustand';
import type { R2Event } from '@/engine/uprough/r2Events';
import { initialFactoryState, reduceFactory, type FactoryState } from './factoryModel';
import { beginPatternFill, fillDecide } from './patternFill';

interface FactoryStoreState {
  state: FactoryState;
  /** Wall-clock ms of each act's first event, for the strict real-time acts; 0 = not started. */
  startedAt: number;
  onEvent: (ev: R2Event) => void;
  reset: () => void;
}

export const useFactoryStore = create<FactoryStoreState>((set, get) => ({
  state: initialFactoryState(),
  startedAt: 0,
  onEvent: (ev) => {
    const { state } = get();
    let written = 0;
    if (ev.type === 'start' && ev.mode === 'generate') beginPatternFill(ev);
    else if (ev.type === 'decide' && state.mode === 'generate') written = fillDecide(ev);
    set({
      state: reduceFactory(state, ev, written),
      startedAt: ev.type === 'start' ? performance.now() : get().startedAt,
    });
  },
  reset: () => set({ state: initialFactoryState(), startedAt: 0 }),
}));

/** The seam as a plain function: every event source calls this. */
export const factoryOnEvent = (ev: R2Event): void => useFactoryStore.getState().onEvent(ev);
