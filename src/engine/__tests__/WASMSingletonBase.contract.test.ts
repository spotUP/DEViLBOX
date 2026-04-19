/**
 * Structural contract for every WASMSingletonBase subclass.
 *
 * Each engine that extends WASMSingletonBase declares its asset paths in
 * getLoaderConfig() as literal strings: dir + workletFile + wasmFile (+
 * optional jsFile). If any of those files goes missing on disk — because
 * someone renamed a worklet, deleted an artifact, or changed the public
 * output dir without updating the loader — the engine stays silent at
 * runtime with no crash. That class of regression caused the SidMon1
 * migration revert (see CLAUDE.md § "WASM engine lifecycle safety").
 *
 * This test walks every subclass source file, extracts the strings, and
 * asserts the matching files exist under public/. No WASM instantiation,
 * no audio — pure static + filesystem check.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

/**
 * Recursively walk a directory and yield every `.ts` file that doesn't
 * live under a `__tests__` segment. `fs/promises#glob` would be nicer
 * but is Node 22+; CI still runs on Node 20.
 */
function walkTs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      out.push(...walkTs(full));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

interface LoaderConfig {
  engineFile: string;
  className: string | null;
  dir: string;
  workletFile: string;
  wasmFile: string;
  jsFile: string | null;
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const PUBLIC_DIR = join(REPO_ROOT, 'public');

/**
 * Find every engine file under src/engine/ that extends WASMSingletonBase.
 * Does not descend into __tests__ directories.
 */
function findEngineFiles(): string[] {
  const files: string[] = [];
  for (const full of walkTs(join(REPO_ROOT, 'src/engine'))) {
    const src = readFileSync(full, 'utf-8');
    if (/extends\s+WASMSingletonBase\b/.test(src)) {
      files.push(full);
    }
  }
  return files.sort();
}

/**
 * Extract the literal loader-config strings from an engine source file.
 * Returns null if the file doesn't contain a parseable getLoaderConfig().
 */
function extractLoaderConfig(engineFile: string): LoaderConfig | null {
  const src = readFileSync(engineFile, 'utf-8');

  // Match the returned object literal inside getLoaderConfig() { return { ... }; }
  const blockMatch = src.match(
    /getLoaderConfig\s*\([^)]*\)[^{]*\{\s*return\s*\{([\s\S]*?)\}\s*;?\s*\}/,
  );
  if (!blockMatch) return null;
  const block = blockMatch[1];

  const extract = (key: string): string | null => {
    const m = block.match(new RegExp(`\\b${key}\\s*:\\s*['"\`]([^'"\`]+)['"\`]`));
    return m ? m[1] : null;
  };

  const dir = extract('dir');
  const workletFile = extract('workletFile');
  const wasmFile = extract('wasmFile');
  const jsFile = extract('jsFile');

  if (!dir || !workletFile || !wasmFile) return null;

  const classMatch = src.match(/export\s+class\s+(\w+)\s+extends\s+WASMSingletonBase\b/);
  return {
    engineFile,
    className: classMatch?.[1] ?? null,
    dir,
    workletFile,
    wasmFile,
    jsFile,
  };
}

let configs: LoaderConfig[] = [];

describe('WASMSingletonBase subclasses — static loader contract', () => {
  beforeAll(() => {
    const files = findEngineFiles();
    configs = files
      .map(extractLoaderConfig)
      .filter((c): c is LoaderConfig => c !== null);
  });

  it('finds a reasonable number of engine subclasses (>= 50)', () => {
    expect(configs.length).toBeGreaterThanOrEqual(50);
  });

  it('every extracted config has non-empty dir / workletFile / wasmFile', () => {
    for (const c of configs) {
      expect(c.dir, `${c.engineFile}: dir`).toBeTruthy();
      expect(c.workletFile, `${c.engineFile}: workletFile`).toBeTruthy();
      expect(c.wasmFile, `${c.engineFile}: wasmFile`).toBeTruthy();
    }
  });

  it('every worklet file exists on disk and is non-empty', () => {
    const missing: Array<{ engine: string; path: string }> = [];
    for (const c of configs) {
      const p = join(PUBLIC_DIR, c.dir, c.workletFile);
      if (!existsSync(p) || statSync(p).size === 0) {
        missing.push({ engine: c.className ?? c.engineFile, path: p });
      }
    }
    expect(missing, `missing worklet files:\n${JSON.stringify(missing, null, 2)}`).toEqual([]);
  });

  it('every wasm file exists on disk and is > 1 KB', () => {
    const missing: Array<{ engine: string; path: string; size: number }> = [];
    for (const c of configs) {
      const p = join(PUBLIC_DIR, c.dir, c.wasmFile);
      if (!existsSync(p)) {
        missing.push({ engine: c.className ?? c.engineFile, path: p, size: 0 });
        continue;
      }
      const size = statSync(p).size;
      if (size < 1024) {
        missing.push({ engine: c.className ?? c.engineFile, path: p, size });
      }
    }
    expect(missing, `missing or undersized wasm files:\n${JSON.stringify(missing, null, 2)}`).toEqual([]);
  });

  it('every declared js glue file exists when jsFile is set', () => {
    const missing: Array<{ engine: string; path: string }> = [];
    for (const c of configs) {
      if (!c.jsFile) continue;
      const p = join(PUBLIC_DIR, c.dir, c.jsFile);
      if (!existsSync(p) || statSync(p).size === 0) {
        missing.push({ engine: c.className ?? c.engineFile, path: p });
      }
    }
    expect(missing, `missing js glue files:\n${JSON.stringify(missing, null, 2)}`).toEqual([]);
  });
});
