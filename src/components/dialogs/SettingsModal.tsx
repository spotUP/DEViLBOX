/**
 * SettingsModal - Global application settings
 */

import React, { useState, useEffect } from 'react';
import { X, Maximize2, Keyboard, Usb } from 'lucide-react';
import { useUIStore } from '@stores/useUIStore';
import { useThemeStore, themes } from '@stores/useThemeStore';
import { useSettingsStore, type SIDEngineType } from '@stores/useSettingsStore';
import { LENS_PRESETS, LENS_PRESET_ORDER } from '@/pixi/LensFilter';
import { SID_ENGINES } from '@engine/deepsid/DeepSIDEngineManager';
import { useKeyboardStore } from '@stores/useKeyboardStore';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useModlandContributionModal } from '@stores/useModlandContributionModal';
import { Toggle } from '@components/controls/Toggle';
import { KeyboardShortcutSheet } from '@components/tracker/KeyboardShortcutSheet';
import { getTrackerReplayer } from '@engine/TrackerReplayer';
import { useAudioStore } from '@stores/useAudioStore';
import { getDJEngineIfActive } from '@engine/dj/DJEngine';
import { BG_MODES, getBgModeLabel } from '@/components/tracker/TrackerVisualBackground';
import { getASIDDeviceManager, isASIDSupported } from '@lib/sid/ASIDDeviceManager';

interface CRTSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}

