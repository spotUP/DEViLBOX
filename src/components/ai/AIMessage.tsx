/**
 * AIMessage — renders a single chat message (user or assistant) with its tool
 * calls. A long composing turn makes dozens of calls, so each one is a single
 * collapsed row (name, state); opening it shows the full input and result.
 */

import type { AIMessage as AIMessageType, AIToolCall } from '@stores/useAIStore';

export interface AIMessageProps {
  message: AIMessageType;
}

/** The state word shown beside a tool name. */
export function toolCallState(call: AIToolCall): 'Running' | 'Done' | 'Failed' {
  if (call.result === undefined) return 'Running';
  return call.failed ? 'Failed' : 'Done';
}

const STATE_CLASS: Record<ReturnType<typeof toolCallState>, string> = {
  Running: 'text-accent-highlight',
  Done: 'text-accent-success',
  Failed: 'text-accent-error',
};

export const AIMessage: React.FC<AIMessageProps> = ({ message }) => {
  const isUser = message.role === 'user';
  const calls = message.toolCalls;
  const running = calls.filter((c) => c.result === undefined).length;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-2`}>
      <div
        className={`max-w-[90%] rounded px-3 py-2 text-xs whitespace-pre-wrap break-words text-text-primary ${
          isUser ? 'bg-accent-primary/20' : 'bg-dark-bgSecondary'
        }`}
      >
        {message.content}
        {message.isStreaming && (
          <span className="inline-block w-2 h-3 ml-0.5 align-baseline bg-text-muted animate-pulse" />
        )}

        {calls.length > 0 && (
          <div className="mt-2 space-y-1" data-testid="ai-tool-calls">
            <div className="text-[10px] font-mono text-text-muted">
              {calls.length} {calls.length === 1 ? 'step' : 'steps'}
              {running > 0 ? `, ${running} running` : ''}
            </div>
            {calls.map((call, i) => {
              const state = toolCallState(call);
              return (
                <details key={i} className="text-[10px] font-mono border border-dark-border rounded">
                  <summary className="flex items-center justify-between gap-2 px-2 py-1 cursor-pointer text-text-secondary hover:text-text-primary">
                    <span className="truncate">{call.tool}</span>
                    <span className={STATE_CLASS[state]}>{state}</span>
                  </summary>
                  <div className="px-2 py-1 bg-dark-bg text-text-muted max-h-40 overflow-auto">
                    <div className="text-text-secondary">Input</div>
                    <div>{JSON.stringify(call.input, null, 1)}</div>
                    {call.result !== undefined && (
                      <>
                        <div className={`mt-1 ${call.failed ? 'text-accent-error' : 'text-text-secondary'}`}>Result</div>
                        <div>{call.result || '(empty)'}</div>
                      </>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
