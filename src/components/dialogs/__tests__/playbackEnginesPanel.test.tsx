/** NS-9: the Settings tab "Playback Engines" lists every row of the nuade table, and is a tab of the settings dialog. */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PlaybackEnginesPanel } from '../PlaybackEnginesPanel';
import { NUADE_FORMAT_LIST } from '@/engine/nuade/nuadeFormats';
import { SETTINGS_TABS } from '@hooks/dialogs/useSettingsDialog';

vi.mock('@/lib/song/switchFormatEngine', () => ({ switchFormatEngine: async () => ({ switched: true, reopened: false, stored: 'nuade' }) }));
afterEach(cleanup);

describe('NS-9 Playback Engines tab', () => {
  it('is a tab of the settings dialog and lists all 114 rows, filterable by name', () => {
    expect(SETTINGS_TABS.find((t) => t.id === 'engines')?.label).toBe('Playback Engines');
    expect(NUADE_FORMAT_LIST.length).toBe(114);
    const { container, getByLabelText } = render(<PlaybackEnginesPanel />);
    expect(container.querySelectorAll('[data-testid^="engine-row-"]').length).toBe(114);
    fireEvent.change(getByLabelText('Filter formats'), { target: { value: 'hubbard' } });
    const ids = Array.from(container.querySelectorAll('[data-testid^="engine-row-"]')).map((e) => e.getAttribute('data-testid'));
    expect(ids).toEqual(['engine-row-robhubbard', 'engine-row-robhubbardst']);
  });

  it('SettingsModal renders the panel for the engines tab', () => {
    const src = readFileSync(join(__dirname, '../SettingsModal.tsx'), 'utf8');
    expect(src).toContain("s.activeTab === 'engines' && <PlaybackEnginesPanel />");
  });
});
