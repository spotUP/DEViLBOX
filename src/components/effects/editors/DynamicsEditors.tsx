/**
 * DynamicsEditors.tsx — Zynthian-ported dynamics effect editors
 *
 * Compressors, limiters, gates, expanders, transient designers, and more.
 * Each effect has a themed knob-panel UI with grouped sections.
 */

import React from 'react';
import { useEffectAnalyser } from '@hooks/useEffectAnalyser';
import { EffectOscilloscope } from '../EffectVisualizer';
import { Knob } from '@components/controls/Knob';
import { SectionHeader, getParam, type VisualEffectEditorProps } from './shared';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useShallow } from 'zustand/react/shallow';
import { CustomSelect } from '@components/common/CustomSelect';

const DYN_PRIMARY = '#3b82f6';
const DYN_SECONDARY = '#60a5fa';
const DYN_TERTIARY = '#93c5fd';
const DYN_ACCENT = '#2563eb';

const Section: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
    {children}
  </section>
);

// ============================================================================
// NOISE GATE
// ============================================================================

export const NoiseGateEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const threshold = getParam(effect, 'threshold', -40);
  const attack = getParam(effect, 'attack', 0.5);
  const hold = getParam(effect, 'hold', 50);
  const release = getParam(effect, 'release', 100);
  const range = getParam(effect, 'range', 0);
  const hpf = getParam(effect, 'hpf', 0);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color={DYN_PRIMARY} />
      <Section>
        <SectionHeader size="lg" color={DYN_PRIMARY} title="Gate" />
        <div className="flex justify-around items-end flex-wrap gap-y-4">
          <Knob value={threshold} min={-80} max={0} onChange={(v) => onUpdateParameter('threshold', v)}
            label="Threshold" color={DYN_PRIMARY} formatValue={(v) => `${v.toFixed(0)} dB`} />
          <Knob value={range} min={-80} max={0} onChange={(v) => onUpdateParameter('range', v)}
            label="Range" color={DYN_PRIMARY} formatValue={(v) => `${v.toFixed(0)} dB`} />
        </div>
      </Section>
      <Section>
        <SectionHeader size="lg" color={DYN_SECONDARY} title="Envelope" />
        <div className="flex justify-around items-end flex-wrap gap-y-4">
          <Knob value={attack} min={0.1} max={50} onChange={(v) => onUpdateParameter('attack', v)}
            label="Attack" color={DYN_SECONDARY} formatValue={(v) => `${v.toFixed(1)} ms`} />
          <Knob value={hold} min={0} max={500} onChange={(v) => onUpdateParameter('hold', v)}
            label="Hold" color={DYN_SECONDARY} formatValue={(v) => `${Math.round(v)} ms`} />
          <Knob value={release} min={1} max={2000} onChange={(v) => onUpdateParameter('release', v)}
            label="Release" color={DYN_SECONDARY} formatValue={(v) => `${Math.round(v)} ms`} />
        </div>
      </Section>
      <Section>
        <div className="flex justify-center gap-8 items-end">
          <Knob value={hpf} min={0} max={2000} onChange={(v) => onUpdateParameter('hpf', v)}
            label="Sidechain HPF" color={DYN_TERTIARY} formatValue={(v) => `${Math.round(v)} Hz`} />
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#6b7280" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
    </div>
  );
};

// ============================================================================
// LIMITER
// ============================================================================

export const LimiterEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const threshold = getParam(effect, 'threshold', -1);
  const ceiling = getParam(effect, 'ceiling', -0.3);
  const attack = getParam(effect, 'attack', 5);
  const release = getParam(effect, 'release', 50);
  const lookahead = getParam(effect, 'lookahead', 5);
  const knee = getParam(effect, 'knee', 0);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color={DYN_ACCENT} />
      <Section>
        <SectionHeader size="lg" color={DYN_ACCENT} title="Limiter" />
        <div className="flex justify-around items-end flex-wrap gap-y-4">
          <Knob value={threshold} min={-24} max={0} onChange={(v) => onUpdateParameter('threshold', v)}
            label="Threshold" color={DYN_ACCENT} formatValue={(v) => `${v.toFixed(1)} dB`} />
          <Knob value={ceiling} min={-12} max={0} onChange={(v) => onUpdateParameter('ceiling', v)}
            label="Ceiling" color={DYN_ACCENT} formatValue={(v) => `${v.toFixed(1)} dB`} />
          <Knob value={knee} min={0} max={12} onChange={(v) => onUpdateParameter('knee', v)}
            label="Knee" color={DYN_SECONDARY} formatValue={(v) => `${v.toFixed(1)} dB`} />
        </div>
      </Section>
      <Section>
        <SectionHeader size="lg" color={DYN_SECONDARY} title="Timing" />
        <div className="flex justify-around items-end">
          <Knob value={attack} min={0.1} max={50} onChange={(v) => onUpdateParameter('attack', v)}
            label="Attack" color={DYN_SECONDARY} formatValue={(v) => `${v.toFixed(1)} ms`} />
          <Knob value={release} min={5} max={500} onChange={(v) => onUpdateParameter('release', v)}
            label="Release" color={DYN_SECONDARY} formatValue={(v) => `${Math.round(v)} ms`} />
          <Knob value={lookahead} min={0} max={20} onChange={(v) => onUpdateParameter('lookahead', v)}
            label="Lookahead" color={DYN_SECONDARY} formatValue={(v) => `${v.toFixed(1)} ms`} />
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
// MONO COMPRESSOR
// ============================================================================

