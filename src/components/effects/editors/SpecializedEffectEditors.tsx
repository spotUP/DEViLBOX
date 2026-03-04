/**
 * Specialized effect editors: AutoPanner, AutoWah, BitCrusher, Chebyshev,
 * FrequencyShifter, PitchShift, JCReverb, StereoWidener
 */

import React from 'react';
import { useEffectAnalyser } from '@hooks/useEffectAnalyser';
import { EffectOscilloscope, EffectSpectrum, WaveshaperCurve } from '../EffectVisualizer';
import { Knob } from '@components/controls/Knob';
import { SectionHeader, getParam, type VisualEffectEditorProps } from './shared';

// ============================================================================
// AUTO PANNER
// ============================================================================

export const AutoPannerEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
}) => {
  const frequency = getParam(effect, 'frequency', 1);
  const depth = getParam(effect, 'depth', 1);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#22c55e" />
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader color="#22c55e" title="Auto Panner" />
        <div className="flex justify-around items-end">
          <Knob
            value={frequency}
            min={0}
            max={20}
            onChange={(v) => onUpdateParameter('frequency', v)}
            label="Rate"
            color="#22c55e"
            formatValue={(v) => `${v.toFixed(1)}Hz`}
          />
          <Knob
            value={depth}
            min={0}
            max={1}
            onChange={(v) => onUpdateParameter('depth', v)}
            label="Depth"
            color="#22c55e"
            formatValue={(v) => `${Math.round(v * 100)}%`}
          />
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
// AUTO WAH
// ============================================================================

export const AutoWahEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
}) => {
  const baseFrequency = getParam(effect, 'baseFrequency', 100);
  const octaves = getParam(effect, 'octaves', 6);
  const sensitivity = getParam(effect, 'sensitivity', 0);
  const Q = getParam(effect, 'Q', 2);
  const { pre, post } = useEffectAnalyser(effect.id, 'fft');

  return (
    <div className="space-y-4">
      <EffectSpectrum pre={pre} post={post} color="#f43f5e" />
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader color="#f43f5e" title="Auto Wah" />
        <div className="flex justify-around items-end">
          <Knob
            value={baseFrequency}
            min={50}
            max={500}
            onChange={(v) => onUpdateParameter('baseFrequency', v)}
            label="Base Freq"
            size="sm"
            color="#f43f5e"
            formatValue={(v) => `${Math.round(v)}Hz`}
          />
          <Knob
            value={octaves}
            min={0}
            max={8}
            onChange={(v) => onUpdateParameter('octaves', v)}
            label="Octaves"
            size="sm"
            color="#f43f5e"
            formatValue={(v) => v.toFixed(1)}
          />
          <Knob
            value={sensitivity}
            min={-40}
            max={0}
            onChange={(v) => onUpdateParameter('sensitivity', v)}
            label="Sens"
            size="sm"
            color="#f43f5e"
            formatValue={(v) => `${Math.round(v)}dB`}
          />
          <Knob
            value={Q}
            min={0}
            max={10}
            onChange={(v) => onUpdateParameter('Q', v)}
            label="Q"
            size="sm"
            color="#f43f5e"
            formatValue={(v) => v.toFixed(1)}
          />
        </div>
      </section>
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <div className="flex justify-center">
          <Knob
            value={effect.wet}
            min={0}
            max={100}
            onChange={onUpdateWet}
            label="Mix"
            color="#fb7185"
            formatValue={(v) => `${Math.round(v)}%`}
          />
        </div>
      </section>
    </div>
  );
};

// ============================================================================
// BIT CRUSHER
// ============================================================================

export const BitCrusherEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
}) => {
  const bits = getParam(effect, 'bits', 4);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#84cc16" />
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader color="#84cc16" title="Bit Crusher" />
        <div className="flex justify-around items-end">
          <Knob
            value={bits}
            min={1}
            max={16}
            onChange={(v) => onUpdateParameter('bits', Math.round(v))}
            label="Bits"
            size="lg"
            color="#84cc16"
            formatValue={(v) => `${Math.round(v)} bit`}
          />
          <Knob
            value={effect.wet}
            min={0}
            max={100}
            onChange={onUpdateWet}
            label="Mix"
            size="lg"
            color="#a3e635"
            formatValue={(v) => `${Math.round(v)}%`}
          />
        </div>
      </section>
    </div>
  );
};

// ============================================================================
// CHEBYSHEV
// ============================================================================

