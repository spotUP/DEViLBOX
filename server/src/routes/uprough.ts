/**
 * Up Rough song generation.
 *
 * POST /api/uprough/generate {style, seed, key?, bars?} runs the real Python
 * generator (tools/song_file.py in the Up Rough checkout named by the
 * UPROUGH_ROOT env var) and returns the song file it prints. The generator is
 * the Up Rough host's own, so the file renders 1:1 on the device by
 * construction; nothing here re-implements any musical decision.
 *
 * With `events: true` in the body the generator runs with `--events -` and the
 * response is chunked NDJSON (application/x-ndjson): one render event per line
 * as it arrives, the last line a `done` event carrying the song file. A failure
 * after the first line ends the stream with one `error` line instead of a
 * status code (the status is already sent); a stream with no `done` line failed.
 */

import { Router, Request, Response } from 'express';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const router = Router();

/** Interpreter for the Up Rough tools; read per spawn so tests and deploys can set UPROUGH_PYTHON. */
const python = () => process.env.UPROUGH_PYTHON || 'python3.11';
const TIMEOUT_MS = Number(process.env.UPROUGH_TIMEOUT_MS) || 120_000;
const MAX_OUTPUT = 64 * 1024 * 1024;

interface RunResult { code: number | null; stdout: string; stderr: string; timedOut: boolean; aborted: boolean }

/** Resolve tools/<name> in the Up Rough checkout named by UPROUGH_ROOT. */
function uproughScript(name: string): { script?: string; root?: string; error?: string } {
  const root = process.env.UPROUGH_ROOT;
  if (!root) return { error: 'UPROUGH_ROOT is not set: point it at the Up Rough Demo System checkout' };
  const script = path.join(root, 'tools', name);
  if (!fs.existsSync(script)) return { error: `UPROUGH_ROOT has no tools/${name}: ${root}` };
  return { script, root };
}

function songFileScript(): { script?: string; error?: string } {
  return uproughScript('song_file.py');
}

