/**
 * PixiMixerChannelStrip — GL channel strip for the mixer view.
 *
 * Renders top-to-bottom:
 *   1. Channel name label
 *   2. Instrument name label (truncated, 8 chars max)
 *   3. VU meter (pixiGraphics, live level) with peak hold
 *   4. dB level readout
 *   5. FX slot 0 (GL dropdown, optional — omitted for master)
 *   6. FX slot 1 (GL dropdown, optional — omitted for master)
 *   7. Volume fader (PixiSlider, vertical, detent at 1.0)
 *   8. Pan knob (PixiKnob, bipolar, defaultValue 0)
 *   9. Mute button
 *  10. Solo button (hidden when isMaster=true)
 *
 * Dims to alpha 0.4 when another channel is soloed and this one is not.
 */

import React, { useCallback, useRef, useState } from 'react';
import { useTick } from '@pixi/react';
import { isRapidScrolling } from '../scrollPerf';
import type { Container as ContainerType } from 'pixi.js';
import { PixiLabel } from '../components/PixiLabel';
import { PixiSlider } from '../components/PixiSlider';
import { PixiKnob } from '../components/PixiKnob';
import { PixiButton } from '../components/PixiButton';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';
import { usePixiDropdownStore } from '../stores/usePixiDropdownStore';
import type { SelectOption } from '../components/PixiSelect';
import { VU_GREEN, VU_YELLOW, VU_RED } from '../colors';
import { CHANNEL_FX_PRESETS } from '../../constants/fxPresets';
import { useMixerStore } from '../../stores/useMixerStore';

// ─── Props ────────────────────────────────────────────────────────────────────

interface PixiMixerChannelStripProps {
  channelIndex: number;
  name: string;
  instrumentName?: string;
  volume: number;       // 0-1 (1 = unity)
  pan: number;          // -1..1
  muted: boolean;
  soloed: boolean;
  getLevelCallback: () => number;  // imperative read — avoids React re-render per frame
  isSoloing: boolean;   // true if ANY channel is currently soloed
  onVolumeChange: (ch: number, v: number) => void;
  onPanChange: (ch: number, pan: number) => void;
  onMuteToggle: (ch: number) => void;
  onSoloToggle: (ch: number) => void;
  isMaster?: boolean;   // if true, hides the solo button
  effects?: [string | null, string | null];
  onEffectChange?: (slot: 0 | 1, type: string | null) => void;

  // DAW features
  sendLevels?: number[];       // 0-1 per send bus
  onSendLevelChange?: (sendIndex: number, level: number) => void;
  insertEffectCount?: number;  // Number of active insert effects
  onFxClick?: () => void;      // Opens per-channel effects modal
  armRecord?: boolean;
  onArmRecordToggle?: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const VU_WIDTH = 10;
const VU_HEIGHT = 120;
const VU_COLOR_GREEN  = VU_GREEN;
const VU_COLOR_YELLOW = VU_YELLOW;
const VU_COLOR_RED    = VU_RED;

const STRIP_WIDTH = 56; // matches DOM MixerPanel strip width

// Channel FX preset dropdown options
const CHANNEL_FX_OPTIONS: SelectOption[] = [
  { value: '__none__', label: '-- clear --' },
  ...CHANNEL_FX_PRESETS.map((p, i) => ({
    value: String(i),
    label: p.name,
  })),
];

// ─── FX slot ──────────────────────────────────────────────────────────────────

const EFFECT_OPTIONS: SelectOption[] = [
  { value: '__none__', label: '—  none' },
  { value: 'reverb', label: 'Reverb' },
  { value: 'delay', label: 'Delay' },
  { value: 'chorus', label: 'Chorus' },
  { value: 'distortion', label: 'Distort' },
  { value: 'compressor', label: 'Comprs.' },
];

const FX_SLOT_H = 16;

interface PixiEffectSlotProps {
  channelIndex: number;
  slotIndex: 0 | 1;
  effectType: string | null;
  width: number;
  onChange: (slot: 0 | 1, type: string | null) => void;
}

const PixiEffectSlot: React.FC<PixiEffectSlotProps> = ({
  channelIndex,
  slotIndex,
  effectType,
  width,
  onChange,
}) => {
  const theme = usePixiTheme();
  const [hovered, setHovered] = useState(false);
  const containerRef = useRef<ContainerType>(null);
  const idRef = useRef(`fx-slot-${channelIndex}-${slotIndex}`);

  const label = effectType
    ? (EFFECT_OPTIONS.find(o => o.value === effectType)?.label ?? effectType)
    : '—';

  const handleClick = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const pos = el.toGlobal({ x: 0, y: FX_SLOT_H });
    const id = idRef.current;
    usePixiDropdownStore.getState().openDropdown({
      kind: 'select',
      id,
      x: pos.x,
      y: pos.y,
      width: 120,
      options: EFFECT_OPTIONS,
      onSelect: (value) => {
        onChange(slotIndex, value === '__none__' ? null : value);
        usePixiDropdownStore.getState().closeDropdown(id);
      },
      onClose: () => usePixiDropdownStore.getState().closeDropdown(id),
    });
  }, [slotIndex, onChange]);

  return (
    <pixiContainer
      ref={containerRef}
      eventMode="static"
      cursor="pointer"
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      onPointerUp={handleClick}
      layout={{
        width,
        height: FX_SLOT_H,
        backgroundColor: hovered ? theme.bgHover.color : theme.bgTertiary.color,
        borderWidth: 1,
        borderColor: theme.border.color,
        borderRadius: 2,
      }}
    >
      <pixiBitmapText
        text={label}
        style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 10, fill: 0xffffff }}
        tint={effectType ? theme.accent.color : theme.textMuted.color}
        layout={{ position: 'absolute', left: 4, top: 3 }}
      />
    </pixiContainer>
  );
};

