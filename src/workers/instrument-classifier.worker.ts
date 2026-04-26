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
  computeCedMelSpectrogram,
  resampleTo16k,
  tileToMinLength,
  CED_N_MELS,
} from '@/bridge/analysis/CedMelSpectrogram';
import {
  audioSetLabelToInstrumentType,
} from '@/bridge/analysis/AudioSetInstrumentMap';
import type { InstrumentType } from '@/bridge/analysis/AudioSetInstrumentMap';

// ── ONNX Runtime WASM path ────────────────────────────────────────────────────
ort.env.wasm.wasmPaths = '/onnx-wasm/';
// Disable multi-threading: ORT's pthread WASM creates nested Workers using
// import.meta.url which Vite transforms, causing [object Event] init failures.
// Single-threaded mode is plenty fast for our 83MB model inference.
ort.env.wasm.numThreads = 1;

// ── Model URLs — own server first, HuggingFace CDN fallback ──────────────────
const MODEL_URL_PRIMARY  = '/models/ced/model.onnx';
const MODEL_URL_FALLBACK = 'https://huggingface.co/mispeech/ced-base/resolve/main/model.onnx';
const CONFIG_URL_PRIMARY  = '/models/ced/config.json';
const CONFIG_URL_FALLBACK = 'https://huggingface.co/mispeech/ced-base/resolve/main/config.json';
const CACHE_NAME = 'instrument-classifier-ced-v1';

// Minimum PCM length at 16kHz before tiling (~160ms)
const MIN_SAMPLES = 2560;

// ── State ─────────────────────────────────────────────────────────────────────
let session: ort.InferenceSession | null = null;
let id2label: Record<string, string> = {};
// Single loading promise — prevents parallel model loads when many classify
// messages arrive before the model is ready.
let _loadPromise: Promise<void> | null = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchWithCache(primary: string, fallback: string): Promise<ArrayBuffer> {
  const cache = await caches.open(CACHE_NAME);
  for (const url of [primary, fallback]) {
    try {
      const cached = await cache.match(url);
      if (cached) return cached.arrayBuffer();
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
  const buf = await fetchWithCache(MODEL_URL_PRIMARY, MODEL_URL_FALLBACK);
  self.postMessage({ type: 'loading', progress: 80 });
  session = await ort.InferenceSession.create(buf, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });
  self.postMessage({ type: 'loading', progress: 90 });
  try {
    const cfgBuf = await fetchWithCache(CONFIG_URL_PRIMARY, CONFIG_URL_FALLBACK);
    const cfg = JSON.parse(new TextDecoder().decode(cfgBuf)) as { id2label?: Record<string, string> };
    if (cfg.id2label) id2label = cfg.id2label;
  } catch { /* non-fatal */ }
  self.postMessage({ type: 'loading', progress: 100 });
  self.postMessage({ type: 'ready' });
}

function ensureSession(): Promise<void> {
  if (session) return Promise.resolve();
  if (!_loadPromise) _loadPromise = _doLoadSession();
  return _loadPromise;
}

function softmax(logits: Float32Array): Float32Array {
  let max = -Infinity;
  for (let i = 0; i < logits.length; i++) if (logits[i] > max) max = logits[i];
  const exp = new Float32Array(logits.length);
  let sum = 0;
  for (let i = 0; i < logits.length; i++) { exp[i] = Math.exp(logits[i] - max); sum += exp[i]; }
  for (let i = 0; i < exp.length; i++) exp[i] /= sum;
  return exp;
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
  // Tile very short samples
  audio = tileToMinLength(audio, MIN_SAMPLES);

  // Compute mel spectrogram
  const { data, nFrames } = computeCedMelSpectrogram(audio);

  // Shape: (1, 64, T) — create tensor
  const tensor = new ort.Tensor('float32', data, [1, CED_N_MELS, nFrames]);
  const results = await session.run({ input_values: tensor });

  const logitsKey = Object.keys(results)[0];
  const logits = results[logitsKey].data as Float32Array;
  const probs = softmax(logits);
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
