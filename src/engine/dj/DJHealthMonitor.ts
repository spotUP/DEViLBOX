/**
 * DJHealthMonitor — Periodic health checks for live performance.
 * Monitors AudioContext state and auto-resumes when suspended.
 * Exposes status via subscribe() for UI indicators.
 */
import * as Tone from 'tone';

export interface HealthStatus {
  audioContext: 'running' | 'suspended' | 'closed';
  memoryMB: number | null;
  engineReady: boolean;
  timestamp: number;
}

type HealthListener = (status: HealthStatus) => void;

let instance: DJHealthMonitor | null = null;

export class DJHealthMonitor {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<HealthListener>();
  private lastStatus: HealthStatus | null = null;

  static getInstance(): DJHealthMonitor {
    if (!instance) instance = new DJHealthMonitor();
    return instance;
  }

  static dispose(): void {
    instance?.stop();
    instance = null;
  }

  start(): void {
    if (this.intervalId) return;
    this.check();
    this.intervalId = setInterval(() => this.check(), 5000);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.listeners.clear();
  }

  subscribe(listener: HealthListener): () => void {
    this.listeners.add(listener);
    if (this.lastStatus) listener(this.lastStatus);
    return () => this.listeners.delete(listener);
  }

  private check(): void {
    const ctx = Tone.getContext().rawContext;
    const perf = performance as unknown as { memory?: { usedJSHeapSize: number } };

    const status: HealthStatus = {
      audioContext: (ctx?.state ?? 'closed') as HealthStatus['audioContext'],
      memoryMB: perf.memory ? Math.round(perf.memory.usedJSHeapSize / 1048576) : null,
      engineReady: ctx?.state === 'running',
      timestamp: Date.now(),
    };

    if (status.audioContext === 'suspended') {
      Tone.start().catch((err) => {
        console.warn('[DJHealthMonitor] AudioContext resume failed:', err?.message ?? err);
        // Mark engine as not ready so UI can show "tap to resume" indicator
        status.engineReady = false;
      });
    }

    this.lastStatus = status;
    for (const listener of this.listeners) {
      listener(status);
    }
  }
}
