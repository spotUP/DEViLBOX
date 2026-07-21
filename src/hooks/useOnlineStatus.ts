/**
 * useOnlineStatus — reactive navigator.onLine for offline-aware UI.
 *
 * Single source of truth for "are we online" across the app. Components that
 * front intrinsically-online features (Modland/HVSC browsers, CSDB lookup,
 * YouTube upload, ratings) use this to render a clear offline state instead of
 * a blank pane or a silent failure.
 *
 * navigator.onLine is optimistic (true just means "some network interface is
 * up"), so online features must still handle fetch failures — this hook is for
 * the definite-offline UX, which browsers do report reliably.
 */

import { useSyncExternalStore } from 'react';

function subscribe(callback: () => void): () => void {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

function getSnapshot(): boolean {
  return navigator.onLine;
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}
