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

import React, { useState, useCallback } from 'react';
import type { InstrumentConfig, SynthType } from '@typedefs/instrument';
import { EditorHeader, type VizMode } from '../shared/EditorHeader';
import { SYNTH_REGISTRY } from '@engine/vstbridge/synth-registry';
import { useInstrumentStore } from '@stores';
import { useCheeseCutterStore } from '@stores/useCheeseCutterStore';
import { useInstrumentColors } from '@/hooks/useInstrumentColors';
import { isMAMEChipType } from '@constants/chipParameters';
import { Monitor, Cpu } from 'lucide-react';

// Import the tab content renderers from VisualSynthEditor
import { renderAllSections } from './VisualSynthEditorContent';

// Import hardware UI components (lightweight, always needed for detection)
import { HardwareUIWrapper, hasHardwareUI } from '../hardware/HardwareUIWrapper';

// Extracted sub-modules
import { SynthTypeDispatcher, type EditorMode } from './SynthTypeDispatcher';
import { getSynthLayout } from '@/constants/synthLayouts';

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
  return ['Sampler', 'Player', 'DrumKit', 'ChiptuneModule'].includes(synthType);
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

/** Check if synth type is HivelyTracker */
function isHivelyType(synthType: SynthType): boolean {
  return synthType === 'HivelySynth';
}

/** Check if synth type is GTUltra */
function isGTUltraType(synthType: SynthType): boolean {
  return synthType === 'GTUltraSynth';
}

/** Check if synth type is SoundMon II */
function isSoundMonType(synthType: SynthType): boolean {
  return synthType === 'SoundMonSynth';
}

/** Check if synth type is SidMon II */
function isSidMonType(synthType: SynthType): boolean {
  return synthType === 'SidMonSynth';
}

/** Check if synth type is Ron Klaren */
function isRonKlarenType(synthType: SynthType): boolean {
  return synthType === 'RonKlarenSynth';
}

/** Check if synth type is Digital Mugician */
function isDigMugType(synthType: SynthType): boolean {
  return synthType === 'DigMugSynth';
}

/** Check if synth type is Future Composer */
function isFCType(synthType: SynthType): boolean {
  return synthType === 'FCSynth';
}

/** Check if synth type is Delta Music 1.0 */
function isDeltaMusic1Type(synthType: SynthType): boolean {
  return synthType === 'DeltaMusic1Synth';
}

/** Check if synth type is Delta Music 2.0 */
function isDeltaMusic2Type(synthType: SynthType): boolean {
  return synthType === 'DeltaMusic2Synth';
}

/** Check if synth type is Fred Editor */
function isFredType(synthType: SynthType): boolean {
  return synthType === 'FredSynth';
}

/** Check if synth type is TFMX */
function isTFMXType(synthType: SynthType): boolean {
  return synthType === 'TFMXSynth';
}

/** Check if synth type is Sonic Arranger */
function isSonicArrangerType(synthType: SynthType): boolean {
  return synthType === 'SonicArrangerSynth';
}

/** Check if synth type is OPL3/AdLib */
function isOPL3Type(synthType: SynthType): boolean {
  return synthType === 'OPL3';
}

/** Check if synth type is InStereo! 2.0 or 1.0 */
function isInStereo2Type(synthType: SynthType): boolean {
  return synthType === 'InStereo2Synth' || synthType === 'InStereo1Synth';
}

