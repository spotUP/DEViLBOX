/**
 * NO-SOUND-NORMAL-PROFILE (2026-10-14): a song read -24 dBFS RMS on
 * get_audio_level and was silent to the ear. That meter taps ONE node (Tone's
 * destination output); the destination plays the SUM of every node connected
 * to it. A second feeder - here an inverted copy of the programme - silences
 * the speakers while the tap reads a healthy level. get_final_output_level
 * rebuilds that sum from every recorded destination edge.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { installRealWebAudio } from '@/test/audio/realWebAudio';
import { installDestinationFeeders, destinationFeeders, createFinalOutputProbe, type FinalOutputReading } from '../destinationFeeders';

const SR = 48000;

describe('the final output meter sees what the single meter tap misses', () => {
  beforeAll(() => {
    installRealWebAudio();
    installDestinationFeeders(AudioNode.prototype as unknown as Record<string, unknown>);
  });

  it('an inverted second feeder reads silent at the destination while the tap reads the programme', async () => {
    const ctx = new OfflineAudioContext(2, SR / 4, SR);
    const src = ctx.createOscillator();
    src.frequency.value = 440;
    const tap = ctx.createGain();      // the node get_audio_level reads
    const inverted = ctx.createGain(); // a feeder the tap never sees
    inverted.gain.value = -1;
    src.connect(tap);
    src.connect(inverted);
    tap.connect(ctx.destination);
    inverted.connect(ctx.destination);
    src.start();

    const group = destinationFeeders().find((g) => g.destination === ctx.destination);
    expect(group?.nodes.map((n) => n.node)).toEqual([tap, inverted]);

    const probe = createFinalOutputProbe(ctx, group!.nodes);
    let reading: FinalOutputReading | null = null;
    const read = ctx.suspend(0.2).then(() => { reading = probe.read(); return ctx.resume(); });
    await ctx.startRendering();
    await read;

    const r = reading as unknown as FinalOutputReading;
    expect(r.feederRms[0]).toBeGreaterThan(0.5);   // the tap: a full-scale sine, ~0.707
    expect(r.leftRms).toBeLessThan(1e-4);           // the speakers: nothing
    expect(r.rightRms).toBeLessThan(1e-4);
  });

  it('a feeder that is disconnected from the destination is no longer counted', () => {
    const ctx = new OfflineAudioContext(2, 128, SR);
    const a = ctx.createGain();
    const b = ctx.createGain();
    a.connect(ctx.destination);
    b.connect(ctx.destination);
    b.disconnect(ctx.destination);
    const group = destinationFeeders().find((g) => g.destination === ctx.destination);
    expect(group?.nodes.map((n) => n.node)).toEqual([a]);
  });
});
