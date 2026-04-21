/**
 * EQModReverbEditors.tsx — Zynthian-ported EQ, modulation, reverb, delay, stereo, and creative effect editors
 */

import React from 'react';
import { useEffectAnalyser } from '@hooks/useEffectAnalyser';
import { EffectOscilloscope, EffectSpectrum } from '../EffectVisualizer';
import { EQCurve, type EQBand } from '../EQCurve';
import { EQSlider } from '../EQSlider';
import { Knob } from '@components/controls/Knob';
import { SectionHeader, getParam, renderBpmSync, type VisualEffectEditorProps } from './shared';

const Section: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
    {children}
  </section>
);

// ============================================================================
// PARAMETRIC EQ (4-band)
// ============================================================================

export const ParametricEQEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const bands = [
    { freq: 'b1Freq', gain: 'b1Gain', q: 'b1Q', label: 'Band 1', defF: 100, color: '#ef4444' },
    { freq: 'b2Freq', gain: 'b2Gain', q: 'b2Q', label: 'Band 2', defF: 500, color: '#f97316' },
    { freq: 'b3Freq', gain: 'b3Gain', q: 'b3Q', label: 'Band 3', defF: 2000, color: '#eab308' },
    { freq: 'b4Freq', gain: 'b4Gain', q: 'b4Q', label: 'Band 4', defF: 8000, color: '#22c55e' },
  ];
  const { pre, post } = useEffectAnalyser(effect.id, 'fft');

  const eqBands: EQBand[] = bands.map(b => ({
    type: 'peaking' as const,
    freq: getParam(effect, b.freq, b.defF),
    gain: getParam(effect, b.gain, 0),
    q: getParam(effect, b.q, 0.7),
  }));

  return (
    <div className="space-y-4">
      <EQCurve bands={eqBands} color="#f97316" />
      <EffectSpectrum pre={pre} post={post} color="#f97316" height={60} />
      {bands.map((b) => (
        <Section key={b.freq}>
          <SectionHeader size="lg" color={b.color} title={b.label} />
          <div className="flex justify-around items-end">
            <Knob value={getParam(effect, b.freq, b.defF)} min={20} max={20000}
              onChange={(v) => onUpdateParameter(b.freq, v)} label="Freq" color={b.color}
              formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`} />
            <EQSlider value={getParam(effect, b.gain, 0)} min={-18} max={18}
              onChange={(v) => onUpdateParameter(b.gain, v)} label="Gain" color={b.color} />
            <Knob value={getParam(effect, b.q, 0.7)} min={0.1} max={10}
              onChange={(v) => onUpdateParameter(b.q, v)} label="Q" color={b.color}
              formatValue={(v) => v.toFixed(2)} />
          </div>
        </Section>
      ))}
      <Section>
        <div className="flex justify-center">
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#6b7280" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
    </div>
  );
};

// ============================================================================
// EQ 5-BAND
// ============================================================================

export const EQ5BandEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const { pre, post } = useEffectAnalyser(effect.id, 'fft');

  const eqBands: EQBand[] = [
    { type: 'lowShelf', freq: getParam(effect, 'lowShelfFreq', 100), gain: getParam(effect, 'lowShelfGain', 0), q: 0.7 },
    { type: 'peaking', freq: getParam(effect, 'peak1Freq', 500), gain: getParam(effect, 'peak1Gain', 0), q: getParam(effect, 'peak1Q', 1) },
    { type: 'peaking', freq: getParam(effect, 'peak2Freq', 1500), gain: getParam(effect, 'peak2Gain', 0), q: getParam(effect, 'peak2Q', 1) },
    { type: 'peaking', freq: getParam(effect, 'peak3Freq', 5000), gain: getParam(effect, 'peak3Gain', 0), q: getParam(effect, 'peak3Q', 1) },
    { type: 'highShelf', freq: getParam(effect, 'highShelfFreq', 8000), gain: getParam(effect, 'highShelfGain', 0), q: 0.7 },
  ];

  return (
    <div className="space-y-4">
      <EQCurve bands={eqBands} color="#10b981" />
      <EffectSpectrum pre={pre} post={post} color="#10b981" height={60} />
      <Section>
        <SectionHeader size="lg" color="#10b981" title="Low Shelf" />
        <div className="flex justify-around items-end">
          <Knob value={getParam(effect, 'lowShelfFreq', 100)} min={20} max={500}
            onChange={(v) => onUpdateParameter('lowShelfFreq', v)} label="Freq" color="#059669"
            formatValue={(v) => `${Math.round(v)} Hz`} />
          <EQSlider value={getParam(effect, 'lowShelfGain', 0)} min={-18} max={18}
            onChange={(v) => onUpdateParameter('lowShelfGain', v)} label="Gain" color="#059669" />
        </div>
      </Section>
      <Section>
        <SectionHeader size="lg" color="#10b981" title="Peaks" />
        <div className="flex justify-around items-end flex-wrap gap-y-4">
          {[
            { f: 'peak1Freq', g: 'peak1Gain', q: 'peak1Q', def: 500, c: '#10b981' },
            { f: 'peak2Freq', g: 'peak2Gain', q: 'peak2Q', def: 1500, c: '#34d399' },
            { f: 'peak3Freq', g: 'peak3Gain', q: 'peak3Q', def: 5000, c: '#6ee7b7' },
          ].map((p) => (
            <React.Fragment key={p.f}>
              <Knob value={getParam(effect, p.f, p.def)} min={20} max={20000}
                onChange={(v) => onUpdateParameter(p.f, v)} label="Freq" color={p.c}
                formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`} />
              <EQSlider value={getParam(effect, p.g, 0)} min={-18} max={18}
                onChange={(v) => onUpdateParameter(p.g, v)} label="Gain" color={p.c} />
            </React.Fragment>
          ))}
        </div>
      </Section>
      <Section>
        <SectionHeader size="lg" color="#6ee7b7" title="High Shelf" />
        <div className="flex justify-around items-end">
          <Knob value={getParam(effect, 'highShelfFreq', 8000)} min={1000} max={18000}
            onChange={(v) => onUpdateParameter('highShelfFreq', v)} label="Freq" color="#6ee7b7"
            formatValue={(v) => `${(v / 1000).toFixed(1)}k`} />
          <EQSlider value={getParam(effect, 'highShelfGain', 0)} min={-18} max={18}
            onChange={(v) => onUpdateParameter('highShelfGain', v)} label="Gain" color="#6ee7b7" />
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#6b7280" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
    </div>
  );
};

// ============================================================================
// ZAM EQ2
// ============================================================================

