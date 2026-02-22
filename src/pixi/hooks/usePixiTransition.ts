/**
 * usePixiTransition — Smooth crossfade/slide transition between views.
 * Returns the previous view (to render during transition), plus alpha/x
 * values for old and new containers. Duration: 200ms, ease-out.
 */

import { useState, useEffect, useRef } from 'react';

const DURATION_MS = 200;

interface TransitionState {
  /** The view that is animating out (null when no transition) */
  prevView: string | null;
  /** Alpha for the outgoing view */
  prevAlpha: number;
  /** X offset for the outgoing view */
  prevX: number;
  /** Alpha for the incoming view */
  nextAlpha: number;
  /** X offset for the incoming view */
  nextX: number;
  /** Whether a transition is in progress */
  isTransitioning: boolean;
}

// Ease-out cubic
function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

export function usePixiTransition(activeView: string): TransitionState {
  const [state, setState] = useState<TransitionState>({
    prevView: null,
    prevAlpha: 0,
    prevX: 0,
    nextAlpha: 1,
    nextX: 0,
    isTransitioning: false,
  });

  const prevViewRef = useRef(activeView);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const oldView = prevViewRef.current;
    if (oldView === activeView) return;

    prevViewRef.current = activeView;

    // Respect prefers-reduced-motion — skip animation
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setState({ prevView: null, prevAlpha: 0, prevX: 0, nextAlpha: 1, nextX: 0, isTransitioning: false });
      return;
    }

    // Start transition
    const startTime = performance.now();
    cancelAnimationFrame(rafRef.current);

    const animate = () => {
      const elapsed = performance.now() - startTime;
      const t = Math.min(1, elapsed / DURATION_MS);
      const eased = easeOut(t);

      setState({
        prevView: oldView,
        prevAlpha: 1 - eased,
        prevX: -60 * eased, // slide left
        nextAlpha: eased,
        nextX: 60 * (1 - eased), // slide in from right
        isTransitioning: t < 1,
      });

      if (t < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        // Transition complete — clear previous view
        setState({
          prevView: null,
          prevAlpha: 0,
          prevX: 0,
          nextAlpha: 1,
          nextX: 0,
          isTransitioning: false,
        });
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(rafRef.current);
  }, [activeView]);

  return state;
}
