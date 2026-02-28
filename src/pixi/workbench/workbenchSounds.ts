/**
 * workbenchSounds — Tiny Web Audio UI sounds for workbench events.
 *
 * AudioContext is created lazily on first call (requires a prior user gesture).
 * All functions are safe to call when audio is unavailable — they silently no-op.
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (!ctx) {
    try { ctx = new AudioContext(); } catch { return null; }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

/** Play a frequency-swept sine tone */
function tone(freq0: number, freq1: number, dur: number, vol = 0.09): void {
  const ac = getCtx();
  if (!ac) return;
  const t   = ac.currentTime;
  const osc = ac.createOscillator();
  const env = ac.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq0, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, freq1), t + dur);
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(vol, t + 0.005);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(env);
  env.connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

/** Play a decaying noise click */
function click(dur = 0.02, vol = 0.06): void {
  const ac = getCtx();
  if (!ac) return;
  const t       = ac.currentTime;
  const samples = Math.ceil(ac.sampleRate * dur);
  const buf     = ac.createBuffer(1, samples, ac.sampleRate);
  const data    = buf.getChannelData(0);
  for (let i = 0; i < samples; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / samples);
  }
  const src = ac.createBufferSource();
  const env = ac.createGain();
  src.buffer = buf;
  env.gain.setValueAtTime(vol, t);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(env);
  env.connect(ac.destination);
  src.start(t);
}

// ─── Public events ────────────────────────────────────────────────────────────

/** Window spring-opens */
export function playWindowOpen(): void   { tone(280, 560, 0.14, 0.08); }

/** Window spring-closes */
export function playWindowClose(): void  { tone(420, 210, 0.11, 0.07); }

/** Window edge-snapped to another window */
export function playSnap(): void         { click(0.018, 0.06); }

/** Camera focus-zoomed to a window */
export function playFocusZoom(): void    { tone(440, 660, 0.14, 0.07); tone(660, 990, 0.10, 0.04); }

/** Minimap click-to-warp */
export function playMinimapClick(): void { click(0.012, 0.04); }

/** CoverFlow view selected */
export function playCoverSelect(): void  { tone(880, 1320, 0.07, 0.06); tone(1320, 1760, 0.09, 0.04); }
