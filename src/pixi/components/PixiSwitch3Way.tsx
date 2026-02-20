/**
 * PixiSwitch3Way — Three-position switch control.
 * Graphics track + 3 BitmapText labels + sliding indicator.
 * Reference: src/components/controls/Switch3Way.tsx
 */

import { useCallback } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';

interface PixiSwitch3WayProps {
  value: 0 | 1 | 2;
  onChange: (value: 0 | 1 | 2) => void;
  labels: [string, string, string];
  disabled?: boolean;
  color?: number;
  layout?: Record<string, unknown>;
}

const SWITCH_WIDTH = 90;
const SWITCH_HEIGHT = 22;
const SEGMENT_WIDTH = SWITCH_WIDTH / 3;

export const PixiSwitch3Way: React.FC<PixiSwitch3WayProps> = ({
  value,
  onChange,
  labels,
  disabled = false,
  color: colorProp,
  layout: layoutProp,
}) => {
  const theme = usePixiTheme();
  const accent = colorProp ?? theme.accent.color;

  const drawSwitch = useCallback((g: GraphicsType) => {
    g.clear();

    // Track background
    g.roundRect(0, 0, SWITCH_WIDTH, SWITCH_HEIGHT, 4);
    g.fill({ color: theme.bgActive.color });
    g.roundRect(0, 0, SWITCH_WIDTH, SWITCH_HEIGHT, 4);
    g.stroke({ color: theme.border.color, alpha: 0.5, width: 1 });

    // Active indicator
    const indicatorX = value * SEGMENT_WIDTH;
    g.roundRect(indicatorX + 1, 1, SEGMENT_WIDTH - 2, SWITCH_HEIGHT - 2, 3);
    g.fill({ color: accent, alpha: 0.3 });
    g.roundRect(indicatorX + 1, 1, SEGMENT_WIDTH - 2, SWITCH_HEIGHT - 2, 3);
    g.stroke({ color: accent, alpha: 0.6, width: 1 });

    // Segment dividers
    g.moveTo(SEGMENT_WIDTH, 4);
    g.lineTo(SEGMENT_WIDTH, SWITCH_HEIGHT - 4);
    g.stroke({ color: theme.border.color, alpha: 0.3, width: 1 });
    g.moveTo(SEGMENT_WIDTH * 2, 4);
    g.lineTo(SEGMENT_WIDTH * 2, SWITCH_HEIGHT - 4);
    g.stroke({ color: theme.border.color, alpha: 0.3, width: 1 });
  }, [value, accent, theme]);

  const handleClick = useCallback((e: FederatedPointerEvent) => {
    if (disabled) return;
    // Determine which segment was clicked based on local X coordinate
    const localX = e.getLocalPosition(e.currentTarget).x;
    const segment = Math.min(2, Math.floor(localX / SEGMENT_WIDTH)) as 0 | 1 | 2;
    onChange(segment);
  }, [disabled, onChange]);

  return (
    <pixiContainer
      eventMode={disabled ? 'none' : 'static'}
      cursor={disabled ? 'not-allowed' : 'pointer'}
      onPointerUp={handleClick}
      alpha={disabled ? 0.4 : 1}
      layout={{
        width: SWITCH_WIDTH,
        height: SWITCH_HEIGHT + 2,
        ...layoutProp,
      }}
    >
      <pixiGraphics draw={drawSwitch} layout={{ width: SWITCH_WIDTH, height: SWITCH_HEIGHT }} />

      {/* Labels positioned at each segment center */}
      {labels.map((lbl, i) => (
        <pixiBitmapText
          key={i}
          text={lbl}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9 }}
          tint={value === i ? accent : theme.textMuted.color}
          layout={{
            position: 'absolute',
            left: i * SEGMENT_WIDTH + SEGMENT_WIDTH / 2 - lbl.length * 2.5,
            top: (SWITCH_HEIGHT - 9) / 2,
          }}
        />
      ))}
    </pixiContainer>
  );
};
