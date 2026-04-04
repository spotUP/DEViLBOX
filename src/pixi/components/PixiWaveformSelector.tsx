/**
 * PixiWaveformSelector -- GL equivalent of src/components/ui/WaveformSelector.tsx
 * Grid of waveform shape buttons with small waveform icons drawn via PixiGraphics.
 */

import React, { useCallback, useState } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { usePixiTheme } from '../theme';
import { PIXI_FONTS } from '../fonts';

type WaveformType = 'sine' | 'square' | 'sawtooth' | 'triangle' | 'pulse' | 'pwm';

interface PixiWaveformSelectorProps {
  value: string;
  onChange: (waveform: string) => void;
  waveforms?: string[];
  size?: 'sm' | 'md' | 'lg';
  layout?: Record<string, unknown>;
}

const WAVEFORM_LABELS: Record<string, string> = {
  sine: 'Sine',
  square: 'Square',
  sawtooth: 'Saw',
  triangle: 'Tri',
  pulse: 'Pulse',
  pwm: 'PWM',
};

const SIZE_CONFIG = {
  sm: { width: 48, height: 28, fontSize: 8, strokeWidth: 1.5 },
  md: { width: 64, height: 36, fontSize: 9, strokeWidth: 2 },
  lg: { width: 80, height: 44, fontSize: 10, strokeWidth: 2 },
} as const;

/** Generate waveform Y values for a given type. Returns array of {x, y} pairs. */
function generateWaveformPoints(
  type: string,
  width: number,
  height: number,
  padding: number,
): { x: number; y: number }[] {
  const midY = height / 2;
  const amplitude = height * 0.35;
  const drawWidth = width - padding * 2;
  const numPoints = 80;
  const points: { x: number; y: number }[] = [];

  for (let i = 0; i <= numPoints; i++) {
    const x = padding + (i / numPoints) * drawWidth;
    const phase = (i / numPoints) * Math.PI * 4; // Two full cycles
    let y: number;

    switch (type as WaveformType) {
      case 'sine':
        y = midY - Math.sin(phase) * amplitude;
        break;
      case 'square':
        y = midY - (Math.sin(phase) >= 0 ? 1 : -1) * amplitude;
        break;
      case 'sawtooth': {
        const sawPhase = ((phase / Math.PI) % 2) - 1;
        y = midY - sawPhase * amplitude;
        break;
      }
      case 'triangle': {
        const triPhase = (phase / Math.PI) % 2;
        const triVal = triPhase < 1 ? triPhase * 2 - 1 : 3 - triPhase * 2;
        y = midY - triVal * amplitude;
        break;
      }
      case 'pulse': {
        const pulsePhase = (phase / Math.PI) % 2;
        y = midY - (pulsePhase < 0.5 ? 1 : -1) * amplitude;
        break;
      }
      case 'pwm': {
        const pwmDuty = 0.25 + (i / numPoints) * 0.5;
        const pwmPhase = (phase / Math.PI) % 2;
        y = midY - (pwmPhase < pwmDuty ? 1 : -1) * amplitude;
        break;
      }
      default:
        y = midY;
    }
    points.push({ x, y });
  }
  return points;
}

/* ---------- Individual waveform button ---------- */

interface WaveformButtonProps {
  waveform: string;
  isSelected: boolean;
  isHovered: boolean;
  config: (typeof SIZE_CONFIG)[keyof typeof SIZE_CONFIG];
  accentColor: number;
  bgColor: number;
  borderColor: number;
  mutedColor: number;
  textColor: number;
  onSelect: (wf: string) => void;
  onHover: (wf: string | null) => void;
}