/** Get the editor mode for a synth type */
function getEditorMode(synthType: SynthType): EditorMode {
  if (synthType === 'TB303' || synthType === 'Buzz3o3') return 'tb303';
  if (isFurnaceType(synthType)) return 'furnace';
  if (isBuzzmachineType(synthType)) return 'buzzmachine';
  if (isSampleType(synthType)) return 'sample';
  if (isDubSirenType(synthType)) return 'dubsiren';
  if (isSpaceLaserType(synthType)) return 'spacelaser';
  if (synthType === 'GranularSynth') return 'granular';
  if (isV2Type(synthType)) return 'v2';
  if (synthType === 'Sam') return 'sam';
  if (synthType === 'PinkTrombone') return 'pinktrombone';
  if (synthType === 'DECtalk') return 'dectalk';
  if (isSynareType(synthType)) return 'synare';
  if (synthType === 'Geonkick') return 'geonkick';
  if (isMAMEChipType(synthType)) return 'mamechip';
  if (isMAMEType(synthType)) return 'mame';
  // MdaEPiano/JX10/DX10 — fall through to 'layout' mode (knobs via DOMSynthPanel)
  if (synthType === 'DX7') return 'dexed';
  if (synthType === 'Sfizz') return 'sfizz';
  // Zynthian synths with dedicated editors — must be above SYNTH_REGISTRY catch-all
  if (synthType === 'Monique') return 'moniqueSynth';
  if (synthType === 'VL1') return 'vl1Synth';
  // Amsynth: hardware UI WASM knobs don't respond (C++ rebuild needed), use layout mode
  // if (synthType === 'Amsynth') return 'amsynth' as EditorMode;
  // MdaEPiano/JX10/DX10, ToneAM, Raffo, CalfMono, SetBfree, SynthV1,
  // TalNoizeMaker, Aeolus, FluidSynth, ZynAddSubFX — fall through to 'layout' mode
  if (synthType === 'SawteethSynth') return 'sawteeth';
  if (synthType === 'FmplayerSynth') return 'fmplayer';
  if (synthType === 'EupminiSynth') return 'eupmini';
  // Phase 2 — WASM replayer formats with string-param instrument editors
  if (synthType === 'ActivisionProWasmSynth') return 'wasm-param';
  if (synthType === 'FutureComposerWasmSynth') return 'wasm-param';
  if (synthType === 'ActionamicsWasmSynth') return 'wasm-param';
  if (synthType === 'SoundControlWasmSynth') return 'wasm-param';
  if (synthType === 'FaceTheMusicWasmSynth') return 'wasm-param';
  if (synthType === 'QuadraComposerWasmSynth') return 'wasm-param';
  if (synthType === 'MusicAssemblerSynth') return 'wasm-param';
  if (synthType === 'BenDaglishSynth') return 'wasm-param';
  if (synthType === 'ArtOfNoiseSynth') return 'wasm-param';
  if (synthType === 'SonixSynth') return 'wasm-info';
  if (synthType === 'PxtoneSynth') return 'wasm-info';
  if (synthType === 'OrganyaSynth') return 'wasm-info';
  if (synthType === 'Sc68Synth') return 'wasm-info';
  if (synthType === 'ZxtuneSynth') return 'wasm-info';
  if (synthType === 'IxalanceSynth') return 'wasm-info';
  if (synthType === 'CpsycleSynth') return 'wasm-info';
  if (synthType === 'PumaTrackerSynth') return 'wasm-info';
  if (synthType === 'HippelSynth') return 'wasm-info';
  if (synthType === 'MdxminiSynth') return 'wasm-info';
  if (synthType === 'PmdminiSynth') return 'wasm-info';
  if (synthType === 'DssWasmSynth') return 'wasm-param';
  if (synthType === 'SynthesisWasmSynth') return 'wasm-param';
  if (synthType === 'SoundFactory2WasmSynth') return 'wasm-param';
  if (synthType === 'OktalyzerWasmSynth') return 'wasm-param';
  if (synthType === 'FredReplayerWasmSynth2') return 'wasm-param';
  if (synthType === 'GmcWasmSynth') return 'wasm-param';
  if (synthType === 'SoundFxWasmSynth') return 'wasm-param';
  if (synthType === 'VoodooWasmSynth') return 'wasm-param';
  if (synthType === 'AsapSynth') return 'wasm-info';
  if (synthType === 'KlysSynth') return 'wasm-info';
  if (synthType === 'QsfSynth') return 'wasm-info';
  if (synthType === 'UADESynth') return 'wasm-info';
  // UADEEditableSynth already has chip-RAM editing via UADE — falls through to existing handler
  if (synthType === 'PreTrackerSynth') return 'pretracker';
  if (isHivelyType(synthType)) return 'hively';
  if (isGTUltraType(synthType)) return 'gtultra';
  if (synthType === 'JamCrackerSynth') return 'jamcracker';
  if (synthType === 'SF2Synth') return 'sidfactory2';
  if (isSoundMonType(synthType)) return 'soundmon';
  if (isSidMonType(synthType)) return 'sidmon';
  if (isRonKlarenType(synthType)) return 'ronklaren';
  if (isDigMugType(synthType)) return 'digmug';
  if (isSonicArrangerType(synthType)) return 'sonic-arranger';
  if (isInStereo2Type(synthType)) return 'instereo2';
  if (isFCType(synthType)) return 'fc';
  if (isDeltaMusic1Type(synthType)) return 'deltamusic1';
  if (isDeltaMusic2Type(synthType)) return 'deltamusic2';
  if (isFredType(synthType)) return 'fred';
  if (isTFMXType(synthType)) return 'tfmx';
  if (synthType === 'OctaMEDSynth') return 'octamed';
  if (synthType === 'SidMon1Synth') return 'sidmon1';
  if (synthType === 'HippelCoSoSynth') return 'hippelcoso';
  if (synthType === 'RobHubbardSynth') return 'robhubbard';
  if (synthType === 'SteveTurnerSynth') return 'steveturner';
  if (synthType === 'DavidWhittakerSynth') return 'davidwhittaker';
  if (synthType === 'FuturePlayerSynth') return 'futureplayer';
  if (synthType === 'SymphonieSynth') return 'symphonie';
  if (synthType === 'HarmonicSynth') return 'harmonicsynth';
  if (synthType === 'ModularSynth') return 'modular';
  if (synthType === 'SunVoxModular') return 'sunvox-modular';
  if (synthType === 'WAM' || synthType.startsWith('WAM')) return 'wam';
  if (synthType === 'TonewheelOrgan') return 'tonewheelOrgan';
  if (synthType === 'Melodica') return 'melodica';
  if (synthType === 'Vital') return 'vital';
  if (synthType === 'Odin2') return 'odin2';
  if (synthType === 'Surge') return 'surge';
  if (synthType === 'SuperCollider') return 'supercollider';
  if (synthType === 'MusicLineSynth') return 'musicline';
  if (isOPL3Type(synthType)) return 'opl3';
  if (synthType === 'WaveSabreSynth' || synthType === 'OidosSynth' || synthType === 'TunefishSynth') return 'xrns-synth';
  if (synthType === 'SunVoxSynth') return 'sunvox-synth';
  if (synthType === 'StartrekkerAMSynth') return 'startrekker-am';
  if (synthType === 'WobbleBass') return 'wobblebass';
  if (SYNTH_REGISTRY.has(synthType)) return 'vstbridge';
  // Catch-all: synths with declarative layout descriptors (TR909, C64SID, V2Speech, Open303, etc.)
  if (getSynthLayout(synthType)) return 'layout';
  return 'generic';
}

