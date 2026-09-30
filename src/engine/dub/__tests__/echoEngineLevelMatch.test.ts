/**
 * Choosing another echo engine on the dub bus does not jump the echo level.
 *
 * Measured live 2026-09-30 (measure_dub_bus_stages, pink noise, echoWet 1,
 * intensity 0.3, echo output over echo input): Space Echo -9.4 dB, RE-201
 * +0.8, AnotherDelay +5.2, RE-Tape Echo -2.9 - a 15 dB spread. Each engine
 * is trimmed on its wet path to unity. (Matched first DOWN to the Space Echo,
 * the RE-201 lost 10.2 dB and the owner could hardly hear the persona's moves.)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ECHO_ENGINE_TRIM_DB } from '../DubEchoEngine';

const MEASURED_DB = { spaceEcho: -9.4, re201: 0.8, anotherDelay: 5.2, reTapeEcho: -2.9 } as const;

describe('dub echo engine levels', () => {
  it('each trim brings its engine to unity - not down to the quietest engine', () => {
    for (const [engine, measured] of Object.entries(MEASURED_DB)) {
      const trimmed = measured + ECHO_ENGINE_TRIM_DB[engine as keyof typeof MEASURED_DB];
      expect(Math.abs(trimmed), engine).toBeLessThan(0.5);
    }
  });

  it('every non-reference adapter puts its trim on the engine wet path', () => {
    const code = readFileSync(join(process.cwd(), 'src/engine/dub/DubEchoEngine.ts'), 'utf8');
    for (const engine of ['spaceEcho', 're201', 'anotherDelay', 'reTapeEcho']) {
      expect(code).toContain(`this.fx.setWetPathGain(trimGain('${engine}'));`);
    }
  });
});
