/**
 * AI Keys Store - the visitor's own provider API keys.
 * Persisted in this browser only (localStorage, versioned key); sent to the
 * server as request headers with each chat request, never logged.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AIKeyVendor = 'openrouter' | 'anthropic' | 'openai';

export const AI_KEY_HEADERS: Record<AIKeyVendor, string> = {
  openrouter: 'x-openrouter-key',
  anthropic: 'x-anthropic-key',
  openai: 'x-openai-key',
};

/** Display name and key-page link for each vendor (shared by the keys panel and the setup wizard). */
export const AI_KEY_VENDORS: Record<AIKeyVendor, { label: string; keyUrl: string }> = {
  openrouter: { label: 'OpenRouter', keyUrl: 'https://openrouter.ai/keys' },
  anthropic: { label: 'Anthropic', keyUrl: 'https://console.anthropic.com/settings/keys' },
  openai: { label: 'OpenAI', keyUrl: 'https://platform.openai.com/api-keys' },
};

/** The chat provider that spends this vendor's key. */
export const PROVIDER_FOR_VENDOR: Record<AIKeyVendor, 'free' | 'anthropic' | 'openai'> = {
  openrouter: 'free',
  anthropic: 'anthropic',
  openai: 'openai',
};

export type AIKeys = Partial<Record<AIKeyVendor, string>>;

interface AIKeysState {
  keys: AIKeys;
}

interface AIKeysActions {
  setKey: (vendor: AIKeyVendor, value: string) => void;
  clearKey: (vendor: AIKeyVendor) => void;
}

/** Headers carrying the visitor's key for this provider; {} when none applies. */
export function keyHeadersFor(provider: string, keys: AIKeys): Record<string, string> {
  // Only the chosen provider's key is sent, never another vendor's.
  for (const vendor of Object.keys(PROVIDER_FOR_VENDOR) as AIKeyVendor[]) {
    const key = keys[vendor];
    if (PROVIDER_FOR_VENDOR[vendor] === provider && key) return { [AI_KEY_HEADERS[vendor]]: key };
  }
  return {};
}

export const useAIKeysStore = create<AIKeysState & AIKeysActions>()(
  persist(
    (set) => ({
      keys: {},

      setKey: (vendor, value) => set((s) => {
        const trimmed = value.trim();
        const keys = { ...s.keys };
        if (trimmed) keys[vendor] = trimmed;
        else delete keys[vendor];
        return { keys };
      }),

      clearKey: (vendor) => set((s) => {
        const keys = { ...s.keys };
        delete keys[vendor];
        return { keys };
      }),
    }),
    {
      name: 'devilbox-ai-keys',
      version: 1,
      partialize: (state) => ({ keys: state.keys }),
      migrate: (persistedState) => {
        const state = (persistedState ?? {}) as { keys?: unknown };
        const keys: AIKeys = {};
        if (state.keys && typeof state.keys === 'object') {
          for (const v of Object.keys(AI_KEY_HEADERS) as AIKeyVendor[]) {
            const val = (state.keys as Record<string, unknown>)[v];
            if (typeof val === 'string' && val) keys[v] = val;
          }
        }
        return { keys };
      },
    },
  ),
);
