/**
 * DJ Track Overview Render Worker — OffscreenCanvas Canvas 2D
 *
 * Renders the horizontal track overview bar: pattern segments, waveform peaks,
 * loop region, cue marker, position marker, near-end warning pulse.
 */

import type { OverviewMsg, OverviewState, DeckColors } from '../engine/renderer/worker-types';

// ─── Constants ────────────────────────────────────────────────────────────────

const POSITION_COLOR  = '#ef4444';
const CUE_COLOR       = '#f59e0b';
const LOOP_COLOR      = 'rgba(6, 182, 212, 0.25)';
const LOOP_BORDER     = 'rgba(6, 182, 212, 0.6)';

// ─── Worker state ─────────────────────────────────────────────────────────────

let offCanvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let dpr = 1, width = 400, height = 24;
let colors: DeckColors = {
  bg: '#0b0909', bgSecondary: '#131010', bgTertiary: '#1d1818', border: '#2f2525',
};

let playbackMode    = 'tracker';
let songPos         = 0;
let totalPositions  = 1;
let cuePoint        = -1;
let loopActive      = false;
let patternLoopStart = 0, patternLoopEnd = 0;
let audioPosition   = 0;
let durationMs      = 0;
let waveformPeaks: number[] | null = null;
let frequencyPeaks: number[][] | null = null;
let pulsePhase      = 0;
let dirty           = true;

// ─── Message handler ──────────────────────────────────────────────────────────

self.onmessage = (e: MessageEvent<OverviewMsg>) => {
  const msg = e.data;
  switch (msg.type) {
    case 'init':
      offCanvas = msg.canvas;
      offCanvas.width  = Math.round(msg.width  * msg.dpr);
      offCanvas.height = Math.round(msg.height * msg.dpr);
      ctx    = offCanvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
      dpr    = msg.dpr; width = msg.width; height = msg.height;
      colors = msg.colors;
      applyStateMsg(msg);
      startRAF();
      (self as unknown as Worker).postMessage({ type: 'ready' });
      break;
    case 'state':
      applyStateMsg(msg);
      dirty = true;
      break;
    case 'resize':
      dpr = msg.dpr; width = msg.w; height = msg.h;
      if (offCanvas) {
        offCanvas.width  = Math.round(width  * dpr);
        offCanvas.height = Math.round(height * dpr);
      }
      dirty = true;
      break;
    case 'colors':
      colors = msg.colors;
      dirty = true;
      break;
  }
};

function applyStateMsg(msg: OverviewState): void {
  playbackMode     = msg.playbackMode;
  songPos          = msg.songPos;
  totalPositions   = msg.totalPositions;
  cuePoint         = msg.cuePoint;
  loopActive       = msg.loopActive;
  patternLoopStart = msg.patternLoopStart;
  patternLoopEnd   = msg.patternLoopEnd;
  audioPosition    = msg.audioPosition;
  durationMs       = msg.durationMs;
  waveformPeaks    = msg.waveformPeaks;
  frequencyPeaks   = msg.frequencyPeaks;
}

// ─── RAF loop ─────────────────────────────────────────────────────────────────

