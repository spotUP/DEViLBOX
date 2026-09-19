/**
 * The handlers `FT2Toolbar` registers must never read render-scoped state.
 *
 * `FT2Toolbar` hands its handlers to `useFT2ToolbarActions` so the NavBar can
 * drive them while the toolbar is hidden by dub-deck fullscreen, and the
 * registration deliberately outlives the unmount. The wrappers call through
 * refs, so while the toolbar renders they always reach the newest handler —
 * which is exactly what hides the bug. An unmounted component stops rendering,
 * the refs stop being reassigned, and every value those handlers captured
 * freezes at the last render.
 *
 * This shipped three times over:
 *   - play/stop froze at `isPlaying === false`, so the NavBar button read
 *     "Stop Song" (label computed live) and tried to start playback again;
 *   - undo/redo froze `currentPatternIndex`, which writes the recovered
 *     pattern into whichever pattern happened to be open at unmount — silent
 *     corruption, not a dead button;
 *   - save froze the whole song, and would have written a mix of current and
 *     stale state that no reload can detect.
 *
 * So this is one test for the CLASS, not three for the three symptoms. It
 * walks the structure that produces the bug — register block, ref wiring,
 * handler bodies — and fails on any render-scoped VALUE that is read without
 * being re-read live first. Store ACTIONS are exempt: zustand defines them
 * once in the store creator, so their identity never goes stale.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(
  resolve(import.meta.dirname, '..', 'FT2Toolbar', 'FT2Toolbar.tsx'),
  'utf8',
);

const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

/** Body of `const <name> = ...`, brace-matched from its first `{`. */
function bodyOf(name: string): string {
  const at = src.indexOf(`const ${name} = `);
  expect(at, `handler ${name} not found`).toBeGreaterThan(-1);
  let depth = 0;
  let start = -1;
  for (let i = at; i < src.length; i++) {
    if (src[i] === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (src[i] === '}') {
      if (--depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced braces in ${name}`);
}

/** Names bound by `const`/`let` inside a body, including destructures. */
function locallyBound(body: string): Set<string> {
  const out = new Set<string>();
  for (const m of body.matchAll(/\b(?:const|let)\s+(\w+)\s*=/g)) out.add(m[1]);
  for (const m of body.matchAll(/\b(?:const|let)\s*\{([^}]*)\}\s*=/g)) {
    for (const part of m[1].split(',')) {
      const bound = part.includes(':') ? part.split(':')[1] : part;
      const name = bound.trim().replace(/^\.\.\./, '').split('=')[0].trim();
      if (name) out.add(name);
    }
  }
  return out;
}

/**
 * Every binding the component pulls out of a store selector, read from the
 * selectors themselves rather than from a list I keep by hand.
 */
const renderScoped = new Set(
  [...src.matchAll(/(\w+)\s*:\s*s\.(\w+)/g)].map((m) => m[1]),
);

/**
 * Store ACTIONS are stable for the life of the store, so a registered handler
 * may hold one. Store VALUES are a new object every render and freeze at
 * unmount.
 */
const ACTIONS = new Set([
  'addInstrument', 'canRedo', 'canUndo', 'loadInstruments', 'loadPatterns',
  'play', 'redo', 'replacePattern', 'reset', 'resetProject', 'resizePattern',
  'setBPM', 'setCurrentPattern', 'setCurrentPosition', 'setCurrentRow',
  'setEditStep', 'setGrooveTemplate', 'setIsLooping', 'setMetadata',
  'setPatternOrder', 'setSpeed', 'stop', 'undo', 'updateInstrument',
]);
const VALUES = new Set([
  'bpm', 'currentPatternIndex', 'currentPositionIndex', 'curves', 'editStep',
  'instruments', 'isLooping', 'isPlaying', 'metadata', 'patternOrder',
  'patterns', 'speed',
]);

/** The handlers actually registered, resolved through the ref wiring. */
function registeredHandlers(): string[] {
  const block = src.slice(
    src.indexOf('useFT2ToolbarActions.getState().register({'),
  );
  const refs = [...block.slice(0, block.indexOf('});')).matchAll(/_(\w+)Ref\.current\(\)/g)]
    .map((m) => `_${m[1]}Ref`);
  const handlers: string[] = [];
  for (const ref of refs) {
    const m = src.match(new RegExp(`${ref}\\.current\\s*=\\s*(\\w+)`));
    if (m) handlers.push(m[1]);
  }
  return handlers;
}

describe('FT2Toolbar handlers registered for the NavBar', () => {
  it('classifies every store binding the component subscribes to', () => {
    // Forces a decision on anything new: an unclassified binding is one nobody
    // has judged safe to freeze, so the sweep below would silently skip it.
    const unclassified = [...renderScoped].filter(
      (n) => !ACTIONS.has(n) && !VALUES.has(n),
    );
    expect(unclassified).toEqual([]);
    expect(renderScoped.size).toBeGreaterThan(20);
  });

  it('registers the handlers it promises to, through live refs', () => {
    const handlers = registeredHandlers();
    expect(handlers).toContain('handlePlaySong');
    expect(handlers).toContain('handlePlayPattern');
    expect(handlers).toContain('handleSave');
    expect(handlers).toContain('handleUndo');
    expect(handlers).toContain('handleRedo');
    // The bridge itself is correct and stays: the handlers must survive the
    // toolbar's own unmount for the NavBar row to work at all.
    expect(src).not.toContain('useFT2ToolbarActions.getState().unregister()');
  });

  it('reads no render-scoped value that would freeze at unmount', () => {
    const offenders: string[] = [];
    for (const handler of registeredHandlers()) {
      const body = stripComments(bodyOf(handler));
      const shadowed = locallyBound(body);
      for (const name of VALUES) {
        if (shadowed.has(name)) continue;
        if (new RegExp(`(?<![.\\w])${name}(?![\\w:])`).test(body)) {
          offenders.push(`${handler} reads ${name}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
