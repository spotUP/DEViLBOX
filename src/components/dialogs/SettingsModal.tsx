/**
 * SettingsModal - Global application settings
 * Organized into logical tabs for easier navigation.
 */

import React, { useState } from 'react';
import { X, Maximize2, Keyboard, Usb } from 'lucide-react';
import { useUIStore } from '@stores/useUIStore';
import { useEditorStore } from '@stores/useEditorStore';
import { useTransportStore } from '@stores/useTransportStore';
import { themes, THEME_TOKEN_GROUPS } from '@stores/useThemeStore';
import { type SIDEngineType } from '@stores/useSettingsStore';
import { SID_ENGINES } from '@engine/deepsid/DeepSIDEngineManager';
import { useModlandContributionModal } from '@stores/useModlandContributionModal';
import { Toggle } from '@components/controls/Toggle';
import { KeyboardShortcutSheet } from '@components/tracker/KeyboardShortcutSheet';
import { BG_MODES, getBgModeLabel } from '@/components/tracker/TrackerVisualBackground';
import { getASIDDeviceManager } from '@lib/sid/ASIDDeviceManager';
import { useModalClose } from '@hooks/useDialogKeyboard';
import {
  useSettingsDialog,
  SETTINGS_TABS,
  KEYBOARD_SCHEMES,
} from '@hooks/dialogs/useSettingsDialog';
import { KeyBindingEditor } from '@components/dialogs/KeyBindingEditor';
import { KeyboardNormalizer } from '@engine/keyboard/KeyboardNormalizer';
import { CustomSelect } from '@components/common/CustomSelect';

