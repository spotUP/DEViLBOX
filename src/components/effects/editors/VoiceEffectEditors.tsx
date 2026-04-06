/**
 * Voice effect editors: Vocoder, AutoTune.
 *
 * Vocoder mirrors the DJ-view vocoder (preset dropdown, carrier-type buttons,
 * bands/filtersPerBand, formant, freq, reaction time) so the master/instrument
 * effect has full feature parity with the existing vocoder UI.
 *
 * AutoTune exposes key + scale + strength + speed for real-time pitch
 * correction, with a dedicated key/scale picker.
 */

import React from 'react';
import { Knob } from '@components/controls/Knob';
import { SectionHeader, getParam, type VisualEffectEditorProps } from './shared';
import { VOCODER_EFFECT_PRESETS } from '@engine/effects/VocoderEffect';
import type { CarrierType as StoreCarrierType } from '@/stores/useVocoderStore';

// ============================================================================
// VOCODER
// ============================================================================

const CARRIER_LABELS = ['Saw', 'Square', 'Noise', 'Chord'];
const CARRIER_NAME_TO_INT: Record<StoreCarrierType, number> = {
  saw: 0, square: 1, noise: 2, chord: 3,
};

const SOURCE_LABELS = [
  { value: 'self', label: 'Chain' },
  { value: 'mic',  label: 'Mic' },
];

/** Get a string parameter with default */
function getStringParam(effect: { parameters: Record<string, number | string> }, key: string, def: string): string {
  const v = effect.parameters[key];
  return typeof v === 'string' ? v : def;
}

