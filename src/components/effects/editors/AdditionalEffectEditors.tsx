/**
 * Additional effect editors: TapeDegradation, AmbientDelay, ShimmerReverb, GranularFreeze
 *
 * These effects were missing custom editors and fell back to GenericEffectEditor
 * (which only shows a Mix knob). Now they have full knob-based editing.
 */

import React from 'react';
import { useEffectAnalyser } from '@hooks/useEffectAnalyser';
import { EffectOscilloscope } from '../EffectVisualizer';
import { Knob } from '@components/controls/Knob';
import { isEffectBpmSynced } from '@engine/bpmSync';
import { SectionHeader, getParam, renderBpmSync, type VisualEffectEditorProps } from './shared';

// ============================================================================
// TAPE DEGRADATION — Lo-Fi tape wear simulation
// ============================================================================

export const TapeDegradationEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
}) => {
  const wow = getParam(effect, 'wow', 30);
  const flutter = getParam(effect, 'flutter', 20);
  const hiss = getParam(effect, 'hiss', 15);
  const dropouts = getParam(effect, 'dropouts', 0);
  const saturation = getParam(effect, 'saturation', 30);
  const toneShift = getParam(effect, 'toneShift', 50);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#a1887f" />

      {/* Tape Mechanics */}
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#a1887f" title="Tape Mechanics" />
        <div className="flex justify-around items-end">
          <Knob value={wow} min={0} max={100} onChange={(v) => onUpdateParameter('wow', v)}
            label="Wow" color="#a1887f" formatValue={(v) => `${Math.round(v)}%`} />
          <Knob value={flutter} min={0} max={100} onChange={(v) => onUpdateParameter('flutter', v)}
            label="Flutter" color="#a1887f" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </section>

      {/* Degradation */}
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#8d6e63" title="Degradation" />
        <div className="flex justify-around items-end">
          <Knob value={hiss} min={0} max={100} onChange={(v) => onUpdateParameter('hiss', v)}
            label="Hiss" color="#8d6e63" formatValue={(v) => `${Math.round(v)}%`} />
          <Knob value={dropouts} min={0} max={100} onChange={(v) => onUpdateParameter('dropouts', v)}
            label="Dropouts" color="#8d6e63" formatValue={(v) => `${Math.round(v)}%`} />
          <Knob value={saturation} min={0} max={100} onChange={(v) => onUpdateParameter('saturation', v)}
            label="Saturation" color="#8d6e63" formatValue={(v) => `${Math.round(v)}%`} />
          <Knob value={toneShift} min={0} max={100} onChange={(v) => onUpdateParameter('toneShift', v)}
            label="Tone" color="#8d6e63" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </section>

      {/* Mix */}
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <div className="flex justify-center">
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#bcaaa4" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </section>
    </div>
  );
};

// ============================================================================
// AMBIENT DELAY — Multi-tap modulated delay with filtering
// ============================================================================

