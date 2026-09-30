/**
 * Aelapse presets use the master chain's parameter keys and 0-100 units.
 *
 * Owner, 2026-09-30: "aelapse dub sounds raw, not working?". The preset gave
 * its parameters as 0-1 fractions and Hz (delayActive: 1, springsActive: 1,
 * delayDryWet: 0.5, delayCutLow: 200) and a key the chain does not read
 * (delaySeconds). The chain reads 0-100 and treats Active <= 50 as off, so the
 * preset ran with the delay AND the springs switched off - dry.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FX_PRESETS } from '../fxPresets';

const registry = readFileSync(join(process.cwd(), 'src/engine/registry/effects/wasm.ts'), 'utf8');
const start = registry.indexOf("id: 'Aelapse'");
const keys = new Set([...registry.slice(start, registry.indexOf('});', start)).matchAll(/p\.(\w+)/g)].map((m) => m[1]));

describe('Aelapse presets', () => {
  const presets = FX_PRESETS.filter((p) => p.effects.some((e) => e.type === 'Aelapse'));
  it('exist', () => expect(presets.length).toBeGreaterThan(0));
  for (const preset of presets) {
    it(`${preset.name}: known keys, 0-100, delay and springs on`, () => {
      for (const fx of preset.effects.filter((e) => e.type === 'Aelapse')) {
        const p = fx.parameters as Record<string, number>;
        for (const [k, v] of Object.entries(p)) {
          expect(keys.has(k), `${k} is not a parameter the chain reads`).toBe(true);
          if (k !== 'delayMode') expect(v, k).toBeGreaterThanOrEqual(0), expect(v, k).toBeLessThanOrEqual(100);
        }
        expect(p.delayActive ?? 100, 'delayActive').toBeGreaterThan(50);
        expect(p.springsActive ?? 100, 'springsActive').toBeGreaterThan(50);
      }
    });
  }
});
