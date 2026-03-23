# Settings Dialog Deduplication — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract ~1,200 lines of duplicated logic from SettingsModal.tsx (DOM) and PixiSettingsModal.tsx (Pixi) into a shared `useSettingsDialog()` hook.

**Architecture:** Create `src/hooks/dialogs/useSettingsDialog.ts` containing all store subscriptions, local state, effects, handlers, and computed options. Both dialog files call this hook and keep only renderer-specific markup. Fixes three Pixi libopenmpt forwarding bugs (stereo mode, PT2 separation, modplug separation all lacked `applyLibopenmptSeparation`).

**Important notes for implementer:**
- Both dialogs use `useUIStore.getState()` and `useModlandContributionModal.getState()` for **imperative** (non-reactive) calls. These stay in the dialog files — NOT moved to the hook. Only reactive subscriptions move.
- The DOM version used full-object destructuring from stores (`const { x, y } = useStore()`), which subscribes to everything. The hook uses individual selectors (`useStore(s => s.x)`) — this is an intentional performance improvement.
- `themes` and `THEME_TOKEN_GROUPS` from `useThemeStore` are data imports needed for rendering — they stay in dialog files.

**Tech Stack:** TypeScript, React hooks, Zustand stores

**Spec:** `docs/superpowers/specs/2026-03-24-settings-dialog-dedup-design.md`

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `src/hooks/dialogs/useSettingsDialog.ts` | Shared hook: store subscriptions, local state, effects, handlers, computed options |

### Modified Files
| File | Changes |
|------|---------|
| `src/components/dialogs/SettingsModal.tsx` | Remove ~200 lines of store/state/handler code, call `useSettingsDialog()` instead |
| `src/pixi/dialogs/PixiSettingsModal.tsx` | Remove ~220 lines of store/state/handler code, call `useSettingsDialog()` instead |

---

## Task 1: Create useSettingsDialog hook — Constants & Types

**Files:**
- Create: `src/hooks/dialogs/useSettingsDialog.ts`

- [ ] **Step 1: Create the file with exported constants and types**

All constants currently duplicated between both dialogs. Use the DOM `{ id, name, description }` shape for KEYBOARD_SCHEMES (canonical). Static option arrays use `{ value: string; label: string }` shape.

```typescript
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
import { useSettingsStore, type SIDEngineType, type CRTParams } from '@stores/useSettingsStore';
import { useKeyboardStore } from '@stores/useKeyboardStore';
import { useEditorStore } from '@stores/useEditorStore';
import { useAudioStore } from '@stores/useAudioStore';
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
```

- [ ] **Step 2: Verify the file compiles**

Run: `npm run type-check`
Expected: PASS (no exports consumed yet, just constants)

- [ ] **Step 3: Commit**

```bash
git add src/hooks/dialogs/useSettingsDialog.ts
git commit -m "feat: add useSettingsDialog hook — constants and types"
```

---

## Task 2: Add useSettingsDialog hook body — Store subscriptions, state, effects, handlers

**Files:**
- Modify: `src/hooks/dialogs/useSettingsDialog.ts`

- [ ] **Step 1: Add the hook function with store subscriptions, local state, effects, handlers, and return value**

Append after the constants block. This is the full hook body — all store subscriptions from both dialogs, local state, effects (gated by `isOpen`), handlers (stereo with libopenmpt fix, fullscreen, clear state), and computed options.

