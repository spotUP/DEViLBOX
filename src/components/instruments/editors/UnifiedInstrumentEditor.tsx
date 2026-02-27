/**
 * UnifiedInstrumentEditor - Unified template for all instrument types
 *
 * Provides consistent UX across all instrument types by using:
 * - EditorHeader for common header (synth dropdown, visualization, level meter)
 * - Dynamic control rendering based on synthType
 * - Standardized tab system for all editors
 *
 * This replaces the separate editor components with a single unified component
 * that imports specialized controls as needed.
 */

import React, { useState, useCallback, useEffect, lazy, Suspense } from 'react';
import type { InstrumentConfig, SynthType, EffectConfig } from '@typedefs/instrument';
import {
  DEFAULT_FURNACE, DEFAULT_DUB_SIREN, DEFAULT_SPACE_LASER, DEFAULT_V2, DEFAULT_V2_SPEECH, DEFAULT_SYNARE,
  DEFAULT_MAME_VFX, DEFAULT_MAME_DOC, DEFAULT_DEXED, DEFAULT_OBXD, DEFAULT_SAM,
  DEFAULT_HARMONIC_SYNTH as DEFAULT_HARMONIC_SYNTH_VAL,
  DEFAULT_HIVELY,
  DEFAULT_SOUNDMON, DEFAULT_SIDMON, DEFAULT_DIGMUG, DEFAULT_FC, DEFAULT_FRED, DEFAULT_TFMX,
  DEFAULT_OCTAMED, DEFAULT_SIDMON1, DEFAULT_HIPPEL_COSO, DEFAULT_ROB_HUBBARD, DEFAULT_DAVID_WHITTAKER,
} from '@typedefs/instrument';
import { deepMerge } from '../../../lib/migration';
import { EditorHeader, type VizMode } from '../shared/EditorHeader';
import { VisualizerFrame } from '@components/visualization/VisualizerFrame';
import { PresetDropdown } from '../presets/PresetDropdown';
import { useAutoPreview } from '@hooks/useAutoPreview';
import { SynthEditorTabs, type SynthEditorTab } from '../shared/SynthEditorTabs';
import { SYNTH_REGISTRY } from '@engine/vstbridge/synth-registry';
import { ChannelOscilloscope } from '../../visualization/ChannelOscilloscope';
import { useThemeStore, useInstrumentStore } from '@stores';
import { getToneEngine } from '@engine/ToneEngine';
import { isMAMEChipType, getChipSynthDef } from '@constants/chipParameters';
import { getChipCapabilities } from '@engine/mame/MAMEMacroTypes';
import { Box, Drum, Megaphone, Zap, Radio, MessageSquare, Music, Mic, Monitor, Cpu, SlidersHorizontal } from 'lucide-react';

// Import the tab content renderers from VisualSynthEditor
// We'll keep the existing tab content implementations
import { renderSpecialParameters, renderGenericTabContent } from './VisualSynthEditorContent';

// Import hardware UI components (lightweight, always needed for detection)
import { HardwareUIWrapper, hasHardwareUI } from '../hardware/HardwareUIWrapper';

// ============================================================================
// LAZY-LOADED CONTROL COMPONENTS
// These are loaded on-demand based on synthType to reduce initial bundle size
// ============================================================================

// Loading spinner for lazy components
const LoadingControls = () => (
  <div className="flex items-center justify-center py-8 text-gray-400">
    <div className="animate-spin w-6 h-6 border-2 border-current border-t-transparent rounded-full" />
    <span className="ml-2">Loading controls...</span>
  </div>
);

// Lazy-loaded synth-specific controls
const TB303Controls = lazy(() => import('../controls/TB303Controls').then(m => ({ default: m.TB303Controls })));
const FurnaceControls = lazy(() => import('../controls/FurnaceControls').then(m => ({ default: m.FurnaceControls })));
const BuzzmachineControls = lazy(() => import('../controls/BuzzmachineControls').then(m => ({ default: m.BuzzmachineControls })));
const SampleControls = lazy(() => import('../controls/SampleControls').then(m => ({ default: m.SampleControls })));
const DrumKitEditor = lazy(() => import('./DrumKitEditor').then(m => ({ default: m.DrumKitEditor })));
const DubSirenControls = lazy(() => import('../controls/DubSirenControls').then(m => ({ default: m.DubSirenControls })));
const SpaceLaserControls = lazy(() => import('../controls/SpaceLaserControls').then(m => ({ default: m.SpaceLaserControls })));
const V2Controls = lazy(() => import('../controls/V2Controls').then(m => ({ default: m.V2Controls })));
const V2SpeechControls = lazy(() => import('../controls/V2SpeechControls').then(m => ({ default: m.V2SpeechControls })));
const SAMControls = lazy(() => import('../controls/SAMControls').then(m => ({ default: m.SAMControls })));
const SynareControls = lazy(() => import('../controls/SynareControls').then(m => ({ default: m.SynareControls })));
const MAMEControls = lazy(() => import('../controls/MAMEControls').then(m => ({ default: m.MAMEControls })));
const ChipSynthControls = lazy(() => import('../controls/ChipSynthControls').then(m => ({ default: m.ChipSynthControls })));
const DexedControls = lazy(() => import('../controls/DexedControls').then(m => ({ default: m.DexedControls })));
const OBXdControls = lazy(() => import('../controls/OBXdControls').then(m => ({ default: m.OBXdControls })));
const WAMControls = lazy(() => import('../controls/WAMControls').then(m => ({ default: m.WAMControls })));
const VSTBridgePanel = lazy(() => import('../controls/VSTBridgePanel').then(m => ({ default: m.VSTBridgePanel })));
const HarmonicSynthControls = lazy(() => import('../controls/HarmonicSynthControls').then(m => ({ default: m.HarmonicSynthControls })));
const ModularSynthControls = lazy(() => import('../synths/modular/ModularSynthControls').then(m => ({ default: m.ModularSynthControls })));
const TonewheelOrganControls = lazy(() => import('../controls/TonewheelOrganControls').then(m => ({ default: m.TonewheelOrganControls })));
const MelodicaControls = lazy(() => import('../controls/MelodicaControls').then(m => ({ default: m.MelodicaControls })));
const VitalControls = lazy(() => import('../controls/VitalControls').then(m => ({ default: m.VitalControls })));
const Odin2Controls = lazy(() => import('../controls/Odin2Controls').then(m => ({ default: m.Odin2Controls })));
const SurgeControls = lazy(() => import('../controls/SurgeControls').then(m => ({ default: m.SurgeControls })));
const HivelyControls = lazy(() => import('../controls/HivelyControls').then(m => ({ default: m.HivelyControls })));
const SoundMonControls = lazy(() => import('../controls/SoundMonControls').then(m => ({ default: m.SoundMonControls })));
const SidMonControls = lazy(() => import('../controls/SidMonControls').then(m => ({ default: m.SidMonControls })));
const DigMugControls = lazy(() => import('../controls/DigMugControls').then(m => ({ default: m.DigMugControls })));
const FCControls = lazy(() => import('../controls/FCControls').then(m => ({ default: m.FCControls })));
const FredControls = lazy(() => import('../controls/FredControls').then(m => ({ default: m.FredControls })));
const TFMXControls = lazy(() => import('../controls/TFMXControls').then(m => ({ default: m.TFMXControls })));
const OctaMEDControls = lazy(() => import('../controls/OctaMEDControls').then(m => ({ default: m.OctaMEDControls })));
const SidMon1Controls = lazy(() => import('../controls/SidMon1Controls').then(m => ({ default: m.SidMon1Controls })));
const HippelCoSoControls = lazy(() => import('../controls/HippelCoSoControls').then(m => ({ default: m.HippelCoSoControls })));
const RobHubbardControls = lazy(() => import('../controls/RobHubbardControls').then(m => ({ default: m.RobHubbardControls })));
const DavidWhittakerControls = lazy(() => import('../controls/DavidWhittakerControls').then(m => ({ default: m.DavidWhittakerControls })));
const MusicLineControls = lazy(() => import('../controls/MusicLineControls').then(m => ({ default: m.MusicLineControls })));

// Lazy-loaded hardware UI components
const HivelyHardware = lazy(() => import('../hardware/HivelyHardware').then(m => ({ default: m.HivelyHardware })));
const PT2Hardware = lazy(() => import('../hardware/PT2Hardware').then(m => ({ default: m.PT2Hardware })));
const FT2Hardware = lazy(() => import('../hardware/FT2Hardware').then(m => ({ default: m.FT2Hardware })));
const FurnaceFMHardware = lazy(() => import('../hardware/FurnaceFMHardware').then(m => ({ default: m.FurnaceFMHardware })));
const FurnacePSGHardware = lazy(() => import('../hardware/FurnacePSGHardware').then(m => ({ default: m.FurnacePSGHardware })));
const FurnaceWaveHardware = lazy(() => import('../hardware/FurnaceWaveHardware').then(m => ({ default: m.FurnaceWaveHardware })));
const FurnacePCMHardware = lazy(() => import('../hardware/FurnacePCMHardware').then(m => ({ default: m.FurnacePCMHardware })));
const FurnaceMacroHardware = lazy(() => import('../hardware/FurnaceMacroHardware').then(m => ({ default: m.FurnaceMacroHardware })));
const FurnaceInsEdHardware = lazy(() => import('../hardware/FurnaceInsEdHardware').then(m => ({ default: m.FurnaceInsEdHardware })));

// Lazy-loaded specialized components
const MAMEOscilloscope = lazy(() => import('../../visualization/MAMEOscilloscope').then(m => ({ default: m.MAMEOscilloscope })));
const MAMEMacroEditor = lazy(() => import('./MAMEMacroEditor').then(m => ({ default: m.MAMEMacroEditor })));
const WavetableListEditor = lazy(() => import('./WavetableEditor').then(m => ({ default: m.WavetableListEditor })));

// Re-export types that were imported from MAMEMacroEditor/WavetableEditor
import type { MacroData } from './MAMEMacroEditor';
import type { WavetableData } from './WavetableEditor';

// Import type detection functions (lightweight)
import { isFurnaceFMType } from '../hardware/FurnaceFMHardware';
import { isFurnacePSGType } from '../hardware/FurnacePSGHardware';
import { isFurnaceWaveType } from '../hardware/FurnaceWaveHardware';
import { isFurnacePCMType } from '../hardware/FurnacePCMHardware';
import { isFurnaceInsEdType } from '../hardware/FurnaceInsEdHardware';

// Types
type EditorMode = 'generic' | 'tb303' | 'furnace' | 'buzzmachine' | 'sample' | 'dubsiren' | 'spacelaser' | 'v2' | 'sam' | 'synare' | 'mame' | 'mamechip' | 'dexed' | 'obxd' | 'wam' | 'tonewheelOrgan' | 'melodica' | 'vital' | 'odin2' | 'surge' | 'vstbridge' | 'harmonicsynth' | 'modular' | 'hively' | 'soundmon' | 'sidmon' | 'digmug' | 'fc' | 'fred' | 'tfmx' | 'octamed' | 'sidmon1' | 'hippelcoso' | 'robhubbard' | 'davidwhittaker' | 'musicline';

interface UnifiedInstrumentEditorProps {
  instrument: InstrumentConfig;
  onChange: (updates: Partial<InstrumentConfig>) => void;
}

// ============================================================================
// SYNTH TYPE CATEGORIZATION HELPERS
// ============================================================================

