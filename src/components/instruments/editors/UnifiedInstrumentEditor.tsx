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

import React, { useState, useCallback, useEffect } from 'react';
import type { InstrumentConfig, SynthType } from '@typedefs/instrument';
import { EditorHeader, type VizMode } from '../shared/EditorHeader';
import { SynthEditorTabs, type SynthEditorTab } from '../shared/SynthEditorTabs';
import { SYNTH_REGISTRY } from '@engine/vstbridge/synth-registry';
import { useThemeStore, useInstrumentStore } from '@stores';
import { isMAMEChipType } from '@constants/chipParameters';
import { Monitor, Cpu } from 'lucide-react';

// Import the tab content renderers from VisualSynthEditor
import { renderSpecialParameters, renderGenericTabContent } from './VisualSynthEditorContent';

// Import hardware UI components (lightweight, always needed for detection)
import { HardwareUIWrapper, hasHardwareUI } from '../hardware/HardwareUIWrapper';

// Extracted sub-modules
import { SynthTypeDispatcher, type EditorMode } from './SynthTypeDispatcher';

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
  if (isV2Type(synthType)) return 'v2';
  if (synthType === 'Sam') return 'sam';
  if (isSynareType(synthType)) return 'synare';
  if (isMAMEChipType(synthType)) return 'mamechip';
  if (isMAMEType(synthType)) return 'mame';
  if (isDexedType(synthType)) return 'dexed';
  if (isOBXdType(synthType)) return 'obxd';
  if (isHivelyType(synthType)) return 'hively';
  if (synthType === 'JamCrackerSynth') return 'jamcracker';
  if (isSoundMonType(synthType)) return 'soundmon';
  if (isSidMonType(synthType)) return 'sidmon';
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
  if (synthType === 'DavidWhittakerSynth') return 'davidwhittaker';
  if (synthType === 'HarmonicSynth') return 'harmonicsynth';
  if (synthType === 'ModularSynth') return 'modular';
  if (synthType === 'SunVoxModular') return 'sunvox-modular';
  if (synthType === 'WAM') return 'wam';
  if (synthType === 'TonewheelOrgan') return 'tonewheelOrgan';
  if (synthType === 'Melodica') return 'melodica';
  if (synthType === 'Vital') return 'vital';
  if (synthType === 'Odin2') return 'odin2';
  if (synthType === 'Surge') return 'surge';
  if (synthType === 'SuperCollider') return 'supercollider';
  if (synthType === 'StartrekkerAMSynth') return 'startrekker-am';
  if (synthType === 'WobbleBass') return 'wobblebass';
  if (synthType.startsWith('Gearmulator')) return 'gearmulator';
  if (SYNTH_REGISTRY.has(synthType)) return 'vstbridge';
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
  const [genericTab, setGenericTab] = useState<SynthEditorTab>('oscillator');
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

  const synthEditorMode = getEditorMode(instrument.synthType);
  const editorMode = instrument.metadata?.mlSynthConfig
    ? 'musicline'
    // If synthType has a dedicated editor, use it even if sample data is attached
    // (Amiga synth formats attach waveform PCM for preview but should show synth editor)
    : (synthEditorMode !== 'generic' && synthEditorMode !== 'sample')
      ? synthEditorMode
      : (instrument.sample?.url || (instrument.parameters as Record<string, unknown>)?.sampleUrl)
        ? 'sample'
        : synthEditorMode;

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

