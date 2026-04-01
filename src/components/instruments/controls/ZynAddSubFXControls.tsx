/**
 * ZynAddSubFXControls.tsx - ZynAddSubFX controls
 *
 * Layout: Tabbed — ADDsynth / SUBsynth / PADsynth / Filter & Env / Effects
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Knob } from '@components/controls/Knob';
import type { ZynAddSubFXConfig } from '@/engine/zynaddsubfx/ZynAddSubFXSynth';
import { DEFAULT_ZYNADDSUBFX } from '@/engine/zynaddsubfx/ZynAddSubFXSynth';

interface ZynAddSubFXControlsProps {
  config: ZynAddSubFXConfig;
  onChange: (config: ZynAddSubFXConfig) => void;
}

const WAVE_LABELS = ['Sine', 'Tri', 'Saw', 'Sq', 'Noise', 'Voice', 'Chirp'];
const FILTER_LABELS = ['LP', 'HP', 'BP', 'Notch', 'Peak', 'LShelf'];
const MAG_LABELS = ['Linear', 'dB', '-40dB', '-60dB'];
const DIST_LABELS = ['Atan', 'Asym1', 'Pow', 'Sine', 'Quant'];
const TAB_NAMES = ['ADDsynth', 'SUBsynth', 'PADsynth', 'Filter/Env', 'Effects'] as const;

// ============================================================================
// SegmentButton
// ============================================================================

interface SegmentButtonProps {
  labels: string[];
  value: number;
  onChange: (value: number) => void;
  color?: string;
}

const SegmentButton: React.FC<SegmentButtonProps> = React.memo(({ labels, value, onChange, color }) => {
  const activeClass = color === 'green' ? 'bg-emerald-600 text-white'
    : color === 'blue' ? 'bg-sky-500 text-white'
    : 'bg-rose-500 text-white';
  return (
    <div className="flex gap-1 flex-wrap">
      {labels.map((label, i) => (
        <button
          key={label}
          onClick={() => onChange(i)}
          className={`px-2 py-1 text-[10px] font-bold rounded transition-all ${
            Math.round(value) === i
              ? activeClass
              : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
});
SegmentButton.displayName = 'SegmentButton';

// ============================================================================
// VoiceControls — a single additive voice
// ============================================================================

interface VoiceControlsProps {
  index: number;
  waveKey: keyof ZynAddSubFXConfig;
  volKey: keyof ZynAddSubFXConfig;
  detuneKey: keyof ZynAddSubFXConfig;
  octaveKey?: keyof ZynAddSubFXConfig;
  merged: Required<ZynAddSubFXConfig>;
  update: (key: keyof ZynAddSubFXConfig, value: number) => void;
}

const VoiceControls: React.FC<VoiceControlsProps> = React.memo(({
  index, waveKey, volKey, detuneKey, octaveKey, merged, update,
}) => (
  <div className="p-3 rounded-lg border border-dark-borderLight bg-dark-bgSecondary">
    <div className="text-[10px] text-text-muted font-bold mb-2">Voice {index + 1}</div>
    <div className="flex flex-wrap items-start gap-3">
      <div className="flex flex-col items-center gap-1">
        <span className="text-[10px] text-text-muted">Wave</span>
        <SegmentButton labels={WAVE_LABELS} value={merged[waveKey] as number}
          onChange={(v) => update(waveKey, v)} color="green" />
      </div>
      <Knob label="Volume" value={merged[volKey] as number} min={0} max={1} defaultValue={0}
        onChange={(v) => update(volKey, v)} size="sm" color="#f43f5e" />
      <Knob label="Detune" value={merged[detuneKey] as number} min={-1} max={1} defaultValue={0}
        onChange={(v) => update(detuneKey, v)} size="sm" color="#f43f5e" />
      {octaveKey && (
        <Knob label="Octave" value={merged[octaveKey] as number} min={-4} max={4} defaultValue={0}
          onChange={(v) => update(octaveKey, Math.round(v))} size="sm" color="#f43f5e" />
      )}
    </div>
  </div>
));
VoiceControls.displayName = 'VoiceControls';

// ============================================================================
// ZynAddSubFXControls — main component
// ============================================================================

export const ZynAddSubFXControls: React.FC<ZynAddSubFXControlsProps> = ({ config, onChange }) => {
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const [activeTab, setActiveTab] = useState(0);

  const updateParam = useCallback((key: keyof ZynAddSubFXConfig, value: number) => {
    onChange({ ...configRef.current, [key]: value });
  }, [onChange]);

  const merged = { ...DEFAULT_ZYNADDSUBFX, ...config } as Required<ZynAddSubFXConfig>;

  return (
    <div className="synth-controls-flow grid grid-cols-3 gap-2 p-2 overflow-y-auto text-xs">
      {/* Tab Bar */}
      <div className="flex gap-1 border-b border-dark-borderLight pb-1">
        {TAB_NAMES.map((name, i) => (
          <button
            key={name}
            onClick={() => setActiveTab(i)}
            className={`px-3 py-1.5 text-xs font-bold rounded-t transition-all ${
              activeTab === i
                ? 'bg-rose-600 text-white'
                : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover'
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      {/* TAB: ADDsynth */}
      {activeTab === 0 && (
        <div className="flex flex-col gap-3">
          <div className="p-2 rounded-lg border bg-[#1a1a1a] border-rose-900/30">
            <div className="flex items-center gap-4 mb-3">
              <h3 className="font-bold uppercase tracking-tight text-sm text-rose-400">ADDsynth</h3>
              <button
                onClick={() => updateParam('addEnable', merged.addEnable ? 0 : 1)}
                className={`px-3 py-1 text-xs font-bold rounded transition-all ${
                  merged.addEnable ? 'bg-rose-500 text-white' : 'bg-dark-bgTertiary text-text-secondary'
                }`}
              >
                {merged.addEnable ? 'ON' : 'OFF'}
              </button>
            </div>
            <div className="flex flex-wrap gap-4 mb-3">
              <Knob label="Volume" value={merged.addVolume} min={0} max={1} defaultValue={0.8}
                onChange={(v) => updateParam('addVolume', v)} size="sm" color="#f43f5e" />
              <Knob label="Pan" value={merged.addPanning} min={-1} max={1} defaultValue={0}
                onChange={(v) => updateParam('addPanning', v)} size="sm" color="#f43f5e" />
              <Knob label="Detune" value={merged.addDetune} min={-1} max={1} defaultValue={0}
                onChange={(v) => updateParam('addDetune', v)} size="sm" color="#f43f5e" />
              <Knob label="Octave" value={merged.addOctave} min={-4} max={4} defaultValue={0}
                onChange={(v) => updateParam('addOctave', Math.round(v))} size="sm" color="#f43f5e" />
            </div>
            <div className="flex flex-col gap-2">
              <VoiceControls index={0} waveKey="addVoice1Wave" volKey="addVoice1Volume"
                detuneKey="addVoice1Detune" merged={merged} update={updateParam} />
              <VoiceControls index={1} waveKey="addVoice2Wave" volKey="addVoice2Volume"
                detuneKey="addVoice2Detune" octaveKey="addVoice2Octave" merged={merged} update={updateParam} />
              <VoiceControls index={2} waveKey="addVoice3Wave" volKey="addVoice3Volume"
                detuneKey="addVoice3Detune" octaveKey="addVoice3Octave" merged={merged} update={updateParam} />
              <VoiceControls index={3} waveKey="addVoice4Wave" volKey="addVoice4Volume"
                detuneKey="addVoice4Detune" octaveKey="addVoice4Octave" merged={merged} update={updateParam} />
            </div>
          </div>
        </div>
      )}

      {/* TAB: SUBsynth */}
      {activeTab === 1 && (
        <div className="p-2 rounded-lg border bg-[#1a1a1a] border-rose-900/30">
          <div className="flex items-center gap-4 mb-3">
            <h3 className="font-bold uppercase tracking-tight text-sm text-rose-400">SUBsynth</h3>
            <button
              onClick={() => updateParam('subEnable', merged.subEnable ? 0 : 1)}
              className={`px-3 py-1 text-xs font-bold rounded transition-all ${
                merged.subEnable ? 'bg-rose-500 text-white' : 'bg-dark-bgTertiary text-text-secondary'
              }`}
            >
              {merged.subEnable ? 'ON' : 'OFF'}
            </button>
          </div>
          <div className="flex flex-wrap gap-4 mb-3">
            <Knob label="Volume" value={merged.subVolume} min={0} max={1} defaultValue={0.8}
              onChange={(v) => updateParam('subVolume', v)} size="sm" color="#f43f5e" />
            <Knob label="Pan" value={merged.subPanning} min={-1} max={1} defaultValue={0}
              onChange={(v) => updateParam('subPanning', v)} size="sm" color="#f43f5e" />
            <Knob label="Octave" value={merged.subOctave} min={-4} max={4} defaultValue={0}
              onChange={(v) => updateParam('subOctave', Math.round(v))} size="sm" color="#f43f5e" />
            <Knob label="Detune" value={merged.subDetune} min={-1} max={1} defaultValue={0}
              onChange={(v) => updateParam('subDetune', v)} size="sm" color="#f43f5e" />
          </div>
          <div className="flex flex-wrap gap-4 mb-3">
            <Knob label="Bandwidth" value={merged.subBandwidth} min={0} max={1} defaultValue={0.5}
              onChange={(v) => updateParam('subBandwidth', v)} size="sm" color="#f43f5e" />
            <Knob label="BW Scale" value={merged.subBandwidthScale} min={0} max={1} defaultValue={0.5}
              onChange={(v) => updateParam('subBandwidthScale', v)} size="sm" color="#f43f5e" />
            <Knob label="Harmonics" value={merged.subNumHarmonics} min={1} max={64} defaultValue={8}
              onChange={(v) => updateParam('subNumHarmonics', Math.round(v))} size="sm" color="#f43f5e" />
          </div>
          <div className="flex flex-col gap-1 mb-2">
            <span className="text-[10px] text-text-muted">Mag Type</span>
            <SegmentButton labels={MAG_LABELS} value={merged.subMagType}
              onChange={(v) => updateParam('subMagType', v)} />
          </div>
          <div className="flex flex-wrap gap-4 mt-3">
            {(['subHarmonic1', 'subHarmonic2', 'subHarmonic3', 'subHarmonic4', 'subHarmonic5', 'subHarmonic6'] as const).map((key, i) => (
              <Knob key={key} label={`H${i + 1}`} value={merged[key]} min={0} max={1}
                defaultValue={DEFAULT_ZYNADDSUBFX[key] ?? 0}
                onChange={(v) => updateParam(key, v)} size="sm" color="#f43f5e" />
            ))}
          </div>
        </div>
      )}

      {/* TAB: PADsynth */}
      {activeTab === 2 && (
        <div className="p-2 rounded-lg border bg-[#1a1a1a] border-rose-900/30">
          <div className="flex items-center gap-4 mb-3">
            <h3 className="font-bold uppercase tracking-tight text-sm text-rose-400">PADsynth</h3>
            <button
              onClick={() => updateParam('padEnable', merged.padEnable ? 0 : 1)}
              className={`px-3 py-1 text-xs font-bold rounded transition-all ${
                merged.padEnable ? 'bg-rose-500 text-white' : 'bg-dark-bgTertiary text-text-secondary'
              }`}
            >
              {merged.padEnable ? 'ON' : 'OFF'}
            </button>
          </div>
          <div className="flex flex-wrap gap-4 mb-3">
            <Knob label="Volume" value={merged.padVolume} min={0} max={1} defaultValue={0.8}
              onChange={(v) => updateParam('padVolume', v)} size="sm" color="#f43f5e" />
            <Knob label="Pan" value={merged.padPanning} min={-1} max={1} defaultValue={0}
              onChange={(v) => updateParam('padPanning', v)} size="sm" color="#f43f5e" />
            <Knob label="Octave" value={merged.padOctave} min={-4} max={4} defaultValue={0}
              onChange={(v) => updateParam('padOctave', Math.round(v))} size="sm" color="#f43f5e" />
            <Knob label="Detune" value={merged.padDetune} min={-1} max={1} defaultValue={0}
              onChange={(v) => updateParam('padDetune', v)} size="sm" color="#f43f5e" />
          </div>
          <div className="flex flex-wrap gap-4 mb-3">
            <Knob label="Bandwidth" value={merged.padBandwidth} min={0} max={1} defaultValue={0.5}
              onChange={(v) => updateParam('padBandwidth', v)} size="sm" color="#f43f5e" />
            <Knob label="BW Scale" value={merged.padBandwidthScale} min={0} max={1} defaultValue={0.5}
              onChange={(v) => updateParam('padBandwidthScale', v)} size="sm" color="#f43f5e" />
            <Knob label="Profile W" value={merged.padProfileWidth} min={0} max={1} defaultValue={0.5}
              onChange={(v) => updateParam('padProfileWidth', v)} size="sm" color="#f43f5e" />
            <Knob label="Stretch" value={merged.padProfileStretch} min={0} max={1} defaultValue={0.5}
              onChange={(v) => updateParam('padProfileStretch', v)} size="sm" color="#f43f5e" />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-text-muted">Quality</span>
            <SegmentButton labels={['Low', 'Med', 'High', 'Ultra']} value={merged.padQuality}
              onChange={(v) => updateParam('padQuality', v)} />
          </div>
        </div>
      )}

      {/* TAB: Filter & Envelope */}
      {activeTab === 3 && (
        <div className="flex flex-col gap-3">
          <div className="p-2 rounded-lg border bg-[#1a1a1a] border-rose-900/30">
            <h3 className="font-bold uppercase tracking-tight text-sm mb-3 text-rose-400">Filter</h3>
            <div className="flex flex-col gap-1 mb-3">
              <span className="text-[10px] text-text-muted">Type</span>
              <SegmentButton labels={FILTER_LABELS} value={merged.filterType}
                onChange={(v) => updateParam('filterType', v)} color="blue" />
            </div>
            <div className="flex flex-wrap gap-4">
              <Knob label="Cutoff" value={merged.filterCutoff} min={0} max={1} defaultValue={0.8}
                onChange={(v) => updateParam('filterCutoff', v)} size="sm" color="#f43f5e" />
              <Knob label="Reso" value={merged.filterResonance} min={0} max={1} defaultValue={0.2}
                onChange={(v) => updateParam('filterResonance', v)} size="sm" color="#f43f5e" />
              <Knob label="Env Amt" value={merged.filterEnvAmount} min={0} max={1} defaultValue={0}
                onChange={(v) => updateParam('filterEnvAmount', v)} size="sm" color="#f43f5e" />
              <Knob label="Velocity" value={merged.filterVelocity} min={0} max={1} defaultValue={0.5}
                onChange={(v) => updateParam('filterVelocity', v)} size="sm" color="#f43f5e" />
              <Knob label="Key Trk" value={merged.filterKeyTrack} min={0} max={1} defaultValue={0.5}
                onChange={(v) => updateParam('filterKeyTrack', v)} size="sm" color="#f43f5e" />
            </div>
          </div>
          <div className="p-2 rounded-lg border bg-[#1a1a1a] border-rose-900/30">
            <h3 className="font-bold uppercase tracking-tight text-sm mb-3 text-rose-400">Filter Envelope</h3>
            <div className="flex flex-wrap gap-4 justify-center">
              <Knob label="Attack" value={merged.filterAttack} min={0} max={1} defaultValue={0.01}
                onChange={(v) => updateParam('filterAttack', v)} size="sm" color="#f43f5e" />
              <Knob label="Decay" value={merged.filterDecay} min={0} max={1} defaultValue={0.3}
                onChange={(v) => updateParam('filterDecay', v)} size="sm" color="#f43f5e" />
              <Knob label="Sustain" value={merged.filterSustain} min={0} max={1} defaultValue={0.7}
                onChange={(v) => updateParam('filterSustain', v)} size="sm" color="#f43f5e" />
              <Knob label="Release" value={merged.filterRelease} min={0} max={1} defaultValue={0.3}
                onChange={(v) => updateParam('filterRelease', v)} size="sm" color="#f43f5e" />
            </div>
          </div>
          <div className="p-2 rounded-lg border bg-[#1a1a1a] border-rose-900/30">
            <h3 className="font-bold uppercase tracking-tight text-sm mb-3 text-rose-400">Amp Envelope</h3>
            <div className="flex flex-wrap gap-4 justify-center">
              <Knob label="Attack" value={merged.ampAttack} min={0} max={1} defaultValue={0.01}
                onChange={(v) => updateParam('ampAttack', v)} size="sm" color="#f43f5e" />
              <Knob label="Decay" value={merged.ampDecay} min={0} max={1} defaultValue={0.1}
                onChange={(v) => updateParam('ampDecay', v)} size="sm" color="#f43f5e" />
              <Knob label="Sustain" value={merged.ampSustain} min={0} max={1} defaultValue={1.0}
                onChange={(v) => updateParam('ampSustain', v)} size="sm" color="#f43f5e" />
              <Knob label="Release" value={merged.ampRelease} min={0} max={1} defaultValue={0.2}
                onChange={(v) => updateParam('ampRelease', v)} size="sm" color="#f43f5e" />
            </div>
          </div>
        </div>
      )}

      {/* TAB: Effects */}
      {activeTab === 4 && (
        <div className="flex flex-col gap-3">
          <div className="p-2 rounded-lg border bg-[#1a1a1a] border-rose-900/30">
            <h3 className="font-bold uppercase tracking-tight text-sm mb-3 text-rose-400">Reverb</h3>
            <div className="flex flex-wrap gap-4 justify-center">
              <Knob label="Wet" value={merged.reverbWet} min={0} max={1} defaultValue={0}
                onChange={(v) => updateParam('reverbWet', v)} size="sm" color="#f43f5e" />
              <Knob label="Size" value={merged.reverbSize} min={0} max={1} defaultValue={0.5}
                onChange={(v) => updateParam('reverbSize', v)} size="sm" color="#f43f5e" />
              <Knob label="Damp" value={merged.reverbDamp} min={0} max={1} defaultValue={0.5}
                onChange={(v) => updateParam('reverbDamp', v)} size="sm" color="#f43f5e" />
            </div>
          </div>
          <div className="p-2 rounded-lg border bg-[#1a1a1a] border-rose-900/30">
            <h3 className="font-bold uppercase tracking-tight text-sm mb-3 text-rose-400">Chorus</h3>
            <div className="flex flex-wrap gap-4 justify-center">
              <Knob label="Wet" value={merged.chorusWet} min={0} max={1} defaultValue={0}
                onChange={(v) => updateParam('chorusWet', v)} size="sm" color="#f43f5e" />
              <Knob label="Rate" value={merged.chorusRate} min={0} max={1} defaultValue={0.3}
                onChange={(v) => updateParam('chorusRate', v)} size="sm" color="#f43f5e" />
              <Knob label="Depth" value={merged.chorusDepth} min={0} max={1} defaultValue={0.3}
                onChange={(v) => updateParam('chorusDepth', v)} size="sm" color="#f43f5e" />
            </div>
          </div>
          <div className="p-2 rounded-lg border bg-[#1a1a1a] border-rose-900/30">
            <h3 className="font-bold uppercase tracking-tight text-sm mb-3 text-rose-400">Distortion</h3>
            <div className="flex flex-wrap items-start gap-4 justify-center">
              <Knob label="Wet" value={merged.distortionWet} min={0} max={1} defaultValue={0}
                onChange={(v) => updateParam('distortionWet', v)} size="sm" color="#f43f5e" />
              <Knob label="Drive" value={merged.distortionDrive} min={0} max={1} defaultValue={0.3}
                onChange={(v) => updateParam('distortionDrive', v)} size="sm" color="#f43f5e" />
              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] text-text-muted">Type</span>
                <SegmentButton labels={DIST_LABELS} value={merged.distortionType}
                  onChange={(v) => updateParam('distortionType', v)} />
              </div>
            </div>
          </div>
          <div className="p-2 rounded-lg border bg-[#1a1a1a] border-rose-900/30">
            <h3 className="font-bold uppercase tracking-tight text-sm mb-3 text-rose-400">EQ</h3>
            <div className="flex flex-wrap gap-4 justify-center">
              <Knob label="Low" value={merged.eqLow} min={0} max={1} defaultValue={0.5}
                onChange={(v) => updateParam('eqLow', v)} size="sm" color="#f43f5e" />
              <Knob label="High" value={merged.eqHigh} min={0} max={1} defaultValue={0.5}
                onChange={(v) => updateParam('eqHigh', v)} size="sm" color="#f43f5e" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ZynAddSubFXControls;
