/**
 * SteveTurnerControls.tsx — Synth parameter editor for Steve Turner format instruments
 *
 * Exposes the 17 instrument parameters from the 48-byte Steve Turner instrument
 * structure. Parameters are sent to the WASM engine via the SteveTurnerEngine's
 * setInstrumentParam() method.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { SteveTurnerConfig } from '@typedefs/instrument/exotic';
import { Knob } from '@components/controls/Knob';

type STTab = 'envelope' | 'vibrato' | 'misc';

/** Maps SteveTurnerConfig property names to WASM ST_PARAM_* IDs */
const PARAM_IDS: Record<keyof SteveTurnerConfig, number> = {
  priority: 0, sampleIdx: 1, initDelay: 2,
  env1Duration: 3, env1Delta: 4, env2Duration: 5, env2Delta: 6,
  pitchShift: 7, oscCount: 8, oscDelta: 9, oscLoop: 10,
  decayDelta: 11, numVibrato: 12, vibratoDelay: 13,
  vibratoSpeed: 14, vibratoMaxDepth: 15, chain: 16,
};

interface SteveTurnerControlsProps {
  config: SteveTurnerConfig;
  onChange: (updates: Partial<SteveTurnerConfig>) => void;
  instrumentIndex?: number;
}

const KnobCell: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  color: string;
  onChange: (v: number) => void;
}> = ({ label, value, min, max, color, onChange }) => (
  <div className="flex flex-col items-center gap-1">
    <Knob
      value={value}
      min={min} max={max} step={1}
      onChange={(v: number) => onChange(Math.round(v))}
      color={color}
    />
    <span className="text-[10px] text-text-secondary">{label}</span>
    <span className="text-[9px] text-text-tertiary font-mono">{value}</span>
  </div>
);

export const SteveTurnerControls: React.FC<SteveTurnerControlsProps> = ({
  config,
  onChange,
  instrumentIndex,
}) => {
  const [activeTab, setActiveTab] = useState<STTab>('envelope');

  // configRef pattern: avoid stale state in callbacks
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const upd = useCallback(<K extends keyof SteveTurnerConfig>(key: K, value: SteveTurnerConfig[K]) => {
    onChange({ [key]: value } as Partial<SteveTurnerConfig>);
    // Forward to WASM engine in real-time
    const paramId = PARAM_IDS[key];
    if (paramId !== undefined && instrumentIndex !== undefined) {
      import('@/engine/steveturner/SteveTurnerEngine').then(({ SteveTurnerEngine }) => {
        if (SteveTurnerEngine.hasInstance()) {
          SteveTurnerEngine.getInstance().setInstrumentParam(instrumentIndex, paramId, value as number);
        }
      }).catch((err) => console.warn('SteveTurner param forward failed:', err));
    }
  }, [onChange, instrumentIndex]);

  const tabs: { key: STTab; label: string }[] = [
    { key: 'envelope', label: 'Envelope' },
    { key: 'vibrato', label: 'Vibrato' },
    { key: 'misc', label: 'Misc' },
  ];

  return (
    <div className="p-3 space-y-3">
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border-primary pb-1">
        {tabs.map(t => (
          <button
            key={t.key}
            className={`px-3 py-1 text-xs rounded-t transition-colors ${
              activeTab === t.key
                ? 'bg-accent-primary text-white'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
            }`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
        {instrumentIndex !== undefined && (
          <span className="ml-auto text-xs text-text-tertiary self-center">
            Inst {instrumentIndex}
          </span>
        )}
      </div>

      {/* Envelope tab */}
      {activeTab === 'envelope' && (
        <div className="grid grid-cols-4 gap-3">
          <KnobCell label="Delay" value={config.initDelay} min={0} max={255} color="#4fc3f7"
            onChange={(v) => upd('initDelay', v)} />
          <KnobCell label="Seg1 Dur" value={config.env1Duration} min={0} max={255} color="#81c784"
            onChange={(v) => upd('env1Duration', v)} />
          <KnobCell label="Seg1 Delta" value={config.env1Delta} min={-128} max={127} color="#81c784"
            onChange={(v) => upd('env1Delta', v)} />
          <KnobCell label="Seg2 Dur" value={config.env2Duration} min={0} max={255} color="#ffb74d"
            onChange={(v) => upd('env2Duration', v)} />
          <KnobCell label="Seg2 Delta" value={config.env2Delta} min={-128} max={127} color="#ffb74d"
            onChange={(v) => upd('env2Delta', v)} />
          <KnobCell label="Osc Count" value={config.oscCount} min={0} max={65535} color="#ce93d8"
            onChange={(v) => upd('oscCount', v)} />
          <KnobCell label="Osc Delta" value={config.oscDelta} min={-128} max={127} color="#ce93d8"
            onChange={(v) => upd('oscDelta', v)} />
          <KnobCell label="Osc Loop" value={config.oscLoop} min={0} max={255} color="#ce93d8"
            onChange={(v) => upd('oscLoop', v)} />
          <KnobCell label="Decay" value={config.decayDelta} min={-128} max={127} color="#ef5350"
            onChange={(v) => upd('decayDelta', v)} />
        </div>
      )}

      {/* Vibrato tab */}
      {activeTab === 'vibrato' && (
        <div className="grid grid-cols-4 gap-3">
          <KnobCell label="Entries" value={config.numVibrato} min={0} max={5} color="#4dd0e1"
            onChange={(v) => upd('numVibrato', v)} />
          <KnobCell label="Vib Delay" value={config.vibratoDelay} min={0} max={255} color="#4dd0e1"
            onChange={(v) => upd('vibratoDelay', v)} />
          <KnobCell label="Vib Speed" value={config.vibratoSpeed} min={0} max={255} color="#4dd0e1"
            onChange={(v) => upd('vibratoSpeed', v)} />
          <KnobCell label="Vib Max" value={config.vibratoMaxDepth} min={0} max={255} color="#4dd0e1"
            onChange={(v) => upd('vibratoMaxDepth', v)} />
          <KnobCell label="Pitch Shift" value={config.pitchShift} min={0} max={7} color="#aed581"
            onChange={(v) => upd('pitchShift', v)} />
        </div>
      )}

      {/* Misc tab */}
      {activeTab === 'misc' && (
        <div className="grid grid-cols-4 gap-3">
          <KnobCell label="Priority" value={config.priority} min={0} max={255} color="#90a4ae"
            onChange={(v) => upd('priority', v)} />
          <KnobCell label="Sample" value={config.sampleIdx} min={0} max={29} color="#90a4ae"
            onChange={(v) => upd('sampleIdx', v)} />
          <KnobCell label="Chain" value={config.chain} min={0} max={32} color="#ffab91"
            onChange={(v) => upd('chain', v)} />
        </div>
      )}
    </div>
  );
};
