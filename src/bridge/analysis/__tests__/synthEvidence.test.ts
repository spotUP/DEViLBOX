import { describe, it, expect } from 'vitest';
import { extractSynthTimbre, classifyBySynthParams } from '../synthEvidence';
import { classifyInstrument } from '../ChannelNaming';
import type { InstrumentConfig } from '@typedefs/instrument';

/**
 * Synth instruments have no PCM, so `SampleSpectrum` cannot see them and the
 * name slot holds the musician's greetings. That combination is why every
 * channel of an AHX tune classified as `bass` and `riddimSection` — which mutes
 * melodic channels to leave bass and drums — had nothing to mute.
 *
 * The parameters describe the sound directly. An instrument whose performance
 * list is all noise, lasting 60 ms end to end, is a hi-hat; no inference
 * needed. Numbers below are taken from amanda.ahx rather than invented.
 */

function hively(over: Record<string, unknown> = {}): InstrumentConfig {
  return {
    id: 1, name: 'x', type: 'synth', synthType: 'HivelySynth',
    hively: {
      volume: 30, waveLength: 2,
      filterLowerLimit: 1, filterUpperLimit: 31, filterSpeed: 4,
      squareLowerLimit: 32, squareUpperLimit: 63, squareSpeed: 1,
      vibratoDelay: 0, vibratoSpeed: 0, vibratoDepth: 0,
      hardCutRelease: false, hardCutReleaseFrames: 0,
      envelope: { aFrames: 1, aVolume: 60, dFrames: 12, dVolume: 11, sFrames: 1, rFrames: 22, rVolume: 5 },
      performanceList: { speed: 2, entries: [] },
      ...(over.hively as object ?? {}),
    },
  } as unknown as InstrumentConfig;
}

/** A performance list of [note, waveform] pairs. */
function perfNotes(pairs: [number, number][]) {
  return {
    performanceList: {
      speed: 1,
      entries: pairs.map(([note, waveform]) => ({ note, waveform, fixed: false, fx: [0, 0], fxParam: [0, 0] })),
    },
  };
}

/** A performance list of the given waveform numbers. 3 is noise. */
function perf(waveforms: number[]) {
  return {
    performanceList: {
      speed: 2,
      entries: waveforms.map(w => ({ note: 0, waveform: w, fixed: false, fx: [0, 0], fxParam: [0, 0] })),
    },
  };
}

describe('Hively parameter evidence', () => {
  it('reads envelope frames as milliseconds at the Amiga frame rate', () => {
    const t = extractSynthTimbre(hively({
      hively: { envelope: { aFrames: 1, aVolume: 60, dFrames: 12, dVolume: 11, sFrames: 1, rFrames: 22, rVolume: 5 } },
    }))!;
    expect(t.source).toBe('hively');
    expect(t.attackMs).toBe(20);   // 1 frame
    expect(t.decayMs).toBe(240);   // 12 frames
    expect(t.releaseMs).toBe(440); // 22 frames
  });

  it('measures noise content from the performance list', () => {
    const allNoise = extractSynthTimbre(hively({ hively: perf([3, 3, 3, 3]) }))!;
    expect(allNoise.noisiness).toBe(1);
    const halfNoise = extractSynthTimbre(hively({ hively: perf([3, 0, 3, 0]) }))!;
    expect(halfNoise.noisiness).toBe(0.5);
    const noNoise = extractSynthTimbre(hively({ hively: perf([0, 1, 2, 0]) }))!;
    expect(noNoise.noisiness).toBe(0);
  });

  it('treats the filtered waveform variants as the same waveforms', () => {
    // +4 is the same wave through the filter, so 7 is filtered noise.
    const t = extractSynthTimbre(hively({ hively: perf([7, 7]) }))!;
    expect(t.noisiness).toBe(1);
  });

  it('calls a 60 ms sound percussive even when its sustain level is high', () => {
    // The bug this guards: amanda's hi-hats run 20/20/20 ms with `dVolume`
    // high enough to set the sustain flag. Checking that flag first called them
    // `sustained`, which dropped the confidence below the threshold that
    // overrides note statistics — so four hi-hats stayed classified as bass.
    const t = extractSynthTimbre(hively({
      hively: {
        envelope: { aFrames: 1, aVolume: 60, dFrames: 1, dVolume: 60, sFrames: 1, rFrames: 1, rVolume: 0 },
        ...perf([3, 3]),
      },
    }))!;
    expect(t.attackMs + t.decayMs + t.releaseMs).toBe(60);
    expect(t.articulation).toBe('percussive');
  });

  it('ignores a sweep whose limits are equal', () => {
    // Speed without travel is a parked parameter, not a moving timbre.
    const t = extractSynthTimbre(hively({
      hively: { filterSpeed: 8, filterLowerLimit: 20, filterUpperLimit: 20, squareSpeed: 0 },
    }))!;
    expect(t.sweeping).toBe(false);
  });

  it('reports vibrato only when it has both speed and depth', () => {
    expect(extractSynthTimbre(hively({ hively: { vibratoDepth: 4, vibratoSpeed: 3 } }))!.vibrato).toBe(true);
    expect(extractSynthTimbre(hively({ hively: { vibratoDepth: 4, vibratoSpeed: 0 } }))!.vibrato).toBe(false);
  });
});

