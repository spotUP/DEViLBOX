/**
 * Regression test for the MOD → LibOpenMPT routing fix.
 *
 * Demo-session handoff (2026-04-20) flagged: plain `.mod` files loaded
 * successfully but `libopenmptFileData` stayed null in useFormatStore.
 * Root cause: `parseTrackerModule` (PatternExtractor) — the path for
 * MOD/XM/IT/S3M — returned a TrackerSong without stamping the raw
 * buffer onto `song.libopenmptFileData`. Every obscure format branch in
 * AmigaFormatParsers did; the common-format path didn't.
 *
 * Downstream impact: LibopenmptEngine never instantiated →
 * `getActiveIsolationEngine()` returned null → every per-channel dub
 * send was a silent no-op on the most common tracker format.
 *
 * End-to-end test isn't viable — parseTrackerModule dynamically imports
 * the libopenmpt WASM module which doesn't init in happy-dom. Use the
 * static-source-contract pattern instead (same as
 * `src/engine/__tests__/exportTap.contract.test.ts`): grep the source
 * to lock the invariant.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const EXTRACTOR_SRC = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../parsers/PatternExtractor.ts',
);

describe('parseTrackerModule — libopenmptFileData stamping (source contract)', () => {
  const src = readFileSync(EXTRACTOR_SRC, 'utf8');

  // Pull the `parseTrackerModule` function body — from its declaration
  // to the matching close brace.
  const bodyMatch = src.match(/export async function parseTrackerModule[\s\S]*?^}/m);
  const body = bodyMatch ? bodyMatch[0] : '';

  it('has a findable parseTrackerModule function body', () => {
    expect(body.length, 'should find parseTrackerModule { … } block in source').toBeGreaterThan(200);
  });

  it('return statement stamps libopenmptFileData', () => {
    // Match the return object — must include `libopenmptFileData:`
    // somewhere inside the braces of the final `return { … };`.
    const returnMatch = body.match(/return\s*\{[\s\S]*?\};/);
    expect(returnMatch, 'should find `return { … };` in parseTrackerModule').not.toBeNull();
    expect(returnMatch![0]).toMatch(/libopenmptFileData\s*:/);
  });

  it('stamps with `.slice(0)` so the returned buffer is detached from the caller\'s input', () => {
    // The stamp must be a copy, otherwise downstream engines hold a live
    // reference to the caller's buffer that can be mutated out-of-band.
    const returnMatch = body.match(/return\s*\{[\s\S]*?\};/);
    const returnBlock = returnMatch?.[0] ?? '';
    expect(returnBlock).toMatch(/libopenmptFileData\s*:\s*\w+\.slice\(0\)/);
  });

  it('documents WHY the stamp exists so the invariant survives across refactors', () => {
    // The comment block above / inside the return should mention
    // libopenmpt or dub so the rationale is obvious.
    expect(body.toLowerCase()).toMatch(/libopenmpt|dub|isolation/);
  });
});
