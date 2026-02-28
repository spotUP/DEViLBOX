/**
 * PixiTB303KnobPanel — Collapsible TB-303 knob panel rendered in PixiJS.
 *
 * Appears ABOVE the pattern editor when a TB-303 instrument is active.
 * Three states:
 *   - Hidden:   visible={false}, height 0 (no TB303 instrument OR both collapsed and no instrument)
 *   - Collapsed: 40px bar — label, CH number, instrument name, expand button
 *   - Expanded:  Full knob panel with all TB-303 parameters
 *
 * Port of: src/components/tracker/TB303KnobPanel.tsx
 * Inner knobs mirror: src/components/instruments/controls/JC303StyledKnobPanel.tsx
 */

import React, { useCallback } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { usePixiTheme } from '../../theme';
import { PIXI_FONTS } from '../../fonts';
import { PixiKnob, PixiButton } from '../../components';
import { useInstrumentStore, useUIStore, useMIDIStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';
import { DEFAULT_TB303 } from '@typedefs/instrument';
import type { TB303Config } from '@typedefs/instrument';

// ─── Heights ─────────────────────────────────────────────────────────────────

const COLLAPSED_H = 40;
const HEADER_H = 36;
const KNOB_ROW_H = 80;
const TAB_BAR_H = 28;
const TAB_CONTENT_H = 76;
const EXPANDED_H = HEADER_H + KNOB_ROW_H + TAB_BAR_H + TAB_CONTENT_H + 2; // +2 for borders

/** Exported for parent layout height calculations */
export const TB303_PANEL_COLLAPSED_H = COLLAPSED_H;
export const TB303_PANEL_EXPANDED_H = EXPANDED_H;

// ─── Tab type ─────────────────────────────────────────────────────────────────

type TB303Tab = 'osc' | 'mojo' | 'devilfish';

// ─── Knob accent color (yellow, matching JC303StyledKnobPanel) ────────────────

const KNOB_YELLOW = 0xffcc00;
const KNOB_CYAN   = 0x06b6d4;
const KNOB_ORANGE = 0xff9900;
const KNOB_RED    = 0xff3333;

// ─── Calibration display format helpers ──────────────────────────────────────

const CUTOFF_MIN = 314;
const CUTOFF_MAX = 2394;
const DECAY_MIN = 200;
const DECAY_MAX = 2000;
const SLIDE_MIN = 2;
const SLIDE_MAX = 360;

const fmtCutoff    = (v: number) => `${Math.round(CUTOFF_MIN * Math.pow(CUTOFF_MAX / CUTOFF_MIN, v))}Hz`;
const fmtPercent   = (v: number) => `${Math.round(v * 100)}%`;
const fmtDecay     = (v: number) => `${Math.round(DECAY_MIN * Math.pow(DECAY_MAX / DECAY_MIN, v))}ms`;
const fmtSlide     = (v: number) => `${Math.round(SLIDE_MIN * Math.pow(SLIDE_MAX / SLIDE_MIN, v))}ms`;
const fmtSoftAtk   = (v: number) => `${(0.3 * Math.pow(100, v)).toFixed(1)}ms`;
const fmtWaveform  = (v: number) => v < 0.05 ? 'SAW' : v > 0.95 ? 'SQR' : `${Math.round(v * 100)}%`;
const fmtPulseW    = (v: number) => `${Math.round(50 + v * 49)}%`;
const fmtSubWave   = (v: number) => v < 0.5 ? '-2 Oct' : '-1 Oct';
const fmtLpBp      = (v: number) => v < 0.05 ? 'LP' : v > 0.95 ? 'BP' : 'Mix';
const fmtDuffing   = (v: number) => `${Math.round(v * 100)}%`;
const fmtSaturate  = (v: number) => (v * 10).toFixed(1);

// ─── Tab definitions ──────────────────────────────────────────────────────────

const TAB_DEFS: { id: TB303Tab; label: string; color: number }[] = [
  { id: 'osc',        label: 'OSC',       color: KNOB_CYAN   },
  { id: 'mojo',       label: 'MOJO',      color: KNOB_ORANGE },
  { id: 'devilfish',  label: 'DEVILFISH', color: KNOB_RED    },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface PixiTB303KnobPanelProps {
  width: number;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const PixiTB303KnobPanel: React.FC<PixiTB303KnobPanelProps> = ({ width }) => {
  const theme = usePixiTheme();

  // ── Store subscriptions ────────────────────────────────────────────────────

  const { tb303Collapsed, toggleTB303Collapsed } = useUIStore(
    useShallow((s) => ({
      tb303Collapsed: s.tb303Collapsed,
      toggleTB303Collapsed: s.toggleTB303Collapsed,
    }))
  );

  const { instruments, updateInstrument } = useInstrumentStore(
    useShallow((s) => ({
      instruments: s.instruments,
      updateInstrument: s.updateInstrument,
    }))
  );

  const { controlledInstrumentId } = useMIDIStore();

  // ── Find TB303 instrument ─────────────────────────────────────────────────

  const targetInstrument = controlledInstrumentId
    ? instruments.find((i) => i.id === controlledInstrumentId && i.synthType === 'TB303')
    : instruments.find((i) => i.synthType === 'TB303');

  // ── Tab state (local — no store needed) ──────────────────────────────────

  const [activeTab, setActiveTab] = React.useState<TB303Tab>('osc');

  // ── Ref-based config update (avoids stale closures during rapid input) ───

  const handleConfigChange = useCallback(
    (key: string, value: number) => {
      if (!targetInstrument) return;
      const latest = useInstrumentStore
        .getState()
        .instruments.find((i) => i.id === targetInstrument.id);
      if (!latest?.tb303) return;
      updateInstrument(targetInstrument.id, {
        tb303: { ...latest.tb303, [key]: value },
      });
    },
    [targetInstrument, updateInstrument]
  );

  const handleFilterChange = useCallback(
    (key: string, value: number) => {
      if (!targetInstrument) return;
      const latest = useInstrumentStore
        .getState()
        .instruments.find((i) => i.id === targetInstrument.id);
      if (!latest?.tb303) return;
      updateInstrument(targetInstrument.id, {
        tb303: {
          ...latest.tb303,
          filter: { ...latest.tb303.filter, [key]: value },
        },
      });
    },
    [targetInstrument, updateInstrument]
  );

  const handleFilterEnvelopeChange = useCallback(
    (key: string, value: number) => {
      if (!targetInstrument) return;
      const latest = useInstrumentStore
        .getState()
        .instruments.find((i) => i.id === targetInstrument.id);
      if (!latest?.tb303) return;
      const updates: Partial<TB303Config> = {
        filterEnvelope: { ...latest.tb303.filterEnvelope, [key]: value },
      };
      // Mirror decay → devilFish.normalDecay (WASM uses normalDecay for MEG)
      if (key === 'decay') {
        updates.devilFish = {
          ...DEFAULT_TB303.devilFish,
          ...(latest.tb303.devilFish || {}),
          normalDecay: value,
        } as TB303Config['devilFish'];
      }
      updateInstrument(targetInstrument.id, { tb303: { ...latest.tb303, ...updates } });
    },
    [targetInstrument, updateInstrument]
  );

  const handleAccentChange = useCallback(
    (value: number) => {
      if (!targetInstrument) return;
      const latest = useInstrumentStore
        .getState()
        .instruments.find((i) => i.id === targetInstrument.id);
      if (!latest?.tb303) return;
      updateInstrument(targetInstrument.id, {
        tb303: { ...latest.tb303, accent: { ...latest.tb303.accent, amount: value } },
      });
    },
    [targetInstrument, updateInstrument]
  );

  const handleOscChange = useCallback(
    (key: string, value: number) => {
      if (!targetInstrument) return;
      const latest = useInstrumentStore
        .getState()
        .instruments.find((i) => i.id === targetInstrument.id);
      if (!latest?.tb303) return;
      updateInstrument(targetInstrument.id, {
        tb303: {
          ...latest.tb303,
          oscillator: { ...latest.tb303.oscillator, [key]: value },
        },
      });
    },
    [targetInstrument, updateInstrument]
  );

  const handleDevilFishChange = useCallback(
    (key: string, value: number) => {
      if (!targetInstrument) return;
      const latest = useInstrumentStore
        .getState()
        .instruments.find((i) => i.id === targetInstrument.id);
      if (!latest?.tb303) return;
      const currentDF = latest.tb303.devilFish || {
        enabled: true,
        normalDecay: 0.5,
        accentDecay: 0.5,
        vegDecay: 0.5,
        vegSustain: 0,
        softAttack: 0,
        filterTracking: 0,
        filterFmDepth: 0,
        sweepSpeed: 'normal' as const,
        accentSweepEnabled: true,
        highResonance: false,
        muffler: 'off' as const,
      };
      updateInstrument(targetInstrument.id, {
        tb303: {
          ...latest.tb303,
          devilFish: { ...currentDF, [key]: value } as TB303Config['devilFish'],
        },
      });
    },
    [targetInstrument, updateInstrument]
  );

  const handleSlideChange = useCallback(
    (value: number) => {
      if (!targetInstrument) return;
      const latest = useInstrumentStore
        .getState()
        .instruments.find((i) => i.id === targetInstrument.id);
      if (!latest?.tb303) return;
      updateInstrument(targetInstrument.id, {
        tb303: {
          ...latest.tb303,
          slide: { ...latest.tb303.slide, time: value },
        },
      });
    },
    [targetInstrument, updateInstrument]
  );

  // ── Derived config with defaults ──────────────────────────────────────────

  const rawConfig = targetInstrument?.tb303;
  const config: TB303Config | null = rawConfig
    ? {
        ...DEFAULT_TB303,
        ...rawConfig,
        oscillator: { ...DEFAULT_TB303.oscillator, ...rawConfig.oscillator },
        filter: { ...DEFAULT_TB303.filter, ...rawConfig.filter },
        filterEnvelope: { ...DEFAULT_TB303.filterEnvelope, ...rawConfig.filterEnvelope },
        accent: { ...DEFAULT_TB303.accent, ...rawConfig.accent },
        slide: { ...DEFAULT_TB303.slide, ...rawConfig.slide },
      }
    : null;

  const chIndex = targetInstrument ? instruments.indexOf(targetInstrument) : -1;
  const chLabel = chIndex >= 0 ? `CH${String(chIndex + 1).padStart(2, '0')}` : 'CH--';

  // ── Background drawing helpers ────────────────────────────────────────────

  const drawPanelBg = useCallback(
    (g: GraphicsType) => {
      const h = tb303Collapsed ? COLLAPSED_H : EXPANDED_H;
      g.clear();
      g.rect(0, 0, width, h);
      g.fill({ color: 0x1a1a1a });
      // Top border line
      g.rect(0, 0, width, 1);
      g.fill({ color: theme.border.color, alpha: 0.5 });
    },
    [width, theme, tb303Collapsed]
  );

  const drawHeaderBg = useCallback(
    (g: GraphicsType) => {
      g.clear();
      g.rect(0, 0, width, HEADER_H);
      g.fill({ color: 0x141414 });
      // Bottom separator under header
      g.rect(0, HEADER_H - 1, width, 1);
      g.fill({ color: theme.border.color, alpha: 0.3 });
    },
    [width, theme]
  );

  const drawDivider = useCallback(
    (g: GraphicsType) => {
      g.clear();
      g.rect(0, 0, width, 1);
      g.fill({ color: theme.border.color, alpha: 0.25 });
    },
    [width, theme]
  );

  const drawTabBg = useCallback(
    (g: GraphicsType) => {
      g.clear();
      g.rect(0, 0, width, TAB_BAR_H);
      g.fill({ color: 0x111111 });
      g.rect(0, 0, width, 1);
      g.fill({ color: theme.border.color, alpha: 0.2 });
      g.rect(0, TAB_BAR_H - 1, width, 1);
      g.fill({ color: theme.border.color, alpha: 0.2 });
    },
    [width, theme]
  );

  const drawTabContentBg = useCallback(
    (g: GraphicsType) => {
      g.clear();
      g.rect(0, 0, width, TAB_CONTENT_H);
      g.fill({ color: 0x161616 });
    },
    [width]
  );

  // ── No TB303 instrument: render zero-size placeholder (keeps Yoga tree stable) ──

  if (!targetInstrument || !config) {
    return <pixiContainer layout={{ width: 0, height: 0 }} />;
  }

  // ── Collapsed state: 40px bar ─────────────────────────────────────────────

  if (tb303Collapsed) {
    return (
      <pixiContainer layout={{ width, height: COLLAPSED_H, flexDirection: 'column' }}>
        <pixiGraphics draw={drawPanelBg} layout={{ position: 'absolute', width, height: COLLAPSED_H }} />

        {/* Collapsed header row */}
        <pixiContainer
          layout={{
            width,
            height: COLLAPSED_H,
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: 8,
            paddingRight: 4,
            gap: 6,
          }}
        >
          {/* "TB-303" label */}
          <pixiBitmapText
            text="TB-303"
            style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 10, fill: 0xffffff }}
            tint={theme.accent.color}
            layout={{}}
          />

          {/* CH number */}
          <pixiBitmapText
            text={chLabel}
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
            tint={theme.textMuted.color}
            layout={{}}
          />

          {/* Instrument name */}
          <pixiBitmapText
            text={targetInstrument.name}
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
            tint={theme.textSecondary.color}
            layout={{}}
          />

          {/* Spacer */}
          <pixiContainer layout={{ flex: 1 }} />

          {/* Expand button */}
          <PixiButton
            label="▾ EXPAND"
            variant="ghost"
            size="sm"
            onClick={toggleTB303Collapsed}
          />
        </pixiContainer>
      </pixiContainer>
    );
  }

  // ── Expanded state ────────────────────────────────────────────────────────

  return (
    <pixiContainer layout={{ width, height: EXPANDED_H, flexDirection: 'column' }}>
      <pixiGraphics draw={drawPanelBg} layout={{ position: 'absolute', width, height: EXPANDED_H }} />

      {/* ── Header bar ── */}
      <pixiContainer layout={{ width, height: HEADER_H, flexDirection: 'column' }}>
        <pixiGraphics draw={drawHeaderBg} layout={{ position: 'absolute', width, height: HEADER_H }} />
        <pixiContainer
          layout={{
            width,
            height: HEADER_H,
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: 10,
            paddingRight: 6,
            gap: 8,
          }}
        >
          {/* Brand */}
          <pixiBitmapText
            text="DB-303"
            style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 12, fill: 0xffffff }}
            tint={0xffcc00}
            layout={{}}
          />

          <pixiBitmapText
            text="TB-303 WASM ENGINE"
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 7, fill: 0xffffff }}
            tint={theme.textMuted.color}
            layout={{}}
          />

          {/* CH label */}
          <pixiBitmapText
            text={chLabel}
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
            tint={theme.textMuted.color}
            layout={{}}
          />

          {/* Instrument name */}
          <pixiBitmapText
            text={targetInstrument.name}
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
            tint={theme.textSecondary.color}
            layout={{}}
          />

          {/* Spacer */}
          <pixiContainer layout={{ flex: 1 }} />

          {/* Collapse button */}
          <PixiButton
            label="▴ COLLAPSE"
            variant="ghost"
            size="sm"
            onClick={toggleTB303Collapsed}
          />
        </pixiContainer>
      </pixiContainer>

      {/* ── Row 1: Classic TB-303 knobs (always visible) ── */}
      <pixiContainer
        layout={{
          width,
          height: KNOB_ROW_H,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 16,
          paddingRight: 16,
          gap: 8,
        }}
      >
        {/* TUNING */}
        <PixiKnob
          value={config.tuning ?? 0.5}
          min={0}
          max={1}
          defaultValue={0.5}
          bipolar
          onChange={(v) => handleConfigChange('tuning', v)}
          label="TUNING"
          size="sm"
          color={KNOB_YELLOW}
          formatValue={(v) => (v - 0.5 > 0 ? '+' : '') + Math.round((v - 0.5) * 100) + 'c'}
        />

        {/* CUTOFF */}
        <PixiKnob
          value={config.filter.cutoff}
          min={0}
          max={1}
          defaultValue={0.5}
          onChange={(v) => handleFilterChange('cutoff', v)}
          label="CUTOFF"
          size="sm"
          color={KNOB_YELLOW}
          formatValue={fmtCutoff}
        />

        {/* RESONANCE */}
        <PixiKnob
          value={config.filter.resonance}
          min={0}
          max={1}
          defaultValue={0}
          onChange={(v) => handleFilterChange('resonance', v)}
          label="RESO"
          size="sm"
          color={KNOB_YELLOW}
          formatValue={fmtPercent}
        />

        {/* ENV MOD */}
        <PixiKnob
          value={config.filterEnvelope.envMod}
          min={0}
          max={1}
          defaultValue={0.5}
          onChange={(v) => handleFilterEnvelopeChange('envMod', v)}
          label="ENV MOD"
          size="sm"
          color={KNOB_YELLOW}
          formatValue={fmtPercent}
        />

        {/* DECAY */}
        <PixiKnob
          value={config.filterEnvelope.decay}
          min={0}
          max={1}
          defaultValue={0.5}
          onChange={(v) => handleFilterEnvelopeChange('decay', v)}
          label="DECAY"
          size="sm"
          color={KNOB_YELLOW}
          formatValue={fmtDecay}
        />

        {/* ACCENT */}
        <PixiKnob
          value={config.accent.amount}
          min={0}
          max={1}
          defaultValue={0.5}
          onChange={handleAccentChange}
          label="ACCENT"
          size="sm"
          color={KNOB_YELLOW}
          formatValue={fmtPercent}
        />

        {/* VOLUME */}
        <PixiKnob
          value={config.volume ?? 0.75}
          min={0}
          max={1}
          defaultValue={0.75}
          onChange={(v) => handleConfigChange('volume', v)}
          label="VOLUME"
          size="sm"
          color={KNOB_CYAN}
          formatValue={fmtPercent}
        />
      </pixiContainer>

      {/* Thin divider */}
      <pixiGraphics draw={drawDivider} layout={{ width, height: 1 }} />

      {/* ── Tab bar ── */}
      <pixiContainer layout={{ width, height: TAB_BAR_H, flexDirection: 'column' }}>
        <pixiGraphics draw={drawTabBg} layout={{ position: 'absolute', width, height: TAB_BAR_H }} />
        <pixiContainer
          layout={{
            width,
            height: TAB_BAR_H,
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: 10,
            paddingRight: 10,
            gap: 4,
          }}
        >
          {TAB_DEFS.map((tab) => (
            <PixiButton
              key={tab.id}
              label={tab.label}
              variant={activeTab === tab.id ? 'ft2' : 'ghost'}
              size="sm"
              active={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
            />
          ))}
        </pixiContainer>
      </pixiContainer>

      {/* ── Tab content ── */}
      <pixiContainer layout={{ width, height: TAB_CONTENT_H, flexDirection: 'column' }}>
        <pixiGraphics
          draw={drawTabContentBg}
          layout={{ position: 'absolute', width, height: TAB_CONTENT_H }}
        />

        {/* OSC Tab */}
        {activeTab === 'osc' && (
          <pixiContainer
            layout={{
              width,
              height: TAB_CONTENT_H,
              flexDirection: 'row',
              alignItems: 'center',
              paddingLeft: 16,
              paddingRight: 16,
              gap: 8,
            }}
          >
            {/* WAVEFORM */}
            <PixiKnob
              value={config.oscillator.waveformBlend ?? (config.oscillator.type === 'square' ? 1 : 0)}
              min={0}
              max={1}
              defaultValue={0}
              onChange={(v) => handleOscChange('waveformBlend', v)}
              label="WAVEFORM"
              size="sm"
              color={KNOB_CYAN}
              formatValue={fmtWaveform}
            />

            {/* PULSE WIDTH */}
            <PixiKnob
              value={config.oscillator.pulseWidth ?? 0}
              min={0}
              max={1}
              defaultValue={0}
              onChange={(v) => handleOscChange('pulseWidth', v)}
              label="PULSE W"
              size="sm"
              color={KNOB_CYAN}
              formatValue={fmtPulseW}
            />

            {/* SUB OSC */}
            <PixiKnob
              value={config.oscillator.subOscGain ?? 0}
              min={0}
              max={1}
              defaultValue={0}
              onChange={(v) => handleOscChange('subOscGain', v)}
              label="SUB OSC"
              size="sm"
              color={KNOB_CYAN}
              formatValue={fmtPercent}
            />

            {/* SUB WAVE */}
            <PixiKnob
              value={config.oscillator.subOscBlend ?? 1}
              min={0}
              max={1}
              defaultValue={1}
              onChange={(v) => handleOscChange('subOscBlend', v)}
              label="SUB WAVE"
              size="sm"
              color={KNOB_CYAN}
              formatValue={fmtSubWave}
            />

            {/* SAW / SQR quick-select buttons */}
            <pixiContainer layout={{ flexDirection: 'column', gap: 4, paddingLeft: 8 }}>
              <PixiButton
                label="SAW"
                variant={(config.oscillator.waveformBlend ?? 0) < 0.5 ? 'ft2' : 'ghost'}
                size="sm"
                active={(config.oscillator.waveformBlend ?? 0) < 0.5}
                onClick={() => handleOscChange('waveformBlend', 0)}
              />
              <PixiButton
                label="SQR"
                variant={(config.oscillator.waveformBlend ?? 0) >= 0.5 ? 'ft2' : 'ghost'}
                size="sm"
                active={(config.oscillator.waveformBlend ?? 0) >= 0.5}
                onClick={() => handleOscChange('waveformBlend', 1)}
              />
            </pixiContainer>
          </pixiContainer>
        )}

        {/* MOJO Tab */}
        {activeTab === 'mojo' && (
          <pixiContainer
            layout={{
              width,
              height: TAB_CONTENT_H,
              flexDirection: 'row',
              alignItems: 'center',
              paddingLeft: 16,
              paddingRight: 16,
              gap: 8,
            }}
          >
            {/* BASS (passbandCompensation) */}
            <PixiKnob
              value={config.devilFish?.passbandCompensation ?? 0.09}
              min={0}
              max={1}
              defaultValue={0.09}
              onChange={(v) => handleDevilFishChange('passbandCompensation', v)}
              label="BASS"
              size="sm"
              color={KNOB_ORANGE}
              formatValue={fmtPercent}
            />

            {/* REZ TRACK (resTracking) */}
            <PixiKnob
              value={config.devilFish?.resTracking ?? 0.257}
              min={0}
              max={1}
              defaultValue={0.257}
              onChange={(v) => handleDevilFishChange('resTracking', v)}
              label="REZ TRK"
              size="sm"
              color={KNOB_ORANGE}
              formatValue={fmtPercent}
            />

            {/* SATURATE (filterInputDrive) */}
            <PixiKnob
              value={config.devilFish?.filterInputDrive ?? 0.169}
              min={0}
              max={1}
              defaultValue={0.169}
              onChange={(v) => handleDevilFishChange('filterInputDrive', v)}
              label="SATUR"
              size="sm"
              color={KNOB_ORANGE}
              formatValue={fmtSaturate}
            />

            {/* BITE (diodeCharacter) */}
            <PixiKnob
              value={config.devilFish?.diodeCharacter ?? 1}
              min={0}
              max={1}
              defaultValue={1}
              onChange={(v) => handleDevilFishChange('diodeCharacter', v)}
              label="BITE"
              size="sm"
              color={KNOB_ORANGE}
              formatValue={fmtPercent}
            />

            {/* TENSION (duffingAmount) */}
            <PixiKnob
              value={config.devilFish?.duffingAmount ?? 0.03}
              min={-1}
              max={1}
              defaultValue={0.03}
              bipolar
              onChange={(v) => handleDevilFishChange('duffingAmount', v)}
              label="TENSION"
              size="sm"
              color={KNOB_ORANGE}
              formatValue={fmtDuffing}
            />

            {/* LP/BP MIX */}
            <PixiKnob
              value={config.devilFish?.lpBpMix ?? 0}
              min={0}
              max={1}
              defaultValue={0}
              onChange={(v) => handleDevilFishChange('lpBpMix', v)}
              label="LP/BP"
              size="sm"
              color={KNOB_ORANGE}
              formatValue={fmtLpBp}
            />

            {/* Filter select buttons — DiodeLadder (0) vs MissThang-20 (5) */}
            <pixiContainer layout={{ flexDirection: 'column', gap: 4, paddingLeft: 8 }}>
              <PixiButton
                label="DIODE"
                variant={(config.devilFish?.filterSelect ?? 0) === 0 ? 'ft2' : 'ghost'}
                size="sm"
                active={(config.devilFish?.filterSelect ?? 0) === 0}
                color="yellow"
                onClick={() => handleDevilFishChange('filterSelect', 0)}
              />
              <PixiButton
                label="KORG"
                variant={(config.devilFish?.filterSelect ?? 0) === 5 ? 'ft2' : 'ghost'}
                size="sm"
                active={(config.devilFish?.filterSelect ?? 0) === 5}
                onClick={() => handleDevilFishChange('filterSelect', 5)}
              />
            </pixiContainer>
          </pixiContainer>
        )}

        {/* DEVILFISH Tab */}
        {activeTab === 'devilfish' && (
          <pixiContainer
            layout={{
              width,
              height: TAB_CONTENT_H,
              flexDirection: 'row',
              alignItems: 'center',
              paddingLeft: 16,
              paddingRight: 16,
              gap: 8,
            }}
          >
            {/* FILT FM */}
            <PixiKnob
              value={config.devilFish?.filterFmDepth ?? 0}
              min={0}
              max={1}
              defaultValue={0}
              onChange={(v) => handleDevilFishChange('filterFmDepth', v)}
              label="FILT FM"
              size="sm"
              color={KNOB_RED}
              formatValue={fmtPercent}
            />

            {/* FILT TRK */}
            <PixiKnob
              value={config.devilFish?.filterTracking ?? 0}
              min={0}
              max={1}
              defaultValue={0}
              onChange={(v) => handleDevilFishChange('filterTracking', v)}
              label="FILT TRK"
              size="sm"
              color={KNOB_RED}
              formatValue={fmtPercent}
            />

            {/* SLIDE */}
            <PixiKnob
              value={config.slide?.time ?? 0.17}
              min={0}
              max={1}
              defaultValue={0.17}
              onChange={handleSlideChange}
              label="SLIDE"
              size="sm"
              color={KNOB_RED}
              formatValue={fmtSlide}
            />

            {/* SOFT ATTACK */}
            <PixiKnob
              value={config.devilFish?.softAttack ?? 0}
              min={0}
              max={1}
              defaultValue={0}
              onChange={(v) => handleDevilFishChange('softAttack', v)}
              label="S.ATK"
              size="sm"
              color={KNOB_RED}
              formatValue={fmtSoftAtk}
            />

            {/* NORMAL DECAY */}
            <PixiKnob
              value={config.devilFish?.normalDecay ?? 0.164}
              min={0}
              max={1}
              defaultValue={0.164}
              onChange={(v) => handleDevilFishChange('normalDecay', v)}
              label="N.DEC"
              size="sm"
              color={KNOB_RED}
              formatValue={fmtDecay}
            />

            {/* ACCENT DECAY */}
            <PixiKnob
              value={config.devilFish?.accentDecay ?? 0.006}
              min={0}
              max={1}
              defaultValue={0.006}
              onChange={(v) => handleDevilFishChange('accentDecay', v)}
              label="ACC DEC"
              size="sm"
              color={KNOB_RED}
              formatValue={fmtDecay}
            />

            {/* ACCENT SOFT ATTACK */}
            <PixiKnob
              value={config.devilFish?.accentSoftAttack ?? 0.1}
              min={0}
              max={1}
              defaultValue={0.1}
              onChange={(v) => handleDevilFishChange('accentSoftAttack', v)}
              label="ACC SOFT"
              size="sm"
              color={KNOB_RED}
              formatValue={fmtPercent}
            />
          </pixiContainer>
        )}
      </pixiContainer>
    </pixiContainer>
  );
};

PixiTB303KnobPanel.displayName = 'PixiTB303KnobPanel';

export default PixiTB303KnobPanel;
