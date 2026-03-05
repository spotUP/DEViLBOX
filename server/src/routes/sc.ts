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

// Read lazily so dotenv is guaranteed to have run before first use.
function getSclangPath(): string {
  return process.env.SCLANG_PATH ?? 'sclang';
}
const COMPILE_TIMEOUT_MS = 60_000;
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
  /** Full sclang output after the class-library preamble, for display in the editor. */
  rawOutput?: string;
}

// ---------------------------------------------------------------------------
// Source parsing helpers
// ---------------------------------------------------------------------------

/** Extract SynthDef name from SC source.
 * Handles: SynthDef(\mySynth, ...), SynthDef('mySynth', ...), SynthDef("mySynth", ...) */
function extractSynthDefName(source: string): string | null {
  const m = source.match(/SynthDef\s*\(\s*(?:\\|'|")?(\w+)/);
  return m ? m[1] : null;
}

/**
 * Extract just the SynthDef(…) expression from a source file that may contain
 * server-boot code, GUI setup, sequencers, etc.
 *
 * Tracks balanced parentheses and skips double-quoted string literals so that
 * parens inside strings don't confuse the counter. Also strips any trailing
 * interactive-mode chained calls (.add, .send(s), .store, .load, .play).
 *
 * Returns null only if no SynthDef is found at all; returns the full source
 * unchanged if brace matching fails (so the user sees a real sclang error).
 */
function extractSynthDefBlock(source: string): string | null {
  const startMatch = source.match(/\bSynthDef\s*\(/);
  if (!startMatch || startMatch.index === undefined) return null;

  const blockStart = startMatch.index;
  // The opening paren is at the end of the regex match.
  const openParen = blockStart + startMatch[0].length - 1;

  let depth = 0;
  let i = openParen;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '/' && i + 1 < source.length) {
      if (source[i + 1] === '/') {
        // Skip // line comment (avoids apostrophes in words like "can't")
        i += 2;
        while (i < source.length && source[i] !== '\n') i++;
        i++; continue;
      } else if (source[i + 1] === '*') {
        // Skip /* block comment */
        i += 2;
        while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++;
        i += 2; continue;
      }
    } else if (ch === '"') {
      // Skip double-quoted string literal
      i++;
      while (i < source.length && source[i] !== '"') {
        if (source[i] === '\\') i++; // escape
        i++;
      }
    } else if (ch === '\'') {
      // Skip single-quoted symbol literal
      i++;
      while (i < source.length && source[i] !== '\'') {
        if (source[i] === '\\') i++;
        i++;
      }
    } else if (ch === '(') {
      depth++;
    } else if (ch === ')') {
      depth--;
      if (depth === 0) { i++; break; }
    }
    i++;
  }

  if (depth !== 0) {
    // Unbalanced — fall back to full source so sclang reports the real error.
    return source;
  }

  // The SynthDef expression ends here — at the closing paren of SynthDef(...).
  // Strip any chained calls like .add, .send(s), .store, .play — these are
  // interactive-mode calls that contact a server or mutate global state.
  // We replace them with .writeDefFile() in the wrapper, so they must be removed.
  return source.slice(blockStart, i).trim();
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
 * Write script to a temp file and run it with sclang <file>.
 * File-based execution handles multi-line SynthDefs correctly; stdin REPL mode
 * processes input line-by-line which breaks multi-line expressions.
 */
async function runSclang(script: string, scriptPath: string): Promise<string> {
  await fs.writeFile(scriptPath, script, 'utf8');

  const sclangPath = getSclangPath();
  const startTime = Date.now();
  console.log(`[SC compile] Running sclang: ${sclangPath} ${scriptPath}`);
  console.log(`[SC compile] Script (${script.length} chars):\n${script.slice(0, 500)}${script.length > 500 ? '...' : ''}`);

  return new Promise((resolve, reject) => {
    let proc: ReturnType<typeof spawn>;
    try {
      // macOS uses 'cocoa' (the default) — don't override QT_QPA_PLATFORM.
      // Linux headless servers need 'offscreen' to avoid X11 errors.
      const qtEnv = process.platform === 'linux'
        ? { QT_QPA_PLATFORM: 'offscreen', QTWEBENGINE_CHROMIUM_FLAGS: '--no-sandbox' }
        : {};
      proc = spawn(sclangPath, [scriptPath], {
        env: { ...process.env, ...qtEnv },
      });
    } catch (err: unknown) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === 'ENOENT') {
        reject(new SclangNotFoundError(`sclang not found at "${sclangPath}"`));
      } else {
        reject(err);
      }
      return;
    }

    console.log(`[SC compile] sclang spawned, pid=${proc.pid}`);

    const chunks: Buffer[] = [];
    proc.stdout?.on('data', (d: Buffer) => {
      chunks.push(d);
      console.log(`[SC compile] stdout: ${d.toString().trimEnd()}`);
    });
    proc.stderr?.on('data', (d: Buffer) => {
      chunks.push(d);
      console.log(`[SC compile] stderr: ${d.toString().trimEnd()}`);
    });

    proc.on('error', (err: NodeJS.ErrnoException) => {
      console.error(`[SC compile] Process error: ${err.message}`);
      if (err.code === 'ENOENT') {
        reject(new SclangNotFoundError(`sclang not found at "${sclangPath}"`));
      } else {
        reject(err);
      }
    });

    proc.on('close', (code) => {
      const elapsed = Date.now() - startTime;
      const output = Buffer.concat(chunks).toString();
      console.log(`[SC compile] sclang exited code=${code} in ${elapsed}ms (output ${output.length} chars)`);
      if (code !== 0 && code !== null) {
        reject(new SclangCompileError(output));
      } else {
        resolve(output);
      }
    });

    const timer = setTimeout(() => {
      console.error(`[SC compile] TIMEOUT after ${COMPILE_TIMEOUT_MS}ms — killing pid=${proc.pid}`);
      const partialOutput = Buffer.concat(chunks).toString();
      console.error(`[SC compile] Partial output at timeout:\n${partialOutput.slice(-500)}`);
      proc.kill();
      reject(new SclangCompileError(`sclang timed out after ${COMPILE_TIMEOUT_MS / 1000}s`));
    }, COMPILE_TIMEOUT_MS);
    proc.on('close', () => clearTimeout(timer));
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

/**
 * Strip the class-library compilation preamble from sclang output so only the
 * part relevant to the user's code is returned. Keeps everything from the last
 * "compile done" marker onward, or the full output if that marker is missing.
 * Truncated to 8 000 chars so the response stays reasonable.
 */
function cleanSclangOutput(output: string): string {
  // sclang prints "compile done" after the class library loads.
  // Everything after that is interpreter output for the user's script.
  const marker = 'compile done';
  const idx = output.lastIndexOf(marker);
  const relevant = idx >= 0 ? output.slice(idx + marker.length).trimStart() : output.trimStart();
  const MAX = 8_000;
  return relevant.length > MAX ? relevant.slice(0, MAX) + '\n… (truncated)' : relevant;
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

    console.log(`[SC compile] Received source (${source.length} chars)`);

    const synthDefName = extractSynthDefName(source);
    if (!synthDefName) {
      console.log('[SC compile] No SynthDef name found');
      res.json({ success: false, error: 'Could not find SynthDef name in source (expected SynthDef(\\name, ...))' } satisfies CompileFailure);
      return;
    }

    console.log(`[SC compile] SynthDef name: ${synthDefName}`);

    const id = randomBytes(8).toString('hex');
    const tmpDir = path.join(os.tmpdir(), `sc_compile_${id}`);

    try {
      await fs.mkdir(tmpDir, { recursive: true });

      // Extract just the SynthDef block so that files containing s.boot, GUI code,
      // sequencers, etc. don't cause sclang to hang waiting for a server connection.
      const synthDefBlock = extractSynthDefBlock(source);
      if (!synthDefBlock) {
        console.log('[SC compile] Could not extract SynthDef block');
        res.json({ success: false, error: 'Could not find SynthDef block in source' } satisfies CompileFailure);
        return;
      }

      console.log(`[SC compile] Extracted block (${synthDefBlock.length} chars):\n${synthDefBlock.slice(0, 300)}${synthDefBlock.length > 300 ? '...' : ''}`);

      // Wrap the SynthDef expression so it writes the .scsyndef binary.
      // Wrap in (...) so multi-line SynthDef is treated as one expression.
      const outDirEscaped = tmpDir.replace(/\\/g, '/'); // SC uses forward slashes
      const script = `(\n${synthDefBlock}\n).writeDefFile("${outDirEscaped}");\n0.exit;\n`;

      // Write script to a file and execute — stdin REPL mode breaks multi-line expressions.
      const scriptPath = path.join(tmpDir, 'compile.sc');
      let sclangOutput: string;
      try {
        sclangOutput = await runSclang(script, scriptPath);
      } catch (err) {
        if (err instanceof SclangNotFoundError) {
          console.error('[SC compile] sclang not found');
          res.status(503).json({ success: false, error: 'SuperCollider (sclang) is not installed on the server. Set SCLANG_PATH to the sclang binary.' } satisfies CompileFailure);
          return;
        }
        const output = err instanceof SclangCompileError ? err.sclangOutput : '';
        const { error, line } = parseSclangError(output);
        console.error(`[SC compile] Compile failed: ${error}${line ? ` (line ${line})` : ''}`);
        res.json({ success: false, error, line, rawOutput: cleanSclangOutput(output) } satisfies CompileFailure);
        return;
      }

      // Read the compiled .scsyndef binary
      const defFile = path.join(tmpDir, `${synthDefName}.scsyndef`);
      let binary: string;
      try {
        const buf = await fs.readFile(defFile);
        binary = buf.toString('base64');
        console.log(`[SC compile] Success — ${synthDefName}.scsyndef (${buf.length} bytes)`);
      } catch {
        // File not created despite exit 0 — probably a runtime error
        const { error, line } = parseSclangError(sclangOutput);
        console.error(`[SC compile] .scsyndef not found after exit 0: ${error}`);
        res.json({ success: false, error, line, rawOutput: cleanSclangOutput(sclangOutput) } satisfies CompileFailure);
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

// ---------------------------------------------------------------------------
// Preset cache — compile-on-demand for community SC presets
// ---------------------------------------------------------------------------

const presetCache = new Map<string, CompileSuccess>();

router.get('/presets/:name', (req: Request, res: Response) => {
  const { name } = req.params;
  const cached = presetCache.get(name);
  if (cached) {
    res.json(cached);
  } else {
    res.status(404).json({ success: false, error: `Preset "${name}" not cached. Compile via POST /sc/compile first.` });
  }
});

router.post('/presets/cache', (req: Request, res: Response) => {
  const { name, result } = req.body as { name: string; result: CompileSuccess };
  if (!name || !result?.success) {
    res.status(400).json({ success: false, error: 'name and valid result required' });
    return;
  }
  presetCache.set(name, result);
  res.json({ success: true, cached: presetCache.size });
});

export default router;