export const ZamEQ2Editor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const { pre, post } = useEffectAnalyser(effect.id, 'fft');

  const bwToQ = (bw: number) => 1 / (2 * Math.sinh(Math.log(2) / 2 * bw));
  const eqBands: EQBand[] = [
    { type: 'peaking', freq: getParam(effect, 'lowFreq', 200), gain: getParam(effect, 'lowGain', 0), q: bwToQ(getParam(effect, 'lowBw', 1)) },
    { type: 'peaking', freq: getParam(effect, 'highFreq', 4000), gain: getParam(effect, 'highGain', 0), q: bwToQ(getParam(effect, 'highBw', 1)) },
  ];

  return (
    <div className="space-y-4">
      <EQCurve bands={eqBands} color="#0ea5e9" />
      <EffectSpectrum pre={pre} post={post} color="#0ea5e9" height={60} />
      <Section>
        <SectionHeader size="lg" color="#0ea5e9" title="Low Band" />
        <div className="flex justify-around items-end">
          <Knob value={getParam(effect, 'lowFreq', 200)} min={20} max={2000}
            onChange={(v) => onUpdateParameter('lowFreq', v)} label="Freq" color="#0284c7"
            formatValue={(v) => `${Math.round(v)} Hz`} />
          <EQSlider value={getParam(effect, 'lowGain', 0)} min={-18} max={18}
            onChange={(v) => onUpdateParameter('lowGain', v)} label="Gain" color="#0284c7" />
          <Knob value={getParam(effect, 'lowBw', 1)} min={0.1} max={6}
            onChange={(v) => onUpdateParameter('lowBw', v)} label="BW" color="#0ea5e9"
            formatValue={(v) => v.toFixed(1)} />
        </div>
      </Section>
      <Section>
        <SectionHeader size="lg" color="#38bdf8" title="High Band" />
        <div className="flex justify-around items-end">
          <Knob value={getParam(effect, 'highFreq', 4000)} min={500} max={16000}
            onChange={(v) => onUpdateParameter('highFreq', v)} label="Freq" color="#38bdf8"
            formatValue={(v) => `${(v / 1000).toFixed(1)}k`} />
          <EQSlider value={getParam(effect, 'highGain', 0)} min={-18} max={18}
            onChange={(v) => onUpdateParameter('highGain', v)} label="Gain" color="#38bdf8" />
          <Knob value={getParam(effect, 'highBw', 1)} min={0.1} max={6}
            onChange={(v) => onUpdateParameter('highBw', v)} label="BW" color="#7dd3fc"
            formatValue={(v) => v.toFixed(1)} />
        </div>
      </Section>
      <Section>
        <div className="flex justify-center">
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#6b7280" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
    </div>
  );
};

// ============================================================================
// PHONO FILTER
// ============================================================================

export const PhonoFilterEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const mode = Math.round(getParam(effect, 'mode', 0));
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');
  const modes = ['RIAA', 'NAB', 'Columbia', 'IEC'];
  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#a1887f" />
      <Section>
        <SectionHeader size="lg" color="#a1887f" title="Phono Filter" />
        <div className="flex gap-2 mb-4 justify-center">
          {modes.map((label, idx) => (
            <button key={idx} onClick={() => onUpdateParameter('mode', idx)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                mode === idx ? 'bg-amber-700/70 border-amber-500 text-amber-100' : 'bg-black/40 border-dark-border text-text-muted hover:border-amber-700'
              }`}>{label}</button>
          ))}
        </div>
        <div className="flex justify-center">
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#6b7280" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
    </div>
  );
};

// ============================================================================
// DYNAMIC EQ
// ============================================================================

export const DynamicEQEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const { pre, post } = useEffectAnalyser(effect.id, 'fft');

  const eqBands: EQBand[] = [
    { type: 'peaking', freq: getParam(effect, 'processFreq', 1000), gain: getParam(effect, 'maxGain', 0), q: getParam(effect, 'processQ', 1) },
  ];

  return (
    <div className="space-y-4">
      <EQCurve bands={eqBands} color="#8b5cf6" />
      <EffectSpectrum pre={pre} post={post} color="#8b5cf6" height={60} />
      <Section>
        <SectionHeader size="lg" color="#8b5cf6" title="Detection" />
        <div className="flex justify-around items-end">
          <Knob value={getParam(effect, 'detectFreq', 1000)} min={20} max={20000}
            onChange={(v) => onUpdateParameter('detectFreq', v)} label="Detect" color="#8b5cf6"
            formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`} />
          <Knob value={getParam(effect, 'detectQ', 1)} min={0.1} max={10}
            onChange={(v) => onUpdateParameter('detectQ', v)} label="Q" color="#a78bfa" formatValue={(v) => v.toFixed(1)} />
          <Knob value={getParam(effect, 'threshold', -20)} min={-60} max={0}
            onChange={(v) => onUpdateParameter('threshold', v)} label="Thresh" color="#a78bfa"
            formatValue={(v) => `${v.toFixed(0)} dB`} />
        </div>
      </Section>
      <Section>
        <SectionHeader size="lg" color="#a78bfa" title="Processing" />
        <div className="flex justify-around items-end flex-wrap gap-y-4">
          <Knob value={getParam(effect, 'processFreq', 1000)} min={20} max={20000}
            onChange={(v) => onUpdateParameter('processFreq', v)} label="Proc Freq" color="#c4b5fd"
            formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`} />
          <Knob value={getParam(effect, 'processQ', 1)} min={0.1} max={10}
            onChange={(v) => onUpdateParameter('processQ', v)} label="Proc Q" color="#c4b5fd" formatValue={(v) => v.toFixed(1)} />
          <Knob value={getParam(effect, 'maxGain', 0)} min={-18} max={18}
            onChange={(v) => onUpdateParameter('maxGain', v)} label="Max Gain" color="#ddd6fe"
            formatValue={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`} />
        </div>
      </Section>
      <Section>
        <div className="flex justify-around items-end">
          <Knob value={getParam(effect, 'attack', 10)} min={0.1} max={200}
            onChange={(v) => onUpdateParameter('attack', v)} label="Attack" color="#ddd6fe" formatValue={(v) => `${v.toFixed(1)} ms`} />
          <Knob value={getParam(effect, 'release', 100)} min={5} max={2000}
            onChange={(v) => onUpdateParameter('release', v)} label="Release" color="#ede9fe" formatValue={(v) => `${Math.round(v)} ms`} />
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#6b7280" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
    </div>
  );
};

// ============================================================================
// RESONANCE TAMER (Soothe-style automatic resonance suppressor)
// ============================================================================