describe('what the parameters settle on their own', () => {
  it('calls a short noise instrument percussion, strongly enough to override note statistics', () => {
    const t = extractSynthTimbre(hively({
      hively: {
        envelope: { aFrames: 1, aVolume: 60, dFrames: 1, dVolume: 60, sFrames: 1, rFrames: 1, rVolume: 0 },
        ...perf([3, 3]),
      },
    }))!;
    const c = classifyBySynthParams(t);
    expect(c.role).toBe('percussion');
    // 0.8 is the bar `classifyChannelWithInstruments` sets before an
    // instrument may override the note-statistics role.
    expect(c.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('separates a bright short hit from a darker one', () => {
    const bright = classifyBySynthParams(extractSynthTimbre(hively({
      hively: {
        envelope: { aFrames: 1, aVolume: 60, dFrames: 1, dVolume: 60, sFrames: 1, rFrames: 1, rVolume: 0 },
        ...perf([3, 3]),
      },
    }))!);
    const darker = classifyBySynthParams(extractSynthTimbre(hively({
      hively: {
        envelope: { aFrames: 1, aVolume: 60, dFrames: 1, dVolume: 60, sFrames: 1, rFrames: 1, rVolume: 0 },
        ...perf([3, 0]),
      },
    }))!);
    expect(bright.subrole).toBe('hat');
    expect(darker.subrole).toBe('snare');
  });

  it('calls a slow attack a pad', () => {
    const t = extractSynthTimbre(hively({
      hively: { envelope: { aFrames: 31, aVolume: 60, dFrames: 41, dVolume: 40, sFrames: 1, rFrames: 255, rVolume: 0 } },
    }))!;
    expect(t.articulation).toBe('swelling');
    expect(classifyBySynthParams(t).role).toBe('pad');
  });

  it('stays quiet rather than guessing at bass', () => {
    // Timbre says nothing about register. A dark, sustained, unmoving sound
    // could be a bass or a low pad, and only the notes can say which.
    const t = extractSynthTimbre(hively({
      hively: {
        envelope: { aFrames: 1, aVolume: 60, dFrames: 20, dVolume: 60, sFrames: 20, rFrames: 20, rVolume: 40 },
        filterSpeed: 0, squareSpeed: 0,
        ...perf([0, 0]),
      },
    }))!;
    const c = classifyBySynthParams(t);
    expect(c.role).not.toBe('bass');
  });
});

describe('pitch drop — how a chip kick is actually built', () => {
  it('measures the fall from the first sounded note to the lowest later one', () => {
    // jennipha instrument 1, verbatim: 49 -> 22 -> 17 -> 10.
    const t = extractSynthTimbre(hively({
      hively: perfNotes([[49, 0], [22, 3], [17, 0], [10, 0]]),
    }))!;
    expect(t.pitchDropSemitones).toBe(39);
  });

  it('skips the no-change entries rather than reading them as a drop to zero', () => {
    // `ple_Note` of 0 means "leave the pitch alone" (hvl_replay.c:1540).
    const t = extractSynthTimbre(hively({
      hively: perfNotes([[40, 0], [0, 0], [0, 0], [38, 0]]),
    }))!;
    expect(t.pitchDropSemitones).toBe(2);
  });

  it('counts a downward period slide as a drop', () => {
    // FX 2 sets a negative slide speed, and the replayer subtracts it from the
    // period — so the period rises and the pitch falls.
    const withSlide = extractSynthTimbre(hively({
      hively: {
        performanceList: {
          speed: 1,
          entries: [{ note: 40, waveform: 0, fixed: false, fx: [2, 0], fxParam: [32, 0] }],
        },
      },
    }))!;
    expect(withSlide.pitchDropSemitones).toBeGreaterThanOrEqual(24);

    // FX 1 is the same mechanism upwards and must not count.
    const withRise = extractSynthTimbre(hively({
      hively: {
        performanceList: {
          speed: 1,
          entries: [{ note: 40, waveform: 0, fixed: false, fx: [1, 0], fxParam: [32, 0] }],
        },
      },
    }))!;
    expect(withRise.pitchDropSemitones).toBe(0);
  });

  it('calls a hard drop in a short sound a kick', () => {
    const t = extractSynthTimbre(hively({
      hively: {
        envelope: { aFrames: 1, aVolume: 60, dFrames: 3, dVolume: 20, sFrames: 1, rFrames: 3, rVolume: 0 },
        ...perfNotes([[49, 0], [22, 3], [10, 0]]),
      },
    }))!;
    const c = classifyBySynthParams(t);
    expect(c.role).toBe('percussion');
    expect(c.subrole).toBe('kick');
    expect(c.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('prefers kick over snare when a short sound both drops and has noise', () => {
    // amanda instrument 8: drop 55, noise 0.50, 80 ms. Noise alone called it a
    // snare; the drop is the more specific evidence and the more useful answer.
    const t = extractSynthTimbre(hively({
      hively: {
        envelope: { aFrames: 1, aVolume: 60, dFrames: 1, dVolume: 60, sFrames: 1, rFrames: 2, rVolume: 0 },
        ...perfNotes([[58, 3], [30, 3], [3, 0]]),
      },
    }))!;
    expect(classifyBySynthParams(t).subrole).toBe('kick');
  });

  it('leaves a melodic leap alone', () => {
    // jennipha instruments 8-10 fall 12 semitones and are not drums. An octave
    // is a leap; two octaves inside a few frames is a drum.
    const t = extractSynthTimbre(hively({
      hively: {
        envelope: { aFrames: 1, aVolume: 60, dFrames: 3, dVolume: 20, sFrames: 1, rFrames: 3, rVolume: 0 },
        ...perfNotes([[15, 3], [3, 2], [6, 2], [10, 2]]),
      },
    }))!;
    expect(t.pitchDropSemitones).toBe(12);
    expect(classifyBySynthParams(t).subrole).not.toBe('kick');
  });
});

describe('the generic envelope path', () => {
  it('reads a Tone-style envelope and oscillator', () => {
    const inst = {
      id: 1, name: 'x', type: 'synth', synthType: 'Synth',
      envelope: { attack: 5, decay: 60, sustain: 0, release: 40 },
      oscillator: { type: 'noise' },
    } as unknown as InstrumentConfig;
    const t = extractSynthTimbre(inst)!;
    expect(t.source).toBe('oscillator');
    expect(t.noisiness).toBe(1);
    expect(t.articulation).toBe('percussive');
    expect(classifyBySynthParams(t).role).toBe('percussion');
  });

  it('refuses a sample-based instrument, whose envelope is the app default', () => {
    // Measured on `a sleep so deep.mod`: all eleven instruments carry the same
    // { attack: 10, decay: 500, sustain: 0, release: 100 } — the default
    // applied at import, identical for a bass, a snare, a bell and a piano.
    // Reading it would manufacture timbre evidence out of a constant, for the
    // instruments that least need it: they have PCM, and SampleSpectrum
    // measures what they actually sound like.
    const sampleInst = {
      id: 1, name: 'jstsnare1', type: 'sample', synthType: 'Sampler',
      envelope: { attack: 10, decay: 500, sustain: 0, release: 100 },
      sample: { url: 'data:audio/wav;base64,AAAA' },
    } as unknown as InstrumentConfig;
    expect(extractSynthTimbre(sampleInst)).toBeNull();
  });

  it('returns nothing for an instrument with no parameters at all', () => {
    expect(extractSynthTimbre({ id: 1, name: 'x' } as unknown as InstrumentConfig)).toBeNull();
    expect(extractSynthTimbre(null)).toBeNull();
  });
});

describe('reaching classifyInstrument', () => {
  it('classifies a synth hi-hat that has no sample and no useful name', () => {
    // The whole point: no PCM, and the name is a fragment of the song's
    // liner notes.
    const inst = hively({
      hively: {
        envelope: { aFrames: 1, aVolume: 60, dFrames: 1, dVolume: 60, sFrames: 1, rFrames: 1, rVolume: 0 },
        ...perf([3, 3]),
      },
    });
    (inst as { name: string }).name = 'for Revision 2017';
    const out = classifyInstrument(inst);
    expect(out.role).toBe('percussion');
    expect(out.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('does not shadow an explicit drum type', () => {
    // Priority must hold: `drumMachine.drumType` is certain, parameters are not.
    const inst = hively({
      hively: {
        envelope: { aFrames: 1, aVolume: 60, dFrames: 1, dVolume: 60, sFrames: 1, rFrames: 1, rVolume: 0 },
        ...perf([3, 3]),
      },
    });
    (inst as unknown as { drumMachine: unknown }).drumMachine = { drumType: 'kick' };
    const out = classifyInstrument(inst);
    expect(out.subrole).toBe('kick');
    expect(out.confidence).toBe(1);
  });
});
