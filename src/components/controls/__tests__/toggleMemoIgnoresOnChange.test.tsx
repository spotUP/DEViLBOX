import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { Toggle } from '../Toggle';

/**
 * `Toggle` is `React.memo`'d with a hand-written comparator that checks
 * value, label, disabled, color and size — and NOT `onChange`.
 *
 * So a switch keeps the first handler it is ever given. Any caller whose
 * handler is a `useCallback` with dependencies hands over a NEW function on
 * every change and the switch never sees it: it keeps calling the original,
 * closed over whatever state existed at mount.
 *
 * That is what made the jukebox's fault switches look dead — their handler
 * closed over the selected row, the panel mounts with nothing selected, and
 * every click returned at the first line (2026-09-24). The fix is a stable
 * handler reading through a ref, per docs/CONTROL_PATTERNS.md.
 *
 * This test PINS the behaviour rather than asserting it is right, because
 * ~1800 call sites depend on the comparator as written. Read it as: if you
 * pass a changing handler, it will be ignored.
 */
describe('Toggle keeps the handler it was first given', () => {
  it('ignores a new onChange when nothing else changed', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender, container } = render(
      <Toggle label="Silent" value={false} onChange={first} />,
    );

    rerender(<Toggle label="Silent" value={false} onChange={second} />);
    fireEvent.click(container.querySelector('.toggle-switch')!);

    expect(second, 'the new handler is NOT adopted').not.toHaveBeenCalled();
    expect(first, 'the original handler is what runs').toHaveBeenCalledWith(true);
  });

  it('does adopt a new handler once a compared prop changes', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender, container } = render(
      <Toggle label="Silent" value={false} onChange={first} />,
    );

    // `value` is compared, so this re-render gets through with the new handler.
    rerender(<Toggle label="Silent" value onChange={second} />);
    fireEvent.click(container.querySelector('.toggle-switch')!);

    expect(second).toHaveBeenCalledWith(false);
  });

  it('does not fire at all while disabled', () => {
    const onChange = vi.fn();
    const { container } = render(
      <Toggle label="Silent" value={false} onChange={onChange} disabled />,
    );
    fireEvent.click(container.querySelector('.toggle-switch')!);
    expect(onChange).not.toHaveBeenCalled();
  });
});
