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

import React, { useMemo } from 'react';
import { useEffectAnalyser } from '@hooks/useEffectAnalyser';
import { EffectOscilloscope } from '../EffectVisualizer';
import { Knob } from '@components/controls/Knob';
import { SectionHeader, getParam, type VisualEffectEditorProps } from './shared';
import { GUITARML_MODEL_REGISTRY } from '@constants/guitarMLRegistry';
import type { NeuralModelInfo } from '@typedefs/pedalboard';

const ACCENT = '#a855f7'; // Purple for neural effects

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
}) => {
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  // Find the model info from the registry
  const modelIndex = effect.neuralModelIndex ?? 0;
  const model: NeuralModelInfo | undefined = GUITARML_MODEL_REGISTRY[modelIndex];
  const params = model?.parameters ?? {};
  const paramKeys = useMemo(() => Object.keys(params), [params]);

  // Group params: drive section, eq section, output section
  const driveParams = paramKeys.filter(k => k === 'drive' || k === 'condition' || k === 'gain');
  const eqParams = paramKeys.filter(k => ['tone', 'bass', 'mid', 'treble', 'presence'].includes(k));
  const outputParams = paramKeys.filter(k => k === 'level' || k === 'output');
  const mixParams = paramKeys.filter(k => k === 'dryWet');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color={ACCENT} />

      {/* Model Info */}
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color={ACCENT} title={model?.fullName ?? 'Neural Effect'} />
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
