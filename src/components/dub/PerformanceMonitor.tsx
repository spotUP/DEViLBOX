/**
 * Gate O1 — the performance monitor.
 *
 * What the performer is doing and why, while it does it. Without this the only
 * way to understand a decision is to read the fire log afterwards and guess,
 * and "why did it go quiet there" is the question people actually ask.
 *
 * It reads ONE snapshot per frame rather than polling several getters: five
 * reads of a moving performer can show five different instants, which makes
 * the monitor lie in exactly the situations it is needed for.
 *
 * Read-only by design. A monitor with buttons becomes a second control surface
 * that disagrees with the first.
 */

import { useEffect, useRef, useState } from 'react';
import type { PerformanceSnapshot } from '@/engine/dub/AutoDub';

/** How often to sample. The performer decides four times a second. */
const POLL_MS = 250;

export function PerformanceMonitor(): React.ReactElement | null {
  const [snapshot, setSnapshot] = useState<PerformanceSnapshot | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const { getPerformanceSnapshot } = await import('@/engine/dub/AutoDub');
        if (!cancelled) setSnapshot(getPerformanceSnapshot());
      } catch {
        // AutoDub not loaded yet — the monitor simply shows nothing.
      }
    };
    void poll();
    timer.current = setInterval(() => { void poll(); }, POLL_MS);
    return () => {
      cancelled = true;
      if (timer.current !== null) clearInterval(timer.current);
    };
  }, []);

  if (!snapshot) return null;

  return (
    <div className="flex flex-col gap-1 px-2 py-1.5 bg-dark-bgSecondary border-t border-dark-border font-mono">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono text-text-secondary">Performer</span>
        <span
          className={`text-[9px] font-mono px-1 rounded ${
            snapshot.running
              ? 'bg-accent-success/20 text-accent-success'
              : 'bg-dark-bgTertiary text-text-muted'
          }`}
        >
          {snapshot.running ? 'RUNNING' : 'STOPPED'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
        <Field label="Persona" value={snapshot.persona} />
        <Field label="State" value={snapshot.state} />
        <Field label="Intention" value={snapshot.intention ?? '—'} />
        <Field label="Target" value={formatTarget(snapshot.target)} />
        <Field label="Phrase" value={formatPhrase(snapshot)} />
        <Field label="In flight" value={String(snapshot.gesturesInFlight)} />
      </div>

      <Meter label="Wet" value={snapshot.wet} />
      <Meter label="Feedback" value={snapshot.feedback} />

      <Field
        label="Last move"
        value={snapshot.lastMove
          ? `${snapshot.lastMove.moveId}${snapshot.lastMove.channelId !== undefined ? ` ch${snapshot.lastMove.channelId}` : ''}`
          : '—'}
      />
      <Field
        label="Next event"
        value={snapshot.nextTargetRow !== null ? `row ${snapshot.nextTargetRow.toFixed(1)}` : '—'}
      />

      {snapshot.why.length > 0 && (
        <div className="flex flex-col gap-0.5 pt-1 border-t border-dark-borderLight">
          <span className="text-[9px] font-mono text-text-muted">WHY?</span>
          {snapshot.why.map((factor, i) => (
            <span key={i} className="text-[9px] font-mono text-text-secondary">
              {factor}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="flex items-baseline justify-between gap-1">
      <span className="text-[9px] font-mono text-text-muted">{label}</span>
      <span className="text-[10px] font-mono text-text-primary truncate">{value}</span>
    </div>
  );
}

/**
 * A level readout.
 *
 * Bars rather than numbers because the question is "is there room left", which
 * a shape answers at a glance and a decimal does not.
 */
function Meter({ label, value }: { label: string; value: number }): React.ReactElement {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const tone = value > 0.8
    ? 'bg-accent-error'
    : value > 0.6
      ? 'bg-accent-warning'
      : 'bg-accent-primary';
  return (
    <div className="flex items-center gap-1">
      <span className="text-[9px] font-mono text-text-muted w-14">{label}</span>
      <div className="flex-1 h-1 bg-dark-bgTertiary rounded overflow-hidden">
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[9px] font-mono text-text-secondary w-8 text-right">
        {value.toFixed(2)}
      </span>
    </div>
  );
}

function formatTarget(target: PerformanceSnapshot['target']): string {
  if (!target || target.kind === 'none') return '—';
  if (target.kind === 'channel' && target.channelId !== undefined) return `ch${target.channelId}`;
  return target.kind;
}

function formatPhrase(snapshot: PerformanceSnapshot): string {
  if (snapshot.bar === null) return '—';
  const pct = snapshot.phrasePosition !== null
    ? ` ${Math.round(snapshot.phrasePosition * 100)}%`
    : '';
  return `bar ${snapshot.bar} (${snapshot.barInPhrase ?? 0})${pct}`;
}
