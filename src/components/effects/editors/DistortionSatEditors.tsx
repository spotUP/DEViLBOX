/**
 * DistortionSatEditors.tsx — Zynthian-ported distortion/saturation effect editors
 *
 * Overdrive, tube amp, saturator, exciter, cabinet sim, and more.
 */

import React from 'react';
import { useEffectAnalyser } from '@hooks/useEffectAnalyser';
import { EffectOscilloscope } from '../EffectVisualizer';
import { Knob } from '@components/controls/Knob';
import { SectionHeader, getParam, type VisualEffectEditorProps } from './shared';

const Section: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
    {children}
  </section>
);

// ============================================================================
// OVERDRIVE
// ============================================================================

export const OverdriveEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const drive = getParam(effect, 'drive', 50);
  const tone = getParam(effect, 'tone', 50);
  const mix = getParam(effect, 'mix', 100);
  const level = getParam(effect, 'level', 50);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#dc2626" />
      <Section>
        <SectionHeader size="lg" color="#dc2626" title="Overdrive" />
        <div className="flex justify-around items-end">
          <Knob value={drive} min={0} max={100} onChange={(v) => onUpdateParameter('drive', v)}
            label="Drive" color="#dc2626" formatValue={(v) => `${Math.round(v)}%`} />
          <Knob value={tone} min={0} max={100} onChange={(v) => onUpdateParameter('tone', v)}
            label="Tone" color="#ef4444" formatValue={(v) => `${Math.round(v)}%`} />
          <Knob value={level} min={0} max={100} onChange={(v) => onUpdateParameter('level', v)}
            label="Level" color="#f87171" formatValue={(v) => `${Math.round(v)}%`} />
          <Knob value={mix} min={0} max={100} onChange={(v) => onUpdateParameter('mix', v)}
            label="Int. Mix" color="#fca5a5" formatValue={(v) => `${Math.round(v)}%`} />
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
// SATURATOR
// ============================================================================

export const SaturatorEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const drive = getParam(effect, 'drive', 0.5);
  const blend = getParam(effect, 'blend', 0.5);
  const preFreq = getParam(effect, 'preFreq', 20000);
  const postFreq = getParam(effect, 'postFreq', 20000);
  const mix = getParam(effect, 'mix', 1);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#ea580c" />
      <Section>
        <SectionHeader size="lg" color="#ea580c" title="Saturator" />
        <div className="flex justify-around items-end">
          <Knob value={drive} min={0} max={1} onChange={(v) => onUpdateParameter('drive', v)}
            label="Drive" color="#ea580c" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={blend} min={0} max={1} onChange={(v) => onUpdateParameter('blend', v)}
            label="Blend" color="#f97316" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={mix} min={0} max={1} onChange={(v) => onUpdateParameter('mix', v)}
            label="Int. Mix" color="#fb923c" formatValue={(v) => `${Math.round(v * 100)}%`} />
        </div>
      </Section>
      <Section>
        <SectionHeader size="lg" color="#fb923c" title="Tone" />
        <div className="flex justify-around items-end">
          <Knob value={preFreq} min={200} max={20000} onChange={(v) => onUpdateParameter('preFreq', v)}
            label="Pre LPF" color="#fb923c" formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`} />
          <Knob value={postFreq} min={200} max={20000} onChange={(v) => onUpdateParameter('postFreq', v)}
            label="Post LPF" color="#fdba74" formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`} />
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#6b7280" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
    </div>
  );
};

// ============================================================================
// EXCITER
// ============================================================================

export const ExciterEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const frequency = getParam(effect, 'frequency', 3000);
  const amount = getParam(effect, 'amount', 0.5);
  const blend = getParam(effect, 'blend', 0.5);
  const ceil = getParam(effect, 'ceil', 16000);
  const mix = getParam(effect, 'mix', 1);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#eab308" />
      <Section>
        <SectionHeader size="lg" color="#eab308" title="Exciter" />
        <div className="flex justify-around items-end flex-wrap gap-y-4">
          <Knob value={frequency} min={500} max={12000} onChange={(v) => onUpdateParameter('frequency', v)}
            label="Frequency" color="#eab308" formatValue={(v) => `${(v / 1000).toFixed(1)}k`} />
          <Knob value={amount} min={0} max={1} onChange={(v) => onUpdateParameter('amount', v)}
            label="Amount" color="#facc15" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={blend} min={0} max={1} onChange={(v) => onUpdateParameter('blend', v)}
            label="Blend" color="#fde047" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={ceil} min={2000} max={20000} onChange={(v) => onUpdateParameter('ceil', v)}
            label="Ceiling" color="#fef08a" formatValue={(v) => `${(v / 1000).toFixed(1)}k`} />
          <Knob value={mix} min={0} max={1} onChange={(v) => onUpdateParameter('mix', v)}
            label="Int. Mix" color="#fbbf24" formatValue={(v) => `${Math.round(v * 100)}%`} />
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
// AUTO-SAT
// ============================================================================

