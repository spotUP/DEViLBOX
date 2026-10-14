import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React, { useRef } from 'react';
import { AnchoredPopover } from '../AnchoredPopover';

function Harness({ open, onClose }: { open: boolean; onClose: () => void }): React.ReactElement {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={ref}>anchor</button>
      <AnchoredPopover open={open} onClose={onClose} anchorRef={ref}>
        <span>panel body</span>
      </AnchoredPopover>
    </>
  );
}

describe('AnchoredPopover', () => {
  afterEach(cleanup);

  it('renders its content in a portal on document.body only while open', () => {
    const { rerender } = render(<Harness open={false} onClose={() => undefined} />);
    expect(screen.queryByText('panel body')).toBeNull();
    rerender(<Harness open onClose={() => undefined} />);
    const body = screen.getByText('panel body');
    expect(body.closest('[data-anchored-popover]')?.parentElement).toBe(document.body);
  });

  it('closes on a click outside the panel (the backdrop)', () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);
    fireEvent.click(document.querySelector('[data-popover-backdrop]') as Element);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape, and a click inside the panel does not close it', () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);
    fireEvent.click(screen.getByText('panel body'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
