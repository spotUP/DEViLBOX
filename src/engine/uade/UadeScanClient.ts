/**
 * Main-thread side of the UADE scan worker (src/workers/uade-scan.worker.ts).
 * One scan at a time per client; cancel() stops a scan in flight by ending the
 * worker (a scan is a synchronous render loop, nothing inside it can be asked
 * to stop) and the next scan starts a fresh one.
 */
import type { UadeScanRequest, UadeScanResult } from './uadeWorkletHost';

export interface ScanWorkerLike {
  postMessage(msg: unknown, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((e: MessageEvent) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
}

export class UadeScanClient {
  /** Replaced in tests; the default spawns the real worker. */
  static workerFactory: () => ScanWorkerLike = () =>
    new Worker(new URL('@/workers/uade-scan.worker.ts', import.meta.url), { type: 'module' }) as unknown as ScanWorkerLike;

  /** Scans this client has handed to a worker (reachability sentinel). */
  scansStarted = 0;

  private worker: ScanWorkerLike | null = null;
  private nextId = 0;
  private pending = new Map<number, { resolve: (r: UadeScanResult) => void; reject: (e: Error) => void }>();

  private ensureWorker(): ScanWorkerLike {
    if (this.worker) return this.worker;
    const w = UadeScanClient.workerFactory();
    w.onmessage = (e) => {
      const m = e.data as { type: string; id: number; result?: UadeScanResult; error?: string };
      const p = this.pending.get(m.id);
      if (!p) return;
      this.pending.delete(m.id);
      if (m.type === 'scanned') p.resolve(m.result as UadeScanResult);
      else p.reject(new Error(m.error ?? 'UADE scan failed'));
    };
    w.onerror = (e) => {
      this.failAll(new Error(`UADE scan worker crashed: ${e.message}`));
      this.worker = null;
    };
    this.worker = w;
    return w;
  }

  private failAll(err: Error): void {
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
  }

  scan(request: UadeScanRequest, sampleRate: number, signal?: AbortSignal): Promise<UadeScanResult> {
    if (signal?.aborted) return Promise.reject(new Error('Scan cancelled'));
    const worker = this.ensureWorker();
    const id = this.nextId++;
    this.scansStarted++;
    return new Promise<UadeScanResult>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      signal?.addEventListener('abort', () => { if (this.pending.has(id)) this.cancel(); }, { once: true });
      worker.postMessage({ type: 'scan', id, sampleRate, request }, [request.buffer, ...request.companions.map((c) => c.buffer)]);
    });
  }

  /** Stop a scan in flight. No-op when none runs. */
  cancel(): void {
    if (!this.worker) return;
    this.worker.terminate();
    this.worker = null;
    this.failAll(new Error('Scan cancelled'));
  }

  dispose(): void { this.cancel(); }
}
