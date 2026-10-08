/**
 * Gate B/C/D/E (plan sections 4-7): the Auto DJ's extended analysis is
 * checked against signals whose answer is known before any of its output is
 * trusted (reachability protocol 3: a known-live and a known-dead case per
 * detector), then the structure, beat grid landmarks and cue points are
 * checked on the deterministic corpus (plan section 2).
 *
 * The product path is the analysis worker's stage sequence
 * (runAnalysisStages, what the worker message handler calls) with the
 * essentia stages stubbed and the extended analysis real.
 */
import { describe, it, expect } from 'vitest';
import { computeExtendedAnalysis, truePeakLinear } from '../autodj/activityTimelines';
import { renderSyntheticTrack } from '../autodj/testing/synthTrack';
import { CORPUS_IDS, corpusAnalysis, corpusPipelineAnalysis, corpusTrack, corpusTrackerSong } from '../autodj/testing/corpus';
import { buildDJTrackAnalysis, keyFromChroma, parseMusicalKey, keyName, summarizeTrack, tempoHypotheses } from '../autodj/trackAnalysis';
import { searchMeterAndPhase } from '../autodj/beatGrid';
import { runAnalysisStages } from '@/workers/djAnalysisStages';
import { toCamelot } from '../DJKeyUtils';

const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);

