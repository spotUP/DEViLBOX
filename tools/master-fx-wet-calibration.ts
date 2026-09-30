/**
 * Master FX wet-path calibration run - the level each delay, reverb and
 * modulation effect gives at 100 % wet, at its default parameters.
 *
 * Measures with the MCP tool measure_master_effect: stereo pink noise straight
 * into the master effects input, energy of both channels, the effect's own
 * output (effectDb) and the chain's after its compensation gain (chainDb).
 * The level these effects need belongs in their WET path (a gain after the
 * dry/wet mix moves the dry signal too), so effectDb is the number to cancel.
 *
 * Resumable: each result is written to tools/master-fx-wet-calibration.json as
 * it completes and skipped next run.
 *   npx tsx tools/master-fx-wet-calibration.ts                  # everything not yet measured
 *   npx tsx tools/master-fx-wet-calibration.ts --only SpaceEcho # one (repeatable)
 *   npx tsx tools/master-fx-wet-calibration.ts --redo           # re-measure everything
 * Needs: npm run dev:fullstack, DEViLBOX open in the browser, transport stopped.
 */
import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'master-fx-wet-calibration.json');
const GROUPS = ['Reverb & Delay', 'Modulation'];
type Row = { type: string; category: string; effectDb: number; chainDb: number; compensationDb: number; at: string };

const ws = new WebSocket('ws://localhost:4003/mcp');
function call(method: string, params: Record<string, unknown> = {}, timeoutMs = 60000): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = `wet-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const t = setTimeout(() => { ws.off('message', h); reject(new Error('timeout ' + method)); }, timeoutMs);
    const h = (d: WebSocket.Data) => {
      const m = JSON.parse(d.toString());
      if (m.id !== id) return;
      clearTimeout(t); ws.off('message', h);
      if (m.type === 'error') reject(new Error(m.error)); else resolve(m.result?.data ?? m.data ?? m.result ?? m);
    };
    ws.on('message', h);
    ws.send(JSON.stringify({ id, type: 'call', method, params }));
  });
}

ws.on('open', async () => {
  const args = process.argv.slice(2);
  const only = args.flatMap((a, i) => (a === '--only' && args[i + 1] ? [args[i + 1]] : []));
  let store: Record<string, Row> = {};
  try { store = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { /* first run */ }
  const groups = (await call('evaluate_script', { code: `(async () => {
    const u = await import('/src/constants/unifiedEffects.ts');
    const g = u.getEffectsByGroup();
    return ${JSON.stringify(GROUPS)}.flatMap((k) => (g[k] ?? []).map((e) => ({ type: e.type, category: e.category })));
  })()` })).result as { type: string; category: string }[];
  const seen = new Set<string>();
  for (const e of groups) {
    if (seen.has(e.type)) continue; seen.add(e.type);
    if (only.length && !only.includes(e.type)) continue;
    if (!only.length && !args.includes('--redo') && store[e.type]) continue;
    const settleMs = e.category === 'wam' ? 8000 : 3500;
    const r = await call('measure_master_effect', { type: e.type, category: e.category, seconds: 4, settleMs }, 90000).catch((err) => ({ error: (err as Error).message }));
    if (r.error) { console.log(`ERR ${e.type}: ${r.error}`); continue; }
    store[e.type] = { type: e.type, category: e.category, effectDb: r.effectDb, chainDb: r.chainDb, compensationDb: r.compensationDb, at: new Date().toISOString() };
    fs.writeFileSync(OUT, JSON.stringify(store, null, 2));
    console.log(`${e.type.padEnd(24)} effect ${String(r.effectDb).padStart(6)}  chain ${String(r.chainDb).padStart(6)}  comp ${r.compensationDb}`);
  }
  ws.close();
});
