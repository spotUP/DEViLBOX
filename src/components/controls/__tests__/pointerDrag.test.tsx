/**
 * Phase 2 of thoughts/shared/plans/2026-09-22-responsive-mobile.md.
 *
 * The symptom: a knob dragged with a finger behaved differently from the same
 * knob dragged with a mouse, and a knob whose pointer the browser took away
 * (a system gesture, an incoming call) stayed latched at the value the finger
 * last reached. `Knob.tsx` listened for `mousedown` and `touchstart` and then
 * attached window-level `mousemove`/`touchmove`, with nothing listening for
 * `pointercancel`.
 *
 * `Fader.tsx` already had the right shape. These tests pin both onto it:
 * one `pointerdown`, pointer capture so the drag follows the pointer off the
 * element, and `pointercancel` ending the drag like `pointerup` does.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { Knob } from '../Knob';
import { Fader } from '../Fader';

// happy-dom has PointerEvent but not the capture API. Record the calls so the
// test can assert capture was REQUESTED — the behaviour that makes a drag
// survive leaving the control's bounds on a real browser.
const captured: number[] = [];
const released: number[] = [];

beforeEach(() => {
  cleanup();
  captured.length = 0;
  released.length = 0;
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
    configurable: true,
    value(pointerId: number) { captured.push(pointerId); },
  });
  Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
    configurable: true,
    value(pointerId: number) { released.push(pointerId); },
  });
});

/** The element that carries the drag handlers. */
const dragSurface = (container: HTMLElement): HTMLElement => {
  const el = container.querySelector('.knob-body') ?? container.querySelector('.cursor-ns-resize');
  if (!el) throw new Error('no drag surface found');
  return el as HTMLElement;
};

const pointer = (extra: Record<string, number> = {}) => ({
  pointerId: 1,
  pointerType: 'touch',
  button: 0,
  buttons: 1,
  ...extra,
  // happy-dom's PointerEvent ignores unknown init keys; React reads these off
  // the native event, so they must be present.
});

describe('Knob drags from one pointer path', () => {
  it('a touch drag changes the value — the same path a mouse drag takes', () => {
    const onChange = vi.fn();
    const { container } = render(
      <Knob label="Cutoff" value={50} min={0} max={100} onChange={onChange} />
    );
    const surface = dragSurface(container);

    fireEvent.pointerDown(surface, pointer({ clientX: 0, clientY: 200 }));
    // 150px of travel is the full range (`sensitivity` in Knob.tsx); 75px up
    // is half of it, so 50 -> 100.
    fireEvent.pointerMove(surface, pointer({ clientX: 0, clientY: 125 }));
    fireEvent.pointerUp(surface, pointer({ clientX: 0, clientY: 125 }));

    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls.at(-1)?.[0]).toBeCloseTo(100, 1);
  });

  it('requests pointer capture, so the drag survives leaving the knob', () => {
    const { container } = render(
      <Knob label="Cutoff" value={50} min={0} max={100} onChange={() => {}} />
    );
    fireEvent.pointerDown(dragSurface(container), pointer({ clientX: 0, clientY: 200 }));
    expect(captured).toEqual([1]);
  });

  it('pointercancel ends the drag — a stolen pointer does not leave the knob latched', () => {
    const onChange = vi.fn();
    const { container } = render(
      <Knob label="Cutoff" value={50} min={0} max={100} onChange={onChange} />
    );
    const surface = dragSurface(container);

    fireEvent.pointerDown(surface, pointer({ clientX: 0, clientY: 200 }));
    fireEvent.pointerMove(surface, pointer({ clientX: 0, clientY: 150 }));
    fireEvent.pointerCancel(surface, pointer({ clientX: 0, clientY: 150 }));

    const callsAtCancel = onChange.mock.calls.length;
    // The drag must have been live in the first place, or "nothing happens
    // after the cancel" is true for the wrong reason.
    expect(callsAtCancel).toBeGreaterThan(0);
    // Anything after the cancel would be the drag still running.
    fireEvent.pointerMove(surface, pointer({ clientX: 0, clientY: 50 }));
    expect(onChange.mock.calls.length).toBe(callsAtCancel);
  });

  it('ignores a second finger while one is already dragging', () => {
    const onChange = vi.fn();
    const { container } = render(
      <Knob label="Cutoff" value={50} min={0} max={100} onChange={onChange} />
    );
    const surface = dragSurface(container);

    fireEvent.pointerDown(surface, pointer({ clientX: 0, clientY: 200 }));
    fireEvent.pointerDown(surface, { ...pointer({ clientX: 0, clientY: 10 }), pointerId: 2 });
    // The second finger must not re-anchor the drag; a move on the FIRST
    // pointer still measures from the first anchor.
    fireEvent.pointerMove(surface, pointer({ clientX: 0, clientY: 125 }));
    fireEvent.pointerUp(surface, pointer({ clientX: 0, clientY: 125 }));

    expect(onChange.mock.calls.at(-1)?.[0]).toBeCloseTo(100, 1);
  });

  it('a lost pointer capture ends the drag, so the knob is not dead afterwards', () => {
    const onChange = vi.fn();
    const { container } = render(
      <Knob label="Cutoff" value={50} min={0} max={100} onChange={onChange} />
    );
    const surface = dragSurface(container);

    // A drag whose pointer the browser takes away: capture is lost and NO
    // pointerup ever arrives. "the sliders stopped working after some pulls"
    // (2026-09-22) — the one-pointer-at-a-time guard latched forever, and the
    // drag anchor stayed at the old y, so the next touch jumped the value.
    fireEvent.pointerDown(surface, pointer({ clientX: 0, clientY: 200 }));
    fireEvent.lostPointerCapture(surface, pointer({ clientX: 0, clientY: 200 }));

    // Press somewhere else and release without moving. A knob that accepted
    // the new press measures from it and reports nothing. A latched knob
    // still measures from y=200 and reports a 100px jump. The value is
    // written on release (the drag batches through rAF and pointer-up
    // flushes it), so the release is what makes this observable at all.
    onChange.mockClear();
    fireEvent.pointerDown(surface, pointer({ clientX: 0, clientY: 100 }));
    fireEvent.pointerMove(surface, pointer({ clientX: 0, clientY: 100 }));
    fireEvent.pointerUp(surface, pointer({ clientX: 0, clientY: 100 }));

    expect(
      onChange.mock.calls,
      'the knob kept the anchor from the abandoned drag — the new press was ' +
        'ignored and the value jumped by the distance between the two presses'
    ).toEqual([]);

    // And it still works.
    fireEvent.pointerDown(surface, pointer({ clientX: 0, clientY: 200 }));
    fireEvent.pointerMove(surface, pointer({ clientX: 0, clientY: 125 }));
    fireEvent.pointerUp(surface, pointer({ clientX: 0, clientY: 125 }));
    expect(onChange.mock.calls.at(-1)?.[0]).toBeCloseTo(100, 1);
  });

  it('does not let the page scroll under the drag', () => {
    const { container } = render(
      <Knob label="Cutoff" value={50} min={0} max={100} onChange={() => {}} />
    );
    expect(dragSurface(container).style.touchAction).toBe('none');
  });
});

