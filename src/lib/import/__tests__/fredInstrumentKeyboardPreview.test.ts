/**
 * A Fred Editor instrument sounds when played on the keyboard.
 *
 * The import router flattened every instrument of a dedicated-engine song to
 * 'Sampler'. Fred's PWM instruments carry no PCM, so ToneEngine built an empty
 * Sampler ("STALE INSTRUMENT ... EmptySampler") and the keyboard was silent.
 * They must stay FredSynth, which owns the PWM voice, with their config.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseModuleToSong } from '../parseModuleToSong';

async function load(name: string) {
  const b = readFileSync(resolve(import.meta.dirname, '../../../../public/data/songs/formats', name));
  return parseModuleToSong(new File([b], name));
}

describe('a Fred Editor instrument sounds when played on the keyboard', () => {
  for (const name of ['bomb jack.fred', 'fuzzball-title.fred']) {
    it(`${name}: PWM instruments keep their FredSynth voice and config`, async () => {
      const song = await load(name);
      const pwm = song.instruments.filter((i) => i.synthType === 'FredSynth');
      expect(pwm.length).toBeGreaterThan(0);
      for (const i of pwm) expect(i.fred).toBeDefined();
      // Instrument 1 of both songs is a PWM voice; it must not be an empty Sampler.
      expect(song.instruments[0].synthType).toBe('FredSynth');
    });

    it(`${name}: PCM instruments still carry their sample`, async () => {
      const song = await load(name);
      const pcm = song.instruments.filter((i) => (i.sample?.audioBuffer?.byteLength ?? 0) > 0);
      expect(pcm.length).toBeGreaterThan(0);
      for (const i of pcm) expect(i.synthType).toBe('Sampler');
    });
  }
});
