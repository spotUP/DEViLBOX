/**
 * NeuralEditor — dedicated editor for GuitarML neural amp/pedal effects.
 *
 * Renders dynamically based on the model's parameter schema:
 *   - PEDAL_OVERDRIVE: Drive, Tone, Level, Mix (most pedals)
 *   - AMP: Drive, Presence, Level, Mix (amp models)
 *   - AMP_EQ: Drive, Bass, Mid, Treble, Presence, Level, Mix (bass amps)
 *
 * Shows model info (name, category, characteristics) and pre/post oscilloscope.
 */

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useEffectAnalyser } from '@hooks/useEffectAnalyser';
import { EffectOscilloscope } from '../EffectVisualizer';
import { Knob } from '@components/controls/Knob';
import { SectionHeader, getParam, type VisualEffectEditorProps } from './shared';
import { GUITARML_MODEL_REGISTRY } from '@constants/guitarMLRegistry';
import type { NeuralModelInfo } from '@typedefs/pedalboard';
import type { EffectPreset } from '@typedefs/instrument';

const ACCENT = '#a855f7'; // Purple for neural effects

const NEURAL_PRESETS: Record<string, EffectPreset[]> = {
  PEDAL_OVERDRIVE: [
    { name: 'Clean Boost', params: { drive: 15, tone: 50, level: 70, dryWet: 100 } },
    { name: 'Light Crunch', params: { drive: 40, tone: 55, level: 60, dryWet: 100 } },
    { name: 'Full Drive', params: { drive: 75, tone: 45, level: 50, dryWet: 100 } },
    { name: 'Max Gain', params: { drive: 100, tone: 40, level: 40, dryWet: 100 } },
  ],
  AMP: [
    { name: 'Clean', params: { drive: 10, presence: 50, level: 70, dryWet: 100 } },
    { name: 'Edge of Breakup', params: { drive: 40, presence: 60, level: 55, dryWet: 100 } },
    { name: 'Cranked', params: { drive: 80, presence: 50, level: 45, dryWet: 100 } },
  ],
  AMP_EQ: [
    { name: 'Flat Clean', params: { drive: 10, bass: 50, mid: 50, treble: 50, presence: 50, level: 70, dryWet: 100 } },
    { name: 'Scooped', params: { drive: 40, bass: 70, mid: 20, treble: 60, presence: 40, level: 55, dryWet: 100 } },
    { name: 'Mid Push', params: { drive: 50, bass: 40, mid: 70, treble: 50, presence: 60, level: 50, dryWet: 100 } },
  ],
};

/** Gain badge colors */
const GAIN_COLORS: Record<string, string> = {
  low: '#22c55e',
  medium: '#eab308',
  high: '#f97316',
  extreme: '#ef4444',
};

/** Tone badge colors */
const TONE_COLORS: Record<string, string> = {
  dark: '#6366f1',
  neutral: '#a1a1aa',
  bright: '#fbbf24',
};

