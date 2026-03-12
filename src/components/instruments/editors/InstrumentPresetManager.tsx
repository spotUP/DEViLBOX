/**
 * InstrumentPresetManager - Synth-branded header components with preset controls
 *
 * Contains custom EditorHeader wrappers for specific synth types that include
 * branded headers with PresetDropdown, Live toggle, and mode switches.
 */

import React from 'react';
import type { InstrumentConfig } from '@typedefs/instrument';
import { DEFAULT_V2_SPEECH } from '@typedefs/instrument';
import { EditorHeader, type VizMode } from '../shared/EditorHeader';
import { PresetDropdown } from '../presets/PresetDropdown';
import { Box, Drum, Megaphone, Zap, Radio, Mic } from 'lucide-react';

export interface SynthHeaderProps {
  instrument: InstrumentConfig;
  handleChange: (updates: Partial<InstrumentConfig>) => void;
  vizMode: VizMode;
  onVizModeChange: (mode: VizMode) => void;
  isBaked: boolean;
  isBaking: boolean;
  onBake: () => Promise<void>;
  onBakePro: () => Promise<void>;
  onUnbake: () => void;
  isCyanTheme: boolean;
}

// ============================================================================
// SPACE LASER HEADER
// ============================================================================

export const SpaceLaserHeader: React.FC<SynthHeaderProps> = ({
  instrument, handleChange, vizMode, onVizModeChange,
  isBaked, isBaking, onBake, onBakePro, onUnbake, isCyanTheme,
}) => {
  const accentColor = isCyanTheme ? '#00ffff' : '#00ff00';
  const headerBg = isCyanTheme
    ? 'bg-[#041010] border-b-2 border-accent-highlight'
    : 'bg-gradient-to-r from-[#2a2a2a] to-[#1a1a1a] border-b-4 border-[#00ff00]';

  return (
    <EditorHeader
      instrument={instrument}
      onChange={handleChange}
      vizMode={vizMode}
      onVizModeChange={onVizModeChange}
      onBake={onBake}
      onBakePro={onBakePro}
      onUnbake={onUnbake}
      isBaked={isBaked}
      isBaking={isBaking}
      customHeader={
        <div className={`synth-editor-header px-4 py-3 ${headerBg}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-green-500 to-green-700 shadow-lg">
                <Zap size={24} className="text-text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-black tracking-tight" style={{ color: accentColor }}>SPACE LASER</h2>
                <p className={`text-[10px] uppercase tracking-widest ${isCyanTheme ? 'text-accent-highlight' : 'text-text-secondary'}`}>Cosmic Zap Generator</p>
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
                onChange={handleChange}
              />
            </div>
          </div>
        </div>
      }
    />
  );
};

// ============================================================================
// V2 SYNTH HEADER
// ============================================================================

export const V2Header: React.FC<SynthHeaderProps> = ({
  instrument, handleChange, vizMode, onVizModeChange,
  isBaked, isBaking, onBake, onBakePro, onUnbake, isCyanTheme,
}) => {
  const accentColor = isCyanTheme ? '#00ffff' : '#ffaa00';
  const headerBg = isCyanTheme
    ? 'bg-[#041010] border-b-2 border-accent-highlight'
    : 'bg-gradient-to-r from-[#2a2a2a] to-[#1a1a1a] border-b-4 border-[#ffaa00]';

  const handleEnableSpeech = () => {
    handleChange({ v2Speech: { ...DEFAULT_V2_SPEECH } });
  };

  return (
    <EditorHeader
      instrument={instrument}
      onChange={handleChange}
      vizMode={vizMode}
      onVizModeChange={onVizModeChange}
      onBake={onBake}
      onBakePro={onBakePro}
      onUnbake={onUnbake}
      isBaked={isBaked}
      isBaking={isBaking}
      customHeader={
        <div className={`synth-editor-header px-4 py-3 ${headerBg}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-amber-500 to-amber-700 shadow-lg">
                <Box size={24} className="text-text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-black tracking-tight" style={{ color: accentColor }}>V2 SYNTH</h2>
                <p className={`text-[10px] uppercase tracking-widest ${isCyanTheme ? 'text-accent-highlight' : 'text-text-secondary'}`}>Farbrausch 4k Intro Engine</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Mode Toggle: Switch to Speech */}
              <button
                onClick={handleEnableSpeech}
                className="p-1.5 rounded transition-all flex items-center gap-1.5 px-2 bg-dark-bgTertiary text-text-muted hover:text-amber-400 hover:bg-amber-500/10 border border-dark-borderLight"
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
                    : 'bg-dark-bgTertiary text-text-muted hover:text-text-secondary border border-dark-borderLight'
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

// ============================================================================
// DUB SIREN HEADER
// ============================================================================

export const DubSirenHeader: React.FC<SynthHeaderProps> = ({
  instrument, handleChange, vizMode, onVizModeChange,
  isBaked, isBaking, onBake, onBakePro, onUnbake, isCyanTheme,
}) => {
  const accentColor = isCyanTheme ? '#00ffff' : '#ff4444';
  const headerBg = isCyanTheme
    ? 'bg-[#041010] border-b-2 border-accent-highlight'
    : 'bg-gradient-to-r from-[#2a2a2a] to-[#1a1a1a] border-b-4 border-[#ff4444]';

  return (
    <EditorHeader
      instrument={instrument}
      onChange={handleChange}
      vizMode={vizMode}
      onVizModeChange={onVizModeChange}
      onBake={onBake}
      onBakePro={onBakePro}
      onUnbake={onUnbake}
      isBaked={isBaked}
      isBaking={isBaking}
      customHeader={
        <div className={`synth-editor-header px-4 py-3 ${headerBg}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-red-500 to-red-700 shadow-lg">
                <Megaphone size={24} className="text-text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-black tracking-tight" style={{ color: accentColor }}>DUB SIREN</h2>
                <p className={`text-[10px] uppercase tracking-widest ${isCyanTheme ? 'text-accent-highlight' : 'text-text-secondary'}`}>Sound System Generator</p>
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
                onChange={handleChange}
              />
            </div>
          </div>
        </div>
      }
    />
  );
};

// ============================================================================
// SYNARE HEADER
// ============================================================================

export const SynareHeader: React.FC<SynthHeaderProps> = ({
  instrument, handleChange, vizMode, onVizModeChange,
  isBaked, isBaking, onBake, onBakePro, onUnbake, isCyanTheme,
}) => {
  const accentColor = isCyanTheme ? '#00ffff' : '#ffcc00';
  const headerBg = isCyanTheme
    ? 'bg-[#041010] border-b-2 border-accent-highlight'
    : 'bg-gradient-to-r from-[#2a2a2a] to-[#1a1a1a] border-b-4 border-[#ffcc00]';

  return (
    <EditorHeader
      instrument={instrument}
      onChange={handleChange}
      vizMode={vizMode}
      onVizModeChange={onVizModeChange}
      onBake={onBake}
      onBakePro={onBakePro}
      onUnbake={onUnbake}
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
                <p className={`text-[10px] uppercase tracking-widest ${isCyanTheme ? 'text-accent-highlight' : 'text-text-secondary'}`}>Electronic Percussion</p>
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
                onChange={handleChange}
              />
            </div>
          </div>
        </div>
      }
    />
  );
};
