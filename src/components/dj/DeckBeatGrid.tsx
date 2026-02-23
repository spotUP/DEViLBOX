/**
 * DeckBeatGrid - Beat indicator overlay on the track overview bar
 *
 * Canvas rendering runs on a background thread via OffscreenCanvas.
 * Transparent overlay meant to be layered on top of DeckTrackOverview.
 *
 * Supports two beat grid sources:
 *   1. Serato beat markers (from audio file metadata)
 *   2. Analysis-derived beat grid (from DJPipeline / essentia.js)
 * The analysis grid takes priority if both are available.
 */

import React, { useRef, useEffect } from 'react';
import { useDJStore } from '@/stores/useDJStore';
import { OffscreenBridge } from '@engine/renderer/OffscreenBridge';
import BeatGridWorkerFactory from '@/workers/dj-beatgrid.worker.ts?worker';

interface DeckBeatGridProps {
  deckId: 'A' | 'B' | 'C';
  height?: number;
}

import type { BeatGridMsg, AnalysisBeatGrid } from '@engine/renderer/worker-types';

export const DeckBeatGrid: React.FC<DeckBeatGridProps> = ({ deckId, height = 24 }) => {
  const canvasRef    = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const bridgeRef    = useRef<OffscreenBridge<BeatGridMsg, { type: string }> | null>(null);

  const seratoBeatGrid = useDJStore((s) => s.decks[deckId].seratoBeatGrid);
  const analysisBeatGrid = useDJStore((s) => s.decks[deckId].beatGrid);
  const playbackMode = useDJStore((s) => s.decks[deckId].playbackMode);

  // Show the overlay if we have ANY beat grid data (Serato OR analysis)
  const hasSerato = seratoBeatGrid.length > 0;
  const hasAnalysis = analysisBeatGrid !== null && analysisBeatGrid.beats.length > 0;
  const hasBeatData = hasSerato || hasAnalysis;

  // ── Bridge init ────────────────────────────────────────────────────────────
  // Canvas created imperatively — prevents StrictMode double-transferControlToOffscreen error.

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !('transferControlToOffscreen' in HTMLCanvasElement.prototype)) return;
    if (!hasBeatData) return;

    const canvas = document.createElement('canvas');
    canvas.style.cssText = `display:block;width:100%;height:${height}px`;
    container.appendChild(canvas);
    canvasRef.current = canvas;

    const dpr  = window.devicePixelRatio || 1;
    const w    = Math.max(1, container.clientWidth);
    const deck = useDJStore.getState().decks[deckId];
    const offscreen = canvas.transferControlToOffscreen();

    // Compute position fraction for tracker mode
    const posFrac = deck.playbackMode === 'tracker'
      ? (deck.totalPositions > 0 ? (deck.songPos + 0.5) / deck.totalPositions : 0)
      : 0;

    const bridge = new OffscreenBridge<BeatGridMsg, { type: string }>(
      BeatGridWorkerFactory, { onReady: () => {} },
    );
    bridgeRef.current = bridge;

    bridge.post({
      type: 'init',
      canvas: offscreen,
      dpr, width: w, height,
      beatGrid:         deck.seratoBeatGrid,
      analysisBeatGrid: deck.beatGrid as AnalysisBeatGrid | null,
      durationMs:       deck.durationMs,
      audioPosition:    deck.audioPosition,
      positionFraction: posFrac,
    }, [offscreen]);

    // Position updates
    const unsubPos = useDJStore.subscribe(
      (s) => [s.decks[deckId].audioPosition, s.decks[deckId].songPos, s.decks[deckId].totalPositions] as const,
      ([audioPos, sPos, total]) => {
        const frac = total > 0 ? (sPos + 0.5) / total : 0;
        bridgeRef.current?.post({ type: 'position', audioPosition: audioPos, positionFraction: frac });
      },
    );

    // Beat grid changes (Serato or analysis)
    const unsubGrid = useDJStore.subscribe(
      (s) => [s.decks[deckId].seratoBeatGrid, s.decks[deckId].beatGrid] as const,
      ([newSerato, newAnalysis]) => bridgeRef.current?.post({
        type: 'beatGrid',
        beatGrid: newSerato,
        analysisBeatGrid: newAnalysis as AnalysisBeatGrid | null,
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
  }, [deckId, playbackMode, hasBeatData, height]);

  if (!hasBeatData) return null;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none"
      style={{ height }}
    />
  );
};
