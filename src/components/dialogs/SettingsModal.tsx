/**
 * SettingsModal - Global application settings
 */

import React, { useState, useEffect } from 'react';
import { X, Maximize2 } from 'lucide-react';
import { useUIStore } from '@stores/useUIStore';
import { useThemeStore, themes } from '@stores/useThemeStore';
import { useSettingsStore } from '@stores/useSettingsStore';
import { Toggle } from '@components/controls/Toggle';

interface SettingsModalProps {
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const {
    useHexNumbers,
    setUseHexNumbers,
    blankEmptyCells,
    setBlankEmptyCells,
    tb303Collapsed,
    setTB303Collapsed,
    oscilloscopeVisible,
    setOscilloscopeVisible,
    compactToolbar,
    setCompactToolbar,
  } = useUIStore();

  const { currentThemeId, setTheme } = useThemeStore();
  const {
    amigaLimits,
    setAmigaLimits,
    linearInterpolation,
    setLinearInterpolation,
    audioLatency,
    setAudioLatency,
    autoLatency,
    setAutoLatency,
    midiPolyphonic,
    setMidiPolyphonic
  } = useSettingsStore();

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error('Failed to toggle fullscreen:', err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-ft2-bg border-2 border-ft2-border w-full max-w-lg shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-ft2-header border-b-2 border-ft2-border">
          <h2 className="text-ft2-highlight font-bold text-sm tracking-wide">SETTINGS</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-ft2-border transition-colors text-ft2-text hover:text-ft2-highlight focus:outline-none"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-6 max-h-[70vh] overflow-y-auto scrollbar-ft2">
          {/* Display Section */}
          <section>
            <h3 className="text-ft2-highlight text-xs font-bold mb-3 tracking-wide">DISPLAY</h3>
            <div className="space-y-3">
              {/* Theme */}
              <div className="flex items-center justify-between">
                <label className="text-ft2-text text-xs font-mono">Theme:</label>
                <select
                  value={currentThemeId}
                  onChange={(e) => setTheme(e.target.value)}
                  className="bg-ft2-bg border border-ft2-border text-ft2-text text-xs font-mono px-2 py-1 focus:outline-none focus:border-ft2-highlight"
                >
                  {themes.map((theme) => (
                    <option key={theme.id} value={theme.id} className="bg-ft2-bg text-ft2-text">
                      {theme.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Number Format */}
              <div className="flex items-center justify-between">
                <label className="text-ft2-text text-xs font-mono">Number Format:</label>
                <select
                  value={useHexNumbers ? 'hex' : 'dec'}
                  onChange={(e) => setUseHexNumbers(e.target.value === 'hex')}
                  className="bg-ft2-bg border border-ft2-border text-ft2-text text-xs font-mono px-2 py-1 focus:outline-none focus:border-ft2-highlight"
                >
                  <option value="hex" className="bg-ft2-bg text-ft2-text">Hexadecimal (01, 02, 0A, 0F)</option>
                  <option value="dec" className="bg-ft2-bg text-ft2-text">Decimal (01, 02, 10, 15)</option>
                </select>
              </div>

              {/* Blank Empty Cells */}
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <label className="text-ft2-text text-xs font-mono">Blank Empty Cells:</label>
                  <span className="text-[9px] text-ft2-textDim font-mono">Hide ---, .., ... on empty rows</span>
                </div>
                <Toggle
                  label=""
                  value={blankEmptyCells}
                  onChange={setBlankEmptyCells}
                  size="sm"
                />
              </div>
            </div>
          </section>

          {/* Layout Section */}
          <section>
            <h3 className="text-ft2-highlight text-xs font-bold mb-3 tracking-wide">LAYOUT</h3>
            <div className="space-y-3">
              {/* TB-303 Panel */}
              <div className="flex items-center justify-between">
                <label className="text-ft2-text text-xs font-mono">TB-303 Panel:</label>
                <Toggle
                  label=""
                  value={!tb303Collapsed}
                  onChange={(checked) => setTB303Collapsed(!checked)}
                  size="sm"
                />
              </div>

              {/* Oscilloscope */}
              <div className="flex items-center justify-between">
                <label className="text-ft2-text text-xs font-mono">Oscilloscope:</label>
                <Toggle
                  label=""
                  value={oscilloscopeVisible}
                  onChange={setOscilloscopeVisible}
                  size="sm"
                />
              </div>

              {/* Compact Toolbar */}
              <div className="flex items-center justify-between">
                <label className="text-ft2-text text-xs font-mono">Compact Toolbar:</label>
                <Toggle
                  label=""
                  value={compactToolbar}
                  onChange={setCompactToolbar}
                  size="sm"
                />
              </div>

              {/* Fullscreen */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Maximize2 size={14} className="text-ft2-textDim" />
                  <label className="text-ft2-text text-xs font-mono">Fullscreen:</label>
                </div>
                <Toggle
                  label=""
                  value={isFullscreen}
                  onChange={toggleFullscreen}
                  size="sm"
                />
              </div>
            </div>
          </section>

          {/* MIDI Section */}
          <section>
            <h3 className="text-ft2-highlight text-xs font-bold mb-3 tracking-wide">MIDI</h3>
            <div className="space-y-3">
              {/* Polyphonic Mode */}
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <label className="text-ft2-text text-xs font-mono">Polyphonic Mode:</label>
                  <span className="text-[9px] text-ft2-textDim font-mono">Play multiple notes simultaneously</span>
                </div>
                <Toggle
                  label=""
                  value={midiPolyphonic}
                  onChange={setMidiPolyphonic}
                  size="sm"
                />
              </div>
            </div>
          </section>

          {/* Engine Section */}
          <section>
            <h3 className="text-ft2-highlight text-xs font-bold mb-3 tracking-wide">ENGINE</h3>
            <div className="space-y-3">
              {/* Amiga Limits */}
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <label className="text-ft2-text text-xs font-mono">Amiga Limits:</label>
                  <span className="text-[9px] text-ft2-textDim font-mono">Clamp periods to 113-856</span>
                </div>
                <Toggle
                  label=""
                  value={amigaLimits}
                  onChange={setAmigaLimits}
                  size="sm"
                />
              </div>

              {/* Linear Interpolation */}
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <label className="text-ft2-text text-xs font-mono">Sample Interpolation:</label>
                  <span className="text-[9px] text-ft2-textDim font-mono">Linear (clean) vs None (crunchy)</span>
                </div>
                <Toggle
                  label=""
                  value={linearInterpolation}
                  onChange={setLinearInterpolation}
                  size="sm"
                />
              </div>

              {/* Audio Latency */}
              <div className="flex items-center justify-between border-t border-ft2-border/30 pt-3">
                <div className="flex flex-col">
                  <label className="text-ft2-text text-xs font-mono">Audio Latency Mode:</label>
                  <span className="text-[9px] text-ft2-textDim font-mono">Low latency for live jamming vs stable playback</span>
                </div>
                <select
                  value={audioLatency}
                  onChange={(e) => setAudioLatency(e.target.value as any)}
                  className="bg-ft2-bg border border-ft2-border text-ft2-text text-[10px] font-mono px-2 py-1 focus:outline-none focus:border-ft2-highlight"
                >
                  <option value="interactive">Interactive (10ms)</option>
                  <option value="balanced">Balanced (50ms)</option>
                  <option value="playback">Stable (150ms)</option>
                </select>
              </div>

              {/* Auto Latency Toggle */}
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <label className="text-ft2-text text-xs font-mono">Dynamic Latency:</label>
                  <span className="text-[9px] text-ft2-textDim font-mono">Instant (10ms) when stopped, stable when playing</span>
                </div>
                <Toggle
                  label=""
                  value={autoLatency}
                  onChange={setAutoLatency}
                  size="sm"
                />
              </div>
            </div>
          </section>

          {/* Info Section */}
          <section className="pt-4 border-t border-ft2-border">
            <div className="text-ft2-textDim text-[10px] font-mono space-y-1">
              <div>DEViLBOX v1.0.0</div>
              <div>TB-303 Acid Tracker</div>
              <div className="text-ft2-highlight">Settings are saved automatically</div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-ft2-header border-t-2 border-ft2-border flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-ft2-cursor border border-ft2-cursor text-ft2-bg text-xs font-bold hover:bg-ft2-highlight hover:border-ft2-highlight transition-colors focus:outline-none"
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
};