export const AutoSatEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const amount = getParam(effect, 'amount', 0.5);
  const mix = getParam(effect, 'mix', 1);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#b45309" />
      <Section>
        <SectionHeader size="lg" color="#b45309" title="Auto Saturation" />
        <div className="flex justify-around items-end">
          <Knob value={amount} min={0} max={1} onChange={(v) => onUpdateParameter('amount', v)}
            label="Amount" color="#b45309" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={mix} min={0} max={1} onChange={(v) => onUpdateParameter('mix', v)}
            label="Int. Mix" color="#d97706" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#6b7280" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
    </div>
  );
};

// ============================================================================
// SATMA
// ============================================================================

export const SatmaEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const distortion = getParam(effect, 'distortion', 0.5);
  const tone = getParam(effect, 'tone', 0.5);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#92400e" />
      <Section>
        <SectionHeader size="lg" color="#92400e" title="Satma" />
        <div className="flex justify-around items-end">
          <Knob value={distortion} min={0} max={1} onChange={(v) => onUpdateParameter('distortion', v)}
            label="Distortion" color="#92400e" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={tone} min={0} max={1} onChange={(v) => onUpdateParameter('tone', v)}
            label="Tone" color="#b45309" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#6b7280" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
    </div>
  );
};

// ============================================================================
// DISTORTION SHAPER
// ============================================================================

export const DistortionShaperEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const inputGain = getParam(effect, 'inputGain', 1);
  const outputGain = getParam(effect, 'outputGain', 1);
  const point1x = getParam(effect, 'point1x', -0.5);
  const point1y = getParam(effect, 'point1y', -0.8);
  const point2x = getParam(effect, 'point2x', 0.5);
  const point2y = getParam(effect, 'point2y', 0.8);
  const preLpf = getParam(effect, 'preLpf', 20000);
  const postLpf = getParam(effect, 'postLpf', 20000);
  const mix = getParam(effect, 'mix', 1);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#991b1b" />
      <Section>
        <SectionHeader size="lg" color="#991b1b" title="Gain" />
        <div className="flex justify-around items-end">
          <Knob value={inputGain} min={0} max={4} onChange={(v) => onUpdateParameter('inputGain', v)}
            label="Input" color="#991b1b" formatValue={(v) => v.toFixed(2)} />
          <Knob value={outputGain} min={0} max={4} onChange={(v) => onUpdateParameter('outputGain', v)}
            label="Output" color="#b91c1c" formatValue={(v) => v.toFixed(2)} />
          <Knob value={mix} min={0} max={1} onChange={(v) => onUpdateParameter('mix', v)}
            label="Int. Mix" color="#dc2626" formatValue={(v) => `${Math.round(v * 100)}%`} />
        </div>
      </Section>
      <Section>
        <SectionHeader size="lg" color="#dc2626" title="Curve Shape" />
        <div className="flex justify-around items-end flex-wrap gap-y-4">
          <Knob value={point1x} min={-1} max={0} onChange={(v) => onUpdateParameter('point1x', v)}
            label="P1 X" size="sm" color="#dc2626" formatValue={(v) => v.toFixed(2)} />
          <Knob value={point1y} min={-1} max={0} onChange={(v) => onUpdateParameter('point1y', v)}
            label="P1 Y" size="sm" color="#ef4444" formatValue={(v) => v.toFixed(2)} />
          <Knob value={point2x} min={0} max={1} onChange={(v) => onUpdateParameter('point2x', v)}
            label="P2 X" size="sm" color="#dc2626" formatValue={(v) => v.toFixed(2)} />
          <Knob value={point2y} min={0} max={1} onChange={(v) => onUpdateParameter('point2y', v)}
            label="P2 Y" size="sm" color="#ef4444" formatValue={(v) => v.toFixed(2)} />
        </div>
      </Section>
      <Section>
        <SectionHeader size="lg" color="#ef4444" title="Filters" />
        <div className="flex justify-around items-end">
          <Knob value={preLpf} min={200} max={20000} onChange={(v) => onUpdateParameter('preLpf', v)}
            label="Pre LPF" color="#ef4444" formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`} />
          <Knob value={postLpf} min={200} max={20000} onChange={(v) => onUpdateParameter('postLpf', v)}
            label="Post LPF" color="#f87171" formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`} />
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#6b7280" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
    </div>
  );
};

