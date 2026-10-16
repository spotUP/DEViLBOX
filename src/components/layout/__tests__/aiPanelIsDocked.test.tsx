/**
 * AI-PROMPT-HIDDEN (owner, 2026-10-16): the AI prompt was reachable only by a
 * key combo. It is now a docked panel in AppLayout, like the instrument list:
 * header always visible, collapsed by default, one flag (useAIStore.isOpen)
 * shared by the header click and the Ctrl+L command.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent, act } from '@testing-library/react';

vi.mock('../NavBar', () => ({ NavBar: () => null }));
vi.mock('../MobileMenu', () => ({ MobileMenu: () => null }));
vi.mock('../MobileTabBar', () => ({ MobileTabBar: () => null }));
vi.mock('@/services/aiChatService', () => ({
  sendMessage: vi.fn(),
  stopStreaming: vi.fn(),
  checkAIStatus: vi.fn().mockResolvedValue({ available: true }),
}));

import { AppLayout } from '../AppLayout';
import { useAIStore } from '@stores/useAIStore';
import { showCommandPalette } from '@/engine/keyboard/commands/misc';

beforeEach(() => {
  useAIStore.setState({ isOpen: false });
});
afterEach(cleanup);

describe('AI assistant panel in the app layout', { timeout: 60000 }, () => {
  it('shows a labelled header while collapsed, expands on click, and the key combo toggles the same panel', async () => {
    render(<AppLayout><div>content</div></AppLayout>);

    // Collapsed by default: header visible, prompt absent.
    const header = screen.getByTestId('ai-panel-header');
    expect(header.textContent).toContain('AI Assistant');
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByPlaceholderText(/Ask AI/i)).toBeNull();

    // Click the header: prompt appears.
    fireEvent.click(header);
    expect(useAIStore.getState().isOpen).toBe(true);
    expect(screen.getByPlaceholderText(/Ask AI/i)).toBeTruthy();
    expect(screen.getByTestId('ai-panel-header').getAttribute('aria-expanded')).toBe('true');

    // The Ctrl+L command collapses the very same panel, then expands it again.
    act(() => { showCommandPalette(); });
    expect(screen.queryByPlaceholderText(/Ask AI/i)).toBeNull();
    expect(screen.getByTestId('ai-panel-header')).toBeTruthy();
    act(() => { showCommandPalette(); });
    expect(screen.getByPlaceholderText(/Ask AI/i)).toBeTruthy();
    expect(document.activeElement?.tagName).toBe('TEXTAREA');
  });
});