export const ResonanceTamerEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const { pre, post } = useEffectAnalyser(effect.id, 'fft');
  const amount = getParam(effect, 'amount', 0.35);
  const charStr = typeof effect.parameters.character === 'string'
    ? effect.parameters.character
    : 'transparent';

  return (
    <div className="space-y-4">
      <EffectSpectrum pre={pre} post={post} color="#8b5cf6" height={80} />
      <Section>
        <SectionHeader size="lg" color="#8b5cf6" title="Resonance Tamer" />
        <p className="text-[11px] text-text-muted mb-3">
          Auto-clears fighting frequencies on the master. Add, turn up Amount, done.
        </p>
        <div className="flex justify-around items-end">
          <Knob
            value={amount}
            min={0}
            max={1}
            onChange={(v) => onUpdateParameter('amount', v)}
            label="Amount"
            color="#8b5cf6"
            formatValue={(v) => `${Math.round(v * 100)}%`}
          />
          <Knob
            value={effect.wet}
            min={0}
            max={100}
            onChange={onUpdateWet}
            label="Mix"
            color="#6b7280"
            formatValue={(v) => `${Math.round(v)}%`}
          />
        </div>
      </Section>
      <Section>
        <SectionHeader size="lg" color="#a78bfa" title="Character" />
        <div className="flex gap-2">
          {(['transparent', 'warm', 'bright'] as const).map((c) => (
            <button
              key={c}
              onClick={() => onUpdateParameter('character', c)}
              className={`
                flex-1 px-3 py-2 rounded text-xs font-mono uppercase transition-all
                ${charStr === c
                  ? 'bg-accent-primary/20 text-accent-primary border border-accent-primary'
                  : 'bg-dark-bgTertiary text-text-muted border border-dark-borderLight hover:text-text-secondary'
                }
              `}
              title={
                c === 'transparent' ? 'Narrow notches, fast release, minimal artifact' :
                c === 'warm' ? 'Wider notches, slower release, more aggressive at 2–5 kHz' :
                'Only notch above 3 kHz — tames sibilance and harsh highs'
              }
            >
              {c}
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
};

// ============================================================================
// KUIZA (4-band EQ)
// ============================================================================

export const KuizaEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const { pre, post } = useEffectAnalyser(effect.id, 'fft');

  const eqBands: EQBand[] = [
    { type: 'lowShelf', freq: 200, gain: getParam(effect, 'low', 0), q: 0.7 },
    { type: 'peaking', freq: 800, gain: getParam(effect, 'lowMid', 0), q: 1 },
    { type: 'peaking', freq: 3000, gain: getParam(effect, 'highMid', 0), q: 1 },
    { type: 'highShelf', freq: 8000, gain: getParam(effect, 'high', 0), q: 0.7 },
  ];

  return (
    <div className="space-y-4">
      <EQCurve bands={eqBands} color="#14b8a6" />
      <EffectSpectrum pre={pre} post={post} color="#14b8a6" height={60} />
      <Section>
        <SectionHeader size="lg" color="#14b8a6" title="Kuiza EQ" />
        <div className="flex justify-around items-end">
          <EQSlider value={getParam(effect, 'low', 0)} min={-18} max={18}
            onChange={(v) => onUpdateParameter('low', v)} label="Low" color="#0d9488" />
          <EQSlider value={getParam(effect, 'lowMid', 0)} min={-18} max={18}
            onChange={(v) => onUpdateParameter('lowMid', v)} label="Lo-Mid" color="#14b8a6" />
          <EQSlider value={getParam(effect, 'highMid', 0)} min={-18} max={18}
            onChange={(v) => onUpdateParameter('highMid', v)} label="Hi-Mid" color="#2dd4bf" />
          <EQSlider value={getParam(effect, 'high', 0)} min={-18} max={18}
            onChange={(v) => onUpdateParameter('high', v)} label="High" color="#5eead4" />
        </div>
      </Section>
      <Section>
        <div className="flex justify-around items-end">
          <Knob value={getParam(effect, 'gain', 0)} min={-12} max={12}
            onChange={(v) => onUpdateParameter('gain', v)} label="Gain" color="#99f6e4"
            formatValue={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`} />
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#6b7280" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
    </div>
  );
};

// ============================================================================
// FLANGER
// ============================================================================

export const FlangerEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const rate = getParam(effect, 'rate', 0.3);
  const depth = getParam(effect, 'depth', 70);
  const delay = getParam(effect, 'delay', 5);
  const feedback = getParam(effect, 'feedback', 30);
  const stereo = getParam(effect, 'stereo', 90);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#ec4899" />
      <Section>
        <SectionHeader size="lg" color="#ec4899" title="Flanger" />
        <div className="flex justify-around items-end flex-wrap gap-y-4">
          <Knob value={rate} min={0.01} max={10} onChange={(v) => onUpdateParameter('rate', v)}
            label="Rate" color="#ec4899" formatValue={(v) => `${v.toFixed(2)} Hz`} />
          <Knob value={depth} min={0} max={100} onChange={(v) => onUpdateParameter('depth', v)}
            label="Depth" color="#f472b6" formatValue={(v) => `${Math.round(v)}%`} />
          <Knob value={delay} min={0.1} max={20} onChange={(v) => onUpdateParameter('delay', v)}
            label="Delay" color="#f9a8d4" formatValue={(v) => `${v.toFixed(1)} ms`} />
        </div>
      </Section>
      <Section>
        <div className="flex justify-around items-end">
          <Knob value={feedback} min={-100} max={100} onChange={(v) => onUpdateParameter('feedback', v)}
            label="Feedback" color="#f9a8d4" formatValue={(v) => `${Math.round(v)}%`} />
          <Knob value={stereo} min={0} max={180} onChange={(v) => onUpdateParameter('stereo', v)}
            label="Stereo" color="#fbcfe8" formatValue={(v) => `${Math.round(v)}°`} />
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#6b7280" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
    </div>
  );
};

// ============================================================================
// JUNO CHORUS
// ============================================================================

export const JunoChorusEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const rate = getParam(effect, 'rate', 0.5);
  const depth = getParam(effect, 'depth', 50);
  const mode = getParam(effect, 'mode', 2);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#7c3aed" />
      <Section>
        <SectionHeader size="lg" color="#7c3aed" title="Juno Chorus" />
        <div className="flex justify-around items-end">
          <Knob value={rate} min={0.01} max={5} onChange={(v) => onUpdateParameter('rate', v)}
            label="Rate" color="#7c3aed" formatValue={(v) => `${v.toFixed(2)} Hz`} />
          <Knob value={depth} min={0} max={100} onChange={(v) => onUpdateParameter('depth', v)}
            label="Depth" color="#8b5cf6" formatValue={(v) => `${Math.round(v)}%`} />
          <Knob value={mode} min={1} max={3} step={1} onChange={(v) => onUpdateParameter('mode', Math.round(v))}
            label="Mode" color="#a78bfa" formatValue={(v) => `I${Math.round(v) > 1 ? 'I' : ''}${Math.round(v) > 2 ? 'I' : ''}`} />
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#6b7280" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
    </div>
  );
};

// ============================================================================
// MULTI CHORUS
// ============================================================================

export const MultiChorusEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const rate = getParam(effect, 'rate', 0.5);
  const depth = getParam(effect, 'depth', 0.5);
  const voices = getParam(effect, 'voices', 4);
  const stereoPhase = getParam(effect, 'stereoPhase', 90);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#6366f1" />
      <Section>
        <SectionHeader size="lg" color="#6366f1" title="Multi Chorus" />
        <div className="flex justify-around items-end">
          <Knob value={rate} min={0.01} max={5} onChange={(v) => onUpdateParameter('rate', v)}
            label="Rate" color="#6366f1" formatValue={(v) => `${v.toFixed(2)} Hz`} />
          <Knob value={depth} min={0} max={1} onChange={(v) => onUpdateParameter('depth', v)}
            label="Depth" color="#818cf8" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={voices} min={2} max={8} step={1} onChange={(v) => onUpdateParameter('voices', Math.round(v))}
            label="Voices" color="#a5b4fc" formatValue={(v) => `${Math.round(v)}`} />
          <Knob value={stereoPhase} min={0} max={360} onChange={(v) => onUpdateParameter('stereoPhase', v)}
            label="Stereo" color="#c7d2fe" formatValue={(v) => `${Math.round(v)}°`} />
        </div>
      </Section>
      <Section>
        <div className="flex justify-center">
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#6b7280" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
    </div>
  );
};

// ============================================================================
// CALF PHASER
// ============================================================================

export const CalfPhaserEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const rate = getParam(effect, 'rate', 0.5);
  const depth = getParam(effect, 'depth', 0.7);
  const stages = getParam(effect, 'stages', 6);
  const feedback = getParam(effect, 'feedback', 0.5);
  const stereoPhase = getParam(effect, 'stereoPhase', 90);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#d946ef" />
      <Section>
        <SectionHeader size="lg" color="#d946ef" title="Calf Phaser" />
        <div className="flex justify-around items-end flex-wrap gap-y-4">
          <Knob value={rate} min={0.01} max={10} onChange={(v) => onUpdateParameter('rate', v)}
            label="Rate" color="#d946ef" formatValue={(v) => `${v.toFixed(2)} Hz`} />
          <Knob value={depth} min={0} max={1} onChange={(v) => onUpdateParameter('depth', v)}
            label="Depth" color="#e879f9" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={stages} min={2} max={12} step={2} onChange={(v) => onUpdateParameter('stages', Math.round(v))}
            label="Stages" color="#f0abfc" formatValue={(v) => `${Math.round(v)}`} />
          <Knob value={feedback} min={-1} max={1} onChange={(v) => onUpdateParameter('feedback', v)}
            label="Feedback" color="#f5d0fe" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={stereoPhase} min={0} max={360} onChange={(v) => onUpdateParameter('stereoPhase', v)}
            label="Stereo" color="#fae8ff" formatValue={(v) => `${Math.round(v)}°`} />
        </div>
      </Section>
      <Section>
        <div className="flex justify-center">
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#6b7280" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
    </div>
  );
};

// ============================================================================
// PULSATOR
// ============================================================================

export const PulsatorEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const rate = getParam(effect, 'rate', 2);
  const depth = getParam(effect, 'depth', 0.5);
  const stereoPhase = getParam(effect, 'stereoPhase', 180);
  const offset = getParam(effect, 'offset', 0);
  const waveform = getParam(effect, 'waveform', 0);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  const WAVE_LABELS = ['Sine', 'Tri', 'Square', 'Saw', 'Rev Saw'] as const;

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#f43f5e" />
      <Section>
        <SectionHeader size="lg" color="#f43f5e" title="Pulsator" />
        <div className="flex justify-center gap-2 mb-4">
          {WAVE_LABELS.map((label, i) => (
            <button key={i} onClick={() => onUpdateParameter('waveform', i)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                Math.round(waveform) === i ? 'bg-rose-700/70 border-rose-500 text-rose-100' : 'bg-black/40 border-dark-border text-text-muted hover:border-rose-700'
              }`}>{label}</button>
          ))}
        </div>
        <div className="flex justify-around items-end">
          <Knob value={rate} min={0.1} max={20} onChange={(v) => onUpdateParameter('rate', v)}
            label="Rate" color="#f43f5e" formatValue={(v) => `${v.toFixed(1)} Hz`} />
          <Knob value={depth} min={0} max={1} onChange={(v) => onUpdateParameter('depth', v)}
            label="Depth" color="#fb7185" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={stereoPhase} min={0} max={360} onChange={(v) => onUpdateParameter('stereoPhase', v)}
            label="Stereo" color="#fda4af" formatValue={(v) => `${Math.round(v)}°`} />
          <Knob value={offset} min={-1} max={1} onChange={(v) => onUpdateParameter('offset', v)}
            label="Offset" color="#fecdd3" formatValue={(v) => v.toFixed(2)} />
        </div>
      </Section>
      <Section>
        <div className="flex justify-center">
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#6b7280" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
    </div>
  );
};

