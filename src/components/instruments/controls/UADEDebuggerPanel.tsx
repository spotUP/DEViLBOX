/**
 * UADEDebuggerPanel — Live Paula channel debugger (DOM version).
 *
 * Displays 4 Paula channel strips updating at the rate UADEEngine fires
 * channel updates (~20 Hz). Each strip shows: note name derived from the
 * Amiga period, a volume bar, a DMA active indicator, the raw period value,
 * and the instrument name matched by samplePtr proximity to instrBase.
 *
 * Read-only display — does not modify any state.
 * Safe to render when UADEEngine is not running; all fields fall back gracefully.
 */

import React, { useEffect, useRef, useState } from 'react';
import type { UADEChannelData } from '@/engine/uade/UADEEngine';
import { UADEEngine } from '@/engine/uade/UADEEngine';
import { amigaPeriodToNote } from '@/engine/uade/amigaPeriodToNote';
import type { InstrumentConfig } from '@/types/instrument';

interface Props {
  instruments: InstrumentConfig[];
}

const CHANNEL_LABELS = ['CH1', 'CH2', 'CH3', 'CH4'];

/** Find the closest instrument by instrBase address proximity to a samplePtr. */
function resolveInstrumentName(samplePtr: number, instruments: InstrumentConfig[]): string {
  if (samplePtr === 0) return '—';
  let best: InstrumentConfig | null = null;
  let bestDist = Infinity;
  for (const instr of instruments) {
    const base = instr.uadeChipRam?.instrBase;
    if (base == null) continue;
    const dist = Math.abs(samplePtr - base);
    if (dist < bestDist) {
      bestDist = dist;
      best = instr;
    }
  }
  // Only accept matches within a reasonable range (64 KB)
  if (best && bestDist < 65536) return best.name ?? '—';
  return '—';
}

export const UADEDebuggerPanel: React.FC<Props> = ({ instruments }) => {
  const [channels, setChannels] = useState<UADEChannelData[] | null>(null);
  const instrumentsRef = useRef(instruments);
  useEffect(() => { instrumentsRef.current = instruments; }, [instruments]);

  useEffect(() => {
    if (!UADEEngine.hasInstance()) return;
    let engine: UADEEngine;
    try {
      engine = UADEEngine.getInstance();
    } catch {
      return;
    }
    const unsub = engine.onChannelData((ch) => {
      setChannels([...ch]);
    });
    return unsub;
  }, []);

  if (!channels) {
    return (
      <div className="rounded-lg border border-dark-border bg-dark-bg p-2 text-[10px] font-mono text-text-muted select-none">
        Paula debugger — waiting for playback…
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-dark-border bg-dark-bg p-2 select-none">
      <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-text-secondary mb-2">
        Paula Debugger
      </div>
      <div className="grid grid-cols-4 gap-1">
        {channels.slice(0, 4).map((ch, idx) => {
          const noteInfo = ch.period > 0 ? amigaPeriodToNote(ch.period) : null;
          const volPct   = Math.round((ch.volume / 64) * 100);
          const instrName = resolveInstrumentName(ch.samplePtr, instrumentsRef.current);

          return (
            <div
              key={idx}
              className="flex flex-col gap-1 rounded border border-dark-border bg-dark-bgSecondary p-1.5"
            >
              {/* Channel label + DMA dot */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-text-secondary">
                  {CHANNEL_LABELS[idx]}
                </span>
                <span
                  className={`w-2 h-2 rounded-full ${
                    ch.dma
                      ? 'bg-accent-success text-accent-success shadow-[0_0_4px_currentColor]'
                      : 'bg-dark-bgActive'
                  }`}
                  title={ch.dma ? 'DMA active' : 'DMA off'}
                />
              </div>

              {/* Note name */}
              <div
                className={`text-[13px] font-mono font-bold leading-none ${
                  ch.dma ? 'text-accent-primary' : 'text-text-muted'
                }`}
              >
                {noteInfo ? noteInfo.name : (ch.period > 0 ? `P${ch.period}` : '---')}
              </div>

              {/* Volume bar */}
              <div className="w-full h-1.5 rounded-full bg-dark-bgTertiary overflow-hidden">
                <div
                  className={`h-full rounded-full transition-none ${
                    ch.volume > 48
                      ? 'bg-accent-success'
                      : ch.volume > 24
                        ? 'bg-accent-primary'
                        : 'bg-accent-primary/40'
                  }`}
                  style={{ width: `${volPct}%` }}
                />
              </div>

              {/* Period + volume numbers */}
              <div className="flex justify-between text-[10px] font-mono text-text-muted">
                <span>{ch.period > 0 ? ch.period : '—'}</span>
                <span>{ch.volume}/64</span>
              </div>

              {/* Instrument name */}
              <div
                className="text-[10px] font-mono truncate text-text-muted"
                title={instrName}
              >
                {instrName}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
