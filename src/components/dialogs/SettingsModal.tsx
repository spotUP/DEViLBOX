/**
 * SettingsModal - Global application settings
 * Organized into logical tabs for easier navigation.
 */

import React, { useState, useEffect } from 'react';
import { X, Maximize2, Keyboard, Usb } from 'lucide-react';
import { useUIStore } from '@stores/useUIStore';
import { useThemeStore, themes, THEME_TOKEN_GROUPS } from '@stores/useThemeStore';
import { useSettingsStore, type SIDEngineType } from '@stores/useSettingsStore';
import { LENS_PRESETS, LENS_PRESET_ORDER } from '@/pixi/LensFilter';
import { SID_ENGINES } from '@engine/deepsid/DeepSIDEngineManager';
import { useKeyboardStore } from '@stores/useKeyboardStore';
import { useEditorStore } from '@stores/useEditorStore';
import { useModlandContributionModal } from '@stores/useModlandContributionModal';
import { Toggle } from '@components/controls/Toggle';
import { KeyboardShortcutSheet } from '@components/tracker/KeyboardShortcutSheet';
import { getTrackerReplayer } from '@engine/TrackerReplayer';
import { useAudioStore } from '@stores/useAudioStore';
import { getDJEngineIfActive } from '@engine/dj/DJEngine';
import { BG_MODES, getBgModeLabel } from '@/components/tracker/TrackerVisualBackground';
import { getASIDDeviceManager, isASIDSupported } from '@lib/sid/ASIDDeviceManager';
import { useModalClose } from '@hooks/useDialogKeyboard';

/** Normalize any CSS color to #RRGGBB for <input type="color"> */
function normalizeToHex6(color: string): string {
  const s = color.trim();
  const rgbaMatch = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1], 10);
    const g = parseInt(rgbaMatch[2], 10);
    const b = parseInt(rgbaMatch[3], 10);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }
  if (s.startsWith('#') && s.length === 9) return s.slice(0, 7);
  if (s.startsWith('#') && s.length === 4) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  if (s.startsWith('#')) return s.slice(0, 7);
  return '#000000';
}

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

type SettingsTab = 'general' | 'audio' | 'visual' | 'recording' | 'input' | 'sid' | 'about';

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'audio', label: 'Audio' },
  { id: 'visual', label: 'Visual' },
  { id: 'recording', label: 'Recording' },
  { id: 'input', label: 'Input' },
  { id: 'sid', label: 'SID' },
  { id: 'about', label: 'About' },
];

interface SettingsModalProps {
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  
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

