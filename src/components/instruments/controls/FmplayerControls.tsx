/**
 * FmplayerControls.tsx - PC-98 YM2608 OPNA FM/SSG instrument editor
 *
 * Interactive 4-operator FM editor for FMP/PLAY6 format. Changes push
 * directly to the running OPNA emulator via register-level WASM API.
 *
 * Tabs: FM 1-6 | SSG 1-3
 * Each FM tab shows: Algorithm, Feedback, Pan, + 4 operators (TL/AR/DR/SR/RR/SL/MUL/DET/KS)
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type {
  FmplayerConfig,
  FmplayerChannelConfig,
  FmplayerSlotConfig,
  FmplayerSsgConfig,
} from '@/types/instrument/exotic';
import { Knob } from '@components/controls/Knob';
import { useInstrumentColors } from '@/hooks/useInstrumentColors';
import { SectionLabel } from '@components/instruments/shared';
import {
  FmplayerEngine,
  FM_SLOT_PARAM,
  FM_CH_PARAM,
  SSG_PARAM,
} from '@/engine/fmplayer/FmplayerEngine';

interface FmplayerControlsProps {
  config: FmplayerConfig;
  onChange: (updates: Partial<FmplayerConfig>) => void;
}

const ALG_LABELS = ['0: S', '1: S', '2: S', '3: S', '4: P', '5: P', '6: P', '7: P'];
const FM_CH_NAMES = ['FM 1', 'FM 2', 'FM 3', 'FM 4', 'FM 5', 'FM 6'];
const SSG_CH_NAMES = ['SSG 1', 'SSG 2', 'SSG 3'];
const OP_NAMES = ['Op 1 (M1)', 'Op 2 (C1)', 'Op 3 (M2)', 'Op 4 (C2)'];
const DET_LABELS = ['-3', '-2', '-1', '0', '+1', '+2', '+3', '+3'];

type ChTab = { type: 'fm'; ch: number } | { type: 'ssg'; ch: number };

export const FmplayerControls: React.FC<FmplayerControlsProps> = ({ config, onChange }) => {
  const [activeTab, setActiveTab] = useState<ChTab>({ type: 'fm', ch: 0 });
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const { accent, knob, panelStyle } = useInstrumentColors('#ff6644');

  // Fetch channel data from WASM if config is empty
  useEffect(() => {
    if (config.fmChannels.length > 0) return;
    if (!FmplayerEngine.hasInstance()) return;

    const engine = FmplayerEngine.getInstance();
    let cancelled = false;

    (async () => {
      await engine.ready();
      const fmChannels: FmplayerChannelConfig[] = [];
      const ssgChannels: FmplayerSsgConfig[] = [];

      for (let ch = 0; ch < 6; ch++) {
        const data = await engine.requestFmChannel(ch);
        if (cancelled) return;
        fmChannels.push({
          alg: data.alg, fb: data.fb, panL: data.panL, panR: data.panR,
          slots: data.slots.map(s => ({ ...s })),
        });
      }

      for (let ch = 0; ch < 3; ch++) {
        const data = await engine.requestSsgChannel(ch);
        if (cancelled) return;
        ssgChannels.push({ ...data });
      }

      if (!cancelled) onChange({ fmChannels, ssgChannels });
    })();

    return () => { cancelled = true; };
  }, [config.fmChannels.length, onChange]);

  // FM slot param change
  const setFmSlotParam = useCallback((ch: number, slot: number, paramId: number, value: number) => {
    const channels = [...configRef.current.fmChannels];
    const c = { ...channels[ch], slots: [...channels[ch].slots] };
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
    channels[ch] = c;
    onChange({ fmChannels: channels });

    if (FmplayerEngine.hasInstance()) {
      FmplayerEngine.getInstance().setFmSlotParam(ch, slot, paramId, value);
    }
  }, [onChange]);

  // FM channel param change
  const setFmChParam = useCallback((ch: number, paramId: number, value: number) => {
    const channels = [...configRef.current.fmChannels];
    const c = { ...channels[ch] };
    switch (paramId) {
      case FM_CH_PARAM.ALG: c.alg = value; break;
      case FM_CH_PARAM.FB: c.fb = value; break;
      case FM_CH_PARAM.PAN_L: c.panL = value; break;
      case FM_CH_PARAM.PAN_R: c.panR = value; break;
    }
    channels[ch] = c;
    onChange({ fmChannels: channels });

    if (FmplayerEngine.hasInstance()) {
      FmplayerEngine.getInstance().setFmChParam(ch, paramId, value);
    }
  }, [onChange]);

  // SSG param change
  const setSsgParam = useCallback((ch: number, paramId: number, value: number) => {
    const ssgChannels = [...configRef.current.ssgChannels];
    const c = { ...ssgChannels[ch] };
    switch (paramId) {
      case SSG_PARAM.TONE_L: c.toneL = value; break;
      case SSG_PARAM.TONE_H: c.toneH = value; break;
      case SSG_PARAM.VOLUME: c.volume = value; break;
      case SSG_PARAM.NOISE: c.noise = value; break;
      case SSG_PARAM.TONE_EN: c.toneEn = value; break;
      case SSG_PARAM.NOISE_EN: c.noiseEn = value; break;
    }
    ssgChannels[ch] = c;
    onChange({ ssgChannels });

    if (FmplayerEngine.hasInstance()) {
      FmplayerEngine.getInstance().setSsgParam(ch, paramId, value);
    }
  }, [onChange]);

  const allTabs: { label: string; tab: ChTab }[] = [
    ...FM_CH_NAMES.map((n, i) => ({ label: n, tab: { type: 'fm' as const, ch: i } })),
    ...SSG_CH_NAMES.map((n, i) => ({ label: n, tab: { type: 'ssg' as const, ch: i } })),
  ];

  return (
    <div className="flex flex-col gap-2 p-3 text-xs" style={panelStyle}>
      {/* Channel tabs */}
      <div className="flex gap-1 border-b border-border-primary pb-1 flex-wrap">
        {allTabs.map(({ label, tab }) => {
          const active = activeTab.type === tab.type && activeTab.ch === tab.ch;
          return (
            <button
              key={`${tab.type}-${tab.ch}`}
              className={`px-2 py-1 rounded-t text-xs transition-colors ${
                active ? 'text-text-primary border-b-2' : 'text-text-muted hover:text-text-primary'
              }`}
              style={active ? { borderBottomColor: accent } : undefined}
              onClick={() => setActiveTab(tab)}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* FM channel editor */}
      {activeTab.type === 'fm' && config.fmChannels[activeTab.ch] && (
        <FmChannelPanel
          ch={activeTab.ch}
          channel={config.fmChannels[activeTab.ch]}
          setSlotParam={setFmSlotParam}
          setChParam={setFmChParam}
          knobColor={knob}
          accent={accent}
        />
      )}

      {/* SSG channel editor */}
      {activeTab.type === 'ssg' && config.ssgChannels[activeTab.ch] && (
        <SsgChannelPanel
          ch={activeTab.ch}
          channel={config.ssgChannels[activeTab.ch]}
          setParam={setSsgParam}
          knobColor={knob}
          accent={accent}
        />
      )}

      {/* No data placeholder */}
      {((activeTab.type === 'fm' && !config.fmChannels[activeTab.ch]) ||
        (activeTab.type === 'ssg' && !config.ssgChannels[activeTab.ch])) && (
        <div className="p-4 text-text-muted text-sm">
          No data available. Load an FMP file first.
        </div>
      )}
    </div>
  );
};

// ── FM Channel Panel ──────────────────────────────────────────────────────

interface FmChannelPanelProps {
  ch: number;
  channel: FmplayerChannelConfig;
  setSlotParam: (ch: number, slot: number, paramId: number, value: number) => void;
  setChParam: (ch: number, paramId: number, value: number) => void;
  knobColor: string;
  accent: string;
}

const FmChannelPanel: React.FC<FmChannelPanelProps> = ({
  ch, channel, setSlotParam, setChParam, knobColor, accent,
}) => (
  <div className="flex flex-col gap-3 p-1">
    {/* Channel params */}
    <SectionLabel label={`${FM_CH_NAMES[ch]} — Algorithm & Feedback`} color={accent} />
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex flex-col items-center gap-1">
        <span className="text-text-muted text-[10px]">Algorithm</span>
        <select
          className="bg-surface-secondary text-text-primary border border-border-primary rounded px-1 py-0.5 text-xs w-16"
          value={channel.alg}
          onChange={(e) => setChParam(ch, FM_CH_PARAM.ALG, Number(e.target.value))}
        >
          {ALG_LABELS.map((l, i) => <option key={i} value={i}>{l}</option>)}
        </select>
      </div>
      <div className="flex flex-col items-center gap-1">
        <Knob value={channel.fb} min={0} max={7} step={1} size="sm" color={knobColor}
          onChange={(v) => setChParam(ch, FM_CH_PARAM.FB, Math.round(v))} />
        <span className="text-text-muted text-[10px]">Feedback</span>
      </div>
      <div className="flex items-center gap-2 ml-4">
        <label className="flex items-center gap-1 text-[10px] text-text-muted">
          <input type="checkbox" checked={channel.panL === 1}
            onChange={(e) => setChParam(ch, FM_CH_PARAM.PAN_L, e.target.checked ? 1 : 0)}
            className="accent-accent-primary" />
          L
        </label>
        <label className="flex items-center gap-1 text-[10px] text-text-muted">
          <input type="checkbox" checked={channel.panR === 1}
            onChange={(e) => setChParam(ch, FM_CH_PARAM.PAN_R, e.target.checked ? 1 : 0)}
            className="accent-accent-primary" />
          R
        </label>
      </div>
    </div>

    {/* 4 operators */}
    {channel.slots.map((slot, si) => (
      <FmOperatorPanel
        key={si}
        ch={ch}
        slotIdx={si}
        slot={slot}
        setParam={setSlotParam}
        knobColor={knobColor}
        accent={accent}
      />
    ))}
  </div>
);

// ── FM Operator Panel ─────────────────────────────────────────────────────

interface FmOperatorPanelProps {
  ch: number;
  slotIdx: number;
  slot: FmplayerSlotConfig;
  setParam: (ch: number, slot: number, paramId: number, value: number) => void;
  knobColor: string;
  accent: string;
}

const FmOperatorPanel: React.FC<FmOperatorPanelProps> = ({
  ch, slotIdx, slot, setParam, knobColor, accent,
}) => (
  <div className="border border-border-primary/30 rounded p-2">
    <SectionLabel label={OP_NAMES[slotIdx]} color={accent} />
    <div className="flex items-end gap-2 flex-wrap mt-1">
      <div className="flex flex-col items-center gap-0.5">
        <Knob value={slot.tl} min={0} max={127} step={1} size="sm" color={knobColor}
          onChange={(v) => setParam(ch, slotIdx, FM_SLOT_PARAM.TL, Math.round(v))} />
        <span className="text-text-muted text-[10px]">TL</span>
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <Knob value={slot.ar} min={0} max={31} step={1} size="sm" color={knobColor}
          onChange={(v) => setParam(ch, slotIdx, FM_SLOT_PARAM.AR, Math.round(v))} />
        <span className="text-text-muted text-[10px]">AR</span>
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <Knob value={slot.dr} min={0} max={31} step={1} size="sm" color={knobColor}
          onChange={(v) => setParam(ch, slotIdx, FM_SLOT_PARAM.DR, Math.round(v))} />
        <span className="text-text-muted text-[10px]">DR</span>
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <Knob value={slot.sr} min={0} max={31} step={1} size="sm" color={knobColor}
          onChange={(v) => setParam(ch, slotIdx, FM_SLOT_PARAM.SR, Math.round(v))} />
        <span className="text-text-muted text-[10px]">SR</span>
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <Knob value={slot.rr} min={0} max={15} step={1} size="sm" color={knobColor}
          onChange={(v) => setParam(ch, slotIdx, FM_SLOT_PARAM.RR, Math.round(v))} />
        <span className="text-text-muted text-[10px]">RR</span>
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <Knob value={slot.sl} min={0} max={15} step={1} size="sm" color={knobColor}
          onChange={(v) => setParam(ch, slotIdx, FM_SLOT_PARAM.SL, Math.round(v))} />
        <span className="text-text-muted text-[10px]">SL</span>
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <Knob value={slot.mul} min={0} max={15} step={1} size="sm" color={knobColor}
          onChange={(v) => setParam(ch, slotIdx, FM_SLOT_PARAM.MUL, Math.round(v))} />
        <span className="text-text-muted text-[10px]">MUL</span>
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-text-muted text-[10px]">DET</span>
        <select
          className="bg-surface-secondary text-text-primary border border-border-primary rounded px-1 py-0.5 text-[10px] w-12"
          value={slot.det}
          onChange={(e) => setParam(ch, slotIdx, FM_SLOT_PARAM.DET, Number(e.target.value))}
        >
          {DET_LABELS.map((l, i) => <option key={i} value={i}>{l}</option>)}
        </select>
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-text-muted text-[10px]">KS</span>
        <select
          className="bg-surface-secondary text-text-primary border border-border-primary rounded px-1 py-0.5 text-[10px] w-10"
          value={slot.ks}
          onChange={(e) => setParam(ch, slotIdx, FM_SLOT_PARAM.KS, Number(e.target.value))}
        >
          {[0, 1, 2, 3].map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>
    </div>
  </div>
);

// ── SSG Channel Panel ─────────────────────────────────────────────────────

interface SsgChannelPanelProps {
  ch: number;
  channel: FmplayerSsgConfig;
  setParam: (ch: number, paramId: number, value: number) => void;
  knobColor: string;
  accent: string;
}

const SsgChannelPanel: React.FC<SsgChannelPanelProps> = ({
  ch, channel, setParam, knobColor, accent,
}) => (
  <div className="flex flex-col gap-3 p-1">
    <SectionLabel label={`${SSG_CH_NAMES[ch]} — PSG/AY Channel`} color={accent} />
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex flex-col items-center gap-1">
        <Knob value={channel.volume} min={0} max={15} step={1} size="sm" color={knobColor}
          onChange={(v) => setParam(ch, SSG_PARAM.VOLUME, Math.round(v))} />
        <span className="text-text-muted text-[10px]">Volume</span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <Knob value={channel.noise} min={0} max={31} step={1} size="sm" color={knobColor}
          onChange={(v) => setParam(ch, SSG_PARAM.NOISE, Math.round(v))} />
        <span className="text-text-muted text-[10px]">Noise</span>
      </div>
      <div className="flex items-center gap-2 ml-2">
        <label className="flex items-center gap-1 text-[10px] text-text-muted">
          <input type="checkbox" checked={channel.toneEn === 1}
            onChange={(e) => setParam(ch, SSG_PARAM.TONE_EN, e.target.checked ? 1 : 0)}
            className="accent-accent-primary" />
          Tone
        </label>
        <label className="flex items-center gap-1 text-[10px] text-text-muted">
          <input type="checkbox" checked={channel.noiseEn === 1}
            onChange={(e) => setParam(ch, SSG_PARAM.NOISE_EN, e.target.checked ? 1 : 0)}
            className="accent-accent-primary" />
          Noise
        </label>
      </div>
    </div>
    <SectionLabel label="Tone Period" color={accent} />
    <div className="flex items-center gap-3">
      <div className="flex flex-col items-center gap-1">
        <Knob value={channel.toneL} min={0} max={255} step={1} size="sm" color={knobColor}
          onChange={(v) => setParam(ch, SSG_PARAM.TONE_L, Math.round(v))} />
        <span className="text-text-muted text-[10px]">Fine</span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <Knob value={channel.toneH} min={0} max={15} step={1} size="sm" color={knobColor}
          onChange={(v) => setParam(ch, SSG_PARAM.TONE_H, Math.round(v))} />
        <span className="text-text-muted text-[10px]">Coarse</span>
      </div>
    </div>
  </div>
);
