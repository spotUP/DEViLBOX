/** SETTINGS-SMOOTH-SCROLL-TOGGLE: Smooth Scrolling and Ghost Patterns could not be turned on in the settings dialog. */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { SettingsModal } from '../SettingsModal';
import { useTransportStore } from '@stores/useTransportStore';
import { useEditorStore } from '@stores/useEditorStore';

afterEach(cleanup);

/** The toggle button sitting in the same row as the given label text. */
function toggleFor(container: HTMLElement, labelText: string): HTMLButtonElement {
  const label = Array.from(container.querySelectorAll('label')).find((l) => l.textContent === labelText);
  const button = label?.closest('.flex.items-center.justify-between')?.querySelector('button');
  if (!button) throw new Error(`no toggle for ${labelText}`);
  return button as HTMLButtonElement;
}

describe('Settings dialog toggles', () => {
  it('Smooth Scrolling turns on in the settings dialog', () => {
    useTransportStore.getState().setSmoothScrolling(false);
    const { container } = render(<SettingsModal onClose={() => {}} />);
    const toggle = toggleFor(container, 'Smooth Scrolling:');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect(useTransportStore.getState().smoothScrolling).toBe(true);
    expect(toggleFor(container, 'Smooth Scrolling:').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(toggleFor(container, 'Smooth Scrolling:'));
    expect(useTransportStore.getState().smoothScrolling).toBe(false);
    expect(toggleFor(container, 'Smooth Scrolling:').getAttribute('aria-pressed')).toBe('false');
  });

  it('Ghost Patterns turns off and on in the settings dialog', () => {
    useEditorStore.getState().setShowGhostPatterns(false);
    const { container } = render(<SettingsModal onClose={() => {}} />);
    fireEvent.click(toggleFor(container, 'Ghost Patterns:'));
    expect(useEditorStore.getState().showGhostPatterns).toBe(true);
    expect(toggleFor(container, 'Ghost Patterns:').getAttribute('aria-pressed')).toBe('true');
  });
});
