/**
 * The vendors a visitor can bring their own key for (Anthropic, OpenAI): URLs,
 * auth headers, adapter, preferred models, and model discovery. There is no
 * server key for these; the key arrives in a request header and lives for
 * that request only.
 */
import { OPENROUTER_BASE, type FetchFn } from './freeModels';
import { anthropicAdapter } from './anthropicAdapter';
import { openAiAdapter } from './openRouterAdapter';
import { ProviderError, type LoopAdapter } from './toolLoop';
import { providerFetch } from './vendorPost';

export type VendorId = 'anthropic' | 'openai';

export const VENDOR_KEY_HEADER: Record<VendorId, string> = { anthropic: 'x-anthropic-key', openai: 'x-openai-key' };

export interface Vendor {
  id: VendorId;
  label: string;
  chatUrl: string;
  modelsUrl: string;
  headers(key: string): Record<string, string>;
  adapter: LoopAdapter;
  preferredModels: string[];
  noKeyMessage: string;
  /** Keep only models that can chat. */
  chatModelsOnly?: (id: string) => boolean;
}

const NOT_CHAT = /-audio|-realtime|-transcribe|-tts|-image|embedding|whisper|dall-e/;
const isOpenAiChatModel = (id: string): boolean => /^(gpt-|o\d)/.test(id) && !NOT_CHAT.test(id);

export const VENDORS: Record<VendorId, Vendor> = {
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    chatUrl: 'https://api.anthropic.com/v1/messages',
    modelsUrl: 'https://api.anthropic.com/v1/models',
    headers: (key) => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01' }),
    adapter: anthropicAdapter,
    preferredModels: ['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-sonnet', 'claude-haiku'],
    noKeyMessage: 'Add your Anthropic key in Settings (AI Help) to use Claude.',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    chatUrl: 'https://api.openai.com/v1/chat/completions',
    modelsUrl: 'https://api.openai.com/v1/models',
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
    adapter: openAiAdapter,
    preferredModels: ['gpt-5-mini', 'gpt-5', 'gpt-4.1-mini', 'gpt-4o-mini'],
    noKeyMessage: 'Add your OpenAI key in Settings (AI Help) to use OpenAI.',
    chatModelsOnly: isOpenAiChatModel,
  },
};

export const isVendorId = (p: unknown): p is VendorId => p === 'anthropic' || p === 'openai';

/** The vendor's model ids for this key. Throws ProviderError (auth, credit, ...) with the vendor's words. */
export async function listVendorModels(id: VendorId, key: string, fetchImpl: FetchFn = providerFetch, signal?: AbortSignal): Promise<string[]> {
  const v = VENDORS[id];
  const timeout = AbortSignal.timeout(8000);
  let r: Response;
  try {
    r = await fetchImpl(v.modelsUrl, { headers: v.headers(key), signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  } catch {
    if (signal?.aborted) throw new ProviderError('other', 'The chat was stopped');
    throw new ProviderError('other', `Could not reach ${v.label}`);
  }
  let json: unknown = null;
  try { json = await r.json(); } catch { /* an empty or non-JSON body */ }
  if (!r.ok) throw v.adapter.mapError(r.status, json);
  const data = (json as { data?: Array<{ id?: unknown }> } | null)?.data;
  const ids = (Array.isArray(data) ? data : []).map((m) => m.id).filter((m): m is string => typeof m === 'string');
  return v.chatModelsOnly ? ids.filter(v.chatModelsOnly) : ids;
}

/** requested if listed; else the first preferred id listed; else the first preferred prefix match; else the first listed. */
export function pickModel(available: string[], preferred: string[], requested?: string): string | null {
  if (requested && available.includes(requested)) return requested;
  const exact = preferred.find((p) => available.includes(p));
  if (exact) return exact;
  for (const p of preferred) {
    const prefix = available.find((a) => a.startsWith(p));
    if (prefix) return prefix;
  }
  return available[0] ?? null;
}

/**
 * OpenRouter has no vendor entry (its server key and ranking live in freeProvider).
 * Its /models list is public and answers 200 for any key, so the key itself is checked
 * against /key (401 for a bad key); the model count then comes from /models.
 */
export async function checkOpenRouterKey(key: string, fetchImpl: FetchFn = providerFetch): Promise<number> {
  const get = async (path: string): Promise<Response> => {
    let r: Response;
    try {
      r = await fetchImpl(`${OPENROUTER_BASE}${path}`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000) });
    } catch {
      throw new ProviderError('other', 'Could not reach OpenRouter');
    }
    if (r.status === 401 || r.status === 403) throw new ProviderError('auth', 'The OpenRouter key was rejected', r.status);
    if (!r.ok) throw new ProviderError('other', `OpenRouter error ${r.status}`, r.status);
    return r;
  };
  await get('/key');
  const body = await (await get('/models')).json().catch(() => null) as { data?: unknown[] } | null;
  return Array.isArray(body?.data) ? body.data.length : 0;
}
