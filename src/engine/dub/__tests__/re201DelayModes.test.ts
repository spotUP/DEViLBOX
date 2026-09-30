/**
 * The RE-201 delay modes are named as the engine implements them.
 *
 * Owner, 2026-09-30: "i have never heard any really heavy bouncy dub echoes
 * in devilbox it sounds more like reverb". The type and the panel called mode 9
 * "H2 + H3 + Reverb (Tubby)" while the C++ runs all three heads with no
 * reverb, and the Tubby preset, meaning "three-tap, no double spring", set 7:
 * head 1 plus the RE-201's own spring in front of the bus's spring and plate.
 * Measured with measure_dub_echo_response on the owner's bus, the echo output
 * is clean repeats at 320 / 640 / 960 ms with the echo ahead of the spring;
 * with the spring ahead (Perry's order) half the energy sits between repeats.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RE201_DELAY_MODES, DEFAULT_DUB_BUS } from '@/types/dub';

const cpp = readFileSync(join(process.cwd(), 're201-wasm/RE201WASM.cpp'), 'utf8');

describe('RE-201 delay modes', () => {
  it('match the C++ switch, heads and reverb', () => {
    const cases = [...cpp.matchAll(/case (\d+):\s*([^\n]*?)break;/g)].filter((m) => /h[123]|reverbEnabled/.test(m[2]));
    expect(cases.length).toBe(11);
    for (const [, n, body] of cases) {
      const mode = RE201_DELAY_MODES.find((m) => m.value === Number(n))!;
      const heads = ['1', '2', '3'].filter((h) => new RegExp(`h${h}\\b`).test(body));
      const reverb = body.includes('reverbEnabled = true');
      for (const h of heads) expect(mode.label, `mode ${n}`).toMatch(new RegExp(`\\b${h}\\b`));
      expect(/Reverb/.test(mode.label), `mode ${n} reverb`).toBe(reverb);
    }
  });

  it('the bus defaults to head 1 alone, no second spring', () => {
    expect(DEFAULT_DUB_BUS.re201DelayMode).toBe(1);
    expect(DEFAULT_DUB_BUS.chainOrder).toBe('echoSpring');
  });
});
