/**
 * Static source-contract guard for the ChannelRoutedEffects retry-on-attach
 * behavior (G6).
 *
 * Background: `setChannelDubSend` calls `_activateDubChannel`, which gives up
 * silently if no isolation engine (or no worklet) is available at that exact
 * moment. That's a real race in production — a user can drag a dub-send knob
 * up before a song starts playing, and the worklet wiring won't happen until
 * the engine attaches later. Without the pending-activation retry, the send
 * value is stored but no audio flows, and only a later knob wiggle re-fires
 * activation.
 *
 * Rather than drag a full WebAudio graph + isolation engine mock into
 * happy-dom (several hundred lines of setup just to exercise ~4 statements of
 * logic), we assert the contract at the source level. A parallel pattern is
 * used in `src/lib/import/__tests__/FormatRegistry.detection.test.ts`.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE = readFileSync(
  resolve(__dirname, '..', 'ChannelRoutedEffects.ts'),
  'utf8',
);

describe('ChannelRoutedEffects — G6 pending dub-channel activation retry', () => {
  it('declares a channelDubPendingActivation Set<number> field', () => {
    // The Set holds channel indices whose activation was deferred. Typed as
    // Set<number> so TypeScript catches accidental misuse (stringly-typed
    // channel ids would slip through Set<any>).
    expect(SOURCE).toMatch(
      /private\s+channelDubPendingActivation\s*:\s*Set<number>\s*=\s*new\s+Set\s*\(\s*\)/,
    );
  });

  it('adds to the pending set when activation aborts (no engine or worklet)', () => {
    // Both early-return branches (engine null/unavailable, worklet null) must
    // add to the set — otherwise the retry in rebuildDubConnections is a
    // no-op. Count the literal statement rather than regex the two branches
    // separately, so either branch reordering or a single consolidated guard
    // still passes as long as both paths add.
    const adds = SOURCE.match(
      /this\.channelDubPendingActivation\.add\(channelIndex\)/g,
    );
    expect(adds, 'expected two .add(channelIndex) calls (null engine + null worklet)').not.toBeNull();
    expect(adds!.length).toBeGreaterThanOrEqual(2);
  });

  it('removes from the pending set once activation succeeds', () => {
    // Successful activation path must delete the pending marker so a second
    // rebuild cycle doesn't double-connect. Pairs with the .add on the early
    // returns above.
    expect(SOURCE).toMatch(
      /this\.channelDubPendingActivation\.delete\(channelIndex\)/,
    );
  });

  it('clears the pending set inside rebuildDubConnections before re-activation', () => {
    // rebuildDubConnections is the retry entry point. Clearing before the
    // re-activation loop prevents stale pending markers from surviving a
    // successful wire-up. The regex anchors to the method to catch the case
    // where the clear gets moved out into an unrelated code path.
    const methodMatch = SOURCE.match(
      /async\s+rebuildDubConnections\s*\(\s*\)[\s\S]*?\n  \}/,
    );
    expect(methodMatch, 'rebuildDubConnections method not found').not.toBeNull();
    expect(methodMatch![0]).toMatch(
      /this\.channelDubPendingActivation\.clear\(\s*\)/,
    );
  });
});
