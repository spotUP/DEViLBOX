import { describe, it, expect } from 'vitest';
import { classifyInstrument } from '../ChannelNaming';
import { categorizeSample } from '@/lib/import/maxForLiveImport';
import type { InstrumentConfig } from '@typedefs/instrument';

/**
 * Every channel of every MOD, XM, IT and S3M song classified as percussion.
 *
 * `classifyInstrument` asked the sample FILENAME categoriser about
 * `inst.sample.url`. For a tracker module that URL is not a filename — it is a
 * few thousand characters of `data:audio/wav;base64,...`. The categoriser
 * matches substrings, including two-letter ones like `bd` and `sd`, and a long
 * base64 string contains essentially every short substring by chance. So every
 * sample matched `kicks` and returned percussion at confidence 0.8, outranking
 * the spectral analysis one step below that had actually measured the audio.
 *
 * Measured 2026-09-22 on `a sleep so deep.mod`, all eleven instruments:
 *
 *   classifyInstrument          spectrum actually said
 *   percussion/kick@0.8         bass/synth@0.85   (jstbellchord1)
 *   percussion/kick@0.8         bass/sub@0.85     (jstspacesynth3)
 *   percussion/kick@0.8         lead@0.4          (jstpiano3)
 *   percussion/kick@0.8         empty@0           (jsttom1)
 *
 * The confidence was the damage: 0.8 is the bar an instrument must clear to
 * override note statistics, so a coin-flip substring match beat every other
 * source in the system.
 */

function sampleInstrument(url: string, name = 'x'): InstrumentConfig {
  return {
    id: 1, name, type: 'sample', synthType: 'Sampler',
    sample: { url },
  } as unknown as InstrumentConfig;
}

/** A data URL whose base64 body contains `bd` — which is most of them. */
const DATA_URL_WITH_BD = 'data:audio/wav;base64,UklGRuALAABXQVZFZm10IBbdAAAAAQABAF8gAAC+QAAAAgAQAGRhdGE=';

describe('a data URL is not a filename', () => {
  it('does not classify a module sample as a kick because of its base64', () => {
    // The categoriser would say `kicks` for this string; the point is that it
    // is never asked.
    expect(categorizeSample(DATA_URL_WITH_BD)).toBe('kicks');

    const out = classifyInstrument(sampleInstrument(DATA_URL_WITH_BD));
    // Whatever the spectrum makes of this stub, it must not be the filename
    // path's confident percussion verdict.
    expect(out.confidence).not.toBe(0.8);
    expect(out.subrole).not.toBe('kick');
  });

  it('still categorises a real filename', () => {
    // The path is not disabled, only pointed at things that are filenames.
    const out = classifyInstrument(sampleInstrument('samples/drums/kick_909.wav'));
    expect(out.role).toBe('percussion');
    expect(out.subrole).toBe('kick');
    expect(out.confidence).toBe(0.8);
  });

  it('still categorises a real http url', () => {
    const out = classifyInstrument(sampleInstrument('https://example.com/snare_tight.wav'));
    expect(out.role).toBe('percussion');
    expect(out.subrole).toBe('snare');
  });

  it('leaves the spectrum free to answer for a module sample', () => {
    // With the filename path skipped, an instrument with no usable audio falls
    // through to `empty` rather than being asserted as a kick. Honest silence
    // beats a confident coin flip.
    const out = classifyInstrument(sampleInstrument('data:audio/wav;base64,AAAA'));
    expect(out.role).toBe('empty');
    expect(out.confidence).toBe(0);
  });
});
