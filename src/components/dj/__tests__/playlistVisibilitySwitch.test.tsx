/**
 * A published playlist (one with a cloudId) must offer a visible Private / Public switch so the owner can
 * change it after publishing. The switch shows the current value and reports the chosen one.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { PlaylistVisibilitySwitch } from '../PlaylistVisibilitySwitch';

afterEach(cleanup);

describe('playlist visibility switch', () => {
  it('lets a published public playlist be made private, and a private one public', () => {
    const onChange = vi.fn();
    const { rerender } = render(<PlaylistVisibilitySwitch value="public" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Private/ }));
    expect(onChange).toHaveBeenLastCalledWith('private');

    rerender(<PlaylistVisibilitySwitch value="private" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Public/ }));
    expect(onChange).toHaveBeenLastCalledWith('public');
  });

  it('does nothing while disabled', () => {
    const onChange = vi.fn();
    render(<PlaylistVisibilitySwitch value="public" onChange={onChange} disabled />);
    fireEvent.click(screen.getByRole('button', { name: /Private/ }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
