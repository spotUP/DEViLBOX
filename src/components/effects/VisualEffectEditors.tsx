/**
 * VisualEffectEditors - VST-style visual editors for all effect types
 *
 * Uses the same design pattern as VisualSynthEditor and buzzmachine editors:
 * - Dark panel sections with SectionHeader colored bars
 * - Knob components with proper ranges and colors
 * - Consistent layout and styling
 */

import React from 'react';
import type { EffectConfig } from '@typedefs/instrument';
import { Knob } from '@components/controls/Knob';
import {
  Zap,
  Waves,
  Clock,
  Radio,
  Gauge,
  Sliders,
  Music,
  ArrowLeftRight,
  Wind,
  Volume2,
} from 'lucide-react';

interface VisualEffectEditorProps {
  effect: EffectConfig;
  onUpdateParameter: (key: string, value: number) => void;
  onUpdateWet: (wet: number) => void;
}

/**
 * Section header component for consistency
 */
function SectionHeader({ color, title }: { color: string; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="w-1 h-4 rounded-full" style={{ backgroundColor: color }} />
      <h3 className="text-sm font-bold text-white uppercase tracking-wide">{title}</h3>
    </div>
  );
}

/**
 * Helper to get parameter value with default
 */
function getParam(effect: EffectConfig, key: string, defaultValue: number): number {
  const value = effect.parameters[key];
  return typeof value === 'number' ? value : defaultValue;
}

// ============================================================================
// DISTORTION
// ============================================================================

export const DistortionEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
}) => {
  const drive = getParam(effect, 'drive', 0.4);

  return (
    <div className="space-y-4">
      <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
        <SectionHeader color="#ef4444" title="Distortion" />
        <div className="flex justify-around items-end">
          <Knob
            value={drive}
            min={0}
            max={1}
            onChange={(v) => onUpdateParameter('drive', v)}
            label="Drive"
            size="lg"
            color="#ef4444"
            formatValue={(v) => `${Math.round(v * 100)}%`}
          />
          <Knob
            value={effect.wet}
            min={0}
            max={100}
            onChange={onUpdateWet}
            label="Mix"
            size="lg"
            color="#f97316"
            formatValue={(v) => `${Math.round(v)}%`}
          />
        </div>
      </section>
    </div>
  );
};

// ============================================================================
// REVERB
// ============================================================================

export const ReverbEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
}) => {
  const decay = getParam(effect, 'decay', 1.5);
  const preDelay = getParam(effect, 'preDelay', 0.01);

  return (
    <div className="space-y-4">
      <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
        <SectionHeader color="#6366f1" title="Reverb" />
        <div className="flex justify-around items-end">
          <Knob
            value={decay}
            min={0.1}
            max={10}
            onChange={(v) => onUpdateParameter('decay', v)}
            label="Decay"
            color="#6366f1"
            formatValue={(v) => `${v.toFixed(1)}s`}
          />
          <Knob
            value={preDelay}
            min={0}
            max={0.5}
            onChange={(v) => onUpdateParameter('preDelay', v)}
            label="Pre-Delay"
            color="#6366f1"
            formatValue={(v) => `${Math.round(v * 1000)}ms`}
          />
          <Knob
            value={effect.wet}
            min={0}
            max={100}
            onChange={onUpdateWet}
            label="Mix"
            color="#8b5cf6"
            formatValue={(v) => `${Math.round(v)}%`}
          />
        </div>
      </section>
    </div>
  );
};

// ============================================================================
// DELAY (Delay, FeedbackDelay, PingPongDelay)
// ============================================================================