// ============================================================================
// RING MOD
// ============================================================================

export const RingModEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const frequency = getParam(effect, 'frequency', 440);
  const lfoRate = getParam(effect, 'lfoRate', 0);
  const lfoDepth = getParam(effect, 'lfoDepth', 0);
  const waveform = getParam(effect, 'waveform', 0);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  const WAVE_LABELS = ['Sine', 'Square', 'Tri', 'Saw'] as const;

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#be185d" />
      <Section>
        <SectionHeader size="lg" color="#be185d" title="Ring Modulator" />
        <div className="flex justify-center gap-2 mb-4">
          {WAVE_LABELS.map((label, i) => (
            <button key={i} onClick={() => onUpdateParameter('waveform', i)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                Math.round(waveform) === i ? 'bg-pink-700/70 border-pink-500 text-pink-100' : 'bg-black/40 border-dark-border text-text-muted hover:border-pink-700'
              }`}>{label}</button>
          ))}
        </div>
        <div className="flex justify-around items-end">
          <Knob value={frequency} min={20} max={5000} onChange={(v) => onUpdateParameter('frequency', v)}
            label="Frequency" color="#be185d" formatValue={(v) => `${Math.round(v)} Hz`} />
          <Knob value={lfoRate} min={0} max={20} onChange={(v) => onUpdateParameter('lfoRate', v)}
            label="LFO Rate" color="#db2777" formatValue={(v) => `${v.toFixed(1)} Hz`} />
          <Knob value={lfoDepth} min={0} max={100} onChange={(v) => onUpdateParameter('lfoDepth', v)}
            label="LFO Depth" color="#ec4899" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
      <Section>
        <div className="flex justify-center">
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#6b7280" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
    </div>
  );
};

// ============================================================================
// DRAGONFLY HALL / PLATE / ROOM
// ============================================================================

const DragonflyEditor = (title: string, color: string, extras: { earlyLevel?: boolean; size?: boolean; brightness?: boolean }): React.FC<VisualEffectEditorProps> => {
  const Comp: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
    const decay = getParam(effect, 'decay', 50);
    const damping = getParam(effect, 'damping', 50);
    const predelay = getParam(effect, 'predelay', 10);
    const width = getParam(effect, 'width', 100);
    const earlyLevel = extras.earlyLevel ? getParam(effect, 'earlyLevel', 50) : 0;
    const size = extras.size ? getParam(effect, 'size', 1) : 0;
    const brightness = extras.brightness ? getParam(effect, 'brightness', 70) : 0;
    const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

    return (
      <div className="space-y-4">
        <EffectOscilloscope pre={pre} post={post} color={color} />
        <Section>
          <SectionHeader size="lg" color={color} title={title} />
          <div className="flex justify-around items-end flex-wrap gap-y-4">
            <Knob value={decay} min={0} max={100} onChange={(v) => onUpdateParameter('decay', v)}
              label="Decay" color={color} formatValue={(v) => `${Math.round(v)}%`} />
            <Knob value={damping} min={0} max={100} onChange={(v) => onUpdateParameter('damping', v)}
              label="Damp" color={color} formatValue={(v) => `${Math.round(v)}%`} />
            <Knob value={predelay} min={0} max={200} onChange={(v) => onUpdateParameter('predelay', v)}
              label="Pre-Delay" color={color} formatValue={(v) => `${Math.round(v)} ms`} />
            <Knob value={width} min={0} max={150} onChange={(v) => onUpdateParameter('width', v)}
              label="Width" color={color} formatValue={(v) => `${Math.round(v)}%`} />
            {extras.earlyLevel && (
              <Knob value={earlyLevel} min={0} max={100} onChange={(v) => onUpdateParameter('earlyLevel', v)}
                label="Early" color={color} formatValue={(v) => `${Math.round(v)}%`} />
            )}
            {extras.size && (
              <Knob value={size} min={0.1} max={5} onChange={(v) => onUpdateParameter('size', v)}
                label="Size" color={color} formatValue={(v) => v.toFixed(1)} />
            )}
            {extras.brightness && (
              <Knob value={brightness} min={0} max={100} onChange={(v) => onUpdateParameter('brightness', v)}
                label="Bright" color={color} formatValue={(v) => `${Math.round(v)}%`} />
            )}
          </div>
        </Section>
        <Section>
          <div className="flex justify-center">
            <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
              label="Mix" color="#6b7280" formatValue={(v) => `${Math.round(v)}%`} />
          </div>
        </Section>
      </div>
    );
  };
  Comp.displayName = title.replace(/\s/g, '') + 'Editor';
  return Comp;
};

export const DragonflyHallEditor = DragonflyEditor('Dragonfly Hall', '#7c3aed', { earlyLevel: true, size: true });
export const DragonflyPlateEditor = DragonflyEditor('Dragonfly Plate', '#8b5cf6', { brightness: true });
export const DragonflyRoomEditor = DragonflyEditor('Dragonfly Room', '#a78bfa', { earlyLevel: true, size: true });

// ============================================================================
// EARLY REFLECTIONS
// ============================================================================

export const EarlyReflectionsEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const size = getParam(effect, 'size', 1);
  const damping = getParam(effect, 'damping', 0.3);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');
  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#059669" />
      <Section>
        <SectionHeader size="lg" color="#059669" title="Early Reflections" />
        <div className="flex justify-around items-end">
          <Knob value={size} min={0.1} max={5} onChange={(v) => onUpdateParameter('size', v)}
            label="Size" color="#059669" formatValue={(v) => v.toFixed(1)} />
          <Knob value={damping} min={0} max={1} onChange={(v) => onUpdateParameter('damping', v)}
            label="Damp" color="#10b981" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#6b7280" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
    </div>
  );
};

// ============================================================================
// ROOMY
// ============================================================================

export const RoomyEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const time = getParam(effect, 'time', 2);
  const damping = getParam(effect, 'damping', 0.5);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');
  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#0f766e" />
      <Section>
        <SectionHeader size="lg" color="#0f766e" title="Roomy" />
        <div className="flex justify-around items-end">
          <Knob value={time} min={0.1} max={10} onChange={(v) => onUpdateParameter('time', v)}
            label="Time" color="#0f766e" formatValue={(v) => `${v.toFixed(1)}s`} />
          <Knob value={damping} min={0} max={1} onChange={(v) => onUpdateParameter('damping', v)}
            label="Damp" color="#14b8a6" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#6b7280" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
    </div>
  );
};

// ============================================================================
// DELAY EDITORS (Reverse, Vintage, Artistic, Slapback, Zam, Della)
// ============================================================================

export const ReverseDelayEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');
  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#7c3aed" />
      <Section>
        <SectionHeader size="lg" color="#7c3aed" title="Reverse Delay" />
        {renderBpmSync(effect, onUpdateParameter)}
        <div className="flex justify-around items-end">
          <Knob value={getParam(effect, 'time', 500)} min={50} max={2000}
            onChange={(v) => onUpdateParameter('time', v)} label="Time" color="#7c3aed" formatValue={(v) => `${Math.round(v)} ms`} />
          <Knob value={getParam(effect, 'feedback', 0.3)} min={0} max={0.95}
            onChange={(v) => onUpdateParameter('feedback', v)} label="Feedback" color="#8b5cf6" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#6b7280" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
    </div>
  );
};

export const VintageDelayEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');
  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#a1887f" />
      <Section>
        <SectionHeader size="lg" color="#a1887f" title="Vintage Delay" />
        {renderBpmSync(effect, onUpdateParameter)}
        <div className="flex justify-around items-end flex-wrap gap-y-4">
          <Knob value={getParam(effect, 'time', 400)} min={50} max={2000}
            onChange={(v) => onUpdateParameter('time', v)} label="Time" color="#a1887f" formatValue={(v) => `${Math.round(v)} ms`} />
          <Knob value={getParam(effect, 'feedback', 0.4)} min={0} max={0.95}
            onChange={(v) => onUpdateParameter('feedback', v)} label="Feedback" color="#8d6e63" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={getParam(effect, 'cutoff', 3000)} min={200} max={12000}
            onChange={(v) => onUpdateParameter('cutoff', v)} label="Tone" color="#795548"
            formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`} />
          <Knob value={getParam(effect, 'drive', 0.3)} min={0} max={1}
            onChange={(v) => onUpdateParameter('drive', v)} label="Drive" color="#6d4c41" formatValue={(v) => `${Math.round(v * 100)}%`} />
        </div>
      </Section>
      <Section>
        <div className="flex justify-center">
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#6b7280" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
    </div>
  );
};

