/**
 * What a free model is expected to cost right now. One module owns the Map.
 *
 * Constants are copied verbatim from the AmiExpress BBS picker (measured live
 * there): EWMA prev*0.6 + ms*0.4, an untried model assumed 6000 ms, a failure
 * worn for 10 minutes as +60000 ms. Mute (a model that answers with no words)
 * is a property of the model, so it survives failures and only clears when the
 * model does answer.
 */
import { loadModelCosts, saveModelCosts, type StoredCost } from './modelCostStore';

/** An untried model is assumed this fast: good enough to be tried early. */
export const UNTRIED_MS = 6000;
/** How long a failure keeps a model at the back. */
export const PENALTY_MS = 10 * 60 * 1000;
/** What a failure adds to the expected cost while it is worn. */
export const FAILURE_PENALTY_MS = 60000;
const FLUSH_DELAY_MS = 2000;

let cache: Map<string, StoredCost> | undefined;

/** Read lazily, never at import: DB_DIR is only known once the server runs. */
function costs(): Map<string, StoredCost> {
  if (!cache) cache = loadModelCosts();
  return cache;
}

let flushTimer: NodeJS.Timeout | undefined;
/** Debounced and unref'd: a chat notes a cost twice, and the file is a cache, not a ledger. */
function rememberCosts(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = undefined;
    saveModelCosts(costs());
  }, FLUSH_DELAY_MS);
  flushTimer.unref?.();
}

/** Write now (shutdown, tests) instead of waiting for the debounce. */
export function flushModelCosts(): void {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = undefined; }
  if (cache) saveModelCosts(cache);
}

/** Record what a call to `model` cost in milliseconds; `ok` false marks a failure. */
export function noteModelCost(model: string, ms: number, ok: boolean, now = Date.now()): void {
  const prev = costs().get(model);
  const ewmaMs = prev ? Math.round(prev.ewmaMs * 0.6 + ms * 0.4) : ms;
  costs().set(model, {
    ewmaMs,
    ...(ok ? {} : { failedAt: now }),
    ...(prev?.mute ? { mute: true } : {}),
  });
  rememberCosts();
}

/** Mark a model as answering with no words (or clear the mark once it does answer). */
export function noteModelMute(model: string, mute: boolean): void {
  const prev = costs().get(model);
  if (!prev) {
    if (!mute) return;
    costs().set(model, { ewmaMs: UNTRIED_MS, mute: true });
    rememberCosts();
    return;
  }
  if (Boolean(prev.mute) === mute) return;
  const next: StoredCost = { ewmaMs: prev.ewmaMs, ...(prev.failedAt ? { failedAt: prev.failedAt } : {}) };
  if (mute) next.mute = true;
  costs().set(model, next);
  rememberCosts();
}

export function modelIsMute(model: string): boolean {
  return costs().get(model)?.mute === true;
}

/** Has anything ever been measured for this model? */
export function modelIsMeasured(model: string): boolean {
  return costs().has(model);
}

/** Expected cost right now; a failure is worn for ten minutes. */
export function modelCostMs(model: string, now = Date.now()): number {
  const c = costs().get(model);
  if (!c) return UNTRIED_MS;
  return c.failedAt && now - c.failedAt < PENALTY_MS ? c.ewmaMs + FAILURE_PENALTY_MS : c.ewmaMs;
}

/** Test seam: forget everything in memory so the next read reloads from the file. */
export function resetModelCosts(): void {
  cache = undefined;
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = undefined; }
}
