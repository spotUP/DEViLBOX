/**
 * DeckTrackOverview - Horizontal track overview bar showing song position
 *
 * Canvas-based rendering for performance. Shows pattern segments with alternating
 * colors, current position marker, cue point indicator, loop region overlay,
 * and near-end warning pulse.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';

interface DeckTrackOverviewProps {
  deckId: 'A' | 'B';
}

// Colors — resolved from CSS variables at render time via getComputedStyle
// Fallbacks match the design system defaults for --color-* tokens
const POSITION_COLOR = '#ef4444';  // accent
const CUE_COLOR = '#f59e0b';       // warning
const LOOP_COLOR = 'rgba(6, 182, 212, 0.25)';
const LOOP_BORDER_COLOR = 'rgba(6, 182, 212, 0.6)';

const BAR_HEIGHT = 24;

export const DeckTrackOverview: React.FC<DeckTrackOverviewProps> = ({ deckId }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);
  const pulsePhaseRef = useRef(0);

  // Subscribe to relevant store slices
  const playbackMode = useDJStore((s) => s.decks[deckId].playbackMode);
  const songPos = useDJStore((s) => s.decks[deckId].songPos);
  const totalPositions = useDJStore((s) => s.decks[deckId].totalPositions);
  const cuePoint = useDJStore((s) => s.decks[deckId].cuePoint);
  const loopActive = useDJStore((s) => s.decks[deckId].loopActive);
  const patternLoopStart = useDJStore((s) => s.decks[deckId].patternLoopStart);
  const patternLoopEnd = useDJStore((s) => s.decks[deckId].patternLoopEnd);
  const audioPosition = useDJStore((s) => s.decks[deckId].audioPosition);
  const durationMs = useDJStore((s) => s.decks[deckId].durationMs);
  const waveformPeaks = useDJStore((s) => s.decks[deckId].waveformPeaks);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const width = container.clientWidth;
    const height = BAR_HEIGHT;

    // Resize canvas if needed
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Read CSS variables for design system colors
    const cs = getComputedStyle(container);
    const bgColor = cs.getPropertyValue('--color-bg').trim() || '#0b0909';
    const bgSecondary = cs.getPropertyValue('--color-bg-secondary').trim() || '#131010';
    const bgTertiary = cs.getPropertyValue('--color-bg-tertiary').trim() || '#1d1818';
    const borderColor = cs.getPropertyValue('--color-border').trim() || '#2f2525';

    // Background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    if (playbackMode === 'audio') {
      // ── Audio file mode — draw waveform overview ──
      const durationSec = durationMs / 1000;

      if (waveformPeaks && waveformPeaks.length > 0 && durationSec > 0) {
        // Draw waveform peaks
        const numBins = waveformPeaks.length;
        const binWidth = width / numBins;
        const midY = height / 2;

        for (let i = 0; i < numBins; i++) {
          const amp = waveformPeaks[i];
          const barH = amp * midY * 0.9;
          const x = i * binWidth;

          ctx.fillStyle = 'rgba(100, 160, 255, 0.5)';
          ctx.fillRect(x, midY - barH, Math.max(1, binWidth - 0.5), barH * 2);
        }
      } else {
        // No waveform data — show empty bar
        ctx.fillStyle = bgSecondary;
        ctx.fillRect(0, 0, width, height);
      }

      // Near-end warning pulse (> 85%)
      const progress = durationSec > 0 ? audioPosition / durationSec : 0;
      if (progress > 0.85 && durationSec > 0) {
        pulsePhaseRef.current += 0.08;
        const alpha = 0.15 + 0.15 * Math.sin(pulsePhaseRef.current);
        ctx.fillStyle = `rgba(239, 68, 68, ${alpha})`;
        ctx.fillRect(0, 0, width, height);
      } else {
        pulsePhaseRef.current = 0;
      }

      // Current position marker
      if (durationSec > 0) {
        const posX = (audioPosition / durationSec) * width;

        ctx.fillStyle = POSITION_COLOR;
        ctx.fillRect(posX - 1, 0, 2, height);

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(posX, 0, 1, height);
      }
    } else {
      // ── Tracker module mode — draw pattern segments ──
      const total = Math.max(totalPositions, 1);

      const segmentWidth = width / total;
      for (let i = 0; i < total; i++) {
        ctx.fillStyle = i % 2 === 0 ? bgSecondary : bgTertiary;
        const x = Math.floor(i * segmentWidth);
        const w = Math.ceil(segmentWidth);
        ctx.fillRect(x, 0, w, height);

        if (i > 0) {
          ctx.fillStyle = borderColor;
          ctx.fillRect(x, 0, 1, height);
        }
      }

      // Near-end warning pulse (> 85% of total)
      const progress = songPos / total;
      if (progress > 0.85 && total > 0) {
        pulsePhaseRef.current += 0.08;
        const alpha = 0.15 + 0.15 * Math.sin(pulsePhaseRef.current);
        ctx.fillStyle = `rgba(239, 68, 68, ${alpha})`;
        ctx.fillRect(0, 0, width, height);
      } else {
        pulsePhaseRef.current = 0;
      }

      // Loop region overlay
      if (loopActive && patternLoopEnd > patternLoopStart) {
        const loopStartX = (patternLoopStart / total) * width;
        const loopEndX = (patternLoopEnd / total) * width;
        const loopWidth = loopEndX - loopStartX;

        ctx.fillStyle = LOOP_COLOR;
        ctx.fillRect(loopStartX, 0, loopWidth, height);

        ctx.fillStyle = LOOP_BORDER_COLOR;
        ctx.fillRect(loopStartX, 0, 1, height);
        ctx.fillRect(loopEndX - 1, 0, 1, height);
      }

      // Cue point marker (small orange triangle below)
      if (cuePoint >= 0 && cuePoint < total) {
        const cueX = ((cuePoint + 0.5) / total) * width;
        ctx.fillStyle = CUE_COLOR;
        ctx.beginPath();
        ctx.moveTo(cueX - 4, height);
        ctx.lineTo(cueX + 4, height);
        ctx.lineTo(cueX, height - 6);
        ctx.closePath();
        ctx.fill();
      }

      // Current position marker (bright vertical line)
      if (total > 0) {
        const posX = ((songPos + 0.5) / total) * width;

        ctx.fillStyle = POSITION_COLOR;
        ctx.fillRect(posX - 1, 0, 2, height);

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(posX, 0, 1, height);
      }
    }

    // Border
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

    // Request next frame for smooth animation (especially for warning pulse)
    animFrameRef.current = requestAnimationFrame(draw);
  }, [playbackMode, songPos, totalPositions, cuePoint, loopActive, patternLoopStart, patternLoopEnd, audioPosition, durationMs, waveformPeaks]);

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(draw);
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [draw]);

  // Click to seek (audio mode)
  const handleClick = useCallback((e: React.MouseEvent) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

    try {
      const engine = getDJEngine();
      const deck = engine.getDeck(deckId);
      if (deck.playbackMode === 'audio') {
        const seekSec = fraction * (durationMs / 1000);
        deck.audioPlayer.seek(seekSec);
        useDJStore.getState().setDeckState(deckId, {
          audioPosition: seekSec,
          elapsedMs: seekSec * 1000,
        });
      } else {
        // Tracker mode: jump to song position
        const total = Math.max(totalPositions, 1);
        const targetPos = Math.floor(fraction * total);
        deck.cue(targetPos, 0);
        useDJStore.getState().setDeckPosition(deckId, targetPos, 0);
      }
    } catch {
      // Engine not ready
    }
  }, [deckId, playbackMode, durationMs, totalPositions]);

  return (
    <div
      ref={containerRef}
      className="w-full cursor-pointer"
      style={{ height: BAR_HEIGHT }}
      onClick={handleClick}
    >
      <canvas
        ref={canvasRef}
        className="block rounded-sm"
        style={{ width: '100%', height: BAR_HEIGHT }}
      />
    </div>
  );
};
