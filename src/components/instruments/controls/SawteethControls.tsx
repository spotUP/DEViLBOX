/**
 * SawteethControls.tsx - Sawteeth instrument editor
 *
 * Sawteeth by Stansen/Sanity — Amiga/PC software synth tracker.
 * 8 waveforms, state-variable filter, multi-point envelopes,
 * vibrato/PWM LFOs, arpeggio/waveform step sequences.
 *
 * Tabs: Params | Amp Env | Filter Env | Steps | Info
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { SawteethConfig, SawteethInstrumentConfig, SawteethEnvPoint, SawteethInsStep } from '@/types/instrument/exotic';
import { Knob } from '@components/controls/Knob';
import { useInstrumentColors } from '@/hooks/useInstrumentColors';
import { SectionLabel } from '@components/instruments/shared';
import { SawteethEngine, ST_PARAM } from '@/engine/sawteeth/SawteethEngine';

interface SawteethControlsProps {
  config: SawteethConfig;
  onChange: (updates: Partial<SawteethConfig>) => void;
}

type StTab = 'params' | 'ampenv' | 'fltenv' | 'steps' | 'info';

const FILTER_LABELS = ['OFF', 'SLP', 'OLP', 'LP', 'HP', 'BP', 'BS'];
const CLIP_LABELS = ['OFF', 'HARD', 'SIN'];
const WAVE_LABELS = ['Hold', 'Saw', 'Sqr', 'Tri', 'Noise', 'Sin', 'TriU', 'SinU'];

export const SawteethControls: React.FC<SawteethControlsProps> = ({
  config,
  onChange,
}) => {
  const [activeTab, setActiveTab] = useState<StTab>('params');
  const [selectedInst, setSelectedInst] = useState(0);

  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const { accent, knob, panelStyle } = useInstrumentColors('#4488ff');

  // Fetch instrument data from WASM if config.instruments is empty
  useEffect(() => {
    if (config.instruments.length > 0) return;
    if (!SawteethEngine.hasInstance()) return;

    const engine = SawteethEngine.getInstance();
    let cancelled = false;

    (async () => {
      await engine.ready();
      // Request all instruments (WASM indices start at 1, but we store 0-indexed)
      const numIns = config.instrumentNames.length || 8;
      const instruments: SawteethInstrumentConfig[] = [];
      const names: string[] = [];

      for (let i = 1; i <= numIns; i++) {
        const data = await engine.requestInstrumentData(i);
        if (cancelled) return;
        instruments.push({
          filterMode: data.filterMode,
          clipMode: data.clipMode,
          boost: data.boost,
          vibS: data.vibS,
          vibD: data.vibD,
          pwmS: data.pwmS,
          pwmD: data.pwmD,
          res: data.res,
          sps: data.sps,
          len: data.len,
          loop: data.loop,
          ampEnv: data.ampEnv,
          filterEnv: data.filterEnv,
          steps: data.steps,
        });
        names.push(`Instrument ${i}`);
      }

      if (!cancelled) {
        onChange({ instruments, instrumentNames: names });
      }
    })();

    return () => { cancelled = true; };
  }, [config.instruments.length, config.instrumentNames.length, onChange]);

  const inst: SawteethInstrumentConfig | undefined = config.instruments[selectedInst];

  // Push a scalar param change to WASM and update config
  const setParam = useCallback((paramId: number, value: number) => {
    if (!inst) return;
    const instruments = [...configRef.current.instruments];
    const updated = { ...instruments[selectedInst] };

    switch (paramId) {
      case ST_PARAM.FILTER_MODE: updated.filterMode = value; break;
      case ST_PARAM.CLIP_MODE: updated.clipMode = value; break;
      case ST_PARAM.BOOST: updated.boost = value; break;
      case ST_PARAM.VIB_S: updated.vibS = value; break;
      case ST_PARAM.VIB_D: updated.vibD = value; break;
      case ST_PARAM.PWM_S: updated.pwmS = value; break;
      case ST_PARAM.PWM_D: updated.pwmD = value; break;
      case ST_PARAM.RES: updated.res = value; break;
      case ST_PARAM.SPS: updated.sps = value; break;
      case ST_PARAM.LEN: updated.len = value; break;
      case ST_PARAM.LOOP: updated.loop = value; break;
    }

    instruments[selectedInst] = updated;
    onChange({ instruments });

    // Push to WASM (instrument indices are 1-based in WASM)
    if (SawteethEngine.hasInstance()) {
      SawteethEngine.getInstance().setParam(selectedInst + 1, paramId, value);
    }
  }, [inst, selectedInst, onChange]);

  // Amp envelope change
  const setAmpEnv = useCallback((points: SawteethEnvPoint[]) => {
    const instruments = [...configRef.current.instruments];
    instruments[selectedInst] = { ...instruments[selectedInst], ampEnv: points };
    onChange({ instruments });

    if (SawteethEngine.hasInstance()) {
      SawteethEngine.getInstance().setAmpEnv(selectedInst + 1, points);
    }
  }, [selectedInst, onChange]);

  // Filter envelope change
  const setFilterEnv = useCallback((points: SawteethEnvPoint[]) => {
    const instruments = [...configRef.current.instruments];
    instruments[selectedInst] = { ...instruments[selectedInst], filterEnv: points };
    onChange({ instruments });

    if (SawteethEngine.hasInstance()) {
      SawteethEngine.getInstance().setFilterEnv(selectedInst + 1, points);
    }
  }, [selectedInst, onChange]);

  // Step change
  const setStep = useCallback((stepIdx: number, step: SawteethInsStep) => {
    if (!inst) return;
    const instruments = [...configRef.current.instruments];
    const steps = [...instruments[selectedInst].steps];
    steps[stepIdx] = step;
    instruments[selectedInst] = { ...instruments[selectedInst], steps };
    onChange({ instruments });

    if (SawteethEngine.hasInstance()) {
      SawteethEngine.getInstance().setStep(selectedInst + 1, stepIdx, step.note, step.wForm, step.relative);
    }
  }, [inst, selectedInst, onChange]);

  if (!inst) {
    return (
      <div className="p-4 text-text-muted text-sm">
        No instrument data available. Load a Sawteeth (.st) file first.
      </div>
    );
  }

  const tabs: { key: StTab; label: string }[] = [
    { key: 'params', label: 'Params' },
    { key: 'ampenv', label: 'Amp Env' },
    { key: 'fltenv', label: 'Filter Env' },
    { key: 'steps', label: 'Steps' },
    { key: 'info', label: 'Info' },
  ];

  return (
    <div className="flex flex-col gap-2 p-3 text-xs" style={panelStyle}>
      {/* Instrument selector */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-text-muted">Inst:</span>
        <select
          className="bg-surface-secondary text-text-primary border border-border-primary rounded px-2 py-0.5 text-xs"
          value={selectedInst}
          onChange={(e) => setSelectedInst(Number(e.target.value))}
        >
          {config.instruments.map((_, i) => (
            <option key={i} value={i}>
              {(config.instrumentNames[i] || `Instrument ${i + 1}`)}
            </option>
          ))}
        </select>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border-primary pb-1">
        {tabs.map(t => (
          <button
            key={t.key}
            className={`px-2 py-1 rounded-t text-xs transition-colors ${
              activeTab === t.key
                ? 'text-text-primary border-b-2'
                : 'text-text-muted hover:text-text-primary'
            }`}
            style={activeTab === t.key ? { borderBottomColor: accent } : undefined}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'params' && (
        <ParamsPanel inst={inst} setParam={setParam} knobColor={knob} accent={accent} />
      )}
      {activeTab === 'ampenv' && (
        <EnvelopePanel
          label="Amplitude"
          points={inst.ampEnv}
          onChange={setAmpEnv}
          accent={accent}
        />
      )}
      {activeTab === 'fltenv' && (
        <EnvelopePanel
          label="Filter"
          points={inst.filterEnv}
          onChange={setFilterEnv}
          accent="#ff8844"
        />
      )}
      {activeTab === 'steps' && (
        <StepsPanel
          steps={inst.steps}
          loop={inst.loop}
          onChange={setStep}
          accent={accent}
        />
      )}
      {activeTab === 'info' && (
        <div className="flex flex-col gap-2 p-2">
          <div className="text-text-muted">Title: <span className="text-text-primary">{config.title}</span></div>
          <div className="text-text-muted">Author: <span className="text-text-primary">{config.author}</span></div>
          <div className="text-text-muted">Channels: <span className="text-text-primary">{config.numChannels}</span></div>
          <div className="text-text-muted">Instruments: <span className="text-text-primary">{config.instruments.length}</span></div>
        </div>
      )}
    </div>
  );
};

