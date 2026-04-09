/**
 * EditorHeader - Common header component for all instrument editors
 *
 * Provides consistent UX across all instrument types:
 * - Synth icon and type dropdown with categories
 * - Synth description
 * - Preset dropdown
 * - Visualization toggle (Oscilloscope/Spectrum)
 * - Level meter
 */

import React from 'react';
import * as LucideIcons from 'lucide-react';
import { Activity, BarChart2, HelpCircle, Layers, User, Radio, Flame, History, Loader2, Download, Zap } from 'lucide-react';
import { VisualizerFrame } from '@components/visualization/VisualizerFrame';
import { CustomSelect } from '@components/common/CustomSelect';
import { getSynthInfo, SYNTH_CATEGORIES } from '@constants/synthCategories';
import { getSynthHelp } from '@constants/synthHelp';
import { ToneEngine } from '@engine/ToneEngine';
import { PresetDropdown } from '../presets/PresetDropdown';
import {
  InstrumentOscilloscope,
  InstrumentSpectrum,
  InstrumentSpectrogram,
  InstrumentLissajous,
} from '@components/visualization';
import type { InstrumentConfig, SynthType } from '@typedefs/instrument';
import {
  DEFAULT_TB303,
  DEFAULT_DRUM_MACHINE,
  DEFAULT_CHIP_SYNTH,
  DEFAULT_PWM_SYNTH,
  DEFAULT_WAVETABLE,
  DEFAULT_GRANULAR,
  DEFAULT_SUPERSAW,
  DEFAULT_POLYSYNTH,
  DEFAULT_ORGAN,
  DEFAULT_STRING_MACHINE,
  DEFAULT_FORMANT_SYNTH,
  DEFAULT_FURNACE,
  DEFAULT_BUZZMACHINE,
  DEFAULT_WOBBLE_BASS,
  DEFAULT_DRUMKIT,
  DEFAULT_DUB_SIREN,
  DEFAULT_SPACE_LASER,
  DEFAULT_SYNARE,
} from '@/types/instrument';

export type VizMode = 'oscilloscope' | 'spectrum' | 'spectrogram' | 'lissajous';

export interface EditorHeaderProps {
  instrument: InstrumentConfig;
  onChange: (updates: Partial<InstrumentConfig>) => void;
  vizMode: VizMode;
  onVizModeChange: (mode: VizMode) => void;
  /** Hide visualization section (for sample-based if needed) */
  hideVisualization?: boolean;
  /** Show help button and expandable help panel */
  showHelpButton?: boolean;
  /** External help panel state */
  showHelp?: boolean;
  onHelpToggle?: () => void;
  /** Custom header content (for TB303's distinctive branding) */
  customHeader?: React.ReactNode;
  /** Custom header controls (injected into default header) */
  customHeaderControls?: React.ReactNode;
  /** Compact mode for specialized editors */
  compact?: boolean;
  /** Precalc/Bake functionality */
  onBake?: () => void;
  onBakePro?: () => void;
  onUnbake?: () => void;
  isBaked?: boolean;
  isBaking?: boolean;
}

/** Check if synth type uses Sample editor */
function isSampleType(synthType: SynthType): boolean {
  return ['Sampler', 'Player', 'GranularSynth', 'DrumKit', 'ChiptuneModule'].includes(synthType);
}

/**
 * Handle synth type change - clears old configs and initializes new defaults
 */
