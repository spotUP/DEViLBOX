/**
 * MAMEGenericHardware — Pure React hardware UI for any MAME chip synth
 *
 * Reads ChipParameterDef[] from chipParameters.ts and renders grouped
 * knobs, toggles, and selects using HWKnob / HWSectionLabel.
 *
 * Replaces the SDL2/WASM canvas approach — no WASM dependency.
 * Covers 25+ MAME chip types with a consistent dark hardware aesthetic.
 */

import React, { useRef, useEffect, useMemo } from 'react';
import { getChipSynthDef, type ChipParameterDef } from '@/constants/chipParameters';
import type { SynthType } from '@typedefs/instrument';
import { HWKnob, HWSectionLabel } from './MAMESharedKnob';

interface MAMEGenericHardwareProps {
  synthType: SynthType;
  parameters: Record<string, number>;
  onParamChange: (key: string, value: number) => void;
}

/* ── Format display helper ─────────────────────────────────────────────── */

function makeFormatDisplay(p: ChipParameterDef): (v: number) => string {
  const fmt = p.formatValue;
  if (fmt === 'percent') return (v) => `${Math.round(v * 100)}%`;
  if (fmt === 'int')     return (v) => `${Math.round(v)}`;
  if (fmt === 'hz')      return (v) => `${Math.round(v)} Hz`;
  if (fmt === 'db')      return (v) => `${Math.round(v)} dB`;
  if (fmt === 'seconds') return (v) => v >= 1 ? `${v.toFixed(2)}s` : `${Math.round(v * 1000)}ms`;
  // Default: int for large ranges, percent for 0-1
  return (p.max ?? 1) > 1
    ? (v) => `${Math.round(v)}`
    : (v) => `${Math.round(v * 100)}%`;
}

/* ── Parameter renderers ───────────────────────────────────────────────── */

interface ParamRendererProps {
  p: ChipParameterDef;
  value: number;
  color: string;
  onChange: (key: string, value: number) => void;
}

const KnobParam: React.FC<ParamRendererProps> = ({ p, value, color, onChange }) => (
  <HWKnob
    label={p.label}
    value={value}
    min={p.min ?? 0}
    max={p.max ?? 1}
    step={p.step}
    onChange={(v) => onChange(p.key, v)}
    color={color}
    size="sm"
    formatDisplay={makeFormatDisplay(p)}
  />
);

const ToggleParam: React.FC<ParamRendererProps> = ({ p, value, color, onChange }) => {
  const active = value > 0.5;
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        onClick={() => onChange(p.key, active ? 0 : 1)}
        className="rounded font-mono transition-all"
        style={{
          width: 56,
          height: 22,
          fontSize: 8,
          background: active ? `${color}35` : 'rgba(255,255,255,0.04)',
          border: `1px solid ${active ? color : 'rgba(255,255,255,0.12)'}`,
          color: active ? color : 'rgba(255,255,255,0.35)',
          boxShadow: active ? `0 0 6px ${color}30` : undefined,
        }}
      >
        {p.label}
      </button>
    </div>
  );
};

