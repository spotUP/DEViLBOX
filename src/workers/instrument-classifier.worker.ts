/**
 * Instrument Classifier Worker — CED (Consistent Ensemble Distillation) ONNX
 *
 * Loads mispeech/ced-base (0.500 mAP, 527 AudioSet classes) and classifies
 * instrument samples from their PCM data. Variable-length input: no tiling
 * needed, short samples work natively.
 *
 * Protocol:
 *   Main → Worker: { type: 'classify', id, instrumentId, pcm, sampleRate, name }
 *   Worker → Main: { type: 'result', id, instrumentId, topLabels, instrumentType, confidence }
 *   Worker → Main: { type: 'error', id, error }
 *   Worker → Main: { type: 'ready' }
 *   Worker → Main: { type: 'loading', progress }
 */

import * as ort from 'onnxruntime-web/wasm';

import {
  resampleTo16k,
  tileToMinLength,
} from '@/bridge/analysis/CedMelSpectrogram';
import {
  audioSetLabelToInstrumentType,
} from '@/bridge/analysis/AudioSetInstrumentMap';
import type { InstrumentType } from '@/bridge/analysis/AudioSetInstrumentMap';

// ── ONNX Runtime WASM path ────────────────────────────────────────────────────
// Serve ONNX files from Express (port 3011), NOT from Vite (port 5173).
// Vite's module server adds ?import to dynamic imports which breaks
// Emscripten's pthread sub-worker creation (import.meta.url gets mangled,
// nested Workers fail). Express serves the .mjs files with clean URLs.
ort.env.wasm.wasmPaths = 'http://localhost:3011/onnx-wasm/';

// ── Model URLs — own server first, HuggingFace CDN fallback ──────────────────
const MODEL_URL_PRIMARY  = '/models/ced/model.onnx';
const MODEL_URL_FALLBACK = 'https://huggingface.co/mispeech/ced-base/resolve/main/model.onnx';
const CONFIG_URL_PRIMARY  = '/models/ced/config.json';
const CONFIG_URL_FALLBACK = 'https://huggingface.co/mispeech/ced-base/resolve/main/config.json';
const CACHE_NAME = 'instrument-classifier-ced-v1';

// 2 seconds at 16kHz — enough context for the model, stays within WASM heap limits.
const MIN_SAMPLES = 32000;

// ── State ─────────────────────────────────────────────────────────────────────
let session: ort.InferenceSession | null = null;
let id2label: Record<string, string> = {};
// Single loading promise — prevents parallel model loads when many classify
// messages arrive before the model is ready.
let _loadPromise: Promise<void> | null = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchWithCache(primary: string, fallback: string, minBytes = 0): Promise<ArrayBuffer> {
  const cache = await caches.open(CACHE_NAME);
  for (const url of [primary, fallback]) {
    try {
      const cached = await cache.match(url);
      if (cached) {
        const buf = await cached.arrayBuffer();
        if (buf.byteLength >= minBytes) return buf;
        // Cache entry is truncated/corrupt — delete and re-fetch
        console.warn(`[CED worker] Cached entry too small (${buf.byteLength} bytes), evicting: ${url}`);
        await cache.delete(url);
      }
      const res = await fetch(url);
      if (!res.ok) continue;
      await cache.put(url, res.clone());
      return res.arrayBuffer();
    } catch { /* try next */ }
  }
  throw new Error('Failed to fetch from all sources');
}

