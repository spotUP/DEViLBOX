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
import { detectF0 } from '@/lib/voice/swiftF0Core';

const MODEL_URL = '/models/swift-f0/model.onnx';

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

self.onmessage = async (e: MessageEvent<SwiftF0Request>) => {
  const { id } = e.data;
  try {
    const { hz, confidence, loudnessDb } = await detectF0(ort, await getSession(), e.data);
    const msg: SwiftF0Response = { id, hz, confidence, loudnessDb };
    (self as unknown as Worker).postMessage(msg, [hz.buffer, confidence.buffer, loudnessDb.buffer]);
  } catch (err) {
    const msg: SwiftF0Response = { id, error: err instanceof Error ? err.message : String(err) };
    (self as unknown as Worker).postMessage(msg);
  }
};
