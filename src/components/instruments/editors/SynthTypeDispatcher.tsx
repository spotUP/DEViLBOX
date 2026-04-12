/**
 * SynthTypeDispatcher - Routes synth types to their specific editor panels
 *
 * Extracted from UnifiedInstrumentEditor to reduce file size.
 * Contains all synth-specific change handlers and the editor mode dispatch logic.
 */

import React, { useCallback, useEffect, useState, lazy, Suspense } from 'react';
import { useGTUltraStore } from '@stores/useGTUltraStore';
import type { InstrumentConfig, EffectConfig } from '@typedefs/instrument';
import type { GTUltraConfig } from '@typedefs/instrument/exotic';
import {
  DEFAULT_FURNACE, DEFAULT_DUB_SIREN, DEFAULT_SPACE_LASER, DEFAULT_V2, DEFAULT_V2_SPEECH, DEFAULT_SYNARE,
  DEFAULT_MAME_VFX, DEFAULT_MAME_DOC, DEFAULT_SAM,
  DEFAULT_HARMONIC_SYNTH as DEFAULT_HARMONIC_SYNTH_VAL,
  DEFAULT_HIVELY,
  DEFAULT_GTULTRA,
  DEFAULT_JAMCRACKER,
  DEFAULT_SF2,
  DEFAULT_SOUNDMON, DEFAULT_SIDMON, DEFAULT_RONKLAREN, DEFAULT_DIGMUG, DEFAULT_FC, DEFAULT_DELTAMUSIC1, DEFAULT_DELTAMUSIC2, DEFAULT_FRED, DEFAULT_TFMX,
  DEFAULT_OCTAMED, DEFAULT_SIDMON1, DEFAULT_HIPPEL_COSO, DEFAULT_ROB_HUBBARD, DEFAULT_STEVE_TURNER, DEFAULT_DAVID_WHITTAKER,
  DEFAULT_SONIC_ARRANGER,
  DEFAULT_INSTEREO2,
  DEFAULT_FUTUREPLAYER,
  DEFAULT_SYMPHONIE,
  DEFAULT_SUPERCOLLIDER,
  DEFAULT_WOBBLE_BASS,
  DEFAULT_PINK_TROMBONE,
  DEFAULT_DECTALK,
  DEFAULT_GRANULAR,
  DEFAULT_OPL3,
} from '@typedefs/instrument';
import { deepMerge } from '../../../lib/migration';
import { Knob } from '@components/controls/Knob';
import { CustomSelect } from '@components/common/CustomSelect';
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
import { DEFAULT_MDA_EPIANO, type MdaEPianoConfig } from '@engine/mda-epiano/MdaEPianoSynth';
import { DEFAULT_MDA_JX10, type MdaJX10Config } from '@engine/mda-jx10/MdaJX10Synth';
import { DEFAULT_MDA_DX10, type MdaDX10Config } from '@engine/mda-dx10/MdaDX10Synth';
import { DEFAULT_AMSYNTH, type AMSynthConfig } from '@engine/amsynth/AMSynthSynth';
import { DEFAULT_RAFFO, type RaffoSynthConfig } from '@engine/raffo/RaffoSynth';
import { DEFAULT_CALF_MONO, type CalfMonoConfig } from '@engine/calf-mono/CalfMonoSynth';
import { DEFAULT_SETBFREE, type SetBfreeConfig } from '@engine/setbfree/SetBfreeSynth';
import { DEFAULT_SYNTHV1, type SynthV1Config } from '@engine/synthv1/SynthV1Synth';
import { DEFAULT_MONIQUE, type MoniqueConfig } from '@engine/monique/MoniqueSynth';
import { DEFAULT_VL1, type VL1Config } from '@engine/vl1/VL1Synth';
import { DEFAULT_TAL_NOIZEMAKER, type TalNoizeMakerConfig } from '@engine/tal-noizemaker/TalNoizeMakerSynth';
import { DEFAULT_AEOLUS, type AeolusConfig } from '@engine/aeolus/AeolusSynth';
import { DEFAULT_FLUIDSYNTH, type FluidSynthConfig } from '@engine/fluidsynth/FluidSynthSynth';
import { DEFAULT_SFIZZ, type SfizzConfig } from '@engine/sfizz/SfizzSynth';
import { DEFAULT_ZYNADDSUBFX, type ZynAddSubFXConfig } from '@engine/zynaddsubfx/ZynAddSubFXSynth';
import { isFurnacePSGType } from '../hardware/FurnacePSGHardware';
import { isFurnaceWaveType } from '../hardware/FurnaceWaveHardware';
import { isFurnacePCMType } from '../hardware/FurnacePCMHardware';
import { isFurnaceInsEdType } from '../hardware/FurnaceInsEdHardware';
import { SpaceLaserHeader, V2Header, DubSirenHeader, SynareHeader, type SynthHeaderProps } from './InstrumentPresetManager';
import { DOMSynthPanel } from '../controls/DOMSynthPanel';
const LiveFilterCurve = lazy(() => import('../../visualization/LiveFilterCurve').then(m => ({ default: m.LiveFilterCurve })));
import { EnvelopeVisualization } from '@components/instruments/shared';
import { getSynthLayout } from '@/pixi/views/instruments/layouts';

// ============================================================================
// LAZY-LOADED CONTROL COMPONENTS
// These are loaded on-demand based on synthType to reduce initial bundle size
// ============================================================================