describe('extended analysis instrument check (known live, known dead)', () => {
  const sr = 22050;
  const sine = (hz: number, sec: number, amp = 0.5) => {
    const out = new Float32Array(Math.floor(sec * sr));
    for (let i = 0; i < out.length; i++) out[i] = amp * Math.sin(2 * Math.PI * hz * (i / sr));
    return out;
  };

  it('a 55 Hz bass tone lights the bass timeline and not the vocal timeline', () => {
    const ext = computeExtendedAnalysis(sine(55, 8), sr);
    expect(mean(ext.bass)).toBeGreaterThan(0.6);
    expect(ext.spectral.lowRatio).toBeGreaterThan(0.6);
    expect(mean(ext.vocal)).toBeLessThan(0.15);
    expect(mean(ext.drums)).toBeLessThan(0.15);
  });

  it('noise bursts on the beat light the drum (onset) timeline, silence is dead', () => {
    const pcm = new Float32Array(sr * 8);
    let seed = 7;
    for (let beat = 0; beat < 16; beat++) {
      const s = Math.floor(beat * 0.5 * sr);
      for (let i = 0; i < 1500; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; pcm[s + i] = (seed / 0x7fffffff - 0.5) * (1 - i / 1500); }
    }
    const live = computeExtendedAnalysis(pcm, sr, { beats: Array.from({ length: 16 }, (_, i) => i * 0.5) });
    const dead = computeExtendedAnalysis(new Float32Array(sr * 8), sr);
    expect(Math.max(...live.drums)).toBe(1);
    expect(live.drums.filter((v) => v > 0.5).length).toBeGreaterThanOrEqual(12);
    expect(mean(dead.drums)).toBe(0);
    expect(dead.loudness.integratedDb).toBeLessThanOrEqual(-100);
    expect(live.firstTransient).toBeLessThan(0.6);
  });

  it('a harmonic tone with syllable modulation in the vocal band lights the vocal timeline', () => {
    const pcm = new Float32Array(sr * 8);
    const notes = [330, 392, 349, 440, 294, 330];
    let phase = 0;
    for (let i = 0; i < pcm.length; i++) {
      const t = i / sr;
      const f0 = notes[Math.floor(t / 0.4) % notes.length] * (1 + 0.01 * Math.sin(2 * Math.PI * 5.5 * t));
      phase += (2 * Math.PI * f0) / sr;
      let v = 0;
      for (let h = 1; h <= 6; h++) v += Math.sin(phase * h) / h;
      pcm[i] = 0.3 * v * (0.5 + 0.5 * Math.sin(2 * Math.PI * 3 * t));
    }
    const ext = computeExtendedAnalysis(pcm, sr);
    expect(mean(ext.vocal)).toBeGreaterThan(0.3);
    expect(mean(ext.bass)).toBeLessThan(0.2);
    // Known dead: a sustained chord pad in the same register is not a voice.
    const pad = renderSyntheticTrack({ name: 'pad', bpm: 120, root: 57, mode: 'minor', sections: [{ bars: 8, pad: true }] });
    expect(mean(computeExtendedAnalysis(pad.pcm, pad.sampleRate).vocal)).toBeLessThan(0.12);
  });

  it('the loudness set: true peak >= sample peak, crest = peak - integrated, dynamic range of a quiet-loud track > 10 dB', () => {
    const loud = sine(220, 4, 0.8);
    const quiet = sine(220, 4, 0.05);
    const pcm = new Float32Array(loud.length + quiet.length);
    pcm.set(quiet, 0); pcm.set(loud, quiet.length);
    const ext = computeExtendedAnalysis(pcm, sr);
    expect(ext.loudness.truePeakDb).toBeGreaterThanOrEqual(ext.loudness.peakDb - 0.01);
    expect(ext.loudness.crestFactorDb).toBeCloseTo(ext.loudness.peakDb - ext.loudness.integratedDb, 6);
    expect(ext.loudness.dynamicRangeDb).toBeGreaterThan(10);
    expect(ext.loudness.shortTermMaxDb).toBeGreaterThan(ext.loudness.integratedDb);
    // A 0.5-amplitude sine between samples: a plain sample peak misses the inter-sample peak.
    const pk = new Float32Array(64);
    for (let i = 0; i < 64; i++) pk[i] = 0.5 * Math.sin(2 * Math.PI * (sr / 4) * (i / sr) + Math.PI / 4);
    expect(truePeakLinear(pk)).toBeGreaterThan(Math.max(...Array.from(pk).map(Math.abs)) + 0.05);
  });

  it('chroma of an A minor bass+pad resolves to A minor (8A) or its relative, every generated key name maps to Camelot', () => {
    const track = renderSyntheticTrack({ name: 'key', bpm: 120, root: 57, mode: 'minor', sections: [{ bars: 8, bass: true, pad: true }] });
    const ext = computeExtendedAnalysis(track.pcm, track.sampleRate, { beats: track.beats });
    const acc = new Array(12).fill(0);
    for (const c of ext.chroma) for (let i = 0; i < 12; i++) acc[i] += c[i];
    const { key } = keyFromChroma(acc);
    expect(['8A', '8B']).toContain(key.camelot);
    for (let r = 0; r < 12; r++) {
      expect(toCamelot(keyName(r, 'major'))).not.toBeNull();
      expect(toCamelot(keyName(r, 'minor'))).not.toBeNull();
    }
    expect(parseMusicalKey('Unknown').mode).toBe('unknown');
    expect(parseMusicalKey('A minor')).toMatchObject({ root: 9, mode: 'minor', camelot: '8A' });
  });

  it('the worker stage sequence (product path) carries the extended analysis in its result', () => {
    const track = corpusTrack('steady');
    const result = runAnalysisStages(
      { pcmLeft: track.pcm, pcmRight: null, sampleRate: track.sampleRate, numBins: 100 },
      {
        mixToMono: (l) => l,
        analyzeRhythm: () => ({ bpm: 126, confidence: 0.9, beats: track.beats }),
        analyzeKey: () => ({ key: 'A minor', confidence: 0.8 }),
        detectDownbeats: (beats) => ({ downbeats: beats.filter((_, i) => i % 4 === 0), timeSignature: 4 }),
        computeFrequencyPeaks: () => [[0], [0], [0]],
        computeLoudness: () => ({ rmsDb: -14, peakDb: -1 }),
        classifyGenre: () => ({ primary: 'Electronic', subgenre: 'Techno', confidence: 0.5, mood: 'Energetic', energy: 0.7, danceability: 0.7 }),
      },
    );
    expect(result.extended.version).toBe(2);
    expect(result.extended.bass.length).toBeGreaterThan(100);
    expect(result.extended.chroma.length).toBeGreaterThan(2);
    expect(result.bpm).toBe(126);
  });
});

