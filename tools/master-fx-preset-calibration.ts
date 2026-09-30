/**
 * Master FX preset make-up gains, measured with stereo pink noise.
 *
 * tools/fx-preset-audit.ts measures presets with five steady sine oscillators
 * plus noise through get_audio_level (a mono downmix after the master volume).
 * Through a reverb or delay a steady sine interferes with its own delayed copy,
 * so its readings swing by several dB per preset (Hall Reverb read -4.1 dB
 * after a +3.2 dB make-up, 2026-09-30). This uses measure_master_effect with
 * the preset's whole chain and no make-up: stereo centre pink noise into the
 * master effects input, energy of both channels. The make-up is -chainDb.
 *
 * Resumable: each preset's result goes to tools/master-fx-preset-calibration.json
 * as it completes and is skipped next run.
 *   npx tsx tools/master-fx-preset-calibration.ts --containing Reverb --containing Delay  # presets using these types
 *   npx tsx tools/master-fx-preset-calibration.ts --only "Hall Reverb"                    # one (repeatable)
 *   npx tsx tools/master-fx-preset-calibration.ts --redo ...                              # re-measure
 *   npx tsx tools/master-fx-preset-calibration.ts --song --only "Ambient"                # with its make-up, on the PLAYING song (records songDb)
 *   npx tsx tools/master-fx-preset-calibration.ts --write [--except "Name"]               # put measured make-ups into fxPresets.ts
 * Needs: npm run dev:fullstack, DEViLBOX open and clicked once, transport stopped.
 */
import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, 'master-fx-preset-calibration.json');
const PRESETS_TS = path.join(DIR, '../src/constants/fxPresets.ts');
type Row = { name: string; types: string[]; chainDb: number; makeUpDb: number; oldMakeUpDb: number; at: string;
  /** --song: the chain's level (with its make-up) on the playing song, dB. */
  songDb?: number };

const args = process.argv.slice(2);
const listArg = (flag: string) => args.flatMap((a, i) => (a === flag && args[i + 1] ? [args[i + 1]] : []));
let store: Record<string, Row> = {};
try { store = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { /* first run */ }

/** Round to 0.1 dB; readings within 0.5 dB of unity need no make-up. */
const makeUp = (chainDb: number): number => (Math.abs(chainDb) < 0.5 ? 0 : Math.round(-chainDb * 10) / 10);

if (args.includes('--write')) {
  let src = fs.readFileSync(PRESETS_TS, 'utf8');
  let changed = 0;
  const except = listArg('--except');
  for (const r of Object.values(store)) {
    if (except.includes(r.name)) { console.log(`kept: ${r.name}`); continue; }
    const esc = r.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "\\\\'");
    // The make-up sits after the tags, before a line break or an inline `effects:`.
    const re = new RegExp(`(\\{ name: '${esc}',[^\\n]*?)(, gainCompensationDb: -?[0-9.]+)?(,\\n|, effects:)`);
    const m = re.exec(src);
    if (!m) { console.log(`not found in fxPresets.ts: ${r.name}`); continue; }
    const next = r.makeUpDb === 0 ? `${m[1]}${m[3]}` : `${m[1]}, gainCompensationDb: ${r.makeUpDb}${m[3]}`;
    if (next !== m[0]) { src = src.replace(m[0], next); changed++; }
  }
  fs.writeFileSync(PRESETS_TS, src);
  console.log(`fxPresets.ts: ${changed} make-up gains written`);
  process.exit(0);
}

const ws = new WebSocket('ws://localhost:4003/mcp');
function call(method: string, params: Record<string, unknown> = {}, timeoutMs = 90000): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = `preset-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
  const only = listArg('--only');
  const containing = listArg('--containing');
  const presets = (await call('evaluate_script', { code: `(async () => {
    const p = await import('/src/constants/fxPresets.ts');
    return p.FX_PRESETS.map((x) => ({ name: x.name, gainCompensationDb: x.gainCompensationDb ?? 0, effects: x.effects }));
  })()` })).result as { name: string; gainCompensationDb: number; effects: { type: string }[] }[];
  for (const p of presets) {
    const types = p.effects.map((e) => e.type);
    if (only.length && !only.includes(p.name)) continue;
    if (containing.length && !types.some((t) => containing.includes(t))) continue;
    const slow = types.some((t) => t === 'Neural' || t.startsWith('WAM'));
    const songMode = args.includes('--song');
    if (songMode) {
      const r = await call('measure_master_effect', { effects: p.effects, gainCompensationDb: p.gainCompensationDb, source: 'song', seconds: 10, settleMs: slow || types.includes('SwedishChainsaw') ? 8000 : 4000 }).catch((e) => ({ error: (e as Error).message }));
      if (r.error) { console.log(`ERR ${p.name}: ${r.error}`); if (/No browser|song playing/.test(r.error)) break; continue; }
      if (store[p.name]) { store[p.name].songDb = r.chainDb; fs.writeFileSync(OUT, JSON.stringify(store, null, 2)); }
      console.log(`${p.name.padEnd(28)} song ${String(r.chainDb).padStart(6)} dB with make-up ${p.gainCompensationDb}  [${types.join('+')}]`);
      continue;
    }
    if (!args.includes('--redo') && store[p.name]) continue;
    const r = await call('measure_master_effect', { effects: p.effects, gainCompensationDb: 0, seconds: 4, settleMs: slow ? 8000 : 4000 }).catch((e) => ({ error: (e as Error).message }));
    if (r.error) {
      console.log(`ERR ${p.name}: ${r.error}`);
      if (/No browser connected|audio clock/.test(r.error)) break; // the rest would all fail the same way
      continue;
    }
    store[p.name] = { name: p.name, types, chainDb: r.chainDb, makeUpDb: makeUp(r.chainDb), oldMakeUpDb: p.gainCompensationDb, at: new Date().toISOString() };
    fs.writeFileSync(OUT, JSON.stringify(store, null, 2));
    console.log(`${p.name.padEnd(28)} chain ${String(r.chainDb).padStart(6)} dB  make-up ${store[p.name].makeUpDb} (was ${p.gainCompensationDb})  [${types.join('+')}]`);
  }
  ws.close();
});
