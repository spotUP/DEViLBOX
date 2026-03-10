/**
 * AI Chat Store — shared state for the in-app AI assistant panel.
 * NOT persisted to localStorage.
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

// --- Provider + Model definitions ---

export type AIProvider = 'claude' | 'copilot';

export interface AIModelDef {
  id: string;
  label: string;
  description: string;
  provider: AIProvider;
}

export const AI_PROVIDERS: { id: AIProvider; label: string }[] = [
  { id: 'claude',  label: 'Claude' },
  { id: 'copilot', label: 'Copilot' },
];

export const AI_MODELS: AIModelDef[] = [
  // Claude models
  { id: 'haiku',  label: 'Haiku',  description: 'Fast & cheap',   provider: 'claude' },
  { id: 'sonnet', label: 'Sonnet', description: 'Balanced',       provider: 'claude' },
  { id: 'opus',   label: 'Opus',   description: 'Most capable',   provider: 'claude' },
  // Copilot models (Haiku first = default)
  { id: 'claude-haiku-4.5',  label: 'Haiku',  description: 'Fast via Copilot',    provider: 'copilot' },
  { id: 'claude-sonnet-4.6', label: 'Sonnet', description: 'Claude via Copilot',  provider: 'copilot' },
  { id: 'claude-opus-4.6',   label: 'Opus',   description: 'Premium via Copilot', provider: 'copilot' },
  { id: 'gpt-4.1',           label: 'GPT-4.1',    description: 'OpenAI via Copilot',  provider: 'copilot' },
];

export function getModelsForProvider(provider: AIProvider): AIModelDef[] {
  return AI_MODELS.filter((m) => m.provider === provider);
}

export function getDefaultModel(provider: AIProvider): string {
  const models = getModelsForProvider(provider);
  return models[0]?.id || 'haiku';
}

// --- Messages ---

export interface AIToolCall {
  tool: string;
  input: Record<string, unknown>;
  result?: string;
}

export interface AIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls: AIToolCall[];
  timestamp: number;
  isStreaming?: boolean;
}

interface AIState {
  isOpen: boolean;
  messages: AIMessage[];
  isStreaming: boolean;
  conversationId: string | null;
  error: string | null;
  provider: AIProvider;
  model: string;
}

interface AIActions {
  toggle: () => void;
  open: () => void;
  close: () => void;
  setStreaming: (streaming: boolean) => void;
  setConversationId: (id: string) => void;
  setError: (error: string | null) => void;
  addUserMessage: (content: string) => string;
  addAssistantMessage: () => string;
  appendAssistantText: (messageId: string, text: string) => void;
  addToolCall: (messageId: string, toolCall: AIToolCall) => void;
  addToolResult: (messageId: string, tool: string, result: string) => void;
  finalizeAssistantMessage: (messageId: string) => void;
  setProvider: (provider: AIProvider) => void;
  setModel: (model: string) => void;
  clearHistory: () => void;
}

export const useAIStore = create<AIState & AIActions>()(
  immer((set) => ({
    isOpen: false,
    messages: [],
    isStreaming: false,
    conversationId: null,
    error: null,
    provider: 'copilot' as AIProvider,
    model: 'claude-haiku-4.5',

    toggle: () => set((s) => { s.isOpen = !s.isOpen; }),
    open: () => set((s) => { s.isOpen = true; }),
    close: () => set((s) => { s.isOpen = false; }),

    setStreaming: (streaming) => set((s) => { s.isStreaming = streaming; }),
    setConversationId: (id) => set((s) => { s.conversationId = id; }),
    setError: (error) => set((s) => { s.error = error; }),
    setModel: (model) => set((s) => { s.model = model; }),

    setProvider: (provider) => set((s) => {
      s.provider = provider;
      // Auto-switch to default model for the new provider
      s.model = getDefaultModel(provider);
      // Clear conversation when switching providers
      s.conversationId = null;
    }),

    addUserMessage: (content) => {
      const id = crypto.randomUUID();
      set((s) => {
        s.messages.push({
          id,
          role: 'user',
          content,
          toolCalls: [],
          timestamp: Date.now(),
        });
        s.error = null;
      });
      return id;
    },

    addAssistantMessage: () => {
      const id = crypto.randomUUID();
      set((s) => {
        s.messages.push({
          id,
          role: 'assistant',
          content: '',
          toolCalls: [],
          timestamp: Date.now(),
          isStreaming: true,
        });
      });
      return id;
    },

    appendAssistantText: (messageId, text) =>
      set((s) => {
        const msg = s.messages.find((m) => m.id === messageId);
        if (msg) msg.content += text;
      }),

    addToolCall: (messageId, toolCall) =>
      set((s) => {
        const msg = s.messages.find((m) => m.id === messageId);
        if (msg) msg.toolCalls.push(toolCall);
      }),

    addToolResult: (messageId, tool, result) =>
      set((s) => {
        const msg = s.messages.find((m) => m.id === messageId);
        if (!msg) return;
        const tc = [...msg.toolCalls].reverse().find((t) => t.tool === tool && !t.result);
        if (tc) tc.result = result;
      }),

    finalizeAssistantMessage: (messageId) =>
      set((s) => {
        const msg = s.messages.find((m) => m.id === messageId);
        if (msg) msg.isStreaming = false;
      }),

    clearHistory: () =>
      set((s) => {
        s.messages = [];
        s.conversationId = null;
        s.error = null;
      }),
  })),
);
