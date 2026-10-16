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

type AIKeys = Partial<Record<AIKeyVendor, string>>;

interface AIKeysState {
  keys: AIKeys;
}

interface AIKeysActions {
  setKey: (vendor: AIKeyVendor, value: string) => void;
  clearKey: (vendor: AIKeyVendor) => void;
}

/** Headers carrying the visitor's key for this provider; {} when none applies. */
export function keyHeadersFor(provider: string, keys: AIKeys): Record<string, string> {
  // anthropic / openai providers are added with FA-17 / FA-18.
  if (provider === 'free' && keys.openrouter) {
    return { [AI_KEY_HEADERS.openrouter]: keys.openrouter };
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
