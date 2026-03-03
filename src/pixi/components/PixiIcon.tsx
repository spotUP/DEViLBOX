/**
 * PixiIcon — Renders a fontaudio icon as BitmapText.
 * Usage: <PixiIcon name="play" size={14} color={0xff0000} />
 */

import React from 'react';
import { PIXI_FONTS } from '../fonts';
import { FAD_ICONS } from '../fontaudioIcons';

interface PixiIconProps {
  /** FontAudio icon name (e.g. 'play', 'stop', 'mute', 'record') */
  name: string;
  size?: number;
  color?: number;
  alpha?: number;
  layout?: Record<string, unknown>;
}

export const PixiIcon: React.FC<PixiIconProps> = ({
  name,
  size = 14,
  color = 0xffffff,
  alpha = 1,
  layout,
}) => {
  const char = FAD_ICONS[name];
  if (!char) return null;

  return (
    <pixiBitmapText
      text={char}
      style={{ fontFamily: PIXI_FONTS.ICONS, fontSize: size, fill: 0xffffff }}
      tint={color}
      alpha={alpha}
      layout={layout ?? {}}
    />
  );
};