const CRTSlider: React.FC<CRTSliderProps> = ({ label, value, min, max, step, onChange }) => (
  <div className="flex items-center justify-between gap-2">
    <label className="text-ft2-text text-[10px] font-mono w-28 shrink-0">{label}</label>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="flex-1 h-1 accent-ft2-highlight cursor-pointer"
    />
    <span className="text-ft2-textDim text-[10px] font-mono w-10 text-right tabular-nums">
      {value.toFixed(step < 0.01 ? 3 : step < 0.1 ? 2 : 1)}
    </span>
  </div>
);

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
    crtEnabled,
    crtParams,
    setCrtEnabled,
    setCrtParam,
    resetCrtParams,
    lensEnabled,
    lensPreset,
    lensParams,
    setLensEnabled,
    setLensPreset,
    setLensParam,
    resetLensParams,
    sidEngine,
    setSidEngine,
    asidEnabled,
    setAsidEnabled,
    asidDeviceId,
    setAsidDeviceId,
    asidDeviceAddress,
    setAsidDeviceAddress,
  } = useSettingsStore();

  const { sampleBusGain, setSampleBusGain, synthBusGain, setSynthBusGain, autoGain, setAutoGain } = useAudioStore();

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
  
  // ASID device management
  const [asidDevices, setAsidDevices] = useState<Array<{ id: string; name: string }>>([]);
  const [asidSupported, setAsidSupported] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);
  
  // Initialize ASID device manager
  useEffect(() => {
    setAsidSupported(isASIDSupported());
    if (isASIDSupported()) {
      const manager = getASIDDeviceManager();
      manager.init().then(() => {
        const devices = manager.getDevices();
        setAsidDevices(devices.map(d => ({ id: d.id, name: d.name })));
      });
      
      // Listen for device changes
      const unsubscribe = manager.onStateChange((state) => {
        setAsidDevices(state.devices.map(d => ({ id: d.id, name: d.name })));
      });
      
      return unsubscribe;
    }
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

          {/* CRT Shader Section */}
          <section>
            <h3 className="text-ft2-highlight text-xs font-bold mb-3 tracking-wide">CRT SHADER</h3>
            <div className="space-y-3">

              {/* Enable toggle */}
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <label className="text-ft2-text text-xs font-mono">CRT Effect:</label>
                  <span className="text-[9px] text-ft2-textDim font-mono">WebGL post-processing — scanlines, curvature, bloom</span>
                </div>
                <Toggle label="" value={crtEnabled} onChange={setCrtEnabled} size="sm" />
              </div>

              {/* Param sliders — only shown when enabled */}
              {crtEnabled && (
                <div className="space-y-2 border-t border-ft2-border pt-3">

                  <div className="text-[9px] text-ft2-highlight font-mono font-bold tracking-wide">SCANLINES</div>
                  <CRTSlider label="Intensity"  value={crtParams.scanlineIntensity} min={0}   max={1}    step={0.01}  onChange={(v) => setCrtParam('scanlineIntensity', v)} />
                  <CRTSlider label="Count"      value={crtParams.scanlineCount}     min={50}  max={1200} step={1}     onChange={(v) => setCrtParam('scanlineCount', v)} />
                  <CRTSlider label="Adaptive"   value={crtParams.adaptiveIntensity} min={0}   max={1}    step={0.01}  onChange={(v) => setCrtParam('adaptiveIntensity', v)} />

                  <div className="text-[9px] text-ft2-highlight font-mono font-bold tracking-wide pt-1">COLOR</div>
                  <CRTSlider label="Brightness" value={crtParams.brightness}        min={0.6} max={1.8}  step={0.01}  onChange={(v) => setCrtParam('brightness', v)} />
                  <CRTSlider label="Contrast"   value={crtParams.contrast}          min={0.6} max={1.8}  step={0.01}  onChange={(v) => setCrtParam('contrast', v)} />
                  <CRTSlider label="Saturation" value={crtParams.saturation}        min={0}   max={2}    step={0.01}  onChange={(v) => setCrtParam('saturation', v)} />

                  <div className="text-[9px] text-ft2-highlight font-mono font-bold tracking-wide pt-1">EFFECTS</div>
                  <CRTSlider label="Bloom Intensity" value={crtParams.bloomIntensity}  min={0} max={1.5} step={0.01}  onChange={(v) => setCrtParam('bloomIntensity', v)} />
                  <CRTSlider label="Bloom Threshold" value={crtParams.bloomThreshold}  min={0} max={1}   step={0.01}  onChange={(v) => setCrtParam('bloomThreshold', v)} />
                  <CRTSlider label="RGB Shift"       value={crtParams.rgbShift}        min={0} max={1}   step={0.01}  onChange={(v) => setCrtParam('rgbShift', v)} />

                  <div className="text-[9px] text-ft2-highlight font-mono font-bold tracking-wide pt-1">FRAMING</div>
                  <CRTSlider label="Vignette"   value={crtParams.vignetteStrength}  min={0}   max={2}   step={0.01}  onChange={(v) => setCrtParam('vignetteStrength', v)} />
                  <CRTSlider label="Curvature"  value={crtParams.curvature}         min={0}   max={0.5} step={0.005} onChange={(v) => setCrtParam('curvature', v)} />
                  <CRTSlider label="Flicker"    value={crtParams.flickerStrength}   min={0}   max={0.15} step={0.001} onChange={(v) => setCrtParam('flickerStrength', v)} />

                  <button
                    onClick={resetCrtParams}
                    className="w-full text-[10px] font-mono text-ft2-textDim border border-ft2-border hover:border-ft2-highlight hover:text-ft2-highlight px-2 py-1 transition-colors mt-1"
                  >
                    Reset to defaults
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* Lens Distortion Section */}
          <section>
            <h3 className="text-ft2-highlight text-xs font-bold mb-3 tracking-wide">LENS DISTORTION</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-ft2-text text-xs font-mono">Lens Effect:</label>
                  <div className="text-[9px] text-ft2-textDim font-mono">Fish-eye, barrel, chromatic aberration</div>
                </div>
                <Toggle label="" value={lensEnabled} onChange={setLensEnabled} size="sm" />
              </div>

              {lensEnabled && (
                <div className="space-y-2">
                  <div className="text-[9px] text-ft2-highlight font-mono font-bold tracking-wide">PRESET</div>
                  <div className="flex flex-wrap gap-1">
                    {LENS_PRESET_ORDER.filter((p) => p !== 'off').map((presetKey) => {
                      const preset = LENS_PRESETS[presetKey];
                      return (
                        <button
                          key={presetKey}
                          onClick={() => {
                            setLensPreset(presetKey);
                            setLensParam('barrel', preset.params.barrel);
                            setLensParam('chromatic', preset.params.chromatic);
                            setLensParam('vignette', preset.params.vignette);
                          }}
                          className={`text-[10px] font-mono px-2 py-0.5 border transition-colors ${
                            lensPreset === presetKey
                              ? 'border-ft2-highlight text-ft2-highlight bg-ft2-highlight/10'
                              : 'border-ft2-border text-ft2-textDim hover:border-ft2-highlight hover:text-ft2-highlight'
                          }`}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="text-[9px] text-ft2-highlight font-mono font-bold tracking-wide pt-1">MANUAL</div>
                  <CRTSlider label="Barrel"    value={lensParams.barrel}    min={-0.5} max={1}   step={0.01} onChange={(v) => { setLensParam('barrel', v); setLensPreset('custom'); }} />
                  <CRTSlider label="Chromatic" value={lensParams.chromatic} min={0}    max={1}   step={0.01} onChange={(v) => { setLensParam('chromatic', v); setLensPreset('custom'); }} />
                  <CRTSlider label="Vignette"  value={lensParams.vignette}  min={0}    max={1}   step={0.01} onChange={(v) => { setLensParam('vignette', v); setLensPreset('custom'); }} />

                  <button
                    onClick={resetLensParams}
                    className="w-full text-[10px] font-mono text-ft2-textDim border border-ft2-border hover:border-ft2-highlight hover:text-ft2-highlight px-2 py-1 transition-colors mt-1"
                  >
                    Reset to defaults
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* Workbench Section */}
          <section>
            <h3 className="text-ft2-highlight text-xs font-bold mb-3 tracking-wide">WORKBENCH</h3>
            <div className="space-y-3">
              {/* Keyboard hints */}
              <div className="text-[9px] text-ft2-textDim font-mono leading-tight">
                <span className="text-ft2-highlight">Tab</span> — hold for Exposé (fit all windows) · release to restore
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

          {/* DJ / Scratch Section */}
          <section>
            <h3 className="text-ft2-highlight text-xs font-bold mb-3 tracking-wide">DJ / SCRATCH</h3>
            <div className="space-y-3">
              {/* Scroll Acceleration */}
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <label className="text-ft2-text text-xs font-mono">Scroll Acceleration:</label>
                  <span className="text-[9px] text-ft2-textDim font-mono">Smooth scroll-to-scratch (off = raw 1:1)</span>
                </div>
                <Toggle
                  label=""
                  value={useUIStore.getState().scratchAcceleration}
                  onChange={(v) => useUIStore.getState().setScratchAcceleration(v)}
                  size="sm"
                />
              </div>

              {/* Scratch keyboard shortcuts info */}
              <div className="pt-2 border-t border-ft2-border/30">
                <div className="text-ft2-textDim text-[10px] font-mono space-y-1">
                  <div className="text-ft2-highlight font-bold">Scratch during playback:</div>
                  <div>Scroll wheel/trackpad controls speed &amp; direction</div>
                  <div className="mt-1 text-ft2-highlight font-bold">Keyboard (Shift+Alt):</div>
                  <div>F = Fader cut (hold) &middot; 1 = Trans &middot; 2 = Crab</div>
                  <div>3 = Flare &middot; 4 = Chirp &middot; 5 = Stab</div>
                  <div>6 = 8-Finger Crab &middot; 7 = Twiddle &middot; 0 = Stop</div>
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

              {/* Bus Gain Balance */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-ft2-text text-xs font-mono">Bus Gain Balance:</label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <span className="text-[9px] text-ft2-textDim font-mono">Auto</span>
                    <input
                      type="checkbox"
                      checked={autoGain}
                      onChange={(e) => setAutoGain(e.target.checked)}
                      className="accent-ft2-cursor"
                    />
                  </label>
                </div>
                <span className="text-[9px] text-ft2-textDim font-mono">
                  {autoGain ? 'Auto-balancing active — plays at least 1s to calibrate' : 'Balance sample vs synth/chip engine levels'}
                </span>
                <div className="flex items-center justify-between">
                  <span className={`text-[9px] font-mono w-16 ${autoGain ? 'text-ft2-textDim' : 'text-ft2-textDim'}`}>Samples</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={-12}
                      max={12}
                      step={1}
                      value={sampleBusGain}
                      onChange={(e) => setSampleBusGain(Number(e.target.value))}
                      disabled={autoGain}
                      className="w-20 accent-ft2-cursor disabled:opacity-40"
                    />
                    <span className="text-ft2-text text-[10px] font-mono w-10 text-right">
                      {sampleBusGain > 0 ? `+${sampleBusGain}` : sampleBusGain} dB
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-ft2-textDim font-mono w-16">Synths</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={-12}
                      max={12}
                      step={1}
                      value={synthBusGain}
                      onChange={(e) => setSynthBusGain(Number(e.target.value))}
                      disabled={autoGain}
                      className="w-20 accent-ft2-cursor disabled:opacity-40"
                    />
                    <span className="text-ft2-text text-[10px] font-mono w-10 text-right">
                      {synthBusGain > 0 ? `+${synthBusGain}` : synthBusGain} dB
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Scratch Section */}
          <section>
            <h3 className="text-ft2-highlight text-xs font-bold mb-3 tracking-wide">SCRATCH</h3>
            <div className="space-y-3">
              {/* Scratch Toggle */}
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <label className="text-ft2-text text-xs font-mono">Scratch Toggle:</label>
                  <span className="text-[9px] text-ft2-textDim font-mono">Always enable scratch (OFF = only during playback)</span>
                </div>
                <Toggle
                  label=""
                  value={useUIStore.getState().scratchEnabled}
                  onChange={(checked) => useUIStore.getState().setScratchEnabled(checked)}
                  size="sm"
                />
              </div>

              {/* Scroll Acceleration */}
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <label className="text-ft2-text text-xs font-mono">Scroll Acceleration:</label>
                  <span className="text-[9px] text-ft2-textDim font-mono">Smooth velocity curve vs raw 1:1 scroll</span>
                </div>
                <Toggle
                  label=""
                  value={useUIStore.getState().scratchAcceleration}
                  onChange={(checked) => useUIStore.getState().setScratchAcceleration(checked)}
                  size="sm"
                />
              </div>
              <div className="text-[9px] text-ft2-textDim font-mono leading-tight">
                Scroll the pattern editor during playback to vinyl scratch.
                Hold <kbd className="px-1 py-0.5 bg-ft2-border text-ft2-text rounded text-[8px]">Z</kbd> for fader cut (mute),
                hold <kbd className="px-1 py-0.5 bg-ft2-border text-ft2-text rounded text-[8px]">X</kbd> for crab scratch while scrolling.
                On touchscreens: 2-finger swipe = nudge, 3-finger touch = grab (hand on record).
                In DJ view, scratch is always enabled.
              </div>

              {/* Platter Mass */}
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <label className="text-ft2-text text-xs font-mono">Platter Mass:</label>
                  <span className="text-[9px] text-ft2-textDim font-mono">CDJ → Technics 1200 → Heavy</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={Math.round(useUIStore.getState().platterMass * 100)}
                    onChange={(e) => useUIStore.getState().setPlatterMass(parseInt(e.target.value) / 100)}
                    className="w-20 accent-ft2-cursor"
                  />
                  <span className="text-ft2-text text-[10px] font-mono w-8 text-right">
                    {Math.round(useUIStore.getState().platterMass * 100)}%
                  </span>
                </div>
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
            <div className="text-ft2-textDim text-[10px] font-mono space-y-1 mb-4">
              <div>DEViLBOX v1.0.0</div>
              <div>TB-303 Acid Tracker</div>
              <div className="text-ft2-highlight">Settings are saved automatically</div>
            </div>
            
            {/* Modland Integration */}
            <div className="mb-4">
              <h3 className="text-ft2-text text-xs font-bold mb-2 tracking-wide">MODLAND INTEGRATION</h3>
              <p className="text-ft2-textDim text-[9px] font-mono mb-2 leading-relaxed">
                When you import a module not in Modland's 727K+ file archive, a contribution modal appears.
                Dismiss it per-file to avoid notifications while working on your own music.
              </p>
              <button
                onClick={() => {
                  const { clearDismissedHashes } = useModlandContributionModal.getState();
                  clearDismissedHashes();
                  alert('Dismissed files cleared. Contribution modal will show again for all unknown modules.');
                }}
                className="px-3 py-1.5 bg-transparent border border-ft2-border text-ft2-text text-[10px] font-mono hover:bg-ft2-rowEven transition-colors focus:outline-none"
              >
                CLEAR DISMISSED FILES
              </button>
            </div>
            
            {/* C64 SID Engine Selection */}
            <div className="mb-4">
              <h3 className="text-ft2-text text-xs font-bold mb-2 tracking-wide">C64 SID PLAYER ENGINE</h3>
              <p className="text-ft2-textDim text-[9px] font-mono mb-2 leading-relaxed">
                Choose the emulation engine for C64 SID music playback (.sid files). Each engine offers different
                accuracy/performance tradeoffs. WebSID is recommended for best balance.
              </p>
              
              <div className="space-y-2">
                {Object.values(SID_ENGINES).map((engine) => (
                  <label
                    key={engine.id}
                    className={`block p-2 border cursor-pointer transition-colors ${
                      sidEngine === engine.id
                        ? 'bg-ft2-rowEven border-ft2-highlight'
                        : 'bg-transparent border-ft2-border hover:bg-ft2-rowEven/50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="sidEngine"
                        value={engine.id}
                        checked={sidEngine === engine.id}
                        onChange={(e) => setSidEngine(e.target.value as SIDEngineType)}
                        className="accent-ft2-highlight"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-ft2-text text-[10px] font-mono font-bold">
                            {engine.name}
                          </span>
                          <span className="text-ft2-textDim text-[9px] font-mono">
                            {engine.size}
                          </span>
                          {engine.id === 'websid' && (
                            <span className="text-ft2-highlight text-[9px] font-mono">
                              (Recommended)
                            </span>
                          )}
                        </div>
                        <div className="text-ft2-textDim text-[9px] font-mono mt-0.5">
                          {engine.description}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[8px] font-mono">
                          <span className="text-ft2-textDim">
                            Accuracy: <span className="text-ft2-text">{engine.accuracy}</span>
                          </span>
                          <span className="text-ft2-textDim">
                            Speed: <span className="text-ft2-text">{engine.speed}</span>
                          </span>
                          {!engine.requiresWASM && (
                            <span className="text-ft2-highlight">No WASM</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            
            {/* ASID Hardware Support */}
            <div className="mb-4">
              <h3 className="text-ft2-text text-xs font-bold mb-2 tracking-wide flex items-center gap-2">
                <Usb size={14} className="text-ft2-highlight" />
                ASID HARDWARE OUTPUT
              </h3>
              <p className="text-ft2-textDim text-[9px] font-mono mb-2 leading-relaxed">
                Route SID playback to real hardware (USB-SID-Pico, TherapSID) via MIDI for authentic
                MOS 6581/8580 sound. Requires ASID-compatible device connected via USB.
              </p>
              
              {!asidSupported ? (
                <div className="p-3 bg-ft2-bg/50 border border-ft2-border/50 rounded">
                  <div className="text-ft2-textDim text-[9px] font-mono">
                    <span className="text-accent-error">❌ Not Supported</span>
                    <p className="mt-1">
                      Web MIDI API not available in this browser. ASID hardware support requires
                      Chrome, Edge, or Opera. Firefox and Safari do not support Web MIDI.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Enable ASID Toggle */}
                  <label className="block p-2 border cursor-pointer transition-colors bg-transparent border-ft2-border hover:bg-ft2-rowEven/50">
                    <div className="flex items-center gap-2">
                      <Toggle
                        label=""
                        value={asidEnabled}
                        onChange={(enabled) => {
                          setAsidEnabled(enabled);
                          if (enabled && asidDevices.length === 1) {
                            setAsidDeviceId(asidDevices[0].id);
                            getASIDDeviceManager().selectDevice(asidDevices[0].id);
                          }
                        }}
                        size="sm"
                      />
                      <div className="flex-1">
                        <span className="text-ft2-text text-[10px] font-mono font-bold">
                          Enable ASID Hardware Output
                        </span>
                        <div className="text-ft2-textDim text-[9px] font-mono mt-0.5">
                          {asidEnabled ? 'SID writes sent to hardware' : 'Software emulation only'}
                        </div>
                      </div>
                    </div>
                  </label>
                  
                  {/* Device Selection */}
                  {asidEnabled && (
                    <div className="pl-2 space-y-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-ft2-text text-[9px] font-mono">MIDI Device:</label>
                        <select
                          value={asidDeviceId || ''}
                          onChange={(e) => {
                            const deviceId = e.target.value || null;
                            setAsidDeviceId(deviceId);
                            getASIDDeviceManager().selectDevice(deviceId);
                          }}
                          className="bg-ft2-bg border border-ft2-border text-ft2-text text-[10px] font-mono px-2 py-1 focus:outline-none focus:border-ft2-highlight"
                        >
                          {asidDevices.length === 0 ? (
                            <option value="">No ASID devices found</option>
                          ) : (
                            <>
                              <option value="">Select a device...</option>
                              {asidDevices.map((device) => (
                                <option key={device.id} value={device.id}>
                                  {device.name}
                                </option>
                              ))}
                            </>
                          )}
                        </select>
                      </div>
                      
                      {asidDevices.length === 0 && (
                        <div className="text-ft2-textDim text-[8px] font-mono leading-tight bg-ft2-bg/30 rounded p-2">
                          <p className="font-bold mb-1">No ASID devices detected.</p>
                          <ol className="list-decimal list-inside space-y-0.5">
                            <li>Connect USB-SID-Pico or TherapSID via USB</li>
                            <li>Ensure device drivers are installed</li>
                            <li>Grant MIDI permissions in browser if prompted</li>
                            <li>Refresh this settings modal</li>
                          </ol>
                        </div>
                      )}
                      
                      {/* Device Address */}
                      <div className="flex flex-col gap-1">
                        <label className="text-ft2-text text-[9px] font-mono">Device Address:</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={0}
                            max={255}
                            value={asidDeviceAddress}
                            onChange={(e) => setAsidDeviceAddress(parseInt(e.target.value) || 0x4D)}
                            className="bg-ft2-bg border border-ft2-border text-ft2-text text-[10px] font-mono px-2 py-1 w-20 focus:outline-none focus:border-ft2-highlight"
                          />
                          <span className="text-ft2-textDim text-[9px] font-mono">
                            (0x{asidDeviceAddress.toString(16).toUpperCase().padStart(2, '0')})
                          </span>
                          {asidDeviceAddress === 0x4D && (
                            <span className="text-ft2-highlight text-[9px] font-mono">Default</span>
                          )}
                        </div>
                        <div className="text-ft2-textDim text-[8px] font-mono">
                          USB-SID-Pico default: 0x4D (77)
                        </div>
                      </div>
                      
                      {/* Info Box */}
                      <div className="text-ft2-textDim text-[8px] font-mono leading-tight bg-ft2-bg/30 rounded p-2">
                        <p className="font-bold mb-1">About ASID:</p>
                        <p>
                          ASID (Audio over Serial Interface Device) protocol sends SID register writes
                          via MIDI SysEx to real hardware. Only jsSID engine supports ASID — other engines
                          will fall back to software emulation.
                        </p>
                        <p className="mt-1">
                          Learn more: <a href="https://github.com/LouDnl/USBSID-Pico" target="_blank" rel="noopener noreferrer" className="text-ft2-highlight underline">USB-SID-Pico GitHub</a>
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <div>
              <h3 className="text-ft2-highlight text-xs font-bold mb-2 tracking-wide">DANGER ZONE</h3>
              <p className="text-ft2-textDim text-[9px] font-mono mb-2">
                If the app fails to load or behaves unexpectedly, clearing all local state will reset it to factory defaults.
                Your project will be lost if not exported first.
              </p>
              <button
                onClick={() => {
                  if (!confirm('Clear all app state and reload? This will delete your unsaved project and all settings.')) return;
                  navigator.serviceWorker.getRegistrations()
                    .then(regs => Promise.all(regs.map(r => r.unregister())))
                    .then(() => caches.keys())
                    .then(keys => Promise.all(keys.map(k => caches.delete(k))))
                    .then(() => { localStorage.clear(); return indexedDB.databases(); })
                    .then(dbs => Promise.all(dbs.map(db => indexedDB.deleteDatabase(db.name!))))
                    .then(() => location.reload());
                }}
                className="px-3 py-1.5 bg-transparent border border-accent-error/60 text-accent-error text-[10px] font-mono hover:bg-accent-error/10 transition-colors focus:outline-none"
              >
                CLEAR ALL STATE &amp; RELOAD
              </button>
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
