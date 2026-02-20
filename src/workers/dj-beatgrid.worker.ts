/**
 * DJ Beat Grid Render Worker — OffscreenCanvas Canvas 2D
 *
 * Transparent overlay showing beat tick marks from the Serato beatgrid.
 */

interface BeatMarker {
  position: number;         // seconds from start
  beatsUntilNextMarker: number;
}

interface BeatGridInitMsg {
  type: 'init';
  canvas: OffscreenCanvas;
  dpr: number;
  width: number;
  height: number;
  beatGrid: BeatMarker[];
  durationMs: number;
  audioPosition: number;
}

interface BeatGridGridMsg     { type: 'beatGrid'; beatGrid: BeatMarker[]; durationMs: number }
interface BeatGridPositionMsg { type: 'position'; audioPosition: number }
interface BeatGridResizeMsg   { type: 'resize'; w: number; h: number; dpr: number }

type BeatGridMsg = BeatGridInitMsg | BeatGridGridMsg | BeatGridPositionMsg | BeatGridResizeMsg;

// ─── Worker state ─────────────────────────────────────────────────────────────

let offCanvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let dpr = 1, width = 400, height = 24;

let beatGrid: BeatMarker[] = [];
let durationMs    = 0;
let audioPosition = 0;

// ─── Message handler ──────────────────────────────────────────────────────────

self.onmessage = (e: MessageEvent<BeatGridMsg>) => {
  const msg = e.data;
  switch (msg.type) {
    case 'init':
      offCanvas = msg.canvas;
      offCanvas.width  = Math.round(msg.width  * msg.dpr);
      offCanvas.height = Math.round(msg.height * msg.dpr);
      ctx           = offCanvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
      dpr           = msg.dpr; width = msg.width; height = msg.height;
      beatGrid      = msg.beatGrid;
      durationMs    = msg.durationMs;
      audioPosition = msg.audioPosition;
      startRAF();
      (self as unknown as Worker).postMessage({ type: 'ready' });
      break;
    case 'beatGrid':
      beatGrid   = msg.beatGrid;
      durationMs = msg.durationMs;
      break;
    case 'position':
      audioPosition = msg.audioPosition;
      break;
    case 'resize':
      dpr = msg.dpr; width = msg.w; height = msg.h;
      if (offCanvas) {
        offCanvas.width  = Math.round(width  * dpr);
        offCanvas.height = Math.round(height * dpr);
      }
      break;
  }
};

// ─── RAF loop ─────────────────────────────────────────────────────────────────

function startRAF(): void {
  const tick = () => { renderFrame(); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}

function renderFrame(): void {
  if (!ctx) return;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  if (beatGrid.length === 0 || durationMs <= 0) return;

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