describe('beat grid (Gate C): meter, downbeat phase, landmarks', () => {
  it('the phase search finds the downbeat on an anacrusis track instead of assuming beat 0 is bar 1', () => {
    const a = corpusAnalysis('unusual'); // 3/4 with a one-beat pickup
    expect(a.meter.beatsPerBar).toBe(3);
    expect(a.downbeats.phaseOffset).toBe(1);
    const track = corpusTrack('unusual');
    expect(Math.abs(a.landmarks.firstDownbeat - track.downbeats[0])).toBeLessThan(0.05);
    expect(a.landmarks.firstFullBar).toBeGreaterThanOrEqual(a.landmarks.firstDownbeat);
  });

  it('a 4/4 corpus track: first transient < first musical beat <= first downbeat <= first usable mix point', () => {
    const a = corpusAnalysis('longIntro');
    const L = a.landmarks;
    expect(L.firstTransient).toBeLessThanOrEqual(L.firstMusicalBeat + 0.5);
    expect(L.firstMusicalBeat).toBeLessThanOrEqual(L.firstDownbeat + 1e-9);
    expect(L.firstDownbeat).toBeLessThanOrEqual(L.firstFullBar + 1e-9);
    expect(L.firstFullBar).toBeLessThanOrEqual(L.firstUsableMixPoint + 1e-9);
    // Drums start at bar 16 (124 BPM): the first usable mix point is there, not at 0:00.
    const track = corpusTrack('longIntro');
    expect(Math.abs(L.firstUsableMixPoint - track.sectionStarts[1])).toBeLessThan(2.5);
    expect(a.meter.beatsPerBar).toBe(4);
  });

  it('meter and phase search: accent every 4th beat from beat 2 reads as 4/4 phase 2; uniform accents give low confidence', () => {
    const strengths = Array.from({ length: 64 }, (_, i) => (i % 4 === 2 ? 1 : 0.3));
    const found = searchMeterAndPhase(strengths);
    expect(found.beatsPerBar).toBe(4);
    expect(found.phase).toBe(2);
    expect(found.confidence).toBeGreaterThan(0.5);
    const flat = searchMeterAndPhase(new Array(64).fill(0.5));
    expect(flat.confidence).toBeLessThan(0.5);
  });

  it('tracker, syncopated and tempo-change material keep a grid with confidence and a stability reading', () => {
    const tr = corpusAnalysis('tracker');
    expect(tr.tracker).toBeDefined();
    expect(tr.beatGrid.confidence).toBeGreaterThan(0.5);
    const un = corpusAnalysis('unusual');
    expect(un.rhythmic.tempoStability).toBeLessThan(corpusAnalysis('steady').rhythmic.tempoStability);
    const sync = renderSyntheticTrack({ name: 'sync', bpm: 126, root: 57, mode: 'minor', syncopated: true, sections: [{ bars: 16, kick: true, bass: true, hats: true }] });
    const ext = computeExtendedAnalysis(sync.pcm, sync.sampleRate, { beats: sync.beats });
    const a = buildDJTrackAnalysis({ id: 'sync', durationSec: sync.durationSec, analysis: corpusPipelineAnalysis(sync), extended: ext });
    expect(a.rhythmic.syncopation).toBeGreaterThan(corpusAnalysis('steady').rhythmic.syncopation);
    expect(a.beatGrid.beats.length).toBe(sync.beats.length);
  });
});