```typescript
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
  const tb303Collapsed = useUIStore((s) => s.tb303Collapsed);
  const setTB303Collapsed = useUIStore((s) => s.setTB303Collapsed);
  const oscilloscopeVisible = useUIStore((s) => s.oscilloscopeVisible);
  const setOscilloscopeVisible = useUIStore((s) => s.setOscilloscopeVisible);
  const scratchEnabled = useUIStore((s) => s.scratchEnabled);
  const setScratchEnabled = useUIStore((s) => s.setScratchEnabled);
  const scratchAcceleration = useUIStore((s) => s.scratchAcceleration);
  const setScratchAcceleration = useUIStore((s) => s.setScratchAcceleration);
  const platterMass = useUIStore((s) => s.platterMass);
  const setPlatterMass = useUIStore((s) => s.setPlatterMass);

  // ── Store: useThemeStore ─────────────────────────────────────────────────
  const currentThemeId = useThemeStore((s) => s.currentThemeId);
  const setTheme = useThemeStore((s) => s.setTheme);
  const customThemeColors = useThemeStore((s) => s.customThemeColors);
  const copyThemeToCustom = useThemeStore((s) => s.copyThemeToCustom);
  const setCustomColor = useThemeStore((s) => s.setCustomColor);
  const resetCustomTheme = useThemeStore((s) => s.resetCustomTheme);

  // ── Store: useSettingsStore ──────────────────────────────────────────────
  const customBannerImage = useSettingsStore((s) => s.customBannerImage);
  const setCustomBannerImage = useSettingsStore((s) => s.setCustomBannerImage);
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
  const renderMode = useSettingsStore((s) => s.renderMode);
  const setRenderMode = useSettingsStore((s) => s.setRenderMode);
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

  /**
   * Set stereo separation mode and forward to ALL replayers + libopenmpt.
   * Fixes Pixi bug where libopenmpt was not updated on mode change.
   */
  const setStereoMode = useCallback((mode: 'pt2' | 'modplug') => {
    setStereoSeparationMode(mode);
    getTrackerReplayer().setStereoSeparationMode(mode);
    const djEng = getDJEngineIfActive();
    if (djEng) {
      djEng.deckA.replayer.setStereoSeparationMode(mode);
      djEng.deckB.replayer.setStereoSeparationMode(mode);
    }
    // Forward to libopenmpt (convert PT2 0-100 → 0-200, modplug already 0-200)
    const val = mode === 'pt2'
      ? useSettingsStore.getState().stereoSeparation * 2
      : useSettingsStore.getState().modplugSeparation;
    applyLibopenmptSeparation(val);
  }, [setStereoSeparationMode]);

  /** Set PT2 stereo separation (0-100) and forward to ALL replayers + libopenmpt. */
  const setStereoSeparationValue = useCallback((v: number) => {
    setStereoSeparation(v);
    getTrackerReplayer().setStereoSeparation(v);
    applyLibopenmptSeparation(v * 2); // PT2 0-100 → libopenmpt 0-200
    const djEng = getDJEngineIfActive();
    if (djEng) {
      djEng.deckA.replayer.setStereoSeparation(v);
      djEng.deckB.replayer.setStereoSeparation(v);
    }
  }, [setStereoSeparation]);

  /** Set modplug stereo separation (0-200) and forward to ALL replayers + libopenmpt. */
  const setModplugSeparationValue = useCallback((v: number) => {
    setModplugSeparation(v);
    getTrackerReplayer().setModplugSeparation(v);
    applyLibopenmptSeparation(v); // modplug already 0-200 scale
    const djEng = getDJEngineIfActive();
    if (djEng) {
      djEng.deckA.replayer.setModplugSeparation(v);
      djEng.deckB.replayer.setModplugSeparation(v);
    }
  }, [setModplugSeparation]);

  /** Clear ALL app state: service workers, caches, localStorage, indexedDB, then reload. */
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
    tb303Collapsed, setTB303Collapsed, oscilloscopeVisible, setOscilloscopeVisible,
    scratchEnabled, setScratchEnabled, scratchAcceleration, setScratchAcceleration,
    platterMass, setPlatterMass,
    // Theme store
    currentThemeId, setTheme, customThemeColors, copyThemeToCustom,
    setCustomColor, resetCustomTheme,
    // Settings store
    customBannerImage, setCustomBannerImage, welcomeJingleEnabled, setWelcomeJingleEnabled,
    amigaLimits, setAmigaLimits, linearInterpolation, setLinearInterpolation,
    useBLEP, setUseBLEP, stereoSeparation, stereoSeparationMode, modplugSeparation,
    midiPolyphonic, setMidiPolyphonic,
    vuMeterMode, setVuMeterMode, vuMeterStyle, setVuMeterStyle,
    vuMeterSwing, setVuMeterSwing, vuMeterMirror, setVuMeterMirror,
    wobbleWindows, setWobbleWindows,
    trackerVisualBg, setTrackerVisualBg, trackerVisualMode, setTrackerVisualMode,
    renderMode, setRenderMode,
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
    webusbSupported, webusbConnected, webusbDeviceName, webusbFirmware, webusbChips,
    // Handlers
    toggleFullscreen, setStereoMode, setStereoSeparationValue, setModplugSeparationValue,
    handleClearState,
    // Computed
    visualModeOptions, asidDeviceOptions,
  };
}
```

