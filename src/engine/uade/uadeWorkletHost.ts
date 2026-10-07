/**
 * Runs UADE.worklet.js - the real worklet source, with its own UADE WASM
 * instance - outside an AudioWorklet, so a song scan can run in a Worker
 * without blocking the audio thread.
 *
 * The scan code is NOT copied: the host evaluates the same worklet file the
 * audio thread runs, feeds it the same `load` message and takes the `loaded`
 * message it posts. That is what makes "the worker's scan equals the
 * worklet's scan" true by construction, and the test proves it over the corpus.
 * The worker (src/workers/uade-scan.worker.ts) and the node tests both use it.
 */

export type UadeWorkletMsg = { type?: string; requestId?: number; message?: string; [k: string]: unknown };

interface WorkletProc {
  _handleMessage(d: unknown): Promise<void>;
  _hasRendered?: boolean;
}

export interface UadeScanRequest {
  buffer: ArrayBuffer;
  filenameHint: string;
  subsong: number;
  scanTimeoutSec?: number;
  companions: Array<{ filename: string; buffer: ArrayBuffer }>;
  /** Also turn on CIA tick snapshots for the scan (a short scan returns them as shortScanTicks). */
  tickSnapshots: boolean;
}

/** The worklet's `loaded` message: scanData, enhancedScan, shortScanTicks, scanStats, player, subsongs. */
export type UadeScanResult = UadeWorkletMsg;

export interface UadeWorkletHost {
  scan(req: UadeScanRequest): Promise<UadeScanResult>;
}

export interface UadeWorkletHostInit {
  workletSource: string;
  wasmBinary: ArrayBuffer | Uint8Array;
  /** The Emscripten glue, already through uadeTransform. */
  jsCode: string;
  sampleRate: number;
}

export async function createUadeWorkletHost(init: UadeWorkletHostInit): Promise<UadeWorkletHost> {
  let Processor!: new () => WorkletProc;
  const posted: UadeWorkletMsg[] = [];
  const scope: Record<string, unknown> = {
    AudioWorkletProcessor: class { port = { postMessage: (m: UadeWorkletMsg) => posted.push(m), onmessage: null }; },
    registerProcessor: (_n: string, cls: new () => WorkletProc) => { Processor = cls; },
    sampleRate: init.sampleRate,
    currentTime: 0,
  };
  new Function(...Object.keys(scope), init.workletSource)(...Object.values(scope));
  const proc = new Processor();

  // Emscripten under node picks the node environment; the worklet expects a worker-like one.
  const nodeProc = typeof process !== 'undefined' && process.versions?.node ? process : null;
  const versions = nodeProc ? Object.getOwnPropertyDescriptor(nodeProc, 'versions') : undefined;
  if (nodeProc) Object.defineProperty(nodeProc, 'versions', { value: {}, configurable: true });
  try {
    await proc._handleMessage({ type: 'init', sampleRate: init.sampleRate, wasmBinary: init.wasmBinary, jsCode: init.jsCode });
  } finally {
    if (nodeProc && versions) Object.defineProperty(nodeProc, 'versions', versions);
  }
  const failed = posted.find((m) => m.type === 'error');
  if (failed) throw new Error(`UADE scan host failed to start: ${failed.message}`);

  return {
    async scan(req) {
      posted.length = 0;
      if (req.tickSnapshots) {
        await proc._handleMessage({ type: 'enableTickSnapshots', enable: true });
        await proc._handleMessage({ type: 'resetTickSnapshots' });
      }
      await proc._handleMessage({
        type: 'load', buffer: req.buffer, filenameHint: req.filenameHint, skipScan: false,
        subsong: req.subsong, scanTimeoutSec: req.scanTimeoutSec, pinSubsong: false, companions: req.companions,
      });
      // process() never runs here, so the "a song has been rendered, soft-reset before the next load" flag
      // the audio thread sets is set here: the next scan starts from a clean core.
      proc._hasRendered = true;
      const err = posted.find((m) => m.type === 'error');
      if (err) throw new Error(String(err.message));
      const loaded = posted.find((m) => m.type === 'loaded') as UadeScanResult | undefined;
      if (!loaded) throw new Error('UADE scan produced no result');
      if (req.tickSnapshots) await proc._handleMessage({ type: 'enableTickSnapshots', enable: false });
      return loaded;
    },
  };
}
