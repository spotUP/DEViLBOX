/**
 * Dub move audibility audit: for every dub move, what it adds to the dub
 * return and the master output on the playing song.
 *
 * Each move is measured against a baseline recorded right before it (no move
 * fired), 3 s each, with measure_dub_echo_response (stages return_ + master).
 * A move whose return and master both stay within 1 dB of the baseline did
 * nothing audible. Auto Dub is paused for the run (its own moves would land in
 * the recordings) and restored after; the song is played for the run and
 * stopped after.
 *
 * Resumable: results go to tools/dub-move-audit.json as they complete.
 *   npx tsx tools/dub-move-audit.ts                # every move not yet measured
 *   npx tsx tools/dub-move-audit.ts --only echoThrow --only snareCrack
 *   npx tsx tools/dub-move-audit.ts --redo
 * Needs: dev stack, DEViLBOX open with a song loaded and the dub bus on.
 */
import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, 'dub-move-audit.json');
const MOVES = fs.readdirSync(path.join(DIR, '../src/engine/dub/moves'))
  .filter((f) => f.endsWith('.ts') && !f.startsWith('_') && f !== 'index.ts').map((f) => f.replace(/\.ts$/, ''));
const args = process.argv.slice(2);
const only = args.flatMap((a, i) => (a === '--only' && args[i + 1] ? [args[i + 1]] : []));
const CHANNEL = Number(args[args.indexOf('--channel') + 1] ?? 2) || 2;
type Row = { move: string; returnDeltaDb: number; masterDeltaDb: number; audible: boolean; at: string };
let store: Record<string, Row> = {};
try { store = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { /* first run */ }

const ws = new WebSocket('ws://localhost:4003/mcp');
function call(method: string, params: Record<string, unknown> = {}, timeoutMs = 60000): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = `mv-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
const rec = (move: string) => call('measure_dub_echo_response', { move, channel: CHANNEL, stages: ['return_', 'master'], seconds: 3, gapMs: 300 });

ws.on('open', async () => {
  const autoDub = await call('get_auto_dub_state');
  await call('set_auto_dub_config', { enabled: false }).catch(() => {});
  await call('play');
  await new Promise((r) => setTimeout(r, 1500));
  try {
    for (const move of MOVES) {
      if (only.length && !only.includes(move)) continue;
      if (!args.includes('--redo') && store[move]) continue;
      const base = await rec('none');
      const hit = await rec(move);
      if (base.error || hit.error) { console.log(`ERR ${move}: ${base.error ?? hit.error}`); continue; }
      const d = (k: string) => Math.round((hit.stages[k].rmsDb - base.stages[k].rmsDb) * 10) / 10;
      const row: Row = { move, returnDeltaDb: d('return_'), masterDeltaDb: d('master'), audible: false, at: new Date().toISOString() };
      row.audible = Math.abs(row.returnDeltaDb) >= 1 || Math.abs(row.masterDeltaDb) >= 1;
      store[move] = row;
      fs.writeFileSync(OUT, JSON.stringify(store, null, 2));
      console.log(`${row.audible ? 'ok    ' : 'SILENT'} ${move.padEnd(20)} return ${String(row.returnDeltaDb).padStart(6)} dB  master ${String(row.masterDeltaDb).padStart(6)} dB`);
    }
  } finally {
    await call('stop').catch(() => {});
    await call('set_auto_dub_config', { enabled: !!autoDub.enabled }).catch(() => {});
    ws.close();
  }
});
