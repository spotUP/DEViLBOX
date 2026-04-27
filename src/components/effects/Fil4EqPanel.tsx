/**
 * Fil4EqPanel — Master FX panel for Fil4EqEffect.
 * Curve display + 8 band columns: HP | LoShelf | P1–P4 | HiShelf | LP
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Fil4EqCurve } from './Fil4EqCurve';
import { Knob } from '@components/controls/Knob';
import { Button } from '@components/ui/Button';
import type { Fil4EqEffect } from '@/engine/effects/Fil4EqEffect';

interface BandState {
  enabled: boolean;
  freq: number;
  gain: number;
  q: number;
  bw: number;
}

interface PanelState {
  hp: BandState;
  lp: BandState;
  ls: BandState;
  hs: BandState;
  p: BandState[];
  masterGain: number;
}

function stateFromEffect(effect: Fil4EqEffect): PanelState {
  const p = effect.getParams();
  return {
    hp: { enabled: p.hp.enabled, freq: p.hp.freq, gain: 0,          q: p.hp.q, bw: 1 },
    lp: { enabled: p.lp.enabled, freq: p.lp.freq, gain: 0,          q: p.lp.q, bw: 1 },
    ls: { enabled: p.ls.enabled, freq: p.ls.freq, gain: p.ls.gain,  q: p.ls.q, bw: 1 },
    hs: { enabled: p.hs.enabled, freq: p.hs.freq, gain: p.hs.gain,  q: p.hs.q, bw: 1 },
    p:  p.p.map(b => ({ enabled: b.enabled, freq: b.freq, gain: b.gain, q: 1.0, bw: b.bw })),
    masterGain: p.masterGain,
  };
}

interface Props { effect: Fil4EqEffect; }

export const Fil4EqPanel: React.FC<Props> = ({ effect }) => {
  const [state, setState] = useState<PanelState>(() => stateFromEffect(effect));
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  useEffect(() => {
    const onP = () => setState(stateFromEffect(effect));
    effect.on('params', onP);
    return () => { effect.off('params', onP); };
  }, [effect]);

  const setHP = useCallback((patch: Partial<BandState>) => {
    setState(s => {
      const next = { ...s.hp, ...patch };
      effect.setHP(next.enabled, next.freq, next.q);
      return { ...s, hp: next };
    });
  }, [effect]);

  const setLP = useCallback((patch: Partial<BandState>) => {
    setState(s => {
      const next = { ...s.lp, ...patch };
      effect.setLP(next.enabled, next.freq, next.q);
      return { ...s, lp: next };
    });
  }, [effect]);

  const setLS = useCallback((patch: Partial<BandState>) => {
    setState(s => {
      const next = { ...s.ls, ...patch };
      effect.setLowShelf(next.enabled, next.freq, next.gain, next.q);
      return { ...s, ls: next };
    });
  }, [effect]);

  const setHS = useCallback((patch: Partial<BandState>) => {
    setState(s => {
      const next = { ...s.hs, ...patch };
      effect.setHighShelf(next.enabled, next.freq, next.gain, next.q);
      return { ...s, hs: next };
    });
  }, [effect]);

  const setP = useCallback((band: 0|1|2|3, patch: Partial<BandState>) => {
    setState(s => {
      const bands = [...s.p];
      bands[band] = { ...bands[band], ...patch };
      const b = bands[band];
      effect.setBand(band, b.enabled, b.freq, b.bw, b.gain);
      return { ...s, p: bands };
    });
  }, [effect]);

  const setGain = useCallback((v: number) => {
    setState(s => { effect.setMasterGain(v); return { ...s, masterGain: v }; });
  }, [effect]);

  const toggle = (on: boolean, onClick: () => void) => (
    <Button
      type="button"
      variant="compact"
      onClick={onClick}
      className={on ? 'border-accent-highlight bg-accent-highlight/20 text-accent-highlight' : ''}
    >
      {on ? 'ON' : 'OFF'}
    </Button>
  );

  const col = (label: string, content: React.ReactNode) => (
    <div className="flex flex-col items-center gap-1 px-2 border-r border-dark-border last:border-0 min-w-[58px]">
      <span className="text-[9px] font-mono text-text-secondary font-bold">{label}</span>
      {content}
    </div>
  );

  return (
    <div className="flex flex-col gap-2 p-2 bg-dark-bgSecondary rounded-lg select-none">
      <div className="flex items-start gap-2">
        <Fil4EqCurve effect={effect} width={552} height={136} />
        <div className="flex flex-col gap-1 items-center pt-1">
          <span className="text-[9px] font-mono text-text-muted">GAIN</span>
          <Knob value={state.masterGain} min={0} max={2} step={0.01}
            onChange={setGain} size="sm" label="Gain" />
          <span className="text-[9px] font-mono text-text-secondary">
            {(20 * Math.log10(Math.max(state.masterGain, 0.001))).toFixed(1)}dB
          </span>
        </div>
      </div>

      <div className="flex items-start border border-dark-border rounded overflow-x-auto">
        {col('HP', <>
          <Knob value={state.hp.freq} min={5} max={1000} step={1} onChange={v => setHP({ freq: v })} size="sm" label="Hz" />
          <Knob value={state.hp.q}    min={0.1} max={4} step={0.01}  onChange={v => setHP({ q: v })}    size="sm" label="Q"  />
          {toggle(state.hp.enabled, () => setHP({ enabled: !state.hp.enabled }))}
        </>)}

        {col('Lo Shelf', <>
          <Knob value={state.ls.freq} min={20}   max={800}  step={1}   onChange={v => setLS({ freq: v })} size="sm" label="Hz"  />
          <Knob value={state.ls.gain} min={-24}  max={24}   step={0.5} onChange={v => setLS({ gain: v })} size="sm" label="dB"  />
          <Knob value={state.ls.q}    min={0.1}  max={2}    step={0.01} onChange={v => setLS({ q: v })}   size="sm" label="Q"   />
          {toggle(state.ls.enabled, () => setLS({ enabled: !state.ls.enabled }))}
        </>)}

        {([0,1,2,3] as const).map(i => col(`P${i+1}`, <>
          <Knob value={state.p[i].freq} min={20}  max={20000} step={1}    onChange={v => setP(i, { freq: v })} size="sm" label="Hz" />
          <Knob value={state.p[i].gain} min={-24} max={24}    step={0.5}  onChange={v => setP(i, { gain: v })} size="sm" label="dB" />
          <Knob value={state.p[i].bw}   min={0.05} max={4}    step={0.05} onChange={v => setP(i, { bw: v })}   size="sm" label="BW" />
          {toggle(state.p[i].enabled, () => setP(i, { enabled: !state.p[i].enabled }))}
        </>))}

        {col('Hi Shelf', <>
          <Knob value={state.hs.freq} min={1000} max={20000} step={10}  onChange={v => setHS({ freq: v })} size="sm" label="Hz" />
          <Knob value={state.hs.gain} min={-24}  max={24}    step={0.5} onChange={v => setHS({ gain: v })} size="sm" label="dB" />
          <Knob value={state.hs.q}    min={0.1}  max={2}     step={0.01} onChange={v => setHS({ q: v })}   size="sm" label="Q"  />
          {toggle(state.hs.enabled, () => setHS({ enabled: !state.hs.enabled }))}
        </>)}

        {col('LP', <>
          <Knob value={state.lp.freq} min={500}  max={20000} step={10}   onChange={v => setLP({ freq: v })} size="sm" label="Hz" />
          <Knob value={state.lp.q}    min={0.1}  max={4}     step={0.01} onChange={v => setLP({ q: v })}    size="sm" label="Q"  />
          {toggle(state.lp.enabled, () => setLP({ enabled: !state.lp.enabled }))}
        </>)}
      </div>
    </div>
  );
};
