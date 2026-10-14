/**
 * useDJLayout - the DJ view's measured box and contents -> the solved layout.
 *
 * The box is the DJ view's OWN root minus the measured top bar (ResizeObserver),
 * so browser chrome, the status bar and a wrapping top bar are accounted for
 * without assuming anything about the window. Waveforms are budgeted for every
 * active deck whether or not a track has loaded: loading a track must not make the
 * mixer fold its extras away mid-set.
 */

import { useLayoutEffect, useMemo, useState, type RefObject } from 'react';
import { useDJStore } from '@/stores/useDJStore';
import { useDrumPadStore } from '@/stores/useDrumPadStore';
import { useResponsiveSafe } from '@/contexts/ResponsiveContext';
import { DJ_LAYOUT_MEASURE_EVENT } from '@/lib/dj/djLayoutFit';
import { djLayout, type DjLayout, type DjDeckCKind } from '@/lib/dj/djLayout';

interface Box {
  width: number;
  height: number;
  topBar: number;
}

/** Until the first measurement lands: a roomy box, so the first paint is the regular layout. */
const UNMEASURED: Box = { width: 1920, height: 1045, topBar: 45 };

export function useDJLayout(rootRef: RefObject<HTMLElement | null>, topBarRef: RefObject<HTMLElement | null>): DjLayout {
  const [box, setBox] = useState<Box>(UNMEASURED);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const bar = topBarRef.current;
    if (!root || !bar) return;
    const read = (): void => {
      const next = { width: root.clientWidth, height: root.clientHeight, topBar: bar.offsetHeight };
      setBox((prev) => (prev.width === next.width && prev.height === next.height && prev.topBar === next.topBar ? prev : next));
    };
    const ro = new ResizeObserver(read);
    ro.observe(root);
    ro.observe(bar);
    read();
    window.addEventListener(DJ_LAYOUT_MEASURE_EVENT, read);
    return () => {
      ro.disconnect();
      window.removeEventListener(DJ_LAYOUT_MEASURE_EVENT, read);
    };
  }, [rootRef, topBarRef]);

  const thirdDeck = useDJStore((s) => s.thirdDeckActive);
  // Deck C is the scratch deck until a track is loaded on it (same signal as DJDeck).
  const deckC = useDJStore((s): DjDeckCKind => (!s.thirdDeckActive ? null : s.decks.C.fileName ? 'track' : 'scratchOnly'));
  const dubBusOn = useDrumPadStore((s) => s.dubBus.enabled);
  const { isCoarsePointer } = useResponsiveSafe();
  const deckCount = thirdDeck ? 3 : 2;

  const pointer = isCoarsePointer ? 'coarse' : 'fine';

  // Memoised on the primitive inputs only: the context value must stay the same
  // object until an input changes, or every DJ band re-renders with every DJView render.
  return useMemo(
    () => djLayout({
      width: box.width,
      height: box.height - box.topBar,
      deckCount,
      deckC,
      waveformCount: deckCount,
      dubBusOn,
      pointer,
    }),
    [box.width, box.height, box.topBar, deckCount, deckC, dubBusOn, pointer],
  );
}
