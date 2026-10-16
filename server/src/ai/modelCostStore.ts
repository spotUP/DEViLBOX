/**
 * What each free model costs, remembered across restarts.
 *
 * The free-model picker learns which model answers fastest by measuring it (an
 * exponential moving average of the round trip, see modelCosts.ts). Held only
 * in memory, every deploy threw the measurements away and the picker went back
 * to treating an untried model as optimistically fast. On the AmiExpress board
 * that cost the difference between a 1 s and a 21 s reply.
 *
 * A JSON file beside the database, written after a change and read once.
 * Not a table: it is a cache of measurements, rewritten constantly, and losing
 * it costs a slow reply rather than data. Ported from the BBS's
 * sysop-ai/model-cost-store.ts.
 */
import * as fs from 'fs';
import * as path from 'path';

/**
 * `mute` is a model that answers with no words (it takes a tool call and then
 * writes nothing), useless for a chat reply however fast it is.
 */
export interface StoredCost { ewmaMs: number; failedAt?: number; mute?: boolean }

/**
 * Where the measurements live: beside the database (same DB_DIR rule as
 * db/database.ts, which cannot be imported here because importing it opens the
 * SQLite file). Resolved on every call so a changed DB_DIR is honoured.
 */
export function costFilePath(): string {
  const dir = process.env.DB_DIR || path.join(__dirname, '../../data');
  return path.join(dir, 'ai-model-costs.json');
}

/**
 * Read what the last run measured. Any failure (no file, unreadable,
 * half-written) answers with an empty map: a cache that cannot be read is a
 * cache miss, never an error a caller has to handle.
 */
export function loadModelCosts(): Map<string, StoredCost> {
  try {
    const raw = JSON.parse(fs.readFileSync(costFilePath(), 'utf8')) as Record<string, Partial<StoredCost> | null>;
    const costs = new Map<string, StoredCost>();
    for (const [model, cost] of Object.entries(raw ?? {})) {
      // Only what this file is for: milliseconds, and optionally a failure time.
      if (typeof cost?.ewmaMs !== 'number' || !Number.isFinite(cost.ewmaMs)) continue;
      costs.set(model, {
        ewmaMs: cost.ewmaMs,
        ...(typeof cost.failedAt === 'number' ? { failedAt: cost.failedAt } : {}),
        ...(cost.mute === true ? { mute: true } : {}),
      });
    }
    return costs;
  } catch {
    return new Map();
  }
}

/**
 * Write the measurements through a temporary file and a rename, so a process
 * killed mid-write leaves the previous measurements, not a truncated file.
 * Never throws; the path is resolved INSIDE the try so a failure in resolving
 * it cannot escape from the unref'd flush timer that calls this.
 */
export function saveModelCosts(costs: Map<string, StoredCost>): void {
  try {
    const file = costFilePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(costs), null, 2));
    fs.renameSync(tmp, file);
  } catch {
    // A server that cannot write its cache still answers; it relearns the timings.
  }
}
