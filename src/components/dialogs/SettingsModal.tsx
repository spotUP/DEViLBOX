/**
 * SettingsModal - Global application settings
 */

import React, { useState, useEffect } from 'react';
import { X, Maximize2, Keyboard } from 'lucide-react';
import { useUIStore } from '@stores/useUIStore';
import { useThemeStore, themes } from '@stores/useThemeStore';
import { useSettingsStore } from '@stores/useSettingsStore';
import { useKeyboardStore } from '@stores/useKeyboardStore';
import { useTrackerStore } from '@stores/useTrackerStore';
import { Toggle } from '@components/controls/Toggle';
import { KeyboardShortcutSheet } from '@components/tracker/KeyboardShortcutSheet';
import { getTrackerReplayer } from '@engine/TrackerReplayer';
import { getDJEngineIfActive } from '@engine/dj/DJEngine';
import { BG_MODES, getBgModeLabel } from '@/components/tracker/TrackerVisualBackground';

const KEYBOARD_SCHEMES = [
  { id: 'fasttracker2', name: 'FastTracker 2', description: 'Classic FT2 layout (DOS/PC) - from ft2-clone source' },
  { id: 'impulse-tracker', name: 'Impulse Tracker', description: 'IT/Schism Tracker style - from schismtracker source' },
  { id: 'protracker', name: 'ProTracker', description: 'Amiga MOD tracker layout - from pt2-clone source' },
  { id: 'octamed', name: 'OctaMED SoundStudio', description: 'Amiga OctaMED layout - from official documentation' },
  { id: 'renoise', name: 'Renoise', description: 'Modern DAW/tracker layout - from official documentation' },
  { id: 'openmpt', name: 'OpenMPT', description: 'ModPlug Tracker layout - from official wiki documentation' },
];

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
    useBLEP,
    setUseBLEP,
    stereoSeparation,
    setStereoSeparation,
    stereoSeparationMode,
    modplugSeparation,
    setStereoSeparationMode,
    setModplugSeparation,
    midiPolyphonic,
    setMidiPolyphonic,
    trackerVisualBg,
    setTrackerVisualBg,
    trackerVisualMode,
    setTrackerVisualMode,
    renderMode,
    setRenderMode,
  } = useSettingsStore();

  const {
    editStep, setEditStep,
    insertMode, toggleInsertMode,
    recQuantEnabled, setRecQuantEnabled,
    recQuantRes, setRecQuantRes,
    recReleaseEnabled, setRecReleaseEnabled
  } = useTrackerStore();

  const { activeScheme, setActiveScheme, platformOverride, setPlatformOverride } = useKeyboardStore();

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);
  const [showShortcuts, setShowShortcuts] = useState(false);

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

  const applyModeToReplayers = (mode: 'pt2' | 'modplug') => {
    getTrackerReplayer().setStereoSeparationMode(mode);
    const djEngine = getDJEngineIfActive();
    if (djEngine) {
      djEngine.deckA.replayer.setStereoSeparationMode(mode);
      djEngine.deckB.replayer.setStereoSeparationMode(mode);
    }
  };

  const applyModplugSeparationToReplayers = (percent: number) => {
    getTrackerReplayer().setModplugSeparation(percent);
    const djEngine = getDJEngineIfActive();
    if (djEngine) {
      djEngine.deckA.replayer.setModplugSeparation(percent);
      djEngine.deckB.replayer.setModplugSeparation(percent);
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

              {/* UI Render Mode */}
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <label className="text-ft2-text text-xs font-mono">UI Render Mode:</label>
                  <span className="text-[9px] text-ft2-textDim font-mono">Switch between DOM and WebGL rendering</span>
                </div>
                <select
                  value={renderMode}
                  onChange={(e) => setRenderMode(e.target.value as 'dom' | 'webgl')}
                  className="bg-ft2-bg border border-ft2-border text-ft2-text text-xs font-mono px-2 py-1 focus:outline-none focus:border-ft2-highlight"
                >
                  <option value="dom" className="bg-ft2-bg text-ft2-text">DOM (React + Tailwind)</option>
                  <option value="webgl" className="bg-ft2-bg text-ft2-text">WebGL (PixiJS v8)</option>
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

              {/* Visual Background */}
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <label className="text-ft2-text text-xs font-mono">Visual Background:</label>
                  <span className="text-[9px] text-ft2-textDim font-mono">WebGL audio-reactive effects behind tracker</span>
                </div>
                <Toggle
                  label=""
                  value={trackerVisualBg}
                  onChange={setTrackerVisualBg}
                  size="sm"
                />
              </div>

              {/* Visual Background Mode (only shown when enabled) */}
              {trackerVisualBg && (
                <div className="flex items-center justify-between">
                  <label className="text-ft2-text text-xs font-mono">Visual Mode:</label>
                  <select
                    value={trackerVisualMode}
                    onChange={(e) => setTrackerVisualMode(Number(e.target.value))}
                    className="bg-ft2-bg border border-ft2-border text-ft2-text text-xs font-mono px-2 py-1 focus:outline-none focus:border-ft2-highlight"
                  >
                    {BG_MODES.map((bg, i) => (
                      <option key={i} value={i} className="bg-ft2-bg text-ft2-text">
                        {getBgModeLabel(bg)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
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

          {/* Recording Section */}
          <section>
            <h3 className="text-ft2-highlight text-xs font-bold mb-3 tracking-wide">RECORDING</h3>
            <div className="space-y-3">
              {/* Edit Step */}
              <div className="flex items-center justify-between">
                <label className="text-ft2-text text-xs font-mono">Edit Step:</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={editStep}
                    onChange={(e) => setEditStep(Number(e.target.value))}
                    min={0}
                    max={16}
                    className="bg-ft2-bg border border-ft2-border text-ft2-text text-[10px] font-mono w-12 px-1 py-0.5"
                  />
                  <span className="text-[9px] text-ft2-textDim font-mono">rows</span>
                </div>
              </div>

              {/* Edit Mode */}
              <div className="flex items-center justify-between">
                <label className="text-ft2-text text-xs font-mono">Edit Mode:</label>
                <select
                  value={insertMode ? 'insert' : 'overwrite'}
                  onChange={(e) => {
                    const wantInsert = e.target.value === 'insert';
                    if (wantInsert !== insertMode) toggleInsertMode();
                  }}
                  className="bg-ft2-bg border border-ft2-border text-ft2-text text-[10px] font-mono px-2 py-1 focus:outline-none focus:border-ft2-highlight"
                >
                  <option value="overwrite">Overwrite</option>
                  <option value="insert">Insert (Shift Rows)</option>
                </select>
              </div>

              {/* Record Release */}
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <label className="text-ft2-text text-xs font-mono">Record Key-Off:</label>
                  <span className="text-[9px] text-ft2-textDim font-mono">Record === when keys are released</span>
                </div>
                <Toggle
                  label=""
                  value={recReleaseEnabled}
                  onChange={setRecReleaseEnabled}
                  size="sm"
                />
              </div>

              {/* Quantization */}
              <div className="flex items-center justify-between">
                <label className="text-ft2-text text-xs font-mono">Quantization:</label>
                <div className="flex items-center gap-2">
                  <Toggle
                    label=""
                    value={recQuantEnabled}
                    onChange={setRecQuantEnabled}
                    size="sm"
                  />
                  <select
                    value={recQuantRes}
                    onChange={(e) => setRecQuantRes(Number(e.target.value))}
                    disabled={!recQuantEnabled}
                    className="bg-ft2-bg border border-ft2-border text-ft2-text text-[10px] font-mono px-2 py-1 focus:outline-none focus:border-ft2-highlight disabled:opacity-30"
                  >
                    <option value={1}>1 row</option>
                    <option value={2}>2 rows</option>
                    <option value={4}>4 rows (1/4)</option>
                    <option value={8}>8 rows (1/2)</option>
                    <option value={16}>16 rows (1 beat)</option>
                  </select>
                </div>
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

              {/* Mobile MIDI Info */}
              <div className="pt-3 border-t border-ft2-border/30">
                <div className="text-ft2-textDim text-[10px] font-mono space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-ft2-highlight">Mobile MIDI:</span>
                    <span>
                      {(() => {
                        const isIOS = /iPad|iPhone|iPod/i.test(navigator.userAgent) || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
                        const hasWebMIDI = 'requestMIDIAccess' in navigator;

                        if (!hasWebMIDI) return '❌ Not supported';
                        if (isIOS) return '🎹 iOS (Bluetooth pairing required)';
                        return '✅ Supported';
                      })()}
                    </span>
                  </div>

                  {/* iOS Bluetooth Instructions */}
                  {(() => {
                    const isIOS = /iPad|iPhone|iPod/i.test(navigator.userAgent) || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
                    if (isIOS) {
                      return (
                        <div className="bg-ft2-bg/50 rounded p-2 text-[9px] leading-relaxed">
                          <div className="font-bold mb-1">To connect Bluetooth MIDI:</div>
                          <ol className="list-decimal list-inside space-y-0.5 ml-1">
                            <li>Open Settings → Bluetooth</li>
                            <li>Turn on your MIDI device</li>
                            <li>Pair it with your device</li>
                            <li>Return to DEViLBOX and refresh</li>
                          </ol>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
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

              {/* BLEP Synthesis */}
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <label className="text-ft2-text text-xs font-mono">BLEP Synthesis:</label>
                  <span className="text-[9px] text-ft2-textDim font-mono">Band-limited (reduces aliasing)</span>
                </div>
                <Toggle
                  label=""
                  value={useBLEP}
                  onChange={setUseBLEP}
                  size="sm"
                />
              </div>

              {/* Stereo Separation */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-ft2-text text-xs font-mono">Stereo Separation:</label>
                  {/* Algorithm mode toggle */}
                  <div className="flex gap-1">
                    {(['pt2', 'modplug'] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => {
                          setStereoSeparationMode(m);
                          applyModeToReplayers(m);
                        }}
                        className={[
                          'text-[9px] font-mono px-2 py-0.5 rounded border transition-colors',
                          stereoSeparationMode === m
                            ? 'bg-ft2-cursor border-ft2-cursor text-black'
                            : 'bg-transparent border-ft2-border text-ft2-textDim hover:border-ft2-text',
                        ].join(' ')}
                      >
                        {m === 'pt2' ? 'PT2-Clone' : 'ModPlug'}
                      </button>
                    ))}
                  </div>
                </div>

                {stereoSeparationMode === 'pt2' ? (
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-ft2-textDim font-mono">0% mono · 20% Amiga · 100% full</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={stereoSeparation}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setStereoSeparation(v);
                          getTrackerReplayer().setStereoSeparation(v);
                          const djEng = getDJEngineIfActive();
                          if (djEng) {
                            djEng.deckA.replayer.setStereoSeparation(v);
                            djEng.deckB.replayer.setStereoSeparation(v);
                          }
                        }}
                        className="w-20 accent-ft2-cursor"
                      />
                      <span className="text-ft2-text text-[10px] font-mono w-8 text-right">{stereoSeparation}%</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-ft2-textDim font-mono">0% mono · 100% normal · 200% wide</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={0}
                        max={200}
                        step={5}
                        value={modplugSeparation}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setModplugSeparation(v);
                          applyModplugSeparationToReplayers(v);
                        }}
                        className="w-20 accent-ft2-cursor"
                      />
                      <span className="text-ft2-text text-[10px] font-mono w-8 text-right">{modplugSeparation}%</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Keyboard Section */}
          <section>
            <h3 className="text-ft2-highlight text-xs font-bold mb-3 tracking-wide">KEYBOARD</h3>
            <div className="space-y-3">
              {/* Keyboard Scheme */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-ft2-text text-xs font-mono">Keyboard Scheme:</label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowShortcuts(true)}
                      className="p-1.5 bg-ft2-bg border border-ft2-border text-ft2-text hover:text-ft2-highlight hover:border-ft2-highlight transition-colors focus:outline-none flex items-center justify-center"
                      title="View current keybindings"
                    >
                      <Keyboard size={14} />
                    </button>
                    <select
                      value={activeScheme}
                      onChange={(e) => setActiveScheme(e.target.value)}
                      className="bg-ft2-bg border border-ft2-border text-ft2-text text-[10px] font-mono px-2 py-1 focus:outline-none focus:border-ft2-highlight"
                    >
                      {KEYBOARD_SCHEMES.map((scheme) => (
                        <option key={scheme.id} value={scheme.id}>
                          {scheme.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <span className="text-[9px] text-ft2-textDim font-mono leading-tight">
                  {KEYBOARD_SCHEMES.find(s => s.id === activeScheme)?.description || 'Select a tracker layout'}
                </span>
              </div>

              {/* Platform Override */}
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <label className="text-ft2-text text-xs font-mono">Platform:</label>
                  <span className="text-[9px] text-ft2-textDim font-mono">Override Cmd/Ctrl detection</span>
                </div>
                <select
                  value={platformOverride}
                  onChange={(e) => setPlatformOverride(e.target.value as 'auto' | 'mac' | 'pc')}
                  className="bg-ft2-bg border border-ft2-border text-ft2-text text-[10px] font-mono px-2 py-1 focus:outline-none focus:border-ft2-highlight"
                >
                  <option value="auto">Auto-detect</option>
                  <option value="mac">Mac (Cmd)</option>
                  <option value="pc">PC (Ctrl)</option>
                </select>
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

      {/* Keyboard Shortcut Sheet */}
      <KeyboardShortcutSheet 
        isOpen={showShortcuts} 
        onClose={() => setShowShortcuts(false)} 
      />
    </div>
  );
};
