/**
 * PixiSettingsModal — GL-native settings modal for the Pixi.js scene graph.
 *
 * Replaces the DOM SettingsModal with a fully GL-rendered equivalent that
 * goes through the CRT shader. Uses Div/Txt/GlModal layout system.
 *
 * DOM reference: src/components/dialogs/SettingsModal.tsx
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { FederatedPointerEvent, Graphics as GraphicsType } from 'pixi.js';
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
import { SID_ENGINES } from '@engine/deepsid/DeepSIDEngineManager';
import { useKeyboardStore } from '@stores/useKeyboardStore';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useAudioStore } from '@stores/useAudioStore';
import { useModlandContributionModal } from '@stores/useModlandContributionModal';
import { getTrackerReplayer } from '@engine/TrackerReplayer';
import { getDJEngineIfActive } from '@engine/dj/DJEngine';
import { BG_MODES, getBgModeLabel } from '@/components/tracker/TrackerVisualBackground';
import { getASIDDeviceManager, isASIDSupported } from '@lib/sid/ASIDDeviceManager';
import { notify } from '@stores';

// ── Constants ──────────────────────────────────────────────────────────────────

const MODAL_W = 700;
const MODAL_H = 550;
const CONTENT_W = MODAL_W - 30;
const SLIDER_W = 200;
const LABEL_W = 130;

const KEYBOARD_SCHEMES: SelectOption[] = [
  { value: 'fasttracker2', label: 'FastTracker 2' },
  { value: 'impulse-tracker', label: 'Impulse Tracker' },
  { value: 'protracker', label: 'ProTracker' },
  { value: 'octamed', label: 'OctaMED SoundStudio' },
  { value: 'renoise', label: 'Renoise' },
  { value: 'openmpt', label: 'OpenMPT' },
];

const THEME_OPTIONS: SelectOption[] = themes.map((t) => ({ value: t.id, label: t.name }));

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

const SID_ENGINE_OPTIONS: SelectOption[] = Object.values(SID_ENGINES).map((e) => ({
  value: e.id,
  label: `${e.name} — ${e.description.split('.')[0]}`,
}));

// CRT slider definitions
interface CRTSliderDef {
  key: keyof CRTParams;
  label: string;
  min: number;
  max: number;
  step: number;
  group: string;
}

const CRT_SLIDERS: CRTSliderDef[] = [
  { key: 'scanlineIntensity', label: 'Intensity',  min: 0,   max: 1,    step: 0.01,  group: 'SCANLINES' },
  { key: 'scanlineCount',     label: 'Count',      min: 50,  max: 1200, step: 1,     group: 'SCANLINES' },
  { key: 'adaptiveIntensity', label: 'Adaptive',   min: 0,   max: 1,    step: 0.01,  group: 'SCANLINES' },
  { key: 'brightness',        label: 'Brightness', min: 0.6, max: 1.8,  step: 0.01,  group: 'COLOR' },
  { key: 'contrast',          label: 'Contrast',   min: 0.6, max: 1.8,  step: 0.01,  group: 'COLOR' },
  { key: 'saturation',        label: 'Saturation', min: 0,   max: 2,    step: 0.01,  group: 'COLOR' },
  { key: 'bloomIntensity',    label: 'Bloom Int.',  min: 0,   max: 1.5,  step: 0.01,  group: 'EFFECTS' },
  { key: 'bloomThreshold',    label: 'Bloom Thr.',  min: 0,   max: 1,    step: 0.01,  group: 'EFFECTS' },
  { key: 'rgbShift',          label: 'RGB Shift',   min: 0,   max: 1,    step: 0.01,  group: 'EFFECTS' },
  { key: 'vignetteStrength',  label: 'Vignette',    min: 0,   max: 2,    step: 0.01,  group: 'FRAMING' },
  { key: 'curvature',         label: 'Curvature',   min: 0,   max: 0.5,  step: 0.005, group: 'FRAMING' },
  { key: 'flickerStrength',   label: 'Flicker',     min: 0,   max: 0.15, step: 0.001, group: 'FRAMING' },
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
  const sidEngine = useSettingsStore((s) => s.sidEngine);
  const setSidEngine = useSettingsStore((s) => s.setSidEngine);
  const asidEnabled = useSettingsStore((s) => s.asidEnabled);
  const setAsidEnabled = useSettingsStore((s) => s.setAsidEnabled);
  const asidDeviceId = useSettingsStore((s) => s.asidDeviceId);
  const setAsidDeviceId = useSettingsStore((s) => s.setAsidDeviceId);
  const asidDeviceAddress = useSettingsStore((s) => s.asidDeviceAddress);
  const setAsidDeviceAddress = useSettingsStore((s) => s.setAsidDeviceAddress);

  const sampleBusGain = useAudioStore((s) => s.sampleBusGain);
  const setSampleBusGain = useAudioStore((s) => s.setSampleBusGain);
  const synthBusGain = useAudioStore((s) => s.synthBusGain);
  const setSynthBusGain = useAudioStore((s) => s.setSynthBusGain);
  const autoGain = useAudioStore((s) => s.autoGain);
  const setAutoGain = useAudioStore((s) => s.setAutoGain);

  const editStep = useTrackerStore((s) => s.editStep);
  const setEditStep = useTrackerStore((s) => s.setEditStep);
  const insertMode = useTrackerStore((s) => s.insertMode);
  const toggleInsertMode = useTrackerStore((s) => s.toggleInsertMode);
  const recQuantEnabled = useTrackerStore((s) => s.recQuantEnabled);
  const setRecQuantEnabled = useTrackerStore((s) => s.setRecQuantEnabled);
  const recQuantRes = useTrackerStore((s) => s.recQuantRes);
  const setRecQuantRes = useTrackerStore((s) => s.setRecQuantRes);
  const recReleaseEnabled = useTrackerStore((s) => s.recReleaseEnabled);
  const setRecReleaseEnabled = useTrackerStore((s) => s.setRecReleaseEnabled);

  const activeScheme = useKeyboardStore((s) => s.activeScheme);
  const setActiveScheme = useKeyboardStore((s) => s.setActiveScheme);
  const platformOverride = useKeyboardStore((s) => s.platformOverride);
  const setPlatformOverride = useKeyboardStore((s) => s.setPlatformOverride);

  // ── Local state ──────────────────────────────────────────────────────────
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);
  const [asidDevices, setAsidDevices] = useState<Array<{ id: string; name: string }>>([]);
  const [asidSupported, setAsidSupported] = useState(false);

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
  const contentH = 1500 + crtSectionH;
  const scrollAreaH = MODAL_H - 48 - 44; // header + footer

  // CRT sliders grouped
  const crtGroups: string[] = [];
  CRT_SLIDERS.forEach((s) => { if (!crtGroups.includes(s.group)) crtGroups.push(s.group); });

  const screenW = app?.screen?.width ?? 1920;
  const screenH = app?.screen?.height ?? 1080;

  const drawOverlay = (g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, screenW, screenH);
    g.fill({ color: 0x000000, alpha: 0.5 });
  };

  const handleOverlayClick = (_e: FederatedPointerEvent) => { onClose(); };
  const handlePanelClick = (e: FederatedPointerEvent) => { e.stopPropagation(); };

  return (
    <pixiContainer visible={isOpen} layout={{ position: 'absolute', width: '100%', height: '100%' }}>
      {isOpen && (<>
      <pixiGraphics
        draw={drawOverlay}
        eventMode="static"
        onPointerUp={handleOverlayClick}
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
            onPointerUp={onClose}
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

        {/* Content — DOM: p-4 space-y-6 max-h-[70vh] overflow-y-auto */}
        <PixiScrollView
          width={MODAL_W}
          height={scrollAreaH}
          contentHeight={contentH}
          direction="vertical"
        >
          <Div className="flex-col gap-3 p-4" layout={{ width: CONTENT_W }}>

          {/* ═══════ DISPLAY ═══════ */}
          <SectionHeader text="DISPLAY" />

          <SettingRow label="Theme:">
            <PixiSelect
              options={THEME_OPTIONS}
              value={currentThemeId}
              onChange={setTheme}
              width={180}
            />
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

          <SettingRow label="CRT Effect:" description="Scanlines, curvature, bloom">
            <PixiCheckbox checked={crtEnabled} onChange={setCrtEnabled} />
          </SettingRow>

          {crtEnabled && (
            <Div className="flex-col gap-1" layout={{ width: CONTENT_W }}>
              {crtGroups.map((group) => (
                <React.Fragment key={group}>
                  <Div className="pt-1">
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

          {/* ═══════ MIDI ═══════ */}
          <SectionHeader text="MIDI" />

          <SettingRow label="Polyphonic Mode:" description="Play multiple notes simultaneously">
            <PixiCheckbox checked={midiPolyphonic} onChange={setMidiPolyphonic} />
          </SettingRow>

          {/* ═══════ SCRATCH ═══════ */}
          <SectionHeader text="SCRATCH" />

          <SettingRow label="Scratch Toggle:" description="Always enable scratch (OFF = only during playback)">
            <PixiCheckbox checked={scratchEnabled} onChange={setScratchEnabled} />
          </SettingRow>

          <SettingRow label="Scroll Acceleration:" description="Smooth velocity curve vs raw 1:1 scroll">
            <PixiCheckbox checked={scratchAcceleration} onChange={setScratchAcceleration} />
          </SettingRow>

          <SettingRow label="Platter Mass:" description="CDJ → Technics 1200 → Heavy">
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

          {/* Bus Gain Balance */}
          <SettingRow label="Bus Gain Auto:">
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

          {/* ═══════ KEYBOARD ═══════ */}
          <SectionHeader text="KEYBOARD" />

          <SettingRow label="Keyboard Scheme:">
            <PixiSelect
              options={KEYBOARD_SCHEMES}
              value={activeScheme}
              onChange={setActiveScheme}
              width={180}
            />
          </SettingRow>

          <SettingRow label="Platform:" description="Override Cmd/Ctrl detection">
            <PixiSelect
              options={PLATFORM_OPTIONS}
              value={platformOverride}
              onChange={(v) => setPlatformOverride(v as 'auto' | 'mac' | 'pc')}
              width={150}
            />
          </SettingRow>

          {/* ═══════ C64 SID ENGINE ═══════ */}
          <SectionHeader text="C64 SID ENGINE" />

          <SettingRow label="SID Engine:" description="Emulation engine for .sid playback">
            <PixiSelect
              options={SID_ENGINE_OPTIONS}
              value={sidEngine}
              onChange={(v) => setSidEngine(v as SIDEngineType)}
              width={280}
            />
          </SettingRow>

          {/* ═══════ ASID HARDWARE ═══════ */}
          <SectionHeader text="ASID HARDWARE OUTPUT" />

          {!asidSupported ? (
            <Txt className="text-[10px] font-mono text-text-muted">
              Web MIDI API not available. Requires Chrome, Edge, or Opera.
            </Txt>
          ) : (
            <>
              <SettingRow label="Enable ASID:" description="Route SID to real hardware via MIDI">
                <PixiCheckbox
                  checked={asidEnabled}
                  onChange={(enabled) => {
                    setAsidEnabled(enabled);
                    if (enabled && asidDevices.length === 1) {
                      setAsidDeviceId(asidDevices[0].id);
                      getASIDDeviceManager().selectDevice(asidDevices[0].id);
                    }
                  }}
                />
              </SettingRow>

              {asidEnabled && (
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
                </>
              )}
            </>
          )}

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
      </>)}
    </pixiContainer>
  );
};
