/**
 * DJ Track Overview Render Worker — OffscreenCanvas Canvas 2D
 *
 * Renders the horizontal track overview bar: pattern segments, waveform peaks,
 * loop region, cue marker, position marker, near-end warning pulse.
 */

interface DeckColors {
  bg: string;
  bgSecondary: string;
  bgTertiary: string;
  border: string;
}

interface OverviewInitMsg {
  type: 'init';
  canvas: OffscreenCanvas;
  dpr: number;
  width: number;
  height: number;
  colors: DeckColors;
  // Initial deck state
  playbackMode: string;
  songPos: number;
  totalPositions: number;
  cuePoint: number;
  loopActive: boolean;
  patternLoopStart: number;
  patternLoopEnd: number;
  audioPosition: number;
  durationMs: number;
  waveformPeaks: number[] | null;
}

interface OverviewStateMsg {
  type: 'state';
  playbackMode: string;
  songPos: number;
  totalPositions: number;
  cuePoint: number;
  loopActive: boolean;
  patternLoopStart: number;
  patternLoopEnd: number;
  audioPosition: number;
  durationMs: number;
  waveformPeaks: number[] | null;
}

interface OverviewResizeMsg { type: 'resize'; w: number; h: number; dpr: number }
interface OverviewColorsMsg { type: 'colors'; colors: DeckColors }

type OverviewMsg = OverviewInitMsg | OverviewStateMsg | OverviewResizeMsg | OverviewColorsMsg;

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
let pulsePhase      = 0;

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
      break;
    case 'resize':
      dpr = msg.dpr; width = msg.w; height = msg.h;
      if (offCanvas) {
        offCanvas.width  = Math.round(width  * dpr);
        offCanvas.height = Math.round(height * dpr);
      }
      break;
    case 'colors':
      colors = msg.colors;
      break;
  }
};

function applyStateMsg(msg: OverviewInitMsg | OverviewStateMsg): void {
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
}

// ─── RAF loop ─────────────────────────────────────────────────────────────────

function startRAF(): void {
  const tick = () => { renderFrame(); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}

function renderFrame(): void {
  if (!ctx) return;
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
      for (let i = 0; i < numBins; i++) {
        const amp = waveformPeaks[i];
        const barH = amp * midY * 0.9;
        ctx.fillStyle = 'rgba(100, 160, 255, 0.5)';
        ctx.fillRect(i * binWidth, midY - barH, Math.max(1, binWidth - 0.5), barH * 2);
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