// ============================================================================
// UNIFIED INSTRUMENT EDITOR
// ============================================================================

interface UnifiedInstrumentEditorProps {
  instrument: InstrumentConfig;
  onChange: (updates: Partial<InstrumentConfig>) => void;
}

export const UnifiedInstrumentEditor: React.FC<UnifiedInstrumentEditorProps> = ({
  instrument,
  onChange,
}) => {
  const [vizMode, setVizMode] = useState<VizMode>('oscilloscope');
  const [showHelp, setShowHelp] = useState(false);
  const [isBaking, setIsBaking] = useState(false);
  // Default to hardware UI if available, otherwise simple UI
  const [uiMode, setUIMode] = useState<'simple' | 'hardware'>(() =>
    hasHardwareUI(instrument.synthType) ? 'hardware' : 'simple'
  );
  // Custom (purpose-built) vs Generic (auto-generated VSTBridge) UI for WASM synths with custom editors
  const [vstUiMode, setVstUiMode] = useState<'custom' | 'generic'>('custom');

  const { bakeInstrument, unbakeInstrument } = useInstrumentStore();

  const handleChange = useCallback((updates: Partial<InstrumentConfig>) => {
    onChange(updates);
  }, [onChange]);

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

  const cheeseCutterLoaded = useCheeseCutterStore(s => s.loaded);

  const synthEditorMode = getEditorMode(instrument.synthType);
  const editorMode: EditorMode = instrument.metadata?.mlSynthConfig
    ? 'musicline'
    : (cheeseCutterLoaded && instrument.synthType === 'C64SID')
      ? 'cheesecutter'
    // If synthType has a dedicated editor, use it even if sample data is attached
    // (Amiga synth formats attach waveform PCM for preview but should show synth editor)
    : (synthEditorMode !== 'generic' && synthEditorMode !== 'sample')
      ? synthEditorMode
      : (instrument.sample?.url || (instrument.parameters as Record<string, unknown>)?.sampleUrl)
        ? 'sample'
        : synthEditorMode;

  const { isCyan: isCyanTheme } = useInstrumentColors('#60a5fa');

  // ============================================================================
  // DISPATCH TO SYNTH-SPECIFIC EDITORS
  // ============================================================================
  if (editorMode !== 'generic') {
    return (
      <SynthTypeDispatcher
        editorMode={editorMode}
        instrument={instrument}
        handleChange={handleChange}
        onChange={onChange}
        vizMode={vizMode}
        setVizMode={setVizMode}
        uiMode={uiMode}
        setUIMode={setUIMode}
        vstUiMode={vstUiMode}
        setVstUiMode={setVstUiMode}
        isBaked={isBaked}
        isBaking={isBaking}
        handleBake={handleBake}
        handleBakePro={handleBakePro}
        handleUnbake={handleUnbake}
        isCyanTheme={isCyanTheme}
      />
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

      {uiMode === 'hardware' && hasHardwareGeneric ? (
        /* Hardware UI Mode */
        <div className="synth-editor-content overflow-y-auto p-4 space-y-4">
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
        </div>
      ) : (
        /* All-sections layout — compact two-column flow, no tabs */
        <>
          <div className="synth-editor-content overflow-y-auto">
            {renderAllSections(instrument, handleChange)}
          </div>
        </>
      )}
    </div>
  );
};

// ============================================================================
// GENERIC TAB CONTENT (imported from VisualSynthEditor logic)
// ============================================================================

export default UnifiedInstrumentEditor;

