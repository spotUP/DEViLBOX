/**
 * AIInput — auto-expanding textarea with send/stop button.
 */

import { useState, useRef, useCallback } from 'react';

interface AIInputProps {
  onSend: (text: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
}

export const AIInput: React.FC<AIInputProps> = ({ onSend, onStop, isStreaming, disabled }) => {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    setText('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }, [text, isStreaming, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
      // Stop propagation so tracker shortcuts don't fire
      e.stopPropagation();
    },
    [handleSend],
  );

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    // Auto-resize (1-4 lines)
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 96)}px`;
  }, []);

  return (
    <div className="flex items-end gap-2 p-2 border-t border-dark-border">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder="Ask AI to edit your song..."
        disabled={disabled}
        rows={1}
        className="flex-1 bg-dark-bg border border-dark-border rounded px-2 py-1.5 text-sm text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:border-accent/50 disabled:opacity-50"
        style={{ maxHeight: 96 }}
      />
      {isStreaming ? (
        <button
          onClick={onStop}
          className="px-3 py-1.5 bg-red-500/20 text-red-400 text-sm rounded hover:bg-red-500/30 transition-colors shrink-0"
        >
          Stop
        </button>
      ) : (
        <button
          onClick={handleSend}
          disabled={!text.trim() || disabled}
          className="px-3 py-1.5 bg-accent/20 text-accent text-sm rounded hover:bg-accent/30 transition-colors disabled:opacity-30 shrink-0"
        >
          Send
        </button>
      )}
    </div>
  );
};
