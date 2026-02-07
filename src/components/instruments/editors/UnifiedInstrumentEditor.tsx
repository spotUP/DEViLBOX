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
import {
  DEFAULT_FURNACE, DEFAULT_DUB_SIREN, DEFAULT_SPACE_LASER, DEFAULT_V2, DEFAULT_V2_SPEECH, DEFAULT_SYNARE,
  DEFAULT_MAME_VFX, DEFAULT_MAME_DOC, DEFAULT_DEXED, DEFAULT_OBXD
} from '@typedefs/instrument';
import { EditorHeader, type VizMode } from '../shared/EditorHeader';
import { PresetDropdown } from '../presets/PresetDropdown';
import { SynthEditorTabs, type SynthEditorTab } from '../shared/SynthEditorTabs';
import { TB303Controls } from '../controls/TB303Controls';
import { FurnaceControls } from '../controls/FurnaceControls';
import { BuzzmachineControls } from '../controls/BuzzmachineControls';
import { SampleControls } from '../controls/SampleControls';
import { DubSirenControls } from '../controls/DubSirenControls';
import { SpaceLaserControls } from '../controls/SpaceLaserControls';
import { V2Controls } from '../controls/V2Controls';
import { V2SpeechControls } from '../controls/V2SpeechControls';
import { SAMControls } from '../controls/SAMControls';
import { SynareControls } from '../controls/SynareControls';
import { MAMEControls } from '../controls/MAMEControls';
import { ChipSynthControls } from '../controls/ChipSynthControls';
import { DexedControls } from '../controls/DexedControls';
import { OBXdControls } from '../controls/OBXdControls';
import { ChannelOscilloscope } from '../../visualization/ChannelOscilloscope';
import { MAMEOscilloscope } from '../../visualization/MAMEOscilloscope';
import { MAMEMacroEditor, type MacroData } from './MAMEMacroEditor';
import { WavetableListEditor } from './WavetableEditor';
import { useThemeStore, useInstrumentStore } from '@stores';
import { getToneEngine } from '@engine/ToneEngine';
import { isMAMEChipType, getChipSynthDef } from '@constants/chipParameters';
import { getChipCapabilities } from '@engine/mame/MAMEMacroTypes';
import { Box, Drum, Megaphone, Zap, Radio, MessageSquare, Music, Mic, Monitor, Cpu } from 'lucide-react';

// Import the tab content renderers from VisualSynthEditor
// We'll keep the existing tab content implementations
import { renderSpecialParameters, renderGenericTabContent } from './VisualSynthEditorContent';

// Import hardware UI components
import { HardwareUIWrapper, hasHardwareUI } from '../hardware/HardwareUIWrapper';

