/**
 * Fader — vertical linear slider. Dub-desk ergonomics (real mixers have
 * faders, not knobs for per-channel send levels). Shares the paramKey
 * imperative-fastpath convention with Knob so a MIDI-driven fader gets
 * audio-rate visual updates without React re-renders.
 *
 * Dragging vertically ramps the value; the thumb snaps under the pointer
 * so hitting any point on the track jumps straight there. Unity (1.0)
 * gets a subtle notch tick so users can eyeball "100% dry" quickly.
 */

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { subscribeToParamLiveValue } from '@/midi/performance/parameterRouter';

interface FaderProps {
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;

  /** Overall size — default 'md' is 16px wide × 80px tall */
  size?: 'sm' | 'md' | 'lg';

  /** Token for the filled-track color (design tokens only). */
  color?: 'accent-primary' | 'accent-secondary' | 'accent-success' | 'accent-warning' | 'accent-error' | 'accent-highlight';

  label?: string;
  title?: string;
  disabled?: boolean;

  /** Format the readout shown under the fader. When undefined no readout
   *  is rendered — good for tight rows. */
  formatValue?: (v: number) => string;

  /** MIDI fast path, same contract as Knob. */
  paramKey?: string;
  imperativeSubscribe?: (cb: (norm01: number) => void) => () => void;

  /** Clickable value at the top-end shortcut (default: max). Double-click
   *  the fader to snap here; useful for dub-send "full up" gestures. */
  doubleClickValue?: number;
}

const SIZE_PX: Record<NonNullable<FaderProps['size']>, { w: number; h: number; thumbH: number }> = {
  sm: { w: 14, h: 56,  thumbH: 10 },
  md: { w: 18, h: 80,  thumbH: 14 },
  lg: { w: 22, h: 120, thumbH: 18 },
};

const COLOR_FILL: Record<NonNullable<FaderProps['color']>, string> = {
  'accent-primary':   'bg-accent-primary',
  'accent-secondary': 'bg-accent-secondary',
  'accent-success':   'bg-accent-success',
  'accent-warning':   'bg-accent-warning',
  'accent-error':     'bg-accent-error',
  'accent-highlight': 'bg-accent-highlight',
};

export const Fader: React.FC<FaderProps> = React.memo(({
  value, min = 0, max = 1, onChange,
  size = 'md', color = 'accent-primary',
  label, title, disabled = false,
  formatValue,
  paramKey, imperativeSubscribe,
  doubleClickValue,
}) => {
  const { w, h, thumbH } = SIZE_PX[size];
  const trackRef = useRef<HTMLDivElement | null>(null);
  const thumbRef = useRef<HTMLDivElement | null>(null);
  const fillRef = useRef<HTMLDivElement | null>(null);
  const [internalValue, setInternalValue] = useState(value);
  const internalRef = useRef(value);
  internalRef.current = internalValue;

  // Drive imperative fast-path writes when a paramKey / custom subscriber
  // is provided. Bypasses React re-render for MIDI CC feed.
  const subscribe = imperativeSubscribe ?? (paramKey ? (cb: (n: number) => void) => subscribeToParamLiveValue(paramKey, cb) : null);
  useEffect(() => {
    if (!subscribe) return;
    return subscribe((n01) => {
      const v = min + n01 * (max - min);
      internalRef.current = v;
      positionThumbAndFill(v);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribe, min, max]);

  // Sync from prop on mount + on external value change (non-drag).
  useLayoutEffect(() => {
    setInternalValue(value);
    positionThumbAndFill(value);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const positionThumbAndFill = useCallback((v: number) => {
    const thumb = thumbRef.current;
    const fill = fillRef.current;
    if (!thumb || !fill) return;
    const norm = Math.max(0, Math.min(1, (v - min) / (max - min)));
    const availPx = h - thumbH;
    const thumbTop = (1 - norm) * availPx;
    thumb.style.transform = `translateY(${thumbTop}px)`;
    fill.style.height = `${norm * 100}%`;
  }, [h, thumbH, min, max]);

  // Drag handling — pointer capture, vertical delta → value, clamp.
  const draggingRef = useRef(false);
  const dragStartYRef = useRef(0);
  const dragStartValueRef = useRef(0);

  const valueFromPointer = useCallback((clientY: number): number => {
    const track = trackRef.current;
    if (!track) return internalRef.current;
    const rect = track.getBoundingClientRect();
    const localY = clientY - rect.top - thumbH / 2;
    const availPx = h - thumbH;
    const norm = Math.max(0, Math.min(1, 1 - localY / availPx));
    return min + norm * (max - min);
  }, [h, thumbH, min, max]);

  const commit = useCallback((v: number) => {
    const clamped = Math.max(min, Math.min(max, v));
    internalRef.current = clamped;
    setInternalValue(clamped);
    positionThumbAndFill(clamped);
    onChange(clamped);
  }, [min, max, onChange, positionThumbAndFill]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    draggingRef.current = true;
    dragStartYRef.current = e.clientY;
    dragStartValueRef.current = internalRef.current;
    // Jump-to-cursor on click.
    commit(valueFromPointer(e.clientY));
  }, [disabled, commit, valueFromPointer]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    e.preventDefault();
    commit(valueFromPointer(e.clientY));
  }, [commit, valueFromPointer]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ok */ }
  }, []);

  const onDoubleClick = useCallback(() => {
    if (disabled) return;
    commit(doubleClickValue ?? max);
  }, [disabled, commit, doubleClickValue, max]);

  const readoutText = formatValue ? formatValue(internalValue) : undefined;

  return (
    <div
      className={'flex flex-col items-center gap-0.5 select-none' + (disabled ? ' opacity-40' : '')}
      title={title}
    >
      {label && <span className="text-[9px] text-text-muted font-mono leading-none">{label}</span>}
      <div
        ref={trackRef}
        className={
          'relative rounded-sm bg-dark-bgTertiary border border-dark-border cursor-ns-resize' +
          (disabled ? ' cursor-not-allowed' : ' hover:border-dark-borderLight')
        }
        style={{ width: `${w}px`, height: `${h}px`, touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
      >
        {/* Fill — grows upward from the bottom of the track */}
        <div
          ref={fillRef}
          className={`absolute bottom-0 left-0 right-0 ${COLOR_FILL[color]} transition-none pointer-events-none`}
          style={{ height: '0%' }}
        />
        {/* Unity tick (only when min=0 / max=1 / default 1 is visible; cosmetic) */}
        {min === 0 && max === 1 && (
          <div className="absolute left-0 right-0 h-px bg-text-muted/30 pointer-events-none" style={{ top: `${thumbH / 2}px` }} />
        )}
        {/* Thumb */}
        <div
          ref={thumbRef}
          className="absolute left-0 right-0 rounded-sm bg-text-primary border border-dark-border pointer-events-none shadow-sm"
          style={{ height: `${thumbH}px`, transform: 'translateY(0)', willChange: 'transform' }}
        />
      </div>
      {readoutText && (
        <span className="text-[9px] text-text-secondary font-mono leading-none">{readoutText}</span>
      )}
    </div>
  );
});

Fader.displayName = 'Fader';
