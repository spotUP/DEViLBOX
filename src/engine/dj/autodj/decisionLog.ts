/**
 * "Why did you do that?" log (plan section 45): every autonomous Auto DJ
 * decision as a structured entry with reasons and rejected alternatives.
 * Ring buffer, subscribable, readable through the MCP bridge and the debug
 * view. The single source of the explanation text the UI shows.
 */
import type { DecisionKind, DecisionLogEntry } from './types';

const CAPACITY = 400;

class DecisionLog {
  private entries: DecisionLogEntry[] = [];
  private seq = 0;
  private listeners = new Set<(entry: DecisionLogEntry) => void>();
  /** Call counts per decision kind: the reachability sentinel for tests. */
  readonly counts: Record<string, number> = {};

  record(
    decision: DecisionKind,
    reasons: string[],
    opts: { selectedTrack?: string; rejectedAlternatives?: Array<{ track: string; reason: string }>; details?: Record<string, unknown>; time?: number } = {},
  ): DecisionLogEntry {
    const entry: DecisionLogEntry = {
      seq: ++this.seq,
      time: opts.time ?? Date.now(),
      decision,
      selectedTrack: opts.selectedTrack,
      reasons,
      rejectedAlternatives: opts.rejectedAlternatives ?? [],
      details: opts.details,
    };
    this.entries.push(entry);
    if (this.entries.length > CAPACITY) this.entries.splice(0, this.entries.length - CAPACITY);
    this.counts[decision] = (this.counts[decision] ?? 0) + 1;
    for (const l of this.listeners) { try { l(entry); } catch { /* listener error must not break the DJ */ } }
    return entry;
  }

  /** Newest last. */
  list(limit = 50, kind?: DecisionKind): DecisionLogEntry[] {
    const src = kind ? this.entries.filter((e) => e.decision === kind) : this.entries;
    return src.slice(Math.max(0, src.length - limit));
  }

  last(kind?: DecisionKind): DecisionLogEntry | null {
    const l = this.list(1, kind);
    return l.length ? l[0] : null;
  }

  subscribe(listener: (entry: DecisionLogEntry) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  clear(): void {
    this.entries = [];
    for (const k of Object.keys(this.counts)) delete this.counts[k];
  }

  get size(): number { return this.entries.length; }
}

let instance: DecisionLog | null = null;

export function getDecisionLog(): DecisionLog {
  if (!instance) instance = new DecisionLog();
  return instance;
}

/** Format an entry the way the debug view and the console show it: "+ reason" / "- rejected". */
export function formatDecision(entry: DecisionLogEntry): string[] {
  const lines = [`${entry.decision}${entry.selectedTrack ? `: ${entry.selectedTrack}` : ''}`];
  for (const r of entry.reasons) lines.push(`+ ${r}`);
  for (const alt of entry.rejectedAlternatives) lines.push(`- ${alt.track}: ${alt.reason}`);
  return lines;
}
