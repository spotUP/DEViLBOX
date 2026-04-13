/**
 * Filter effect editors: AutoFilter, Compressor, EQ3, Filter, DubFilter,
 * SidechainCompressor, MoogFilter
 */

import React from 'react';
import { useEffectAnalyser } from '@hooks/useEffectAnalyser';
import { EffectSpectrum, EffectOscilloscope, GainReductionMeter } from '../EffectVisualizer';
import { Knob } from '@components/controls/Knob';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useShallow } from 'zustand/react/shallow';
import { SectionHeader, getParam, type VisualEffectEditorProps } from './shared';
import { CustomSelect } from '@components/common/CustomSelect';

// ============================================================================
// AUTO FILTER
// ============================================================================

export const AutoFilterEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
}) => {
  const frequency = getParam(effect, 'frequency', 1);
  const baseFrequency = getParam(effect, 'baseFrequency', 200);
  const octaves = getParam(effect, 'octaves', 2.6);
  const type = (effect.parameters?.type as string) || 'sine';
  const { pre, post } = useEffectAnalyser(effect.id, 'fft');

  const WAVE_TYPES = ['sine', 'triangle', 'square', 'sawtooth'] as const;

  return (
    <div className="space-y-4">
      <EffectSpectrum pre={pre} post={post} color="#eab308" />
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#eab308" title="Auto Filter" />
        <div className="flex justify-center gap-2 mb-4">
          {WAVE_TYPES.map((w) => (
            <button key={w} onClick={() => onUpdateParameter('type', w)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all capitalize ${
                type === w ? 'bg-yellow-700/70 border-yellow-500 text-yellow-100' : 'bg-black/40 border-dark-border text-text-muted hover:border-yellow-700'
              }`}>{w === 'sawtooth' ? 'saw' : w}</button>
          ))}
        </div>
        <div className="flex justify-around items-end">
          <Knob
            value={frequency}
            min={0}
            max={20}
            onChange={(v) => onUpdateParameter('frequency', v)}
            label="Rate"
            size="sm"
            color="#eab308"
            formatValue={(v) => `${v.toFixed(1)}Hz`}
          />
          <Knob
            value={baseFrequency}
            min={20}
            max={2000}
            onChange={(v) => onUpdateParameter('baseFrequency', v)}
            label="Base Freq"
            size="sm"
            color="#eab308"
            formatValue={(v) => `${Math.round(v)}Hz`}
          />
          <Knob
            value={octaves}
            min={0}
            max={8}
            onChange={(v) => onUpdateParameter('octaves', v)}
            label="Octaves"
            size="sm"
            color="#eab308"
            formatValue={(v) => v.toFixed(1)}
          />
          <Knob
            value={effect.wet}
            min={0}
            max={100}
            onChange={onUpdateWet}
            label="Mix"
            size="sm"
            color="#fbbf24"
            formatValue={(v) => `${Math.round(v)}%`}
          />
        </div>
      </section>
    </div>
  );
};

// ============================================================================
// COMPRESSOR
// ============================================================================

export const CompressorEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
}) => {
  const threshold = getParam(effect, 'threshold', -24);
  const ratio = getParam(effect, 'ratio', 12);
  const attack = getParam(effect, 'attack', 0.003);
  const release = getParam(effect, 'release', 0.25);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#10b981" />
      <GainReductionMeter pre={pre} post={post} />
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#10b981" title="Compressor" />
        <div className="flex justify-around items-end">
          <Knob
            value={threshold}
            min={-100}
            max={0}
            onChange={(v) => onUpdateParameter('threshold', v)}
            label="Threshold"
            size="sm"
            color="#10b981"
            formatValue={(v) => `${Math.round(v)}dB`}
          />
          <Knob
            value={ratio}
            min={1}
            max={20}
            onChange={(v) => onUpdateParameter('ratio', v)}
            label="Ratio"
            size="sm"
            color="#10b981"
            formatValue={(v) => `${v.toFixed(1)}:1`}
          />
          <Knob
            value={attack}
            min={0}
            max={1}
            onChange={(v) => onUpdateParameter('attack', v)}
            label="Attack"
            size="sm"
            color="#10b981"
            formatValue={(v) => `${Math.round(v * 1000)}ms`}
          />
          <Knob
            value={release}
            min={0}
            max={1}
            onChange={(v) => onUpdateParameter('release', v)}
            label="Release"
            size="sm"
            color="#10b981"
            formatValue={(v) => `${Math.round(v * 1000)}ms`}
          />
        </div>
      </section>
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <div className="flex justify-center">
          <Knob
            value={effect.wet}
            min={0}
            max={100}
            onChange={onUpdateWet}
            label="Mix"
            color="#34d399"
            formatValue={(v) => `${Math.round(v)}%`}
          />
        </div>
      </section>
    </div>
  );
};

// ============================================================================
// EQ3 (3-Band EQ)
// ============================================================================

export const EQ3Editor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
}) => {
  const low = getParam(effect, 'low', 0);
  const mid = getParam(effect, 'mid', 0);
  const high = getParam(effect, 'high', 0);
  const lowFrequency = getParam(effect, 'lowFrequency', 400);
  const highFrequency = getParam(effect, 'highFrequency', 2500);
  const { pre, post } = useEffectAnalyser(effect.id, 'fft');

  return (
    <div className="space-y-4">
      <EffectSpectrum pre={pre} post={post} color="#3b82f6" />
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#3b82f6" title="3-Band EQ" />
        <div className="flex justify-around items-end">
          <Knob
            value={low}
            min={-20}
            max={20}
            onChange={(v) => onUpdateParameter('low', v)}
            label="Low"
            color="#ef4444"
            bipolar
            formatValue={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}dB`}
          />
          <Knob
            value={mid}
            min={-20}
            max={20}
            onChange={(v) => onUpdateParameter('mid', v)}
            label="Mid"
            color="#eab308"
            bipolar
            formatValue={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}dB`}
          />
          <Knob
            value={high}
            min={-20}
            max={20}
            onChange={(v) => onUpdateParameter('high', v)}
            label="High"
            color="#3b82f6"
            bipolar
            formatValue={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}dB`}
          />
        </div>
      </section>
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#6b7280" title="Crossover" />
        <div className="flex justify-around items-end">
          <Knob
            value={lowFrequency}
            min={20}
            max={1000}
            onChange={(v) => onUpdateParameter('lowFrequency', v)}
            label="Low Freq"
            size="sm"
            color="#6b7280"
            formatValue={(v) => `${Math.round(v)}Hz`}
          />
          <Knob
            value={highFrequency}
            min={1000}
            max={10000}
            onChange={(v) => onUpdateParameter('highFrequency', v)}
            label="High Freq"
            size="sm"
            color="#6b7280"
            formatValue={(v) => `${(v / 1000).toFixed(1)}kHz`}
          />
          <Knob
            value={effect.wet}
            min={0}
            max={100}
            onChange={onUpdateWet}
            label="Mix"
            size="sm"
            color="#9ca3af"
            formatValue={(v) => `${Math.round(v)}%`}
          />
        </div>
      </section>
    </div>
  );
};

// ============================================================================
// FILTER
// ============================================================================

export const FilterEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
}) => {
  const frequency = getParam(effect, 'frequency', 350);
  const Q = getParam(effect, 'Q', 1);
  const gain = getParam(effect, 'gain', 0);
  const type = (effect.parameters?.type as string) || 'lowpass';
  const rolloff = Number(effect.parameters?.rolloff ?? -12);
  const { pre, post } = useEffectAnalyser(effect.id, 'fft');

  const FILTER_TYPES = ['lowpass', 'highpass', 'bandpass', 'notch', 'allpass', 'peaking', 'lowshelf', 'highshelf'] as const;
  const TYPE_SHORT: Record<string, string> = { lowpass: 'LP', highpass: 'HP', bandpass: 'BP', notch: 'Notch', allpass: 'AP', peaking: 'Peak', lowshelf: 'LoS', highshelf: 'HiS' };
  const ROLLOFFS = [-12, -24, -48, -96] as const;

  return (
    <div className="space-y-4">
      <EffectSpectrum pre={pre} post={post} color="#f97316" />
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#f97316" title="Filter" />
        <div className="grid grid-cols-4 gap-1.5 mb-3">
          {FILTER_TYPES.map((t) => (
            <button key={t} onClick={() => onUpdateParameter('type', t)}
              className={`px-2 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                type === t ? 'bg-orange-700/70 border-orange-500 text-orange-100' : 'bg-black/40 border-dark-border text-text-muted hover:border-orange-700'
              }`}>{TYPE_SHORT[t] || t}</button>
          ))}
        </div>
        <div className="flex justify-center gap-2 mb-4">
          {ROLLOFFS.map((r) => (
            <button key={r} onClick={() => onUpdateParameter('rolloff', r)}
              className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all ${
                rolloff === r ? 'bg-orange-700/70 border-orange-500 text-orange-100' : 'bg-black/40 border-dark-border text-text-muted hover:border-orange-700'
              }`}>{r}dB</button>
          ))}
        </div>
        <div className="flex justify-around items-end">
          <Knob
            value={frequency}
            min={20}
            max={20000}
            onChange={(v) => onUpdateParameter('frequency', v)}
            label="Frequency"
            color="#f97316"
            formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}kHz` : `${Math.round(v)}Hz`}
          />
          <Knob
            value={Q}
            min={0.001}
            max={100}
            onChange={(v) => onUpdateParameter('Q', v)}
            label="Q"
            color="#f97316"
            formatValue={(v) => v.toFixed(1)}
          />
          <Knob
            value={gain}
            min={-40}
            max={40}
            onChange={(v) => onUpdateParameter('gain', v)}
            label="Gain"
            color="#f97316"
            bipolar
            formatValue={(v) => `${v > 0 ? '+' : ''}${Math.round(v)}dB`}
          />
        </div>
      </section>
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <div className="flex justify-center">
          <Knob
            value={effect.wet}
            min={0}
            max={100}
            onChange={onUpdateWet}
            label="Mix"
            color="#fb923c"
            formatValue={(v) => `${Math.round(v)}%`}
          />
        </div>
      </section>
    </div>
  );
};

// ============================================================================
// DUB FILTER
// ============================================================================

export const DubFilterEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
}) => {
  const cutoff = getParam(effect, 'cutoff', 20);
  const resonance = getParam(effect, 'resonance', 10);
  const gain = getParam(effect, 'gain', 1);
  const { pre, post } = useEffectAnalyser(effect.id, 'fft');

  return (
    <div className="space-y-4">
      <EffectSpectrum pre={pre} post={post} color="#22c55e" />
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#22c55e" title="Dub Filter" />
        <div className="flex justify-around items-end">
          <Knob
            value={cutoff}
            min={20}
            max={10000}
            onChange={(v) => onUpdateParameter('cutoff', v)}
            label="Cutoff"
            color="#22c55e"
            formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}Hz`}
          />
          <Knob
            value={resonance}
            min={0}
            max={100}
            onChange={(v) => onUpdateParameter('resonance', v)}
            label="Resonance"
            color="#22c55e"
            formatValue={(v) => `${Math.round(v)}%`}
          />
          <Knob
            value={gain}
            min={0.5}
            max={2}
            onChange={(v) => onUpdateParameter('gain', v)}
            label="Drive"
            color="#22c55e"
            formatValue={(v) => `${v.toFixed(2)}x`}
          />
        </div>
      </section>
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <div className="flex justify-center">
          <Knob
            value={effect.wet}
            min={0}
            max={100}
            onChange={onUpdateWet}
            label="Mix"
            color="#4ade80"
            formatValue={(v) => `${Math.round(v)}%`}
          />
        </div>
      </section>
    </div>
  );
};

// ============================================================================
// SIDECHAIN COMPRESSOR
// ============================================================================

export const SidechainCompressorEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
}) => {
  const threshold = getParam(effect, 'threshold', -24);
  const ratio = getParam(effect, 'ratio', 4);
  const attack = getParam(effect, 'attack', 0.003);
  const release = getParam(effect, 'release', 0.25);
  const knee = getParam(effect, 'knee', 6);
  const sidechainGain = getParam(effect, 'sidechainGain', 100);
  const sidechainSource = getParam(effect, 'sidechainSource', -1);
  const scFreq = getParam(effect, 'scFreq', 0);
  const scQ = getParam(effect, 'scQ', 1);
  const scFilterType = String(effect.parameters?.scFilterType ?? 'lowpass');
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  const channelCount = useTrackerStore(s => s.patterns[0]?.channels.length ?? 8);
  const channelNames = useTrackerStore(useShallow(s =>
    s.patterns[0]?.channels.map((ch: { name?: string }, i: number) => ch.name || `CH ${i + 1}`) ?? []
  ));

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#10b981" />
      <GainReductionMeter pre={pre} post={post} />
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#10b981" title="Compressor" />
        <div className="flex justify-around items-end">
          <Knob
            value={threshold}
            min={-60}
            max={0}
            onChange={(v) => onUpdateParameter('threshold', v)}
            label="Threshold"
            color="#10b981"
            formatValue={(v) => `${Math.round(v)}dB`}
          />
          <Knob
            value={ratio}
            min={1}
            max={20}
            onChange={(v) => onUpdateParameter('ratio', v)}
            label="Ratio"
            color="#10b981"
            formatValue={(v) => `${v.toFixed(1)}:1`}
          />
          <Knob
            value={knee}
            min={0}
            max={40}
            onChange={(v) => onUpdateParameter('knee', v)}
            label="Knee"
            color="#10b981"
            formatValue={(v) => `${Math.round(v)}dB`}
          />
        </div>
      </section>
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#34d399" title="Envelope & Sidechain" />
        <div className="mb-3">
          <label className="block text-xs text-text-muted mb-1.5">Sidechain Source</label>
          <CustomSelect
            value={String(Math.round(sidechainSource))}
            onChange={(v) => onUpdateParameter('sidechainSource', Number(v))}
            options={[
              { value: '-1', label: 'Self (Internal)' },
              ...Array.from({ length: channelCount }, (_, i) => ({
                value: String(i),
                label: channelNames[i] || `CH ${i + 1}`,
              })),
            ]}
            className="w-full bg-black/60 border border-dark-border rounded-lg px-3 py-1.5 text-sm text-text-primary focus:border-emerald-500 focus:outline-none"
          />
        </div>
        <div className="flex justify-around items-end">
          <Knob
            value={attack}
            min={0.001}
            max={0.5}
            onChange={(v) => onUpdateParameter('attack', v)}
            label="Attack"
            color="#34d399"
            formatValue={(v) => v >= 0.1 ? `${(v * 1000).toFixed(0)}ms` : `${(v * 1000).toFixed(1)}ms`}
          />
          <Knob
            value={release}
            min={0.01}
            max={1}
            onChange={(v) => onUpdateParameter('release', v)}
            label="Release"
            color="#34d399"
            formatValue={(v) => `${(v * 1000).toFixed(0)}ms`}
          />
          <Knob
            value={sidechainGain}
            min={0}
            max={100}
            onChange={(v) => onUpdateParameter('sidechainGain', v)}
            label="SC Gain"
            color="#34d399"
            formatValue={(v) => `${Math.round(v)}%`}
          />
        </div>
      </section>
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#059669" title="SC Filter" />
        <div className="flex justify-around items-end">
          <div className="flex flex-col items-center gap-1">
            <CustomSelect
              value={scFilterType}
              onChange={(v) => onUpdateParameter('scFilterType', v)}
              options={[
                { value: 'lowpass', label: 'Low Pass' },
                { value: 'highpass', label: 'High Pass' },
                { value: 'bandpass', label: 'Band Pass' },
              ]}
              className="w-24 bg-black/60 border border-dark-border rounded-lg px-2 py-1 text-[10px] text-text-primary"
            />
            <span className="text-[8px] text-text-muted">Type</span>
          </div>
          <Knob
            value={scFreq}
            min={0}
            max={8000}
            onChange={(v) => onUpdateParameter('scFreq', v)}
            label="SC Freq"
            color="#059669"
            formatValue={(v) => v === 0 ? 'OFF' : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)} Hz`}
          />
          <Knob
            value={scQ}
            min={0.1}
            max={10}
            onChange={(v) => onUpdateParameter('scQ', v)}
            label="SC Q"
            color="#059669"
            formatValue={(v) => v.toFixed(1)}
          />
        </div>
      </section>
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <div className="flex justify-center">
          <Knob
            value={effect.wet}
            min={0}
            max={100}
            onChange={onUpdateWet}
            label="Mix"
            color="#6ee7b7"
            formatValue={(v) => `${Math.round(v)}%`}
          />
        </div>
      </section>
    </div>
  );
};

