// @vitest-environment node
/**
 * Regression: Vital, Odin2 and Surge stuck after key release. The SynthRegistry
 * bridge for VSTBridge synths called triggerRelease(time), so VSTBridgeSynth read
 * the time as a frequency and sent noteOff for the wrong MIDI note. The WASM
 * noteOff (covered in vstbridgeSynthsSoundOnNoteOn.test.ts) never matched the voice.
 */
import { describe, it, expect } from 'vitest';
import { SynthRegistry } from '../../registry/SynthRegistry';
import '../../registry/sdk/vstbridge';

describe('VSTBridge registry release', () => {
  it.each(['Vital', 'Odin2', 'Surge'])('%s release forwards the released note to triggerRelease', (id) => {
    const desc = SynthRegistry.get(id);
    expect(desc?.onTriggerRelease).toBeTypeOf('function');
    const calls: unknown[][] = [];
    const synth = { triggerRelease: (...a: unknown[]) => { calls.push(a); } };
    const handled = desc!.onTriggerRelease!(synth, 'C4', 469.97, { config: {} as never });
    expect(handled).toBe(true);
    expect(calls).toEqual([['C4', 469.97]]);
  });
});
