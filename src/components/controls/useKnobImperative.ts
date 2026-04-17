/**
 * useKnobImperative — shared MIDI fast-path hook for any custom knob component.
 *
 * Any component that renders a rotary-knob visual (hardware replicas like
 * TR-808, V2, D-50, etc.) can call this hook to get:
 *   - Subscription to live MIDI param values via paramKey
 *   - Imperative DOM updates (no React re-render) on each CC
 *
 * Returns a ref to attach to the rotating element. When MIDI CCs arrive,
 * the ref's element.style.transform is updated directly.
 *
 * Usage:
 *   const indicatorRef = useKnobImperative({ paramKey: 'cutoff' });
 *   return <div ref={indicatorRef} style={{ transform: `rotate(${angle}deg)` }} />;
 */
import { useEffect, useRef } from 'react';
import { subscribeToParamLiveValue } from '@/midi/performance/parameterRouter';

export interface UseKnobImperativeOptions {
  /** Param key registered with PARAMETER_ROUTES (e.g. 'cutoff', 'v2.envAttack'). */
  paramKey?: string;
  /** Maps a normalized 0-1 value to a rotation angle in degrees. Defaults to
   *  the standard -135° → +135° sweep used across DEViLBOX knobs. */
  toRotation?: (norm01: number) => number;
  /** If the visual uses `transform-origin` other than center, override here. */
  transformOrigin?: string;
}

/** Attach the returned ref to the rotating SVG/DOM element; rotation updates
 *  imperatively on each live-value tick when `paramKey` is bound. */
export function useKnobImperative<T extends HTMLElement | SVGElement>(
  options: UseKnobImperativeOptions,
) {
  const ref = useRef<T>(null);
  const { paramKey, toRotation, transformOrigin } = options;

  useEffect(() => {
    if (!paramKey) return;
    const convert = toRotation ?? ((n: number) => n * 270 - 135);
    const update = (norm: number) => {
      const el = ref.current;
      if (!el) return;
      const safe = Math.max(0, Math.min(1, isNaN(norm) ? 0 : norm));
      if (transformOrigin) (el.style as CSSStyleDeclaration).transformOrigin = transformOrigin;
      // Replace any existing rotate() while preserving translate/scale — the
      // hardware knob's initial render may compose both (e.g. translateX(-50%)).
      const deg = convert(safe);
      const current = (el.style as CSSStyleDeclaration).transform || '';
      const stripped = current.replace(/\s*rotate\([^)]*\)\s*/g, ' ').trim();
      (el.style as CSSStyleDeclaration).transform = stripped
        ? `${stripped} rotate(${deg}deg)`
        : `rotate(${deg}deg)`;
    };
    return subscribeToParamLiveValue(paramKey, update);
  }, [paramKey, toRotation, transformOrigin]);

  return ref;
}
