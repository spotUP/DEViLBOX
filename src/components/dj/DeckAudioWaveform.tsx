/**
 * DeckAudioWaveform - Combined waveform display for audio files
 *
 * Top strip: full-track overview minimap (click to seek anywhere)
 * Bottom area: scrolling 10s zoomed waveform centered on playhead
 *
 * Canvas rendering runs on a background thread via OffscreenCanvas.
 * Falls back to null when no waveform data exists (unchanged behaviour).
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { useDJStore } from '@/stores/useDJStore';
import { useThemeStore } from '@stores';
import { seekDeckAudio, startScratch, setScratchVelocity, stopScratch } from '@/engine/dj/DJActions';
import { OffscreenBridge } from '@engine/renderer/OffscreenBridge';
import WaveformWorkerFactory from '@/workers/dj-waveform.worker.ts?worker';
import { markSeek } from './seekGuard';
import type { WaveformMsg, WaveformOverviewState, DeckColors } from '@engine/renderer/worker-types';

interface DeckAudioWaveformProps {
  deckId: 'A' | 'B' | 'C';
}

const OVERVIEW_H = 16; // must match worker constant

function snapshotColors(el: HTMLElement): DeckColors {
  const cs = getComputedStyle(el);
  return {
    bg:          cs.getPropertyValue('--color-bg').trim()           || '#6e1418',
    bgSecondary: cs.getPropertyValue('--color-bg-secondary').trim() || '#7c1a1e',
    bgTertiary:  cs.getPropertyValue('--color-bg-tertiary').trim()  || '#8c2028',
    border:      cs.getPropertyValue('--color-border').trim()       || '#581014',
  };
}

function snapshotOverview(deckId: 'A' | 'B' | 'C', container: HTMLElement): WaveformOverviewState {
  const d = useDJStore.getState().decks[deckId];
  return {
    frequencyPeaks: d.frequencyPeaks ? d.frequencyPeaks.map(band => Array.from(band)) : null,
    loopActive:       d.loopActive,
    patternLoopStart: d.patternLoopStart,
    patternLoopEnd:   d.patternLoopEnd,
    cuePoint:         d.cuePoint,
    totalPositions:   d.totalPositions,
    colors:           snapshotColors(container),
    beats:            d.beatGrid?.beats ?? null,
    downbeats:        d.beatGrid?.downbeats ?? null,
  };
}

export const DeckAudioWaveform: React.FC<DeckAudioWaveformProps> = ({ deckId }) => {
  const canvasRef    = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const bridgeRef    = useRef<OffscreenBridge<WaveformMsg, { type: string }> | null>(null);

  const waveformPeaks = useDJStore((s) => s.decks[deckId].waveformPeaks);
  const hasPeaks = !!(waveformPeaks && waveformPeaks.length > 0);

  // ── Bridge init ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!hasPeaks) return;
    const container = containerRef.current;
    if (!container || !('transferControlToOffscreen' in HTMLCanvasElement.prototype)) return;

    const canvas = document.createElement('canvas');
    canvas.className = 'block w-full h-full';
    container.appendChild(canvas);
    canvasRef.current = canvas;

    const dpr  = Math.min(window.devicePixelRatio, 2);
    const w    = Math.max(1, container.clientWidth);
    const h    = Math.max(1, container.clientHeight);
    const deck = useDJStore.getState().decks[deckId];
    const offscreen = canvas.transferControlToOffscreen();

    const bridge = new OffscreenBridge<WaveformMsg, { type: string }>(
      WaveformWorkerFactory, { onReady: () => {} },
    );
    bridgeRef.current = bridge;

    bridge.post({
      type: 'init',
      canvas: offscreen,
      dpr, width: w, height: h,
      waveformPeaks:  deck.waveformPeaks ? Array.from(deck.waveformPeaks) : null,
      durationMs:     deck.durationMs,
      audioPosition:  deck.audioPosition,
      cuePoints:      deck.seratoCuePoints,
      overview:       snapshotOverview(deckId, container),
    }, [offscreen]);

    // Position (high-frequency, ~60fps from DJDeck rAF poller)
    const unsubPos = useDJStore.subscribe(
      (s) => s.decks[deckId].audioPosition,
      (audioPosition) => bridgeRef.current?.post({ type: 'position', audioPosition }),
    );

    // Waveform peaks (on track load)
    const unsubPeaks = useDJStore.subscribe(
      (s) => s.decks[deckId].waveformPeaks,
      (peaks) => bridgeRef.current?.post({
        type: 'waveformPeaks',
        peaks: peaks ? Array.from(peaks) : null,
        durationMs: useDJStore.getState().decks[deckId].durationMs,
      }),
    );

    // Cue points (on track load)
    const unsubCues = useDJStore.subscribe(
      (s) => s.decks[deckId].seratoCuePoints,
      (cuePoints) => bridgeRef.current?.post({ type: 'cuePoints', cuePoints }),
    );

    // Overview state (loop, cue marker, frequency peaks)
    const unsubOverview = useDJStore.subscribe(
      (s) => {
        const d = s.decks[deckId];
        return [d.frequencyPeaks, d.loopActive, d.patternLoopStart, d.patternLoopEnd, d.cuePoint, d.totalPositions, d.beatGrid] as const;
      },
      () => {
        if (containerRef.current) {
          bridgeRef.current?.post({ type: 'overview', overview: snapshotOverview(deckId, containerRef.current) });
        }
      },
    );

    // Theme changes → update overview colors
    const unsubTheme = useThemeStore.subscribe(() => {
      if (containerRef.current) {
        bridgeRef.current?.post({ type: 'overview', overview: snapshotOverview(deckId, containerRef.current) });
      }
    });

    // Other deck waveform overlay — for visual beat-matching
    const otherDeckId = deckId === 'A' ? 'B' : deckId === 'B' ? 'A' : 'A';

    // Send initial other deck state
    const otherInit = useDJStore.getState().decks[otherDeckId];
    bridgeRef.current?.post({
      type: 'otherDeck',
      peaks: otherInit.waveformPeaks ? Array.from(otherInit.waveformPeaks) : null,
      durationMs: otherInit.durationMs,
      audioPosition: otherInit.audioPosition,
    });

    // Other deck position (high-frequency)
    const unsubOtherPos = useDJStore.subscribe(
      (s) => s.decks[otherDeckId].audioPosition,
      (pos) => {
        const od = useDJStore.getState().decks[otherDeckId];
        bridgeRef.current?.post({
          type: 'otherDeck',
          peaks: null, // don't resend peaks on every position update
          durationMs: od.durationMs,
          audioPosition: pos,
        });
      },
    );

    // Other deck peaks (on track load)
    const unsubOtherPeaks = useDJStore.subscribe(
      (s) => s.decks[otherDeckId].waveformPeaks,
      (peaks) => {
        const od = useDJStore.getState().decks[otherDeckId];
        bridgeRef.current?.post({
          type: 'otherDeck',
          peaks: peaks ? Array.from(peaks) : null,
          durationMs: od.durationMs,
          audioPosition: od.audioPosition,
        });
      },
    );

    // Stem waveform peaks (on stem separation / auto-load)
    const sendStemPeaks = (stemPeaks: Record<string, Float32Array> | null) => {
      if (!stemPeaks) {
        bridgeRef.current?.post({ type: 'stemPeaks', stems: null });
        return;
      }
      const serialized: Record<string, number[]> = {};
      for (const [name, fa] of Object.entries(stemPeaks)) {
        serialized[name] = Array.from(fa);
      }
      bridgeRef.current?.post({ type: 'stemPeaks', stems: serialized });
    };
    // Send initial stem peaks if already available
    sendStemPeaks(useDJStore.getState().decks[deckId].stemWaveformPeaks);
    const unsubStemPeaks = useDJStore.subscribe(
      (s) => s.decks[deckId].stemWaveformPeaks,
      sendStemPeaks,
    );

    // Resize observer
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = Math.floor(entry.contentRect.width);
      const h = Math.floor(entry.contentRect.height);
      if (w > 0 && h > 0) {
        bridgeRef.current?.post({ type: 'resize', w, h, dpr: Math.min(window.devicePixelRatio, 2) });
      }
    });
    observer.observe(container);

    return () => {
      unsubPos();
      unsubPeaks();
      unsubCues();
      unsubOverview();
      unsubTheme();
      unsubOtherPos();
      unsubOtherPeaks();
      unsubStemPeaks();
      observer.disconnect();
      bridge.dispose();
      bridgeRef.current = null;
      canvas.remove();
      canvasRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId, hasPeaks]);

  // ── Click / drag to scratch ──────────────────────────────────────────────

  const seekToFraction = useCallback((fraction: number) => {
    const durationMs = useDJStore.getState().decks[deckId].durationMs;
    if (!durationMs || durationMs <= 0) return;
    const f = Math.max(0, Math.min(1, fraction));
    const seekSec = f * (durationMs / 1000);
    markSeek(deckId);
    seekDeckAudio(deckId, seekSec);
    useDJStore.getState().setDeckState(deckId, { audioPosition: seekSec, elapsedMs: seekSec * 1000 });
  }, [deckId]);

  const isDraggingRef = useRef(false);
  const lastXRef = useRef(0);
  const lastTimeRef = useRef(0);
  const velocityRef = useRef(0);
  const decayRafRef = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const localY = e.clientY - rect.top;
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

    if (localY <= OVERVIEW_H) {
      // Click in overview strip → seek to absolute position
      seekToFraction(frac);
      return;
    }

    // Scrolling waveform zone → drag to scratch
    e.preventDefault();
    isDraggingRef.current = true;
    lastXRef.current = e.clientX;
    lastTimeRef.current = performance.now();
    velocityRef.current = 0;

    if (decayRafRef.current) {
      cancelAnimationFrame(decayRafRef.current);
      decayRafRef.current = 0;
    }

    startScratch(deckId);
    setScratchVelocity(deckId, 0);

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const now = performance.now();
      const dt = Math.max(1, now - lastTimeRef.current) / 1000;
      const dx = ev.clientX - lastXRef.current;
      // Horizontal drag → scratch velocity. Right = forward, left = backward.
      // Scale so ~300px/s drag ≈ 1× speed
      const v = Math.max(-4, Math.min(4, (dx / dt) / 300));
      velocityRef.current = v;
      setScratchVelocity(deckId, v);
      lastXRef.current = ev.clientX;
      lastTimeRef.current = now;
    };

    const onMouseUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);

      // Momentum decay back to 1× over 300ms (cubic ease-out)
      const fromV = velocityRef.current;
      const startTime = performance.now();
      const DECAY_MS = 300;
      const decay = () => {
        const elapsed = performance.now() - startTime;
        const t = Math.min(1, elapsed / DECAY_MS);
        const eased = 1 - (1 - t) * (1 - t) * (1 - t);
        const v = fromV + (1 - fromV) * eased;
        setScratchVelocity(deckId, v);
        if (t < 1) {
          decayRafRef.current = requestAnimationFrame(decay);
        } else {
          decayRafRef.current = 0;
          stopScratch(deckId, 0);
        }
      };
      decayRafRef.current = requestAnimationFrame(decay);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [deckId, seekToFraction]);

  if (!waveformPeaks || waveformPeaks.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="w-full h-16 shrink-0 bg-dark-bg border border-dark-border rounded-sm overflow-hidden cursor-pointer"
      onMouseDown={handleMouseDown}
    />
  );
};
