/**
 * SynthTypeDispatcher - Routes synth types to their specific editor panels
 *
 * Extracted from UnifiedInstrumentEditor to reduce file size.
 * Contains all synth-specific change handlers and the editor mode dispatch logic.
 */

import React, { useCallback, useState, lazy, Suspense } from 'react';
import type { InstrumentConfig, EffectConfig } from '@typedefs/instrument';
import {
  DEFAULT_FURNACE, DEFAULT_DUB_SIREN, DEFAULT_SPACE_LASER, DEFAULT_V2, DEFAULT_V2_SPEECH, DEFAULT_SYNARE,
  DEFAULT_MAME_VFX, DEFAULT_MAME_DOC, DEFAULT_DEXED, DEFAULT_OBXD, DEFAULT_SAM,
  DEFAULT_HARMONIC_SYNTH as DEFAULT_HARMONIC_SYNTH_VAL,
  DEFAULT_HIVELY,
  DEFAULT_JAMCRACKER,
  DEFAULT_SOUNDMON, DEFAULT_SIDMON, DEFAULT_DIGMUG, DEFAULT_FC, DEFAULT_DELTAMUSIC1, DEFAULT_DELTAMUSIC2, DEFAULT_FRED, DEFAULT_TFMX,
  DEFAULT_OCTAMED, DEFAULT_SIDMON1, DEFAULT_HIPPEL_COSO, DEFAULT_ROB_HUBBARD, DEFAULT_DAVID_WHITTAKER,
  DEFAULT_SONIC_ARRANGER,
  DEFAULT_SUPERCOLLIDER,
  DEFAULT_WOBBLE_BASS,
} from '@typedefs/instrument';
import { deepMerge } from '../../../lib/migration';
import { EditorHeader, type VizMode } from '../shared/EditorHeader';
import { VisualizerFrame } from '@components/visualization/VisualizerFrame';
import { PresetDropdown } from '../presets/PresetDropdown';
import { ChannelOscilloscope } from '../../visualization/ChannelOscilloscope';
import { getToneEngine } from '@engine/ToneEngine';
import { getChipSynthDef } from '@constants/chipParameters';
import { getChipCapabilities } from '@engine/mame/MAMEMacroTypes';
import { Radio, MessageSquare, Music, Mic, Monitor, Cpu, SlidersHorizontal } from 'lucide-react';
import { HardwareUIWrapper, hasHardwareUI } from '../hardware/HardwareUIWrapper';
import type { MacroData } from './MAMEMacroEditor';
import type { WavetableData } from './WavetableEditor';
import { isFurnaceFMType } from '../hardware/FurnaceFMHardware';
import { isFurnacePSGType } from '../hardware/FurnacePSGHardware';
import { isFurnaceWaveType } from '../hardware/FurnaceWaveHardware';
import { isFurnacePCMType } from '../hardware/FurnacePCMHardware';
import { isFurnaceInsEdType } from '../hardware/FurnaceInsEdHardware';
import { SpaceLaserHeader, V2Header, DubSirenHeader, SynareHeader, type SynthHeaderProps } from './InstrumentPresetManager';
import type { GearmulatorSynth } from '@engine/gearmulator/GearmulatorSynth';

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
const JamCrackerControls = lazy(() => import('../controls/JamCrackerControls').then(m => ({ default: m.JamCrackerControls })));
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
const DeltaMusic1Controls = lazy(() => import('../controls/DeltaMusic1Controls').then(m => ({ default: m.DeltaMusic1Controls })));
const DeltaMusic2Controls = lazy(() => import('../controls/DeltaMusic2Controls').then(m => ({ default: m.DeltaMusic2Controls })));
const SonicArrangerControls = lazy(() =>
  import('../controls/SonicArrangerControls').then(m => ({ default: m.SonicArrangerControls }))
);
const SuperColliderEditor = lazy(() => import('../SuperColliderEditor').then(m => ({ default: m.SuperColliderEditor })));
const GearmulatorEditor = lazy(() => import('../GearmulatorEditor').then(m => ({ default: m.GearmulatorEditor })));
const GearmulatorHardware = lazy(() => import('../gearmulator/GearmulatorHardware').then(m => ({ default: m.GearmulatorHardware })));
const WobbleBassControls = lazy(() => import('../controls/WobbleBassControls').then(m => ({ default: m.WobbleBassControls })));

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