const SelectParam: React.FC<ParamRendererProps> = ({ p, value, color, onChange }) => {
  const opts = p.options;
  if (opts && opts.length > 0) {
    // Render as option buttons
    return (
      <div className="flex flex-col items-start gap-0.5">
        <div className="text-[7px] uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
          {p.label}
        </div>
        {opts.map((opt) => {
          const active = Math.abs(value - opt.value) < 0.01;
          return (
            <button
              key={opt.label}
              onClick={() => onChange(p.key, opt.value)}
              className="rounded font-mono transition-all text-left"
              style={{
                width: 72,
                height: 18,
                fontSize: 7,
                paddingLeft: 4,
                background: active ? `${color}35` : 'rgba(255,255,255,0.04)',
                border: `1px solid ${active ? color : 'rgba(255,255,255,0.1)'}`,
                color: active ? color : 'rgba(255,255,255,0.35)',
                boxShadow: active ? `0 0 4px ${color}25` : undefined,
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    );
  }

  // No options — render as knob
  return <KnobParam p={p} value={value} color={color} onChange={onChange} />;
};

/* ── Main component ─────────────────────────────────────────────────────── */

export const MAMEGenericHardware: React.FC<MAMEGenericHardwareProps> = ({
  synthType,
  parameters,
  onParamChange,
}) => {
  const def = useMemo(() => getChipSynthDef(synthType), [synthType]);
  const onChangeRef = useRef(onParamChange);
  useEffect(() => { onChangeRef.current = onParamChange; }, [onParamChange]);

  const handleChange = (key: string, value: number) => onChangeRef.current(key, value);

  if (!def) {
    return (
      <div className="p-4 text-center" style={{ color: 'rgba(255,255,255,0.4)' }}>
        No parameter definitions for {synthType}
      </div>
    );
  }

  const color = def.color || '#60a5fa';

  // Group parameters
  const paramsByGroup = useMemo(() => {
    const groups = new Map<string, ChipParameterDef[]>();
    for (const p of def.parameters) {
      if (p.type === 'text' || p.type === 'vowelEditor') continue;
      const g = p.group || 'General';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(p);
    }
    return groups;
  }, [def]);

  return (
    <div
      className="rounded-lg overflow-hidden shadow-2xl select-none"
      style={{
        background: 'linear-gradient(180deg, #1a1a1a 0%, #0d0d0d 100%)',
        border: '2px solid #2a2a2a',
      }}
    >
      {/* Header */}
      <div
        className="px-5 py-3 border-b"
        style={{
          background: 'linear-gradient(90deg, #181818 0%, #222222 50%, #181818 100%)',
          borderColor: 'rgba(255,255,255,0.08)',
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 7, letterSpacing: '0.3em', textTransform: 'uppercase' }}>
              MAME CHIP EMULATION
            </div>
            <div style={{ color: '#e0e0e0', fontSize: 18, fontWeight: 900, letterSpacing: '0.05em' }}>
              {def.name}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 7, letterSpacing: '0.1em' }}>
              {def.subtitle}
            </div>
          </div>
          {/* Accent badge */}
          <div
            className="rounded px-2 py-1 font-mono"
            style={{ background: `${color}18`, border: `1px solid ${color}40` }}
          >
            <div style={{ color, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em' }}>
              {def.synthType}
            </div>
          </div>
        </div>
      </div>

      {/* Parameter groups */}
      <div className="p-4">
        <div className="flex flex-wrap gap-5 items-start">
          {Array.from(paramsByGroup.entries()).map(([group, params]) => (
            <div key={group} style={{ minWidth: 70 }}>
              <HWSectionLabel label={group} color={`${color}80`} />
              <div className="flex flex-wrap gap-3 items-start mt-1">
                {params.map((p) => {
                  const value = parameters[p.key] ?? p.default;
                  if (p.type === 'toggle') {
                    return (
                      <ToggleParam
                        key={p.key}
                        p={p}
                        value={value}
                        color={color}
                        onChange={handleChange}
                      />
                    );
                  }
                  if (p.type === 'select') {
                    return (
                      <SelectParam
                        key={p.key}
                        p={p}
                        value={value}
                        color={color}
                        onChange={handleChange}
                      />
                    );
                  }
                  return (
                    <KnobParam
                      key={p.key}
                      p={p}
                      value={value}
                      color={color}
                      onChange={handleChange}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom bar */}
      <div
        className="px-5 py-1 text-center"
        style={{ background: 'rgba(0,0,0,0.5)', borderTop: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div style={{ color: 'rgba(255,255,255,0.18)', fontSize: 7, letterSpacing: '0.3em', textTransform: 'uppercase' }}>
          {def.name}  •  MAME EMULATION
        </div>
      </div>
    </div>
  );
};
