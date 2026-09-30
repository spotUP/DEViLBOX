/**
 * Dub move audibility audit, from the per-fire log (moveAudibilityLog):
 * every dub move fired once on the playing song, 4 s apart (held moves
 * released after 1.5 s), then each fire's measured effect on the dub return
 * (peak vs peak) and the master (average vs average) with its verdict.
 * Auto Dub is paused for the run and restored after; the song is played for
 * the run and stopped after. Results go to tools/dub-move-audit.json.
 *   npx tsx tools/dub-move-audit.ts [--only echoThrow --only snareCrack] [--channel 2]
 * Needs: dev stack, DEViLBOX open with a song loaded and the dub bus on.
 */
import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, 'dub-move-audit.json');
const args = process.argv.slice(2);
const only = args.flatMap((a, i) => (a === '--only' && args[i + 1] ? [args[i + 1]] : []));
const ci = args.indexOf('--channel');
const CHANNEL = ci >= 0 ? Number(args[ci + 1]) : 2;
const MOVES = fs.readdirSync(path.join(DIR, '../src/engine/dub/moves'))
  .filter((f) => f.endsWith('.ts') && !f.startsWith('_') && f !== 'index.ts').map((f) => f.replace(/\.ts$/, ''))
  .filter((m) => !only.length || only.includes(m));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ws = new WebSocket('ws://localhost:4003/mcp');
function call(method: string, params: Record<string, unknown> = {}, timeoutMs = 30000): Promise<any> {
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

ws.on('open', async () => {
  const autoDub = await call('get_auto_dub_state');
  await call('set_auto_dub_config', { enabled: false }).catch(() => {});
  await call('play');
  await wait(2000);
  try {
    for (const move of MOVES) {
      const r = await call('fire_dub_move', { moveId: move, channelId: CHANNEL }).catch((e) => ({ error: (e as Error).message }));
      await wait(1500);
      if (r?.heldHandle) await call('release_dub_move', { heldHandle: r.heldHandle }).catch(() => {});
      await wait(2500);
    }
    await wait(3000);
    const audit = await call('get_dub_move_audit', { last: 100 });
    const mine = (audit.results as Array<Record<string, any>>).filter((x) => x.origin !== 'ai' && MOVES.includes(x.moveId)).slice(-MOVES.length);
    fs.writeFileSync(OUT, JSON.stringify(mine, null, 2));
    for (const x of mine) {
      console.log(`${x.verdict.padEnd(6)} ${x.moveId.padEnd(20)} return peak ${x.beforeRetPeak} -> ${x.peak.ret} (${x.delta.ret >= 0 ? '+' : ''}${x.delta.ret})  master avg ${x.before.master} -> ${x.peak.master} (${x.delta.master >= 0 ? '+' : ''}${x.delta.master})`);
    }
    console.log(`SILENT: ${mine.filter((x) => x.verdict === 'SILENT').map((x) => x.moveId).join(', ')}`);
  } finally {
    await call('stop').catch(() => {});
    await call('set_auto_dub_config', { enabled: !!autoDub.enabled }).catch(() => {});
    ws.close();
  }
});