// ============================================================================
// TUBE AMP
// ============================================================================

export const TubeAmpEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const drive = getParam(effect, 'drive', 50);
  const bass = getParam(effect, 'bass', 50);
  const mid = getParam(effect, 'mid', 50);
  const treble = getParam(effect, 'treble', 50);
  const presence = getParam(effect, 'presence', 50);
  const master = getParam(effect, 'master', 50);
  const sag = getParam(effect, 'sag', 20);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#92400e" />
      <Section>
        <SectionHeader size="lg" color="#92400e" title="Preamp" />
        <div className="flex justify-around items-end">
          <Knob value={drive} min={0} max={100} onChange={(v) => onUpdateParameter('drive', v)}
            label="Drive" color="#92400e" formatValue={(v) => `${Math.round(v)}%`} />
          <Knob value={sag} min={0} max={100} onChange={(v) => onUpdateParameter('sag', v)}
            label="Sag" color="#b45309" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
      <Section>
        <SectionHeader size="lg" color="#b45309" title="Tone Stack" />
        <div className="flex justify-around items-end flex-wrap gap-y-4">
          <Knob value={bass} min={0} max={100} onChange={(v) => onUpdateParameter('bass', v)}
            label="Bass" color="#78350f" formatValue={(v) => `${Math.round(v)}%`} />
          <Knob value={mid} min={0} max={100} onChange={(v) => onUpdateParameter('mid', v)}
            label="Mid" color="#92400e" formatValue={(v) => `${Math.round(v)}%`} />
          <Knob value={treble} min={0} max={100} onChange={(v) => onUpdateParameter('treble', v)}
            label="Treble" color="#b45309" formatValue={(v) => `${Math.round(v)}%`} />
          <Knob value={presence} min={0} max={100} onChange={(v) => onUpdateParameter('presence', v)}
            label="Presence" color="#d97706" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
      <Section>
        <div className="flex justify-around items-end">
          <Knob value={master} min={0} max={100} onChange={(v) => onUpdateParameter('master', v)}
            label="Master" color="#fbbf24" formatValue={(v) => `${Math.round(v)}%`} />
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#6b7280" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
    </div>
  );
};

// ============================================================================
// CABINET SIM
// ============================================================================

export const CabinetSimEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const cabinet = getParam(effect, 'cabinet', 0);
  const brightness = getParam(effect, 'brightness', 50);
  const mix = getParam(effect, 'mix', 100);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  const CAB_MODELS = ['1x8', '1x12', '2x12', '4x10', '4x12', '8x10', 'Open', 'Closed'] as const;

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#78350f" />
      <Section>
        <SectionHeader size="lg" color="#78350f" title="Cabinet" />
        <div className="grid grid-cols-4 gap-1.5 mb-4">
          {CAB_MODELS.map((label, i) => (
            <button key={i} onClick={() => onUpdateParameter('cabinet', i)}
              className={`px-2 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                Math.round(cabinet) === i ? 'bg-amber-800/70 border-amber-600 text-amber-100' : 'bg-black/40 border-dark-border text-text-muted hover:border-amber-800'
              }`}>{label}</button>
          ))}
        </div>
        <div className="flex justify-around items-end">
          <Knob value={brightness} min={0} max={100} onChange={(v) => onUpdateParameter('brightness', v)}
            label="Bright" color="#92400e" formatValue={(v) => `${Math.round(v)}%`} />
          <Knob value={mix} min={0} max={100} onChange={(v) => onUpdateParameter('mix', v)}
            label="Int. Mix" color="#b45309" formatValue={(v) => `${Math.round(v)}%`} />
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
// DRIVA
// ============================================================================

