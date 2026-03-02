/**
 * PixiMixerChannelStrip — GL channel strip for the mixer view.
 *
 * Renders top-to-bottom:
 *   1. Channel name label
 *   2. Instrument name label (truncated, 8 chars max)
 *   3. VU meter (pixiGraphics, live level) with peak hold
 *   4. dB level readout
 *   5. Volume fader (PixiSlider, vertical, detent at 1.0)
 *   6. Pan knob (PixiKnob, bipolar, defaultValue 0)
 *   7. Mute button
 *   8. Solo button (hidden when isMaster=true)
 *
 * Dims to alpha 0.4 when another channel is soloed and this one is not.
 */

import React, { useCallback, useRef } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PixiLabel } from '../components/PixiLabel';
import { PixiSlider } from '../components/PixiSlider';
import { PixiKnob } from '../components/PixiKnob';
import { PixiButton } from '../components/PixiButton';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';

// ─── Props ────────────────────────────────────────────────────────────────────

interface PixiMixerChannelStripProps {
  channelIndex: number;
  name: string;
  instrumentName?: string;
  volume: number;       // 0-1 (1 = unity)
  pan: number;          // -1..1
  muted: boolean;
  soloed: boolean;
  level: number;        // 0-1 (live VU meter level, updated by parent)
  isSoloing: boolean;   // true if ANY channel is currently soloed
  onVolumeChange: (ch: number, v: number) => void;
  onPanChange: (ch: number, pan: number) => void;
  onMuteToggle: (ch: number) => void;
  onSoloToggle: (ch: number) => void;
  isMaster?: boolean;   // if true, hides the solo button
}

// ─── Constants ────────────────────────────────────────────────────────────────

const VU_WIDTH = 8;
const VU_HEIGHT = 80;
const VU_COLOR_GREEN  = 0x22dd66;
const VU_COLOR_YELLOW = 0xffcc00;
const VU_COLOR_RED    = 0xff2222;

const STRIP_WIDTH = 56;

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
  level,
  isSoloing,
  onVolumeChange,
  onPanChange,
  onMuteToggle,
  onSoloToggle,
  isMaster = false,
}) => {
  const theme = usePixiTheme();

  // Dim when another channel is soloed and this one is not (and it's not master)
  const stripAlpha = isSoloing && !soloed && !isMaster ? 0.4 : 1;

  // ── Peak hold refs ───────────────────────────────────────────────────────

  const peakRef = useRef(0);
  const peakDecayRef = useRef(0); // timestamp when peak was last set

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

  // ── VU meter draw ───────────────────────────────────────────────────────────

  const drawVU = useCallback(
    (g: GraphicsType) => {
      g.clear();

      // Background track
      g.rect(0, 0, VU_WIDTH, VU_HEIGHT);
      g.fill({ color: 0x111111, alpha: 1 });

      // Filled level bar (bottom-up)
      const filledH = Math.round(level * VU_HEIGHT);
      if (filledH > 0) {
        const vuColor =
          level > 0.9 ? VU_COLOR_RED :
          level > 0.7 ? VU_COLOR_YELLOW :
          VU_COLOR_GREEN;

        g.rect(0, VU_HEIGHT - filledH, VU_WIDTH, filledH);
        g.fill({ color: vuColor, alpha: 1 });
      }

      // Border
      g.rect(0, 0, VU_WIDTH, VU_HEIGHT);
      g.stroke({ color: 0x333333, alpha: 1, width: 1 });

      // Peak hold: update peak if current level is higher
      if (level >= peakRef.current) {
        peakRef.current = level;
        peakDecayRef.current = Date.now();
      } else if (Date.now() - peakDecayRef.current > 1500) {
        // Decay after 1500ms
        peakRef.current = Math.max(0, peakRef.current - 0.01);
      }
      // Draw peak hold line
      const peakY = VU_HEIGHT - Math.round(peakRef.current * VU_HEIGHT);
      if (peakRef.current > 0.01) {
        g.rect(0, peakY, VU_WIDTH, 1);
        g.fill({ color: peakRef.current > 0.9 ? VU_COLOR_RED : 0xffffff, alpha: 0.9 });
      }
    },
    [level],
  );

  // ── dB text ─────────────────────────────────────────────────────────────────

  const dbText = level < 0.001 ? '-\u221e' : `${Math.round(20 * Math.log10(level))}dB`;

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
        style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 8, fill: 0xffffff }}
        tint={theme.textMuted.color}
        layout={{ width: STRIP_WIDTH, height: 10 }}
      />

      {/* 3. VU meter */}
      <pixiGraphics
        draw={drawVU}
        layout={{ width: VU_WIDTH, height: VU_HEIGHT }}
      />

      {/* 4. dB level readout */}
      <pixiBitmapText
        text={dbText}
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 8, fill: 0xffffff }}
        tint={theme.textMuted.color}
        layout={{ width: STRIP_WIDTH, marginTop: 1 }}
      />

      {/* 5. Volume fader */}
      <PixiSlider
        value={volume}
        min={0}
        max={1.5}
        onChange={handleVolumeChange}
        orientation="vertical"
        length={100}
        handleWidth={28}
        handleHeight={10}
        detent={1.0}
        detentRange={0.02}
        defaultValue={1.0}
        formatValue={formatVolume}
        layout={{ width: STRIP_WIDTH }}
      />

      {/* 6. Pan knob */}
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

      {/* 7. Mute button */}
      <PixiButton
        label="M"
        variant="ft2"
        size="sm"
        color={muted ? 'red' : 'default'}
        active={muted}
        onClick={handleMuteClick}
        width={STRIP_WIDTH - 8}
      />

      {/* 8. Solo button (hidden for master channel) */}
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
    </pixiContainer>
  );
};