/** Run an Up Rough tool script; the child is killed on timeout or when `signal` aborts. */
function runSongFile(
  script: string, args: string[], signal?: AbortSignal, cwd: string = path.dirname(script),
  onStdout?: (chunk: string) => void,
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(python(), [script, ...args], { cwd });
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
    // With onStdout the chunks stream out and only their size is kept, so MAX_OUTPUT still bounds the run.
    let streamed = 0;
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (d: string) => {
      if (onStdout) {
        streamed += d.length;
        onStdout(d);
        if (streamed > MAX_OUTPUT) kill();
        return;
      }
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

/** mtime of the generator module that defines the styles, or undefined when it cannot be read. */
function stylesVersion(script: string): number | undefined {
  try {
    return fs.statSync(path.join(path.dirname(script), 'hiphop.py')).mtimeMs;
  } catch {
    return undefined;
  }
}

/** One cached style list per script; the in-flight Promise is cached so concurrent callers share one spawn. */
let stylesCache: { script: string; version: number; styles: Promise<string[]> } | undefined;

/**
 * The style names the generator knows, asked of the generator itself. The ask
 * costs seconds (the python import), so the answer is kept until hiphop.py,
 * where the styles live, changes on disk. A failed ask is never kept.
 */
function listStyles(script: string): Promise<string[]> {
  const version = stylesVersion(script);
  if (version !== undefined && stylesCache?.script === script && stylesCache.version === version) {
    return stylesCache.styles;
  }
  const styles = (async () => {
    const r = await runSongFile(script, ['styles']);
    if (r.code !== 0) throw new Error(`song_file.py styles failed: ${r.stderr.trim()}`);
    return JSON.parse(r.stdout) as string[];
  })();
  if (version === undefined) return styles;
  const entry = { script, version, styles };
  stylesCache = entry;
  styles.catch(() => { if (stylesCache === entry) stylesCache = undefined; });
  return styles;
}

/** Fill the style cache at startup so the first GET /styles does not wait for python. */
function warmStyles(): void {
  const { script } = songFileScript();
  if (!script) return;
  listStyles(script).catch((e: Error) => console.error(`[uprough] style warm-up failed: ${e.message}`));
}
warmStyles();

router.get('/styles', async (req: Request, res: Response) => {
  const { script, error } = songFileScript();
  if (!script) return res.status(503).json({ error });
  try {
    res.json({ styles: await listStyles(script) });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * Forwards the generator's stdout to the client one complete line at a time. The
 * status line waits for the first line, so a generator that fails before it
 * printed anything still answers with a plain JSON error and status.
 */
class NdjsonSink {
  private pending = '';
  private started = false;
  constructor(private readonly res: Response) {}

  private write(line: string): void {
    if (!this.started) {
      this.started = true;
      this.res.status(200).type('application/x-ndjson');
      this.res.flushHeaders();
    }
    this.res.write(`${line}\n`);
  }

  push(chunk: string): void {
    this.pending += chunk;
    for (let i = this.pending.indexOf('\n'); i >= 0; i = this.pending.indexOf('\n')) {
      const line = this.pending.slice(0, i);
      this.pending = this.pending.slice(i + 1);
      if (line) this.write(line);
    }
  }

  /** Ends the response. A cut-off last line is dropped on failure, so the error line never lands mid-line. */
  finish(failed?: { status: number; error: string; detail?: string }): void {
    if (failed) {
      if (!this.started) {
        this.res.status(failed.status).json({ error: failed.error, ...(failed.detail !== undefined && { detail: failed.detail }) });
        return;
      }
      this.write(JSON.stringify({ type: 'error', error: failed.error, ...(failed.detail !== undefined && { detail: failed.detail }) }));
    } else if (this.pending) {
      this.write(this.pending);
    }
    if (!this.started) {
      this.res.status(500).json({ error: 'generator printed no events' });
      return;
    }
    this.res.end();
  }
}

router.post('/generate', async (req: Request, res: Response) => {
  const { script, error } = songFileScript();
  if (!script) return res.status(503).json({ error });

  const { style, seed, key, bars, events } = req.body ?? {};
  if (typeof style !== 'string' || !style) return res.status(400).json({ error: 'style must be a non-empty string' });
  if (!Number.isInteger(seed)) return res.status(400).json({ error: 'seed must be an integer' });
  if (key !== undefined && (typeof key !== 'string' || !/^[A-G][#b]?m?$/.test(key))) {
    return res.status(400).json({ error: 'key must look like "Am" or "C#"' });
  }
  if (bars !== undefined && !(Number.isInteger(bars) && bars >= 1)) {
    return res.status(400).json({ error: 'bars must be a whole number, 1 or more' });
  }

  if (events !== undefined && typeof events !== 'boolean') return res.status(400).json({ error: 'events must be true or false' });

  const ac = new AbortController();
  res.on('close', () => { if (!res.writableEnded) ac.abort(); });

  try {
    const styles = await listStyles(script);
    if (!styles.includes(style)) {
      return res.status(400).json({ error: `unknown style "${style}"`, styles });
    }
    const args = ['new', '--style', style, '--seed', String(seed)];
    if (key) args.push('--key', key);
    if (bars !== undefined) args.push('--bars', String(bars));
    const sink = events === true ? new NdjsonSink(res) : undefined;
    if (sink) args.push('--events', '-');
    const r = await runSongFile(script, args, ac.signal, undefined, sink ? (c) => sink.push(c) : undefined);
    if (r.aborted) return;
    const failed = r.timedOut
      ? { status: 504, error: `generator timed out after ${TIMEOUT_MS} ms`, detail: undefined }
      : r.code !== 0
        ? { status: 500, error: 'generator failed', detail: r.stderr.trim().slice(-2000) }
        : undefined;
    if (sink) return sink.finish(failed);
    if (failed) return res.status(failed.status).json({ error: failed.error, ...(failed.detail !== undefined && { detail: failed.detail }) });
    res.type('application/json').send(r.stdout);
  } catch (e) {
    if (!ac.signal.aborted) res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * POST /api/uprough/render {song: "<song file JSON text>"} renders the song with
 * the real Up Rough synth (tools/synth_song.py, the maker's own flags) and
 * returns the WAV. The body is JSON (the app's global express.json already
 * parses it, limit 10mb); the song text travels as a string so it is written
 * to disk byte for byte.
 */
router.post('/render', async (req: Request, res: Response) => {
  const { script, root, error } = uproughScript('synth_song.py');
  if (!script || !root) return res.status(503).json({ error });

  const song = req.body?.song;
  if (typeof song !== 'string' || !song) return res.status(400).json({ error: 'song must be the song file text' });
  try {
    const doc = JSON.parse(song) as { schema?: unknown };
    if (doc === null || typeof doc !== 'object' || doc.schema === undefined) {
      return res.status(400).json({ error: 'the song file has no schema field' });
    }
  } catch {
    return res.status(400).json({ error: 'the song file is not valid JSON' });
  }

  const ac = new AbortController();
  res.on('close', () => { if (!res.writableEnded) ac.abort(); });

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uprough-render-'));
  try {
    const songPath = path.join(dir, 'song.uprough-song.json');
    const outDir = path.join(dir, 'out');
    fs.writeFileSync(songPath, song);
    fs.mkdirSync(outDir);
    const r = await runSongFile(script, [
      '--out-dir', outDir, '--engine', 'hiphop', '--tier', '64k',
      '--acid-source', 'auto', '--prebaked', '1', '--song-file', songPath,
    ], ac.signal, root);
    if (r.aborted) return;
    if (r.timedOut) return res.status(504).json({ error: `render timed out after ${TIMEOUT_MS} ms` });
    if (r.code !== 0) {
      const lines = r.stderr.trim().split('\n');
      return res.status(400).json({ error: lines[lines.length - 1] || 'render failed' });
    }
    res.type('audio/wav').send(fs.readFileSync(path.join(outDir, 'synth_preview.wav')));
  } catch (e) {
    if (!ac.signal.aborted) res.status(500).json({ error: (e as Error).message });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

export default router;