export const ArtisticDelayEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');
  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#4f46e5" />
      <Section>
        <SectionHeader size="lg" color="#4f46e5" title="Artistic Delay" />
        {renderBpmSync(effect, onUpdateParameter)}
        <div className="flex justify-around items-end flex-wrap gap-y-4">
          <Knob value={getParam(effect, 'timeL', 500)} min={10} max={2000}
            onChange={(v) => onUpdateParameter('timeL', v)} label="Time L" color="#4f46e5" formatValue={(v) => `${Math.round(v)} ms`} />
          <Knob value={getParam(effect, 'timeR', 375)} min={10} max={2000}
            onChange={(v) => onUpdateParameter('timeR', v)} label="Time R" color="#6366f1" formatValue={(v) => `${Math.round(v)} ms`} />
          <Knob value={getParam(effect, 'feedback', 0.4)} min={0} max={0.95}
            onChange={(v) => onUpdateParameter('feedback', v)} label="Feedback" color="#818cf8" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={getParam(effect, 'pan', 0.5)} min={0} max={1}
            onChange={(v) => onUpdateParameter('pan', v)} label="Pan" color="#a5b4fc" formatValue={(v) => `${Math.round((v - 0.5) * 200)}%`} />
        </div>
      </Section>
      <Section>
        <div className="flex justify-around items-end">
          <Knob value={getParam(effect, 'lpf', 12000)} min={200} max={20000}
            onChange={(v) => onUpdateParameter('lpf', v)} label="LPF" color="#c7d2fe"
            formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`} />
          <Knob value={getParam(effect, 'hpf', 40)} min={20} max={2000}
            onChange={(v) => onUpdateParameter('hpf', v)} label="HPF" color="#c7d2fe" formatValue={(v) => `${Math.round(v)} Hz`} />
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#6b7280" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
    </div>
  );
};

export const SlapbackDelayEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');
  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#ca8a04" />
      <Section>
        <SectionHeader size="lg" color="#ca8a04" title="Slapback" />
        {renderBpmSync(effect, onUpdateParameter)}
        <div className="flex justify-around items-end">
          <Knob value={getParam(effect, 'time', 60)} min={10} max={200}
            onChange={(v) => onUpdateParameter('time', v)} label="Time" color="#ca8a04" formatValue={(v) => `${Math.round(v)} ms`} />
          <Knob value={getParam(effect, 'feedback', 0.1)} min={0} max={0.7}
            onChange={(v) => onUpdateParameter('feedback', v)} label="Feedback" color="#eab308" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={getParam(effect, 'tone', 4000)} min={200} max={12000}
            onChange={(v) => onUpdateParameter('tone', v)} label="Tone" color="#facc15"
            formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`} />
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#6b7280" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
    </div>
  );
};

