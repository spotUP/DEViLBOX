/**
 * PixiSettingsModal — GL-native settings modal for the Pixi.js scene graph.
 *
 * Replaces the DOM SettingsModal with a fully GL-rendered equivalent that
 * goes through the CRT shader. Uses Div/Txt/GlModal layout system.
 *
 * DOM reference: src/components/dialogs/SettingsModal.tsx
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { FederatedPointerEvent, FederatedWheelEvent, Graphics as GraphicsType } from 'pixi.js';
import { useApplication } from '@pixi/react';
import { PixiButton, PixiCheckbox, PixiSlider, PixiNumericInput, PixiIcon } from '../components';
import { PixiSelect, type SelectOption } from '../components/PixiSelect';
import { PixiScrollView } from '../components/PixiScrollView';
import { usePixiTheme } from '../theme';
import { PIXI_FONTS } from '../fonts';
import { Div, Txt } from '../layout';

import { useUIStore } from '@stores/useUIStore';
import { useThemeStore, themes } from '@stores/useThemeStore';
import { useSettingsStore, type SIDEngineType, type CRTParams } from '@stores/useSettingsStore';
import { pickFile } from '../services/glFilePicker';
import { LENS_PRESETS, LENS_PRESET_ORDER } from '../LensFilter';
import { SID_ENGINES } from '@engine/deepsid/DeepSIDEngineManager';
import { useKeyboardStore } from '@stores/useKeyboardStore';
import { useEditorStore } from '@stores/useEditorStore';
import { useAudioStore } from '@stores/useAudioStore';
import { useModlandContributionModal } from '@stores/useModlandContributionModal';
import { getTrackerReplayer } from '@engine/TrackerReplayer';
import { getDJEngineIfActive } from '@engine/dj/DJEngine';
import { BG_MODES, getBgModeLabel } from '@/components/tracker/TrackerVisualBackground';
import { getASIDDeviceManager, isASIDSupported } from '@lib/sid/ASIDDeviceManager';
import { notify } from '@stores';
import { useModalClose } from '@hooks/useDialogKeyboard';

// ── Tab definitions ────────────────────────────────────────────────────────────

type SettingsTab = 'general' | 'audio' | 'visual' | 'recording' | 'input' | 'sid' | 'about';

const TABS: Array<{ id: SettingsTab; label: string }> = [
  { id: 'general', label: 'General' },
  { id: 'audio', label: 'Audio' },
  { id: 'visual', label: 'Visual' },
  { id: 'recording', label: 'Recording' },
  { id: 'input', label: 'Input' },
  { id: 'sid', label: 'SID' },
  { id: 'about', label: 'About' },
];

// ── Constants ──────────────────────────────────────────────────────────────────

const MODAL_W = 700;
const MODAL_H = 550;
const CONTENT_W = MODAL_W - 30;
const SLIDER_W = 200;
const LABEL_W = 130;

const KEYBOARD_SCHEMES = [
  { value: 'fasttracker2', label: 'FastTracker 2', description: 'Classic FT2 layout (DOS/PC) - from ft2-clone source' },
  { value: 'impulse-tracker', label: 'Impulse Tracker', description: 'IT/Schism Tracker style - from schismtracker source' },
  { value: 'protracker', label: 'ProTracker', description: 'Amiga MOD tracker layout - from pt2-clone source' },
  { value: 'octamed', label: 'OctaMED SoundStudio', description: 'Amiga OctaMED layout - from official documentation' },
  { value: 'renoise', label: 'Renoise', description: 'Modern DAW/tracker layout - from official documentation' },
  { value: 'openmpt', label: 'OpenMPT', description: 'ModPlug Tracker layout - from official wiki documentation' },
];

const KEYBOARD_SCHEME_OPTIONS: SelectOption[] = KEYBOARD_SCHEMES.map(s => ({ value: s.value, label: s.label }));

// Built dynamically since themes list can change when custom theme is added
function getThemeOptions(): SelectOption[] {
  return themes.map((t) => ({ value: t.id, label: t.name }));
}

const RENDER_MODE_OPTIONS: SelectOption[] = [
  { value: 'dom', label: 'DOM (React + Tailwind)' },
  { value: 'webgl', label: 'WebGL (PixiJS v8)' },
];

const NUMBER_FORMAT_OPTIONS: SelectOption[] = [
  { value: 'hex', label: 'Hexadecimal' },
  { value: 'dec', label: 'Decimal' },
];

const EDIT_MODE_OPTIONS: SelectOption[] = [
  { value: 'overwrite', label: 'Overwrite' },
  { value: 'insert', label: 'Insert (Shift Rows)' },
];

const QUANT_RES_OPTIONS: SelectOption[] = [
  { value: '1', label: '1 row' },
  { value: '2', label: '2 rows' },
  { value: '4', label: '4 rows (1/4)' },
  { value: '8', label: '8 rows (1/2)' },
  { value: '16', label: '16 rows (1 beat)' },
];

const PLATFORM_OPTIONS: SelectOption[] = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'mac', label: 'Mac (Cmd)' },
  { value: 'pc', label: 'PC (Ctrl)' },
];

const STEREO_MODE_OPTIONS: SelectOption[] = [
  { value: 'pt2', label: 'PT2-Clone' },
  { value: 'modplug', label: 'ModPlug' },
];

const VU_MODE_OPTIONS: SelectOption[] = [
  { value: 'trigger', label: 'Trigger' },
  { value: 'realtime', label: 'Realtime' },
];

// CRT slider definitions — labels match DOM SettingsModal 1:1
interface CRTSliderDef {
  key: keyof CRTParams;
  label: string;
  min: number;
  max: number;
  step: number;
  group: string;
}

const CRT_SLIDERS: CRTSliderDef[] = [
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

// ── Sub-components ─────────────────────────────────────────────────────────────

/** Section header label — DOM: text-xs font-bold, tracking-wide */
const SectionHeader: React.FC<{ text: string }> = ({ text }) => (
  <Div className="py-1">
    <Txt className="text-xs font-bold text-accent-primary uppercase">{text}</Txt>
  </Div>
);

/** Labelled row: label on left, control on right */
const SettingRow: React.FC<{
  label: string;
  description?: string;
  children: React.ReactNode;
}> = ({ label, description, children }) => (
  <Div className="flex-row items-center justify-between" layout={{ width: CONTENT_W, minHeight: 24 }}>
    <Div className="flex-col" layout={{ flex: 1 }}>
      <Txt className="text-xs font-mono text-text-primary">{label}</Txt>
      {description && <Txt className="text-[10px] font-mono text-text-muted">{description}</Txt>}
    </Div>
    {children}
  </Div>
);

