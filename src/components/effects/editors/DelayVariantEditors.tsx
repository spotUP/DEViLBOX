/**
 * Delay variant editors: SpaceyDelayer, RETapeEcho, SpaceEcho, ToneArm, Tumult
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { useEffectAnalyser } from '@hooks/useEffectAnalyser';
import { EffectOscilloscope } from '../EffectVisualizer';
import { Knob } from '@components/controls/Knob';
import { isEffectBpmSynced } from '@engine/bpmSync';
import { getToneEngine } from '@engine/ToneEngine';
import { SectionHeader, getParam, renderBpmSync, type VisualEffectEditorProps } from './shared';
import { RE_TAPE_ECHO_PRESETS, type RETapeEchoPreset } from '@constants/reTapeEchoPresets';

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
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#8b5cf6" />
      {/* Delay Controls */}
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#8b5cf6" title="Spacey Delayer" />
        <div className="flex justify-around items-end">
          <Knob
            value={firstTap}
            min={10}
            max={2000}
            onChange={(v) => {
              if (synced) onUpdateParameter('bpmSync', 0);
              onUpdateParameter('firstTap', v);
            }}
            label="First Tap"
            color="#8b5cf6"
            formatValue={(v) => synced ? 'SYNC' : `${Math.round(v)}ms`}
          />
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
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#a78bfa" title="Options" />
        <div className="flex gap-4">
          <button
            onClick={() => onUpdateParameter('multiTap', multiTap ? 0 : 1)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              multiTap
                ? 'bg-purple-600 text-text-primary'
                : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover'
            }`}
          >
            Multi-Tap {multiTap ? 'ON' : 'OFF'}
          </button>
          <button
            onClick={() => onUpdateParameter('tapeFilter', tapeFilter ? 0 : 1)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tapeFilter
                ? 'bg-purple-600 text-text-primary'
                : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover'
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
  onUpdateParameters,
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
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  const modeLabels = ['Head 1', 'Head 2', 'Both', 'H1+FB', 'H2+FB', 'Both+FB'];

  const applyPreset = (preset: RETapeEchoPreset) => {
    if (onUpdateParameters) {
      onUpdateParameters(preset.params as Record<string, number>);
    } else {
      Object.entries(preset.params).forEach(([key, value]) => {
        onUpdateParameter(key, value);
      });
    }
  };

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#dc2626" />
      {/* Dub Presets */}
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#dc2626" title="Presets" />
        <div className="flex flex-wrap gap-1">
          {RE_TAPE_ECHO_PRESETS.map((preset) => (
            <button
              key={preset.name}
              onClick={() => applyPreset(preset)}
              title={preset.description}
              className="px-2.5 py-1.5 rounded text-xs font-medium transition-colors
                bg-dark-bgTertiary text-text-secondary hover:bg-red-600/30 hover:text-text-primary
                active:bg-red-600 active:text-text-primary"
            >
              {preset.name}
            </button>
          ))}
        </div>
      </section>
      {/* Main Controls */}
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#dc2626" title="RE Tape Echo" />
        <div className="flex justify-around items-end">
          <Knob
            value={repeatRate * 100}
            min={0}
            max={100}
            onChange={(v) => {
              if (synced) onUpdateParameter('bpmSync', 0);
              onUpdateParameter('repeatRate', v / 100);
            }}
            label="Rate"
            color="#dc2626"
            formatValue={(v) => synced ? 'SYNC' : `${Math.round(v)}%`}
          />
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
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#f97316" title="Tape Character" />
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
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#b91c1c" title="Mode & Options" />
        <div className="mb-3">
          <div className="text-xs text-text-secondary mb-2">Echo Mode</div>
          <div className="grid grid-cols-6 gap-1">
            {modeLabels.map((label, i) => (
              <button
                key={i}
                onClick={() => onUpdateParameter('mode', i)}
                className={`px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                  mode === i
                    ? 'bg-red-600 text-text-primary'
                    : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover'
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
                ? 'bg-red-600 text-text-primary'
                : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover'
            }`}
          >
            Head EQ {playheadFilter ? 'ON' : 'OFF'}
          </button>
          <button
            onClick={() => onUpdateParameter('inputBleed', inputBleed ? 0 : 1)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              inputBleed
                ? 'bg-red-600 text-text-primary'
                : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover'
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
  const mid = getParam(effect, 'mid', 0);
  const treble = getParam(effect, 'treble', 0);
  const synced = isEffectBpmSynced(effect.parameters);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#6366f1" />
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#6366f1" title="Echo" />
        <div className="flex justify-around items-end">
          <Knob
            paramKey="echo.mode"
            value={mode}
            min={1}
            max={12}
            onChange={(v) => onUpdateParameter('mode', Math.round(v))}
            label="Mode"
            color="#6366f1"
            formatValue={(v) => `${Math.round(v)}`}
          />
          <Knob
            paramKey="echo.rate"
            value={rate}
            min={50}
            max={1000}
            onChange={(v) => {
              if (synced) onUpdateParameter('bpmSync', 0);
              onUpdateParameter('rate', v);
            }}
            label="Rate"
            color="#6366f1"
            formatValue={(v) => synced ? 'SYNC' : `${Math.round(v)}ms`}
          />
          <Knob
            paramKey="echo.intensity"
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
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#818cf8" title="Levels & EQ" />
        <div className="flex justify-around items-end">
          <Knob
            paramKey="echo.echoVolume"
            value={echoVolume}
            min={0}
            max={1}
            onChange={(v) => onUpdateParameter('echoVolume', v)}
            label="Echo Vol"
            color="#818cf8"
            formatValue={(v) => `${(v * 100).toFixed(0)}%`}
          />
          <Knob
            paramKey="echo.reverbVolume"
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
            value={mid}
            min={-20}
            max={20}
            onChange={(v) => onUpdateParameter('mid', v)}
            label="Mid"
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
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
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
// TONEARM EDITOR — physics-based vinyl playback simulation
// ============================================================================

const TONEARM_RPM_PRESETS = [
  { label: '33 RPM', value: 33.333 },
  { label: '45 RPM', value: 45 },
  { label: '78 RPM', value: 78 },
];

export const ToneArmEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
}) => {
  const wow     = getParam(effect, 'wow',     20) / 100;
  const coil    = getParam(effect, 'coil',    50) / 100;
  const flutter = getParam(effect, 'flutter', 15) / 100;
  const riaa    = getParam(effect, 'riaa',    50) / 100;
  const stylus  = getParam(effect, 'stylus',  30) / 100;
  const hiss    = getParam(effect, 'hiss',    20) / 100;
  const pops    = getParam(effect, 'pops',    15) / 100;
  const rpm     = getParam(effect, 'rpm', 33.333);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  const activeRpm = TONEARM_RPM_PRESETS.find(p => Math.abs(rpm - p.value) < 1)?.label ?? null;

  return (
    <div className="flex flex-col items-center space-y-4 w-full">
      <EffectOscilloscope pre={pre} post={post} color="#a3e635" />

      {/* RPM selector */}
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark w-full">
        <SectionHeader size="lg" color="#a3e635" title="Record Speed" />
        <div className="flex gap-2">
          {TONEARM_RPM_PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => onUpdateParameter('rpm', p.value)}
              className={[
                'flex-1 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all',
                activeRpm === p.label
                  ? 'bg-lime-700/70 border-lime-500 text-lime-100'
                  : 'bg-black/40 border-dark-border text-text-muted hover:border-lime-700 hover:text-lime-300',
              ].join(' ')}
            >
              {p.label}
            </button>
          ))}
        </div>
      </section>

      {/* Cartridge */}
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark w-full">
        <SectionHeader size="lg" color="#a3e635" title="Cartridge" />
        <div className="flex justify-center gap-8 items-end">
          <Knob value={coil}    min={0} max={1} onChange={(v) => onUpdateParameter('coil',    Math.round(v * 100))} label="Coil"    color="#a3e635" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={riaa}    min={0} max={1} onChange={(v) => onUpdateParameter('riaa',    Math.round(v * 100))} label="RIAA"    color="#84cc16" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={stylus}  min={0} max={1} onChange={(v) => onUpdateParameter('stylus',  Math.round(v * 100))} label="Stylus"  color="#65a30d" formatValue={(v) => `${Math.round(v * 100)}%`} />
        </div>
      </section>

      {/* Turntable mechanics */}
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark w-full">
        <SectionHeader size="lg" color="#bef264" title="Turntable" />
        <div className="flex justify-center gap-8 items-end">
          <Knob value={wow}     min={0} max={1} onChange={(v) => onUpdateParameter('wow',     Math.round(v * 100))} label="Wow"     color="#bef264" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={flutter} min={0} max={1} onChange={(v) => onUpdateParameter('flutter', Math.round(v * 100))} label="Flutter" color="#bef264" formatValue={(v) => `${Math.round(v * 100)}%`} />
        </div>
      </section>

      {/* Surface noise */}
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark w-full">
        <SectionHeader size="lg" color="#d9f99d" title="Surface" />
        <div className="flex justify-center gap-8 items-end">
          <Knob value={hiss}    min={0} max={1} onChange={(v) => onUpdateParameter('hiss',    Math.round(v * 100))} label="Hiss"    color="#d9f99d" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={pops}    min={0} max={1} onChange={(v) => onUpdateParameter('pops',    Math.round(v * 100))} label="Pops"    color="#d9f99d" formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={effect.wet / 100} min={0} max={1} onChange={(v) => onUpdateWet(Math.round(v * 100))} label="Wet" color="#ecfccb" formatValue={(v) => `${Math.round(v * 100)}%`} />
        </div>
      </section>
    </div>
  );
};

// ============================================================================
// TUMULT
// ============================================================================

// ─── Tumult sample categories (mirrors SAMPLE_PATHS order in TumultEffect.ts) ──
const TUMULT_CATEGORIES = [
  { label: 'Hum',        start: 0,  end: 4  },
  { label: 'Machine',    start: 5,  end: 15 },
  { label: 'Static',     start: 16, end: 21 },
  { label: 'Vinyl',      start: 22, end: 26 },
  { label: 'World',      start: 27, end: 44 },
  { label: 'Plethora A', start: 45, end: 61 },
  { label: 'Plethora B', start: 62, end: 71 },
  { label: 'Plethora C', start: 72, end: 94 },
] as const;

const TUMULT_SAMPLE_NAMES: string[] = [
  // hum
  'Hyperspace','Alien Hum','Elec Hum','Feedback','VHS Hum',
  // machine
  'Fan','Dough','Fridge 1','Fridge 2','Furnace','Lettersort',
  'Oven','Tattoo AC','Hotel Vent','Vending','Washing',
  // static
  'Elec Zap','Elec Noise','Film Static','Gramophone','Radio Fuzz','TV Static',
  // vinyl
  'Runoff','Old Vinyl','Vinyl Dust','Analogue','Vinyl Crackle',
  // world
  'City Snow','City Night','City Traffic','Crowd','Campfire 1','Fire 2','Campfire 3','Campfire 4',
  'Rain LA','Forest Rain','Thunder Rain','City Rain','Traffic Rain','Metro','Waterfall 1',
  'Waterfall 2','Waterfall 3','Waterfall 4',
  // noiseplethora A
  'A0 Radio 1','A0 Radio 2','A1 SineFM','A2 RingSqr',
  'A3 RingSine 1','A3 RingSine 2','A4 CrossMod 1','A4 CrossMod 2',
  'A5 Resonoise','A6 Grain 1','A6 Grain 2','A7 Grain3 1','A7 Grain3 2',
  'A8 Grain4 1','A8 Grain4 2','A9 Basurilla 1','A9 Basurilla 2',
  // noiseplethora B
  'B0 ClusterSaw','B1 PwCluster','B2 CrCluster','B3 SineFM',
  'B4 TriFM','B5 Prime','B6 PrimeCnoise','B7 Fibonacci','B8 Partial','B9 Phasing',
  // noiseplethora C
  'C0 Basura 1','C0 Basura 2','C1 Atari','C2 Filomena 1','C2 Filomena 2',
  'C3 PSH','C4 Array 1','C4 Array 2','C4 Array 3','C4 Array 4',
  'C5 Exists 1','C5 Exists 2','C6 WhoKnows 1','C6 WhoKnows 2','C6 WhoKnows 3',
  'C7 Satan 1','C7 Satan 2','C8 BitCrush 1','C8 BitCrush 2','C8 BitCrush 3',
  'C9 LFree 1','C9 LFree 2','C9 LFree 3',
];

export const TumultEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateParameter,
}) => {
  const configRef = useRef(effect);
  useEffect(() => { configRef.current = effect; }, [effect]);

  // Notify the worklet that the editor is open so it produces audio for preview
  useEffect(() => {
    const node = getToneEngine().getMasterEffectNode(effect.id);
    if (node && 'setEditorOpen' in node) (node as { setEditorOpen(o: boolean): void }).setEditorOpen(true);
    return () => {
      const n = getToneEngine().getMasterEffectNode(effect.id);
      if (n && 'setEditorOpen' in n) (n as { setEditorOpen(o: boolean): void }).setEditorOpen(false);
    };
  }, [effect.id]);

  const p = (key: string, def: number) => getParam(effect, key, def);

  const sourceMode   = p('sourceMode', 0);
  const noiseMode    = p('noiseMode', 0);
  const switchBranch = p('switchBranch', 0);
  const sampleIndex  = p('sampleIndex', 0);
  const activeCat    = TUMULT_CATEGORIES.find(c => sampleIndex >= c.start && sampleIndex <= c.end);
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  const set = useCallback((key: string, value: number) => {
    onUpdateParameter(key, value);
  }, [onUpdateParameter]);

  const SOURCE_LABELS  = ['Off', 'Synth', 'Sample', 'Custom'] as const;
  const NOISE_LABELS   = ['White', 'Pink', 'Brown', 'Velvet', 'Crushed'] as const;
  const BRANCH_LABELS  = ['Duck', 'Raw', 'Follow'] as const;
  // switchBranch values: Duck=0, Raw=2, Follow=1
  const BRANCH_VALUES  = [0, 2, 1] as const;

  const btnBase     = 'flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all';
  const btnActive   = 'bg-violet-700/70 border-violet-500 text-violet-100';
  const btnInactive = 'bg-black/40 border-dark-border text-text-muted hover:border-violet-700 hover:text-violet-300';

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#7c3aed" />
      {/* ── Section 1: Source ─────────────────────────────────────────────── */}
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#7c3aed" title="Source" />

        <div className="flex gap-2 mb-3">
          {SOURCE_LABELS.map((label, i) => (
            <button key={label} onClick={() => set('sourceMode', i)}
              className={`${btnBase} ${sourceMode === i ? btnActive : btnInactive}`}>
              {label}
            </button>
          ))}
        </div>

        {sourceMode === 1 && (
          <div className="flex gap-2">
            {NOISE_LABELS.map((label, i) => (
              <button key={label} onClick={() => set('noiseMode', i)}
                className={`${btnBase} ${noiseMode === i ? btnActive : btnInactive}`}>
                {label}
              </button>
            ))}
          </div>
        )}

        {(sourceMode === 2 || sourceMode === 3) && (
          <>
            <div className="flex gap-1.5 mb-2 flex-wrap">
              {TUMULT_CATEGORIES.map((cat) => (
                <button key={cat.label}
                  onClick={() => set('sampleIndex', cat.start)}
                  className={`px-2 py-1 rounded text-xs font-bold border transition-all ${
                    activeCat?.label === cat.label ? btnActive : btnInactive
                  }`}>
                  {cat.label}
                </button>
              ))}
            </div>
            {activeCat && (
              <div className="flex gap-1.5 flex-wrap">
                {Array.from({ length: activeCat.end - activeCat.start + 1 }, (_, i) => {
                  const idx = activeCat.start + i;
                  return (
                    <button key={idx} onClick={() => set('sampleIndex', idx)}
                      className={`px-2 py-1 rounded text-xs border transition-all ${
                        sampleIndex === idx ? btnActive : btnInactive
                      }`}>
                      {TUMULT_SAMPLE_NAMES[idx]}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </section>

      {/* ── Section 2: Master Controls ────────────────────────────────────── */}
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#7c3aed" title="Controls" />

        <div className="flex gap-6 items-start flex-wrap">
          <Knob label="Gain" value={p('noiseGain', -10.0)} min={-35} max={35}
            unit="dB" onChange={(v) => set('noiseGain', v)} />
          <Knob label="Mix" value={p('mix', 0.5)} min={0} max={1}
            onChange={(v) => set('mix', v)} />
          <Knob label="Clip" value={p('clipAmount', 0.497)} min={0.05} max={1}
            onChange={(v) => set('clipAmount', v)} />

          <div className="flex flex-col gap-1">
            <span className="text-xs text-text-muted mb-1">Mode</span>
            <div className="flex gap-1.5">
              {BRANCH_LABELS.map((label, i) => (
                <button key={label} onClick={() => set('switchBranch', BRANCH_VALUES[i])}
                  className={`px-3 py-1 rounded text-xs font-bold border transition-all ${
                    switchBranch === BRANCH_VALUES[i] ? btnActive : btnInactive
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {switchBranch === 0 && (
          <div className="flex gap-4 mt-3 pt-3 border-t border-dark-border flex-wrap">
            <Knob label="Threshold" value={p('duckThreshold', -20.0)} min={-100} max={0}
              unit="dB" onChange={(v) => set('duckThreshold', v)} />
            <Knob label="Attack" value={p('duckAttack', 0)} min={0} max={500}
              unit="ms" onChange={(v) => set('duckAttack', v)} />
            <Knob label="Release" value={p('duckRelease', 15.0)} min={0} max={500}
              unit="ms" onChange={(v) => set('duckRelease', v)} />
          </div>
        )}

        {switchBranch === 1 && (
          <div className="flex gap-4 mt-3 pt-3 border-t border-dark-border flex-wrap">
            <Knob label="Threshold" value={p('followThreshold', -20.0)} min={-100} max={0}
              unit="dB" onChange={(v) => set('followThreshold', v)} />
            <Knob label="Attack" value={p('followAttack', 0)} min={0} max={500}
              unit="ms" onChange={(v) => set('followAttack', v)} />
            <Knob label="Release" value={p('followRelease', 15.0)} min={0} max={500}
              unit="ms" onChange={(v) => set('followRelease', v)} />
            <Knob label="Amount" value={p('followAmount', 0.7)} min={0} max={1}
              onChange={(v) => set('followAmount', v)} />
          </div>
        )}
      </section>

      {/* ── Section 3: 5-Band EQ ──────────────────────────────────────────── */}
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#7c3aed" title="EQ" />

        <div className="flex gap-4 flex-wrap">
          <TumultEQBand label="HP" enableKey="hpEnable" freqKey="hpFreq" qKey="hpQ"
            enabled={!!p('hpEnable', 0)} freq={p('hpFreq', 888.5)} q={p('hpQ', 0.7)}
            onSet={set} showGain={false} />
          <TumultEQBand label="Low" enableKey="peak1Enable" freqKey="peak1Freq"
            gainKey="peak1Gain" qKey="peak1Q" typeKey="peak1Type"
            enabled={!!p('peak1Enable', 0)} freq={p('peak1Freq', 20)}
            gain={p('peak1Gain', -0.19)} q={p('peak1Q', 0.7)}
            filterType={p('peak1Type', 0)} typeLabels={['Bell', 'Lo Shelf']}
            onSet={set} showGain />
          <TumultEQBand label="Mid" enableKey="peak2Enable" freqKey="peak2Freq"
            gainKey="peak2Gain" qKey="peak2Q"
            enabled={!!p('peak2Enable', 0)} freq={p('peak2Freq', 600)}
            gain={p('peak2Gain', 1)} q={p('peak2Q', 1)}
            onSet={set} showGain />
          <TumultEQBand label="High" enableKey="peak3Enable" freqKey="peak3Freq"
            gainKey="peak3Gain" qKey="peak3Q" typeKey="peak3Type"
            enabled={!!p('peak3Enable', 0)} freq={p('peak3Freq', 2500)}
            gain={p('peak3Gain', 1)} q={p('peak3Q', 1)}
            filterType={p('peak3Type', 1)} typeLabels={['Bell', 'Hi Shelf']}
            onSet={set} showGain />
          <TumultEQBand label="LP" enableKey="lpEnable" freqKey="lpFreq" qKey="lpQ"
            enabled={!!p('lpEnable', 0)} freq={p('lpFreq', 8500)} q={p('lpQ', 0.7)}
            onSet={set} showGain={false} />
        </div>
      </section>
    </div>
  );
};

