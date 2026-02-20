/**
 * DeckBeatGrid - Beat indicator overlay on the track overview bar
 *
 * Canvas rendering runs on a background thread via OffscreenCanvas.
 * Transparent overlay meant to be layered on top of DeckTrackOverview.
 */

import React, { useRef, useEffect } from 'react';
import { useDJStore } from '@/stores/useDJStore';
import { OffscreenBridge } from '@engine/renderer/OffscreenBridge';
import BeatGridWorkerFactory from '@/workers/dj-beatgrid.worker.ts?worker';

interface DeckBeatGridProps {
  deckId: 'A' | 'B';
  height?: number;
}

interface BeatMarker {
  position: number;
  beatsUntilNextMarker: number;
}

type BeatGridMsg =
  | { type: 'init'; canvas: OffscreenCanvas; dpr: number; width: number; height: number; beatGrid: BeatMarker[]; durationMs: number; audioPosition: number }
  | { type: 'beatGrid'; beatGrid: BeatMarker[]; durationMs: number }
  | { type: 'position'; audioPosition: number }
  | { type: 'resize'; w: number; h: number; dpr: number };

export const DeckBeatGrid: React.FC<DeckBeatGridProps> = ({ deckId, height = 24 }) => {
  const canvasRef    = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const bridgeRef    = useRef<OffscreenBridge<BeatGridMsg, { type: string }> | null>(null);

  const beatGrid    = useDJStore((s) => s.decks[deckId].seratoBeatGrid);
  const playbackMode = useDJStore((s) => s.decks[deckId].playbackMode);

  // ── Bridge init ────────────────────────────────────────────────────────────
  // Canvas created imperatively — prevents StrictMode double-transferControlToOffscreen error.

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !('transferControlToOffscreen' in HTMLCanvasElement.prototype)) return;
    if (playbackMode !== 'audio' || beatGrid.length === 0) return;

    const canvas = document.createElement('canvas');
    canvas.style.cssText = `display:block;width:100%;height:${height}px`;
    container.appendChild(canvas);
    canvasRef.current = canvas;

    const dpr  = window.devicePixelRatio || 1;
    const w    = Math.max(1, container.clientWidth);
    const deck = useDJStore.getState().decks[deckId];
    const offscreen = canvas.transferControlToOffscreen();

    const bridge = new OffscreenBridge<BeatGridMsg, { type: string }>(
      BeatGridWorkerFactory, { onReady: () => {} },
    );
    bridgeRef.current = bridge;

    bridge.post({
      type: 'init',
      canvas: offscreen,
      dpr, width: w, height,
      beatGrid:      deck.seratoBeatGrid,
      durationMs:    deck.durationMs,
      audioPosition: deck.audioPosition,
    }, [offscreen]);

    // Position updates
    const unsubPos = useDJStore.subscribe(
      (s) => s.decks[deckId].audioPosition,
      (audioPosition) => bridgeRef.current?.post({ type: 'position', audioPosition }),
    );

    // Beat grid / duration changes
    const unsubGrid = useDJStore.subscribe(
      (s) => s.decks[deckId].seratoBeatGrid,
      (newBeatGrid) => bridgeRef.current?.post({
        type: 'beatGrid',
        beatGrid: newBeatGrid,
        durationMs: useDJStore.getState().decks[deckId].durationMs,
      }),
    );

    // Resize observer
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = Math.floor(entry.contentRect.width);
      if (w > 0) {
        bridgeRef.current?.post({ type: 'resize', w, h: height, dpr: window.devicePixelRatio || 1 });
      }
    });
    observer.observe(container);

    return () => {
      unsubPos();
      unsubGrid();
      observer.disconnect();
      bridge.dispose();
      bridgeRef.current = null;
      canvas.remove();
      canvasRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId, playbackMode, beatGrid.length > 0, height]);

  if (playbackMode !== 'audio' || beatGrid.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none"
      style={{ height }}
    />
  );
};