// ── Component ──────────────────────────────────────────────────────────────────

interface PixiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PixiSettingsModal: React.FC<PixiSettingsModalProps> = ({ isOpen, onClose }) => {
  const theme = usePixiTheme();
  const { app } = useApplication();
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  // Standard modal keyboard handling (Enter/Escape to close)
  useModalClose({ isOpen, onClose });

  // ── Store hooks ──────────────────────────────────────────────────────────
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

  const currentThemeId = useThemeStore((s) => s.currentThemeId);
  const setTheme = useThemeStore((s) => s.setTheme);
  const customThemeColors = useThemeStore((s) => s.customThemeColors);
  const copyThemeToCustom = useThemeStore((s) => s.copyThemeToCustom);

  const customBannerImage = useSettingsStore((s) => s.customBannerImage);
  const setCustomBannerImage = useSettingsStore((s) => s.setCustomBannerImage);

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
  const vuMeterSwing = useSettingsStore((s) => s.vuMeterSwing);
  const setVuMeterSwing = useSettingsStore((s) => s.setVuMeterSwing);
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

  const sampleBusGain = useAudioStore((s) => s.sampleBusGain);
  const setSampleBusGain = useAudioStore((s) => s.setSampleBusGain);
  const synthBusGain = useAudioStore((s) => s.synthBusGain);
  const setSynthBusGain = useAudioStore((s) => s.setSynthBusGain);
  const autoGain = useAudioStore((s) => s.autoGain);
  const setAutoGain = useAudioStore((s) => s.setAutoGain);

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

  const activeScheme = useKeyboardStore((s) => s.activeScheme);
  const setActiveScheme = useKeyboardStore((s) => s.setActiveScheme);
  const platformOverride = useKeyboardStore((s) => s.platformOverride);
  const setPlatformOverride = useKeyboardStore((s) => s.setPlatformOverride);

