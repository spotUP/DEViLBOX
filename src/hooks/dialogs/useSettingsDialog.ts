// src/hooks/dialogs/useSettingsDialog.ts
/**
 * useSettingsDialog — Shared logic hook for SettingsModal (DOM) and PixiSettingsModal (Pixi).
 *
 * Both dialogs call this hook and keep only their renderer-specific markup.
 * All store subscriptions, local state, effects, and handlers live here.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useUIStore } from '@stores/useUIStore';
import { useThemeStore } from '@stores/useThemeStore';
import { useSettingsStore, type CRTParams } from '@stores/useSettingsStore';
import { useKeyboardStore } from '@stores/useKeyboardStore';
import { useEditorStore } from '@stores/useEditorStore';
import { useAudioStore } from '@stores/useAudioStore';
import { useDJStore } from '@stores/useDJStore';
import { useModlandContributionModal } from '@stores/useModlandContributionModal';
import { getTrackerReplayer } from '@engine/TrackerReplayer';
import { getDJEngineIfActive } from '@engine/dj/DJEngine';
import { BG_MODES, getBgModeLabel } from '@/components/tracker/TrackerVisualBackground';
import { getASIDDeviceManager, isASIDSupported } from '@lib/sid/ASIDDeviceManager';

// ─── Types ───────────────────────────────────────────────────────────────────

export type SettingsTab = 'general' | 'audio' | 'visual' | 'recording' | 'input' | 'sid' | 'about';

// ─── Constants (exported, not in hook return) ────────────────────────────────

export const SETTINGS_TABS: Array<{ id: SettingsTab; label: string }> = [
  { id: 'general', label: 'General' },
  { id: 'audio', label: 'Audio' },
  { id: 'visual', label: 'Visual' },
  { id: 'recording', label: 'Recording' },
  { id: 'input', label: 'Input' },
  { id: 'sid', label: 'SID' },
  { id: 'about', label: 'About' },
];

export const KEYBOARD_SCHEMES = [
  { id: 'fasttracker2', name: 'FastTracker 2', description: 'Classic FT2 layout (DOS/PC) - from ft2-clone source' },
  { id: 'impulse-tracker', name: 'Impulse Tracker', description: 'IT/Schism Tracker style - from schismtracker source' },
  { id: 'protracker', name: 'ProTracker', description: 'Amiga MOD tracker layout - from pt2-clone source' },
  { id: 'octamed', name: 'OctaMED SoundStudio', description: 'Amiga OctaMED layout - from official documentation' },
  { id: 'renoise', name: 'Renoise', description: 'Modern DAW/tracker layout - from official documentation' },
  { id: 'openmpt', name: 'OpenMPT', description: 'ModPlug Tracker layout - from official wiki documentation' },
  { id: 'custom', name: 'Custom', description: 'Your own key bindings — start from any scheme and customize' },
];

export interface CRTSliderDef {
  key: keyof CRTParams;
  label: string;
  min: number;
  max: number;
  step: number;
  group: string;
}

export const CRT_SLIDERS: CRTSliderDef[] = [
  { key: 'scanlineIntensity', label: 'Intensity',       min: 0,   max: 1,    step: 0.01,  group: 'SCANLINES' },
  { key: 'scanlineCount',     label: 'Count',           min: 50,  max: 1200, step: 1,     group: 'SCANLINES' },
  { key: 'adaptiveIntensity', label: 'Adaptive',        min: 0,   max: 1,    step: 0.01,  group: 'SCANLINES' },
  { key: 'brightness',        label: 'Brightness',      min: 0.6, max: 1.8,  step: 0.01,  group: 'COLOR' },
  { key: 'contrast',          label: 'Contrast',        min: 0.6, max: 1.8,  step: 0.01,  group: 'COLOR' },
  { key: 'saturation',        label: 'Saturation',      min: 0,   max: 2,    step: 0.01,  group: 'COLOR' },
  { key: 'bloomIntensity',    label: 'Bloom Intensity', min: 0,   max: 1.5,  step: 0.01,  group: 'EFFECTS' },
  { key: 'bloomThreshold',    label: 'Bloom Threshold', min: 0,   max: 1,    step: 0.01,  group: 'EFFECTS' },
  { key: 'rgbShift',          label: 'RGB Shift',       min: 0,   max: 1,    step: 0.01,  group: 'EFFECTS' },
  { key: 'vignetteStrength',  label: 'Vignette',        min: 0,   max: 2,    step: 0.01,  group: 'FRAMING' },
  { key: 'curvature',         label: 'Curvature',       min: 0,   max: 0.5,  step: 0.005, group: 'FRAMING' },
  { key: 'flickerStrength',   label: 'Flicker',         min: 0,   max: 0.15, step: 0.001, group: 'FRAMING' },
];

export interface LensSliderDef {
  key: 'barrel' | 'chromatic' | 'vignette';
  label: string;
  min: number;
  max: number;
  step: number;
}

export const LENS_SLIDERS: LensSliderDef[] = [
  { key: 'barrel',    label: 'Barrel',    min: -0.5, max: 1,   step: 0.01 },
  { key: 'chromatic', label: 'Chromatic', min: 0,    max: 1,   step: 0.01 },
  { key: 'vignette',  label: 'Vignette',  min: 0,    max: 1,   step: 0.01 },
];

export const RENDER_MODE_OPTIONS = [
  { value: 'dom', label: 'DOM (React + Tailwind)' },
  { value: 'webgl', label: 'WebGL (PixiJS v8)' },
];

export const NUMBER_FORMAT_OPTIONS = [
  { value: 'hex', label: 'Hexadecimal' },
  { value: 'dec', label: 'Decimal' },
];

export const EDIT_MODE_OPTIONS = [
  { value: 'overwrite', label: 'Overwrite' },
  { value: 'insert', label: 'Insert (Shift Rows)' },
];

export const QUANT_RES_OPTIONS = [
  { value: '1', label: '1 row' },
  { value: '2', label: '2 rows' },
  { value: '4', label: '4 rows (1/4)' },
  { value: '8', label: '8 rows (1/2)' },
  { value: '16', label: '16 rows (1 beat)' },
];

export const PLATFORM_OPTIONS = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'mac', label: 'Mac (Cmd)' },
  { value: 'pc', label: 'PC (Ctrl)' },
];

export const STEREO_MODE_OPTIONS = [
  { value: 'pt2', label: 'PT2-Clone' },
  { value: 'modplug', label: 'ModPlug' },
];

export const VU_MODE_OPTIONS = [
  { value: 'trigger', label: 'Trigger' },
  { value: 'realtime', label: 'Realtime' },
];

// ─── Helper (not exported — internal to hook) ────────────────────────────────

/** Forward stereo separation to libopenmpt WASM worklet (0-200 scale). */
function applyLibopenmptSeparation(percent200: number): void {
  import('@engine/libopenmpt/LibopenmptEngine').then(({ LibopenmptEngine }) => {
    if (LibopenmptEngine.hasInstance()) {
      LibopenmptEngine.getInstance().setStereoSeparation(percent200);
    }
  }).catch((err) => console.warn('Failed to apply stereo separation:', err));
}

