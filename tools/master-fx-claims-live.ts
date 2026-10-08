/**
 * Master FX preset claims, measured LIVE on the playing song (real Chrome, the
 * real WASM worklets, a real MOD) with the MCP's measure_master_effect.
 *
 * The offline rig (src/test/audio/masterChainRig.ts) reads every claim of a
 * preset; this reads the ones a song-fed tap can see - octave-band tilt and
 * crest - from the browser, and compares them with the same bounds in
 * src/constants/masterPresetClaims.ts, so the offline numbers are checked
 * against what the owner hears. Harmonic and tail claims need a sine or a
 * burst the tap cannot inject; they stay offline.
 *
 *   npx tsx tools/master-fx-claims-live.ts --group Amiga            # every preset of a group
 *   npx tsx tools/master-fx-claims-live.ts --live-only              # the presets the offline rig cannot build
 *   npx tsx tools/master-fx-claims-live.ts --only "Chipgold"        # one (repeatable)
 *   npx tsx tools/master-fx-claims-live.ts --group Amiga --seconds 8
 * Needs: npm run dev:fullstack, DEViLBOX open, a song LOADED AND PLAYING (play first,
 * `stop` when done). The master chain is put back by the tool after each preset.
 * Results go to tools/master-fx-claims-live.json as they complete (resumable; --redo).
 */
import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { FX_PRESETS } from '../src/constants/fxPresets';
import { PRESET_CLAIMS, LIVE_CLAIMS, liveOnlyReason } from '../src/constants/masterPresetClaims';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, 'master-fx-claims-live.json');
const args = process.argv.slice(2);
const listArg = (flag: string) => args.flatMap((a, i) => (a === flag && args[i + 1] ? [args[i + 1]] : []));
const seconds = Number(listArg('--seconds')[0] ?? 8);
let store: Record<string, Record<string, unknown>> = {};
try { store = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { /* first run */ }

const ws = new WebSocket('ws://localhost:4003/mcp');
function call(method: string, params: Record<string, unknown> = {}, timeoutMs = 120000): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = `claims-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
  const group = listArg('--group')[0];
  const liveOnly = args.includes('--live-only');
  const octave = (hz: number) => [63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000].reduce((a, b) => (Math.abs(Math.log2(b / hz)) < Math.abs(Math.log2(a / hz)) ? b : a));
  for (const p of FX_PRESETS) {
    const inGroup = group && PRESET_CLAIMS[group as keyof typeof PRESET_CLAIMS]?.[p.name];
    const isLiveOnly = liveOnly && liveOnlyReason(p.effects);
    if (!(only.includes(p.name) || inGroup || isLiveOnly)) continue;
    if (!args.includes('--redo') && store[p.name]) continue;
    // A WAM plugin measured on a playing song took the page down (2026-10-08, Big Muff Wall): opt in with --wam.
    if (!args.includes('--wam') && p.effects.some((e) => e.type.startsWith('WAM'))) { console.log(`skipped (WAM): ${p.name}`); continue; }
    const slow = p.effects.some((e) => e.type === 'Neural' || e.type.startsWith('WAM') || e.type === 'SwedishChainsaw');
    const r = await call('measure_master_effect', { effects: p.effects, gainCompensationDb: p.gainCompensationDb ?? 0, source: 'song', seconds, settleMs: slow ? 8000 : 4000 }).catch((e) => ({ error: (e as Error).message }));
    if (r.error) { console.log(`ERR ${p.name}: ${r.error}`); if (/No browser|playing/.test(r.error)) break; continue; }
    // The octave-band tap sits after the make-up gain; tilts are differences, so it cancels.
    const band = (hz: number) => r.chainBandsDb[octave(hz)] as number;
    const crestDelta = Math.round((r.crestDb.chain - r.crestDb.input) * 10) / 10;
    const results: Record<string, number> = {};
    const lines: string[] = [];
    const claims = (group ? PRESET_CLAIMS[group as keyof typeof PRESET_CLAIMS]?.[p.name] : undefined) ?? LIVE_CLAIMS[p.name] ?? [];
    for (const c of claims) {
      let v: number | null = null;
      if (c.m.k === 'tilt') v = band(c.m.hz) - band(c.m.ref ?? 1000);
      else if (c.m.k === 'crest') v = crestDelta;
      if (v === null) continue;
      v = Math.round(v * 10) / 10;
      results[c.say] = v;
      const ok = (c.min === undefined || v >= c.min) && (c.max === undefined || v <= c.max);
      lines.push(`  ${ok ? '[OK]  ' : '[FAIL]'} ${c.say}: ${v}${c.min !== undefined ? ` (>= ${c.min})` : ''}${c.max !== undefined ? ` (<= ${c.max})` : ''}`);
    }
    store[p.name] = { chainDb: r.chainDb, crestDelta, bandsDb: r.chainBandsDb, results };
    fs.writeFileSync(OUT, JSON.stringify(store, null, 2));
    console.log(`${p.name}: chain ${r.chainDb} dB re input, crest ${crestDelta} dB, bands ${JSON.stringify(r.chainBandsDb)}\n${lines.join('\n')}`);
  }
  ws.close();
});
