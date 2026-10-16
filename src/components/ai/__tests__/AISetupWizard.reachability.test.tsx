import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/bridge/MCPBridge', () => ({ dispatchBridgeCall: vi.fn() }));
vi.mock('@/contexts/ResponsiveContext', () => ({
  useResponsiveSafe: () => ({ isMobile: false, isPhone: false }),
}));

import { AIPanel } from '../AIPanel';
import { useAIStore } from '@stores/useAIStore';
import { useAIKeysStore } from '@stores/useAIKeysStore';
import { useAIWizardStore } from '@stores/useAIWizardStore';

describe('AI setup wizard reachability', () => {
  beforeEach(() => {
    useAIKeysStore.setState({ keys: {} });
    useAIWizardStore.setState({ isOpen: false, settled: false });
    useAIStore.setState({ isOpen: true, provider: 'free', model: 'auto' });
  });

  it('opens by itself from the expanded panel, checks an Anthropic key and saves it', async () => {
    const checks: { headers: Record<string, string>; body: unknown }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/ai/check-key')) {
        checks.push({ headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) });
        return new Response(JSON.stringify({ ok: true, models: 12 }), { status: 200 });
      }
      return new Response(JSON.stringify({
        available: false, error: 'No key', free: { available: false, message: 'No key' },
      }), { status: 200 });
    }));

    render(<AIPanel />);
    await screen.findByText('Set Up AI Help', { selector: 'h1,h2,h3,div,span' });
    expect(useAIWizardStore.getState().isOpen).toBe(true);
    expect(screen.queryByText('Free Models (No Key)')).toBeNull();

    fireEvent.click(screen.getByText('Anthropic Key'));
    fireEvent.change(screen.getByLabelText('Anthropic API Key', { selector: '#ai-wizard-key' }), {
      target: { value: 'sk-ant-pasted' },
    });
    expect(useAIKeysStore.getState().keys.anthropic).toBeUndefined();
    fireEvent.click(screen.getByText('Check Key'));
    await screen.findByText(/12 models are available/);
    expect(useAIKeysStore.getState().keys.anthropic).toBeUndefined();
    fireEvent.click(screen.getByText('Finish'));

    await waitFor(() => expect(useAIWizardStore.getState().isOpen).toBe(false));
    expect(checks).toHaveLength(1);
    expect(checks[0].headers['x-anthropic-key']).toBe('sk-ant-pasted');
    expect(checks[0].body).toEqual({ vendor: 'anthropic' });
    expect(useAIKeysStore.getState().keys.anthropic).toBe('sk-ant-pasted');
    expect(useAIStore.getState().provider).toBe('anthropic');
    expect(useAIWizardStore.getState().settled).toBe(true);
  });
});
