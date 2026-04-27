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
import type { VisualEffectEditorProps } from './shared';

// Import all editors
import { DistortionEditor, ReverbEditor, DelayEditor, ChorusEditor, PhaserEditor, TremoloEditor, VibratoEditor } from './BasicEffectEditors';
import { AutoFilterEditor, CompressorEditor, EQ3Editor, FilterEditor, DubFilterEditor, SidechainCompressorEditor, MoogFilterEditor } from './FilterEffectEditors';
import { BiPhaseEditor, TapeSaturationEditor, VinylNoiseEditor, MVerbEditor, MadProfessorPlateEditor, DattorroPlateEditor, LeslieEditor, SpringReverbEditor, KissOfShameEditor } from './VintageEffectEditors';
import { AelapseEditor } from './AelapseEditor';
import { Fil4EqEditor } from './Fil4EqEditor';
import { SpaceyDelayerEditor, RETapeEchoEditor, SpaceEchoEditor, ToneArmEditor, TumultEditor } from './DelayVariantEditors';
import { AutoPannerEditor, AutoWahEditor, BitCrusherEditor, ChebyshevEditor, FrequencyShifterEditor, PitchShiftEditor, JCReverbEditor, StereoWidenerEditor } from './SpecializedEffectEditors';
import { VocoderEditor, AutoTuneEditor } from './VoiceEffectEditors';
import { TapeDegradationEditor, AmbientDelayEditor, ShimmerReverbEditor, GranularFreezeEditor } from './AdditionalEffectEditors';
import { NeuralEditor } from './NeuralEditor';
import { GenericEffectEditor, WAMEffectEditor } from './WAMEffectEditor';
import { EffectPresetSelector } from './EffectPresetSelector';

// Zynthian-ported dynamics editors
import {
  NoiseGateEditor, LimiterEditor, MonoCompEditor, ExpanderEditor, ClipperEditor,
  DeEsserEditor, MultibandCompEditor, TransientDesignerEditor, DynamicsProcEditor,
  X42CompEditor, GOTTCompEditor, SidechainGateEditor, SidechainLimiterEditor,
  MultibandGateEditor, MultibandLimiterEditor, MaximizerEditor, AGCEditor,
  BeatBreatherEditor, DuckaEditor, PandaEditor, MultibandClipperEditor,
  MultibandDynamicsEditor, MultibandExpanderEditor,
} from './DynamicsEditors';

// Zynthian-ported distortion/saturation editors
import {
  OverdriveEditor, SaturatorEditor, ExciterEditor, AutoSatEditor, SatmaEditor,
  DistortionShaperEditor, TubeAmpEditor, CabinetSimEditor, DrivaEditor, BassEnhancerEditor,
  SwedishChainsawEditor,
} from './DistortionSatEditors';

// Zynthian-ported EQ, modulation, reverb, delay, stereo, creative editors
import {
  ParametricEQEditor, EQ5BandEditor, ZamEQ2Editor, PhonoFilterEditor, DynamicEQEditor, ResonanceTamerEditor, KuizaEditor,
  FlangerEditor, JunoChorusEditor, MultiChorusEditor, CalfPhaserEditor, PulsatorEditor, RingModEditor,
  DragonflyHallEditor, DragonflyPlateEditor, DragonflyRoomEditor, EarlyReflectionsEditor, RoomyEditor,
  ReverseDelayEditor, VintageDelayEditor, ArtisticDelayEditor, SlapbackDelayEditor, ZamDelayEditor, DellaEditor,
  BinauralPannerEditor, HaasEnhancerEditor, MultiSpreadEditor, MultibandEnhancerEditor, VihdaEditor,
  MashaEditor, BittaEditor, VinylEditor,
  EQ8BandEditor, EQ12BandEditor, GEQ31Editor,
} from './EQModReverbEditors';

