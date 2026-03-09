/**
 * AudioMonitor — Ring-buffer audio monitoring for live performance analysis.
 *
 * Captures audio snapshots at regular intervals (default 250ms),
 * storing them in a fixed-size ring buffer. Provides energy profiling
 * (band breakdown over time), simple BPM estimation, and summary stats.
 */

import { AudioDataBus, type VJAudioFrame } from '../../engine/vj/AudioDataBus';

export interface AudioSnapshot {
  time: number;
  rms: number;
  peak: number;
  subEnergy: number;
  bassEnergy: number;
  midEnergy: number;
  highEnergy: number;
  beat: boolean;
}

const DEFAULT_BUFFER_SIZE = 120;       // ~30s at 250ms interval
const DEFAULT_INTERVAL_MS = 250;
const BPM_MIN = 60;
const BPM_MAX = 200;

export class AudioMonitor {
  private buffer: AudioSnapshot[] = [];
  private bufferSize: number;
  private writeIdx = 0;
  private filled = false;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private intervalMs: number;
  private bus: AudioDataBus;
  private beatTimes: number[] = [];

  constructor(bufferSize = DEFAULT_BUFFER_SIZE, intervalMs = DEFAULT_INTERVAL_MS) {
    this.bufferSize = bufferSize;
    this.intervalMs = intervalMs;
    this.bus = AudioDataBus.getShared();
  }

  start(): void {
    if (this.intervalId) return;
    this.buffer = [];
    this.writeIdx = 0;
    this.filled = false;
    this.beatTimes = [];

    this.intervalId = setInterval(() => this.capture(), this.intervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  isRunning(): boolean {
    return this.intervalId !== null;
  }

  private capture(): void {
    this.bus.update();
    const frame: VJAudioFrame = this.bus.getFrame();
    const now = performance.now();

    const snapshot: AudioSnapshot = {
      time: now,
      rms: frame.rms,
      peak: frame.peak,
      subEnergy: frame.subEnergy,
      bassEnergy: frame.bassEnergy,
      midEnergy: frame.midEnergy,
      highEnergy: frame.highEnergy,
      beat: frame.beat,
    };

    if (frame.beat) {
      this.beatTimes.push(now);
      // Keep only last 30 beats
      if (this.beatTimes.length > 30) this.beatTimes.shift();
    }

    if (this.buffer.length < this.bufferSize) {
      this.buffer.push(snapshot);
    } else {
      this.buffer[this.writeIdx] = snapshot;
      this.filled = true;
    }
    this.writeIdx = (this.writeIdx + 1) % this.bufferSize;
  }

  /** Get ordered snapshots (oldest first) */
  getSnapshots(): AudioSnapshot[] {
    if (!this.filled) return this.buffer.slice();
    // Ring buffer: data wraps at writeIdx
    return [
      ...this.buffer.slice(this.writeIdx),
      ...this.buffer.slice(0, this.writeIdx),
    ];
  }

  /** Estimate BPM from detected beats */
  getBPM(): number | null {
    if (this.beatTimes.length < 3) return null;

    const intervals: number[] = [];
    for (let i = 1; i < this.beatTimes.length; i++) {
      intervals.push(this.beatTimes[i] - this.beatTimes[i - 1]);
    }

    // Median interval (robust to outliers)
    intervals.sort((a, b) => a - b);
    const median = intervals[Math.floor(intervals.length / 2)];

    if (median <= 0) return null;
    const bpm = 60000 / median;
    return bpm >= BPM_MIN && bpm <= BPM_MAX ? Math.round(bpm) : null;
  }

  /** Get energy profile (band averages over the buffer window) */
  getEnergyProfile(): Record<string, number> {
    const snaps = this.getSnapshots();
    if (snaps.length === 0) {
      return { rmsAvg: 0, peakMax: 0, subAvg: 0, bassAvg: 0, midAvg: 0, highAvg: 0, beats: 0 };
    }

    let rmsSum = 0, peakMax = 0, subSum = 0, bassSum = 0, midSum = 0, highSum = 0, beats = 0;
    for (const s of snaps) {
      rmsSum += s.rms;
      if (s.peak > peakMax) peakMax = s.peak;
      subSum += s.subEnergy;
      bassSum += s.bassEnergy;
      midSum += s.midEnergy;
      highSum += s.highEnergy;
      if (s.beat) beats++;
    }

    const n = snaps.length;
    return {
      rmsAvg: +(rmsSum / n).toFixed(4),
      peakMax: +peakMax.toFixed(4),
      subAvg: +(subSum / n).toFixed(4),
      bassAvg: +(bassSum / n).toFixed(4),
      midAvg: +(midSum / n).toFixed(4),
      highAvg: +(highSum / n).toFixed(4),
      beats,
    };
  }

  /** Get summary data for MCP response */
  getData(): Record<string, unknown> {
    const snapshots = this.getSnapshots();
    const profile = this.getEnergyProfile();
    const bpm = this.getBPM();

    // Downsample snapshots to max 60 points for the response
    const maxPoints = 60;
    let sampled: AudioSnapshot[];
    if (snapshots.length <= maxPoints) {
      sampled = snapshots;
    } else {
      const step = snapshots.length / maxPoints;
      sampled = [];
      for (let i = 0; i < maxPoints; i++) {
        sampled.push(snapshots[Math.floor(i * step)]);
      }
    }

    return {
      running: this.isRunning(),
      snapshotCount: snapshots.length,
      bufferDurationMs: snapshots.length * this.intervalMs,
      estimatedBPM: bpm,
      energyProfile: profile,
      snapshots: sampled.map(s => ({
        rms: +s.rms.toFixed(4),
        peak: +s.peak.toFixed(4),
        sub: +s.subEnergy.toFixed(3),
        bass: +s.bassEnergy.toFixed(3),
        mid: +s.midEnergy.toFixed(3),
        high: +s.highEnergy.toFixed(3),
        beat: s.beat,
      })),
    };
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let instance: AudioMonitor | null = null;

export function getAudioMonitor(): AudioMonitor {
  if (!instance) instance = new AudioMonitor();
  return instance;
}

export function disposeAudioMonitor(): void {
  if (instance) {
    instance.stop();
    instance = null;
  }
}