export const ZamDelayEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');
  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#16a34a" />
      <Section>
        <SectionHeader size="lg" color="#16a34a" title="ZamDelay" />
        {renderBpmSync(effect, onUpdateParameter)}
        <div className="flex justify-around items-end flex-wrap gap-y-4">
          <Knob value={getParam(effect, 'time', 500)} min={10} max={2000}
            onChange={(v) => onUpdateParameter('time', v)} label="Time" color="#16a34a" formatValue={(v) => `${Math.round(v)} ms`} />
          <Knob value={getParam(effect, 'feedback', 0.4)} min={0} max={0.95}
            onChange={(v) => onUpdateParameter('feedback', v)} label="Feedback" color="#22c55e" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={getParam(effect, 'lpf', 8000)} min={200} max={20000}
            onChange={(v) => onUpdateParameter('lpf', v)} label="LPF" color="#4ade80"
            formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`} />
          <Knob value={getParam(effect, 'hpf', 60)} min={20} max={2000}
            onChange={(v) => onUpdateParameter('hpf', v)} label="HPF" color="#86efac" formatValue={(v) => `${Math.round(v)} Hz`} />
        </div>
      </Section>
      <Section>
        <div className="flex justify-center">
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#6b7280" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
    </div>
  );
};

export const DellaEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');
  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#0891b2" />
      <Section>
        <SectionHeader size="lg" color="#0891b2" title="Della" />
        {renderBpmSync(effect, onUpdateParameter)}
        <div className="flex justify-around items-end">
          <Knob value={getParam(effect, 'time', 300)} min={10} max={2000}
            onChange={(v) => onUpdateParameter('time', v)} label="Time" color="#0891b2" formatValue={(v) => `${Math.round(v)} ms`} />
          <Knob value={getParam(effect, 'feedback', 0.5)} min={0} max={0.95}
            onChange={(v) => onUpdateParameter('feedback', v)} label="Feedback" color="#06b6d4" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={getParam(effect, 'volume', 0.7)} min={0} max={1}
            onChange={(v) => onUpdateParameter('volume', v)} label="Volume" color="#22d3ee" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#6b7280" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
    </div>
  );
};

// ============================================================================
// STEREO & SPATIAL
// ============================================================================

export const BinauralPannerEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');
  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#0d9488" />
      <Section>
        <SectionHeader size="lg" color="#0d9488" title="Binaural Panner" />
        <div className="flex justify-around items-end">
          <Knob value={getParam(effect, 'azimuth', 0)} min={-180} max={180}
            onChange={(v) => onUpdateParameter('azimuth', v)} label="Azimuth" color="#0d9488" formatValue={(v) => `${Math.round(v)}°`} />
          <Knob value={getParam(effect, 'elevation', 0)} min={-90} max={90}
            onChange={(v) => onUpdateParameter('elevation', v)} label="Elevation" color="#14b8a6" formatValue={(v) => `${Math.round(v)}°`} />
          <Knob value={getParam(effect, 'distance', 1)} min={0.1} max={10}
            onChange={(v) => onUpdateParameter('distance', v)} label="Distance" color="#2dd4bf" formatValue={(v) => v.toFixed(1)} />
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#6b7280" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
    </div>
  );
};

export const HaasEnhancerEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  return (
    <div className="space-y-4">
      <Section>
        <SectionHeader size="lg" color="#0ea5e9" title="Haas Enhancer" />
        <div className="flex justify-around items-end">
          <Knob value={getParam(effect, 'delay', 10)} min={0.5} max={40}
            onChange={(v) => onUpdateParameter('delay', v)} label="Delay" color="#0ea5e9" formatValue={(v) => `${v.toFixed(1)} ms`} />
          <Knob value={getParam(effect, 'side', 0)} min={-1} max={1}
            onChange={(v) => onUpdateParameter('side', v)} label="Side" color="#38bdf8" formatValue={(v) => v < 0 ? `L ${Math.round(-v * 100)}%` : `R ${Math.round(v * 100)}%`} />
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#6b7280" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
    </div>
  );
};

export const MultiSpreadEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  return (
    <div className="space-y-4">
      <Section>
        <SectionHeader size="lg" color="#6366f1" title="Multi Spread" />
        <div className="flex justify-around items-end">
          <Knob value={getParam(effect, 'bands', 4)} min={2} max={8} step={1}
            onChange={(v) => onUpdateParameter('bands', Math.round(v))} label="Bands" color="#6366f1" formatValue={(v) => `${Math.round(v)}`} />
          <Knob value={getParam(effect, 'spread', 0.7)} min={0} max={1}
            onChange={(v) => onUpdateParameter('spread', v)} label="Spread" color="#818cf8" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#6b7280" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
    </div>
  );
};

export const MultibandEnhancerEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  return (
    <div className="space-y-4">
      <Section>
        <SectionHeader size="lg" color="#7c3aed" title="Multiband Enhancer" />
        <div className="flex justify-around items-end flex-wrap gap-y-4">
          <Knob value={getParam(effect, 'lowWidth', 1)} min={0} max={3}
            onChange={(v) => onUpdateParameter('lowWidth', v)} label="Low W" color="#6d28d9" formatValue={(v) => v.toFixed(2)} />
          <Knob value={getParam(effect, 'midWidth', 1)} min={0} max={3}
            onChange={(v) => onUpdateParameter('midWidth', v)} label="Mid W" color="#7c3aed" formatValue={(v) => v.toFixed(2)} />
          <Knob value={getParam(effect, 'highWidth', 1)} min={0} max={3}
            onChange={(v) => onUpdateParameter('highWidth', v)} label="Hi W" color="#8b5cf6" formatValue={(v) => v.toFixed(2)} />
          <Knob value={getParam(effect, 'topWidth', 1)} min={0} max={3}
            onChange={(v) => onUpdateParameter('topWidth', v)} label="Top W" color="#a78bfa" formatValue={(v) => v.toFixed(2)} />
          <Knob value={getParam(effect, 'harmonics', 0)} min={0} max={1}
            onChange={(v) => onUpdateParameter('harmonics', v)} label="Harmonics" color="#c4b5fd" formatValue={(v) => `${Math.round(v * 100)}%`} />
        </div>
      </Section>
      <Section>
        <div className="flex justify-center">
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#6b7280" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
    </div>
  );
};

export const VihdaEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  return (
    <div className="space-y-4">
      <Section>
        <SectionHeader size="lg" color="#4f46e5" title="Vihda" />
        <div className="flex justify-around items-end">
          <Knob value={getParam(effect, 'width', 1)} min={0} max={3}
            onChange={(v) => onUpdateParameter('width', v)} label="Width" color="#4f46e5" formatValue={(v) => v.toFixed(2)} />
          <Knob value={getParam(effect, 'invert', 0)} min={0} max={1} step={1}
            onChange={(v) => onUpdateParameter('invert', Math.round(v))} label="Invert" color="#6366f1"
            formatValue={(v) => Math.round(v) ? 'ON' : 'OFF'} />
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#6b7280" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
    </div>
  );
};

// ============================================================================
// CREATIVE
// ============================================================================

export const MashaEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const active = getParam(effect, 'active', 0);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');
  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#dc2626" />
      <Section>
        <SectionHeader size="lg" color="#dc2626" title="Masha" />
        <div className="flex justify-center mb-4">
          <button
            onPointerDown={() => onUpdateParameter('active', 1)}
            onPointerUp={() => onUpdateParameter('active', 0)}
            onPointerLeave={() => { if (active >= 0.5) onUpdateParameter('active', 0); }}
            className={`px-6 py-2 rounded-lg text-sm font-bold border-2 transition-all select-none ${
              active >= 0.5
                ? 'bg-red-600 border-red-400 text-white shadow-lg shadow-red-600/40 animate-pulse'
                : 'bg-black/40 border-dark-border text-text-muted hover:border-red-700'
            }`}>{active >= 0.5 ? 'ACTIVE' : 'HOLD'}</button>
        </div>
        <div className="flex justify-around items-end">
          <Knob value={getParam(effect, 'time', 100)} min={1} max={500}
            onChange={(v) => onUpdateParameter('time', v)} label="Time" color="#dc2626" formatValue={(v) => `${Math.round(v)} ms`} />
          <Knob value={getParam(effect, 'volume', 1)} min={0} max={2}
            onChange={(v) => onUpdateParameter('volume', v)} label="Volume" color="#ef4444" formatValue={(v) => v.toFixed(2)} />
          <Knob value={getParam(effect, 'passthrough', 0)} min={0} max={1}
            onChange={(v) => onUpdateParameter('passthrough', v)} label="Pass" color="#f87171" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#6b7280" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
    </div>
  );
};

export const BittaEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');
  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#16a34a" />
      <Section>
        <SectionHeader size="lg" color="#16a34a" title="Bitta" />
        <div className="flex justify-around items-end">
          <Knob value={getParam(effect, 'crush', 8)} min={1} max={16} step={1}
            onChange={(v) => onUpdateParameter('crush', Math.round(v))} label="Crush" color="#16a34a" formatValue={(v) => `${Math.round(v)} bit`} />
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#6b7280" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
    </div>
  );
};

export const VinylEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');
  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#78350f" />
      <Section>
        <SectionHeader size="lg" color="#78350f" title="Vinyl" />
        <div className="flex justify-around items-end flex-wrap gap-y-4">
          <Knob value={getParam(effect, 'crackle', 0.3)} min={0} max={1}
            onChange={(v) => onUpdateParameter('crackle', v)} label="Crackle" color="#78350f" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={getParam(effect, 'noise', 0.2)} min={0} max={1}
            onChange={(v) => onUpdateParameter('noise', v)} label="Noise" color="#92400e" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={getParam(effect, 'rumble', 0.1)} min={0} max={1}
            onChange={(v) => onUpdateParameter('rumble', v)} label="Rumble" color="#b45309" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={getParam(effect, 'wear', 0.3)} min={0} max={1}
            onChange={(v) => onUpdateParameter('wear', v)} label="Wear" color="#d97706" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={getParam(effect, 'speed', 0.5)} min={0} max={1}
            onChange={(v) => onUpdateParameter('speed', v)} label="Speed" color="#f59e0b" formatValue={(v) => `${Math.round(v * 100)}%`} />
        </div>
      </Section>
      <Section>
        <div className="flex justify-center">
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#6b7280" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
    </div>
  );
};

// ============================================================================
// 8-BAND PARAMETRIC EQ
// ============================================================================

const fmtFreq = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)} Hz`;

