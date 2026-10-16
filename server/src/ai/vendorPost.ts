/**
 * The JSON POST every provider shares (OpenRouter, Anthropic, OpenAI), the
 * one fetch seam for tests, and `scrub`, which every error passes through
 * before it is sent anywhere: a visitor key never leaves in a message.
 */
import type { FetchFn } from './freeModels';
import { ProviderError, type LoopAdapter } from './toolLoop';

let fetchImpl: FetchFn | null = null;
/** Test seam: replace the fetch all providers use (the test's own client keeps the real one). */
export function setProviderFetch(f: FetchFn | null): void { fetchImpl = f; }
export const providerFetch: FetchFn = (...args) => (fetchImpl ?? globalThis.fetch)(...args);

/** `message` with every occurrence of `key` removed. */
export const scrub = (message: string, key: string): string => (key ? message.split(key).join('[key]') : message);

export interface JsonPostOptions {
  url: string;
  headers: Record<string, string>;
  /** Display name for the network error ("Could not reach Anthropic"). */
  vendor: string;
  adapter: LoopAdapter;
  signal?: AbortSignal;
  fetch?: FetchFn;
}

/** The `post` a ToolLoopRequest wants: JSON in, JSON out, ProviderError (via the adapter) on failure. */
export function makeJsonPost(o: JsonPostOptions) {
  const doFetch = o.fetch ?? providerFetch;
  return async (body: Record<string, unknown>, timeoutMs: number): Promise<unknown> => {
    const timeout = AbortSignal.timeout(timeoutMs);
    let r: Response;
    try {
      r = await doFetch(o.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...o.headers },
        body: JSON.stringify(body),
        signal: o.signal ? AbortSignal.any([o.signal, timeout]) : timeout,
      });
    } catch {
      if (o.signal?.aborted) throw new ProviderError('other', 'The chat was stopped');
      throw new ProviderError(timeout.aborted ? 'timeout' : 'other', timeout.aborted ? 'The model took too long' : `Could not reach ${o.vendor}`);
    }
    let json: unknown = null;
    try { json = await r.json(); } catch { /* an empty or non-JSON body */ }
    if (!r.ok) throw o.adapter.mapError(r.status, json);
    // OpenRouter reports some upstream failures as 200 with an error object.
    const embedded = (json as { error?: { code?: number } } | null)?.error;
    if (embedded) throw o.adapter.mapError(typeof embedded.code === 'number' ? embedded.code : 500, json);
    return json;
  };
}