// Types
export type EditorMode = 'generic' | 'tb303' | 'furnace' | 'buzzmachine' | 'sample' | 'dubsiren' | 'spacelaser' | 'v2' | 'sam' | 'synare' | 'mame' | 'mamechip' | 'dexed' | 'obxd' | 'wam' | 'tonewheelOrgan' | 'melodica' | 'vital' | 'odin2' | 'surge' | 'vstbridge' | 'harmonicsynth' | 'modular' | 'hively' | 'jamcracker' | 'soundmon' | 'sidmon' | 'digmug' | 'fc' | 'deltamusic1' | 'deltamusic2' | 'fred' | 'tfmx' | 'octamed' | 'sidmon1' | 'hippelcoso' | 'robhubbard' | 'davidwhittaker' | 'sonic-arranger' | 'musicline' | 'supercollider' | 'gearmulator' | 'wobblebass';

// ============================================================================
// GEARMULATOR EDITOR SECTION
// Shows hardware skin UI when ROM is loaded, with collapsible config panel.
// ============================================================================

/** Map synth type string to GM numeric type and skin name (if available) */
const GM_SYNTH_TYPE_MAP: Record<string, number> = {
  GearmulatorVirus: 0, GearmulatorVirusTI: 1, GearmulatorMicroQ: 2,
  GearmulatorXT: 3, GearmulatorNord: 4, GearmulatorJP8000: 5,
};

/** Map GM numeric synth type to skin name. Only Virus A/B/C has a skin currently. */
const GM_SKIN_MAP: Record<number, string> = {
  0: 'virus-trancy',
  // Future: 1: 'virus-ti', 2: 'microq', etc.
};

interface GearmulatorEditorSectionProps {
  instrument: InstrumentConfig;
  handleChange: (updates: Partial<InstrumentConfig>) => void;
  vizMode: VizMode;
  setVizMode: (mode: VizMode) => void;
}

