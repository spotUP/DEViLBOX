/**
 * DJ Beat Grid Render Worker — OffscreenCanvas Canvas 2D
 *
 * Transparent overlay showing beat tick marks from either:
 *   1. Serato beat markers (audio file metadata)
 *   2. Analysis-derived beat grid (essentia.js via DJPipeline)
 * Analysis grid takes priority when available.
 */

import type { BeatGridMsg, BeatMarker, AnalysisBeatGrid } from '../engine/renderer/worker-types';

// ─── Worker state ─────────────────────────────────────────────────────────────

let offCanvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let dpr = 1, width = 400, height = 24;

let beatGrid: BeatMarker[] = [];
let analysisBeatGrid: AnalysisBeatGrid | null = null;
let durationMs       = 0;
let audioPosition    = 0;
let positionFraction = 0;
let dirty            = true;

// ─── Message handler ──────────────────────────────────────────────────────────

self.onmessage = (e: MessageEvent<BeatGridMsg>) => {
  const msg = e.data;
  switch (msg.type) {
    case 'init':
      offCanvas = msg.canvas;
      offCanvas.width  = Math.round(msg.width  * msg.dpr);
      offCanvas.height = Math.round(msg.height * msg.dpr);
      ctx              = offCanvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
      dpr              = msg.dpr; width = msg.width; height = msg.height;
      beatGrid         = msg.beatGrid;
      analysisBeatGrid = msg.analysisBeatGrid;
      durationMs       = msg.durationMs;
      audioPosition    = msg.audioPosition;
      positionFraction = msg.positionFraction;
      startRAF();
      (self as unknown as Worker).postMessage({ type: 'ready' });
      break;
    case 'beatGrid':
      beatGrid         = msg.beatGrid;
      analysisBeatGrid = msg.analysisBeatGrid;
      durationMs       = msg.durationMs;
      dirty = true;
      break;
    case 'position':
      audioPosition    = msg.audioPosition;
      positionFraction = msg.positionFraction;
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

function renderFrame(): void {
  if (!ctx) return;
  dirty = false;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  // Prefer analysis beat grid over Serato
  if (analysisBeatGrid && analysisBeatGrid.beats.length > 0) {
    renderAnalysisBeatGrid();
  } else if (beatGrid.length > 0 && durationMs > 0) {
    renderSeratoBeatGrid();
  }
}

/** Render analysis-derived beat grid (essentia.js) */
function renderAnalysisBeatGrid(): void {
  if (!ctx || !analysisBeatGrid) return;

  const beats = analysisBeatGrid.beats;
  const downbeats = new Set(analysisBeatGrid.downbeats.map(d => d.toFixed(3)));
  const totalDuration = durationMs > 0 ? durationMs / 1000 : beats[beats.length - 1] + 1;

  // Determine current position
  const currentPos = durationMs > 0 ? audioPosition : positionFraction * totalDuration;

  for (const beat of beats) {
    const x = (beat / totalDuration) * width;
    const isDownbeat = downbeats.has(beat.toFixed(3));

    if (isDownbeat) {
      // Downbeat: brighter, taller line
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.fillRect(Math.round(x), 0, 1, height);
    } else {
      // Regular beat: subtle tick from bottom
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      const tickH = height * 0.3;
      ctx.fillRect(Math.round(x), height - tickH, 1, tickH);
    }
  }

  // Current beat highlight — find nearest beat
  if (beats.length > 0) {
    let nearestBeat = beats[0];
    let minDist = Math.abs(currentPos - beats[0]);
    for (const b of beats) {
      const dist = Math.abs(currentPos - b);
      if (dist < minDist) {
        minDist = dist;
        nearestBeat = b;
      }
    }

    // Glow on nearest beat if close enough (within 100ms)
    if (minDist < 0.1) {
      const bx = (nearestBeat / totalDuration) * width;
      const glowIntensity = 1 - (minDist / 0.1);
      ctx.fillStyle = `rgba(251, 191, 36, ${0.15 + 0.3 * glowIntensity})`;
      ctx.fillRect(Math.round(bx) - 2, 0, 5, height);
    }
  }
}

/** Render Serato beat markers (original implementation) */
function renderSeratoBeatGrid(): void {
  if (!ctx || beatGrid.length === 0 || durationMs <= 0) return;

  const durationSec = durationMs / 1000;

  for (let i = 0; i < beatGrid.length - 1; i++) {
    const marker     = beatGrid[i];
    const nextMarker = beatGrid[i + 1];
    if (marker.beatsUntilNextMarker <= 0) continue;

    const beatDuration = (nextMarker.position - marker.position) / marker.beatsUntilNextMarker;
    if (beatDuration <= 0) continue;

    for (let b = 0; b < marker.beatsUntilNextMarker; b++) {
      const beatTime  = marker.position + b * beatDuration;
      const x         = (beatTime / durationSec) * width;
      const isDownbeat = b % 4 === 0;
      ctx.fillStyle   = isDownbeat ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)';
      const tickH     = isDownbeat ? height * 0.5 : height * 0.25;
      ctx.fillRect(Math.round(x), height - tickH, 1, tickH);
    }
  }

  // Current beat highlight
  const currentX = (audioPosition / durationSec) * width;
  ctx.fillStyle = 'rgba(255,200,0,0.4)';
  ctx.fillRect(Math.round(currentX) - 1, 0, 2, height);
}
