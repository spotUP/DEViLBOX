import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { Fader } from '../Fader';

/**
 * "can we make our slider cleaner by removing the heads and jus keep the
 * track so i pull the track?" (owner, 2026-10-20).
 *
 * The fader used to draw a thumb inside the track and subtract its height from
 * the travel, so a drag across the whole track covered the range minus one
 * thumb. Now the fill is the value and the whole track is the handle: the
 * track holds only the fill, and a drag the length of the track covers the
 * full range.
 *
 * happy-dom performs no layout, so the track's box is mocked to 100 px.
 */
const TRACK_PX = 100;

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', { configurable: true, value() {} });
  Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', { configurable: true, value() {} });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, top: 0, left: 0, right: TRACK_PX, bottom: TRACK_PX,
    width: TRACK_PX, height: TRACK_PX, toJSON: () => ({}),
  } as DOMRect);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const pointer = (clientY: number, clientX = 0) => ({
  pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1, clientX, clientY,
});

describe('the fader has no thumb: the track is the handle', () => {
  it('the track holds only the fill', () => {
    const { container } = render(<Fader value={0.5} onChange={() => {}} />);
    const track = container.querySelector('.cursor-ns-resize') as HTMLElement;
    expect(track.children.length).toBe(1);
  });

  it('the fill height is the value', () => {
    const { container } = render(<Fader value={0.25} onChange={() => {}} />);
    const fill = container.querySelector('.cursor-ns-resize')!.firstElementChild as HTMLElement;
    expect(fill.style.height).toBe('25%');
  });

  it('a drag the length of the track covers the full range', () => {
    const onChange = vi.fn();
    const { container } = render(<Fader value={0} onChange={onChange} />);
    const track = container.querySelector('.cursor-ns-resize') as HTMLElement;
    fireEvent.pointerDown(track, pointer(TRACK_PX));
    fireEvent.pointerMove(track, pointer(TRACK_PX / 2));
    expect(onChange).toHaveBeenLastCalledWith(0.5);
    fireEvent.pointerMove(track, pointer(0));
    expect(onChange).toHaveBeenLastCalledWith(1);
    fireEvent.pointerUp(track, pointer(0));
  });

  it('a horizontal drag the length of the track covers the full range', () => {
    const onChange = vi.fn();
    const { container } = render(<Fader value={0} onChange={onChange} orientation="horizontal" length={TRACK_PX} />);
    const track = container.querySelector('.cursor-ew-resize') as HTMLElement;
    expect(track.children.length).toBe(1);
    fireEvent.pointerDown(track, pointer(0, 0));
    fireEvent.pointerMove(track, pointer(0, TRACK_PX / 2));
    expect(onChange).toHaveBeenLastCalledWith(0.5);
  });
});
