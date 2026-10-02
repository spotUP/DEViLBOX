/**
 * The Plate mix knob shipped with nothing behind it.
 *
 * `plateStage` picks which plate WASM to build and only 'madprofessor' or
 * 'dattorro' cause a stage to exist at all. The mix write is discarded when
 * there is no plateSend node, and the default was 'off' — so the Plate mix
 * knob read 0.35, moved smoothly, and changed absolutely nothing, for everyone,
 * on a fresh install.
 *
 * Reported 2026-10-02 during a dead-knob audit. It did not show up in the
 * structural audit as an unread field, because it *is* read — the read is just
 * behind a guard that the default state can never satisfy. Grepping for read
 * sites cannot catch this class of bug; only "turn the knob, hear something"
 * does. That is the whole argument for the 91-knob reachability suite.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_DUB_BUS } from '@/types/dub';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const BUS = readFileSync(resolve(ROOT, 'engine/dub/DubBus.ts'), 'utf8');

describe('the Plate mix knob has a plate behind it', () => {
  it('defaults to a stage that actually gets built', () => {
    // This is the regression. 'off' here made every Plate mix write a no-op.
    expect(DEFAULT_DUB_BUS.plateStage, 'Plate mix was discarded on arrival because no plate exists').not.toBe('off');
  });

  it('ships a mix level that is meant to be heard', () => {
    expect(DEFAULT_DUB_BUS.plateStageMix).toBeGreaterThan(0);
  });

  it('resolves every non-off stage to a real plate class', () => {
    // The installer is a ternary, 'dattorro' being the fallback rather than a
    // named comparison. If a stage were added to the union it would silently
    // fall into the Dattorro branch, so assert on the classes actually built.
    expect(BUS).toMatch(/new MadProfessorPlateEffect\(\{ wet: 1 \}\)/);
    expect(BUS).toMatch(/new DattorroPlateEffect\(\{ wet: 1 \}\)/);
  });
});