// Types
type EditorMode = 'generic' | 'tb303' | 'furnace' | 'buzzmachine' | 'sample' | 'dubsiren' | 'spacelaser' | 'v2' | 'sam' | 'synare' | 'mame' | 'mamechip' | 'dexed' | 'obxd';

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
  return synthType === 'V2';
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

  const { bakeInstrument, unbakeInstrument } = useInstrumentStore();

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

  const editorMode = getEditorMode(instrument.synthType);

  // Auto-switch tabs when synth type changes
  useEffect(() => {
    if (instrument.synthType === 'DrumMachine') {
      setGenericTab('special');
    } else if (isSampleType(instrument.synthType)) {
      setGenericTab('envelope');
    } else if (genericTab === 'special' && !renderSpecialParameters(instrument, onChange)) {
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
        onChange={onChange}
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
                  onClick={() => onChange({ isLive: !instrument.isLive })}
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
                  onChange={onChange}
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
      onChange({ v2Speech: { ...DEFAULT_V2_SPEECH } });
    };

    return (
      <EditorHeader
        instrument={instrument}
        onChange={onChange}
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
                  onClick={() => onChange({ isLive: !instrument.isLive })}
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
                  onChange={onChange}
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
        onChange={onChange}
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
                  onClick={() => onChange({ isLive: !instrument.isLive })}
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
                  onChange={onChange}
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
        onChange={onChange}
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
                  onClick={() => onChange({ isLive: !instrument.isLive })}
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
                  onChange={onChange}
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
    onChange({
      tb303: { ...instrument.tb303, ...updates } as any,
    });
  }, [instrument.tb303, onChange]);

  // Handle Dub Siren config updates
  const handleDubSirenChange = useCallback((updates: Partial<typeof instrument.dubSiren>) => {
    const currentDubSiren = instrument.dubSiren || DEFAULT_DUB_SIREN;
    onChange({
      dubSiren: { ...currentDubSiren, ...updates },
    });
  }, [instrument.dubSiren, onChange]);

  // Handle Space Laser config updates
  const handleSpaceLaserChange = useCallback((updates: Partial<typeof instrument.spaceLaser>) => {
    const currentSpaceLaser = instrument.spaceLaser || DEFAULT_SPACE_LASER;
    onChange({
      spaceLaser: { ...currentSpaceLaser, ...updates },
    });
  }, [instrument.spaceLaser, onChange]);

  // Handle V2 config updates
  const handleV2Change = useCallback((updates: Partial<typeof instrument.v2>) => {
    const currentV2 = instrument.v2 || DEFAULT_V2;
    onChange({
      v2: { ...currentV2, ...updates },
    });
  }, [instrument.v2, onChange]);

  // Handle Synare config updates
  const handleSynareChange = useCallback((updates: Partial<typeof instrument.synare>) => {
    const currentSynare = instrument.synare || DEFAULT_SYNARE;
    onChange({
      synare: { ...currentSynare, ...updates },
    });
  }, [instrument.synare, onChange]);

  // Handle Furnace config updates
  const handleFurnaceChange = useCallback((updates: Partial<typeof instrument.furnace>) => {
    const currentFurnace = instrument.furnace || DEFAULT_FURNACE;
    onChange({
      furnace: { ...currentFurnace, ...updates },
    });
  }, [instrument.furnace, onChange]);

  // Handle MAME config updates
  const handleMAMEChange = useCallback((updates: Partial<typeof instrument.mame>) => {
    const currentMame = instrument.mame || (
      instrument.synthType === 'MAMEDOC' ? DEFAULT_MAME_DOC :
      DEFAULT_MAME_VFX
    );
    const newConfig = { ...currentMame, ...updates };
    onChange({
      mame: newConfig,
    });
    
    // Real-time update
    try {
      const engine = getToneEngine();
      engine.updateMAMEParameters(instrument.id, newConfig);
    } catch (e) {
      // Ignored
    }
  }, [instrument.mame, instrument.synthType, instrument.id, onChange]);

  // Handle MAME chip synth parameter changes
  const handleChipParamChange = useCallback((key: string, value: number) => {
    const currentParams = instrument.parameters || {};
    const newParams = { ...currentParams, [key]: value };
    onChange({ parameters: newParams });
    try {
      const engine = getToneEngine();
      engine.updateMAMEChipParam(instrument.id, key, value);
    } catch (_e) { /* ignored */ }
  }, [instrument.parameters, instrument.id, onChange]);

  // Handle MAME chip synth text parameter changes (e.g. speech text)
  const handleChipTextChange = useCallback((key: string, value: string) => {
    const currentParams = instrument.parameters || {};
    const newParams = { ...currentParams, [key]: value };
    onChange({ parameters: newParams });
    try {
      const engine = getToneEngine();
      engine.updateMAMEChipTextParam(instrument.id, key, value);
    } catch (_e) { /* ignored */ }
  }, [instrument.parameters, instrument.id, onChange]);

  // Handle MAME chip synth preset load
  const handleChipPresetLoad = useCallback((program: number) => {
    const currentParams = instrument.parameters || {};
    onChange({ parameters: { ...currentParams, _program: program } });
    try {
      const engine = getToneEngine();
      engine.loadMAMEChipPreset(instrument.id, program);
    } catch (_e) { /* ignored */ }
  }, [instrument.parameters, instrument.id, onChange]);

  // Handle ROM upload for chip synths that require ROMs
  const handleChipRomUpload = useCallback((bank: number, data: Uint8Array) => {
    try {
      const engine = getToneEngine();
      engine.loadSynthROM(instrument.id, instrument.synthType, bank, data);
    } catch (_e) { /* ignored */ }
  }, [instrument.id, instrument.synthType]);

  // Handle Dexed (DX7) config updates
  const handleDexedChange = useCallback((updates: Partial<typeof instrument.dexed>) => {
    const currentDexed = instrument.dexed || DEFAULT_DEXED;
    const newConfig = { ...currentDexed, ...updates };
    onChange({
      dexed: newConfig,
    });

    // Real-time update
    try {
      const engine = getToneEngine();
      engine.updateDexedParameters(instrument.id, newConfig);
    } catch (e) {
      // Ignored
    }
  }, [instrument.dexed, instrument.id, onChange]);

  // Handle OBXd (Oberheim) config updates
  const handleOBXdChange = useCallback((updates: Partial<typeof instrument.obxd>) => {
    const currentOBXd = instrument.obxd || DEFAULT_OBXD;
    const newConfig = { ...currentOBXd, ...updates };
    onChange({
      obxd: newConfig,
    });

    // Real-time update
    try {
      const engine = getToneEngine();
      engine.updateOBXdParameters(instrument.id, newConfig);
    } catch (e) {
      // Ignored
    }
  }, [instrument.obxd, instrument.id, onChange]);

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
    const hasSpecialParams = renderSpecialParameters(instrument, onChange) !== null;
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
          <TB303Controls
            config={instrument.tb303}
            onChange={handleTB303Change}
            showFilterCurve={false}
            showHeader={false}
            isJC303={true}
            volume={instrument.volume}
            onVolumeChange={(v) => onChange({ volume: v })}
            isBuzz3o3={instrument.synthType === 'Buzz3o3'}
          />
        </div>
      </div>
    );
  }

  // ============================================================================
  // FURNACE CHIP EDITOR
  // ============================================================================
  if (editorMode === 'furnace') {
    const furnaceConfig = instrument.furnace || DEFAULT_FURNACE;

    // Determine channel names for oscilloscope based on synth type
    const isNativeDispatch = instrument.synthType === 'FurnaceGB';
    const channelNames: Record<string, string[]> = {
      FurnaceGB: ['PU1', 'PU2', 'WAV', 'NOI'],
      FurnaceNES: ['PU1', 'PU2', 'TRI', 'NOI', 'DPCM'],
      FurnacePSG: ['SQ1', 'SQ2', 'SQ3', 'NOI'],
      FurnaceAY: ['A', 'B', 'C'],
    };

    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
        {/* Use common header with visualization */}
        <EditorHeader
          instrument={instrument}
          onChange={onChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
          showHelpButton={false}
        />

        {/* Channel Oscilloscope for native dispatch synths */}
        {isNativeDispatch && (
          <div className="px-4 pt-3">
            <ChannelOscilloscope
              channelNames={channelNames[instrument.synthType] || []}
              height={160}
            />
          </div>
        )}

        {/* Furnace Controls */}
        <div className="synth-editor-content overflow-y-auto p-4">
          <FurnaceControls
            config={furnaceConfig}
            instrumentId={instrument.id}
            onChange={handleFurnaceChange}
          />
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
          onChange={onChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
          showHelpButton={false}
        />

        {/* Buzzmachine Controls */}
        <div className="synth-editor-content overflow-y-auto p-4">
          <BuzzmachineControls
            config={instrument}
            onChange={onChange}
          />
        </div>
      </div>
    );
  }

  // ============================================================================
  // SAMPLE EDITOR
  // ============================================================================
  if (editorMode === 'sample') {
    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
        {/* Use common header but hide viz (sample editor has waveform) */}
        <EditorHeader
          instrument={instrument}
          onChange={onChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
          hideVisualization={true}
          showHelpButton={false}
        />

        {/* Sample Controls */}
        <div className="synth-editor-content overflow-y-auto p-4">
          <SampleControls
            instrument={instrument}
            onChange={onChange}
          />
        </div>
      </div>
    );
  }

  // ============================================================================
  // DUB SIREN EDITOR
  // ============================================================================
  if (editorMode === 'dubsiren' && instrument.dubSiren) {
    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
        {renderDubSirenHeader()}
        <DubSirenControls
          config={instrument.dubSiren}
          instrumentId={instrument.id}
          onChange={handleDubSirenChange}
        />
      </div>
    );
  }

  // ============================================================================
  // SPACE LASER EDITOR
  // ============================================================================
  if (editorMode === 'spacelaser' && instrument.spaceLaser) {
    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
        {renderSpaceLaserHeader()}
        <SpaceLaserControls
          config={instrument.spaceLaser}
          onChange={handleSpaceLaserChange}
        />
      </div>
    );
  }

  // ============================================================================
  // V2 SYNTH EDITOR
  // ============================================================================
  if (editorMode === 'v2') {
    if (instrument.v2Speech) {
      const accentColor = isCyanTheme ? '#00ffff' : '#ffaa00';
      const headerBg = isCyanTheme
        ? 'bg-[#041010] border-b-2 border-cyan-500'
        : 'bg-gradient-to-r from-[#2a2a2a] to-[#1a1a1a] border-b-4 border-[#ffaa00]';

      const handleDisableSpeech = () => {
        onChange({ v2Speech: undefined });
      };

      return (
        <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
          <EditorHeader
            instrument={instrument}
            onChange={onChange}
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
                      onClick={() => onChange({ isLive: !instrument.isLive })}
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
                      onChange={onChange}
                    />
                  </div>
                </div>
              </div>
            }
          />
          <V2SpeechControls
            config={instrument.v2Speech}
            onChange={(updates) => onChange({ v2Speech: { ...instrument.v2Speech!, ...updates } })}
          />
        </div>
      );
    }

    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
        {renderV2Header()}
        <V2Controls
          config={instrument.v2 || DEFAULT_V2}
          onChange={handleV2Change}
        />
      </div>
    );
  }

  // ============================================================================
  // SAM SPEECH EDITOR
  // ============================================================================
  if (editorMode === 'sam' && instrument.sam) {
    const accentColor = isCyanTheme ? '#00ffff' : '#ffcc33';
    const headerBg = isCyanTheme
      ? 'bg-[#041010] border-b-2 border-cyan-500'
      : 'bg-gradient-to-r from-[#2a2a2a] to-[#1a1a1a] border-b-4 border-[#ffcc33]';

    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
        <EditorHeader
          instrument={instrument}
          onChange={onChange}
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
                    onClick={() => onChange({ isLive: !instrument.isLive })}
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
                    onChange={onChange}
                  />
                </div>
              </div>
            </div>
          }
        />
        <SAMControls
          config={instrument.sam}
          onChange={(updates) => onChange({ sam: { ...instrument.sam!, ...updates } })}
        />
      </div>
    );
  }
  if (editorMode === 'synare' && instrument.synare) {
    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
        {renderSynareHeader()}
        <SynareControls
          config={instrument.synare}
          instrumentId={instrument.id}
          onChange={handleSynareChange}
        />
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
    const macros: MacroData[] = instrument.parameters?.macros || [];

    const handleMacrosChange = (newMacros: MacroData[]) => {
      onChange({
        parameters: {
          ...instrument.parameters,
          macros: newMacros,
        },
      });
    };

    // Get/initialize wavetable data from instrument config
    const wavetables = instrument.parameters?.wavetables || [];

    const handleWavetablesChange = (newWavetables: any[]) => {
      onChange({
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
          onChange={onChange}
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
              parameters={instrument.parameters || {}}
              onParamChange={handleChipParamChange}
            />
          ) : (
            /* Simple Controls Mode */
            <>
              {/* Oscilloscope */}
              <MAMEOscilloscope
                instrumentId={instrument.id}
                height={100}
                color={chipDef?.color}
              />

              {/* Chip Parameters */}
              <ChipSynthControls
                synthType={instrument.synthType}
                parameters={instrument.parameters || {}}
                instrumentId={instrument.id}
                onParamChange={handleChipParamChange}
                onTextChange={handleChipTextChange}
                onLoadPreset={handleChipPresetLoad}
                onRomUpload={handleChipRomUpload}
              />

              {/* Macro Editor */}
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
    const mameConfig = instrument.mame || (
      instrument.synthType === 'MAMEDOC' ? DEFAULT_MAME_DOC :
      DEFAULT_MAME_VFX
    );

    const mameHandle = getToneEngine().getMAMESynthHandle(instrument.id);

    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
        {/* Use common header with visualization */}
        <EditorHeader
          instrument={instrument}
          onChange={onChange}
          vizMode={vizMode}
          onVizModeChange={setVizMode}
          showHelpButton={false}
        />

        {/* MAME Controls */}
        <div className="synth-editor-content overflow-y-auto p-4">
          <MAMEControls
            config={mameConfig}
            handle={mameHandle}
            onChange={handleMAMEChange}
          />
        </div>
      </div>
    );
  }

  // ============================================================================
  // DEXED (DX7) EDITOR
  // ============================================================================
  if (editorMode === 'dexed') {
    const dexedConfig = instrument.dexed || DEFAULT_DEXED;

    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
        {/* Use common header with visualization */}
        <EditorHeader
          instrument={instrument}
          onChange={onChange}
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
          <DexedControls
            config={dexedConfig}
            onChange={handleDexedChange}
          />
        </div>
      </div>
    );
  }

  // ============================================================================
  // OBXd (OBERHEIM) EDITOR
  // ============================================================================
  if (editorMode === 'obxd') {
    const obxdConfig = instrument.obxd || DEFAULT_OBXD;

    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
        {/* Use common header with visualization */}
        <EditorHeader
          instrument={instrument}
          onChange={onChange}
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
          <OBXdControls
            config={obxdConfig}
            onChange={handleOBXdChange}
          />
        </div>
      </div>
    );
  }

  // ============================================================================
  // GENERIC SYNTH EDITOR (default)
  // ============================================================================
  return (
    <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
      {/* Common header with visualization */}
      <EditorHeader
        instrument={instrument}
        onChange={onChange}
        vizMode={vizMode}
        onVizModeChange={setVizMode}
        showHelpButton
        showHelp={showHelp}
        onHelpToggle={() => setShowHelp(!showHelp)}
        onBake={handleBake}
        onBakePro={handleBakePro}
        onUnbake={handleUnbake}
        isBaked={isBaked}
        isBaking={isBaking}
      />

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
          onChange={onChange}
          activeTab={genericTab}
        />
      </div>
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
