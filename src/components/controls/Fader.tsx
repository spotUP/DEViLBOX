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
import type { ControlTone } from '@components/ui/controlColor';
import { subscribeToParamLiveValue } from '@/midi/performance/parameterRouter';
import { faderDragValue } from './faderDrag';

interface FaderProps {
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;

  /** Overall size — default 'md' is 16px wide × 80px tall */
  size?: 'sm' | 'md' | 'lg';

  /**
   * Stretch to the height of whatever contains it instead of the fixed height
   * for `size`. The width still comes from `size`.
   *
   * The drag maths then has to measure the track rather than trust the size
   * table, or the fader would move at the wrong rate the moment its height
   * stopped matching the constant.
   */
  fillHeight?: boolean;

  /** Token for the filled-track color (design tokens only). */
  color?: 'accent-primary' | 'accent-secondary' | 'accent-success' | 'accent-warning' | 'accent-error' | 'accent-highlight';
  /**
   * The same colour vocabulary the other controls take.
   *
   * `Fader` already took token names rather than hex, so it was never the
   * problem `Knob` was — but a caller should not have to remember that one
   * control spells it `accent-primary` and its neighbours spell it `primary`.
   * `tone` wins when both are given.
   */
  tone?: ControlTone;

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

/** The shared tone names, onto this component's own fill tokens. */
const TONE_TO_FILL: Record<ControlTone, NonNullable<FaderProps['color']>> = {
  primary: 'accent-primary',
  secondary: 'accent-secondary',
  highlight: 'accent-highlight',
  warning: 'accent-warning',
  error: 'accent-error',
  success: 'accent-success',
  neutral: 'accent-primary',
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
  size = 'md', color, tone, fillHeight = false,
  label, title, disabled = false,
  formatValue,
  paramKey, imperativeSubscribe,
  doubleClickValue,
}) => {
  const { w, h, thumbH } = SIZE_PX[size];
  /** `tone` maps onto the existing token names; neither given means primary. */
  const fillToken = tone ? TONE_TO_FILL[tone] : (color ?? 'accent-primary');

  /** Track height in px, live — `h` is only the fallback before first layout. */
  const trackHeight = useCallback(
    () => trackRef.current?.getBoundingClientRect().height || h,
    [h],
  );
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

  // Drag handling — pointer capture, vertical delta → value, clamp.
  // Declared here rather than beside the pointer handlers because the sync
  // effect below has to consult it.
  const draggingRef = useRef(false);
  /** Latest `value` prop, so the release handler can settle to it. */
  const valueRef = useRef(value);
  valueRef.current = value;

  // Sync from prop on mount + on external value change.
  //
  // A HAND ON THE CONTROL WINS. The comment used to say "(non-drag)" but
  // nothing enforced it, and two faders are driven by values that change while
  // you are dragging them:
  //
  //   - The Dub Deck's MASTER SEND is `value={max(all channel sends)}` and its
  //     `onChange` writes every channel. `setChannelDubSend` is rAF-batched, so
  //     the channels land across different frames, `max()` recomputes to
  //     whatever landed first, and this effect yanked the thumb there
  //     mid-drag. The drag then continued from the moved position and the
  //     channels fell out of step. Reported 2026-09-22: "some sliders move by
  //     themselves up and down and channel 0+1 falls down", with a burst of
  //     `Dub channel N activated` lines as sends crossed zero repeatedly.
  //   - FX WET and FEEDBACK read `useLiveDubParam`, which returns the value the
  //     BUS ANNOUNCES while a move modulates it. Dragging those while a move
  //     was running snapped them back on the next announce.
  //
  // Showing an external change is right — you want to SEE a move move the
  // control. Doing it under the user's finger is not. `draggingRef` already
  // existed for the pointer handlers; this is the one place that needed to
  // consult it.
  useLayoutEffect(() => {
    if (draggingRef.current) return;
    setInternalValue(value);
    positionThumbAndFill(value);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const positionThumbAndFill = useCallback((v: number) => {
    const thumb = thumbRef.current;
    const fill = fillRef.current;
    if (!thumb || !fill) return;
    const norm = Math.max(0, Math.min(1, (v - min) / (max - min)));
    const availPx = Math.max(1, trackHeight() - thumbH);
    const thumbTop = (1 - norm) * availPx;
    thumb.style.transform = `translateY(${thumbTop}px)`;
    fill.style.height = `${norm * 100}%`;
  }, [trackHeight, thumbH, min, max]);

  // A stretched fader changes height with its container, and the thumb is
  // positioned in px against that height. Without this it stays where the
  // pre-layout fallback put it until the next drag.
  useEffect(() => {
    if (!fillHeight) return;
    const track = trackRef.current;
    if (!track || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => positionThumbAndFill(internalRef.current));
    ro.observe(track);
    return () => ro.disconnect();
  }, [fillHeight, positionThumbAndFill]);

  const dragStartYRef = useRef(0);
  const dragStartValueRef = useRef(0);

  /** The value after dragging from `startY` to `clientY`: a full track's travel is the full range. */
  const valueFromDrag = useCallback((startValue: number, startY: number, clientY: number): number => {
    const track = trackRef.current;
    if (!track) return startValue;
    const availPx = Math.max(1, track.getBoundingClientRect().height - thumbH);
    return faderDragValue(startValue, startY - clientY, availPx, min, max);
  }, [thumbH, min, max]);

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
    // No jump-to-cursor: the value moves from where it IS by how far the hand
    // moves. Jumping to the click point made every grab start from wherever
    // the pointer landed - "always starts from zero when i pull it up"
    // (owner, 2026-10-02).
  }, [disabled]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    e.preventDefault();
    commit(valueFromDrag(dragStartValueRef.current, dragStartYRef.current, e.clientY));
  }, [commit, valueFromDrag]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ok */ }
    // The hand is off, so the authoritative value wins again. Without this the
    // fader would keep showing where the finger left it until the prop next
    // changed — and for a derived value like the Dub Deck's master send
    // (`max` of every channel), where the finger left it is frequently not
    // where the state ended up.
    setInternalValue(valueRef.current);
    positionThumbAndFill(valueRef.current);
  }, [positionThumbAndFill]);

  const onDoubleClick = useCallback(() => {
    if (disabled) return;
    commit(doubleClickValue ?? max);
  }, [disabled, commit, doubleClickValue, max]);

  const readoutText = formatValue ? formatValue(internalValue) : undefined;

  return (
    // Width comes from `size` and nothing else. Without an explicit width the
    // column was sized by its widest CHILD, which is the readout — so the
    // fader changed width under the hand as the value gained a digit or a
    // minus sign ("something resizes the channel and master sliders
    // horizontally when i drag them", 2026-09-22). The label and the readout
    // are allowed to overflow this box; they must never set it.
    <div
      className={'flex flex-col items-center gap-0.5 select-none' + (disabled ? ' opacity-40' : '')}
      style={{ width: `${w}px` }}
      title={title}
    >
      {label && (
        <span className="text-[9px] text-text-muted font-mono leading-none whitespace-nowrap">
          {label}
        </span>
      )}
      <div
        ref={trackRef}
        className={
          'relative rounded-sm bg-dark-bgTertiary border border-dark-border cursor-ns-resize' +
          (disabled ? ' cursor-not-allowed' : ' hover:border-dark-borderLight')
        }
        style={{ width: `${w}px`, height: fillHeight ? '100%' : `${h}px`, touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
      >
        {/* Fill — grows upward from the bottom of the track */}
        <div
          ref={fillRef}
          className={`absolute bottom-0 left-0 right-0 ${COLOR_FILL[fillToken]} transition-none pointer-events-none`}
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
        // `tabular-nums` so the digits keep one width as the value changes,
        // and `whitespace-nowrap` so a long value overflows instead of
        // wrapping and making the column taller mid-drag.
        <span className="text-[9px] text-text-secondary font-mono leading-none whitespace-nowrap tabular-nums">
          {readoutText}
        </span>
      )}
    </div>
  );
});

Fader.displayName = 'Fader';