// ============================================================================
// MOOG FILTER (WASM)
// ============================================================================

const MOOG_MODEL_NAMES = ['Hyperion', 'Krajeski', 'Stilson', 'Microtracker', 'Improved', 'Oberheim'];
const MOOG_MODE_NAMES = ['LP2', 'LP4', 'BP2', 'BP4', 'HP2', 'HP4', 'Notch'];

export const MoogFilterEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
}) => {
  const cutoff = getParam(effect, 'cutoff', 1000);
  const resonance = getParam(effect, 'resonance', 10);
  const drive = getParam(effect, 'drive', 1);
  const model = getParam(effect, 'model', 0);
  const filterMode = getParam(effect, 'filterMode', 1);
  const { pre, post } = useEffectAnalyser(effect.id, 'fft');

  return (
    <div className="space-y-4">
      <EffectSpectrum pre={pre} post={post} color="#f59e0b" />
      {/* Model & Mode */}
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#f59e0b" title="Model" />
        <div className="grid grid-cols-3 gap-1 mb-3">
          {MOOG_MODEL_NAMES.map((name, i) => (
            <button
              key={i}
              onClick={() => onUpdateParameter('model', i)}
              className={`px-2 py-1.5 text-xs font-medium rounded transition-colors ${
                Math.round(model) === i
                  ? 'bg-amber-600 text-text-primary'
                  : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
        {Math.round(model) === 0 && (
          <>
            <SectionHeader size="lg" color="#f59e0b" title="Filter Mode (Hyperion)" />
            <div className="grid grid-cols-4 gap-1">
              {MOOG_MODE_NAMES.map((name, i) => (
                <button
                  key={i}
                  onClick={() => onUpdateParameter('filterMode', i)}
                  className={`px-2 py-1.5 text-xs font-medium rounded transition-colors ${
                    Math.round(filterMode) === i
                      ? 'bg-amber-600 text-text-primary'
                      : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover'
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </>
        )}
      </section>
      {/* Filter Controls */}
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#f59e0b" title="Filter" />
        <div className="flex justify-around items-end">
          <Knob
            value={cutoff}
            min={20}
            max={20000}
            onChange={(v) => onUpdateParameter('cutoff', v)}
            label="Cutoff"
            color="#f59e0b"
            formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}Hz`}
          />
          <Knob
            value={resonance}
            min={0}
            max={100}
            onChange={(v) => onUpdateParameter('resonance', v)}
            label="Resonance"
            color="#f59e0b"
            formatValue={(v) => `${Math.round(v)}%`}
          />
          <Knob
            value={drive}
            min={0.1}
            max={4}
            onChange={(v) => onUpdateParameter('drive', v)}
            label="Drive"
            color="#f59e0b"
            formatValue={(v) => `${v.toFixed(1)}x`}
          />
        </div>
      </section>
      {/* Mix */}
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <div className="flex justify-center">
          <Knob
            value={effect.wet}
            min={0}
            max={100}
            onChange={onUpdateWet}
            label="Mix"
            color="#fbbf24"
            formatValue={(v) => `${Math.round(v)}%`}
          />
        </div>
      </section>
    </div>
  );
};
