/**
 * PixiDigitalDisplay — Renders numbers using fontaudio's digital (7-segment) glyphs.
 * Supports digits 0-9, colon, and dot.
 * Usage: <PixiDigitalDisplay value="128.00" size={16} />
 */

import React from 'react';
import { PIXI_FONTS } from '../fonts';
import { FAD_ICONS } from '../fontaudioIcons';

const DIGIT_MAP: Record<string, string | undefined> = {
  '0': FAD_ICONS['digital0'],
  '1': FAD_ICONS['digital1'],
  '2': FAD_ICONS['digital2'],
  '3': FAD_ICONS['digital3'],
  '4': FAD_ICONS['digital4'],
  '5': FAD_ICONS['digital5'],
  '6': FAD_ICONS['digital6'],
  '7': FAD_ICONS['digital7'],
  '8': FAD_ICONS['digital8'],
  '9': FAD_ICONS['digital9'],
  ':': FAD_ICONS['digital-colon'],
  '.': FAD_ICONS['digital-dot'],
};

/** Convert a string of digits/dots/colons to fontaudio digital glyphs */
export function toDigitalText(value: string): string {
  let result = '';
  for (const ch of value) {
    result += DIGIT_MAP[ch] ?? ch;
  }
  return result;
}

interface PixiDigitalDisplayProps {
  value: string;
  size?: number;
  color?: number;
  alpha?: number;
  layout?: Record<string, unknown>;
}

export const PixiDigitalDisplay: React.FC<PixiDigitalDisplayProps> = ({
  value,
  size = 14,
  color = 0x22dd66,
  alpha = 1,
  layout,
}) => {
  const digitalText = toDigitalText(value);

  return (
    <pixiBitmapText
      text={digitalText}
      style={{ fontFamily: PIXI_FONTS.ICONS, fontSize: size, fill: 0xffffff }}
      tint={color}
      alpha={alpha}
      layout={layout ?? {}}
    />
  );
};
