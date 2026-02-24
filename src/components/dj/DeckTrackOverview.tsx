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
    frequencyPeaks:   d.frequencyPeaks
      ? d.frequencyPeaks.map(band => Array.from(band))
      : null,
  };
}

export const DeckTrackOverview: React.FC<DeckTrackOverviewProps> = ({ deckId }) => {
  const analysisState = useDJStore((s) => s.decks[deckId].analysisState);
  const analysisProgress = useDJStore((s) => s.decks[deckId].analysisProgress);
  
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

  // ── Click / drag to seek (scrub) ─────────────────────────────────────────

  /** Perform an actual audio seek to a fraction of the song */
  const seekToFraction = useCallback((fraction: number) => {
    const f = Math.max(0, Math.min(1, fraction));
    try {
      const deck = getDJEngine().getDeck(deckId);
      if (deck.playbackMode === 'audio') {
        const seekSec = f * (useDJStore.getState().decks[deckId].durationMs / 1000);
        deck.audioPlayer.seek(seekSec);
        useDJStore.getState().setDeckState(deckId, { audioPosition: seekSec, elapsedMs: seekSec * 1000 });
      } else {
        const total = Math.max(useDJStore.getState().decks[deckId].totalPositions, 1);
        const targetPos = Math.min(Math.floor(f * total), total - 1);
        deck.cue(targetPos, 0);
        useDJStore.getState().setDeckPosition(deckId, targetPos, 0);
      }
    } catch { /* Engine not ready */ }
  }, [deckId]);

  /** Update only the visual position marker (no audio seek — prevents noise during drag) */
  const previewPosition = useCallback((fraction: number) => {
    const f = Math.max(0, Math.min(1, fraction));
    try {
      const state = useDJStore.getState().decks[deckId];
      if (state.playbackMode === 'audio') {
        const seekSec = f * (state.durationMs / 1000);
        useDJStore.getState().setDeckState(deckId, { audioPosition: seekSec, elapsedMs: seekSec * 1000 });
      } else {
        const total = Math.max(state.totalPositions, 1);
        const targetPos = Math.min(Math.floor(f * total), total - 1);
        useDJStore.getState().setDeckPosition(deckId, targetPos, 0);
      }
    } catch { /* Engine not ready */ }
  }, [deckId]);

  const isDraggingRef = useRef(false);
  const lastFractionRef = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    lastFractionRef.current = fraction;
    // Initial click: do the actual seek
    seekToFraction(fraction);

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current || !container) return;
      const r = container.getBoundingClientRect();
      const f = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
      lastFractionRef.current = f;
      // During drag: only update visual position (no audio seek → no noise)
      previewPosition(f);
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
      // Final position: do the actual seek
      seekToFraction(lastFractionRef.current);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [seekToFraction, previewPosition]);

  return (
    <div
      ref={containerRef}
      className="w-full cursor-pointer relative"
      style={{ height: BAR_HEIGHT }}
      onMouseDown={handleMouseDown}
    >
      {(analysisState === 'rendering' || analysisState === 'analyzing') && (
        <div 
          className="absolute inset-0 pointer-events-none z-10 overflow-hidden rounded-sm"
          style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
        >
          <div 
            className={`h-full transition-all duration-500 ease-out ${analysisState === 'rendering' ? 'bg-blue-500/40' : 'bg-purple-500/40'}`}
            style={{ width: `${analysisProgress}%` }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[10px] font-bold text-white/70 tracking-tighter uppercase">
              {analysisState} {analysisProgress}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
