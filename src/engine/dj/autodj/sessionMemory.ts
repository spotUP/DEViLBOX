/**
 * DJSessionMemory (plan sections 28, 29, 40): what the DJ did recently, so
 * the planners can avoid repetition and read the set's trajectory. Bounded.
 */
import type { EffectKind, SessionMemorySnapshot, TransitionRecord, TransitionStyle } from './types';

const KEEP = 64;

export class DJSessionMemory {
  private records: TransitionRecord[] = [];
  private tracks: Array<{ id: string; artist: string | null; time: number; energy: number; key: string | null; bpm: number }> = [];
  private peaks: number[] = [];
  /** Performed scratch phrases: their gestures, source and time (scratch plan D9). */
  private scratches: Array<{ time: number; gestures: string[]; source: string | null }> = [];
  readonly startedAt: number;
  private now: () => number;

  constructor(now: () => number = () => Date.now()) {
    this.now = now;
    this.startedAt = now();
  }

  recordTrackStart(id: string, info: { artist?: string | null; energy: number; key: string | null; bpm: number; time?: number }): void {
    this.tracks.push({ id, artist: info.artist ?? null, time: info.time ?? this.now(), energy: info.energy, key: info.key, bpm: info.bpm });
    if (this.tracks.length > KEEP) this.tracks.splice(0, this.tracks.length - KEEP);
  }

  recordTransition(rec: TransitionRecord): void {
    this.records.push(rec);
    if (this.records.length > KEEP) this.records.splice(0, this.records.length - KEEP);
    if (rec.energyAfter >= 0.8) this.peaks.push(rec.time);
    if (this.peaks.length > KEEP) this.peaks.splice(0, this.peaks.length - KEEP);
  }

  /** One performed scratch phrase (the Auto DJ's SCRATCH decision). */
  recordScratch(info: { gestures: readonly string[]; source: string | null; time?: number }): void {
    this.scratches.push({ time: info.time ?? this.now(), gestures: [...info.gestures], source: info.source });
    if (this.scratches.length > KEEP) this.scratches.splice(0, this.scratches.length - KEEP);
  }

  get scratchCount(): number { return this.scratches.length; }

  /** Gestures of the last `n` scratch phrases, oldest first. */
  recentScratchGestures(n = 4): string[] { return this.scratches.slice(-n).flatMap((s) => s.gestures); }

  get transitionCount(): number { return this.records.length; }

  /** How many times a track id was played this session. */
  playCount(id: string): number { return this.tracks.filter((t) => t.id === id).length; }

  recentTransitions(n = 6): TransitionRecord[] { return this.records.slice(-n); }

  /** 0..1 how repetitive the recent transition types are (same style in a row). */
  styleRepetition(style: TransitionStyle, n = 4): number {
    const recent = this.records.slice(-n);
    if (recent.length === 0) return 0;
    let run = 0;
    for (let i = recent.length - 1; i >= 0; i--) { if (recent[i].style === style) run++; else break; }
    return Math.min(1, run / 3);
  }

  lengthRepetition(bars: number, n = 4): number {
    const recent = this.records.slice(-n);
    if (recent.length === 0) return 0;
    let run = 0;
    for (let i = recent.length - 1; i >= 0; i--) { if (recent[i].lengthBars === bars) run++; else break; }
    return Math.min(1, run / 3);
  }

  fxRecency(kind: EffectKind, n = 4): number {
    const recent = this.records.slice(-n);
    const uses = recent.filter((r) => r.effects.includes(kind)).length;
    return Math.min(1, uses / 2);
  }

  /** Energy trend over the last transitions, -1..1. */
  energyTrend(n = 3): number {
    const recent = this.records.slice(-n);
    if (recent.length === 0) return 0;
    const d = recent.reduce((acc, r) => acc + (r.energyAfter - r.energyBefore), 0) / recent.length;
    return Math.max(-1, Math.min(1, d * 3));
  }

  timeSinceLastPeakSec(): number {
    if (this.peaks.length === 0) return Infinity;
    return (this.now() - this.peaks[this.peaks.length - 1]) / 1000;
  }

  recentReleases(n = 4): number {
    return this.records.slice(-n).filter((r) => r.energyAfter < r.energyBefore - 0.15).length;
  }

  /** Repeated transition patterns: the same (style, length) pair seen twice in the last six. */
  repeatedPatterns(): string[] {
    const seen = new Map<string, number>();
    for (const r of this.records.slice(-6)) {
      const k = `${r.style}/${r.lengthBars}`;
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    return [...seen.entries()].filter(([, c]) => c >= 2).map(([k]) => k);
  }

  elapsedSec(): number { return (this.now() - this.startedAt) / 1000; }

  snapshot(): SessionMemorySnapshot {
    const recentTracks = this.tracks.slice(-8);
    const recent = this.records.slice(-8);
    const counts = new Map<string, number>();
    for (const t of this.tracks) counts.set(t.id, (counts.get(t.id) ?? 0) + 1);
    return {
      recentTracks: recentTracks.map((t) => t.id),
      recentArtists: recentTracks.map((t) => t.artist).filter((a): a is string => !!a),
      recentKeys: recentTracks.map((t) => t.key).filter((k): k is string => !!k),
      recentBPMs: recentTracks.map((t) => t.bpm),
      recentTransitionTypes: recent.map((r) => r.style),
      recentFX: recent.flatMap((r) => r.effects),
      recentEnergy: recentTracks.map((t) => t.energy),
      recentCuts: recent.filter((r) => r.wasCut).length,
      recentBassSwaps: recent.filter((r) => r.wasBassSwap).length,
      recentVocals: recent.filter((r) => r.hadVocalOverlap).length,
      recentTransitionLengths: recent.map((r) => r.lengthBars),
      recentPeaks: this.peaks.slice(-4),
      repeatedTracks: [...counts.entries()].filter(([, c]) => c > 1).map(([id]) => id),
      repeatedTransitionPatterns: this.repeatedPatterns(),
      transitionCount: this.records.length,
      elapsedSec: this.elapsedSec(),
      scratchPhrases: this.scratches.length,
      recentScratchGestures: this.recentScratchGestures(),
    };
  }

  reset(): void {
    this.records = [];
    this.tracks = [];
    this.peaks = [];
    this.scratches = [];
  }
}
