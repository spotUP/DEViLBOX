/**
 * The DJ render worker (dj-render.worker.ts) run in-process for a test: the
 * test window stands in for the worker scope (its onmessage / postMessage);
 * the analysis worker answers with an error (analysis is not under test).
 * Returns the restore function.
 */
import { vi } from 'vitest';

export function installInProcessDJRenderWorker(): () => void {
  type Handler = ((e: { data: unknown }) => void) | null;
  const scope = globalThis.self as unknown as { onmessage: Handler; postMessage: (m: unknown) => void };
  const originalPost = scope.postMessage;
  let workerModule: Promise<unknown> | null = null;
  class InProcessWorker {
    onmessage: Handler = null;
    onerror: Handler = null;
    private readonly render: boolean;
    constructor(url: URL | string) {
      this.render = String(url).includes('dj-render');
      if (this.render) {
        scope.postMessage = (m: unknown) => this.onmessage?.({ data: m });
        workerModule ??= import('@/workers/dj-render.worker');
      }
    }
    postMessage(msg: { type: string; id?: string }) {
      if (this.render) {
        void workerModule!.then(() => scope.onmessage?.({ data: msg }));
      } else if (msg.type !== 'init') {
        setTimeout(() => this.onmessage?.({ data: { type: 'analysisError', id: msg.id, error: 'not under test' } }), 0);
      }
    }
    terminate() {}
  }
  vi.stubGlobal('Worker', InProcessWorker);
  // The worker glue (forced to its worker branch) checks it runs in a worker scope.
  vi.stubGlobal('importScripts', () => {});
  // Emscripten glue under node picks its node branch; the worker expects a worker one (as uadeWorkletHost does).
  const versions = Object.getOwnPropertyDescriptor(process, 'versions');
  Object.defineProperty(process, 'versions', { value: {}, configurable: true });
  return () => {
    if (versions) Object.defineProperty(process, 'versions', versions);
    scope.postMessage = originalPost; scope.onmessage = null; vi.unstubAllGlobals();
  };
}
