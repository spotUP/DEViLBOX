/**
 * Contract tests for the WASM_ENGINES[] routing registry.
 *
 * The registry is module-private (not exported), so we statically parse
 * the source file and verify structural invariants. This is exactly the
 * class of regression that caused the SidMon1 migration revert twice:
 * one engine silently claimed another engine's fileDataKey, or lost its
 * loader wiring, and nothing enforced uniqueness.
 *
 * What we guard against:
 *   - Two descriptors sharing a `key` / `synthType` / `fileDataKey`.
 *   - Descriptors missing required fields.
 *   - Descriptors with neither staticRef nor dynamicResolver.
 *   - fileDataKey strings that don't appear as fields on TrackerSong.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ENGINE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROUTING_FILE = resolve(ENGINE_DIR, 'replayer/NativeEngineRouting.ts');
const TRACKER_REPLAYER = resolve(ENGINE_DIR, 'TrackerReplayer.ts');

interface ParsedDescriptor {
  source: string;
  key: string;
  synthType: string;
  fileDataKey: string;
  formats: string | null;
  loadMethod: string;
  hasStaticRef: boolean;
  hasDynamicResolver: boolean;
  hasDynamicImport: boolean;
}

/**
 * Pull `{ key: '...', synthType: '...', fileDataKey: '...', ... }` object
 * literals out of the WASM_ENGINES array. We scope to the array bracket
 * range so we don't pick up unrelated literal objects elsewhere in the file.
 */
function parseDescriptors(src: string): ParsedDescriptor[] {
  // Anchor on the assignment so we skip past the `NativeEngineDescriptor[]`
  // type annotation's empty brackets.
  const assignIdx = src.indexOf('WASM_ENGINES: NativeEngineDescriptor[] = [');
  if (assignIdx < 0) throw new Error('WASM_ENGINES array not found');
  const arrayStart = src.indexOf('= [', assignIdx);
  if (arrayStart < 0) throw new Error('could not find WASM_ENGINES array start');
  // Walk bracket depth from the real opening `[`.
  let depth = 0;
  let i = arrayStart + 2; // position of the array's opening `[`
  let end = -1;
  for (; i < src.length; i++) {
    if (src[i] === '[') depth++;
    else if (src[i] === ']') {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end < 0) throw new Error('could not find WASM_ENGINES closing bracket');
  const arrayBody = src.slice(arrayStart, end);

  // Each descriptor starts at the opening `{` after a top-level `,` in the
  // array. Use the `key:` anchor to split.
  const descriptors: ParsedDescriptor[] = [];
  const keyRe = /\{\s*key:\s*['"`]([^'"`]+)['"`]/g;
  let match: RegExpExecArray | null;
  while ((match = keyRe.exec(arrayBody)) !== null) {
    const openBrace = match.index;
    // Find the closing brace for this descriptor.
    let d = 0;
    let j = openBrace;
    for (; j < arrayBody.length; j++) {
      if (arrayBody[j] === '{') d++;
      else if (arrayBody[j] === '}') {
        d--;
        if (d === 0) {
          j++;
          break;
        }
      }
    }
    const block = arrayBody.slice(openBrace, j);

    const getStr = (field: string): string | null => {
      const m = block.match(new RegExp(`\\b${field}:\\s*['"\`]([^'"\`]+)['"\`]`));
      return m ? m[1] : null;
    };

    const key = getStr('key');
    const synthType = getStr('synthType');
    const fileDataKey = getStr('fileDataKey');
    const loadMethod = getStr('loadMethod');
    const formatsMatch = block.match(/\bformats:\s*(null|\[[^\]]*\])/);

    if (!key || !synthType || !fileDataKey || !loadMethod) continue;

    descriptors.push({
      source: block,
      key,
      synthType,
      fileDataKey,
      formats: formatsMatch?.[1] ?? null,
      loadMethod,
      hasStaticRef: /\bstaticRef:\s*(?!null)(?!undefined)\b/.test(block),
      hasDynamicResolver: /\bdynamicResolver\s*:/.test(block),
      hasDynamicImport: /\bdynamicImport\s*:/.test(block),
    });
  }
  return descriptors;
}

let descriptors: ParsedDescriptor[] = [];
let trackerSongSrc = '';

describe('NativeEngineRouting.WASM_ENGINES — structural contract', () => {
  beforeAll(() => {
    const src = readFileSync(ROUTING_FILE, 'utf-8');
    descriptors = parseDescriptors(src);
    trackerSongSrc = readFileSync(TRACKER_REPLAYER, 'utf-8');
  });

  it('parses a plausible number of engine descriptors (>= 20)', () => {
    expect(descriptors.length).toBeGreaterThanOrEqual(20);
  });

  it('every descriptor has key / synthType / fileDataKey / loadMethod', () => {
    for (const d of descriptors) {
      expect(d.key).toBeTruthy();
      expect(d.synthType).toBeTruthy();
      expect(d.fileDataKey).toBeTruthy();
      expect(d.loadMethod).toMatch(/^(loadTune|loadSong)$/);
    }
  });

  it('descriptor keys are unique', () => {
    const seen = new Map<string, number>();
    for (const d of descriptors) {
      seen.set(d.key, (seen.get(d.key) ?? 0) + 1);
    }
    const dups = Array.from(seen.entries()).filter(([, n]) => n > 1);
    expect(dups, `duplicate descriptor keys: ${JSON.stringify(dups)}`).toEqual([]);
  });

  it('synthType values are unique', () => {
    const seen = new Map<string, number>();
    for (const d of descriptors) {
      seen.set(d.synthType, (seen.get(d.synthType) ?? 0) + 1);
    }
    const dups = Array.from(seen.entries()).filter(([, n]) => n > 1);
    expect(dups, `duplicate synthType: ${JSON.stringify(dups)}`).toEqual([]);
  });

  it('fileDataKey values are unique — no two engines may claim the same song field', () => {
    const seen = new Map<string, string[]>();
    for (const d of descriptors) {
      const list = seen.get(d.fileDataKey) ?? [];
      list.push(d.key);
      seen.set(d.fileDataKey, list);
    }
    const dups = Array.from(seen.entries()).filter(([, engines]) => engines.length > 1);
    expect(
      dups,
      `fileDataKey collisions: ${JSON.stringify(dups)}`,
    ).toEqual([]);
  });

  it('every descriptor has a loader: staticRef OR dynamicResolver OR dynamicImport', () => {
    const missing: string[] = [];
    for (const d of descriptors) {
      if (!d.hasStaticRef && !d.hasDynamicResolver && !d.hasDynamicImport) {
        missing.push(d.key);
      }
    }
    expect(missing, `engines missing loader: ${JSON.stringify(missing)}`).toEqual([]);
  });

  it('every fileDataKey appears as a property on TrackerSong', () => {
    const missing: Array<{ engine: string; key: string }> = [];
    for (const d of descriptors) {
      const fieldRegex = new RegExp(`\\b${d.fileDataKey}\\b\\s*[?]?\\s*:`);
      if (!fieldRegex.test(trackerSongSrc)) {
        missing.push({ engine: d.key, key: d.fileDataKey });
      }
    }
    expect(missing, `TrackerSong missing fields:\n${JSON.stringify(missing, null, 2)}`).toEqual([]);
  });
});