  // ── Local state ──────────────────────────────────────────────────────────
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);
  const [asidDevices, setAsidDevices] = useState<Array<{ id: string; name: string }>>([]);
  const [asidSupported, setAsidSupported] = useState(false);
  const [webusbSupported] = useState(() => typeof navigator !== 'undefined' && 'usb' in navigator);
  const [webusbConnected, setWebusbConnected] = useState(false);
  const [webusbDeviceName, setWebusbDeviceName] = useState<string | null>(null);
  const [webusbFirmware, setWebusbFirmware] = useState<string | null>(null);
  const [webusbChips, setWebusbChips] = useState<Array<{ slot: number; detected: boolean; type?: string }> | null>(null);

  // Fullscreen change listener
  useEffect(() => {
    if (!isOpen) return;
    const handleFSChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFSChange);
    return () => document.removeEventListener('fullscreenchange', handleFSChange);
  }, [isOpen]);

  // ASID device init
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

  const handleStereoSepChange = useCallback(
    (v: number) => {
      setStereoSeparation(v);
      getTrackerReplayer().setStereoSeparation(v);
      const djEng = getDJEngineIfActive();
      if (djEng) {
        djEng.deckA.replayer.setStereoSeparation(v);
        djEng.deckB.replayer.setStereoSeparation(v);
      }
    },
    [setStereoSeparation],
  );

  const handleModplugSepChange = useCallback(
    (v: number) => {
      setModplugSeparation(v);
      getTrackerReplayer().setModplugSeparation(v);
      const djEng = getDJEngineIfActive();
      if (djEng) {
        djEng.deckA.replayer.setModplugSeparation(v);
        djEng.deckB.replayer.setModplugSeparation(v);
      }
    },
    [setModplugSeparation],
  );

  const handleStereoModeChange = useCallback(
    (v: string) => {
      const mode = v as 'pt2' | 'modplug';
      setStereoSeparationMode(mode);
      getTrackerReplayer().setStereoSeparationMode(mode);
      const djEng = getDJEngineIfActive();
      if (djEng) {
        djEng.deckA.replayer.setStereoSeparationMode(mode);
        djEng.deckB.replayer.setStereoSeparationMode(mode);
      }
    },
    [setStereoSeparationMode],
  );

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

  // ── Derived data ─────────────────────────────────────────────────────────
  const visualModeOptions: SelectOption[] = useMemo(
    () => BG_MODES.map((bg, i) => ({ value: String(i), label: getBgModeLabel(bg) })),
    [],
  );

  const asidDeviceOptions: SelectOption[] = useMemo(
    () =>
      asidDevices.length === 0
        ? [{ value: '', label: 'No ASID devices found' }]
        : [{ value: '', label: 'Select a device...' }, ...asidDevices.map((d) => ({ value: d.id, label: d.name }))],
    [asidDevices],
  );

  // Computations are safe regardless of isOpen (no null dereference risk)

  // Estimate total content height for the scroll view
  const crtSectionH = crtEnabled ? CRT_SLIDERS.length * 28 + 4 * 18 + 60 : 40;
  const lensSectionH = lensEnabled ? 3 * 28 + 2 * 18 + 60 + 40 : 40;
  const contentH = 2000 + crtSectionH + lensSectionH;
  const scrollAreaH = MODAL_H - 48 - 44; // header + footer

  // CRT sliders grouped
  const crtGroups: string[] = [];
  CRT_SLIDERS.forEach((s) => { if (!crtGroups.includes(s.group)) crtGroups.push(s.group); });

  let screenW = 1920;
  let screenH = 1080;
  try { screenW = app?.screen?.width ?? 1920; screenH = app?.screen?.height ?? 1080; } catch { /* app not ready */ }

  const drawOverlay = (g: GraphicsType) => {
    g.clear();
    // Transparent hit area — no visual fill, just captures pointer/wheel events outside the modal
    g.rect(0, 0, screenW, screenH);
    g.fill({ color: 0x000000, alpha: 0 });
  };

  const handleOverlayClick = (_e: FederatedPointerEvent) => { onClose(); };
  const handlePanelClick = (e: FederatedPointerEvent) => { e.stopPropagation(); };
  const blockWheel = useCallback((e: FederatedWheelEvent) => {
    e.stopPropagation();
    (e.nativeEvent as WheelEvent | undefined)?.preventDefault?.();
    (e.nativeEvent as WheelEvent | undefined)?.stopImmediatePropagation?.();
  }, []);

  return (
    <pixiContainer renderable={isOpen} eventMode={isOpen ? 'static' : 'none'} layout={{ position: 'absolute', width: '100%', height: '100%' }}>
      {/* Always mount structure to avoid addChild → Yoga BindingError */}
      <pixiGraphics
        draw={drawOverlay}
        eventMode="static"
        onPointerUp={handleOverlayClick}
        onWheel={blockWheel}
        layout={{ position: 'absolute', width: screenW, height: screenH }}
      />

      <layoutContainer
        eventMode="static"
        onPointerDown={handlePanelClick}
        layout={{
          position: 'absolute',
          left: Math.round((screenW - MODAL_W) / 2),
          top: Math.round((screenH - MODAL_H) / 2),
          width: MODAL_W,
          height: MODAL_H,
          flexDirection: 'column',
          backgroundColor: theme.bg.color,
          borderWidth: 2,
          borderColor: theme.border.color,
          overflow: 'hidden',
        }}
      >
        {/* Header — DOM: px-4 py-3 bg-ft2-header border-b-2 */}
        <layoutContainer
          layout={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingLeft: 16,
            paddingRight: 16,
            paddingTop: 12,
            paddingBottom: 12,
            backgroundColor: theme.bgTertiary.color,
            borderBottomWidth: 2,
            borderColor: theme.border.color,
          }}
        >
          <pixiBitmapText
            text="SETTINGS"
            style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 16, fill: 0xffffff }}
            tint={theme.accent.color}
            layout={{}}
          />
          <layoutContainer
            eventMode="static"
            cursor="pointer"
            onClick={onClose}
            layout={{
              width: 24,
              height: 24,
              justifyContent: 'center',
              alignItems: 'center',
              borderRadius: 4,
            }}
          >
            <PixiIcon name="close" size={16} color={theme.textMuted.color} layout={{}} />
          </layoutContainer>
        </layoutContainer>

        {/* Tab Bar */}
        <layoutContainer
          layout={{
            flexDirection: 'row',
            paddingLeft: 8,
            paddingRight: 8,
            backgroundColor: theme.bgTertiary.color,
            borderBottomWidth: 1,
            borderColor: theme.border.color,
            height: 32,
            alignItems: 'center',
          }}
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <layoutContainer
                key={tab.id}
                eventMode="static"
                cursor="pointer"
                onPointerDown={() => setActiveTab(tab.id)}
                onClick={() => setActiveTab(tab.id)}
                layout={{
                  paddingLeft: 12,
                  paddingRight: 12,
                  paddingTop: 6,
                  paddingBottom: 6,
                  // backgroundColor drives the active indicator — known to update correctly
                  // unlike borderBottomWidth which can fail to re-render on 0→2 transitions
                  backgroundColor: isActive ? theme.bgSecondary.color : undefined,
                  borderRadius: isActive ? 4 : 0,
                }}
              >
                <pixiBitmapText
                  text={tab.label.toUpperCase()}
                  style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 10, fill: 0xffffff }}
                  tint={isActive ? theme.accent.color : theme.textMuted.color}
                  layout={{}}
                />
              </layoutContainer>
            );
          })}
        </layoutContainer>

        {/* Content — DOM: p-4 space-y-6 max-h-[70vh] overflow-y-auto */}
        <PixiScrollView
          width={MODAL_W}
          height={scrollAreaH - 32}
          contentHeight={contentH}
          direction="vertical"
          bgColor={theme.bg.color}
        >
          <Div className="flex-col p-4" layout={{ width: CONTENT_W, backgroundColor: theme.bg.color }}>

          {/* ═══════════════════════════════════════════════════════════════════
              GENERAL TAB — Display, Layout
              ═══════════════════════════════════════════════════════════════════ */}
          <layoutContainer renderable={activeTab === 'general'} layout={{ width: CONTENT_W, height: activeTab === 'general' ? contentH : 0, overflow: 'hidden', flexDirection: 'column', gap: 12 }}>
          {/* ═══════ DISPLAY ═══════ */}
          <SectionHeader text="DISPLAY" />

          <SettingRow label="Theme:">
            <PixiSelect
              options={getThemeOptions()}
              value={currentThemeId}
              onChange={setTheme}
              width={180}
            />
          </SettingRow>

          {currentThemeId === 'custom' && customThemeColors && (
            <SettingRow label="" description="Edit colors in DOM mode (Settings > Theme)">
              <Div className="flex-row gap-1">
                {themes.filter(t => t.id !== 'custom').map(t => (
                  <PixiButton
                    key={t.id}
                    label={t.name}
                    variant="ghost"
                    size="sm"
                    onClick={() => copyThemeToCustom(t.id)}
                  />
                ))}
              </Div>
            </SettingRow>
          )}

          <SettingRow label="Custom Banner:" description="Shows after logo animation in visualizer">
            <Div className="flex-row gap-1">
              <PixiButton
                label="Upload"
                variant="ghost"
                size="sm"
                onClick={async () => {
                  const file = await pickFile({ accept: 'image/*' });
                  if (!file) return;
                  if (file.size > 512 * 1024) {
                    alert('Image must be under 512KB');
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () => setCustomBannerImage(reader.result as string);
                  reader.readAsDataURL(file);
                }}
              />
              {customBannerImage && (
                <PixiButton
                  label="Remove"
                  variant="ghost"
                  size="sm"
                  onClick={() => setCustomBannerImage(null)}
                />
              )}
            </Div>
          </SettingRow>

          <SettingRow label="UI Render Mode:" description="Switch between DOM and WebGL rendering">
            <PixiSelect
              options={RENDER_MODE_OPTIONS}
              value={renderMode}
              onChange={(v) => setRenderMode(v as 'dom' | 'webgl')}
              width={200}
            />
          </SettingRow>

          <SettingRow label="Number Format:">
            <PixiSelect
              options={NUMBER_FORMAT_OPTIONS}
              value={useHexNumbers ? 'hex' : 'dec'}
              onChange={(v) => setUseHexNumbers(v === 'hex')}
              width={150}
            />
          </SettingRow>

          <SettingRow label="Blank Empty Cells:" description="Hide ---, .., ... on empty rows">
            <PixiCheckbox checked={blankEmptyCells} onChange={setBlankEmptyCells} />
          </SettingRow>

          {/* ═══════ LAYOUT ═══════ */}
          <SectionHeader text="LAYOUT" />

          <SettingRow label="TB-303 Panel:">
            <PixiCheckbox checked={!tb303Collapsed} onChange={(v) => setTB303Collapsed(!v)} />
          </SettingRow>

          <SettingRow label="Oscilloscope:">
            <PixiCheckbox checked={oscilloscopeVisible} onChange={setOscilloscopeVisible} />
          </SettingRow>

          <SettingRow label="Fullscreen:">
            <PixiCheckbox checked={isFullscreen} onChange={toggleFullscreen} />
          </SettingRow>
          </layoutContainer>

          {/* ═══════════════════════════════════════════════════════════════════
              VISUAL TAB — Visual Background, CRT, Lens, Workbench
              ═══════════════════════════════════════════════════════════════════ */}
          <layoutContainer renderable={activeTab === 'visual'} layout={{ width: CONTENT_W, height: activeTab === 'visual' ? contentH : 0, overflow: 'hidden', flexDirection: 'column', gap: 12 }}>
          <SettingRow label="Visual Background:" description="Audio-reactive effects behind tracker">
            <PixiCheckbox checked={trackerVisualBg} onChange={setTrackerVisualBg} />
          </SettingRow>

          {trackerVisualBg && (
            <SettingRow label="Visual Mode:">
              <PixiSelect
                options={visualModeOptions}
                value={String(trackerVisualMode)}
                onChange={(v) => setTrackerVisualMode(Number(v))}
                width={180}
              />
            </SettingRow>
          )}

          {/* ═══════ CRT SHADER ═══════ */}
          <SectionHeader text="CRT SHADER" />

          <SettingRow label="CRT Effect:" description="WebGL post-processing — scanlines, curvature, bloom">
            <PixiCheckbox checked={crtEnabled} onChange={setCrtEnabled} />
          </SettingRow>

          {crtEnabled && (
            <Div className="flex-col gap-1" layout={{ width: CONTENT_W, borderTopWidth: 1, borderColor: theme.border.color, paddingTop: 8 }}>
              {crtGroups.map((group, gi) => (
                <React.Fragment key={group}>
                  <Div className={gi > 0 ? "pt-2" : "pt-1"}>
                    <Txt className="text-[10px] font-bold font-mono text-accent-primary uppercase">{group}</Txt>
                  </Div>
                  {CRT_SLIDERS.filter((s) => s.group === group).map((slider) => {
                    const val = crtParams[slider.key];
                    const decimals = slider.step < 0.01 ? 3 : slider.step < 0.1 ? 2 : 1;
                    return (
                      <Div
                        key={slider.key}
                        className="flex-row items-center gap-2"
                        layout={{ width: CONTENT_W, height: 24 }}
                      >
                        <Txt className="text-[10px] font-mono text-text-secondary" layout={{ width: LABEL_W }}>
                          {slider.label}
                        </Txt>
                        <PixiSlider
                          value={val}
                          min={slider.min}
                          max={slider.max}
                          step={slider.step}
                          onChange={(v) => setCrtParam(slider.key, v)}
                          orientation="horizontal"
                          length={SLIDER_W}
                          thickness={4}
                          handleWidth={10}
                          handleHeight={10}
                          color={theme.accent.color}
                        />
                        <Txt className="text-[10px] font-mono text-text-muted" layout={{ width: 50 }}>
                          {val.toFixed(decimals)}
                        </Txt>
                      </Div>
                    );
                  })}
                </React.Fragment>
              ))}

              <PixiButton label="Reset CRT to Defaults" variant="ghost" onClick={resetCrtParams} width={200} />
            </Div>
          )}

          {/* ═══════ LENS DISTORTION ═══════ */}
          <SectionHeader text="LENS DISTORTION" />

          <SettingRow label="Lens Effect:" description="Fish-eye, barrel, chromatic aberration">
            <PixiCheckbox checked={lensEnabled} onChange={setLensEnabled} />
          </SettingRow>

          {lensEnabled && (
            <Div className="flex-col gap-1" layout={{ width: CONTENT_W }}>
              <Div className="pt-1">
                <Txt className="text-[10px] font-bold font-mono text-accent-primary uppercase">PRESET</Txt>
              </Div>
              <Div className="flex-row flex-wrap gap-1" layout={{ width: CONTENT_W }}>
                {LENS_PRESET_ORDER.filter((p) => p !== 'off').map((presetKey) => {
                  const preset = LENS_PRESETS[presetKey];
                  return (
                    <PixiButton
                      key={presetKey}
                      label={preset.label}
                      variant={lensPreset === presetKey ? 'ft2' : 'ghost'}
                      color={lensPreset === presetKey ? 'blue' : undefined}
                      size="sm"
                      onClick={() => {
                        setLensPreset(presetKey);
                        setLensParam('barrel', preset.params.barrel);
                        setLensParam('chromatic', preset.params.chromatic);
                        setLensParam('vignette', preset.params.vignette);
                      }}
                    />
                  );
                })}
              </Div>
              <Div className="pt-1">
                <Txt className="text-[10px] font-bold font-mono text-accent-primary uppercase">MANUAL</Txt>
              </Div>
              {([
                { key: 'barrel'    as const, label: 'Barrel',    min: -0.5, max: 1,   step: 0.01 },
                { key: 'chromatic' as const, label: 'Chromatic', min: 0,    max: 1,   step: 0.01 },
                { key: 'vignette'  as const, label: 'Vignette',  min: 0,    max: 1,   step: 0.01 },
              ]).map((slider) => {
                const val = lensParams[slider.key];
                return (
                  <Div
                    key={slider.key}
                    className="flex-row items-center gap-2"
                    layout={{ width: CONTENT_W, height: 24 }}
                  >
                    <Txt className="text-[10px] font-mono text-text-secondary" layout={{ width: LABEL_W }}>
                      {slider.label}
                    </Txt>
                    <PixiSlider
                      value={val}
                      min={slider.min}
                      max={slider.max}
                      step={slider.step}
                      onChange={(v) => { setLensParam(slider.key, v); setLensPreset('custom'); }}
                      orientation="horizontal"
                      length={SLIDER_W}
                      thickness={4}
                      handleWidth={10}
                      handleHeight={10}
                      color={theme.accent.color}
                    />
                    <Txt className="text-[10px] font-mono text-text-muted" layout={{ width: 50 }}>
                      {val.toFixed(2)}
                    </Txt>
                  </Div>
                );
              })}

              <PixiButton label="Reset Lens to Defaults" variant="ghost" onClick={resetLensParams} width={200} />
            </Div>
          )}

          {/* ═══════ WORKBENCH ═══════ */}
          <SectionHeader text="WORKBENCH" />

          <Div className="flex-row">
            <Txt className="text-[9px] font-mono text-accent-primary">Tab</Txt>
            <Txt className="text-[9px] font-mono text-text-muted">{' — hold for Exposé (fit all windows) · release to restore'}</Txt>
          </Div>
          </layoutContainer>

          {/* ═══════════════════════════════════════════════════════════════════
              RECORDING TAB
              ═══════════════════════════════════════════════════════════════════ */}
          <layoutContainer renderable={activeTab === 'recording'} layout={{ width: CONTENT_W, height: activeTab === 'recording' ? contentH : 0, overflow: 'hidden', flexDirection: 'column', gap: 12 }}>
          {/* ═══════ RECORDING ═══════ */}
          <SectionHeader text="RECORDING" />

          <SettingRow label="Edit Step:">
            <PixiNumericInput
              value={editStep}
              min={0}
              max={16}
              step={1}
              onChange={setEditStep}
              width={50}
            />
          </SettingRow>

          <SettingRow label="Edit Mode:">
            <PixiSelect
              options={EDIT_MODE_OPTIONS}
              value={insertMode ? 'insert' : 'overwrite'}
              onChange={(v) => {
                const wantInsert = v === 'insert';
                if (wantInsert !== insertMode) toggleInsertMode();
              }}
              width={180}
            />
          </SettingRow>

          <SettingRow label="Record Key-Off:" description="Record === when keys are released">
            <PixiCheckbox checked={recReleaseEnabled} onChange={setRecReleaseEnabled} />
          </SettingRow>

          <SettingRow label="Quantization:">
            <Div className="flex-row items-center gap-2">
              <PixiCheckbox checked={recQuantEnabled} onChange={setRecQuantEnabled} />
              <PixiSelect
                options={QUANT_RES_OPTIONS}
                value={String(recQuantRes)}
                onChange={(v) => setRecQuantRes(Number(v))}
                width={140}
                disabled={!recQuantEnabled}
              />
            </Div>
          </SettingRow>
          </layoutContainer>

          {/* ═══════════════════════════════════════════════════════════════════
              INPUT TAB — MIDI, Keyboard, Vinyl Scratch
              ═══════════════════════════════════════════════════════════════════ */}
          <layoutContainer renderable={activeTab === 'input'} layout={{ width: CONTENT_W, height: activeTab === 'input' ? contentH : 0, overflow: 'hidden', flexDirection: 'column', gap: 12 }}>
          {/* ═══════ MIDI ═══════ */}
          <SectionHeader text="MIDI" />

          <SettingRow label="Polyphonic Mode:" description="Play multiple notes simultaneously">
            <PixiCheckbox checked={midiPolyphonic} onChange={setMidiPolyphonic} />
          </SettingRow>

          <Div className="flex-row gap-2" layout={{ width: CONTENT_W, paddingTop: 6 }}>
            <PixiButton
              label="Controller Wizard"
              variant="default"
              size="sm"
              onClick={() => { onClose(); useUIStore.getState().openModal('midi-wizard'); }}
              layout={{ flex: 1 }}
            />
            <PixiButton
              label="NKS Setup"
              variant="default"
              size="sm"
              onClick={() => { onClose(); useUIStore.getState().openModal('nks-wizard'); }}
              layout={{ flex: 1 }}
            />
          </Div>

          {/* ═══════ VINYL SCRATCH ═══════ */}
          <SectionHeader text="VINYL SCRATCH" />

          <SettingRow label="Always On:" description="Scratch even when playback is stopped">
            <PixiCheckbox checked={scratchEnabled} onChange={setScratchEnabled} />
          </SettingRow>

          <SettingRow label="Velocity Curve:" description="Smooth momentum (off = direct 1:1 response)">
            <PixiCheckbox checked={scratchAcceleration} onChange={setScratchAcceleration} />
          </SettingRow>

          <SettingRow label="Platter Weight:" description="Light (CDJ) → Medium (1200) → Heavy">
            <Div className="flex-row items-center gap-2">
              <PixiSlider
                value={Math.round(platterMass * 100)}
                min={0}
                max={100}
                step={1}
                onChange={(v) => setPlatterMass(v / 100)}
                orientation="horizontal"
                length={120}
                thickness={4}
                handleWidth={10}
                handleHeight={10}
                color={theme.accent.color}
              />
              <Txt className="text-[10px] font-mono text-text-primary">{`${Math.round(platterMass * 100)}%`}</Txt>
            </Div>
          </SettingRow>

          <Div className="flex-col gap-1" layout={{ width: CONTENT_W, borderTopWidth: 1, borderColor: theme.border.color, paddingTop: 6 }}>
            <Txt className="text-[9px] font-bold font-mono text-accent-primary">How to scratch:</Txt>
            <Txt className="text-[9px] font-mono text-text-muted">Scroll wheel/trackpad during playback controls speed &amp; direction</Txt>
            <Txt className="text-[9px] font-mono text-text-muted">Hold Z = fader cut · Hold X = crab scratch</Txt>
            <Txt className="text-[9px] font-mono text-text-muted">Touch: 2-finger swipe = nudge · 3-finger = grab</Txt>
            <Txt className="text-[9px] font-bold font-mono text-accent-primary" layout={{ paddingTop: 4 }}>DJ techniques (Shift+Alt):</Txt>
            <Txt className="text-[9px] font-mono text-text-muted">F = Fader cut · 1 = Trans · 2 = Crab · 3 = Flare</Txt>
            <Txt className="text-[9px] font-mono text-text-muted">4 = Chirp · 5 = Stab · 6 = 8-Finger · 7 = Twiddle · 0 = Stop</Txt>
          </Div>
          </layoutContainer>

          {/* ═══════════════════════════════════════════════════════════════════
              AUDIO TAB — Engine settings
              ═══════════════════════════════════════════════════════════════════ */}
          <layoutContainer renderable={activeTab === 'audio'} layout={{ width: CONTENT_W, height: activeTab === 'audio' ? contentH : 0, overflow: 'hidden', flexDirection: 'column', gap: 12 }}>
          {/* ═══════ ENGINE ═══════ */}
          <SectionHeader text="ENGINE" />

          <SettingRow label="Amiga Limits:" description="Clamp periods to 113-856">
            <PixiCheckbox checked={amigaLimits} onChange={setAmigaLimits} />
          </SettingRow>

          <SettingRow label="Sample Interpolation:" description="Linear (clean) vs None (crunchy)">
            <PixiCheckbox checked={linearInterpolation} onChange={setLinearInterpolation} />
          </SettingRow>

          <SettingRow label="BLEP Synthesis:" description="Band-limited (reduces aliasing)">
            <PixiCheckbox checked={useBLEP} onChange={setUseBLEP} />
          </SettingRow>

          {/* VU Meter Mode */}
          <SettingRow label="VU Meters:" description={vuMeterMode === 'realtime' ? 'Continuous audio levels' : 'Triggered on note-on'}>
            <PixiSelect
              options={VU_MODE_OPTIONS}
              value={vuMeterMode}
              onChange={(v: string) => setVuMeterMode(v as 'trigger' | 'realtime')}
              width={130}
            />
          </SettingRow>

          <SettingRow label="VU Swing:" description="Sine wave sway animation">
            <PixiCheckbox checked={vuMeterSwing} onChange={setVuMeterSwing} />
          </SettingRow>

          <SettingRow label="Wobble Windows:" description="Compiz-style wobbly windows (GL UI)">
            <PixiCheckbox checked={wobbleWindows} onChange={setWobbleWindows} />
          </SettingRow>

          {/* Stereo Separation */}
          <SettingRow label="Stereo Mode:">
            <PixiSelect
              options={STEREO_MODE_OPTIONS}
              value={stereoSeparationMode}
              onChange={handleStereoModeChange}
              width={130}
            />
          </SettingRow>

          {stereoSeparationMode === 'pt2' ? (
            <SettingRow label="Stereo Separation:" description="0% mono · 20% Amiga · 100% full">
              <Div className="flex-row items-center gap-2">
                <PixiSlider
                  value={stereoSeparation}
                  min={0}
                  max={100}
                  step={5}
                  onChange={handleStereoSepChange}
                  orientation="horizontal"
                  length={120}
                  thickness={4}
                  handleWidth={10}
                  handleHeight={10}
                  color={theme.accent.color}
                />
                <Txt className="text-[10px] font-mono text-text-primary">{`${stereoSeparation}%`}</Txt>
              </Div>
            </SettingRow>
          ) : (
            <SettingRow label="Stereo Separation:" description="0% mono · 100% normal · 200% wide">
              <Div className="flex-row items-center gap-2">
                <PixiSlider
                  value={modplugSeparation}
                  min={0}
                  max={200}
                  step={5}
                  onChange={handleModplugSepChange}
                  orientation="horizontal"
                  length={120}
                  thickness={4}
                  handleWidth={10}
                  handleHeight={10}
                  color={theme.accent.color}
                />
                <Txt className="text-[10px] font-mono text-text-primary">{`${modplugSeparation}%`}</Txt>
              </Div>
            </SettingRow>
          )}

          {/* Bus Gain Balance — matches DOM layout */}
          <SettingRow label="Bus Gain Balance:" description={autoGain ? 'Auto-balancing active — plays at least 1s to calibrate' : 'Balance sample vs synth/chip engine levels'}>
            <PixiCheckbox checked={autoGain} onChange={setAutoGain} />
          </SettingRow>

          <SettingRow label="Samples Gain:">
            <Div className="flex-row items-center gap-2">
              <PixiSlider
                value={sampleBusGain}
                min={-12}
                max={12}
                step={1}
                onChange={setSampleBusGain}
                orientation="horizontal"
                length={120}
                thickness={4}
                handleWidth={10}
                handleHeight={10}
                disabled={autoGain}
                color={theme.accent.color}
              />
              <Txt className="text-[10px] font-mono text-text-primary">
                {`${sampleBusGain > 0 ? '+' : ''}${sampleBusGain} dB`}
              </Txt>
            </Div>
          </SettingRow>

          <SettingRow label="Synths Gain:">
            <Div className="flex-row items-center gap-2">
              <PixiSlider
                value={synthBusGain}
                min={-12}
                max={12}
                step={1}
                onChange={setSynthBusGain}
                orientation="horizontal"
                length={120}
                thickness={4}
                handleWidth={10}
                handleHeight={10}
                disabled={autoGain}
                color={theme.accent.color}
              />
              <Txt className="text-[10px] font-mono text-text-primary">
                {`${synthBusGain > 0 ? '+' : ''}${synthBusGain} dB`}
              </Txt>
            </Div>
          </SettingRow>
          </layoutContainer>

          {/* Keyboard section is part of INPUT tab */}
          <layoutContainer renderable={activeTab === 'input'} layout={{ width: CONTENT_W, height: activeTab === 'input' ? contentH : 0, overflow: 'hidden', flexDirection: 'column', gap: 12 }}>
          {/* ═══════ KEYBOARD ═══════ */}
          <SectionHeader text="KEYBOARD" />

          <SettingRow label="Keyboard Scheme:">
            <PixiSelect
              options={KEYBOARD_SCHEME_OPTIONS}
              value={activeScheme}
              onChange={setActiveScheme}
              width={180}
            />
          </SettingRow>

          <Txt className="text-[9px] font-mono text-text-muted" layout={{ width: CONTENT_W }}>
            {KEYBOARD_SCHEMES.find(s => s.value === activeScheme)?.description || 'Select a tracker layout'}
          </Txt>

          <SettingRow label="Platform:" description="Override Cmd/Ctrl detection">
            <PixiSelect
              options={PLATFORM_OPTIONS}
              value={platformOverride}
              onChange={(v) => setPlatformOverride(v as 'auto' | 'mac' | 'pc')}
              width={150}
            />
          </SettingRow>
          </layoutContainer>

          {/* ═══════════════════════════════════════════════════════════════════
              SID TAB — SID Engine, SID Hardware
              ═══════════════════════════════════════════════════════════════════ */}
          <layoutContainer renderable={activeTab === 'sid'} layout={{ width: CONTENT_W, height: activeTab === 'sid' ? contentH : 0, overflow: 'hidden', flexDirection: 'column', gap: 12 }}>
          {/* ═══════ C64 SID ENGINE ═══════ */}
          <SectionHeader text="C64 SID PLAYER ENGINE" />

          <Txt className="text-[9px] font-mono text-text-muted" layout={{ width: CONTENT_W }}>
            {'Choose the emulation engine for C64 SID music playback (.sid files). Each engine offers different accuracy/performance tradeoffs.'}
          </Txt>

          {Object.values(SID_ENGINES).map((engine) => {
            const isSelected = sidEngine === engine.id;
            return (
              <layoutContainer
                key={engine.id}
                eventMode="static"
                cursor="pointer"
                onClick={() => setSidEngine(engine.id as SIDEngineType)}
                layout={{
                  width: CONTENT_W,
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  paddingLeft: 8,
                  paddingRight: 8,
                  paddingTop: 6,
                  paddingBottom: 6,
                  borderWidth: 1,
                  borderColor: isSelected ? theme.accent.color : theme.border.color,
                  borderRadius: 2,
                  backgroundColor: isSelected ? theme.bgActive.color : undefined,
                  gap: 8,
                }}
              >
                <Div className="flex-col gap-1" layout={{ flex: 1 }}>
                  <Div className="flex-row items-center gap-2">
                    <Txt className="text-[10px] font-bold font-mono text-text-primary">{engine.name}</Txt>
                    <Txt className="text-[9px] font-mono text-text-muted">{engine.size}</Txt>
                    {engine.id === 'websid' && (
                      <Txt className="text-[9px] font-mono text-accent-primary">(Recommended)</Txt>
                    )}
                  </Div>
                  <Txt className="text-[9px] font-mono text-text-muted">{engine.description}</Txt>
                  <Div className="flex-row gap-3">
                    <Txt className="text-[8px] font-mono text-text-muted">{`Accuracy: ${engine.accuracy}`}</Txt>
                    <Txt className="text-[8px] font-mono text-text-muted">{`Speed: ${engine.speed}`}</Txt>
                    {!engine.requiresWASM && (
                      <Txt className="text-[8px] font-mono text-accent-primary">No WASM</Txt>
                    )}
                  </Div>
                </Div>
              </layoutContainer>
            );
          })}

          {/* ═══════ SID HARDWARE OUTPUT ═══════ */}
          <SectionHeader text="SID HARDWARE OUTPUT" />

          <Txt className="text-[9px] font-mono text-text-muted" layout={{ width: CONTENT_W }}>
            {'Route SID playback to real MOS 6581/8580 chips via USB-SID-Pico or TherapSID hardware.'}
          </Txt>

          <SettingRow label="Transport:" description="WebUSB is recommended (cycle-exact, lower latency)">
            <PixiSelect
              options={[
                { value: 'off', label: 'Off — Software Only' },
                { value: 'webusb', label: 'WebUSB — Direct USB (recommended)' },
                { value: 'asid', label: 'ASID — MIDI SysEx (legacy)' },
              ]}
              value={sidHardwareMode}
              onChange={(v) => {
                const mode = (v || 'off') as 'off' | 'asid' | 'webusb';
                setSidHardwareMode(mode);
                setAsidEnabled(mode === 'asid');
              }}
              width={260}
            />
          </SettingRow>

          {sidHardwareMode === 'webusb' && (
            <>
              {!webusbSupported ? (
                <Div className="flex-col gap-1" layout={{ width: CONTENT_W, paddingLeft: 8, paddingRight: 8, paddingTop: 6, paddingBottom: 6, borderWidth: 1, borderColor: theme.border.color, borderRadius: 2 }}>
                  <Txt className="text-[10px] font-mono text-accent-error">WebUSB Not Supported</Txt>
                  <Txt className="text-[9px] font-mono text-text-muted">
                    {'WebUSB requires Chrome, Edge, or Opera. Firefox and Safari do not support WebUSB.'}
                  </Txt>
                </Div>
              ) : (
                <>
                  <SettingRow label="Device:" description={webusbConnected ? `Connected: ${webusbDeviceName}` : 'Click Connect to pair device'}>
                    <PixiButton
                      label={webusbConnected ? 'Disconnect' : 'Connect USB-SID-Pico'}
                      variant={webusbConnected ? 'danger' : 'primary'}
                      onClick={async () => {
                        const { getSIDHardwareManager } = await import('@lib/sid/SIDHardwareManager');
                        const mgr = getSIDHardwareManager();
                        if (webusbConnected) {
                          await mgr.deactivate();
                          setSidHardwareMode('off');
                          setWebusbConnected(false);
                          setWebusbDeviceName(null);
                          setWebusbFirmware(null);
                          setWebusbChips(null);
                        } else {
                          const ok = await mgr.connectWebUSB();
                          setWebusbConnected(ok);
                          if (ok) {
                            const st = mgr.getStatus();
                            setWebusbDeviceName(st.deviceName);
                            setWebusbFirmware(st.firmwareVersion ?? null);
                            setWebusbChips(st.detectedChips ?? null);
                          }
                        }
                      }}
                    />
                  </SettingRow>

                  {webusbConnected && (
                    <>
                      <SettingRow label="Clock Rate:" description="Match your SID chip region">
                        <PixiSelect
                          options={[
                            { value: '1', label: 'PAL (985248 Hz)' },
                            { value: '2', label: 'NTSC (1022727 Hz)' },
                            { value: '3', label: 'DREAN (1023440 Hz)' },
                            { value: '0', label: 'Default (1000000 Hz)' },
                          ]}
                          value={String(webusbClockRate)}
                          onChange={async (v) => {
                            const rate = parseInt(v || '1', 10) as import('@lib/sid/USBSIDPico').ClockRateValue;
                            setWebusbClockRate(rate);
                            const { getSIDHardwareManager } = await import('@lib/sid/SIDHardwareManager');
                            getSIDHardwareManager().setClock(rate);
                          }}
                          width={200}
                        />
                      </SettingRow>

                      <SettingRow label="Audio Output:" description="Stereo requires v1.3+ board">
                        <PixiCheckbox
                          checked={webusbStereo}
                          onChange={async (stereo) => {
                            setWebusbStereo(stereo);
                            const { getSIDHardwareManager } = await import('@lib/sid/SIDHardwareManager');
                            getSIDHardwareManager().setAudioMode(stereo);
                          }}
                          label={webusbStereo ? 'Stereo' : 'Mono'}
                        />
                      </SettingRow>

                      {/* Device info */}
                      {(webusbFirmware || webusbChips) && (
                        <Div className="flex-col gap-1" layout={{ width: CONTENT_W, paddingLeft: 8, paddingRight: 8, paddingTop: 4, paddingBottom: 4 }}>
                          {webusbFirmware && (
                            <Txt className="text-[9px] font-mono text-text-muted">{`Firmware: ${webusbFirmware}`}</Txt>
                          )}
                          {webusbChips && webusbChips.length > 0 && (
                            <Txt className="text-[9px] font-mono text-text-muted">{`SID chips: ${webusbChips.filter(c => c.detected).map(c => `Slot ${c.slot}: ${c.type || 'Unknown'}`).join(', ') || 'None detected'}`}</Txt>
                          )}
                        </Div>
                      )}
                    </>
                  )}

                  <Div className="flex-col gap-1" layout={{ width: CONTENT_W, paddingLeft: 8, paddingRight: 8, paddingTop: 6, paddingBottom: 6, borderWidth: 1, borderColor: theme.border.color, borderRadius: 2 }}>
                    <Txt className="text-[9px] font-bold font-mono text-text-primary">About WebUSB:</Txt>
                    <Txt className="text-[8px] font-mono text-text-muted">
                      {'Direct USB connection with cycle-exact timing. Register writes include C64 clock cycle counts so the Pico firmware replays with accurate timing — critical for digi samples, filter sweeps, and multiplexed effects.'}
                    </Txt>
                  </Div>
                </>
              )}
            </>
          )}

          {sidHardwareMode === 'asid' && (
            <>
              {!asidSupported ? (
                <Div className="flex-col gap-1" layout={{ width: CONTENT_W, paddingLeft: 8, paddingRight: 8, paddingTop: 6, paddingBottom: 6, borderWidth: 1, borderColor: theme.border.color, borderRadius: 2 }}>
                  <Txt className="text-[10px] font-mono text-accent-error">Not Supported</Txt>
                  <Txt className="text-[9px] font-mono text-text-muted">
                    {'Web MIDI API not available in this browser. ASID hardware support requires Chrome, Edge, or Opera.'}
                  </Txt>
                </Div>
              ) : (
                <>
                  <SettingRow label="MIDI Device:">
                    <PixiSelect
                      options={asidDeviceOptions}
                      value={asidDeviceId || ''}
                      onChange={(v) => {
                        const deviceId = v || null;
                        setAsidDeviceId(deviceId);
                        getASIDDeviceManager().selectDevice(deviceId);
                      }}
                      width={220}
                    />
                  </SettingRow>

                  {asidDevices.length === 0 && (
                    <Div className="flex-col gap-1" layout={{ width: CONTENT_W, paddingLeft: 8, paddingRight: 8, paddingTop: 6, paddingBottom: 6, borderWidth: 1, borderColor: theme.border.color, borderRadius: 2 }}>
                      <Txt className="text-[9px] font-bold font-mono text-text-primary">No ASID devices detected.</Txt>
                      <Txt className="text-[8px] font-mono text-text-muted">1. Connect USB-SID-Pico or TherapSID via USB</Txt>
                      <Txt className="text-[8px] font-mono text-text-muted">2. Ensure device drivers are installed</Txt>
                      <Txt className="text-[8px] font-mono text-text-muted">3. Grant MIDI permissions in browser if prompted</Txt>
                      <Txt className="text-[8px] font-mono text-text-muted">4. Refresh this settings modal</Txt>
                    </Div>
                  )}

                  <SettingRow label="Device Address:" description={`USB-SID-Pico default: 0x4D (77)`}>
                    <Div className="flex-row items-center gap-2">
                      <PixiNumericInput
                        value={asidDeviceAddress}
                        min={0}
                        max={255}
                        step={1}
                        onChange={(v) => setAsidDeviceAddress(v || 0x4d)}
                        width={60}
                      />
                      <Txt className="text-[10px] font-mono text-text-muted">
                        {`(0x${asidDeviceAddress.toString(16).toUpperCase().padStart(2, '0')})`}
                      </Txt>
                    </Div>
                  </SettingRow>

                  <Div className="flex-col gap-1" layout={{ width: CONTENT_W, paddingLeft: 8, paddingRight: 8, paddingTop: 6, paddingBottom: 6, borderWidth: 1, borderColor: theme.border.color, borderRadius: 2 }}>
                    <Txt className="text-[9px] font-bold font-mono text-text-primary">About ASID:</Txt>
                    <Txt className="text-[8px] font-mono text-text-muted">
                      {'ASID sends SID register writes via MIDI SysEx. No timing info — writes arrive as fast as possible. Works with any MIDI-connected SID hardware. Only jsSID engine supports ASID.'}
                    </Txt>
                  </Div>
                </>
              )}
            </>
          )}
          </layoutContainer>

          {/* ═══════════════════════════════════════════════════════════════════
              ABOUT TAB — Modland, Danger Zone, Info
              ═══════════════════════════════════════════════════════════════════ */}
          <layoutContainer renderable={activeTab === 'about'} layout={{ width: CONTENT_W, height: activeTab === 'about' ? contentH : 0, overflow: 'hidden', flexDirection: 'column', gap: 12 }}>
          {/* ═══════ MODLAND ═══════ */}
          <SectionHeader text="MODLAND INTEGRATION" />

          <Txt className="text-[10px] font-mono text-text-muted">
            Dismiss the contribution modal per-file to avoid notifications.
          </Txt>

          <PixiButton
            label="Clear Dismissed Files"
            variant="ghost"
            width={200}
            onClick={() => {
              useModlandContributionModal.getState().clearDismissedHashes();
              notify.success('Dismissed files cleared.');
            }}
          />

          {/* ═══════ DANGER ZONE ═══════ */}
          <SectionHeader text="DANGER ZONE" />

          <Txt className="text-[10px] font-mono text-text-muted">
            Clear all local state and reload. Your project will be lost if not exported first.
          </Txt>

          <PixiButton
            label="Clear All State & Reload"
            variant="danger"
            width={220}
            onClick={handleClearState}
          />

          {/* ═══════ INFO ═══════ */}
          <Div className="flex-col gap-1 pt-2">
            <Txt className="text-[10px] font-mono text-text-muted">DEViLBOX v1.0.0</Txt>
            <Txt className="text-[10px] font-mono text-text-muted">TB-303 Acid Tracker</Txt>
            <Txt className="text-[10px] font-mono text-accent-primary">Settings are saved automatically</Txt>
          </Div>
          </layoutContainer>

        </Div>
      </PixiScrollView>

      {/* Footer — DOM: px-4 py-3 bg-ft2-header border-t-2 flex justify-end */}
      <layoutContainer
        layout={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingLeft: 16,
          paddingRight: 16,
          paddingTop: 12,
          paddingBottom: 12,
          backgroundColor: theme.bgTertiary.color,
          borderTopWidth: 2,
          borderColor: theme.border.color,
        }}
      >
        <PixiButton label="CLOSE" variant="primary" width={80} onClick={onClose} />
      </layoutContainer>
      </layoutContainer>
    </pixiContainer>
  );
};
