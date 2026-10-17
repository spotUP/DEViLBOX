/**
 * swiftF0.ts - the SwiftF0 pitch tracker (src/workers/swift-f0.worker.ts) behind PitchTracker.
 */
import { PITCH_SAMPLE_RATE } from './pitchNotes';
import { TRACK_HOP_SECONDS, clampRange, type F0Track, type PitchTracker } from './pitchTrack';
import type { SwiftF0Request, SwiftF0Response } from '@/workers/swift-f0.worker';

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (t: F0Track) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('../../workers/swift-f0.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<SwiftF0Response>) => {
    const job = pending.get(e.data.id);
    if (!job) return;
    pending.delete(e.data.id);
    if ('error' in e.data) job.reject(new Error(e.data.error));
    else job.resolve({ hz: e.data.hz, confidence: e.data.confidence, loudnessDb: e.data.loudnessDb, hopSeconds: TRACK_HOP_SECONDS });
  };
  worker.onerror = (e) => {
    const err = new Error(`SwiftF0 worker error: ${e.message}`);
    for (const job of pending.values()) job.reject(err);
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

export const swiftF0Tracker: PitchTracker = {
  track(samples22050, range) {
    const { fminHz, fmaxHz } = clampRange(range);
    const id = nextId++;
    const audio = new Float32Array(samples22050);
    const req: SwiftF0Request = { id, audio, sampleRate: PITCH_SAMPLE_RATE, fmin: fminHz, fmax: fmaxHz };
    return new Promise<F0Track>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      getWorker().postMessage(req, [audio.buffer]);
    });
  },
};
