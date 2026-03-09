/**
 * AIMessage — renders a single chat message (user or assistant) with tool calls.
 */

import type { AIMessage as AIMessageType } from '@stores/useAIStore';

interface AIMessageProps {
  message: AIMessageType;
}

export const AIMessage: React.FC<AIMessageProps> = ({ message }) => {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-2`}>
      <div
        className={`max-w-[90%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words ${
          isUser
            ? 'bg-accent/20 text-text-primary'
            : 'bg-dark-surface text-text-primary'
        }`}
      >
        {message.content}
        {message.isStreaming && !message.content && (
          <span className="inline-block w-2 h-4 bg-text-muted animate-pulse" />
        )}

        {message.toolCalls.length > 0 && (
          <div className="mt-2 space-y-1">
            {message.toolCalls.map((tc, i) => (
              <details key={i} className="text-xs border border-dark-border rounded">
                <summary className="px-2 py-1 cursor-pointer text-text-muted hover:text-text-primary">
                  {tc.tool}
                  {tc.result ? ' (done)' : ' (running...)'}
                </summary>
                <div className="px-2 py-1 bg-dark-bg/50 font-mono text-[10px] text-text-muted overflow-x-auto">
                  <div className="text-cyan-400/70">Input: {JSON.stringify(tc.input, null, 1).slice(0, 200)}</div>
                  {tc.result && (
                    <div className="text-green-400/70 mt-1">Result: {tc.result.slice(0, 200)}</div>
                  )}
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
