import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AIKeysPanel } from '../AIKeysPanel';
import { useAIKeysStore } from '@stores/useAIKeysStore';

describe('AIKeysPanel', () => {
  beforeEach(() => useAIKeysStore.setState({ keys: {} }));

  it('Save stores the typed key and shows only the last 4 characters; Clear removes it', () => {
    render(<AIKeysPanel />);
    fireEvent.change(screen.getByLabelText('OpenRouter API Key'), { target: { value: 'sk-or-secret1234' } });
    fireEvent.click(screen.getByText('Save'));
    expect(useAIKeysStore.getState().keys.openrouter).toBe('sk-or-secret1234');
    expect(screen.getByText(/Key saved/).textContent).toContain('1234');
    expect(screen.queryByText(/secret/)).toBeNull();
    fireEvent.click(screen.getByText('Clear'));
    expect(useAIKeysStore.getState().keys.openrouter).toBeUndefined();
  });
});