describe('Fader keeps the shape Knob was brought onto', () => {
  it('a touch drag changes the value and capture is requested', () => {
    const onChange = vi.fn();
    const { container } = render(
      <Fader value={0} min={0} max={100} onChange={onChange} />
    );
    const surface = dragSurface(container);
    fireEvent.pointerDown(surface, pointer({ clientX: 0, clientY: 10 }));
    expect(captured).toEqual([1]);
    // The value moves with the hand, not on the press (see below).
    fireEvent.pointerMove(surface, pointer({ clientX: 0, clientY: 5 }));
    expect(onChange).toHaveBeenCalled();
  });
});

describe('a grab starts from where the control is', () => {
  it('a fader does not jump to the click point when grabbed', () => {
    // Jump-to-cursor made every grab start wherever the pointer landed:
    // "always starts from zero when i pull it up" (owner, 2026-10-02).
    const onChange = vi.fn();
    const { container } = render(
      <Fader label="Sweep" value={0.4} min={0} max={1} onChange={onChange} />
    );
    fireEvent.pointerDown(dragSurface(container), pointer({ clientX: 0, clientY: 500 }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a knob showing a live value drags from that value, not the stored one', () => {
    // Liquid holds Sweep Amount at 0.7 while the store keeps 0; the knob
    // draws 0.7 and used to start the drag from 0.
    const onChange = vi.fn();
    const { container } = render(
      <Knob label="Sweep" value={0} displayValue={0.7} min={0} max={1} onChange={onChange} />
    );
    const surface = dragSurface(container);
    fireEvent.pointerDown(surface, pointer({ clientX: 0, clientY: 200 }));
    fireEvent.pointerMove(surface, pointer({ clientX: 0, clientY: 185 })); // 15px of 150 = +0.1
    fireEvent.pointerUp(surface, pointer({ clientX: 0, clientY: 185 }));
    expect(onChange.mock.calls.at(-1)?.[0]).toBeCloseTo(0.8, 2);
  });
});

describe('faderDragValue', () => {
  it('moves from the start value by the share of the track travelled, clamped', async () => {
    const { faderDragValue } = await import('../faderDrag');
    expect(faderDragValue(0.4, 50, 100, 0, 1)).toBeCloseTo(0.9);
    expect(faderDragValue(0.4, -50, 100, 0, 1)).toBeCloseTo(0);
    expect(faderDragValue(3, 0, 100, -12, 12)).toBe(3);
  });
});
