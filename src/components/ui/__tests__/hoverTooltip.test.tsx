/**
 * The tooltip that replaced the Dub Deck's reserved status line.
 *
 * The line was rendered even when empty so that filling it would not jog the
 * buttons under the pointer — a permanent row of vertical space to describe
 * one button occasionally. Removing it is only safe if the tooltip really
 * takes no layout and really appears where it can be read, which is what
 * these drive.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useHoverTooltip } from '../HoverTooltip';

function Harness({ label = 'Slam — spring slam' }: { label?: string }) {
  const { hoverProps, tooltip, hide } = useHoverTooltip();
  return (
    <div>
      <button {...hoverProps(label)}>Slam</button>
      <button onClick={hide}>panic</button>
      {tooltip}
    </div>
  );
}

/** jsdom gives every element a zero rect; place the anchor explicitly. */
function anchorAt(el: Element, rect: Partial<DOMRect>) {
  el.getBoundingClientRect = () => ({
    left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0,
    toJSON: () => ({}), ...rect,
  } as DOMRect);
}

afterEach(cleanup);

describe('useHoverTooltip', () => {
  it('shows nothing until something is hovered', () => {
    render(<Harness />);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('shows the label on hover and takes it away on leave', () => {
    render(<Harness />);
    const button = screen.getByText('Slam');
    fireEvent.mouseEnter(button);
    expect(screen.getByRole('tooltip').textContent).toBe('Slam — spring slam');
    fireEvent.mouseLeave(button);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('renders outside the hovered subtree, so a clipping ancestor cannot cut it off', () => {
    const { container } = render(<Harness />);
    fireEvent.mouseEnter(screen.getByText('Slam'));
    const tip = screen.getByRole('tooltip');
    expect(container.contains(tip)).toBe(false);
    expect(document.body.contains(tip)).toBe(true);
  });

  it('costs no layout: fixed position, and never a target for the pointer', () => {
    render(<Harness />);
    fireEvent.mouseEnter(screen.getByText('Slam'));
    const tip = screen.getByRole('tooltip');
    expect(tip.className).toContain('fixed');
    expect(tip.className).toContain('pointer-events-none');
  });

  it('sits above the control, centred on it', () => {
    render(<Harness />);
    const button = screen.getByText('Slam');
    anchorAt(button, { left: 100, right: 200, width: 100, top: 300, bottom: 320 });
    fireEvent.mouseEnter(button);
    const tip = screen.getByRole('tooltip') as HTMLElement;
    expect(tip.style.left).toBe('150px');       // centre of the button
    expect(tip.style.top).toBe('292px');        // 8px clear of its top edge
    expect(tip.style.transform).toContain('-100%');
  });

  it('flips below when there is no room above', () => {
    render(<Harness />);
    const button = screen.getByText('Slam');
    anchorAt(button, { left: 0, right: 40, width: 40, top: 2, bottom: 22 });
    fireEvent.mouseEnter(button);
    const tip = screen.getByRole('tooltip') as HTMLElement;
    expect(tip.style.top).toBe('30px');         // under the button instead
    expect(tip.style.transform).toContain('translate(-50%, 0)');
  });

  it('gives the control its accessible name from the same string', () => {
    // One source for what the tooltip says and what a screen reader is told,
    // so the two cannot drift.
    render(<Harness />);
    expect(screen.getByLabelText('Slam — spring slam')).toBeTruthy();
  });

  it('goes away on a press, a scroll or a key', () => {
    for (const fire of [
      () => fireEvent.pointerDown(document.body),
      () => fireEvent.scroll(document.body),
      () => fireEvent.keyDown(document.body, { key: 'Escape' }),
    ]) {
      render(<Harness />);
      fireEvent.mouseEnter(screen.getByText('Slam'));
      expect(screen.queryByRole('tooltip')).not.toBeNull();
      fire();
      expect(screen.queryByRole('tooltip')).toBeNull();
      cleanup();
    }
  });

  it('can be dismissed by the caller', () => {
    render(<Harness />);
    fireEvent.mouseEnter(screen.getByText('Slam'));
    fireEvent.click(screen.getByText('panic'));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
