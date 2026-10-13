/**
 * DeckTurntable - Interactive spinning vinyl record visualizer for DJ decks.
 *
 * Canvas rendering runs on a background thread via OffscreenCanvas.
 * Pointer interaction (jog wheel scratch) stays on the main thread and
 * posts velocity/state updates to the worker.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useDJStore } from '@/stores/useDJStore';
import { useViewActive } from '@hooks/useFrameGate';
import { platterPositionSec } from './DeckCssTurntable';
import * as Tone from 'tone';
import { deckCPlatterRadians, onDeckCMotionPlaced, subscribeDeckCMotion } from '@/engine/dj/scratch/deckCMotion';
import { useThemeStore } from '@stores';
import { startScratch, setScratchVelocity, stopScratch } from '@/engine/dj/DJActions';
import { OffscreenBridge } from '@engine/renderer/OffscreenBridge';
import TurntableWorkerFactory from '@/workers/dj-turntable.worker.ts?worker';

interface DeckTurntableProps {
  deckId: 'A' | 'B' | 'C';
}

import { deckAccent, deckLabelSurface } from '@lib/deckIdentity';
import type { TurntableMsg, DeckColorsExt } from '@engine/renderer/worker-types';

const SIZE = 96;
const MOMENTUM_DECAY_MS = 500;

function snapshotColors(el: HTMLElement, deckId: string): DeckColorsExt {
  const cs = getComputedStyle(el);
  return {
    bg:          cs.getPropertyValue('--color-bg').trim()            || '#6e1418',
    bgSecondary: cs.getPropertyValue('--color-bg-secondary').trim()  || '#7c1a1e',
    bgTertiary:  cs.getPropertyValue('--color-bg-tertiary').trim()   || '#8c2028',
    border:      cs.getPropertyValue('--color-border').trim()        || '#581014',
    borderLight: cs.getPropertyValue('--color-border-light').trim()  || '#403535',
    deckAccent:  deckAccent(deckId),
    deckLabel:   deckLabelSurface(deckId),
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
  const jogActiveRef = useRef(false); // Ref mirror of isScratchActive for subscription closures
  // Off screen (the DJ view kept mounted behind another view) the platter posts nothing.
  const viewActive = useViewActive();
  const viewActiveRef = useRef(viewActive);
  const wakePositionRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    viewActiveRef.current = viewActive;
    if (viewActive) wakePositionRef.current?.();
  }, [viewActive]);

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
    const colors  = snapshotColors(container, deckId);
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

    // Position: the HEARD position, sampled every frame (the store's 20 Hz
    // position is held between writes and the raw player runs ahead of the ear)
    // - while it moves, which is while the deck's clock anchor has a rate.
    // Stopped, it changes only with a new anchor (a seek, a cue): one post per
    // anchor, then the loop sleeps. Off screen (DJ view hidden) it posts nothing.
    let posRaf = 0;
    const moving = () => useDJStore.getState().decks[deckId].positionAnchor.rate !== 0;
    const postPosition = () => {
      posRaf = 0;
      if (!viewActiveRef.current) return;
      bridgeRef.current?.post({ type: 'position', posSec: platterPositionSec(deckId) });
      if (moving()) posRaf = requestAnimationFrame(postPosition);
    };
    const wakePosition = () => { if (!posRaf) posRaf = requestAnimationFrame(postPosition); };
    wakePositionRef.current = wakePosition;
    wakePosition();
    const unsubAnchor = useDJStore.subscribe((s) => s.decks[deckId].positionAnchor, wakePosition);
    // D1: Deck C's platter follows the strokes it plays (Auto Scratch, the Three Deck Showcase) - the same angle
    // the CSS turntable shows - every frame while they drive it; asleep otherwise, woken by a placed stroke.
    let motionRaf = 0;
    const followMotion = () => {
      motionRaf = 0;
      if (!viewActiveRef.current) return;
      const rad = deckCPlatterRadians(Tone.getContext().rawContext.currentTime);
      bridgeRef.current?.post({ type: 'angle', rad });
      if (rad !== null) motionRaf = requestAnimationFrame(followMotion);
      else wakePosition();
    };
    const wakeMotion = () => { if (!motionRaf) motionRaf = requestAnimationFrame(followMotion); };
    const unsubMotion = deckId === 'C' ? onDeckCMotionPlaced(wakeMotion) : () => undefined;
    const unsubMotionView = deckId === 'C' ? subscribeDeckCMotion() : () => undefined;
    if (deckId === 'C') { wakeMotion(); wakePositionRef.current = () => { wakePosition(); wakeMotion(); }; }
    const unsubPos = () => { cancelAnimationFrame(posRaf); cancelAnimationFrame(motionRaf); unsubAnchor(); unsubMotion(); unsubMotionView(); wakePositionRef.current = null; };

    // Pattern scratch velocity → turntable spin.
    // When a scratch pattern is active, forward velocity to the worker so the
    // vinyl spins forward/backward matching the scratch. When not scratching,
    // the worker uses default velocity (1.0).
    const unsubScratch = useDJStore.subscribe(
      (s) => ({
        scratchVelocity: s.decks[deckId].scratchVelocity,
        activePatternName: s.decks[deckId].activePatternName,
      }),
      ({ scratchVelocity, activePatternName }) => {
        if (activePatternName && !jogActiveRef.current) {
          // Pattern scratch active (and jog wheel not held) — forward velocity to worker
          bridgeRef.current?.post({ type: 'velocity', v: scratchVelocity });
          bridgeRef.current?.post({ type: 'scratchActive', active: true });
        } else if (!activePatternName && !jogActiveRef.current) {
          // No scratch pattern and no jog — reset to normal spin
          bridgeRef.current?.post({ type: 'velocity', v: 1 });
          bridgeRef.current?.post({ type: 'scratchActive', active: false });
        }
      },
      { equalityFn: (a, b) => a.scratchVelocity === b.scratchVelocity && a.activePatternName === b.activePatternName },
    );

    // Theme / CSS var subscription
    const unsubTheme = useThemeStore.subscribe(() => {
      if (containerRef.current) {
        bridgeRef.current?.post({ type: 'colors', colors: snapshotColors(containerRef.current, deckId) });
      }
    });

    return () => {
      unsub();
      unsubPos();
      unsubScratch();
      unsubTheme();
      bridge.dispose();
      bridgeRef.current = null;
      canvas.remove();
      canvasRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId]);

  // ── Momentum decay (main thread — posts velocity to worker AND audio engine) ───
  // Technics 1200 physics: cubic ease-out decay back to normal speed (1.0)

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
      // Update audio engine velocity during decay (clamp to prevent near-zero stutter)
      const audioV = Math.abs(v) < 0.1 ? 0.1 * Math.sign(v || 1) : v;
      setScratchVelocity(deckId, audioV);

      if (t < 1) {
        momentumDecayRafRef.current = requestAnimationFrame(animate);
      } else {
        scratchVelocityRef.current = 1;
        momentumDecayRafRef.current = 0;
        // Decay complete - now properly end scratch mode
        stopScratch(deckId, 0);
      }
    };
    momentumDecayRafRef.current = requestAnimationFrame(animate);
  }, [deckId]);

  // ── Pointer handlers ────────────────────────────────────────────────────────

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    if (momentumDecayRafRef.current) { cancelAnimationFrame(momentumDecayRafRef.current); momentumDecayRafRef.current = 0; }

    lastPointerRef.current     = { x: e.clientX, y: e.clientY };
    // Record stops when touched (like putting your hand on vinyl)
    scratchVelocityRef.current = 0;
    jogActiveRef.current = true;
    setIsScratchActive(true);
    useDJStore.getState().setDeckScratchActive(deckId, true);
    bridgeRef.current?.post({ type: 'scratchActive', active: true });
    bridgeRef.current?.post({ type: 'velocity', v: 0 }); // Stop the record immediately
    startScratch(deckId);
    setScratchVelocity(deckId, 0); // Stop audio too
  }, [deckId]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (!lastPointerRef.current) return;

    // Vertical drag: up = forward, down = backward (like scratching a record)
    const dy = lastPointerRef.current.y - e.clientY; // Invert so up is positive
    // Scale: ~25px drag = full speed (1.0), clamp to ±4
    const v = Math.max(-4, Math.min(4, dy * 0.15));
    scratchVelocityRef.current = v;
    bridgeRef.current?.post({ type: 'velocity', v });
    setScratchVelocity(deckId, v);

    lastPointerRef.current = { x: e.clientX, y: e.clientY };
  }, [deckId]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (!lastPointerRef.current) return; // Already released
    e.currentTarget.releasePointerCapture(e.pointerId);
    lastPointerRef.current = null;
    const fromVelocity = scratchVelocityRef.current;
    jogActiveRef.current = false;
    setIsScratchActive(false);
    useDJStore.getState().setDeckScratchActive(deckId, false);
    bridgeRef.current?.post({ type: 'scratchActive', active: false });
    startMomentumDecay(fromVelocity);
  }, [deckId, startMomentumDecay]);

  // Handle pointer cancel / lost capture (e.g., system gesture interruption)
  const handlePointerCancel = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (!lastPointerRef.current) return;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    lastPointerRef.current = null;
    jogActiveRef.current = false;
    setIsScratchActive(false);
    useDJStore.getState().setDeckScratchActive(deckId, false);
    bridgeRef.current?.post({ type: 'scratchActive', active: false });
    startMomentumDecay(scratchVelocityRef.current);
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
      onPointerCancel={handlePointerCancel}
      onLostPointerCapture={handlePointerCancel}
    />
  );
};
