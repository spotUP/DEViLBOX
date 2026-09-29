/**
 * An encoder whose press is a HELD move turns like every other knob.
 *
 * Owner, 2026-09-30: "the echo wet knob seems broken ... i get stuck with an
 * arrow up/down mouse pointer when i try to pull it", "the sidechain knob is
 * the same". Those are the two encoders whose press is a hold (Osc Bass,
 * Crush Bass). Their wrapper took the hold button's props, which capture the
 * pointer on the grab, so the knob lost its drag and every grab started the
 * drone. The press now engages only when held still, never captures, and a
 * turn fires nothing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { encoderHoldGesture, type EncoderHold } from '../ControllerShapedDeck';

const at = (x: number, y: number) => ({ clientX: x, clientY: y });

describe('encoder held press', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  const setup = (busEnabled = true) => {
    const api = { holdStart: vi.fn(), holdEnd: vi.fn() };
    const ref: { current: EncoderHold | null } = { current: null };
    return { api, g: encoderHoldGesture(ref, 'oscBass', api, busEnabled) };
  };

  it('a turn (drag) fires nothing', () => {
    const { api, g } = setup();
    g.onPointerDown(at(100, 100));
    g.onPointerMove(at(100, 90));      // up 10 px within the first frames
    vi.advanceTimersByTime(1000);
    g.onPointerUp();
    expect(api.holdStart).not.toHaveBeenCalled();
    expect(api.holdEnd).not.toHaveBeenCalled();
  });

  it('a press held still starts the move, and release ends it', () => {
    const { api, g } = setup();
    g.onPointerDown(at(100, 100));
    vi.advanceTimersByTime(350);
    expect(api.holdStart).toHaveBeenCalledWith('oscBass');
    g.onPointerMove(at(101, 99));      // a tremor inside the slop does not end it
    expect(api.holdEnd).not.toHaveBeenCalled();
    g.onPointerUp();
    expect(api.holdEnd).toHaveBeenCalledWith('oscBass');
  });

  it('a slow twist that started still ends the drone as soon as it turns (no hum under the turn)', () => {
    // "the echo wet and sidechain produce a humming sound while twisted" (2026-09-30)
    const { api, g } = setup();
    g.onPointerDown(at(100, 100));
    vi.advanceTimersByTime(400);       // still long enough to engage
    expect(api.holdStart).toHaveBeenCalledTimes(1);
    g.onPointerMove(at(100, 90));      // the twist begins
    expect(api.holdEnd).toHaveBeenCalledWith('oscBass');
    g.onPointerMove(at(100, 60));
    g.onPointerUp();
    expect(api.holdEnd).toHaveBeenCalledTimes(1);
  });

  it('a quick click fires nothing held', () => {
    const { api, g } = setup();
    g.onPointerDown(at(100, 100));
    vi.advanceTimersByTime(50);
    g.onPointerUp();
    vi.advanceTimersByTime(500);
    expect(api.holdStart).not.toHaveBeenCalled();
  });

  it('nothing fires while the bus is off', () => {
    const { api, g } = setup(false);
    g.onPointerDown(at(1, 1));
    vi.advanceTimersByTime(500);
    expect(api.holdStart).not.toHaveBeenCalled();
  });

  it('the encoder no longer spreads the capturing hold-button props', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/dub/ControllerShapedDeck.tsx'), 'utf8');
    expect(src).not.toContain('api.holdButtonProps(move.moveId)');
    expect(src).not.toContain('setPointerCapture');
  });
});
