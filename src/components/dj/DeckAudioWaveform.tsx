/**
 * DeckAudioWaveform - Scrolling waveform display for audio files
 *
 * Shows a zoomed-in waveform centered on the current playback position.
 * Cue points shown as colored vertical lines.
 * Falls back to the standard DeckVisualizer when no waveform data exists.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { useDJStore } from '@/stores/useDJStore';
import type { SeratoCuePoint } from '@/lib/serato/seratoMetadata';

interface DeckAudioWaveformProps {
  deckId: 'A' | 'B';
}

export const DeckAudioWaveform: React.FC<DeckAudioWaveformProps> = ({ deckId }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  const waveformPeaks = useDJStore((s) => s.decks[deckId].waveformPeaks);
  const durationMs = useDJStore((s) => s.decks[deckId].durationMs);
  const audioPosition = useDJStore((s) => s.decks[deckId].audioPosition);
  const cuePoints = useDJStore((s) => s.decks[deckId].seratoCuePoints);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !waveformPeaks || waveformPeaks.length === 0) return;

    const dpr = Math.min(window.devicePixelRatio, 2);
    const width = container.clientWidth;
    const height = container.clientHeight;
    const drawW = Math.round(width * dpr);
    const drawH = Math.round(height * dpr);

    if (canvas.width !== drawW || canvas.height !== drawH) {
      canvas.width = drawW;
      canvas.height = drawH;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Background
    ctx.fillStyle = '#0b0909';
    ctx.fillRect(0, 0, width, height);

    const durationSec = durationMs / 1000;
    if (durationSec <= 0) return;

    const numBins = waveformPeaks.length;
    const midY = height / 2;

    // Zoomed scrolling view: show ~10 seconds centered on playhead
    const windowSec = 10;
    const startSec = audioPosition - windowSec / 2;
    const endSec = audioPosition + windowSec / 2;

    // Map each pixel column to a waveform bin
    for (let px = 0; px < width; px++) {
      const timeSec = startSec + (px / width) * windowSec;
      const fraction = timeSec / durationSec;
      const binIndex = Math.floor(fraction * numBins);

      if (binIndex < 0 || binIndex >= numBins) continue;

      const amp = waveformPeaks[binIndex];
      const barH = amp * midY * 0.85;

      // Color by position relative to playhead (played = dimmer, upcoming = brighter)
      const isPast = timeSec < audioPosition;
      ctx.fillStyle = isPast
        ? 'rgba(80, 130, 220, 0.4)'
        : 'rgba(100, 170, 255, 0.7)';

      ctx.fillRect(px, midY - barH, 1, barH * 2);
    }

    // Draw cue point markers
    drawCueMarkers(ctx, cuePoints, startSec, endSec, windowSec, width, height);

    // Center playhead line
    const centerX = width / 2;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(centerX - 1, 0, 2, height);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fillRect(centerX - 1, 0, 2, height);

    // Time display at bottom-left
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '10px monospace';
    const min = Math.floor(audioPosition / 60);
    const sec = Math.floor(audioPosition % 60);
    const cs = Math.floor((audioPosition % 1) * 100);
    ctx.fillText(`${min}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`, 4, height - 4);

    rafRef.current = requestAnimationFrame(draw);
  }, [waveformPeaks, durationMs, audioPosition, cuePoints]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  if (!waveformPeaks || waveformPeaks.length === 0) return null;

  return (
    <div ref={containerRef} className="w-full h-full bg-dark-bg border border-dark-border rounded-sm overflow-hidden">
      <canvas
        ref={canvasRef}
        className="block w-full h-full"
      />
    </div>
  );
};

function drawCueMarkers(
  ctx: CanvasRenderingContext2D,
  cuePoints: SeratoCuePoint[],
  startSec: number,
  endSec: number,
  windowSec: number,
  width: number,
  height: number,
): void {
  for (const cue of cuePoints) {
    const cueSec = cue.position / 1000;
    if (cueSec < startSec || cueSec > endSec) continue;

    const x = ((cueSec - startSec) / windowSec) * width;

    // Vertical line
    ctx.fillStyle = cue.color + '80';
    ctx.fillRect(Math.round(x), 0, 1, height);

    // Small triangle at top
    ctx.fillStyle = cue.color;
    ctx.beginPath();
    ctx.moveTo(x - 3, 0);
    ctx.lineTo(x + 3, 0);
    ctx.lineTo(x, 5);
    ctx.closePath();
    ctx.fill();

    // Label
    if (cue.name) {
      ctx.fillStyle = cue.color;
      ctx.font = 'bold 8px monospace';
      ctx.fillText(cue.name, x + 3, 10);
    }
  }
}