export const MonoCompEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const threshold = getParam(effect, 'threshold', -12);
  const ratio = getParam(effect, 'ratio', 4);
  const attack = getParam(effect, 'attack', 10);
  const release = getParam(effect, 'release', 100);
  const knee = getParam(effect, 'knee', 6);
  const makeup = getParam(effect, 'makeup', 0);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color={DYN_PRIMARY} />
      <Section>
        <SectionHeader size="lg" color={DYN_PRIMARY} title="Compressor" />
        <div className="flex justify-around items-end flex-wrap gap-y-4">
          <Knob value={threshold} min={-60} max={0} onChange={(v) => onUpdateParameter('threshold', v)}
            label="Threshold" color={DYN_PRIMARY} formatValue={(v) => `${v.toFixed(0)} dB`} />
          <Knob value={ratio} min={1} max={20} onChange={(v) => onUpdateParameter('ratio', v)}
            label="Ratio" color={DYN_PRIMARY} formatValue={(v) => `${v.toFixed(1)}:1`} />
          <Knob value={knee} min={0} max={12} onChange={(v) => onUpdateParameter('knee', v)}
            label="Knee" color={DYN_SECONDARY} formatValue={(v) => `${v.toFixed(1)} dB`} />
        </div>
      </Section>
      <Section>
        <SectionHeader size="lg" color={DYN_SECONDARY} title="Envelope" />
        <div className="flex justify-around items-end">
          <Knob value={attack} min={0.1} max={200} onChange={(v) => onUpdateParameter('attack', v)}
            label="Attack" color={DYN_SECONDARY} formatValue={(v) => `${v.toFixed(1)} ms`} />
          <Knob value={release} min={5} max={2000} onChange={(v) => onUpdateParameter('release', v)}
            label="Release" color={DYN_SECONDARY} formatValue={(v) => `${Math.round(v)} ms`} />
          <Knob value={makeup} min={-12} max={24} onChange={(v) => onUpdateParameter('makeup', v)}
            label="Makeup" color={DYN_TERTIARY} formatValue={(v) => `${v.toFixed(1)} dB`} />
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
// EXPANDER
// ============================================================================

export const ExpanderEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const threshold = getParam(effect, 'threshold', -30);
  const ratio = getParam(effect, 'ratio', 2);
  const attack = getParam(effect, 'attack', 1);
  const release = getParam(effect, 'release', 100);
  const range = getParam(effect, 'range', -60);
  const knee = getParam(effect, 'knee', 6);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#8b5cf6" />
      <Section>
        <SectionHeader size="lg" color="#8b5cf6" title="Expander" />
        <div className="flex justify-around items-end flex-wrap gap-y-4">
          <Knob value={threshold} min={-60} max={0} onChange={(v) => onUpdateParameter('threshold', v)}
            label="Threshold" color="#8b5cf6" formatValue={(v) => `${v.toFixed(0)} dB`} />
          <Knob value={ratio} min={1} max={20} onChange={(v) => onUpdateParameter('ratio', v)}
            label="Ratio" color="#8b5cf6" formatValue={(v) => `${v.toFixed(1)}:1`} />
          <Knob value={range} min={-80} max={0} onChange={(v) => onUpdateParameter('range', v)}
            label="Range" color="#a78bfa" formatValue={(v) => `${v.toFixed(0)} dB`} />
          <Knob value={knee} min={0} max={12} onChange={(v) => onUpdateParameter('knee', v)}
            label="Knee" color="#a78bfa" formatValue={(v) => `${v.toFixed(1)} dB`} />
        </div>
      </Section>
      <Section>
        <SectionHeader size="lg" color="#a78bfa" title="Envelope" />
        <div className="flex justify-around items-end">
          <Knob value={attack} min={0.1} max={100} onChange={(v) => onUpdateParameter('attack', v)}
            label="Attack" color="#a78bfa" formatValue={(v) => `${v.toFixed(1)} ms`} />
          <Knob value={release} min={5} max={2000} onChange={(v) => onUpdateParameter('release', v)}
            label="Release" color="#a78bfa" formatValue={(v) => `${Math.round(v)} ms`} />
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
// CLIPPER
// ============================================================================

export const ClipperEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const inputGain = getParam(effect, 'inputGain', 0);
  const ceiling = getParam(effect, 'ceiling', -1);
  const softness = getParam(effect, 'softness', 0.5);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#ef4444" />
      <Section>
        <SectionHeader size="lg" color="#ef4444" title="Clipper" />
        <div className="flex justify-around items-end">
          <Knob value={inputGain} min={-12} max={24} onChange={(v) => onUpdateParameter('inputGain', v)}
            label="Input" color="#ef4444" formatValue={(v) => `${v.toFixed(1)} dB`} />
          <Knob value={ceiling} min={-24} max={0} onChange={(v) => onUpdateParameter('ceiling', v)}
            label="Ceiling" color="#f87171" formatValue={(v) => `${v.toFixed(1)} dB`} />
          <Knob value={softness} min={0} max={1} onChange={(v) => onUpdateParameter('softness', v)}
            label="Softness" color="#fca5a5" formatValue={(v) => `${Math.round(v * 100)}%`} />
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
// DE-ESSER
// ============================================================================

export const DeEsserEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const frequency = getParam(effect, 'frequency', 6000);
  const bandwidth = getParam(effect, 'bandwidth', 1);
  const threshold = getParam(effect, 'threshold', -20);
  const ratio = getParam(effect, 'ratio', 4);
  const attack = getParam(effect, 'attack', 1);
  const release = getParam(effect, 'release', 50);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#06b6d4" />
      <Section>
        <SectionHeader size="lg" color="#06b6d4" title="Detection" />
        <div className="flex justify-around items-end">
          <Knob value={frequency} min={2000} max={12000} onChange={(v) => onUpdateParameter('frequency', v)}
            label="Frequency" color="#06b6d4" formatValue={(v) => `${(v / 1000).toFixed(1)}k`} />
          <Knob value={bandwidth} min={0.1} max={4} onChange={(v) => onUpdateParameter('bandwidth', v)}
            label="Bandwidth" color="#22d3ee" formatValue={(v) => `${v.toFixed(1)} oct`} />
        </div>
      </Section>
      <Section>
        <SectionHeader size="lg" color="#22d3ee" title="Reduction" />
        <div className="flex justify-around items-end flex-wrap gap-y-4">
          <Knob value={threshold} min={-40} max={0} onChange={(v) => onUpdateParameter('threshold', v)}
            label="Threshold" color="#22d3ee" formatValue={(v) => `${v.toFixed(0)} dB`} />
          <Knob value={ratio} min={1} max={20} onChange={(v) => onUpdateParameter('ratio', v)}
            label="Ratio" color="#67e8f9" formatValue={(v) => `${v.toFixed(1)}:1`} />
          <Knob value={attack} min={0.1} max={20} onChange={(v) => onUpdateParameter('attack', v)}
            label="Attack" color="#67e8f9" formatValue={(v) => `${v.toFixed(1)} ms`} />
          <Knob value={release} min={5} max={500} onChange={(v) => onUpdateParameter('release', v)}
            label="Release" color="#67e8f9" formatValue={(v) => `${Math.round(v)} ms`} />
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
// MULTIBAND COMPRESSOR
// ============================================================================

