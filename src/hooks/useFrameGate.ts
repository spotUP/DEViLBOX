/**
 * The one gate every picture loop in the app shares.
 *
 * A frame loop draws only while its picture can change. Two things decide
 * that for every loop alike:
 * - the view it sits in is on screen. App.tsx keeps the DJ view mounted
 *   (display: none) while DJ mode runs behind another view; its loops read
 *   ViewActiveContext and stop there.
 * - the app is sounding (engine/audio/signalPresence.ts): a meter, scope or
 *   spectrum of a silent signal draws the same frame again, so a signal
 *   picture stops ~2 s after the output fell silent - after any effect tail
 *   - and starts on the first audible quantum.
 * A loop whose picture follows a transport rather than the signal (a
 * playhead, a spinning platter) adds its own isPlaying to `useViewActive`.
 */

import { createContext, useContext, useSyncExternalStore } from 'react';
import { isSounding, subscribeSounding } from '@engine/audio/signalPresence';

/** False inside a view that is mounted but not on screen. */
export const ViewActiveContext = createContext(true);

export function useViewActive(): boolean {
  return useContext(ViewActiveContext);
}

export function useSounding(): boolean {
  return useSyncExternalStore(subscribeSounding, isSounding, isSounding);
}

/** True while a picture of the app's signal can change: on screen and sounding. */
export function useFrameGate(): boolean {
  const viewActive = useViewActive();
  const sounding = useSounding();
  return viewActive && sounding;
}