export const DrivaEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const amount = getParam(effect, 'amount', 0.5);
  const tone = getParam(effect, 'tone', 0);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#c2410c" />
      <Section>
        <SectionHeader size="lg" color="#c2410c" title="Driva" />
        <div className="flex justify-around items-end">
          <Knob value={amount} min={0} max={1} onChange={(v) => onUpdateParameter('amount', v)}
            label="Amount" color="#c2410c" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={tone} min={-1} max={1} onChange={(v) => onUpdateParameter('tone', v)}
            label="Tone" color="#ea580c" formatValue={(v) => v.toFixed(2)} />
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#6b7280" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
    </div>
  );
};

// ============================================================================
// BASS ENHANCER
// ============================================================================

export const BassEnhancerEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const frequency = getParam(effect, 'frequency', 100);
  const amount = getParam(effect, 'amount', 0.5);
  const drive = getParam(effect, 'drive', 0);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#7c2d12" />
      <Section>
        <SectionHeader size="lg" color="#7c2d12" title="Bass Enhancer" />
        <div className="flex justify-around items-end">
          <Knob value={frequency} min={20} max={500} onChange={(v) => onUpdateParameter('frequency', v)}
            label="Frequency" color="#7c2d12" formatValue={(v) => `${Math.round(v)} Hz`} />
          <Knob value={amount} min={0} max={1} onChange={(v) => onUpdateParameter('amount', v)}
            label="Amount" color="#9a3412" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={drive} min={0} max={1} onChange={(v) => onUpdateParameter('drive', v)}
            label="Drive" color="#c2410c" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#6b7280" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
    </div>
  );
};

// ============================================================================
// SWEDISH CHAINSAW — Boss HM-2 + JCM800 tonestack
// ============================================================================

export const SwedishChainsawEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const tight = getParam(effect, 'tight', 0);
  const pedalGain = getParam(effect, 'pedalGain', 50);
  const ampGain = getParam(effect, 'ampGain', 50);
  const bass = getParam(effect, 'bass', 5);
  const middle = getParam(effect, 'middle', 50);
  const treble = getParam(effect, 'treble', 50);
  const volume = getParam(effect, 'volume', 50);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#dc2626" />
      <Section>
        <SectionHeader size="lg" color="#dc2626" title="HM-2 Pedal" />
        <div className="flex justify-around items-end">
          <Knob value={pedalGain} min={0} max={100} onChange={(v) => onUpdateParameter('pedalGain', v)}
            label="Gain" color="#dc2626" formatValue={(v) => `${Math.round(v)}%`} />
          <Knob value={tight} min={0} max={100} onChange={(v) => onUpdateParameter('tight', v > 50 ? 100 : 0)}
            label="Tight" color="#b91c1c" formatValue={(v) => v > 50 ? 'ON' : 'OFF'} />
        </div>
      </Section>
      <Section>
        <SectionHeader size="lg" color="#92400e" title="Amplifier" />
        <div className="flex justify-around items-end">
          <Knob value={ampGain} min={0} max={100} onChange={(v) => onUpdateParameter('ampGain', v)}
            label="Amp Gain" color="#92400e" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
      <Section>
        <SectionHeader size="lg" color="#b45309" title="Tone Stack" />
        <div className="flex justify-around items-end">
          <Knob value={bass} min={0} max={100} onChange={(v) => onUpdateParameter('bass', v)}
            label="Bass" color="#78350f" formatValue={(v) => `${Math.round(v)}%`} />
          <Knob value={middle} min={0} max={100} onChange={(v) => onUpdateParameter('middle', v)}
            label="Middle" color="#92400e" formatValue={(v) => `${Math.round(v)}%`} />
          <Knob value={treble} min={0} max={100} onChange={(v) => onUpdateParameter('treble', v)}
            label="Treble" color="#b45309" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
      <Section>
        <div className="flex justify-around items-end">
          <Knob value={volume} min={0} max={100} onChange={(v) => onUpdateParameter('volume', v)}
            label="Volume" color="#fbbf24" formatValue={(v) => `${Math.round(v)}%`} />
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#6b7280" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </Section>
    </div>
  );
};
