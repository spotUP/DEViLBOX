/**
 * PixiSendBusStrip — GL return bus strip for the mixer view.
 *
 * Renders top-to-bottom:
 *   1. Bus letter label (A/B/C/D) in teal
 *   2. Effect count indicator
 *   3. Volume fader (PixiSlider, vertical)
 *   4. Mute button
 *   5. FX preset button (cycles through send bus presets)
 */

import React, { useCallback, useRef, useState } from 'react';
import { PixiLabel } from '../components/PixiLabel';
import { PixiSlider } from '../components/PixiSlider';
import { PixiButton } from '../components/PixiButton';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';
import type { SendBusState } from '../../stores/useMixerStore';
import { useMixerStore } from '../../stores/useMixerStore';
import { SEND_BUS_PRESETS } from '../../constants/fxPresets';
import { usePixiDropdownStore } from '../stores/usePixiDropdownStore';
import type { SelectOption } from '../components/PixiSelect';
import type { Container as ContainerType } from 'pixi.js';

// ─── Constants ────────────────────────────────────────────────────────────────

// Send bus accent color derived from theme.accentHighlight
const BUS_LETTERS = ['A', 'B', 'C', 'D'];

// Build preset dropdown options
const PRESET_OPTIONS: SelectOption[] = [
  { value: '__none__', label: '-- clear --' },
  ...SEND_BUS_PRESETS.map((p, i) => ({
    value: String(i),
    label: p.name,
  })),
];

// ─── Volume format ────────────────────────────────────────────────────────────

const formatVolume = (v: number): string => {
  if (v <= 0) return '-inf';
  const db = 20 * Math.log10(v);
  return `${db >= 0 ? '+' : ''}${db.toFixed(1)}`;
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface PixiSendBusStripProps {
  busIndex: number;
  bus: SendBusState;
  width: number;
  height: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const PixiSendBusStrip: React.FC<PixiSendBusStripProps> = ({
  busIndex,
  bus,
  width,
  height: _height,
}) => {
  const theme = usePixiTheme();
  const [fxHovered, setFxHovered] = useState(false);
  const fxBtnRef = useRef<ContainerType>(null);
  const dropdownIdRef = useRef(`send-bus-fx-${busIndex}`);

  const letter = BUS_LETTERS[busIndex] ?? String(busIndex);
  const effectCount = bus.effects.length;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleVolumeChange = useCallback((v: number) => {
    useMixerStore.getState().setSendBusVolume(busIndex, v);
  }, [busIndex]);

  const handleMuteClick = useCallback(() => {
    useMixerStore.getState().setSendBusMute(busIndex, !bus.muted);
  }, [busIndex, bus.muted]);

  const handleFxClick = useCallback(() => {
    const el = fxBtnRef.current;
    if (!el) return;
    const pos = el.toGlobal({ x: 0, y: 20 });
    const id = dropdownIdRef.current;
    usePixiDropdownStore.getState().openDropdown({
      kind: 'select',
      id,
      x: pos.x,
      y: pos.y,
      width: 160,
      options: PRESET_OPTIONS,
      onSelect: (value) => {
        if (value === '__none__') {
          useMixerStore.getState().setSendBusEffects(busIndex, []);
        } else {
          const idx = parseInt(value, 10);
          const preset = SEND_BUS_PRESETS[idx];
          if (preset) {
            useMixerStore.getState().setSendBusEffects(busIndex, preset.effects);
          }
        }
        usePixiDropdownStore.getState().closeDropdown(id);
      },
      onClose: () => usePixiDropdownStore.getState().closeDropdown(id),
    });
  }, [busIndex]);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <pixiContainer
      alpha={bus.muted ? 0.4 : 1}
      layout={{
        width,
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        paddingTop: 4,
        paddingBottom: 4,
      }}
    >
      {/* 1. Bus letter label */}
      <pixiBitmapText
        text={letter}
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 14, fill: 0xffffff }}
        tint={theme.accentHighlight.color}
        layout={{ width, height: 14 }}
      />

      {/* 2. Bus name */}
      <PixiLabel
        text={bus.name}
        size="xs"
        color="textMuted"
        layout={{ width, height: 10 }}
      />

      {/* 3. Effect count indicator */}
      <pixiBitmapText
        text={effectCount > 0 ? `FX:${effectCount}` : 'FX:0'}
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
        tint={effectCount > 0 ? theme.accentHighlight.color : theme.textMuted.color}
        layout={{ width, height: 10 }}
      />

      {/* 4. Volume fader — matches channel strip dimensions */}
      <PixiSlider
        value={bus.volume}
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
        layout={{ width }}
        color={theme.accentHighlight.color}
      />

      {/* 5. Mute button */}
      <PixiButton
        label="M"
        variant="ft2"
        size="sm"
        color={bus.muted ? 'red' : 'default'}
        active={bus.muted}
        onClick={handleMuteClick}
        width={width - 8}
      />

      {/* 6. FX preset button */}
      <pixiContainer
        ref={fxBtnRef}
        eventMode="static"
        cursor="pointer"
        onPointerOver={() => setFxHovered(true)}
        onPointerOut={() => setFxHovered(false)}
        onPointerUp={handleFxClick}
        layout={{
          width: width - 8,
          height: 18,
          backgroundColor: fxHovered ? theme.bgHover.color : theme.bgTertiary.color,
          borderWidth: 1,
          borderColor: theme.accentHighlight.color,
          borderRadius: 2,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <pixiBitmapText
          text="FX"
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
          tint={theme.accentHighlight.color}
        />
      </pixiContainer>
    </pixiContainer>
  );
};
