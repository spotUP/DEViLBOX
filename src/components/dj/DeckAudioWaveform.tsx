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
import { seekDeckAudio } from '@/engine/dj/DJActions';
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
      observer.disconnect();
      bridge.dispose();
      bridgeRef.current = null;
      canvas.remove();
      canvasRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId, hasPeaks]);

  // ── Beat snap helper ─────────────────────────────────────────────────────

  /** Snap a seek position to the nearest beat if within 150ms */
  const snapToNearestBeat = useCallback((seekSec: number): number => {
    const beats = useDJStore.getState().decks[deckId].beatGrid?.beats;
    if (!beats || beats.length === 0) return seekSec;
    let nearest = beats[0], minDist = Math.abs(seekSec - nearest);
    for (const b of beats) {
      const dist = Math.abs(seekSec - b);
      if (dist < minDist) { minDist = dist; nearest = b; }
      if (b > seekSec + 0.2) break; // sorted, stop early
    }
    return minDist < 0.15 ? nearest : seekSec;
  }, [deckId]);

  // ── Click / drag to seek ─────────────────────────────────────────────────

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
  const dragStartXRef = useRef(0);       // mouse X at drag start
  const dragStartPosRef = useRef(0);     // audioPosition (seconds) at drag start

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

    // Scrolling waveform zone → drag to scrub
    e.preventDefault();
    isDraggingRef.current = true;

    const state = useDJStore.getState().decks[deckId];
    dragStartXRef.current = e.clientX;
    dragStartPosRef.current = state.audioPosition;

    const WINDOW_SEC = 10;
    const durationSec = state.durationMs / 1000;

    const calcSeekSec = (clientX: number) => {
      const dx = clientX - dragStartXRef.current;
      // Dragging left = moving forward in time (waveform scrolls left)
      // Dragging right = moving backward
      const deltaSec = -(dx / rect.width) * WINDOW_SEC;
      return Math.max(0, Math.min(durationSec - 0.01, dragStartPosRef.current + deltaSec));
    };

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const seekSec = snapToNearestBeat(calcSeekSec(ev.clientX));
      markSeek(deckId);
      useDJStore.getState().setDeckState(deckId, { audioPosition: seekSec, elapsedMs: seekSec * 1000 });
    };

    const onMouseUp = (ev: MouseEvent) => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        // Snap to beat on release for clean alignment
        const seekSec = snapToNearestBeat(calcSeekSec(ev.clientX));
        const dur = useDJStore.getState().decks[deckId].durationMs / 1000;
        if (dur > 0) seekToFraction(seekSec / dur);
      }
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
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