export const MultibandCompEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const lowCross = getParam(effect, 'lowCrossover', 200);
  const highCross = getParam(effect, 'highCrossover', 3000);
  const lowThresh = getParam(effect, 'lowThreshold', -20);
  const midThresh = getParam(effect, 'midThreshold', -20);
  const highThresh = getParam(effect, 'highThreshold', -20);
  const lowRatio = getParam(effect, 'lowRatio', 4);
  const midRatio = getParam(effect, 'midRatio', 4);
  const highRatio = getParam(effect, 'highRatio', 4);
  const lowGain = getParam(effect, 'lowGain', 1);
  const midGain = getParam(effect, 'midGain', 1);
  const highGain = getParam(effect, 'highGain', 1);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color={DYN_PRIMARY} />
      <Section>
        <SectionHeader size="lg" color={DYN_PRIMARY} title="Crossover" />
        <div className="flex justify-around items-end">
          <Knob value={lowCross} min={40} max={1000} onChange={(v) => onUpdateParameter('lowCrossover', v)}
            label="Low X" color={DYN_PRIMARY} formatValue={(v) => `${Math.round(v)} Hz`} />
          <Knob value={highCross} min={500} max={10000} onChange={(v) => onUpdateParameter('highCrossover', v)}
            label="High X" color={DYN_SECONDARY} formatValue={(v) => `${(v / 1000).toFixed(1)}k`} />
        </div>
      </Section>
      <Section>
        <SectionHeader size="lg" color={DYN_PRIMARY} title="Low Band" />
        <div className="flex justify-around items-end">
          <Knob value={lowThresh} min={-60} max={0} onChange={(v) => onUpdateParameter('lowThreshold', v)}
            label="Thresh" color={DYN_PRIMARY} formatValue={(v) => `${v.toFixed(0)} dB`} />
          <Knob value={lowRatio} min={1} max={20} onChange={(v) => onUpdateParameter('lowRatio', v)}
            label="Ratio" color={DYN_PRIMARY} formatValue={(v) => `${v.toFixed(1)}:1`} />
          <Knob value={lowGain} min={0} max={4} onChange={(v) => onUpdateParameter('lowGain', v)}
            label="Gain" color={DYN_PRIMARY} formatValue={(v) => `${v.toFixed(2)}`} />
        </div>
      </Section>
      <Section>
        <SectionHeader size="lg" color={DYN_SECONDARY} title="Mid Band" />
        <div className="flex justify-around items-end">
          <Knob value={midThresh} min={-60} max={0} onChange={(v) => onUpdateParameter('midThreshold', v)}
            label="Thresh" color={DYN_SECONDARY} formatValue={(v) => `${v.toFixed(0)} dB`} />
          <Knob value={midRatio} min={1} max={20} onChange={(v) => onUpdateParameter('midRatio', v)}
            label="Ratio" color={DYN_SECONDARY} formatValue={(v) => `${v.toFixed(1)}:1`} />
          <Knob value={midGain} min={0} max={4} onChange={(v) => onUpdateParameter('midGain', v)}
            label="Gain" color={DYN_SECONDARY} formatValue={(v) => `${v.toFixed(2)}`} />
        </div>
      </Section>
      <Section>
        <SectionHeader size="lg" color={DYN_TERTIARY} title="High Band" />
        <div className="flex justify-around items-end">
          <Knob value={highThresh} min={-60} max={0} onChange={(v) => onUpdateParameter('highThreshold', v)}
            label="Thresh" color={DYN_TERTIARY} formatValue={(v) => `${v.toFixed(0)} dB`} />
          <Knob value={highRatio} min={1} max={20} onChange={(v) => onUpdateParameter('highRatio', v)}
            label="Ratio" color={DYN_TERTIARY} formatValue={(v) => `${v.toFixed(1)}:1`} />
          <Knob value={highGain} min={0} max={4} onChange={(v) => onUpdateParameter('highGain', v)}
            label="Gain" color={DYN_TERTIARY} formatValue={(v) => `${v.toFixed(2)}`} />
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
// TRANSIENT DESIGNER
// ============================================================================

export const TransientDesignerEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const attack = getParam(effect, 'attack', 0);
  const sustain = getParam(effect, 'sustain', 0);
  const output = getParam(effect, 'output', 1);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#f59e0b" />
      <Section>
        <SectionHeader size="lg" color="#f59e0b" title="Transient" />
        <div className="flex justify-around items-end">
          <Knob value={attack} min={-100} max={100} onChange={(v) => onUpdateParameter('attack', v)}
            label="Attack" color="#f59e0b" formatValue={(v) => `${v > 0 ? '+' : ''}${Math.round(v)}%`} />
          <Knob value={sustain} min={-100} max={100} onChange={(v) => onUpdateParameter('sustain', v)}
            label="Sustain" color="#fbbf24" formatValue={(v) => `${v > 0 ? '+' : ''}${Math.round(v)}%`} />
          <Knob value={output} min={0} max={2} onChange={(v) => onUpdateParameter('output', v)}
            label="Output" color="#fcd34d" formatValue={(v) => `${v.toFixed(2)}`} />
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
// DYNAMICS PROCESSOR (dual-threshold)
// ============================================================================

export const DynamicsProcEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const lowerThresh = getParam(effect, 'lowerThresh', -40);
  const upperThresh = getParam(effect, 'upperThresh', -12);
  const ratio = getParam(effect, 'ratio', 4);
  const attack = getParam(effect, 'attack', 10);
  const release = getParam(effect, 'release', 100);
  const makeup = getParam(effect, 'makeup', 0);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#7c3aed" />
      <Section>
        <SectionHeader size="lg" color="#7c3aed" title="Dynamics" />
        <div className="flex justify-around items-end flex-wrap gap-y-4">
          <Knob value={lowerThresh} min={-60} max={0} onChange={(v) => onUpdateParameter('lowerThresh', v)}
            label="Lower" color="#7c3aed" formatValue={(v) => `${v.toFixed(0)} dB`} />
          <Knob value={upperThresh} min={-60} max={0} onChange={(v) => onUpdateParameter('upperThresh', v)}
            label="Upper" color="#8b5cf6" formatValue={(v) => `${v.toFixed(0)} dB`} />
          <Knob value={ratio} min={1} max={20} onChange={(v) => onUpdateParameter('ratio', v)}
            label="Ratio" color="#a78bfa" formatValue={(v) => `${v.toFixed(1)}:1`} />
        </div>
      </Section>
      <Section>
        <SectionHeader size="lg" color="#a78bfa" title="Envelope" />
        <div className="flex justify-around items-end">
          <Knob value={attack} min={0.1} max={200} onChange={(v) => onUpdateParameter('attack', v)}
            label="Attack" color="#a78bfa" formatValue={(v) => `${v.toFixed(1)} ms`} />
          <Knob value={release} min={5} max={2000} onChange={(v) => onUpdateParameter('release', v)}
            label="Release" color="#c4b5fd" formatValue={(v) => `${Math.round(v)} ms`} />
          <Knob value={makeup} min={-12} max={24} onChange={(v) => onUpdateParameter('makeup', v)}
            label="Makeup" color="#c4b5fd" formatValue={(v) => `${v.toFixed(1)} dB`} />
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
// X42 COMPRESSOR
// ============================================================================