const GearmulatorEditorSection: React.FC<GearmulatorEditorSectionProps> = ({
  instrument, handleChange, vizMode, setVizMode,
}) => {
  const [showConfig, setShowConfig] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);

  const gmConfig = instrument.gearmulator ?? {
    synthType: GM_SYNTH_TYPE_MAP[instrument.synthType] ?? 0,
  };

  const hasRom = !!gmConfig.romKey;
  const skinName = GM_SKIN_MAP[gmConfig.synthType];
  const showHardwareUI = hasRom && !!skinName;

  // Get the live GearmulatorSynth instance for sysex
  const handleSendSysex = useCallback((data: Uint8Array) => {
    try {
      const engine = getToneEngine();
      // Shared WASM synths use channelIndex=-1 (0xFFFF) in the composite key
      const key = engine.getInstrumentKey(instrument.id, -1);
      const synth = engine.instruments.get(key);
      if (synth && 'sendSysex' in synth) {
        (synth as GearmulatorSynth).sendSysex(data);
      }
    } catch {
      // Engine not initialized yet
    }
  }, [instrument.id]);

  // Measure container width for auto-scaling
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setContainerWidth(entry.contentRect.width);
        }
      });
      observer.observe(node);
      setContainerWidth(node.clientWidth);
      return () => observer.disconnect();
    }
  }, []);

  return (
    <div className="synth-editor-container bg-gradient-to-b from-[#1a1a2e] to-[#0a0a1a]">
      <EditorHeader
        instrument={instrument}
        onChange={handleChange}
        vizMode={vizMode}
        onVizModeChange={setVizMode}
      />
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Hardware skin UI (shown when ROM loaded and skin available) */}
        {showHardwareUI && (
          <div ref={containerRef} className="w-full">
            <Suspense fallback={<LoadingControls />}>
              <GearmulatorHardware
                skinName={skinName}
                part={gmConfig.channel ?? 0}
                onSendSysex={handleSendSysex}
                containerWidth={containerWidth}
              />
            </Suspense>
          </div>
        )}

        {/* Config panel: always shown when no skin, collapsible when skin is active */}
        {showHardwareUI && (
          <button
            className="w-full px-4 py-2 text-xs text-gray-400 hover:text-gray-200 bg-[#0d0d1a] border-t border-gray-800 flex items-center gap-2 transition-colors"
            onClick={() => setShowConfig(!showConfig)}
          >
            <span className={`transition-transform ${showConfig ? 'rotate-90' : ''}`}>&#9654;</span>
            ROM &amp; Configuration
          </button>
        )}

        {(!showHardwareUI || showConfig) && (
          <Suspense fallback={<LoadingControls />}>
            <GearmulatorEditor
              config={gmConfig}
              onChange={(gm) => handleChange({ gearmulator: gm })}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
};

export interface SynthTypeDispatcherProps {
  editorMode: EditorMode;
  instrument: InstrumentConfig;
  handleChange: (updates: Partial<InstrumentConfig>) => void;
  onChange: (updates: Partial<InstrumentConfig>) => void;
  vizMode: VizMode;
  setVizMode: (mode: VizMode) => void;
  uiMode: 'simple' | 'hardware';
  setUIMode: (mode: 'simple' | 'hardware') => void;
  vstUiMode: 'custom' | 'generic';
  setVstUiMode: (mode: 'custom' | 'generic') => void;
  isBaked: boolean;
  isBaking: boolean;
  handleBake: () => Promise<void>;
  handleBakePro: () => Promise<void>;
  handleUnbake: () => void;
  isCyanTheme: boolean;
}

export const SynthTypeDispatcher: React.FC<SynthTypeDispatcherProps> = ({
  editorMode, instrument, handleChange, onChange,
  vizMode, setVizMode, uiMode, setUIMode,
  vstUiMode, setVstUiMode,
  isBaked, isBaking, handleBake, handleBakePro, handleUnbake,
  isCyanTheme,
}) => {
  // Shared header props for branded header components
  const headerProps: SynthHeaderProps = {
    instrument, handleChange, vizMode,
    onVizModeChange: setVizMode,
    isBaked, isBaking,
    onBake: handleBake, onBakePro: handleBakePro, onUnbake: handleUnbake,
    isCyanTheme,
  };

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

  // Handle JamCracker config updates
  const handleJamCrackerChange = useCallback((updates: Partial<typeof instrument.jamCracker>) => {
    const current = instrument.jamCracker || DEFAULT_JAMCRACKER;
    handleChange({ jamCracker: { ...current, ...updates } });
  }, [instrument.jamCracker, handleChange]);

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

  // Handle DeltaMusic1 config updates
  const handleDeltaMusic1Change = useCallback((updates: Partial<typeof instrument.deltaMusic1>) => {
    const current = instrument.deltaMusic1 || DEFAULT_DELTAMUSIC1;
    handleChange({ deltaMusic1: { ...current, ...updates } });
  }, [instrument.deltaMusic1, handleChange]);

  // Handle DeltaMusic2 config updates
  const handleDeltaMusic2Change = useCallback((updates: Partial<typeof instrument.deltaMusic2>) => {
    const current = instrument.deltaMusic2 || DEFAULT_DELTAMUSIC2;
    handleChange({ deltaMusic2: { ...current, ...updates } });
  }, [instrument.deltaMusic2, handleChange]);

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

  // Handle Sonic Arranger config updates
  const handleSonicArrangerChange = useCallback((updates: Partial<typeof instrument.sonicArranger>) => {
    const current = instrument.sonicArranger || DEFAULT_SONIC_ARRANGER;
    const newConfig = { ...current, ...updates };
    handleChange({ sonicArranger: newConfig });

    // Real-time update — re-upload instrument config to running WASM synth
    try {
      const engine = getToneEngine();
      engine.updateSonicArrangerParameters(instrument.id, newConfig);
    } catch {
      // Ignored — engine may not be initialized
    }
  }, [instrument.sonicArranger, instrument.id, handleChange]);

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
        <div className="synth-editor-content p-4 flex items-center justify-center overflow-y-auto">
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
        <div className="synth-editor-content synth-editor-content--no-columns overflow-y-auto p-4">
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
        <DubSirenHeader {...headerProps} />
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
            uadeChipRam={instrument.uadeChipRam}
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
            uadeChipRam={instrument.uadeChipRam}
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
            uadeChipRam={instrument.uadeChipRam}
          />
        </Suspense>
      </div>
    );
  }

  // ============================================================================
  // SONIC ARRANGER EDITOR
  // ============================================================================
  if (editorMode === 'sonic-arranger') {
    const saConfig = deepMerge(DEFAULT_SONIC_ARRANGER, instrument.sonicArranger || {});
    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#0a0a14] to-[#040408]">
        <EditorHeader
          instrument={instrument}
          onChange={handleChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
        />
        <Suspense fallback={<LoadingControls />}>
          <SonicArrangerControls
            config={saConfig}
            onChange={handleSonicArrangerChange}
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
            uadeChipRam={instrument.uadeChipRam}
          />
        </Suspense>
      </div>
    );
  }

  // ============================================================================
  // DELTA MUSIC 1.0 EDITOR
  // ============================================================================
  if (editorMode === 'deltamusic1') {
    const dm1Config = deepMerge(DEFAULT_DELTAMUSIC1, instrument.deltaMusic1 || {});
    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1a0e00] to-[#080400]">
        <EditorHeader
          instrument={instrument}
          onChange={handleChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
        />
        <Suspense fallback={<LoadingControls />}>
          <DeltaMusic1Controls
            config={dm1Config}
            onChange={handleDeltaMusic1Change}
            uadeChipRam={instrument.uadeChipRam}
          />
        </Suspense>
      </div>
    );
  }

  // ============================================================================
  // DELTA MUSIC 2.0 EDITOR
  // ============================================================================
  if (editorMode === 'deltamusic2') {
    const dm2Config = deepMerge(DEFAULT_DELTAMUSIC2, instrument.deltaMusic2 || {});
    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1a0e00] to-[#080400]">
        <EditorHeader
          instrument={instrument}
          onChange={handleChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
        />
        <Suspense fallback={<LoadingControls />}>
          <DeltaMusic2Controls
            config={dm2Config}
            onChange={handleDeltaMusic2Change}
            uadeChipRam={instrument.uadeChipRam}
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
            uadeChipRam={instrument.uadeChipRam}
          />
        </Suspense>
      </div>
    );
  }

  // ============================================================================
  // TFMX EDITOR
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
          <TFMXControls
            config={tfmxConfig}
            onChange={(cfg) => handleChange({ tfmx: cfg })}
            uadeChipRam={instrument.uadeChipRam}
          />
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
            uadeChipRam={instrument.uadeChipRam}
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
            uadeChipRam={instrument.uadeChipRam}
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
            uadeChipRam={instrument.uadeChipRam}
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
            uadeChipRam={instrument.uadeChipRam}
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
            uadeChipRam={instrument.uadeChipRam}
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
  // JAMCRACKER EDITOR
  // ============================================================================
  if (editorMode === 'jamcracker') {
    const jcConfig = deepMerge(DEFAULT_JAMCRACKER, instrument.jamCracker || {});
    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#0a1a0a] to-[#050f05]">
        <EditorHeader
          instrument={instrument}
          onChange={handleChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
        />
        <Suspense fallback={<LoadingControls />}>
          <JamCrackerControls
            config={jcConfig}
            onChange={handleJamCrackerChange}
          />
        </Suspense>
      </div>
    );
  }

  // ============================================================================
  // SUPERCOLLIDER EDITOR
  // ============================================================================
  if (editorMode === 'supercollider') {
    const scConfig = instrument.superCollider ?? DEFAULT_SUPERCOLLIDER;
    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#0a0a0a] to-[#050505]" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <EditorHeader
          instrument={instrument}
          onChange={handleChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
        />
        <div className="flex-1 min-h-0 overflow-hidden p-2">
          <Suspense fallback={<LoadingControls />}>
            <SuperColliderEditor
              config={scConfig}
              onChange={(sc) => handleChange({ superCollider: sc })}
            />
          </Suspense>
        </div>
      </div>
    );
  }

  // ============================================================================
  // GEARMULATOR EDITOR
  // ============================================================================
  if (editorMode === 'gearmulator') {
    return (
      <GearmulatorEditorSection
        instrument={instrument}
        handleChange={handleChange}
        vizMode={vizMode}
        setVizMode={setVizMode}
      />
    );
  }

  // ============================================================================
  // WOBBLE BASS EDITOR
  // ============================================================================
  if (editorMode === 'wobblebass') {
    const wbConfig = instrument.wobbleBass ?? DEFAULT_WOBBLE_BASS;
    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1a1a2e] to-[#0a0a1a]">
        <EditorHeader
          instrument={instrument}
          onChange={handleChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
        />
        <div className="flex-1 min-h-0 overflow-y-auto">
          <Suspense fallback={<LoadingControls />}>
            <WobbleBassControls
              config={wbConfig}
              onChange={(wb) => handleChange({ wobbleBass: wb })}
            />
          </Suspense>
        </div>
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
        <SpaceLaserHeader {...headerProps} />
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
        <V2Header {...headerProps} />
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
        <SynareHeader {...headerProps} />
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

  return null;
};