/** Check if synth type uses MAME editor */
function isMAMEType(synthType: SynthType): boolean {
  return ['MAMEVFX', 'MAMEDOC'].includes(synthType);
}

/** Check if synth type uses Furnace chip emulation editor */
function isFurnaceType(synthType: SynthType): boolean {
  return synthType === 'Furnace' || synthType.startsWith('Furnace');
}

/** Check if synth type uses Buzzmachine editor */
function isBuzzmachineType(synthType: SynthType): boolean {
  return synthType === 'Buzzmachine' || synthType.startsWith('Buzz');
}

/** Check if synth type uses Sample editor */
function isSampleType(synthType: SynthType): boolean {
  return ['Sampler', 'Player', 'GranularSynth', 'DrumKit', 'ChiptuneModule'].includes(synthType);
}

/** Check if synth type is Dub Siren */
function isDubSirenType(synthType: SynthType): boolean {
  return synthType === 'DubSiren';
}

/** Check if synth type is Space Laser */
function isSpaceLaserType(synthType: SynthType): boolean {
  return synthType === 'SpaceLaser';
}

/** Check if synth type is V2 */
function isV2Type(synthType: SynthType): boolean {
  return synthType === 'V2' || synthType === 'V2Speech';
}

/** Check if synth type is Synare */
function isSynareType(synthType: SynthType): boolean {
  return synthType === 'Synare';
}

/** Check if synth type is Dexed (DX7) */
function isDexedType(synthType: SynthType): boolean {
  return synthType === 'Dexed';
}

/** Check if synth type is OBXd (Oberheim) */
function isOBXdType(synthType: SynthType): boolean {
  return synthType === 'OBXd';
}

/** Check if synth type is HivelyTracker */
function isHivelyType(synthType: SynthType): boolean {
  return synthType === 'HivelySynth';
}

/** Check if synth type is SoundMon II */
function isSoundMonType(synthType: SynthType): boolean {
  return synthType === 'SoundMonSynth';
}

/** Check if synth type is SidMon II */
function isSidMonType(synthType: SynthType): boolean {
  return synthType === 'SidMonSynth';
}

/** Check if synth type is Digital Mugician */
function isDigMugType(synthType: SynthType): boolean {
  return synthType === 'DigMugSynth';
}

/** Check if synth type is Future Composer */
function isFCType(synthType: SynthType): boolean {
  return synthType === 'FCSynth';
}

/** Check if synth type is Fred Editor */
function isFredType(synthType: SynthType): boolean {
  return synthType === 'FredSynth';
}

/** Check if synth type is TFMX */
function isTFMXType(synthType: SynthType): boolean {
  return synthType === 'TFMXSynth';
}

/** Get the editor mode for a synth type */
function getEditorMode(synthType: SynthType): EditorMode {
  if (synthType === 'TB303' || synthType === 'Buzz3o3') return 'tb303';
  if (isFurnaceType(synthType)) return 'furnace';
  if (isBuzzmachineType(synthType)) return 'buzzmachine';
  if (isSampleType(synthType)) return 'sample';
  if (isDubSirenType(synthType)) return 'dubsiren';
  if (isSpaceLaserType(synthType)) return 'spacelaser';
  if (isV2Type(synthType)) return 'v2';
  if (synthType === 'Sam') return 'sam';
  if (isSynareType(synthType)) return 'synare';
  if (isMAMEChipType(synthType)) return 'mamechip';
  if (isMAMEType(synthType)) return 'mame';
  if (isDexedType(synthType)) return 'dexed';
  if (isOBXdType(synthType)) return 'obxd';
  if (isHivelyType(synthType)) return 'hively';
  if (isSoundMonType(synthType)) return 'soundmon';
  if (isSidMonType(synthType)) return 'sidmon';
  if (isDigMugType(synthType)) return 'digmug';
  if (isFCType(synthType)) return 'fc';
  if (isFredType(synthType)) return 'fred';
  if (isTFMXType(synthType)) return 'tfmx';
  if (synthType === 'OctaMEDSynth') return 'octamed';
  if (synthType === 'SidMon1Synth') return 'sidmon1';
  if (synthType === 'HippelCoSoSynth') return 'hippelcoso';
  if (synthType === 'RobHubbardSynth') return 'robhubbard';
  if (synthType === 'DavidWhittakerSynth') return 'davidwhittaker';
  if (synthType === 'HarmonicSynth') return 'harmonicsynth';
  if (synthType === 'ModularSynth') return 'modular';
  if (synthType === 'WAM') return 'wam';
  if (synthType === 'TonewheelOrgan') return 'tonewheelOrgan';
  if (synthType === 'Melodica') return 'melodica';
  if (synthType === 'Vital') return 'vital';
  if (synthType === 'Odin2') return 'odin2';
  if (synthType === 'Surge') return 'surge';
  if (SYNTH_REGISTRY.has(synthType)) return 'vstbridge';
  return 'generic';
}

// ============================================================================
// UNIFIED INSTRUMENT EDITOR
// ============================================================================

