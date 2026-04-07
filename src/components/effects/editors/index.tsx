/**
 * Effect editor index — dispatcher, EFFECT_EDITORS map, and wrapper component
 */

import React from 'react';
import type { EffectConfig } from '@typedefs/instrument';
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

// Re-export shared types
export type { VisualEffectEditorProps } from './shared';

// Import all editors
import { DistortionEditor, ReverbEditor, DelayEditor, ChorusEditor, PhaserEditor, TremoloEditor, VibratoEditor } from './BasicEffectEditors';
import { AutoFilterEditor, CompressorEditor, EQ3Editor, FilterEditor, DubFilterEditor, SidechainCompressorEditor, MoogFilterEditor } from './FilterEffectEditors';
import { BiPhaseEditor, TapeSaturationEditor, VinylNoiseEditor, MVerbEditor, LeslieEditor, SpringReverbEditor, KissOfShameEditor } from './VintageEffectEditors';
import { SpaceyDelayerEditor, RETapeEchoEditor, SpaceEchoEditor, ToneArmEditor, TumultEditor } from './DelayVariantEditors';
import { AutoPannerEditor, AutoWahEditor, BitCrusherEditor, ChebyshevEditor, FrequencyShifterEditor, PitchShiftEditor, JCReverbEditor, StereoWidenerEditor } from './SpecializedEffectEditors';
import { VocoderEditor, AutoTuneEditor } from './VoiceEffectEditors';
import { TapeDegradationEditor, AmbientDelayEditor, ShimmerReverbEditor, GranularFreezeEditor } from './AdditionalEffectEditors';
import { BuzzmachineEditor } from './BuzzmachineEditor';
import { GenericEffectEditor, WAMEffectEditor } from './WAMEffectEditor';

// Re-export all editors
export { DistortionEditor, ReverbEditor, DelayEditor, ChorusEditor, PhaserEditor, TremoloEditor, VibratoEditor } from './BasicEffectEditors';
export { AutoFilterEditor, CompressorEditor, EQ3Editor, FilterEditor, DubFilterEditor, SidechainCompressorEditor, MoogFilterEditor } from './FilterEffectEditors';
export { BiPhaseEditor, TapeSaturationEditor, VinylNoiseEditor, MVerbEditor, LeslieEditor, SpringReverbEditor, KissOfShameEditor } from './VintageEffectEditors';
export { SpaceyDelayerEditor, RETapeEchoEditor, SpaceEchoEditor, ToneArmEditor, TumultEditor } from './DelayVariantEditors';
export { AutoPannerEditor, AutoWahEditor, BitCrusherEditor, ChebyshevEditor, FrequencyShifterEditor, PitchShiftEditor, JCReverbEditor, StereoWidenerEditor } from './SpecializedEffectEditors';
export { VocoderEditor, AutoTuneEditor } from './VoiceEffectEditors';
export { TapeDegradationEditor, AmbientDelayEditor, ShimmerReverbEditor, GranularFreezeEditor } from './AdditionalEffectEditors';
export { BuzzmachineEditor } from './BuzzmachineEditor';
export { GenericEffectEditor, WAMEffectEditor } from './WAMEffectEditor';

// ============================================================================
// EFFECT EDITOR FACTORY
// ============================================================================