export const EQ8BandEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const hpFreq = getParam(effect, 'hpFreq', 20);
  const lpFreq = getParam(effect, 'lpFreq', 20000);
  const lowShelfFreq = getParam(effect, 'lowShelfFreq', 100);
  const lowShelfGain = getParam(effect, 'lowShelfGain', 0);
  const highShelfFreq = getParam(effect, 'highShelfFreq', 8000);
  const highShelfGain = getParam(effect, 'highShelfGain', 0);
  const { pre, post } = useEffectAnalyser(effect.id, 'fft');

  const peakDefaults = [250, 1000, 3500, 8000];
  const eqBands: EQBand[] = [
    { type: 'highpass', freq: hpFreq, gain: 0, q: 0.7 },
    { type: 'lowShelf', freq: lowShelfFreq, gain: lowShelfGain, q: 0.7 },
    ...[1, 2, 3, 4].map(b => ({
      type: 'peaking' as const,
      freq: getParam(effect, `peak${b}Freq`, peakDefaults[b - 1]),
      gain: getParam(effect, `peak${b}Gain`, 0),
      q: getParam(effect, `peak${b}Q`, 1),
    })),
    { type: 'highShelf' as const, freq: highShelfFreq, gain: highShelfGain, q: 0.7 },
    { type: 'lowpass' as const, freq: lpFreq, gain: 0, q: 0.7 },
  ];

  return (
    <div className="space-y-4">
      <EQCurve bands={eqBands} color="#3b82f6" height={130} dbRange={24} />
      <EffectSpectrum pre={pre} post={post} color="#3b82f6" height={60} />
      <Section>
        <SectionHeader size="lg" color="#3b82f6" title="Filters" />
        <div className="flex justify-around items-end">
          <Knob value={hpFreq} min={20} max={2000} onChange={(v) => onUpdateParameter('hpFreq', v)}
            label="HP Freq" color="#60a5fa" formatValue={fmtFreq} />
          <Knob value={lpFreq} min={1000} max={20000} onChange={(v) => onUpdateParameter('lpFreq', v)}
            label="LP Freq" color="#60a5fa" formatValue={fmtFreq} />
        </div>
      </Section>
      <Section>
        <SectionHeader size="lg" color="#2563eb" title="Shelves" />
        <div className="flex justify-around items-end">
          <Knob value={lowShelfFreq} min={20} max={1000} onChange={(v) => onUpdateParameter('lowShelfFreq', v)}
            label="Lo Freq" color="#3b82f6" formatValue={fmtFreq} />
          <EQSlider value={lowShelfGain} min={-36} max={36}
            onChange={(v) => onUpdateParameter('lowShelfGain', v)} label="Lo Gain" color="#3b82f6" />
          <Knob value={highShelfFreq} min={1000} max={20000} onChange={(v) => onUpdateParameter('highShelfFreq', v)}
            label="Hi Freq" color="#60a5fa" formatValue={fmtFreq} />
          <EQSlider value={highShelfGain} min={-36} max={36}
            onChange={(v) => onUpdateParameter('highShelfGain', v)} label="Hi Gain" color="#60a5fa" />
        </div>
      </Section>
      {[1, 2, 3, 4].map((band) => {
        const freq = getParam(effect, `peak${band}Freq`, peakDefaults[band - 1]);
        const gain = getParam(effect, `peak${band}Gain`, 0);
        const q = getParam(effect, `peak${band}Q`, 1);
        const colors = ['#2563eb', '#3b82f6', '#60a5fa', '#93c5fd'];
        return (
          <Section key={band}>
            <SectionHeader size="lg" color={colors[band - 1]} title={`Peak ${band}`} />
            <div className="flex justify-around items-end">
              <Knob value={freq} min={20} max={20000} onChange={(v) => onUpdateParameter(`peak${band}Freq`, v)}
                label="Freq" color={colors[band - 1]} formatValue={fmtFreq} />
              <EQSlider value={gain} min={-36} max={36}
                onChange={(v) => onUpdateParameter(`peak${band}Gain`, v)} label="Gain" color={colors[band - 1]} />
              <Knob value={q} min={0.1} max={10} onChange={(v) => onUpdateParameter(`peak${band}Q`, v)}
                label="Q" color={colors[band - 1]} formatValue={(v) => v.toFixed(2)} />
            </div>
          </Section>
        );
      })}
      <Section>
        <div className="flex justify-center">
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#6b7280" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
    </div>
  );
};

