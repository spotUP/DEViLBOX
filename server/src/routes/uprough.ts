/**
 * Up Rough song generation.
 *
 * POST /api/uprough/generate {style, seed, key?} runs the real Python
 * generator (tools/song_file.py in the Up Rough checkout named by the
 * UPROUGH_ROOT env var) and returns the song file it prints. The generator is
 * the Up Rough host's own, so the file renders 1:1 on the device by
 * construction; nothing here re-implements any musical decision.
 */

import { Router, Request, Response } from 'express';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const router = Router();

const PYTHON = process.env.UPROUGH_PYTHON || 'python3.11';
const TIMEOUT_MS = Number(process.env.UPROUGH_TIMEOUT_MS) || 120_000;
const MAX_OUTPUT = 64 * 1024 * 1024;

interface RunResult { code: number | null; stdout: string; stderr: string; timedOut: boolean; aborted: boolean }

function songFileScript(): { script?: string; error?: string } {
  const root = process.env.UPROUGH_ROOT;
  if (!root) return { error: 'UPROUGH_ROOT is not set: point it at the Up Rough Demo System checkout' };
  const script = path.join(root, 'tools', 'song_file.py');
  if (!fs.existsSync(script)) return { error: `UPROUGH_ROOT has no tools/song_file.py: ${root}` };
  return { script };
}

/** Run song_file.py; the child is killed on timeout or when `signal` aborts. */
function runSongFile(script: string, args: string[], signal?: AbortSignal): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON, [script, ...args], { cwd: path.dirname(script) });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let aborted = false;
    const kill = () => { child.kill('SIGKILL'); };
    const timer = setTimeout(() => { timedOut = true; kill(); }, TIMEOUT_MS);
    const onAbort = () => { aborted = true; kill(); };
    if (signal) {
      if (signal.aborted) onAbort(); else signal.addEventListener('abort', onAbort, { once: true });
    }
    child.stdout.on('data', (d) => {
      stdout += d;
      if (stdout.length > MAX_OUTPUT) kill();
    });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolve({ code, stdout, stderr, timedOut, aborted });
    });
  });
}

/** The style names the generator knows, asked of the generator itself. */
async function listStyles(script: string, signal?: AbortSignal): Promise<string[]> {
  const r = await runSongFile(script, ['styles'], signal);
  if (r.code !== 0) throw new Error(`song_file.py styles failed: ${r.stderr.trim()}`);
  return JSON.parse(r.stdout) as string[];
}

router.get('/styles', async (req: Request, res: Response) => {
  const { script, error } = songFileScript();
  if (!script) return res.status(503).json({ error });
  try {
    res.json({ styles: await listStyles(script) });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.post('/generate', async (req: Request, res: Response) => {
  const { script, error } = songFileScript();
  if (!script) return res.status(503).json({ error });

  const { style, seed, key } = req.body ?? {};
  if (typeof style !== 'string' || !style) return res.status(400).json({ error: 'style must be a non-empty string' });
  if (!Number.isInteger(seed)) return res.status(400).json({ error: 'seed must be an integer' });
  if (key !== undefined && (typeof key !== 'string' || !/^[A-G][#b]?m?$/.test(key))) {
    return res.status(400).json({ error: 'key must look like "Am" or "C#"' });
  }

  const ac = new AbortController();
  res.on('close', () => { if (!res.writableEnded) ac.abort(); });

  try {
    const styles = await listStyles(script, ac.signal);
    if (!styles.includes(style)) {
      return res.status(400).json({ error: `unknown style "${style}"`, styles });
    }
    const args = ['new', '--style', style, '--seed', String(seed)];
    if (key) args.push('--key', key);
    const r = await runSongFile(script, args, ac.signal);
    if (r.aborted) return;
    if (r.timedOut) return res.status(504).json({ error: `generator timed out after ${TIMEOUT_MS} ms` });
    if (r.code !== 0) return res.status(500).json({ error: 'generator failed', detail: r.stderr.trim().slice(-2000) });
    res.type('application/json').send(r.stdout);
  } catch (e) {
    if (!ac.signal.aborted) res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