function handleSynthTypeChange(
  instrument: InstrumentConfig,
  newType: SynthType,
  onChange: (updates: Partial<InstrumentConfig>) => void
) {
  if (newType === instrument.synthType) return;

  // Invalidate ToneEngine cache so it recreates the instrument
  ToneEngine.getInstance().invalidateInstrument(instrument.id);

  // Build update with cleared configs and new type
  const newSynthInfo = getSynthInfo(newType);
  const updates: Partial<InstrumentConfig> = {
    synthType: newType,
    name: newSynthInfo.name,
    // Clear all synth-specific configs
    tb303: undefined,
    drumMachine: undefined,
    chipSynth: undefined,
    pwmSynth: undefined,
    wavetable: undefined,
    granular: undefined,
    superSaw: undefined,
    polySynth: undefined,
    organ: undefined,
    stringMachine: undefined,
    formantSynth: undefined,
    furnace: undefined,
    wobbleBass: undefined,
    drumKit: undefined,
    buzzmachine: undefined,
    dubSiren: undefined,
    spaceLaser: undefined,
    synare: undefined,
    effects: [],
  };

  // Initialize appropriate default config
  switch (newType) {
    case 'TB303': updates.tb303 = { ...DEFAULT_TB303 }; break;
    case 'DrumMachine': updates.drumMachine = { ...DEFAULT_DRUM_MACHINE }; break;
    case 'ChipSynth': updates.chipSynth = { ...DEFAULT_CHIP_SYNTH }; break;
    case 'PWMSynth': updates.pwmSynth = { ...DEFAULT_PWM_SYNTH }; break;
    case 'Wavetable': updates.wavetable = { ...DEFAULT_WAVETABLE }; break;
    case 'GranularSynth': updates.granular = { ...DEFAULT_GRANULAR }; break;
    case 'SuperSaw': updates.superSaw = { ...DEFAULT_SUPERSAW }; break;
    case 'PolySynth': updates.polySynth = { ...DEFAULT_POLYSYNTH }; break;
    case 'Organ': updates.organ = { ...DEFAULT_ORGAN }; break;
    case 'StringMachine': updates.stringMachine = { ...DEFAULT_STRING_MACHINE }; break;
    case 'FormantSynth': updates.formantSynth = { ...DEFAULT_FORMANT_SYNTH }; break;
    case 'WobbleBass': updates.wobbleBass = { ...DEFAULT_WOBBLE_BASS }; break;
    case 'DrumKit': updates.drumKit = { ...DEFAULT_DRUMKIT }; break;
    case 'DubSiren': 
      updates.dubSiren = { ...DEFAULT_DUB_SIREN };
      // Add default dub effects
      updates.effects = [
        {
          id: Math.random().toString(36).substring(7),
          category: 'tonejs',
          type: 'SpaceEcho',
          enabled: true,
          wet: 80,
          parameters: {
            mode: 4,
            rate: 350,
            intensity: 0.6,
            echoVolume: 0.8,
            reverbVolume: 0.3,
          }
        },
        {
          id: Math.random().toString(36).substring(7),
          category: 'tonejs',
          type: 'DubFilter',
          enabled: true,
          wet: 100,
          parameters: {
            cutoff: 45, // Resonant lowpass
            resonance: 4,
            gain: 1.2,
          }
        }
      ];
      break;
    case 'SpaceLaser':
      updates.spaceLaser = { ...DEFAULT_SPACE_LASER };
      break;
    case 'Synare':
      updates.synare = { ...DEFAULT_SYNARE };
      // Add a bit of reverb for Synare
      updates.effects = [
        {
          id: Math.random().toString(36).substring(7),
          category: 'tonejs',
          type: 'Reverb',
          enabled: true,
          wet: 30,
          parameters: {
            decay: 2.5,
            preDelay: 0.01,
          }
        }
      ];
      break;
  }
  // Furnace types get default furnace config
  if (newType.startsWith('Furnace')) {
    updates.furnace = { ...DEFAULT_FURNACE };
  }
  // Buzzmachine types get default buzzmachine config
  if (newType === 'Buzzmachine' || newType.startsWith('Buzz')) {
    updates.buzzmachine = { ...DEFAULT_BUZZMACHINE };
  }

  onChange(updates);
}