**IMPORTANT implementation notes:**
- The `isOpen` guard on effects supports Pixi's persistent-mount lifecycle (DOM unmounts entirely when closed, so `isOpen` is always `true` there).
- `setStereoMode` includes `applyLibopenmptSeparation()` — this fixes the Pixi bug.
- `setStereoSeparationValue` applies `v * 2` for libopenmpt (PT2 uses 0-100, libopenmpt uses 0-200).
- The `applyLibopenmptSeparation` helper uses dynamic import to avoid circular deps.

- [ ] **Step 2: Verify the hook compiles**

Run: `npm run type-check`
Expected: PASS. If there are unused variable warnings for the `webusbConnected`/`webusbDeviceName`/`webusbFirmware`/`webusbChips` setters (they're used in WebUSB effects we haven't wired yet), those are expected — the dialog JSX will consume them.

Note: The setters for WebUSB state (`setWebusbConnected`, `setWebusbDeviceName`, etc.) may need to be exposed from the hook if the dialogs have WebUSB connection effects we haven't migrated yet. Check both dialog files for WebUSB `useEffect` blocks and add any missing setters to the hook return. The exact WebUSB fields will be validated when wiring the dialogs in Tasks 3-4.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/dialogs/useSettingsDialog.ts
git commit -m "feat: add useSettingsDialog hook — store bindings, state, effects, handlers"
```

---

## Task 3: Wire DOM SettingsModal to useSettingsDialog

**Files:**
- Modify: `src/components/dialogs/SettingsModal.tsx`

- [ ] **Step 1: Replace constants, imports, store hooks, local state, effects, and handlers**

In `SettingsModal.tsx`:

1. **Remove** the following blocks entirely:
   - `normalizeToHex6` function (lines 26-40) — keep this, it's DOM-only
   - `CRTSlider` sub-component (lines 42-67) — keep this, it's DOM-only
   - `KEYBOARD_SCHEMES` constant (lines 69-76) — replaced by hook export
   - `SettingsTab` type (line 78) — replaced by hook export
   - `TABS` constant (lines 80-88) — replaced by hook export
   - All store destructuring inside the component (lines 97-182) — replaced by hook
   - All `useState` for local state (lines 184-195) — replaced by hook (keep `showShortcuts` — DOM-only)
   - All `useEffect` blocks (lines 197-222) — replaced by hook
   - `toggleFullscreen` function (lines 224-234) — replaced by hook
   - `applyModeToReplayers` function (lines 236-248) — replaced by hook's `setStereoMode`
   - `applyModplugSeparationToReplayers` function (lines 250-257) — replaced by hook's `setModplugSeparationValue`
   - `applyLibopenmptSeparation` function (lines 259-266) — replaced by hook internal
   - `useModalClose` call (line 268-269) — keep this (modal keyboard handling)

2. **Add** imports:
   ```typescript
   import {
     useSettingsDialog,
     SETTINGS_TABS,
     KEYBOARD_SCHEMES,
     CRT_SLIDERS,
     LENS_SLIDERS,
     RENDER_MODE_OPTIONS,
     STEREO_MODE_OPTIONS,
     VU_MODE_OPTIONS,
     type SettingsTab,
     type CRTSliderDef,
   } from '@hooks/dialogs/useSettingsDialog';
   ```

3. **Add** hook call at top of component:
   ```typescript
   const s = useSettingsDialog({ isOpen: true }); // DOM unmounts when closed
   const [showShortcuts, setShowShortcuts] = useState(false); // DOM-only
   ```

4. **Replace** all direct store/handler references in JSX with `s.xxx`. Examples:
   - `stereoSeparation` → `s.stereoSeparation`
   - `setStereoSeparation(v)` → `s.setStereoSeparationValue(v)` (for the slider onChange)
   - `setModplugSeparation(v); applyModplugSeparationToReplayers(v); applyLibopenmptSeparation(v);` → `s.setModplugSeparationValue(v)`
   - `setStereoSeparationMode(mode); applyModeToReplayers(mode);` → `s.setStereoMode(mode)`
   - `toggleFullscreen` → `s.toggleFullscreen`
   - `TABS` → `SETTINGS_TABS`
   - `activeTab` / `setActiveTab` → `s.activeTab` / `s.setActiveTab`

5. **Remove** store imports that are now in the hook (except those still needed for imperative calls):
   - `useSettingsStore`, `useKeyboardStore`, `useEditorStore`, `useAudioStore` — fully replaced
   - `getTrackerReplayer`, `getDJEngineIfActive` — moved to hook
   - `BG_MODES`, `getBgModeLabel` — moved to hook
   - `getASIDDeviceManager`, `isASIDSupported` — moved to hook

   **Keep `useUIStore`** — DOM uses `useUIStore.getState().openModal('midi-wizard')` (line 897) and `useUIStore.getState().openModal('nks-wizard')` (line 905) imperatively. Also keep for scratch settings which use `useUIStore.getState()` inline (lines 926, 933, 938-940) — these are intentionally non-reactive. Convert these to use `s.scratchEnabled` etc. from the hook for reactivity, OR leave as `getState()` for the current non-reactive behavior. Either is correct.

   **Keep `useModlandContributionModal`** — DOM uses `getState().clearDismissedHashes()` imperatively (line 1051).

6. **Keep** these imports (DOM-only or data imports):
   - `lucide-react` icons
   - `Toggle` component
   - `KeyboardShortcutSheet`
   - `useModalClose`
   - `LENS_PRESETS`, `LENS_PRESET_ORDER`
   - `SID_ENGINES`
   - `themes`, `THEME_TOKEN_GROUPS` from `@stores/useThemeStore` (data imports for rendering)
   - `useUIStore` — still needed for imperative `useUIStore.getState().openModal(...)` calls (lines 897, 905)
   - `useModlandContributionModal` — still needed for imperative `getState().clearDismissedHashes()` (line 1051)

- [ ] **Step 2: Handle the inline stereo separation JSX handlers**

The DOM version has inline handlers in JSX (lines 527-534, 546-551). Replace the inline logic:

**Before (PT2 slider, ~line 527):**
```typescript
onChange={(e) => {
  const v = Number(e.target.value);
  setStereoSeparation(v);
  getTrackerReplayer().setStereoSeparation(v);
  applyLibopenmptSeparation(v * 2);
  const djEng = getDJEngineIfActive();
  if (djEng) { djEng.deckA.replayer.setStereoSeparation(v); djEng.deckB.replayer.setStereoSeparation(v); }
}}
```

**After:**
```typescript
onChange={(e) => s.setStereoSeparationValue(Number(e.target.value))}
```

**Before (modplug slider, ~line 546):**
```typescript
onChange={(e) => {
  const v = Number(e.target.value);
  setModplugSeparation(v);
  applyModplugSeparationToReplayers(v);
  applyLibopenmptSeparation(v);
}}
```

**After:**
```typescript
onChange={(e) => s.setModplugSeparationValue(Number(e.target.value))}
```

**Before (stereo mode dropdown, wherever it is):**
```typescript
onChange={(e) => {
  const mode = e.target.value as 'pt2' | 'modplug';
  setStereoSeparationMode(mode);
  applyModeToReplayers(mode);
}}
```

**After:**
```typescript
onChange={(e) => s.setStereoMode(e.target.value as 'pt2' | 'modplug')}
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run type-check`
Expected: PASS with no errors. If there are missing fields, check what the JSX references that isn't in the hook return and add it.

- [ ] **Step 4: Commit**

```bash
git add src/components/dialogs/SettingsModal.tsx
git commit -m "refactor: wire DOM SettingsModal to useSettingsDialog hook"
```

---

## Task 4: Wire Pixi PixiSettingsModal to useSettingsDialog

**Files:**
- Modify: `src/pixi/dialogs/PixiSettingsModal.tsx`

- [ ] **Step 1: Replace constants, imports, store hooks, local state, effects, and handlers**

In `PixiSettingsModal.tsx`:

1. **Remove** the following blocks entirely:
   - `SettingsTab` type (line 39) — replaced by hook export
   - `TABS` constant (lines 41-49) — replaced by hook export
   - `KEYBOARD_SCHEMES` constant (lines 59-66) — replaced by hook export
   - `KEYBOARD_SCHEME_OPTIONS` (line 68) — compute locally from shared `KEYBOARD_SCHEMES`
   - `getThemeOptions` function (lines 71-73) — keep this, it uses the `themes` array directly
   - `RENDER_MODE_OPTIONS` (lines 75-78) — replaced by hook export
   - `NUMBER_FORMAT_OPTIONS` (lines 80-83) — replaced by hook export
   - `EDIT_MODE_OPTIONS` (lines 85-88) — replaced by hook export
   - `QUANT_RES_OPTIONS` (lines 90-96) — replaced by hook export
   - `PLATFORM_OPTIONS` (lines 98-102) — replaced by hook export
   - `STEREO_MODE_OPTIONS` (lines 104-107) — replaced by hook export
   - `VU_MODE_OPTIONS` (lines 109-112) — replaced by hook export
   - `CRTSliderDef` interface and `CRT_SLIDERS` constant (lines 114-137) — replaced by hook export
   - All `useXxxStore` individual selectors inside the component (lines 179-277) — replaced by hook
   - All `useState` for local state (lines 280-287) — replaced by hook
   - Both `useEffect` blocks (lines 289-311) — replaced by hook
   - `toggleFullscreen` (lines 314-324) — replaced by hook
   - `handleStereoSepChange` (lines 326-337) — replaced by hook's `setStereoSeparationValue`
   - `handleModplugSepChange` (lines 339-350) — replaced by hook's `setModplugSeparationValue`
   - `handleStereoModeChange` (lines 352-364) — replaced by hook's `setStereoMode`
   - `handleClearState` (lines 366-378) — replaced by hook
   - `visualModeOptions` (lines 381-384) — replaced by hook
   - `asidDeviceOptions` (lines 386-392) — replaced by hook

2. **Add** imports:
   ```typescript
   import {
     useSettingsDialog,
     SETTINGS_TABS,
     KEYBOARD_SCHEMES,
     CRT_SLIDERS,
     RENDER_MODE_OPTIONS,
     NUMBER_FORMAT_OPTIONS,
     EDIT_MODE_OPTIONS,
     QUANT_RES_OPTIONS,
     PLATFORM_OPTIONS,
     STEREO_MODE_OPTIONS,
     VU_MODE_OPTIONS,
     type SettingsTab,
     type CRTSliderDef,
   } from '@hooks/dialogs/useSettingsDialog';
   ```

3. **Add** hook call at top of component:
   ```typescript
   const s = useSettingsDialog({ isOpen });
   ```

4. **Compute KEYBOARD_SCHEME_OPTIONS locally** (maps canonical `{ id, name }` → Pixi's `{ value, label }`):
   ```typescript
   const keyboardSchemeOptions: SelectOption[] = KEYBOARD_SCHEMES.map(k => ({ value: k.id, label: k.name }));
   ```

5. **Replace** all direct store/handler references in JSX with `s.xxx`. Key mappings:
   - `handleStereoSepChange` → `s.setStereoSeparationValue`
   - `handleModplugSepChange` → `s.setModplugSeparationValue`
   - `handleStereoModeChange` → `(v: string) => s.setStereoMode(v as 'pt2' | 'modplug')`
   - `handleClearState` → `s.handleClearState` (add `notify.success(...)` AFTER calling it if the Pixi version had a toast)
   - `TABS` → `SETTINGS_TABS`
   - `activeTab` / `setActiveTab` → `s.activeTab` / `s.setActiveTab`
   - All individual store values → `s.xxx`

6. **Remove** store imports now in the hook:
   - `useUIStore`, `useThemeStore` (keep `themes` import for `getThemeOptions`), `useSettingsStore` (keep `type CRTParams` if used in local rendering), `useKeyboardStore`, `useEditorStore`, `useAudioStore`, `useModlandContributionModal`
   - `getTrackerReplayer`, `getDJEngineIfActive`
   - `BG_MODES`, `getBgModeLabel`
   - `getASIDDeviceManager`, `isASIDSupported`

7. **Keep** these imports (Pixi-only):
   - All Pixi components (`PixiButton`, `PixiCheckbox`, `PixiSlider`, `PixiSelect`, etc.)
   - `usePixiTheme`, `PIXI_FONTS`, `Div`, `Txt`
   - `useApplication` from `@pixi/react`
   - `notify` from `@stores`
   - `pickFile` from Pixi services
   - `SID_ENGINES`
   - `LENS_PRESETS`, `LENS_PRESET_ORDER`
   - `themes` from `useThemeStore` (for `getThemeOptions`)

- [ ] **Step 2: Handle the handleClearState toast**

If PixiSettingsModal had a `notify.success()` after clearing state, the pattern is:

```typescript
onClick={() => {
  s.handleClearState();
  // Note: handleClearState calls location.reload(), so the toast may not be visible.
  // If the original had a toast, it was likely for the same reason — keep for parity.
}}
```

Check line ~1353 of PixiSettingsModal.tsx — if it just calls `handleClearState` with no toast wrapper, leave it as `s.handleClearState`.

- [ ] **Step 3: Verify it compiles**

Run: `npm run type-check`
Expected: PASS with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/pixi/dialogs/PixiSettingsModal.tsx
git commit -m "refactor: wire Pixi SettingsModal to useSettingsDialog hook"
```