// ─── Channel FX Preset Button ─────────────────────────────────────────────────

const ChannelFxPresetButton: React.FC<{ channelIndex: number; width: number }> = ({ channelIndex, width }) => {
  const theme = usePixiTheme();
  const [hovered, setHovered] = useState(false);
  const btnRef = useRef<ContainerType>(null);
  const idRef = useRef(`ch-fx-preset-${channelIndex}`);

  const handleClick = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const pos = el.toGlobal({ x: 0, y: 18 });
    const id = idRef.current;
    usePixiDropdownStore.getState().openDropdown({
      kind: 'select',
      id,
      x: pos.x,
      y: pos.y,
      width: 140,
      options: CHANNEL_FX_OPTIONS,
      onSelect: (value) => {
        if (value === '__none__') {
          useMixerStore.getState().loadChannelInsertPreset(channelIndex, []);
        } else {
          const idx = parseInt(value, 10);
          const preset = CHANNEL_FX_PRESETS[idx];
          if (preset) {
            useMixerStore.getState().loadChannelInsertPreset(channelIndex, preset.effects);
          }
        }
        usePixiDropdownStore.getState().closeDropdown(id);
      },
      onClose: () => usePixiDropdownStore.getState().closeDropdown(id),
    });
  }, [channelIndex]);

  return (
    <pixiContainer
      ref={btnRef}
      eventMode="static"
      cursor="pointer"
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      onPointerUp={handleClick}
      layout={{
        width,
        height: 16,
        backgroundColor: hovered ? theme.bgHover.color : theme.bgTertiary.color,
        borderWidth: 1,
        borderColor: theme.border.color,
        borderRadius: 2,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 2,
      }}
    >
      <pixiBitmapText
        text="FX"
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
        tint={theme.accent.color}
      />
    </pixiContainer>
  );
};

// ─── Volume format ────────────────────────────────────────────────────────────

const formatVolume = (v: number): string => {
  if (v <= 0) return '-inf';
  const db = 20 * Math.log10(v);
  return `${db >= 0 ? '+' : ''}${db.toFixed(1)}`;
};

const formatPan = (v: number): string => {
  if (Math.abs(v) < 0.01) return 'C';
  const pct = Math.round(Math.abs(v) * 100);
  return v < 0 ? `L${pct}` : `R${pct}`;
};

// ─── Component ────────────────────────────────────────────────────────────────