async function _doLoadSession(): Promise<void> {
  self.postMessage({ type: 'loading', progress: 0 });
  const buf = await fetchWithCache(MODEL_URL_PRIMARY, MODEL_URL_FALLBACK, 1_000_000);
  console.warn(`[CED worker] model fetched: ${buf.byteLength.toLocaleString()} bytes`);
  self.postMessage({ type: 'loading', progress: 80 });
  // Pass as Uint8Array — some ORT versions require typed array, not raw ArrayBuffer
  session = await ort.InferenceSession.create(new Uint8Array(buf), {
    executionProviders: ['wasm'],
  });
  console.warn('[CED worker] inputNames:', session.inputNames, 'outputNames:', session.outputNames);
  self.postMessage({ type: 'loading', progress: 90 });
  try {
    const cfgBuf = await fetchWithCache(CONFIG_URL_PRIMARY, CONFIG_URL_FALLBACK);
    const cfg = JSON.parse(new TextDecoder().decode(cfgBuf)) as { id2label?: Record<string, string> };
    if (cfg.id2label) {
      id2label = cfg.id2label;
      console.warn(`[CED worker] id2label loaded: ${Object.keys(id2label).length} labels`);
    }
  } catch { /* non-fatal */ }
  self.postMessage({ type: 'loading', progress: 100 });
  self.postMessage({ type: 'ready' });
}

function ensureSession(): Promise<void> {
  if (session) return Promise.resolve();
  if (!_loadPromise) _loadPromise = _doLoadSession();
  return _loadPromise;
}

function topK(probs: Float32Array, k: number): Array<{ index: number; score: number }> {
  const pairs: Array<{ index: number; score: number }> = [];
  for (let i = 0; i < probs.length; i++) pairs.push({ index: i, score: probs[i] });
  pairs.sort((a, b) => b.score - a.score);
  return pairs.slice(0, k);
}

async function classify(
  _instrumentId: number,
  pcm: Float32Array,
  sampleRate: number,
): Promise<{ topLabels: Array<{ label: string; score: number }>; instrumentType: InstrumentType; confidence: number }> {
  if (!session) throw new Error('Model not loaded');

  // Resample → 16kHz
  let audio = resampleTo16k(pcm, sampleRate);
  // Tile very short samples to ensure minimum length
  audio = tileToMinLength(audio, MIN_SAMPLES);

  // CED model takes raw waveform [batch=1, num_samples] — does mel spectrogram internally.
  const inputName = session.inputNames[0];
  const tensor = new ort.Tensor('float32', audio, [1, audio.length]);
  const results = await session.run({ [inputName]: tensor });

  // Model outputs sigmoid probabilities (multi-label AudioSet) — use directly, no softmax.
  const outputKey = Object.keys(results)[0];
  const probs = results[outputKey].data as Float32Array;
  const top = topK(probs, 10);

  // Map to labels
  const topLabels = top.map(({ index, score }) => ({
    label: id2label[String(index)] ?? `class_${index}`,
    score,
  }));

  // Determine instrument type from top predictions
  let instrumentType: InstrumentType = 'unknown';
  let confidence = 0;
  for (const { label, score } of topLabels) {
    const type = audioSetLabelToInstrumentType(label);
    if (type !== 'unknown') {
      instrumentType = type;
      confidence = score;
      break;
    }
  }

  return { topLabels: topLabels.slice(0, 5), instrumentType, confidence };
}

// ── Message handler ───────────────────────────────────────────────────────────

self.addEventListener('message', async (e: MessageEvent) => {
  const msg = e.data;

  if (msg.type === 'init') {
    console.warn('[CED worker] init received, loading model...');
    try { await ensureSession(); console.warn('[CED worker] model ready'); }
    catch (err) { console.error('[CED worker] init failed:', err); self.postMessage({ type: 'error', id: 'init', error: String(err) }); }
    return;
  }

  if (msg.type === 'classify') {
    const { id, instrumentId, pcm, sampleRate } = msg as {
      id: string; instrumentId: number; pcm: Float32Array; sampleRate: number;
    };
    try {
      await ensureSession();
      const result = await classify(msg.instrumentId as number, pcm, sampleRate);
      self.postMessage({ type: 'result', id, instrumentId, ...result });
    } catch (err) {
      self.postMessage({ type: 'error', id, instrumentId, error: String(err) });
    }
  }
});
