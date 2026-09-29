/**
 * Master FX frequency-response audit — every effect in the Master FX browser,
 * measured END TO END in the running app (the same path a user hears).
 *
 * For each effect at its default parameters (wet 100 %): a -18 dBFS sine at
 * each test frequency, output level vs the same sine with no master FX.
 * Flags an effect that goes silent, boosts more than 6 dB, or tilts more than
 * 6 dB between frequencies. Written 2026-09-29 after an Exciter that added
 * its driven band back (+17.8 dB at 4 kHz) and multiband crossovers that
 * notched -47 dB, none of which a level-only audit saw.
 *
 * Resumable: each effect's result is written to
 * tools/master-fx-response-audit.json as it completes and skipped next run.
 *   npx tsx tools/master-fx-response-audit.ts              # everything not yet measured
 *   npx tsx tools/master-fx-response-audit.ts --only Exciter --only Maximizer
 *   npx tsx tools/master-fx-response-audit.ts --redo       # re-measure everything
 *   npx tsx tools/master-fx-response-audit.ts --flagged    # re-measure flagged ones
 *   npx tsx tools/master-fx-response-audit.ts --broadband  # rich tone, level + octave bands (time-based effects)
 * The browser's master chain is saved first and restored at the end.
 * Needs: npm run dev:fullstack, DEViLBOX open in the browser.
 */
import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'master-fx-response-audit.json');
const FREQS = [60, 250, 1000, 4000, 10000];

type Row = { type: string; category: string; label: string; gainsDb: number[]; flags: string[]; at: string };
/** savedChain: the user's master chain, kept here until the run restores it, so a crashed run can still put it back. */
type BroadRow = { type: string; category: string; label: string; levelDb: number; bandsDb: Record<string, number>; flags: string[]; at: string };
type Store = { freqs: number[]; baselineRms: number[]; results: Record<string, Row>; savedChain?: unknown[];
  /** --broadband: the rich test tone (oscillators + white noise), overall level and per-band energy vs no FX. */
  broadband?: { baseline: { rms: number; bands: Record<string, number> }; results: Record<string, BroadRow> } };

const ws = new WebSocket('ws://localhost:4003/mcp');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** An MCP call that waits out a browser reload (the dev server reloads the tab on engine edits). */
async function call(method: string, params: Record<string, unknown> = {}, timeoutMs = 30000): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    try { return await callOnce(method, params, timeoutMs); }
    catch (e) {
      if (!/No browser connected/.test((e as Error).message) || attempt >= 40) throw e;
      if (attempt === 0) console.log('  (browser disconnected - waiting for it to come back)');
      await sleep(3000);
    }
  }
}

