/**
 * LoudnessMeterPanel — live EBU R128 / ITU-R BS.1770-4 loudness meter.
 *
 * Momentary + Short-term bars, Integrated LUFS headline with streaming (−14)
 * and broadcast (−23) target ticks, Loudness Range (LRA), and True-Peak with a
 * −1 dBTP over-flag. Measures ONLY while open: mounting starts the master-tap
 * worklet session, unmounting stops it — closed costs nothing.
 *
 * DSP: src/lib/audio/loudnessMeter.ts (tested against the BS.1770 tabulated
 * coefficients); wiring: src/lib/audio/loudnessSession.ts.
 */

import React, { useEffect, useState } from 'react';
import {
  startLoudnessSession,
  stopLoudnessSession,
  getLoudnessSnapshot,
  type LoudnessSnapshot,
} from '@/lib/audio/loudnessSession';

const SCALE_MIN = -36; // LUFS at bar bottom
const SCALE_MAX = 0;

function pct(lufs: number): number {
  if (!isFinite(lufs)) return 0;
  const p = ((lufs - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100;
  return Math.max(0, Math.min(100, p));
}

function fmt(v: number, digits = 1): string {
  return isFinite(v) ? v.toFixed(digits) : '—';
}

const Bar: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="flex flex-col items-center gap-1 flex-1">
    <div className="relative h-28 w-4 bg-dark-bgTertiary rounded overflow-hidden border border-dark-borderLight">
      <div
        className="absolute bottom-0 left-0 right-0 bg-accent-primary transition-[height] duration-75"
        style={{ height: `${pct(value)}%` }}
      />
      {/* target ticks: −14 streaming, −23 broadcast */}
      <div className="absolute left-0 right-0 h-px bg-accent-warning/70" style={{ bottom: `${pct(-14)}%` }} />
      <div className="absolute left-0 right-0 h-px bg-accent-secondary/70" style={{ bottom: `${pct(-23)}%` }} />
    </div>
    <span className="text-[9px] font-mono text-text-muted uppercase">{label}</span>
    <span className="text-[10px] font-mono text-text-secondary tabular-nums">{fmt(value)}</span>
  </div>
);

export const LoudnessMeterPanel: React.FC = () => {
  const [snap, setSnap] = useState<LoudnessSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let iv: ReturnType<typeof setInterval> | null = null;
    startLoudnessSession()
      .then(() => {
        if (!alive) { stopLoudnessSession(); return; }
        iv = setInterval(() => {
          if (document.hidden) return;
          setSnap(getLoudnessSnapshot());
        }, 100);
      })
      .catch((e: Error) => { if (alive) setError(e.message); });
    return () => {
      alive = false;
      if (iv) clearInterval(iv);
      stopLoudnessSession();
    };
  }, []);

  const overTp = snap ? snap.truePeak > -1 : false;

  return (
    <div className="p-3 bg-dark-bgSecondary border border-dark-border rounded-lg w-56">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider">Loudness (EBU R128)</span>
        {overTp && (
          <span className="text-[9px] font-mono px-1 rounded bg-accent-error text-text-inverse">OVER</span>
        )}
      </div>

      {error ? (
        <div className="text-[10px] font-mono text-accent-error">{error}</div>
      ) : (
        <>
          {/* Integrated headline */}
          <div className="text-center mb-2">
            <span className="font-mono text-2xl font-bold tabular-nums text-text-primary">
              {fmt(snap?.integrated ?? -Infinity)}
            </span>
            <span className="ml-1 text-[10px] font-mono text-text-muted">LUFS INT</span>
          </div>

          <div className="flex gap-2">
            <Bar label="M" value={snap?.momentary ?? -Infinity} />
            <Bar label="S" value={snap?.shortTerm ?? -Infinity} />
          </div>

          <div className="flex justify-between mt-2 text-[10px] font-mono">
            <span className="text-text-muted">
              LRA <span className="text-text-secondary tabular-nums">{fmt(snap?.lra ?? 0)} LU</span>
            </span>
            <span className="text-text-muted">
              TP{' '}
              <span className={`tabular-nums ${overTp ? 'text-accent-error' : 'text-text-secondary'}`}>
                {fmt(snap?.truePeak ?? -Infinity)} dBTP
              </span>
            </span>
          </div>

          <div className="flex justify-between mt-1 text-[9px] font-mono text-text-muted">
            <span><span className="text-accent-warning">—</span> −14 streaming</span>
            <span><span className="text-accent-secondary">—</span> −23 broadcast</span>
          </div>
        </>
      )}
    </div>
  );
};
