/**
 * A dropdown builds its items when it opens, not on every render.
 *
 * Every channel header carries a ChannelContextMenu whose item tree is a few
 * hundred entries. Built on each render, the seven menus of a playing song took
 * about a quarter of the main thread (2026-09-28 trace), all for menus that
 * were closed.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { DropdownButton } from '../ContextMenu';

afterEach(cleanup);

describe('DropdownButton with an item builder', () => {
  it('calls the builder only once the menu is opened', () => {
    const build = vi.fn(() => [{ id: 'a', label: 'Alpha', onClick: () => {} }]);
    const { getByRole, rerender, getByText } = render(<DropdownButton items={build}>open</DropdownButton>);
    rerender(<DropdownButton items={build}>open</DropdownButton>);
    rerender(<DropdownButton items={build}>open</DropdownButton>);
    expect(build).not.toHaveBeenCalled();

    fireEvent.click(getByRole('button'));
    expect(build).toHaveBeenCalled();
    expect(getByText('Alpha')).toBeTruthy();
  });
});