function callOnce(method: string, params: Record<string, unknown>, timeoutMs: number): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = `fxr-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

const BANDS = ['63', '125', '250', '500', '1000', '2000', '4000', '8000', '16000'];

/** Rich tone: overall RMS and dB per octave band (get_audio_level bands: true). */
async function broadband(): Promise<{ rms: number; bands: Record<string, number> }> {
  await call('test_tone', { action: 'start', mode: 'rich', level: -18, durationMs: 6000 });
  await sleep(1500);
  const lvl = await call('get_audio_level', { durationMs: 2000, bands: true });
  await call('test_tone', { action: 'stop' });
  await sleep(300);
  return { rms: lvl.rmsAvg ?? 0, bands: lvl.bandsDb ?? {} };
}

async function levels(): Promise<number[]> {
  const out: number[] = [];
  for (const f of FREQS) {
    await call('test_tone', { action: 'start', mode: 'sine', frequency: f, level: -18, durationMs: 5000 });
    await sleep(1200);
    const l = await call('get_audio_level', { durationMs: 600 });
    out.push(l.rmsAvg ?? 0);
    await call('test_tone', { action: 'stop' });
    await sleep(250);
  }
  return out;
}

function flagsFor(g: number[]): string[] {
  const f: string[] = [];
  if (g.every((x) => x < -40)) f.push('silent');
  if (Math.max(...g) > 6) f.push(`boost ${Math.max(...g).toFixed(1)} dB`);
  const tilt = Math.max(...g) - Math.min(...g);
  if (tilt > 6 && !g.every((x) => x < -40)) f.push(`tilt ${tilt.toFixed(1)} dB`);
  return f;
}

ws.on('open', async () => {
  const args = process.argv.slice(2);
  const only = args.flatMap((a, i) => (a === '--only' && args[i + 1] ? [args[i + 1]] : []));
  let store: Store = { freqs: FREQS, baselineRms: [], results: {} };
  try { store = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { /* first run */ }
  const save = () => fs.writeFileSync(OUT, JSON.stringify(store, null, 2));

  // The effect list and defaults, from the app itself.
  const effects: { type: string; category: string; label: string; neuralModelIndex?: number; defaults: Record<string, unknown> }[] =
    (await call('evaluate_script', { code: `(async () => {
      const u = await import('/src/constants/unifiedEffects.ts');
      const f = await import('/src/engine/InstrumentFactory.ts');
      return Object.values(u.getEffectsByGroup()).flat().map(e => ({ type: e.type, category: e.category, label: e.label,
        neuralModelIndex: e.neuralModelIndex, defaults: f.getDefaultEffectParameters(e.type) ?? {} }));
    })()` }, 60000)).result;

  // A crashed earlier run left the user's chain here: that is the one to restore.
  const saved = store.savedChain ?? (await call('get_audio_state')).masterEffects ?? [];
  store.savedChain = saved; save();
  try { await call('stop'); } catch { /* not playing */ }
  await call('set_master_effects', { effects: [] }); await sleep(800);
  const base = await levels();
  store.freqs = FREQS; store.baselineRms = base;
  console.log('baseline dBFS:', FREQS.map((f, i) => `${f}:${(20 * Math.log10(base[i] || 1e-9)).toFixed(1)}`).join(' '));

  if (args.includes('--broadband')) {
    const dB = (x: number, ref: number) => Math.round(20 * Math.log10(Math.max(x, 1e-9) / Math.max(ref, 1e-9)) * 10) / 10;
    const base = await broadband();
    store.broadband = { baseline: base, results: store.broadband?.results ?? {} };
    console.log('broadband baseline rms', base.rms.toFixed(4), JSON.stringify(base.bands));
    const seen = new Set<string>();
    for (const e of effects) {
      const k = `${e.type}|${e.label}`;
      if (seen.has(k)) continue; seen.add(k);
      if (only.length && !only.includes(e.type) && !only.includes(e.label)) continue;
      if (!only.length && !args.includes('--redo') && store.broadband.results[e.label]) continue;
      try {
        await call('set_master_effects', { effects: [{ category: e.category, type: e.type, enabled: true, wet: 100, parameters: e.defaults, neuralModelIndex: e.neuralModelIndex }] });
        await sleep(e.category === 'neural' || e.category === 'wam' ? 8000 : 3500);
        const m = await broadband();
        const bandsDb = Object.fromEntries(BANDS.map((b) => [b, Math.round(((m.bands[b] ?? -200) - (base.bands[b] ?? -200)) * 10) / 10]));
        const levelDb = dB(m.rms, base.rms);
        const vals = Object.values(bandsDb);
        const flags: string[] = [];
        if (levelDb < -40) flags.push('silent');
        else {
          if (Math.abs(levelDb) > 6) flags.push(`level ${levelDb} dB`);
          if (Math.max(...vals) - Math.min(...vals) > 9) flags.push(`band spread ${(Math.max(...vals) - Math.min(...vals)).toFixed(1)} dB`);
        }
        store.broadband.results[e.label] = { type: e.type, category: e.category, label: e.label, levelDb, bandsDb, flags, at: new Date().toISOString() };
        save();
        console.log(`${flags.length ? '!!' : 'ok'} ${e.label.padEnd(28)} level ${levelDb} ${BANDS.map((b) => `${b}:${bandsDb[b]}`).join(' ')} ${flags.join(', ')}`);
      } catch (err) { console.log(`ERR ${e.label}: ${(err as Error).message}`); }
    }
    await call('set_master_effects', { effects: saved });
    delete store.savedChain; save();
    ws.close();
    return;
  }

  // The browser lists some effects under more than one group; measure each once.
  const seen = new Set<string>();
  for (let i = effects.length - 1; i >= 0; i--) {
    const k = `${effects[i].type}|${effects[i].label}`;
    if (seen.has(k)) effects.splice(i, 1); else seen.add(k);
  }
  const key = (e: { label: string }) => e.label;
  const todo = effects.filter((e) => {
    if (only.length) return only.includes(e.type) || only.includes(e.label);
    if (args.includes('--redo')) return true;
    if (args.includes('--flagged')) return (store.results[key(e)]?.flags.length ?? 1) > 0;
    return !store.results[key(e)];
  });
  console.log(`${todo.length} of ${effects.length} effects to measure`);

  for (const e of todo) {
    try {
      await call('set_master_effects', { effects: [{ category: e.category, type: e.type, enabled: true, wet: 100,
        parameters: e.defaults, neuralModelIndex: e.neuralModelIndex }] });
      await sleep(e.category === 'neural' || e.category === 'wam' ? 8000 : 3500);
      const l = await levels();
      const gains = l.map((x, i) => 20 * Math.log10(Math.max(x, 1e-9) / Math.max(base[i], 1e-9)));
      const row: Row = { type: e.type, category: e.category, label: e.label, gainsDb: gains.map((g) => Math.round(g * 10) / 10), flags: flagsFor(gains), at: new Date().toISOString() };
      store.results[key(e)] = row; save();
      console.log(`${row.flags.length ? '!!' : 'ok'} ${e.label.padEnd(28)} ${FREQS.map((f, i) => `${f}:${row.gainsDb[i]}`).join(' ')} ${row.flags.join(', ')}`);
    } catch (err) {
      console.log(`ERR ${e.label}: ${(err as Error).message}`);
    }
  }

  await call('set_master_effects', { effects: saved });
  delete store.savedChain; save();
  const flagged = Object.values(store.results).filter((r) => r.flags.length);
  console.log(`\n${flagged.length} flagged of ${Object.keys(store.results).length} measured:`);
  for (const r of flagged) console.log(`  ${r.label.padEnd(28)} ${r.flags.join(', ')}`);
  ws.close();
});