  const { currentThemeId, setTheme, customThemeColors, setCustomColor, resetCustomTheme, copyThemeToCustom } = useThemeStore();
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
    asidEnabled: _asidEnabled,
    setAsidEnabled,
    asidDeviceId,
    setAsidDeviceId,
    asidDeviceAddress: _asidDeviceAddress,
    setAsidDeviceAddress: _setAsidDeviceAddress,
    sidHardwareMode,
    setSidHardwareMode,
    webusbClockRate: _webusbClockRate,
    setWebusbClockRate: _setWebusbClockRate,
    webusbStereo: _webusbStereo,
    setWebusbStereo: _setWebusbStereo,
    vuMeterMode,
    setVuMeterMode,
    vuMeterStyle,
    setVuMeterStyle,
    vuMeterSwing,
    setVuMeterSwing,
    vuMeterMirror,
    setVuMeterMirror,
    customBannerImage,
    setCustomBannerImage,
    wobbleWindows,
    setWobbleWindows,
  } = useSettingsStore();

  const { sampleBusGain, setSampleBusGain, synthBusGain, setSynthBusGain, autoGain, setAutoGain } = useAudioStore();

  const {
    editStep, setEditStep,
    insertMode, toggleInsertMode,
    recQuantEnabled, setRecQuantEnabled,
    recQuantRes, setRecQuantRes,
    recReleaseEnabled, setRecReleaseEnabled
  } = useEditorStore();

  const { activeScheme, setActiveScheme, platformOverride, setPlatformOverride } = useKeyboardStore();

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);
  const [showShortcuts, setShowShortcuts] = useState(false);
  
  // ASID device management
  const [asidDevices, setAsidDevices] = useState<Array<{ id: string; name: string }>>([]);
  const [asidSupported, setAsidSupported] = useState(false);
  const [webusbSupported] = useState(() => typeof navigator !== 'undefined' && 'usb' in navigator);
  const [webusbConnected, setWebusbConnected] = useState(false);
  const [webusbDeviceName, setWebusbDeviceName] = useState<string | null>(null);
  const [_webusbFirmware, setWebusbFirmware] = useState<string | null>(null);
  const [_webusbChips, setWebusbChips] = useState<Array<{ slot: number; detected: boolean; type?: string }> | null>(null);

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
    // Forward to libopenmpt (convert to 0-200 scale)
    const val = mode === 'pt2'
      ? useSettingsStore.getState().stereoSeparation * 2
      : useSettingsStore.getState().modplugSeparation;
    applyLibopenmptSeparation(val);
  };

  const applyModplugSeparationToReplayers = (percent: number) => {
    getTrackerReplayer().setModplugSeparation(percent);
    const djEngine = getDJEngineIfActive();
    if (djEngine) {
      djEngine.deckA.replayer.setModplugSeparation(percent);
      djEngine.deckB.replayer.setModplugSeparation(percent);
    }
  };

  /** Forward stereo separation to libopenmpt WASM worklet (0-200 scale). */
  const applyLibopenmptSeparation = (percent200: number) => {
    import('@engine/libopenmpt/LibopenmptEngine').then(({ LibopenmptEngine }) => {
      if (LibopenmptEngine.hasInstance()) {
        LibopenmptEngine.getInstance().setStereoSeparation(percent200);
      }
    }).catch(() => {});
  };

  // Standard modal keyboard handling (Enter/Escape to close)
  useModalClose({ isOpen: true, onClose });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div 
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className="bg-ft2-bg border-2 border-ft2-border w-full max-w-2xl shadow-xl outline-none"
      >
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

        {/* Tab Bar */}
        <div className="flex border-b border-ft2-border bg-ft2-header/50 px-2 overflow-x-auto scrollbar-ft2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-2 text-[10px] font-mono font-bold tracking-wide transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'text-ft2-highlight border-b-2 border-ft2-highlight -mb-px'
                  : 'text-ft2-textDim hover:text-ft2-text'
              }`}
            >
              {tab.label.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto scrollbar-ft2">
          
          {/* ═══════════════════════════════════════════════════════════════════
              GENERAL TAB
              ═══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'general' && (
            <>
              {/* Theme */}
              <section>
                <h3 className="text-ft2-highlight text-xs font-bold mb-3 tracking-wide">THEME</h3>
                <div className="space-y-3">
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

                  {/* Custom Theme Editor */}
                  {currentThemeId === 'custom' && customThemeColors && (
                    <div className="border border-ft2-border rounded p-2 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] text-ft2-textDim font-mono">Copy colors from:</span>
                        <div className="flex gap-1 flex-wrap">
                          {themes.filter(t => t.id !== 'custom').map(t => (
                            <button
                              key={t.id}
                              onClick={() => copyThemeToCustom(t.id)}
                              className="text-[8px] font-mono px-1.5 py-0.5 rounded border border-ft2-border text-ft2-textDim hover:border-ft2-text hover:text-ft2-text transition-colors"
                            >
                              {t.name}
                            </button>
                          ))}
                          <button
                            onClick={resetCustomTheme}
                            className="text-[8px] font-mono px-1.5 py-0.5 rounded border border-ft2-border text-ft2-textDim hover:border-red-400 hover:text-red-400 transition-colors"
                          >
                            Reset
                          </button>
                        </div>
                      </div>
                      <div className="max-h-[200px] overflow-y-auto scrollbar-ft2 space-y-2">
                        {THEME_TOKEN_GROUPS.map(group => (
                          <div key={group.label}>
                            <span className="text-[9px] text-ft2-highlight font-mono font-bold">{group.label}</span>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-0.5">
                              {group.tokens.map(({ key, label }) => (
                                <div key={key} className="flex items-center gap-1.5">
                                  <input
                                    type="color"
                                    value={normalizeToHex6(customThemeColors[key])}
                                    onChange={(e) => setCustomColor(key, e.target.value)}
                                    className="w-5 h-4 border border-ft2-border rounded cursor-pointer bg-transparent [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none"
                                  />
                                  <span className="text-[8px] text-ft2-textDim font-mono truncate">{label}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* Display */}
              <section>
                <h3 className="text-ft2-highlight text-xs font-bold mb-3 tracking-wide">DISPLAY</h3>
                <div className="space-y-3">
                  {/* UI Render Mode */}
                  {!/iPhone|iPod|Android.*Mobile/i.test(navigator.userAgent) && (
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
                        <option value="dom">DOM (React)</option>
                        <option value="webgl">WebGL (PixiJS)</option>
                      </select>
                    </div>
                  )}

                  {/* Number Format */}
                  <div className="flex items-center justify-between">
                    <label className="text-ft2-text text-xs font-mono">Number Format:</label>
                    <select
                      value={useHexNumbers ? 'hex' : 'dec'}
                      onChange={(e) => setUseHexNumbers(e.target.value === 'hex')}
                      className="bg-ft2-bg border border-ft2-border text-ft2-text text-xs font-mono px-2 py-1 focus:outline-none focus:border-ft2-highlight"
                    >
                      <option value="hex">Hexadecimal</option>
                      <option value="dec">Decimal</option>
                    </select>
                  </div>

                  {/* Blank Empty Cells */}
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <label className="text-ft2-text text-xs font-mono">Blank Empty Cells:</label>
                      <span className="text-[9px] text-ft2-textDim font-mono">Hide ---, .., ... on empty rows</span>
                    </div>
                    <Toggle label="" value={blankEmptyCells} onChange={setBlankEmptyCells} size="sm" />
                  </div>

                  {/* Fullscreen */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Maximize2 size={14} className="text-ft2-textDim" />
                      <label className="text-ft2-text text-xs font-mono">Fullscreen:</label>
                    </div>
                    <Toggle label="" value={isFullscreen} onChange={toggleFullscreen} size="sm" />
                  </div>
                </div>
              </section>

              {/* Layout */}
              <section>
                <h3 className="text-ft2-highlight text-xs font-bold mb-3 tracking-wide">LAYOUT</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-ft2-text text-xs font-mono">TB-303 Panel:</label>
                    <Toggle label="" value={!tb303Collapsed} onChange={(v) => setTB303Collapsed(!v)} size="sm" />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-ft2-text text-xs font-mono">Oscilloscope:</label>
                    <Toggle label="" value={oscilloscopeVisible} onChange={setOscilloscopeVisible} size="sm" />
                  </div>
                </div>
              </section>
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              AUDIO TAB
              ═══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'audio' && (
            <>
              {/* Engine */}
              <section>
                <h3 className="text-ft2-highlight text-xs font-bold mb-3 tracking-wide">ENGINE</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <label className="text-ft2-text text-xs font-mono">Amiga Limits:</label>
                      <span className="text-[9px] text-ft2-textDim font-mono">Clamp periods to 113-856</span>
                    </div>
                    <Toggle label="" value={amigaLimits} onChange={setAmigaLimits} size="sm" />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <label className="text-ft2-text text-xs font-mono">Sample Interpolation:</label>
                      <span className="text-[9px] text-ft2-textDim font-mono">Linear (clean) vs None (crunchy)</span>
                    </div>
                    <Toggle label="" value={linearInterpolation} onChange={setLinearInterpolation} size="sm" />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <label className="text-ft2-text text-xs font-mono">BLEP Synthesis:</label>
                      <span className="text-[9px] text-ft2-textDim font-mono">Band-limited (reduces aliasing)</span>
                    </div>
                    <Toggle label="" value={useBLEP} onChange={setUseBLEP} size="sm" />
                  </div>
                </div>
              </section>

              {/* Stereo */}
              <section>
                <h3 className="text-ft2-highlight text-xs font-bold mb-3 tracking-wide">STEREO SEPARATION</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-ft2-text text-xs font-mono">Algorithm:</label>
                    <div className="flex gap-1">
                      {(['pt2', 'modplug'] as const).map((m) => (
                        <button
                          key={m}
                          onClick={() => { setStereoSeparationMode(m); applyModeToReplayers(m); }}
                          className={`text-[9px] font-mono px-2 py-0.5 rounded border transition-colors ${
                            stereoSeparationMode === m
                              ? 'bg-ft2-cursor border-ft2-cursor text-black'
                              : 'bg-transparent border-ft2-border text-ft2-textDim hover:border-ft2-text'
                          }`}
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
                          type="range" min={0} max={100} step={5} value={stereoSeparation}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setStereoSeparation(v);
                            getTrackerReplayer().setStereoSeparation(v);
                            applyLibopenmptSeparation(v * 2);
                            const djEng = getDJEngineIfActive();
                            if (djEng) { djEng.deckA.replayer.setStereoSeparation(v); djEng.deckB.replayer.setStereoSeparation(v); }
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
                          type="range" min={0} max={200} step={5} value={modplugSeparation}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setModplugSeparation(v);
                            applyModplugSeparationToReplayers(v);
                            applyLibopenmptSeparation(v);
                          }}
                          className="w-20 accent-ft2-cursor"
                        />
                        <span className="text-ft2-text text-[10px] font-mono w-8 text-right">{modplugSeparation}%</span>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* Bus Gain */}
              <section>
                <h3 className="text-ft2-highlight text-xs font-bold mb-3 tracking-wide">BUS GAIN BALANCE</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-ft2-text text-xs font-mono">Auto-balance:</span>
                    <Toggle label="" value={autoGain} onChange={setAutoGain} size="sm" />
                  </div>
                  <span className="text-[9px] text-ft2-textDim font-mono block">
                    {autoGain ? 'Auto-balancing active — plays at least 1s to calibrate' : 'Balance sample vs synth/chip engine levels'}
                  </span>
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-ft2-textDim font-mono w-16">Samples</span>
                    <div className="flex items-center gap-2">
                      <input type="range" min={-12} max={12} step={1} value={sampleBusGain}
                        onChange={(e) => setSampleBusGain(Number(e.target.value))} disabled={autoGain}
                        className="w-20 accent-ft2-cursor disabled:opacity-40" />
                      <span className="text-ft2-text text-[10px] font-mono w-10 text-right">
                        {sampleBusGain > 0 ? `+${sampleBusGain}` : sampleBusGain} dB
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-ft2-textDim font-mono w-16">Synths</span>
                    <div className="flex items-center gap-2">
                      <input type="range" min={-12} max={12} step={1} value={synthBusGain}
                        onChange={(e) => setSynthBusGain(Number(e.target.value))} disabled={autoGain}
                        className="w-20 accent-ft2-cursor disabled:opacity-40" />
                      <span className="text-ft2-text text-[10px] font-mono w-10 text-right">
                        {synthBusGain > 0 ? `+${synthBusGain}` : synthBusGain} dB
                      </span>
                    </div>
                  </div>
                </div>
              </section>
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              VISUAL TAB
              ═══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'visual' && (
            <>
              {/* VU Meters */}
              <section>
                <h3 className="text-ft2-highlight text-xs font-bold mb-3 tracking-wide">VU METERS</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <label className="text-ft2-text text-xs font-mono">Mode:</label>
                      <span className="text-[9px] text-ft2-textDim font-mono">
                        {vuMeterMode === 'realtime' ? 'Continuous audio levels' : 'Triggered on note-on'}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      {(['trigger', 'realtime'] as const).map((m) => (
                        <button key={m} onClick={() => setVuMeterMode(m)}
                          className={`text-[9px] font-mono px-2 py-0.5 rounded border transition-colors ${
                            vuMeterMode === m ? 'bg-ft2-cursor border-ft2-cursor text-black' : 'bg-transparent border-ft2-border text-ft2-textDim hover:border-ft2-text'
                          }`}>{m === 'trigger' ? 'Trigger' : 'Realtime'}</button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="text-ft2-text text-xs font-mono">Style:</label>
                    <div className="flex gap-1">
                      {(['segments', 'fill'] as const).map((s) => (
                        <button key={s} onClick={() => setVuMeterStyle(s)}
                          className={`text-[9px] font-mono px-2 py-0.5 rounded border transition-colors ${
                            vuMeterStyle === s ? 'bg-ft2-cursor border-ft2-cursor text-black' : 'bg-transparent border-ft2-border text-ft2-textDim hover:border-ft2-text'
                          }`}>{s === 'segments' ? 'Segments' : 'Fill'}</button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="text-ft2-text text-xs font-mono">Swing Animation:</label>
                    <Toggle label="" value={vuMeterSwing} onChange={setVuMeterSwing} size="sm" />
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="text-ft2-text text-xs font-mono">Mirror (both directions):</label>
                    <Toggle label="" value={vuMeterMirror} onChange={setVuMeterMirror} size="sm" />
                  </div>
                </div>
              </section>

              {/* Visual Background */}
              <section>
                <h3 className="text-ft2-highlight text-xs font-bold mb-3 tracking-wide">VISUAL BACKGROUND</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <label className="text-ft2-text text-xs font-mono">Enable:</label>
                      <span className="text-[9px] text-ft2-textDim font-mono">WebGL audio-reactive effects</span>
                    </div>
                    <Toggle label="" value={trackerVisualBg} onChange={setTrackerVisualBg} size="sm" />
                  </div>
                  {trackerVisualBg && (
                    <div className="flex items-center justify-between">
                      <label className="text-ft2-text text-xs font-mono">Mode:</label>
                      <select value={trackerVisualMode} onChange={(e) => setTrackerVisualMode(Number(e.target.value))}
                        className="bg-ft2-bg border border-ft2-border text-ft2-text text-xs font-mono px-2 py-1 focus:outline-none focus:border-ft2-highlight">
                        {BG_MODES.map((bg, i) => <option key={i} value={i}>{getBgModeLabel(bg)}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              </section>

              {/* CRT Shader */}
              <section>
                <h3 className="text-ft2-highlight text-xs font-bold mb-3 tracking-wide">CRT SHADER</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <label className="text-ft2-text text-xs font-mono">Enable:</label>
                      <span className="text-[9px] text-ft2-textDim font-mono">Scanlines, curvature, bloom</span>
                    </div>
                    <Toggle label="" value={crtEnabled} onChange={setCrtEnabled} size="sm" />
                  </div>
                  {crtEnabled && (
                    <div className="space-y-2 border-t border-ft2-border pt-3">
                      <div className="text-[9px] text-ft2-highlight font-mono font-bold">SCANLINES</div>
                      <CRTSlider label="Intensity" value={crtParams.scanlineIntensity} min={0} max={1} step={0.01} onChange={(v) => setCrtParam('scanlineIntensity', v)} />
                      <CRTSlider label="Count" value={crtParams.scanlineCount} min={50} max={1200} step={1} onChange={(v) => setCrtParam('scanlineCount', v)} />
                      <div className="text-[9px] text-ft2-highlight font-mono font-bold pt-1">COLOR</div>
                      <CRTSlider label="Brightness" value={crtParams.brightness} min={0.6} max={1.8} step={0.01} onChange={(v) => setCrtParam('brightness', v)} />
                      <CRTSlider label="Contrast" value={crtParams.contrast} min={0.6} max={1.8} step={0.01} onChange={(v) => setCrtParam('contrast', v)} />
                      <div className="text-[9px] text-ft2-highlight font-mono font-bold pt-1">EFFECTS</div>
                      <CRTSlider label="Bloom" value={crtParams.bloomIntensity} min={0} max={1.5} step={0.01} onChange={(v) => setCrtParam('bloomIntensity', v)} />
                      <CRTSlider label="RGB Shift" value={crtParams.rgbShift} min={0} max={1} step={0.01} onChange={(v) => setCrtParam('rgbShift', v)} />
                      <CRTSlider label="Vignette" value={crtParams.vignetteStrength} min={0} max={2} step={0.01} onChange={(v) => setCrtParam('vignetteStrength', v)} />
                      <CRTSlider label="Curvature" value={crtParams.curvature} min={0} max={0.5} step={0.005} onChange={(v) => setCrtParam('curvature', v)} />
                      <button onClick={resetCrtParams}
                        className="w-full text-[10px] font-mono text-ft2-textDim border border-ft2-border hover:border-ft2-highlight hover:text-ft2-highlight px-2 py-1 transition-colors mt-1">
                        Reset to defaults
                      </button>
                    </div>
                  )}
                </div>
              </section>

              {/* Lens Distortion */}
              <section>
                <h3 className="text-ft2-highlight text-xs font-bold mb-3 tracking-wide">LENS DISTORTION</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <label className="text-ft2-text text-xs font-mono">Enable:</label>
                      <span className="text-[9px] text-ft2-textDim font-mono">Fish-eye, barrel, chromatic</span>
                    </div>
                    <Toggle label="" value={lensEnabled} onChange={setLensEnabled} size="sm" />
                  </div>
                  {lensEnabled && (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-1">
                        {LENS_PRESET_ORDER.filter((p) => p !== 'off').map((presetKey) => {
                          const preset = LENS_PRESETS[presetKey];
                          return (
                            <button key={presetKey}
                              onClick={() => { setLensPreset(presetKey); setLensParam('barrel', preset.params.barrel); setLensParam('chromatic', preset.params.chromatic); setLensParam('vignette', preset.params.vignette); }}
                              className={`text-[10px] font-mono px-2 py-0.5 border transition-colors ${
                                lensPreset === presetKey ? 'border-ft2-highlight text-ft2-highlight bg-ft2-highlight/10' : 'border-ft2-border text-ft2-textDim hover:border-ft2-highlight'
                              }`}>{preset.label}</button>
                          );
                        })}
                      </div>
                      <CRTSlider label="Barrel" value={lensParams.barrel} min={-0.5} max={1} step={0.01} onChange={(v) => { setLensParam('barrel', v); setLensPreset('custom'); }} />
                      <CRTSlider label="Chromatic" value={lensParams.chromatic} min={0} max={1} step={0.01} onChange={(v) => { setLensParam('chromatic', v); setLensPreset('custom'); }} />
                      <CRTSlider label="Vignette" value={lensParams.vignette} min={0} max={1} step={0.01} onChange={(v) => { setLensParam('vignette', v); setLensPreset('custom'); }} />
                      <button onClick={resetLensParams}
                        className="w-full text-[10px] font-mono text-ft2-textDim border border-ft2-border hover:border-ft2-highlight hover:text-ft2-highlight px-2 py-1 transition-colors mt-1">
                        Reset to defaults
                      </button>
                    </div>
                  )}
                </div>
              </section>

              {/* Other Visual */}
              <section>
                <h3 className="text-ft2-highlight text-xs font-bold mb-3 tracking-wide">OTHER</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <label className="text-ft2-text text-xs font-mono">Wobble Windows:</label>
                      <span className="text-[9px] text-ft2-textDim font-mono">Compiz-style (GL UI only)</span>
                    </div>
                    <Toggle label="" value={wobbleWindows} onChange={setWobbleWindows} size="sm" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <label className="text-ft2-text text-xs font-mono">Custom Banner:</label>
                        <span className="text-[9px] text-ft2-textDim font-mono">Shows in visualizer</span>
                      </div>
                      <div className="flex gap-1">
                        <label className="text-[9px] font-mono px-2 py-0.5 rounded border bg-transparent border-ft2-border text-ft2-textDim hover:border-ft2-text cursor-pointer transition-colors">
                          Upload
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            if (file.size > 512 * 1024) { alert('Image must be under 512KB'); return; }
                            const reader = new FileReader();
                            reader.onload = () => setCustomBannerImage(reader.result as string);
                            reader.readAsDataURL(file);
                            e.target.value = '';
                          }} />
                        </label>
                        {customBannerImage && (
                          <button onClick={() => setCustomBannerImage(null)}
                            className="text-[9px] font-mono px-2 py-0.5 rounded border bg-transparent border-ft2-border text-red-400 hover:border-red-400 transition-colors">Remove</button>
                        )}
                      </div>
                    </div>
                    {customBannerImage && (
                      <div className="flex items-center justify-center bg-black/30 rounded p-1" style={{ maxHeight: 48 }}>
                        <img src={customBannerImage} alt="Banner preview" style={{ maxHeight: 40, maxWidth: '100%', objectFit: 'contain' }} />
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              RECORDING TAB
              ═══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'recording' && (
            <>
              <section>
                <h3 className="text-ft2-highlight text-xs font-bold mb-3 tracking-wide">RECORDING</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-ft2-text text-xs font-mono">Edit Step:</label>
                    <div className="flex items-center gap-2">
                      <input type="number" value={editStep} onChange={(e) => setEditStep(Number(e.target.value))} min={0} max={16}
                        className="bg-ft2-bg border border-ft2-border text-ft2-text text-[10px] font-mono w-12 px-1 py-0.5" />
                      <span className="text-[9px] text-ft2-textDim font-mono">rows</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="text-ft2-text text-xs font-mono">Edit Mode:</label>
                    <select value={insertMode ? 'insert' : 'overwrite'}
                      onChange={(e) => { const wantInsert = e.target.value === 'insert'; if (wantInsert !== insertMode) toggleInsertMode(); }}
                      className="bg-ft2-bg border border-ft2-border text-ft2-text text-[10px] font-mono px-2 py-1 focus:outline-none focus:border-ft2-highlight">
                      <option value="overwrite">Overwrite</option>
                      <option value="insert">Insert (Shift Rows)</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <label className="text-ft2-text text-xs font-mono">Record Key-Off:</label>
                      <span className="text-[9px] text-ft2-textDim font-mono">Record === when keys are released</span>
                    </div>
                    <Toggle label="" value={recReleaseEnabled} onChange={setRecReleaseEnabled} size="sm" />
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="text-ft2-text text-xs font-mono">Quantization:</label>
                    <div className="flex items-center gap-2">
                      <Toggle label="" value={recQuantEnabled} onChange={setRecQuantEnabled} size="sm" />
                      <select value={recQuantRes} onChange={(e) => setRecQuantRes(Number(e.target.value))} disabled={!recQuantEnabled}
                        className="bg-ft2-bg border border-ft2-border text-ft2-text text-[10px] font-mono px-2 py-1 focus:outline-none focus:border-ft2-highlight disabled:opacity-30">
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
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              INPUT TAB
              ═══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'input' && (
            <>
              {/* Keyboard */}
              <section>
                <h3 className="text-ft2-highlight text-xs font-bold mb-3 tracking-wide">KEYBOARD</h3>
                <div className="space-y-3">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <label className="text-ft2-text text-xs font-mono">Scheme:</label>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setShowShortcuts(true)}
                          className="p-1.5 bg-ft2-bg border border-ft2-border text-ft2-text hover:text-ft2-highlight hover:border-ft2-highlight transition-colors" title="View keybindings">
                          <Keyboard size={14} />
                        </button>
                        <select value={activeScheme} onChange={(e) => setActiveScheme(e.target.value)}
                          className="bg-ft2-bg border border-ft2-border text-ft2-text text-[10px] font-mono px-2 py-1 focus:outline-none focus:border-ft2-highlight">
                          {KEYBOARD_SCHEMES.map((scheme) => <option key={scheme.id} value={scheme.id}>{scheme.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <span className="text-[9px] text-ft2-textDim font-mono">{KEYBOARD_SCHEMES.find(s => s.id === activeScheme)?.description}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <label className="text-ft2-text text-xs font-mono">Platform:</label>
                      <span className="text-[9px] text-ft2-textDim font-mono">Override Cmd/Ctrl detection</span>
                    </div>
                    <select value={platformOverride} onChange={(e) => setPlatformOverride(e.target.value as 'auto' | 'mac' | 'pc')}
                      className="bg-ft2-bg border border-ft2-border text-ft2-text text-[10px] font-mono px-2 py-1 focus:outline-none focus:border-ft2-highlight">
                      <option value="auto">Auto-detect</option>
                      <option value="mac">Mac (Cmd)</option>
                      <option value="pc">PC (Ctrl)</option>
                    </select>
                  </div>
                </div>
              </section>

              {/* MIDI */}
              <section>
                <h3 className="text-ft2-highlight text-xs font-bold mb-3 tracking-wide">MIDI</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <label className="text-ft2-text text-xs font-mono">Polyphonic Mode:</label>
                      <span className="text-[9px] text-ft2-textDim font-mono">Play multiple notes simultaneously</span>
                    </div>
                    <Toggle label="" value={midiPolyphonic} onChange={setMidiPolyphonic} size="sm" />
                  </div>

                  <div className="pt-3 border-t border-ft2-border/30 space-y-2">
                    <button onClick={() => { onClose(); useUIStore.getState().openModal('midi-wizard'); }}
                      className="w-full flex items-center gap-2 px-3 py-2 bg-purple-500/10 border border-purple-500/30 rounded text-left hover:bg-purple-500/20 transition-colors">
                      <span className="text-purple-400 text-xs">🎛</span>
                      <div className="flex-1">
                        <p className="text-xs text-ft2-highlight font-mono">Controller Setup Wizard</p>
                        <p className="text-[9px] text-ft2-textDim font-mono">Detect and configure MIDI controller</p>
                      </div>
                    </button>
                    <button onClick={() => { onClose(); useUIStore.getState().openModal('nks-wizard'); }}
                      className="w-full flex items-center gap-2 px-3 py-2 bg-orange-500/10 border border-orange-500/30 rounded text-left hover:bg-orange-500/20 transition-colors">
                      <span className="text-orange-400 text-xs">🎹</span>
                      <div className="flex-1">
                        <p className="text-xs text-ft2-highlight font-mono">NKS Performance Setup</p>
                        <p className="text-[9px] text-ft2-textDim font-mono">Parameter pages, hardware integration</p>
                      </div>
                    </button>
                  </div>
                </div>
              </section>

              {/* Vinyl Scratch */}
              <section>
                <h3 className="text-ft2-highlight text-xs font-bold mb-3 tracking-wide">VINYL SCRATCH</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <label className="text-ft2-text text-xs font-mono">Always On:</label>
                      <span className="text-[9px] text-ft2-textDim font-mono">Scratch when stopped</span>
                    </div>
                    <Toggle label="" value={useUIStore.getState().scratchEnabled} onChange={(v) => useUIStore.getState().setScratchEnabled(v)} size="sm" />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <label className="text-ft2-text text-xs font-mono">Velocity Curve:</label>
                      <span className="text-[9px] text-ft2-textDim font-mono">Smooth momentum</span>
                    </div>
                    <Toggle label="" value={useUIStore.getState().scratchAcceleration} onChange={(v) => useUIStore.getState().setScratchAcceleration(v)} size="sm" />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-ft2-text text-xs font-mono">Platter Weight:</label>
                    <div className="flex items-center gap-2">
                      <input type="range" min="0" max="100" value={Math.round(useUIStore.getState().platterMass * 100)}
                        onChange={(e) => useUIStore.getState().setPlatterMass(parseInt(e.target.value) / 100)} className="w-20 accent-ft2-cursor" />
                      <span className="text-ft2-text text-[10px] font-mono w-8 text-right">{Math.round(useUIStore.getState().platterMass * 100)}%</span>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-ft2-border/30 text-ft2-textDim text-[9px] font-mono">
                    <div className="text-ft2-highlight font-bold">How to scratch:</div>
                    <div>Scroll wheel/trackpad during playback</div>
                    <div>Hold <kbd className="px-1 py-0.5 bg-ft2-border text-ft2-text rounded text-[8px]">Z</kbd> = fader cut · <kbd className="px-1 py-0.5 bg-ft2-border text-ft2-text rounded text-[8px]">X</kbd> = crab</div>
                  </div>
                </div>
              </section>
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              SID TAB
              ═══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'sid' && (
            <>
              {/* SID Engine */}
              <section>
                <h3 className="text-ft2-highlight text-xs font-bold mb-3 tracking-wide">SID PLAYER ENGINE</h3>
                <p className="text-ft2-textDim text-[9px] font-mono mb-2">Choose emulation engine for C64 SID music (.sid files).</p>
                <div className="space-y-2">
                  {Object.values(SID_ENGINES).map((engine) => (
                    <label key={engine.id}
                      className={`block p-2 border cursor-pointer transition-colors ${sidEngine === engine.id ? 'bg-ft2-rowEven border-ft2-highlight' : 'bg-transparent border-ft2-border hover:bg-ft2-rowEven/50'}`}>
                      <div className="flex items-center gap-2">
                        <input type="radio" name="sidEngine" value={engine.id} checked={sidEngine === engine.id}
                          onChange={(e) => setSidEngine(e.target.value as SIDEngineType)} className="accent-ft2-highlight" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-ft2-text text-[10px] font-mono font-bold">{engine.name}</span>
                            <span className="text-ft2-textDim text-[9px] font-mono">{engine.size}</span>
                            {engine.id === 'websid' && <span className="text-ft2-highlight text-[9px] font-mono">(Recommended)</span>}
                          </div>
                          <div className="text-ft2-textDim text-[9px] font-mono mt-0.5">{engine.description}</div>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </section>

              {/* SID Hardware */}
              <section>
                <h3 className="text-ft2-highlight text-xs font-bold mb-3 tracking-wide flex items-center gap-2">
                  <Usb size={14} className="text-ft2-highlight" />
                  SID HARDWARE OUTPUT
                </h3>
                <p className="text-ft2-textDim text-[9px] font-mono mb-2">Route to real MOS 6581/8580 chips via USB-SID-Pico.</p>
                <div className="flex flex-col gap-1 mb-2">
                  <label className="text-ft2-text text-[9px] font-mono">Transport:</label>
                  <select value={sidHardwareMode}
                    onChange={(e) => { const mode = e.target.value as 'off' | 'asid' | 'webusb'; setSidHardwareMode(mode); setAsidEnabled(mode === 'asid'); }}
                    className="bg-ft2-bg border border-ft2-border text-ft2-text text-[10px] font-mono px-2 py-1 focus:outline-none focus:border-ft2-highlight">
                    <option value="off">Off — Software Only</option>
                    <option value="webusb">WebUSB — Direct USB</option>
                    <option value="asid">ASID — MIDI SysEx</option>
                  </select>
                </div>

                {sidHardwareMode === 'webusb' && webusbSupported && (
                  <div className="pl-2 space-y-2 border-l border-ft2-border ml-1">
                    <button
                      onClick={async () => {
                        const { getSIDHardwareManager } = await import('@lib/sid/SIDHardwareManager');
                        const mgr = getSIDHardwareManager();
                        if (webusbConnected) {
                          await mgr.deactivate(); setSidHardwareMode('off'); setWebusbConnected(false); setWebusbDeviceName(null);
                        } else {
                          const ok = await mgr.connectWebUSB(); setWebusbConnected(ok);
                          if (ok) { const st = mgr.getStatus(); setWebusbDeviceName(st.deviceName); setWebusbFirmware(st.firmwareVersion ?? null); setWebusbChips(st.detectedChips ?? null); }
                        }
                      }}
                      className={`px-3 py-1 text-[10px] font-mono font-bold border ${webusbConnected ? 'border-accent-error text-accent-error' : 'border-ft2-highlight text-ft2-highlight'}`}>
                      {webusbConnected ? 'Disconnect' : 'Connect USB-SID-Pico'}
                    </button>
                    {webusbConnected && webusbDeviceName && <span className="text-ft2-highlight text-[9px] font-mono">Connected: {webusbDeviceName}</span>}
                  </div>
                )}

                {sidHardwareMode === 'asid' && asidSupported && (
                  <div className="pl-2 space-y-2 border-l border-ft2-border ml-1">
                    <select value={asidDeviceId || ''} onChange={(e) => { setAsidDeviceId(e.target.value || null); getASIDDeviceManager().selectDevice(e.target.value || null); }}
                      className="bg-ft2-bg border border-ft2-border text-ft2-text text-[10px] font-mono px-2 py-1">
                      {asidDevices.length === 0 ? <option value="">No ASID devices</option> : (
                        <><option value="">Select device...</option>{asidDevices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</>
                      )}
                    </select>
                  </div>
                )}
              </section>
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              ABOUT TAB
              ═══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'about' && (
            <>
              <section>
                <div className="text-ft2-textDim text-[10px] font-mono space-y-1 mb-4">
                  <div className="text-ft2-highlight font-bold">DEViLBOX v1.0.0</div>
                  <div>TB-303 Acid Tracker</div>
                  <div className="text-ft2-highlight">Settings are saved automatically</div>
                </div>
              </section>

              <section>
                <h3 className="text-ft2-highlight text-xs font-bold mb-2 tracking-wide">MODLAND INTEGRATION</h3>
                <p className="text-ft2-textDim text-[9px] font-mono mb-2">Contribution modal for unknown modules. Clear dismissed files to re-enable.</p>
                <button onClick={() => { useModlandContributionModal.getState().clearDismissedHashes(); alert('Cleared'); }}
                  className="px-3 py-1.5 bg-transparent border border-ft2-border text-ft2-text text-[10px] font-mono hover:bg-ft2-rowEven transition-colors">
                  CLEAR DISMISSED FILES
                </button>
              </section>

              <section>
                <h3 className="text-ft2-highlight text-xs font-bold mb-2 tracking-wide">WORKBENCH</h3>
                <div className="text-[9px] text-ft2-textDim font-mono">
                  <span className="text-ft2-highlight">Tab</span> — hold for Exposé (fit all windows) · release to restore
                </div>
              </section>

              <section>
                <h3 className="text-accent-error text-xs font-bold mb-2 tracking-wide">DANGER ZONE</h3>
                <p className="text-ft2-textDim text-[9px] font-mono mb-2">Clear all state and reset to factory defaults. Your project will be lost if not exported.</p>
                <button
                  onClick={() => {
                    if (!confirm('Clear all app state and reload?')) return;
                    navigator.serviceWorker.getRegistrations()
                      .then(regs => Promise.all(regs.map(r => r.unregister())))
                      .then(() => caches.keys())
                      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
                      .then(() => { localStorage.clear(); return indexedDB.databases(); })
                      .then(dbs => Promise.all(dbs.map(db => indexedDB.deleteDatabase(db.name!))))
                      .then(() => location.reload());
                  }}
                  className="px-3 py-1.5 bg-transparent border border-accent-error/60 text-accent-error text-[10px] font-mono hover:bg-accent-error/10 transition-colors">
                  CLEAR ALL STATE & RELOAD
                </button>
              </section>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-ft2-header border-t-2 border-ft2-border flex justify-end">
          <button onClick={onClose}
            className="px-4 py-1.5 bg-ft2-cursor border border-ft2-cursor text-ft2-bg text-xs font-bold hover:bg-ft2-highlight hover:border-ft2-highlight transition-colors focus:outline-none">
            CLOSE
          </button>
        </div>
      </div>

      {/* Keyboard Shortcut Sheet */}
      <KeyboardShortcutSheet isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} />
    </div>
  );
};