export const X42CompEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const threshold = getParam(effect, 'threshold', -20);
  const ratio = getParam(effect, 'ratio', 4);
  const attack = getParam(effect, 'attack', 10);
  const release = getParam(effect, 'release', 100);
  const hold = getParam(effect, 'hold', 0);
  const inputGain = getParam(effect, 'inputGain', 0);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#059669" />
      <Section>
        <SectionHeader size="lg" color="#059669" title="X42 Comp" />
        <div className="flex justify-around items-end flex-wrap gap-y-4">
          <Knob value={threshold} min={-60} max={0} onChange={(v) => onUpdateParameter('threshold', v)}
            label="Threshold" color="#059669" formatValue={(v) => `${v.toFixed(0)} dB`} />
          <Knob value={ratio} min={1} max={20} onChange={(v) => onUpdateParameter('ratio', v)}
            label="Ratio" color="#059669" formatValue={(v) => `${v.toFixed(1)}:1`} />
          <Knob value={inputGain} min={-12} max={12} onChange={(v) => onUpdateParameter('inputGain', v)}
            label="Input" color="#10b981" formatValue={(v) => `${v.toFixed(1)} dB`} />
        </div>
      </Section>
      <Section>
        <SectionHeader size="lg" color="#10b981" title="Timing" />
        <div className="flex justify-around items-end">
          <Knob value={attack} min={0.1} max={200} onChange={(v) => onUpdateParameter('attack', v)}
            label="Attack" color="#10b981" formatValue={(v) => `${v.toFixed(1)} ms`} />
          <Knob value={hold} min={0} max={500} onChange={(v) => onUpdateParameter('hold', v)}
            label="Hold" color="#34d399" formatValue={(v) => `${Math.round(v)} ms`} />
          <Knob value={release} min={5} max={2000} onChange={(v) => onUpdateParameter('release', v)}
            label="Release" color="#34d399" formatValue={(v) => `${Math.round(v)} ms`} />
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
// GOTT COMPRESSOR (multiband)
// ============================================================================

export const GOTTCompEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const lowCross = getParam(effect, 'lowCross', 200);
  const highCross = getParam(effect, 'highCross', 4000);
  const lowThresh = getParam(effect, 'lowThresh', -18);
  const midThresh = getParam(effect, 'midThresh', -18);
  const highThresh = getParam(effect, 'highThresh', -18);
  const lowRatio = getParam(effect, 'lowRatio', 4);
  const midRatio = getParam(effect, 'midRatio', 4);
  const highRatio = getParam(effect, 'highRatio', 4);
  const attack = getParam(effect, 'attack', 10);
  const release = getParam(effect, 'release', 100);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#dc2626" />
      <Section>
        <SectionHeader size="lg" color="#dc2626" title="Crossover" />
        <div className="flex justify-around items-end">
          <Knob value={lowCross} min={40} max={1000} onChange={(v) => onUpdateParameter('lowCross', v)}
            label="Low X" color="#dc2626" formatValue={(v) => `${Math.round(v)} Hz`} />
          <Knob value={highCross} min={500} max={12000} onChange={(v) => onUpdateParameter('highCross', v)}
            label="High X" color="#ef4444" formatValue={(v) => `${(v / 1000).toFixed(1)}k`} />
        </div>
      </Section>
      <Section>
        <SectionHeader size="lg" color="#ef4444" title="Bands" />
        <div className="flex justify-around items-end flex-wrap gap-y-4">
          <Knob value={lowThresh} min={-60} max={0} onChange={(v) => onUpdateParameter('lowThresh', v)}
            label="Low Thr" color="#dc2626" formatValue={(v) => `${v.toFixed(0)}`} />
          <Knob value={lowRatio} min={1} max={20} onChange={(v) => onUpdateParameter('lowRatio', v)}
            label="Low Rat" color="#dc2626" formatValue={(v) => `${v.toFixed(0)}:1`} />
          <Knob value={midThresh} min={-60} max={0} onChange={(v) => onUpdateParameter('midThresh', v)}
            label="Mid Thr" color="#ef4444" formatValue={(v) => `${v.toFixed(0)}`} />
          <Knob value={midRatio} min={1} max={20} onChange={(v) => onUpdateParameter('midRatio', v)}
            label="Mid Rat" color="#ef4444" formatValue={(v) => `${v.toFixed(0)}:1`} />
          <Knob value={highThresh} min={-60} max={0} onChange={(v) => onUpdateParameter('highThresh', v)}
            label="Hi Thr" color="#f87171" formatValue={(v) => `${v.toFixed(0)}`} />
          <Knob value={highRatio} min={1} max={20} onChange={(v) => onUpdateParameter('highRatio', v)}
            label="Hi Rat" color="#f87171" formatValue={(v) => `${v.toFixed(0)}:1`} />
        </div>
      </Section>
      <Section>
        <div className="flex justify-around items-end">
          <Knob value={attack} min={0.1} max={200} onChange={(v) => onUpdateParameter('attack', v)}
            label="Attack" color="#fca5a5" formatValue={(v) => `${v.toFixed(1)} ms`} />
          <Knob value={release} min={5} max={2000} onChange={(v) => onUpdateParameter('release', v)}
            label="Release" color="#fca5a5" formatValue={(v) => `${Math.round(v)} ms`} />
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#6b7280" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
    </div>
  );
};