// ============================================================================
// 12-BAND EQ
// ============================================================================

const EQ12_FREQS = [30, 80, 160, 400, 800, 1500, 3000, 5000, 8000, 12000, 14000, 18000];
const EQ12_COLORS = ['#1e3a5f', '#1e40af', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd',
                     '#7dd3fc', '#38bdf8', '#0ea5e9', '#0284c7', '#0369a1', '#075985'];

export const EQ12BandEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const { pre, post } = useEffectAnalyser(effect.id, 'fft');

  const eqBands: EQBand[] = EQ12_FREQS.map((freq, i) => ({
    type: 'peaking' as const,
    freq,
    gain: getParam(effect, `gain_${i}`, 0),
    q: getParam(effect, `q_${i}`, 1),
  }));

  return (
    <div className="space-y-4">
      <EQCurve bands={eqBands} color="#3b82f6" height={130} dbRange={24} />
      <EffectSpectrum pre={pre} post={post} color="#3b82f6" height={60} />
      <Section>
        <SectionHeader size="lg" color="#3b82f6" title="12-Band EQ" />
        <div className="flex justify-around items-end gap-1">
          {EQ12_FREQS.map((defaultFreq, i) => {
            const gain = getParam(effect, `gain_${i}`, 0);
            return (
              <EQSlider key={i} value={gain} min={-36} max={36}
                onChange={(v) => onUpdateParameter(`gain_${i}`, v)}
                label={fmtFreq(defaultFreq)} color={EQ12_COLORS[i]} height={120} />
            );
          })}
        </div>
      </Section>
      <Section>
        <SectionHeader size="lg" color="#60a5fa" title="Q & Mix" />
        <div className="grid grid-cols-6 gap-x-2 gap-y-4">
          {EQ12_FREQS.map((_, i) => {
            const q = getParam(effect, `q_${i}`, 1);
            return (
              <div key={i} className="flex flex-col items-center gap-1">
                <Knob value={q} min={0.1} max={10} onChange={(v) => onUpdateParameter(`q_${i}`, v)}
                  label="" color="#6b7280" size="sm"
                  formatValue={(v) => `Q ${v.toFixed(1)}`} />
              </div>
            );
          })}
        </div>
        <div className="flex justify-center mt-4">
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#6b7280" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
    </div>
  );
};

// ============================================================================
// 31-BAND GRAPHIC EQ
// ============================================================================

const GEQ31_FREQS = [20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160,
  200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600,
  2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000];

export const GEQ31Editor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const { pre, post } = useEffectAnalyser(effect.id, 'fft');

  const eqBands: EQBand[] = GEQ31_FREQS.map((freq, i) => ({
    type: 'peaking' as const,
    freq,
    gain: getParam(effect, `band_${i}`, 0),
    q: 2.5,
  }));

  return (
    <div className="space-y-4">
      <EQCurve bands={eqBands} color="#3b82f6" height={130} dbRange={12} />
      <EffectSpectrum pre={pre} post={post} color="#3b82f6" height={60} />
      <Section>
        <SectionHeader size="lg" color="#3b82f6" title="31-Band Graphic EQ" />
        <div className="flex gap-[2px] items-end justify-center overflow-x-auto py-2">
          {GEQ31_FREQS.map((freq, i) => {
            const gain = getParam(effect, `band_${i}`, 0);
            const hue = 210 + (i / 30) * 60;
            const color = `hsl(${hue}, 70%, 55%)`;
            return (
              <EQSlider key={i} value={gain} min={-12} max={12}
                onChange={(v) => onUpdateParameter(`band_${i}`, v)}
                label={freq >= 1000 ? `${(freq / 1000).toFixed(freq >= 10000 ? 0 : 1)}k` : `${freq}`}
                color={color} height={140} width={22} />
            );
          })}
        </div>
      </Section>
      <Section>
        <div className="flex justify-center">
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#6b7280" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
    </div>
  );
};