export const AmbientDelayEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
}) => {
  const time = getParam(effect, 'time', 375);
  const feedback = getParam(effect, 'feedback', 55);
  const taps = getParam(effect, 'taps', 2);
  const filterFreq = getParam(effect, 'filterFreq', 2500);
  const filterQ = getParam(effect, 'filterQ', 1.5);
  const modRate = getParam(effect, 'modRate', 30);
  const modDepth = getParam(effect, 'modDepth', 15);
  const stereoSpread = getParam(effect, 'stereoSpread', 50);
  const diffusion = getParam(effect, 'diffusion', 20);
  const synced = isEffectBpmSynced(effect.parameters);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#26a69a" />

      {/* Time & Feedback */}
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#26a69a" title="Delay" />
        {renderBpmSync(effect, onUpdateParameter)}
        <div className="flex justify-around items-end">
          <Knob value={time} min={10} max={2000} onChange={(v) => onUpdateParameter('time', v)}
            label="Time" size="lg" color="#26a69a" disabled={synced}
            formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`} />
          <Knob value={feedback} min={0} max={95} onChange={(v) => onUpdateParameter('feedback', v)}
            label="Feedback" size="lg" color="#26a69a" formatValue={(v) => `${Math.round(v)}%`} />
          <Knob value={taps} min={1} max={3} onChange={(v) => onUpdateParameter('taps', Math.round(v))}
            label="Taps" size="lg" color="#26a69a" formatValue={(v) => `${Math.round(v)}`} />
        </div>
      </section>

      {/* Filter */}
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#00897b" title="Filter" />
        <div className="flex justify-around items-end">
          <Knob value={filterFreq} min={100} max={10000} onChange={(v) => onUpdateParameter('filterFreq', v)}
            label="Freq" color="#00897b"
            formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}Hz`} />
          <Knob value={filterQ} min={0.1} max={10} onChange={(v) => onUpdateParameter('filterQ', v)}
            label="Q" color="#00897b" formatValue={(v) => v.toFixed(1)} />
        </div>
      </section>

      {/* Modulation & Stereo */}
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#4db6ac" title="Modulation" />
        <div className="flex justify-around items-end">
          <Knob value={modRate} min={0} max={100} onChange={(v) => onUpdateParameter('modRate', v)}
            label="Rate" color="#4db6ac" formatValue={(v) => `${Math.round(v)}%`} />
          <Knob value={modDepth} min={0} max={100} onChange={(v) => onUpdateParameter('modDepth', v)}
            label="Depth" color="#4db6ac" formatValue={(v) => `${Math.round(v)}%`} />
          <Knob value={stereoSpread} min={0} max={100} onChange={(v) => onUpdateParameter('stereoSpread', v)}
            label="Spread" color="#4db6ac" formatValue={(v) => `${Math.round(v)}%`} />
          <Knob value={diffusion} min={0} max={100} onChange={(v) => onUpdateParameter('diffusion', v)}
            label="Diffusion" color="#4db6ac" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </section>

      {/* Mix */}
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <div className="flex justify-center">
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#80cbc4" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </section>
    </div>
  );
};

// ============================================================================
// SHIMMER REVERB — Pitch-shifted reverb with modulation
// ============================================================================

export const ShimmerReverbEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
}) => {
  const decay = getParam(effect, 'decay', 70);
  const shimmer = getParam(effect, 'shimmer', 50);
  const pitch = getParam(effect, 'pitch', 12);
  const damping = getParam(effect, 'damping', 50);
  const size = getParam(effect, 'size', 70);
  const predelay = getParam(effect, 'predelay', 40);
  const modRate = getParam(effect, 'modRate', 30);
  const modDepth = getParam(effect, 'modDepth', 20);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#7c4dff" />

      {/* Reverb Core */}
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#7c4dff" title="Reverb" />
        <div className="flex justify-around items-end">
          <Knob value={decay} min={0} max={100} onChange={(v) => onUpdateParameter('decay', v)}
            label="Decay" size="lg" color="#7c4dff" formatValue={(v) => `${Math.round(v)}%`} />
          <Knob value={size} min={0} max={100} onChange={(v) => onUpdateParameter('size', v)}
            label="Size" size="lg" color="#7c4dff" formatValue={(v) => `${Math.round(v)}%`} />
          <Knob value={damping} min={0} max={100} onChange={(v) => onUpdateParameter('damping', v)}
            label="Damping" color="#7c4dff" formatValue={(v) => `${Math.round(v)}%`} />
          <Knob value={predelay} min={0} max={200} onChange={(v) => onUpdateParameter('predelay', v)}
            label="Pre-delay" color="#7c4dff" formatValue={(v) => `${Math.round(v)}ms`} />
        </div>
      </section>

      {/* Shimmer */}
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#b388ff" title="Shimmer" />
        <div className="flex justify-around items-end">
          <Knob value={shimmer} min={0} max={100} onChange={(v) => onUpdateParameter('shimmer', v)}
            label="Amount" size="lg" color="#b388ff" formatValue={(v) => `${Math.round(v)}%`} />
          <Knob value={pitch} min={-24} max={24} onChange={(v) => onUpdateParameter('pitch', Math.round(v))}
            label="Pitch" size="lg" color="#b388ff" formatValue={(v) => `${Math.round(v)}st`} />
        </div>
      </section>

      {/* Modulation */}
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#9575cd" title="Modulation" />
        <div className="flex justify-around items-end">
          <Knob value={modRate} min={0} max={100} onChange={(v) => onUpdateParameter('modRate', v)}
            label="Rate" color="#9575cd" formatValue={(v) => `${Math.round(v)}%`} />
          <Knob value={modDepth} min={0} max={100} onChange={(v) => onUpdateParameter('modDepth', v)}
            label="Depth" color="#9575cd" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </section>

      {/* Mix */}
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <div className="flex justify-center">
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#ce93d8" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </section>
    </div>
  );
};