// ============================================================================
// SIDECHAIN GATE
// ============================================================================

export const SidechainGateEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const threshold = getParam(effect, 'threshold', -30);
  const attack = getParam(effect, 'attack', 1);
  const hold = getParam(effect, 'hold', 50);
  const release = getParam(effect, 'release', 200);
  const range = getParam(effect, 'range', 0);
  const scFreq = getParam(effect, 'scFreq', 200);
  const scQ = getParam(effect, 'scQ', 1);
  const sidechainSource = getParam(effect, 'sidechainSource', -1);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  const channelCount = useTrackerStore(s => s.patterns[0]?.channels.length ?? 8);
  const channelNames = useTrackerStore(useShallow(s =>
    s.patterns[0]?.channels.map((ch: { name?: string }, i: number) => ch.name || `CH ${i + 1}`) ?? []
  ));

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#0891b2" />
      <Section>
        <SectionHeader size="lg" color="#0891b2" title="Gate" />
        <div className="flex justify-around items-end flex-wrap gap-y-4">
          <Knob value={threshold} min={-60} max={0} onChange={(v) => onUpdateParameter('threshold', v)}
            label="Threshold" color="#0891b2" formatValue={(v) => `${v.toFixed(0)} dB`} />
          <Knob value={range} min={-80} max={0} onChange={(v) => onUpdateParameter('range', v)}
            label="Range" color="#06b6d4" formatValue={(v) => `${v.toFixed(0)} dB`} />
        </div>
      </Section>
      <Section>
        <SectionHeader size="lg" color="#06b6d4" title="Envelope" />
        <div className="flex justify-around items-end">
          <Knob value={attack} min={0.1} max={100} onChange={(v) => onUpdateParameter('attack', v)}
            label="Attack" color="#06b6d4" formatValue={(v) => `${v.toFixed(1)} ms`} />
          <Knob value={hold} min={0} max={500} onChange={(v) => onUpdateParameter('hold', v)}
            label="Hold" color="#22d3ee" formatValue={(v) => `${Math.round(v)} ms`} />
          <Knob value={release} min={5} max={2000} onChange={(v) => onUpdateParameter('release', v)}
            label="Release" color="#22d3ee" formatValue={(v) => `${Math.round(v)} ms`} />
        </div>
      </Section>
      <Section>
        <SectionHeader size="lg" color="#22d3ee" title="Sidechain" />
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
            className="w-full bg-black/60 border border-dark-border rounded-lg px-3 py-1.5 text-sm text-text-primary focus:border-cyan-500 focus:outline-none"
          />
        </div>
        <div className="flex justify-around items-end">
          <Knob value={scFreq} min={20} max={10000} onChange={(v) => onUpdateParameter('scFreq', v)}
            label="SC Freq" color="#22d3ee" formatValue={(v) => `${Math.round(v)} Hz`} />
          <Knob value={scQ} min={0.1} max={10} onChange={(v) => onUpdateParameter('scQ', v)}
            label="SC Q" color="#67e8f9" formatValue={(v) => v.toFixed(1)} />
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#6b7280" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
    </div>
  );
};

// ============================================================================
// SIDECHAIN LIMITER
// ============================================================================

export const SidechainLimiterEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const ceiling = getParam(effect, 'ceiling', -1);
  const release = getParam(effect, 'release', 50);
  const scFreq = getParam(effect, 'scFreq', 1000);
  const scGain = getParam(effect, 'scGain', 0);
  const sidechainSource = getParam(effect, 'sidechainSource', -1);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  const channelCount = useTrackerStore(s => s.patterns[0]?.channels.length ?? 8);
  const channelNames = useTrackerStore(useShallow(s =>
    s.patterns[0]?.channels.map((ch: { name?: string }, i: number) => ch.name || `CH ${i + 1}`) ?? []
  ));

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#0e7490" />
      <Section>
        <SectionHeader size="lg" color="#0e7490" title="Limiter" />
        <div className="flex justify-around items-end">
          <Knob value={ceiling} min={-12} max={0} onChange={(v) => onUpdateParameter('ceiling', v)}
            label="Ceiling" color="#0e7490" formatValue={(v) => `${v.toFixed(1)} dB`} />
          <Knob value={release} min={5} max={500} onChange={(v) => onUpdateParameter('release', v)}
            label="Release" color="#0891b2" formatValue={(v) => `${Math.round(v)} ms`} />
        </div>
      </Section>
      <Section>
        <SectionHeader size="lg" color="#06b6d4" title="Sidechain" />
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
            className="w-full bg-black/60 border border-dark-border rounded-lg px-3 py-1.5 text-sm text-text-primary focus:border-cyan-500 focus:outline-none"
          />
        </div>
        <div className="flex justify-around items-end">
          <Knob value={scFreq} min={20} max={10000} onChange={(v) => onUpdateParameter('scFreq', v)}
            label="SC Freq" color="#06b6d4" formatValue={(v) => `${Math.round(v)} Hz`} />
          <Knob value={scGain} min={-12} max={12} onChange={(v) => onUpdateParameter('scGain', v)}
            label="SC Gain" color="#22d3ee" formatValue={(v) => `${v.toFixed(1)} dB`} />
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#6b7280" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
    </div>
  );
};

// ============================================================================
// MULTIBAND GATE
// ============================================================================

