/**
 * mameChipWiring.test.ts — a chip in the picker must have an engine behind it.
 *
 * MSM5232 and TIA sat in the synth picker for months with sources, CMake
 * targets and parameter definitions but NO registry entry, NO engine class and
 * NO committed worklet — InstrumentFactory fell through to a plain Tone.js
 * synth, so picking them played a generic saw and told no one. This pins the
 * whole wiring chain for every MAME chip the parameter table declares:
 * registry entry, worklet glue, wasm artifact.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';
import { SynthRegistry } from '../SynthRegistry';
import '../sdk'; // side effect: registers every SDK synth (lazily by id)
import { CHIP_SYNTH_DEFS } from '../../../constants/chipParameters';

// The registry registers MAME chips LAZILY: sdk/index.ts lists the ids and the
// loader imports sdk/mame on first ensure(). An id missing from that list is
// invisible to the picker even when everything else exists — which is exactly
// how MSM5232 and TIA stayed dead.
beforeAll(async () => {
  await SynthRegistry.ensure('MAMEMSM5232');
  await SynthRegistry.ensure('MAMETIA');
});

const MAME_DIR = join(process.cwd(), 'public/mame');

describe('MAME chip wiring', () => {
  it('registers MSM5232 and TIA with real synth classes', () => {
    for (const id of ['MAMEMSM5232', 'MAMETIA']) {
      const desc = SynthRegistry.get(id);
      expect(desc, `${id} missing from SynthRegistry`).toBeDefined();
      expect(desc!.category).toBe('wasm');
      expect(typeof desc!.create).toBe('function');
    }
  });

  it('ships worklet glue and wasm for MSM5232 and TIA', () => {
    for (const base of ['MSM5232', 'TIA']) {
      expect(existsSync(join(MAME_DIR, `${base}.worklet.js`)), `${base}.worklet.js`).toBe(true);
      expect(existsSync(join(MAME_DIR, `${base}.wasm`)), `${base}.wasm`).toBe(true);
      expect(existsSync(join(MAME_DIR, `${base}.js`)), `${base}.js`).toBe(true);
    }
  });

  it('every MAME chip in the parameter table resolves in the registry', async () => {
    // The parameter table is what the picker renders — an entry here without a
    // registry entry is exactly the silent-fallback trap this test exists for.
    // Known-dead entries, pinned so this list can only shrink:
    // - MAMEAICA: wasm + worklet artifacts exist but there is no engine class
    //   and it is not offered in the picker.
    // - MAMEMultiPCM: in the picker but mame-wasm has NO source for it —
    //   wiring it means porting the emulator first.
    const KNOWN_UNWIRED = ['MAMEAICA', 'MAMEMultiPCM'];
    const ids = Object.keys(CHIP_SYNTH_DEFS).filter((k) => k.startsWith('MAME'));
    const unwired: string[] = [];
    for (const id of ids) {
      if (!(await SynthRegistry.ensure(id))) unwired.push(id);
    }
    expect(unwired.sort()).toEqual(KNOWN_UNWIRED);
  });
});
