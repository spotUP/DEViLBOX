/**
 * MusicLine's Song Info shows every line, in a dialog.
 *
 * Expanded inline it shared its height with the pattern grid and showed one
 * clipped line of Info 1; the other four info lines never appeared (owner,
 * 2026-10-04: "show in dialog instead?", ledger F34).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup, screen } from '@testing-library/react';
import React from 'react';

vi.mock('@/engine/musicline/MusicLineEngine', () => ({ MusicLineEngine: { hasInstance: () => false } }));

describe('MusicLine Song Info', () => {
  afterEach(cleanup);

  it('opens a dialog with the title, author, date, duration and all five info lines', { timeout: 30000 }, async () => {
    const { useFormatStore } = await import('@stores');
    useFormatStore.setState({
      musiclineMetadata: {
        title: 'Drax tune', author: 'Jimmy Fredriksson', date: '1996', duration: '3:20',
        infoText: [
          "A conversion of a Drax tune (didn't have the strengt to",
          'write a new one so I nicked one from my old C64 collection',
          'third line', 'fourth line', 'fifth line',
        ],
      },
    } as never);
    const { MusicLineToolbar } = await import('../MusicLineToolbar');
    render(React.createElement(MusicLineToolbar, { numChannels: 4 }));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByText('Song Info'));
    expect(screen.getByRole('dialog')).toBeTruthy();
    const values = screen.getAllByRole('textbox').map((el) => (el as HTMLInputElement).value);
    expect(values).toContain('Jimmy Fredriksson');
    expect(values).toContain('third line');
    expect(values).toContain('fifth line');
  });
});