// ─── Hook ────────────────────────────────────────────────────────────────────

interface UseSettingsDialogOptions {
  isOpen: boolean;
}

export function useSettingsDialog({ isOpen }: UseSettingsDialogOptions) {
  // ── Tab state ────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  // ── Store: useUIStore ────────────────────────────────────────────────────
  const useHexNumbers = useUIStore((s) => s.useHexNumbers);
  const setUseHexNumbers = useUIStore((s) => s.setUseHexNumbers);
  const blankEmptyCells = useUIStore((s) => s.blankEmptyCells);
  const setBlankEmptyCells = useUIStore((s) => s.setBlankEmptyCells);
  const knobPanelCollapsed = useUIStore((s) => s.knobPanelCollapsed);
  const setKnobPanelCollapsed = useUIStore((s) => s.setKnobPanelCollapsed);
  const oscilloscopeVisible = useUIStore((s) => s.oscilloscopeVisible);
  const setOscilloscopeVisible = useUIStore((s) => s.setOscilloscopeVisible);
  const scratchEnabled = useUIStore((s) => s.scratchEnabled);
  const setScratchEnabled = useUIStore((s) => s.setScratchEnabled);
  const scratchAcceleration = useUIStore((s) => s.scratchAcceleration);
  const setScratchAcceleration = useUIStore((s) => s.setScratchAcceleration);
  const platterMass = useUIStore((s) => s.platterMass);
  const setPlatterMass = useUIStore((s) => s.setPlatterMass);
  const jogWheelSensitivity = useDJStore((s) => s.jogWheelSensitivity);
  const setJogWheelSensitivity = useDJStore((s) => s.setJogWheelSensitivity);

  // ── Store: useThemeStore ─────────────────────────────────────────────────
  const currentThemeId = useThemeStore((s) => s.currentThemeId);
  const setTheme = useThemeStore((s) => s.setTheme);
  const customThemeColors = useThemeStore((s) => s.customThemeColors);
  const copyThemeToCustom = useThemeStore((s) => s.copyThemeToCustom);
  const setCustomColor = useThemeStore((s) => s.setCustomColor);
  const resetCustomTheme = useThemeStore((s) => s.resetCustomTheme);

  // ── Store: useSettingsStore ──────────────────────────────────────────────
  const welcomeJingleEnabled = useSettingsStore((s) => s.welcomeJingleEnabled);
  const setWelcomeJingleEnabled = useSettingsStore((s) => s.setWelcomeJingleEnabled);
  const amigaLimits = useSettingsStore((s) => s.amigaLimits);
  const setAmigaLimits = useSettingsStore((s) => s.setAmigaLimits);
  const linearInterpolation = useSettingsStore((s) => s.linearInterpolation);
  const setLinearInterpolation = useSettingsStore((s) => s.setLinearInterpolation);
  const useBLEP = useSettingsStore((s) => s.useBLEP);
  const setUseBLEP = useSettingsStore((s) => s.setUseBLEP);
  const stereoSeparation = useSettingsStore((s) => s.stereoSeparation);
  const setStereoSeparation = useSettingsStore((s) => s.setStereoSeparation);
  const stereoSeparationMode = useSettingsStore((s) => s.stereoSeparationMode);
  const setStereoSeparationMode = useSettingsStore((s) => s.setStereoSeparationMode);
  const modplugSeparation = useSettingsStore((s) => s.modplugSeparation);
  const setModplugSeparation = useSettingsStore((s) => s.setModplugSeparation);
  const headphonesMode = useSettingsStore((s) => s.headphonesMode);
  const setHeadphonesMode = useSettingsStore((s) => s.setHeadphonesMode);
  const midiPolyphonic = useSettingsStore((s) => s.midiPolyphonic);
  const setMidiPolyphonic = useSettingsStore((s) => s.setMidiPolyphonic);
  const vuMeterMode = useSettingsStore((s) => s.vuMeterMode);
  const setVuMeterMode = useSettingsStore((s) => s.setVuMeterMode);
  const vuMeterStyle = useSettingsStore((s) => s.vuMeterStyle);
  const setVuMeterStyle = useSettingsStore((s) => s.setVuMeterStyle);
  const vuMeterSwing = useSettingsStore((s) => s.vuMeterSwing);
  const setVuMeterSwing = useSettingsStore((s) => s.setVuMeterSwing);
  const vuMeterMirror = useSettingsStore((s) => s.vuMeterMirror);
  const setVuMeterMirror = useSettingsStore((s) => s.setVuMeterMirror);
  const wobbleWindows = useSettingsStore((s) => s.wobbleWindows);
  const setWobbleWindows = useSettingsStore((s) => s.setWobbleWindows);
  const trackerVisualBg = useSettingsStore((s) => s.trackerVisualBg);
  const setTrackerVisualBg = useSettingsStore((s) => s.setTrackerVisualBg);
  const trackerVisualMode = useSettingsStore((s) => s.trackerVisualMode);
  const setTrackerVisualMode = useSettingsStore((s) => s.setTrackerVisualMode);
  const channelColorBlend = useSettingsStore((s) => s.channelColorBlend);
  const setChannelColorBlend = useSettingsStore((s) => s.setChannelColorBlend);
  const crtEnabled = useSettingsStore((s) => s.crtEnabled);
  const setCrtEnabled = useSettingsStore((s) => s.setCrtEnabled);
  const crtParams = useSettingsStore((s) => s.crtParams);
  const setCrtParam = useSettingsStore((s) => s.setCrtParam);
  const resetCrtParams = useSettingsStore((s) => s.resetCrtParams);
  const lensEnabled = useSettingsStore((s) => s.lensEnabled);
  const setLensEnabled = useSettingsStore((s) => s.setLensEnabled);
  const lensPreset = useSettingsStore((s) => s.lensPreset);
  const setLensPreset = useSettingsStore((s) => s.setLensPreset);
  const lensParams = useSettingsStore((s) => s.lensParams);
  const setLensParam = useSettingsStore((s) => s.setLensParam);
  const resetLensParams = useSettingsStore((s) => s.resetLensParams);
  const sidEngine = useSettingsStore((s) => s.sidEngine);
  const setSidEngine = useSettingsStore((s) => s.setSidEngine);
  const asidEnabled = useSettingsStore((s) => s.asidEnabled);
  const setAsidEnabled = useSettingsStore((s) => s.setAsidEnabled);
  const asidDeviceId = useSettingsStore((s) => s.asidDeviceId);
  const setAsidDeviceId = useSettingsStore((s) => s.setAsidDeviceId);
  const asidDeviceAddress = useSettingsStore((s) => s.asidDeviceAddress);
  const setAsidDeviceAddress = useSettingsStore((s) => s.setAsidDeviceAddress);
  const sidHardwareMode = useSettingsStore((s) => s.sidHardwareMode);
  const setSidHardwareMode = useSettingsStore((s) => s.setSidHardwareMode);
  const webusbClockRate = useSettingsStore((s) => s.webusbClockRate);
  const setWebusbClockRate = useSettingsStore((s) => s.setWebusbClockRate);
  const webusbStereo = useSettingsStore((s) => s.webusbStereo);
  const setWebusbStereo = useSettingsStore((s) => s.setWebusbStereo);

  // ── Store: useAudioStore ─────────────────────────────────────────────────
  const sampleBusGain = useAudioStore((s) => s.sampleBusGain);
  const setSampleBusGain = useAudioStore((s) => s.setSampleBusGain);
  const synthBusGain = useAudioStore((s) => s.synthBusGain);
  const setSynthBusGain = useAudioStore((s) => s.setSynthBusGain);
  const autoGain = useAudioStore((s) => s.autoGain);
  const setAutoGain = useAudioStore((s) => s.setAutoGain);

  // ── Store: useEditorStore ────────────────────────────────────────────────
  const editStep = useEditorStore((s) => s.editStep);
  const setEditStep = useEditorStore((s) => s.setEditStep);
  const insertMode = useEditorStore((s) => s.insertMode);
  const toggleInsertMode = useEditorStore((s) => s.toggleInsertMode);
  const recQuantEnabled = useEditorStore((s) => s.recQuantEnabled);
  const setRecQuantEnabled = useEditorStore((s) => s.setRecQuantEnabled);
  const recQuantRes = useEditorStore((s) => s.recQuantRes);
  const setRecQuantRes = useEditorStore((s) => s.setRecQuantRes);
  const recReleaseEnabled = useEditorStore((s) => s.recReleaseEnabled);
  const setRecReleaseEnabled = useEditorStore((s) => s.setRecReleaseEnabled);

  // ── Store: useKeyboardStore ──────────────────────────────────────────────
  const activeScheme = useKeyboardStore((s) => s.activeScheme);
  const setActiveScheme = useKeyboardStore((s) => s.setActiveScheme);
  const platformOverride = useKeyboardStore((s) => s.platformOverride);
  const setPlatformOverride = useKeyboardStore((s) => s.setPlatformOverride);

  // ── Store: useModlandContributionModal ───────────────────────────────────
  const clearDismissedHashes = useModlandContributionModal((s) => s.clearDismissedHashes);

  // ── Local state ──────────────────────────────────────────────────────────
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);
  const [asidDevices, setAsidDevices] = useState<Array<{ id: string; name: string }>>([]);
  const [asidSupported, setAsidSupported] = useState(false);
  const [webusbSupported] = useState(() => typeof navigator !== 'undefined' && 'usb' in navigator);
  const [webusbConnected, setWebusbConnected] = useState(false);
  const [webusbDeviceName, setWebusbDeviceName] = useState<string | null>(null);
  const [webusbFirmware, setWebusbFirmware] = useState<string | null>(null);
  const [webusbChips, setWebusbChips] = useState<Array<{ slot: number; detected: boolean; type?: string }> | null>(null);

  // Keep WebUSB state setters available for callers that extend the hook's returned value
  // (they are not returned directly but can be destructured by dialogs as needed)

  // ── Effects (gated by isOpen for Pixi persistent-mount lifecycle) ────────
  useEffect(() => {
    if (!isOpen) return;
    const handleFSChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFSChange);
    return () => document.removeEventListener('fullscreenchange', handleFSChange);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setAsidSupported(isASIDSupported());
    if (isASIDSupported()) {
      const manager = getASIDDeviceManager();
      manager.init().then(() => {
        setAsidDevices(manager.getDevices().map((d) => ({ id: d.id, name: d.name })));
      });
      const unsubscribe = manager.onStateChange((state) => {
        setAsidDevices(state.devices.map((d) => ({ id: d.id, name: d.name })));
      });
      return unsubscribe;
    }
  }, [isOpen]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error('Failed to toggle fullscreen:', err);
    }
  }, []);

  const setStereoMode = useCallback((mode: 'pt2' | 'modplug') => {
    setStereoSeparationMode(mode);
    getTrackerReplayer().setStereoSeparationMode(mode);
    const djEng = getDJEngineIfActive();
    if (djEng) {
      djEng.deckA.replayer.setStereoSeparationMode(mode);
      djEng.deckB.replayer.setStereoSeparationMode(mode);
    }
    const val = mode === 'pt2'
      ? useSettingsStore.getState().stereoSeparation * 2
      : useSettingsStore.getState().modplugSeparation;
    applyLibopenmptSeparation(val);
  }, [setStereoSeparationMode]);

  const setStereoSeparationValue = useCallback((v: number) => {
    setStereoSeparation(v);
    getTrackerReplayer().setStereoSeparation(v);
    applyLibopenmptSeparation(v * 2);
    const djEng = getDJEngineIfActive();
    if (djEng) {
      djEng.deckA.replayer.setStereoSeparation(v);
      djEng.deckB.replayer.setStereoSeparation(v);
    }
  }, [setStereoSeparation]);

  const setModplugSeparationValue = useCallback((v: number) => {
    setModplugSeparation(v);
    getTrackerReplayer().setModplugSeparation(v);
    applyLibopenmptSeparation(v);
    const djEng = getDJEngineIfActive();
    if (djEng) {
      djEng.deckA.replayer.setModplugSeparation(v);
      djEng.deckB.replayer.setModplugSeparation(v);
    }
  }, [setModplugSeparation]);

  const handleClearState = useCallback(() => {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.unregister())))
      .then(() => caches.keys())
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => {
        localStorage.clear();
        return indexedDB.databases();
      })
      .then((dbs) => Promise.all(dbs.map((db) => indexedDB.deleteDatabase(db.name!))))
      .then(() => location.reload());
  }, []);

  // ── Computed values ──────────────────────────────────────────────────────

  const visualModeOptions = useMemo(
    () => BG_MODES.map((bg, i) => ({ value: String(i), label: getBgModeLabel(bg) })),
    [],
  );

  const asidDeviceOptions = useMemo(
    () =>
      asidDevices.length === 0
        ? [{ value: '', label: 'No ASID devices found' }]
        : [{ value: '', label: 'Select a device...' }, ...asidDevices.map((d) => ({ value: d.id, label: d.name }))],
    [asidDevices],
  );

  // ── Return ───────────────────────────────────────────────────────────────

  return {
    // Tab
    activeTab, setActiveTab,
    // UI store
    useHexNumbers, setUseHexNumbers, blankEmptyCells, setBlankEmptyCells,
    knobPanelCollapsed, setKnobPanelCollapsed, oscilloscopeVisible, setOscilloscopeVisible,
    scratchEnabled, setScratchEnabled, scratchAcceleration, setScratchAcceleration,
    platterMass, setPlatterMass,
    jogWheelSensitivity, setJogWheelSensitivity,
    // Theme store
    currentThemeId, setTheme, customThemeColors, copyThemeToCustom,
    setCustomColor, resetCustomTheme,
    // Settings store
    welcomeJingleEnabled, setWelcomeJingleEnabled,
    amigaLimits, setAmigaLimits, linearInterpolation, setLinearInterpolation,
    useBLEP, setUseBLEP, stereoSeparation, stereoSeparationMode, modplugSeparation,
    headphonesMode, setHeadphonesMode,
    midiPolyphonic, setMidiPolyphonic,
    vuMeterMode, setVuMeterMode, vuMeterStyle, setVuMeterStyle,
    vuMeterSwing, setVuMeterSwing, vuMeterMirror, setVuMeterMirror,
    wobbleWindows, setWobbleWindows,
    trackerVisualBg, setTrackerVisualBg, trackerVisualMode, setTrackerVisualMode,
    channelColorBlend, setChannelColorBlend,
    crtEnabled, setCrtEnabled, crtParams, setCrtParam, resetCrtParams,
    lensEnabled, setLensEnabled, lensPreset, setLensPreset,
    lensParams, setLensParam, resetLensParams,
    sidEngine, setSidEngine,
    asidEnabled, setAsidEnabled, asidDeviceId, setAsidDeviceId,
    asidDeviceAddress, setAsidDeviceAddress,
    sidHardwareMode, setSidHardwareMode,
    webusbClockRate, setWebusbClockRate, webusbStereo, setWebusbStereo,
    // Audio store
    sampleBusGain, setSampleBusGain, synthBusGain, setSynthBusGain, autoGain, setAutoGain,
    // Editor store
    editStep, setEditStep, insertMode, toggleInsertMode,
    recQuantEnabled, setRecQuantEnabled, recQuantRes, setRecQuantRes,
    recReleaseEnabled, setRecReleaseEnabled,
    // Keyboard store
    activeScheme, setActiveScheme, platformOverride, setPlatformOverride,
    // Modland contribution
    clearDismissedHashes,
    // Local state
    isFullscreen, asidDevices, asidSupported,
    webusbSupported, webusbConnected, setWebusbConnected,
    webusbDeviceName, setWebusbDeviceName,
    webusbFirmware, setWebusbFirmware,
    webusbChips, setWebusbChips,
    // Handlers
    toggleFullscreen, setStereoMode, setStereoSeparationValue, setModplugSeparationValue,
    handleClearState,
    // Computed
    visualModeOptions, asidDeviceOptions,
  };
}
