/**
 * DJ Audio Waveform Render Worker — OffscreenCanvas Canvas 2D
 *
 * Scrolling zoomed waveform centered on current playhead position.
 * Cue point markers overlaid.
 */

interface SerializedCuePoint {
  index: number;
  position: number;   // ms
  color: string;
  name: string;
}

interface WaveformInitMsg {
  type: 'init';
  canvas: OffscreenCanvas;
  dpr: number;
  width: number;
  height: number;
  waveformPeaks: number[] | null;
  durationMs: number;
  audioPosition: number;
  cuePoints: SerializedCuePoint[];
}

interface WaveformPeaksMsg    { type: 'waveformPeaks'; peaks: number[] | null; durationMs: number }
interface WaveformPositionMsg { type: 'position'; audioPosition: number }
interface WaveformCueMsg      { type: 'cuePoints'; cuePoints: SerializedCuePoint[] }
interface WaveformResizeMsg   { type: 'resize'; w: number; h: number; dpr: number }

type WaveformMsg = WaveformInitMsg | WaveformPeaksMsg | WaveformPositionMsg | WaveformCueMsg | WaveformResizeMsg;

// ─── Worker state ─────────────────────────────────────────────────────────────

let offCanvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let dpr = 1, width = 400, height = 120;

let waveformPeaks: number[] | null = null;
let durationMs    = 0;
let audioPosition = 0;
let cuePoints: SerializedCuePoint[] = [];

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
      startRAF();
      (self as unknown as Worker).postMessage({ type: 'ready' });
      break;
    case 'waveformPeaks':
      waveformPeaks = msg.peaks;
      durationMs    = msg.durationMs;
      break;
    case 'position':
      audioPosition = msg.audioPosition;
      break;
    case 'cuePoints':
      cuePoints = msg.cuePoints;
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
  if (!ctx || !waveformPeaks || waveformPeaks.length === 0) return;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const durationSec = durationMs / 1000;
  if (durationSec <= 0) return;

  ctx.fillStyle = '#0b0909';
  ctx.fillRect(0, 0, width, height);

  const numBins   = waveformPeaks.length;
  const midY      = height / 2;
  const windowSec = 10;
  const startSec  = audioPosition - windowSec / 2;

  for (let px = 0; px < width; px++) {
    const timeSec  = startSec + (px / width) * windowSec;
    const fraction = timeSec / durationSec;
    const binIndex = Math.floor(fraction * numBins);
    if (binIndex < 0 || binIndex >= numBins) continue;

    const amp  = waveformPeaks[binIndex];
    const barH = amp * midY * 0.85;
    ctx.fillStyle = timeSec < audioPosition
      ? 'rgba(80, 130, 220, 0.4)'
      : 'rgba(100, 170, 255, 0.7)';
    ctx.fillRect(px, midY - barH, 1, barH * 2);
  }

  // Cue markers
  const endSec = audioPosition + windowSec / 2;
  for (const cue of cuePoints) {
    const cueSec = cue.position / 1000;
    if (cueSec < startSec || cueSec > endSec) continue;
    const x = ((cueSec - startSec) / windowSec) * width;

    ctx.fillStyle = cue.color + '80';
    ctx.fillRect(Math.round(x), 0, 1, height);

    ctx.fillStyle = cue.color;
    ctx.beginPath();
    ctx.moveTo(x - 3, 0); ctx.lineTo(x + 3, 0); ctx.lineTo(x, 5);
    ctx.closePath(); ctx.fill();

    if (cue.name) {
      ctx.fillStyle = cue.color;
      ctx.font = 'bold 8px monospace';
      ctx.fillText(cue.name, x + 3, 10);
    }
  }

  // Center playhead
  const centerX = width / 2;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(centerX - 1, 0, 2, height);
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillRect(centerX - 1, 0, 2, height);

  // Time readout
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '10px monospace';
  const min = Math.floor(audioPosition / 60);
  const sec = Math.floor(audioPosition % 60);
  const cs  = Math.floor((audioPosition % 1) * 100);
  ctx.fillText(`${min}:${String(sec).padStart(2,'0')}.${String(cs).padStart(2,'0')}`, 4, height - 4);
}
