/**
 * VisualEffectEditors - VST-style visual editors for all effect types
 *
 * Uses the same design pattern as VisualSynthEditor and buzzmachine editors:
 * - Dark panel sections with SectionHeader colored bars
 * - Knob components with proper ranges and colors
 * - Consistent layout and styling
 */

import React, { useEffect, useRef, useState } from 'react';
import type { EffectConfig } from '@typedefs/instrument';
import { Knob } from '@components/controls/Knob';
import { BpmSyncControl } from './BpmSyncControl';
import { isEffectBpmSynced, getEffectSyncDivision, type SyncDivision } from '@engine/bpmSync';
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
  Disc,
  X,
  Globe,
} from 'lucide-react';

interface VisualEffectEditorProps {
  effect: EffectConfig;
  onUpdateParameter: (key: string, value: number | string) => void;
  onUpdateWet: (wet: number) => void;
}

/**
 * Section header component — pedal panel label
 */
function SectionHeader({ color, title }: { color: string; title: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <div className="w-1.5 h-5 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}60` }} />
      <h3 className="text-xs font-black text-white/90 uppercase tracking-[0.15em]">{title}</h3>
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

/**
 * Helper to render BpmSyncControl for syncable effect editors.
 * When sync is ON, the synced knob should be visually dimmed.
 */
function renderBpmSync(
  effect: EffectConfig,
  onUpdateParameter: (key: string, value: number | string) => void,
) {
  const synced = isEffectBpmSynced(effect.parameters);
  const division = getEffectSyncDivision(effect.parameters);
  return (
    <BpmSyncControl
      bpmSync={synced ? 1 : 0}
      syncDivision={division}
      onToggleSync={(enabled) => onUpdateParameter('bpmSync', enabled ? 1 : 0)}
      onChangeDivision={(div: SyncDivision) => onUpdateParameter('syncDivision', div)}
    />
  );
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
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
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
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
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
  const synced = isEffectBpmSynced(effect.parameters);

  const isPingPong = effect.type === 'PingPongDelay';

  return (
    <div className="space-y-4">
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader color="#3b82f6" title={isPingPong ? 'Ping Pong Delay' : 'Delay'} />
        <div className="flex justify-around items-end">
          <div className={synced ? 'opacity-40 pointer-events-none' : ''}>
            <Knob
              value={time}
              min={0}
              max={1}
              onChange={(v) => onUpdateParameter('time', v)}
              label="Time"
              color="#3b82f6"
              formatValue={(v) => `${Math.round(v * 1000)}ms`}
            />
          </div>
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
        {renderBpmSync(effect, onUpdateParameter)}
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
  const synced = isEffectBpmSynced(effect.parameters);

  return (
    <div className="space-y-4">
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader color="#ec4899" title="Chorus" />
        <div className="flex justify-around items-end">
          <div className={synced ? 'opacity-40 pointer-events-none' : ''}>
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
          </div>
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
        {renderBpmSync(effect, onUpdateParameter)}
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
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
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
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
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
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
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
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
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

  return (
    <div className="space-y-4">
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

  return (
    <div className="space-y-4">
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
  const order = getParam(effect, 'order', 50);

  return (
    <div className="space-y-4">
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

  return (
    <div className="space-y-4">
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

  return (
    <div className="space-y-4">
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
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
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
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
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
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
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
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
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
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
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
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
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

  return (
    <div className="space-y-4">
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

// ============================================================================
// GENERIC FALLBACK EDITOR
// ============================================================================

export const GenericEffectEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateWet,
}) => {
  return (
    <div className="space-y-4">
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
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
// WAM 2.0 EFFECT EDITOR (Native GUI embed)
// ============================================================================

import { getToneEngine } from '@engine/ToneEngine';
import { WAMEffectNode } from '@engine/wam/WAMEffectNode';

const WAMEffectEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateWet,
}) => {
  const guiContainerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasGui, setHasGui] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let currentGui: HTMLElement | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const mountGui = async () => {
      if (!guiContainerRef.current) return;
      guiContainerRef.current.innerHTML = '';
      setHasGui(false);
      setIsLoading(true);

      try {
        const engine = getToneEngine();

        // The WAM node may not exist yet — rebuildMasterEffects is async.
        // Poll until the node is available (up to ~5s).
        let node: ReturnType<typeof engine.getMasterEffectNode> = null;
        for (let attempt = 0; attempt < 25; attempt++) {
          node = engine.getMasterEffectNode(effect.id);
          if (node && node instanceof WAMEffectNode) break;
          node = null;
          await new Promise(r => setTimeout(r, 200));
          if (!isMounted) return;
        }

        if (!node || !(node instanceof WAMEffectNode)) {
          if (isMounted) setIsLoading(false);
          return;
        }

        await node.ensureInitialized();
        if (!isMounted) return;

        const gui = await node.createGui();
        if (!gui || !isMounted || !guiContainerRef.current) {
          if (isMounted) setIsLoading(false);
          return;
        }

        currentGui = gui;
        setHasGui(true);
        guiContainerRef.current.appendChild(gui);

        // Auto-scale plugin GUI to fill container
        const scaleToFit = () => {
          const container = guiContainerRef.current;
          if (!container || !gui) return;
          gui.style.transform = '';
          gui.style.position = '';
          gui.style.left = '';
          gui.style.top = '';
          const w = gui.offsetWidth || gui.scrollWidth || gui.clientWidth;
          const h = gui.offsetHeight || gui.scrollHeight || gui.clientHeight;
          if (!w || !h) return;
          const cw = container.clientWidth;
          const ch = container.clientHeight;
          if (!cw || !ch) return;
          const scale = Math.min(cw / w, ch / h);
          const scaledW = w * scale;
          const scaledH = h * scale;
          gui.style.position = 'absolute';
          gui.style.transformOrigin = 'top left';
          gui.style.transform = `scale(${scale})`;
          gui.style.left = `${(cw - scaledW) / 2}px`;
          gui.style.top = `${(ch - scaledH) / 2}px`;
        };

        resizeObserver = new ResizeObserver(scaleToFit);
        resizeObserver.observe(guiContainerRef.current);
        requestAnimationFrame(scaleToFit);
        setTimeout(scaleToFit, 300);
        setTimeout(scaleToFit, 800);
        setTimeout(scaleToFit, 1500);
      } catch (err) {
        console.warn('[WAMEffectEditor] Failed to load GUI:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    mountGui();

    return () => {
      isMounted = false;
      resizeObserver?.disconnect();
      if (currentGui?.parentElement) {
        currentGui.parentElement.removeChild(currentGui);
      }
    };
  }, [effect.id]);

  return (
    <div className="space-y-4">
      {/* Native WAM GUI */}
      <div
        ref={guiContainerRef}
        className="bg-black rounded-lg border border-border overflow-hidden relative"
        style={{ minHeight: hasGui ? 300 : 0, display: hasGui || isLoading ? 'block' : 'none' }}
      />
      {isLoading && (
        <div className="flex items-center justify-center py-8 text-text-muted text-xs">
          Loading plugin interface...
        </div>
      )}
      {!hasGui && !isLoading && (
        <div className="text-center text-text-muted text-xs py-4">
          Plugin did not provide a native GUI.
        </div>
      )}
      {/* Mix knob */}
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader color="#6b7280" title="Mix" />
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
      </section>
    </div>
  );
};

// ============================================================================
// SPACEY DELAYER (WASM Multitap Delay)
// ============================================================================

export const SpaceyDelayerEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
}) => {
  const firstTap = getParam(effect, 'firstTap', 250);
  const tapSize = getParam(effect, 'tapSize', 150);
  const feedback = getParam(effect, 'feedback', 40);
  const multiTap = getParam(effect, 'multiTap', 1);
  const tapeFilter = getParam(effect, 'tapeFilter', 0);
  const synced = isEffectBpmSynced(effect.parameters);

  return (
    <div className="space-y-4">
      {/* Delay Controls */}
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader color="#8b5cf6" title="Spacey Delayer" />
        <div className="flex justify-around items-end">
          <div className={synced ? 'opacity-40 pointer-events-none' : ''}>
            <Knob
              value={firstTap}
              min={10}
              max={2000}
              onChange={(v) => onUpdateParameter('firstTap', v)}
              label="First Tap"
              color="#8b5cf6"
              formatValue={(v) => `${Math.round(v)}ms`}
            />
          </div>
          <Knob
            value={tapSize}
            min={10}
            max={1000}
            onChange={(v) => onUpdateParameter('tapSize', v)}
            label="Tap Size"
            color="#a78bfa"
            formatValue={(v) => `${Math.round(v)}ms`}
          />
          <Knob
            value={feedback}
            min={0}
            max={95}
            onChange={(v) => onUpdateParameter('feedback', v)}
            label="Feedback"
            color="#7c3aed"
            formatValue={(v) => `${Math.round(v)}%`}
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
        {renderBpmSync(effect, onUpdateParameter)}
      </section>

      {/* Toggles */}
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader color="#a78bfa" title="Options" />
        <div className="flex gap-4">
          <button
            onClick={() => onUpdateParameter('multiTap', multiTap ? 0 : 1)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              multiTap
                ? 'bg-purple-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            Multi-Tap {multiTap ? 'ON' : 'OFF'}
          </button>
          <button
            onClick={() => onUpdateParameter('tapeFilter', tapeFilter ? 0 : 1)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tapeFilter
                ? 'bg-purple-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            Tape Filter {tapeFilter ? 'ON' : 'OFF'}
          </button>
        </div>
      </section>
    </div>
  );
};

// ============================================================================
// RE-TAPE-ECHO EDITOR (WASM)
// ============================================================================

export const RETapeEchoEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
}) => {
  const mode = getParam(effect, 'mode', 3);
  const repeatRate = getParam(effect, 'repeatRate', 0.5);
  const intensity = getParam(effect, 'intensity', 0.5);
  const echoVolume = getParam(effect, 'echoVolume', 0.8);
  const wow = getParam(effect, 'wow', 0);
  const flutter = getParam(effect, 'flutter', 0);
  const dirt = getParam(effect, 'dirt', 0);
  const inputBleed = getParam(effect, 'inputBleed', 0);
  const loopAmount = getParam(effect, 'loopAmount', 0);
  const playheadFilter = getParam(effect, 'playheadFilter', 1);
  const synced = isEffectBpmSynced(effect.parameters);

  const modeLabels = ['Head 1', 'Head 2', 'Both', 'H1+FB', 'H2+FB', 'Both+FB'];

  return (
    <div className="space-y-4">
      {/* Main Controls */}
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader color="#dc2626" title="RE Tape Echo" />
        <div className="flex justify-around items-end">
          <div className={synced ? 'opacity-40 pointer-events-none' : ''}>
            <Knob
              value={repeatRate * 100}
              min={0}
              max={100}
              onChange={(v) => onUpdateParameter('repeatRate', v / 100)}
              label="Rate"
              color="#dc2626"
              formatValue={(v) => `${Math.round(v)}%`}
            />
          </div>
          <Knob
            value={intensity * 100}
            min={0}
            max={100}
            onChange={(v) => onUpdateParameter('intensity', v / 100)}
            label="Intensity"
            color="#ef4444"
            formatValue={(v) => `${Math.round(v)}%`}
          />
          <Knob
            value={echoVolume * 100}
            min={0}
            max={100}
            onChange={(v) => onUpdateParameter('echoVolume', v / 100)}
            label="Echo Vol"
            color="#f97316"
            formatValue={(v) => `${Math.round(v)}%`}
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
        {renderBpmSync(effect, onUpdateParameter)}
      </section>

      {/* Tape Imperfections */}
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader color="#f97316" title="Tape Character" />
        <div className="flex justify-around items-end">
          <Knob
            value={wow * 100}
            min={0}
            max={100}
            onChange={(v) => onUpdateParameter('wow', v / 100)}
            label="Wow"
            color="#f97316"
            formatValue={(v) => `${Math.round(v)}%`}
          />
          <Knob
            value={flutter * 100}
            min={0}
            max={100}
            onChange={(v) => onUpdateParameter('flutter', v / 100)}
            label="Flutter"
            color="#fb923c"
            formatValue={(v) => `${Math.round(v)}%`}
          />
          <Knob
            value={dirt * 100}
            min={0}
            max={100}
            onChange={(v) => onUpdateParameter('dirt', v / 100)}
            label="Dirt"
            color="#ea580c"
            formatValue={(v) => `${Math.round(v)}%`}
          />
          <Knob
            value={loopAmount * 100}
            min={0}
            max={100}
            onChange={(v) => onUpdateParameter('loopAmount', v / 100)}
            label="Tape Loop"
            color="#a16207"
            formatValue={(v) => `${Math.round(v)}%`}
          />
        </div>
      </section>

      {/* Mode + Toggles */}
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader color="#b91c1c" title="Mode & Options" />
        <div className="mb-3">
          <div className="text-xs text-gray-400 mb-2">Echo Mode</div>
          <div className="grid grid-cols-6 gap-1">
            {modeLabels.map((label, i) => (
              <button
                key={i}
                onClick={() => onUpdateParameter('mode', i)}
                className={`px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                  mode === i
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-4">
          <button
            onClick={() => onUpdateParameter('playheadFilter', playheadFilter ? 0 : 1)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              playheadFilter
                ? 'bg-red-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            Head EQ {playheadFilter ? 'ON' : 'OFF'}
          </button>
          <button
            onClick={() => onUpdateParameter('inputBleed', inputBleed ? 0 : 1)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              inputBleed
                ? 'bg-red-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            Bleed {inputBleed ? 'ON' : 'OFF'}
          </button>
        </div>
      </section>
    </div>
  );
};

// ============================================================================
// SPACE ECHO
// ============================================================================

export const SpaceEchoEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
}) => {
  const mode = getParam(effect, 'mode', 4);
  const rate = getParam(effect, 'rate', 300);
  const intensity = getParam(effect, 'intensity', 0.5);
  const echoVolume = getParam(effect, 'echoVolume', 0.8);
  const reverbVolume = getParam(effect, 'reverbVolume', 0.3);
  const bass = getParam(effect, 'bass', 0);
  const treble = getParam(effect, 'treble', 0);
  const synced = isEffectBpmSynced(effect.parameters);

  return (
    <div className="space-y-4">
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader color="#6366f1" title="Echo" />
        <div className="flex justify-around items-end">
          <Knob
            value={mode}
            min={1}
            max={12}
            onChange={(v) => onUpdateParameter('mode', Math.round(v))}
            label="Mode"
            color="#6366f1"
            formatValue={(v) => `${Math.round(v)}`}
          />
          <div className={synced ? 'opacity-40 pointer-events-none' : ''}>
            <Knob
              value={rate}
              min={50}
              max={1000}
              onChange={(v) => onUpdateParameter('rate', v)}
              label="Rate"
              color="#6366f1"
              formatValue={(v) => `${Math.round(v)}ms`}
            />
          </div>
          <Knob
            value={intensity}
            min={0}
            max={1.2}
            onChange={(v) => onUpdateParameter('intensity', v)}
            label="Intensity"
            color="#6366f1"
            formatValue={(v) => `${(v * 100).toFixed(0)}%`}
          />
        </div>
        {renderBpmSync(effect, onUpdateParameter)}
      </section>
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader color="#818cf8" title="Levels & EQ" />
        <div className="flex justify-around items-end">
          <Knob
            value={echoVolume}
            min={0}
            max={1}
            onChange={(v) => onUpdateParameter('echoVolume', v)}
            label="Echo Vol"
            color="#818cf8"
            formatValue={(v) => `${(v * 100).toFixed(0)}%`}
          />
          <Knob
            value={reverbVolume}
            min={0}
            max={1}
            onChange={(v) => onUpdateParameter('reverbVolume', v)}
            label="Reverb Vol"
            color="#818cf8"
            formatValue={(v) => `${(v * 100).toFixed(0)}%`}
          />
          <Knob
            value={bass}
            min={-20}
            max={20}
            onChange={(v) => onUpdateParameter('bass', v)}
            label="Bass"
            color="#818cf8"
            bipolar
            formatValue={(v) => `${v > 0 ? '+' : ''}${Math.round(v)}dB`}
          />
          <Knob
            value={treble}
            min={-20}
            max={20}
            onChange={(v) => onUpdateParameter('treble', v)}
            label="Treble"
            color="#818cf8"
            bipolar
            formatValue={(v) => `${v > 0 ? '+' : ''}${Math.round(v)}dB`}
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
            color="#a5b4fc"
            formatValue={(v) => `${Math.round(v)}%`}
          />
        </div>
      </section>
    </div>
  );
};

// ============================================================================
// BI-PHASE
// ============================================================================

export const BiPhaseEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
}) => {
  const routing = getParam(effect, 'routing', 0);
  const rateA = getParam(effect, 'rateA', 0.5);
  const depthA = getParam(effect, 'depthA', 0.6);
  const rateB = getParam(effect, 'rateB', 4.0);
  const depthB = getParam(effect, 'depthB', 0.4);
  const feedback = getParam(effect, 'feedback', 0.3);
  const synced = isEffectBpmSynced(effect.parameters);

  return (
    <div className="space-y-4">
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader color="#a855f7" title="Routing" />
        <div className="flex gap-2 justify-center mb-2">
          <button
            onClick={() => onUpdateParameter('routing', 0)}
            className={`px-4 py-1.5 text-xs font-medium rounded transition-colors ${
              Math.round(routing) === 0
                ? 'bg-purple-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            Parallel
          </button>
          <button
            onClick={() => onUpdateParameter('routing', 1)}
            className={`px-4 py-1.5 text-xs font-medium rounded transition-colors ${
              Math.round(routing) === 1
                ? 'bg-purple-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            Series
          </button>
        </div>
      </section>
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader color="#a855f7" title="Phase A" />
        <div className="flex justify-around items-end">
          <div className={synced ? 'opacity-40 pointer-events-none' : ''}>
            <Knob
              value={rateA}
              min={0.1}
              max={10}
              onChange={(v) => onUpdateParameter('rateA', v)}
              label="Rate A"
              color="#a855f7"
              formatValue={(v) => `${v.toFixed(1)}Hz`}
            />
          </div>
          <Knob
            value={depthA}
            min={0}
            max={1}
            onChange={(v) => onUpdateParameter('depthA', v)}
            label="Depth A"
            color="#a855f7"
            formatValue={(v) => `${(v * 100).toFixed(0)}%`}
          />
        </div>
        {renderBpmSync(effect, onUpdateParameter)}
      </section>
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader color="#c084fc" title="Phase B" />
        <div className="flex justify-around items-end">
          <Knob
            value={rateB}
            min={0.1}
            max={10}
            onChange={(v) => onUpdateParameter('rateB', v)}
            label="Rate B"
            color="#c084fc"
            formatValue={(v) => `${v.toFixed(1)}Hz`}
          />
          <Knob
            value={depthB}
            min={0}
            max={1}
            onChange={(v) => onUpdateParameter('depthB', v)}
            label="Depth B"
            color="#c084fc"
            formatValue={(v) => `${(v * 100).toFixed(0)}%`}
          />
        </div>
      </section>
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <div className="flex justify-around items-end">
          <Knob
            value={feedback}
            min={0}
            max={0.95}
            onChange={(v) => onUpdateParameter('feedback', v)}
            label="Feedback"
            color="#a855f7"
            formatValue={(v) => `${(v * 100).toFixed(0)}%`}
          />
          <Knob
            value={effect.wet}
            min={0}
            max={100}
            onChange={onUpdateWet}
            label="Mix"
            color="#d8b4fe"
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

  return (
    <div className="space-y-4">
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader color="#22c55e" title="Dub Filter" />
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
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
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
// TAPE SATURATION
// ============================================================================

export const TapeSaturationEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
}) => {
  const drive = getParam(effect, 'drive', 50);
  const tone = getParam(effect, 'tone', 12000);

  return (
    <div className="space-y-4">
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader color="#ef4444" title="Tape Saturation" />
        <div className="flex justify-around items-end">
          <Knob
            value={drive}
            min={0}
            max={100}
            onChange={(v) => onUpdateParameter('drive', v)}
            label="Drive"
            color="#ef4444"
            formatValue={(v) => `${Math.round(v)}%`}
          />
          <Knob
            value={tone}
            min={2000}
            max={20000}
            onChange={(v) => onUpdateParameter('tone', v)}
            label="Tone"
            color="#ef4444"
            formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}Hz`}
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
            color="#f87171"
            formatValue={(v) => `${Math.round(v)}%`}
          />
        </div>
      </section>
    </div>
  );
};

// ============================================================================
// VINYL NOISE
// ============================================================================

// Speed values map to exact turntable rotation frequency (RPM / 60 Hz, scaled ×10):
//   33 RPM → 0.55 Hz → speed 5.5
//   45 RPM → 0.75 Hz → speed 7.5
//   78 RPM → 1.30 Hz → speed 13.0
const VINYL_RPM_PRESETS = [
  { label: '33', rpm: 33, hiss: 15, dust: 40, age: 20, speed: 5.5  },
  { label: '45', rpm: 45, hiss: 25, dust: 50, age: 35, speed: 7.5  },
  { label: '78', rpm: 78, hiss: 70, dust: 65, age: 75, speed: 13.0 },
] as const;

export const VinylNoiseEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
}) => {
  const hiss  = getParam(effect, 'hiss',  50);
  const dust  = getParam(effect, 'dust',  50);
  const age   = getParam(effect, 'age',   50);
  const speed = getParam(effect, 'speed', 0);

  const activeRpm = VINYL_RPM_PRESETS.find(
    (p) => p.hiss === Math.round(hiss) && p.dust === Math.round(dust) &&
            p.age === Math.round(age)  && Math.abs(speed - p.speed) < 0.5
  )?.rpm ?? null;

  const applyRpmPreset = (p: typeof VINYL_RPM_PRESETS[number]) => {
    onUpdateParameter('hiss',  p.hiss);
    onUpdateParameter('dust',  p.dust);
    onUpdateParameter('age',   p.age);
    onUpdateParameter('speed', p.speed);
  };

  return (
    <div className="space-y-4">
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader color="#d97706" title="Vinyl Noise" />

        {/* RPM mode selector */}
        <div className="flex gap-2 mb-4">
          <span className="text-xs text-text-muted self-center mr-1">RPM</span>
          {VINYL_RPM_PRESETS.map((p) => (
            <button
              key={p.rpm}
              onClick={() => applyRpmPreset(p)}
              className={[
                'flex-1 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all',
                activeRpm === p.rpm
                  ? 'bg-amber-700/70 border-amber-500 text-amber-100'
                  : 'bg-black/40 border-border text-text-muted hover:border-amber-700 hover:text-amber-300',
              ].join(' ')}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex justify-around items-end">
          <Knob
            value={hiss}
            min={0}
            max={100}
            onChange={(v) => onUpdateParameter('hiss', v)}
            label="Hiss"
            color="#d97706"
            formatValue={(v) => `${Math.round(v)}%`}
          />
          <Knob
            value={dust}
            min={0}
            max={100}
            onChange={(v) => onUpdateParameter('dust', v)}
            label="Dust"
            color="#d97706"
            formatValue={(v) => `${Math.round(v)}%`}
          />
          <Knob
            value={age}
            min={0}
            max={100}
            onChange={(v) => onUpdateParameter('age', v)}
            label="Age"
            color="#b45309"
            formatValue={(v) => `${Math.round(v)}%`}
          />
          <Knob
            value={speed}
            min={0}
            max={100}
            onChange={(v) => onUpdateParameter('speed', v)}
            label="Flutter"
            color="#92400e"
            formatValue={(v) => `${Math.round(v)}%`}
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
            color="#d97706"
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

  return (
    <div className="space-y-4">
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader color="#10b981" title="Compressor" />
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
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader color="#34d399" title="Envelope & Sidechain" />
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
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
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

  return (
    <div className="space-y-4">
      {/* Model & Mode */}
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader color="#f59e0b" title="Model" />
        <div className="grid grid-cols-3 gap-1 mb-3">
          {MOOG_MODEL_NAMES.map((name, i) => (
            <button
              key={i}
              onClick={() => onUpdateParameter('model', i)}
              className={`px-2 py-1.5 text-xs font-medium rounded transition-colors ${
                Math.round(model) === i
                  ? 'bg-amber-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
        {Math.round(model) === 0 && (
          <>
            <SectionHeader color="#f59e0b" title="Filter Mode (Hyperion)" />
            <div className="grid grid-cols-4 gap-1">
              {MOOG_MODE_NAMES.map((name, i) => (
                <button
                  key={i}
                  onClick={() => onUpdateParameter('filterMode', i)}
                  className={`px-2 py-1.5 text-xs font-medium rounded transition-colors ${
                    Math.round(filterMode) === i
                      ? 'bg-amber-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
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
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader color="#f59e0b" title="Filter" />
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
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
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

// ============================================================================
// MVERB PLATE REVERB EDITOR
// ============================================================================

export const MVerbEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
}) => {
  const damping = getParam(effect, 'damping', 0.5);
  const density = getParam(effect, 'density', 0.5);
  const bandwidth = getParam(effect, 'bandwidth', 0.5);
  const decay = getParam(effect, 'decay', 0.7);
  const predelay = getParam(effect, 'predelay', 0.0);
  const size = getParam(effect, 'size', 0.8);
  const gain = getParam(effect, 'gain', 1.0);
  const mix = getParam(effect, 'mix', 0.4);
  const earlyMix = getParam(effect, 'earlyMix', 0.5);

  return (
    <div className="space-y-4">
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader color="#7c3aed" title="Reverb" />
        <div className="flex justify-around items-end flex-wrap gap-y-4">
          <Knob value={decay} min={0} max={1} onChange={(v) => onUpdateParameter('decay', v)} label="Decay" color="#7c3aed" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={size} min={0} max={1} onChange={(v) => onUpdateParameter('size', v)} label="Size" color="#7c3aed" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={damping} min={0} max={1} onChange={(v) => onUpdateParameter('damping', v)} label="Damp" color="#8b5cf6" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={density} min={0} max={1} onChange={(v) => onUpdateParameter('density', v)} label="Density" color="#8b5cf6" formatValue={(v) => `${Math.round(v * 100)}%`} />
        </div>
      </section>
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader color="#a78bfa" title="Character" />
        <div className="flex justify-around items-end flex-wrap gap-y-4">
          <Knob value={bandwidth} min={0} max={1} onChange={(v) => onUpdateParameter('bandwidth', v)} label="Bandwidth" color="#a78bfa" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={predelay} min={0} max={1} onChange={(v) => onUpdateParameter('predelay', v)} label="Pre-Delay" color="#a78bfa" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={earlyMix} min={0} max={1} onChange={(v) => onUpdateParameter('earlyMix', v)} label="Early Mix" color="#a78bfa" formatValue={(v) => `${Math.round(v * 100)}%`} />
        </div>
      </section>
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <div className="flex justify-around items-end">
          <Knob value={gain} min={0} max={1} onChange={(v) => onUpdateParameter('gain', v)} label="Gain" color="#c4b5fd" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={mix} min={0} max={1} onChange={(v) => onUpdateParameter('mix', v)} label="Int. Mix" color="#c4b5fd" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet} label="Wet" color="#ddd6fe" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </section>
    </div>
  );
};

// ============================================================================
// LESLIE ROTARY SPEAKER EDITOR
// ============================================================================

const SPEED_LABELS = ['Slow', 'Brake', 'Fast'];

export const LeslieEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
}) => {
  const speed = getParam(effect, 'speed', 0.0);
  const hornRate = getParam(effect, 'hornRate', 6.8);
  const drumRate = getParam(effect, 'drumRate', 5.9);
  const hornDepth = getParam(effect, 'hornDepth', 0.7);
  const drumDepth = getParam(effect, 'drumDepth', 0.5);
  const doppler = getParam(effect, 'doppler', 0.5);
  const width = getParam(effect, 'width', 0.8);
  const acceleration = getParam(effect, 'acceleration', 0.5);

  const speedIdx = speed < 0.25 ? 0 : speed > 0.75 ? 2 : 1;

  return (
    <div className="space-y-4">
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader color="#f97316" title="Speed" />
        <div className="grid grid-cols-3 gap-1 mb-3">
          {SPEED_LABELS.map((label, i) => (
            <button
              key={i}
              onClick={() => onUpdateParameter('speed', i === 0 ? 0.0 : i === 1 ? 0.5 : 1.0)}
              className={`px-2 py-1.5 text-xs font-medium rounded transition-colors ${
                speedIdx === i
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex justify-center">
          <Knob value={acceleration} min={0} max={1} onChange={(v) => onUpdateParameter('acceleration', v)} label="Accel" color="#f97316" formatValue={(v) => `${Math.round(v * 100)}%`} />
        </div>
      </section>
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader color="#fb923c" title="Rotors" />
        <div className="flex justify-around items-end flex-wrap gap-y-4">
          <Knob value={hornRate} min={0.1} max={10} onChange={(v) => onUpdateParameter('hornRate', v)} label="Horn Hz" color="#fb923c" formatValue={(v) => `${v.toFixed(1)}`} />
          <Knob value={hornDepth} min={0} max={1} onChange={(v) => onUpdateParameter('hornDepth', v)} label="Horn Dep" color="#fb923c" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={drumRate} min={0.1} max={8} onChange={(v) => onUpdateParameter('drumRate', v)} label="Drum Hz" color="#fdba74" formatValue={(v) => `${v.toFixed(1)}`} />
          <Knob value={drumDepth} min={0} max={1} onChange={(v) => onUpdateParameter('drumDepth', v)} label="Drum Dep" color="#fdba74" formatValue={(v) => `${Math.round(v * 100)}%`} />
        </div>
      </section>
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <div className="flex justify-around items-end">
          <Knob value={doppler} min={0} max={1} onChange={(v) => onUpdateParameter('doppler', v)} label="Doppler" color="#fed7aa" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={width} min={0} max={1} onChange={(v) => onUpdateParameter('width', v)} label="Width" color="#fed7aa" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet} label="Wet" color="#fef3c7" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </section>
    </div>
  );
};

// ============================================================================
// SPRING REVERB EDITOR
// ============================================================================

export const SpringReverbEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
}) => {
  const decay = getParam(effect, 'decay', 0.6);
  const damping = getParam(effect, 'damping', 0.4);
  const tension = getParam(effect, 'tension', 0.5);
  const springMix = getParam(effect, 'mix', 0.35);
  const drip = getParam(effect, 'drip', 0.5);
  const diffusion = getParam(effect, 'diffusion', 0.7);

  return (
    <div className="space-y-4">
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader color="#059669" title="Spring Tank" />
        <div className="flex justify-around items-end">
          <Knob value={decay} min={0} max={1} onChange={(v) => onUpdateParameter('decay', v)} label="Decay" color="#059669" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={damping} min={0} max={1} onChange={(v) => onUpdateParameter('damping', v)} label="Damp" color="#059669" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={tension} min={0} max={1} onChange={(v) => onUpdateParameter('tension', v)} label="Tension" color="#10b981" formatValue={(v) => `${Math.round(v * 100)}%`} />
        </div>
      </section>
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader color="#34d399" title="Character" />
        <div className="flex justify-around items-end">
          <Knob value={drip} min={0} max={1} onChange={(v) => onUpdateParameter('drip', v)} label="Drip" color="#34d399" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={diffusion} min={0} max={1} onChange={(v) => onUpdateParameter('diffusion', v)} label="Diffusion" color="#34d399" formatValue={(v) => `${Math.round(v * 100)}%`} />
        </div>
      </section>
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <div className="flex justify-around items-end">
          <Knob value={springMix} min={0} max={1} onChange={(v) => onUpdateParameter('mix', v)} label="Int. Mix" color="#6ee7b7" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet} label="Wet" color="#a7f3d0" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
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
  SpaceEcho: SpaceEchoEditor,
  BiPhase: BiPhaseEditor,
  DubFilter: DubFilterEditor,
  TapeSaturation: TapeSaturationEditor,
  VinylNoise: VinylNoiseEditor,
  SidechainCompressor: SidechainCompressorEditor,
  SpaceyDelayer: SpaceyDelayerEditor,
  RETapeEcho: RETapeEchoEditor,
  MoogFilter: MoogFilterEditor,
  MVerb: MVerbEditor,
  Leslie: LeslieEditor,
  SpringReverb: SpringReverbEditor,
  // WAM 2.0 effects — embed native plugin GUI
  WAMBigMuff: WAMEffectEditor,
  WAMTS9: WAMEffectEditor,
  WAMDistoMachine: WAMEffectEditor,
  WAMQuadraFuzz: WAMEffectEditor,
  WAMVoxAmp: WAMEffectEditor,
  WAMStonePhaser: WAMEffectEditor,
  WAMPingPongDelay: WAMEffectEditor,
  WAMFaustDelay: WAMEffectEditor,
  WAMPitchShifter: WAMEffectEditor,
  WAMGraphicEQ: WAMEffectEditor,
  WAMPedalboard: WAMEffectEditor,
};

/**
 * Get the appropriate visual editor for an effect type
 */
// eslint-disable-next-line react-refresh/only-export-components
export function getVisualEffectEditor(effectType: string): React.FC<VisualEffectEditorProps> {
  return EFFECT_EDITORS[effectType] || GenericEffectEditor;
}

// ============================================================================
// MAIN VISUAL EFFECT EDITOR WRAPPER
// ============================================================================

interface VisualEffectEditorWrapperProps {
  effect: EffectConfig;
  onUpdateParameter: (key: string, value: number | string) => void;
  onUpdateWet: (wet: number) => void;
  onClose?: () => void;
}

/** Enclosure color mapping — background tint per effect type */
// eslint-disable-next-line react-refresh/only-export-components
export const ENCLOSURE_COLORS: Record<string, { bg: string; bgEnd: string; accent: string; border: string }> = {
  Distortion:          { bg: '#2a1008', bgEnd: '#1a0a04', accent: '#ef4444', border: '#3a1a0a' },
  Reverb:              { bg: '#0e0a20', bgEnd: '#080618', accent: '#6366f1', border: '#1a1430' },
  JCReverb:            { bg: '#0e0a20', bgEnd: '#080618', accent: '#6366f1', border: '#1a1430' },
  Delay:               { bg: '#081420', bgEnd: '#040e18', accent: '#3b82f6', border: '#0a1e30' },
  FeedbackDelay:       { bg: '#081420', bgEnd: '#040e18', accent: '#3b82f6', border: '#0a1e30' },
  PingPongDelay:       { bg: '#081420', bgEnd: '#040e18', accent: '#3b82f6', border: '#0a1e30' },
  Chorus:              { bg: '#200a18', bgEnd: '#180614', accent: '#ec4899', border: '#301428' },
  Phaser:              { bg: '#180a20', bgEnd: '#100618', accent: '#a855f7', border: '#281430' },
  Tremolo:             { bg: '#201408', bgEnd: '#180e04', accent: '#f97316', border: '#301e0a' },
  Vibrato:             { bg: '#081a18', bgEnd: '#041210', accent: '#14b8a6', border: '#0a2a28' },
  Compressor:          { bg: '#081a0a', bgEnd: '#041204', accent: '#10b981', border: '#0a2a0e' },
  EQ3:                 { bg: '#081420', bgEnd: '#040e18', accent: '#3b82f6', border: '#0a1e30' },
  Filter:              { bg: '#201408', bgEnd: '#180e04', accent: '#f97316', border: '#301e0a' },
  StereoWidener:       { bg: '#200a18', bgEnd: '#180614', accent: '#ec4899', border: '#301428' },
  AutoFilter:          { bg: '#1a1808', bgEnd: '#121004', accent: '#eab308', border: '#2a280a' },
  AutoPanner:          { bg: '#081a0a', bgEnd: '#041204', accent: '#22c55e', border: '#0a2a0e' },
  AutoWah:             { bg: '#200a10', bgEnd: '#18060a', accent: '#f43f5e', border: '#301418' },
  BitCrusher:          { bg: '#141a08', bgEnd: '#0e1204', accent: '#84cc16', border: '#1e2a0a' },
  Chebyshev:           { bg: '#1a1508', bgEnd: '#120e04', accent: '#f59e0b', border: '#2a2008' },
  FrequencyShifter:    { bg: '#081820', bgEnd: '#041018', accent: '#06b6d4', border: '#0a2830' },
  PitchShift:          { bg: '#100a20', bgEnd: '#0a0618', accent: '#8b5cf6', border: '#1a1430' },
  SpaceyDelayer:       { bg: '#100a20', bgEnd: '#0a0618', accent: '#8b5cf6', border: '#1a1430' },
  SpaceEcho:           { bg: '#0e0a20', bgEnd: '#080618', accent: '#6366f1', border: '#1a1430' },
  BiPhase:             { bg: '#180a20', bgEnd: '#100618', accent: '#a855f7', border: '#281430' },
  DubFilter:           { bg: '#081a0a', bgEnd: '#041204', accent: '#22c55e', border: '#0a2a0e' },
  TapeSaturation:      { bg: '#2a1008', bgEnd: '#1a0a04', accent: '#ef4444', border: '#3a1a0a' },
  VinylNoise:          { bg: '#1a1008', bgEnd: '#120a04', accent: '#d97706', border: '#2a1a08' },
  SidechainCompressor: { bg: '#081a10', bgEnd: '#04120a', accent: '#10b981', border: '#0a2a18' },
  RETapeEcho:          { bg: '#2a0808', bgEnd: '#1a0404', accent: '#dc2626', border: '#3a1010' },
  MoogFilter:          { bg: '#1a1508', bgEnd: '#120e04', accent: '#f59e0b', border: '#2a2008' },
  MVerb:               { bg: '#140a22', bgEnd: '#0c061a', accent: '#7c3aed', border: '#201432' },
  Leslie:              { bg: '#201408', bgEnd: '#180e04', accent: '#f97316', border: '#301e0a' },
  SpringReverb:        { bg: '#081a0a', bgEnd: '#041204', accent: '#059669', border: '#0a2a0e' },
  // WAM 2.0 effects
  WAMBigMuff:          { bg: '#2a1008', bgEnd: '#1a0a04', accent: '#ef4444', border: '#3a1a0a' },
  WAMTS9:              { bg: '#201408', bgEnd: '#180e04', accent: '#f97316', border: '#301e0a' },
  WAMDistoMachine:     { bg: '#2a1008', bgEnd: '#1a0a04', accent: '#dc2626', border: '#3a1a0a' },
  WAMQuadraFuzz:       { bg: '#2a1008', bgEnd: '#1a0a04', accent: '#ef4444', border: '#3a1a0a' },
  WAMVoxAmp:           { bg: '#201408', bgEnd: '#180e04', accent: '#f97316', border: '#301e0a' },
  WAMStonePhaser:      { bg: '#180a20', bgEnd: '#100618', accent: '#a855f7', border: '#281430' },
  WAMPingPongDelay:    { bg: '#081420', bgEnd: '#040e18', accent: '#3b82f6', border: '#0a1e30' },
  WAMFaustDelay:       { bg: '#081420', bgEnd: '#040e18', accent: '#3b82f6', border: '#0a1e30' },
  WAMPitchShifter:     { bg: '#100a20', bgEnd: '#0a0618', accent: '#8b5cf6', border: '#1a1430' },
  WAMGraphicEQ:        { bg: '#081420', bgEnd: '#040e18', accent: '#3b82f6', border: '#0a1e30' },
  WAMPedalboard:       { bg: '#081a18', bgEnd: '#041210', accent: '#14b8a6', border: '#0a2a28' },
};

// eslint-disable-next-line react-refresh/only-export-components
export const DEFAULT_ENCLOSURE = { bg: '#181818', bgEnd: '#101010', accent: '#888', border: '#282828' };

/** 3D pedal enclosure shadows */
const ENCLOSURE_SHADOW = [
  '0 6px 16px rgba(0,0,0,0.5)',
  '0 2px 4px rgba(0,0,0,0.7)',
  'inset 0 1px 0 rgba(255,255,255,0.06)',
  'inset 0 -1px 0 rgba(0,0,0,0.4)',
].join(', ');

/** Resolves and renders the correct sub-editor for the given effect type */
const EffectEditorDispatch: React.FC<VisualEffectEditorProps & { effectType: string }> = ({
  effectType,
  ...props
}) => {
  const Editor = EFFECT_EDITORS[effectType] || GenericEffectEditor;
  return <Editor {...props} />;
};

export const VisualEffectEditorWrapper: React.FC<VisualEffectEditorWrapperProps> = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
  onClose,
}) => {

  // Icon mapping
  const iconMap: Record<string, React.ReactNode> = {
    Distortion: <Zap size={18} className="text-white" />,
    Reverb: <Waves size={18} className="text-white" />,
    JCReverb: <Waves size={18} className="text-white" />,
    Delay: <Clock size={18} className="text-white" />,
    FeedbackDelay: <Clock size={18} className="text-white" />,
    PingPongDelay: <Clock size={18} className="text-white" />,
    Chorus: <Radio size={18} className="text-white" />,
    Phaser: <Radio size={18} className="text-white" />,
    Tremolo: <Wind size={18} className="text-white" />,
    Vibrato: <Wind size={18} className="text-white" />,
    Compressor: <Gauge size={18} className="text-white" />,
    EQ3: <Sliders size={18} className="text-white" />,
    Filter: <Sliders size={18} className="text-white" />,
    StereoWidener: <ArrowLeftRight size={18} className="text-white" />,
    SpaceyDelayer: <Clock size={18} className="text-white" />,
    SpaceEcho: <Waves size={18} className="text-white" />,
    BiPhase: <Radio size={18} className="text-white" />,
    DubFilter: <Sliders size={18} className="text-white" />,
    TapeSaturation: <Zap size={18} className="text-white" />,
    VinylNoise: <Disc size={18} className="text-white" />,
    SidechainCompressor: <Gauge size={18} className="text-white" />,
    RETapeEcho: <Disc size={18} className="text-white" />,
    MoogFilter: <Sliders size={18} className="text-white" />,
    MVerb: <Waves size={18} className="text-white" />,
    Leslie: <Radio size={18} className="text-white" />,
    SpringReverb: <Waves size={18} className="text-white" />,
    // WAM 2.0 effects
    WAMBigMuff: <Globe size={18} className="text-white" />,
    WAMTS9: <Globe size={18} className="text-white" />,
    WAMDistoMachine: <Globe size={18} className="text-white" />,
    WAMQuadraFuzz: <Globe size={18} className="text-white" />,
    WAMVoxAmp: <Globe size={18} className="text-white" />,
    WAMStonePhaser: <Globe size={18} className="text-white" />,
    WAMPingPongDelay: <Globe size={18} className="text-white" />,
    WAMFaustDelay: <Globe size={18} className="text-white" />,
    WAMPitchShifter: <Globe size={18} className="text-white" />,
    WAMGraphicEQ: <Globe size={18} className="text-white" />,
    WAMPedalboard: <Globe size={18} className="text-white" />,
  };

  const enc = ENCLOSURE_COLORS[effect.type] || DEFAULT_ENCLOSURE;
  const icon = iconMap[effect.type] || <Music size={18} className="text-white" />;
  const isWAM = effect.type.startsWith('WAM');

  // WAM effects render only their native GUI — skip the pedal enclosure wrapper
  if (isWAM) {
    return (
      <div className="overflow-y-auto scrollbar-modern">
        <EffectEditorDispatch
          effectType={effect.type}
          effect={effect}
          onUpdateParameter={onUpdateParameter}
          onUpdateWet={onUpdateWet}
        />
      </div>
    );
  }

  return (
    <div
      className="synth-editor-container rounded-xl overflow-hidden select-none"
      style={{
        background: `linear-gradient(170deg, ${enc.bg} 0%, ${enc.bgEnd} 100%)`,
        border: `2px solid ${enc.border}`,
        boxShadow: ENCLOSURE_SHADOW,
      }}
    >
      {/* Pedal Header — icon, name, LED, status */}
      <div
        className="px-5 py-4 flex items-center justify-between"
        style={{
          background: `linear-gradient(180deg, rgba(255,255,255,0.03) 0%, transparent 100%)`,
          borderBottom: `1px solid ${enc.border}`,
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="p-2 rounded-lg"
            style={{
              background: `linear-gradient(135deg, ${enc.accent}40, ${enc.accent}20)`,
              border: `1px solid ${enc.accent}30`,
              boxShadow: `0 0 12px ${enc.accent}15`,
            }}
          >
            {icon}
          </div>
          <div>
            <h2 className="text-base font-black text-white tracking-wide">
              {effect.neuralModelName || effect.type}
            </h2>
            <div className="flex items-center gap-2 mt-0.5">
              {/* LED indicator */}
              <div
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  backgroundColor: effect.enabled ? '#22ff44' : '#1a2a1a',
                  boxShadow: effect.enabled
                    ? '0 0 4px 1px rgba(34,255,68,0.5), 0 0 10px 3px rgba(34,255,68,0.15)'
                    : 'inset 0 1px 2px rgba(0,0,0,0.5)',
                  transition: 'all 0.3s ease',
                }}
              />
              <p className="text-[11px] text-gray-400 font-medium">
                {effect.enabled ? 'Active' : 'Bypassed'} | Mix: {effect.wet}%
              </p>
            </div>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Editor Content */}
      <div className="p-4 overflow-y-auto scrollbar-modern">
        <EffectEditorDispatch
          effectType={effect.type}
          effect={effect}
          onUpdateParameter={onUpdateParameter}
          onUpdateWet={onUpdateWet}
        />
      </div>
    </div>
  );
};