const WaveformButton: React.FC<WaveformButtonProps> = ({
  waveform,
  isSelected,
  isHovered,
  config,
  accentColor,
  bgColor,
  borderColor,
  mutedColor,
  textColor,
  onSelect,
  onHover,
}) => {
  const padding = 4;
  const labelHeight = config.fontSize + 2;
  const totalHeight = config.height + labelHeight;

  const handleTap = useCallback(
    (e: FederatedPointerEvent) => {
      e.stopPropagation();
      onSelect(waveform);
    },
    [onSelect, waveform],
  );

  const drawWaveform = useCallback(
    (g: GraphicsType) => {
      g.clear();

      // Background
      g.roundRect(0, 0, config.width, config.height, 3);
      g.fill({ color: isSelected ? accentColor : bgColor, alpha: isSelected ? 0.1 : 1 });

      // Border / ring for selected
      g.roundRect(0, 0, config.width, config.height, 3);
      g.stroke({
        color: isSelected ? accentColor : isHovered ? borderColor : bgColor,
        width: isSelected ? 2 : 1,
        alpha: isSelected ? 1 : 0.6,
      });

      // Center line (dashed approximation: short segments)
      const dashLen = 2;
      const gapLen = 2;
      const midY = config.height / 2;
      let dx = 0;
      while (dx < config.width) {
        const segEnd = Math.min(dx + dashLen, config.width);
        g.moveTo(dx, midY);
        g.lineTo(segEnd, midY);
        g.stroke({ color: borderColor, width: 1, alpha: 0.3 });
        dx += dashLen + gapLen;
      }

      // Waveform path
      const pts = generateWaveformPoints(waveform, config.width, config.height, padding);
      if (pts.length > 0) {
        g.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
          g.lineTo(pts[i].x, pts[i].y);
        }
        g.stroke({
          color: isSelected ? accentColor : mutedColor,
          width: isSelected ? config.strokeWidth : config.strokeWidth - 0.5,
        });
      }
    },
    [waveform, isSelected, isHovered, accentColor, bgColor, borderColor, mutedColor, config, padding],
  );

  return (
    <pixiContainer
      eventMode="static"
      cursor="pointer"
      onPointerTap={handleTap}
      onPointerOver={() => onHover(waveform)}
      onPointerOut={() => onHover(null)}
      layout={{ flexDirection: 'column', alignItems: 'center', width: config.width, height: totalHeight }}
    >
      <pixiGraphics
        eventMode="none"
        draw={drawWaveform}
        layout={{ width: config.width, height: config.height }}
      />
      <pixiBitmapText
        eventMode="none"
        text={WAVEFORM_LABELS[waveform] ?? waveform}
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: config.fontSize, fill: 0xffffff }}
        tint={isSelected ? textColor : mutedColor}
        layout={{ marginTop: 1 }}
      />
    </pixiContainer>
  );
};

/* ---------- Main selector ---------- */

const DEFAULT_WAVEFORMS: string[] = ['sine', 'square', 'sawtooth', 'triangle'];

export const PixiWaveformSelector: React.FC<PixiWaveformSelectorProps> = ({
  value,
  onChange,
  waveforms = DEFAULT_WAVEFORMS,
  size = 'md',
  layout: layoutProp,
}) => {
  const theme = usePixiTheme();
  const [hoveredWf, setHoveredWf] = useState<string | null>(null);
  const config = SIZE_CONFIG[size];

  const gap = 4;
  const labelHeight = config.fontSize + 2;
  const totalHeight = config.height + labelHeight + 4;
  const totalWidth = waveforms.length * config.width + (waveforms.length - 1) * gap + 8; // +8 for padding

  return (
    <pixiContainer
      eventMode="static"
      layout={{
        flexDirection: 'row',
        alignItems: 'center',
        gap,
        paddingLeft: 4,
        paddingRight: 4,
        paddingTop: 4,
        paddingBottom: 4,
        width: totalWidth,
        height: totalHeight,
        ...layoutProp,
      }}
    >
      {waveforms.map((wf) => (
        <WaveformButton
          key={wf}
          waveform={wf}
          isSelected={value === wf}
          isHovered={hoveredWf === wf}
          config={config}
          accentColor={theme.accent.color}
          bgColor={theme.bgTertiary.color}
          borderColor={theme.border.color}
          mutedColor={theme.textMuted.color}
          textColor={theme.text.color}
          onSelect={onChange}
          onHover={setHoveredWf}
        />
      ))}
    </pixiContainer>
  );
};