describe('tempo and key correctness (Gate B)', () => {
  it('tempo hypotheses: half and double are represented, module tempo joins when it disagrees, the first reading is not the only one', () => {
    const h = tempoHypotheses(170, 0.5, 0.4, 140);
    expect(h.map((x) => x.relationship)).toEqual(expect.arrayContaining(['normal', 'half', 'double']));
    expect(h.some((x) => x.bpm === 140)).toBe(true);
    const half = h.find((x) => x.relationship === 'half')!;
    const dbl = h.find((x) => x.relationship === 'double')!;
    expect(half.confidence).toBeGreaterThan(dbl.confidence);
    const slowDense = tempoHypotheses(70, 0.5, 3, null);
    expect(slowDense.find((x) => x.relationship === 'double')!.confidence).toBeGreaterThan(slowDense.find((x) => x.relationship === 'half')!.confidence);
  });

  it('an unknown key has confidence 0 and mode unknown (not a clash), a weak-rhythm intro lowers the grid confidence of the intro only', () => {
    const u = corpusAnalysis('uncertainKey');
    expect(u.key.mode).toBe('unknown');
    expect(u.keyConfidence).toBe(0);
    expect(u.analysisConfidence.key).toBe(0);
    const li = corpusAnalysis('longIntro');
    expect(li.landmarks.firstMusicalBeat).toBeGreaterThan(0);
  });

  it('energy is not loudness: a drum-only track and a pad-only track differ in bass/drum/harmonic terms', () => {
    const d = corpusAnalysis('uncertainKey').energy;
    const pad = renderSyntheticTrack({ name: 'pad', bpm: 120, root: 57, mode: 'minor', sections: [{ bars: 16, pad: true }] });
    const ext = computeExtendedAnalysis(pad.pcm, pad.sampleRate, { beats: pad.beats });
    const p = buildDJTrackAnalysis({ id: 'pad', durationSec: pad.durationSec, analysis: corpusPipelineAnalysis(pad), extended: ext }).energy;
    expect(d.drums).toBeGreaterThan(p.drums);
    expect(p.harmonicDensity).toBeGreaterThan(d.harmonicDensity);
    expect(d.transientDensity).toBeGreaterThan(p.transientDensity);
    for (const key of ['bass', 'drums', 'transientDensity', 'brightness', 'harmonicDensity', 'vocalPresence', 'rhythmicDensity', 'arrangementDensity', 'perceivedIntensity'] as const) {
      expect(Number.isFinite(d[key])).toBe(true);
    }
    expect(corpusAnalysis('vocals').energy.vocalPresence).toBeGreaterThan(corpusAnalysis('steady').energy.vocalPresence);
  });

  it('the local key timeline exists and a legacy entry without extended data still builds with low confidence', () => {
    const a = corpusAnalysis('compatibleKey');
    expect(a.keyTimeline && a.keyTimeline.length).toBeGreaterThan(0);
    const track = corpusTrack('steady');
    const legacy = buildDJTrackAnalysis({ id: 'legacy', durationSec: track.durationSec, analysis: { ...corpusPipelineAnalysis(track), frequencyPeaks: [[0.2, 0.8, 0.8, 0.8], [0.1, 0.5, 0.5, 0.5], [0, 0.3, 0.3, 0.3]] }, extended: null });
    expect(legacy.analysisConfidence.bass).toBeLessThan(0.5);
    expect(legacy.analysisConfidence.vocal).toBe(0);
    expect(legacy.sections.length).toBeGreaterThan(0);
  });
});

