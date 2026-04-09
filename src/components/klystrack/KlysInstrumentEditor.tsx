/**
 * KlysInstrumentEditor — MAXIMIZED parameter editor for klystrack instruments.
 *
 * Exposes EVERY field of the C `MusInstrument` struct
 * (klystrack-wasm/common/music.h:42-90), including:
 *   - Identity (name, baseNote, finetune)
 *   - Envelope (ADSR)
 *   - Oscillator flags (CYD_CHN_*) as individual checkboxes
 *   - Instrument flags (MUS_INST_*) as individual checkboxes
 *   - Filter (cutoff, resonance, type)
 *   - Modulation (vib speed/depth/shape/delay, PWM speed/depth/shape)
 *   - Buzz/YM (envShape, buzzOffset)
 *   - FM (flags as checkboxes, modulation/feedback/wave/harmonic, ADSR, attackStart)
 *   - Routing (fxBus, ringMod, syncSource, lfsrType, wavetableEntry)
 *   - Program (32 hex steps)
 *
 * Changes are written to the WASM engine in real-time via
 * KlysEngine.setInstrumentParam() / setInstrumentName() and reflected in the
 * shared `useFormatStore.klysNative` store. The Pixi editor
 * (`PixiKlysInstrumentEditor`) consumes the same store and constants.
 */

import React, { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import { useFormatStore } from '@stores';
import { KlysEngine } from '@/engine/klystrack/KlysEngine';
import {
  KLYS_PARAM_IDS,
  MUS_INST_FLAGS,
  CYD_CHN_FLAGS,
  CYD_FM_FLAGS,
  KLYS_FILTER_TYPES,
  KLYS_SHAPE_NAMES,
  type KlysParamKey,
} from '@/engine/klystrack/klysParams';
import type { KlysNativeInstrument } from '@/types/tracker';
import { CustomSelect } from '@components/common/CustomSelect';

interface ParamRowProps {
  label: string;
  value: number;
  max: number;
  min?: number;
  paramKey: KlysParamKey;
  onChange: (paramKey: KlysParamKey, value: number) => void;
}

const ParamRow: React.FC<ParamRowProps> = ({ label, value, max, min = 0, paramKey, onChange }) => (
  <div className="flex items-center gap-2 h-6">
    <span className="w-24 text-[11px] text-text-secondary truncate text-right">{label}</span>
    <input
      type="range"
      min={min}
      max={max}
      value={value}
      className="flex-1 h-1 accent-accent-primary"
      onChange={e => onChange(paramKey, parseInt(e.target.value, 10))}
    />
    <input
      type="number"
      min={min}
      max={max}
      value={value}
      className="w-14 text-[11px] text-text-secondary font-mono text-right bg-dark-bgPrimary border border-dark-border rounded-sm px-1"
      onChange={e => {
        const v = parseInt(e.target.value, 10);
        if (!isNaN(v)) onChange(paramKey, v);
      }}
    />
  </div>
);

interface BitfieldGridProps {
  title: string;
  value: number;
  bits: { bit: number; label: string; desc?: string }[];
  onChange: (newValue: number) => void;
}

const BitfieldGrid: React.FC<BitfieldGridProps> = ({ title, value, bits, onChange }) => (
  <>
    <div className="text-[10px] text-text-muted uppercase tracking-wider mt-2">{title}</div>
    <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
      {bits.map(b => {
        const checked = (value & b.bit) !== 0;
        return (
          <label
            key={b.bit}
            title={b.desc}
            className="flex items-center gap-1 text-[11px] cursor-pointer hover:bg-dark-bgHover px-1 rounded-sm"
          >
            <input
              type="checkbox"
              checked={checked}
              className="accent-accent-primary"
              onChange={() => onChange(checked ? value & ~b.bit : value | b.bit)}
            />
            <span className={checked ? 'text-accent-primary' : 'text-text-secondary'}>{b.label}</span>
          </label>
        );
      })}
    </div>
  </>
);

interface SectionProps {
  title: string;
  collapsed?: boolean;
  onToggle?: () => void;
  collapsible?: boolean;
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ title, collapsed, onToggle, collapsible = false, children }) => (
  <div className="mt-1">
    {collapsible ? (
      <button
        className="text-[10px] text-text-muted uppercase tracking-wider w-full text-left hover:text-text-secondary"
        onClick={onToggle}
      >
        [{collapsed ? '+' : '-'}] {title}
      </button>
    ) : (
      <div className="text-[10px] text-text-muted uppercase tracking-wider">{title}</div>
    )}
    {!collapsed && children}
  </div>
);

