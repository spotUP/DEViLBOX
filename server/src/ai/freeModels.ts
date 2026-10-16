/**
 * The free OpenRouter model catalogue and its ranking.
 *
 * FREE ONLY: a model is eligible when OpenRouter lists it at zero price for
 * both prompt and completion. An id not listed at zero price is never sent,
 * including an id the client asks for by name (requestedModelIfFree).
 *
 * Ranking (ported from the AmiExpress BBS picker): tool-capable first, then
 * not-mute, then the cheapest MEASURED round trip, then (among models nothing
 * has measured) the SMALLER context, because the giant models are the slow
 * ones. Models whose id contains "think" are dropped.
 */
import { modelCostMs, modelIsMeasured, modelIsMute, noteModelCost, noteModelMute } from './modelCosts';

export const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
export const MODEL_CACHE_MS = 60 * 60 * 1000;
/** How long a background probe waits before calling the model too slow to bother with. */
export const PROBE_TIMEOUT_MS = 8000;
const DISCOVERY_TIMEOUT_MS = 5000;

export type FetchFn = typeof fetch;

export interface OpenRouterModel {
  id: string;
  name?: string;
  pricing?: { prompt?: string; completion?: string };
  supported_parameters?: string[];
  context_length?: number;
}

export const isFreeModel = (m: OpenRouterModel): boolean =>
  parseFloat(m.pricing?.prompt ?? '1') === 0 && parseFloat(m.pricing?.completion ?? '1') === 0;

export const supportsTools = (m: OpenRouterModel): boolean =>
  Array.isArray(m.supported_parameters) && m.supported_parameters.includes('tools');

/** Tool-capable first, then not mute, then the cheapest measured, then the SMALLER context. */
export function rankFreeModels(models: OpenRouterModel[], now = Date.now()): string[] {
  return models
    .filter(isFreeModel)
    .filter((m) => !m.id.toLowerCase().includes('think'))
    .sort((a, b) =>
      Number(supportsTools(b)) - Number(supportsTools(a)) ||
      Number(modelIsMute(a.id)) - Number(modelIsMute(b.id)) ||
      modelCostMs(a.id, now) - modelCostMs(b.id, now) ||
      (a.context_length ?? 0) - (b.context_length ?? 0))
    .map((m) => m.id);
}

/**
 * Used when discovery returns nothing (network trouble, API format change).
 * Copied from the BBS list, refreshed against the live /models endpoint there
 * on 2026-09-10; all zero-price. Tool support is ASSUMED for these (a 400 on
 * tools falls back to a plain completion in freeProvider).
 */
export const FALLBACK_FREE_MODELS: readonly string[] = [
  'nvidia/nemotron-3.5-lightning:free',
  'google/gemma-4-26b-a4b-it:free',
  'poolside/laguna-s-2.1:free',
  'liquid/lfm-2.5-2.6b:free',
  'cohere/north-mini-code:free',
];

const fallbackModels = (): OpenRouterModel[] => FALLBACK_FREE_MODELS.map((id) => ({
  id, pricing: { prompt: '0', completion: '0' }, supported_parameters: ['tools'],
}));

let knownFreeModels = new Map<string, OpenRouterModel>();
let cachedRanking: string[] = [];
let lastDiscovery = 0;

function setCatalogue(models: OpenRouterModel[], now: number): void {
  knownFreeModels = new Map(models.filter(isFreeModel).map((m) => [m.id, m]));
  cachedRanking = rankFreeModels(models, now);
  lastDiscovery = now;
}

/** Re-rank after a cost changed. */
export function reRank(now = Date.now()): void {
  cachedRanking = rankFreeModels([...knownFreeModels.values()], now);
}

/** Test seam: what a discovery would have returned. */
export function primeModelCatalogue(models: OpenRouterModel[], now = Date.now()): void {
  setCatalogue(models, now);
}

/** Test seam: forget the catalogue so the next call discovers again. */
export function resetModelCatalogue(): void {
  knownFreeModels = new Map();
  cachedRanking = [];
  lastDiscovery = 0;
}

/** Does this model, by id, support tools as far as the last discovery knows? */
export function modelSupportsTools(id: string): boolean {
  const m = knownFreeModels.get(id);
  return m ? supportsTools(m) : false;
}

/**
 * The free models, best first. Discovered from OpenRouter /models, cached for
 * an hour, fallback list on any failure or empty answer. Returns a copy.
 */
export async function freeModelRanking(fetchImpl: FetchFn, apiKey: string, now = Date.now()): Promise<string[]> {
  if (cachedRanking.length && now - lastDiscovery < MODEL_CACHE_MS) {
    reRank(now);
    return [...cachedRanking];
  }
  let models: OpenRouterModel[] = [];
  try {
    const r = await fetchImpl(`${OPENROUTER_BASE}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
    });
    if (r.ok) {
      const body = await r.json() as { data?: OpenRouterModel[] };
      models = Array.isArray(body.data) ? body.data : [];
    }
  } catch {
    // Network trouble: the fallback list below.
  }
  if (!models.some(isFreeModel)) models = fallbackModels();
  setCatalogue(models, now);
  return [...cachedRanking];
}

/**
 * The client's model name, only if the last discovery listed it free;
 * otherwise null and the picker's choice is used. Unknown counts as not free.
 */
export function requestedModelIfFree(name: string | undefined): string | null {
  if (!name || name === 'auto') return null;
  return knownFreeModels.has(name) ? name : null;
}

let probing = false;

/**
 * Measure one unmeasured model without making anybody wait for it: a
 * five-token prompt, a short timeout, the result recorded exactly as a real
 * reply would be. Fire and forget; a failure only marks the model. Returns the
 * model probed, or null when there was nothing to do.
 */
export async function probeAnUnmeasuredModel(fetchImpl: FetchFn, apiKey: string, headers: Record<string, string>): Promise<string | null> {
  if (probing) return null;
  const target = cachedRanking.find((id) => !modelIsMeasured(id));
  if (!target) return null;
  probing = true;
  const startedAt = Date.now();
  try {
    const r = await fetchImpl(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, ...headers },
      body: JSON.stringify({ model: target, messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 }),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!r.ok) throw new Error(`probe ${r.status}`);
    const reply = await r.json() as { choices?: Array<{ message?: { content?: unknown } }> };
    noteModelCost(target, Date.now() - startedAt, true);
    const content = reply.choices?.[0]?.message?.content;
    // A model that replies with nothing looks perfect (instant) and is mute.
    noteModelMute(target, !(typeof content === 'string' && content.trim() !== ''));
  } catch {
    noteModelCost(target, PROBE_TIMEOUT_MS, false);
  } finally {
    probing = false;
    reRank();
  }
  return target;
}

export function resetProbe(): void { probing = false; }