export const ChebyshevEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
}) => {
  const order = getParam(effect, 'order', 2);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#f59e0b" />
      <WaveshaperCurve type="Chebyshev" order={order} color="#f59e0b" height={100} />
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader color="#f59e0b" title="Chebyshev Waveshaper" />
        <div className="flex justify-around items-end">
          <Knob
            value={order}
            min={1}
            max={100}
            onChange={(v) => onUpdateParameter('order', Math.round(v))}
            label="Order"
            size="lg"
            color="#f59e0b"
            formatValue={(v) => Math.round(v).toString()}
          />
          <Knob
            value={effect.wet}
            min={0}
            max={100}
            onChange={onUpdateWet}
            label="Mix"
            size="lg"
            color="#fbbf24"
            formatValue={(v) => `${Math.round(v)}%`}
          />
        </div>
      </section>
    </div>
  );
};

// ============================================================================
// FREQUENCY SHIFTER
// ============================================================================

export const FrequencyShifterEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
}) => {
  const frequency = getParam(effect, 'frequency', 0);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#06b6d4" />
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader color="#06b6d4" title="Frequency Shifter" />
        <div className="flex justify-around items-end">
          <Knob
            value={frequency}
            min={-1000}
            max={1000}
            onChange={(v) => onUpdateParameter('frequency', v)}
            label="Shift"
            size="lg"
            color="#06b6d4"
            bipolar
            formatValue={(v) => `${Math.round(v)}Hz`}
          />
          <Knob
            value={effect.wet}
            min={0}
            max={100}
            onChange={onUpdateWet}
            label="Mix"
            size="lg"
            color="#22d3ee"
            formatValue={(v) => `${Math.round(v)}%`}
          />
        </div>
      </section>
    </div>
  );
};

// ============================================================================
// PITCH SHIFT
// ============================================================================

export const PitchShiftEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
}) => {
  const pitch = getParam(effect, 'pitch', 0);
  const windowSize = getParam(effect, 'windowSize', 0.1);
  const feedback = getParam(effect, 'feedback', 0);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#8b5cf6" />
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader color="#8b5cf6" title="Pitch Shift" />
        <div className="flex justify-around items-end">
          <Knob
            value={pitch}
            min={-12}
            max={12}
            onChange={(v) => onUpdateParameter('pitch', Math.round(v))}
            label="Pitch"
            color="#8b5cf6"
            bipolar
            formatValue={(v) => `${Math.round(v) > 0 ? '+' : ''}${Math.round(v)}st`}
          />
          <Knob
            value={windowSize}
            min={0.01}
            max={0.5}
            onChange={(v) => onUpdateParameter('windowSize', v)}
            label="Window"
            color="#8b5cf6"
            formatValue={(v) => `${Math.round(v * 1000)}ms`}
          />
          <Knob
            value={feedback}
            min={0}
            max={0.95}
            onChange={(v) => onUpdateParameter('feedback', v)}
            label="Feedback"
            color="#8b5cf6"
            formatValue={(v) => `${Math.round(v * 100)}%`}
          />
        </div>
      </section>
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <div className="flex justify-center">
          <Knob
            value={effect.wet}
            min={0}
            max={100}
            onChange={onUpdateWet}
            label="Mix"
            color="#a78bfa"
            formatValue={(v) => `${Math.round(v)}%`}
          />
        </div>
      </section>
    </div>
  );
};

// ============================================================================
// JC REVERB
// ============================================================================

export const JCReverbEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
}) => {
  const roomSize = getParam(effect, 'roomSize', 0.5);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#6366f1" />
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader color="#6366f1" title="JC Reverb" />
        <div className="flex justify-around items-end">
          <Knob
            value={roomSize}
            min={0}
            max={1}
            onChange={(v) => onUpdateParameter('roomSize', v)}
            label="Room Size"
            size="lg"
            color="#6366f1"
            formatValue={(v) => `${Math.round(v * 100)}%`}
          />
          <Knob
            value={effect.wet}
            min={0}
            max={100}
            onChange={onUpdateWet}
            label="Mix"
            size="lg"
            color="#818cf8"
            formatValue={(v) => `${Math.round(v)}%`}
          />
        </div>
      </section>
    </div>
  );
};

// ============================================================================
// STEREO WIDENER
// ============================================================================

export const StereoWidenerEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
}) => {
  const width = getParam(effect, 'width', 0.5);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#ec4899" />
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader color="#ec4899" title="Stereo Widener" />
        <div className="flex justify-around items-end">
          <Knob
            value={width}
            min={0}
            max={1}
            onChange={(v) => onUpdateParameter('width', v)}
            label="Width"
            size="lg"
            color="#ec4899"
            formatValue={(v) => `${Math.round(v * 100)}%`}
          />
          <Knob
            value={effect.wet}
            min={0}
            max={100}
            onChange={onUpdateWet}
            label="Mix"
            size="lg"
            color="#f472b6"
            formatValue={(v) => `${Math.round(v)}%`}
          />
        </div>
      </section>
    </div>
  );
};
