/**
 * DJ Turntable Render Worker — OffscreenCanvas Canvas 2D
 *
 * Accumulates rotation angle and renders the vinyl platter.
 * Pointer interaction (scratch) stays on main thread; velocity/state
 * are forwarded here via postMessage.
 */

interface DeckColors {
  bg: string;
  bgSecondary: string;
  bgTertiary: string;
  border: string;
  borderLight: string;
}

interface TurntableInitMsg {
  type: 'init';
  canvas: OffscreenCanvas;
  dpr: number;
  width: number;
  height: number;
  colors: DeckColors;
  deckId: 'A' | 'B';
  isPlaying: boolean;
  effectiveBPM: number;
}

interface TurntablePlaybackMsg    { type: 'playback'; isPlaying: boolean; effectiveBPM: number }
interface TurntableVelocityMsg    { type: 'velocity'; v: number }
interface TurntableScratchMsg     { type: 'scratchActive'; active: boolean }
interface TurntableResizeMsg      { type: 'resize'; w: number; h: number; dpr: number }
interface TurntableColorsMsg      { type: 'colors'; colors: DeckColors }

type TurntableMsg =
  | TurntableInitMsg | TurntablePlaybackMsg | TurntableVelocityMsg
  | TurntableScratchMsg | TurntableResizeMsg | TurntableColorsMsg;

// ─── Constants ────────────────────────────────────────────────────────────────

const DECK_ACCENT: Record<'A' | 'B', string> = { A: '#60a5fa', B: '#f87171' };
const DECK_LABEL:  Record<'A' | 'B', string> = { A: '#1e2a3f', B: '#3f1e2a' };
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
let deckId: 'A' | 'B' = 'A';
let isPlaying = false, effectiveBPM = 120;
let scratchVelocity = 1, isScratchActive = false;
let angle = 0, lastTimestamp = 0;

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
      break;
    case 'velocity':
      scratchVelocity = msg.v;
      break;
    case 'scratchActive':
      isScratchActive = msg.active;
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

// ─── RAF loop ─────────────────────────────────────────────────────────────────

function startRAF(): void {
  const tick = (ts: number) => { renderFrame(ts); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}

function renderFrame(timestamp: number): void {
  if (!ctx) return;

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
