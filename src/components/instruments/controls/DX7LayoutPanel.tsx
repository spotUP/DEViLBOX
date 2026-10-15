/**
 * DX7LayoutPanel - the DX7 editor (Simple UI): tabs Voice, Operators, Modulation and Library.
 *
 *  - The knobs are the declarative DX7 layout (constants/synthLayouts/dx7.ts) drawn by the shared DOMSynthPanel, one
 *    tab (or one operator) at a time; the tabs are the shared TabStrip as in KlysControls.
 *  - The knob values come from what the firmware is actually playing: `dx7.vced` holds only the edits made on these
 *    knobs, so a voice loaded from a bank would otherwise show defaults (and draw curves for a voice nobody hears). The
 *    panel asks the engine for the firmware's edit buffer (the 155 VCED bytes) and lays the instrument's own edits over it.
 *  - A knob move reaches the firmware as one parameter change per key that changed: onChange({ dx7: { vced } }) ->
 *    useInstrumentStore -> DX7Synth.setVcedParam. Nothing else of `dx7` is sent, so a knob never reloads the bank.
 *  - The Library tab is DX7Controls (searchable library, presets, patch banks, SysEx file).
 */
import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DOMSynthPanel } from './DOMSynthPanel';
import { Dx7VoiceNameField } from './Dx7VoiceNameField';
import { Dx7AlgorithmDiagram } from '../shared/Dx7AlgorithmDiagram';
import { TabStrip } from '@components/ui/TabStrip';
import { dx7LayoutForTab, DX7_OPERATOR_TAB_IDS } from '@/constants/synthLayouts/dx7';
import { mergeVced, nameToVced, vcedDelta, vcedName, type VcedRecord } from '../../../engine/dx7/dx7VcedEdit';
import { getToneEngine } from '../../../engine/ToneEngine';
import type { DX7Synth } from '../../../engine/dx7/DX7Synth';
import type { InstrumentConfig } from '@typedefs/instrument';

const DX7Controls = lazy(() => import('./DX7Controls').then(m => ({ default: m.DX7Controls })));

interface DX7LayoutPanelProps {
  instrument: Pick<InstrumentConfig, 'id' | 'dx7' | 'volume' | 'synthType'>;
  onChange: (updates: Record<string, unknown>) => void;
}

type Dx7Tab = 'voice' | 'operators' | 'modulation' | 'library';
const TABS: ReadonlyArray<{ id: Dx7Tab; label: string }> = [
  { id: 'voice', label: 'Voice' },
  { id: 'operators', label: 'Operators' },
  { id: 'modulation', label: 'Modulation' },
  { id: 'library', label: 'Library' },
];
const OPERATOR_TABS = DX7_OPERATOR_TAB_IDS.map((id, i) => ({ id, label: `Operator ${i + 1}` }));

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
function useSoundingVced(instrumentId: number): VcedRecord | null {
  const [vced, setVced] = useState<VcedRecord | null>(null);
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
  const sounding = useSoundingVced(instrument.id);
  const dx7 = instrument.dx7;
  const edits = (dx7 as { vced?: VcedRecord } | undefined)?.vced;
  const vced = useMemo(() => mergeVced(sounding, edits), [sounding, edits]);
  const config = useMemo(() => ({ dx7: { ...(dx7 ?? {}), vced }, volume: instrument.volume ?? -6 }) as Record<string, unknown>, [dx7, vced, instrument.volume]);

  const [tab, setTab] = useState<Dx7Tab>('voice');
  const [operatorTab, setOperatorTab] = useState<(typeof DX7_OPERATOR_TAB_IDS)[number]>('op1');

  // configRef pattern (docs/CONTROL_PATTERNS.md): the handlers read the latest values, their identity never changes.
  const vcedRef = useRef(vced);
  const editsRef = useRef(edits);
  useEffect(() => { vcedRef.current = vced; editsRef.current = edits; });

  const writeVced = useCallback((delta: VcedRecord) => {
    if (Object.keys(delta).length === 0) return;
    onChange({ dx7: { vced: { ...editsRef.current, ...delta } } });
  }, [onChange]);

  const onLayoutChange = useCallback((updates: Record<string, unknown>) => {
    const next = (updates.dx7 as { vced?: Record<string, unknown> } | undefined)?.vced;
    if (next) writeVced(vcedDelta(vcedRef.current, next));
    if (typeof updates.volume === 'number') onChange({ volume: updates.volume });
  }, [onChange, writeVced]);

  const rename = useCallback((name: string) => writeVced(nameToVced(name)), [writeVced]);
  const voiceName = vcedName(vced);
  const layoutTab = tab === 'operators' ? operatorTab : tab;
  const layout = useMemo(() => dx7LayoutForTab(layoutTab), [layoutTab]);

  return (
    <div className="flex flex-col gap-3 p-3 flex-1 min-h-0 overflow-y-auto scrollbar-modern">
      <TabStrip tabs={TABS} active={tab} onChange={setTab} ariaLabel="DX7 editor sections" />
      {tab === 'voice' && (
        <div className="flex items-start gap-4 flex-wrap">
          <div className="w-full max-w-md">
            <Dx7AlgorithmDiagram algorithm={Number(vced['134'] ?? 0)} feedback={Number(vced['135'] ?? 0)} />
          </div>
          <Dx7VoiceNameField name={voiceName} onCommit={rename} />
        </div>
      )}
      {tab === 'operators' && (
        <TabStrip tabs={OPERATOR_TABS} active={operatorTab} onChange={setOperatorTab} ariaLabel="DX7 operator" dense />
      )}
      {tab !== 'library' && (
        <DOMSynthPanel key={layoutTab} layout={layout} config={config} onChange={onLayoutChange} instrumentId={instrument.id} />
      )}
      {tab === 'library' && (
        <Suspense fallback={<div className="p-4 text-[10px] font-mono text-text-muted">Loading library...</div>}>
          <DX7Controls instrument={instrument as never} onChange={onChange} voiceName={voiceName} onRename={rename} />
        </Suspense>
      )}
    </div>
  );
};
