/**
 * DJ Combined Waveform Render Worker — OffscreenCanvas Canvas 2D
 *
 * Top strip: full-track overview minimap (frequency-colored, position/cue/loop markers)
 * Bottom area: scrolling zoomed waveform centered on current playhead position.
 */

import type { WaveformMsg, SerializedCuePoint, WaveformOverviewState, DeckColors } from '../engine/renderer/worker-types';

// ─── Constants ────────────────────────────────────────────────────────────────

const OVERVIEW_H      = 16;   // px height of the overview strip
const POSITION_COLOR  = '#ef4444';
const CUE_COLOR       = '#f59e0b';
const LOOP_COLOR      = 'rgba(6, 182, 212, 0.25)';
const LOOP_BORDER     = 'rgba(6, 182, 212, 0.6)';

// ─── Worker state ─────────────────────────────────────────────────────────────

let offCanvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let dpr = 1, width = 400, height = 120;

let waveformPeaks: number[] | null = null;
let durationMs    = 0;
let audioPosition = 0;
let cuePoints: SerializedCuePoint[] = [];
let dirty         = true;

// Other deck state (for overlay)
let otherPeaks: number[] | null = null;
let otherDurationMs    = 0;
let otherAudioPosition = 0;

// Overview state
let frequencyPeaks: number[][] | null = null;
let loopActive       = false;
let patternLoopStart = 0;
let patternLoopEnd   = 0;
let cuePoint         = -1;
let totalPositions   = 1;
let colors: DeckColors = { bg: '#6e1418', bgSecondary: '#7c1a1e', bgTertiary: '#8c2028', border: '#581014' };
let beats: number[] | null = null;
let downbeats: number[] | null = null;

// Stem waveform peaks for per-stem colored layers
let stemPeakData: Record<string, number[]> | null = null;

const STEM_RENDER_COLORS: Record<string, string> = {
  drums:  '249, 115, 22',   // orange
  bass:   '59, 130, 246',   // blue
  vocals: '236, 72, 153',   // pink
  other:  '34, 197, 94',    // green
  guitar: '168, 85, 247',   // purple
  piano:  '234, 179, 8',    // yellow
};

function applyOverview(ov: WaveformOverviewState): void {
  frequencyPeaks   = ov.frequencyPeaks;
  loopActive       = ov.loopActive;
  patternLoopStart = ov.patternLoopStart;
  patternLoopEnd   = ov.patternLoopEnd;
  cuePoint         = ov.cuePoint;
  totalPositions   = ov.totalPositions;
  colors           = ov.colors;
  beats            = ov.beats ?? null;
  downbeats        = ov.downbeats ?? null;
}

// ─── Message handler ──────────────────────────────────────────────────────────

self.onmessage = (e: MessageEvent<WaveformMsg>) => {
  const msg = e.data;
  switch (msg.type) {
    case 'init':
      offCanvas = msg.canvas;
      offCanvas.width  = Math.round(msg.width  * msg.dpr);
      offCanvas.height = Math.round(msg.height * msg.dpr);
      ctx           = offCanvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
      dpr           = msg.dpr; width = msg.width; height = msg.height;
      waveformPeaks = msg.waveformPeaks;
      durationMs    = msg.durationMs;
      audioPosition = msg.audioPosition;
      cuePoints     = msg.cuePoints;
      applyOverview(msg.overview);
      startRAF();
      (self as unknown as Worker).postMessage({ type: 'ready' });
      break;
    case 'waveformPeaks':
      waveformPeaks = msg.peaks;
      durationMs    = msg.durationMs;
      dirty = true;
      break;
    case 'position':
      audioPosition = msg.audioPosition;
      dirty = true;
      break;
    case 'cuePoints':
      cuePoints = msg.cuePoints;
      dirty = true;
      break;
    case 'overview':
      applyOverview(msg.overview);
      dirty = true;
      break;
    case 'otherDeck':
      if (msg.peaks !== null) otherPeaks = msg.peaks;
      otherDurationMs    = msg.durationMs;
      otherAudioPosition = msg.audioPosition;
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
    case 'stemPeaks':
      stemPeakData = msg.stems;
      dirty = true;
      break;
  }
};

// ─── RAF loop ─────────────────────────────────────────────────────────────────

