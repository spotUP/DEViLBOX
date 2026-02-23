/**
 * DJ Turntable Render Worker — OffscreenCanvas Canvas 2D
 *
 * Accumulates rotation angle and renders the vinyl platter.
 * Pointer interaction (scratch) stays on main thread; velocity/state
 * are forwarded here via postMessage.
 */

import type { TurntableMsg, DeckColorsExt } from '../engine/renderer/worker-types';

type DeckColors = DeckColorsExt;

// ─── Constants ────────────────────────────────────────────────────────────────

const DECK_ACCENT: Record<'A' | 'B' | 'C', string> = { A: '#60a5fa', B: '#f87171', C: '#34d399' };
const DECK_LABEL:  Record<'A' | 'B' | 'C', string> = { A: '#1e2a3f', B: '#3f1e2a', C: '#1e3f2a' };
const BASE_RPS  = 0.5556;   // 33⅓ RPM
const BASE_BPM  = 120;
const GROOVE_COUNT = 14;

// ─── Worker state ─────────────────────────────────────────────────────────────

let offCanvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let dpr = 1, width = 96, height = 96;
let colors: DeckColors = {
  bg: '#0b0909', bgSecondary: '#131010', bgTertiary: '#1d1818',
  border: '#2f2525', borderLight: '#403535',
};
let deckId: 'A' | 'B' | 'C' = 'A';
let isPlaying = false, effectiveBPM = 120;
let scratchVelocity = 1, isScratchActive = false;
let angle = 0, lastTimestamp = 0, dirty = true;

// ─── Message handler ──────────────────────────────────────────────────────────

self.onmessage = (e: MessageEvent<TurntableMsg>) => {
  const msg = e.data;
  switch (msg.type) {
    case 'init':
      offCanvas = msg.canvas;
      offCanvas.width  = Math.round(msg.width  * msg.dpr);
      offCanvas.height = Math.round(msg.height * msg.dpr);
      ctx    = offCanvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
      dpr    = msg.dpr; width = msg.width; height = msg.height;
      colors = msg.colors; deckId = msg.deckId;
      isPlaying = msg.isPlaying; effectiveBPM = msg.effectiveBPM;
      startRAF();
      (self as unknown as Worker).postMessage({ type: 'ready' });
      break;
    case 'playback':
      isPlaying = msg.isPlaying; effectiveBPM = msg.effectiveBPM;
      dirty = true;
      break;
    case 'velocity':
      scratchVelocity = msg.v;
      dirty = true;
      break;
    case 'scratchActive':
      isScratchActive = msg.active;
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

// ─── RAF loop ─────────────────────────────────────────────────────────────────

function startRAF(): void {
  const tick = (ts: number) => {
    // Always advance rotation while playing; only redraw when dirty or animating
    if (isPlaying || dirty) renderFrame(ts);
    else lastTimestamp = ts;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function renderFrame(timestamp: number): void {
  if (!ctx) return;
  dirty = false;

  if (lastTimestamp > 0 && isPlaying) {
    const dt = (timestamp - lastTimestamp) / 1000;
    const rps = (effectiveBPM / BASE_BPM) * BASE_RPS * scratchVelocity;
    angle += rps * 2 * Math.PI * dt;
  }
  lastTimestamp = timestamp;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const cx = width / 2, cy = height / 2;
  const radius      = Math.min(cx, cy) - 2;
  const labelRadius = radius * 0.38;
  const markerColor = DECK_ACCENT[deckId];
  const labelBg     = DECK_LABEL[deckId];

  // Background
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, width, height);

  // Platter ring
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = colors.bgSecondary; ctx.fill();
  ctx.strokeStyle = colors.border; ctx.lineWidth = 1; ctx.stroke();

  // Vinyl disc
  ctx.beginPath();
  ctx.arc(cx, cy, radius - 3, 0, Math.PI * 2);
  ctx.fillStyle = colors.bg; ctx.fill();

  // Grooves
  const grooveStart = labelRadius + 4, grooveEnd = radius - 6;
  ctx.lineWidth = 0.5;
  for (let i = 0; i < GROOVE_COUNT; i++) {
    const r = grooveStart + (i / (GROOVE_COUNT - 1)) * (grooveEnd - grooveStart);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = colors.bgTertiary;
    ctx.globalAlpha = 0.25 + 0.15 * Math.sin(i * 1.7);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Rotating marker line
  ctx.beginPath();
  ctx.moveTo(cx + Math.cos(angle) * labelRadius,    cy + Math.sin(angle) * labelRadius);
  ctx.lineTo(cx + Math.cos(angle) * (radius - 4),   cy + Math.sin(angle) * (radius - 4));
  ctx.strokeStyle = markerColor; ctx.lineWidth = 1.5; ctx.stroke();

  // Center label
  ctx.beginPath();
  ctx.arc(cx, cy, labelRadius, 0, Math.PI * 2);
  ctx.fillStyle = labelBg; ctx.fill();
  ctx.strokeStyle = colors.border; ctx.lineWidth = 0.5; ctx.stroke();

  // "SCR" while scratching
  if (isScratchActive) {
    ctx.font = `bold ${Math.round(labelRadius * 0.45)}px monospace`;
    ctx.fillStyle = markerColor;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('SCR', cx, cy);
  }

  // Spindle dot
  ctx.beginPath();
  ctx.arc(cx, cy, 2, 0, Math.PI * 2);
  ctx.fillStyle = colors.borderLight; ctx.fill();

  // Outer border
  ctx.strokeStyle = colors.border; ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
}