export const NeuralEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
  onUpdateParameters,
}) => {
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');
  const [presetsOpen, setPresetsOpen] = useState(false);
  const presetsRef = useRef<HTMLDivElement>(null);

  // Find the model info from the registry
  const modelIndex = effect.neuralModelIndex ?? 0;
  const model: NeuralModelInfo | undefined = GUITARML_MODEL_REGISTRY[modelIndex];
  const params = model?.parameters ?? {};
  const paramKeys = useMemo(() => Object.keys(params), [params]);

  // Detect schema type from param keys
  const schemaType = useMemo(() => {
    if (paramKeys.includes('bass') || paramKeys.includes('mid') || paramKeys.includes('treble')) return 'AMP_EQ';
    if (paramKeys.includes('presence')) return 'AMP';
    return 'PEDAL_OVERDRIVE';
  }, [paramKeys]);

  const presets = NEURAL_PRESETS[schemaType] ?? [];

  // Group params: drive section, eq section, output section
  const driveParams = paramKeys.filter(k => k === 'drive' || k === 'condition' || k === 'gain');
  const eqParams = paramKeys.filter(k => ['tone', 'bass', 'mid', 'treble', 'presence'].includes(k));
  const outputParams = paramKeys.filter(k => k === 'level' || k === 'output');
  const mixParams = paramKeys.filter(k => k === 'dryWet');

  // Close presets dropdown on outside click
  useEffect(() => {
    if (!presetsOpen) return;
    const handler = (e: MouseEvent) => {
      if (presetsRef.current && !presetsRef.current.contains(e.target as Node)) {
        setPresetsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [presetsOpen]);

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color={ACCENT} />

      {/* Model Info */}
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <div className="flex items-center justify-between mb-0">
          <SectionHeader size="lg" color={ACCENT} title={model?.fullName ?? 'Neural Effect'} />
          {presets.length > 0 && (
            <div ref={presetsRef} className="relative inline-block">
              <button
                onClick={() => setPresetsOpen(v => !v)}
                className="px-2 py-0.5 text-[9px] uppercase font-bold rounded-full border transition-colors"
                style={{ color: ACCENT, borderColor: `${ACCENT}60`, background: presetsOpen ? `${ACCENT}15` : 'transparent' }}
              >
                Presets ▾
              </button>
              {presetsOpen && (
                <div className="absolute top-full right-0 mt-1 w-44 bg-dark-bgSecondary border border-dark-border rounded-lg shadow-xl z-50 overflow-hidden">
                  <div className="px-3 py-1.5 text-[8px] text-text-muted font-bold uppercase tracking-wider bg-dark-bgTertiary">
                    Factory
                  </div>
                  {presets.map(p => (
                    <button
                      key={p.name}
                      onClick={() => { onUpdateParameters?.(p.params); setPresetsOpen(false); }}
                      className="w-full text-left px-3 py-1.5 text-[11px] text-text-primary hover:bg-dark-bgHover transition-colors"
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        {model && (
          <div className="flex items-center justify-center gap-2 mt-1 mb-3">
            <span className="text-[9px] uppercase font-bold px-2 py-0.5 rounded-full border"
              style={{
                color: GAIN_COLORS[model.characteristics.gain] ?? '#a1a1aa',
                borderColor: GAIN_COLORS[model.characteristics.gain] ?? '#a1a1aa',
              }}>
              {model.characteristics.gain} gain
            </span>
            <span className="text-[9px] uppercase font-bold px-2 py-0.5 rounded-full border"
              style={{
                color: TONE_COLORS[model.characteristics.tone] ?? '#a1a1aa',
                borderColor: TONE_COLORS[model.characteristics.tone] ?? '#a1a1aa',
              }}>
              {model.characteristics.tone}
            </span>
            {model.characteristics.character.slice(0, 3).map(c => (
              <span key={c} className="text-[8px] text-text-muted uppercase px-1.5 py-0.5 rounded-full border border-dark-border/50">
                {c}
              </span>
            ))}
          </div>
        )}
        {model?.description && (
          <p className="text-[9px] text-text-muted text-center mb-2">{model.description}</p>
        )}
      </section>

      {/* Drive Section */}
      {driveParams.length > 0 && (
        <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
          <SectionHeader size="sm" color={ACCENT} title="Drive" />
          <div className="flex justify-around items-end">
            {driveParams.map(key => {
              const schema = params[key];
              return (
                <Knob
                  key={key}
                  value={getParam(effect, key, schema?.default ?? 50)}
                  min={schema?.min ?? 0}
                  max={schema?.max ?? 100}
                  onChange={(v) => onUpdateParameter(key, v)}
                  label={schema?.name ?? key}
                  color={ACCENT}
                  formatValue={(v) => `${Math.round(v)}%`}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* EQ Section */}
      {eqParams.length > 0 && (
        <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
          <SectionHeader size="sm" color={ACCENT} title="Tone" />
          <div className="flex justify-around items-end flex-wrap gap-y-4">
            {eqParams.map(key => {
              const schema = params[key];
              return (
                <Knob
                  key={key}
                  value={getParam(effect, key, schema?.default ?? 50)}
                  min={schema?.min ?? 0}
                  max={schema?.max ?? 100}
                  onChange={(v) => onUpdateParameter(key, v)}
                  label={schema?.name ?? key}
                  color={ACCENT}
                  formatValue={(v) => `${Math.round(v)}%`}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* Output + Mix Section */}
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="sm" color={ACCENT} title="Output" />
        <div className="flex justify-around items-end">
          {outputParams.map(key => {
            const schema = params[key];
            return (
              <Knob
                key={key}
                value={getParam(effect, key, schema?.default ?? 50)}
                min={schema?.min ?? 0}
                max={schema?.max ?? 100}
                onChange={(v) => onUpdateParameter(key, v)}
                label={schema?.name ?? key}
                color={ACCENT}
                formatValue={(v) => `${Math.round(v)}%`}
              />
            );
          })}
          {mixParams.map(key => {
            const schema = params[key];
            return (
              <Knob
                key={key}
                value={getParam(effect, key, schema?.default ?? 100)}
                min={schema?.min ?? 0}
                max={schema?.max ?? 100}
                onChange={(v) => onUpdateParameter(key, v)}
                label="Neural Mix"
                color={ACCENT}
                formatValue={(v) => `${Math.round(v)}%`}
              />
            );
          })}
          <Knob
            value={effect.wet}
            min={0}
            max={100}
            onChange={onUpdateWet}
            label="Dry/Wet"
            color={ACCENT}
            formatValue={(v) => `${Math.round(v)}%`}
          />
        </div>
      </section>
    </div>
  );
};
