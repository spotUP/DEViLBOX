/**
 * SwiftF0 pitch worker - frame F0 and confidence from mono audio (MIT, lars76/swift-f0).
 *
 * Mirrors swift_f0/core.py SwiftF0.detect: resample to 16 kHz, run the graph
 * in 1875-frame windows with 11 frames of left context and 10 of lookahead
 * (the receptive field, so windowed output equals one long run), zero the
 * confidence of digitally silent hops, loudness over the 32 ms around a frame.
 *
 * Protocol:
 *   Main -> Worker: { id, audio, sampleRate, fmin, fmax }
 *   Worker -> Main: { id, hz, confidence, loudnessDb } | { id, error }
 */
import { ort, createOrtSession } from '@/lib/onnx/ortSession';
import { resampleTo16k } from '@/bridge/analysis/CedMelSpectrogram';
import { TRACK_HOP } from '@/lib/voice/pitchTrack';

const MODEL_URL = '/models/swift-f0/model.onnx';
const WINDOW_FRAMES = 1875;
const LEFT_FRAMES = 11;
const LOOKAHEAD_FRAMES = 10;
// Digital silence sits on the spectrogram floor, which the model answers with random voiced frames.
const SILENCE_PEAK = 1e-3;

export interface SwiftF0Request {
  id: number;
  audio: Float32Array;
  sampleRate: number;
  fmin: number;
  fmax: number;
}

export type SwiftF0Response =
  | { id: number; hz: Float32Array; confidence: Float32Array; loudnessDb: Float32Array }
  | { id: number; error: string };

let sessionPromise: Promise<ort.InferenceSession> | null = null;
function getSession(): Promise<ort.InferenceSession> {
  if (!sessionPromise) {
    sessionPromise = fetch(MODEL_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`SwiftF0 model fetch failed: ${res.status}`);
        return res.arrayBuffer();
      })
      .then((buf) => createOrtSession(new Uint8Array(buf)));
    sessionPromise.catch(() => { sessionPromise = null; });
  }
  return sessionPromise;
}

async function run(
  session: ort.InferenceSession,
  audio: Float32Array,
  fmin: number,
  fmax: number,
): Promise<{ hz: Float32Array; confidence: Float32Array; loudnessDb: Float32Array }> {
  const out = await session.run({
    audio: new ort.Tensor('float32', audio, [1, audio.length]),
    fmin: new ort.Tensor('float32', new Float32Array([fmin]), []),
    fmax: new ort.Tensor('float32', new Float32Array([fmax]), []),
  });
  const hz = Float32Array.from(out.pitch.data as Float32Array);
  const confidence = Float32Array.from(out.confidence.data as Float32Array);
  const n = confidence.length;
  const power = new Float64Array(n);
  for (let f = 0; f < n; f++) {
    const from = f * TRACK_HOP;
    const to = Math.min(audio.length, from + TRACK_HOP);
    let peak = 0;
    let sum = 0;
    for (let i = from; i < to; i++) {
      const v = audio[i];
      sum += v * v;
      if (Math.abs(v) > peak) peak = Math.abs(v);
    }
    power[f] = sum;
    if (peak < SILENCE_PEAK) confidence[f] = 0;
  }
  const loudnessDb = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    const p = (f > 0 ? power[f - 1] : 0) + power[f];
    loudnessDb[f] = 20 * Math.log10(Math.max(Math.sqrt(p / (2 * TRACK_HOP)), 1e-7));
  }
  return { hz, confidence, loudnessDb };
}

async function detect(req: SwiftF0Request): Promise<{ hz: Float32Array; confidence: Float32Array; loudnessDb: Float32Array }> {
  const session = await getSession();
  const signal = resampleTo16k(req.audio, req.sampleRate);
  const n = Math.max(1, Math.floor(signal.length / TRACK_HOP));
  const hz = new Float32Array(n);
  const confidence = new Float32Array(n);
  const loudnessDb = new Float32Array(n);
  for (let start = 0; start < n; start += WINDOW_FRAMES) {
    const end = Math.min(start + WINDOW_FRAMES, n);
    const left = Math.max(0, start - LEFT_FRAMES);
    const window = end < n
      ? signal.subarray(left * TRACK_HOP, (end + LOOKAHEAD_FRAMES) * TRACK_HOP)
      : signal.subarray(left * TRACK_HOP);
    const part = await run(session, window, req.fmin, req.fmax);
    const from = start - left;
    hz.set(part.hz.subarray(from, from + end - start), start);
    confidence.set(part.confidence.subarray(from, from + end - start), start);
    loudnessDb.set(part.loudnessDb.subarray(from, from + end - start), start);
  }
  return { hz, confidence, loudnessDb };
}

self.onmessage = async (e: MessageEvent<SwiftF0Request>) => {
  const { id } = e.data;
  try {
    const { hz, confidence, loudnessDb } = await detect(e.data);
    const msg: SwiftF0Response = { id, hz, confidence, loudnessDb };
    (self as unknown as Worker).postMessage(msg, [hz.buffer, confidence.buffer, loudnessDb.buffer]);
  } catch (err) {
    const msg: SwiftF0Response = { id, error: err instanceof Error ? err.message : String(err) };
    (self as unknown as Worker).postMessage(msg);
  }
};
