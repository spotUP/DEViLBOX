import type { AutomationSourceRef } from '../../types/automation';

export interface CaptureEntry {
  tick: number;
  value: number;       // 0-1 normalized
  sourceRef?: AutomationSourceRef;
}

const DEFAULT_BUFFER_SIZE = 8192;

/**
 * Ring buffer that accumulates register-driven automation data per parameter.
 * Engines push entries during playback; UI reads ranges for display.
 */
export class AutomationCapture {
  private buffers = new Map<string, CaptureEntry[]>();
  private heads = new Map<string, number>();  // write head per param
  private counts = new Map<string, number>(); // entry count per param (clamped to bufferSize)
  private bufferSize: number;

  constructor(bufferSize = DEFAULT_BUFFER_SIZE) {
    this.bufferSize = bufferSize;
  }

  /** Push a captured value for a parameter */
  push(paramId: string, tick: number, value: number, sourceRef?: AutomationSourceRef): void {
    let buf = this.buffers.get(paramId);
    if (!buf) {
      buf = new Array<CaptureEntry>(this.bufferSize);
      this.buffers.set(paramId, buf);
      this.heads.set(paramId, 0);
      this.counts.set(paramId, 0);
    }
    const head = this.heads.get(paramId)!;
    buf[head] = { tick, value, sourceRef };
    this.heads.set(paramId, (head + 1) % this.bufferSize);
    this.counts.set(paramId, Math.min((this.counts.get(paramId) ?? 0) + 1, this.bufferSize));
  }

  /** Get all entries for a parameter within a tick range, sorted by tick */
  getRange(paramId: string, startTick: number, endTick: number): CaptureEntry[] {
    const buf = this.buffers.get(paramId);
    const count = this.counts.get(paramId) ?? 0;
    if (!buf || count === 0) return [];

    const head = this.heads.get(paramId)!;
    const result: CaptureEntry[] = [];

    const start = count < this.bufferSize ? 0 : head;
    for (let i = 0; i < count; i++) {
      const idx = (start + i) % this.bufferSize;
      const entry = buf[idx];
      if (entry && entry.tick >= startTick && entry.tick <= endTick) {
        result.push(entry);
      }
    }
    return result;
  }

  /** Get all entries for a parameter (no tick filter) */
  getAll(paramId: string): CaptureEntry[] {
    const buf = this.buffers.get(paramId);
    const count = this.counts.get(paramId) ?? 0;
    if (!buf || count === 0) return [];

    const head = this.heads.get(paramId)!;
    const result: CaptureEntry[] = [];
    const start = count < this.bufferSize ? 0 : head;
    for (let i = 0; i < count; i++) {
      const idx = (start + i) % this.bufferSize;
      if (buf[idx]) result.push(buf[idx]);
    }
    return result;
  }

  /** Get all parameter IDs that have received data */
  getActiveParams(): string[] {
    const active: string[] = [];
    for (const [paramId, count] of this.counts) {
      if (count > 0) active.push(paramId);
    }
    return active;
  }

  /** Clear all captured data */
  clear(): void {
    this.buffers.clear();
    this.heads.clear();
    this.counts.clear();
  }

  /** Clear data for a single parameter */
  clearParam(paramId: string): void {
    this.buffers.delete(paramId);
    this.heads.delete(paramId);
    this.counts.delete(paramId);
  }
}

/** Singleton capture instance shared across all engines */
let globalCapture: AutomationCapture | null = null;

export function getAutomationCapture(): AutomationCapture {
  if (!globalCapture) {
    globalCapture = new AutomationCapture();
  }
  return globalCapture;
}
