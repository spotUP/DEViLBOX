/**
 * DeckTrackOverview - Horizontal track overview bar showing song position
 *
 * Canvas rendering runs on a background thread via OffscreenCanvas.
 * Click-to-seek interaction stays on the main thread.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { useDJStore } from '@/stores/useDJStore';
import { useThemeStore } from '@stores';
import { getDJEngine } from '@/engine/dj/DJEngine';
import { OffscreenBridge } from '@engine/renderer/OffscreenBridge';
import OverviewWorkerFactory from '@/workers/dj-overview.worker.ts?worker';

interface DeckTrackOverviewProps {
  deckId: 'A' | 'B' | 'C';
}

import type { OverviewMsg, OverviewState, DeckColors } from '@engine/renderer/worker-types';

const BAR_HEIGHT = 24;

function snapshotColors(el: HTMLElement): DeckColors {
  const cs = getComputedStyle(el);
  return {
    bg:          cs.getPropertyValue('--color-bg').trim()           || '#0b0909',
    bgSecondary: cs.getPropertyValue('--color-bg-secondary').trim() || '#131010',
    bgTertiary:  cs.getPropertyValue('--color-bg-tertiary').trim()  || '#1d1818',
    border:      cs.getPropertyValue('--color-border').trim()       || '#2f2525',
  };
}

function snapshotDeck(d: ReturnType<typeof useDJStore.getState>['decks']['A']): OverviewState {
  return {
    playbackMode:     d.playbackMode,
    songPos:          d.songPos,
    totalPositions:   d.totalPositions,
    cuePoint:         d.cuePoint,
    loopActive:       d.loopActive,
    patternLoopStart: d.patternLoopStart,
    patternLoopEnd:   d.patternLoopEnd,
    audioPosition:    d.audioPosition,
    durationMs:       d.durationMs,
    // Convert Float32Array → plain number[] for structured clone
    waveformPeaks:    d.waveformPeaks ? Array.from(d.waveformPeaks) : null,
  };
}

export const DeckTrackOverview: React.FC<DeckTrackOverviewProps> = ({ deckId }) => {
  const canvasRef    = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const bridgeRef    = useRef<OffscreenBridge<OverviewMsg, { type: string }> | null>(null);

  // ── Bridge init ────────────────────────────────────────────────────────────
  // Canvas created imperatively — prevents StrictMode double-transferControlToOffscreen error.

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !('transferControlToOffscreen' in HTMLCanvasElement.prototype)) return;

    const canvas = document.createElement('canvas');
    canvas.className = 'block rounded-sm';
    canvas.style.cssText = `display:block;width:100%;height:${BAR_HEIGHT}px;border-radius:2px;`;
    container.appendChild(canvas);
    canvasRef.current = canvas;

    const dpr    = window.devicePixelRatio || 1;
    const w      = Math.max(1, container.clientWidth);
    const colors = snapshotColors(container);
    const deck   = useDJStore.getState().decks[deckId];
    const offscreen = canvas.transferControlToOffscreen();

    const bridge = new OffscreenBridge<OverviewMsg, { type: string }>(
      OverviewWorkerFactory, { onReady: () => {} },
    );
    bridgeRef.current = bridge;

    bridge.post({
      type: 'init', canvas: offscreen, dpr,
      width: w, height: BAR_HEIGHT, colors,
      ...snapshotDeck(deck),
    }, [offscreen]);

    // Deck state subscription
    const unsub = useDJStore.subscribe(
      (s) => s.decks[deckId],
      (deck) => bridgeRef.current?.post({ type: 'state', ...snapshotDeck(deck) }),
    );

    // Theme subscription
    const unsubTheme = useThemeStore.subscribe(() => {
      if (containerRef.current) {
        bridgeRef.current?.post({ type: 'colors', colors: snapshotColors(containerRef.current) });
      }
    });

    // Resize observer
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = Math.floor(entry.contentRect.width);
      if (w > 0) {
        bridgeRef.current?.post({ type: 'resize', w, h: BAR_HEIGHT, dpr: window.devicePixelRatio || 1 });
      }
    });
    observer.observe(container);

    return () => {
      unsub();
      unsubTheme();
      observer.disconnect();
      bridge.dispose();
      bridgeRef.current = null;
      canvas.remove();
      canvasRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId]);

  // ── Click to seek ──────────────────────────────────────────────────────────

  const handleClick = useCallback((e: React.MouseEvent) => {
    const container = containerRef.current;
    if (!container) return;
    const rect     = container.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

    try {
      const deck = getDJEngine().getDeck(deckId);
      if (deck.playbackMode === 'audio') {
        const seekSec = fraction * (useDJStore.getState().decks[deckId].durationMs / 1000);
        deck.audioPlayer.seek(seekSec);
        useDJStore.getState().setDeckState(deckId, { audioPosition: seekSec, elapsedMs: seekSec * 1000 });
      } else {
        const total = Math.max(useDJStore.getState().decks[deckId].totalPositions, 1);
        const targetPos = Math.floor(fraction * total);
        deck.cue(targetPos, 0);
        useDJStore.getState().setDeckPosition(deckId, targetPos, 0);
      }
    } catch { /* Engine not ready */ }
  }, [deckId]);

  return (
    <div
      ref={containerRef}
      className="w-full cursor-pointer"
      style={{ height: BAR_HEIGHT }}
      onClick={handleClick}
    />
  );
};
