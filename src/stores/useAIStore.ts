/**
 * AI Chat Store — shared state for the in-app AI assistant panel.
 * NOT persisted to localStorage.
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

export type AIModel = 'haiku' | 'sonnet' | 'opus';

export const AI_MODELS: { id: AIModel; label: string; description: string }[] = [
  { id: 'haiku',  label: 'Haiku',  description: 'Fast & cheap' },
  { id: 'sonnet', label: 'Sonnet', description: 'Balanced' },
  { id: 'opus',   label: 'Opus',   description: 'Most capable' },
];

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
  model: AIModel;
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
  setModel: (model: AIModel) => void;
  clearHistory: () => void;
}

export const useAIStore = create<AIState & AIActions>()(
  immer((set) => ({
    isOpen: false,
    messages: [],
    isStreaming: false,
    conversationId: null,
    error: null,
    model: 'haiku' as AIModel,

    toggle: () => set((s) => { s.isOpen = !s.isOpen; }),
    open: () => set((s) => { s.isOpen = true; }),
    close: () => set((s) => { s.isOpen = false; }),

    setStreaming: (streaming) => set((s) => { s.isStreaming = streaming; }),
    setConversationId: (id) => set((s) => { s.conversationId = id; }),
    setError: (error) => set((s) => { s.error = error; }),
    setModel: (model) => set((s) => { s.model = model; }),

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
