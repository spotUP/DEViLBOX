#!/usr/bin/env npx tsx
/**
 * Quick smoke test — loads each test-song via MCP, plays 3s, checks audio level.
 * Uses the same WS relay as the MCP bridge.
 */
import { WebSocket } from 'ws';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';
import { randomUUID } from 'crypto';

const WS_URL = 'ws://localhost:4003/mcp';
const TEST_DIR = '/Users/spot/Code/DEViLBOX/public/data/test-songs';
const PLAY_MS = 3000;
const SILENCE_THRESHOLD = 0.0005;

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
      if (p) {
        pending.delete(msg.id);
        if (msg.type === 'error') p.reject(new Error(msg.error || 'bridge error'));
        else p.resolve(msg.data);
      }
    });
  });
}

function call(method: string, params: Record<string, any> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`timeout calling ${method}`));
    }, 15000);
    pending.set(id, {
      resolve: (v) => { clearTimeout(timeout); resolve(v); },
      reject: (e) => { clearTimeout(timeout); reject(e); },
    });
    ws.send(JSON.stringify({ id, type: 'call', method, params }));
  });
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  await connect();
  console.log('Connected to MCP relay');

  // Get all test-song directories
  const dirs = readdirSync(TEST_DIR).filter(d => statSync(join(TEST_DIR, d)).isDirectory()).sort();

  const results: { fmt: string; file: string; status: string; rms: number; error?: string }[] = [];
  let pass = 0, fail = 0, error = 0;

  for (const dir of dirs) {
    const dirPath = join(TEST_DIR, dir);
    const files = readdirSync(dirPath).filter(f => !f.startsWith('.'));
    if (files.length === 0) continue;
    const file = files[0];
    const filePath = join(dirPath, file);
    const fmt = dir.padEnd(22);

    try {
      // Stop previous
      await call('stop').catch(() => {});

      // Load via base64 (WS relay expects filename + data, not path)
      const fileData = readFileSync(filePath);
      const base64 = fileData.toString('base64');
      await call('load_file', { filename: file, data: base64 });

      // Play
      await call('play', { mode: 'song' });

      // Wait for audio
      await sleep(PLAY_MS);

      // Measure
      const level = await call('get_audio_level', { durationMs: 1500 });
      const rms = level.rmsAvg ?? 0;
      const audible = rms >= SILENCE_THRESHOLD;

      if (audible) {
        console.log(`  ✓ ${fmt} ${file} — rms ${rms.toFixed(4)}`);
        pass++;
        results.push({ fmt: dir, file, status: 'pass', rms });
      } else {
        console.log(`  ✗ ${fmt} ${file} — SILENT`);
        fail++;
        results.push({ fmt: dir, file, status: 'silent', rms });
      }
    } catch (e: any) {
      console.log(`  ! ${fmt} ${file} — ERROR: ${e.message?.slice(0, 60)}`);
      error++;
      results.push({ fmt: dir, file, status: 'error', rms: 0, error: e.message });
    }
  }

  // Summary
  console.log(`\n═══ RESULTS ═══`);
  console.log(`Pass: ${pass}/${dirs.length}  Fail: ${fail}  Error: ${error}`);

  if (fail > 0) {
    console.log(`\nSilent formats:`);
    results.filter(r => r.status === 'silent').forEach(r => console.log(`  - ${r.fmt}`));
  }
  if (error > 0) {
    console.log(`\nError formats:`);
    results.filter(r => r.status === 'error').forEach(r => console.log(`  - ${r.fmt}: ${r.error?.slice(0, 80)}`));
  }

  ws.close();
}

main().catch(e => { console.error(e); process.exit(1); });
