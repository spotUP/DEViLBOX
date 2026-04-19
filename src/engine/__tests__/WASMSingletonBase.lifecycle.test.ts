/**
 * Lifecycle contract for WASMSingletonBase subclasses.
 *
 * The base class's header documents a precise subclass contract (read
 * `src/engine/wasm/WASMSingletonBase.ts` line 140 onwards). Regressions
 * come from subclasses that quietly drift from it:
 *   - forgetting the private constructor → singleton leak
 *   - forgetting the _disposed check in getInstance() → reuse a dead engine
 *   - forgetting the audioContext check → stay attached to a dead AudioContext
 *
 * All of the above are silent at runtime: audio goes away, no error.
 *
 * This is a source-level check. No WASM instantiation, no AudioContext.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

interface EngineFile {
  path: string;
  src: string;
  className: string;
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** Recursively yield .ts files under dir, skipping __tests__ and node_modules.
 *  Node 20 compatibility: can't use fs/promises#glob (Node 22+). */
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

function findEngineFiles(): EngineFile[] {
  const out: EngineFile[] = [];
  for (const full of walkTs(join(REPO_ROOT, 'src/engine'))) {
    const src = readFileSync(full, 'utf-8');
    const m = src.match(/export\s+class\s+(\w+)\s+extends\s+WASMSingletonBase\b/);
    if (!m) continue;
    out.push({ path: full, src, className: m[1] });
  }
  return out.sort((a, b) => a.className.localeCompare(b.className));
}

let engines: EngineFile[] = [];

