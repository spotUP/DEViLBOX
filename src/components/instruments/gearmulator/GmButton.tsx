/**
 * GmButton — Sprite-based toggle/momentary button for gearmulator hardware skins.
 * Uses RCSS-style spritesheet with states: default, hover, active, checked, checked-hover, checked-active.
 */

import React, { useCallback, useState } from 'react';

export interface GmButtonSpriteState {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GmButtonSprites {
  src: string;
  default: GmButtonSpriteState;
  hover: GmButtonSpriteState;
  active: GmButtonSpriteState;
  checked: GmButtonSpriteState;
  checkedHover: GmButtonSpriteState;
  checkedActive: GmButtonSpriteState;
}

export interface GmButtonProps {
  sprites: GmButtonSprites;
  /** Current toggle state (for toggle buttons) */
  checked?: boolean;
  /** Is this a toggle button? */
  isToggle?: boolean;
  /** Called on click (toggle) or press (momentary) */
  onChange?: (checked: boolean) => void;
  /** CSS position style */
  style?: React.CSSProperties;
  /** Parameter name (for tooltip) */
  paramName?: string;
  className?: string;
}

export const GmButton: React.FC<GmButtonProps> = ({
  sprites, checked = false, isToggle = true, onChange, style, paramName, className
}) => {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  let state: GmButtonSpriteState;
  if (checked) {
    if (pressed) state = sprites.checkedActive;
    else if (hovered) state = sprites.checkedHover;
    else state = sprites.checked;
  } else {
    if (pressed) state = sprites.active;
    else if (hovered) state = sprites.hover;
    else state = sprites.default;
  }

  const handleClick = useCallback(() => {
    if (isToggle) {
      onChange?.(!checked);
    } else {
      onChange?.(true);
    }
  }, [isToggle, checked, onChange]);

  return (
    <div
      className={`gm-button ${className ?? ''}`}
      style={{
        width: state.w,
        height: state.h,
        backgroundImage: `url(${sprites.src})`,
        backgroundPosition: `-${state.x}px -${state.y}px`,
        backgroundRepeat: 'no-repeat',
        cursor: 'pointer',
        ...style,
      }}
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      title={paramName}
    />
  );
};

/** Helper to build sprite state from RCSS-style coordinates */
export function makeButtonSprites(
  src: string,
  w: number, h: number,
  uncheckedY: number, checkedY: number
): GmButtonSprites {
  return {
    src,
    default: { x: 0, y: uncheckedY, w, h },
    hover: { x: 0, y: uncheckedY, w, h },
    active: { x: 0, y: uncheckedY, w, h },
    checked: { x: 0, y: checkedY, w, h },
    checkedHover: { x: 0, y: checkedY, w, h },
    checkedActive: { x: 0, y: checkedY, w, h },
  };
}