// ── Params Panel ──────────────────────────────────────────────────────────

interface ParamsPanelProps {
  inst: SawteethInstrumentConfig;
  setParam: (paramId: number, value: number) => void;
  knobColor: string;
  accent: string;
}

const ParamsPanel: React.FC<ParamsPanelProps> = ({ inst, setParam, knobColor, accent }) => (
  <div className="flex flex-col gap-3 p-1">
    {/* Filter section */}
    <SectionLabel label="Filter" color={accent} />
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex flex-col items-center gap-1">
        <span className="text-text-muted text-[10px]">Mode</span>
        <select
          className="bg-surface-secondary text-text-primary border border-border-primary rounded px-1 py-0.5 text-xs w-16"
          value={inst.filterMode}
          onChange={(e) => setParam(ST_PARAM.FILTER_MODE, Number(e.target.value))}
        >
          {FILTER_LABELS.map((l, i) => <option key={i} value={i}>{l}</option>)}
        </select>
      </div>
      <div className="flex flex-col items-center gap-1">
        <Knob
          value={inst.res}
          min={0} max={255} step={1}
          size="sm"
          color={knobColor}
          onChange={(v) => setParam(ST_PARAM.RES, Math.round(v))}
        />
        <span className="text-text-muted text-[10px]">Resonance</span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <Knob
          value={inst.boost}
          min={0} max={15} step={1}
          size="sm"
          color={knobColor}
          onChange={(v) => setParam(ST_PARAM.BOOST, Math.round(v))}
        />
        <span className="text-text-muted text-[10px]">Boost</span>
      </div>
    </div>

    {/* Clip */}
    <SectionLabel label="Clip" color={accent} />
    <div className="flex items-center gap-3">
      <div className="flex flex-col items-center gap-1">
        <span className="text-text-muted text-[10px]">Mode</span>
        <select
          className="bg-surface-secondary text-text-primary border border-border-primary rounded px-1 py-0.5 text-xs w-16"
          value={inst.clipMode}
          onChange={(e) => setParam(ST_PARAM.CLIP_MODE, Number(e.target.value))}
        >
          {CLIP_LABELS.map((l, i) => <option key={i} value={i}>{l}</option>)}
        </select>
      </div>
    </div>

    {/* Vibrato */}
    <SectionLabel label="Vibrato" color={accent} />
    <div className="flex items-center gap-3">
      <div className="flex flex-col items-center gap-1">
        <Knob
          value={inst.vibS}
          min={0} max={255} step={1}
          size="sm"
          color={knobColor}
          onChange={(v) => setParam(ST_PARAM.VIB_S, Math.round(v))}
        />
        <span className="text-text-muted text-[10px]">Speed</span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <Knob
          value={inst.vibD}
          min={0} max={255} step={1}
          size="sm"
          color={knobColor}
          onChange={(v) => setParam(ST_PARAM.VIB_D, Math.round(v))}
        />
        <span className="text-text-muted text-[10px]">Depth</span>
      </div>
    </div>

    {/* PWM */}
    <SectionLabel label="PWM" color={accent} />
    <div className="flex items-center gap-3">
      <div className="flex flex-col items-center gap-1">
        <Knob
          value={inst.pwmS}
          min={0} max={255} step={1}
          size="sm"
          color={knobColor}
          onChange={(v) => setParam(ST_PARAM.PWM_S, Math.round(v))}
        />
        <span className="text-text-muted text-[10px]">Speed</span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <Knob
          value={inst.pwmD}
          min={0} max={255} step={1}
          size="sm"
          color={knobColor}
          onChange={(v) => setParam(ST_PARAM.PWM_D, Math.round(v))}
        />
        <span className="text-text-muted text-[10px]">Depth</span>
      </div>
    </div>

    {/* Sequencer */}
    <SectionLabel label="Sequencer" color={accent} />
    <div className="flex items-center gap-3">
      <div className="flex flex-col items-center gap-1">
        <Knob
          value={inst.sps}
          min={1} max={255} step={1}
          size="sm"
          color={knobColor}
          onChange={(v) => setParam(ST_PARAM.SPS, Math.round(v))}
        />
        <span className="text-text-muted text-[10px]">Speed</span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <span className="text-text-muted text-[10px]">Length: {inst.len}</span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <span className="text-text-muted text-[10px]">Loop: {inst.loop}</span>
      </div>
    </div>
  </div>
);

