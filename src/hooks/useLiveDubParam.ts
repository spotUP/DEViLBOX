/**
 * A dub control that follows what the PERFORMER is doing, not only what the
 * user last set.
 *
 * Dub moves modulate the audio nodes directly. That is deliberate — routing
 * every gesture through the store would put a React render inside an
 * audio-rate path — but it means a slider shows the resting value while the
 * bus is somewhere else entirely. Reported 2026-09-19: "i see no action in the
 * eq and dub bus sliders at all they use to move".
 *
 * `DubBus.announce` publishes those modulations to the same live-value channel
 * the MIDI router uses, so a control can follow a move exactly as it follows a
 * CC. This is the subscribe half.
 *
 * The announced value is transient by nature: a move takes the control
 * somewhere and hands it back. So this returns the announced value while one
 * is arriving and falls back to the stored value once the move has let go —
 * the control ends where the user left it, which is what `settings` still
 * holds.
 */

import { useEffect, useRef, useState } from 'react';
import { subscribeToParamLiveValue } from '@/midi/performance/parameterRouter';

/** How long an announced value stands before the control returns to the store. */
const LIVE_HOLD_MS = 400;

/**
 * @param paramKey    the router's name for the control, e.g. `dub.hpfCutoff`
 * @param storeValue  what the user set — the resting position
 * @param denormalize maps the announced 0..1 to the control's own units;
 *                    omit when the control is already 0..1
 */
export function useLiveDubParam(
  paramKey: string,
  storeValue: number,
  denormalize?: (normalized: number) => number,
): number {
  const [live, setLive] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Read the mapper at announce time so a caller need not memoise it.
  const denormRef = useRef(denormalize);
  denormRef.current = denormalize;

  useEffect(() => {
    const off = subscribeToParamLiveValue(paramKey, (normalized) => {
      const mapped = denormRef.current ? denormRef.current(normalized) : normalized;
      if (!Number.isFinite(mapped)) return;
      setLive(mapped);
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        // Back to the user's value. A move that is still holding keeps
        // announcing, so this only lands once it has actually let go.
        setLive(null);
      }, LIVE_HOLD_MS);
    });
    return () => {
      off();
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [paramKey]);

  return live ?? storeValue;
}