function startRAF(): void {
  const tick = () => {
    if (dirty) renderFrame();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// ─── Overview strip (top) ─────────────────────────────────────────────────────

function renderOverview(): void {
  if (!ctx) return;
  const oh = OVERVIEW_H;
  const durationSec = durationMs / 1000;

  // Background
  ctx.fillStyle = colors.bgTertiary;
  ctx.fillRect(0, 0, width, oh);

  if (waveformPeaks && waveformPeaks.length > 0 && durationSec > 0) {
    const midY = oh / 2;

    if (stemPeakData && Object.keys(stemPeakData).length > 0) {
      // Stem-colored overview: render each stem as colored layer
      const stemOrder = ['other', 'bass', 'drums', 'vocals', 'guitar', 'piano'];
      const stemEntries = Object.entries(stemPeakData);
      stemEntries.sort((a, b) => {
        const ia = stemOrder.indexOf(a[0]);
        const ib = stemOrder.indexOf(b[0]);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      });

      for (const [stemName, peaks] of stemEntries) {
        const rgb = STEM_RENDER_COLORS[stemName] ?? '150, 150, 150';
        const stemBins = peaks.length;
        const binW = width / stemBins;

        for (let i = 0; i < stemBins; i++) {
          const barH = peaks[i] * midY * 0.9;
          if (barH < 0.3) continue;
          ctx.fillStyle = `rgba(${rgb}, 0.55)`;
          ctx.fillRect(i * binW, midY - barH, Math.max(1, binW - 0.3), barH * 2);
        }
      }
    } else if (frequencyPeaks && frequencyPeaks.length === 3 && frequencyPeaks[0].length > 0) {
      const low = frequencyPeaks[0], mid = frequencyPeaks[1], high = frequencyPeaks[2];
      const freqBins = low.length;
      const binW = width / freqBins;

      for (let i = 0; i < freqBins; i++) {
        const x = i * binW;
        const bw = Math.max(1, binW - 0.3);
        const lowH  = low[i]  * midY * 0.9;
        const midH  = mid[i]  * midY * 0.9;
        const highH = high[i] * midY * 0.9;

        if (lowH > 0.3)  { ctx.fillStyle = 'rgba(60, 130, 246, 0.7)';  ctx.fillRect(x, midY - lowH,  bw, lowH * 2);  }
        if (midH > 0.3)  { ctx.fillStyle = 'rgba(74, 222, 128, 0.55)'; ctx.fillRect(x, midY - midH,  bw, midH * 2);  }
        if (highH > 0.3) { ctx.fillStyle = 'rgba(251, 191, 36, 0.5)';  ctx.fillRect(x, midY - highH, bw, highH * 2); }
      }
    } else {
      const numBins = waveformPeaks.length;
      const binW = width / numBins;
      const midY2 = oh / 2;
      for (let i = 0; i < numBins; i++) {
        const barH = waveformPeaks[i] * midY2 * 0.9;
        ctx.fillStyle = 'rgba(100, 160, 255, 0.5)';
        ctx.fillRect(i * binW, midY2 - barH, Math.max(1, binW - 0.3), barH * 2);
      }
    }

    // Loop region
    if (loopActive && patternLoopEnd > patternLoopStart && totalPositions > 0) {
      const lx = (patternLoopStart / totalPositions) * width;
      const lw = ((patternLoopEnd - patternLoopStart) / totalPositions) * width;
      ctx.fillStyle = LOOP_COLOR;
      ctx.fillRect(lx, 0, lw, oh);
      ctx.fillStyle = LOOP_BORDER;
      ctx.fillRect(lx, 0, 1, oh);
      ctx.fillRect(lx + lw - 1, 0, 1, oh);
    }

    // Cue marker
    if (cuePoint >= 0 && totalPositions > 0) {
      const cueX = ((cuePoint + 0.5) / totalPositions) * width;
      ctx.fillStyle = CUE_COLOR;
      ctx.beginPath();
      ctx.moveTo(cueX - 3, oh); ctx.lineTo(cueX + 3, oh); ctx.lineTo(cueX, oh - 4);
      ctx.closePath(); ctx.fill();
    }

    // Position marker
    if (durationSec > 0) {
      const posX = (audioPosition / durationSec) * width;
      ctx.fillStyle = POSITION_COLOR;
      ctx.fillRect(posX - 1, 0, 2, oh);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(posX, 0, 1, oh);
    }
  }

  // Separator line
  ctx.fillStyle = colors.border;
  ctx.fillRect(0, oh - 0.5, width, 0.5);
}

// ─── Scrolling waveform (bottom) ──────────────────────────────────────────────

function renderScrollingWaveform(): void {
  if (!ctx || !waveformPeaks || waveformPeaks.length === 0) return;

  const durationSec = durationMs / 1000;
  if (durationSec <= 0) return;

  const topY = OVERVIEW_H;
  const wfH  = height - OVERVIEW_H;
  const midY = topY + wfH / 2;

  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, topY, width, wfH);

  const windowSec = 10;
  const startSec  = audioPosition - windowSec / 2;

  // ── Other deck waveform (background layer) ──
  if (otherPeaks && otherPeaks.length > 0 && otherDurationMs > 0) {
    const otherDurSec = otherDurationMs / 1000;
    const otherBins   = otherPeaks.length;
    // The other deck's waveform is centered on ITS playhead, mapped into OUR 10s window
    const otherStartSec = otherAudioPosition - windowSec / 2;

    for (let px = 0; px < width; px++) {
      const otherTimeSec = otherStartSec + (px / width) * windowSec;
      const otherFrac    = otherTimeSec / otherDurSec;
      const otherBin     = Math.floor(otherFrac * otherBins);
      if (otherBin < 0 || otherBin >= otherBins) continue;

      const amp  = otherPeaks[otherBin];
      const barH = amp * (wfH / 2) * 0.55;
      ctx.fillStyle = 'rgba(255, 100, 100, 0.18)';
      ctx.fillRect(px, midY - barH, 1, barH * 2);
    }

    // Other deck's center playhead (faint)
    const otherCenterX = width / 2;
    ctx.fillStyle = 'rgba(255, 100, 100, 0.25)';
    ctx.fillRect(otherCenterX - 0.5, topY, 1, wfH);
  }

  // ── This deck's waveform — stem-colored or frequency-band coloring ──
  const numBins = waveformPeaks.length;
  const hasStemData = stemPeakData && Object.keys(stemPeakData).length > 0;

  if (hasStemData) {
    // Stem-colored layers: render each stem as its own colored waveform layer
    const stemOrder = ['other', 'bass', 'drums', 'vocals', 'guitar', 'piano'];
    const stemEntries = Object.entries(stemPeakData!);
    stemEntries.sort((a, b) => {
      const ia = stemOrder.indexOf(a[0]);
      const ib = stemOrder.indexOf(b[0]);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });

    for (const [stemName, peaks] of stemEntries) {
      const rgb = STEM_RENDER_COLORS[stemName] ?? '150, 150, 150';
      const stemBins = peaks.length;

      for (let px = 0; px < width; px++) {
        const timeSec = startSec + (px / width) * windowSec;
        const fraction = timeSec / durationSec;
        const binIndex = Math.floor(fraction * stemBins);
        if (binIndex < 0 || binIndex >= stemBins) continue;

        const played = timeSec < audioPosition;
        const alpha = played ? 0.35 : 0.6;
        const amp = peaks[binIndex];
        const barH = amp * (wfH / 2) * 0.85;

        ctx.fillStyle = `rgba(${rgb}, ${alpha})`;
        ctx.fillRect(px, midY - barH, 1, barH * 2);
      }
    }
  } else {
    // Frequency-band coloring (no stems)
    const hasFreq = frequencyPeaks && frequencyPeaks.length === 3 && frequencyPeaks[0].length > 0;
    const freqLow  = hasFreq ? frequencyPeaks![0] : null;
    const freqMid  = hasFreq ? frequencyPeaks![1] : null;
    const freqHigh = hasFreq ? frequencyPeaks![2] : null;
    const freqBins = freqLow?.length ?? 0;

  for (let px = 0; px < width; px++) {
    const timeSec  = startSec + (px / width) * windowSec;
    const fraction = timeSec / durationSec;
    const binIndex = Math.floor(fraction * numBins);
    if (binIndex < 0 || binIndex >= numBins) continue;

    const played = timeSec < audioPosition;
    const alphaScale = played ? 0.5 : 1.0;

    if (freqLow && freqMid && freqHigh && freqBins > 0) {
      // Frequency-band coloring: stack low (blue) + mid (green) + high (yellow)
      const freqIdx = Math.floor(fraction * freqBins);
      if (freqIdx >= 0 && freqIdx < freqBins) {
        const lo = freqLow[freqIdx] ?? 0;
        const mi = freqMid[freqIdx] ?? 0;
        const hi = freqHigh[freqIdx] ?? 0;
        const halfH = wfH / 2;

        // Low band (bass) — blue, from center outward
        const loH = lo * halfH * 0.85;
        ctx.fillStyle = `rgba(60, 130, 246, ${0.7 * alphaScale})`;
        ctx.fillRect(px, midY - loH, 1, loH * 2);

        // Mid band — green, overlaid slightly shorter
        const miH = mi * halfH * 0.65;
        ctx.fillStyle = `rgba(74, 222, 128, ${0.55 * alphaScale})`;
        ctx.fillRect(px, midY - miH, 1, miH * 2);

        // High band — yellow/white, smallest
        const hiH = hi * halfH * 0.45;
        ctx.fillStyle = `rgba(251, 191, 36, ${0.5 * alphaScale})`;
        ctx.fillRect(px, midY - hiH, 1, hiH * 2);
      }
    } else {
      // Fallback: monochrome (no frequency data available)
      const amp  = waveformPeaks[binIndex];
      const barH = amp * (wfH / 2) * 0.85;
      ctx.fillStyle = played ? 'rgba(80, 130, 220, 0.4)' : 'rgba(100, 170, 255, 0.7)';
      ctx.fillRect(px, midY - barH, 1, barH * 2);
    }
  }
  } // end else (no stem data)

  // ── Beat grid ticks in scrolling view ──
  const endSec = audioPosition + windowSec / 2;
  const downbeatSet = downbeats ? new Set(downbeats.map(d => Math.round(d * 100))) : null;

  if (beats && beats.length > 0) {
    for (const beatSec of beats) {
      if (beatSec < startSec || beatSec > endSec) continue;
      const x = ((beatSec - startSec) / windowSec) * width;
      const isDownbeat = downbeatSet?.has(Math.round(beatSec * 100)) ?? false;

      if (isDownbeat) {
        // Downbeat (bar start): full height, brighter
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.fillRect(Math.round(x), topY, 1, wfH);
      } else {
        // Regular beat: half height, subtle
        ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.fillRect(Math.round(x), midY - wfH * 0.25, 1, wfH * 0.5);
      }
    }
  }

  // Cue markers in scrolling view
  for (const cue of cuePoints) {
    const cueSec = cue.position / 1000;
    if (cueSec < startSec || cueSec > endSec) continue;
    const x = ((cueSec - startSec) / windowSec) * width;

    ctx.fillStyle = cue.color + '80';
    ctx.fillRect(Math.round(x), topY, 1, wfH);

    ctx.fillStyle = cue.color;
    ctx.beginPath();
    ctx.moveTo(x - 3, topY); ctx.lineTo(x + 3, topY); ctx.lineTo(x, topY + 5);
    ctx.closePath(); ctx.fill();

    if (cue.name) {
      ctx.fillStyle = cue.color;
      ctx.font = 'bold 8px monospace';
      ctx.fillText(cue.name, x + 3, topY + 10);
    }
  }

  // Center playhead
  const centerX = width / 2;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(centerX - 1, topY, 2, wfH);
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillRect(centerX - 1, topY, 2, wfH);

  // Time readout
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '10px monospace';
  const min = Math.floor(audioPosition / 60);
  const sec = Math.floor(audioPosition % 60);
  const cs  = Math.floor((audioPosition % 1) * 100);
  ctx.fillText(`${min}:${String(sec).padStart(2,'0')}.${String(cs).padStart(2,'0')}`, 4, topY + wfH - 4);
}

// ─── Combined render ──────────────────────────────────────────────────────────

function renderFrame(): void {
  if (!ctx) return;
  dirty = false;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  renderOverview();
  renderScrollingWaveform();

  // Outer border
  ctx.strokeStyle = colors.border;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
}
