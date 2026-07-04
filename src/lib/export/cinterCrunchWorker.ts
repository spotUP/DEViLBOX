/// <reference lib="webworker" />
/**
 * cinterCrunchWorker — runs the Cinter LZ crunch (encodeCinter4FromMod) off the main
 * thread. This is the CPU-heavy part of the live Cinter re-export (an iterative optimal
 * LZ parse); the OpenMPT MOD serialize stays on the main thread (it's fast). Pure TS,
 * no DOM/store access, so it is worker-safe.
 */
import { encodeCinter4FromMod } from './Cinter4Exporter';

interface Req { id: number; modBytes: ArrayBuffer }

self.onmessage = (e: MessageEvent<Req>) => {
  const { id, modBytes } = e.data;
  try {
    const r = encodeCinter4FromMod(new Uint8Array(modBytes));
    (self as unknown as Worker).postMessage(
      { id, songdata: r.songdata, rawSamples: r.rawSamples, errors: r.errors },
      [r.songdata.buffer, r.rawSamples.buffer],
    );
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) });
  }
};
