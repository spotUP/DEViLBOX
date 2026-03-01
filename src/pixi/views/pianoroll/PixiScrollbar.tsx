/**
 * PixiScrollbar — thin scrollbar for the piano roll.
 * Supports horizontal and vertical orientations.
 * - Click track → jump to position
 * - Drag thumb → scroll continuously
 */

import { useCallback, useRef } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { usePixiTheme } from '../../theme';
import { useWorkbenchStore } from '@stores/useWorkbenchStore';

interface PixiScrollbarProps {
  orientation: 'horizontal' | 'vertical';
  width: number;
  height: number;
  /** Current scroll position, 0–1 */
  value: number;
  /** Thumb size as a fraction of the total track, 0–1 */
  thumbSize: number;
  onChange: (newValue: number) => void;
}

const THUMB_MIN_PX = 20;

export const PixiScrollbar: React.FC<PixiScrollbarProps> = ({
  orientation,
  width,
  height,
  value,
  thumbSize,
  onChange,
}) => {
  const theme = usePixiTheme();
  const isH = orientation === 'horizontal';
  const trackLength = isH ? width : height;
  const clampedThumb = Math.max(THUMB_MIN_PX / trackLength, Math.min(1, thumbSize));
  const thumbPx = clampedThumb * trackLength;
  const maxTravel = trackLength - thumbPx;
  const thumbOffset = Math.max(0, Math.min(maxTravel, value * maxTravel));

  const dragStartRef = useRef<{ startOffset: number; startValue: number; startClient: number } | null>(null);

  const draw = useCallback((g: GraphicsType) => {
    g.clear();
    // Track
    g.rect(0, 0, width, height);
    g.fill({ color: theme.bg.color, alpha: 0.6 });

    // Thumb
    if (isH) {
      g.roundRect(thumbOffset + 1, 1, thumbPx - 2, height - 2, 3);
    } else {
      g.roundRect(1, thumbOffset + 1, width - 2, thumbPx - 2, 3);
    }
    g.fill({ color: theme.textMuted.color, alpha: 0.45 });
  }, [width, height, thumbOffset, thumbPx, isH, theme]);

  const handlePointerDown = useCallback((e: FederatedPointerEvent) => {
    const pos = e.getLocalPosition(e.currentTarget as any);
    const localPos = isH ? pos.x : pos.y;

    // Click outside thumb → jump
    if (localPos < thumbOffset || localPos > thumbOffset + thumbPx) {
      const newOffset = Math.max(0, Math.min(maxTravel, localPos - thumbPx / 2));
      onChange(maxTravel > 0 ? newOffset / maxTravel : 0);
      return;
    }

    // Start drag from thumb
    const startClient = isH ? e.clientX : e.clientY;
    dragStartRef.current = { startOffset: thumbOffset, startValue: value, startClient };

    const onMove = (me: PointerEvent) => {
      if (!dragStartRef.current) return;
      const cameraScale = useWorkbenchStore.getState().camera.scale;
      const clientPos = isH ? me.clientX : me.clientY;
      const delta = (clientPos - dragStartRef.current.startClient) / cameraScale;
      const newOffset = Math.max(0, Math.min(maxTravel, dragStartRef.current.startOffset + delta));
      onChange(maxTravel > 0 ? newOffset / maxTravel : 0);
    };

    const onUp = () => {
      dragStartRef.current = null;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [isH, thumbOffset, thumbPx, maxTravel, value, onChange]);

  return (
    <pixiContainer
      layout={{ width, height }}
      eventMode="static"
      cursor="pointer"
      onPointerDown={handlePointerDown}
    >
      <pixiGraphics draw={draw} layout={{ position: 'absolute', width, height }} />
    </pixiContainer>
  );
};
