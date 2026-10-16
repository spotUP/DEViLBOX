import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';
import { AIKeysPanel } from '../AIKeysPanel';
import { useAIKeysStore } from '@stores/useAIKeysStore';

describe('AIKeysPanel', () => {
  beforeEach(() => {
    cleanup();
    useAIKeysStore.setState({ keys: {} });
  });

  it('Save stores the typed key and shows only the last 4 characters; Clear removes it', () => {
    render(<AIKeysPanel />);
    fireEvent.change(screen.getByLabelText('OpenRouter API Key'), { target: { value: 'sk-or-secret1234' } });
    fireEvent.click(within(screen.getByTestId('ai-key-openrouter')).getByText('Save'));
    expect(useAIKeysStore.getState().keys.openrouter).toBe('sk-or-secret1234');
    expect(screen.getByText(/Key saved/).textContent).toContain('1234');
    expect(screen.queryByText(/secret/)).toBeNull();
    fireEvent.click(within(screen.getByTestId('ai-key-openrouter')).getByText('Clear'));
    expect(useAIKeysStore.getState().keys.openrouter).toBeUndefined();
  });

  it('shows one masked field per vendor with its key page link, each saving its own key', () => {
    render(<AIKeysPanel />);
    for (const [label, vendor, url] of [
      ['OpenRouter API Key', 'openrouter', 'https://openrouter.ai/keys'],
      ['Anthropic API Key', 'anthropic', 'https://console.anthropic.com/settings/keys'],
      ['OpenAI API Key', 'openai', 'https://platform.openai.com/api-keys'],
    ] as const) {
      expect(screen.getByLabelText(label).getAttribute('type')).toBe('password');
      expect(within(screen.getByTestId(`ai-key-${vendor}`)).getByText('Get a key').getAttribute('href')).toBe(url);
    }
    fireEvent.change(screen.getByLabelText('Anthropic API Key'), { target: { value: 'sk-ant-1' } });
    fireEvent.click(within(screen.getByTestId('ai-key-anthropic')).getByText('Save'));
    expect(useAIKeysStore.getState().keys).toEqual({ anthropic: 'sk-ant-1' });
  });
});
