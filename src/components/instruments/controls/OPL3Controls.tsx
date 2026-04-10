/**
 * OPL3Controls — Visual display of OPL3/AdLib instrument operator parameters.
 *
 * Read-only: audio comes from the AdPlug WASM streaming player, not from
 * individual synth instances. These controls show the extracted OPL register
 * data (2-operator FM, waveforms, ADSR, feedback/connection).
 */

import React from 'react';
import type { OPL3Config } from '@/types/instrument/tonejs';

interface OPL3ControlsProps {
  config: OPL3Config;
}

const OPL_WAVEFORMS = ['Sine', 'Half-Sine', 'Abs-Sine', 'Pulse', 'Sine×2', 'Abs×2', 'Square', 'DSaw'];

function ADSRBar({ label, a, d, s, r }: { label: string; a: number; d: number; s: number; r: number }) {
  // Simple ADSR visualization as colored bar segments
  const aw = (a / 15) * 100;
  const dw = (d / 15) * 100;
  const sw = (s / 15) * 100;
  const rw = (r / 15) * 100;
  return (
    <div className="space-y-1">
      <div className="text-text-muted text-[10px] font-semibold">{label} ADSR</div>
      <div className="flex gap-px h-5 rounded overflow-hidden bg-dark-bg">
        <div className="bg-accent-success/60 flex items-center justify-center text-[8px] text-text-primary"
          style={{ width: `${Math.max(aw, 8)}%` }} title={`Attack: ${a}`}>A:{a}</div>
        <div className="bg-accent-warning/60 flex items-center justify-center text-[8px] text-text-primary"
          style={{ width: `${Math.max(dw, 8)}%` }} title={`Decay: ${d}`}>D:{d}</div>
        <div className="bg-accent-primary/60 flex items-center justify-center text-[8px] text-text-primary"
          style={{ width: `${Math.max(sw, 8)}%` }} title={`Sustain: ${s}`}>S:{s}</div>
        <div className="bg-accent-error/60 flex items-center justify-center text-[8px] text-text-primary"
          style={{ width: `${Math.max(rw, 8)}%` }} title={`Release: ${r}`}>R:{r}</div>
      </div>
    </div>
  );
}

function ParamRow({ label, value, max, unit }: { label: string; value: number; max: number; unit?: string }) {
  const pct = (value / max) * 100;
  return (
    <div className="flex items-center gap-2">
      <span className="text-text-muted text-[10px] w-20 truncate" title={label}>{label}</span>
      <div className="flex-1 h-3 bg-dark-bg rounded overflow-hidden">
        <div className="h-full bg-accent-primary/50 rounded" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-text-secondary text-[10px] w-10 text-right">{value}{unit || ''}</span>
    </div>
  );
}

export const OPL3Controls: React.FC<OPL3ControlsProps> = ({ config }) => {
  const c = config;
  return (
    <div className="p-4 space-y-4 text-xs">
      {/* Read-only notice */}
      <div className="text-text-muted text-[10px] bg-dark-bg/50 rounded px-2 py-1 border border-dark-border">
        OPL3 instrument — audio from AdPlug WASM player. Parameters are read-only.
      </div>

      {/* Connection & Feedback */}
      <div className="flex gap-4 items-center">
        <div className="flex items-center gap-2">
          <span className="text-text-muted text-[10px]">Algorithm:</span>
          <span className="text-accent-primary font-mono text-xs">
            {(c.connection ?? 0) === 0 ? 'FM (Op1→Op2)' : 'Additive (Op1+Op2)'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-text-muted text-[10px]">Feedback:</span>
          <span className="text-accent-primary font-mono text-xs">{c.feedback ?? 0}</span>
        </div>
      </div>

      {/* Operator 1 — Modulator */}
      <div className="border border-dark-border rounded p-3 space-y-2">
        <h3 className="text-accent-warning font-semibold text-[11px] border-b border-dark-border pb-1">
          Operator 1 — Modulator
        </h3>
        <ADSRBar label="Op1" a={c.op1Attack ?? 0} d={c.op1Decay ?? 0} s={c.op1Sustain ?? 0} r={c.op1Release ?? 0} />
        <ParamRow label="Level" value={c.op1Level ?? 0} max={63} />
        <ParamRow label="Multiplier" value={c.op1Multi ?? 0} max={15} unit="×" />
        <div className="flex gap-4">
          <span className="text-text-muted text-[10px]">Wave: <span className="text-text-secondary">{OPL_WAVEFORMS[c.op1Waveform ?? 0]}</span></span>
          <span className="text-text-muted text-[10px]">KSL: <span className="text-text-secondary">{c.op1KSL ?? 0}</span></span>
        </div>
        <div className="flex gap-3">
          {(c.op1Tremolo ?? 0) > 0 && <span className="text-accent-success text-[10px]">Tremolo</span>}
          {(c.op1Vibrato ?? 0) > 0 && <span className="text-accent-primary text-[10px]">Vibrato</span>}
          {(c.op1SustainHold ?? 0) > 0 && <span className="text-accent-warning text-[10px]">Sustain Hold</span>}
          {(c.op1KSR ?? 0) > 0 && <span className="text-text-muted text-[10px]">KSR</span>}
        </div>
      </div>

      {/* Operator 2 — Carrier */}
      <div className="border border-dark-border rounded p-3 space-y-2">
        <h3 className="text-accent-success font-semibold text-[11px] border-b border-dark-border pb-1">
          Operator 2 — Carrier
        </h3>
        <ADSRBar label="Op2" a={c.op2Attack ?? 0} d={c.op2Decay ?? 0} s={c.op2Sustain ?? 0} r={c.op2Release ?? 0} />
        <ParamRow label="Level" value={c.op2Level ?? 0} max={63} />
        <ParamRow label="Multiplier" value={c.op2Multi ?? 0} max={15} unit="×" />
        <div className="flex gap-4">
          <span className="text-text-muted text-[10px]">Wave: <span className="text-text-secondary">{OPL_WAVEFORMS[c.op2Waveform ?? 0]}</span></span>
          <span className="text-text-muted text-[10px]">KSL: <span className="text-text-secondary">{c.op2KSL ?? 0}</span></span>
        </div>
        <div className="flex gap-3">
          {(c.op2Tremolo ?? 0) > 0 && <span className="text-accent-success text-[10px]">Tremolo</span>}
          {(c.op2Vibrato ?? 0) > 0 && <span className="text-accent-primary text-[10px]">Vibrato</span>}
          {(c.op2SustainHold ?? 0) > 0 && <span className="text-accent-warning text-[10px]">Sustain Hold</span>}
          {(c.op2KSR ?? 0) > 0 && <span className="text-text-muted text-[10px]">KSR</span>}
        </div>
      </div>
    </div>
  );
};
