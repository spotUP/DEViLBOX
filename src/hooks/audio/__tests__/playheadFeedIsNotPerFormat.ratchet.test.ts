/**
 * The play head belongs to every engine-driven format, not to whichever one
 * was worked on last.
 *
 * `useWasmPositionStore` is the channel the pattern editor checks FIRST,
 * because for an engine-driven song `replayer.getStateAtTime()` returns the
 * last state its scheduler left — stale, not null — so the null-state
 * fallback beside it never runs and the grid draws a frozen row.
 *
 * That feed was once written `if (sonixFileData)`. Sonix was not special: it
 * was simply the last format anyone had chased down, so it was the only one
 * that got the fix. Every other engine-driven format — SunTronic, the UADE
 * family, the WASM replayers — sat frozen until 2026-09-24, when the owner
 * reported "almost no formats display correctly in the pattern editor".
 *
 * This is a RATCHET. It fails if the feed is ever narrowed to a single
 * format again. It is a source check rather than a behavioural test because
 * the path needs a live engine and an AudioContext; the behaviour was
 * verified by instrumented measurement (rows 1..40 arriving while the grid
 * stood still) and across the corpus by the owner.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = join(process.cwd(), 'src/hooks/audio/usePatternPlayback.ts');
const FEED = 'useWasmPositionStore.getState().setPosition(';

/** The condition guarding the position feed, as written in the source. */
function guardOfTheFeed(): string {
  const src = readFileSync(SOURCE, 'utf8');
  const at = src.indexOf(FEED);
  expect(at, `${FEED} is gone from usePatternPlayback — the play head has no feed`)
    .toBeGreaterThan(-1);
  // The `if (...)` immediately above the call.
  const before = src.slice(0, at);
  const ifAt = before.lastIndexOf('if (');
  expect(ifAt, 'the feed is not guarded by anything recognisable').toBeGreaterThan(-1);
  return before.slice(ifAt, before.length).split('\n')[0];
}

describe('the pattern editor play-head feed', () => {
  it('is driven by whether NOTES ARE SUPPRESSED, not by a format', () => {
    // `isSuppressNotes` is the measured condition. A first attempt used
    // `coordinator.hasActiveDispatch` and did nothing at all — on SunTronic
    // the probe read `suppressNotes=true engineDispatch=false`. A wrong
    // condition here fails SILENTLY, which is how the original lasted months.
    expect(guardOfTheFeed()).toContain('isSuppressNotes');
  });

  it('names no single format', () => {
    // The shape of the original bug: `if (sonixFileData)`. Any `xxxFileData`
    // flag in this guard means one format has been privileged again.
    const guard = guardOfTheFeed();
    expect(guard, `the feed is gated on a per-format flag: ${guard}`)
      .not.toMatch(/[A-Za-z]+FileData/);
  });
});
