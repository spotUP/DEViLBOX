/**
 * AIPanel — the in-app AI assistant, docked as a column at the right edge of
 * AppLayout (the same place and style as the tracker's instrument list).
 * Its header is always visible; the body is shown only while the panel is
 * expanded. One flag drives it: useAIStore.isOpen (persisted), which the
 * header, the Ctrl+L command and the toolbar menu all toggle.
 */

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { useAIStore, AI_PROVIDERS, getModelsForProvider } from '@stores/useAIStore';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useTransportStore } from '@stores/useTransportStore';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { sendMessage, stopStreaming, checkAIStatus } from '@/services/aiChatService';
import { Button } from '@components/ui/Button';
import { AIMessage } from './AIMessage';
import { AIInput } from './AIInput';
import { useResponsiveSafe } from '@/contexts/ResponsiveContext';
import { CollapsedPanelStrip } from '@components/ui/CollapsedPanelStrip';
import { ChevronRight } from 'lucide-react';

export const AIPanel: React.FC = () => {
  const isOpen = useAIStore((s) => s.isOpen);
  const messages = useAIStore((s) => s.messages);
  const isStreaming = useAIStore((s) => s.isStreaming);
  const error = useAIStore((s) => s.error);
  const toggle = useAIStore((s) => s.toggle);
  const clearHistory = useAIStore((s) => s.clearHistory);
  const provider = useAIStore((s) => s.provider);
  const model = useAIStore((s) => s.model);
  const setProvider = useAIStore((s) => s.setProvider);
  const setModel = useAIStore((s) => s.setModel);

  const { isPhone } = useResponsiveSafe();
  const rootRef = useRef<HTMLDivElement>(null);
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

  // Opening (header click, Ctrl+L, toolbar menu) puts the cursor in the prompt.
  // Not on first mount: a panel restored as expanded must not steal focus.
  const wasOpen = useRef(isOpen);
  useEffect(() => {
    if (isOpen && !wasOpen.current) rootRef.current?.querySelector('textarea')?.focus();
    wasOpen.current = isOpen;
  }, [isOpen]);

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

  // Collapsed: a narrow strip whose header stays visible. On a phone a
  // collapsed strip would cost width, so only the expanded overlay shows.
  if (!isOpen && isPhone) return null;

  // Collapsed: the same strip as the synth editor's instrument list.
  if (!isOpen) {
    return (
      <div data-testid="ai-panel" className="w-8 shrink-0 bg-dark-bgSecondary border-l border-dark-border">
        <CollapsedPanelStrip
          side="right"
          label="AI Assistant"
          data-testid="ai-panel-header"
          aria-expanded={false}
          onClick={toggle}
          title="Show AI Assistant (Ctrl+L)"
        />
      </div>
    );
  }

  const frame = isPhone
    ? 'fixed right-0 top-0 bottom-0 w-[440px] max-w-full z-[45] shadow-xl'
    : 'w-[440px] shrink-0';

  return (
    <div
      ref={rootRef}
      data-testid="ai-panel"
      className={`${frame} flex flex-col bg-dark-bg border-l border-dark-border overflow-hidden`}
      onKeyDown={stopPropagation}
    >
      {/* Header, same as the synth editor's instrument list header */}
      <div className="flex items-center justify-between gap-2 px-2 py-1 bg-dark-bgSecondary border-b border-dark-border shrink-0">
        <span className="text-xs font-medium text-text-muted">AI Assistant</span>
        <div className="flex items-center gap-1">
            <div className="flex items-center bg-dark-bgSecondary rounded overflow-hidden border border-dark-border mr-1">
              {AI_PROVIDERS.map((p) => (
                <Button
                  key={p.id}
                  variant={provider === p.id ? 'primary' : 'ghost'}
                  size="sm"
                  aria-pressed={provider === p.id}
                  onClick={() => setProvider(p.id)}
                  className="text-[10px] font-mono"
                >
                  {p.label}
                </Button>
              ))}
            </div>
            <div className="flex items-center bg-dark-bgSecondary rounded overflow-hidden border border-dark-border">
              {getModelsForProvider(provider).map((m) => (
                <Button
                  key={m.id}
                  variant={model === m.id ? 'primary' : 'ghost'}
                  size="sm"
                  aria-pressed={model === m.id}
                  onClick={() => setModel(m.id)}
                  className="text-[10px] font-mono"
                  title={m.description}
                >
                  {m.label}
                </Button>
              ))}
            </div>
            <Button variant="ghost" size="sm" onClick={clearHistory} title="Clear chat history" className="text-[10px] font-mono">
              Clear
            </Button>
            <Button
              variant="icon"
              size="icon"
              data-testid="ai-panel-header"
              aria-expanded={true}
              onClick={toggle}
              title="Hide AI Assistant (Ctrl+L)"
            >
              <ChevronRight size={14} />
            </Button>
          </div>
      </div>

      {/* Auth error */}
      {authStatus && !authStatus.available && (
        <div className="px-3 py-2 bg-accent-error/10 border-b border-accent-error/20 text-[10px] font-mono text-accent-error">
          {authStatus.error}
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="px-3 py-2 bg-accent-error/10 border-b border-accent-error/20 text-[10px] font-mono text-accent-error">
          {error}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        {messages.length === 0 && (
          <div className="text-center text-text-muted text-xs mt-8">
            <p>Ask the AI to edit patterns, mix,</p>
            <p>search music archives, and more.</p>
            <p className="mt-2 text-text-muted/50">Press Ctrl+L to expand or collapse this panel</p>
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
    </div>
  );
};
