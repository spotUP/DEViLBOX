/**
 * Fil4EqPanel — Master FX panel for Fil4EqEffect.
 * Curve display + 8 band columns: HP | LoShelf | P1–P4 | HiShelf | LP
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Fil4EqCurve, type BandId } from './Fil4EqCurve';
import { Button } from '@components/ui/Button';
import type { Fil4EqEffect } from '@/engine/effects/Fil4EqEffect';
import { useDrumPadStore } from '@/stores/useDrumPadStore';
import { computeGenreBaseline } from '@engine/dub/AutoEQ';

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

// ── Log-scale helpers for frequency sliders ──────────────────────────────────
const freqToSlider = (hz: number, min: number, max: number) =>
  (Math.log(Math.max(hz, min) / min) / Math.log(max / min)) * 100;
const sliderToFreq = (v: number, min: number, max: number) =>
  Math.round(min * Math.pow(max / min, v / 100));

// ── Value formatters ──────────────────────────────────────────────────────────
const fmtHz = (v: number) =>
  v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `${Math.round(v)}`;
const fmtDb = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`;
const fmtQ  = (v: number) => v.toFixed(2);
const fmtBw = (v: number) => `${v.toFixed(2)}`;

// ── EqFader — compact labeled slider ─────────────────────────────────────────
interface FaderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  fmt?: (v: number) => string;
  logScale?: boolean;
}

const EqFader: React.FC<FaderProps> = ({
  label, value, min, max, step = 0.01, onChange, fmt, logScale,
}) => {
  const sliderVal = logScale ? freqToSlider(value, min, max) : value;
  return (
    <div className="flex flex-col gap-0 w-full">
      <div className="flex items-center justify-between px-0.5">
        <span className="text-[8px] font-mono text-text-muted leading-tight">{label}</span>
        <span className="text-[8px] font-mono text-text-secondary tabular-nums leading-tight">
          {fmt ? fmt(value) : value.toFixed(2)}
        </span>
      </div>
      <input
        type="range"
        min={logScale ? 0 : min}
        max={logScale ? 100 : max}
        step={logScale ? 0.2 : step}
        value={sliderVal}
        onChange={e => {
          const raw = Number(e.target.value);
          onChange(logScale ? sliderToFreq(raw, min, max) : raw);
        }}
        className="w-full accent-accent-primary cursor-pointer"
        style={{ height: '14px' }}
      />
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

interface Props { effect: Fil4EqEffect; }

export const Fil4EqPanel: React.FC<Props> = ({ effect }) => {
  const dubBus    = useDrumPadStore(s => s.dubBus);
  const setDubBus = useDrumPadStore(s => s.setDubBus);

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

  const handleBandChange = useCallback((bandId: BandId, patch: { freq?: number; gain?: number; q?: number; bw?: number; enabled?: boolean }) => {
    switch (bandId) {
      case 'hp': setHP(patch); break;
      case 'lp': setLP(patch); break;
      case 'ls': setLS(patch); break;
      case 'hs': setHS(patch); break;
      case 'p0': setP(0, patch); break;
      case 'p1': setP(1, patch); break;
      case 'p2': setP(2, patch); break;
      case 'p3': setP(3, patch); break;
    }
  }, [setHP, setLP, setLS, setHS, setP]);

  const toggle = (on: boolean, onClick: () => void) => (
    <Button
      type="button"
      variant="compact"
      onClick={onClick}
      className={on ? 'border-accent-highlight bg-accent-highlight/20 text-accent-highlight w-full' : 'w-full'}
    >
      {on ? 'ON' : 'OFF'}
    </Button>
  );

  const col = (label: string, content: React.ReactNode) => (
    <div className="flex flex-col items-stretch gap-1 px-2 py-1 border-r border-dark-border last:border-0 min-w-[88px]">
      <span className="text-[9px] font-mono text-text-secondary font-bold text-center">{label}</span>
      {content}
    </div>
  );

  const applyGenrePreset = useCallback((genre: string) => {
    if (genre === '') return;
    const curve = computeGenreBaseline(genre, 0.7, 0.6);
    effect.setHP(curve.hp.enabled, curve.hp.freq, curve.hp.q);
    effect.setLowShelf(curve.ls.enabled, curve.ls.freq, curve.ls.gain ?? 0, curve.ls.q ?? 0.8);
    effect.setHighShelf(curve.hs.enabled, curve.hs.freq, curve.hs.gain ?? 0, curve.hs.q ?? 0.8);
    [curve.p0, curve.p1, curve.p2, curve.p3].forEach((band, i) => {
      effect.setBand(i as 0|1|2|3, band.enabled, band.freq, band.bw ?? 1.2, band.gain ?? 0);
    });
    effect.setMasterGain(1.0);
  }, [effect]);

  const resetFlat = useCallback(() => {
    effect.setHP(false, 25, 0.7);
    effect.setLP(false, 20000, 0.7);
    effect.setLowShelf(false, 80, 0, 0.8);
    effect.setHighShelf(false, 10000, 0, 0.8);
    ([0,1,2,3] as const).forEach(i => effect.setBand(i, false, [200,500,2000,8000][i], 1.0, 0));
    effect.setMasterGain(1.0);
  }, [effect]);

  return (
    <div className="flex flex-col gap-2 p-2 bg-dark-bgSecondary rounded-lg select-none">

      {/* Preset row */}
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-mono text-text-muted shrink-0">Preset</span>
        <select
          className="bg-dark-bgTertiary border border-dark-border rounded px-1.5 py-0.5 text-[10px] font-mono text-text-primary focus:ring-1 focus:ring-accent-primary flex-1"
          defaultValue=""
          onChange={e => { applyGenrePreset(e.target.value); e.target.value = ''; }}
        >
          <option value="" disabled>Select genre curve…</option>
          {['Reggae','Electronic','Hip-Hop','Rock','Jazz','Classical','Blues','Folk','Unknown'].map(g => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={resetFlat}
          className="text-[9px] font-mono text-text-muted hover:text-accent-error transition-colors px-1.5 py-0.5 rounded border border-dark-borderLight hover:border-accent-error shrink-0"
          title="Reset all bands to flat (0 dB)"
        >
          Flat
        </button>
      </div>

      {/* Curve */}
      <Fil4EqCurve effect={effect} width={552} height={120} onBandChange={handleBandChange} />

      {/* Master gain strip */}
      <div className="flex items-center gap-2 px-1">
        <span className="text-[9px] font-mono text-text-muted w-8 shrink-0">Gain</span>
        <input
          type="range" min={0} max={2} step={0.01}
          value={state.masterGain}
          onChange={e => setGain(Number(e.target.value))}
          className="flex-1 accent-accent-primary cursor-pointer"
          style={{ height: '14px' }}
        />
        <span className="text-[9px] font-mono text-text-secondary w-12 text-right tabular-nums shrink-0">
          {(20 * Math.log10(Math.max(state.masterGain, 0.001))).toFixed(1)} dB
        </span>
      </div>

      {/* Auto EQ bar */}
      {dubBus && (
        <div className="flex items-center gap-2 px-1 py-0.5 text-[10px] font-mono border-t border-dark-border">
          <span className="text-accent-highlight shrink-0">⚡</span>
          <span className="text-text-secondary font-bold shrink-0">Auto EQ</span>
          <span className="text-text-muted shrink-0">
            {dubBus.autoEqLastGenre
              ? `${dubBus.autoEqLastGenre} · ${Math.round((dubBus.autoEqStrength ?? 0.85) * 100)}%`
              : 'analyzing…'}
          </span>
          <input
            type="range" min={0} max={1} step={0.01}
            value={dubBus.autoEqStrength ?? 0.85}
            onChange={e => setDubBus({ autoEqStrength: Number(e.target.value) })}
            className="flex-1 accent-accent-highlight cursor-pointer"
            style={{ height: '12px' }}
            title={`Auto EQ strength: ${Math.round((dubBus.autoEqStrength ?? 0.85) * 100)}%`}
          />
        </div>
      )}

      {/* Band columns — freq shown as read-only label (drag on curve to change), gain via vertical fader */}
      <div className="flex items-start border border-dark-border rounded overflow-x-auto">

        {/* HP — no gain fader, just freq label + Q slider + toggle */}
        {col('HP', <>
          <span className="text-[8px] font-mono text-text-muted text-center block">{fmtHz(state.hp.freq)}</span>
          <EqFader label="Q" value={state.hp.q} min={0.1} max={4} step={0.01}
            onChange={v => setHP({ q: v })} fmt={fmtQ} />
          {toggle(state.hp.enabled, () => setHP({ enabled: !state.hp.enabled }))}
        </>)}

        {/* Lo Shelf — vertical gain fader */}
        {col('Lo Shelf', <>
          <span className="text-[8px] font-mono text-text-muted text-center block">{fmtHz(state.ls.freq)}</span>
          <div className="flex flex-col items-center gap-1">
            <input
              type="range"
              min={-24} max={24} step={0.5}
              value={state.ls.gain}
              onChange={e => setLS({ gain: Number(e.target.value) })}
              style={{ writingMode: 'vertical-lr', direction: 'rtl', height: '80px', width: '20px' } as React.CSSProperties}
              className="accent-accent-primary cursor-pointer"
            />
            <span className="text-[8px] font-mono text-text-secondary tabular-nums">{fmtDb(state.ls.gain)}</span>
          </div>
          {toggle(state.ls.enabled, () => setLS({ enabled: !state.ls.enabled }))}
          <EqFader label="Q" value={state.ls.q} min={0.1} max={2} step={0.01}
            onChange={v => setLS({ q: v })} fmt={fmtQ} />
        </>)}

        {([0,1,2,3] as const).map(i => col(`P${i+1}`, <>
          <span className="text-[8px] font-mono text-text-muted text-center block">{fmtHz(state.p[i].freq)}</span>
          <div className="flex flex-col items-center gap-1">
            <input
              type="range"
              min={-24} max={24} step={0.5}
              value={state.p[i].gain}
              onChange={e => setP(i, { gain: Number(e.target.value) })}
              style={{ writingMode: 'vertical-lr', direction: 'rtl', height: '80px', width: '20px' } as React.CSSProperties}
              className="accent-accent-primary cursor-pointer"
            />
            <span className="text-[8px] font-mono text-text-secondary tabular-nums">{fmtDb(state.p[i].gain)}</span>
          </div>
          {toggle(state.p[i].enabled, () => setP(i, { enabled: !state.p[i].enabled }))}
          <EqFader label="BW" value={state.p[i].bw} min={0.05} max={4} step={0.05}
            onChange={v => setP(i, { bw: v })} fmt={fmtBw} />
        </>))}

        {/* Hi Shelf — vertical gain fader */}
        {col('Hi Shelf', <>
          <span className="text-[8px] font-mono text-text-muted text-center block">{fmtHz(state.hs.freq)}</span>
          <div className="flex flex-col items-center gap-1">
            <input
              type="range"
              min={-24} max={24} step={0.5}
              value={state.hs.gain}
              onChange={e => setHS({ gain: Number(e.target.value) })}
              style={{ writingMode: 'vertical-lr', direction: 'rtl', height: '80px', width: '20px' } as React.CSSProperties}
              className="accent-accent-primary cursor-pointer"
            />
            <span className="text-[8px] font-mono text-text-secondary tabular-nums">{fmtDb(state.hs.gain)}</span>
          </div>
          {toggle(state.hs.enabled, () => setHS({ enabled: !state.hs.enabled }))}
          <EqFader label="Q" value={state.hs.q} min={0.1} max={2} step={0.01}
            onChange={v => setHS({ q: v })} fmt={fmtQ} />
        </>)}

        {/* LP — no gain fader, just freq label + Q slider + toggle */}
        {col('LP', <>
          <span className="text-[8px] font-mono text-text-muted text-center block">{fmtHz(state.lp.freq)}</span>
          <EqFader label="Q" value={state.lp.q} min={0.1} max={4} step={0.01}
            onChange={v => setLP({ q: v })} fmt={fmtQ} />
          {toggle(state.lp.enabled, () => setLP({ enabled: !state.lp.enabled }))}
        </>)}

      </div>
    </div>
  );
};
