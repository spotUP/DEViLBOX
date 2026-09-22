import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * A hand on the fader must win.
 *
 * Two faders are driven by values that change WHILE you are dragging them, and
 * the prop-sync effect had no idea a drag was in progress:
 *
 *   - The Dub Deck's MASTER SEND is `value={max(all channel sends)}` and its
 *     `onChange` writes every channel. `setChannelDubSend` is rAF-batched, so
 *     the channels land across different frames, `max()` recomputes to
 *     whichever landed, and the effect yanked the thumb there mid-drag. The
 *     drag then carried on from the moved position and the channels fell out
 *     of step. Reported 2026-09-22 as "some sliders move by themselves up and
 *     down and channel 0+1 falls down", with a burst of
 *     `[ChannelRoutedEffects] Dub channel N activated` as sends crossed zero
 *     over and over.
 *   - FX WET and FEEDBACK read `useLiveDubParam`, which returns the value the
 *     BUS ANNOUNCES while a move modulates it, so dragging either while a move
 *     ran snapped it back on the next announce.
 *
 * Asserted against the source. The behaviour needs a real pointer sequence
 * against a laid-out DOM, and happy-dom performs no layout — `getBoundingClientRect`
 * returns zeroes, so a synthetic drag cannot produce a meaningful value. What
 * CAN be pinned is the invariant: the sync effect consults the drag flag, and
 * the release settles back to the prop.
 */

const SOURCE = readFileSync(
  resolve(__dirname, '../Fader.tsx'),
  'utf-8',
);

/** The body of the `useLayoutEffect` that syncs the prop into internal state. */
function syncEffectBody(): string {
  const at = SOURCE.indexOf('// Sync from prop on mount');
  expect(at, 'prop-sync effect not found — has it been renamed?').toBeGreaterThan(-1);
  const from = SOURCE.indexOf('useLayoutEffect', at);
  return SOURCE.slice(from, SOURCE.indexOf('}, [value]);', from));
}

describe('while the user is dragging', () => {
  it('does not let an external value overwrite the thumb', () => {
    expect(syncEffectBody()).toMatch(/if \(draggingRef\.current\) return;/);
  });

  it('checks the drag flag BEFORE writing internal state', () => {
    const body = syncEffectBody();
    expect(body.indexOf('draggingRef.current'))
      .toBeLessThan(body.indexOf('setInternalValue'));
  });

  it('declares the drag flag before the effect that reads it', () => {
    // It used to be declared beside the pointer handlers, well below.
    expect(SOURCE.indexOf('const draggingRef = useRef(false)'))
      .toBeLessThan(SOURCE.indexOf('// Sync from prop on mount'));
  });
});

describe('when the hand comes off', () => {
  it('settles to the authoritative value rather than where the finger left it', () => {
    const at = SOURCE.indexOf('const onPointerUp');
    const body = SOURCE.slice(at, SOURCE.indexOf('}, [', at));
    expect(body).toMatch(/draggingRef\.current = false/);
    expect(body).toMatch(/setInternalValue\(valueRef\.current\)/);
    expect(body).toMatch(/positionThumbAndFill\(valueRef\.current\)/);
  });

  it('clears the drag flag before settling, or the sync would be skipped', () => {
    const at = SOURCE.indexOf('const onPointerUp');
    const body = SOURCE.slice(at, SOURCE.indexOf('}, [', at));
    expect(body.indexOf('draggingRef.current = false'))
      .toBeLessThan(body.indexOf('setInternalValue'));
  });
});

describe('the master send fader is the case that exposed it', () => {
  const DECK = readFileSync(
    resolve(__dirname, '../../dub/DubDeckStrip.tsx'),
    'utf-8',
  );

  it('still derives its value from the channel sends it writes', () => {
    // Not a defect in itself — but it IS a value that changes under the
    // finger, which is why the guard above has to exist. If this stops being
    // derived, the guard is still right but this test's premise has moved.
    expect(DECK).toMatch(/const masterSendValue = Math\.max\(/);
    expect(DECK).toMatch(/value=\{masterSendValue\}/);
  });
});