function startRAF(): void {
  const tick = () => {
    if (dirty || pulsePhase > 0) renderFrame();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function renderFrame(): void {
  if (!ctx) return;
  dirty = false;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Background
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, width, height);

  if (playbackMode === 'audio') {
    // ── Audio file mode ──
    const durationSec = durationMs / 1000;

    if (waveformPeaks && waveformPeaks.length > 0 && durationSec > 0) {
      const numBins = waveformPeaks.length;
      const binWidth = width / numBins;
      const midY = height / 2;

      // Use 3-band frequency-colored waveform if analysis data available
      if (frequencyPeaks && frequencyPeaks.length === 3 && frequencyPeaks[0].length > 0) {
        const low = frequencyPeaks[0];
        const mid = frequencyPeaks[1];
        const high = frequencyPeaks[2];
        const freqBins = low.length;
        const freqBinWidth = width / freqBins;
        const freqMidY = midY;

        for (let i = 0; i < freqBins; i++) {
          const x = i * freqBinWidth;
          const bw = Math.max(1, freqBinWidth - 0.5);

          // Stack: low (bottom, blue) → mid (green) → high (top, orange)
          const lowH  = low[i]  * freqMidY * 0.9;
          const midH  = mid[i]  * freqMidY * 0.9;
          const highH = high[i] * freqMidY * 0.9;

          // Low band — blue
          if (lowH > 0.5) {
            ctx.fillStyle = 'rgba(60, 130, 246, 0.7)';
            ctx.fillRect(x, freqMidY - lowH, bw, lowH * 2);
          }
          // Mid band — green
          if (midH > 0.5) {
            ctx.fillStyle = 'rgba(74, 222, 128, 0.55)';
            ctx.fillRect(x, freqMidY - midH, bw, midH * 2);
          }
          // High band — orange/yellow
          if (highH > 0.5) {
            ctx.fillStyle = 'rgba(251, 191, 36, 0.5)';
            ctx.fillRect(x, freqMidY - highH, bw, highH * 2);
          }
        }
      } else {
        // Fallback: single-color waveform
        for (let i = 0; i < numBins; i++) {
          const amp = waveformPeaks[i];
          const barH = amp * midY * 0.9;
          ctx.fillStyle = 'rgba(100, 160, 255, 0.5)';
          ctx.fillRect(i * binWidth, midY - barH, Math.max(1, binWidth - 0.5), barH * 2);
        }
      }
    } else {
      ctx.fillStyle = colors.bgSecondary;
      ctx.fillRect(0, 0, width, height);
    }

    const progress = durationSec > 0 ? audioPosition / durationSec : 0;
    if (progress > 0.85 && durationSec > 0) {
      pulsePhase += 0.08;
      ctx.fillStyle = `rgba(239, 68, 68, ${0.15 + 0.15 * Math.sin(pulsePhase)})`;
      ctx.fillRect(0, 0, width, height);
    } else {
      pulsePhase = 0;
    }

    if (durationSec > 0) {
      const posX = (audioPosition / durationSec) * width;
      ctx.fillStyle = POSITION_COLOR;
      ctx.fillRect(posX - 1, 0, 2, height);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(posX, 0, 1, height);
    }
  } else {
    // ── Tracker module mode ──
    const total = Math.max(totalPositions, 1);
    const segW = width / total;

    for (let i = 0; i < total; i++) {
      ctx.fillStyle = i % 2 === 0 ? colors.bgSecondary : colors.bgTertiary;
      const x = Math.floor(i * segW);
      ctx.fillRect(x, 0, Math.ceil(segW), height);
      if (i > 0) {
        ctx.fillStyle = colors.border;
        ctx.fillRect(x, 0, 1, height);
      }
    }

    // Draw note density / frequency waveform over the pattern segments
    if (waveformPeaks && waveformPeaks.length > 0) {
      const numBins = waveformPeaks.length;
      const binWidth = width / numBins;
      const midY = height / 2;

      // Use 3-band frequency-colored waveform if analysis data available
      if (frequencyPeaks && frequencyPeaks.length === 3 && frequencyPeaks[0].length > 0) {
        const low = frequencyPeaks[0];
        const mid = frequencyPeaks[1];
        const high = frequencyPeaks[2];
        const freqBins = low.length;
        const freqBinWidth = width / freqBins;

        for (let i = 0; i < freqBins; i++) {
          const x = i * freqBinWidth;
          const bw = Math.max(1, freqBinWidth - 0.5);
          const lowH  = low[i]  * midY * 0.85;
          const midH  = mid[i]  * midY * 0.85;
          const highH = high[i] * midY * 0.85;

          if (lowH > 0.5) {
            ctx.fillStyle = 'rgba(60, 130, 246, 0.55)';
            ctx.fillRect(x, midY - lowH, bw, lowH * 2);
          }
          if (midH > 0.5) {
            ctx.fillStyle = 'rgba(74, 222, 128, 0.4)';
            ctx.fillRect(x, midY - midH, bw, midH * 2);
          }
          if (highH > 0.5) {
            ctx.fillStyle = 'rgba(251, 191, 36, 0.35)';
            ctx.fillRect(x, midY - highH, bw, highH * 2);
          }
        }
      } else {
        // Fallback: single-color note density
        for (let i = 0; i < numBins; i++) {
          const amp = waveformPeaks[i];
          if (amp <= 0) continue;
          const barH = amp * midY * 0.85;
          ctx.fillStyle = 'rgba(140, 180, 255, 0.4)';
          ctx.fillRect(i * binWidth, midY - barH, Math.max(1, binWidth - 0.5), barH * 2);
        }
      }
    }

    const progress = songPos / total;
    if (progress > 0.85 && total > 0) {
      pulsePhase += 0.08;
      ctx.fillStyle = `rgba(239, 68, 68, ${0.15 + 0.15 * Math.sin(pulsePhase)})`;
      ctx.fillRect(0, 0, width, height);
    } else {
      pulsePhase = 0;
    }

    if (loopActive && patternLoopEnd > patternLoopStart) {
      const lx = (patternLoopStart / total) * width;
      const lw = ((patternLoopEnd - patternLoopStart) / total) * width;
      ctx.fillStyle = LOOP_COLOR;
      ctx.fillRect(lx, 0, lw, height);
      ctx.fillStyle = LOOP_BORDER;
      ctx.fillRect(lx, 0, 1, height);
      ctx.fillRect(lx + lw - 1, 0, 1, height);
    }

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

    if (total > 0) {
      const posX = ((songPos + 0.5) / total) * width;
      ctx.fillStyle = POSITION_COLOR;
      ctx.fillRect(posX - 1, 0, 2, height);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(posX, 0, 1, height);
    }
  }

  // Border
  ctx.strokeStyle = colors.border;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
}
