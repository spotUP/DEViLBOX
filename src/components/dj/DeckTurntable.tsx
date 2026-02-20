/**
 * DeckTurntable - Interactive spinning vinyl record visualizer for DJ decks.
 *
 * Canvas rendering runs on a background thread via OffscreenCanvas.
 * Pointer interaction (jog wheel scratch) stays on the main thread and
 * posts velocity/state updates to the worker.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useDJStore } from '@/stores/useDJStore';
import { useThemeStore } from '@stores';
import { getDJEngine } from '@/engine/dj/DJEngine';
import { OffscreenBridge } from '@engine/renderer/OffscreenBridge';
import TurntableWorkerFactory from '@/workers/dj-turntable.worker.ts?worker';

interface DeckTurntableProps {
  deckId: 'A' | 'B';
}

interface DeckColors {
  bg: string;
  bgSecondary: string;
  bgTertiary: string;
  border: string;
  borderLight: string;
}

type TurntableMsg =
  | { type: 'init'; canvas: OffscreenCanvas; dpr: number; width: number; height: number; colors: DeckColors; deckId: 'A' | 'B'; isPlaying: boolean; effectiveBPM: number }
  | { type: 'playback'; isPlaying: boolean; effectiveBPM: number }
  | { type: 'velocity'; v: number }
  | { type: 'scratchActive'; active: boolean }
  | { type: 'resize'; w: number; h: number; dpr: number }
  | { type: 'colors'; colors: DeckColors };

const SIZE = 96;
const MOMENTUM_DECAY_MS  = 500;
const SCRATCH_SENSITIVITY = 0.06;

function snapshotColors(el: HTMLElement): DeckColors {
  const cs = getComputedStyle(el);
  return {
    bg:          cs.getPropertyValue('--color-bg').trim()            || '#0b0909',
    bgSecondary: cs.getPropertyValue('--color-bg-secondary').trim()  || '#131010',
    bgTertiary:  cs.getPropertyValue('--color-bg-tertiary').trim()   || '#1d1818',
    border:      cs.getPropertyValue('--color-border').trim()        || '#2f2525',
    borderLight: cs.getPropertyValue('--color-border-light').trim()  || '#403535',
  };
}

export const DeckTurntable: React.FC<DeckTurntableProps> = ({ deckId }) => {
  // Mutable ref — set imperatively in useEffect to avoid StrictMode double-transfer
  const canvasRef    = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const bridgeRef    = useRef<OffscreenBridge<TurntableMsg, { type: string }> | null>(null);

  // Scratch state refs (main thread only)
  const scratchVelocityRef      = useRef(1);
  const lastPointerRef          = useRef<{ x: number; y: number } | null>(null);
  const momentumDecayRafRef     = useRef<number>(0);
  const momentumStartTimeRef    = useRef(0);
  const momentumStartVelRef     = useRef(1);

  const [isScratchActive, setIsScratchActive] = useState(false);

  // ── Bridge init ────────────────────────────────────────────────────────────
  // Canvas created imperatively — prevents StrictMode double-transferControlToOffscreen error.

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !('transferControlToOffscreen' in HTMLCanvasElement.prototype)) return;

    const canvas = document.createElement('canvas');
    canvas.style.cssText = `display:block;width:${SIZE}px;height:${SIZE}px;border-radius:4px;touch-action:none;`;
    container.appendChild(canvas);
    canvasRef.current = canvas;

    const deck    = useDJStore.getState().decks[deckId];
    const dpr     = window.devicePixelRatio || 1;
    const colors  = snapshotColors(container);
    const offscreen = canvas.transferControlToOffscreen();

    const bridge = new OffscreenBridge<TurntableMsg, { type: string }>(
      TurntableWorkerFactory, { onReady: () => {} },
    );
    bridgeRef.current = bridge;

    bridge.post({
      type: 'init', canvas: offscreen, dpr,
      width: SIZE, height: SIZE, colors, deckId,
      isPlaying: deck.isPlaying, effectiveBPM: deck.effectiveBPM,
    }, [offscreen]);

    // Playback state subscription
    const unsub = useDJStore.subscribe(
      (s) => ({ isPlaying: s.decks[deckId].isPlaying, effectiveBPM: s.decks[deckId].effectiveBPM }),
      ({ isPlaying, effectiveBPM }) => {
        bridgeRef.current?.post({ type: 'playback', isPlaying, effectiveBPM });
      },
      { equalityFn: (a, b) => a.isPlaying === b.isPlaying && a.effectiveBPM === b.effectiveBPM },
    );

    // Theme / CSS var subscription
    const unsubTheme = useThemeStore.subscribe(() => {
      if (containerRef.current) {
        bridgeRef.current?.post({ type: 'colors', colors: snapshotColors(containerRef.current) });
      }
    });

    return () => {
      unsub();
      unsubTheme();
      bridge.dispose();
      bridgeRef.current = null;
      canvas.remove();
      canvasRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId]);

  // ── Momentum decay (main thread — posts velocity to worker) ───────────────

  const startMomentumDecay = useCallback((fromVelocity: number) => {
    if (momentumDecayRafRef.current) cancelAnimationFrame(momentumDecayRafRef.current);
    momentumStartTimeRef.current = performance.now();
    momentumStartVelRef.current  = fromVelocity;

    const animate = () => {
      const t    = Math.min(1, (performance.now() - momentumStartTimeRef.current) / MOMENTUM_DECAY_MS);
      const ease = 1 - Math.pow(1 - t, 3);
      const v    = momentumStartVelRef.current + (1 - momentumStartVelRef.current) * ease;
      scratchVelocityRef.current = v;
      bridgeRef.current?.post({ type: 'velocity', v });

      if (t < 1) momentumDecayRafRef.current = requestAnimationFrame(animate);
      else { scratchVelocityRef.current = 1; momentumDecayRafRef.current = 0; }
    };
    momentumDecayRafRef.current = requestAnimationFrame(animate);
  }, []);

  // ── Pointer handlers ────────────────────────────────────────────────────────

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    if (momentumDecayRafRef.current) { cancelAnimationFrame(momentumDecayRafRef.current); momentumDecayRafRef.current = 0; }

    lastPointerRef.current     = { x: e.clientX, y: e.clientY };
    scratchVelocityRef.current = 1;
    setIsScratchActive(true);
    useDJStore.getState().setDeckScratchActive(deckId, true);
    bridgeRef.current?.post({ type: 'scratchActive', active: true });
    try { getDJEngine().getDeck(deckId).startScratch(); } catch { /* Engine not ready */ }
  }, [deckId]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (!lastPointerRef.current) return;
    const container = containerRef.current;
    if (!container) return;

    const rect   = container.getBoundingClientRect();
    const cx     = rect.left + SIZE / 2;
    const cy     = rect.top  + SIZE / 2;
    const rx     = e.clientX - cx, ry = e.clientY - cy;
    const radius = Math.sqrt(rx * rx + ry * ry);

    if (radius > 4) {
      const dx         = e.clientX - lastPointerRef.current.x;
      const dy         = e.clientY - lastPointerRef.current.y;
      const tangential = (rx * dy - ry * dx) / radius;
      const v          = Math.max(-4, Math.min(4, 1 + tangential * SCRATCH_SENSITIVITY));
      scratchVelocityRef.current = v;
      bridgeRef.current?.post({ type: 'velocity', v });
      try { getDJEngine().getDeck(deckId).setScratchVelocity(v); } catch { /* Engine not ready */ }
    }
    lastPointerRef.current = { x: e.clientX, y: e.clientY };
  }, [deckId]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    lastPointerRef.current = null;
    const fromVelocity = scratchVelocityRef.current;
    setIsScratchActive(false);
    useDJStore.getState().setDeckScratchActive(deckId, false);
    bridgeRef.current?.post({ type: 'scratchActive', active: false });
    startMomentumDecay(fromVelocity);
    try { getDJEngine().getDeck(deckId).stopScratch(200); } catch { /* Engine not ready */ }
  }, [deckId, startMomentumDecay]);

  useEffect(() => {
    return () => { if (momentumDecayRafRef.current) cancelAnimationFrame(momentumDecayRafRef.current); };
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex-shrink-0 rounded"
      style={{
        width: SIZE, height: SIZE,
        cursor: isScratchActive ? 'grabbing' : 'grab',
        touchAction: 'none',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    />
  );
};
