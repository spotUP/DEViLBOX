/**
 * The linear gain of a native synth's `output` node for an instrument volume in dB: the volume plus the descriptor's
 * normalisation offset (volumeOffsetDb). One function for the two places that set it - InstrumentFactory when the synth is
 * created and the store when the volume changes - because setting it without the offset in the second place dropped a
 * DX7 by 14 dB the first time a preset or the volume knob was touched.
 * Furnace synths apply their offset inside the chip engine (setVolumeOffset), not on the output node: no offset here.
 */
import { SynthRegistry } from './SynthRegistry';

export function registryOutputGain(synthType: string, volumeDb: number): number {
  const offset = synthType.startsWith('Furnace') ? 0 : (SynthRegistry.get(synthType)?.volumeOffsetDb ?? 0);
  return Math.pow(10, (volumeDb + offset) / 20);
}
