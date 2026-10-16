import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/services/aiChatService', () => ({
  sendMessage: vi.fn(),
  stopStreaming: vi.fn(),
  checkAIStatus: vi.fn(async () => ({ available: false, error: 'Free quota used up' })),
}));
vi.mock('@/contexts/ResponsiveContext', () => ({
  useResponsiveSafe: () => ({ isMobile: false }),
}));

import { AIPanel } from '../AIPanel';
import { useAIStore } from '@stores/useAIStore';

describe('AIPanel free provider copy', () => {
  it('shows the hint, the answering model, and the server status message', async () => {
    useAIStore.setState({ isOpen: true, provider: 'free', model: 'auto', activeModel: 'x/free-model' });
    render(<AIPanel />);
    expect(screen.getByText('Free models via OpenRouter. Answers may be slower.')).toBeTruthy();
    expect(screen.getByText('Answered by x/free-model')).toBeTruthy();
    expect(await screen.findByText('Free quota used up')).toBeTruthy();
  });
});