export const MultibandGateEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const lowCross = getParam(effect, 'lowCross', 200);
  const highCross = getParam(effect, 'highCross', 3000);
  const lowThresh = getParam(effect, 'lowThresh', -40);
  const midThresh = getParam(effect, 'midThresh', -40);
  const highThresh = getParam(effect, 'highThresh', -40);
  const attack = getParam(effect, 'attack', 1);
  const release = getParam(effect, 'release', 200);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#0284c7" />
      <Section>
        <SectionHeader size="lg" color="#0284c7" title="Crossover" />
        <div className="flex justify-around items-end">
          <Knob value={lowCross} min={40} max={1000} onChange={(v) => onUpdateParameter('lowCross', v)}
            label="Low X" color="#0284c7" formatValue={(v) => `${Math.round(v)} Hz`} />
          <Knob value={highCross} min={500} max={10000} onChange={(v) => onUpdateParameter('highCross', v)}
            label="High X" color="#0ea5e9" formatValue={(v) => `${(v / 1000).toFixed(1)}k`} />
        </div>
      </Section>
      <Section>
        <SectionHeader size="lg" color="#0ea5e9" title="Band Thresholds" />
        <div className="flex justify-around items-end">
          <Knob value={lowThresh} min={-80} max={0} onChange={(v) => onUpdateParameter('lowThresh', v)}
            label="Low" color="#0284c7" formatValue={(v) => `${v.toFixed(0)} dB`} />
          <Knob value={midThresh} min={-80} max={0} onChange={(v) => onUpdateParameter('midThresh', v)}
            label="Mid" color="#0ea5e9" formatValue={(v) => `${v.toFixed(0)} dB`} />
          <Knob value={highThresh} min={-80} max={0} onChange={(v) => onUpdateParameter('highThresh', v)}
            label="High" color="#38bdf8" formatValue={(v) => `${v.toFixed(0)} dB`} />
        </div>
      </Section>
      <Section>
        <div className="flex justify-around items-end">
          <Knob value={attack} min={0.1} max={100} onChange={(v) => onUpdateParameter('attack', v)}
            label="Attack" color="#7dd3fc" formatValue={(v) => `${v.toFixed(1)} ms`} />
          <Knob value={release} min={5} max={2000} onChange={(v) => onUpdateParameter('release', v)}
            label="Release" color="#7dd3fc" formatValue={(v) => `${Math.round(v)} ms`} />
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#6b7280" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
    </div>
  );
};

// ============================================================================
// MULTIBAND LIMITER
// ============================================================================

export const MultibandLimiterEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const lowCross = getParam(effect, 'lowCross', 200);
  const highCross = getParam(effect, 'highCross', 3000);
  const lowCeil = getParam(effect, 'lowCeil', -1);
  const midCeil = getParam(effect, 'midCeil', -1);
  const highCeil = getParam(effect, 'highCeil', -1);
  const lowGain = getParam(effect, 'lowGain', 1);
  const midGain = getParam(effect, 'midGain', 1);
  const highGain = getParam(effect, 'highGain', 1);
  const release = getParam(effect, 'release', 50);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#4338ca" />
      <Section>
        <SectionHeader size="lg" color="#4338ca" title="Crossover" />
        <div className="flex justify-around items-end">
          <Knob value={lowCross} min={40} max={1000} onChange={(v) => onUpdateParameter('lowCross', v)}
            label="Low X" color="#4338ca" formatValue={(v) => `${Math.round(v)} Hz`} />
          <Knob value={highCross} min={500} max={10000} onChange={(v) => onUpdateParameter('highCross', v)}
            label="High X" color="#6366f1" formatValue={(v) => `${(v / 1000).toFixed(1)}k`} />
        </div>
      </Section>
      <Section>
        <SectionHeader size="lg" color="#6366f1" title="Band Ceilings" />
        <div className="flex justify-around items-end">
          <Knob value={lowCeil} min={-12} max={0} onChange={(v) => onUpdateParameter('lowCeil', v)}
            label="Low" color="#4338ca" formatValue={(v) => `${v.toFixed(1)} dB`} />
          <Knob value={midCeil} min={-12} max={0} onChange={(v) => onUpdateParameter('midCeil', v)}
            label="Mid" color="#6366f1" formatValue={(v) => `${v.toFixed(1)} dB`} />
          <Knob value={highCeil} min={-12} max={0} onChange={(v) => onUpdateParameter('highCeil', v)}
            label="High" color="#818cf8" formatValue={(v) => `${v.toFixed(1)} dB`} />
        </div>
      </Section>
      <Section>
        <SectionHeader size="lg" color="#818cf8" title="Band Gains" />
        <div className="flex justify-around items-end">
          <Knob value={lowGain} min={0} max={4} onChange={(v) => onUpdateParameter('lowGain', v)}
            label="Low" color="#4338ca" formatValue={(v) => v.toFixed(2)} />
          <Knob value={midGain} min={0} max={4} onChange={(v) => onUpdateParameter('midGain', v)}
            label="Mid" color="#6366f1" formatValue={(v) => v.toFixed(2)} />
          <Knob value={highGain} min={0} max={4} onChange={(v) => onUpdateParameter('highGain', v)}
            label="High" color="#818cf8" formatValue={(v) => v.toFixed(2)} />
          <Knob value={release} min={5} max={500} onChange={(v) => onUpdateParameter('release', v)}
            label="Release" color="#a5b4fc" formatValue={(v) => `${Math.round(v)} ms`} />
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
// MAXIMIZER
// ============================================================================

export const MaximizerEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const ceiling = getParam(effect, 'ceiling', -0.3);
  const release = getParam(effect, 'release', 50);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#b91c1c" />
      <Section>
        <SectionHeader size="lg" color="#b91c1c" title="Maximizer" />
        <div className="flex justify-around items-end">
          <Knob value={ceiling} min={-6} max={0} onChange={(v) => onUpdateParameter('ceiling', v)}
            label="Ceiling" color="#b91c1c" formatValue={(v) => `${v.toFixed(1)} dB`} />
          <Knob value={release} min={5} max={500} onChange={(v) => onUpdateParameter('release', v)}
            label="Release" color="#dc2626" formatValue={(v) => `${Math.round(v)} ms`} />
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#6b7280" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
    </div>
  );
};

// ============================================================================
// AGC (Auto Gain Control)
// ============================================================================

export const AGCEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const target = getParam(effect, 'target', -12);
  const speed = getParam(effect, 'speed', 0.1);
  const maxGain = getParam(effect, 'maxGain', 12);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#16a34a" />
      <Section>
        <SectionHeader size="lg" color="#16a34a" title="Auto Gain" />
        <div className="flex justify-around items-end">
          <Knob value={target} min={-24} max={0} onChange={(v) => onUpdateParameter('target', v)}
            label="Target" color="#16a34a" formatValue={(v) => `${v.toFixed(0)} dB`} />
          <Knob value={speed} min={0.01} max={1} onChange={(v) => onUpdateParameter('speed', v)}
            label="Speed" color="#22c55e" formatValue={(v) => v.toFixed(2)} />
          <Knob value={maxGain} min={0} max={24} onChange={(v) => onUpdateParameter('maxGain', v)}
            label="Max Gain" color="#4ade80" formatValue={(v) => `${v.toFixed(0)} dB`} />
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
// BEAT BREATHER
// ============================================================================

