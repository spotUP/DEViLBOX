/**
 * A chat on the visitor's own Anthropic or OpenAI key, with the same tools as
 * the Free provider. Emits the same SSE event shapes (`model`, `text`, `error`,
 * `done`). The key is read once from the request header, used for this
 * request only, never stored or logged, and scrubbed from every message.
 */
import { createFreeToolset } from './freeToolset';
import { DEFAULT_DEADLINE_MS, ProviderError, askWithTools, type ChatTurn } from './toolLoop';
import { VENDORS, listVendorModels, pickModel, type VendorId } from './vendors';
import { makeJsonPost, scrub } from './vendorPost';
import type { BrowserCaller } from '../mcp/mcpServer';

export const VENDOR_MAX_TOKENS = 1024;

export interface VendorChatOptions {
  vendor: VendorId;
  system: string;
  history: ChatTurn[];
  visitorKey?: string;
  requestedModel?: string;
  emit: (event: Record<string, unknown>) => void;
  callBrowser: BrowserCaller;
  signal?: AbortSignal;
  deadlineMs?: number;
}

export async function runVendorChat(opts: VendorChatOptions): Promise<{ text: string | null; model: string | null }> {
  const v = VENDORS[opts.vendor];
  const key = opts.visitorKey ?? '';
  const fail = (message: string): { text: null; model: null } => {
    opts.emit({ type: 'error', error: scrub(message, key) });
    return { text: null, model: null };
  };
  if (!key) return fail(v.noKeyMessage);

  let model: string | null;
  try {
    model = pickModel(await listVendorModels(opts.vendor, key, undefined, opts.signal), v.preferredModels, opts.requestedModel);
  } catch (e) {
    if (opts.signal?.aborted) return { text: null, model: null };
    return fail(e instanceof ProviderError ? e.message : `Could not reach ${v.label}`);
  }
  if (!model) return fail(`${v.label} lists no model this key can chat with.`);

  const toolset = await createFreeToolset(opts.callBrowser);
  const deadline = Date.now() + (opts.deadlineMs ?? DEFAULT_DEADLINE_MS);
  const post = makeJsonPost({ url: v.chatUrl, headers: v.headers(key), vendor: v.label, adapter: v.adapter, signal: opts.signal });
  let text: string | null = null;
  let lastError = `${v.label} did not answer in time. Try again in a moment.`;
  try {
    // A 400 may be the tool definitions; retry once without them.
    for (const tools of [toolset.tools, []]) {
      try {
        const r = await askWithTools({
          adapter: v.adapter, model, system: opts.system, history: opts.history, tools,
          execute: toolset.execute, deadline, maxTokens: VENDOR_MAX_TOKENS, post,
        });
        text = r.text;
        break;
      } catch (e) {
        const err = e instanceof ProviderError ? e : new ProviderError('other', 'Unexpected error');
        lastError = err.message;
        if (opts.signal?.aborted || err.kind !== 'bad-request' || tools.length === 0) break;
      }
    }
  } finally {
    await toolset.close();
  }

  if (text) {
    opts.emit({ type: 'model', model });
    opts.emit({ type: 'text', content: text });
    opts.emit({ type: 'done', code: 0 });
    return { text, model };
  }
  if (opts.signal?.aborted) return { text: null, model: null };
  return fail(lastError);
}