// ============================================================================
// GRANULAR FREEZE — Granular buffer freeze effect
// ============================================================================

export const GranularFreezeEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
}) => {
  const freeze = getParam(effect, 'freeze', 0);
  const grainSize = getParam(effect, 'grainSize', 80);
  const density = getParam(effect, 'density', 12);
  const scatter = getParam(effect, 'scatter', 30);
  const pitch = getParam(effect, 'pitch', 0);
  const spray = getParam(effect, 'spray', 20);
  const shimmer = getParam(effect, 'shimmer', 0);
  const stereoWidth = getParam(effect, 'stereoWidth', 70);
  const feedback = getParam(effect, 'feedback', 0);
  const captureLen = getParam(effect, 'captureLen', 500);
  const attack = getParam(effect, 'attack', 5);
  const release = getParam(effect, 'release', 40);
  const thru = getParam(effect, 'thru', 0);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  const isFrozen = freeze >= 0.5;

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#00bcd4" />

      {/* Freeze Toggle */}
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#00bcd4" title="Freeze" />
        <div className="flex justify-center gap-4 items-center">
          <button
            onClick={() => onUpdateParameter('freeze', isFrozen ? 0 : 1)}
            className={`px-8 py-3 text-sm font-bold rounded-lg transition-colors ${
              isFrozen
                ? 'bg-cyan-600 text-text-primary ring-2 ring-cyan-400'
                : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover'
            }`}
          >
            {isFrozen ? 'FROZEN' : 'LIVE'}
          </button>
          <button
            onClick={() => onUpdateParameter('thru', thru >= 0.5 ? 0 : 1)}
            className={`px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
              thru >= 0.5
                ? 'bg-cyan-700 text-text-primary'
                : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover'
            }`}
          >
            Thru
          </button>
        </div>
      </section>

      {/* Grains */}
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#00bcd4" title="Grains" />
        <div className="flex justify-around items-end">
          <Knob value={grainSize} min={5} max={500} onChange={(v) => onUpdateParameter('grainSize', v)}
            label="Size" color="#00bcd4" formatValue={(v) => `${Math.round(v)}ms`} />
          <Knob value={density} min={1} max={50} onChange={(v) => onUpdateParameter('density', Math.round(v))}
            label="Density" color="#00bcd4" formatValue={(v) => `${Math.round(v)}`} />
          <Knob value={scatter} min={0} max={100} onChange={(v) => onUpdateParameter('scatter', v)}
            label="Scatter" color="#00bcd4" formatValue={(v) => `${Math.round(v)}%`} />
          <Knob value={spray} min={0} max={100} onChange={(v) => onUpdateParameter('spray', v)}
            label="Spray" color="#00bcd4" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </section>

      {/* Pitch & Character */}
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#0097a7" title="Character" />
        <div className="flex justify-around items-end">
          <Knob value={pitch} min={-24} max={24} onChange={(v) => onUpdateParameter('pitch', Math.round(v))}
            label="Pitch" color="#0097a7" formatValue={(v) => `${Math.round(v)}st`} />
          <Knob value={shimmer} min={0} max={100} onChange={(v) => onUpdateParameter('shimmer', v)}
            label="Shimmer" color="#0097a7" formatValue={(v) => `${Math.round(v)}%`} />
          <Knob value={stereoWidth} min={0} max={100} onChange={(v) => onUpdateParameter('stereoWidth', v)}
            label="Width" color="#0097a7" formatValue={(v) => `${Math.round(v)}%`} />
          <Knob value={feedback} min={0} max={95} onChange={(v) => onUpdateParameter('feedback', v)}
            label="Feedback" color="#0097a7" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </section>

      {/* Capture & Envelope */}
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#00838f" title="Capture" />
        <div className="flex justify-around items-end">
          <Knob value={captureLen} min={50} max={5000} onChange={(v) => onUpdateParameter('captureLen', v)}
            label="Length" color="#00838f"
            formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`} />
          <Knob value={attack} min={1} max={100} onChange={(v) => onUpdateParameter('attack', v)}
            label="Attack" color="#00838f" formatValue={(v) => `${Math.round(v)}ms`} />
          <Knob value={release} min={1} max={500} onChange={(v) => onUpdateParameter('release', v)}
            label="Release" color="#00838f" formatValue={(v) => `${Math.round(v)}ms`} />
        </div>
      </section>

      {/* Mix */}
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <div className="flex justify-center">
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#4dd0e1" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </section>
    </div>
  );
};
