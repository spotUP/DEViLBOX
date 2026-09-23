import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Loading a tune must not destroy the instrument players.
 *
 * The worklet's loadTune swept every standalone player away ("clean up
 * players from previous loads"). Those players belonged to the HivelySynth
 * instances the same song load had just created, so every synth was left
 * holding a handle to a player the worklet no longer had. The next live note
 * — a keyboard key, a controller button — logged
 * `noteOn handle=0 ... players=[]` and made no sound (2026-09-23).
 *
 * Ownership: a synth creates its player in setInstrument and destroys it in
 * dispose. The tune owns none of them. Only the worklet's own 'dispose'
 * sweeps whatever is left.
 */
const WORKLET = readFileSync(join(process.cwd(), 'public/hively/Hively.worklet.js'), 'utf-8');

function method(name: string): string {
  const at = WORKLET.indexOf(`\n  ${name}(`);
  expect(at, `${name} moved`).toBeGreaterThan(-1);
  return WORKLET.slice(at, WORKLET.indexOf('\n  }\n', at));
}

describe('a tune load keeps the instrument players', () => {
  it('loadTune does not destroy the players', () => {
    expect(method('loadTune')).not.toContain('destroyAllPlayers()');
  });

  it("the worklet's own dispose still sweeps what is left", () => {
    const dispose = WORKLET.slice(WORKLET.indexOf("case 'dispose':"), WORKLET.indexOf('break;', WORKLET.indexOf("case 'dispose':")));
    expect(dispose).toContain('this.destroyAllPlayers();');
  });

  it('a synth destroys its own player when it is disposed', () => {
    const synth = readFileSync(join(process.cwd(), 'src/engine/hively/HivelySynth.ts'), 'utf-8');
    const dispose = synth.slice(synth.indexOf('  dispose(): void {'));
    expect(dispose).toContain("{ type: 'destroyPlayer', handle: this._playerHandle }");
  });
});
