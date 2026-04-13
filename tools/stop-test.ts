import { WebSocket } from 'ws';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

const WS_URL = 'ws://localhost:4003/mcp';
const TEST_DIR = '/Users/spot/Code/DEViLBOX/public/data/test-songs';

let ws: WebSocket;
const pending = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void }>();

function connect(): Promise<void> {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(WS_URL);
    ws.on('open', resolve);
    ws.on('error', reject);
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      const p = pending.get(msg.id);
      if (p) { pending.delete(msg.id); if (msg.type === 'error') p.reject(new Error(msg.error)); else p.resolve(msg.data); }
    });
  });
}

function call(method: string, params: Record<string, any> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`timeout`)); }, 10000);
    pending.set(id, { resolve: (v) => { clearTimeout(timeout); resolve(v); }, reject: (e) => { clearTimeout(timeout); reject(e); } });
    ws.send(JSON.stringify({ id, type: 'call', method, params }));
  });
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  await connect();
  const dirs = readdirSync(TEST_DIR).filter(d => statSync(join(TEST_DIR, d)).isDirectory()).sort();

  for (const dir of dirs) {
    const files = readdirSync(join(TEST_DIR, dir)).filter(f => !f.startsWith('.'));
    if (!files.length) continue;
    const file = files[0];
    const filePath = join(TEST_DIR, dir, file);
    const fmt = dir.padEnd(24);

    try {
      const fileData = readFileSync(filePath);
      await call('load_file', { filename: file, data: fileData.toString('base64') });
      await call('play', { mode: 'song' });
      await sleep(1500); // let it play
      await call('stop');
      await sleep(300);  // quiesce
      const level = await call('get_audio_level', { durationMs: 800 });
      const rms = level.rmsAvg ?? 0;
      if (rms > 0.0005) {
        console.log(`  ⚠ ${fmt} ${file} — LEAKING (rms ${rms.toFixed(4)} after stop)`);
      } else {
        process.stdout.write('.');
      }
    } catch (e: any) {
      process.stdout.write('!');
    }
  }
  console.log('\nDone');
  ws.close();
}
main().catch(e => { console.error(e); process.exit(1); });
