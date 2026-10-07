/**
 * UADE scan worker: the song scan (pattern rows, samples, tempo, tick
 * snapshots) that used to run inside the AudioWorklet's message handler, with
 * the audio thread rendering nothing for seconds, runs here in its own UADE
 * WASM instance. The scan code is the worklet's own (uadeWorkletHost.ts).
 *
 *   Main -> Worker: { type: 'scan', id, sampleRate, request }
 *   Worker -> Main: { type: 'scanned', id, result } | { type: 'scanError', id, error }
 */
import { createUadeWorkletHost, type UadeScanRequest, type UadeWorkletHost } from '@engine/uade/uadeWorkletHost';
import { uadeTransform } from '@engine/uade/uadeGlue';

interface ScanMessage { type: 'scan'; id: number; sampleRate: number; request: UadeScanRequest }

let host: UadeWorkletHost | null = null;
let hostRate = 0;

async function getHost(sampleRate: number): Promise<UadeWorkletHost> {
  if (host && hostRate === sampleRate) return host;
  const base = self.location.origin;
  const [wasm, js, worklet] = await Promise.all([
    fetch(`${base}/uade/UADE.wasm`).then((r) => r.arrayBuffer()),
    fetch(`${base}/uade/UADE.js`).then((r) => r.text()),
    fetch(`${base}/uade/UADE.worklet.js`).then((r) => r.text()),
  ]);
  host = await createUadeWorkletHost({ workletSource: worklet, wasmBinary: wasm, jsCode: uadeTransform(js), sampleRate });
  hostRate = sampleRate;
  return host;
}

// Scans run one at a time: the core has one song state.
let queue: Promise<void> = Promise.resolve();

self.onmessage = (e: MessageEvent<ScanMessage>) => {
  const msg = e.data;
  if (msg.type !== 'scan') return;
  queue = queue.then(async () => {
    try {
      const h = await getHost(msg.sampleRate);
      const result = await h.scan(msg.request);
      (self as unknown as Worker).postMessage({ type: 'scanned', id: msg.id, result });
    } catch (err) {
      host = null; // a failed scan may have left the core unusable: rebuild next time
      (self as unknown as Worker).postMessage({ type: 'scanError', id: msg.id, error: err instanceof Error ? err.message : String(err) });
    }
  });
};