---

## Task 5: Final verification and cleanup

**Files:**
- Review: `src/hooks/dialogs/useSettingsDialog.ts`, `src/components/dialogs/SettingsModal.tsx`, `src/pixi/dialogs/PixiSettingsModal.tsx`

- [ ] **Step 1: Full type check**

Run: `npm run type-check`
Expected: PASS with zero errors.

- [ ] **Step 2: Verify no remaining direct store access in either dialog**

Run these greps to confirm all store logic moved to the hook:

```bash
# Reactive store subscriptions should only be in useSettingsDialog now.
# These greps should return ONLY imperative getState() calls and data imports:
grep -n "useUIStore\|useThemeStore\|useSettingsStore\|useEditorStore\|useKeyboardStore\|useAudioStore" src/components/dialogs/SettingsModal.tsx
grep -n "useUIStore\|useThemeStore\|useSettingsStore\|useEditorStore\|useKeyboardStore\|useAudioStore" src/pixi/dialogs/PixiSettingsModal.tsx

# Engine calls should only be in useSettingsDialog:
grep -n "getTrackerReplayer\|getDJEngineIfActive\|applyLibopenmptSeparation" src/components/dialogs/SettingsModal.tsx
grep -n "getTrackerReplayer\|getDJEngineIfActive" src/pixi/dialogs/PixiSettingsModal.tsx
```

