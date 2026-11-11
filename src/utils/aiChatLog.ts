/**
 * Plain-text dump of the AI panel's conversation, for the panel's Copy button:
 * every turn with its tool calls (full input and result, not the 200-character
 * preview the panel shows), plus the provider, the model and the error banner.
 * Holds no key: the keys live in useAIKeysStore and never enter a message.
 */

import type { AIMessage, AIProvider } from '@stores/useAIStore';

export interface AIChatLogSource {
  provider: AIProvider;
  model: string;
  activeModel: string | null;
  error: string | null;
  isStreaming: boolean;
  messages: AIMessage[];
}

export function formatAIChatLog(source: AIChatLogSource): string {
  const lines: string[] = [
    '=== DEViLBOX AI chat log ===',
    `Provider: ${source.provider}`,
    `Model selected: ${source.model}`,
    `Model answering: ${source.activeModel ?? 'unknown'}`,
    `Turns: ${source.messages.length}${source.isStreaming ? ' (reply still running)' : ''}`,
  ];
  if (source.error) lines.push(`Error: ${source.error}`);

  for (const message of source.messages) {
    lines.push('', `--- ${message.role} ${new Date(message.timestamp).toISOString()} ---`);
    lines.push(message.content || '(no text)');
    message.toolCalls.forEach((call, index) => {
      lines.push(`[tool ${index + 1}] ${call.tool}`);
      lines.push(`  input: ${JSON.stringify(call.input)}`);
      lines.push(`  result: ${call.result ?? '(no result)'}`);
    });
    if (message.isStreaming) lines.push('(turn not finished)');
  }
  return lines.join('\n');
}

/** Copies the log to the clipboard; false when the browser refuses. */
export async function copyAIChatLog(source: AIChatLogSource): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(formatAIChatLog(source));
    return true;
  } catch {
    return false;
  }
}
