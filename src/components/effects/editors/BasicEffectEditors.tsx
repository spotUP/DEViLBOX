/**
 * Basic effect editors: Distortion, Reverb, Delay, Chorus, Phaser, Tremolo, Vibrato
 */

import React from 'react';
import { useEffectAnalyser } from '@hooks/useEffectAnalyser';
import { EffectOscilloscope, WaveshaperCurve } from '../EffectVisualizer';
import { Knob } from '@components/controls/Knob';
import { isEffectBpmSynced } from '@engine/bpmSync';
import { SectionHeader, getParam, renderBpmSync, type VisualEffectEditorProps } from './shared';

// ============================================================================
// DISTORTION
// ============================================================================

export const DistortionEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
}) => {
  const drive = getParam(effect, 'drive', 0.4);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#ef4444" />
      <WaveshaperCurve type="Distortion" drive={drive} color="#ef4444" height={100} />
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#ef4444" title="Distortion" />
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
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#6366f1" />
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#6366f1" title="Reverb" />
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
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  const isPingPong = effect.type === 'PingPongDelay';

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#3b82f6" />
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#3b82f6" title={isPingPong ? 'Ping Pong Delay' : 'Delay'} />
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
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#ec4899" />
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#ec4899" title="Chorus" />
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
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#a855f7" />
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#a855f7" title="Phaser" />
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
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#f97316" />
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#f97316" title="Tremolo" />
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
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#14b8a6" />
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#14b8a6" title="Vibrato" />
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
