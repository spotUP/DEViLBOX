/**
 * Soak Test — Browser-side debug hooks (dev-only)
 *
 * Exposes window.__soakActions__ for the soak-test MCP tool to drive DJ/VJ
 * sessions, and window.__soakTelemetry__ for frame-time / GPU metrics.
 *
 * Loaded dynamically from main.tsx when import.meta.env.DEV is true.
 * Production builds never include this module.
 */

import { useUIStore } from '../stores/useUIStore';
import { useDJStore } from '../stores/useDJStore';

// ─── Frame-time ring buffer ──────────────────────────────────────────────────

const RING_SIZE = 30_000; // ~8 min at 60 fps
const deltas = new Float32Array(RING_SIZE);
let head = 0;
let count = 0;
let lastFrameTime = 0;
let rafId = 0;

function frameTick(now: number): void {
  if (lastFrameTime > 0) {
    deltas[head] = now - lastFrameTime;
    head = (head + 1) % RING_SIZE;
    count = Math.min(count + 1, RING_SIZE);
  }
  lastFrameTime = now;
  rafId = requestAnimationFrame(frameTick);
}

function startFrameRecorder(): void {
  if (rafId) return;
  lastFrameTime = 0;
  rafId = requestAnimationFrame(frameTick);
}

/**
 * Compute frame-time percentiles from the ring buffer, then reset.
 */
function getFrameStats(): Record<string, unknown> {
  if (count === 0) {
    return { samples: 0, avgMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0, jankRatio: 0 };
  }

  // Copy the valid portion and sort for percentile computation
  const n = count;
  const sorted = new Float32Array(n);
  const start = count < RING_SIZE ? 0 : head;
  for (let i = 0; i < n; i++) {
    sorted[i] = deltas[(start + i) % RING_SIZE];
  }
  sorted.sort();

  const sum = sorted.reduce((a, b) => a + b, 0);
  const avg = sum / n;
  const p50 = sorted[Math.floor(n * 0.5)];
  const p95 = sorted[Math.floor(n * 0.95)];
  const p99 = sorted[Math.floor(n * 0.99)];
  const max = sorted[n - 1];

  // Jank = frames taking >20ms (below 50 fps)
  let jankCount = 0;
  for (let i = 0; i < n; i++) {
    if (sorted[i] > 20) jankCount++;
  }
  const jankRatio = jankCount / n;

  // Reset ring buffer
  count = 0;
  head = 0;

  return {
    samples: n,
    avgMs: Math.round(avg * 100) / 100,
    p50Ms: Math.round(p50 * 100) / 100,
    p95Ms: Math.round(p95 * 100) / 100,
    p99Ms: Math.round(p99 * 100) / 100,
    maxMs: Math.round(max * 100) / 100,
    jankRatio: Math.round(jankRatio * 10000) / 10000,
  };
}

// ─── GPU stats ────────────────────────────────────────────────────────────────

function getGpuStats(): Record<string, unknown> | null {
  const canvas = document.querySelector('canvas');
  if (!canvas) return null;

  // Try to get a context without creating a new one — check existing contexts
  const gl = (canvas as HTMLCanvasElement).getContext('webgl2') ||
             (canvas as HTMLCanvasElement).getContext('webgl');
  if (!gl) return null;

  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown',
    vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : 'unknown',
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
  };
}

// ─── Soak actions — thin dispatchers to stores/actions ───────────────────────

type SoakActionFn = (args: Record<string, unknown>) => Promise<Record<string, unknown>>;

async function getDJActions() {
  return import('../engine/dj/DJActions');
}

