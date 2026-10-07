/**
 * The loop of a sample-backed Tone.Player, from the instrument's sample config.
 *
 * One place turns the config's loop (frames of the sample, at its own rate) into the
 * Player's loop (seconds of the decoded buffer): the Player built for a note and the
 * live update of a Player that is already sounding both come here, so a loop edit
 * and a fresh voice cannot disagree.
 */
import type * as Tone from 'tone';
import type { SampleConfig } from '@typedefs/instrument';

/** The sample is a looping one: the Player plays it as a loop. */
export function sampleLoops(sample: SampleConfig | undefined): boolean {
  return sample?.loop === true;
}

/** Loop start / end in seconds of a buffer `duration` long (the config's frames at its sample rate, clamped inside the buffer). */
export function loopSeconds(sample: SampleConfig | undefined, duration: number): { loopStart: number; loopEnd: number } {
  const rate = sample?.sampleRate || 8363;
  const loopStart = Math.min((sample?.loopStart || 0) / rate, duration - 0.0001);
  let loopEnd = Math.min((sample?.loopEnd || 0) / rate, duration);
  if (loopEnd <= loopStart) loopEnd = duration;
  return { loopStart, loopEnd };
}

/** Put the sample's loop on a Player; a Player that is playing follows at once (Tone forwards the loop to its sources). */
export function applyLoopToPlayer(player: Tone.Player, sample: SampleConfig | undefined, duration: number): void {
  const loops = sampleLoops(sample);
  if (loops && duration > 0) {
    const { loopStart, loopEnd } = loopSeconds(sample, duration);
    player.loopStart = loopStart;
    player.loopEnd = loopEnd;
  }
  player.loop = loops;
}