export const EditorHeader: React.FC<EditorHeaderProps> = ({
  instrument,
  onChange,
  vizMode,
  onVizModeChange,
  hideVisualization = false,
  showHelpButton = false,
  showHelp = false,
  onHelpToggle,
  customHeader,
  customHeaderControls,
  compact = false,
  onBake,
  onBakePro,
  onUnbake,
  isBaked,
  isBaking,
}) => {
  const synthInfo = getSynthInfo(instrument.synthType);
  const synthHelp = getSynthHelp(instrument.synthType);

  // If custom header is provided, render it instead of the default
  if (customHeader) {
    return (
      <>
        {customHeader}
        {!hideVisualization && (
          <VisualizationRow
            instrument={instrument}
            vizMode={vizMode}
            onVizModeChange={onVizModeChange}
            compact={compact}
          />
        )}
      </>
    );
  }

  return (
    <>
      {/* Synth Info Header */}
      <div className="synth-editor-header px-4 py-3 bg-[#1a1a1a]">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg bg-gradient-to-br from-gray-800 to-gray-900 ${synthInfo.color}`}>
            <SynthIconDisplay iconName={synthInfo.icon} size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {/* Synth Type Selector with Categories */}
              <CustomSelect
                value={instrument.synthType}
                onChange={(v) => handleSynthTypeChange(instrument, v as SynthType, onChange)}
                className="px-2 py-1 text-sm font-medium bg-dark-bgTertiary border border-dark-borderLight rounded text-text-primary hover:border-dark-borderLight focus:border-blue-500 focus:outline-none cursor-pointer"
                title="Switch synth type"
                options={SYNTH_CATEGORIES.map((category) => ({
                  label: category.name,
                  options: category.synths
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((synth) => ({
                      value: synth.type,
                      label: synth.name,
                    })),
                }))}
              />
            </div>
            <p className="text-xs text-text-secondary truncate">{synthInfo.description}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Custom Header Controls (injected from parent) */}
            {customHeaderControls}

            {/* Live Mode Toggle */}
            <button
              onClick={() => onChange({ isLive: !instrument.isLive })}
              className={`p-1.5 rounded transition-all flex items-center gap-1.5 px-2 ${
                instrument.isLive
                  ? 'bg-accent-success/20 text-accent-success ring-1 ring-accent-success/50 animate-pulse-glow'
                  : 'bg-dark-bgTertiary text-text-muted hover:text-text-secondary border border-dark-borderLight'
              }`}
              title={instrument.isLive ? 'Live Mode Active: Bypasses lookahead for zero-latency jamming' : 'Enable Live Mode: Bypasses lookahead buffer'}
            >
              <Radio size={14} className={instrument.isLive ? 'animate-pulse' : ''} />
              <span className="text-[10px] font-bold uppercase tracking-tight">
                {instrument.isLive ? 'LIVE' : 'STD'}
              </span>
            </button>

            {/* Polyphony Toggle */}
            <button
              onClick={() => onChange({ monophonic: !instrument.monophonic })}
              className={`p-1.5 rounded transition-all flex items-center gap-1.5 px-2 ${
                instrument.monophonic
                  ? 'bg-orange-500/20 text-orange-400 ring-1 ring-orange-500/50'
                  : 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/50'
              }`}
              title={instrument.monophonic ? 'Switch to Polyphonic' : 'Switch to Monophonic'}
            >
              {instrument.monophonic ? <User size={14} /> : <Layers size={14} />}
              <span className="text-[10px] font-bold uppercase tracking-tight">
                {instrument.monophonic ? 'Mono' : 'Poly'}
              </span>
            </button>

            {/* Precalc/Bake Button */}
            {(onBake || onUnbake) && !isSampleType(instrument.synthType) && (
              <button
                onClick={isBaked ? onUnbake : onBake}
                disabled={isBaking}
                className={`p-1.5 rounded transition-all flex items-center gap-1.5 px-2 ${
                  isBaked
                    ? 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/50 hover:bg-amber-500/30'
                    : 'bg-dark-bgTertiary text-text-secondary hover:text-text-primary hover:bg-dark-bgHover border border-dark-borderLight'
                } ${isBaking ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={isBaked 
                  ? 'Unbake: Revert to live synth engine' 
                  : 'Lite Bake: Render single C-4 sample (fast & small)'}
              >
                {isBaking ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : isBaked ? (
                  <History size={14} />
                ) : (
                  <Flame size={14} />
                )}
                <span className="text-[10px] font-bold uppercase tracking-tight">
                  {isBaking ? 'BAKING' : isBaked ? 'UNBAKE' : 'BAKE'}
                </span>
              </button>
            )}

            {/* Pro Bake Button */}
            {!isBaked && onBakePro && !isSampleType(instrument.synthType) && (
              <button
                onClick={onBakePro}
                disabled={isBaking}
                className={`p-1.5 rounded transition-all flex items-center gap-1.5 px-2 bg-dark-bgTertiary text-text-secondary hover:text-text-primary hover:bg-dark-bgHover border border-dark-borderLight ${isBaking ? 'opacity-50 cursor-not-allowed' : ''}`}
                title="Pro Bake: Render every unique note used in the song for maximum accuracy"
              >
                {isBaking ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} className="text-amber-400" />}
                <span className="text-[10px] font-bold uppercase tracking-tight">PRO</span>
              </button>
            )}

            {/* Download Baked Sample Button */}
            {isBaked && instrument.sample?.url && (
              <button
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = instrument.sample!.url;
                  link.download = `${instrument.name || 'baked-sample'}.wav`;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }}
                className="p-1.5 rounded bg-dark-bgTertiary text-text-secondary hover:text-text-primary hover:bg-dark-bgHover border border-dark-borderLight transition-all flex items-center gap-1.5 px-2"
                title="Download baked sample as WAV"
              >
                <Download size={14} />
                <span className="text-[10px] font-bold uppercase tracking-tight">WAV</span>
              </button>
            )}

            <PresetDropdown
              synthType={instrument.synthType}
              currentPresetName={instrument.name}
              onChange={onChange}
            />
            {showHelpButton && onHelpToggle && (
              <button
                onClick={onHelpToggle}
                className={`p-1.5 rounded transition-all ${
                  showHelp
                    ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500'
                    : 'bg-dark-bgTertiary text-text-secondary hover:text-text-primary hover:bg-dark-bgHover'
                }`}
                title="Show help"
              >
                <HelpCircle size={16} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Help Panel (collapsible) */}
      {showHelp && synthHelp && (
        <div className="px-4 py-3 bg-gradient-to-r from-blue-900/20 to-purple-900/20 border-b border-dark-border text-xs">
          <p className="text-text-secondary mb-2">{synthHelp.overview}</p>
          {synthHelp.tips.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {synthHelp.tips.slice(0, 3).map((tip, i) => (
                <li key={i} className="text-text-secondary bg-black/30 px-2 py-1 rounded">
                  {tip}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Visualization Row */}
      {!hideVisualization && (
        <VisualizationRow
          instrument={instrument}
          vizMode={vizMode}
          onVizModeChange={onVizModeChange}
          compact={compact}
        />
      )}
    </>
  );
};

/**
 * VisualizationRow - Oscilloscope/Spectrum toggle and displays
 * Can be used independently or as part of EditorHeader
 */
interface VisualizationRowProps {
  instrument: InstrumentConfig;
  vizMode: VizMode;
  onVizModeChange: (mode: VizMode) => void;
  compact?: boolean;
  /** Custom height for the visualization */
  height?: number;
}

export const VisualizationRow: React.FC<VisualizationRowProps> = ({
  instrument,
  vizMode,
  onVizModeChange,
  compact = false,
  height = 60,
}) => {
  const vizHeight = compact ? 48 : height;

  return (
    <div className="synth-editor-viz-header">
      {/* Visualization Mode Toggle */}
      <div className="flex bg-dark-bgSecondary rounded p-0.5">
        <button
          onClick={() => onVizModeChange('oscilloscope')}
          className={`px-2 py-1 text-xs font-medium rounded transition-all ${
            vizMode === 'oscilloscope'
              ? 'bg-dark-bgHover text-text-primary'
              : 'text-text-muted hover:text-text-secondary'
          }`}
          title="Oscilloscope"
        >
          <Activity size={12} className="inline mr-1" />
          Scope
        </button>
        <button
          onClick={() => onVizModeChange('spectrum')}
          className={`px-2 py-1 text-xs font-medium rounded transition-all ${
            vizMode === 'spectrum'
              ? 'bg-dark-bgHover text-text-primary'
              : 'text-text-muted hover:text-text-secondary'
          }`}
          title="Frequency Spectrum"
        >
          <BarChart2 size={12} className="inline mr-1" />
          FFT
        </button>
        <button
          onClick={() => onVizModeChange('spectrogram')}
          className={`px-2 py-1 text-xs font-medium rounded transition-all ${
            vizMode === 'spectrogram'
              ? 'bg-dark-bgHover text-text-primary'
              : 'text-text-muted hover:text-text-secondary'
          }`}
          title="Spectrogram (time-frequency heatmap)"
        >
          <Layers size={12} className="inline mr-1" />
          Gram
        </button>
        <button
          onClick={() => onVizModeChange('lissajous')}
          className={`px-2 py-1 text-xs font-medium rounded transition-all ${
            vizMode === 'lissajous'
              ? 'bg-dark-bgHover text-text-primary'
              : 'text-text-muted hover:text-text-secondary'
          }`}
          title="Lissajous / Phase Scope"
        >
          <Radio size={12} className="inline mr-1" />
          X/Y
        </button>
      </div>

      {/* Visualization Display */}
      <VisualizerFrame variant="compact" className="flex-1" style={{ height: vizHeight }}>
        {vizMode === 'oscilloscope' ? (
          <InstrumentOscilloscope
            instrumentId={instrument.id}
            width="auto"
            height={vizHeight}
            color="#4ade80"
            backgroundColor="#000000"
          />
        ) : vizMode === 'spectrum' ? (
          <InstrumentSpectrum
            instrumentId={instrument.id}
            width="auto"
            height={vizHeight}
            barCount={48}
            color="#22c55e"
            colorEnd="#ef4444"
            backgroundColor="#000000"
          />
        ) : vizMode === 'spectrogram' ? (
          <InstrumentSpectrogram
            instrumentId={instrument.id}
            width="auto"
            height={vizHeight}
            backgroundColor="#000000"
          />
        ) : (
          <InstrumentLissajous
            instrumentId={instrument.id}
            width="auto"
            height={vizHeight}
            color="#4ade80"
            backgroundColor="#000000"
          />
        )}
      </VisualizerFrame>
    </div>
  );
};

/** Static sub-component to avoid creating icon components during render */
const SynthIconDisplay: React.FC<{ iconName: string; size: number }> = ({ iconName, size }) => {
  const Icon = (LucideIcons as unknown as Record<string, LucideIcons.LucideIcon>)[iconName] || LucideIcons.Music2;
  return React.createElement(Icon, { size });
};

export default EditorHeader;