export const DelayEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
}) => {
  const time = getParam(effect, 'time', 0.25);
  const feedback = getParam(effect, 'feedback', 0.5);

  const isPingPong = effect.type === 'PingPongDelay';

  return (
    <div className="space-y-4">
      <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
        <SectionHeader color="#3b82f6" title={isPingPong ? 'Ping Pong Delay' : 'Delay'} />
        <div className="flex justify-around items-end">
          <Knob
            value={time}
            min={0}
            max={1}
            onChange={(v) => onUpdateParameter('time', v)}
            label="Time"
            color="#3b82f6"
            formatValue={(v) => `${Math.round(v * 1000)}ms`}
          />
          <Knob
            value={feedback}
            min={0}
            max={0.95}
            onChange={(v) => onUpdateParameter('feedback', v)}
            label="Feedback"
            color="#3b82f6"
            formatValue={(v) => `${Math.round(v * 100)}%`}
          />
          <Knob
            value={effect.wet}
            min={0}
            max={100}
            onChange={onUpdateWet}
            label="Mix"
            color="#06b6d4"
            formatValue={(v) => `${Math.round(v)}%`}
          />
        </div>
      </section>
    </div>
  );
};

// ============================================================================
// CHORUS
// ============================================================================

export const ChorusEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
}) => {
  const frequency = getParam(effect, 'frequency', 1.5);
  const depth = getParam(effect, 'depth', 0.7);
  const delayTime = getParam(effect, 'delayTime', 3.5);

  return (
    <div className="space-y-4">
      <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
        <SectionHeader color="#ec4899" title="Chorus" />
        <div className="flex justify-around items-end">
          <Knob
            value={frequency}
            min={0}
            max={20}
            onChange={(v) => onUpdateParameter('frequency', v)}
            label="Rate"
            size="sm"
            color="#ec4899"
            formatValue={(v) => `${v.toFixed(1)}Hz`}
          />
          <Knob
            value={depth}
            min={0}
            max={1}
            onChange={(v) => onUpdateParameter('depth', v)}
            label="Depth"
            size="sm"
            color="#ec4899"
            formatValue={(v) => `${Math.round(v * 100)}%`}
          />
          <Knob
            value={delayTime}
            min={2}
            max={20}
            onChange={(v) => onUpdateParameter('delayTime', v)}
            label="Delay"
            size="sm"
            color="#ec4899"
            formatValue={(v) => `${v.toFixed(1)}ms`}
          />
          <Knob
            value={effect.wet}
            min={0}
            max={100}
            onChange={onUpdateWet}
            label="Mix"
            size="sm"
            color="#f472b6"
            formatValue={(v) => `${Math.round(v)}%`}
          />
        </div>
      </section>
    </div>
  );
};

// ============================================================================
// PHASER
// ============================================================================

export const PhaserEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
}) => {
  const frequency = getParam(effect, 'frequency', 0.5);
  const octaves = getParam(effect, 'octaves', 3);
  const baseFrequency = getParam(effect, 'baseFrequency', 350);

  return (
    <div className="space-y-4">
      <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
        <SectionHeader color="#a855f7" title="Phaser" />
        <div className="flex justify-around items-end">
          <Knob
            value={frequency}
            min={0}
            max={20}
            onChange={(v) => onUpdateParameter('frequency', v)}
            label="Rate"
            size="sm"
            color="#a855f7"
            formatValue={(v) => `${v.toFixed(1)}Hz`}
          />
          <Knob
            value={octaves}
            min={0}
            max={8}
            onChange={(v) => onUpdateParameter('octaves', v)}
            label="Octaves"
            size="sm"
            color="#a855f7"
            formatValue={(v) => v.toFixed(1)}
          />
          <Knob
            value={baseFrequency}
            min={50}
            max={1000}
            onChange={(v) => onUpdateParameter('baseFrequency', v)}
            label="Base Freq"
            size="sm"
            color="#a855f7"
            formatValue={(v) => `${Math.round(v)}Hz`}
          />
          <Knob
            value={effect.wet}
            min={0}
            max={100}
            onChange={onUpdateWet}
            label="Mix"
            size="sm"
            color="#c084fc"
            formatValue={(v) => `${Math.round(v)}%`}
          />
        </div>
      </section>
    </div>
  );
};

// ============================================================================
// TREMOLO
// ============================================================================

