/**
 * PixiSettingsModal — GL-native settings modal for the Pixi.js scene graph.
 *
 * Replaces the DOM SettingsModal with a fully GL-rendered equivalent that
 * goes through the CRT shader. Uses Div/Txt/GlModal layout system.
 *
 * DOM reference: src/components/dialogs/SettingsModal.tsx
 */

import React from 'react';
import { PixiButton, PixiCheckbox, PixiSlider, PixiNumericInput, PixiLabel } from '../components';
import { PixiModal } from '../components/PixiModal';
import { PixiSelect, type SelectOption } from '../components/PixiSelect';
import { PixiScrollView } from '../components/PixiScrollView';
import { usePixiTheme } from '../theme';
import { Div, Txt } from '../layout';

import { useUIStore } from '@stores/useUIStore';
import { themes } from '@stores/useThemeStore';
import { type SIDEngineType } from '@stores/useSettingsStore';
import { pickFile } from '../services/glFilePicker';
import { LENS_PRESETS, LENS_PRESET_ORDER } from '../LensFilter';
import { SID_ENGINES } from '@engine/deepsid/DeepSIDEngineManager';
import { getASIDDeviceManager } from '@lib/sid/ASIDDeviceManager';
import { notify } from '@stores';
import {
  useSettingsDialog,
  SETTINGS_TABS,
  KEYBOARD_SCHEMES,
  CRT_SLIDERS,
  LENS_SLIDERS,
  RENDER_MODE_OPTIONS,
  NUMBER_FORMAT_OPTIONS,
  EDIT_MODE_OPTIONS,
  QUANT_RES_OPTIONS,
  PLATFORM_OPTIONS,
  STEREO_MODE_OPTIONS,
  VU_MODE_OPTIONS,
} from '@hooks/dialogs/useSettingsDialog';

// ── Constants ──────────────────────────────────────────────────────────────────

const MODAL_W = 700;
const MODAL_H = 550;
const CONTENT_W = MODAL_W - 30;
const SLIDER_W = 200;
const LABEL_W = 130;


