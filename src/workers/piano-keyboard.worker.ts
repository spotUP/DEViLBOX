/**
 * Piano Keyboard Render Worker — OffscreenCanvas Canvas 2D
 *
 * Renders the vertical piano keyboard sidebar off the main thread.
 * Mouse events (hover, note preview) stay on the main thread.
 */

const KEYBOARD_WIDTH = 72;
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function isBlackKey(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(midi % 12);
}

function getNoteNameFromMidi(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[midi % 12]}${octave}`;
}

// ─── Worker state ──────────────────────────────────────────────────────────────

let offCanvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let dpr = 1;
let containerHeight = 300;

let verticalZoom  = 12;
let scrollY       = 0;
let activeNotes   = new Set<number>();
let scaleNotes: Set<number> | null = null;
let dragTargetMidi: number | null = null;
let hoveredMidi: number | null = null;

let dirty = true;

// ─── Message types ─────────────────────────────────────────────────────────────

interface KeyboardState {
  verticalZoom: number;
  scrollY: number;
  containerHeight: number;
  activeNotes: number[];
  scaleNotes: number[] | null;
  dragTargetMidi: number | null;
}

type KeyboardMsg =
  | { type: 'init'; canvas: OffscreenCanvas; dpr: number; state: KeyboardState }
  | { type: 'state'; state: KeyboardState }
  | { type: 'hover'; midi: number | null }
  | { type: 'resize'; h: number; dpr: number };

// ─── Message handler ───────────────────────────────────────────────────────────

self.onmessage = (e: MessageEvent<KeyboardMsg>) => {
  const msg = e.data;
  switch (msg.type) {
    case 'init':
      offCanvas = msg.canvas;
      dpr = msg.dpr;
      applyState(msg.state);
      offCanvas.width  = Math.ceil(KEYBOARD_WIDTH * dpr);
      offCanvas.height = Math.ceil(containerHeight * dpr);
      ctx = offCanvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
      dirty = true;
      startRAF();
      (self as unknown as Worker).postMessage({ type: 'ready' });
      break;

    case 'state':
      applyState(msg.state);
      if (offCanvas) {
        const bw = Math.ceil(KEYBOARD_WIDTH * dpr);
        const bh = Math.ceil(containerHeight * dpr);
        if (offCanvas.width !== bw || offCanvas.height !== bh) {
          offCanvas.width  = bw;
          offCanvas.height = bh;
        }
      }
      dirty = true;
      break;

    case 'hover':
      if (hoveredMidi !== msg.midi) {
        hoveredMidi = msg.midi;
        dirty = true;
      }
      break;

    case 'resize':
      dpr = msg.dpr;
      containerHeight = msg.h;
      if (offCanvas) {
        offCanvas.width  = Math.ceil(KEYBOARD_WIDTH * dpr);
        offCanvas.height = Math.ceil(containerHeight * dpr);
      }
      dirty = true;
      break;
  }
};

function applyState(s: KeyboardState): void {
  verticalZoom   = s.verticalZoom;
  scrollY        = s.scrollY;
  containerHeight = s.containerHeight;
  activeNotes    = new Set(s.activeNotes);
  scaleNotes     = s.scaleNotes ? new Set(s.scaleNotes) : null;
  dragTargetMidi = s.dragTargetMidi;
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

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, KEYBOARD_WIDTH, containerHeight);

  const noteCenter = 60;
  const topMidi    = scrollY + noteCenter;
  const startNote  = Math.min(127, Math.ceil(topMidi) + 2);
  const endNote    = Math.max(0, Math.floor(topMidi) - Math.ceil(containerHeight / verticalZoom) - 2);

  for (let midi = startNote; midi >= endNote; midi--) {
    const y = (scrollY + noteCenter - midi) * verticalZoom;
    if (y + verticalZoom < 0 || y > containerHeight) continue;

    const h            = verticalZoom;
    const black        = isBlackKey(midi);
    const isC          = midi % 12 === 0;
    const isActive     = activeNotes.has(midi);
    const isDragTarget = dragTargetMidi === midi;
    const noteInOctave = midi % 12;
    const outOfScale   = scaleNotes !== null && !scaleNotes.has(noteInOctave);
    const isHovered    = hoveredMidi === midi;
    const keyWidth     = black ? Math.floor(KEYBOARD_WIDTH * 0.66) : KEYBOARD_WIDTH;

    if (isActive || isDragTarget) {
      ctx.fillStyle = '#06b6d4';
    } else if (black) {
      ctx.fillStyle = outOfScale ? '#1a1a1c' : '#22242a';
    } else {
      ctx.fillStyle = outOfScale ? '#333338' : '#e8e8ec';
    }
    ctx.fillRect(0, y, keyWidth, h);

    ctx.fillStyle = black ? '#333' : '#888';
    ctx.fillRect(0, y + h - 0.5, keyWidth, 0.5);

    if (outOfScale && !isActive && !isDragTarget) {
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, y, keyWidth, h);
      ctx.globalAlpha = 1;
    }

    if (isHovered && !isActive && !isDragTarget) {
      ctx.fillStyle = 'rgba(59,130,246,0.15)';
      ctx.fillRect(0, y, keyWidth, h);
    }

    const showAllLabels = verticalZoom >= 14;
    if (isC || (showAllLabels && !black)) {
      const name = isC ? getNoteNameFromMidi(midi) : NOTE_NAMES[noteInOctave];
      ctx.fillStyle = isActive || isDragTarget ? '#fff' : (black ? '#888' : '#333');
      ctx.font = `${isC ? 'bold ' : ''}${Math.min(10, h - 2)}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(name, 6, y + h / 2);
    }

    if (isActive || isDragTarget) {
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(2, y + 1, keyWidth - 4, h - 2);
    }
  }

  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(KEYBOARD_WIDTH - 1, 0, 1, containerHeight);
}