// Re-export all editors
export { DistortionEditor, ReverbEditor, DelayEditor, ChorusEditor, PhaserEditor, TremoloEditor, VibratoEditor } from './BasicEffectEditors';
export { AutoFilterEditor, CompressorEditor, EQ3Editor, FilterEditor, DubFilterEditor, SidechainCompressorEditor, MoogFilterEditor } from './FilterEffectEditors';
export { BiPhaseEditor, TapeSaturationEditor, VinylNoiseEditor, MVerbEditor, MadProfessorPlateEditor, DattorroPlateEditor, LeslieEditor, SpringReverbEditor, KissOfShameEditor } from './VintageEffectEditors';
export { SpaceyDelayerEditor, RETapeEchoEditor, SpaceEchoEditor, ToneArmEditor, TumultEditor } from './DelayVariantEditors';
export { AutoPannerEditor, AutoWahEditor, BitCrusherEditor, ChebyshevEditor, FrequencyShifterEditor, PitchShiftEditor, JCReverbEditor, StereoWidenerEditor } from './SpecializedEffectEditors';
export { VocoderEditor, AutoTuneEditor } from './VoiceEffectEditors';
export { TapeDegradationEditor, AmbientDelayEditor, ShimmerReverbEditor, GranularFreezeEditor } from './AdditionalEffectEditors';
export { GenericEffectEditor, WAMEffectEditor } from './WAMEffectEditor';

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
  MadProfessorPlate: MadProfessorPlateEditor,
  DattorroPlate: DattorroPlateEditor,
  Leslie: LeslieEditor,
  SpringReverb: SpringReverbEditor,
  Aelapse: AelapseEditor,
  Fil4EQ: Fil4EqEditor,
  TapeDegradation: TapeDegradationEditor,
  AmbientDelay: AmbientDelayEditor,
  ShimmerReverb: ShimmerReverbEditor,
  GranularFreeze: GranularFreezeEditor,
  // Zynthian-ported dynamics effects
  NoiseGate: NoiseGateEditor,
  Limiter: LimiterEditor,
  MonoComp: MonoCompEditor,
  Expander: ExpanderEditor,
  Clipper: ClipperEditor,
  DeEsser: DeEsserEditor,
  MultibandComp: MultibandCompEditor,
  TransientDesigner: TransientDesignerEditor,
  DynamicsProc: DynamicsProcEditor,
  X42Comp: X42CompEditor,
  GOTTComp: GOTTCompEditor,
  SidechainGate: SidechainGateEditor,
  SidechainLimiter: SidechainLimiterEditor,
  MultibandGate: MultibandGateEditor,
  MultibandLimiter: MultibandLimiterEditor,
  Maximizer: MaximizerEditor,
  AGC: AGCEditor,
  BeatBreather: BeatBreatherEditor,
  Ducka: DuckaEditor,
  Panda: PandaEditor,
  MultibandClipper: MultibandClipperEditor,
  MultibandDynamics: MultibandDynamicsEditor,
  MultibandExpander: MultibandExpanderEditor,
  // Zynthian-ported distortion/saturation effects
  Overdrive: OverdriveEditor,
  Saturator: SaturatorEditor,
  Exciter: ExciterEditor,
  AutoSat: AutoSatEditor,
  Satma: SatmaEditor,
  DistortionShaper: DistortionShaperEditor,
  TubeAmp: TubeAmpEditor,
  CabinetSim: CabinetSimEditor,
  Driva: DrivaEditor,
  BassEnhancer: BassEnhancerEditor,
  SwedishChainsaw: SwedishChainsawEditor,
  // Zynthian-ported EQ effects
  ParametricEQ: ParametricEQEditor,
  EQ5Band: EQ5BandEditor,
  EQ8Band: EQ8BandEditor,
  EQ12Band: EQ12BandEditor,
  GEQ31: GEQ31Editor,
  ZamEQ2: ZamEQ2Editor,
  PhonoFilter: PhonoFilterEditor,
  DynamicEQ: DynamicEQEditor,
  ResonanceTamer: ResonanceTamerEditor,
  Kuiza: KuizaEditor,
  // Zynthian-ported modulation effects
  Flanger: FlangerEditor,
  JunoChorus: JunoChorusEditor,
  MultiChorus: MultiChorusEditor,
  CalfPhaser: CalfPhaserEditor,
  Pulsator: PulsatorEditor,
  RingMod: RingModEditor,
  // Zynthian-ported reverb/delay effects
  DragonflyHall: DragonflyHallEditor,
  DragonflyPlate: DragonflyPlateEditor,
  DragonflyRoom: DragonflyRoomEditor,
  EarlyReflections: EarlyReflectionsEditor,
  Roomy: RoomyEditor,
  ReverseDelay: ReverseDelayEditor,
  VintageDelay: VintageDelayEditor,
  ArtisticDelay: ArtisticDelayEditor,
  SlapbackDelay: SlapbackDelayEditor,
  ZamDelay: ZamDelayEditor,
  Della: DellaEditor,
  // Zynthian-ported stereo/spatial effects
  BinauralPanner: BinauralPannerEditor,
  HaasEnhancer: HaasEnhancerEditor,
  MultiSpread: MultiSpreadEditor,
  MultibandEnhancer: MultibandEnhancerEditor,
  Vihda: VihdaEditor,
  // Zynthian-ported creative/lo-fi effects
  Masha: MashaEditor,
  Bitta: BittaEditor,
  Vinyl: VinylEditor,
  // Neural/GuitarML AI amp models
  Neural: NeuralEditor,
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
  onUpdateParameters?: (params: Record<string, number | string>) => void;
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
  TapeDelay:           { bg: '#1a1208', bgEnd: '#120e04', accent: '#d97706', border: '#2a1e08' },
  MoogFilter:          { bg: '#1a1508', bgEnd: '#120e04', accent: '#f59e0b', border: '#2a2008' },
  Vocoder:             { bg: '#1a0a22', bgEnd: '#100618', accent: '#a855f7', border: '#2a1430' },
  AutoTune:            { bg: '#220a18', bgEnd: '#180614', accent: '#ec4899', border: '#321428' },
  MVerb:               { bg: '#140a22', bgEnd: '#0c061a', accent: '#7c3aed', border: '#201432' },
  MadProfessorPlate:   { bg: '#1a1405', bgEnd: '#120e02', accent: '#e0a800', border: '#2a2010' },
  DattorroPlate:       { bg: '#081a14', bgEnd: '#04120a', accent: '#10b981', border: '#0a2a1e' },
  Leslie:              { bg: '#201408', bgEnd: '#180e04', accent: '#f97316', border: '#301e0a' },
  SpringReverb:        { bg: '#081a0a', bgEnd: '#041204', accent: '#059669', border: '#0a2a0e' },
  // ── WASM effects — Dynamics ──
  NoiseGate:           { bg: '#081a0a', bgEnd: '#041204', accent: '#10b981', border: '#0a2a0e' },
  Limiter:             { bg: '#081a0a', bgEnd: '#041204', accent: '#10b981', border: '#0a2a0e' },
  DeEsser:             { bg: '#081a0a', bgEnd: '#041204', accent: '#10b981', border: '#0a2a0e' },
  MultibandComp:       { bg: '#081a0a', bgEnd: '#041204', accent: '#10b981', border: '#0a2a0e' },
  TransientDesigner:   { bg: '#081a0a', bgEnd: '#041204', accent: '#10b981', border: '#0a2a0e' },
  Expander:            { bg: '#081a0a', bgEnd: '#041204', accent: '#10b981', border: '#0a2a0e' },
  MonoComp:            { bg: '#081a0a', bgEnd: '#041204', accent: '#10b981', border: '#0a2a0e' },
  SidechainGate:       { bg: '#081a0a', bgEnd: '#041204', accent: '#10b981', border: '#0a2a0e' },
  MultibandGate:       { bg: '#081a0a', bgEnd: '#041204', accent: '#10b981', border: '#0a2a0e' },
  MultibandLimiter:    { bg: '#081a0a', bgEnd: '#041204', accent: '#10b981', border: '#0a2a0e' },
  SidechainLimiter:    { bg: '#081a0a', bgEnd: '#041204', accent: '#10b981', border: '#0a2a0e' },
  Clipper:             { bg: '#081a0a', bgEnd: '#041204', accent: '#10b981', border: '#0a2a0e' },
  DynamicsProc:        { bg: '#081a0a', bgEnd: '#041204', accent: '#10b981', border: '#0a2a0e' },
  X42Comp:             { bg: '#081a0a', bgEnd: '#041204', accent: '#10b981', border: '#0a2a0e' },
  Ducka:               { bg: '#081a0a', bgEnd: '#041204', accent: '#10b981', border: '#0a2a0e' },
  BeatBreather:        { bg: '#081a0a', bgEnd: '#041204', accent: '#10b981', border: '#0a2a0e' },
  MultibandClipper:    { bg: '#081a0a', bgEnd: '#041204', accent: '#10b981', border: '#0a2a0e' },
  MultibandDynamics:   { bg: '#081a0a', bgEnd: '#041204', accent: '#10b981', border: '#0a2a0e' },
  MultibandExpander:   { bg: '#081a0a', bgEnd: '#041204', accent: '#10b981', border: '#0a2a0e' },
  GOTTComp:            { bg: '#081a0a', bgEnd: '#041204', accent: '#10b981', border: '#0a2a0e' },
  Maximizer:           { bg: '#081a0a', bgEnd: '#041204', accent: '#10b981', border: '#0a2a0e' },
  AGC:                 { bg: '#081a0a', bgEnd: '#041204', accent: '#10b981', border: '#0a2a0e' },
  Panda:               { bg: '#081a0a', bgEnd: '#041204', accent: '#10b981', border: '#0a2a0e' },
  // ── WASM effects — Distortion ──
  Overdrive:           { bg: '#2a1008', bgEnd: '#1a0a04', accent: '#ef4444', border: '#3a1a0a' },
  CabinetSim:          { bg: '#2a1008', bgEnd: '#1a0a04', accent: '#ef4444', border: '#3a1a0a' },
  TubeAmp:             { bg: '#2a1008', bgEnd: '#1a0a04', accent: '#ef4444', border: '#3a1a0a' },
  Saturator:           { bg: '#2a1008', bgEnd: '#1a0a04', accent: '#ef4444', border: '#3a1a0a' },
  Exciter:             { bg: '#2a1008', bgEnd: '#1a0a04', accent: '#f97316', border: '#3a1a0a' },
  AutoSat:             { bg: '#2a1008', bgEnd: '#1a0a04', accent: '#ef4444', border: '#3a1a0a' },
  Satma:               { bg: '#2a1008', bgEnd: '#1a0a04', accent: '#dc2626', border: '#3a1a0a' },
  DistortionShaper:    { bg: '#2a1008', bgEnd: '#1a0a04', accent: '#ef4444', border: '#3a1a0a' },
  Driva:               { bg: '#2a1008', bgEnd: '#1a0a04', accent: '#dc2626', border: '#3a1a0a' },
  SwedishChainsaw:     { bg: '#2a0808', bgEnd: '#1a0404', accent: '#dc2626', border: '#3a1010' },
  // ── WASM effects — Modulation ──
  Flanger:             { bg: '#200a18', bgEnd: '#180614', accent: '#ec4899', border: '#301428' },
  RingMod:             { bg: '#200a18', bgEnd: '#180614', accent: '#ec4899', border: '#301428' },
  JunoChorus:          { bg: '#200a18', bgEnd: '#180614', accent: '#ec4899', border: '#301428' },
  Pulsator:            { bg: '#200a18', bgEnd: '#180614', accent: '#ec4899', border: '#301428' },
  MultiChorus:         { bg: '#200a18', bgEnd: '#180614', accent: '#ec4899', border: '#301428' },
  CalfPhaser:          { bg: '#180a20', bgEnd: '#100618', accent: '#a855f7', border: '#281430' },
  // ── WASM effects — Reverb & Delay ──
  DragonflyPlate:      { bg: '#0e0a20', bgEnd: '#080618', accent: '#6366f1', border: '#1a1430' },
  DragonflyHall:       { bg: '#0e0a20', bgEnd: '#080618', accent: '#6366f1', border: '#1a1430' },
  DragonflyRoom:       { bg: '#0e0a20', bgEnd: '#080618', accent: '#6366f1', border: '#1a1430' },
  ReverseDelay:        { bg: '#081420', bgEnd: '#040e18', accent: '#3b82f6', border: '#0a1e30' },
  VintageDelay:        { bg: '#081420', bgEnd: '#040e18', accent: '#3b82f6', border: '#0a1e30' },
  ArtisticDelay:       { bg: '#081420', bgEnd: '#040e18', accent: '#3b82f6', border: '#0a1e30' },
  SlapbackDelay:       { bg: '#081420', bgEnd: '#040e18', accent: '#3b82f6', border: '#0a1e30' },
  ZamDelay:            { bg: '#081420', bgEnd: '#040e18', accent: '#3b82f6', border: '#0a1e30' },
  EarlyReflections:    { bg: '#0e0a20', bgEnd: '#080618', accent: '#6366f1', border: '#1a1430' },
  Della:               { bg: '#081420', bgEnd: '#040e18', accent: '#3b82f6', border: '#0a1e30' },
  Roomy:               { bg: '#0e0a20', bgEnd: '#080618', accent: '#6366f1', border: '#1a1430' },
  // ── WASM effects — EQ & Filter ──
  Fil4EQ:              { bg: '#081420', bgEnd: '#040e18', accent: '#3b82f6', border: '#0a1e30' },
  ParametricEQ:        { bg: '#081420', bgEnd: '#040e18', accent: '#3b82f6', border: '#0a1e30' },
  BassEnhancer:        { bg: '#201408', bgEnd: '#180e04', accent: '#f59e0b', border: '#301e0a' },
  EQ5Band:             { bg: '#081420', bgEnd: '#040e18', accent: '#3b82f6', border: '#0a1e30' },
  EQ8Band:             { bg: '#081420', bgEnd: '#040e18', accent: '#3b82f6', border: '#0a1e30' },
  EQ12Band:            { bg: '#081420', bgEnd: '#040e18', accent: '#3b82f6', border: '#0a1e30' },
  GEQ31:               { bg: '#081420', bgEnd: '#040e18', accent: '#3b82f6', border: '#0a1e30' },
  ZamEQ2:              { bg: '#081420', bgEnd: '#040e18', accent: '#3b82f6', border: '#0a1e30' },
  PhonoFilter:         { bg: '#201408', bgEnd: '#180e04', accent: '#f59e0b', border: '#301e0a' },
  DynamicEQ:           { bg: '#081420', bgEnd: '#040e18', accent: '#3b82f6', border: '#0a1e30' },
  Kuiza:               { bg: '#081420', bgEnd: '#040e18', accent: '#3b82f6', border: '#0a1e30' },
  // ── WASM effects — Stereo & Spatial ──
  HaasEnhancer:        { bg: '#200a18', bgEnd: '#180614', accent: '#ec4899', border: '#301428' },
  MultiSpread:         { bg: '#200a18', bgEnd: '#180614', accent: '#ec4899', border: '#301428' },
  MultibandEnhancer:   { bg: '#200a18', bgEnd: '#180614', accent: '#ec4899', border: '#301428' },
  BinauralPanner:      { bg: '#200a18', bgEnd: '#180614', accent: '#ec4899', border: '#301428' },
  Vihda:               { bg: '#200a18', bgEnd: '#180614', accent: '#ec4899', border: '#301428' },
  // ── WASM effects — Creative / Lo-Fi ──
  Masha:               { bg: '#0d0a1a', bgEnd: '#080612', accent: '#7c3aed', border: '#1a1030' },
  Vinyl:               { bg: '#1a1008', bgEnd: '#120a04', accent: '#d97706', border: '#2a1a08' },
  Bitta:               { bg: '#1a1008', bgEnd: '#120a04', accent: '#d97706', border: '#2a1a08' },
  // Neural/GuitarML AI amp models
  Neural:              { bg: '#1a0a22', bgEnd: '#100618', accent: '#a855f7', border: '#2a1430' },
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
  onUpdateParameters,
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
    TapeDelay: <Clock size={18} className="text-text-primary" />,
    MoogFilter: <Sliders size={18} className="text-text-primary" />,
    MVerb: <Waves size={18} className="text-text-primary" />,
    MadProfessorPlate: <Waves size={18} className="text-text-primary" />,
    DattorroPlate: <Waves size={18} className="text-text-primary" />,
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
    // ── WASM Dynamics ──
    NoiseGate: <Gauge size={18} className="text-text-primary" />,
    Limiter: <Gauge size={18} className="text-text-primary" />,
    DeEsser: <Gauge size={18} className="text-text-primary" />,
    MultibandComp: <Gauge size={18} className="text-text-primary" />,
    TransientDesigner: <Gauge size={18} className="text-text-primary" />,
    Expander: <Gauge size={18} className="text-text-primary" />,
    MonoComp: <Gauge size={18} className="text-text-primary" />,
    SidechainGate: <Gauge size={18} className="text-text-primary" />,
    MultibandGate: <Gauge size={18} className="text-text-primary" />,
    MultibandLimiter: <Gauge size={18} className="text-text-primary" />,
    SidechainLimiter: <Gauge size={18} className="text-text-primary" />,
    Clipper: <Gauge size={18} className="text-text-primary" />,
    DynamicsProc: <Gauge size={18} className="text-text-primary" />,
    X42Comp: <Gauge size={18} className="text-text-primary" />,
    Ducka: <Gauge size={18} className="text-text-primary" />,
    BeatBreather: <Gauge size={18} className="text-text-primary" />,
    MultibandClipper: <Gauge size={18} className="text-text-primary" />,
    MultibandDynamics: <Gauge size={18} className="text-text-primary" />,
    MultibandExpander: <Gauge size={18} className="text-text-primary" />,
    GOTTComp: <Gauge size={18} className="text-text-primary" />,
    Maximizer: <Gauge size={18} className="text-text-primary" />,
    AGC: <Gauge size={18} className="text-text-primary" />,
    Panda: <Gauge size={18} className="text-text-primary" />,
    // ── WASM Distortion ──
    Overdrive: <Zap size={18} className="text-text-primary" />,
    CabinetSim: <Zap size={18} className="text-text-primary" />,
    TubeAmp: <Zap size={18} className="text-text-primary" />,
    Saturator: <Zap size={18} className="text-text-primary" />,
    Exciter: <Zap size={18} className="text-text-primary" />,
    AutoSat: <Zap size={18} className="text-text-primary" />,
    Satma: <Zap size={18} className="text-text-primary" />,
    DistortionShaper: <Zap size={18} className="text-text-primary" />,
    Driva: <Zap size={18} className="text-text-primary" />,
    // ── WASM Modulation ──
    Flanger: <Radio size={18} className="text-text-primary" />,
    RingMod: <Radio size={18} className="text-text-primary" />,
    JunoChorus: <Radio size={18} className="text-text-primary" />,
    Pulsator: <Radio size={18} className="text-text-primary" />,
    MultiChorus: <Radio size={18} className="text-text-primary" />,
    CalfPhaser: <Radio size={18} className="text-text-primary" />,
    // ── WASM Reverb & Delay ──
    DragonflyPlate: <Waves size={18} className="text-text-primary" />,
    DragonflyHall: <Waves size={18} className="text-text-primary" />,
    DragonflyRoom: <Waves size={18} className="text-text-primary" />,
    ReverseDelay: <Clock size={18} className="text-text-primary" />,
    VintageDelay: <Clock size={18} className="text-text-primary" />,
    ArtisticDelay: <Clock size={18} className="text-text-primary" />,
    SlapbackDelay: <Clock size={18} className="text-text-primary" />,
    ZamDelay: <Clock size={18} className="text-text-primary" />,
    EarlyReflections: <Waves size={18} className="text-text-primary" />,
    Della: <Clock size={18} className="text-text-primary" />,
    Roomy: <Waves size={18} className="text-text-primary" />,
    // ── WASM EQ & Filter ──
    Fil4EQ: <Sliders size={18} className="text-text-primary" />,
    ParametricEQ: <Sliders size={18} className="text-text-primary" />,
    BassEnhancer: <Sliders size={18} className="text-text-primary" />,
    EQ5Band: <Sliders size={18} className="text-text-primary" />,
    EQ8Band: <Sliders size={18} className="text-text-primary" />,
    EQ12Band: <Sliders size={18} className="text-text-primary" />,
    GEQ31: <Sliders size={18} className="text-text-primary" />,
    ZamEQ2: <Sliders size={18} className="text-text-primary" />,
    PhonoFilter: <Sliders size={18} className="text-text-primary" />,
    DynamicEQ: <Sliders size={18} className="text-text-primary" />,
    Kuiza: <Sliders size={18} className="text-text-primary" />,
    // ── WASM Stereo & Spatial ──
    HaasEnhancer: <ArrowLeftRight size={18} className="text-text-primary" />,
    MultiSpread: <ArrowLeftRight size={18} className="text-text-primary" />,
    MultibandEnhancer: <ArrowLeftRight size={18} className="text-text-primary" />,
    BinauralPanner: <ArrowLeftRight size={18} className="text-text-primary" />,
    Vihda: <ArrowLeftRight size={18} className="text-text-primary" />,
    // ── WASM Creative / Lo-Fi ──
    Masha: <Radio size={18} className="text-text-primary" />,
    Vinyl: <Disc size={18} className="text-text-primary" />,
    Bitta: <Disc size={18} className="text-text-primary" />,
    // Neural/GuitarML AI amp models
    Neural: <Zap size={18} className="text-text-primary" />,
  };

  const effectType = effect.type ?? '';
  const enc = ENCLOSURE_COLORS[effectType] || DEFAULT_ENCLOSURE;
  const icon = iconMap[effectType] || <Music size={18} className="text-text-primary" />;
  const isWAM = effectType.startsWith('WAM');

  // WAM effects render only their native GUI — skip the pedal enclosure wrapper
  if (isWAM) {
    return (
      <div className="overflow-y-auto scrollbar-modern">
        <EffectEditorDispatch
          effectType={effect.type}
          effect={effect}
          onUpdateParameter={onUpdateParameter}
          onUpdateParameters={onUpdateParameters}
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
              <EffectPresetSelector
                effect={effect}
                onApply={onUpdateParameters}
                onUpdateParameter={onUpdateParameter}
                color={enc.accent}
              />
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
          onUpdateParameters={onUpdateParameters}
          onUpdateWet={onUpdateWet}
        />
      </div>
    </div>
  );
};