const soakActions: Record<string, SoakActionFn> = {
  /**
   * Switch the active view (dj, vj, split, tracker, etc.)
   */
  async switchView(args) {
    const view = args.view as string;
    useUIStore.getState().setActiveView(view as 'tracker' | 'dj' | 'drumpad' | 'vj');
    return { ok: true, view };
  },

  /**
   * Load a track to a DJ deck from base64-encoded file data.
   * The MCP server tool reads the file from disk and passes base64 data here.
   */
  async loadDeck(args) {
    const side = args.side as 'A' | 'B';
    const filename = args.filename as string;
    const base64Data = args.data as string;

    if (!filename || !base64Data) {
      throw new Error('loadDeck requires filename and data (base64)');
    }

    // Decode base64 to ArrayBuffer
    const binaryStr = atob(base64Data);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    const { getDJEngine } = await import('../engine/dj/DJEngine');
    const engine = getDJEngine();

    // Go through the full DJ pre-render pipeline so the deck ends up in
    // AUDIO playback mode with a WAV loaded — the deck's tracker replayer
    // is muted by design (DeckEngine.ts:257), so without pre-rendering
    // the deck would stay silent. Delegates to DJPipeline for render +
    // analysis, same path the real UI uses on drag-and-drop.
    const { loadUADEToDeck } = await import('../engine/dj/DJUADEPrerender');
    const ab = bytes.buffer as ArrayBuffer;
    await loadUADEToDeck(
      engine,
      side,
      ab,
      filename,
      /* renderIfMissing */ true,
    );

    // Best-effort store sync so downstream track-lookups see the filename.
    useDJStore.getState().setDeckState(side, {
      fileName: filename,
      trackName: filename,
    });

    return { ok: true, side, filename };
  },

  /**
   * Play a DJ deck.
   */
  async playDeck(args) {
    const side = args.side as 'A' | 'B';
    const actions = await getDJActions();
    await actions.togglePlay(side);
    return { ok: true, side };
  },

  /**
   * Stop a DJ deck.
   */
  async stopDeck(args) {
    const side = args.side as 'A' | 'B';
    const actions = await getDJActions();
    actions.stopDeck(side);
    return { ok: true, side };
  },

  /**
   * Set crossfader position (0 = deck A, 1 = deck B).
   */
  async setCrossfader(args) {
    const value = args.value as number;
    const actions = await getDJActions();
    actions.setCrossfader(value);
    return { ok: true, value };
  },

  /**
   * Set deck EQ band (-12 to +12 dB).
   */
  async setEQ(args) {
    const side = args.side as 'A' | 'B';
    const band = args.band as 'low' | 'mid' | 'high';
    const value = args.value as number;
    const actions = await getDJActions();
    actions.setDeckEQ(side, band, value);
    return { ok: true, side, band, value };
  },

  /**
   * Set deck filter position (-1 to +1).
   */
  async setFilter(args) {
    const side = args.side as 'A' | 'B';
    const value = args.value as number;
    const actions = await getDJActions();
    actions.setDeckFilter(side, value);
    return { ok: true, side, value };
  },

  /**
   * Set deck volume (0 to 1).
   */
  async setDeckVolume(args) {
    const side = args.side as 'A' | 'B';
    const value = args.value as number;
    const actions = await getDJActions();
    actions.setDeckVolume(side, value);
    return { ok: true, side, value };
  },

  /**
   * Enter scratch mode on a deck. Equivalent to a jog-wheel touch —
   * cancels any in-progress decay and marks the deck as actively scratching.
   * Soak-test harness uses this to drive the scratch path from the UI smoke
   * flow without an actual jog wheel gesture.
   */
  async startScratch(args) {
    const side = args.side as 'A' | 'B' | 'C';
    const actions = await getDJActions();
    actions.startScratch(side);
    return { ok: true, side };
  },

  /**
   * Update scratch velocity mid-scratch. Signed float, 1.0 = normal forward
   * speed; positive = forward, negative = backward. Clamped to [-4, 4]
   * inside DeckEngine.
   */
  async setScratchVelocity(args) {
    const side = args.side as 'A' | 'B' | 'C';
    const velocity = args.velocity as number;
    const actions = await getDJActions();
    actions.setScratchVelocity(side, velocity);
    return { ok: true, side, velocity };
  },

  /**
   * Exit scratch mode — smoothly decays pitch/tempo back to rest over
   * `decayMs` (default 200). Mirrors jog-wheel release in DeckTurntable.
   */
  async stopScratch(args) {
    const side = args.side as 'A' | 'B' | 'C';
    const decayMs = typeof args.decayMs === 'number' ? args.decayMs : 200;
    const actions = await getDJActions();
    actions.stopScratch(side, decayMs);
    return { ok: true, side, decayMs };
  },

  /**
   * Advance to the next VJ preset. Dispatches a custom event that the VJView
   * listens for, since the VJ canvas uses imperative refs.
   */
  async nextVjPreset() {
    window.dispatchEvent(new CustomEvent('soak:nextVjPreset'));
    return { ok: true };
  },
};

// ─── Telemetry interface ──────────────────────────────────────────────────────

const soakTelemetry = {
  getFrameStats,
  getGpuStats,
};

// ─── Install on window ───────────────────────────────────────────────────────

declare global {
  interface Window {
    __soakActions__?: Record<string, SoakActionFn>;
    __soakTelemetry__?: typeof soakTelemetry;
  }
}

export function installSoakHooks(): void {
  if (!import.meta.env.DEV) return;

  window.__soakActions__ = soakActions;
  window.__soakTelemetry__ = soakTelemetry;

  startFrameRecorder();

  console.log('[soak] Debug hooks installed — __soakActions__, __soakTelemetry__');
}