export const BeatBreatherEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const transientBoost = getParam(effect, 'transientBoost', 0);
  const sustainBoost = getParam(effect, 'sustainBoost', 0);
  const sensitivity = getParam(effect, 'sensitivity', 0.5);
  const attack = getParam(effect, 'attack', 5);
  const release = getParam(effect, 'release', 100);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#ea580c" />
      <Section>
        <SectionHeader size="lg" color="#ea580c" title="Beat Breather" />
        <div className="flex justify-around items-end flex-wrap gap-y-4">
          <Knob value={transientBoost} min={-12} max={12} onChange={(v) => onUpdateParameter('transientBoost', v)}
            label="Transient" color="#ea580c" formatValue={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`} />
          <Knob value={sustainBoost} min={-12} max={12} onChange={(v) => onUpdateParameter('sustainBoost', v)}
            label="Sustain" color="#f97316" formatValue={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`} />
          <Knob value={sensitivity} min={0} max={1} onChange={(v) => onUpdateParameter('sensitivity', v)}
            label="Sense" color="#fb923c" formatValue={(v) => `${Math.round(v * 100)}%`} />
        </div>
      </Section>
      <Section>
        <div className="flex justify-around items-end">
          <Knob value={attack} min={0.5} max={50} onChange={(v) => onUpdateParameter('attack', v)}
            label="Attack" color="#fdba74" formatValue={(v) => `${v.toFixed(1)} ms`} />
          <Knob value={release} min={5} max={1000} onChange={(v) => onUpdateParameter('release', v)}
            label="Release" color="#fdba74" formatValue={(v) => `${Math.round(v)} ms`} />
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#6b7280" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
    </div>
  );
};

// ============================================================================
// DUCKA
// ============================================================================

export const DuckaEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const threshold = getParam(effect, 'threshold', -20);
  const drop = getParam(effect, 'drop', 0.5);
  const release = getParam(effect, 'release', 200);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#7c2d12" />
      <Section>
        <SectionHeader size="lg" color="#7c2d12" title="Ducka" />
        <div className="flex justify-around items-end">
          <Knob value={threshold} min={-60} max={0} onChange={(v) => onUpdateParameter('threshold', v)}
            label="Threshold" color="#7c2d12" formatValue={(v) => `${v.toFixed(0)} dB`} />
          <Knob value={drop} min={0} max={1} onChange={(v) => onUpdateParameter('drop', v)}
            label="Drop" color="#9a3412" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={release} min={5} max={2000} onChange={(v) => onUpdateParameter('release', v)}
            label="Release" color="#c2410c" formatValue={(v) => `${Math.round(v)} ms`} />
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#6b7280" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
    </div>
  );
};

// ============================================================================
// PANDA (compressor)
// ============================================================================

export const PandaEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const threshold = getParam(effect, 'threshold', -20);
  const factor = getParam(effect, 'factor', 0.5);
  const release = getParam(effect, 'release', 100);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#1e3a5f" />
      <Section>
        <SectionHeader size="lg" color="#1e3a5f" title="Panda" />
        <div className="flex justify-around items-end">
          <Knob value={threshold} min={-60} max={0} onChange={(v) => onUpdateParameter('threshold', v)}
            label="Threshold" color="#1e3a5f" formatValue={(v) => `${v.toFixed(0)} dB`} />
          <Knob value={factor} min={0} max={1} onChange={(v) => onUpdateParameter('factor', v)}
            label="Factor" color="#2563eb" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={release} min={5} max={2000} onChange={(v) => onUpdateParameter('release', v)}
            label="Release" color="#3b82f6" formatValue={(v) => `${Math.round(v)} ms`} />
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#6b7280" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
    </div>
  );
};

// ============================================================================
// MULTIBAND CLIPPER
// ============================================================================

export const MultibandClipperEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const lowCross = getParam(effect, 'lowCross', 200);
  const highCross = getParam(effect, 'highCross', 4000);
  const lowCeil = getParam(effect, 'lowCeil', -3);
  const midCeil = getParam(effect, 'midCeil', -3);
  const highCeil = getParam(effect, 'highCeil', -3);
  const softness = getParam(effect, 'softness', 0.5);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#be123c" />
      <Section>
        <SectionHeader size="lg" color="#be123c" title="Crossover" />
        <div className="flex justify-around items-end">
          <Knob value={lowCross} min={40} max={1000} onChange={(v) => onUpdateParameter('lowCross', v)}
            label="Low X" color="#be123c" formatValue={(v) => `${Math.round(v)} Hz`} />
          <Knob value={highCross} min={500} max={12000} onChange={(v) => onUpdateParameter('highCross', v)}
            label="High X" color="#e11d48" formatValue={(v) => `${(v / 1000).toFixed(1)}k`} />
        </div>
      </Section>
      <Section>
        <SectionHeader size="lg" color="#e11d48" title="Band Ceilings" />
        <div className="flex justify-around items-end">
          <Knob value={lowCeil} min={-12} max={0} onChange={(v) => onUpdateParameter('lowCeil', v)}
            label="Low" color="#be123c" formatValue={(v) => `${v.toFixed(1)} dB`} />
          <Knob value={midCeil} min={-12} max={0} onChange={(v) => onUpdateParameter('midCeil', v)}
            label="Mid" color="#e11d48" formatValue={(v) => `${v.toFixed(1)} dB`} />
          <Knob value={highCeil} min={-12} max={0} onChange={(v) => onUpdateParameter('highCeil', v)}
            label="High" color="#f43f5e" formatValue={(v) => `${v.toFixed(1)} dB`} />
          <Knob value={softness} min={0} max={1} onChange={(v) => onUpdateParameter('softness', v)}
            label="Soft" color="#fb7185" formatValue={(v) => `${Math.round(v * 100)}%`} />
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
// MULTIBAND DYNAMICS
// ============================================================================

