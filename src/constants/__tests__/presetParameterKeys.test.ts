/**
 * Presets use the parameter names their effects read.
 *
 * Audited 2026-09-30 after Aelapse Dub turned out to run with its delay and
 * springs off: the Tone.js delays read `time`, but 14 presets wrote
 * `delayTime` and all played the 250 ms default; Distortion reads `drive`, but
 * 6 presets wrote `distortion` and all played the default 0.4; Spacey Delay's
 * preset used another effect's names entirely. An unknown key is ignored
 * without a word, so it is caught here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FX_PRESETS } from '../fxPresets';

const tonejs = readFileSync(join(process.cwd(), 'src/engine/registry/effects/tonejs.ts'), 'utf8');
function readKeys(id: string): Set<string> {
  const i = tonejs.indexOf(`id: '${id}'`);
  const body = tonejs.slice(i, tonejs.indexOf("\n  },", i));
  return new Set([...body.matchAll(/p\.(\w+)/g)].map((m) => m[1]));
}
const GLOBAL = new Set(['bpmSync', 'syncDivision', 'sidechainSource']);
// Keys with no counterpart in the effect, kept as harmless notes of intent.
const IGNORED_OK = new Set(['type', 'stages', 'depth']);

describe('preset parameter names', () => {
  for (const type of ['Delay', 'FeedbackDelay', 'PingPongDelay', 'Distortion', 'SpaceyDelayer']) {
    it(`${type} presets use only the keys ${type} reads`, () => {
      const keys = readKeys(type);
      expect(keys.size, type).toBeGreaterThan(0);
      for (const p of FX_PRESETS) for (const fx of p.effects.filter((e) => e.type === type)) {
        for (const k of Object.keys(fx.parameters ?? {})) {
          if (GLOBAL.has(k) || IGNORED_OK.has(k)) continue;
          expect(keys.has(k), `${p.name}: ${type}.${k}`).toBe(true);
        }
      }
    });
  }
});
