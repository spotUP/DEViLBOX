import WebSocket from 'ws';
import { FX_PRESETS } from '../src/constants/fxPresets';
const ws = new WebSocket('ws://localhost:4003/mcp');
const call = (method: string, params: Record<string, unknown> = {}) => new Promise<any>((res, rej) => {
  const id = 'b' + Math.random(); const t = setTimeout(() => rej(new Error('timeout ' + method)), 30000);
  const h = (d: WebSocket.Data) => { const m = JSON.parse(d.toString()); if (m.id === id) { clearTimeout(t); ws.off('message', h); res(m.result?.data ?? m.data ?? m.result ?? m); } };
  ws.on('message', h); ws.send(JSON.stringify({ id, type: 'call', method, params }));
});
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const FREQS = [50, 100, 250, 1000, 4000];
ws.on('open', async () => {
  const saved = (await call('get_audio_state')).masterEffects;
  const level = async (fx: unknown[]) => {
    await call('set_master_effects', { effects: fx }); await sleep(fx.length ? 5000 : 800);
    const out: number[] = [];
    for (const f of FREQS) {
      await call('test_tone', { action: 'start', mode: 'sine', frequency: f, level: -18, durationMs: 4000 }); await sleep(1500);
      const l = await call('get_audio_level', { durationMs: 800 });
      out.push(l.rmsAvg); await call('test_tone', { action: 'stop' }); await sleep(300);
    }
    return out;
  };
  const base = await level([]);
  if (process.argv[2] === '--each') {
    const p = FX_PRESETS.find(x => x.name === process.argv[3])!;
    for (const e of p.effects) {
      const l = await level([e] as unknown[]);
      const d = FREQS.map((f, i) => 20 * Math.log10(l[i] / base[i]));
      console.log(e.type.padEnd(22), FREQS.map((f, i) => `${f}:${d[i].toFixed(1)}`).join(' '));
    }
    await call('set_master_effects', { effects: saved }); ws.close(); return;
  }
  for (const name of process.argv.slice(2)) {
    const p = FX_PRESETS.find(x => x.name === name)!;
    const l = await level(p.effects as unknown[]);
    const d = FREQS.map((f, i) => 20 * Math.log10(l[i] / base[i]));
    console.log(name.padEnd(22), FREQS.map((f, i) => `${f}:${(d[i] - d[3]).toFixed(1)}`).join(' '), ` (relative to 1 kHz; 1 kHz itself ${d[3].toFixed(1)} dB)`);
  }
  await call('set_master_effects', { effects: saved });
  ws.close();
});
