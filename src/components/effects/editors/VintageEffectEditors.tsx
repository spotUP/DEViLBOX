/**
 * Vintage effect editors: BiPhase, TapeSaturation, VinylNoise, MVerb, Leslie,
 * SpringReverb, KissOfShame (TapeSimulator)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useEffectAnalyser } from '@hooks/useEffectAnalyser';
import { EffectOscilloscope, WaveshaperCurve } from '../EffectVisualizer';
import { Knob } from '@components/controls/Knob';
import { isEffectBpmSynced } from '@engine/bpmSync';
import { getToneEngine } from '@engine/ToneEngine';
import { useAudioStore } from '@stores/useAudioStore';
import { SectionHeader, getParam, renderBpmSync, type VisualEffectEditorProps } from './shared';

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
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#a855f7" />
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#a855f7" title="Routing" />
        <div className="flex gap-2 justify-center mb-2">
          <button
            onClick={() => onUpdateParameter('routing', 0)}
            className={`px-4 py-1.5 text-xs font-medium rounded transition-colors ${
              Math.round(routing) === 0
                ? 'bg-purple-600 text-text-primary'
                : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover'
            }`}
          >
            Parallel
          </button>
          <button
            onClick={() => onUpdateParameter('routing', 1)}
            className={`px-4 py-1.5 text-xs font-medium rounded transition-colors ${
              Math.round(routing) === 1
                ? 'bg-purple-600 text-text-primary'
                : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover'
            }`}
          >
            Series
          </button>
        </div>
      </section>
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#a855f7" title="Phase A" />
        <div className="flex justify-around items-end">
          <div className={synced ? 'opacity-40 pointer-events-none' : ''}>
            <Knob
              paramKey="biphase.rateA"
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
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#c084fc" title="Phase B" />
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
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <div className="flex justify-around items-end">
          <Knob
            paramKey="biphase.feedback"
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
// TAPE SATURATION
// ============================================================================

export const TapeSaturationEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
}) => {
  const drive = getParam(effect, 'drive', 50);
  const tone = getParam(effect, 'tone', 12000);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#ef4444" />
      <WaveshaperCurve type="TapeSaturation" drive={drive / 100} color="#ef4444" height={100} />
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#ef4444" title="Tape Saturation" />
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
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
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

// Speed = exact turntable rotation frequency (RPM/60 Hz, scaled ×10 for 0-100 UI range):
//   33 RPM → 0.55 Hz → speed 5.5 | 45 RPM → 0.75 Hz → speed 7.5 | 78 RPM → 1.30 Hz → speed 13.0
const VINYL_RPM_PRESETS = [
  { label: '33', rpm: 33, speed: 5.5  },
  { label: '45', rpm: 45, speed: 7.5  },
  { label: '78', rpm: 78, speed: 13.0 },
] as const;

// Condition presets — set all 12 params (hiss/dust/age + 9 emulator) independently of RPM.
// Mix and match: e.g. "78 RPM + New" or "33 RPM + Shellac".
const VINYL_CONDITION_PRESETS = [
  { label: 'New',     hiss: 28, dust: 22, age: 18, riaa: 35, stylusResonance: 30, wornStylus:  0, pinch: 15, innerGroove:  5, ghostEcho:  5, dropout:  0, warp:  0, eccentricity:  8 },
  { label: 'Played',  hiss: 50, dust: 58, age: 45, riaa: 52, stylusResonance: 50, wornStylus: 28, pinch: 35, innerGroove: 25, ghostEcho: 20, dropout: 10, warp: 10, eccentricity: 18 },
  { label: 'Worn',    hiss: 70, dust: 78, age: 66, riaa: 68, stylusResonance: 65, wornStylus: 62, pinch: 52, innerGroove: 55, ghostEcho: 40, dropout: 35, warp: 28, eccentricity: 32 },
  { label: 'Shellac', hiss: 86, dust: 86, age: 86, riaa: 84, stylusResonance: 80, wornStylus: 84, pinch: 72, innerGroove: 76, ghostEcho: 58, dropout: 62, warp: 46, eccentricity: 52 },
] as const;

export const VinylNoiseEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateParameter,
  onUpdateParameters,
  onUpdateWet,
}) => {
  // Notify the worklet that the editor is open so it produces audio for preview
  useEffect(() => {
    const node = getToneEngine().getMasterEffectNode(effect.id);
    if (node && 'setEditorOpen' in node) (node as { setEditorOpen(o: boolean): void }).setEditorOpen(true);
    return () => {
      const n = getToneEngine().getMasterEffectNode(effect.id);
      if (n && 'setEditorOpen' in n) (n as { setEditorOpen(o: boolean): void }).setEditorOpen(false);
    };
  }, [effect.id]);

  const hiss            = getParam(effect, 'hiss',            50);
  const dust            = getParam(effect, 'dust',            50);
  const age             = getParam(effect, 'age',             50);
  const speed           = getParam(effect, 'speed',           0);
  const riaa            = getParam(effect, 'riaa',            30);
  const stylusResonance = getParam(effect, 'stylusResonance', 25);
  const wornStylus      = getParam(effect, 'wornStylus',      0);
  const pinch           = getParam(effect, 'pinch',           15);
  const innerGroove     = getParam(effect, 'innerGroove',     0);
  const ghostEcho       = getParam(effect, 'ghostEcho',       0);
  const dropout         = getParam(effect, 'dropout',         0);
  const warp            = getParam(effect, 'warp',            0);
  const eccentricity    = getParam(effect, 'eccentricity',    0);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  const activeRpm  = VINYL_RPM_PRESETS.find(
    (p) => Math.abs(speed - p.speed) < 0.5
  )?.rpm ?? null;

  const activeCond = VINYL_CONDITION_PRESETS.find(
    (p) => p.hiss === Math.round(hiss) && p.dust === Math.round(dust) && p.age === Math.round(age)
      && p.riaa === Math.round(riaa)
  )?.label ?? null;

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#d97706" />
      {/* ── Section 1: Noise ─────────────────────────────────────────────── */}
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#d97706" title="Noise" />

        {/* RPM selector — sets rotation speed (LFO frequency) only */}
        <div className="flex gap-2 mb-2">
          <span className="text-xs text-text-muted self-center w-16 shrink-0">RPM</span>
          {VINYL_RPM_PRESETS.map((p) => (
            <button
              key={p.rpm}
              onClick={() => onUpdateParameter('speed', p.speed)}
              className={[
                'flex-1 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all',
                activeRpm === p.rpm
                  ? 'bg-amber-700/70 border-amber-500 text-amber-100'
                  : 'bg-black/40 border-dark-border text-text-muted hover:border-amber-700 hover:text-amber-300',
              ].join(' ')}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Condition selector — sets all 12 emulator params (speed excluded) */}
        <div className="flex gap-2 mb-4">
          <span className="text-xs text-text-muted self-center w-16 shrink-0">Condition</span>
          {VINYL_CONDITION_PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => {
                const allParams: Record<string, number> = {
                  hiss: p.hiss,
                  dust: p.dust,
                  age: p.age,
                  riaa: p.riaa,
                  stylusResonance: p.stylusResonance,
                  wornStylus: p.wornStylus,
                  pinch: p.pinch,
                  innerGroove: p.innerGroove,
                  ghostEcho: p.ghostEcho,
                  dropout: p.dropout,
                  warp: p.warp,
                  eccentricity: p.eccentricity,
                };
                if (onUpdateParameters) {
                  onUpdateParameters(allParams);
                } else {
                  Object.entries(allParams).forEach(([key, value]) => onUpdateParameter(key, value));
                }
              }}
              className={[
                'flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all',
                activeCond === p.label
                  ? 'bg-amber-700/70 border-amber-500 text-amber-100'
                  : 'bg-black/40 border-dark-border text-text-muted hover:border-amber-700 hover:text-amber-300',
              ].join(' ')}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Individual noise volume controls */}
        <div className="flex gap-3">
          {/* Hiss section */}
          <div className="flex-1 rounded-lg bg-black/20 border border-amber-900/30 p-2">
            <div className="text-xs font-mono text-amber-600/80 mb-2 text-center tracking-widest uppercase">Hiss</div>
            <div className="flex justify-center">
              <Knob
                value={hiss}
                min={0}
                max={100}
                onChange={(v) => onUpdateParameter('hiss', v)}
                label="Volume"
                color="#d97706"
                formatValue={(v) => `${Math.round(v)}%`}
              />
            </div>
          </div>

          {/* Crackle section */}
          <div className="flex-1 rounded-lg bg-black/20 border border-amber-900/30 p-2">
            <div className="text-xs font-mono text-amber-600/80 mb-2 text-center tracking-widest uppercase">Crackle</div>
            <div className="flex justify-around">
              <Knob
                value={dust}
                min={0}
                max={100}
                onChange={(v) => onUpdateParameter('dust', v)}
                label="Volume"
                color="#d97706"
                formatValue={(v) => `${Math.round(v)}%`}
              />
              <Knob
                value={age}
                min={0}
                max={100}
                onChange={(v) => onUpdateParameter('age', v)}
                label="Warmth"
                color="#b45309"
                formatValue={(v) => `${Math.round(v)}%`}
              />
            </div>
          </div>
        </div>

        {/* Flutter */}
        <div className="flex justify-center pt-1">
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

      {/* ── Section 2: Tone ──────────────────────────────────────────────── */}
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#ca8a04" title="Tone" />
        <div className="flex justify-around items-end">
          <Knob
            value={riaa}
            min={0}
            max={100}
            onChange={(v) => onUpdateParameter('riaa', v)}
            label="RIAA"
            color="#d97706"
            formatValue={(v) => `${Math.round(v)}%`}
          />
          <Knob
            value={stylusResonance}
            min={0}
            max={100}
            onChange={(v) => onUpdateParameter('stylusResonance', v)}
            label="Resonance"
            color="#d97706"
            formatValue={(v) => `${Math.round(v)}%`}
          />
          <Knob
            value={wornStylus}
            min={0}
            max={100}
            onChange={(v) => onUpdateParameter('wornStylus', v)}
            label="Worn"
            color="#b45309"
            formatValue={(v) => `${Math.round(v)}%`}
          />
        </div>
      </section>

      {/* ── Section 3: Distortion ────────────────────────────────────────── */}
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#b45309" title="Distortion" />
        <div className="flex justify-around items-end">
          <Knob
            value={pinch}
            min={0}
            max={100}
            onChange={(v) => onUpdateParameter('pinch', v)}
            label="Pinch"
            color="#b45309"
            formatValue={(v) => `${Math.round(v)}%`}
          />
          <Knob
            value={innerGroove}
            min={0}
            max={100}
            onChange={(v) => onUpdateParameter('innerGroove', v)}
            label="Inner"
            color="#92400e"
            formatValue={(v) => `${Math.round(v)}%`}
          />
        </div>
      </section>

      {/* ── Section 4: Time / Space ──────────────────────────────────────── */}
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#78350f" title="Time / Space" />
        <div className="flex justify-around items-end">
          <Knob
            value={ghostEcho}
            min={0}
            max={100}
            onChange={(v) => onUpdateParameter('ghostEcho', v)}
            label="Echo"
            color="#d97706"
            formatValue={(v) => `${Math.round(v)}%`}
          />
          <Knob
            value={dropout}
            min={0}
            max={100}
            onChange={(v) => onUpdateParameter('dropout', v)}
            label="Dropout"
            color="#d97706"
            formatValue={(v) => `${Math.round(v)}%`}
          />
          <Knob
            value={warp}
            min={0}
            max={100}
            onChange={(v) => onUpdateParameter('warp', v)}
            label="Warp"
            color="#b45309"
            formatValue={(v) => `${Math.round(v)}%`}
          />
          <Knob
            value={eccentricity}
            min={0}
            max={100}
            onChange={(v) => onUpdateParameter('eccentricity', v)}
            label="Eccent."
            color="#92400e"
            formatValue={(v) => `${Math.round(v)}%`}
          />
        </div>
      </section>

      {/* ── Section 5: Output ────────────────────────────────────────────── */}
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#d97706" title="Output" />
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
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#7c3aed" />
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#7c3aed" title="Reverb" />
        <div className="flex justify-around items-end flex-wrap gap-y-4">
          <Knob value={decay} min={0} max={1} onChange={(v) => onUpdateParameter('decay', v)} label="Decay" color="#7c3aed" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={size} min={0} max={1} onChange={(v) => onUpdateParameter('size', v)} label="Size" color="#7c3aed" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={damping} min={0} max={1} onChange={(v) => onUpdateParameter('damping', v)} label="Damp" color="#8b5cf6" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={density} min={0} max={1} onChange={(v) => onUpdateParameter('density', v)} label="Density" color="#8b5cf6" formatValue={(v) => `${Math.round(v * 100)}%`} />
        </div>
      </section>
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#a78bfa" title="Character" />
        <div className="flex justify-around items-end flex-wrap gap-y-4">
          <Knob value={bandwidth} min={0} max={1} onChange={(v) => onUpdateParameter('bandwidth', v)} label="Bandwidth" color="#a78bfa" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={predelay} min={0} max={1} onChange={(v) => onUpdateParameter('predelay', v)} label="Pre-Delay" color="#a78bfa" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={earlyMix} min={0} max={1} onChange={(v) => onUpdateParameter('earlyMix', v)} label="Early Mix" color="#a78bfa" formatValue={(v) => `${Math.round(v * 100)}%`} />
        </div>
      </section>
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
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
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  const speedIdx = speed < 0.25 ? 0 : speed > 0.75 ? 2 : 1;

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#f97316" />
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#f97316" title="Speed" />
        <div className="grid grid-cols-3 gap-1 mb-3">
          {SPEED_LABELS.map((label, i) => (
            <button
              key={i}
              onClick={() => onUpdateParameter('speed', i === 0 ? 0.0 : i === 1 ? 0.5 : 1.0)}
              className={`px-2 py-1.5 text-xs font-medium rounded transition-colors ${
                speedIdx === i
                  ? 'bg-orange-600 text-text-primary'
                  : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover'
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
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#fb923c" title="Rotors" />
        <div className="flex justify-around items-end flex-wrap gap-y-4">
          <Knob value={hornRate} min={0.1} max={10} onChange={(v) => onUpdateParameter('hornRate', v)} label="Horn Hz" color="#fb923c" formatValue={(v) => `${v.toFixed(1)}`} />
          <Knob value={hornDepth} min={0} max={1} onChange={(v) => onUpdateParameter('hornDepth', v)} label="Horn Dep" color="#fb923c" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={drumRate} min={0.1} max={8} onChange={(v) => onUpdateParameter('drumRate', v)} label="Drum Hz" color="#fdba74" formatValue={(v) => `${v.toFixed(1)}`} />
          <Knob value={drumDepth} min={0} max={1} onChange={(v) => onUpdateParameter('drumDepth', v)} label="Drum Dep" color="#fdba74" formatValue={(v) => `${Math.round(v * 100)}%`} />
        </div>
      </section>
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
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
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="flex flex-col items-center space-y-4 w-full">
      <EffectOscilloscope pre={pre} post={post} color="#059669" />
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark w-full">
        <SectionHeader size="lg" color="#059669" title="Spring Tank" />
        <div className="flex justify-center gap-8 items-end">
          <Knob value={decay} min={0} max={1} onChange={(v) => onUpdateParameter('decay', v)} label="Decay" color="#059669" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={damping} min={0} max={1} onChange={(v) => onUpdateParameter('damping', v)} label="Damp" color="#059669" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={tension} min={0} max={1} onChange={(v) => onUpdateParameter('tension', v)} label="Tension" color="#10b981" formatValue={(v) => `${Math.round(v * 100)}%`} />
        </div>
      </section>
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark w-full">
        <SectionHeader size="lg" color="#34d399" title="Character" />
        <div className="flex justify-center gap-8 items-end">
          <Knob value={drip} min={0} max={1} onChange={(v) => onUpdateParameter('drip', v)} label="Drip" color="#34d399" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={diffusion} min={0} max={1} onChange={(v) => onUpdateParameter('diffusion', v)} label="Diffusion" color="#34d399" formatValue={(v) => `${Math.round(v * 100)}%`} />
        </div>
      </section>
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark w-full">
        <div className="flex justify-center gap-8 items-end">
          <Knob value={springMix} min={0} max={1} onChange={(v) => onUpdateParameter('mix', v)} label="Int. Mix" color="#6ee7b7" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet} label="Wet" color="#a7f3d0" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </section>
    </div>
  );
};

// ============================================================================
// KISS OF SHAME EDITOR — pixel-perfect KoS tape deck UI
// ============================================================================

interface FilmstripKnobProps {
  src: string;
  frameCount: number;
  frameW: number;
  frameH: number;
  value: number;         // 0-1 normalized
  onChange: (v: number) => void;
  defaultValue?: number; // double-click reset target (0-1), defaults to 0.5
  style?: React.CSSProperties;
}

const FilmstripKnob: React.FC<FilmstripKnobProps> = React.memo(({
  src, frameCount, frameW, frameH, value, onChange, defaultValue = 0.5, style,
}) => {
  const frame = Math.round(value * (frameCount - 1));
  const bgY   = -(frame * frameH);

  const startRef = useRef<{ startY: number; startValue: number } | null>(null);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  onChangeRef.current = onChange;
  valueRef.current = value;

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    startRef.current = { startY: e.clientY, startValue: valueRef.current };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!startRef.current) return;
    const delta = startRef.current.startY - e.clientY;
    const newVal = Math.max(0, Math.min(1, startRef.current.startValue + delta / 150));
    onChangeRef.current(newVal);
  }, []);

  const onPointerUp = useCallback(() => {
    startRef.current = null;
  }, []);

  const onDblClick = useCallback(() => {
    onChangeRef.current(defaultValue);
  }, [defaultValue]);

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={onDblClick}
      style={{
        width: frameW,
        height: frameH,
        backgroundImage: `url(${src})`,
        backgroundSize: `${frameW}px auto`,
        backgroundPositionY: `${bgY}px`,
        backgroundRepeat: 'no-repeat',
        cursor: 'ns-resize',
        userSelect: 'none',
        position: 'absolute',
        ...style,
      }}
    />
  );
});


export const KissOfShameEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
}) => {
  const [reelFrame, setReelFrame] = useState(0);

  const { post } = useEffectAnalyser(effect.id, 'waveform');

  // Compute VU meter frames directly during render (post data updates in-place)
  const toVuFrame = (rms: number) => Math.min(64, Math.round(Math.pow(Math.min(rms * 3, 1), 0.6) * 64));
  let vuLFrame = 0, vuRFrame = 0;
  if (post && post.length > 0) {
    const half = post.length >> 1;
    let sumL = 0, sumR = 0;
    for (let i = 0; i < half; i++) { sumL += post[i] * post[i]; }
    for (let i = half; i < post.length; i++) { sumR += post[i] * post[i]; }
    vuLFrame = toVuFrame(Math.sqrt(sumL / half));
    vuRFrame = toVuFrame(Math.sqrt(sumR / (post.length - half)));
  }

  const containerH = 703;
  const yOff = 0;

  // Animate reels at ~20fps
  useEffect(() => {
    const id = setInterval(() => setReelFrame(f => (f + 1) % 31), 50);
    return () => clearInterval(id);
  }, []);

  const drive     = getParam(effect, 'drive',     30) / 100;
  const character = getParam(effect, 'character', 40) / 100;
  const bias      = getParam(effect, 'bias',      40) / 100;
  const shame     = getParam(effect, 'shame',     20) / 100;
  const hiss      = getParam(effect, 'hiss',      20) / 100;
  const speed     = getParam(effect, 'speed',      0);
  const printThrough = getParam(effect, 'printThrough', 0) === 1;
  const wet       = effect.wet / 100;

  const bypassed = !effect.enabled;
  const updateMasterEffect = useAudioStore(s => s.updateMasterEffect);
  const toggleBypass = useCallback(() => {
    updateMasterEffect(effect.id, { enabled: !effect.enabled });
  }, [effect.id, effect.enabled, updateMasterEffect]);

  const BASE = '/kissofshame/ui/';

  const reelBgY = -(reelFrame * 322);

  return (
    <div style={{ width: 600, maxWidth: '100%', height: Math.ceil(containerH * 0.625), overflow: 'hidden', margin: '0 auto' }}>
      <div
        style={{
          position: 'relative',
          width: 960,
          height: containerH,
          overflow: 'hidden',
          userSelect: 'none',
          cursor: 'default',
          transform: 'scale(0.625)',
          transformOrigin: 'top left',
        }}
      >
      {/* Background face with reels */}
      <img
        src={BASE + 'FaceWithReels.png'}
        style={{ position: 'absolute', top: 0, left: 0, width: 960, height: containerH, pointerEvents: 'none' }}
        alt=""
      />

      {/* Spinning reels */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 960,
          height: 322,
          backgroundImage: `url(${BASE}Wheels.png)`,
          backgroundSize: '960px auto',
          backgroundPositionY: `${reelBgY}px`,
          backgroundRepeat: 'no-repeat',
          pointerEvents: 'none',
        }}
      />

      {/* Input (drive) knob */}
      <FilmstripKnob
        src={BASE + 'InputKnob.png'}
        frameCount={65} frameW={116} frameH={116}
        value={drive}
        onChange={(v) => onUpdateParameter('drive', Math.round(v * 100))}
        defaultValue={0.3}
        style={{ left: 104, top: 521 + yOff }}
      />

      {/* Shame decorative layer (ShameKnob.png — shows same value as shame knob) */}
      <div
        style={{
          position: 'absolute',
          left: 401,
          top: 491 + yOff,
          width: 174,
          height: 163,
          backgroundImage: `url(${BASE}ShameKnob.png)`,
          backgroundSize: '174px auto',
          backgroundPositionY: `${-(Math.round(shame * 64) * 163)}px`,
          backgroundRepeat: 'no-repeat',
          pointerEvents: 'none',
        }}
      />

      {/* Shame interactive knob (ShameCross.png — on top of ShameKnob) */}
      <FilmstripKnob
        src={BASE + 'ShameCross.png'}
        frameCount={65} frameW={174} frameH={163}
        value={shame}
        onChange={(v) => onUpdateParameter('shame', Math.round(v * 100))}
        defaultValue={0.2}
        style={{ left: 401, top: 491 + yOff }}
      />

      {/* Age (bias) knob */}
      <FilmstripKnob
        src={BASE + 'AgeKnob.png'}
        frameCount={65} frameW={74} frameH={72}
        value={bias}
        onChange={(v) => onUpdateParameter('bias', Math.round(v * 100))}
        defaultValue={0.4}
        style={{ left: 350, top: 455 + yOff }}
      />

      {/* Hiss knob */}
      <FilmstripKnob
        src={BASE + 'HissKnob.png'}
        frameCount={65} frameW={78} frameH={72}
        value={hiss}
        onChange={(v) => onUpdateParameter('hiss', Math.round(v * 100))}
        defaultValue={0.2}
        style={{ left: 547, top: 455 + yOff }}
      />

      {/* Blend (wet) knob */}
      <FilmstripKnob
        src={BASE + 'BlendKnob.png'}
        frameCount={65} frameW={78} frameH={72}
        value={wet}
        onChange={(v) => onUpdateWet(Math.round(v * 100))}
        defaultValue={0.5}
        style={{ left: 705, top: 455 + yOff }}
      />

      {/* Output (character) knob */}
      <FilmstripKnob
        src={BASE + 'OutputKnob.png'}
        frameCount={65} frameW={122} frameH={116}
        value={character}
        onChange={(v) => onUpdateParameter('character', Math.round(v * 100))}
        defaultValue={0.4}
        style={{ left: 757, top: 521 + yOff }}
      />

      {/* VU Meter L — driven by post-effect audio level */}
      <div
        style={{
          position: 'absolute',
          left: 251,
          top: 518 + yOff,
          width: 108,
          height: 108,
          backgroundImage: `url(${BASE}VUMeterL.png)`,
          backgroundSize: '108px auto',
          backgroundPositionY: `${-(vuLFrame * 108)}px`,
          backgroundRepeat: 'no-repeat',
          pointerEvents: 'none',
          filter: 'brightness(1.4) contrast(1.2) sepia(0.6) saturate(2.5) hue-rotate(-15deg)',
        }}
      />

      {/* VU Meter R — driven by post-effect audio level */}
      <div
        style={{
          position: 'absolute',
          left: 605,
          top: 518 + yOff,
          width: 110,
          height: 108,
          backgroundImage: `url(${BASE}VUMeterR.png)`,
          backgroundSize: '110px auto',
          backgroundPositionY: `${-(vuRFrame * 108)}px`,
          backgroundRepeat: 'no-repeat',
          pointerEvents: 'none',
          filter: 'brightness(1.4) contrast(1.2) sepia(0.6) saturate(2.5) hue-rotate(-15deg)',
        }}
      />

      {/* TapeType button — S-111 vs A-456 */}
      <div
        onClick={() => onUpdateParameter('speed', speed === 0 ? 1 : 0)}
        style={{
          position: 'absolute',
          left: 233,
          top: 610 + yOff,
          width: 42,
          height: 39,
          backgroundImage: `url(${BASE}TapeType.png)`,
          backgroundSize: '42px auto',
          backgroundPositionY: speed === 1 ? '-39px' : '0px',
          backgroundRepeat: 'no-repeat',
          cursor: 'pointer',
        }}
      />

      {/* Bypass button — toggles effect enabled/disabled */}
      <div
        onClick={toggleBypass}
        style={{
          position: 'absolute',
          left: 202,
          top: 469 + yOff,
          width: 34,
          height: 34,
          backgroundImage: `url(${BASE}Bypass.png)`,
          backgroundSize: '34px auto',
          backgroundPositionY: bypassed ? `${-34 * 2}px` : '0px',
          backgroundRepeat: 'no-repeat',
          cursor: 'pointer',
        }}
        title={bypassed ? 'Activate' : 'Bypass'}
      />

      {/* Print Through button — toggles tape print-through effect */}
      <div
        onClick={() => onUpdateParameter('printThrough', printThrough ? 0 : 1)}
        style={{
          position: 'absolute',
          left: 698,
          top: 609 + yOff,
          width: 47,
          height: 41,
          backgroundImage: `url(${BASE}PrintThrough.png)`,
          backgroundSize: '47px auto',
          backgroundPositionY: printThrough ? '-41px' : '0px',
          backgroundRepeat: 'no-repeat',
          cursor: 'pointer',
        }}
        title={printThrough ? 'Print Through: On' : 'Print Through: Off'}
      />

    </div>
    </div>
  );
};
