/**
 * KlysInstrumentEditor — Parameter editor for klystrack instruments.
 *
 * Shows ADSR, waveform flags, filter, vibrato, PWM, FM, and program editor.
 * Changes are sent to the WASM engine in real-time via KlysEngine.setInstrumentParam().
 */

import React, { useCallback, useMemo, useState } from 'react';
import { useFormatStore } from '@stores';
import { KlysEngine } from '@/engine/klystrack/KlysEngine';
import type { KlysNativeInstrument } from '@/types/tracker';

/** Maps KlysNativeInstrument field names to WASM paramId values */
const PARAM_IDS: Record<string, number> = {
  'adsr.a': 0, 'adsr.d': 1, 'adsr.s': 2, 'adsr.r': 3,
  flags: 4, cydflags: 5, baseNote: 6, finetune: 7, slideSpeed: 8,
  pw: 9, volume: 10, progPeriod: 11,
  vibratoSpeed: 12, vibratoDepth: 13, pwmSpeed: 14, pwmDepth: 15,
  cutoff: 16, resonance: 17, flttype: 18, fxBus: 19,
  buzzOffset: 20, ringMod: 21, syncSource: 22, wavetableEntry: 23,
  'fm.modulation': 24, 'fm.feedback': 25, 'fm.harmonic': 26,
  'fm.adsr.a': 27, 'fm.adsr.d': 28, 'fm.adsr.s': 29, 'fm.adsr.r': 30,
};

interface ParamRowProps {
  label: string;
  value: number;
  max: number;
  min?: number;
  paramKey: string;
  instIdx: number;
  onChange: (paramKey: string, value: number) => void;
}

const ParamRow: React.FC<ParamRowProps> = ({ label, value, max, min = 0, paramKey, onChange }) => (
  <div className="flex items-center gap-2 h-6">
    <span className="w-24 text-xs text-gray-400 truncate text-right">{label}</span>
    <input
      type="range"
      min={min}
      max={max}
      value={value}
      className="flex-1 h-1 accent-cyan-500"
      onChange={e => onChange(paramKey, parseInt(e.target.value, 10))}
    />
    <span className="w-10 text-xs text-gray-300 font-mono text-right">{value}</span>
  </div>
);

interface KlysInstrumentEditorProps {
  instrumentIndex: number;
}