interface KlysInstrumentEditorProps {
  instrumentIndex: number;
}

export const KlysInstrumentEditor: React.FC<KlysInstrumentEditorProps> = ({ instrumentIndex }) => {
  const nativeData = useFormatStore(s => s.klysNative);

  const [showProgram, setShowProgram] = useState(false);
  const [showFM, setShowFM] = useState(true);

  const inst: KlysNativeInstrument | null = useMemo(() => {
    if (!nativeData || instrumentIndex < 0 || instrumentIndex >= nativeData.instruments.length) return null;
    return nativeData.instruments[instrumentIndex];
  }, [nativeData, instrumentIndex]);

  // Stale-state guard — see CLAUDE.md "Knob/Control Handling Pattern"
  const instRef = useRef(inst);
  useEffect(() => { instRef.current = inst; }, [inst]);

  const writeStore = useCallback((updated: KlysNativeInstrument) => {
    const native = useFormatStore.getState().klysNative;
    if (!native) return;
    const instruments = [...native.instruments];
    instruments[instrumentIndex] = updated;
    useFormatStore.setState({ klysNative: { ...native, instruments } });
  }, [instrumentIndex]);

  const handleParam = useCallback((paramKey: KlysParamKey, value: number) => {
    const cur = instRef.current;
    if (!cur) return;
    const paramId = KLYS_PARAM_IDS[paramKey];
    if (paramId !== undefined && KlysEngine.hasInstance()) {
      KlysEngine.getInstance().setInstrumentParam(instrumentIndex, paramId, value);
    }
    const updated = { ...cur };
    if (paramKey.startsWith('adsr.')) {
      updated.adsr = { ...updated.adsr, [paramKey.split('.')[1] as 'a' | 'd' | 's' | 'r']: value };
    } else if (paramKey.startsWith('fm.adsr.')) {
      updated.fm = { ...updated.fm, adsr: { ...updated.fm.adsr, [paramKey.split('.')[2] as 'a' | 'd' | 's' | 'r']: value } };
    } else if (paramKey.startsWith('fm.')) {
      const sub = paramKey.split('.')[1];
      updated.fm = { ...updated.fm, [sub]: value };
    } else {
      (updated as unknown as Record<string, number>)[paramKey] = value;
    }
    writeStore(updated);
  }, [instrumentIndex, writeStore]);

  const handleNameChange = useCallback((name: string) => {
    const cur = instRef.current;
    if (!cur) return;
    if (KlysEngine.hasInstance()) {
      KlysEngine.getInstance().setInstrumentName(instrumentIndex, name);
    }
    writeStore({ ...cur, name });
  }, [instrumentIndex, writeStore]);

  const handleProgramStep = useCallback((step: number, value: number) => {
    const cur = instRef.current;
    if (!cur) return;
    if (KlysEngine.hasInstance()) {
      KlysEngine.getInstance().setInstrumentProgramStep(instrumentIndex, step, value);
    }
    const program = [...cur.program];
    while (program.length <= step) program.push(0);
    program[step] = value;
    writeStore({ ...cur, program });
  }, [instrumentIndex, writeStore]);

  if (!inst) {
    return <div className="p-2 text-xs text-text-muted">No instrument selected</div>;
  }

  const program = inst.program.length === 32 ? inst.program : [...inst.program, ...Array(32 - inst.program.length).fill(0)];

  return (
    <div className="flex flex-col gap-1 p-2 bg-dark-bgPrimary text-text-secondary overflow-y-auto text-xs">
      {/* Header / Identity */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold text-accent-primary">
          {instrumentIndex.toString(16).toUpperCase().padStart(2, '0')}
        </span>
        <input
          type="text"
          value={inst.name}
          maxLength={32}
          onChange={e => handleNameChange(e.target.value)}
          className="flex-1 bg-dark-bgSecondary text-xs text-text-primary font-mono border border-dark-border rounded-sm px-1 py-0.5 focus:outline-none focus:border-accent-primary"
          placeholder="Instrument name"
        />
      </div>

      {/* Envelope */}
      <Section title="Envelope (ADSR)">
        <ParamRow label="Attack"  value={inst.adsr.a} max={32} paramKey="adsr.a" onChange={handleParam} />
        <ParamRow label="Decay"   value={inst.adsr.d} max={32} paramKey="adsr.d" onChange={handleParam} />
        <ParamRow label="Sustain" value={inst.adsr.s} max={32} paramKey="adsr.s" onChange={handleParam} />
        <ParamRow label="Release" value={inst.adsr.r} max={32} paramKey="adsr.r" onChange={handleParam} />
      </Section>

      {/* Identity / Core */}
      <Section title="Core">
        <ParamRow label="Volume"      value={inst.volume}     max={128} paramKey="volume" onChange={handleParam} />
        <ParamRow label="Base Note"   value={inst.baseNote}   max={95}  paramKey="baseNote" onChange={handleParam} />
        <ParamRow label="Finetune"    value={inst.finetune}   min={-128} max={127} paramKey="finetune" onChange={handleParam} />
        <ParamRow label="Slide Speed" value={inst.slideSpeed} max={255} paramKey="slideSpeed" onChange={handleParam} />
        <ParamRow label="Pulse Width" value={inst.pw}         max={4095} paramKey="pw" onChange={handleParam} />
      </Section>

      {/* Oscillator Flags (CYD_CHN_*) */}
      <BitfieldGrid
        title="Oscillator (CYD_CHN_*)"
        value={inst.cydflags}
        bits={CYD_CHN_FLAGS}
        onChange={v => handleParam('cydflags', v)}
      />

      {/* Instrument Flags (MUS_INST_*) */}
      <BitfieldGrid
        title="Instrument Flags (MUS_INST_*)"
        value={inst.flags}
        bits={MUS_INST_FLAGS}
        onChange={v => handleParam('flags', v)}
      />

      {/* Filter */}
      <Section title="Filter">
        <ParamRow label="Cutoff"    value={inst.cutoff}    max={4095} paramKey="cutoff" onChange={handleParam} />
        <ParamRow label="Resonance" value={inst.resonance} max={3}    paramKey="resonance" onChange={handleParam} />
        <div className="flex items-center gap-2 h-6">
          <span className="w-24 text-[11px] text-text-secondary text-right">Type</span>
          <CustomSelect
            value={String(inst.flttype)}
            onChange={(v) => handleParam('flttype', parseInt(v, 10))}
            className="flex-1 bg-dark-bgSecondary text-[11px] text-text-secondary border border-dark-border rounded-sm px-1"
            options={KLYS_FILTER_TYPES.map((n, i) => ({ value: String(i), label: n }))}
          />
        </div>
      </Section>

      {/* Modulation */}
      <Section title="Modulation">
        <ParamRow label="Vib Speed"  value={inst.vibratoSpeed} max={255} paramKey="vibratoSpeed" onChange={handleParam} />
        <ParamRow label="Vib Depth"  value={inst.vibratoDepth} max={255} paramKey="vibratoDepth" onChange={handleParam} />
        <ParamRow label="Vib Delay"  value={inst.vibDelay}     max={255} paramKey="vibDelay" onChange={handleParam} />
        <div className="flex items-center gap-2 h-6">
          <span className="w-24 text-[11px] text-text-secondary text-right">Vib Shape</span>
          <CustomSelect
            value={String(inst.vibShape)}
            onChange={(v) => handleParam('vibShape', parseInt(v, 10))}
            className="flex-1 bg-dark-bgSecondary text-[11px] text-text-secondary border border-dark-border rounded-sm px-1"
            options={KLYS_SHAPE_NAMES.map((n, i) => ({ value: String(i), label: n }))}
          />
        </div>
        <ParamRow label="PWM Speed"  value={inst.pwmSpeed}     max={255} paramKey="pwmSpeed" onChange={handleParam} />
        <ParamRow label="PWM Depth"  value={inst.pwmDepth}     max={255} paramKey="pwmDepth" onChange={handleParam} />
        <div className="flex items-center gap-2 h-6">
          <span className="w-24 text-[11px] text-text-secondary text-right">PWM Shape</span>
          <CustomSelect
            value={String(inst.pwmShape)}
            onChange={(v) => handleParam('pwmShape', parseInt(v, 10))}
            className="flex-1 bg-dark-bgSecondary text-[11px] text-text-secondary border border-dark-border rounded-sm px-1"
            options={KLYS_SHAPE_NAMES.map((n, i) => ({ value: String(i), label: n }))}
          />
        </div>
      </Section>

      {/* Buzz / YM */}
      <Section title="Buzz / YM">
        <ParamRow label="YM Env Shape" value={inst.ymEnvShape} max={15}    paramKey="ymEnvShape" onChange={handleParam} />
        <ParamRow label="Buzz Offset"  value={inst.buzzOffset} min={-128} max={127} paramKey="buzzOffset" onChange={handleParam} />
      </Section>

      {/* FM */}
      <Section title="FM Synthesis" collapsible collapsed={!showFM} onToggle={() => setShowFM(!showFM)}>
        {showFM && (
          <>
            <BitfieldGrid
              title="FM Operator Flags"
              value={inst.fm.flags}
              bits={CYD_FM_FLAGS}
              onChange={v => handleParam('fm.flags', v)}
            />
            <ParamRow label="Modulation"   value={inst.fm.modulation}  max={255} paramKey="fm.modulation" onChange={handleParam} />
            <ParamRow label="Feedback"     value={inst.fm.feedback}    max={15}  paramKey="fm.feedback" onChange={handleParam} />
            <ParamRow label="Wave"         value={inst.fm.wave}        max={255} paramKey="fm.wave" onChange={handleParam} />
            <ParamRow label="Harmonic"     value={inst.fm.harmonic}    max={255} paramKey="fm.harmonic" onChange={handleParam} />
            <ParamRow label="FM Attack"    value={inst.fm.adsr.a}      max={32}  paramKey="fm.adsr.a" onChange={handleParam} />
            <ParamRow label="FM Decay"     value={inst.fm.adsr.d}      max={32}  paramKey="fm.adsr.d" onChange={handleParam} />
            <ParamRow label="FM Sustain"   value={inst.fm.adsr.s}      max={32}  paramKey="fm.adsr.s" onChange={handleParam} />
            <ParamRow label="FM Release"   value={inst.fm.adsr.r}      max={32}  paramKey="fm.adsr.r" onChange={handleParam} />
            <ParamRow label="Attack Start" value={inst.fm.attackStart} max={255} paramKey="fm.attackStart" onChange={handleParam} />
          </>
        )}
      </Section>

      {/* Routing */}
      <Section title="Routing">
        <ParamRow label="FX Bus"      value={inst.fxBus}          max={3}   paramKey="fxBus" onChange={handleParam} />
        <ParamRow label="Ring Mod"    value={inst.ringMod}        max={255} paramKey="ringMod" onChange={handleParam} />
        <ParamRow label="Sync Src"    value={inst.syncSource}     max={255} paramKey="syncSource" onChange={handleParam} />
        <ParamRow label="LFSR Type"   value={inst.lfsrType}       max={255} paramKey="lfsrType" onChange={handleParam} />
        <ParamRow label="Wavetable"   value={inst.wavetableEntry} max={255} paramKey="wavetableEntry" onChange={handleParam} />
        <ParamRow label="Prog Period" value={inst.progPeriod}     max={255} paramKey="progPeriod" onChange={handleParam} />
      </Section>

      {/* Program */}
      <Section title={`Program (${program.filter(p => p !== 0).length}/32 steps)`} collapsible collapsed={!showProgram} onToggle={() => setShowProgram(!showProgram)}>
        {showProgram && (
          <div className="grid grid-cols-8 gap-0.5">
            {program.map((val, i) => (
              <input
                key={i}
                type="text"
                className="w-full bg-dark-bgSecondary text-center text-[10px] font-mono text-accent-primary border border-dark-border rounded-sm p-0.5 focus:outline-none focus:border-accent-primary"
                value={val.toString(16).toUpperCase().padStart(4, '0')}
                onChange={e => {
                  const v = parseInt(e.target.value, 16);
                  if (!isNaN(v) && v >= 0 && v <= 0xFFFF) handleProgramStep(i, v);
                }}
              />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
};