export const UnifiedInstrumentEditor: React.FC<UnifiedInstrumentEditorProps> = ({
  instrument,
  onChange,
}) => {
  const [vizMode, setVizMode] = useState<VizMode>('oscilloscope');
  const [showHelp, setShowHelp] = useState(false);
  const [genericTab, setGenericTab] = useState<SynthEditorTab>('oscillator');
  const [isBaking, setIsBaking] = useState(false);
  // Default to hardware UI if available, otherwise simple UI
  const [uiMode, setUIMode] = useState<'simple' | 'hardware'>(() =>
    hasHardwareUI(instrument.synthType) ? 'hardware' : 'simple'
  );
  // Custom (purpose-built) vs Generic (auto-generated VSTBridge) UI for WASM synths with custom editors
  const [vstUiMode, setVstUiMode] = useState<'custom' | 'generic'>('custom');

  const { bakeInstrument, unbakeInstrument } = useInstrumentStore();

  // Auto-preview: trigger a short note on parameter changes so the oscilloscope shows waveform
  const { triggerPreview } = useAutoPreview(instrument.id, instrument);
  const handleChange = useCallback((updates: Partial<InstrumentConfig>) => {
    onChange(updates);
    triggerPreview();
  }, [onChange, triggerPreview]);

  const isBaked = !!instrument.metadata?.preservedSynth;

  const handleBake = async () => {
    setIsBaking(true);
    try {
      await bakeInstrument(instrument.id, 'lite');
    } finally {
      setIsBaking(false);
    }
  };

  const handleBakePro = async () => {
    setIsBaking(true);
    try {
      await bakeInstrument(instrument.id, 'pro');
    } finally {
      setIsBaking(false);
    }
  };

  const handleUnbake = () => {
    unbakeInstrument(instrument.id);
  };

  const editorMode = instrument.metadata?.mlSynthConfig
    ? 'musicline'
    : getEditorMode(instrument.synthType);

  // Auto-switch tabs when synth type changes
  useEffect(() => {
    if (instrument.synthType === 'DrumMachine') {
      setGenericTab('special');
    } else if (isSampleType(instrument.synthType)) {
      setGenericTab('envelope');
    } else if (genericTab === 'special' && !renderSpecialParameters(instrument, handleChange)) {
      setGenericTab('oscillator');
    }
  }, [instrument.synthType]);

  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const isCyanTheme = currentThemeId === 'cyan-lineart';

  // Custom Header Renderers
  const renderSpaceLaserHeader = () => {
    const accentColor = isCyanTheme ? '#00ffff' : '#00ff00';
    const headerBg = isCyanTheme
      ? 'bg-[#041010] border-b-2 border-cyan-500'
      : 'bg-gradient-to-r from-[#2a2a2a] to-[#1a1a1a] border-b-4 border-[#00ff00]';

    return (
      <EditorHeader
        instrument={instrument}
        onChange={handleChange}
        vizMode={vizMode}
        onVizModeChange={setVizMode}
        onBake={handleBake}
        onBakePro={handleBakePro}
        onUnbake={handleUnbake}
        isBaked={isBaked}
        isBaking={isBaking}
        customHeader={
          <div className={`synth-editor-header px-4 py-3 ${headerBg}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gradient-to-br from-green-500 to-green-700 shadow-lg">
                  <Zap size={24} className="text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-black tracking-tight" style={{ color: accentColor }}>SPACE LASER</h2>
                  <p className={`text-[10px] uppercase tracking-widest ${isCyanTheme ? 'text-cyan-600' : 'text-gray-400'}`}>Cosmic Zap Generator</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {/* Live Mode Toggle */}
                <button
                  onClick={() => handleChange({ isLive: !instrument.isLive })}
                  className={`p-1.5 rounded transition-all flex items-center gap-1.5 px-2 ${
                    instrument.isLive
                      ? 'bg-accent-success/20 text-accent-success ring-1 ring-accent-success/50 animate-pulse-glow'
                      : 'bg-gray-800 text-text-muted hover:text-text-secondary border border-gray-700'
                  }`}
                >
                  <Radio size={14} />
                  <span className="text-[10px] font-bold uppercase">LIVE</span>
                </button>

                <PresetDropdown
                  synthType={instrument.synthType}
                  onChange={handleChange}
                />
              </div>
            </div>
          </div>
        }
      />
    );
  };

  const renderV2Header = () => {
    const accentColor = isCyanTheme ? '#00ffff' : '#ffaa00';
    const headerBg = isCyanTheme
      ? 'bg-[#041010] border-b-2 border-cyan-500'
      : 'bg-gradient-to-r from-[#2a2a2a] to-[#1a1a1a] border-b-4 border-[#ffaa00]';

    const handleEnableSpeech = () => {
      handleChange({ v2Speech: { ...DEFAULT_V2_SPEECH } });
    };

    return (
      <EditorHeader
        instrument={instrument}
        onChange={handleChange}
        vizMode={vizMode}
        onVizModeChange={setVizMode}
        onBake={handleBake}
        onBakePro={handleBakePro}
        onUnbake={handleUnbake}
        isBaked={isBaked}
        isBaking={isBaking}
        customHeader={
          <div className={`synth-editor-header px-4 py-3 ${headerBg}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gradient-to-br from-amber-500 to-amber-700 shadow-lg">
                  <Box size={24} className="text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-black tracking-tight" style={{ color: accentColor }}>V2 SYNTH</h2>
                  <p className={`text-[10px] uppercase tracking-widest ${isCyanTheme ? 'text-cyan-600' : 'text-gray-400'}`}>Farbrausch 4k Intro Engine</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Mode Toggle: Switch to Speech */}
                <button
                  onClick={handleEnableSpeech}
                  className="p-1.5 rounded transition-all flex items-center gap-1.5 px-2 bg-gray-800 text-text-muted hover:text-amber-400 hover:bg-amber-500/10 border border-gray-700"
                  title="Switch to Speech Mode"
                >
                  <Mic size={14} />
                  <span className="text-[10px] font-bold uppercase">Speech</span>
                </button>

                <button
                  onClick={() => handleChange({ isLive: !instrument.isLive })}
                  className={`p-1.5 rounded transition-all flex items-center gap-1.5 px-2 ${
                    instrument.isLive
                      ? 'bg-accent-success/20 text-accent-success ring-1 ring-accent-success/50 animate-pulse-glow'
                      : 'bg-gray-800 text-text-muted hover:text-text-secondary border border-gray-700'
                  }`}
                >
                  <Radio size={14} />
                  <span className="text-[10px] font-bold uppercase">LIVE</span>
                </button>

                <PresetDropdown
                  synthType={instrument.synthType}
                  onChange={handleChange}
                />
              </div>
            </div>
          </div>
        }
      />
    );
  };

  const renderDubSirenHeader = () => {
    const accentColor = isCyanTheme ? '#00ffff' : '#ff4444';
    const headerBg = isCyanTheme
      ? 'bg-[#041010] border-b-2 border-cyan-500'
      : 'bg-gradient-to-r from-[#2a2a2a] to-[#1a1a1a] border-b-4 border-[#ff4444]';

    return (
      <EditorHeader
        instrument={instrument}
        onChange={handleChange}
        vizMode={vizMode}
        onVizModeChange={setVizMode}
        onBake={handleBake}
        onBakePro={handleBakePro}
        onUnbake={handleUnbake}
        isBaked={isBaked}
        isBaking={isBaking}
        customHeader={
          <div className={`synth-editor-header px-4 py-3 ${headerBg}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gradient-to-br from-red-500 to-red-700 shadow-lg">
                  <Megaphone size={24} className="text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-black tracking-tight" style={{ color: accentColor }}>DUB SIREN</h2>
                  <p className={`text-[10px] uppercase tracking-widest ${isCyanTheme ? 'text-cyan-600' : 'text-gray-400'}`}>Sound System Generator</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleChange({ isLive: !instrument.isLive })}
                  className={`p-1.5 rounded transition-all flex items-center gap-1.5 px-2 ${
                    instrument.isLive
                      ? 'bg-accent-success/20 text-accent-success ring-1 ring-accent-success/50 animate-pulse-glow'
                      : 'bg-gray-800 text-text-muted hover:text-text-secondary border border-gray-700'
                  }`}
                >
                  <Radio size={14} />
                  <span className="text-[10px] font-bold uppercase">LIVE</span>
                </button>

                <PresetDropdown
                  synthType={instrument.synthType}
                  onChange={handleChange}
                />
              </div>
            </div>
          </div>
        }
      />
    );
  };

  const renderSynareHeader = () => {
    const accentColor = isCyanTheme ? '#00ffff' : '#ffcc00';
    const headerBg = isCyanTheme
      ? 'bg-[#041010] border-b-2 border-cyan-500'
      : 'bg-gradient-to-r from-[#2a2a2a] to-[#1a1a1a] border-b-4 border-[#ffcc00]';

    return (
      <EditorHeader
        instrument={instrument}
        onChange={handleChange}
        vizMode={vizMode}
        onVizModeChange={setVizMode}
        onBake={handleBake}
        onBakePro={handleBakePro}
        onUnbake={handleUnbake}
        isBaked={isBaked}
        isBaking={isBaking}
        customHeader={
          <div className={`synth-editor-header px-4 py-3 ${headerBg}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gradient-to-br from-yellow-500 to-orange-700 shadow-lg text-black">
                  <Drum size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-black tracking-tight" style={{ color: accentColor }}>SYNARE 3</h2>
                  <p className={`text-[10px] uppercase tracking-widest ${isCyanTheme ? 'text-cyan-600' : 'text-gray-400'}`}>Electronic Percussion</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleChange({ isLive: !instrument.isLive })}
                  className={`p-1.5 rounded transition-all flex items-center gap-1.5 px-2 ${
                    instrument.isLive
                      ? 'bg-accent-success/20 text-accent-success ring-1 ring-accent-success/50 animate-pulse-glow'
                      : 'bg-gray-800 text-text-muted hover:text-text-secondary border border-gray-700'
                  }`}
                >
                  <Radio size={14} />
                  <span className="text-[10px] font-bold uppercase">LIVE</span>
                </button>

                <PresetDropdown
                  synthType={instrument.synthType}
                  onChange={handleChange}
                />
              </div>
            </div>
          </div>
        }
      />
    );
  };

  // Handle TB303 config updates
  const handleTB303Change = useCallback((updates: Partial<typeof instrument.tb303>) => {
    handleChange({
      tb303: { ...instrument.tb303, ...updates } as typeof instrument.tb303,
    });
  }, [instrument.tb303, handleChange]);

  // Handle full TB303 preset load (synth config + effects chain)
  const handleTB303PresetLoad = useCallback(async (preset: Record<string, unknown>) => {
    // Apply TB-303 synth config
    if (preset.tb303) {
      handleChange({
        tb303: { ...instrument.tb303, ...preset.tb303 as Record<string, unknown> } as typeof instrument.tb303,
      });
    }

    // Apply effects chain (or clear if preset has none)
    if (preset.effects !== undefined) {
      const fxArray = preset.effects as Array<Record<string, unknown>>;
      const effects = fxArray.map((fx, i: number) => ({
        ...fx,
        id: (fx.id as string) || `tb303-fx-${Date.now()}-${i}`,
      })) as EffectConfig[];
      handleChange({ effects });

      // Rebuild audio chain immediately
      try {
        const engine = getToneEngine();
        await engine.rebuildInstrumentEffects(instrument.id, effects);
      } catch {
        // Engine not initialized yet
      }
    }
  }, [instrument.tb303, instrument.id, handleChange]);

  // Handle Dub Siren config updates
  const handleDubSirenChange = useCallback((updates: Partial<typeof instrument.dubSiren>) => {
    const currentDubSiren = instrument.dubSiren || DEFAULT_DUB_SIREN;
    handleChange({
      dubSiren: { ...currentDubSiren, ...updates },
    });
  }, [instrument.dubSiren, handleChange]);

  // Handle Hively config updates (partial — for HivelyControls)
  const handleHivelyChange = useCallback((updates: Partial<typeof instrument.hively>) => {
    const currentHively = instrument.hively || DEFAULT_HIVELY;
    handleChange({
      hively: { ...currentHively, ...updates },
    });
  }, [instrument.hively, handleChange]);

  // Handle Hively hardware config updates (full config — for HivelyHardware)
  const handleHivelyHardwareChange = useCallback((fullConfig: typeof DEFAULT_HIVELY) => {
    handleChange({ hively: fullConfig });
  }, [handleChange]);

  // Handle SoundMon config updates
  const handleSoundMonChange = useCallback((updates: Partial<typeof instrument.soundMon>) => {
    const current = instrument.soundMon || DEFAULT_SOUNDMON;
    handleChange({ soundMon: { ...current, ...updates } });
  }, [instrument.soundMon, handleChange]);

  // Handle SidMon config updates
  const handleSidMonChange = useCallback((updates: Partial<typeof instrument.sidMon>) => {
    const current = instrument.sidMon || DEFAULT_SIDMON;
    handleChange({ sidMon: { ...current, ...updates } });
  }, [instrument.sidMon, handleChange]);

  // Handle DigMug config updates
  const handleDigMugChange = useCallback((updates: Partial<typeof instrument.digMug>) => {
    const current = instrument.digMug || DEFAULT_DIGMUG;
    handleChange({ digMug: { ...current, ...updates } });
  }, [instrument.digMug, handleChange]);

  // Handle FC config updates
  const handleFCChange = useCallback((updates: Partial<typeof instrument.fc>) => {
    const current = instrument.fc || DEFAULT_FC;
    handleChange({ fc: { ...current, ...updates } });
  }, [instrument.fc, handleChange]);

  // Handle Fred config updates
  const handleFredChange = useCallback((updates: Partial<typeof instrument.fred>) => {
    const current = instrument.fred || DEFAULT_FRED;
    handleChange({ fred: { ...current, ...updates } });
  }, [instrument.fred, handleChange]);

  // Handle OctaMED config updates
  const handleOctaMEDChange = useCallback((updates: Partial<typeof instrument.octamed>) => {
    const current = instrument.octamed || DEFAULT_OCTAMED;
    handleChange({ octamed: { ...current, ...updates } });
  }, [instrument.octamed, handleChange]);

  // Handle SidMon 1.0 config updates
  const handleSidMon1Change = useCallback((updates: Partial<typeof instrument.sidmon1>) => {
    const current = instrument.sidmon1 || DEFAULT_SIDMON1;
    handleChange({ sidmon1: { ...current, ...updates } });
  }, [instrument.sidmon1, handleChange]);

  // Handle HippelCoSo config updates
  const handleHippelCoSoChange = useCallback((updates: Partial<typeof instrument.hippelCoso>) => {
    const current = instrument.hippelCoso || DEFAULT_HIPPEL_COSO;
    handleChange({ hippelCoso: { ...current, ...updates } });
  }, [instrument.hippelCoso, handleChange]);

  // Handle Rob Hubbard config updates
  const handleRobHubbardChange = useCallback((updates: Partial<typeof instrument.robHubbard>) => {
    const current = instrument.robHubbard || DEFAULT_ROB_HUBBARD;
    handleChange({ robHubbard: { ...current, ...updates } });
  }, [instrument.robHubbard, handleChange]);

  // Handle David Whittaker config updates
  const handleDavidWhittakerChange = useCallback((updates: Partial<typeof instrument.davidWhittaker>) => {
    const current = instrument.davidWhittaker || DEFAULT_DAVID_WHITTAKER;
    handleChange({ davidWhittaker: { ...current, ...updates } });
  }, [instrument.davidWhittaker, handleChange]);

  // Handle Space Laser config updates
  const handleSpaceLaserChange = useCallback((updates: Partial<typeof instrument.spaceLaser>) => {
    const currentSpaceLaser = instrument.spaceLaser || DEFAULT_SPACE_LASER;
    handleChange({
      spaceLaser: { ...currentSpaceLaser, ...updates },
    });
  }, [instrument.spaceLaser, handleChange]);

  // Handle V2 config updates
  const handleV2Change = useCallback((updates: Partial<typeof instrument.v2>) => {
    const currentV2 = instrument.v2 || DEFAULT_V2;
    handleChange({
      v2: { ...currentV2, ...updates },
    });
  }, [instrument.v2, handleChange]);

  // Handle Synare config updates
  const handleSynareChange = useCallback((updates: Partial<typeof instrument.synare>) => {
    const currentSynare = instrument.synare || DEFAULT_SYNARE;
    handleChange({
      synare: { ...currentSynare, ...updates },
    });
  }, [instrument.synare, handleChange]);

  // Handle Furnace config updates (partial — for FurnaceControls)
  const handleFurnaceChange = useCallback((updates: Partial<typeof instrument.furnace>) => {
    const currentFurnace = instrument.furnace || DEFAULT_FURNACE;
    handleChange({
      furnace: { ...currentFurnace, ...updates },
    });
  }, [instrument.furnace, handleChange]);

  // Handle Furnace hardware config updates (full config — for Furnace*Hardware)
  const handleFurnaceHardwareChange = useCallback((fullConfig: typeof DEFAULT_FURNACE) => {
    handleChange({ furnace: fullConfig });
  }, [handleChange]);

  // Handle MAME config updates
  const handleMAMEChange = useCallback((updates: Partial<typeof instrument.mame>) => {
    const currentMame = instrument.mame || (
      instrument.synthType === 'MAMEDOC' ? DEFAULT_MAME_DOC :
      DEFAULT_MAME_VFX
    );
    const newConfig = { ...currentMame, ...updates };
    handleChange({
      mame: newConfig,
    });

    // Real-time update
    try {
      const engine = getToneEngine();
      engine.updateMAMEParameters(instrument.id, newConfig);
    } catch {
      // Ignored
    }
  }, [instrument.mame, instrument.synthType, instrument.id, handleChange]);

  // Handle MAME chip synth parameter changes
  const handleChipParamChange = useCallback((key: string, value: number) => {
    const currentParams = instrument.parameters || {};
    const newParams = { ...currentParams, [key]: value };
    handleChange({ parameters: newParams });
    try {
      const engine = getToneEngine();
      engine.updateMAMEChipParam(instrument.id, key, value);
    } catch { /* ignored */ }
  }, [instrument.parameters, instrument.id, handleChange]);

  // Handle MAME chip synth text parameter changes (e.g. speech text)
  // Uses onChange directly instead of handleChange to avoid triggering auto-preview
  const handleChipTextChange = useCallback((key: string, value: string) => {
    const currentParams = instrument.parameters || {};
    const newParams = { ...currentParams, [key]: value };
    onChange({ parameters: newParams });
    try {
      const engine = getToneEngine();
      engine.updateMAMEChipTextParam(instrument.id, key, value);
    } catch { /* ignored */ }
  }, [instrument.parameters, instrument.id, onChange]);

  // Handle MAME chip synth preset load
  const handleChipPresetLoad = useCallback((program: number) => {
    const currentParams = instrument.parameters || {};
    handleChange({ parameters: { ...currentParams, _program: program } });
    try {
      const engine = getToneEngine();
      engine.loadMAMEChipPreset(instrument.id, program);
    } catch { /* ignored */ }
  }, [instrument.parameters, instrument.id, handleChange]);

  // Handle ROM upload for chip synths that require ROMs
  const handleChipRomUpload = useCallback((bank: number, data: Uint8Array) => {
    try {
      const engine = getToneEngine();
      engine.loadSynthROM(instrument.id, instrument.synthType, bank, data);
    } catch { /* ignored */ }
  }, [instrument.id, instrument.synthType]);

  // Handle speech text-to-speech trigger for MAME speech chips
  const handleChipSpeak = useCallback((text: string) => {
    try {
      const engine = getToneEngine();
      engine.speakMAMEChipText(instrument.id, text);
    } catch (e) {
      console.error('[UnifiedInstrumentEditor] handleChipSpeak error:', e);
    }
  }, [instrument.id]);

  // Handle Dexed (DX7) config updates
  const handleDexedChange = useCallback((updates: Partial<typeof instrument.dexed>) => {
    const currentDexed = instrument.dexed || DEFAULT_DEXED;
    const newConfig = { ...currentDexed, ...updates };
    handleChange({
      dexed: newConfig,
    });

    // Real-time update
    try {
      const engine = getToneEngine();
      engine.updateDexedParameters(instrument.id, newConfig);
    } catch {
      // Ignored
    }
  }, [instrument.dexed, instrument.id, handleChange]);

  // Handle OBXd (Oberheim) config updates
  const handleOBXdChange = useCallback((updates: Partial<typeof instrument.obxd>) => {
    const currentOBXd = instrument.obxd || DEFAULT_OBXD;
    const newConfig = { ...currentOBXd, ...updates };
    handleChange({
      obxd: newConfig,
    });

    // Real-time update
    try {
      const engine = getToneEngine();
      engine.updateOBXdParameters(instrument.id, newConfig);
    } catch {
      // Ignored
    }
  }, [instrument.obxd, instrument.id, handleChange]);

  // Determine which tabs to hide based on synth type for generic editor
  const getHiddenTabs = (): SynthEditorTab[] => {
    const hidden: SynthEditorTab[] = [];
    
    // DrumMachine hides standard tabs as it uses per-voice controls in Special tab
    if (instrument.synthType === 'DrumMachine') {
      hidden.push('oscillator');
      hidden.push('envelope');
      hidden.push('filter');
      hidden.push('modulation');
      // Keep 'output' and 'special'
    } else {
      if (isSampleType(instrument.synthType)) {
        hidden.push('oscillator');
      }
      if (!instrument.oscillator && !isSampleType(instrument.synthType)) {
        hidden.push('oscillator');
      }
    }

    // Hide special tab if no special parameters for this synth type
    const hasSpecialParams = renderSpecialParameters(instrument, handleChange) !== null;
    if (!hasSpecialParams) {
      hidden.push('special');
    }
    return hidden;
  };
  // ============================================================================
  // TB-303 EDITOR
  // ============================================================================
  if (editorMode === 'tb303' && instrument.tb303) {
    const mainBg = isCyanTheme
      ? 'bg-[#030808]'
      : 'bg-gradient-to-b from-[#1e1e1e] to-[#151515]';

    return (
      <div className={`synth-editor-container ${mainBg}`}>
        {/* Tab Content - Use TB303Controls (Full JC303 Panel) */}
        <div className="synth-editor-content p-4 flex items-center justify-center">
          <Suspense fallback={<LoadingControls />}>
            <TB303Controls
              config={instrument.tb303}
              onChange={handleTB303Change}
              onPresetLoad={handleTB303PresetLoad}
              showFilterCurve={false}
              showHeader={false}
              isJC303={true}
              isBuzz3o3={instrument.synthType === 'Buzz3o3'}
            />
          </Suspense>
        </div>
      </div>
    );
  }

  // ============================================================================
  // FURNACE CHIP EDITOR
  // ============================================================================
  if (editorMode === 'furnace') {
    const furnaceConfig = deepMerge(DEFAULT_FURNACE, instrument.furnace || {});
    // rawBinaryData lives at the instrument level, not inside furnace — copy it through
    if (instrument.rawBinaryData) {
      furnaceConfig.rawBinaryData = instrument.rawBinaryData;
    }

    // Determine channel names for oscilloscope based on synth type
    const isNativeDispatch = instrument.synthType === 'FurnaceGB';
    const channelNames: Record<string, string[]> = {
      FurnaceGB: ['PU1', 'PU2', 'WAV', 'NOI'],
      FurnaceNES: ['PU1', 'PU2', 'TRI', 'NOI', 'DPCM'],
      FurnacePSG: ['SQ1', 'SQ2', 'SQ3', 'NOI'],
      FurnaceAY: ['A', 'B', 'C'],
    };

    // Determine if this Furnace chip has a hardware UI
    const hasFurnaceHardware = isFurnaceInsEdType(instrument.synthType) ||
      isFurnaceFMType(instrument.synthType) ||
      isFurnacePSGType(instrument.synthType) ||
      isFurnaceWaveType(instrument.synthType) ||
      isFurnacePCMType(instrument.synthType);

    // Render the correct Furnace hardware UI based on chip category.
    // Dedicated hardware modules (FM/PSG/Wave/PCM) take priority over the generic
    // InsEdit WASM, which serves as a fallback for types without a dedicated UI.
    const renderFurnaceHardware = () => {
      if (isFurnaceFMType(instrument.synthType)) {
        return <Suspense fallback={<LoadingControls />}><FurnaceFMHardware config={furnaceConfig} onChange={handleFurnaceHardwareChange} /></Suspense>;
      }
      if (isFurnacePSGType(instrument.synthType)) {
        return <Suspense fallback={<LoadingControls />}><FurnacePSGHardware config={furnaceConfig} onChange={handleFurnaceHardwareChange} synthType={instrument.synthType} /></Suspense>;
      }
      if (isFurnaceWaveType(instrument.synthType)) {
        return <Suspense fallback={<LoadingControls />}><FurnaceWaveHardware config={furnaceConfig} onChange={handleFurnaceHardwareChange} synthType={instrument.synthType} /></Suspense>;
      }
      if (isFurnacePCMType(instrument.synthType)) {
        return <Suspense fallback={<LoadingControls />}><FurnacePCMHardware config={furnaceConfig} onChange={handleFurnaceHardwareChange} instrument={instrument} /></Suspense>;
      }
      if (isFurnaceInsEdType(instrument.synthType)) {
        return <Suspense fallback={<LoadingControls />}><FurnaceInsEdHardware config={furnaceConfig} onChange={handleFurnaceHardwareChange} synthType={instrument.synthType} instrument={instrument} /></Suspense>;
      }
      return null;
    };

    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
        {/* Use common header with visualization */}
        <EditorHeader
          instrument={instrument}
          onChange={handleChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
          showHelpButton={false}
          customHeaderControls={
            hasFurnaceHardware ? (
              <button
                onClick={() => setUIMode(uiMode === 'simple' ? 'hardware' : 'simple')}
                className={`p-1.5 rounded transition-all flex items-center gap-1.5 px-2 ${
                  uiMode === 'hardware'
                    ? 'bg-accent-primary/20 text-accent-primary ring-1 ring-accent-primary/50'
                    : 'bg-gray-800 text-text-muted hover:text-text-secondary border border-gray-700'
                }`}
                title={uiMode === 'hardware' ? 'Switch to Simple Controls' : 'Switch to Hardware UI'}
              >
                {uiMode === 'hardware' ? <Cpu size={14} /> : <Monitor size={14} />}
                <span className="text-[10px] font-bold uppercase">
                  {uiMode === 'hardware' ? 'Hardware UI' : 'Simple UI'}
                </span>
              </button>
            ) : undefined
          }
        />

        {/* Channel Oscilloscope for native dispatch synths */}
        {isNativeDispatch && (
          <div className="px-4 pt-3">
            <VisualizerFrame variant="compact">
              <ChannelOscilloscope
                channelNames={channelNames[instrument.synthType] || []}
                height={160}
              />
            </VisualizerFrame>
          </div>
        )}

        {/* Furnace Controls — hardware or simple */}
        <div className="synth-editor-content overflow-y-auto p-4">
          {uiMode === 'hardware' && hasFurnaceHardware ? (
            <div className="space-y-4">
              {renderFurnaceHardware()}
              {/* Macro editor below the main hardware UI */}
              {furnaceConfig.macros && furnaceConfig.macros.length > 0 && (
                <Suspense fallback={<LoadingControls />}>
                  <FurnaceMacroHardware
                    config={furnaceConfig}
                    onChange={handleFurnaceHardwareChange}
                  />
                </Suspense>
              )}
            </div>
          ) : (
            <Suspense fallback={<LoadingControls />}>
              <FurnaceControls
                config={furnaceConfig}
                instrumentId={instrument.id}
                onChange={handleFurnaceChange}
              />
            </Suspense>
          )}
        </div>
      </div>
    );
  }

  // ============================================================================
  // BUZZMACHINE EDITOR
  // ============================================================================
  if (editorMode === 'buzzmachine') {
    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
        {/* Use common header with visualization */}
        <EditorHeader
          instrument={instrument}
          onChange={handleChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
          showHelpButton={false}
        />

        {/* Buzzmachine Controls */}
        <div className="synth-editor-content overflow-y-auto p-4">
          <Suspense fallback={<LoadingControls />}>
            <BuzzmachineControls
              config={instrument}
              onChange={handleChange}
            />
          </Suspense>
        </div>
      </div>
    );
  }

  // ============================================================================
  // SAMPLE EDITOR (including DrumKit)
  // ============================================================================
  if (editorMode === 'sample') {
    // Special case: DrumKit instruments use the DrumKitEditor
    if (instrument.synthType === 'DrumKit') {
      return (
        <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515] h-full">
          {/* Use common header but hide viz */}
          <EditorHeader
            instrument={instrument}
            onChange={handleChange}
            vizMode={vizMode}
            onVizModeChange={setVizMode}
            hideVisualization={true}
            showHelpButton={false}
          />

          {/* DrumKit Editor (full height) */}
          <div className="flex-1 overflow-hidden">
            <Suspense fallback={<LoadingControls />}>
              <DrumKitEditor
                instrument={instrument}
                onUpdate={handleChange}
              />
            </Suspense>
          </div>
        </div>
      );
    }

    // Regular sample editor for other sample-based instruments — with hardware UI toggle
    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
        {/* Use common header but hide viz (sample editor has waveform) */}
        <EditorHeader
          instrument={instrument}
          onChange={handleChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
          hideVisualization={true}
          showHelpButton={false}
          customHeaderControls={
            <button
              className={`px-2 py-1 text-xs rounded flex items-center gap-1 ${
                uiMode === 'hardware'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
              onClick={() => setUIMode(uiMode === 'simple' ? 'hardware' : 'simple')}
              title={uiMode === 'hardware' ? 'Switch to Simple Controls' : 'Switch to Hardware UI'}
            >
              {uiMode === 'hardware' ? <Cpu size={14} /> : <Monitor size={14} />}
              <span className="hidden sm:inline">
                {uiMode === 'hardware' ? 'Hardware UI' : 'Simple UI'}
              </span>
            </button>
          }
        />

        {/* Sample Controls — hardware or simple */}
        <div className="synth-editor-content overflow-y-auto p-4">
          {uiMode === 'hardware' ? (
            /* Detect bit depth: use PT2 for 8-bit, FT2 for 16-bit/default */
            (instrument.metadata?.modPlayback?.usePeriodPlayback &&
             !instrument.metadata?.originalEnvelope &&
             !instrument.metadata?.panningEnvelope &&
             !instrument.metadata?.autoVibrato) ? (
              <Suspense fallback={<LoadingControls />}><PT2Hardware instrument={instrument} onChange={handleChange} /></Suspense>
            ) : (
              <Suspense fallback={<LoadingControls />}><FT2Hardware instrument={instrument} onChange={handleChange} /></Suspense>
            )
          ) : (
            <Suspense fallback={<LoadingControls />}>
              <SampleControls
                instrument={instrument}
                onChange={handleChange}
              />
            </Suspense>
          )}
        </div>
      </div>
    );
  }

  // ============================================================================
  // DUB SIREN EDITOR
  // ============================================================================
  if (editorMode === 'dubsiren') {
    const dubSirenConfig = deepMerge(DEFAULT_DUB_SIREN, instrument.dubSiren || {});

    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
        {renderDubSirenHeader()}
        <Suspense fallback={<LoadingControls />}>
          <DubSirenControls
            config={dubSirenConfig}
            instrumentId={instrument.id}
            onChange={handleDubSirenChange}
          />
        </Suspense>
      </div>
    );
  }

  // ============================================================================
  // SOUNDMON II EDITOR
  // ============================================================================
  if (editorMode === 'soundmon') {
    const soundMonConfig = deepMerge(DEFAULT_SOUNDMON, instrument.soundMon || {});
    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#000e1a] to-[#000508]">
        <EditorHeader
          instrument={instrument}
          onChange={handleChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
        />
        <Suspense fallback={<LoadingControls />}>
          <SoundMonControls
            config={soundMonConfig}
            onChange={handleSoundMonChange}
          />
        </Suspense>
      </div>
    );
  }

  // ============================================================================
  // SIDMON II EDITOR
  // ============================================================================
  if (editorMode === 'sidmon') {
    const sidMonConfig = deepMerge(DEFAULT_SIDMON, instrument.sidMon || {});
    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1a0010] to-[#080005]">
        <EditorHeader
          instrument={instrument}
          onChange={handleChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
        />
        <Suspense fallback={<LoadingControls />}>
          <SidMonControls
            config={sidMonConfig}
            onChange={handleSidMonChange}
          />
        </Suspense>
      </div>
    );
  }

  // ============================================================================
  // DIGITAL MUGICIAN EDITOR
  // ============================================================================
  if (editorMode === 'digmug') {
    const digMugConfig = deepMerge(DEFAULT_DIGMUG, instrument.digMug || {});
    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#0a1400] to-[#040800]">
        <EditorHeader
          instrument={instrument}
          onChange={handleChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
        />
        <Suspense fallback={<LoadingControls />}>
          <DigMugControls
            config={digMugConfig}
            onChange={handleDigMugChange}
          />
        </Suspense>
      </div>
    );
  }

  // ============================================================================
  // FUTURE COMPOSER EDITOR
  // ============================================================================
  if (editorMode === 'fc') {
    const fcConfig = deepMerge(DEFAULT_FC, instrument.fc || {});
    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1a1500] to-[#080600]">
        <EditorHeader
          instrument={instrument}
          onChange={handleChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
        />
        <Suspense fallback={<LoadingControls />}>
          <FCControls
            config={fcConfig}
            onChange={handleFCChange}
          />
        </Suspense>
      </div>
    );
  }

  // ============================================================================
  // FRED EDITOR
  // ============================================================================
  if (editorMode === 'fred') {
    const fredConfig = deepMerge(DEFAULT_FRED, instrument.fred || {});
    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1a0e00] to-[#080500]">
        <EditorHeader
          instrument={instrument}
          onChange={handleChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
        />
        <Suspense fallback={<LoadingControls />}>
          <FredControls
            config={fredConfig}
            onChange={handleFredChange}
          />
        </Suspense>
      </div>
    );
  }

  // ============================================================================
  // TFMX EDITOR (read-only viewer)
  // ============================================================================
  if (editorMode === 'tfmx') {
    const tfmxConfig = instrument.tfmx || DEFAULT_TFMX;
    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1a0800] to-[#080300]">
        <EditorHeader
          instrument={instrument}
          onChange={handleChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
        />
        <Suspense fallback={<LoadingControls />}>
          <TFMXControls config={tfmxConfig} />
        </Suspense>
      </div>
    );
  }

  // ============================================================================
  // OCTAMED SYNTH EDITOR
  // ============================================================================
  if (editorMode === 'octamed') {
    const octaMEDConfig = { ...DEFAULT_OCTAMED, ...(instrument.octamed || {}) };
    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#000a1a] to-[#000408]">
        <EditorHeader
          instrument={instrument}
          onChange={handleChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
        />
        <Suspense fallback={<LoadingControls />}>
          <OctaMEDControls
            config={octaMEDConfig}
            onChange={handleOctaMEDChange}
          />
        </Suspense>
      </div>
    );
  }

  // ============================================================================
  // SIDMON 1.0 EDITOR
  // ============================================================================
  if (editorMode === 'sidmon1') {
    const sidMon1Config = { ...DEFAULT_SIDMON1, ...(instrument.sidmon1 || {}) };
    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1a0018] to-[#080008]">
        <EditorHeader
          instrument={instrument}
          onChange={handleChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
        />
        <Suspense fallback={<LoadingControls />}>
          <SidMon1Controls
            config={sidMon1Config}
            onChange={handleSidMon1Change}
          />
        </Suspense>
      </div>
    );
  }

  // ============================================================================
  // HIPPEL COSO EDITOR
  // ============================================================================
  if (editorMode === 'hippelcoso') {
    const hippelCoSoConfig = { ...DEFAULT_HIPPEL_COSO, ...(instrument.hippelCoso || {}) };
    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#001a0a] to-[#000805]">
        <EditorHeader
          instrument={instrument}
          onChange={handleChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
        />
        <Suspense fallback={<LoadingControls />}>
          <HippelCoSoControls
            config={hippelCoSoConfig}
            onChange={handleHippelCoSoChange}
          />
        </Suspense>
      </div>
    );
  }

  // ============================================================================
  // ROB HUBBARD EDITOR
  // ============================================================================
  if (editorMode === 'robhubbard') {
    const robHubbardConfig = { ...DEFAULT_ROB_HUBBARD, ...(instrument.robHubbard || {}) };
    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1a0a00] to-[#080400]">
        <EditorHeader
          instrument={instrument}
          onChange={handleChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
        />
        <Suspense fallback={<LoadingControls />}>
          <RobHubbardControls
            config={robHubbardConfig}
            onChange={handleRobHubbardChange}
          />
        </Suspense>
      </div>
    );
  }

  // ============================================================================
  // DAVID WHITTAKER EDITOR
  // ============================================================================
  if (editorMode === 'davidwhittaker') {
    const davidWhittakerConfig = { ...DEFAULT_DAVID_WHITTAKER, ...(instrument.davidWhittaker || {}) };
    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#0a0a1a] to-[#040408]">
        <EditorHeader
          instrument={instrument}
          onChange={handleChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
        />
        <Suspense fallback={<LoadingControls />}>
          <DavidWhittakerControls
            config={davidWhittakerConfig}
            onChange={handleDavidWhittakerChange}
          />
        </Suspense>
      </div>
    );
  }

  // ============================================================================
  // MUSICLINE EDITOR WAVEFORM SYNTH EDITOR
  // ============================================================================
  if (editorMode === 'musicline') {
    const mlDisplayType = instrument.metadata?.displayType ?? 'MusicLine Synth';
    return (
      <div className="synth-editor-container bg-[#060608]">
        <EditorHeader
          instrument={instrument}
          onChange={handleChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
          customHeader={
            <div className="synth-editor-header px-4 py-3 bg-[#0a0a12] border-b border-[#1e1e2e]">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-[#1a1a30]">
                  <Music size={20} className="text-[#8080ff]" />
                </div>
                <div>
                  <h2 className="text-base font-bold tracking-wide text-[#a0a0ff]">MusicLine Editor</h2>
                  <p className="text-[10px] uppercase tracking-widest text-[#4a4a6a]">{mlDisplayType} · Single-cycle waveform</p>
                </div>
              </div>
            </div>
          }
        />
        <Suspense fallback={<LoadingControls />}>
          <MusicLineControls instrument={instrument} onChange={handleChange} />
        </Suspense>
      </div>
    );
  }

  // ============================================================================
  // HIVELY TRACKER EDITOR
  // ============================================================================
  if (editorMode === 'hively') {
    const hivelyConfig = deepMerge(DEFAULT_HIVELY, instrument.hively || {});

    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#0a1a12] to-[#050f08]">
        <EditorHeader
          instrument={instrument}
          onChange={handleChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
          customHeaderControls={
            <button
              className={`px-2 py-1 text-xs rounded flex items-center gap-1 ${
                uiMode === 'hardware'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
              onClick={() => setUIMode(uiMode === 'simple' ? 'hardware' : 'simple')}
              title={uiMode === 'hardware' ? 'Switch to Simple Controls' : 'Switch to Hardware UI'}
            >
              {uiMode === 'hardware' ? <Cpu size={14} /> : <Monitor size={14} />}
              <span className="hidden sm:inline">
                {uiMode === 'hardware' ? 'Hardware UI' : 'Simple UI'}
              </span>
            </button>
          }
        />
        {uiMode === 'hardware' ? (
          <Suspense fallback={<LoadingControls />}>
            <HivelyHardware
              config={hivelyConfig}
              onChange={handleHivelyHardwareChange}
            />
          </Suspense>
        ) : (
          <Suspense fallback={<LoadingControls />}>
            <HivelyControls
              config={hivelyConfig}
              instrumentId={instrument.id}
              onChange={handleHivelyChange}
            />
          </Suspense>
        )}
      </div>
    );
  }

  // ============================================================================
  // SPACE LASER EDITOR
  // ============================================================================
  if (editorMode === 'spacelaser') {
    const spaceLaserConfig = deepMerge(DEFAULT_SPACE_LASER, instrument.spaceLaser || {});

    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
        {renderSpaceLaserHeader()}
        <Suspense fallback={<LoadingControls />}>
          <SpaceLaserControls
            config={spaceLaserConfig}
            onChange={handleSpaceLaserChange}
          />
        </Suspense>
      </div>
    );
  }

  // ============================================================================
  // V2 SYNTH EDITOR
  // ============================================================================
  if (editorMode === 'v2') {
    if (instrument.v2Speech || instrument.synthType === 'V2Speech') {
      const accentColor = isCyanTheme ? '#00ffff' : '#ffaa00';
      const headerBg = isCyanTheme
        ? 'bg-[#041010] border-b-2 border-cyan-500'
        : 'bg-gradient-to-r from-[#2a2a2a] to-[#1a1a1a] border-b-4 border-[#ffaa00]';

      const handleDisableSpeech = () => {
        handleChange({ v2Speech: undefined });
      };

      return (
        <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
          <EditorHeader
            instrument={instrument}
            onChange={handleChange}
            vizMode={vizMode}
            onVizModeChange={setVizMode}
            onBake={handleBake}
            onBakePro={handleBakePro}
            onUnbake={handleUnbake}
            isBaked={isBaked}
            isBaking={isBaking}
            customHeader={
              <div className={`synth-editor-header px-4 py-3 ${headerBg}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-gradient-to-br from-amber-500 to-amber-700 shadow-lg">
                      <Mic size={24} className="text-white" />
                    </div>
                    <div>
                      <h2 className="text-xl font-black tracking-tight" style={{ color: accentColor }}>V2 SPEECH</h2>
                      <p className={`text-[10px] uppercase tracking-widest ${isCyanTheme ? 'text-cyan-600' : 'text-gray-400'}`}>Lisa Engine / Ronan</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Mode Toggle: Switch to Synth */}
                    <button
                      onClick={handleDisableSpeech}
                      className="p-1.5 rounded transition-all flex items-center gap-1.5 px-2 bg-gray-800 text-text-muted hover:text-amber-400 hover:bg-amber-500/10 border border-gray-700"
                      title="Switch to Synth Mode"
                    >
                      <Music size={14} />
                      <span className="text-[10px] font-bold uppercase">Synth</span>
                    </button>

                    <button
                      onClick={() => handleChange({ isLive: !instrument.isLive })}
                      className={`p-1.5 rounded transition-all flex items-center gap-1.5 px-2 ${
                        instrument.isLive
                          ? 'bg-accent-success/20 text-accent-success ring-1 ring-accent-success/50 animate-pulse-glow'
                          : 'bg-gray-800 text-text-muted hover:text-text-secondary border border-gray-700'
                      }`}
                    >
                      <Radio size={14} />
                      <span className="text-[10px] font-bold uppercase">LIVE</span>
                    </button>

                    <PresetDropdown
                      synthType={instrument.synthType}
                      onChange={handleChange}
                    />
                  </div>
                </div>
              </div>
            }
          />
          <Suspense fallback={<LoadingControls />}>
            <V2SpeechControls
              config={deepMerge(DEFAULT_V2_SPEECH, instrument.v2Speech || {})}
              onChange={(updates) => handleChange({ v2Speech: { ...instrument.v2Speech!, ...updates } })}
            />
          </Suspense>
        </div>
      );
    }

    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
        {renderV2Header()}
        <Suspense fallback={<LoadingControls />}>
          <V2Controls
            config={deepMerge(DEFAULT_V2, instrument.v2 || {})}
            onChange={handleV2Change}
          />
        </Suspense>
      </div>
    );
  }

  // ============================================================================
  // SAM SPEECH EDITOR
  // ============================================================================
  if (editorMode === 'sam') {
    const accentColor = isCyanTheme ? '#00ffff' : '#ffcc33';
    const headerBg = isCyanTheme
      ? 'bg-[#041010] border-b-2 border-cyan-500'
      : 'bg-gradient-to-r from-[#2a2a2a] to-[#1a1a1a] border-b-4 border-[#ffcc33]';

    const samConfig = deepMerge(DEFAULT_SAM, instrument.sam || {});

    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
        <EditorHeader
          instrument={instrument}
          onChange={handleChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
          onBake={handleBake}
          onBakePro={handleBakePro}
          onUnbake={handleUnbake}
          isBaked={isBaked}
          isBaking={isBaking}
          customHeader={
            <div className={`synth-editor-header px-4 py-3 ${headerBg}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-amber-500 to-amber-700 shadow-lg text-white">
                    <MessageSquare size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-black tracking-tight" style={{ color: accentColor }}>SAM</h2>
                    <p className={`text-[10px] uppercase tracking-widest ${isCyanTheme ? 'text-cyan-600' : 'text-gray-400'}`}>Software Automatic Mouth</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleChange({ isLive: !instrument.isLive })}
                    className={`p-1.5 rounded transition-all flex items-center gap-1.5 px-2 ${
                      instrument.isLive
                        ? 'bg-accent-success/20 text-accent-success ring-1 ring-accent-success/50 animate-pulse-glow'
                        : 'bg-gray-800 text-text-muted hover:text-text-secondary border border-gray-700'
                    }`}
                  >
                    <Radio size={14} />
                    <span className="text-[10px] font-bold uppercase">LIVE</span>
                  </button>

                  <PresetDropdown
                    synthType={instrument.synthType}
                    onChange={handleChange}
                  />
                </div>
              </div>
            </div>
          }
        />
        <Suspense fallback={<LoadingControls />}>
          <SAMControls
            config={samConfig}
            onChange={(updates) => handleChange({ sam: { ...instrument.sam!, ...updates } })}
          />
        </Suspense>
      </div>
    );
  }
  if (editorMode === 'synare') {
    const synareConfig = deepMerge(DEFAULT_SYNARE, instrument.synare || {});

    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
        {renderSynareHeader()}
        <Suspense fallback={<LoadingControls />}>
          <SynareControls
            config={synareConfig}
            instrumentId={instrument.id}
            onChange={handleSynareChange}
          />
        </Suspense>
      </div>
    );
  }

  // ============================================================================
  // MAME CHIP SYNTH EDITOR (data-driven controls)
  // ============================================================================
  if (editorMode === 'mamechip') {
    // Get chip capabilities for this synth type
    const chipName = instrument.synthType.replace('MAME', '');
    const chipCaps = getChipCapabilities(chipName);
    const chipDef = getChipSynthDef(instrument.synthType);

    // Get/initialize macro data from instrument config
    const macros: MacroData[] = (instrument.parameters?.macros as MacroData[]) || [];

    const handleMacrosChange = (newMacros: MacroData[]) => {
      handleChange({
        parameters: {
          ...instrument.parameters,
          macros: newMacros,
        },
      });
    };

    // Get/initialize wavetable data from instrument config
    const wavetables = (instrument.parameters?.wavetables as WavetableData[]) || [];

    const handleWavetablesChange = (newWavetables: WavetableData[]) => {
      handleChange({
        parameters: {
          ...instrument.parameters,
          wavetables: newWavetables,
        },
      });
    };

    // Check if hardware UI is available for this synth type
    const hasHardware = hasHardwareUI(instrument.synthType);

    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
        <EditorHeader
          instrument={instrument}
          onChange={handleChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
          showHelpButton={false}
          customHeaderControls={
            hasHardware ? (
              <button
                onClick={() => setUIMode(uiMode === 'simple' ? 'hardware' : 'simple')}
                className={`p-1.5 rounded transition-all flex items-center gap-1.5 px-2 ${
                  uiMode === 'hardware'
                    ? 'bg-accent-primary/20 text-accent-primary ring-1 ring-accent-primary/50'
                    : 'bg-gray-800 text-text-muted hover:text-text-secondary border border-gray-700'
                }`}
                title={uiMode === 'hardware' ? 'Switch to Simple Controls' : 'Switch to Hardware UI'}
              >
                {uiMode === 'hardware' ? <Cpu size={14} /> : <Monitor size={14} />}
                <span className="text-[10px] font-bold uppercase">
                  {uiMode === 'hardware' ? 'Hardware UI' : 'Simple UI'}
                </span>
              </button>
            ) : undefined
          }
        />
        <div className="synth-editor-content overflow-y-auto p-4 space-y-4">
          {uiMode === 'hardware' && hasHardware ? (
            /* Hardware UI Mode */
            <HardwareUIWrapper
              synthType={instrument.synthType}
              parameters={(instrument.parameters || {}) as Record<string, number>}
              onParamChange={handleChipParamChange}
            />
          ) : (
            /* Simple Controls Mode */
            <>
              {/* Oscilloscope */}
              <Suspense fallback={<LoadingControls />}>
                <MAMEOscilloscope
                  instrumentId={instrument.id}
                  height={100}
                  color={chipDef?.color}
                />
              </Suspense>

              {/* Chip Parameters */}
              <Suspense fallback={<LoadingControls />}>
                <ChipSynthControls
                  synthType={instrument.synthType}
                  parameters={(instrument.parameters || {}) as Record<string, number | string>}
                  instrumentId={instrument.id}
                  onParamChange={handleChipParamChange}
                  onTextChange={handleChipTextChange}
                  onLoadPreset={handleChipPresetLoad}
                  onRomUpload={handleChipRomUpload}
                  onSpeak={handleChipSpeak}
                />
              </Suspense>

              {/* Macro Editor */}
              <Suspense fallback={<LoadingControls />}>
                <MAMEMacroEditor
                  instrumentId={instrument.id}
                  macros={macros}
                  onChange={handleMacrosChange}
                  chipCapabilities={{
                    hasWavetable: chipCaps.hasWavetable,
                    hasFM: chipCaps.hasFM,
                    hasNoise: chipCaps.hasNoise,
                    hasPanning: chipCaps.hasPanning,
                  }}
                />
              </Suspense>

              {/* Wavetable Editor (for chips that support it) */}
              {chipCaps.hasWavetable && (
                <div className="rounded-lg overflow-hidden border border-dark-border">
                  <div className="px-3 py-2 bg-dark-surface border-b border-dark-border">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                      Wavetables
                    </span>
                  </div>
                  <div className="p-2">
                    <WavetableListEditor
                      wavetables={wavetables.length > 0 ? wavetables : [{ id: 0, data: new Array(32).fill(15), len: 32, max: 31 }]}
                      onChange={handleWavetablesChange}
                      maxWavetables={16}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // ============================================================================
  // MAME SYNTH EDITOR
  // ============================================================================
  if (editorMode === 'mame') {
    const defaultMame = instrument.synthType === 'MAMEDOC' ? DEFAULT_MAME_DOC : DEFAULT_MAME_VFX;
    const mameConfig = deepMerge(defaultMame, instrument.mame || {});

    const mameHandle = getToneEngine().getMAMESynthHandle(instrument.id);

    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
        {/* Use common header with visualization */}
        <EditorHeader
          instrument={instrument}
          onChange={handleChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
          showHelpButton={false}
        />

        {/* MAME Controls */}
        <div className="synth-editor-content overflow-y-auto p-4">
          <Suspense fallback={<LoadingControls />}>
            <MAMEControls
              config={mameConfig}
              handle={mameHandle}
              onChange={handleMAMEChange}
            />
          </Suspense>
        </div>
      </div>
    );
  }

  // ============================================================================
  // DEXED (DX7) EDITOR
  // ============================================================================
  if (editorMode === 'dexed') {
    const dexedConfig = deepMerge(DEFAULT_DEXED, instrument.dexed || {});

    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
        {/* Use common header with visualization */}
        <EditorHeader
          instrument={instrument}
          onChange={handleChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
          showHelpButton={false}
          onBake={handleBake}
          onBakePro={handleBakePro}
          onUnbake={handleUnbake}
          isBaked={isBaked}
          isBaking={isBaking}
        />

        {/* Dexed Controls */}
        <div className="synth-editor-content overflow-y-auto">
          <Suspense fallback={<LoadingControls />}>
            <DexedControls
              config={dexedConfig}
              onChange={handleDexedChange}
            />
          </Suspense>
        </div>
      </div>
    );
  }

  // ============================================================================
  // OBXd (OBERHEIM) EDITOR
  // ============================================================================
  if (editorMode === 'obxd') {
    const obxdConfig = deepMerge(DEFAULT_OBXD, instrument.obxd || {});

    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
        {/* Use common header with visualization */}
        <EditorHeader
          instrument={instrument}
          onChange={handleChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
          showHelpButton={false}
          onBake={handleBake}
          onBakePro={handleBakePro}
          onUnbake={handleUnbake}
          isBaked={isBaked}
          isBaking={isBaking}
        />

        {/* OBXd Controls */}
        <div className="synth-editor-content overflow-y-auto">
          <Suspense fallback={<LoadingControls />}>
            <OBXdControls
              config={obxdConfig}
              onChange={handleOBXdChange}
            />
          </Suspense>
        </div>
      </div>
    );
  }

  // ============================================================================
  // TONEWHEEL ORGAN EDITOR (custom drawbar UI with VSTBridge fallback)
  // ============================================================================
  if (editorMode === 'tonewheelOrgan') {
    const organAccentColor = isCyanTheme ? '#00ffff' : '#d4a017';
    const organHeaderBg = isCyanTheme
      ? 'bg-[#041010] border-b-2 border-cyan-500'
      : 'bg-gradient-to-r from-[#2a2a2a] to-[#1a1a1a] border-b-4 border-[#d4a017]';

    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
        <EditorHeader
          instrument={instrument}
          onChange={handleChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
          onBake={handleBake}
          onBakePro={handleBakePro}
          onUnbake={handleUnbake}
          isBaked={isBaked}
          isBaking={isBaking}
          customHeader={
            <div className={`synth-editor-header px-4 py-3 ${organHeaderBg}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-amber-600 to-amber-800 shadow-lg">
                    <Music size={24} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black tracking-tight" style={{ color: organAccentColor }}>TONEWHEEL ORGAN</h2>
                    <p className={`text-[10px] uppercase tracking-widest ${isCyanTheme ? 'text-cyan-600' : 'text-gray-400'}`}>Hammond-Style Drawbar Organ</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Native/Visual UI Toggle */}
                  <button
                    onClick={() => setVstUiMode(vstUiMode === 'custom' ? 'generic' : 'custom')}
                    className={`p-1.5 rounded transition-all flex items-center gap-1.5 px-2 ${
                      vstUiMode === 'custom'
                        ? 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/50'
                        : 'bg-gray-800 text-text-muted hover:text-text-secondary border border-gray-700'
                    }`}
                    title={vstUiMode === 'custom' ? 'Switch to Generic Controls' : 'Switch to Custom Controls'}
                  >
                    {vstUiMode === 'custom' ? <Music size={14} /> : <SlidersHorizontal size={14} />}
                    <span className="text-[10px] font-bold uppercase">
                      {vstUiMode === 'custom' ? 'Custom' : 'Generic'}
                    </span>
                  </button>

                  <button
                    onClick={() => handleChange({ isLive: !instrument.isLive })}
                    className={`p-1.5 rounded transition-all flex items-center gap-1.5 px-2 ${
                      instrument.isLive
                        ? 'bg-accent-success/20 text-accent-success ring-1 ring-accent-success/50 animate-pulse-glow'
                        : 'bg-gray-800 text-text-muted hover:text-text-secondary border border-gray-700'
                    }`}
                  >
                    <Radio size={14} />
                    <span className="text-[10px] font-bold uppercase">LIVE</span>
                  </button>

                  <PresetDropdown
                    synthType={instrument.synthType}
                    onChange={handleChange}
                  />
                </div>
              </div>
            </div>
          }
        />
        <div className="synth-editor-content overflow-y-auto">
          <Suspense fallback={<LoadingControls />}>
            {vstUiMode === 'custom' ? (
              <TonewheelOrganControls
                instrument={instrument}
                onChange={handleChange}
              />
            ) : (
              <VSTBridgePanel
                instrument={instrument}
                onChange={handleChange}
              />
            )}
          </Suspense>
        </div>
      </div>
    );
  }

  // ============================================================================
  // MELODICA EDITOR (custom reed instrument UI with VSTBridge fallback)
  // ============================================================================
  if (editorMode === 'melodica') {
    const melodicaAccentColor = isCyanTheme ? '#00ffff' : '#2dd4bf';
    const melodicaHeaderBg = isCyanTheme
      ? 'bg-[#041010] border-b-2 border-cyan-500'
      : 'bg-gradient-to-r from-[#2a2a2a] to-[#1a1a1a] border-b-4 border-[#2dd4bf]';

    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
        <EditorHeader
          instrument={instrument}
          onChange={handleChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
          onBake={handleBake}
          onBakePro={handleBakePro}
          onUnbake={handleUnbake}
          isBaked={isBaked}
          isBaking={isBaking}
          customHeader={
            <div className={`synth-editor-header px-4 py-3 ${melodicaHeaderBg}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-teal-500 to-teal-700 shadow-lg">
                    <Music size={24} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black tracking-tight" style={{ color: melodicaAccentColor }}>MELODICA</h2>
                    <p className={`text-[10px] uppercase tracking-widest ${isCyanTheme ? 'text-cyan-600' : 'text-gray-400'}`}>Reed Instrument Physical Model</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Native/Visual UI Toggle */}
                  <button
                    onClick={() => setVstUiMode(vstUiMode === 'custom' ? 'generic' : 'custom')}
                    className={`p-1.5 rounded transition-all flex items-center gap-1.5 px-2 ${
                      vstUiMode === 'custom'
                        ? 'bg-teal-500/20 text-teal-400 ring-1 ring-teal-500/50'
                        : 'bg-gray-800 text-text-muted hover:text-text-secondary border border-gray-700'
                    }`}
                    title={vstUiMode === 'custom' ? 'Switch to Generic Controls' : 'Switch to Custom Controls'}
                  >
                    {vstUiMode === 'custom' ? <Music size={14} /> : <SlidersHorizontal size={14} />}
                    <span className="text-[10px] font-bold uppercase">
                      {vstUiMode === 'custom' ? 'Custom' : 'Generic'}
                    </span>
                  </button>

                  <button
                    onClick={() => handleChange({ isLive: !instrument.isLive })}
                    className={`p-1.5 rounded transition-all flex items-center gap-1.5 px-2 ${
                      instrument.isLive
                        ? 'bg-accent-success/20 text-accent-success ring-1 ring-accent-success/50 animate-pulse-glow'
                        : 'bg-gray-800 text-text-muted hover:text-text-secondary border border-gray-700'
                    }`}
                  >
                    <Radio size={14} />
                    <span className="text-[10px] font-bold uppercase">LIVE</span>
                  </button>

                  <PresetDropdown
                    synthType={instrument.synthType}
                    onChange={handleChange}
                  />
                </div>
              </div>
            </div>
          }
        />
        <div className="synth-editor-content overflow-y-auto">
          <Suspense fallback={<LoadingControls />}>
            {vstUiMode === 'custom' ? (
              <MelodicaControls
                instrument={instrument}
                onChange={handleChange}
              />
            ) : (
              <VSTBridgePanel
                instrument={instrument}
                onChange={handleChange}
              />
            )}
          </Suspense>
        </div>
      </div>
    );
  }

  // ============================================================================
  // VITAL EDITOR (custom tabbed UI with VSTBridge fallback)
  // ============================================================================
  if (editorMode === 'vital') {
    const vitalAccentColor = isCyanTheme ? '#00ffff' : '#b84eff';
    const vitalHeaderBg = isCyanTheme
      ? 'bg-[#041010] border-b-2 border-cyan-500'
      : 'bg-gradient-to-r from-[#2a2a2a] to-[#1a1a1a] border-b-4 border-[#b84eff]';

    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
        <EditorHeader
          instrument={instrument}
          onChange={handleChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
          onBake={handleBake}
          onBakePro={handleBakePro}
          onUnbake={handleUnbake}
          isBaked={isBaked}
          isBaking={isBaking}
          customHeader={
            <div className={`synth-editor-header px-4 py-3 ${vitalHeaderBg}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-purple-700 shadow-lg">
                    <Music size={24} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black tracking-tight" style={{ color: vitalAccentColor }}>VITAL</h2>
                    <p className={`text-[10px] uppercase tracking-widest ${isCyanTheme ? 'text-cyan-600' : 'text-gray-400'}`}>Spectral Wavetable Synth</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setVstUiMode(vstUiMode === 'custom' ? 'generic' : 'custom')}
                    className={`p-1.5 rounded transition-all flex items-center gap-1.5 px-2 ${
                      vstUiMode === 'custom'
                        ? 'bg-purple-500/20 text-purple-400 ring-1 ring-purple-500/50'
                        : 'bg-gray-800 text-text-muted hover:text-text-secondary border border-gray-700'
                    }`}
                    title={vstUiMode === 'custom' ? 'Switch to Generic Controls' : 'Switch to Custom Controls'}
                  >
                    {vstUiMode === 'custom' ? <Music size={14} /> : <SlidersHorizontal size={14} />}
                    <span className="text-[10px] font-bold uppercase">
                      {vstUiMode === 'custom' ? 'Custom' : 'Generic'}
                    </span>
                  </button>

                  <button
                    onClick={() => handleChange({ isLive: !instrument.isLive })}
                    className={`p-1.5 rounded transition-all flex items-center gap-1.5 px-2 ${
                      instrument.isLive
                        ? 'bg-accent-success/20 text-accent-success ring-1 ring-accent-success/50 animate-pulse-glow'
                        : 'bg-gray-800 text-text-muted hover:text-text-secondary border border-gray-700'
                    }`}
                  >
                    <Radio size={14} />
                    <span className="text-[10px] font-bold uppercase">LIVE</span>
                  </button>

                  <PresetDropdown
                    synthType={instrument.synthType}
                    onChange={handleChange}
                  />
                </div>
              </div>
            </div>
          }
        />
        <div className="synth-editor-content overflow-y-auto">
          <Suspense fallback={<LoadingControls />}>
            {vstUiMode === 'custom' ? (
              <VitalControls
                instrument={instrument}
                onChange={handleChange}
              />
            ) : (
              <VSTBridgePanel
                instrument={instrument}
                onChange={handleChange}
              />
            )}
          </Suspense>
        </div>
      </div>
    );
  }

  // ============================================================================
  // ODIN2 EDITOR (custom panel UI with VSTBridge fallback)
  // ============================================================================
  if (editorMode === 'odin2') {
    const odinAccentColor = isCyanTheme ? '#00ffff' : '#4a9eff';
    const odinHeaderBg = isCyanTheme
      ? 'bg-[#041010] border-b-2 border-cyan-500'
      : 'bg-gradient-to-r from-[#2a2a2a] to-[#1a1a1a] border-b-4 border-[#4a9eff]';

    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
        <EditorHeader
          instrument={instrument}
          onChange={handleChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
          onBake={handleBake}
          onBakePro={handleBakePro}
          onUnbake={handleUnbake}
          isBaked={isBaked}
          isBaking={isBaking}
          customHeader={
            <div className={`synth-editor-header px-4 py-3 ${odinHeaderBg}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 shadow-lg">
                    <Music size={24} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black tracking-tight" style={{ color: odinAccentColor }}>ODIN2</h2>
                    <p className={`text-[10px] uppercase tracking-widest ${isCyanTheme ? 'text-cyan-600' : 'text-gray-400'}`}>Semi-Modular Hybrid Synth</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setVstUiMode(vstUiMode === 'custom' ? 'generic' : 'custom')}
                    className={`p-1.5 rounded transition-all flex items-center gap-1.5 px-2 ${
                      vstUiMode === 'custom'
                        ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/50'
                        : 'bg-gray-800 text-text-muted hover:text-text-secondary border border-gray-700'
                    }`}
                    title={vstUiMode === 'custom' ? 'Switch to Generic Controls' : 'Switch to Custom Controls'}
                  >
                    {vstUiMode === 'custom' ? <Music size={14} /> : <SlidersHorizontal size={14} />}
                    <span className="text-[10px] font-bold uppercase">
                      {vstUiMode === 'custom' ? 'Custom' : 'Generic'}
                    </span>
                  </button>

                  <button
                    onClick={() => handleChange({ isLive: !instrument.isLive })}
                    className={`p-1.5 rounded transition-all flex items-center gap-1.5 px-2 ${
                      instrument.isLive
                        ? 'bg-accent-success/20 text-accent-success ring-1 ring-accent-success/50 animate-pulse-glow'
                        : 'bg-gray-800 text-text-muted hover:text-text-secondary border border-gray-700'
                    }`}
                  >
                    <Radio size={14} />
                    <span className="text-[10px] font-bold uppercase">LIVE</span>
                  </button>

                  <PresetDropdown
                    synthType={instrument.synthType}
                    onChange={handleChange}
                  />
                </div>
              </div>
            </div>
          }
        />
        <div className="synth-editor-content overflow-y-auto">
          <Suspense fallback={<LoadingControls />}>
            {vstUiMode === 'custom' ? (
              <Odin2Controls
                instrument={instrument}
                onChange={handleChange}
              />
            ) : (
              <VSTBridgePanel
                instrument={instrument}
                onChange={handleChange}
              />
            )}
          </Suspense>
        </div>
      </div>
    );
  }

  // ============================================================================
  // SURGE XT EDITOR (custom scene-based UI with VSTBridge fallback)
  // ============================================================================
  if (editorMode === 'surge') {
    const surgeAccentColor = isCyanTheme ? '#00ffff' : '#ff8c00';
    const surgeHeaderBg = isCyanTheme
      ? 'bg-[#041010] border-b-2 border-cyan-500'
      : 'bg-gradient-to-r from-[#2a2a2a] to-[#1a1a1a] border-b-4 border-[#ff8c00]';

    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
        <EditorHeader
          instrument={instrument}
          onChange={handleChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
          onBake={handleBake}
          onBakePro={handleBakePro}
          onUnbake={handleUnbake}
          isBaked={isBaked}
          isBaking={isBaking}
          customHeader={
            <div className={`synth-editor-header px-4 py-3 ${surgeHeaderBg}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-orange-500 to-orange-700 shadow-lg">
                    <Music size={24} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black tracking-tight" style={{ color: surgeAccentColor }}>SURGE XT</h2>
                    <p className={`text-[10px] uppercase tracking-widest ${isCyanTheme ? 'text-cyan-600' : 'text-gray-400'}`}>Hybrid Synthesizer</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setVstUiMode(vstUiMode === 'custom' ? 'generic' : 'custom')}
                    className={`p-1.5 rounded transition-all flex items-center gap-1.5 px-2 ${
                      vstUiMode === 'custom'
                        ? 'bg-orange-500/20 text-orange-400 ring-1 ring-orange-500/50'
                        : 'bg-gray-800 text-text-muted hover:text-text-secondary border border-gray-700'
                    }`}
                    title={vstUiMode === 'custom' ? 'Switch to Generic Controls' : 'Switch to Custom Controls'}
                  >
                    {vstUiMode === 'custom' ? <Music size={14} /> : <SlidersHorizontal size={14} />}
                    <span className="text-[10px] font-bold uppercase">
                      {vstUiMode === 'custom' ? 'Custom' : 'Generic'}
                    </span>
                  </button>

                  <button
                    onClick={() => handleChange({ isLive: !instrument.isLive })}
                    className={`p-1.5 rounded transition-all flex items-center gap-1.5 px-2 ${
                      instrument.isLive
                        ? 'bg-accent-success/20 text-accent-success ring-1 ring-accent-success/50 animate-pulse-glow'
                        : 'bg-gray-800 text-text-muted hover:text-text-secondary border border-gray-700'
                    }`}
                  >
                    <Radio size={14} />
                    <span className="text-[10px] font-bold uppercase">LIVE</span>
                  </button>

                  <PresetDropdown
                    synthType={instrument.synthType}
                    onChange={handleChange}
                  />
                </div>
              </div>
            </div>
          }
        />
        <div className="synth-editor-content overflow-y-auto">
          <Suspense fallback={<LoadingControls />}>
            {vstUiMode === 'custom' ? (
              <SurgeControls
                instrument={instrument}
                onChange={handleChange}
              />
            ) : (
              <VSTBridgePanel
                instrument={instrument}
                onChange={handleChange}
              />
            )}
          </Suspense>
        </div>
      </div>
    );
  }

  // ============================================================================
  // VST BRIDGE EDITOR (auto-generated parameter knobs from WASM metadata)
  // ============================================================================
  if (editorMode === 'vstbridge') {
    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
        <EditorHeader
          instrument={instrument}
          onChange={handleChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
          showHelpButton={false}
          onBake={handleBake}
          onBakePro={handleBakePro}
          onUnbake={handleUnbake}
          isBaked={isBaked}
          isBaking={isBaking}
        />
        <div className="synth-editor-content overflow-y-auto">
          <Suspense fallback={<LoadingControls />}>
            <VSTBridgePanel
              instrument={instrument}
              onChange={handleChange}
            />
          </Suspense>
        </div>
      </div>
    );
  }

  // ============================================================================
  // WAM EDITOR (Web Audio Modules)
  // ============================================================================
  if (editorMode === 'wam') {
    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
        <EditorHeader
          instrument={instrument}
          onChange={handleChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
          showHelpButton={false}
        />
        <div className="synth-editor-content overflow-hidden">
          <Suspense fallback={<LoadingControls />}>
            <WAMControls
              instrument={instrument}
              onChange={handleChange}
            />
          </Suspense>
        </div>
      </div>
    );
  }

  // ============================================================================
  // HARMONIC SYNTH EDITOR
  // ============================================================================
  if (editorMode === 'harmonicsynth') {
    const harmonicConfig = deepMerge(DEFAULT_HARMONIC_SYNTH_VAL, instrument.harmonicSynth || {});

    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
        <EditorHeader
          instrument={instrument}
          onChange={handleChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
          showHelpButton={false}
          onBake={handleBake}
          onBakePro={handleBakePro}
          onUnbake={handleUnbake}
          isBaked={isBaked}
          isBaking={isBaking}
        />
        <div className="synth-editor-content overflow-y-auto p-3">
          <Suspense fallback={<LoadingControls />}>
            <HarmonicSynthControls
              config={harmonicConfig}
              instrumentId={instrument.id}
              onChange={(updates) => handleChange({ harmonicSynth: { ...harmonicConfig, ...updates } })}
            />
          </Suspense>
        </div>
      </div>
    );
  }

  // ============================================================================
  // MODULAR SYNTH EDITOR
  // ============================================================================
  if (editorMode === 'modular') {
    return (
      <div className="synth-editor-container flex flex-col h-full">
        <Suspense fallback={<LoadingControls />}>
          <ModularSynthControls
            config={instrument}
            onChange={handleChange}
          />
        </Suspense>
      </div>
    );
  }

  // ============================================================================
  // GENERIC SYNTH EDITOR (default)
  // ============================================================================
  const hasHardwareGeneric = hasHardwareUI(instrument.synthType);

  return (
    <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
      {/* Common header with visualization */}
      <EditorHeader
        instrument={instrument}
        onChange={handleChange}
        vizMode={vizMode}
        onVizModeChange={setVizMode}
        showHelpButton={!hasHardwareGeneric}
        showHelp={showHelp}
        onHelpToggle={() => setShowHelp(!showHelp)}
        onBake={handleBake}
        onBakePro={handleBakePro}
        onUnbake={handleUnbake}
        isBaked={isBaked}
        isBaking={isBaking}
        customHeaderControls={
          hasHardwareGeneric ? (
            <button
              onClick={() => setUIMode(uiMode === 'simple' ? 'hardware' : 'simple')}
              className={`p-1.5 rounded transition-all flex items-center gap-1.5 px-2 ${
                uiMode === 'hardware'
                  ? 'bg-accent-primary/20 text-accent-primary ring-1 ring-accent-primary/50'
                  : 'bg-gray-800 text-text-muted hover:text-text-secondary border border-gray-700'
              }`}
              title={uiMode === 'hardware' ? 'Switch to Simple Controls' : 'Switch to Hardware UI'}
            >
              {uiMode === 'hardware' ? <Cpu size={14} /> : <Monitor size={14} />}
              <span className="text-[10px] font-bold uppercase">
                {uiMode === 'hardware' ? 'Hardware UI' : 'Simple UI'}
              </span>
            </button>
          ) : undefined
        }
      />

      {uiMode === 'hardware' && hasHardwareGeneric ? (
        /* Hardware UI Mode */
        <div className="synth-editor-content overflow-y-auto p-4 space-y-4">
          <HardwareUIWrapper
            synthType={instrument.synthType}
            parameters={(instrument.parameters || {}) as Record<string, number>}
            onParamChange={(key, value) => {
              handleChange({
                parameters: {
                  ...instrument.parameters,
                  [key]: value,
                },
              });
            }}
          />
        </div>
      ) : (
        /* Simple Controls Mode */
        <>
          {/* Tab Bar */}
          <SynthEditorTabs
            activeTab={genericTab}
            onTabChange={setGenericTab}
            hiddenTabs={getHiddenTabs()}
          />

          {/* Tab Content */}
          <div className="synth-editor-content">
            <GenericTabContent
              instrument={instrument}
              onChange={handleChange}
              activeTab={genericTab}
            />
          </div>
        </>
      )}
    </div>
  );
};

// ============================================================================
// GENERIC TAB CONTENT (imported from VisualSynthEditor logic)
// ============================================================================

interface GenericTabContentProps {
  instrument: InstrumentConfig;
  onChange: (updates: Partial<InstrumentConfig>) => void;
  activeTab: SynthEditorTab;
}

/**
 * GenericTabContent - Renders the content for generic synth editor tabs
 *
 * This component contains the tab content that was previously in VisualSynthEditor.
 * It's been extracted to keep the UnifiedInstrumentEditor clean.
 */
const GenericTabContent: React.FC<GenericTabContentProps> = ({
  instrument,
  onChange,
  activeTab,
}) => {
  // We import the tab content rendering from a separate module
  // to avoid duplicating ~700 lines of tab content code
  return renderGenericTabContent(instrument, onChange, activeTab);
};

export default UnifiedInstrumentEditor;