export const TremoloEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
}) => {
  const frequency = getParam(effect, 'frequency', 10);
  const depth = getParam(effect, 'depth', 0.5);

  return (
    <div className="space-y-4">
      <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
        <SectionHeader color="#f97316" title="Tremolo" />
        <div className="flex justify-around items-end">
          <Knob
            value={frequency}
            min={0}
            max={100}
            onChange={(v) => onUpdateParameter('frequency', v)}
            label="Rate"
            color="#f97316"
            formatValue={(v) => `${v.toFixed(1)}Hz`}
          />
          <Knob
            value={depth}
            min={0}
            max={1}
            onChange={(v) => onUpdateParameter('depth', v)}
            label="Depth"
            color="#f97316"
            formatValue={(v) => `${Math.round(v * 100)}%`}
          />
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
// VIBRATO
// ============================================================================

export const VibratoEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
}) => {
  const frequency = getParam(effect, 'frequency', 5);
  const depth = getParam(effect, 'depth', 0.1);

  return (
    <div className="space-y-4">
      <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
        <SectionHeader color="#14b8a6" title="Vibrato" />
        <div className="flex justify-around items-end">
          <Knob
            value={frequency}
            min={0}
            max={100}
            onChange={(v) => onUpdateParameter('frequency', v)}
            label="Rate"
            color="#14b8a6"
            formatValue={(v) => `${v.toFixed(1)}Hz`}
          />
          <Knob
            value={depth}
            min={0}
            max={1}
            onChange={(v) => onUpdateParameter('depth', v)}
            label="Depth"
            color="#14b8a6"
            formatValue={(v) => `${Math.round(v * 100)}%`}
          />
          <Knob
            value={effect.wet}
            min={0}
            max={100}
            onChange={onUpdateWet}
            label="Mix"
            color="#2dd4bf"
            formatValue={(v) => `${Math.round(v)}%`}
          />
        </div>
      </section>
    </div>
  );
};

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

  return (
    <div className="space-y-4">
      <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
        <SectionHeader color="#eab308" title="Auto Filter" />
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
// AUTO PANNER
// ============================================================================

export const AutoPannerEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
}) => {
  const frequency = getParam(effect, 'frequency', 1);
  const depth = getParam(effect, 'depth', 1);

  return (
    <div className="space-y-4">
      <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
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

  return (
    <div className="space-y-4">
      <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
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
      <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
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

  return (
    <div className="space-y-4">
      <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
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
  const order = getParam(effect, 'order', 50);

  return (
    <div className="space-y-4">
      <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
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

  return (
    <div className="space-y-4">
      <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
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

  return (
    <div className="space-y-4">
      <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
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
      <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
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

  return (
    <div className="space-y-4">
      <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
        <SectionHeader color="#10b981" title="Compressor" />
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
      <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
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

  return (
    <div className="space-y-4">
      <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
        <SectionHeader color="#3b82f6" title="3-Band EQ" />
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
      <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
        <SectionHeader color="#6b7280" title="Crossover" />
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

  return (
    <div className="space-y-4">
      <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
        <SectionHeader color="#f97316" title="Filter" />
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
      <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
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
// JC REVERB
// ============================================================================

export const JCReverbEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
}) => {
  const roomSize = getParam(effect, 'roomSize', 0.5);

  return (
    <div className="space-y-4">
      <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
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

  return (
    <div className="space-y-4">
      <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
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

// ============================================================================
// GENERIC FALLBACK EDITOR
// ============================================================================

export const GenericEffectEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateWet,
}) => {
  return (
    <div className="space-y-4">
      <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
        <SectionHeader color="#6b7280" title={effect.type} />
        <div className="flex justify-center">
          <Knob
            value={effect.wet}
            min={0}
            max={100}
            onChange={onUpdateWet}
            label="Mix"
            size="lg"
            color="#6b7280"
            formatValue={(v) => `${Math.round(v)}%`}
          />
        </div>
        <p className="text-xs text-gray-500 text-center mt-4">
          Use sliders in the expanded view for this effect type.
        </p>
      </section>
    </div>
  );
};

// ============================================================================
// EFFECT EDITOR FACTORY
// ============================================================================

const EFFECT_EDITORS: Record<string, React.FC<VisualEffectEditorProps>> = {
  Distortion: DistortionEditor,
  Reverb: ReverbEditor,
  Delay: DelayEditor,
  FeedbackDelay: DelayEditor,
  PingPongDelay: DelayEditor,
  Chorus: ChorusEditor,
  Phaser: PhaserEditor,
  Tremolo: TremoloEditor,
  Vibrato: VibratoEditor,
  AutoFilter: AutoFilterEditor,
  AutoPanner: AutoPannerEditor,
  AutoWah: AutoWahEditor,
  BitCrusher: BitCrusherEditor,
  Chebyshev: ChebyshevEditor,
  FrequencyShifter: FrequencyShifterEditor,
  PitchShift: PitchShiftEditor,
  Compressor: CompressorEditor,
  EQ3: EQ3Editor,
  Filter: FilterEditor,
  JCReverb: JCReverbEditor,
  StereoWidener: StereoWidenerEditor,
};

/**
 * Get the appropriate visual editor for an effect type
 */
export function getVisualEffectEditor(effectType: string): React.FC<VisualEffectEditorProps> {
  return EFFECT_EDITORS[effectType] || GenericEffectEditor;
}

// ============================================================================
// MAIN VISUAL EFFECT EDITOR WRAPPER
// ============================================================================

interface VisualEffectEditorWrapperProps {
  effect: EffectConfig;
  onUpdateParameter: (key: string, value: number) => void;
  onUpdateWet: (wet: number) => void;
  onClose?: () => void;
}

export const VisualEffectEditorWrapper: React.FC<VisualEffectEditorWrapperProps> = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
  onClose,
}) => {
  const EditorComponent = getVisualEffectEditor(effect.type);

  // Icon mapping
  const iconMap: Record<string, React.ReactNode> = {
    Distortion: <Zap size={20} className="text-white" />,
    Reverb: <Waves size={20} className="text-white" />,
    JCReverb: <Waves size={20} className="text-white" />,
    Delay: <Clock size={20} className="text-white" />,
    FeedbackDelay: <Clock size={20} className="text-white" />,
    PingPongDelay: <Clock size={20} className="text-white" />,
    Chorus: <Radio size={20} className="text-white" />,
    Phaser: <Radio size={20} className="text-white" />,
    Tremolo: <Wind size={20} className="text-white" />,
    Vibrato: <Wind size={20} className="text-white" />,
    Compressor: <Gauge size={20} className="text-white" />,
    EQ3: <Sliders size={20} className="text-white" />,
    Filter: <Sliders size={20} className="text-white" />,
    StereoWidener: <ArrowLeftRight size={20} className="text-white" />,
  };

  // Color mapping
  const colorMap: Record<string, string> = {
    Distortion: 'from-red-600 to-orange-600',
    Reverb: 'from-indigo-500 to-purple-600',
    JCReverb: 'from-indigo-500 to-purple-600',
    Delay: 'from-blue-500 to-cyan-600',
    FeedbackDelay: 'from-blue-500 to-cyan-600',
    PingPongDelay: 'from-blue-500 to-cyan-600',
    Chorus: 'from-pink-500 to-rose-600',
    Phaser: 'from-purple-500 to-violet-600',
    Tremolo: 'from-orange-500 to-amber-600',
    Vibrato: 'from-teal-500 to-emerald-600',
    Compressor: 'from-green-500 to-emerald-600',
    EQ3: 'from-blue-500 to-indigo-600',
    Filter: 'from-orange-500 to-red-600',
    StereoWidener: 'from-pink-500 to-fuchsia-600',
  };

  const icon = iconMap[effect.type] || <Music size={20} className="text-white" />;
  const gradient = colorMap[effect.type] || 'from-gray-500 to-gray-600';

  return (
    <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515] rounded-lg overflow-hidden">
      {/* Header */}
      <div className="synth-editor-header px-4 py-3 bg-[#1a1a1a] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg bg-gradient-to-br ${gradient}`}>
            {icon}
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">{effect.type}</h2>
            <p className="text-xs text-gray-400">
              {effect.enabled ? 'Active' : 'Bypassed'} | Mix: {effect.wet}%
            </p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <Volume2 size={16} />
          </button>
        )}
      </div>

      {/* Editor Content */}
      <div className="p-4">
        <EditorComponent
          effect={effect}
          onUpdateParameter={onUpdateParameter}
          onUpdateWet={onUpdateWet}
        />
      </div>
    </div>
  );
};
