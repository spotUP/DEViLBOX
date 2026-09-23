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
 * @param held        a hand is on the control. While true the announced value
 *                    is ignored and the store value shown: the control is a
 *                    controlled input, so an announce landing mid-drag
 *                    overwrote the drag and the thumb snapped back — "the
 *                    intensity and feedback sliders are broken" (2026-09-22,
 *                    FX WET and FEEDBACK while AutoDub performed). The hand
 *                    wins; the move's motion is shown again on release.
 */
export function useLiveDubParam(
  paramKey: string,
  storeValue: number,
  denormalize?: (normalized: number) => number,
  held = false,
): number {
  const [live, setLive] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Read the mapper and the hold at announce time so a caller need not
  // memoise either. Written in an effect, never during render.
  const denormRef = useRef(denormalize);
  const heldRef = useRef(held);
  useEffect(() => {
    denormRef.current = denormalize;
    heldRef.current = held;
  });

  // Taking hold drops whatever the move had announced, so releasing does not
  // resurrect a stale value under the hand's new position. React's
  // "adjust state from the previous render" form: a render, not an effect.
  const [prevHeld, setPrevHeld] = useState(held);
  if (held !== prevHeld) {
    setPrevHeld(held);
    if (held) setLive(null);
  }

  useEffect(() => {
    const off = subscribeToParamLiveValue(paramKey, (normalized) => {
      if (heldRef.current) return;
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

  return held ? storeValue : (live ?? storeValue);
}