export const PixiMixerChannelStrip: React.FC<PixiMixerChannelStripProps> = ({
  channelIndex,
  name,
  instrumentName = '',
  volume,
  pan,
  muted,
  soloed,
  getLevelCallback,
  isSoloing,
  onVolumeChange,
  onPanChange,
  onMuteToggle,
  onSoloToggle,
  isMaster = false,
  effects,
  onEffectChange,
  sendLevels,
  onSendLevelChange,
  insertEffectCount,
  onFxClick,
  armRecord,
  onArmRecordToggle,
}) => {
  const theme = usePixiTheme();

  // Dim when another channel is soloed and this one is not (and it's not master)
  const stripAlpha = isSoloing && !soloed && !isMaster ? 0.4 : 1;

  // ── Peak hold refs ───────────────────────────────────────────────────────

  const peakRef = useRef(0);
  const peakDecayRef = useRef(0); // timestamp when peak was last set

  // ── Imperative VU refs (drawn in useTick, no React re-render) ────────────

  const vuGraphicsRef = useRef<import('pixi.js').Graphics | null>(null);
  const dbTextRef = useRef<import('pixi.js').BitmapText | null>(null);

  // ── Event handlers ──────────────────────────────────────────────────────────

  const handleVolumeChange = useCallback(
    (v: number) => onVolumeChange(channelIndex, v),
    [channelIndex, onVolumeChange],
  );

  const handlePanChange = useCallback(
    (v: number) => onPanChange(channelIndex, v),
    [channelIndex, onPanChange],
  );

  const handleMuteClick = useCallback(
    () => onMuteToggle(channelIndex),
    [channelIndex, onMuteToggle],
  );

  const handleSoloClick = useCallback(
    () => onSoloToggle(channelIndex),
    [channelIndex, onSoloToggle],
  );

  // ── Imperative VU draw — runs in PixiJS ticker, no React re-render ──────────

  const prevLevelRef = useRef(-1);
  const prevPeakRef = useRef(-1);

  useTick(() => {
    if (isRapidScrolling()) return;
    const level = getLevelCallback();

    // Update peak hold
    if (level >= peakRef.current) {
      peakRef.current = level;
      peakDecayRef.current = Date.now();
    } else if (Date.now() - peakDecayRef.current > 1500) {
      peakRef.current = Math.max(0, peakRef.current - 0.01);
    }

    // Skip Graphics rebuild if nothing visually changed
    const quantizedLevel = Math.round(level * VU_HEIGHT);
    const quantizedPeak = Math.round(peakRef.current * VU_HEIGHT);
    if (quantizedLevel === prevLevelRef.current && quantizedPeak === prevPeakRef.current) return;
    prevLevelRef.current = quantizedLevel;
    prevPeakRef.current = quantizedPeak;

    const g = vuGraphicsRef.current;
    if (g) {
      g.clear();
      g.rect(0, 0, VU_WIDTH, VU_HEIGHT);
      g.fill({ color: theme.bgSecondary.color, alpha: 1 });

      if (quantizedLevel > 0) {
        const vuColor =
          level > 0.9 ? VU_COLOR_RED :
          level > 0.7 ? VU_COLOR_YELLOW :
          VU_COLOR_GREEN;
        g.rect(0, VU_HEIGHT - quantizedLevel, VU_WIDTH, quantizedLevel);
        g.fill({ color: vuColor, alpha: 1 });
      }

      g.rect(0, 0, VU_WIDTH, VU_HEIGHT);
      g.stroke({ color: theme.border.color, alpha: 1, width: 1 });

      const peakY = VU_HEIGHT - quantizedPeak;
      if (peakRef.current > 0.01) {
        g.rect(0, peakY, VU_WIDTH, 1);
        g.fill({ color: peakRef.current > 0.9 ? VU_COLOR_RED : 0xffffff, alpha: 0.9 });
      }
    }

    if (dbTextRef.current) {
      dbTextRef.current.text = level < 0.001 ? '-\u221e' : `${Math.round(20 * Math.log10(level))}dB`;
    }
  });

  // ── Instrument name (truncated) ──────────────────────────────────────────────

  const displayName = instrumentName.length > 7
    ? instrumentName.slice(0, 7) + '\u2026'
    : instrumentName;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <pixiContainer
      alpha={stripAlpha}
      layout={{
        width: STRIP_WIDTH,
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        paddingTop: 4,
        paddingBottom: 4,
      }}
    >
      {/* 1. Channel name label */}
      <PixiLabel
        text={name}
        size="xs"
        color="textMuted"
        layout={{ width: STRIP_WIDTH, height: 12 }}
      />

      {/* 2. Instrument name label */}
      <pixiBitmapText
        text={displayName}
        style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 10, fill: 0xffffff }}
        tint={theme.textMuted.color}
        layout={{ width: STRIP_WIDTH, height: 10 }}
      />

      {/* 3. VU meter */}
      <pixiGraphics
        ref={vuGraphicsRef as any}
        draw={() => {}}
        layout={{ width: VU_WIDTH, height: VU_HEIGHT }}
      />

      {/* 4. dB level readout */}
      <pixiBitmapText
        ref={dbTextRef as any}
        text="-∞"
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
        tint={theme.textMuted.color}
        layout={{ width: STRIP_WIDTH, marginTop: 1 }}
      />

      {/* 5. FX slots */}
      {effects && onEffectChange && (
        <>
          <PixiEffectSlot
            channelIndex={channelIndex}
            slotIndex={0}
            effectType={effects[0]}
            width={STRIP_WIDTH - 4}
            onChange={onEffectChange}
          />
          <PixiEffectSlot
            channelIndex={channelIndex}
            slotIndex={1}
            effectType={effects[1]}
            width={STRIP_WIDTH - 4}
            onChange={onEffectChange}
          />
        </>
      )}

      {/* 6. Volume fader */}
      <PixiSlider
        value={volume}
        min={0}
        max={1.5}
        onChange={handleVolumeChange}
        orientation="vertical"
        length={100}
        handleWidth={14}
        handleHeight={14}
        handleColor={0xf59e0b}
        handleRadius={7}
        thickness={4}
        detent={1.0}
        detentRange={0.02}
        defaultValue={1.0}
        formatValue={formatVolume}
        layout={{ width: STRIP_WIDTH }}
      />

      {/* 7. Pan knob */}
      <PixiKnob
        value={pan}
        min={-1}
        max={1}
        onChange={handlePanChange}
        size="sm"
        bipolar
        defaultValue={0}
        label="PAN"
        formatValue={formatPan}
        layout={{ width: STRIP_WIDTH }}
      />

      {/* 8. Mute button */}
      <PixiButton
        label="M"
        variant="ft2"
        size="sm"
        color={muted ? 'red' : 'default'}
        active={muted}
        onClick={handleMuteClick}
        width={STRIP_WIDTH - 8}
      />

      {/* 9. Solo button (hidden for master channel) */}
      {!isMaster && (
        <PixiButton
          label="S"
          variant="ft2"
          size="sm"
          color={soloed ? 'yellow' : 'default'}
          active={soloed}
          onClick={handleSoloClick}
          width={STRIP_WIDTH - 8}
        />
      )}

      {/* 10. Send level bars (compact, hidden for master) */}
      {!isMaster && sendLevels && onSendLevelChange && (
        <layoutContainer layout={{ flexDirection: 'column', gap: 1, width: STRIP_WIDTH, marginTop: 2, paddingLeft: 4, paddingRight: 4 }}>
          <pixiBitmapText
            text="SENDS"
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 8, fill: 0xffffff }}
            tint={theme.textMuted.color}
            layout={{ width: STRIP_WIDTH - 8 }}
          />
          <layoutContainer layout={{ flexDirection: 'row', gap: 1, width: STRIP_WIDTH - 8 }}>
            {sendLevels.slice(0, 4).map((level, i) => {
              const barWidth = Math.floor((STRIP_WIDTH - 12) / 4);
              return (
                <layoutContainer
                  key={`send-bar-${i}`}
                  eventMode="static"
                  cursor="pointer"
                  onPointerUp={() => {
                    // Cycle through preset levels matching DOM: [0, 0.5, 0.75, 1]
                    const SEND_CYCLE = [0, 0.5, 0.75, 1];
                    const curIdx = SEND_CYCLE.findIndex(v => Math.abs(v - level) < 0.01);
                    const next = SEND_CYCLE[(curIdx + 1) % SEND_CYCLE.length];
                    onSendLevelChange(i, next);
                  }}
                  layout={{
                    width: barWidth,
                    height: 12,
                    backgroundColor: theme.bgActive.color,
                    borderWidth: 1,
                    borderColor: level > 0 ? theme.accentHighlight.color : theme.border.color,
                    overflow: 'hidden',
                  }}
                >
                  {/* Filled portion */}
                  <layoutContainer
                    layout={{
                      width: Math.round(barWidth * level),
                      height: 10,
                      backgroundColor: theme.accentHighlight.color,
                    }}
                  />
                </layoutContainer>
              );
            })}
          </layoutContainer>
        </layoutContainer>
      )}

      {/* 11. Insert FX indicator (clickable to open channel FX modal) */}
      {insertEffectCount !== undefined && insertEffectCount > 0 ? (
        <layoutContainer
          eventMode="static"
          cursor="pointer"
          onPress={onFxClick}
          layout={{ width: STRIP_WIDTH, marginTop: 2 }}
        >
          <pixiBitmapText
            text={`FX:${insertEffectCount}`}
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
            tint={theme.accent.color}
          />
        </layoutContainer>
      ) : !isMaster ? (
        <layoutContainer
          eventMode="static"
          cursor="pointer"
          onPress={onFxClick}
          layout={{ width: STRIP_WIDTH, marginTop: 2 }}
        >
          <pixiBitmapText
            text="FX"
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
            tint={theme.textMuted.color}
          />
        </layoutContainer>
      ) : null}

      {/* 11b. Channel FX preset button (hidden for master) */}
      {!isMaster && (
        <ChannelFxPresetButton channelIndex={channelIndex} width={STRIP_WIDTH - 8} />
      )}

      {/* 12. Record arm button (hidden for master) */}
      {!isMaster && onArmRecordToggle && (
        <PixiButton
          label="R"
          variant="ft2"
          size="sm"
          color={armRecord ? 'red' : 'default'}
          active={armRecord ?? false}
          onClick={onArmRecordToggle}
          width={STRIP_WIDTH - 8}
        />
      )}
    </pixiContainer>
  );
};
