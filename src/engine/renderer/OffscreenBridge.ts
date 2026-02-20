/**
 * OffscreenBridge — shared worker lifecycle utility for OffscreenCanvas workers
 *
 * Handles:
 *   - Spawning a typed worker
 *   - Proxying typed messages to/from the worker
 *   - Cleanup on unmount
 *
 * The caller is responsible for the first 'init' message which must include
 * the OffscreenCanvas as a transferable:
 *
 *   const bridge = new OffscreenBridge(MyWorker, { onReady, onMessage });
 *   const offscreen = canvas.transferControlToOffscreen();
 *   bridge.post({ type: 'init', canvas: offscreen, ... }, [offscreen]);
 *   // Later, direct event → worker (no React):
 *   bridge.post({ type: 'scroll', x: 412.5 });
 *   // Cleanup:
 *   bridge.dispose();
 */

export interface OffscreenBridgeOptions<TReply> {
  /** Called once when worker sends { type: 'ready' } */
  onReady?: () => void;
  /** Called for every non-'ready' message from the worker */
  onMessage?: (msg: TReply) => void;
  /** Called if the worker encounters an error */
  onError?: (err: ErrorEvent) => void;
}

export class OffscreenBridge<TMsg, TReply> {
  private readonly worker: Worker;
  private disposed = false;

  constructor(
    WorkerClass: new () => Worker,
    opts: OffscreenBridgeOptions<TReply> = {},
  ) {
    this.worker = new WorkerClass();

    this.worker.onmessage = (e: MessageEvent<TReply & { type: string }>) => {
      if ((e.data as any).type === 'ready') {
        opts.onReady?.();
      } else {
        opts.onMessage?.(e.data);
      }
    };

    this.worker.onerror = (err) => {
      opts.onError?.(err);
      console.error('[OffscreenBridge] Worker error:', err);
    };
  }

  /**
   * Post a message to the worker.
   * For the 'init' message that transfers the OffscreenCanvas:
   *   bridge.post({ type: 'init', canvas: offscreen, ... }, [offscreen]);
   *
   * For subsequent state updates (no transfer needed):
   *   bridge.post({ type: 'scroll', x: 100 });
   */
  post(msg: TMsg, transfer?: Transferable[]): void {
    if (this.disposed) return;
    if (transfer && transfer.length > 0) {
      this.worker.postMessage(msg, transfer);
    } else {
      this.worker.postMessage(msg);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.worker.terminate();
  }
}

// ─── Typed specialisation for the pattern editor worker ──────────────────────

import type { TrackerWorkerMsg, TrackerWorkerReply } from './worker-types';

export class TrackerOffscreenBridge extends OffscreenBridge<TrackerWorkerMsg, TrackerWorkerReply> {
  constructor(
    WorkerClass: new () => Worker,
    opts: OffscreenBridgeOptions<TrackerWorkerReply> = {},
  ) {
    super(WorkerClass, opts);
  }
}