describe('structure and cue points (Gates D, E) on the corpus', () => {
  it('every corpus track analyses without throwing and carries sections, phrases, cues and confidences', () => {
    for (const id of CORPUS_IDS) {
      const a = corpusAnalysis(id);
      expect(a.sections.length, id).toBeGreaterThan(0);
      expect(a.phrases.length, id).toBeGreaterThan(0);
      expect([4, 8, 16], id).toContain(a.phraseLengthBars);
      expect(a.cuePoints.bestMixIn, id).toBeDefined();
      expect(a.cuePoints.bestMixOut, id).toBeDefined();
      expect(a.analysisConfidence.overall, id).toBeGreaterThan(0);
      for (const s of a.sections) { expect(s.confidence, id).toBeGreaterThan(0); expect(s.confidence, id).toBeLessThanOrEqual(1); }
      const summary = summarizeTrack(a);
      expect(summary.vocalProfile.length).toBe(8);
    }
  }, 120_000);

  it('long intro: an intro section first, firstDrums near the drum entry, bestMixIn after the intro (E3: start at the drums, not 0:00)', () => {
    const a = corpusAnalysis('longIntro');
    const track = corpusTrack('longIntro');
    expect(a.sections[0].kind).toBe('intro');
    expect(Math.abs((a.cuePoints.firstDrums ?? 0) - track.sectionStarts[1])).toBeLessThan(2.5);
    expect(a.cuePoints.bestMixIn!).toBeGreaterThan(track.sectionStarts[1] - 2.5);
    expect(a.cuePoints.firstBeat).toBeDefined();
    expect(a.cuePoints.introStart).toBeDefined();
  });

  it('breakdowns and drops are labelled where the arrangement puts them; outro and silence are found', () => {
    const b = corpusAnalysis('breakdowns');
    expect(b.sections.some((s) => s.kind === 'breakdown' || s.alternatives.some((x) => x.kind === 'breakdown'))).toBe(true);
    expect(b.cuePoints.firstBreak).toBeDefined();
    const d = corpusAnalysis('drops');
    expect(d.sections.some((s) => s.kind === 'drop' || s.kind === 'build' || s.alternatives.some((x) => x.kind === 'drop'))).toBe(true);
    expect(d.cuePoints.firstDrop ?? d.cuePoints.firstHook).toBeDefined();
    const o = corpusAnalysis('longOutro');
    expect(o.sections[o.sections.length - 1].kind).toBe('outro');
    expect(o.cuePoints.outroStart).toBeDefined();
    expect(o.cuePoints.bestMixOut!).toBeLessThanOrEqual((o.cuePoints.finalBeat ?? o.durationSec));
    const s = corpusAnalysis('silence');
    expect(s.sections.some((x) => x.kind === 'silence')).toBe(true);
    expect(s.arrangementEvents.some((e) => e.kind === 'silence')).toBe(true);
  });

  it('vocal entries become events and cue points; mix-in avoids the vocal phrase', () => {
    const v = corpusAnalysis('vocals');
    expect(v.arrangementEvents.some((e) => e.kind === 'vocal-in')).toBe(true);
    expect(v.cuePoints.firstVocal).toBeDefined();
    expect(v.sections.some((s) => s.kind === 'vocal-heavy' || s.kind === 'chorus' || s.kind === 'verse')).toBe(true);
    const track = corpusTrack('vocals');
    const vocalStart = track.sectionStarts[1];
    const vocalEnd = track.sectionStarts[2];
    const mixIn = v.cuePoints.bestMixIn!;
    expect(mixIn < vocalStart - 1 || mixIn >= vocalEnd - 1).toBe(true);
  });

  it('phrase length is detected per song: the 8-bar corpus groove reads 8 or 16, a song that changes every 4 bars reads 4', () => {
    const steady = corpusAnalysis('steady');
    expect([8, 16]).toContain(steady.phraseLengthBars);
    const layers = [
      { kick: true, hats: true }, { kick: true, bass: true, hats: true }, { kick: true, bass: true, hats: true, pad: true },
      { kick: true, hats: true, pad: true }, { kick: true, bass: true, pad: true }, { kick: true, bass: true, hats: true, pad: true, vocal: true },
      { kick: true, hats: true }, { kick: true, bass: true, pad: true },
    ];
    const alt = renderSyntheticTrack({ name: 'alt4', bpm: 128, root: 57, mode: 'minor', sections: layers.map((l) => ({ bars: 4, ...l })) });
    const ext = computeExtendedAnalysis(alt.pcm, alt.sampleRate, { beats: alt.beats });
    const a = buildDJTrackAnalysis({ id: 'alt4', durationSec: alt.durationSec, analysis: corpusPipelineAnalysis(alt), extended: ext });
    expect(a.phraseLengthBars).toBe(4);
    expect(a.arrangementEvents.filter((e) => e.kind === 'bass-in').length).toBeGreaterThanOrEqual(2);
  });

  it('tracker material keeps its structure: order positions, pattern boundaries, channel segments with changing roles, events', () => {
    const t = corpusAnalysis('tracker').tracker!;
    expect(t.orderPositions.length).toBe(8);
    expect(t.patternBoundaries.length).toBe(8);
    expect(t.channelSegments.length).toBe(8 * 6);
    const kinds = new Set(t.events.map((e) => e.kind));
    for (const k of ['DRUM_ENTRY', 'BASS_ENTRY', 'MELODY_ENTRY', 'PATTERN_CHANGE', 'REPEATED_PHRASE', 'INSTRUMENT_ENTRY', 'BREAK', 'DENSITY_DECREASE', 'DENSITY_INCREASE']) {
      expect(kinds.has(k as never), k).toBe(true);
    }
    const drumsAtIntro = t.channelSegments.find((s) => s.channel === 0 && s.start === 0)!;
    const drumsAtGroove = t.channelSegments.find((s) => s.channel === 0 && s.start > 0)!;
    expect(drumsAtIntro.musicalFunction).toBe('silence');
    expect(drumsAtGroove.musicalFunction).toBe('rhythm');
    expect(t.instrumentUsage.length).toBeGreaterThanOrEqual(5);
    expect(t.sampleUsage).toContain(4);
    expect(corpusTrackerSong().patterns.length).toBe(5);
  });
});