// Loading spinner for lazy components
const LoadingControls = () => (
  <div className="flex items-center justify-center py-8 text-text-secondary">
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
const GranularControls = lazy(() => import('../controls/GranularControls').then(m => ({ default: m.GranularControls })));
const V2Controls = lazy(() => import('../controls/V2Controls').then(m => ({ default: m.V2Controls })));
const V2SpeechControls = lazy(() => import('../controls/V2SpeechControls').then(m => ({ default: m.V2SpeechControls })));
const SAMControls = lazy(() => import('../controls/SAMControls').then(m => ({ default: m.SAMControls })));
const PinkTromboneControls = lazy(() => import('../controls/PinkTromboneControls').then(m => ({ default: m.PinkTromboneControls })));
const DECtalkControls = lazy(() => import('../controls/DECtalkControls').then(m => ({ default: m.DECtalkControls })));
const SynareControls = lazy(() => import('../controls/SynareControls').then(m => ({ default: m.SynareControls })));
const GeonkickControls = lazy(() => import('../controls/GeonkickControls').then(m => ({ default: m.GeonkickControls })));
const MAMEControls = lazy(() => import('../controls/MAMEControls').then(m => ({ default: m.MAMEControls })));
const ChipSynthControls = lazy(() => import('../controls/ChipSynthControls').then(m => ({ default: m.ChipSynthControls })));
const CMIControls = lazy(() => import('../controls/CMIControls').then(m => ({ default: m.CMIControls })));
const MdaEPianoControls = lazy(() => import('../controls/MdaEPianoControls').then(m => ({ default: m.MdaEPianoControls })));
const MdaJX10Controls = lazy(() => import('../controls/MdaJX10Controls').then(m => ({ default: m.MdaJX10Controls })));
const MdaDX10Controls = lazy(() => import('../controls/MdaDX10Controls').then(m => ({ default: m.MdaDX10Controls })));
const DX7Controls = lazy(() => import('../controls/DX7Controls').then(m => ({ default: m.DX7Controls })));
const AMSynthControls = lazy(() => import('../controls/AMSynthControls').then(m => ({ default: m.AMSynthControls })));
const RaffoSynthControls = lazy(() => import('../controls/RaffoSynthControls').then(m => ({ default: m.RaffoSynthControls })));
const CalfMonoControls = lazy(() => import('../controls/CalfMonoControls').then(m => ({ default: m.CalfMonoControls })));
const SetBfreeControls = lazy(() => import('../controls/SetBfreeControls').then(m => ({ default: m.SetBfreeControls })));
const SynthV1Controls = lazy(() => import('../controls/SynthV1Controls').then(m => ({ default: m.SynthV1Controls })));
const MoniqueControls = lazy(() => import('../controls/MoniqueControls').then(m => ({ default: m.MoniqueControls })));
const VL1Controls = lazy(() => import('../controls/VL1Controls').then(m => ({ default: m.VL1Controls })));
const MoniqueHardwareUI = lazy(() => import('../hardware/MoniqueHardwareUI'));
const AmsynthHardwareUI = lazy(() => import('../hardware/AmsynthHardwareUI'));
const TalNoizeMakerControls = lazy(() => import('../controls/TalNoizeMakerControls').then(m => ({ default: m.TalNoizeMakerControls })));
const AeolusControls = lazy(() => import('../controls/AeolusControls').then(m => ({ default: m.AeolusControls })));
const FluidSynthControls = lazy(() => import('../controls/FluidSynthControls').then(m => ({ default: m.FluidSynthControls })));
const SfizzControls = lazy(() => import('../controls/SfizzControls').then(m => ({ default: m.SfizzControls })));
const ZynAddSubFXControls = lazy(() => import('../controls/ZynAddSubFXControls').then(m => ({ default: m.ZynAddSubFXControls })));
const WAMControls = lazy(() => import('../controls/WAMControls').then(m => ({ default: m.WAMControls })));
const VSTBridgePanel = lazy(() => import('../controls/VSTBridgePanel').then(m => ({ default: m.VSTBridgePanel })));

const HarmonicSynthControls = lazy(() => import('../controls/HarmonicSynthControls').then(m => ({ default: m.HarmonicSynthControls })));
const ModularSynthControls = lazy(() => import('../synths/modular/ModularSynthControls').then(m => ({ default: m.ModularSynthControls })));
import { SunVoxModularEditor } from '../synths/modular/SunVoxModularEditor';
const TonewheelOrganControls = lazy(() => import('../controls/TonewheelOrganControls').then(m => ({ default: m.TonewheelOrganControls })));
const MelodicaControls = lazy(() => import('../controls/MelodicaControls').then(m => ({ default: m.MelodicaControls })));
const VitalControls = lazy(() => import('../controls/VitalControls').then(m => ({ default: m.VitalControls })));
const Odin2Controls = lazy(() => import('../controls/Odin2Controls').then(m => ({ default: m.Odin2Controls })));
const SurgeControls = lazy(() => import('../controls/SurgeControls').then(m => ({ default: m.SurgeControls })));
const HivelyControls = lazy(() => import('../controls/HivelyControls').then(m => ({ default: m.HivelyControls })));
const GTUltraControls = lazy(() => import('../controls/GTUltraControls').then(m => ({ default: m.GTUltraControls })));
const JamCrackerControls = lazy(() => import('../controls/JamCrackerControls').then(m => ({ default: m.JamCrackerControls })));
const SF2Controls = lazy(() => import('../controls/SF2Controls').then(m => ({ default: m.SF2Controls })));
const SoundMonControls = lazy(() => import('../controls/SoundMonControls').then(m => ({ default: m.SoundMonControls })));
const SidMonControls = lazy(() => import('../controls/SidMonControls').then(m => ({ default: m.SidMonControls })));
const RonKlarenControls = lazy(() => import('../controls/RonKlarenControls').then(m => ({ default: m.RonKlarenControls })));
const DigMugControls = lazy(() => import('../controls/DigMugControls').then(m => ({ default: m.DigMugControls })));
const FCControls = lazy(() => import('../controls/FCControls').then(m => ({ default: m.FCControls })));
const FredControls = lazy(() => import('../controls/FredControls').then(m => ({ default: m.FredControls })));
const TFMXControls = lazy(() => import('../controls/TFMXControls').then(m => ({ default: m.TFMXControls })));
const TFMXMacroEditor = lazy(() => import('../../tfmx/TFMXMacroEditor').then(m => ({ default: m.TFMXMacroEditor })));
const OctaMEDControls = lazy(() => import('../controls/OctaMEDControls').then(m => ({ default: m.OctaMEDControls })));
const SidMon1Controls = lazy(() => import('../controls/SidMon1Controls').then(m => ({ default: m.SidMon1Controls })));
const HippelCoSoControls = lazy(() => import('../controls/HippelCoSoControls').then(m => ({ default: m.HippelCoSoControls })));
const RobHubbardControls = lazy(() => import('../controls/RobHubbardControls').then(m => ({ default: m.RobHubbardControls })));
const SteveTurnerControls = lazy(() => import('../controls/SteveTurnerControls').then(m => ({ default: m.SteveTurnerControls })));
const DavidWhittakerControls = lazy(() => import('../controls/DavidWhittakerControls').then(m => ({ default: m.DavidWhittakerControls })));
const MusicLineControls = lazy(() => import('../controls/MusicLineControls').then(m => ({ default: m.MusicLineControls })));
const DeltaMusic1Controls = lazy(() => import('../controls/DeltaMusic1Controls').then(m => ({ default: m.DeltaMusic1Controls })));
const DeltaMusic2Controls = lazy(() => import('../controls/DeltaMusic2Controls').then(m => ({ default: m.DeltaMusic2Controls })));
const SonicArrangerControls = lazy(() =>
  import('../controls/SonicArrangerControls').then(m => ({ default: m.SonicArrangerControls }))
);
const InStereo2Controls = lazy(() =>
  import('../controls/InStereo2Controls').then(m => ({ default: m.InStereo2Controls }))
);
const SymphonieControls = lazy(() => import('../controls/SymphonieControls').then(m => ({ default: m.SymphonieControls })));
const SuperColliderEditor = lazy(() => import('../SuperColliderEditor').then(m => ({ default: m.SuperColliderEditor })));
const WobbleBassControls = lazy(() => import('../controls/WobbleBassControls').then(m => ({ default: m.WobbleBassControls })));
const StartrekkerAMControls = lazy(() => import('../controls/StartrekkerAMControls').then(m => ({ default: m.StartrekkerAMControls })));
const FuturePlayerControls = lazy(() => import('../controls/FuturePlayerControls').then(m => ({ default: m.FuturePlayerControls })));
const OPL3Controls = lazy(() => import('../controls/OPL3Controls').then(m => ({ default: m.OPL3Controls })));
const CheeseCutterControls = lazy(() => import('../controls/CheeseCutterControls').then(m => ({ default: m.CheeseCutterControls })));
const GTUltraUnifiedControls = lazy(() => import('../controls/GTUltraUnifiedControls').then(m => ({ default: m.GTUltraUnifiedControls })));

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
export type EditorMode = 'generic' | 'layout' | 'tb303' | 'furnace' | 'buzzmachine' | 'sample' | 'dubsiren' | 'spacelaser' | 'granular' | 'v2' | 'sam' | 'pinktrombone' | 'dectalk' | 'synare' | 'geonkick' | 'mame' | 'mamechip' | 'dexed' | 'obxd' | 'mdaEPiano' | 'mdaJX10' | 'mdaDX10' | 'toneAM' | 'raffo' | 'calfMono' | 'setbfree' | 'synthv1' | 'moniqueSynth' | 'vl1Synth' | 'talNoizeMaker' | 'aeolus' | 'fluidsynth' | 'sfizz' | 'zynaddsubfx' | 'wam' | 'tonewheelOrgan' | 'melodica' | 'vital' | 'odin2' | 'surge' | 'vstbridge' | 'harmonicsynth' | 'modular' | 'sunvox-modular' | 'hively' | 'gtultra' | 'jamcracker' | 'sidfactory2' | 'soundmon' | 'sidmon' | 'digmug' | 'fc' | 'deltamusic1' | 'deltamusic2' | 'fred' | 'tfmx' | 'octamed' | 'sidmon1' | 'hippelcoso' | 'robhubbard' | 'steveturner' | 'davidwhittaker' | 'sonic-arranger' | 'instereo2' | 'musicline' | 'supercollider' | 'wobblebass' | 'startrekker-am' | 'futureplayer' | 'symphonie' | 'xrns-synth' | 'sunvox-synth' | 'opl3' | 'ronklaren' | 'cheesecutter';

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
  const [sidViewMode, setSidViewMode] = useState<'original' | 'unified'>('original');

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

  // Handle GTUltra config updates — push to WASM engine too
  const handleGTUltraChange = useCallback((updates: Partial<GTUltraConfig>) => {
    const current = instrument.gtUltra || DEFAULT_GTULTRA;
    const newConfig = { ...current, ...updates };
    handleChange({ gtUltra: newConfig });

    // Push to WASM engine
    const engine = useGTUltraStore.getState().engine;
    if (engine) {
      const idx = instrument.id;
      if ('ad' in updates) engine.setInstrumentAD(idx, newConfig.ad);
      if ('sr' in updates) engine.setInstrumentSR(idx, newConfig.sr);
      if ('firstwave' in updates) engine.setInstrumentFirstwave(idx, newConfig.firstwave);
      if ('vibdelay' in updates) engine.setInstrumentVibdelay(idx, newConfig.vibdelay);
      if ('gatetimer' in updates) engine.setInstrumentGatetimer(idx, newConfig.gatetimer);
      if ('wavePtr' in updates) engine.setInstrumentTablePtr(idx, 0, newConfig.wavePtr);
      if ('pulsePtr' in updates) engine.setInstrumentTablePtr(idx, 1, newConfig.pulsePtr);
      if ('filterPtr' in updates) engine.setInstrumentTablePtr(idx, 2, newConfig.filterPtr);
      if ('speedPtr' in updates) engine.setInstrumentTablePtr(idx, 3, newConfig.speedPtr);
    }
  }, [instrument.gtUltra, instrument.id, handleChange]);

  // Handle JamCracker config updates
  /** Helper: update an Amiga synth config and push live to the running WASM engine */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateAmigaSynth = useCallback((configKey: string, current: any, updates: any) => {
    const newConfig = { ...current, ...updates };
    handleChange({ [configKey]: newConfig });
    try { getToneEngine().updateNativeSynthConfig(instrument.id, newConfig); } catch { /* engine not ready */ }
  }, [instrument.id, handleChange]);

  const handleJamCrackerChange = useCallback((updates: Partial<typeof instrument.jamCracker>) => {
    updateAmigaSynth('jamCracker', instrument.jamCracker || DEFAULT_JAMCRACKER, updates);
  }, [instrument.jamCracker, updateAmigaSynth]);

  const handleSF2Change = useCallback((updates: Partial<typeof instrument.sf2>) => {
    const current = instrument.sf2 || DEFAULT_SF2;
    handleChange({ sf2: { ...current, ...updates } });
  }, [instrument.sf2, handleChange]);

  const handleSoundMonChange = useCallback((updates: Partial<typeof instrument.soundMon>) => {
    updateAmigaSynth('soundMon', instrument.soundMon || DEFAULT_SOUNDMON, updates);
  }, [instrument.soundMon, updateAmigaSynth]);

  const handleSidMonChange = useCallback((updates: Partial<typeof instrument.sidMon>) => {
    updateAmigaSynth('sidMon', instrument.sidMon || DEFAULT_SIDMON, updates);
  }, [instrument.sidMon, updateAmigaSynth]);

  const handleRonKlarenChange = useCallback((updates: Partial<typeof instrument.ronKlaren>) => {
    updateAmigaSynth('ronKlaren', instrument.ronKlaren || DEFAULT_RONKLAREN, updates);
  }, [instrument.ronKlaren, updateAmigaSynth]);

  const handleDigMugChange = useCallback((updates: Partial<typeof instrument.digMug>) => {
    updateAmigaSynth('digMug', instrument.digMug || DEFAULT_DIGMUG, updates);
  }, [instrument.digMug, updateAmigaSynth]);

  const handleFCChange = useCallback((updates: Partial<typeof instrument.fc>) => {
    updateAmigaSynth('fc', instrument.fc || DEFAULT_FC, updates);
  }, [instrument.fc, updateAmigaSynth]);

  const handleDeltaMusic1Change = useCallback((updates: Partial<typeof instrument.deltaMusic1>) => {
    updateAmigaSynth('deltaMusic1', instrument.deltaMusic1 || DEFAULT_DELTAMUSIC1, updates);
  }, [instrument.deltaMusic1, updateAmigaSynth]);

  const handleFuturePlayerChange = useCallback((updates: Partial<typeof instrument.futurePlayer>) => {
    updateAmigaSynth('futurePlayer', instrument.futurePlayer || DEFAULT_FUTUREPLAYER, updates);
  }, [instrument.futurePlayer, updateAmigaSynth]);

  const handleDeltaMusic2Change = useCallback((updates: Partial<typeof instrument.deltaMusic2>) => {
    updateAmigaSynth('deltaMusic2', instrument.deltaMusic2 || DEFAULT_DELTAMUSIC2, updates);
  }, [instrument.deltaMusic2, updateAmigaSynth]);

  const handleFredChange = useCallback((updates: Partial<typeof instrument.fred>) => {
    updateAmigaSynth('fred', instrument.fred || DEFAULT_FRED, updates);
  }, [instrument.fred, updateAmigaSynth]);

  const handleOctaMEDChange = useCallback((updates: Partial<typeof instrument.octamed>) => {
    updateAmigaSynth('octamed', instrument.octamed || DEFAULT_OCTAMED, updates);
  }, [instrument.octamed, updateAmigaSynth]);

  const handleSidMon1Change = useCallback((updates: Partial<typeof instrument.sidmon1>) => {
    updateAmigaSynth('sidmon1', instrument.sidmon1 || DEFAULT_SIDMON1, updates);
  }, [instrument.sidmon1, updateAmigaSynth]);

  const handleHippelCoSoChange = useCallback((updates: Partial<typeof instrument.hippelCoso>) => {
    updateAmigaSynth('hippelCoso', instrument.hippelCoso || DEFAULT_HIPPEL_COSO, updates);
  }, [instrument.hippelCoso, updateAmigaSynth]);

  const handleRobHubbardChange = useCallback((updates: Partial<typeof instrument.robHubbard>) => {
    updateAmigaSynth('robHubbard', instrument.robHubbard || DEFAULT_ROB_HUBBARD, updates);
  }, [instrument.robHubbard, updateAmigaSynth]);

  const handleSteveTurnerChange = useCallback((updates: Partial<typeof instrument.steveTurner>) => {
    updateAmigaSynth('steveTurner', instrument.steveTurner || DEFAULT_STEVE_TURNER, updates);
  }, [instrument.steveTurner, updateAmigaSynth]);

  const handleDavidWhittakerChange = useCallback((updates: Partial<typeof instrument.davidWhittaker>) => {
    updateAmigaSynth('davidWhittaker', instrument.davidWhittaker || DEFAULT_DAVID_WHITTAKER, updates);
  }, [instrument.davidWhittaker, updateAmigaSynth]);

  const handleSonicArrangerChange = useCallback((updates: Partial<typeof instrument.sonicArranger>) => {
    updateAmigaSynth('sonicArranger', instrument.sonicArranger || DEFAULT_SONIC_ARRANGER, updates);
  }, [instrument.sonicArranger, instrument.id, handleChange]);

  const handleSymphonieChange = useCallback((updates: Partial<typeof instrument.symphonie>) => {
    updateAmigaSynth('symphonie', instrument.symphonie || DEFAULT_SYMPHONIE, updates);
  }, [instrument.symphonie, updateAmigaSynth]);

  // Handle Space Laser config updates
  const handleSpaceLaserChange = useCallback((updates: Partial<typeof instrument.spaceLaser>) => {
    const currentSpaceLaser = instrument.spaceLaser || DEFAULT_SPACE_LASER;
    handleChange({
      spaceLaser: { ...currentSpaceLaser, ...updates },
    });
  }, [instrument.spaceLaser, handleChange]);

  // Handle Granular config updates
  const handleGranularChange = useCallback((updates: Partial<typeof instrument.granular>) => {
    const currentGranular = instrument.granular || DEFAULT_GRANULAR;
    handleChange({
      granular: { ...currentGranular, ...updates },
    });
  }, [instrument.granular, handleChange]);

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

  // Handle MDA ePiano config updates
  const handleMdaEPianoChange = useCallback((updates: Partial<MdaEPianoConfig>) => {
    const currentConfig = instrument.mdaEPiano || DEFAULT_MDA_EPIANO;
    const newConfig = { ...currentConfig, ...updates };
    handleChange({ mdaEPiano: newConfig });
  }, [instrument.mdaEPiano, handleChange]);

  // Handle MDA JX-10 config updates
  const handleMdaJX10Change = useCallback((updates: Partial<MdaJX10Config>) => {
    const currentConfig = instrument.mdaJX10 || DEFAULT_MDA_JX10;
    const newConfig = { ...currentConfig, ...updates };
    handleChange({ mdaJX10: newConfig });
  }, [instrument.mdaJX10, handleChange]);

  // Handle MDA DX10 config updates
  const handleMdaDX10Change = useCallback((updates: Partial<MdaDX10Config>) => {
    const currentConfig = instrument.mdaDX10 || DEFAULT_MDA_DX10;
    const newConfig = { ...currentConfig, ...updates };
    handleChange({ mdaDX10: newConfig });
  }, [instrument.mdaDX10, handleChange]);

  // Handle ToneAM config updates
  const handleAMSynthChange = useCallback((updates: Partial<AMSynthConfig>) => {
    const currentConfig = instrument.amsynth || DEFAULT_AMSYNTH;
    const newConfig = { ...currentConfig, ...updates };
    handleChange({ amsynth: newConfig });
  }, [instrument.amsynth, handleChange]);

  // Handle Raffo Synth config updates
  const handleRaffoChange = useCallback((updates: Partial<RaffoSynthConfig>) => {
    const currentConfig = instrument.raffo || DEFAULT_RAFFO;
    const newConfig = { ...currentConfig, ...updates };
    handleChange({ raffo: newConfig });
  }, [instrument.raffo, handleChange]);

  // Handle Calf Monosynth config updates
  const handleCalfMonoChange = useCallback((updates: Partial<CalfMonoConfig>) => {
    const currentConfig = instrument.calfMono || DEFAULT_CALF_MONO;
    const newConfig = { ...currentConfig, ...updates };
    handleChange({ calfMono: newConfig });
  }, [instrument.calfMono, handleChange]);

  // Handle setBfree Hammond B3 config updates
  const handleSetBfreeChange = useCallback((updates: Partial<SetBfreeConfig>) => {
    const currentConfig = instrument.setbfree || DEFAULT_SETBFREE;
    const newConfig = { ...currentConfig, ...updates };
    handleChange({ setbfree: newConfig });
  }, [instrument.setbfree, handleChange]);

  // Handle SynthV1 config updates
  const handleSynthV1Change = useCallback((updates: Partial<SynthV1Config>) => {
    const currentConfig = instrument.synthv1 || DEFAULT_SYNTHV1;
    const newConfig = { ...currentConfig, ...updates };
    handleChange({ synthv1: newConfig });
  }, [instrument.synthv1, handleChange]);

  // Handle Monique config updates
  const handleMoniqueChange = useCallback((updates: Partial<MoniqueConfig>) => {
    const currentConfig = instrument.monique || DEFAULT_MONIQUE;
    const newConfig = { ...currentConfig, ...updates };
    handleChange({ monique: newConfig });
  }, [instrument.monique, handleChange]);

  // Handle VL1 config updates
  const handleVL1Change = useCallback((updates: Partial<VL1Config>) => {
    const currentConfig = instrument.vl1 || DEFAULT_VL1;
    const newConfig = { ...currentConfig, ...updates };
    handleChange({ vl1: newConfig });
  }, [instrument.vl1, handleChange]);

  // Handle TAL-NoiseMaker config updates
  const handleTalNoizeMakerChange = useCallback((updates: Partial<TalNoizeMakerConfig>) => {
    const currentConfig = instrument.talNoizeMaker || DEFAULT_TAL_NOIZEMAKER;
    const newConfig = { ...currentConfig, ...updates };
    handleChange({ talNoizeMaker: newConfig });
  }, [instrument.talNoizeMaker, handleChange]);

  // Handle Aeolus config updates
  const handleAeolusChange = useCallback((updates: Partial<AeolusConfig>) => {
    const currentConfig = instrument.aeolus || DEFAULT_AEOLUS;
    const newConfig = { ...currentConfig, ...updates };
    handleChange({ aeolus: newConfig });
  }, [instrument.aeolus, handleChange]);

  // Handle FluidSynth config updates
  const handleFluidSynthChange = useCallback((updates: Partial<FluidSynthConfig>) => {
    const currentConfig = instrument.fluidsynth || DEFAULT_FLUIDSYNTH;
    const newConfig = { ...currentConfig, ...updates };
    handleChange({ fluidsynth: newConfig });
  }, [instrument.fluidsynth, handleChange]);

  // Handle Sfizz config updates
  const handleSfizzChange = useCallback((updates: Partial<SfizzConfig>) => {
    const currentConfig = instrument.sfizz || DEFAULT_SFIZZ;
    const newConfig = { ...currentConfig, ...updates };
    handleChange({ sfizz: newConfig });
  }, [instrument.sfizz, handleChange]);

  const [sfizzLoadedName, setSfizzLoadedName] = useState<string | undefined>();
  const handleSfizzLoadFiles = useCallback(async (files: FileList) => {
    const engine = getToneEngine();
    const synth = engine.instruments.get(engine.getInstrumentKey(instrument.id, -1));
    if (synth && 'loadSFZFromFiles' in synth) {
      const result = await (synth as any).loadSFZFromFiles(files);
      if (result.success) {
        setSfizzLoadedName(result.name);
        // Update config so re-renders don't overwrite the loaded file with a built-in preset
        handleSfizzChange({ sfzPreset: '__file__' } as any);
      }
    }
  }, [instrument.id]);

  // Handle ZynAddSubFX config updates
  const handleZynAddSubFXChange = useCallback((updates: Partial<ZynAddSubFXConfig>) => {
    const currentConfig = instrument.zynaddsubfx || DEFAULT_ZYNADDSUBFX;
    const newConfig = { ...currentConfig, ...updates };
    handleChange({ zynaddsubfx: newConfig });
  }, [instrument.zynaddsubfx, handleChange]);

  // Pre-initialize synths that need WASM/ROM loading when editor opens
  // (must be above all conditional returns to satisfy React hooks rules)
  useEffect(() => {
    if (!instrument?.id) return;
    const st = instrument.synthType || '';
    const needsPreInit = st.startsWith('MAME') ||
      ['CZ101', 'CEM3394', 'SCSP', 'D50', 'MdaEPiano', 'MdaJX10', 'MdaDX10', 'ToneAM', 'RaffoSynth', 'CalfMono', 'SetBfree', 'SynthV1', 'TalNoizeMaker', 'Aeolus', 'FluidSynth', 'Sfizz', 'ZynAddSubFX', 'V2', 'TB303'].includes(st);
    if (!needsPreInit) return;
    (async () => {
      try {
        const { getToneEngine } = await import('@engine/ToneEngine');
        const engine = getToneEngine();
        await engine.ensureInstrumentReady(instrument);
      } catch { /* engine not ready */ }
    })();
  }, [instrument?.id, instrument?.synthType]); // eslint-disable-line react-hooks/exhaustive-deps

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
                    : 'bg-dark-bgTertiary text-text-muted hover:text-text-secondary border border-dark-borderLight'
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
            <div className="flex items-center gap-2">
              <button
                className={`p-1.5 rounded transition-all flex items-center gap-1.5 px-2 ${
                  uiMode === 'hardware'
                    ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/50'
                    : 'bg-dark-bgTertiary text-text-secondary hover:text-text-primary hover:bg-dark-bgHover border border-dark-borderLight'
                }`}
                onClick={() => setUIMode(uiMode === 'simple' ? 'hardware' : 'simple')}
                title={uiMode === 'hardware' ? 'Switch to Simple Controls' : 'Switch to Hardware UI'}
              >
                {uiMode === 'hardware' ? <Cpu size={14} /> : <Monitor size={14} />}
                <span className="text-[10px] font-bold uppercase tracking-tight">
                  {uiMode === 'hardware' ? 'HW' : 'SIMPLE'}
                </span>
              </button>
            </div>
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
  // RON KLAREN EDITOR
  // ============================================================================
  if (editorMode === 'ronklaren') {
    const ronKlarenConfig = deepMerge(DEFAULT_RONKLAREN, instrument.ronKlaren || {});
    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#001a2e] to-[#000810]">
        <EditorHeader
          instrument={instrument}
          onChange={handleChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
        />
        <Suspense fallback={<LoadingControls />}>
          <RonKlarenControls
            config={ronKlarenConfig}
            onChange={handleRonKlarenChange}
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
            uadeChipRam={instrument.uadeChipRam}
            instrumentId={instrument.id}
          />
        </Suspense>
      </div>
    );
  }

  // ============================================================================
  // INSTEREO! 2.0 EDITOR
  // ============================================================================
  if (editorMode === 'instereo2') {
    // IS10 reuses IS20 config shape, stored on inStereo1 key
    const isConfig = instrument.synthType === 'InStereo1Synth'
      ? deepMerge(DEFAULT_INSTEREO2, instrument.inStereo1 || {})
      : deepMerge(DEFAULT_INSTEREO2, instrument.inStereo2 || {});
    const configKey = instrument.synthType === 'InStereo1Synth' ? 'inStereo1' : 'inStereo2';
    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#0a0a14] to-[#040408]">
        <EditorHeader
          instrument={instrument}
          onChange={handleChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
        />
        <Suspense fallback={<LoadingControls />}>
          <InStereo2Controls
            config={isConfig}
            onChange={(updates) => {
              const current = (instrument as unknown as Record<string, unknown>)[configKey] as Record<string, unknown> || DEFAULT_INSTEREO2;
              handleChange({ [configKey]: { ...current, ...updates } });
            }}
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
  // FUTURE PLAYER EDITOR
  // ============================================================================
  if (editorMode === 'futureplayer') {
    const fpConfig = deepMerge(DEFAULT_FUTUREPLAYER, instrument.futurePlayer || {});
    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1a0e00] to-[#080400]">
        <EditorHeader
          instrument={instrument}
          onChange={handleChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
        />
        <Suspense fallback={<LoadingControls />}>
          <FuturePlayerControls
            config={fpConfig}
            onChange={handleFuturePlayerChange}
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
    // Huelsbeck mdat-format instruments carry tfmxMacroIndex in metadata.
    // For these we show the full 42-command macro editor instead of the legacy
    // VolMod/SndMod viewer used by the Hippel TFMX-7V format.
    const macroIdx = (instrument.metadata as { tfmxMacroIndex?: number } | undefined)?.tfmxMacroIndex;
    const isHuelsbeckMacro = typeof macroIdx === 'number';
    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1a0800] to-[#080300]">
        <EditorHeader
          instrument={instrument}
          onChange={handleChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
        />
        <Suspense fallback={<LoadingControls />}>
          {isHuelsbeckMacro ? (
            <TFMXMacroEditor height={520} initialMacroIndex={macroIdx} />
          ) : (
            <TFMXControls
              config={tfmxConfig}
              onChange={(cfg) => handleChange({ tfmx: cfg })}
              uadeChipRam={instrument.uadeChipRam}
            />
          )}
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
            instrumentId={instrument.id}
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
  // STEVE TURNER EDITOR
  // ============================================================================
  if (editorMode === 'steveturner') {
    const steveTurnerConfig = { ...DEFAULT_STEVE_TURNER, ...(instrument.steveTurner || {}) };
    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#001a0a] to-[#000804]">
        <EditorHeader
          instrument={instrument}
          onChange={handleChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
        />
        <Suspense fallback={<LoadingControls />}>
          <SteveTurnerControls
            config={steveTurnerConfig}
            onChange={handleSteveTurnerChange}
            instrumentIndex={instrument.id}
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
  // SYMPHONIE PRO EDITOR
  // ============================================================================
  if (editorMode === 'symphonie') {
    const symphonieConfig = deepMerge(DEFAULT_SYMPHONIE, instrument.symphonie || {});
    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#120820] to-[#060410]">
        <EditorHeader
          instrument={instrument}
          onChange={handleChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
        />
        <Suspense fallback={<LoadingControls />}>
          <SymphonieControls
            config={symphonieConfig}
            onChange={handleSymphonieChange}
          />
        </Suspense>
      </div>
    );
  }

  // ============================================================================
  // OPL3 / ADLIB INSTRUMENT VIEWER
  // ============================================================================
  if (editorMode === 'opl3') {
    const opl3Config = deepMerge(DEFAULT_OPL3, instrument.opl3 || {});
    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1a0e00] to-[#0a0500]">
        <EditorHeader
          instrument={instrument}
          onChange={handleChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
        />
        <Suspense fallback={<LoadingControls />}>
          <OPL3Controls config={opl3Config} />
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
            <div className="flex items-center gap-2">
              <button
                className={`p-1.5 rounded transition-all flex items-center gap-1.5 px-2 ${
                  uiMode === 'hardware'
                    ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/50'
                    : 'bg-dark-bgTertiary text-text-secondary hover:text-text-primary hover:bg-dark-bgHover border border-dark-borderLight'
                }`}
                onClick={() => setUIMode(uiMode === 'simple' ? 'hardware' : 'simple')}
                title={uiMode === 'hardware' ? 'Switch to Simple Controls' : 'Switch to Hardware UI'}
              >
                {uiMode === 'hardware' ? <Cpu size={14} /> : <Monitor size={14} />}
                <span className="text-[10px] font-bold uppercase tracking-tight">
                  {uiMode === 'hardware' ? 'HW' : 'SIMPLE'}
                </span>
              </button>
            </div>
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
  // GTULTRA (GoatTracker Ultra / C64 SID) EDITOR
  // ============================================================================
  if (editorMode === 'gtultra') {
    const gtConfig = deepMerge(DEFAULT_GTULTRA, instrument.gtUltra || {});
    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#0a0a1e] to-[#050510]">
        <EditorHeader
          instrument={instrument}
          onChange={handleChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
          customHeaderControls={
            <button
              onClick={() => setSidViewMode(m => m === 'original' ? 'unified' : 'original')}
              className="px-2 py-0.5 text-[9px] font-bold rounded border transition-colors"
              style={{
                color: sidViewMode === 'unified' ? '#44ff88' : '#666',
                borderColor: sidViewMode === 'unified' ? '#44ff88' : '#333',
                background: sidViewMode === 'unified' ? '#44ff8815' : 'transparent',
              }}
            >SID</button>
          }
        />
        <Suspense fallback={<LoadingControls />}>
          {sidViewMode === 'unified' ? (
            <GTUltraUnifiedControls config={gtConfig} onChange={handleGTUltraChange} />
          ) : (
            <GTUltraControls
              config={gtConfig}
              instrumentId={instrument.id}
              onChange={handleGTUltraChange}
            />
          )}
        </Suspense>
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
            instrumentId={instrument.id}
          />
        </Suspense>
      </div>
    );
  }

  // ============================================================================
  // SID FACTORY II EDITOR
  // ============================================================================
  if (editorMode === 'sidfactory2') {
    const sf2Config = { ...DEFAULT_SF2, ...(instrument.sf2 || {}) };
    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#0a0a1a] to-[#050510]">
        <EditorHeader
          instrument={instrument}
          onChange={handleChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
        />
        <Suspense fallback={<LoadingControls />}>
          <SF2Controls
            config={sf2Config}
            onChange={handleSF2Change}
            instrumentId={instrument.id}
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
  // STARTREKKER AM EDITOR
  // ============================================================================
  if (editorMode === 'startrekker-am') {
    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#001a1a] to-[#000808]">
        <EditorHeader
          instrument={instrument}
          onChange={handleChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
        />
        <div className="flex-1 min-h-0 overflow-y-auto">
          <Suspense fallback={<LoadingControls />}>
            <StartrekkerAMControls
              config={instrument.startrekkerAM ?? null}
              instrumentName={instrument.name}
              instrumentId={instrument.id}
              onChange={(am) => handleChange({ startrekkerAM: am })}
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
  // GRANULAR SYNTH EDITOR
  // ============================================================================
  if (editorMode === 'granular') {
    const granularConfig = deepMerge(DEFAULT_GRANULAR, instrument.granular || {});

    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
        <EditorHeader
          instrument={instrument}
          onChange={handleChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
          hideVisualization={true}
          showHelpButton={false}
        />
        <Suspense fallback={<LoadingControls />}>
          <GranularControls
            config={granularConfig}
            onChange={handleGranularChange}
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
        ? 'bg-[#041010] border-b-2 border-accent-highlight'
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
                      <Mic size={24} className="text-text-primary" />
                    </div>
                    <div>
                      <h2 className="text-xl font-black tracking-tight" style={{ color: accentColor }}>V2 SPEECH</h2>
                      <p className={`text-[10px] uppercase tracking-widest ${isCyanTheme ? 'text-accent-highlight' : 'text-text-secondary'}`}>Lisa Engine / Ronan</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Mode Toggle: Switch to Synth */}
                    <button
                      onClick={handleDisableSpeech}
                      className="p-1.5 rounded transition-all flex items-center gap-1.5 px-2 bg-dark-bgTertiary text-text-muted hover:text-amber-400 hover:bg-amber-500/10 border border-dark-borderLight"
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
                          : 'bg-dark-bgTertiary text-text-muted hover:text-text-secondary border border-dark-borderLight'
                      }`}
                    >
                      <Radio size={14} />
                      <span className="text-[10px] font-bold uppercase">LIVE</span>
                    </button>

                    <PresetDropdown
                      synthType={instrument.synthType}
                      currentPresetName={instrument.name}
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
      ? 'bg-[#041010] border-b-2 border-accent-highlight'
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
                  <div className="p-2 rounded-lg bg-gradient-to-br from-amber-500 to-amber-700 shadow-lg text-text-primary">
                    <MessageSquare size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-black tracking-tight" style={{ color: accentColor }}>SAM</h2>
                    <p className={`text-[10px] uppercase tracking-widest ${isCyanTheme ? 'text-accent-highlight' : 'text-text-secondary'}`}>Software Automatic Mouth</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleChange({ isLive: !instrument.isLive })}
                    className={`p-1.5 rounded transition-all flex items-center gap-1.5 px-2 ${
                      instrument.isLive
                        ? 'bg-accent-success/20 text-accent-success ring-1 ring-accent-success/50 animate-pulse-glow'
                        : 'bg-dark-bgTertiary text-text-muted hover:text-text-secondary border border-dark-borderLight'
                    }`}
                  >
                    <Radio size={14} />
                    <span className="text-[10px] font-bold uppercase">LIVE</span>
                  </button>

                  <PresetDropdown
                    synthType={instrument.synthType}
                    currentPresetName={instrument.name}
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
  // ============================================================================
  // PINK TROMBONE VOCAL TRACT EDITOR
  // ============================================================================
  if (editorMode === 'pinktrombone') {
    const accentColor = isCyanTheme ? '#00ffff' : '#ff6699';
    const headerBg = isCyanTheme
      ? 'bg-[#041010] border-b-2 border-accent-highlight'
      : 'bg-gradient-to-r from-[#2a2a2a] to-[#1a1a1a] border-b-4 border-[#ff6699]';

    const ptConfig = deepMerge(DEFAULT_PINK_TROMBONE, instrument.pinkTrombone || {});

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
                  <div className="p-2 rounded-lg bg-gradient-to-br from-pink-500 to-pink-700 shadow-lg text-text-primary">
                    <Mic size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-black tracking-tight" style={{ color: accentColor }}>Pink Trombone</h2>
                    <p className={`text-[10px] uppercase tracking-widest ${isCyanTheme ? 'text-accent-highlight' : 'text-text-secondary'}`}>Vocal Tract Synthesizer</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleChange({ isLive: !instrument.isLive })}
                    className={`p-1.5 rounded transition-all flex items-center gap-1.5 px-2 ${
                      instrument.isLive
                        ? 'bg-accent-success/20 text-accent-success ring-1 ring-accent-success/50 animate-pulse-glow'
                        : 'bg-dark-bgTertiary text-text-muted hover:text-text-secondary border border-dark-borderLight'
                    }`}
                  >
                    <Radio size={14} />
                    <span className="text-[10px] font-bold uppercase">LIVE</span>
                  </button>

                  <PresetDropdown
                    synthType={instrument.synthType}
                    currentPresetName={instrument.name}
                    onChange={handleChange}
                  />
                </div>
              </div>
            </div>
          }
        />
        <Suspense fallback={<LoadingControls />}>
          <PinkTromboneControls
            config={ptConfig}
            onChange={(updates) => handleChange({ pinkTrombone: { ...instrument.pinkTrombone!, ...updates } })}
          />
        </Suspense>
      </div>
    );
  }
  // ============================================================================
  // DECTALK SPEECH SYNTHESIZER EDITOR
  // ============================================================================
  if (editorMode === 'dectalk') {
    const accentColor = isCyanTheme ? '#00ffff' : '#00ff88';
    const headerBg = isCyanTheme
      ? 'bg-[#041010] border-b-2 border-accent-highlight'
      : 'bg-gradient-to-r from-[#1a2a1a] to-[#151515] border-b-4 border-[#00ff88]';

    const dtConfig = deepMerge(DEFAULT_DECTALK, instrument.dectalk || {});

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
                  <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-lg text-text-primary">
                    <MessageSquare size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-black tracking-tight" style={{ color: accentColor }}>DECtalk</h2>
                    <p className={`text-[10px] uppercase tracking-widest ${isCyanTheme ? 'text-accent-highlight' : 'text-text-secondary'}`}>Formant Speech Synthesizer</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleChange({ isLive: !instrument.isLive })}
                    className={`p-1.5 rounded transition-all flex items-center gap-1.5 px-2 ${
                      instrument.isLive
                        ? 'bg-accent-success/20 text-accent-success ring-1 ring-accent-success/50 animate-pulse-glow'
                        : 'bg-dark-bgTertiary text-text-muted hover:text-text-secondary border border-dark-borderLight'
                    }`}
                  >
                    <Radio size={14} />
                    <span className="text-[10px] font-bold uppercase">LIVE</span>
                  </button>

                  <PresetDropdown
                    synthType={instrument.synthType}
                    currentPresetName={instrument.name}
                    onChange={handleChange}
                  />
                </div>
              </div>
            </div>
          }
        />
        <Suspense fallback={<LoadingControls />}>
          <DECtalkControls
            config={dtConfig}
            instrumentId={instrument.id}
            onChange={(updates) => handleChange({ dectalk: { ...instrument.dectalk!, ...updates } })}
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
  if (editorMode === 'geonkick') {
    const geonkickConfig = instrument.geonkick ?? {};
    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
        <Suspense fallback={<LoadingControls />}>
          <GeonkickControls
            config={geonkickConfig}
            onChange={(updates) =>
              handleChange({ geonkick: { ...geonkickConfig, ...updates } })
            }
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
                    : 'bg-dark-bgTertiary text-text-muted hover:text-text-secondary border border-dark-borderLight'
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

              {/* Chip Parameters — CMI gets dedicated editor, others get generic */}
              <Suspense fallback={<LoadingControls />}>
                {instrument.synthType === 'MAMECMI' ? (
                  <CMIControls
                    synthType={instrument.synthType}
                    parameters={(instrument.parameters || {}) as Record<string, number | string>}
                    instrumentId={instrument.id}
                    onParamChange={handleChipParamChange}
                    onTextChange={handleChipTextChange}
                    onLoadPreset={handleChipPresetLoad}
                  />
                ) : (
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
                )}
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
  // MDA ePIANO EDITOR (Fender Rhodes)
  // ============================================================================
  if (editorMode === 'mdaEPiano' /* MdaEPiano now uses 'layout' mode */) {
    const epianoConfig = { ...DEFAULT_MDA_EPIANO, ...(instrument.mdaEPiano || {}) };

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
            <MdaEPianoControls
              config={epianoConfig}
              onChange={handleMdaEPianoChange}
            />
          </Suspense>
        </div>
      </div>
    );
  }

  // ============================================================================
  // MDA JX-10 EDITOR (Roland-inspired poly synth)
  // ============================================================================
  if (editorMode === 'mdaJX10' /* MdaJX10 now uses 'layout' mode */) {
    const jx10Config = { ...DEFAULT_MDA_JX10, ...(instrument.mdaJX10 || {}) };

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
            <MdaJX10Controls
              config={jx10Config}
              onChange={handleMdaJX10Change}
            />
          </Suspense>
        </div>
      </div>
    );
  }

  // ============================================================================
  // DX7 EDITOR (Yamaha DX7 FM synth — patch browser + voice selector)
  // ============================================================================
  if (editorMode === 'dexed' || instrument.synthType === 'DX7') {
    const dexedAccentColor = isCyanTheme ? '#00ffff' : '#d4a017';
    const dexedHeaderBg = isCyanTheme
      ? 'bg-[#0a0a00] border-b-2 border-amber-500/60'
      : 'bg-gradient-to-r from-[#1a1a10] to-[#151510] border-b-4 border-amber-600';
    const hasHardware = hasHardwareUI(instrument.synthType);

    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1a1a10] to-[#101008]">
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
          customHeaderControls={
            hasHardware ? (
              <button
                onClick={() => setUIMode(uiMode === 'simple' ? 'hardware' : 'simple')}
                className={`p-1.5 rounded transition-all flex items-center gap-1.5 px-2 ${
                  uiMode === 'hardware'
                    ? 'bg-accent-primary/20 text-accent-primary ring-1 ring-accent-primary/50'
                    : 'bg-dark-bgTertiary text-text-muted hover:text-text-secondary border border-dark-borderLight'
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
          customHeader={
            <div className={`synth-editor-header px-4 py-3 ${dexedHeaderBg}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-amber-600 to-amber-800 shadow-lg">
                    <Music size={24} className="text-text-primary" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black tracking-tight" style={{ color: dexedAccentColor }}>YAMAHA DX7</h2>
                    <p className={`text-[10px] uppercase tracking-widest ${isCyanTheme ? 'text-amber-400/60' : 'text-amber-600/80'}`}>6-Operator FM Synthesis</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {hasHardware && (
                    <button
                      onClick={() => setUIMode(uiMode === 'simple' ? 'hardware' : 'simple')}
                      className={`p-1.5 rounded transition-all flex items-center gap-1.5 px-2 ${
                        uiMode === 'hardware'
                          ? 'bg-accent-primary/20 text-accent-primary ring-1 ring-accent-primary/50'
                          : 'bg-dark-bgTertiary text-text-muted hover:text-text-secondary border border-dark-borderLight'
                      }`}
                      title={uiMode === 'hardware' ? 'Switch to Patch Browser' : 'Switch to Hardware UI'}
                    >
                      {uiMode === 'hardware' ? <Cpu size={14} /> : <Monitor size={14} />}
                      <span className="text-[10px] font-bold uppercase">{uiMode === 'hardware' ? 'Simple' : 'Hardware'}</span>
                    </button>
                  )}

                  <button
                    onClick={() => handleChange({ isLive: !instrument.isLive })}
                    className={`p-1.5 rounded transition-all flex items-center gap-1.5 px-2 ${
                      instrument.isLive
                        ? 'bg-accent-success/20 text-accent-success ring-1 ring-accent-success/50 animate-pulse-glow'
                        : 'bg-dark-bgTertiary text-text-muted hover:text-text-secondary border border-dark-borderLight'
                    }`}
                  >
                    <Radio size={14} />
                    <span className="text-[10px] font-bold uppercase">LIVE</span>
                  </button>

                  <PresetDropdown
                    synthType={instrument.synthType}
                    currentPresetName={instrument.name}
                    onChange={handleChange}
                  />
                </div>
              </div>
            </div>
          }
        />
        <div className="synth-editor-content overflow-y-auto">
          {uiMode === 'hardware' && hasHardware ? (
            <HardwareUIWrapper
              synthType={instrument.synthType}
              parameters={(instrument.parameters || {}) as Record<string, number>}
              instrumentId={instrument.id}
              onParamChange={(key, value) => {
                handleChange({
                  parameters: {
                    ...instrument.parameters,
                    [key]: value,
                  },
                });
              }}
            />
          ) : (
            <>
              <Suspense fallback={<LoadingControls />}>
                <DX7Controls
                  instrument={instrument}
                  onChange={handleChange}
                />
              </Suspense>
              {/* DX7 FM parameter knobs (all 155 VCED params) */}
              {(() => {
                const declLayout = getSynthLayout('DX7');
                if (!declLayout) return null;
                const config = { dx7: instrument.dx7 ?? {} } as Record<string, unknown>;
                return (
                  <div className="border-t border-dark-border/30 mt-2 pt-2">
                    <DOMSynthPanel
                      layout={declLayout}
                      config={config}
                      onChange={(updates) => handleChange(updates as Partial<InstrumentConfig>)}
                    />
                  </div>
                );
              })()}
            </>
          )}
        </div>
      </div>
    );
  }

  // ============================================================================
  // MDA DX10 EDITOR (2-operator FM synth)
  // ============================================================================
  if (editorMode === 'mdaDX10' /* MdaDX10 now uses 'layout' mode */) {
    const dx10Config = { ...DEFAULT_MDA_DX10, ...(instrument.mdaDX10 || {}) };

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
            <MdaDX10Controls
              config={dx10Config}
              onChange={handleMdaDX10Change}
            />
          </Suspense>
        </div>
      </div>
    );
  }

  // ============================================================================
  // TONE AM SYNTH (Tone.js Amplitude Modulation)
  // ============================================================================
  if (editorMode === 'toneAM') {
    const toneAMKnobColor = isCyanTheme ? '#00ffff' : '#e879f9';
    const toneAMPanelBg = isCyanTheme
      ? 'bg-[#051515] border-accent-highlight/20'
      : 'bg-[#1a1a1a] border-dark-border';
    const toneAMAccentText = isCyanTheme ? 'text-cyan-400' : 'text-purple-400';

    const toneAMDefaultEnv = { attack: 10, decay: 200, sustain: 50, release: 1000 };
    const toneAMEnv = {
      attack: instrument.envelope?.attack ?? toneAMDefaultEnv.attack,
      decay: instrument.envelope?.decay ?? toneAMDefaultEnv.decay,
      sustain: instrument.envelope?.sustain ?? toneAMDefaultEnv.sustain,
      release: instrument.envelope?.release ?? toneAMDefaultEnv.release,
    };
    const toneAMDefaultOsc = { type: 'sine' as const, detune: 0, octave: 0 };
    const toneAMOsc = { ...toneAMDefaultOsc, ...instrument.oscillator };
    const toneAMVolume = instrument.volume ?? 80;

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
        <div className="synth-editor-content overflow-y-auto p-4 space-y-4">
          {/* Oscillator */}
          <div className={`p-4 rounded-xl border ${toneAMPanelBg}`}>
            <h3 className={`font-bold ${toneAMAccentText} mb-4 text-xs uppercase tracking-widest`}>OSCILLATOR</h3>
            <div className="flex items-center gap-3">
              <label className="text-xs text-text-muted uppercase tracking-wide">Waveform</label>
              <CustomSelect
                className="bg-dark-bg border border-dark-border rounded px-2 py-1 text-sm text-text-primary focus:outline-none focus:border-accent-highlight"
                value={toneAMOsc.type}
                onChange={(v) => handleChange({ oscillator: { ...toneAMOsc, type: v as 'sine' | 'square' | 'sawtooth' | 'triangle' } })}
                options={[
                  { value: 'sine', label: 'Sine' },
                  { value: 'square', label: 'Square' },
                  { value: 'sawtooth', label: 'Sawtooth' },
                  { value: 'triangle', label: 'Triangle' },
                ]}
              />
            </div>
          </div>

          {/* Envelope */}
          <div className={`p-4 rounded-xl border ${toneAMPanelBg}`}>
            <h3 className={`font-bold ${toneAMAccentText} mb-4 text-xs uppercase tracking-widest`}>ENVELOPE</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <Knob
                value={toneAMEnv.attack} min={0} max={2000}
                onChange={(v) => handleChange({ envelope: { ...toneAMEnv, attack: v } })}
                label="Attack" color={toneAMKnobColor}
                formatValue={(v) => v < 1000 ? `${Math.round(v)}ms` : `${(v / 1000).toFixed(1)}s`}
              />
              <Knob
                value={toneAMEnv.decay} min={0} max={5000}
                onChange={(v) => handleChange({ envelope: { ...toneAMEnv, decay: v } })}
                label="Decay" color={toneAMKnobColor}
                formatValue={(v) => v < 1000 ? `${Math.round(v)}ms` : `${(v / 1000).toFixed(1)}s`}
              />
              <Knob
                value={toneAMEnv.sustain} min={0} max={100}
                onChange={(v) => handleChange({ envelope: { ...toneAMEnv, sustain: v } })}
                label="Sustain" color={toneAMKnobColor}
                formatValue={(v) => `${Math.round(v)}%`}
              />
              <Knob
                value={toneAMEnv.release} min={0} max={5000}
                onChange={(v) => handleChange({ envelope: { ...toneAMEnv, release: v } })}
                label="Release" color={toneAMKnobColor}
                formatValue={(v) => v < 1000 ? `${Math.round(v)}ms` : `${(v / 1000).toFixed(1)}s`}
              />
            </div>
          </div>

          {/* Volume */}
          <div className={`p-4 rounded-xl border ${toneAMPanelBg}`}>
            <h3 className={`font-bold ${toneAMAccentText} mb-4 text-xs uppercase tracking-widest`}>OUTPUT</h3>
            <div className="flex justify-center">
              <Knob
                value={toneAMVolume} min={0} max={100}
                onChange={(v) => handleChange({ volume: v })}
                label="Volume" color={toneAMKnobColor}
                formatValue={(v) => `${Math.round(v)}%`}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // RAFFO SYNTH EDITOR (Minimoog clone)
  // ============================================================================
  if (editorMode === 'raffo') {
    const raffoConfig = { ...DEFAULT_RAFFO, ...(instrument.raffo || {}) };

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
            <RaffoSynthControls
              config={raffoConfig}
              onChange={handleRaffoChange}
            />
          </Suspense>
        </div>
      </div>
    );
  }

  // ── Calf Monosynth ───────────────────────────────────────
  if (editorMode === 'calfMono') {
    const calfConfig = { ...DEFAULT_CALF_MONO, ...(instrument.calfMono || {}) };
    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
        <EditorHeader instrument={instrument} onChange={handleChange} vizMode={vizMode} onVizModeChange={setVizMode} showHelpButton={false} onBake={handleBake} onBakePro={handleBakePro} onUnbake={handleUnbake} isBaked={isBaked} isBaking={isBaking} />
        <div className="synth-editor-content overflow-y-auto">
          <Suspense fallback={<LoadingControls />}>
            <CalfMonoControls config={calfConfig} onChange={handleCalfMonoChange} />
          </Suspense>
        </div>
      </div>
    );
  }

  // ── setBfree Hammond B3 ──────────────────────────────────
  if (editorMode === 'setbfree') {
    const bfreeConfig = { ...DEFAULT_SETBFREE, ...(instrument.setbfree || {}) };
    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
        <EditorHeader instrument={instrument} onChange={handleChange} vizMode={vizMode} onVizModeChange={setVizMode} showHelpButton={false} onBake={handleBake} onBakePro={handleBakePro} onUnbake={handleUnbake} isBaked={isBaked} isBaking={isBaking} />
        <div className="synth-editor-content overflow-y-auto">
          <Suspense fallback={<LoadingControls />}>
            <SetBfreeControls config={bfreeConfig} onChange={handleSetBfreeChange} />
          </Suspense>
        </div>
      </div>
    );
  }

  // ── SynthV1 (4-osc poly) ─────────────────────────────────
  if (editorMode === 'synthv1') {
    const sv1Config = { ...DEFAULT_SYNTHV1, ...(instrument.synthv1 || {}) };
    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
        <EditorHeader instrument={instrument} onChange={handleChange} vizMode={vizMode} onVizModeChange={setVizMode} showHelpButton={false} onBake={handleBake} onBakePro={handleBakePro} onUnbake={handleUnbake} isBaked={isBaked} isBaking={isBaking} />
        <div className="synth-editor-content overflow-y-auto">
          <Suspense fallback={<LoadingControls />}>
            <SynthV1Controls config={sv1Config} onChange={handleSynthV1Change} />
          </Suspense>
        </div>
      </div>
    );
  }

  // ── Monique (Morphing Mono) ──────────────────────────────
  if (editorMode === 'moniqueSynth') {
    const moniqueConfig = { ...DEFAULT_MONIQUE, ...(instrument.monique || {}) };
    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
        <EditorHeader
          instrument={instrument}
          onChange={handleChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
          showHelpButton={false}
          hideVisualization={uiMode === 'hardware'}
          onBake={handleBake}
          onBakePro={handleBakePro}
          onUnbake={handleUnbake}
          isBaked={isBaked}
          isBaking={isBaking}
          customHeaderControls={
            <div className="flex items-center gap-2">
              <button
                className={`p-1.5 rounded transition-all flex items-center gap-1.5 px-2 ${
                  uiMode === 'hardware'
                    ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/50'
                    : 'bg-dark-bgTertiary text-text-secondary hover:text-text-primary hover:bg-dark-bgHover border border-dark-borderLight'
                }`}
                onClick={() => setUIMode(uiMode === 'simple' ? 'hardware' : 'simple')}
                title={uiMode === 'hardware' ? 'Switch to Simple Controls' : 'Switch to Hardware UI'}
              >
                {uiMode === 'hardware' ? <Cpu size={14} /> : <Monitor size={14} />}
                <span className="text-[10px] font-bold uppercase tracking-tight">
                  {uiMode === 'hardware' ? 'HW' : 'SIMPLE'}
                </span>
              </button>
            </div>
          }
        />
        {uiMode === 'hardware' ? (
          <Suspense fallback={<LoadingControls />}>
            <MoniqueHardwareUI instrumentId={instrument.id} />
          </Suspense>
        ) : (
          <div className="synth-editor-content overflow-y-auto">
            <Suspense fallback={<LoadingControls />}>
              <MoniqueControls config={moniqueConfig} onChange={handleMoniqueChange} />
            </Suspense>
          </div>
        )}
      </div>
    );
  }

  // ── VL1 (Casio VL-Tone) ──────────────────────────────────
  if (editorMode === 'vl1Synth') {
    const vl1Config = { ...DEFAULT_VL1, ...(instrument.vl1 || {}) };
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
            <VL1Controls config={vl1Config} onChange={handleVL1Change} />
          </Suspense>
        </div>
      </div>
    );
  }

  // ── amsynth (Classic Analog Modeling) ──────────────────────
  if (editorMode === 'amsynth' as string) {
    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
        <EditorHeader
          instrument={instrument}
          onChange={handleChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
          showHelpButton={false}
          hideVisualization={uiMode === 'hardware'}
          onBake={handleBake}
          onBakePro={handleBakePro}
          onUnbake={handleUnbake}
          isBaked={isBaked}
          isBaking={isBaking}
          customHeaderControls={
            <div className="flex items-center gap-2">
              <button
                className={`p-1.5 rounded transition-all flex items-center gap-1.5 px-2 ${
                  uiMode === 'hardware'
                    ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/50'
                    : 'bg-dark-bgTertiary text-text-secondary hover:text-text-primary hover:bg-dark-bgHover border border-dark-borderLight'
                }`}
                onClick={() => setUIMode(uiMode === 'simple' ? 'hardware' : 'simple')}
                title={uiMode === 'hardware' ? 'Switch to Simple Controls' : 'Switch to Hardware UI'}
              >
                {uiMode === 'hardware' ? <Cpu size={14} /> : <Monitor size={14} />}
                <span className="text-[10px] font-bold uppercase tracking-tight">
                  {uiMode === 'hardware' ? 'HW' : 'SIMPLE'}
                </span>
              </button>
            </div>
          }
        />
        {uiMode === 'hardware' ? (
          <Suspense fallback={<LoadingControls />}>
            <AmsynthHardwareUI instrumentId={instrument.id} />
          </Suspense>
        ) : (
          <div className="synth-editor-content overflow-y-auto">
            <Suspense fallback={<LoadingControls />}>
              <AMSynthControls
                config={{ ...DEFAULT_AMSYNTH, ...(instrument.amsynth || {}) }}
                onChange={handleAMSynthChange}
              />
            </Suspense>
          </div>
        )}
      </div>
    );
  }

  // ── TAL-NoiseMaker ───────────────────────────────────────
  if (editorMode === 'talNoizeMaker') {
    const talConfig = { ...DEFAULT_TAL_NOIZEMAKER, ...(instrument.talNoizeMaker || {}) };
    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
        <EditorHeader instrument={instrument} onChange={handleChange} vizMode={vizMode} onVizModeChange={setVizMode} showHelpButton={false} onBake={handleBake} onBakePro={handleBakePro} onUnbake={handleUnbake} isBaked={isBaked} isBaking={isBaking} />
        <div className="synth-editor-content overflow-y-auto">
          <Suspense fallback={<LoadingControls />}>
            <TalNoizeMakerControls config={talConfig} onChange={handleTalNoizeMakerChange} />
          </Suspense>
        </div>
      </div>
    );
  }

  // ── Aeolus (Pipe Organ) ──────────────────────────────────
  if (editorMode === 'aeolus') {
    const aeolusConfig = { ...DEFAULT_AEOLUS, ...(instrument.aeolus || {}) };
    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
        <EditorHeader instrument={instrument} onChange={handleChange} vizMode={vizMode} onVizModeChange={setVizMode} showHelpButton={false} onBake={handleBake} onBakePro={handleBakePro} onUnbake={handleUnbake} isBaked={isBaked} isBaking={isBaking} />
        <div className="synth-editor-content overflow-y-auto">
          <Suspense fallback={<LoadingControls />}>
            <AeolusControls config={aeolusConfig} onChange={handleAeolusChange} />
          </Suspense>
        </div>
      </div>
    );
  }

  // ── FluidSynth (SF2) ─────────────────────────────────────
  if (editorMode === 'fluidsynth') {
    const fsConfig = { ...DEFAULT_FLUIDSYNTH, ...(instrument.fluidsynth || {}) };
    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
        <EditorHeader instrument={instrument} onChange={handleChange} vizMode={vizMode} onVizModeChange={setVizMode} showHelpButton={false} onBake={handleBake} onBakePro={handleBakePro} onUnbake={handleUnbake} isBaked={isBaked} isBaking={isBaking} />
        <div className="synth-editor-content overflow-y-auto">
          <Suspense fallback={<LoadingControls />}>
            <FluidSynthControls config={fsConfig} onChange={handleFluidSynthChange} />
          </Suspense>
        </div>
      </div>
    );
  }

  // ── Sfizz (SFZ) ──────────────────────────────────────────
  if (editorMode === 'sfizz') {
    const sfizzConfig = { ...DEFAULT_SFIZZ, ...(instrument.sfizz || {}) };
    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
        <EditorHeader instrument={instrument} onChange={handleChange} vizMode={vizMode} onVizModeChange={setVizMode} showHelpButton={false} onBake={handleBake} onBakePro={handleBakePro} onUnbake={handleUnbake} isBaked={isBaked} isBaking={isBaking} />
        <div className="synth-editor-content overflow-y-auto">
          <Suspense fallback={<LoadingControls />}>
            <SfizzControls config={sfizzConfig} onChange={handleSfizzChange} onLoadFiles={handleSfizzLoadFiles} loadedName={sfizzLoadedName} />
          </Suspense>
        </div>
      </div>
    );
  }

  // ── ZynAddSubFX ──────────────────────────────────────────
  if (editorMode === 'zynaddsubfx') {
    const zasfxConfig = { ...DEFAULT_ZYNADDSUBFX, ...(instrument.zynaddsubfx || {}) };
    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
        <EditorHeader instrument={instrument} onChange={handleChange} vizMode={vizMode} onVizModeChange={setVizMode} showHelpButton={false} onBake={handleBake} onBakePro={handleBakePro} onUnbake={handleUnbake} isBaked={isBaked} isBaking={isBaking} />
        <div className="synth-editor-content overflow-y-auto">
          <Suspense fallback={<LoadingControls />}>
            <ZynAddSubFXControls config={zasfxConfig} onChange={handleZynAddSubFXChange} />
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
      ? 'bg-[#041010] border-b-2 border-accent-highlight'
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
                    <Music size={24} className="text-text-primary" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black tracking-tight" style={{ color: organAccentColor }}>TONEWHEEL ORGAN</h2>
                    <p className={`text-[10px] uppercase tracking-widest ${isCyanTheme ? 'text-accent-highlight' : 'text-text-secondary'}`}>Hammond-Style Drawbar Organ</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Native/Visual UI Toggle */}
                  <button
                    onClick={() => setVstUiMode(vstUiMode === 'custom' ? 'generic' : 'custom')}
                    className={`p-1.5 rounded transition-all flex items-center gap-1.5 px-2 ${
                      vstUiMode === 'custom'
                        ? 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/50'
                        : 'bg-dark-bgTertiary text-text-muted hover:text-text-secondary border border-dark-borderLight'
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
                        : 'bg-dark-bgTertiary text-text-muted hover:text-text-secondary border border-dark-borderLight'
                    }`}
                  >
                    <Radio size={14} />
                    <span className="text-[10px] font-bold uppercase">LIVE</span>
                  </button>

                  <PresetDropdown
                    synthType={instrument.synthType}
                    currentPresetName={instrument.name}
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
      ? 'bg-[#041010] border-b-2 border-accent-highlight'
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
                    <Music size={24} className="text-text-primary" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black tracking-tight" style={{ color: melodicaAccentColor }}>MELODICA</h2>
                    <p className={`text-[10px] uppercase tracking-widest ${isCyanTheme ? 'text-accent-highlight' : 'text-text-secondary'}`}>Reed Instrument Physical Model</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Native/Visual UI Toggle */}
                  <button
                    onClick={() => setVstUiMode(vstUiMode === 'custom' ? 'generic' : 'custom')}
                    className={`p-1.5 rounded transition-all flex items-center gap-1.5 px-2 ${
                      vstUiMode === 'custom'
                        ? 'bg-teal-500/20 text-teal-400 ring-1 ring-teal-500/50'
                        : 'bg-dark-bgTertiary text-text-muted hover:text-text-secondary border border-dark-borderLight'
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
                        : 'bg-dark-bgTertiary text-text-muted hover:text-text-secondary border border-dark-borderLight'
                    }`}
                  >
                    <Radio size={14} />
                    <span className="text-[10px] font-bold uppercase">LIVE</span>
                  </button>

                  <PresetDropdown
                    synthType={instrument.synthType}
                    currentPresetName={instrument.name}
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
      ? 'bg-[#041010] border-b-2 border-accent-highlight'
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
                    <Music size={24} className="text-text-primary" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black tracking-tight" style={{ color: vitalAccentColor }}>VITAL</h2>
                    <p className={`text-[10px] uppercase tracking-widest ${isCyanTheme ? 'text-accent-highlight' : 'text-text-secondary'}`}>Spectral Wavetable Synth</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setVstUiMode(vstUiMode === 'custom' ? 'generic' : 'custom')}
                    className={`p-1.5 rounded transition-all flex items-center gap-1.5 px-2 ${
                      vstUiMode === 'custom'
                        ? 'bg-purple-500/20 text-purple-400 ring-1 ring-purple-500/50'
                        : 'bg-dark-bgTertiary text-text-muted hover:text-text-secondary border border-dark-borderLight'
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
                        : 'bg-dark-bgTertiary text-text-muted hover:text-text-secondary border border-dark-borderLight'
                    }`}
                  >
                    <Radio size={14} />
                    <span className="text-[10px] font-bold uppercase">LIVE</span>
                  </button>

                  <PresetDropdown
                    synthType={instrument.synthType}
                    currentPresetName={instrument.name}
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
      ? 'bg-[#041010] border-b-2 border-accent-highlight'
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
                    <Music size={24} className="text-text-primary" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black tracking-tight" style={{ color: odinAccentColor }}>ODIN2</h2>
                    <p className={`text-[10px] uppercase tracking-widest ${isCyanTheme ? 'text-accent-highlight' : 'text-text-secondary'}`}>Semi-Modular Hybrid Synth</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setVstUiMode(vstUiMode === 'custom' ? 'generic' : 'custom')}
                    className={`p-1.5 rounded transition-all flex items-center gap-1.5 px-2 ${
                      vstUiMode === 'custom'
                        ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/50'
                        : 'bg-dark-bgTertiary text-text-muted hover:text-text-secondary border border-dark-borderLight'
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
                        : 'bg-dark-bgTertiary text-text-muted hover:text-text-secondary border border-dark-borderLight'
                    }`}
                  >
                    <Radio size={14} />
                    <span className="text-[10px] font-bold uppercase">LIVE</span>
                  </button>

                  <PresetDropdown
                    synthType={instrument.synthType}
                    currentPresetName={instrument.name}
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
      ? 'bg-[#041010] border-b-2 border-accent-highlight'
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
                    <Music size={24} className="text-text-primary" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black tracking-tight" style={{ color: surgeAccentColor }}>SURGE XT</h2>
                    <p className={`text-[10px] uppercase tracking-widest ${isCyanTheme ? 'text-accent-highlight' : 'text-text-secondary'}`}>Hybrid Synthesizer</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setVstUiMode(vstUiMode === 'custom' ? 'generic' : 'custom')}
                    className={`p-1.5 rounded transition-all flex items-center gap-1.5 px-2 ${
                      vstUiMode === 'custom'
                        ? 'bg-orange-500/20 text-orange-400 ring-1 ring-orange-500/50'
                        : 'bg-dark-bgTertiary text-text-muted hover:text-text-secondary border border-dark-borderLight'
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
                        : 'bg-dark-bgTertiary text-text-muted hover:text-text-secondary border border-dark-borderLight'
                    }`}
                  >
                    <Radio size={14} />
                    <span className="text-[10px] font-bold uppercase">LIVE</span>
                  </button>

                  <PresetDropdown
                    synthType={instrument.synthType}
                    currentPresetName={instrument.name}
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
    const hasHW = hasHardwareUI(instrument.synthType);
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
          customHeaderControls={
            hasHW ? (
              <button
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-bold uppercase transition-colors ${
                  uiMode === 'hardware'
                    ? 'bg-blue-600 text-text-primary'
                    : 'bg-dark-bgHover text-text-secondary hover:bg-dark-bgHover'
                }`}
                onClick={() => setUIMode(uiMode === 'simple' ? 'hardware' : 'simple')}
                title={uiMode === 'hardware' ? 'Switch to Simple Controls' : 'Switch to Hardware UI'}
              >
                {uiMode === 'hardware' ? <Cpu size={14} /> : <Monitor size={14} />}
                <span className="hidden sm:inline">
                  {uiMode === 'hardware' ? 'Hardware UI' : 'Simple UI'}
                </span>
              </button>
            ) : undefined
          }
        />
        {uiMode === 'hardware' && hasHW ? (
          <Suspense fallback={<LoadingControls />}>
            <HardwareUIWrapper
              synthType={instrument.synthType}
              parameters={(instrument.parameters || {}) as Record<string, number>}
              onParamChange={(key, value) => {
                handleChange({ parameters: { ...instrument.parameters, [key]: value } });
              }}
            />
          </Suspense>
        ) : (() => {
          const declLayout = getSynthLayout(instrument.synthType);
          if (declLayout) {
            const configKey = declLayout.configKey;
            // Use dedicated config property if available (e.g. instrument.monique, instrument.amsynth),
            // falling back to instrument.parameters for synths without a dedicated config
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const instAny = instrument as any;
            const configSource = configKey && instAny[configKey]
              ? instAny[configKey]
              : instrument.parameters ?? {};
            const config = configKey
              ? { [configKey]: configSource }
              : configSource as Record<string, unknown>;
            return (
              <div className="synth-editor-content overflow-y-auto">
                <DOMSynthPanel
                  layout={declLayout}
                  config={config as Record<string, unknown>}
                  onChange={(updates) => {
                    if (configKey && instAny[configKey]) {
                      // Write to the dedicated config key (e.g. { monique: {...} })
                      handleChange({ [configKey]: updates[configKey] as Record<string, unknown> });
                    } else {
                      const params = configKey
                        ? (updates[configKey] as Record<string, unknown>)
                        : updates;
                      handleChange({ parameters: params as Record<string, unknown> });
                    }
                  }}
                />
              </div>
            );
          }
          return (
            <div className="synth-editor-content overflow-y-auto">
              <Suspense fallback={<LoadingControls />}>
                <VSTBridgePanel
                  instrument={instrument}
                  onChange={handleChange}
                />
              </Suspense>
            </div>
          );
        })()}
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
  // XRNS DEMOSCENE SYNTHS (WaveSabre, Oidos, Tunefish)
  // ============================================================================
  if (editorMode === 'xrns-synth') {
    const xrnsSynthType = instrument.xrns?.synthType || instrument.synthType;
    const paramCount = instrument.xrns?.parameters?.length || 0;
    const displayName = xrnsSynthType.replace('wavesabre-', '').replace('WaveSabreSynth', 'WaveSabre').replace('OidosSynth', 'Oidos').replace('TunefishSynth', 'Tunefish 4');
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
            <div className="synth-editor-header px-4 py-3 bg-gradient-to-r from-[#1a1a2e] to-[#16162a] border-b border-[#2a2a4e]">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gradient-to-br from-purple-600 to-purple-800 shadow-lg text-text-primary">
                  <Cpu size={20} />
                </div>
                <div>
                  <h2 className="text-base font-bold tracking-wide text-purple-300">{displayName.toUpperCase()}</h2>
                  <p className="text-[10px] uppercase tracking-widest text-purple-500">XRNS WASM Synth · {paramCount} parameters</p>
                </div>
              </div>
            </div>
          }
        />
        <div className="px-4 py-6 text-text-secondary text-sm">
          <p>Parameters loaded from XRNS file.</p>
          {instrument.xrns?.pluginIdentifier && (
            <p className="mt-2 text-xs opacity-60">Plugin: {instrument.xrns.pluginIdentifier}</p>
          )}
        </div>
      </div>
    );
  }

  // ============================================================================
  // SUNVOX SYNTH EDITOR (single patch, not modular)
  // ============================================================================
  if (editorMode === 'sunvox-synth') {
    const patchName = instrument.sunvox?.patchName || 'Untitled Patch';
    const controlCount = instrument.sunvox?.controlValues ? Object.keys(instrument.sunvox.controlValues).length : 0;
    const isSong = instrument.sunvox?.isSong ?? false;
    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1a1a1a] to-[#121212]">
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
            <div className="synth-editor-header px-4 py-3 bg-gradient-to-r from-[#1a2a1a] to-[#142a14] border-b border-[#2a4a2a]">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gradient-to-br from-green-600 to-green-800 shadow-lg text-text-primary">
                  <Music size={20} />
                </div>
                <div>
                  <h2 className="text-base font-bold tracking-wide text-green-300">SunVox</h2>
                  <p className="text-[10px] uppercase tracking-widest text-green-600">
                    {isSong ? 'Song' : 'Patch'} · {patchName}
                  </p>
                </div>
              </div>
            </div>
          }
        />
        <div className="px-4 py-6 text-text-secondary text-sm">
          <p>SunVox {isSong ? 'song' : 'instrument patch'}: <span className="text-text-primary font-medium">{patchName}</span></p>
          {controlCount > 0 && (
            <p className="mt-1">{controlCount} control{controlCount !== 1 ? 's' : ''} mapped</p>
          )}
          {instrument.sunvox?.noteTargetModuleId != null && (
            <p className="mt-1 text-xs opacity-60">Target module ID: {instrument.sunvox.noteTargetModuleId}</p>
          )}
        </div>
      </div>
    );
  }

  // ============================================================================
  // SUNVOX MODULAR EDITOR
  // ============================================================================
  if (editorMode === 'sunvox-modular') {
    return (
      <div className="synth-editor-container flex flex-col h-full">
        <SunVoxModularEditor config={instrument} onChange={handleChange} />
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
  // CHEESECUTTER EDITOR (Unified SID)
  // ============================================================================
  if (editorMode === 'cheesecutter') {
    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1a1200] to-[#0a0800]">
        <EditorHeader
          instrument={instrument}
          onChange={handleChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
        />
        <Suspense fallback={<LoadingControls />}>
          <CheeseCutterControls />
        </Suspense>
      </div>
    );
  }

  // Layout descriptor fallback — synths with SYNTH_LAYOUTS entries but no dedicated editor mode
  if (editorMode === 'layout') {
    const layout = getSynthLayout(instrument.synthType);
    if (layout) {
      const configKey = layout.configKey;
      const config = configKey
        ? { [configKey]: (instrument as unknown as Record<string, unknown>)[configKey] ?? instrument.parameters ?? {} }
        : instrument as unknown as Record<string, unknown>;
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
          />
          <div className="p-3 space-y-3">
          <DOMSynthPanel
            layout={layout}
            config={config}
            onChange={(updates) => handleChange(updates as Partial<InstrumentConfig>)}
          />
          {/* Filter curve + ADSR visualizer — only for Tone.js synths with real filter/envelope configs */}
          {!configKey && (instrument.filter?.frequency != null || instrument.envelope?.attack != null) && (
            <div className="flex gap-2">
              {instrument.filter?.frequency != null && (
                <Suspense fallback={null}>
                  <LiveFilterCurve
                    instrumentId={instrument.id}
                    cutoff={instrument.filter.frequency ?? 2000}
                    resonance={instrument.filter.Q ?? 1}
                    type={(instrument.filter.type as 'lowpass') ?? 'lowpass'}
                    width="auto"
                    height={70}
                  />
                </Suspense>
              )}
              {instrument.envelope?.attack != null && (
                <EnvelopeVisualization
                  mode="ms"
                  attack={instrument.envelope.attack ?? 10}
                  decay={instrument.envelope.decay ?? 100}
                  sustain={instrument.envelope.sustain ?? 80}
                  release={instrument.envelope.release ?? 300}
                  width="auto"
                  height={70}
                  border="none"
                />
              )}
            </div>
          )}
          </div>
        </div>
      );
    }
  }

  return null;
};