// Built dynamically since themes list can change when custom theme is added
function getThemeOptions(): SelectOption[] {
  return themes.map((t) => ({ value: t.id, label: t.name }));
}


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

  // ── Shared settings dialog logic ─────────────────────────────────────────
  const s = useSettingsDialog({ isOpen });

  // Compute keyboard scheme options from shared constant (id/name → value/label)
  const keyboardSchemeOptions: SelectOption[] = KEYBOARD_SCHEMES.map(k => ({ value: k.id, label: k.name }));

  // Computations are safe regardless of isOpen (no null dereference risk)

  // Estimate total content height for the scroll view
  const crtSectionH = s.crtEnabled ? CRT_SLIDERS.length * 28 + 4 * 18 + 60 : 40;
  const lensSectionH = s.lensEnabled ? LENS_SLIDERS.length * 28 + 2 * 18 + 60 + 40 : 40;
  const contentH = 2000 + crtSectionH + lensSectionH;
  const scrollAreaH = MODAL_H - 44; // header only (no footer)

  // CRT sliders grouped
  const crtGroups: string[] = [];
  CRT_SLIDERS.forEach((slider) => { if (!crtGroups.includes(slider.group)) crtGroups.push(slider.group); });

  return (
    <PixiModal isOpen={isOpen} onClose={onClose} width={MODAL_W} height={MODAL_H}>
      {/* ── Header with integrated tabs ─────────────────────────────── */}
      <layoutContainer
        layout={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 16,
          paddingRight: 8,
          height: 44,
          gap: 12,
          backgroundColor: theme.bgSecondary.color,
          borderBottomWidth: 1,
          borderColor: theme.border.color,
        }}
      >
        <PixiLabel text="SETTINGS" size="md" weight="bold" color="text" />

        {/* Divider */}
        <layoutContainer layout={{ width: 1, height: 20, backgroundColor: theme.border.color }} />

        {/* Tabs */}
        {SETTINGS_TABS.map((tab) => {
          const isActive = s.activeTab === tab.id;
          return (
            <layoutContainer
              key={tab.id}
              eventMode="static"
              cursor="pointer"
              onPointerDown={() => s.setActiveTab(tab.id)}
              onClick={() => s.setActiveTab(tab.id)}
              layout={{
                paddingLeft: 12,
                paddingRight: 12,
                height: 26,
                borderRadius: 6,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: isActive ? theme.bg.color : 0x00000000,
                borderWidth: 1,
                borderColor: isActive ? theme.accent.color : 0x00000000,
              }}
            >
              <PixiLabel
                text={tab.label.toUpperCase()}
                size="xs"
                weight="semibold"
                color={isActive ? 'accent' : 'textMuted'}
              />
            </layoutContainer>
          );
        })}

        {/* Spacer */}
        <layoutContainer layout={{ flex: 1 }} />

        {/* Close button */}
        <PixiButton icon="close" label="" variant="ghost" size="sm" onClick={onClose} />
      </layoutContainer>

      {/* Content */}
        <PixiScrollView
          width={MODAL_W}
          height={scrollAreaH}
          contentHeight={contentH}
          direction="vertical"
          bgColor={theme.bg.color}
        >
          <Div className="flex-col p-4" layout={{ width: CONTENT_W, backgroundColor: theme.bg.color }}>

          {/* ═══════════════════════════════════════════════════════════════════
              GENERAL TAB — Display, Layout
              ═══════════════════════════════════════════════════════════════════ */}
          <layoutContainer renderable={s.activeTab === 'general'} layout={{ width: CONTENT_W, height: s.activeTab === 'general' ? contentH : 0, overflow: 'hidden', flexDirection: 'column', gap: 12 }}>
          {/* ═══════ DISPLAY ═══════ */}
          <SectionHeader text="DISPLAY" />

          <SettingRow label="UI Render Mode:" description="Switch between DOM and WebGL rendering">
            <PixiSelect
              options={RENDER_MODE_OPTIONS}
              value={s.renderMode}
              onChange={(v) => s.setRenderMode(v as 'dom' | 'webgl')}
              width={200}
            />
          </SettingRow>

          <SettingRow label="Theme:">
            <PixiSelect
              options={getThemeOptions()}
              value={s.currentThemeId}
              onChange={s.setTheme}
              width={180}
            />
          </SettingRow>

          {s.currentThemeId === 'custom' && s.customThemeColors && (
            <SettingRow label="" description="Edit colors in DOM mode (Settings > Theme)">
              <Div className="flex-row gap-1">
                {themes.filter(t => t.id !== 'custom').map(t => (
                  <PixiButton
                    key={t.id}
                    label={t.name}
                    variant="ghost"
                    size="sm"
                    onClick={() => s.copyThemeToCustom(t.id)}
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
                  reader.onload = () => s.setCustomBannerImage(reader.result as string);
                  reader.readAsDataURL(file);
                }}
              />
              {s.customBannerImage && (
                <PixiButton
                  label="Remove"
                  variant="ghost"
                  size="sm"
                  onClick={() => s.setCustomBannerImage(null)}
                />
              )}
            </Div>
          </SettingRow>

          <SettingRow label="Number Format:">
            <PixiSelect
              options={NUMBER_FORMAT_OPTIONS}
              value={s.useHexNumbers ? 'hex' : 'dec'}
              onChange={(v) => s.setUseHexNumbers(v === 'hex')}
              width={150}
            />
          </SettingRow>

          <SettingRow label="Blank Empty Cells:" description="Hide ---, .., ... on empty rows">
            <PixiCheckbox checked={s.blankEmptyCells} onChange={s.setBlankEmptyCells} />
          </SettingRow>

          {/* ═══════ LAYOUT ═══════ */}
          <SectionHeader text="LAYOUT" />

          <SettingRow label="TB-303 Panel:">
            <PixiCheckbox checked={!s.tb303Collapsed} onChange={(v) => s.setTB303Collapsed(!v)} />
          </SettingRow>

          <SettingRow label="Oscilloscope:">
            <PixiCheckbox checked={s.oscilloscopeVisible} onChange={s.setOscilloscopeVisible} />
          </SettingRow>

          <SettingRow label="Fullscreen:">
            <PixiCheckbox checked={s.isFullscreen} onChange={s.toggleFullscreen} />
          </SettingRow>

          <SettingRow label="Welcome Jingle:" description="Play startup audio on first interaction">
            <PixiCheckbox checked={s.welcomeJingleEnabled} onChange={s.setWelcomeJingleEnabled} />
          </SettingRow>
          </layoutContainer>

          {/* ═══════════════════════════════════════════════════════════════════
              VISUAL TAB — Visual Background, CRT, Lens, Workbench
              ═══════════════════════════════════════════════════════════════════ */}
          <layoutContainer renderable={s.activeTab === 'visual'} layout={{ width: CONTENT_W, height: s.activeTab === 'visual' ? contentH : 0, overflow: 'hidden', flexDirection: 'column', gap: 12 }}>
          <SettingRow label="Visual Background:" description="Audio-reactive effects behind tracker">
            <PixiCheckbox checked={s.trackerVisualBg} onChange={s.setTrackerVisualBg} />
          </SettingRow>

          {s.trackerVisualBg && (
            <SettingRow label="Visual Mode:">
              <PixiSelect
                options={s.visualModeOptions}
                value={String(s.trackerVisualMode)}
                onChange={(v) => s.setTrackerVisualMode(Number(v))}
                width={180}
              />
            </SettingRow>
          )}

          {/* ═══════ CRT SHADER ═══════ */}
          <SectionHeader text="CRT SHADER" />

          <SettingRow label="CRT Effect:" description="WebGL post-processing — scanlines, curvature, bloom">
            <PixiCheckbox checked={s.crtEnabled} onChange={s.setCrtEnabled} />
          </SettingRow>

          {s.crtEnabled && (
            <Div className="flex-col gap-1" layout={{ width: CONTENT_W, borderTopWidth: 1, borderColor: theme.border.color, paddingTop: 8 }}>
              {crtGroups.map((group, gi) => (
                <React.Fragment key={group}>
                  <Div className={gi > 0 ? "pt-2" : "pt-1"}>
                    <Txt className="text-[10px] font-bold font-mono text-accent-primary uppercase">{group}</Txt>
                  </Div>
                  {CRT_SLIDERS.filter((sl) => sl.group === group).map((slider) => {
                    const val = s.crtParams[slider.key];
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
                          onChange={(v) => s.setCrtParam(slider.key, v)}
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

              <PixiButton label="Reset CRT to Defaults" variant="ghost" onClick={s.resetCrtParams} width={200} />
            </Div>
          )}

          {/* ═══════ LENS DISTORTION ═══════ */}
          <SectionHeader text="LENS DISTORTION" />

          <SettingRow label="Lens Effect:" description="Fish-eye, barrel, chromatic aberration">
            <PixiCheckbox checked={s.lensEnabled} onChange={s.setLensEnabled} />
          </SettingRow>

          {s.lensEnabled && (
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
                      variant={s.lensPreset === presetKey ? 'ft2' : 'ghost'}
                      color={s.lensPreset === presetKey ? 'blue' : undefined}
                      size="sm"
                      onClick={() => {
                        s.setLensPreset(presetKey);
                        s.setLensParam('barrel', preset.params.barrel);
                        s.setLensParam('chromatic', preset.params.chromatic);
                        s.setLensParam('vignette', preset.params.vignette);
                      }}
                    />
                  );
                })}
              </Div>
              <Div className="pt-1">
                <Txt className="text-[10px] font-bold font-mono text-accent-primary uppercase">MANUAL</Txt>
              </Div>
              {LENS_SLIDERS.map((slider) => {
                const val = s.lensParams[slider.key];
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
                      onChange={(v) => { s.setLensParam(slider.key, v); s.setLensPreset('custom'); }}
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

              <PixiButton label="Reset Lens to Defaults" variant="ghost" onClick={s.resetLensParams} width={200} />
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
          <layoutContainer renderable={s.activeTab === 'recording'} layout={{ width: CONTENT_W, height: s.activeTab === 'recording' ? contentH : 0, overflow: 'hidden', flexDirection: 'column', gap: 12 }}>
          {/* ═══════ RECORDING ═══════ */}
          <SectionHeader text="RECORDING" />

          <SettingRow label="Edit Step:">
            <PixiNumericInput
              value={s.editStep}
              min={0}
              max={16}
              step={1}
              onChange={s.setEditStep}
              width={50}
            />
          </SettingRow>

          <SettingRow label="Edit Mode:">
            <PixiSelect
              options={EDIT_MODE_OPTIONS}
              value={s.insertMode ? 'insert' : 'overwrite'}
              onChange={(v) => {
                const wantInsert = v === 'insert';
                if (wantInsert !== s.insertMode) s.toggleInsertMode();
              }}
              width={180}
            />
          </SettingRow>

          <SettingRow label="Record Key-Off:" description="Record === when keys are released">
            <PixiCheckbox checked={s.recReleaseEnabled} onChange={s.setRecReleaseEnabled} />
          </SettingRow>

          <SettingRow label="Quantization:">
            <Div className="flex-row items-center gap-2">
              <PixiCheckbox checked={s.recQuantEnabled} onChange={s.setRecQuantEnabled} />
              <PixiSelect
                options={QUANT_RES_OPTIONS}
                value={String(s.recQuantRes)}
                onChange={(v) => s.setRecQuantRes(Number(v))}
                width={140}
                disabled={!s.recQuantEnabled}
              />
            </Div>
          </SettingRow>
          </layoutContainer>

          {/* ═══════════════════════════════════════════════════════════════════
              INPUT TAB — MIDI, Keyboard, Vinyl Scratch
              ═══════════════════════════════════════════════════════════════════ */}
          <layoutContainer renderable={s.activeTab === 'input'} layout={{ width: CONTENT_W, height: s.activeTab === 'input' ? contentH : 0, overflow: 'hidden', flexDirection: 'column', gap: 12 }}>
          {/* ═══════ MIDI ═══════ */}
          <SectionHeader text="MIDI" />

          <SettingRow label="Polyphonic Mode:" description="Play multiple notes simultaneously">
            <PixiCheckbox checked={s.midiPolyphonic} onChange={s.setMidiPolyphonic} />
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
            <PixiCheckbox checked={s.scratchEnabled} onChange={s.setScratchEnabled} />
          </SettingRow>

          <SettingRow label="Velocity Curve:" description="Smooth momentum (off = direct 1:1 response)">
            <PixiCheckbox checked={s.scratchAcceleration} onChange={s.setScratchAcceleration} />
          </SettingRow>

          <SettingRow label="Platter Weight:" description="Light (CDJ) → Medium (1200) → Heavy">
            <Div className="flex-row items-center gap-2">
              <PixiSlider
                value={Math.round(s.platterMass * 100)}
                min={0}
                max={100}
                step={1}
                onChange={(v) => s.setPlatterMass(v / 100)}
                orientation="horizontal"
                length={120}
                thickness={4}
                handleWidth={10}
                handleHeight={10}
                color={theme.accent.color}
              />
              <Txt className="text-[10px] font-mono text-text-primary">{`${Math.round(s.platterMass * 100)}%`}</Txt>
            </Div>
          </SettingRow>

          <SettingRow label="Scratch Sensitivity:" description="How fast the record responds to drag">
            <Div className="flex-row items-center gap-2">
              <PixiSlider
                value={Math.round(s.jogWheelSensitivity * 100)}
                min={50}
                max={200}
                step={5}
                onChange={(v) => s.setJogWheelSensitivity(v / 100)}
                orientation="horizontal"
                length={120}
                thickness={4}
                handleWidth={10}
                handleHeight={10}
                color={theme.accent.color}
              />
              <Txt className="text-[10px] font-mono text-text-primary">{`${Math.round(s.jogWheelSensitivity * 100)}%`}</Txt>
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
          <layoutContainer renderable={s.activeTab === 'audio'} layout={{ width: CONTENT_W, height: s.activeTab === 'audio' ? contentH : 0, overflow: 'hidden', flexDirection: 'column', gap: 12 }}>
          {/* ═══════ ENGINE ═══════ */}
          <SectionHeader text="ENGINE" />

          <SettingRow label="Amiga Limits:" description="Clamp periods to 113-856">
            <PixiCheckbox checked={s.amigaLimits} onChange={s.setAmigaLimits} />
          </SettingRow>

          <SettingRow label="Sample Interpolation:" description="Linear (clean) vs None (crunchy)">
            <PixiCheckbox checked={s.linearInterpolation} onChange={s.setLinearInterpolation} />
          </SettingRow>

          <SettingRow label="BLEP Synthesis:" description="Band-limited (reduces aliasing)">
            <PixiCheckbox checked={s.useBLEP} onChange={s.setUseBLEP} />
          </SettingRow>

          {/* VU Meter Mode */}
          <SettingRow label="VU Meters:" description={s.vuMeterMode === 'realtime' ? 'Continuous audio levels' : 'Triggered on note-on'}>
            <PixiSelect
              options={VU_MODE_OPTIONS}
              value={s.vuMeterMode}
              onChange={(v: string) => s.setVuMeterMode(v as 'trigger' | 'realtime')}
              width={130}
            />
          </SettingRow>

          <SettingRow label="VU Swing:" description="Sine wave sway animation">
            <PixiCheckbox checked={s.vuMeterSwing} onChange={s.setVuMeterSwing} />
          </SettingRow>

          <SettingRow label="Wobble Windows:" description="Compiz-style wobbly windows (GL UI)">
            <PixiCheckbox checked={s.wobbleWindows} onChange={s.setWobbleWindows} />
          </SettingRow>

          {/* Stereo Separation */}
          <SettingRow label="Stereo Mode:">
            <PixiSelect
              options={STEREO_MODE_OPTIONS}
              value={s.stereoSeparationMode}
              onChange={(v) => s.setStereoMode(v as 'pt2' | 'modplug')}
              width={130}
            />
          </SettingRow>

          {s.stereoSeparationMode === 'pt2' ? (
            <SettingRow label="Stereo Separation:" description="0% mono · 20% Amiga · 100% full">
              <Div className="flex-row items-center gap-2">
                <PixiSlider
                  value={s.stereoSeparation}
                  min={0}
                  max={100}
                  step={5}
                  onChange={s.setStereoSeparationValue}
                  orientation="horizontal"
                  length={120}
                  thickness={4}
                  handleWidth={10}
                  handleHeight={10}
                  color={theme.accent.color}
                />
                <Txt className="text-[10px] font-mono text-text-primary">{`${s.stereoSeparation}%`}</Txt>
              </Div>
            </SettingRow>
          ) : (
            <SettingRow label="Stereo Separation:" description="0% mono · 100% normal · 200% wide">
              <Div className="flex-row items-center gap-2">
                <PixiSlider
                  value={s.modplugSeparation}
                  min={0}
                  max={200}
                  step={5}
                  onChange={s.setModplugSeparationValue}
                  orientation="horizontal"
                  length={120}
                  thickness={4}
                  handleWidth={10}
                  handleHeight={10}
                  color={theme.accent.color}
                />
                <Txt className="text-[10px] font-mono text-text-primary">{`${s.modplugSeparation}%`}</Txt>
              </Div>
            </SettingRow>
          )}

          {/* Bus Gain Balance — matches DOM layout */}
          <SettingRow label="Bus Gain Balance:" description={s.autoGain ? 'Auto-balancing active — plays at least 1s to calibrate' : 'Balance sample vs synth/chip engine levels'}>
            <PixiCheckbox checked={s.autoGain} onChange={s.setAutoGain} />
          </SettingRow>

          <SettingRow label="Samples Gain:">
            <Div className="flex-row items-center gap-2">
              <PixiSlider
                value={s.sampleBusGain}
                min={-12}
                max={12}
                step={1}
                onChange={s.setSampleBusGain}
                orientation="horizontal"
                length={120}
                thickness={4}
                handleWidth={10}
                handleHeight={10}
                disabled={s.autoGain}
                color={theme.accent.color}
              />
              <Txt className="text-[10px] font-mono text-text-primary">
                {`${s.sampleBusGain > 0 ? '+' : ''}${s.sampleBusGain} dB`}
              </Txt>
            </Div>
          </SettingRow>

          <SettingRow label="Synths Gain:">
            <Div className="flex-row items-center gap-2">
              <PixiSlider
                value={s.synthBusGain}
                min={-12}
                max={12}
                step={1}
                onChange={s.setSynthBusGain}
                orientation="horizontal"
                length={120}
                thickness={4}
                handleWidth={10}
                handleHeight={10}
                disabled={s.autoGain}
                color={theme.accent.color}
              />
              <Txt className="text-[10px] font-mono text-text-primary">
                {`${s.synthBusGain > 0 ? '+' : ''}${s.synthBusGain} dB`}
              </Txt>
            </Div>
          </SettingRow>
          {/* ═══════ KEYBOARD ═══════ */}
          <SectionHeader text="KEYBOARD" />

          <SettingRow label="Keyboard Scheme:">
            <PixiSelect
              options={keyboardSchemeOptions}
              value={s.activeScheme}
              onChange={s.setActiveScheme}
              width={180}
            />
          </SettingRow>

          <Txt className="text-[9px] font-mono text-text-muted" layout={{ width: CONTENT_W }}>
            {KEYBOARD_SCHEMES.find(k => k.id === s.activeScheme)?.description || 'Select a tracker layout'}
          </Txt>

          <SettingRow label="Platform:" description="Override Cmd/Ctrl detection">
            <PixiSelect
              options={PLATFORM_OPTIONS}
              value={s.platformOverride}
              onChange={(v) => s.setPlatformOverride(v as 'auto' | 'mac' | 'pc')}
              width={150}
            />
          </SettingRow>
          </layoutContainer>

          {/* ═══════════════════════════════════════════════════════════════════
              SID TAB — SID Engine, SID Hardware
              ═══════════════════════════════════════════════════════════════════ */}
          <layoutContainer renderable={s.activeTab === 'sid'} layout={{ width: CONTENT_W, height: s.activeTab === 'sid' ? contentH : 0, overflow: 'hidden', flexDirection: 'column', gap: 12 }}>
          {/* ═══════ C64 SID ENGINE ═══════ */}
          <SectionHeader text="C64 SID PLAYER ENGINE" />

          <Txt className="text-[9px] font-mono text-text-muted" layout={{ width: CONTENT_W }}>
            {'Choose the emulation engine for C64 SID music playback (.sid files). Each engine offers different accuracy/performance tradeoffs.'}
          </Txt>

          {Object.values(SID_ENGINES).map((engine) => {
            const isSelected = s.sidEngine === engine.id;
            return (
              <layoutContainer
                key={engine.id}
                eventMode="static"
                cursor="pointer"
                onClick={() => s.setSidEngine(engine.id as SIDEngineType)}
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
              value={s.sidHardwareMode}
              onChange={(v) => {
                const mode = (v || 'off') as 'off' | 'asid' | 'webusb';
                s.setSidHardwareMode(mode);
                s.setAsidEnabled(mode === 'asid');
              }}
              width={260}
            />
          </SettingRow>

          {s.sidHardwareMode === 'webusb' && (
            <>
              {!s.webusbSupported ? (
                <Div className="flex-col gap-1" layout={{ width: CONTENT_W, paddingLeft: 8, paddingRight: 8, paddingTop: 6, paddingBottom: 6, borderWidth: 1, borderColor: theme.border.color, borderRadius: 2 }}>
                  <Txt className="text-[10px] font-mono text-accent-error">WebUSB Not Supported</Txt>
                  <Txt className="text-[9px] font-mono text-text-muted">
                    {'WebUSB requires Chrome, Edge, or Opera. Firefox and Safari do not support WebUSB.'}
                  </Txt>
                </Div>
              ) : (
                <>
                  <SettingRow label="Device:" description={s.webusbConnected ? `Connected: ${s.webusbDeviceName}` : 'Click Connect to pair device'}>
                    <PixiButton
                      label={s.webusbConnected ? 'Disconnect' : 'Connect USB-SID-Pico'}
                      variant={s.webusbConnected ? 'danger' : 'primary'}
                      onClick={async () => {
                        const { getSIDHardwareManager } = await import('@lib/sid/SIDHardwareManager');
                        const mgr = getSIDHardwareManager();
                        if (s.webusbConnected) {
                          await mgr.deactivate();
                          s.setSidHardwareMode('off');
                          s.setWebusbConnected(false);
                          s.setWebusbDeviceName(null);
                          s.setWebusbFirmware(null);
                          s.setWebusbChips(null);
                        } else {
                          const ok = await mgr.connectWebUSB();
                          s.setWebusbConnected(ok);
                          if (ok) {
                            const st = mgr.getStatus();
                            s.setWebusbDeviceName(st.deviceName);
                            s.setWebusbFirmware(st.firmwareVersion ?? null);
                            s.setWebusbChips(st.detectedChips ?? null);
                          }
                        }
                      }}
                    />
                  </SettingRow>

                  {s.webusbConnected && (
                    <>
                      <SettingRow label="Clock Rate:" description="Match your SID chip region">
                        <PixiSelect
                          options={[
                            { value: '1', label: 'PAL (985248 Hz)' },
                            { value: '2', label: 'NTSC (1022727 Hz)' },
                            { value: '3', label: 'DREAN (1023440 Hz)' },
                            { value: '0', label: 'Default (1000000 Hz)' },
                          ]}
                          value={String(s.webusbClockRate)}
                          onChange={async (v) => {
                            const rate = parseInt(v || '1', 10) as import('@lib/sid/USBSIDPico').ClockRateValue;
                            s.setWebusbClockRate(rate);
                            const { getSIDHardwareManager } = await import('@lib/sid/SIDHardwareManager');
                            getSIDHardwareManager().setClock(rate);
                          }}
                          width={200}
                        />
                      </SettingRow>

                      <SettingRow label="Audio Output:" description="Stereo requires v1.3+ board">
                        <PixiCheckbox
                          checked={s.webusbStereo}
                          onChange={async (stereo) => {
                            s.setWebusbStereo(stereo);
                            const { getSIDHardwareManager } = await import('@lib/sid/SIDHardwareManager');
                            getSIDHardwareManager().setAudioMode(stereo);
                          }}
                          label={s.webusbStereo ? 'Stereo' : 'Mono'}
                        />
                      </SettingRow>

                      {/* Device info */}
                      {(s.webusbFirmware || s.webusbChips) && (
                        <Div className="flex-col gap-1" layout={{ width: CONTENT_W, paddingLeft: 8, paddingRight: 8, paddingTop: 4, paddingBottom: 4 }}>
                          {s.webusbFirmware && (
                            <Txt className="text-[9px] font-mono text-text-muted">{`Firmware: ${s.webusbFirmware}`}</Txt>
                          )}
                          {s.webusbChips && s.webusbChips.length > 0 && (
                            <Txt className="text-[9px] font-mono text-text-muted">{`SID chips: ${s.webusbChips.filter(c => c.detected).map(c => `Slot ${c.slot}: ${c.type || 'Unknown'}`).join(', ') || 'None detected'}`}</Txt>
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

          {s.sidHardwareMode === 'asid' && (
            <>
              {!s.asidSupported ? (
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
                      options={s.asidDeviceOptions}
                      value={s.asidDeviceId || ''}
                      onChange={(v) => {
                        const deviceId = v || null;
                        s.setAsidDeviceId(deviceId);
                        getASIDDeviceManager().selectDevice(deviceId);
                      }}
                      width={220}
                    />
                  </SettingRow>

                  {s.asidDevices.length === 0 && (
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
                        value={s.asidDeviceAddress}
                        min={0}
                        max={255}
                        step={1}
                        onChange={(v) => s.setAsidDeviceAddress(v || 0x4d)}
                        width={60}
                      />
                      <Txt className="text-[10px] font-mono text-text-muted">
                        {`(0x${s.asidDeviceAddress.toString(16).toUpperCase().padStart(2, '0')})`}
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
          <layoutContainer renderable={s.activeTab === 'about'} layout={{ width: CONTENT_W, height: s.activeTab === 'about' ? contentH : 0, overflow: 'hidden', flexDirection: 'column', gap: 12 }}>
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
              s.clearDismissedHashes();
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
            onClick={s.handleClearState}
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

    </PixiModal>
  );
};