interface VisualEffectEditorProps {
  effect: EffectConfig;
  onUpdateParameter: (key: string, value: number | string) => void;
  onUpdateWet: (wet: number) => void;
}

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
  Tumult: TumultEditor,
  VinylNoise: VinylNoiseEditor,
  ToneArm: ToneArmEditor,
  TapeSimulator: KissOfShameEditor,
  SidechainCompressor: SidechainCompressorEditor,
  SpaceyDelayer: SpaceyDelayerEditor,
  RETapeEcho: RETapeEchoEditor,
  MoogFilter: MoogFilterEditor,
  Vocoder: VocoderEditor,
  AutoTune: AutoTuneEditor,
  MVerb: MVerbEditor,
  Leslie: LeslieEditor,
  SpringReverb: SpringReverbEditor,
  TapeDegradation: TapeDegradationEditor,
  AmbientDelay: AmbientDelayEditor,
  ShimmerReverb: ShimmerReverbEditor,
  GranularFreeze: GranularFreezeEditor,
  // Buzzmachine WASM effects — dynamic knob editor
  BuzzDistortion: BuzzmachineEditor,
  BuzzOverdrive: BuzzmachineEditor,
  BuzzDistortion2: BuzzmachineEditor,
  BuzzDist2: BuzzmachineEditor,
  BuzzSoftSat: BuzzmachineEditor,
  BuzzStereoDist: BuzzmachineEditor,
  BuzzSVF: BuzzmachineEditor,
  BuzzPhilta: BuzzmachineEditor,
  BuzzNotch: BuzzmachineEditor,
  BuzzZfilter: BuzzmachineEditor,
  BuzzDelay: BuzzmachineEditor,
  BuzzCrossDelay: BuzzmachineEditor,
  BuzzFreeverb: BuzzmachineEditor,
  BuzzPanzerDelay: BuzzmachineEditor,
  BuzzChorus: BuzzmachineEditor,
  BuzzChorus2: BuzzmachineEditor,
  BuzzWhiteChorus: BuzzmachineEditor,
  BuzzFreqShift: BuzzmachineEditor,
  BuzzCompressor: BuzzmachineEditor,
  BuzzLimiter: BuzzmachineEditor,
  BuzzExciter: BuzzmachineEditor,
  BuzzMasterizer: BuzzmachineEditor,
  BuzzStereoGain: BuzzmachineEditor,
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
  Tumult:              { bg: '#0d0a1a', bgEnd: '#080612', accent: '#7c3aed', border: '#1a1030' },
  VinylNoise:          { bg: '#1a1008', bgEnd: '#120a04', accent: '#d97706', border: '#2a1a08' },
  ToneArm:             { bg: '#0a1a04', bgEnd: '#061204', accent: '#a3e635', border: '#102a08' },
  SidechainCompressor: { bg: '#081a10', bgEnd: '#04120a', accent: '#10b981', border: '#0a2a18' },
  RETapeEcho:          { bg: '#2a0808', bgEnd: '#1a0404', accent: '#dc2626', border: '#3a1010' },
  TapeSimulator:       { bg: '#1a1208', bgEnd: '#120e04', accent: '#b45309', border: '#2a1e08' },
  MoogFilter:          { bg: '#1a1508', bgEnd: '#120e04', accent: '#f59e0b', border: '#2a2008' },
  Vocoder:             { bg: '#1a0a22', bgEnd: '#100618', accent: '#a855f7', border: '#2a1430' },
  AutoTune:            { bg: '#220a18', bgEnd: '#180614', accent: '#ec4899', border: '#321428' },
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
    Distortion: <Zap size={18} className="text-text-primary" />,
    Reverb: <Waves size={18} className="text-text-primary" />,
    JCReverb: <Waves size={18} className="text-text-primary" />,
    Delay: <Clock size={18} className="text-text-primary" />,
    FeedbackDelay: <Clock size={18} className="text-text-primary" />,
    PingPongDelay: <Clock size={18} className="text-text-primary" />,
    Chorus: <Radio size={18} className="text-text-primary" />,
    Phaser: <Radio size={18} className="text-text-primary" />,
    Tremolo: <Wind size={18} className="text-text-primary" />,
    Vibrato: <Wind size={18} className="text-text-primary" />,
    Compressor: <Gauge size={18} className="text-text-primary" />,
    EQ3: <Sliders size={18} className="text-text-primary" />,
    Filter: <Sliders size={18} className="text-text-primary" />,
    StereoWidener: <ArrowLeftRight size={18} className="text-text-primary" />,
    SpaceyDelayer: <Clock size={18} className="text-text-primary" />,
    SpaceEcho: <Waves size={18} className="text-text-primary" />,
    BiPhase: <Radio size={18} className="text-text-primary" />,
    DubFilter: <Sliders size={18} className="text-text-primary" />,
    TapeSaturation: <Zap size={18} className="text-text-primary" />,
    Tumult: <Radio size={18} className="text-text-primary" />,
    VinylNoise: <Disc size={18} className="text-text-primary" />,
    ToneArm: <Disc size={18} className="text-text-primary" />,
    SidechainCompressor: <Gauge size={18} className="text-text-primary" />,
    RETapeEcho: <Disc size={18} className="text-text-primary" />,
    TapeSimulator: <Disc size={18} className="text-text-primary" />,
    MoogFilter: <Sliders size={18} className="text-text-primary" />,
    MVerb: <Waves size={18} className="text-text-primary" />,
    Leslie: <Radio size={18} className="text-text-primary" />,
    SpringReverb: <Waves size={18} className="text-text-primary" />,
    // WAM 2.0 effects
    WAMBigMuff: <Globe size={18} className="text-text-primary" />,
    WAMTS9: <Globe size={18} className="text-text-primary" />,
    WAMDistoMachine: <Globe size={18} className="text-text-primary" />,
    WAMQuadraFuzz: <Globe size={18} className="text-text-primary" />,
    WAMVoxAmp: <Globe size={18} className="text-text-primary" />,
    WAMStonePhaser: <Globe size={18} className="text-text-primary" />,
    WAMPingPongDelay: <Globe size={18} className="text-text-primary" />,
    WAMFaustDelay: <Globe size={18} className="text-text-primary" />,
    WAMPitchShifter: <Globe size={18} className="text-text-primary" />,
    WAMGraphicEQ: <Globe size={18} className="text-text-primary" />,
    WAMPedalboard: <Globe size={18} className="text-text-primary" />,
  };

  const enc = ENCLOSURE_COLORS[effect.type] || DEFAULT_ENCLOSURE;
  const icon = iconMap[effect.type] || <Music size={18} className="text-text-primary" />;
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
            <h2 className="text-base font-black text-text-primary tracking-wide">
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
              <p className="text-[11px] text-text-secondary font-medium">
                {effect.enabled ? 'Active' : 'Bypassed'} | Mix: {effect.wet}%
              </p>
            </div>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Editor Content */}
      <div className="flex-1 min-h-0 p-4 overflow-y-auto scrollbar-modern">
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
