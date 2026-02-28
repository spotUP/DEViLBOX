/**
 * SuperCollider compile route
 *
 * POST /api/sc/compile
 *   Body: { source: string }
 *   Returns: CompileSuccess | CompileFailure
 *
 * Requires sclang to be installed. Configure via SCLANG_PATH env var.
 * If sclang is not available, returns 503.
 */

import { Router, Request, Response } from 'express';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { randomBytes } from 'crypto';

const router = Router();

const SCLANG_PATH = process.env.SCLANG_PATH || 'sclang';
const COMPILE_TIMEOUT_MS = 30_000;
const MAX_SOURCE_LENGTH = 100_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CompileSuccess {
  success: true;
  synthDefName: string;
  binary: string;
  params: Array<{ name: string; default: number; min: number; max: number }>;
}

interface CompileFailure {
  success: false;
  error: string;
  line?: number;
}

// ---------------------------------------------------------------------------
// Source parsing helpers
// ---------------------------------------------------------------------------

/** Extract SynthDef name from SC source, e.g. SynthDef(\mySynth, ...) or SynthDef('mySynth', ...) */
function extractSynthDefName(source: string): string | null {
  const m = source.match(/SynthDef\s*\(\s*[\\']?(\w+)/);
  return m ? m[1] : null;
}

const STANDARD_PARAMS = new Set(['freq', 'amp', 'gate', 'out', 'buf', 'bufnum', 'sustain', 't_gate']);

/**
 * Extract named args from SC SynthDef source, excluding standard params.
 * Handles both pipe-style |freq=440, attack=0.01| and arg-style arg freq, attack;
 */
function extractParams(source: string): CompileSuccess['params'] {
  // Prefer pipe-style args (more common in modern SC)
  const pipeMatch = source.match(/\|([^|]+)\|/);
  const argMatch = !pipeMatch ? source.match(/\barg\s+([^;]+)/) : null;
  const argsStr = pipeMatch ? pipeMatch[1] : argMatch ? argMatch[1] : null;
  if (!argsStr) return [];

  const result: CompileSuccess['params'] = [];

  for (const part of argsStr.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const eqIdx = trimmed.indexOf('=');
    const rawName = (eqIdx >= 0 ? trimmed.slice(0, eqIdx) : trimmed).trim().replace(/^\\/, '');
    const rawDefault = eqIdx >= 0 ? trimmed.slice(eqIdx + 1).trim() : '0';

    if (!rawName || STANDARD_PARAMS.has(rawName)) continue;

    const defaultVal = parseFloat(rawDefault);
    if (!isFinite(defaultVal)) continue;

    const { min, max } = inferRange(rawName, defaultVal);
    result.push({ name: rawName, default: defaultVal, min, max });
  }

  return result;
}

/** Infer sensible min/max for a parameter based on its name and default value. */
function inferRange(name: string, defaultVal: number): { min: number; max: number } {
  const n = name.toLowerCase();
  if (n.includes('freq')) return { min: 20, max: 20000 };
  if (n.includes('pan')) return { min: -1, max: 1 };
  if (n.includes('db') || n.includes('gain')) return { min: -60, max: 0 };
  if (n.includes('attack') || n.includes('decay') || n.includes('release') ||
      n.includes('time') || n.includes('dur') || n.includes('delay')) {
    return { min: 0.001, max: 10 };
  }
  // Extend range if default falls outside 0-1
  if (defaultVal > 1) return { min: 0, max: Math.ceil(defaultVal * 2) };
  if (defaultVal < 0) return { min: Math.floor(defaultVal * 2), max: 0 };
  return { min: 0, max: 1 };
}

// ---------------------------------------------------------------------------
// sclang invocation
// ---------------------------------------------------------------------------

class SclangNotFoundError extends Error {}

class SclangCompileError extends Error {
  constructor(public readonly sclangOutput: string) {
    super('sclang compile error');
  }
}

/**
 * Run SC source code through sclang via stdin, resolving with combined stdout+stderr.
 * Piping via stdin works reliably for non-root users; the -D file-arg approach hangs.
 */
function runSclang(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let proc: ReturnType<typeof spawn>;
    try {
      proc = spawn(SCLANG_PATH, [], {
        env: {
          ...process.env,
          // Required for headless server: use Qt's offscreen platform instead of X11
          QT_QPA_PLATFORM: 'offscreen',
          // Allow Chromium (QtWebEngine bundled in SC) to run as root or in containers
          QTWEBENGINE_CHROMIUM_FLAGS: '--no-sandbox',
        },
      });
    } catch (err: unknown) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === 'ENOENT') {
        reject(new SclangNotFoundError(`sclang not found at "${SCLANG_PATH}"`));
      } else {
        reject(err);
      }
      return;
    }

    const chunks: Buffer[] = [];
    proc.stdout?.on('data', (d: Buffer) => chunks.push(d));
    proc.stderr?.on('data', (d: Buffer) => chunks.push(d));

    proc.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        reject(new SclangNotFoundError(`sclang not found at "${SCLANG_PATH}"`));
      } else {
        reject(err);
      }
    });

    proc.on('close', (code) => {
      const output = Buffer.concat(chunks).toString();
      if (code !== 0 && code !== null) {
        reject(new SclangCompileError(output));
      } else {
        resolve(output);
      }
    });

    const timer = setTimeout(() => {
      proc.kill();
      reject(new SclangCompileError('sclang timed out'));
    }, COMPILE_TIMEOUT_MS);
    proc.on('close', () => clearTimeout(timer));

    // Write script to stdin and close so sclang sees EOF and exits
    proc.stdin?.write(script);
    proc.stdin?.end();
  });
}

