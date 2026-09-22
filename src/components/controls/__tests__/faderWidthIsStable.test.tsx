import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { Fader } from '../Fader';

/**
 * "something resizes the channel and master sliders horizontally when i drag
 * them" (2026-09-22).
 *
 * The fader is a `flex flex-col` whose width was set by its widest child. The
 * readout under the track is that child, so every time the value gained a
 * digit or a minus sign — 0.0 -> -29.8 — the whole control changed width
 * while the hand was on it, and the faders beside it moved.
 *
 * The track already had an explicit width from `size`. The ROOT did not.
 *
 * happy-dom performs no layout, so this cannot measure a rendered box. It
 * pins the contract that makes the width stable: the root carries the width
 * from the size table, and the readout cannot widen or wrap it.
 */
afterEach(cleanup);

const rootOf = (c: HTMLElement) => c.firstElementChild as HTMLElement;

describe('a fader keeps its width while the value changes', () => {
  it('the root is sized from `size`, not from its content', () => {
    // SIZE_PX in Fader.tsx: sm 14px, md 18px, lg 22px.
    for (const [size, width] of [['sm', '14px'], ['md', '18px'], ['lg', '22px']] as const) {
      const { container } = render(
        <Fader value={0.5} onChange={() => {}} size={size} />
      );
      expect(rootOf(container).style.width, `size="${size}"`).toBe(width);
      cleanup();
    }
  });

  it('the width does not follow the readout text', () => {
    const short = render(
      <Fader value={0} min={-60} max={0} onChange={() => {}} formatValue={() => '0.0'} />
    );
    const shortWidth = rootOf(short.container).style.width;
    cleanup();

    const long = render(
      <Fader value={-29.8} min={-60} max={0} onChange={() => {}}
             formatValue={() => '-29.8 dB'} />
    );
    expect(rootOf(long.container).style.width).toBe(shortWidth);
  });

  it('the readout cannot wrap or set the column width', () => {
    const { container } = render(
      <Fader value={-29.8} min={-60} max={0} onChange={() => {}}
             formatValue={() => '-29.8 dB'} />
    );
    const readout = container.querySelector('span.tabular-nums');
    expect(readout, 'the readout lost its stable-digit class').toBeTruthy();
    expect(readout?.className).toContain('whitespace-nowrap');
  });

  it('a stretched fader still takes its width from `size`', () => {
    // `fillHeight` changes the HEIGHT only — the documented contract.
    const { container } = render(
      <Fader value={0.5} onChange={() => {}} size="lg" fillHeight />
    );
    expect(rootOf(container).style.width).toBe('22px');
  });
});
