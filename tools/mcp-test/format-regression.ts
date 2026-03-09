#!/usr/bin/env npx tsx
/**
 * MCP Format Regression Test Runner
 *
 * Loads one file per format family via the MCP server, plays it, and verifies
 * audio output is non-silent. Reports PASS/FAIL per format with RMS levels.
 *
 * Usage:
 *   npx tsx tools/mcp-test/format-regression.ts                    # Run all tests
 *   npx tsx tools/mcp-test/format-regression.ts --formats mod,xm   # Run specific formats
 *   npx tsx tools/mcp-test/format-regression.ts --list              # List available test files
 *
 * Prerequisites:
 *   - DEViLBOX dev server running (npm run dev)
 *   - Browser open to localhost:5173
 *   - MCP server NOT already running (this script starts its own)
 */

import { spawn, ChildProcess } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { basename, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Test File Registry ──────────────────────────────────────────────────────

interface TestFile {
  format: string;
  path: string;
  engine: string;  // Which engine handles this format
  expectPatterns?: boolean;  // Whether to expect pattern data (false for WASM-only)
}

const PROJECT_ROOT = resolve(__dirname, '../..');

// Test files — one per format family/engine path
const TEST_FILES: TestFile[] = [
  // PC Tracker formats (OpenMPT WASM)
  { format: 'MOD', path: 'public/data/songs/mod/break the box.mod', engine: 'openmpt' },

  // Furnace (native parser + FurnaceDispatch WASM)
  { format: 'FUR', path: 'public/data/songs/furnace/misc/sawmen_break_SM8521.fur', engine: 'furnace' },

  // Hively (native parser + Hively WASM)
  { format: 'HVL', path: 'third-party/hivelytracker-master/Songs/chiprolled.hvl', engine: 'hively' },
];

// ─── MCP Client ──────────────────────────────────────────────────────────────

class MCPClient {
  private proc: ChildProcess;
  private reqId = 0;
  private stdoutBuf = '';
  private pendingResolves = new Map<number, (result: unknown) => void>();

  static async create(): Promise<MCPClient> {
    const client = new MCPClient();
    await client.init();
    return client;
  }

  private constructor() {
    this.proc = spawn('npx', ['tsx', 'src/mcp/index.ts'], {
      cwd: resolve(PROJECT_ROOT, 'server'),
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.proc.stdout!.on('data', (data: Buffer) => {
      this.stdoutBuf += data.toString();
      let newlineIdx;
      while ((newlineIdx = this.stdoutBuf.indexOf('\n')) !== -1) {
        const line = this.stdoutBuf.slice(0, newlineIdx).trim();
        this.stdoutBuf = this.stdoutBuf.slice(newlineIdx + 1);
        if (line) this.handleResponse(line);
      }
    });

    this.proc.stderr!.on('data', (data: Buffer) => {
      const text = data.toString();
      // Only log important stderr messages
      if (text.includes('Browser connected') || text.includes('error') || text.includes('Error')) {
        for (const line of text.split('\n').filter(Boolean)) {
          if (line.includes('Browser connected')) {
            console.error('  [mcp] Browser connected');
          } else if (line.includes('error') || line.includes('Error')) {
            console.error(`  [mcp] ${line.trim()}`);
          }
        }
      }
    });
  }

  private handleResponse(line: string): void {
    try {
      const msg = JSON.parse(line);
      const resolve = this.pendingResolves.get(msg.id);
      if (resolve) {
        this.pendingResolves.delete(msg.id);
        resolve(msg);
      }
    } catch {
      // Not JSON, ignore
    }
  }

  private async init(): Promise<void> {
    // Wait for process to start
    await sleep(2000);

    // Initialize MCP handshake
    await this.sendAndWait({
      jsonrpc: '2.0', id: this.nextId(), method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'regression-test', version: '1.0' } },
    });
    this.send({ jsonrpc: '2.0', method: 'notifications/initialized' });

    // Wait for browser to connect
    console.error('  Waiting for browser connection...');
    let connected = false;
    for (let i = 0; i < 35; i++) {
      await sleep(1000);
      // Try a simple call to see if browser is connected
      try {
        const result = await this.call('get_song_info', {}, 3000);
        if (result && !('_error' in (result as Record<string, unknown>))) {
          connected = true;
          break;
        }
      } catch {
        // Not connected yet
      }
    }
    if (!connected) {
      throw new Error('Browser did not connect within 35 seconds');
    }
  }

  private nextId(): number { return ++this.reqId; }

  private send(msg: Record<string, unknown>): void {
    this.proc.stdin!.write(JSON.stringify(msg) + '\n');
  }

  private sendAndWait(msg: Record<string, unknown>, timeoutMs = 15000): Promise<unknown> {
    const id = msg.id as number;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingResolves.delete(id);
        reject(new Error(`Request ${id} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingResolves.set(id, (result) => {
        clearTimeout(timer);
        resolve(result);
      });
      this.send(msg);
    });
  }

  async call(name: string, args: Record<string, unknown> = {}, timeoutMs = 35000): Promise<Record<string, unknown>> {
    const id = this.nextId();
    const response = await this.sendAndWait({
      jsonrpc: '2.0', id, method: 'tools/call',
      params: { name, arguments: args },
    }, timeoutMs) as Record<string, unknown>;

    if ('error' in response) return { _error: (response.error as Record<string, unknown>)?.message || response.error };

    const content = ((response.result as Record<string, unknown>)?.content as Array<Record<string, unknown>>) || [];
    for (const c of content) {
      if (c.type === 'text') {
        try { return JSON.parse(c.text as string); }
        catch { return { _text: c.text }; }
      }
    }
    return { _content: content };
  }

  close(): void {
    this.proc.kill();
  }
}

// ─── Test Runner ─────────────────────────────────────────────────────────────

interface TestResult {
  format: string;
  path: string;
  engine: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  error?: string;
  loadTime?: number;
  channels?: number;
  patterns?: number;
  instruments?: number;
  editorMode?: string;
  audioDetected?: boolean;
  audioWaitMs?: number;
  rmsAvg?: number;
  rmsMax?: number;
  peakMax?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function isOk(r: Record<string, unknown>): boolean {
  return !('_error' in r) && !('error' in r);
}

async function testFormat(client: MCPClient, test: TestFile): Promise<TestResult> {
  const result: TestResult = {
    format: test.format,
    path: test.path,
    engine: test.engine,
    status: 'FAIL',
  };

  const absPath = resolve(PROJECT_ROOT, test.path);
  if (!existsSync(absPath)) {
    result.status = 'SKIP';
    result.error = 'File not found';
    return result;
  }

  // Step 1: Load file
  const loadStart = Date.now();
  const loadResult = await client.call('load_file', { path: absPath });
  result.loadTime = Date.now() - loadStart;

  if (!isOk(loadResult)) {
    result.error = `Load failed: ${(loadResult as Record<string, unknown>).error || (loadResult as Record<string, unknown>)._error}`;
    return result;
  }

  result.channels = loadResult.channels as number;
  result.patterns = loadResult.patterns as number;
  result.instruments = loadResult.instruments as number;
  result.editorMode = loadResult.editorMode as string;

  // Step 2: Verify song info
  const songInfo = await client.call('get_song_info');
  if (!isOk(songInfo)) {
    result.error = 'get_song_info failed after load';
    return result;
  }

  // Step 3: Play
  const playResult = await client.call('play');
  if (!isOk(playResult)) {
    result.error = 'play() failed';
    return result;
  }

  // Step 4: Wait for audio
  const waitResult = await client.call('wait_for_audio', { timeoutMs: 8000 }, 15000);
  if (!isOk(waitResult)) {
    result.error = `wait_for_audio failed: ${(waitResult as Record<string, unknown>).error || (waitResult as Record<string, unknown>)._error}`;
    // Still try to measure
  } else {
    result.audioDetected = waitResult.detected as boolean;
    result.audioWaitMs = waitResult.waitedMs as number;
  }

  // Step 5: Measure audio level
  const levelResult = await client.call('get_audio_level', { durationMs: 2000 }, 10000);
  if (isOk(levelResult)) {
    result.rmsAvg = levelResult.rmsAvg as number;
    result.rmsMax = levelResult.rmsMax as number;
    result.peakMax = levelResult.peakMax as number;
  }

  // Step 6: Stop
  await client.call('stop');

  // Wait for engine to settle before next test
  await sleep(1000);

  // Determine pass/fail
  if (result.audioDetected && result.rmsAvg && result.rmsAvg > 0.001) {
    result.status = 'PASS';
  } else if (result.rmsMax && result.rmsMax > 0.001) {
    result.status = 'PASS';
  } else {
    result.error = result.error || `Silent audio: rmsAvg=${result.rmsAvg}, rmsMax=${result.rmsMax}`;
  }

  return result;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--list')) {
    console.log('Available test files:');
    for (const t of TEST_FILES) {
      const absPath = resolve(PROJECT_ROOT, t.path);
      const exists = existsSync(absPath);
      console.log(`  ${exists ? '✓' : '✗'} [${t.format}] ${t.path} (${t.engine})`);
    }
    return;
  }

  // Filter formats if specified
  let tests = TEST_FILES;
  const formatArg = args.find(a => a.startsWith('--formats='))?.split('=')[1];
  if (formatArg) {
    const formats = formatArg.toUpperCase().split(',');
    tests = TEST_FILES.filter(t => formats.includes(t.format.toUpperCase()));
  }

  console.error(`\n  DEViLBOX MCP Format Regression Test`);
  console.error(`  Testing ${tests.length} format(s)...\n`);

  const client = await MCPClient.create();
  const results: TestResult[] = [];

  for (const test of tests) {
    console.error(`  Testing ${test.format} (${test.engine})...`);
    try {
      const result = await testFormat(client, test);
      results.push(result);

      const status = result.status === 'PASS' ? '  PASS' :
                     result.status === 'SKIP' ? '  SKIP' : '  FAIL';
      const details = result.status === 'PASS'
        ? `${result.channels}ch, ${result.patterns}pat, ${result.instruments}inst, rms=${result.rmsAvg?.toFixed(4)}, mode=${result.editorMode}, ${result.loadTime}ms`
        : result.error || 'unknown error';
      console.error(`  [${status}] ${test.format}: ${details}`);
    } catch (e) {
      results.push({
        format: test.format, path: test.path, engine: test.engine,
        status: 'FAIL', error: (e as Error).message,
      });
      console.error(`  [  FAIL] ${test.format}: ${(e as Error).message}`);
    }
  }

  // Summary
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const skipped = results.filter(r => r.status === 'SKIP').length;

  console.error(`\n  ═══════════════════════════════════════`);
  console.error(`  ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.error(`  ═══════════════════════════════════════\n`);

  // Output JSON report to stdout
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: { passed, failed, skipped, total: results.length },
    results,
  }, null, 2));

  client.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error(`Fatal: ${e.message}`);
  process.exit(1);
});
