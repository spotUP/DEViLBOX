/**
 * DX7LayoutPanel - the DX7's declarative operator panel (DX7_LAYOUT) with its algorithm diagram and curves.
 *
 * The knob values come from what the firmware is actually playing: `dx7.vced` holds only the edits made on these knobs,
 * so a voice loaded from a bank would otherwise show defaults (and draw curves for a voice nobody hears). The panel asks
 * the engine for the firmware's edit buffer (the 155 VCED bytes) and lays the instrument's own edits over it.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { DOMSynthPanel } from './DOMSynthPanel';
import { Dx7AlgorithmDiagram } from '../shared/Dx7AlgorithmDiagram';
import { getSynthLayout } from '@/constants/synthLayouts';
import { getToneEngine } from '../../../engine/ToneEngine';
import type { DX7Synth } from '../../../engine/dx7/DX7Synth';
import type { InstrumentConfig } from '@typedefs/instrument';

interface DX7LayoutPanelProps {
  instrument: Pick<InstrumentConfig, 'id' | 'dx7'>;
  onChange: (updates: Record<string, unknown>) => void;
}

const POLL_MS = 500;

/** The DX7 engine instance of an instrument (the editor can open before a note has created one). */
function findSynth(instrumentId: number): DX7Synth | null {
  try {
    const engine = getToneEngine();
    for (const [key, synth] of engine.instruments) {
      if ((key >>> 16) === instrumentId && synth && 'readVoice' in synth) return synth as unknown as DX7Synth;
    }
  } catch { /* engine not ready */ }
  return null;
}

/** The firmware's current voice as `{ '0': n, ... }`, refreshed while the panel is open; null until the engine answers. */
function useSoundingVced(instrumentId: number): Record<string, number> | null {
  const [vced, setVced] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    let stopped = false;
    let last = '';
    const poll = async () => {
      const synth = findSynth(instrumentId);
      const bytes = synth ? await synth.readVoice() : null;
      if (stopped || !bytes) return;
      const key = bytes.join(',');
      if (key === last) return;
      last = key;
      setVced(Object.fromEntries(Array.from(bytes, (b, i) => [String(i), b])));
    };
    void poll();
    const timer = setInterval(() => { void poll(); }, POLL_MS);
    return () => { stopped = true; clearInterval(timer); };
  }, [instrumentId]);
  return vced;
}

export const DX7LayoutPanel: React.FC<DX7LayoutPanelProps> = ({ instrument, onChange }) => {
  const layout = getSynthLayout('DX7');
  const sounding = useSoundingVced(instrument.id);
  const dx7 = instrument.dx7;
  const config = useMemo(() => {
    const edits = ((dx7 as { vced?: Record<string, number> } | undefined)?.vced ?? {});
    return { dx7: { ...(dx7 ?? {}), vced: { ...(sounding ?? {}), ...edits } } } as Record<string, unknown>;
  }, [dx7, sounding]);
  if (!layout) return null;
  const vced = (config.dx7 as { vced: Record<string, number> }).vced;
  return (
    <div className="border-t border-dark-border/30 mt-2 pt-2">
      <div className="mb-2 max-w-md">
        <Dx7AlgorithmDiagram algorithm={Number(vced['134'] ?? 0)} feedback={Number(vced['135'] ?? 0)} />
      </div>
      <DOMSynthPanel layout={layout} config={config} onChange={onChange} instrumentId={instrument.id} />
    </div>
  );
};