// ── Envelope Panel ────────────────────────────────────────────────────────

interface EnvelopePanelProps {
  label: string;
  points: SawteethEnvPoint[];
  onChange: (points: SawteethEnvPoint[]) => void;
  accent: string;
}

const EnvelopePanel: React.FC<EnvelopePanelProps> = ({ label, points, onChange, accent }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Draw the envelope
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = '#0a0f1a';
    ctx.fillRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = '#1a2030';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = (i / 4) * h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    if (points.length === 0) return;

    // Compute x positions based on cumulative time
    let totalTime = 0;
    for (const p of points) totalTime += p.time || 1;

    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.beginPath();

    let xAcc = 0;
    for (let i = 0; i < points.length; i++) {
      const x = (xAcc / totalTime) * w;
      const y = (1 - points[i].lev / 255) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      xAcc += points[i].time || 1;
    }
    // Draw to end
    ctx.lineTo(w, (1 - points[points.length - 1].lev / 255) * h);
    ctx.stroke();

    // Draw points
    xAcc = 0;
    for (let i = 0; i < points.length; i++) {
      const x = (xAcc / totalTime) * w;
      const y = (1 - points[i].lev / 255) * h;
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      xAcc += points[i].time || 1;
    }
  }, [points, accent]);

  return (
    <div className="flex flex-col gap-2 p-1">
      <SectionLabel label={`${label} Envelope (${points.length} points)`} color={accent} />
      <canvas
        ref={canvasRef}
        className="w-full rounded border border-border-primary"
        style={{ height: 80 }}
      />
      {/* Point table */}
      <div className="overflow-y-auto max-h-[180px]">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="text-text-muted">
              <th className="text-left px-1 w-8">#</th>
              <th className="text-left px-1">Time</th>
              <th className="text-left px-1">Level</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p, i) => (
              <tr key={i} className="border-t border-border-primary/30">
                <td className="px-1 text-text-muted">{i}</td>
                <td className="px-1">
                  <input
                    type="number"
                    className="bg-surface-secondary text-text-primary border border-border-primary rounded px-1 w-14 text-[10px]"
                    min={0} max={255}
                    value={p.time}
                    onChange={(e) => {
                      const newPoints = [...points];
                      newPoints[i] = { ...newPoints[i], time: Math.max(0, Math.min(255, Number(e.target.value))) };
                      onChange(newPoints);
                    }}
                  />
                </td>
                <td className="px-1">
                  <input
                    type="number"
                    className="bg-surface-secondary text-text-primary border border-border-primary rounded px-1 w-14 text-[10px]"
                    min={0} max={255}
                    value={p.lev}
                    onChange={(e) => {
                      const newPoints = [...points];
                      newPoints[i] = { ...newPoints[i], lev: Math.max(0, Math.min(255, Number(e.target.value))) };
                      onChange(newPoints);
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ── Steps Panel ───────────────────────────────────────────────────────────

interface StepsPanelProps {
  steps: SawteethInsStep[];
  loop: number;
  onChange: (stepIdx: number, step: SawteethInsStep) => void;
  accent: string;
}

const StepsPanel: React.FC<StepsPanelProps> = ({ steps, loop, onChange, accent }) => (
  <div className="flex flex-col gap-2 p-1">
    <SectionLabel label={`Arpeggio/Waveform Sequence (${steps.length} steps, loop @ ${loop})`} color={accent} />
    <div className="overflow-y-auto max-h-[240px]">
      <table className="w-full text-[10px]">
        <thead>
          <tr className="text-text-muted">
            <th className="text-left px-1 w-8">#</th>
            <th className="text-left px-1">Wave</th>
            <th className="text-left px-1">Note</th>
            <th className="text-left px-1">Rel</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((s, i) => (
            <tr
              key={i}
              className={`border-t border-border-primary/30 ${i === loop ? 'bg-accent-primary/10' : ''}`}
            >
              <td className="px-1 text-text-muted">
                {i === loop ? `>${i}` : i}
              </td>
              <td className="px-1">
                <select
                  className="bg-surface-secondary text-text-primary border border-border-primary rounded px-1 text-[10px] w-16"
                  value={s.wForm}
                  onChange={(e) => onChange(i, { ...s, wForm: Number(e.target.value) })}
                >
                  {WAVE_LABELS.map((l, wi) => <option key={wi} value={wi}>{l}</option>)}
                </select>
              </td>
              <td className="px-1">
                <input
                  type="number"
                  className="bg-surface-secondary text-text-primary border border-border-primary rounded px-1 w-12 text-[10px]"
                  min={0} max={96}
                  value={s.note}
                  onChange={(e) => onChange(i, { ...s, note: Math.max(0, Math.min(96, Number(e.target.value))) })}
                />
              </td>
              <td className="px-1">
                <input
                  type="checkbox"
                  checked={s.relative}
                  onChange={(e) => onChange(i, { ...s, relative: e.target.checked })}
                  className="accent-accent-primary"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);
