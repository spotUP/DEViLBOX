/**
 * Velocity Lane Render Worker — OffscreenCanvas Canvas 2D
 *
 * Renders the velocity bar editor off the main thread.
 * Mouse interaction (drag, wheel) stays on the main thread.
 */

const LANE_HEIGHT = 80;

const INSTRUMENT_COLORS = [
  '#06b6d4', '#a855f7', '#22c55e', '#f59e0b',
  '#ec4899', '#3b82f6', '#ef4444', '#14b8a6',
  '#f97316', '#8b5cf6', '#10b981', '#eab308',
  '#d946ef', '#0ea5e9', '#fb923c', '#84cc16',
];
const DEFAULT_COLOR = '#64748b';

import type { VelocityMsg, SerializedNote } from '../engine/renderer/worker-types';

// ─── Worker state ──────────────────────────────────────────────────────────────

let offCanvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let dpr = 1;

let notes: SerializedNote[]  = [];
let horizontalZoom           = 16;
let scrollX                  = 0;
let selectedNotes            = new Set<string>();
let containerWidth           = 800;
let hoverNoteId: string | null = null;
let dirty = true;

// ─── Message handler ───────────────────────────────────────────────────────────

self.onmessage = (e: MessageEvent<VelocityMsg>) => {
  const msg = e.data;
  switch (msg.type) {
    case 'init':
      offCanvas = msg.canvas;
      dpr = msg.dpr;
      applyState(msg.state);
      offCanvas.width  = Math.ceil(containerWidth * dpr);
      offCanvas.height = Math.ceil(LANE_HEIGHT * dpr);
      ctx = offCanvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
      dirty = true;
      startRAF();
      (self as unknown as Worker).postMessage({ type: 'ready' });
      break;

    case 'state':
      applyState(msg.state);
      dirty = true;
      break;

    case 'hover':
      if (hoverNoteId !== msg.noteId) {
        hoverNoteId = msg.noteId;
        dirty = true;
      }
      break;

    case 'resize':
      dpr = msg.dpr;
      containerWidth = msg.w;
      if (offCanvas) {
        offCanvas.width  = Math.ceil(containerWidth * dpr);
        offCanvas.height = Math.ceil(LANE_HEIGHT * dpr);
      }
      dirty = true;
      break;
  }
};

function applyState(s: VelocityState): void {
  notes          = s.notes;
  horizontalZoom = s.horizontalZoom;
  scrollX        = s.scrollX;
  selectedNotes  = new Set(s.selectedNotes);
  containerWidth = s.containerWidth;
  if (offCanvas) {
    const bw = Math.ceil(containerWidth * dpr);
    const bh = Math.ceil(LANE_HEIGHT * dpr);
    if (offCanvas.width !== bw || offCanvas.height !== bh) {
      offCanvas.width  = bw;
      offCanvas.height = bh;
    }
  }
}

// ─── RAF loop ──────────────────────────────────────────────────────────────────

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

  const cw = containerWidth;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.fillStyle = '#1a1a1c';
  ctx.fillRect(0, 0, cw, LANE_HEIGHT);

  // Grid reference lines
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 0.5;
  for (const vel of [32, 64, 96, 127]) {
    const y = LANE_HEIGHT - (vel / 127) * LANE_HEIGHT;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(cw, y);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.font = '8px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(String(vel), 2, y);
  }

  // Velocity bars
  const hz = horizontalZoom;
  const sx = scrollX;
  let visibleCount = 0;

  for (const note of notes) {
    const x = (note.startRow - sx) * hz;
    const w = (note.endRow - note.startRow) * hz;
    if (x + w < 0 || x > cw) continue;

    visibleCount++;
    const barH    = (note.velocity / 127) * LANE_HEIGHT;
    const barW    = Math.max(3, w - 1);
    const isSel   = selectedNotes.has(note.id);
    const isHov   = hoverNoteId === note.id;
    const color   = note.instrument !== null
      ? INSTRUMENT_COLORS[note.instrument % INSTRUMENT_COLORS.length]
      : DEFAULT_COLOR;

    ctx.globalAlpha = isSel ? 1 : (isHov ? 0.9 : 0.7);
    ctx.fillStyle = color;

    const barY = LANE_HEIGHT - barH;
    const r    = Math.min(3, barW / 2, barH / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, barY);
    ctx.lineTo(x + barW - r, barY);
    ctx.quadraticCurveTo(x + barW, barY, x + barW, barY + r);
    ctx.lineTo(x + barW, LANE_HEIGHT);
    ctx.lineTo(x, LANE_HEIGHT);
    ctx.lineTo(x, barY + r);
    ctx.quadraticCurveTo(x, barY, x + r, barY);
    ctx.closePath();
    ctx.fill();

    if (isSel) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = 'bold 10px Inter, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('VELOCITY', 6, 6);

  if (notes.length === 0 || visibleCount === 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (notes.length === 0) {
      ctx.fillText('No notes in pattern - add notes above to see velocity bars', cw / 2, LANE_HEIGHT / 2);
    } else {
      ctx.fillText('Scroll to see velocity bars for notes', cw / 2, LANE_HEIGHT / 2);
    }
  }
}