/** Parse the first ERROR line and optional line number from sclang output. */
function parseSclangError(output: string): { error: string; line?: number } {
  const errMatch = output.match(/ERROR:\s*(.+)/);
  const error = errMatch ? errMatch[1].trim() : 'Compilation failed';

  const lineMatch = output.match(/line\s+(\d+)\s+char/i);
  const line = lineMatch ? parseInt(lineMatch[1], 10) : undefined;

  return { error, line };
}

// ---------------------------------------------------------------------------
// POST /compile
// ---------------------------------------------------------------------------

router.post('/compile', (req: Request, res: Response) => {
  void (async () => {
    const { source } = req.body as { source?: unknown };

    if (typeof source !== 'string' || source.length === 0 || source.length > MAX_SOURCE_LENGTH) {
      res.status(400).json({ success: false, error: 'Invalid or missing source' } satisfies CompileFailure);
      return;
    }

    const synthDefName = extractSynthDefName(source);
    if (!synthDefName) {
      res.json({ success: false, error: 'Could not find SynthDef name in source (expected SynthDef(\\name, ...))' } satisfies CompileFailure);
      return;
    }

    const id = randomBytes(8).toString('hex');
    const tmpDir = path.join(os.tmpdir(), `sc_compile_${id}`);

    try {
      await fs.mkdir(tmpDir, { recursive: true });

      // Wrap the user's SynthDef expression so it writes the .scsyndef binary.
      // The source must evaluate to a SynthDef object as its final expression.
      const outDirEscaped = tmpDir.replace(/\\/g, '/'); // SC uses forward slashes
      const script = `(\n${source}\n).writeDefFile("${outDirEscaped}");\n0.exit;\n`;

      // Run sclang — pipe via stdin (file-arg approach hangs for non-root users)
      let sclangOutput: string;
      try {
        sclangOutput = await runSclang(script);
      } catch (err) {
        if (err instanceof SclangNotFoundError) {
          res.status(503).json({ success: false, error: 'SuperCollider (sclang) is not installed on the server. Set SCLANG_PATH to the sclang binary.' } satisfies CompileFailure);
          return;
        }
        const output = err instanceof SclangCompileError ? err.sclangOutput : '';
        const { error, line } = parseSclangError(output);
        res.json({ success: false, error, line } satisfies CompileFailure);
        return;
      }

      // Read the compiled .scsyndef binary
      const defFile = path.join(tmpDir, `${synthDefName}.scsyndef`);
      let binary: string;
      try {
        const buf = await fs.readFile(defFile);
        binary = buf.toString('base64');
      } catch {
        // File not created despite exit 0 — probably a runtime error
        const { error, line } = parseSclangError(sclangOutput);
        res.json({ success: false, error, line } satisfies CompileFailure);
        return;
      }

      const params = extractParams(source);

      res.json({
        success: true,
        synthDefName,
        binary,
        params,
      } satisfies CompileSuccess);

    } catch (err) {
      console.error('[SC compile] Unexpected error:', err);
      res.status(500).json({ success: false, error: 'Internal server error' } satisfies CompileFailure);
    } finally {
      fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  })();
});

export default router;