/** Normalize any CSS color to #RRGGBB for <input type="color"> */
function normalizeToHex6(color: string | undefined): string {
  if (!color) return '#000000';
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

interface SettingsModalProps {
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const s = useSettingsDialog({ isOpen: true }); // DOM unmounts when closed
  const [showShortcuts, setShowShortcuts] = useState(false); // DOM-only

  // Standard modal keyboard handling (Enter/Escape to close)
  useModalClose({ isOpen: true, onClose });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99990] p-4">
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
          {SETTINGS_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => s.setActiveTab(tab.id)}
              className={`px-3 py-2 text-[10px] font-mono font-bold tracking-wide transition-colors whitespace-nowrap ${
                s.activeTab === tab.id
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
          {s.activeTab === 'general' && (
            <>
              {/* Theme */}
              <section>
                <h3 className="text-ft2-highlight text-xs font-bold mb-3 tracking-wide">THEME</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-ft2-text text-xs font-mono">Theme:</label>
                    <CustomSelect
                      value={s.currentThemeId}
                      onChange={(v) => s.setTheme(v)}
                      options={themes.map((theme) => ({ value: theme.id, label: theme.name }))}
                      className="bg-ft2-bg border border-ft2-border text-ft2-text text-xs font-mono px-2 py-1"
                    />
                  </div>

                  {/* Custom Theme Editor */}
                  {s.currentThemeId === 'custom' && s.customThemeColors && (
                    <div className="border border-ft2-border rounded p-2 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] text-ft2-textDim font-mono">Copy colors from:</span>
                        <div className="flex gap-1 flex-wrap">
                          {themes.filter(t => t.id !== 'custom').map(t => (
                            <button
                              key={t.id}
                              onClick={() => s.copyThemeToCustom(t.id)}
                              className="text-[8px] font-mono px-1.5 py-0.5 rounded border border-ft2-border text-ft2-textDim hover:border-ft2-text hover:text-ft2-text transition-colors"
                            >
                              {t.name}
                            </button>
                          ))}
                          <button
                            onClick={s.resetCustomTheme}
                            className="text-[8px] font-mono px-1.5 py-0.5 rounded border border-ft2-border text-ft2-textDim hover:border-accent-error hover:text-accent-error transition-colors"
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
                                    value={normalizeToHex6(s.customThemeColors![key])}
                                    onChange={(e) => s.setCustomColor(key, e.target.value)}
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
                  {/* Number Format */}
                  <div className="flex items-center justify-between">
                    <label className="text-ft2-text text-xs font-mono">Number Format:</label>
                    <CustomSelect
                      value={s.useHexNumbers ? 'hex' : 'dec'}
                      onChange={(v) => s.setUseHexNumbers(v === 'hex')}
                      options={[
                        { value: 'hex', label: 'Hexadecimal' },
                        { value: 'dec', label: 'Decimal' },
                      ]}
                      className="bg-ft2-bg border border-ft2-border text-ft2-text text-xs font-mono px-2 py-1"
                    />
                  </div>

                  {/* Blank Empty Cells */}
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <label className="text-ft2-text text-xs font-mono">Blank Empty Cells:</label>
                      <span className="text-[9px] text-ft2-textDim font-mono">Hide ---, .., ... on empty rows</span>
                    </div>
                    <Toggle label="" value={s.blankEmptyCells} onChange={s.setBlankEmptyCells} size="sm" />
                  </div>

                  {/* Fullscreen */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Maximize2 size={14} className="text-ft2-textDim" />
                      <label className="text-ft2-text text-xs font-mono">Fullscreen:</label>
                    </div>
                    <Toggle label="" value={s.isFullscreen} onChange={s.toggleFullscreen} size="sm" />
                  </div>

                  {/* Ghost Patterns */}
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <label className="text-ft2-text text-xs font-mono">Ghost Patterns:</label>
                      <span className="text-[9px] text-ft2-textDim font-mono">Show adjacent patterns dimmed behind current</span>
                    </div>
                    <Toggle label="" value={useEditorStore.getState().showGhostPatterns} onChange={(v) => useEditorStore.getState().setShowGhostPatterns(v)} size="sm" />
                  </div>
                  {/* Smooth Scrolling */}
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <label className="text-ft2-text text-xs font-mono">Smooth Scrolling:</label>
                      <span className="text-[9px] text-ft2-textDim font-mono">Interpolated scrolling instead of stepped rows</span>
                    </div>
                    <Toggle label="" value={useTransportStore.getState().smoothScrolling} onChange={(v) => useTransportStore.getState().setSmoothScrolling(v)} size="sm" />
                  </div>
                </div>
              </section>

              {/* Layout */}
              <section>
                <h3 className="text-ft2-highlight text-xs font-bold mb-3 tracking-wide">LAYOUT</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-ft2-text text-xs font-mono">Knob Panel:</label>
                    <Toggle label="" value={!s.knobPanelCollapsed} onChange={(v) => s.setKnobPanelCollapsed(!v)} size="sm" />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-ft2-text text-xs font-mono">Oscilloscope:</label>
                    <Toggle label="" value={s.oscilloscopeVisible} onChange={s.setOscilloscopeVisible} size="sm" />
                  </div>
                </div>
              </section>
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              AUDIO TAB
              ═══════════════════════════════════════════════════════════════════ */}
          {s.activeTab === 'audio' && (
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
                    <Toggle label="" value={s.amigaLimits} onChange={s.setAmigaLimits} size="sm" />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <label className="text-ft2-text text-xs font-mono">Sample Interpolation:</label>
                      <span className="text-[9px] text-ft2-textDim font-mono">Linear (clean) vs None (crunchy)</span>
                    </div>
                    <Toggle label="" value={s.linearInterpolation} onChange={s.setLinearInterpolation} size="sm" />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <label className="text-ft2-text text-xs font-mono">BLEP Synthesis:</label>
                      <span className="text-[9px] text-ft2-textDim font-mono">Band-limited (reduces aliasing)</span>
                    </div>
                    <Toggle label="" value={s.useBLEP} onChange={s.setUseBLEP} size="sm" />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <label className="text-ft2-text text-xs font-mono">Startup Jingle:</label>
                      <span className="text-[9px] text-ft2-textDim font-mono">Disable when using MCP</span>
                    </div>
                    <Toggle label="" value={s.welcomeJingleEnabled} onChange={s.setWelcomeJingleEnabled} size="sm" />
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
                          onClick={() => s.setStereoMode(m)}
                          className={`text-[9px] font-mono px-2 py-0.5 rounded border transition-colors ${
                            s.stereoSeparationMode === m
                              ? 'bg-ft2-cursor border-ft2-cursor text-black'
                              : 'bg-transparent border-ft2-border text-ft2-textDim hover:border-ft2-text'
                          }`}
                        >
                          {m === 'pt2' ? 'PT2-Clone' : 'ModPlug'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {s.stereoSeparationMode === 'pt2' ? (
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-ft2-textDim font-mono">0% mono · 20% Amiga · 100% full</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="range" min={0} max={100} step={5} value={s.stereoSeparation}
                          onChange={(e) => s.setStereoSeparationValue(Number(e.target.value))}
                          className="w-20 accent-ft2-cursor"
                        />
                        <span className="text-ft2-text text-[10px] font-mono w-8 text-right">{s.stereoSeparation}%</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-ft2-textDim font-mono">0% mono · 100% normal · 200% wide</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="range" min={0} max={200} step={5} value={s.modplugSeparation}
                          onChange={(e) => s.setModplugSeparationValue(Number(e.target.value))}
                          className="w-20 accent-ft2-cursor"
                        />
                        <span className="text-ft2-text text-[10px] font-mono w-8 text-right">{s.modplugSeparation}%</span>
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
                    <Toggle label="" value={s.autoGain} onChange={s.setAutoGain} size="sm" />
                  </div>
                  <span className="text-[9px] text-ft2-textDim font-mono block">
                    {s.autoGain ? 'Auto-balancing active — plays at least 1s to calibrate' : 'Balance sample vs synth/chip engine levels'}
                  </span>
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-ft2-textDim font-mono w-16">Samples</span>
                    <div className="flex items-center gap-2">
                      <input type="range" min={-12} max={12} step={1} value={s.sampleBusGain}
                        onChange={(e) => s.setSampleBusGain(Number(e.target.value))} disabled={s.autoGain}
                        className="w-20 accent-ft2-cursor disabled:opacity-40" />
                      <span className="text-ft2-text text-[10px] font-mono w-10 text-right">
                        {s.sampleBusGain > 0 ? `+${s.sampleBusGain}` : s.sampleBusGain} dB
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-ft2-textDim font-mono w-16">Synths</span>
                    <div className="flex items-center gap-2">
                      <input type="range" min={-12} max={12} step={1} value={s.synthBusGain}
                        onChange={(e) => s.setSynthBusGain(Number(e.target.value))} disabled={s.autoGain}
                        className="w-20 accent-ft2-cursor disabled:opacity-40" />
                      <span className="text-ft2-text text-[10px] font-mono w-10 text-right">
                        {s.synthBusGain > 0 ? `+${s.synthBusGain}` : s.synthBusGain} dB
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
          {s.activeTab === 'visual' && (
            <>
              {/* VU Meters */}
              <section>
                <h3 className="text-ft2-highlight text-xs font-bold mb-3 tracking-wide">VU METERS</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <label className="text-ft2-text text-xs font-mono">Mode:</label>
                      <span className="text-[9px] text-ft2-textDim font-mono">
                        {s.vuMeterMode === 'realtime' ? 'Continuous audio levels' : 'Triggered on note-on'}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      {(['trigger', 'realtime'] as const).map((m) => (
                        <button key={m} onClick={() => s.setVuMeterMode(m)}
                          className={`text-[9px] font-mono px-2 py-0.5 rounded border transition-colors ${
                            s.vuMeterMode === m ? 'bg-ft2-cursor border-ft2-cursor text-black' : 'bg-transparent border-ft2-border text-ft2-textDim hover:border-ft2-text'
                          }`}>{m === 'trigger' ? 'Trigger' : 'Realtime'}</button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="text-ft2-text text-xs font-mono">Style:</label>
                    <div className="flex gap-1">
                      {(['segments', 'fill'] as const).map((style) => (
                        <button key={style} onClick={() => s.setVuMeterStyle(style)}
                          className={`text-[9px] font-mono px-2 py-0.5 rounded border transition-colors ${
                            s.vuMeterStyle === style ? 'bg-ft2-cursor border-ft2-cursor text-black' : 'bg-transparent border-ft2-border text-ft2-textDim hover:border-ft2-text'
                          }`}>{style === 'segments' ? 'Segments' : 'Fill'}</button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="text-ft2-text text-xs font-mono">Swing Animation:</label>
                    <Toggle label="" value={s.vuMeterSwing} onChange={s.setVuMeterSwing} size="sm" />
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="text-ft2-text text-xs font-mono">Mirror (both directions):</label>
                    <Toggle label="" value={s.vuMeterMirror} onChange={s.setVuMeterMirror} size="sm" />
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
                    <Toggle label="" value={s.trackerVisualBg} onChange={s.setTrackerVisualBg} size="sm" />
                  </div>
                  {s.trackerVisualBg && (
                    <div className="flex items-center justify-between">
                      <label className="text-ft2-text text-xs font-mono">Mode:</label>
                      <CustomSelect value={String(s.trackerVisualMode)} onChange={(v) => s.setTrackerVisualMode(Number(v))}
                        options={BG_MODES.map((bg, i) => ({ value: String(i), label: getBgModeLabel(bg) }))}
                        className="bg-ft2-bg border border-ft2-border text-ft2-text text-xs font-mono px-2 py-1" />
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex flex-col">
                      <label className="text-ft2-text text-xs font-mono">Channel Color Blend:</label>
                      <span className="text-[9px] text-ft2-textDim font-mono">Track color tint on header background ({s.channelColorBlend}%)</span>
                    </div>
                    <input type="range" min={0} max={50} step={1} value={s.channelColorBlend}
                      onChange={(e) => s.setChannelColorBlend(Number(e.target.value))}
                      className="w-24 accent-accent-primary" />
                  </div>
                </div>
              </section>

              {/* GL-only settings note */}
              <section>
                <h3 className="text-ft2-highlight text-xs font-bold mb-3 tracking-wide">SHADER EFFECTS</h3>
                <div className="text-[10px] text-ft2-textDim font-mono leading-relaxed">
                  CRT Shader, Lens Distortion, and Wobble Windows are available in the WebGL UI.
                  Switch to WebGL mode in General &gt; Display to access these settings.
                </div>
              </section>

              {/* Other Visual */}
              <section>
                <h3 className="text-ft2-highlight text-xs font-bold mb-3 tracking-wide">OTHER</h3>
                <div className="space-y-3">
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
                            reader.onload = () => s.setCustomBannerImage(reader.result as string);
                            reader.readAsDataURL(file);
                            e.target.value = '';
                          }} />
                        </label>
                        {s.customBannerImage && (
                          <button onClick={() => s.setCustomBannerImage(null)}
                            className="text-[9px] font-mono px-2 py-0.5 rounded border bg-transparent border-ft2-border text-accent-error hover:border-accent-error transition-colors">Remove</button>
                        )}
                      </div>
                    </div>
                    {s.customBannerImage && (
                      <div className="flex items-center justify-center bg-black/30 rounded p-1" style={{ maxHeight: 48 }}>
                        <img src={s.customBannerImage!} alt="Banner preview" style={{ maxHeight: 40, maxWidth: '100%', objectFit: 'contain' }} />
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
          {s.activeTab === 'recording' && (
            <>
              <section>
                <h3 className="text-ft2-highlight text-xs font-bold mb-3 tracking-wide">RECORDING</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-ft2-text text-xs font-mono">Edit Step:</label>
                    <div className="flex items-center gap-2">
                      <input type="number" value={s.editStep} onChange={(e) => s.setEditStep(Number(e.target.value))} min={0} max={16}
                        className="bg-ft2-bg border border-ft2-border text-ft2-text text-[10px] font-mono w-12 px-1 py-0.5" />
                      <span className="text-[9px] text-ft2-textDim font-mono">rows</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="text-ft2-text text-xs font-mono">Edit Mode:</label>
                    <CustomSelect value={s.insertMode ? 'insert' : 'overwrite'}
                      onChange={(v) => { const wantInsert = v === 'insert'; if (wantInsert !== s.insertMode) s.toggleInsertMode(); }}
                      options={[
                        { value: 'overwrite', label: 'Overwrite' },
                        { value: 'insert', label: 'Insert (Shift Rows)' },
                      ]}
                      className="bg-ft2-bg border border-ft2-border text-ft2-text text-[10px] font-mono px-2 py-1" />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <label className="text-ft2-text text-xs font-mono">Record Key-Off:</label>
                      <span className="text-[9px] text-ft2-textDim font-mono">Record === when keys are released</span>
                    </div>
                    <Toggle label="" value={s.recReleaseEnabled} onChange={s.setRecReleaseEnabled} size="sm" />
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="text-ft2-text text-xs font-mono">Quantization:</label>
                    <div className="flex items-center gap-2">
                      <Toggle label="" value={s.recQuantEnabled} onChange={s.setRecQuantEnabled} size="sm" />
                      <CustomSelect value={String(s.recQuantRes)} onChange={(v) => s.setRecQuantRes(Number(v))} disabled={!s.recQuantEnabled}
                        options={[
                          { value: '1', label: '1 row' },
                          { value: '2', label: '2 rows' },
                          { value: '4', label: '4 rows (1/4)' },
                          { value: '8', label: '8 rows (1/2)' },
                          { value: '16', label: '16 rows (1 beat)' },
                        ]}
                        className="bg-ft2-bg border border-ft2-border text-ft2-text text-[10px] font-mono px-2 py-1" />
                    </div>
                  </div>
                </div>
              </section>
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              INPUT TAB
              ═══════════════════════════════════════════════════════════════════ */}
          {s.activeTab === 'input' && (
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
                        <CustomSelect value={s.activeScheme} onChange={(v) => s.setActiveScheme(v)}
                          options={KEYBOARD_SCHEMES.map((scheme) => ({ value: scheme.id, label: scheme.name }))}
                          className="bg-ft2-bg border border-ft2-border text-ft2-text text-[10px] font-mono px-2 py-1" />
                      </div>
                    </div>
                    <span className="text-[9px] text-ft2-textDim font-mono">{KEYBOARD_SCHEMES.find(sc => sc.id === s.activeScheme)?.description}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <label className="text-ft2-text text-xs font-mono">Platform:</label>
                      <span className="text-[9px] text-ft2-textDim font-mono">Override Cmd/Ctrl detection</span>
                    </div>
                    <CustomSelect value={s.platformOverride} onChange={(v) => s.setPlatformOverride(v as 'auto' | 'mac' | 'pc')}
                      options={[
                        { value: 'auto', label: 'Auto-detect' },
                        { value: 'mac', label: 'Mac (Cmd)' },
                        { value: 'pc', label: 'PC (Ctrl)' },
                      ]}
                      className="bg-ft2-bg border border-ft2-border text-ft2-text text-[10px] font-mono px-2 py-1" />
                  </div>
                </div>

                {/* Custom key binding editor */}
                {s.activeScheme === 'custom' && (
                  <div className="mt-4 pt-3 border-t border-ft2-border/30">
                    <h4 className="text-ft2-highlight text-[10px] font-bold mb-2 tracking-wide">CUSTOM BINDINGS</h4>
                    <KeyBindingEditor platform={s.platformOverride === 'auto' ? (KeyboardNormalizer.isMac() ? 'mac' : 'pc') : s.platformOverride} />
                  </div>
                )}
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
                    <Toggle label="" value={s.midiPolyphonic} onChange={s.setMidiPolyphonic} size="sm" />
                  </div>

                  <div className="pt-3 border-t border-ft2-border/30 space-y-2">
                    <button onClick={() => { onClose(); useUIStore.getState().openModal('midi-wizard'); }}
                      className="w-full flex items-center gap-2 px-3 py-2 bg-purple-500/10 border border-purple-500/30 rounded text-left hover:bg-purple-500/20 transition-colors">
                      <span className="text-accent-secondary text-xs">🎛</span>
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
                    <Toggle label="" value={s.scratchEnabled} onChange={(v) => s.setScratchEnabled(v)} size="sm" />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <label className="text-ft2-text text-xs font-mono">Velocity Curve:</label>
                      <span className="text-[9px] text-ft2-textDim font-mono">Smooth momentum</span>
                    </div>
                    <Toggle label="" value={s.scratchAcceleration} onChange={(v) => s.setScratchAcceleration(v)} size="sm" />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-ft2-text text-xs font-mono">Platter Weight:</label>
                    <div className="flex items-center gap-2">
                      <input type="range" min="0" max="100" value={Math.round(s.platterMass * 100)}
                        onChange={(e) => s.setPlatterMass(parseInt(e.target.value) / 100)} className="w-20 accent-ft2-cursor" />
                      <span className="text-ft2-text text-[10px] font-mono w-8 text-right">{Math.round(s.platterMass * 100)}%</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <label className="text-ft2-text text-xs font-mono">Scratch Sensitivity:</label>
                      <span className="text-[9px] text-ft2-textDim font-mono">How fast the record responds to drag</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="range" min="50" max="200" value={Math.round(s.jogWheelSensitivity * 100)}
                        onChange={(e) => s.setJogWheelSensitivity(parseInt(e.target.value) / 100)} className="w-20 accent-ft2-cursor" />
                      <span className="text-ft2-text text-[10px] font-mono w-8 text-right">{Math.round(s.jogWheelSensitivity * 100)}%</span>
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
          {s.activeTab === 'sid' && (
            <>
              {/* SID Engine */}
              <section>
                <h3 className="text-ft2-highlight text-xs font-bold mb-3 tracking-wide">SID PLAYER ENGINE</h3>
                <p className="text-ft2-textDim text-[9px] font-mono mb-2">Choose emulation engine for C64 SID music (.sid files).</p>
                <div className="space-y-2">
                  {Object.values(SID_ENGINES).map((engine) => (
                    <label key={engine.id}
                      className={`block p-2 border cursor-pointer transition-colors ${s.sidEngine === engine.id ? 'bg-ft2-rowEven border-ft2-highlight' : 'bg-transparent border-ft2-border hover:bg-ft2-rowEven/50'}`}>
                      <div className="flex items-center gap-2">
                        <input type="radio" name="sidEngine" value={engine.id} checked={s.sidEngine === engine.id}
                          onChange={(e) => s.setSidEngine(e.target.value as SIDEngineType)} className="accent-ft2-highlight" />
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
                  <CustomSelect value={s.sidHardwareMode}
                    onChange={(v) => { const mode = v as 'off' | 'asid' | 'webusb'; s.setSidHardwareMode(mode); s.setAsidEnabled(mode === 'asid'); }}
                    options={[
                      { value: 'off', label: 'Off — Software Only' },
                      { value: 'webusb', label: 'WebUSB — Direct USB' },
                      { value: 'asid', label: 'ASID — MIDI SysEx' },
                    ]}
                    className="bg-ft2-bg border border-ft2-border text-ft2-text text-[10px] font-mono px-2 py-1" />
                </div>

                {s.sidHardwareMode === 'webusb' && s.webusbSupported && (
                  <div className="pl-2 space-y-2 border-l border-ft2-border ml-1">
                    <button
                      onClick={async () => {
                        const { getSIDHardwareManager } = await import('@lib/sid/SIDHardwareManager');
                        const mgr = getSIDHardwareManager();
                        if (s.webusbConnected) {
                          await mgr.deactivate(); s.setSidHardwareMode('off'); s.setWebusbConnected(false); s.setWebusbDeviceName(null);
                        } else {
                          const ok = await mgr.connectWebUSB(); s.setWebusbConnected(ok);
                          if (ok) { const st = mgr.getStatus(); s.setWebusbDeviceName(st.deviceName); s.setWebusbFirmware(st.firmwareVersion ?? null); s.setWebusbChips(st.detectedChips ?? null); }
                        }
                      }}
                      className={`px-3 py-1 text-[10px] font-mono font-bold border ${s.webusbConnected ? 'border-accent-error text-accent-error' : 'border-ft2-highlight text-ft2-highlight'}`}>
                      {s.webusbConnected ? 'Disconnect' : 'Connect USB-SID-Pico'}
                    </button>
                    {s.webusbConnected && s.webusbDeviceName && <span className="text-ft2-highlight text-[9px] font-mono">Connected: {s.webusbDeviceName}</span>}
                  </div>
                )}

                {s.sidHardwareMode === 'asid' && s.asidSupported && (
                  <div className="pl-2 space-y-2 border-l border-ft2-border ml-1">
                    <CustomSelect value={s.asidDeviceId || ''} onChange={(v) => { s.setAsidDeviceId(v || null); getASIDDeviceManager().selectDevice(v || null); }}
                      options={s.asidDevices.length === 0
                        ? [{ value: '', label: 'No ASID devices' }]
                        : [{ value: '', label: 'Select device...' }, ...s.asidDevices.map((d) => ({ value: d.id, label: d.name }))]
                      }
                      className="bg-ft2-bg border border-ft2-border text-ft2-text text-[10px] font-mono px-2 py-1" />
                  </div>
                )}
              </section>
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              ABOUT TAB
              ═══════════════════════════════════════════════════════════════════ */}
          {s.activeTab === 'about' && (
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
                    s.handleClearState();
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
