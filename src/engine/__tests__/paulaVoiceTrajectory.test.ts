/**
 * The Paula model a UADE key is compared against plays the channel volume the player wrote over the note,
 * not the step the note started on.
 *
 * Regression: Jeroen Tel's stormlord title.jt drives AUDxVOL through a per-tick ADSR (32 for the first
 * 50 ms, then 48 decaying). The scan reported `volume` 32, the flat model played the whole note at 32,
 * and the imported key (flat at the peak) read +4.26 dB against it. The model now plays the trajectory.
 */
import { describe, expect, it } from 'vitest';
import { SR, paulaVoice, rms, type Shape } from './uadeKeyHarness';

const shape = (volume: number, volumes: number[]): Shape => ({
  voice: 0,
  period: 428,
  volume,
  volumes,
  firstChunk: 0,
  count: 1,
  attackPtr: 0,
  attackLen: 2,
  loopPtr: null,
  loopLen: 2,
  loopStart: 0,
  loopLength: 2,
  pcm: new Int8Array([127, -128]).buffer,
});

describe('paulaVoice plays the volume trajectory the player wrote', () => {
  it('a note that steps 32 then 48 is louder than a note held at its first step', () => {
    const frames = SR / 10;
    const stepped = paulaVoice(shape(32, [32, 32, 32, 32, 32, 48, 48, 48, 48, 48, 48, 48, 48, 48, 48, 48]), frames);
    const flat = paulaVoice(shape(32, [32]), frames);
    // the power average of the steps: 5 chunks at 32, 5 at 48, over the first 100 ms
    const expectedDb = 10 * Math.log10((5 * 32 * 32 + 5 * 48 * 48) / (10 * 32 * 32));
    const measuredDb = 20 * Math.log10(rms(stepped, 0, frames) / rms(flat, 0, frames));
    expect(measuredDb).toBeCloseTo(expectedDb, 1);
  });

  it('a shape without a trajectory still plays flat at its volume', () => {
    const frames = SR / 10;
    const noTrajectory = paulaVoice(shape(48, []), frames);
    const flat = paulaVoice(shape(48, [48]), frames);
    expect(rms(noTrajectory, 0, frames)).toBeCloseTo(rms(flat, 0, frames), 6);
    expect(rms(noTrajectory, 0, frames)).toBeGreaterThan(0);
  });
});
