/**
 * PixiDeckBeatGrid — Pure Pixi.js Graphics beat grid overlay.
 *
 * Replaces the DOM OffscreenCanvas + worker-based DeckBeatGrid.
 * Draws beat tick marks from either:
 *   1. Analysis-derived beat grid (essentia.js via DJPipeline) — priority
 *   2. Serato beat markers (audio file metadata)
 */

import { useCallback } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { useDJStore } from '@/stores/useDJStore';

const W = 280;
const H = 32;

interface Props {
  deckId: 'A' | 'B' | 'C';
}

export const PixiDeckBeatGrid: React.FC<Props> = ({ deckId }) => {
  const analysisBeatGrid = useDJStore(s => s.decks[deckId].beatGrid);
  const seratoBeatGrid = useDJStore(s => s.decks[deckId].seratoBeatGrid);
  const audioPosition = useDJStore(s => s.decks[deckId].audioPosition);
  const durationMs = useDJStore(s => s.decks[deckId].durationMs);
  const songPos = useDJStore(s => s.decks[deckId].songPos);
  const totalPositions = useDJStore(s => s.decks[deckId].totalPositions);

  const hasAnalysis = analysisBeatGrid !== null && analysisBeatGrid.beats.length > 0;
  const hasSerato = seratoBeatGrid.length > 0;

  const draw = useCallback((g: GraphicsType) => {
    g.clear();

    if (hasAnalysis && analysisBeatGrid) {
      // ── Analysis beat grid (essentia.js) ──
      const beats = analysisBeatGrid.beats;
      const downbeats = new Set(analysisBeatGrid.downbeats.map(d => d.toFixed(3)));
      const totalDuration = durationMs > 0 ? durationMs / 1000 : beats[beats.length - 1] + 1;
      const currentPos = durationMs > 0
        ? audioPosition
        : (totalPositions > 0 ? (songPos + 0.5) / totalPositions : 0) * totalDuration;

      for (const beat of beats) {
        const x = Math.round((beat / totalDuration) * W);
        const isDownbeat = downbeats.has(beat.toFixed(3));

        if (isDownbeat) {
          g.rect(x, 0, 1, H);
          g.fill({ color: 0xffffff, alpha: 0.35 });
        } else {
          const tickH = Math.round(H * 0.3);
          g.rect(x, H - tickH, 1, tickH);
          g.fill({ color: 0xffffff, alpha: 0.12 });
        }
      }

      // Nearest-beat glow
      if (beats.length > 0) {
        let nearestBeat = beats[0];
        let minDist = Math.abs(currentPos - beats[0]);
        for (const b of beats) {
          const dist = Math.abs(currentPos - b);
          if (dist < minDist) { minDist = dist; nearestBeat = b; }
        }
        if (minDist < 0.1) {
          const bx = Math.round((nearestBeat / totalDuration) * W);
          const glowAlpha = 0.15 + 0.3 * (1 - minDist / 0.1);
          g.rect(bx - 2, 0, 5, H);
          g.fill({ color: 0xfbbf24, alpha: glowAlpha });
        }
      }
    } else if (hasSerato && durationMs > 0) {
      // ── Serato beat markers ──
      const durationSec = durationMs / 1000;

      for (let i = 0; i < seratoBeatGrid.length - 1; i++) {
        const marker = seratoBeatGrid[i];
        const nextMarker = seratoBeatGrid[i + 1];
        if (marker.beatsUntilNextMarker <= 0) continue;

        const beatDuration = (nextMarker.position - marker.position) / marker.beatsUntilNextMarker;
        if (beatDuration <= 0) continue;

        for (let b = 0; b < marker.beatsUntilNextMarker; b++) {
          const beatTime = marker.position + b * beatDuration;
          const x = Math.round((beatTime / durationSec) * W);
          const isDownbeat = b % 4 === 0;
          const tickH = isDownbeat ? Math.round(H * 0.5) : Math.round(H * 0.25);
          g.rect(x, H - tickH, 1, tickH);
          g.fill({ color: 0xffffff, alpha: isDownbeat ? 0.25 : 0.08 });
        }
      }

      // Current position highlight
      const currentX = Math.round((audioPosition / durationSec) * W);
      g.rect(currentX - 1, 0, 2, H);
      g.fill({ color: 0xffc800, alpha: 0.4 });
    }
  }, [analysisBeatGrid, seratoBeatGrid, audioPosition, durationMs, songPos, totalPositions, hasAnalysis, hasSerato]);

  if (!hasAnalysis && !hasSerato) return null;

  return (
    <pixiGraphics
      draw={draw}
      layout={{ width: W, height: H }}
    />
  );
};
