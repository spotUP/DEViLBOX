/**
 * EupminiControls.tsx - FM Towns Euphony instrument editor
 *
 * Interactive 4-operator FM editor for EUP (FM Towns) format. Changes push
 * directly to the running FM Towns emulator via WASM instrument data API.
 *
 * Shows up to 128 FM instrument patches with per-operator TL/AR/DR/SR/RR/SL/MUL/DET/KS.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type {
  FmplayerConfig,
  FmplayerChannelConfig,
} from '@/types/instrument/exotic';
import { Knob } from '@components/controls/Knob';
import { useInstrumentColors } from '@/hooks/useInstrumentColors';
import { SectionLabel } from '@components/instruments/shared';
import { EupminiEngine } from '@/engine/eupmini/EupminiEngine';
import { FM_SLOT_PARAM, FM_CH_PARAM } from '@/engine/fmplayer/FmplayerEngine';

interface EupminiControlsProps {
  config: FmplayerConfig;
  onChange: (updates: Partial<FmplayerConfig>) => void;
}

const ALG_LABELS = ['0: S', '1: S', '2: S', '3: S', '4: P', '5: P', '6: P', '7: P'];
const OP_NAMES = ['Op 1 (M1)', 'Op 2 (C1)', 'Op 3 (M2)', 'Op 4 (C2)'];
const DET_LABELS = ['-3', '-2', '-1', '0', '+1', '+2', '+3', '+3'];

export const EupminiControls: React.FC<EupminiControlsProps> = ({ config, onChange }) => {
  const [selectedInst, setSelectedInst] = useState(0);
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const { accent, knob, panelStyle } = useInstrumentColors('#44cc66');

  // Fetch FM instrument data from WASM
  useEffect(() => {
    if (config.fmChannels.length > 0) return;
    if (!EupminiEngine.hasInstance()) return;

    const engine = EupminiEngine.getInstance();
    let cancelled = false;

    (async () => {
      await engine.ready();
      const numInst = await engine.requestNumFmInstruments();
      if (cancelled) return;

      const fmChannels: FmplayerChannelConfig[] = [];
      // Only fetch instruments that likely have data (first 32)
      const toFetch = Math.min(numInst, 32);
      for (let i = 0; i < toFetch; i++) {
        const data = await engine.requestFmInstrument(i);
        if (cancelled) return;
        fmChannels.push({
          alg: data.alg, fb: data.fb, panL: data.panL, panR: data.panR,
          slots: data.slots.map(s => ({ ...s })),
        });
      }

      if (!cancelled) onChange({ fmChannels, ssgChannels: [], title: config.title });
    })();

    return () => { cancelled = true; };
  }, [config.fmChannels.length, config.title, onChange]);

  const inst: FmplayerChannelConfig | undefined = config.fmChannels[selectedInst];

  const setSlotParam = useCallback((instIdx: number, slot: number, paramId: number, value: number) => {
    const channels = [...configRef.current.fmChannels];
    const c = { ...channels[instIdx], slots: [...channels[instIdx].slots] };
    c.slots[slot] = { ...c.slots[slot] };
    switch (paramId) {
      case FM_SLOT_PARAM.TL: c.slots[slot].tl = value; break;
      case FM_SLOT_PARAM.AR: c.slots[slot].ar = value; break;
      case FM_SLOT_PARAM.DR: c.slots[slot].dr = value; break;
      case FM_SLOT_PARAM.SR: c.slots[slot].sr = value; break;
      case FM_SLOT_PARAM.RR: c.slots[slot].rr = value; break;
      case FM_SLOT_PARAM.SL: c.slots[slot].sl = value; break;
      case FM_SLOT_PARAM.MUL: c.slots[slot].mul = value; break;
      case FM_SLOT_PARAM.DET: c.slots[slot].det = value; break;
      case FM_SLOT_PARAM.KS: c.slots[slot].ks = value; break;
    }
    channels[instIdx] = c;
    onChange({ fmChannels: channels });

    if (EupminiEngine.hasInstance()) {
      EupminiEngine.getInstance().setFmSlotParam(instIdx, slot, paramId, value);
    }
  }, [onChange]);

  const setChParam = useCallback((instIdx: number, paramId: number, value: number) => {
    const channels = [...configRef.current.fmChannels];
    const c = { ...channels[instIdx] };
    switch (paramId) {
      case FM_CH_PARAM.ALG: c.alg = value; break;
      case FM_CH_PARAM.FB: c.fb = value; break;
      case FM_CH_PARAM.PAN_L: c.panL = value; break;
      case FM_CH_PARAM.PAN_R: c.panR = value; break;
    }
    channels[instIdx] = c;
    onChange({ fmChannels: channels });

    if (EupminiEngine.hasInstance()) {
      EupminiEngine.getInstance().setFmChParam(instIdx, paramId, value);
    }
  }, [onChange]);

  if (!inst) {
    return (
      <div className="p-4 text-text-muted text-sm" style={panelStyle}>
        No FM instrument data available. Load an EUP file first.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-3 text-xs" style={panelStyle}>
      {/* Instrument selector */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-text-muted">FM Patch:</span>
        <select
          className="bg-surface-secondary text-text-primary border border-border-primary rounded px-2 py-0.5 text-xs"
          value={selectedInst}
          onChange={(e) => setSelectedInst(Number(e.target.value))}
        >
          {config.fmChannels.map((_, i) => (
            <option key={i} value={i}>Patch {i}</option>
          ))}
        </select>
      </div>

      {/* Channel params */}
      <SectionLabel label={`FM Patch ${selectedInst} — Algorithm & Feedback`} color={accent} />
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex flex-col items-center gap-1">
          <span className="text-text-muted text-[10px]">Algorithm</span>
          <select
            className="bg-surface-secondary text-text-primary border border-border-primary rounded px-1 py-0.5 text-xs w-16"
            value={inst.alg}
            onChange={(e) => setChParam(selectedInst, FM_CH_PARAM.ALG, Number(e.target.value))}
          >
            {ALG_LABELS.map((l, i) => <option key={i} value={i}>{l}</option>)}
          </select>
        </div>
        <div className="flex flex-col items-center gap-1">
          <Knob value={inst.fb} min={0} max={7} step={1} size="sm" color={knob}
            onChange={(v) => setChParam(selectedInst, FM_CH_PARAM.FB, Math.round(v))} />
          <span className="text-text-muted text-[10px]">Feedback</span>
        </div>
        <div className="flex items-center gap-2 ml-4">
          <label className="flex items-center gap-1 text-[10px] text-text-muted">
            <input type="checkbox" checked={inst.panL === 1}
              onChange={(e) => setChParam(selectedInst, FM_CH_PARAM.PAN_L, e.target.checked ? 1 : 0)}
              className="accent-accent-primary" />
            L
          </label>
          <label className="flex items-center gap-1 text-[10px] text-text-muted">
            <input type="checkbox" checked={inst.panR === 1}
              onChange={(e) => setChParam(selectedInst, FM_CH_PARAM.PAN_R, e.target.checked ? 1 : 0)}
              className="accent-accent-primary" />
            R
          </label>
        </div>
      </div>

      {/* 4 operators */}
      {inst.slots.map((slot, si) => (
        <div key={si} className="border border-border-primary/30 rounded p-2">
          <SectionLabel label={OP_NAMES[si]} color={accent} />
          <div className="flex items-end gap-2 flex-wrap mt-1">
            <KnobParam label="TL" value={slot.tl} max={127} color={knob}
              onChange={(v) => setSlotParam(selectedInst, si, FM_SLOT_PARAM.TL, v)} />
            <KnobParam label="AR" value={slot.ar} max={31} color={knob}
              onChange={(v) => setSlotParam(selectedInst, si, FM_SLOT_PARAM.AR, v)} />
            <KnobParam label="DR" value={slot.dr} max={31} color={knob}
              onChange={(v) => setSlotParam(selectedInst, si, FM_SLOT_PARAM.DR, v)} />
            <KnobParam label="SR" value={slot.sr} max={31} color={knob}
              onChange={(v) => setSlotParam(selectedInst, si, FM_SLOT_PARAM.SR, v)} />
            <KnobParam label="RR" value={slot.rr} max={15} color={knob}
              onChange={(v) => setSlotParam(selectedInst, si, FM_SLOT_PARAM.RR, v)} />
            <KnobParam label="SL" value={slot.sl} max={15} color={knob}
              onChange={(v) => setSlotParam(selectedInst, si, FM_SLOT_PARAM.SL, v)} />
            <KnobParam label="MUL" value={slot.mul} max={15} color={knob}
              onChange={(v) => setSlotParam(selectedInst, si, FM_SLOT_PARAM.MUL, v)} />
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-text-muted text-[10px]">DET</span>
              <select
                className="bg-surface-secondary text-text-primary border border-border-primary rounded px-1 py-0.5 text-[10px] w-12"
                value={slot.det}
                onChange={(e) => setSlotParam(selectedInst, si, FM_SLOT_PARAM.DET, Number(e.target.value))}
              >
                {DET_LABELS.map((l, i) => <option key={i} value={i}>{l}</option>)}
              </select>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-text-muted text-[10px]">KS</span>
              <select
                className="bg-surface-secondary text-text-primary border border-border-primary rounded px-1 py-0.5 text-[10px] w-10"
                value={slot.ks}
                onChange={(e) => setSlotParam(selectedInst, si, FM_SLOT_PARAM.KS, Number(e.target.value))}
              >
                {[0, 1, 2, 3].map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// Small helper to reduce boilerplate
const KnobParam: React.FC<{
  label: string; value: number; max: number; color: string;
  onChange: (v: number) => void;
}> = ({ label, value, max, color, onChange }) => (
  <div className="flex flex-col items-center gap-0.5">
    <Knob value={value} min={0} max={max} step={1} size="sm" color={color}
      onChange={(v) => onChange(Math.round(v))} />
    <span className="text-text-muted text-[10px]">{label}</span>
  </div>
);
