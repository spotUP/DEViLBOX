/**
 * A worklet message arriving after an effect was disposed does nothing.
 *
 * Switching master presets quickly disposes effects whose worklet has not yet
 * answered 'ready'; the answer then reached a handler that used
 * `this.workletNode!` after dispose() had nulled it: "Uncaught TypeError:
 * Cannot read properties of null (reading 'port')" at TapeSimulatorEffect
 * (2026-09-30). Every wrapper's handler now returns first when the node is gone.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'src/engine/effects');

describe('effect worklet message handlers', () => {
  it('return when the node is gone', () => {
    let checked = 0;
    for (const f of readdirSync(DIR).filter((n) => n.endsWith('Effect.ts'))) {
      const s = readFileSync(join(DIR, f), 'utf8');
      if (!s.includes('this.workletNode!')) continue;
      for (const m of s.matchAll(/this\.workletNode\.port\.onmessage = (?:\(\w+\)|\w+) => \{\n\s*([^\n]*)/g)) {
        expect(m[1], f).toMatch(/^if \((this\._disposed \|\| )?!this\.workletNode\) return;/);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(60);
  });
});
