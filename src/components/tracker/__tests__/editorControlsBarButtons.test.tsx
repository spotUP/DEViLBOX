/**
 * EDITOR-CONTROLS-RAW-BUTTONS: the Voice, Find and Rec controls render through
 * the design-system Button (its base class carries `focus-visible:ring-accent-primary`
 * and the compact variant class `btn-compact`) and still fire their handlers.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup, screen } from '@testing-library/react';

const handleToggleRecord = vi.fn();

vi.mock('@hooks/views/useEditorControls', () => ({
  useEditorControls: () => ({
    channelCount: 4,
    fps: { quality: 'good', averageFps: 60 },
    grooveActive: false,
    grooveTemplateId: 'none',
    handleHardwarePresetChange: vi.fn(),
    handleShowAutoEditor: vi.fn(),
    handleToggleMute: vi.fn(),
    handleToggleRecord,
    maskDisplay: '',
    masterMuted: false,
    recordMode: false,
    statusMessage: '',
  }),
}));

import { EditorControlsBar } from '../EditorControlsBar';

afterEach(cleanup);

describe('EditorControlsBar uses the design-system Button', () => {
  it('renders Voice, Find and Rec as Buttons and fires their handlers', () => {
    const onToggleVoicePanel = vi.fn();
    const onShowFindReplace = vi.fn();
    render(
      <EditorControlsBar
        viewMode="tracker"
        onViewModeChange={() => {}}
        gridChannelIndex={0}
        onGridChannelChange={() => {}}
        onToggleVoicePanel={onToggleVoicePanel}
        onShowFindReplace={onShowFindReplace}
      />,
    );
    const voice = screen.getByTitle('Record your voice and turn it into notes');
    const find = screen.getByTitle('Find & replace (Ctrl+F)');
    const rec = screen.getByTitle('Toggle Recording Mode (Space)');
    for (const el of [voice, find, rec]) {
      expect(el.className).toContain('btn-compact');
      expect(el.className).toContain('focus-visible:ring-accent-primary');
    }
    fireEvent.click(voice);
    fireEvent.click(find);
    fireEvent.click(rec);
    expect(onToggleVoicePanel).toHaveBeenCalledTimes(1);
    expect(onShowFindReplace).toHaveBeenCalledTimes(1);
    expect(handleToggleRecord).toHaveBeenCalledTimes(1);
  });
});
