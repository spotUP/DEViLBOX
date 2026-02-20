/**
 * DeckBeatGrid - Beat indicator overlay on the track overview bar
 *
 * Shows tick marks at each beat position derived from the Serato beatgrid.
 * Renders as a transparent overlay meant to be layered on top of DeckTrackOverview.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { useDJStore } from '@/stores/useDJStore';

interface DeckBeatGridProps {
  deckId: 'A' | 'B';
  height?: number;
}

export const DeckBeatGrid: React.FC<DeckBeatGridProps> = ({ deckId, height = 24 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  const beatGrid = useDJStore((s) => s.decks[deckId].seratoBeatGrid);
  const durationMs = useDJStore((s) => s.decks[deckId].durationMs);
  const playbackMode = useDJStore((s) => s.decks[deckId].playbackMode);
  const audioPosition = useDJStore((s) => s.decks[deckId].audioPosition);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const width = container.clientWidth;

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    if (beatGrid.length === 0 || durationMs <= 0) return;

    const durationSec = durationMs / 1000;

    // Draw beat ticks by iterating through beat markers
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    const downbeatColor = 'rgba(255, 255, 255, 0.25)';

    for (let i = 0; i < beatGrid.length - 1; i++) {
      const marker = beatGrid[i];
      const nextMarker = beatGrid[i + 1];
      if (marker.beatsUntilNextMarker <= 0) continue;

      const beatDuration = (nextMarker.position - marker.position) / marker.beatsUntilNextMarker;
      if (beatDuration <= 0) continue;

      for (let b = 0; b < marker.beatsUntilNextMarker; b++) {
        const beatTime = marker.position + b * beatDuration;
        const x = (beatTime / durationSec) * width;
        const isDownbeat = b % 4 === 0;

        ctx.fillStyle = isDownbeat ? downbeatColor : 'rgba(255, 255, 255, 0.08)';
        const tickH = isDownbeat ? height * 0.5 : height * 0.25;
        ctx.fillRect(Math.round(x), height - tickH, 1, tickH);
      }
    }

    // Current beat highlight
    const currentBeatX = (audioPosition / durationSec) * width;
    ctx.fillStyle = 'rgba(255, 200, 0, 0.4)';
    ctx.fillRect(Math.round(currentBeatX) - 1, 0, 2, height);

    rafRef.current = requestAnimationFrame(draw);
  }, [beatGrid, durationMs, audioPosition, height]);

  useEffect(() => {
    if (playbackMode !== 'audio' || beatGrid.length === 0) return;
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw, playbackMode, beatGrid]);

  if (playbackMode !== 'audio' || beatGrid.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none"
      style={{ height }}
    >
      <canvas
        ref={canvasRef}
        className="block"
        style={{ width: '100%', height }}
      />
    </div>
  );
};