export const KlysInstrumentEditor: React.FC<KlysInstrumentEditorProps> = ({ instrumentIndex }) => {
  const nativeData = useFormatStore(s => s.klysNative);
  const [showFM, setShowFM] = useState(false);
  const [showProgram, setShowProgram] = useState(false);

  const inst: KlysNativeInstrument | null = useMemo(() => {
    if (!nativeData || instrumentIndex < 0 || instrumentIndex >= nativeData.instruments.length) return null;
    return nativeData.instruments[instrumentIndex];
  }, [nativeData, instrumentIndex]);

  const handleParam = useCallback((paramKey: string, value: number) => {
    if (!inst || !nativeData) return;

    // Update WASM
    const paramId = PARAM_IDS[paramKey];
    if (paramId !== undefined && KlysEngine.hasInstance()) {
      KlysEngine.getInstance().setInstrumentParam(instrumentIndex, paramId, value);
    }

    // Update store
    const updated = { ...inst };
    if (paramKey.startsWith('adsr.')) {
      updated.adsr = { ...updated.adsr, [paramKey.split('.')[1]]: value };
    } else if (paramKey.startsWith('fm.adsr.')) {
      updated.fm = { ...updated.fm, adsr: { ...updated.fm.adsr, [paramKey.split('.')[2]]: value } };
    } else if (paramKey.startsWith('fm.')) {
      updated.fm = { ...updated.fm, [paramKey.split('.')[1]]: value };
    } else {
      (updated as any)[paramKey] = value;
    }

    const instruments = [...nativeData.instruments];
    instruments[instrumentIndex] = updated;
    useFormatStore.setState({ klysNative: { ...nativeData, instruments } });
  }, [inst, nativeData, instrumentIndex]);

  const handleProgramStep = useCallback((step: number, value: number) => {
    if (!inst || !nativeData) return;
    if (KlysEngine.hasInstance()) {
      KlysEngine.getInstance().setInstrumentProgramStep(instrumentIndex, step, value);
    }
    const program = [...inst.program];
    program[step] = value;
    const updated = { ...inst, program };
    const instruments = [...nativeData.instruments];
    instruments[instrumentIndex] = updated;
    useFormatStore.setState({ klysNative: { ...nativeData, instruments } });
  }, [inst, nativeData, instrumentIndex]);

  if (!inst) {
    return <div className="p-2 text-xs text-gray-500">No instrument selected</div>;
  }

  return (
    <div className="flex flex-col gap-1 p-2 bg-[#111] text-gray-200 overflow-y-auto text-xs" style={{ maxHeight: 400 }}>
      <div className="text-sm font-bold text-cyan-400 mb-1">
        {instrumentIndex.toString(16).toUpperCase().padStart(2, '0')}: {inst.name || 'Unnamed'}
      </div>

      {/* ADSR */}
      <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">Envelope</div>
      <ParamRow label="Attack" value={inst.adsr.a} max={255} paramKey="adsr.a" instIdx={instrumentIndex} onChange={handleParam} />
      <ParamRow label="Decay" value={inst.adsr.d} max={255} paramKey="adsr.d" instIdx={instrumentIndex} onChange={handleParam} />
      <ParamRow label="Sustain" value={inst.adsr.s} max={255} paramKey="adsr.s" instIdx={instrumentIndex} onChange={handleParam} />
      <ParamRow label="Release" value={inst.adsr.r} max={255} paramKey="adsr.r" instIdx={instrumentIndex} onChange={handleParam} />

      {/* Core */}
      <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">Core</div>
      <ParamRow label="Volume" value={inst.volume} max={128} paramKey="volume" instIdx={instrumentIndex} onChange={handleParam} />
      <ParamRow label="Base Note" value={inst.baseNote} max={95} paramKey="baseNote" instIdx={instrumentIndex} onChange={handleParam} />
      <ParamRow label="Finetune" value={inst.finetune} max={255} paramKey="finetune" instIdx={instrumentIndex} onChange={handleParam} />
      <ParamRow label="Slide Speed" value={inst.slideSpeed} max={255} paramKey="slideSpeed" instIdx={instrumentIndex} onChange={handleParam} />
      <ParamRow label="Pulse Width" value={inst.pw} max={2047} paramKey="pw" instIdx={instrumentIndex} onChange={handleParam} />

      {/* Filter */}
      <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">Filter</div>
      <ParamRow label="Cutoff" value={inst.cutoff} max={4095} paramKey="cutoff" instIdx={instrumentIndex} onChange={handleParam} />
      <ParamRow label="Resonance" value={inst.resonance} max={255} paramKey="resonance" instIdx={instrumentIndex} onChange={handleParam} />
      <ParamRow label="Type" value={inst.flttype} max={3} paramKey="flttype" instIdx={instrumentIndex} onChange={handleParam} />

      {/* Vibrato / PWM */}
      <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">Modulation</div>
      <ParamRow label="Vib Speed" value={inst.vibratoSpeed} max={255} paramKey="vibratoSpeed" instIdx={instrumentIndex} onChange={handleParam} />
      <ParamRow label="Vib Depth" value={inst.vibratoDepth} max={255} paramKey="vibratoDepth" instIdx={instrumentIndex} onChange={handleParam} />
      <ParamRow label="PWM Speed" value={inst.pwmSpeed} max={255} paramKey="pwmSpeed" instIdx={instrumentIndex} onChange={handleParam} />
      <ParamRow label="PWM Depth" value={inst.pwmDepth} max={255} paramKey="pwmDepth" instIdx={instrumentIndex} onChange={handleParam} />

      {/* Misc */}
      <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">Routing</div>
      <ParamRow label="FX Bus" value={inst.fxBus} max={3} paramKey="fxBus" instIdx={instrumentIndex} onChange={handleParam} />
      <ParamRow label="Ring Mod" value={inst.ringMod} max={255} paramKey="ringMod" instIdx={instrumentIndex} onChange={handleParam} />
      <ParamRow label="Sync Src" value={inst.syncSource} max={255} paramKey="syncSource" instIdx={instrumentIndex} onChange={handleParam} />
      <ParamRow label="Wavetable" value={inst.wavetableEntry} max={255} paramKey="wavetableEntry" instIdx={instrumentIndex} onChange={handleParam} />
      <ParamRow label="Prog Period" value={inst.progPeriod} max={255} paramKey="progPeriod" instIdx={instrumentIndex} onChange={handleParam} />

      {/* FM (collapsible) */}
      <button className="text-[10px] text-gray-500 uppercase tracking-wider mt-1 text-left hover:text-gray-300"
        onClick={() => setShowFM(!showFM)}>
        {showFM ? '▼' : '▶'} FM Synthesis
      </button>
      {showFM && (
        <>
          <ParamRow label="Modulation" value={inst.fm.modulation} max={255} paramKey="fm.modulation" instIdx={instrumentIndex} onChange={handleParam} />
          <ParamRow label="Feedback" value={inst.fm.feedback} max={15} paramKey="fm.feedback" instIdx={instrumentIndex} onChange={handleParam} />
          <ParamRow label="Harmonic" value={inst.fm.harmonic} max={255} paramKey="fm.harmonic" instIdx={instrumentIndex} onChange={handleParam} />
          <ParamRow label="FM Attack" value={inst.fm.adsr.a} max={255} paramKey="fm.adsr.a" instIdx={instrumentIndex} onChange={handleParam} />
          <ParamRow label="FM Decay" value={inst.fm.adsr.d} max={255} paramKey="fm.adsr.d" instIdx={instrumentIndex} onChange={handleParam} />
          <ParamRow label="FM Sustain" value={inst.fm.adsr.s} max={255} paramKey="fm.adsr.s" instIdx={instrumentIndex} onChange={handleParam} />
          <ParamRow label="FM Release" value={inst.fm.adsr.r} max={255} paramKey="fm.adsr.r" instIdx={instrumentIndex} onChange={handleParam} />
        </>
      )}

      {/* Program (collapsible) */}
      <button className="text-[10px] text-gray-500 uppercase tracking-wider mt-1 text-left hover:text-gray-300"
        onClick={() => setShowProgram(!showProgram)}>
        {showProgram ? '▼' : '▶'} Program ({inst.program.filter(p => p !== 0).length}/32 steps)
      </button>
      {showProgram && (
        <div className="grid grid-cols-8 gap-0.5">
          {inst.program.map((val, i) => (
            <input
              key={i}
              type="text"
              className="w-full bg-[#1a1a1a] text-center text-[10px] font-mono text-yellow-300 border border-[#333] rounded-sm p-0.5"
              value={val.toString(16).toUpperCase().padStart(4, '0')}
              onChange={e => {
                const v = parseInt(e.target.value, 16);
                if (!isNaN(v) && v >= 0 && v <= 0xFFFF) handleProgramStep(i, v);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};