describe('WASMSingletonBase subclasses — lifecycle contract', () => {
  beforeAll(() => {
    engines = findEngineFiles();
  });

  it('finds a plausible number of subclasses (>= 50)', () => {
    expect(engines.length).toBeGreaterThanOrEqual(50);
  });

  it('every subclass declares `static instance` (singleton slot)', () => {
    const missing: string[] = [];
    for (const e of engines) {
      // Accept either `private static instance: X | null = null;` or
      // `static instance: X | null = null;` — what matters is the slot exists.
      const re = /\bstatic\s+instance\s*[:=]/;
      if (!re.test(e.src)) missing.push(e.className);
    }
    expect(missing, `missing static instance: ${missing.join(', ')}`).toEqual([]);
  });

  it('every subclass exposes `static getInstance()`', () => {
    const missing: string[] = [];
    for (const e of engines) {
      if (!/\bstatic\s+getInstance\s*\(/.test(e.src)) missing.push(e.className);
    }
    expect(missing, `missing getInstance: ${missing.join(', ')}`).toEqual([]);
  });

  it('every subclass exposes `static hasInstance()`', () => {
    const missing: string[] = [];
    for (const e of engines) {
      if (!/\bstatic\s+hasInstance\s*\(/.test(e.src)) missing.push(e.className);
    }
    expect(missing, `missing hasInstance: ${missing.join(', ')}`).toEqual([]);
  });

  it('every subclass has a private or protected constructor (singleton enforcement)', () => {
    const wrong: string[] = [];
    for (const e of engines) {
      // Look for a constructor in the class body. Must be `private` or
      // `protected`. If it's `public` or omitted, it's a singleton leak.
      const ctorMatch = e.src.match(/^(\s*)(private|protected|public)?\s*constructor\s*\(/m);
      if (!ctorMatch) {
        wrong.push(`${e.className}: no constructor`);
        continue;
      }
      const modifier = ctorMatch[2];
      if (modifier !== 'private' && modifier !== 'protected') {
        wrong.push(`${e.className}: constructor is "${modifier ?? 'public (default)'}"`);
      }
    }
    expect(wrong, `constructor modifier issues:\n  ${wrong.join('\n  ')}`).toEqual([]);
  });

  it('every subclass implements `getLoaderConfig()` (required abstract)', () => {
    const missing: string[] = [];
    for (const e of engines) {
      if (!/\bgetLoaderConfig\s*\(/.test(e.src)) missing.push(e.className);
    }
    expect(missing, `missing getLoaderConfig: ${missing.join(', ')}`).toEqual([]);
  });

  it('every subclass implements `createNode()` (required abstract)', () => {
    const missing: string[] = [];
    for (const e of engines) {
      if (!/\bcreateNode\s*\(/.test(e.src)) missing.push(e.className);
    }
    expect(missing, `missing createNode: ${missing.join(', ')}`).toEqual([]);
  });

  /**
   * The three checks below ratchet a known-bad set of engines that don't
   * follow the full contract. We allow the current set to stay (fixing each
   * one is a separate, per-engine refactor), but fail if the set GROWS —
   * i.e. a new engine joins the bad list. That prevents new regressions
   * without pretending the existing ones don't exist.
   *
   * To fix one of these engines: follow JamCrackerEngine.ts lines 48-63 as
   * the canonical reference implementation, then remove its name from the
   * relevant allowlist below.
   */

  // Engines whose constructor kicks off init via a custom helper (usually
  // because they need to fetch extra assets beyond the standard worklet+wasm):
  const INITIALIZE_OPT_OUT = new Set([
    'OrganyaEngine', // fetches an additional soundbank
    'SunVoxEngine',  // different lifecycle shape
  ]);

  it('every subclass that uses the standard init path calls `this.initialize(...)`', () => {
    const missing: string[] = [];
    for (const e of engines) {
      if (INITIALIZE_OPT_OUT.has(e.className)) continue;
      if (!/\bthis\.initialize\s*\(/.test(e.src)) missing.push(e.className);
    }
    expect(
      missing,
      `new subclasses that never call this.initialize(): ${missing.join(', ')}. If this is intentional, add the class to INITIALIZE_OPT_OUT in this test.`,
    ).toEqual([]);
  });

  // Known offenders: getInstance does not reference `_disposed`. Fixing these
  // prevents zombie-reuse after a dispose() — low-severity but real.
  const DISPOSED_GUARD_DEBT = new Set([
    'SymphonieEngine',
  ]);

  it('subclasses guard `_disposed` in getInstance (existing debt locked)', () => {
    const missing: string[] = [];
    for (const e of engines) {
      const m = e.src.match(/\bstatic\s+getInstance\s*\([^)]*\)[^{]*\{([\s\S]*?)\n\s*\}/);
      if (!m) continue;
      const body = m[1];
      if (!/_disposed\b/.test(body)) missing.push(e.className);
    }
    const newOffenders = missing.filter((n) => !DISPOSED_GUARD_DEBT.has(n));
    expect(
      newOffenders,
      `new engines with zombie-reuse risk: ${newOffenders.join(', ')}. Follow JamCrackerEngine.ts:48-63 as reference.`,
    ).toEqual([]);
  });

  // Known offenders: getInstance does not reference `audioContext`, so a swap
  // (dev HMR, page reload, context restart) leaves them attached to a dead
  // AudioContext → silent playback. This is the SidMon1 regression class.
  const CONTEXT_GUARD_DEBT = new Set([
    'BdEngine',
    'CoreDesignEngine',
    'CpsycleEngine',
    'EupminiEngine',
    'FmplayerEngine',
    'FredEditorReplayerEngine',
    'IxalanceEngine',
    'MaEngine',
    'MdxminiEngine',
    'PreTrackerEngine',
    'PT2Engine',
    'PumaTrackerEngine',
    'QsfEngine',
    'RobHubbardEngine',
    'Sc68Engine',
    'Sd2Engine',
    'SidMon1Engine',          // the canonical scar
    'SidMon1ReplayerEngine',
    'SidMonEngine',
    'SonixEngine',
    'StartrekkerAMEngine',
    'SteveTurnerEngine',
    'SunVoxEngine',
    'ZxtuneEngine',
  ]);

  it('subclasses guard the AudioContext swap in getInstance (existing debt locked)', () => {
    const missing: string[] = [];
    for (const e of engines) {
      const m = e.src.match(/\bstatic\s+getInstance\s*\([^)]*\)[^{]*\{([\s\S]*?)\n\s*\}/);
      if (!m) continue;
      const body = m[1];
      if (!/audioContext\b/.test(body)) missing.push(e.className);
    }
    const newOffenders = missing.filter((n) => !CONTEXT_GUARD_DEBT.has(n));
    expect(
      newOffenders,
      `new engines with stale-AudioContext risk: ${newOffenders.join(', ')}. Follow JamCrackerEngine.ts:48-63 — compare instance.audioContext to getDevilboxAudioContext() and dispose on mismatch.`,
    ).toEqual([]);
  });
});
