/**
 * AIPanel — right-sidebar React DOM overlay for the in-app AI assistant.
 * Rendered as a fixed-position overlay, works in both DOM and WebGL render modes.
 */

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { useAIStore, AI_PROVIDERS, getModelsForProvider } from '@stores/useAIStore';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useTransportStore } from '@stores/useTransportStore';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { sendMessage, stopStreaming, checkAIStatus } from '@/services/aiChatService';
import { AIMessage } from './AIMessage';
import { AIInput } from './AIInput';

export const AIPanel: React.FC = () => {
  const isOpen = useAIStore((s) => s.isOpen);
  const messages = useAIStore((s) => s.messages);
  const isStreaming = useAIStore((s) => s.isStreaming);
  const error = useAIStore((s) => s.error);
  const close = useAIStore((s) => s.close);
  const clearHistory = useAIStore((s) => s.clearHistory);
  const provider = useAIStore((s) => s.provider);
  const model = useAIStore((s) => s.model);
  const setProvider = useAIStore((s) => s.setProvider);
  const setModel = useAIStore((s) => s.setModel);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [authStatus, setAuthStatus] = useState<{ available: boolean; error?: string } | null>(null);

  // Context badge
  const bpm = useTransportStore((s) => s.bpm);
  const currentPatternIndex = useTrackerStore((s) => s.currentPatternIndex);
  const numChannels = useTrackerStore((s) => s.patterns[s.currentPatternIndex]?.channels?.length ?? 0);
  const numInstruments = useInstrumentStore((s) => s.instruments?.length ?? 0);
  const contextBadge = useMemo(() => {
    const parts: string[] = [];
    if (bpm) parts.push(`${bpm}bpm`);
    if (numChannels) parts.push(`${numChannels}ch`);
    if (numInstruments) parts.push(`${numInstruments} inst`);
    parts.push(`pat ${currentPatternIndex}`);
    return parts.join(', ');
  }, [bpm, numChannels, numInstruments, currentPatternIndex]);

  // Check auth on open
  useEffect(() => {
    if (isOpen && !authStatus) {
      checkAIStatus().then(setAuthStatus);
    }
  }, [isOpen, authStatus]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback((text: string) => {
    sendMessage(text);
  }, []);

  const handleStop = useCallback(() => {
    stopStreaming();
  }, []);

  // Stop propagation of keyboard events so tracker shortcuts don't fire
  const stopPropagation = useCallback((e: React.KeyboardEvent) => {
    e.stopPropagation();
  }, []);

  if (!isOpen) return null;

  return (
    <div
      className="fixed right-0 top-0 bottom-0 w-[440px] z-[45] flex flex-col bg-dark-bg border-l border-dark-border shadow-xl"
      style={{ animation: 'slideInRight 0.2s ease-out' }}
      onKeyDown={stopPropagation}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-dark-border shrink-0">
        <span className="text-sm font-semibold text-text-primary">AI</span>
        <div className="flex items-center gap-1">
          {/* Provider toggle */}
          <div className="flex items-center bg-dark-surface rounded overflow-hidden border border-dark-border mr-1">
            {AI_PROVIDERS.map((p) => (
              <button
                key={p.id}
                onClick={() => setProvider(p.id)}
                className={`px-1.5 py-0.5 text-[10px] transition-colors ${
                  provider === p.id
                    ? 'bg-dark-hover text-text-primary font-semibold'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {/* Model selector */}
          <div className="flex items-center bg-dark-surface rounded overflow-hidden border border-dark-border">
            {getModelsForProvider(provider).map((m) => (
              <button
                key={m.id}
                onClick={() => setModel(m.id)}
                className={`px-1.5 py-0.5 text-[10px] transition-colors ${
                  model === m.id
                    ? 'bg-accent text-text-primary font-semibold'
                    : 'text-text-muted hover:text-text-primary'
                }`}
                title={m.description}
              >
                {m.label}
              </button>
            ))}
          </div>
          <button
            onClick={clearHistory}
            className="px-2 py-0.5 text-xs text-text-muted hover:text-text-primary transition-colors"
            title="Clear chat history"
          >
            Clear
          </button>
          <button
            onClick={close}
            className="w-6 h-6 flex items-center justify-center text-text-muted hover:text-text-primary transition-colors"
            title="Close (Ctrl+L)"
          >
            x
          </button>
        </div>
      </div>

      {/* Auth error */}
      {authStatus && !authStatus.available && (
        <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/20 text-xs text-red-400">
          {authStatus.error}
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/20 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        {messages.length === 0 && (
          <div className="text-center text-text-muted text-xs mt-8">
            <p>Ask the AI to edit patterns, mix,</p>
            <p>search music archives, and more.</p>
            <p className="mt-2 text-text-muted/50">Press Ctrl+L to toggle this panel</p>
          </div>
        )}
        {messages.map((msg) => (
          <AIMessage key={msg.id} message={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Context badge */}
      {contextBadge && (
        <div className="px-3 py-1 border-t border-dark-border text-[10px] text-text-muted/60 truncate">
          {contextBadge}
        </div>
      )}

      {/* Input */}
      <AIInput
        onSend={handleSend}
        onStop={handleStop}
        isStreaming={isStreaming}
        disabled={authStatus !== null && !authStatus.available}
      />

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
};
