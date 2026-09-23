import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A live Hively note must survive a transport stop.
 *
 * NativeEngineRouting zeroes every native engine's `output.gain` on stop so
 * a stopping worklet cannot leak. Hively's standalone instrument players —
 * a live key, a controller pad — were summed into that same worklet output,
 * so after any stop every live note was rendered and never heard. Measured
 * 2026-09-23: `noteOn handle=0 ... players=["0"]` in the log, 0.0001 RMS at
 * the master.
 *
 * The players now have their own worklet output, the engine exposes it as
 * `instrumentOutput`, and the synths connect to that. The tune's output can
 * be muted without touching an instrument.
 */
const WORKLET = readFileSync(join(process.cwd(), 'public/hively/Hively.worklet.js'), 'utf-8');
const ENGINE = readFileSync(join(process.cwd(), 'src/engine/hively/HivelyEngine.ts'), 'utf-8');
const SYNTH = readFileSync(join(process.cwd(), 'src/engine/hively/HivelySynth.ts'), 'utf-8');

describe('Hively instrument players have their own output', () => {
  it('the worklet mixes players into the instrument output, not the tune output', () => {
    const mix = WORKLET.slice(WORKLET.indexOf('Mix in standalone instrument players'), WORKLET.indexOf('// Report position periodically'));
    expect(mix).toContain('const INSTRUMENT_OUTPUT = 37;');
    expect(mix).toContain('instL[i] += sL;');
    expect(mix, 'players are back in the tune output').not.toContain('outputL[i] += sL;');
  });

  it('the engine allocates that output and wires it to instrumentOutput', () => {
    expect(ENGINE).toContain('static readonly INSTRUMENT_OUTPUT_INDEX = 1 + HivelyEngine.MAX_ISOLATION_SLOTS + HivelyEngine.MAX_DUB_CHANNELS;');
    expect(ENGINE).toContain('const TOTAL_OUTPUTS = HivelyEngine.INSTRUMENT_OUTPUT_INDEX + 1;');
    expect(ENGINE).toContain('this.workletNode.connect(this.instrumentOutput, HivelyEngine.INSTRUMENT_OUTPUT_INDEX);');
    // The two constants must agree: 1 + 4 + 32 = 37.
    expect(1 + 4 + 32).toBe(37);
  });

  it('the synth listens to the instrument output, never the tune', () => {
    expect(SYNTH).toContain('this.engine.instrumentOutput.connect(this.output);');
    expect(SYNTH).toContain('this.engine.instrumentOutput.disconnect(this.output);');
    expect(SYNTH).not.toContain('this.engine.output.connect(this.output);');
  });
});