export const VocoderEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
}) => {
  const presetName = getStringParam(effect, 'preset', '');
  const source = getStringParam(effect, 'source', 'self');
  const bands = getParam(effect, 'bands', 32);
  const filtersPerBand = getParam(effect, 'filtersPerBand', 6);
  const carrierType = getParam(effect, 'carrierType', 3);
  const carrierFreq = getParam(effect, 'carrierFreq', 130.81);
  const formantShift = getParam(effect, 'formantShift', 1.0);
  const reactionTime = getParam(effect, 'reactionTime', 30); // stored as ms

  /** When a preset is chosen, push all of its values into the effect params */
  const applyPreset = (name: string) => {
    const preset = VOCODER_EFFECT_PRESETS.find((p) => p.name === name);
    if (!preset) return;
    const p = preset.params;
    onUpdateParameter('preset', name);
    onUpdateParameter('bands', p.bands);
    onUpdateParameter('filtersPerBand', p.filtersPerBand);
    onUpdateParameter('carrierType', CARRIER_NAME_TO_INT[p.carrierType]);
    onUpdateParameter('carrierFreq', p.carrierFreq);
    onUpdateParameter('formantShift', p.formantShift);
    onUpdateParameter('reactionTime', Math.round(p.reactionTime * 1000));
  };

  /** Tweaking any individual param clears the preset name (custom). */
  const tweak = (key: string, value: number | string) => {
    if (presetName) onUpdateParameter('preset', '');
    onUpdateParameter(key, value);
  };

  return (
    <div className="space-y-4">
      {/* Preset + Source */}
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#a855f7" title="Voice Preset" />
        <div className="grid grid-cols-4 gap-1 mb-3">
          {VOCODER_EFFECT_PRESETS.map((p) => (
            <button
              key={p.name}
              onClick={() => applyPreset(p.name)}
              className={`px-2 py-1.5 text-[11px] font-bold rounded transition-colors ${
                presetName === p.name
                  ? 'bg-purple-600 text-text-primary'
                  : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover'
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>

        <SectionHeader size="lg" color="#a855f7" title="Modulator Source" />
        <div className="grid grid-cols-2 gap-1">
          {SOURCE_LABELS.map((s) => (
            <button
              key={s.value}
              onClick={() => onUpdateParameter('source', s.value)}
              className={`px-2 py-1.5 text-xs font-medium rounded transition-colors ${
                source === s.value
                  ? 'bg-purple-600 text-text-primary'
                  : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover'
              }`}
              title={s.value === 'self' ? 'Chain audio modulates the carrier' : 'Microphone input modulates the carrier'}
            >
              {s.label}
            </button>
          ))}
        </div>
      </section>

      {/* Carrier */}
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#a855f7" title="Carrier" />
        <div className="grid grid-cols-4 gap-1 mb-3">
          {CARRIER_LABELS.map((name, i) => (
            <button
              key={name}
              onClick={() => tweak('carrierType', i)}
              className={`px-2 py-1.5 text-xs font-medium rounded transition-colors ${
                Math.round(carrierType) === i
                  ? 'bg-purple-600 text-text-primary'
                  : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="flex justify-around items-end">
          <Knob
            value={carrierFreq}
            min={20}
            max={2000}
            onChange={(v) => tweak('carrierFreq', v)}
            label="Freq"
            color="#a855f7"
            formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(2)}k` : `${v.toFixed(1)}Hz`}
          />
          <Knob
            value={formantShift}
            min={0.25}
            max={4.0}
            onChange={(v) => tweak('formantShift', v)}
            label="Formant"
            color="#a855f7"
            formatValue={(v) => `${v.toFixed(2)}x`}
          />
        </div>
      </section>

      {/* Filterbank */}
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#a855f7" title="Filterbank" />
        <div className="flex justify-around items-end">
          <Knob
            value={bands}
            min={12}
            max={64}
            onChange={(v) => tweak('bands', Math.round(v))}
            label="Bands"
            color="#a855f7"
            formatValue={(v) => `${Math.round(v)}`}
          />
          <Knob
            value={filtersPerBand}
            min={1}
            max={8}
            onChange={(v) => tweak('filtersPerBand', Math.round(v))}
            label="Order"
            color="#a855f7"
            formatValue={(v) => `${Math.round(v)}`}
          />
          <Knob
            value={reactionTime}
            min={2}
            max={500}
            onChange={(v) => tweak('reactionTime', Math.round(v))}
            label="Reaction"
            color="#a855f7"
            formatValue={(v) => `${Math.round(v)}ms`}
          />
        </div>
      </section>

      {/* Mix */}
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <div className="flex justify-center">
          <Knob
            value={effect.wet}
            min={0}
            max={100}
            onChange={onUpdateWet}
            label="Mix"
            color="#c084fc"
            formatValue={(v) => `${Math.round(v)}%`}
          />
        </div>
      </section>
    </div>
  );
};

// ============================================================================
// AUTO-TUNE
// ============================================================================

const KEY_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SCALE_OPTIONS = ['major', 'minor', 'chromatic', 'pentatonic', 'blues'] as const;

export const AutoTuneEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
}) => {
  const key = getParam(effect, 'key', 0);
  const scale = getStringParam(effect, 'scale', 'major');
  const strength = getParam(effect, 'strength', 100);
  const speed = getParam(effect, 'speed', 70);

  return (
    <div className="space-y-4">
      {/* Key */}
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#ec4899" title="Key" />
        <div className="grid grid-cols-6 gap-1">
          {KEY_NAMES.map((name, i) => (
            <button
              key={name}
              onClick={() => onUpdateParameter('key', i)}
              className={`px-2 py-1.5 text-xs font-medium rounded transition-colors ${
                Math.round(key) === i
                  ? 'bg-pink-600 text-text-primary'
                  : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      </section>

      {/* Scale */}
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#ec4899" title="Scale" />
        <div className="grid grid-cols-5 gap-1">
          {SCALE_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => onUpdateParameter('scale', s)}
              className={`px-2 py-1.5 text-[11px] font-bold uppercase rounded transition-colors ${
                scale === s
                  ? 'bg-pink-600 text-text-primary'
                  : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </section>

      {/* Correction */}
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#ec4899" title="Correction" />
        <div className="flex justify-around items-end">
          <Knob
            value={strength}
            min={0}
            max={100}
            onChange={(v) => onUpdateParameter('strength', v)}
            label="Strength"
            color="#ec4899"
            formatValue={(v) => `${Math.round(v)}%`}
          />
          <Knob
            value={speed}
            min={0}
            max={100}
            onChange={(v) => onUpdateParameter('speed', v)}
            label="Speed"
            color="#ec4899"
            formatValue={(v) => `${Math.round(v)}%`}
          />
        </div>
      </section>

      {/* Mix */}
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <div className="flex justify-center">
          <Knob
            value={effect.wet}
            min={0}
            max={100}
            onChange={onUpdateWet}
            label="Mix"
            color="#f472b6"
            formatValue={(v) => `${Math.round(v)}%`}
          />
        </div>
      </section>
    </div>
  );
};
