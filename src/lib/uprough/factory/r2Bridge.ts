/**
 * Feeds the factory from the TS render events (acts 1 and 3): every event upRoughSongService appends to
 * useUpRoughR2Store goes through `factoryOnEvent`. Returns the unsubscribe.
 */
import { useUpRoughR2Store } from '@stores/useUpRoughR2Store';
import { factoryOnEvent } from './useFactoryStore';

export function attachR2Bridge(): () => void {
  let seen = useUpRoughR2Store.getState().events.length;
  let run = useUpRoughR2Store.getState().run;
  return useUpRoughR2Store.subscribe((s) => {
    if (s.run !== run) { run = s.run; seen = 0; }
    for (; seen < s.events.length; seen++) factoryOnEvent(s.events[seen]!);
  });
}