const TumultEQBand: React.FC<{
  label: string;
  enableKey: string; freqKey: string; gainKey?: string; qKey: string; typeKey?: string;
  enabled: boolean; freq: number; gain?: number; q: number; filterType?: number;
  typeLabels?: readonly [string, string];
  onSet: (k: string, v: number) => void;
  showGain: boolean;
}> = ({ label, enableKey, freqKey, gainKey, qKey, typeKey, enabled, freq, gain, q,
        filterType, typeLabels, onSet, showGain }) => (
  <div className="flex-1 flex flex-col gap-2 min-w-[60px]">
    <div className="flex items-center justify-between">
      <span className="text-xs font-bold text-text-secondary">{label}</span>
      <button
        onClick={() => onSet(enableKey, enabled ? 0 : 1)}
        className={`w-4 h-4 rounded-sm border transition-all ${
          enabled ? 'bg-violet-500 border-violet-400' : 'bg-black/40 border-dark-border'
        }`}
      />
    </div>
    {typeKey && typeLabels && (
      <div className="flex gap-1">
        {typeLabels.map((t, i) => (
          <button key={t} onClick={() => onSet(typeKey, i)}
            className={`flex-1 py-0.5 rounded text-[10px] border transition-all ${
              filterType === i
                ? 'bg-violet-700/70 border-violet-500 text-violet-100'
                : 'bg-black/40 border-dark-border text-text-muted'
            }`}>
            {t}
          </button>
        ))}
      </div>
    )}
    <Knob label="Freq" value={freq} min={20} max={20000} unit="Hz"
      onChange={(v) => onSet(freqKey, v)} size="sm" />
    {showGain && gainKey && (
      <Knob label="Gain" value={gain ?? 0} min={-24} max={24} unit="dB"
        onChange={(v) => onSet(gainKey, v)} size="sm" />
    )}
    <Knob label="Q" value={q} min={0.7} max={10}
      onChange={(v) => onSet(qKey, v)} size="sm" />
  </div>
);