export const MultibandDynamicsEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const lowCross = getParam(effect, 'lowCross', 200);
  const highCross = getParam(effect, 'highCross', 4000);
  const lowExpThresh = getParam(effect, 'lowExpThresh', -40);
  const midExpThresh = getParam(effect, 'midExpThresh', -40);
  const highExpThresh = getParam(effect, 'highExpThresh', -40);
  const lowCompThresh = getParam(effect, 'lowCompThresh', -12);
  const midCompThresh = getParam(effect, 'midCompThresh', -12);
  const highCompThresh = getParam(effect, 'highCompThresh', -12);
  const ratio = getParam(effect, 'ratio', 4);
  const attack = getParam(effect, 'attack', 10);
  const release = getParam(effect, 'release', 100);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#4c1d95" />
      <Section>
        <SectionHeader size="lg" color="#4c1d95" title="Crossover" />
        <div className="flex justify-around items-end">
          <Knob value={lowCross} min={40} max={1000} onChange={(v) => onUpdateParameter('lowCross', v)}
            label="Low X" color="#4c1d95" formatValue={(v) => `${Math.round(v)} Hz`} />
          <Knob value={highCross} min={500} max={12000} onChange={(v) => onUpdateParameter('highCross', v)}
            label="High X" color="#6d28d9" formatValue={(v) => `${(v / 1000).toFixed(1)}k`} />
        </div>
      </Section>
      <Section>
        <SectionHeader size="lg" color="#6d28d9" title="Expander Thresholds" />
        <div className="flex justify-around items-end">
          <Knob value={lowExpThresh} min={-60} max={0} onChange={(v) => onUpdateParameter('lowExpThresh', v)}
            label="Low" color="#4c1d95" formatValue={(v) => `${v.toFixed(0)}`} />
          <Knob value={midExpThresh} min={-60} max={0} onChange={(v) => onUpdateParameter('midExpThresh', v)}
            label="Mid" color="#6d28d9" formatValue={(v) => `${v.toFixed(0)}`} />
          <Knob value={highExpThresh} min={-60} max={0} onChange={(v) => onUpdateParameter('highExpThresh', v)}
            label="High" color="#7c3aed" formatValue={(v) => `${v.toFixed(0)}`} />
        </div>
      </Section>
      <Section>
        <SectionHeader size="lg" color="#7c3aed" title="Compressor Thresholds" />
        <div className="flex justify-around items-end">
          <Knob value={lowCompThresh} min={-60} max={0} onChange={(v) => onUpdateParameter('lowCompThresh', v)}
            label="Low" color="#6d28d9" formatValue={(v) => `${v.toFixed(0)}`} />
          <Knob value={midCompThresh} min={-60} max={0} onChange={(v) => onUpdateParameter('midCompThresh', v)}
            label="Mid" color="#7c3aed" formatValue={(v) => `${v.toFixed(0)}`} />
          <Knob value={highCompThresh} min={-60} max={0} onChange={(v) => onUpdateParameter('highCompThresh', v)}
            label="High" color="#8b5cf6" formatValue={(v) => `${v.toFixed(0)}`} />
        </div>
      </Section>
      <Section>
        <div className="flex justify-around items-end">
          <Knob value={ratio} min={1} max={20} onChange={(v) => onUpdateParameter('ratio', v)}
            label="Ratio" color="#a78bfa" formatValue={(v) => `${v.toFixed(1)}:1`} />
          <Knob value={attack} min={0.1} max={200} onChange={(v) => onUpdateParameter('attack', v)}
            label="Attack" color="#a78bfa" formatValue={(v) => `${v.toFixed(1)} ms`} />
          <Knob value={release} min={5} max={2000} onChange={(v) => onUpdateParameter('release', v)}
            label="Release" color="#c4b5fd" formatValue={(v) => `${Math.round(v)} ms`} />
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#6b7280" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
    </div>
  );
};

// ============================================================================
// MULTIBAND EXPANDER
// ============================================================================

export const MultibandExpanderEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const lowCross = getParam(effect, 'lowCross', 200);
  const highCross = getParam(effect, 'highCross', 4000);
  const lowThresh = getParam(effect, 'lowThresh', -40);
  const midThresh = getParam(effect, 'midThresh', -40);
  const highThresh = getParam(effect, 'highThresh', -40);
  const ratio = getParam(effect, 'ratio', 2);
  const attack = getParam(effect, 'attack', 5);
  const release = getParam(effect, 'release', 100);
  const range = getParam(effect, 'range', -40);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#1e40af" />
      <Section>
        <SectionHeader size="lg" color="#1e40af" title="Crossover" />
        <div className="flex justify-around items-end">
          <Knob value={lowCross} min={40} max={1000} onChange={(v) => onUpdateParameter('lowCross', v)}
            label="Low X" color="#1e40af" formatValue={(v) => `${Math.round(v)} Hz`} />
          <Knob value={highCross} min={500} max={12000} onChange={(v) => onUpdateParameter('highCross', v)}
            label="High X" color="#2563eb" formatValue={(v) => `${(v / 1000).toFixed(1)}k`} />
        </div>
      </Section>
      <Section>
        <SectionHeader size="lg" color="#2563eb" title="Bands" />
        <div className="flex justify-around items-end">
          <Knob value={lowThresh} min={-60} max={0} onChange={(v) => onUpdateParameter('lowThresh', v)}
            label="Low Thr" color="#1e40af" formatValue={(v) => `${v.toFixed(0)} dB`} />
          <Knob value={midThresh} min={-60} max={0} onChange={(v) => onUpdateParameter('midThresh', v)}
            label="Mid Thr" color="#2563eb" formatValue={(v) => `${v.toFixed(0)} dB`} />
          <Knob value={highThresh} min={-60} max={0} onChange={(v) => onUpdateParameter('highThresh', v)}
            label="Hi Thr" color="#3b82f6" formatValue={(v) => `${v.toFixed(0)} dB`} />
        </div>
      </Section>
      <Section>
        <div className="flex justify-around items-end">
          <Knob value={ratio} min={1} max={20} onChange={(v) => onUpdateParameter('ratio', v)}
            label="Ratio" color="#60a5fa" formatValue={(v) => `${v.toFixed(1)}:1`} />
          <Knob value={range} min={-80} max={0} onChange={(v) => onUpdateParameter('range', v)}
            label="Range" color="#60a5fa" formatValue={(v) => `${v.toFixed(0)} dB`} />
          <Knob value={attack} min={0.1} max={100} onChange={(v) => onUpdateParameter('attack', v)}
            label="Attack" color="#93c5fd" formatValue={(v) => `${v.toFixed(1)} ms`} />
          <Knob value={release} min={5} max={2000} onChange={(v) => onUpdateParameter('release', v)}
            label="Release" color="#93c5fd" formatValue={(v) => `${Math.round(v)} ms`} />
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
