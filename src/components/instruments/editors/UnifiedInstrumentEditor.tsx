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
import { 
  DEFAULT_FURNACE, DEFAULT_TB303, DEFAULT_DUB_SIREN, DEFAULT_SYNARE,
  DEFAULT_MAME_VFX, DEFAULT_MAME_DOC, DEFAULT_MAME_RSA
} from '@typedefs/instrument';
import { EditorHeader, type VizMode } from '../shared/EditorHeader';
import { SynthEditorTabs, type SynthEditorTab, TB303Tabs, type TB303Tab } from '../shared/SynthEditorTabs';
import { TB303Controls } from '../controls/TB303Controls';
import { FurnaceControls } from '../controls/FurnaceControls';
import { BuzzmachineControls } from '../controls/BuzzmachineControls';
import { SampleControls } from '../controls/SampleControls';
import { DubSirenControls } from '../controls/DubSirenControls';
import { SynareControls } from '../controls/SynareControls';
import { MAMEControls } from '../controls/MAMEControls';
import { FilterCurve } from '@components/ui/FilterCurve';
import { Zap } from 'lucide-react';
import { useThemeStore } from '@stores';
import { getToneEngine } from '@engine/ToneEngine';

// Import the tab content renderers from VisualSynthEditor
// We'll keep the existing tab content implementations
import { renderSpecialParameters, renderGenericTabContent } from './VisualSynthEditorContent';

// Types
type EditorMode = 'generic' | 'tb303' | 'furnace' | 'buzzmachine' | 'sample' | 'dubsiren' | 'synare' | 'mame';

interface UnifiedInstrumentEditorProps {
  instrument: InstrumentConfig;
  onChange: (updates: Partial<InstrumentConfig>) => void;
}

// ============================================================================
// SYNTH TYPE CATEGORIZATION HELPERS
// ============================================================================

/** Check if synth type uses MAME editor */
function isMAMEType(synthType: SynthType): boolean {
  return ['MAMEVFX', 'MAMEDOC', 'MAMERSA'].includes(synthType);
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

/** Check if synth type is Synare */
function isSynareType(synthType: SynthType): boolean {
  return synthType === 'Synare';
}

/** Get the editor mode for a synth type */
function getEditorMode(synthType: SynthType): EditorMode {
  if (synthType === 'TB303') return 'tb303';
  if (isFurnaceType(synthType)) return 'furnace';
  if (isBuzzmachineType(synthType)) return 'buzzmachine';
  if (isSampleType(synthType)) return 'sample';
  if (isDubSirenType(synthType)) return 'dubsiren';
  if (isSynareType(synthType)) return 'synare';
  if (isMAMEType(synthType)) return 'mame';
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
  const [tb303Tab, setTB303Tab] = useState<TB303Tab>('main');

  const editorMode = getEditorMode(instrument.synthType);

  // Theme for TB303 custom header
  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const isCyanTheme = currentThemeId === 'cyan-lineart';

  // Handle TB303 config updates
  const handleTB303Change = useCallback((updates: Partial<typeof instrument.tb303>) => {
    const currentTB303 = instrument.tb303 || DEFAULT_TB303;
    onChange({
      tb303: { ...currentTB303, ...updates },
    });
  }, [instrument.tb303, onChange]);

  // Handle Dub Siren config updates
  const handleDubSirenChange = useCallback((updates: Partial<typeof instrument.dubSiren>) => {
    const currentDubSiren = instrument.dubSiren || DEFAULT_DUB_SIREN;
    onChange({
      dubSiren: { ...currentDubSiren, ...updates },
    });
  }, [instrument.dubSiren, onChange]);

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
      instrument.synthType === 'MAMERSA' ? DEFAULT_MAME_RSA :
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

  // Determine which tabs to hide based on synth type for generic editor
  const getHiddenTabs = (): SynthEditorTab[] => {
    const hidden: SynthEditorTab[] = [];
    if (isSampleType(instrument.synthType)) {
      hidden.push('oscillator');
    }
    if (!instrument.oscillator && !isSampleType(instrument.synthType)) {
      hidden.push('oscillator');
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
    const accentColor = isCyanTheme ? '#00ffff' : '#ffcc00';
    const filterColor = isCyanTheme ? '#00ffff' : '#ff6600';
    const headerBg = isCyanTheme
      ? 'bg-[#041010] border-b-2 border-cyan-500'
      : 'bg-gradient-to-r from-[#2a2a2a] to-[#1a1a1a] border-b-4 border-[#ffcc00]';
    const mainBg = isCyanTheme
      ? 'bg-[#030808]'
      : 'bg-gradient-to-b from-[#1e1e1e] to-[#151515]';

    // Custom TB303 header
    const tb303Header = (
      <div className={`synth-editor-header px-4 py-2 ${headerBg}`}>
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-lg" style={{ background: isCyanTheme ? 'linear-gradient(135deg, #00ffff, #008888)' : 'linear-gradient(135deg, #ffcc00, #ff9900)' }}>
            <Zap size={18} className="text-black" />
          </div>
          <div>
            <h2 className="text-lg font-black tracking-tight" style={{ color: accentColor }}>TB-303</h2>
            <p className={`text-[10px] uppercase tracking-widest ${isCyanTheme ? 'text-cyan-600' : 'text-gray-400'}`}>Bass Line</p>
          </div>
        </div>
      </div>
    );

    // Custom filter curve visualization instead of generic viz
    const tb303Viz = (
      <div className="synth-editor-viz-header">
        <div className="flex-1 bg-[#1a1a1a] rounded-lg overflow-hidden">
          <FilterCurve
            cutoff={instrument.tb303.filter.cutoff}
            resonance={instrument.tb303.filter.resonance / 3.3}
            type="lowpass"
            onCutoffChange={(v) => handleTB303Change({ filter: { ...instrument.tb303!.filter, cutoff: v } })}
            onResonanceChange={(v) => handleTB303Change({ filter: { ...instrument.tb303!.filter, resonance: v * 3.3 } })}
            height={70}
            color={filterColor}
          />
        </div>
      </div>
    );

    return (
      <div className={`synth-editor-container ${mainBg}`}>
        {tb303Header}
        {tb303Viz}

        {/* Tab Bar */}
        <TB303Tabs
          activeTab={tb303Tab}
          onTabChange={setTB303Tab}
          devilFishEnabled={instrument.tb303.devilFish?.enabled || false}
        />

        {/* Tab Content - Use TB303Controls but skip header/filter viz */}
        <div className="synth-editor-content">
          <TB303Controls
            config={instrument.tb303}
            onChange={handleTB303Change}
            showFilterCurve={false}
            showHeader={false}
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
        <DubSirenControls
          config={instrument.dubSiren}
          instrumentId={instrument.id}
          onChange={handleDubSirenChange}
        />
      </div>
    );
  }

  // ============================================================================
  // SYNARE EDITOR
  // ============================================================================
  if (editorMode === 'synare' && instrument.synare) {
    return (
      <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
        <SynareControls
          config={instrument.synare}
          instrumentId={instrument.id}
          onChange={handleSynareChange}
        />
      </div>
    );
  }

  // ============================================================================
  // MAME SYNTH EDITOR
  // ============================================================================
  if (editorMode === 'mame') {
    const mameConfig = instrument.mame || (
      instrument.synthType === 'MAMEDOC' ? DEFAULT_MAME_DOC :
      instrument.synthType === 'MAMERSA' ? DEFAULT_MAME_RSA :
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
        showHelpButton={true}
        showHelp={showHelp}
        onHelpToggle={() => setShowHelp(!showHelp)}
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