**Acceptable exceptions:**
- `useUIStore.getState().openModal(...)` — imperative modal open (DOM lines 897, 905)
- `useUIStore.getState().scratchEnabled/setScratchEnabled/etc.` — imperative scratch settings (DOM lines 926-940) — OR these may be converted to `s.xxx` reactive reads
- `useModlandContributionModal.getState().clearDismissedHashes()` — imperative clear (DOM line 1051, Pixi line 1337)
- `useThemeStore` data imports: `themes`, `THEME_TOKEN_GROUPS` (DOM), `themes` (Pixi for `getThemeOptions`)
- `useModalClose` — shared keyboard hook, stays in both dialogs
- `type CRTParams` import from `useSettingsStore` may remain in Pixi for local type references

- [ ] **Step 3: Manual test in DOM mode**

Open the app in DOM mode (`renderMode: 'dom'`). Open Settings. Verify:
- All tabs render correctly
- Theme switching works
- Stereo separation slider updates audio
- CRT sliders work
- Fullscreen toggle works
- Keyboard scheme selection works
- "Clear State" button works (will reload the page)

- [ ] **Step 4: Manual test in Pixi mode**

Open the app in Pixi/WebGL mode. Open Settings. Verify the same items as Step 3. Additionally verify:
- Stereo mode change now forwards to libopenmpt (the bug fix)

- [ ] **Step 5: Final commit**

```bash
git add src/hooks/dialogs/useSettingsDialog.ts src/components/dialogs/SettingsModal.tsx src/pixi/dialogs/PixiSettingsModal.tsx
git commit -m "refactor: complete settings dialog dedup — shared useSettingsDialog hook

Extracts ~1200 lines of duplicated logic from DOM SettingsModal and Pixi
PixiSettingsModal into a shared useSettingsDialog() hook. Both dialogs now
call the hook and keep only renderer-specific markup.

Fixes: Pixi stereo mode handler now forwards to libopenmpt (was missing)."
```
