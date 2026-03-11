/**
 * GmKnob — CSS sprite-based rotary knob for gearmulator hardware skins.
 * Uses 128-frame spritesheet grids (page0 PNGs) for smooth rotation.
 */

import React, { useCallback, useRef, useState, useEffect } from 'react';

export interface GmKnobProps {
  /** Spritesheet image URL (e.g., knob_1_128_page0.png) */
  src: string;
  /** Frame size in pixels (at display scale) */
  frameWidth: number;
  frameHeight: number;
  /** Number of columns in the spritesheet grid */
  cols: number;
  /** Total number of frames (typically 128) */
  totalFrames?: number;
  /** Number of rows in the spritesheet grid (auto-calculated if not provided) */
  rows?: number;
  /** Current value 0..1 */
  value: number;
  /** Called when user drags to change value */
  onChange: (value: number) => void;
  /** CSS position style */
  style?: React.CSSProperties;
  /** Parameter name (for tooltip) */
  paramName?: string;
  /** Is bipolar (-64..+63 style) */
  bipolar?: boolean;
  /** CSS class */
  className?: string;
}

export const GmKnob: React.FC<GmKnobProps> = ({
  src, frameWidth, frameHeight, cols, totalFrames = 128, rows: rowsProp,
  value, onChange, style, paramName, bipolar, className
}) => {
  const rows = rowsProp ?? Math.ceil(totalFrames / cols);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ y: 0, startValue: 0 });
  const elRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const pendingValueRef = useRef<number | null>(null);
  const onChangeRef = useRef(onChange);

  // Keep onChange ref in sync
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  // Cleanup RAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const frame = Math.round(Math.max(0, Math.min(1, value)) * (totalFrames - 1));
  const col = frame % cols;
  const row = Math.floor(frame / cols);
  const bgX = -(col * frameWidth);
  const bgY = -(row * frameHeight);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragStart.current = { y: e.clientY, startValue: value };
    setDragging(true);
  }, [value]);

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: MouseEvent) => {
      const dy = dragStart.current.y - e.clientY;
      const sensitivity = e.shiftKey ? 0.001 : 0.005;
      const newVal = Math.max(0, Math.min(1, dragStart.current.startValue + dy * sensitivity));

      // RAF debouncing for smooth updates
      pendingValueRef.current = newVal;
      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(() => {
          if (pendingValueRef.current !== null) {
            onChangeRef.current(pendingValueRef.current);
            pendingValueRef.current = null;
          }
          rafRef.current = null;
        });
      }
    };

    const onUp = () => {
      setDragging(false);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [dragging]);

  const handleDoubleClick = useCallback(() => {
    onChange(bipolar ? 0.5 : 0);
  }, [onChange, bipolar]);

  return (
    <div
      ref={elRef}
      className={`gm-knob ${className ?? ''}`}
      style={{
        width: frameWidth,
        height: frameHeight,
        backgroundImage: `url(${src})`,
        backgroundPosition: `${bgX}px ${bgY}px`,
        backgroundSize: `${cols * frameWidth}px ${rows * frameHeight}px`,
        backgroundRepeat: 'no-repeat',
        cursor: dragging ? 'ns-resize' : 'pointer',
        ...style,
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      title={paramName ? `${paramName}: ${Math.round(value * 127)}` : undefined}
    />
  );
};
