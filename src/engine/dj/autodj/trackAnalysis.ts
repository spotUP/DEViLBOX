/**
 * Builds the unified DJTrackAnalysis (plan section 3) from what the pipeline
 * knows (bpm, beats, key, loudness, genre), the extended worker analysis and,
 * for tracker material, the song itself. Also the compact per-track summary
 * the set planner reads for tracks that are not on a deck.
 *
 * Pure. The confidence of every part is explicit (plan section 35).
 */
import type { PipelineResult } from '../DJPipeline';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { toCamelot } from '../DJKeyUtils';
import { detectBPM } from '../DJBeatDetector';
import type {
  ActivityTimeline, AnalysisConfidence, BassAnalysis, DJTrackAnalysis, DJTrackSummary,
  EnergyAnalysis, ExtendedAnalysis, KeyMode, KeySegment, LoudnessAnalysis, MusicalKey,
  RhythmicAnalysis, SpectralAnalysis, TempoHypothesis, TrackerMixAnalysis,
} from './types';
import { buildBeatGrids, timelineAt } from './beatGrid';
import { arrangementEvents, barFeatures, buildPhrases, detectPhraseLength, labelSections, perceivedIntensity, segmentBoundaries, type BarFeatures } from './structure';
import { deriveCuePoints } from './cuePoints';
import { analyzeTrackerSong, timeOrderPositions } from './trackerMixAnalysis';
import { moduleBeatGrid, type ModuleBeatGrid } from './moduleBeatGrid';
import { sidPlayerBeatGrid } from '../sidPlayerClock';
import { smooth } from './activityTimelines';

/**
 * Version of the DJTrackAnalysis / DJTrackSummary format. 3: tempo, grid and
 * bars come from the module's own timing when it matches the render
 * (tempoSource). 4: a module's phrases and phrase confidence come from its
 * order list (pattern changes), not the audio. 5: a module whose 24-tick
 * beat its patterns do not hold takes the beat level they hold (whole bars,
 * a different BPM for some modules). 6: the module walk follows pattern
 * loops, pattern delay and swing (one song walk), and an off-beat sound no
 * longer outvotes the snare for the beat level ('suggestive vibes' 184.57 ->
 * 93.75). A playlist row below this version is analysed again once in the
 * background (DJPlaylistAnalyzer.reanalyzeOutdatedTracks). Not the audio-cache
 * gate: the cached audio analysis did not change, so DJ_AUDIO_ANALYSIS_VERSION
 * stays and a re-analysis rebuilds the summary from the cached audio.
 */
export const DJ_ANALYSIS_VERSION = 6;
/** Version of the cached audio analysis (extended worker data); a cache entry below it is re-analysed. */
export const DJ_AUDIO_ANALYSIS_VERSION = 2;

export type PipelineAnalysis = NonNullable<PipelineResult['analysis']>;

// ── Keys ────────────────────────────────────────────────────────────────────

const PITCH_CLASS: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, Fb: 4, F: 5, 'E#': 5, 'F#': 6, Gb: 6, G: 7,
  'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, Cb: 11,
};
const MAJOR_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const MINOR_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];

export function keyName(root: number, mode: 'major' | 'minor'): string {
  const pc = ((root % 12) + 12) % 12;
  return `${mode === 'major' ? MAJOR_NAMES[pc] : MINOR_NAMES[pc]} ${mode}`;
}

export function parseMusicalKey(name: string | null | undefined, alternatives: Array<{ name: string; confidence: number }> = []): MusicalKey {
  if (!name || name === 'Unknown') return { name: 'Unknown', root: null, mode: 'unknown', camelot: null, alternatives };
  const m = /^([A-G][b#]?)\s+(major|minor)$/i.exec(name.trim());
  const camelot = toCamelot(name)?.display ?? null;
  if (!m) return { name, root: null, mode: 'unknown', camelot, alternatives };
  const root = PITCH_CLASS[m[1]] ?? null;
  const mode = m[2].toLowerCase() as KeyMode;
  return { name, root, mode, camelot, alternatives };
}

/** Krumhansl-Schmuckler profiles. */
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((x, y) => x + y, 0) / n;
  const mb = b.reduce((x, y) => x + y, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0;
}

/** Best key for one chroma vector, with the runner-up margin as confidence. */
export function keyFromChroma(chroma: number[]): { key: MusicalKey; confidence: number } {
  const scores: Array<{ root: number; mode: 'major' | 'minor'; r: number }> = [];
  for (let root = 0; root < 12; root++) {
    const rotMaj = MAJOR_PROFILE.map((_, i) => MAJOR_PROFILE[((i - root) % 12 + 12) % 12]);
    const rotMin = MINOR_PROFILE.map((_, i) => MINOR_PROFILE[((i - root) % 12 + 12) % 12]);
    scores.push({ root, mode: 'major', r: pearson(chroma, rotMaj) });
    scores.push({ root, mode: 'minor', r: pearson(chroma, rotMin) });
  }
  scores.sort((a, b) => b.r - a.r);
  const best = scores[0];
  const second = scores[1];
  const confidence = Math.max(0, Math.min(1, (best.r - second.r) * 4 + Math.max(0, best.r) * 0.5));
  const alternatives = scores.slice(1, 3).map((s) => ({ name: keyName(s.root, s.mode), confidence: Math.max(0, s.r) }));
  return { key: parseMusicalKey(keyName(best.root, best.mode), alternatives), confidence };
}

/** Local key timeline from the chroma segments; neighbours with the same key merge. */
export function keyTimelineFromChroma(chroma: number[][], keyHopSec: number, durationSec: number): KeySegment[] {
  const segments: KeySegment[] = [];
  chroma.forEach((c, i) => {
    const sum = c.reduce((a, b) => a + b, 0);
    if (sum <= 0) return;
    const { key, confidence } = keyFromChroma(c);
    const start = i * keyHopSec;
    const end = Math.min(durationSec, (i + 1) * keyHopSec);
    const last = segments[segments.length - 1];
    if (last && last.key.name === key.name && Math.abs(last.end - start) < 1e-6) {
      last.end = end;
      last.confidence = (last.confidence + confidence) / 2;
    } else {
      segments.push({ start, end, key, confidence });
    }
  });
  return segments;
}

/** Key at a position in seconds; the whole-track key when no timeline covers it. */
export function keyAt(analysis: Pick<DJTrackAnalysis, 'key' | 'keyConfidence' | 'keyTimeline'>, t: number): { key: MusicalKey; confidence: number } {
  const seg = analysis.keyTimeline?.find((s) => s.start <= t && t < s.end);
  if (seg && seg.confidence >= 0.35) return { key: seg.key, confidence: seg.confidence };
  return { key: analysis.key, confidence: analysis.keyConfidence };
}

// ── Tempo ───────────────────────────────────────────────────────────────────

export function tempoHypotheses(bpm: number, bpmConfidence: number, onsetsPerBeat: number, moduleBpm: number | null): TempoHypothesis[] {
  if (bpm <= 0) return moduleBpm ? [{ bpm: moduleBpm, confidence: 0.4, relationship: 'normal' }] : [];
  const out: TempoHypothesis[] = [{ bpm, confidence: bpmConfidence, relationship: 'normal' }];
  // Few onsets per beat or a very fast reading: half-time is plausible.
  const halfBias = (onsetsPerBeat < 0.6 ? 0.5 : 0.15) + (bpm > 150 ? 0.3 : 0);
  // Many onsets per beat or a very slow reading: double-time is plausible.
  const doubleBias = (onsetsPerBeat > 2.5 ? 0.5 : 0.15) + (bpm < 80 ? 0.3 : 0);
  out.push({ bpm: bpm / 2, confidence: Math.min(1, (1 - bpmConfidence) * 0.5 + halfBias * 0.6), relationship: 'half' });
  out.push({ bpm: bpm * 2, confidence: Math.min(1, (1 - bpmConfidence) * 0.5 + doubleBias * 0.6), relationship: 'double' });
  if (moduleBpm && moduleBpm > 0 && Math.abs(moduleBpm - bpm) / bpm > 0.03) {
    out.push({ bpm: moduleBpm, confidence: 0.45, relationship: 'normal' });
  }
  return out.sort((a, b) => b.confidence - a.confidence);
}

function tempoStability(beats: number[]): number {
  if (beats.length < 32) return beats.length >= 8 ? 0.7 : 0.3;
  const local: number[] = [];
  for (let i = 0; i + 16 < beats.length; i += 16) {
    const span = beats[i + 16] - beats[i];
    if (span > 0) local.push(16 * 60 / span);
  }
  if (local.length < 2) return 0.7;
  const m = local.reduce((a, b) => a + b, 0) / local.length;
  const sd = Math.sqrt(local.reduce((a, b) => a + (b - m) ** 2, 0) / local.length);
  return Math.max(0, Math.min(1, 1 - (sd / m) * 10));
}

// ── Legacy fallback timelines (old cache entries without extended data) ─────

function legacyExtended(frequencyPeaks: number[][], durationSec: number, rmsDb: number, peakDb: number): ExtendedAnalysis | null {
  const low = frequencyPeaks[0];
  if (!low || low.length < 4 || durationSec <= 0) return null;
  const hopSec = durationSec / low.length;
  const mid = frequencyPeaks[1] ?? low.map(() => 0);
  const high = frequencyPeaks[2] ?? low.map(() => 0);
  const flux = low.map((v, i) => (i > 0 ? Math.max(0, v + high[i] - low[i - 1] - high[i - 1]) : 0));
  const mx = Math.max(...flux, 1e-6);
  return {
    version: 0,
    hopSec,
    bass: low.slice(),
    drums: flux.map((v) => v / mx),
    harmonic: mid.slice(),
    vocal: mid.map(() => 0),
    brightness: high.slice(),
    loudnessShortTermDb: low.map((v, i) => (v + mid[i] + high[i] > 0.02 ? rmsDb : -100)),
    onsetFlux: flux.map((v) => v / mx),
    keyHopSec: durationSec,
    chroma: [],
    loudness: { integratedDb: rmsDb, shortTermMaxDb: rmsDb, peakDb, truePeakDb: peakDb, dynamicRangeDb: 0, crestFactorDb: peakDb - rmsDb },
    spectral: { centroidHz: 0, lowRatio: 0.33, midRatio: 0.34, highRatio: 0.33, flatness: 0.5, brightness: 0.5, muddiness: 0.3 },
    bassSummary: { subRatio: 0.5, kickStrength: 0.5, melodic: false },
    firstTransient: 0,
  };
}

// ── Main ────────────────────────────────────────────────────────────────────

export interface BuildAnalysisInput {
  id: string;
  durationSec: number;
  analysis: PipelineAnalysis;
  extended?: ExtendedAnalysis | null;
  song?: TrackerSong | null;
  /** The render was capped at this many seconds (a preview render); see ModuleBeatGridOptions. */
  renderCapSec?: number;
}

/**
 * The module's own tempo and grid for a render of `durationSec`, or null (no
 * song, no patterns, or a walk that disagrees with the render). The one
 * place that decides whether a track's tempo comes from the module.
 */
export function moduleTempo(song: TrackerSong | null | undefined, durationSec: number, renderCapSec?: number): ModuleBeatGrid | null {
  if (!song || !Array.isArray(song.patterns) || song.patterns.length === 0 || !(durationSec > 0)) return null;
  try { return moduleBeatGrid(song, durationSec, { renderCapSec }); } catch { return null; }
}

function tl(values: number[], hopSec: number, confidence: number): ActivityTimeline {
  return { hopSec, values, confidence };
}

function meanOf(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

export function buildDJTrackAnalysis(input: BuildAnalysisInput): DJTrackAnalysis {
  const { id, analysis, song } = input;
  const durationSec = input.durationSec > 0 ? input.durationSec : (analysis.beats.length ? analysis.beats[analysis.beats.length - 1] + 1 : 0);
  const ext = input.extended ?? legacyExtended(analysis.frequencyPeaks, durationSec, analysis.rmsDb, analysis.peakDb);
  const extIsReal = !!input.extended;

  // One tempo source: the module's own timing when its walk matches the render, else the audio analysis.
  const mg = moduleTempo(song, input.durationSec, input.renderCapSec);
  // A SID (no song walk that matches the render) gets its beat from the player clock: whole player
  // calls per beat, locked to the detected beats (sidPlayerBeatGrid). Its bars come from the phase
  // search over the exact beats, as an audio track's do.
  const sg = !mg && analysis.playerCallHz ? sidPlayerBeatGrid(analysis, analysis.playerCallHz, durationSec) : null;
  const tempo = mg
    ? { beats: mg.beats, downbeats: mg.downbeats, bpm: mg.bpm, bpmConfidence: mg.confidence, timeSignature: mg.beatsPerBar }
    : sg
      ? { beats: sg.beats, downbeats: [], bpm: sg.bpm, bpmConfidence: sg.coherence, timeSignature: analysis.timeSignature }
      : { beats: analysis.beats, downbeats: analysis.downbeats, bpm: analysis.bpm, bpmConfidence: analysis.bpmConfidence, timeSignature: analysis.timeSignature };
  const grids = buildBeatGrids({
    ...tempo, extended: ext, durationSec,
    fixed: mg ? { beatsPerBar: mg.beatsPerBar, confidence: mg.confidence, meterConfidence: mg.meterConfidence } : undefined,
  });

  let features: BarFeatures[] = [];
  let sections: DJTrackAnalysis['sections'] = [];
  let phrases: DJTrackAnalysis['phrases'] = [];
  let events: DJTrackAnalysis['arrangementEvents'] = [];
  let phraseLengthBars = 8;
  let phraseConfidence = 0.2;
  let trackVocal = 0;
  if (ext && grids.downbeats.bars.length > 0) {
    features = barFeatures(grids.downbeats, ext);
    trackVocal = meanOf(features.map((f) => f.vocal));
    const bounds = segmentBoundaries(features);
    sections = labelSections(features, bounds, trackVocal);
    // A module's phrases come from its order list (pattern changes are exact); the audio guesses them otherwise.
    const mp = mg?.phrase ?? null;
    const pl = mp ?? detectPhraseLength(features, bounds);
    phraseLengthBars = pl.lengthBars;
    phraseConfidence = pl.confidence;
    phrases = buildPhrases(features, sections, phraseLengthBars, phraseConfidence, mp?.startBars);
    events = arrangementEvents(features, sections);
  }

  const cues = deriveCuePoints({
    features, sections, phrases, events, landmarks: grids.landmarks, durationSec, phraseLengthBars,
  });

  // Rhythmic
  const hop = ext?.hopSec ?? 0.25;
  const beats = tempo.beats;
  const beatPeriod = tempo.bpm > 0 ? 60 / tempo.bpm : 0.5;
  let onsetsPerBeat = 1;
  let fourOnFloor = 0.5;
  let syncopation = 0.3;
  if (ext && beats.length > 4) {
    const flux = ext.onsetFlux;
    const peaks = flux.filter((v, i) => v > 0.3 && v >= (flux[i - 1] ?? 0) && v >= (flux[i + 1] ?? 0)).length;
    onsetsPerBeat = peaks / beats.length;
    let on = 0, off = 0, n = 0;
    for (const t of beats) {
      on += timelineAt(ext.bass, hop, t) * timelineAt(ext.drums, hop, t);
      off += timelineAt(ext.bass, hop, t + beatPeriod / 2) * timelineAt(ext.drums, hop, t + beatPeriod / 2);
      n++;
    }
    const onM = n ? on / n : 0;
    const offM = n ? off / n : 0;
    fourOnFloor = onM + offM > 0 ? Math.max(0, Math.min(1, (onM - offM) / (onM + offM) + 0.5)) : 0.5;
    syncopation = onM + offM > 0 ? Math.max(0, Math.min(1, offM / (onM + offM))) : 0.3;
  }
  // The module grid IS the normal hypothesis; without it the module's own BPM is an alternative to the audio reading.
  const moduleBpm = song && !mg ? detectBPM(song).bpm : null;
  const rhythmic: RhythmicAnalysis = {
    onsetsPerBeat,
    fourOnFloorScore: fourOnFloor,
    syncopation,
    drumPattern: !ext ? 'unknown' : fourOnFloor > 0.65 ? 'four-on-floor' : syncopation > 0.55 ? 'breakbeat' : onsetsPerBeat < 0.5 ? 'sparse' : tempo.bpm < 95 && tempo.bpm > 0 ? 'half-time' : 'four-on-floor',
    tempoHypotheses: tempoHypotheses(tempo.bpm, tempo.bpmConfidence, onsetsPerBeat, moduleBpm),
    tempoStability: tempoStability(beats),
  };

  // Loudness
  const loudness: LoudnessAnalysis = {
    integratedDb: ext ? ext.loudness.integratedDb : analysis.rmsDb,
    shortTermDb: ext ? ext.loudnessShortTermDb : [],
    shortTermHopSec: hop,
    shortTermMaxDb: ext ? ext.loudness.shortTermMaxDb : analysis.rmsDb,
    peakDb: ext ? ext.loudness.peakDb : analysis.peakDb,
    truePeakDb: ext ? ext.loudness.truePeakDb : analysis.peakDb,
    dynamicRangeDb: ext ? ext.loudness.dynamicRangeDb : 0,
    crestFactorDb: ext ? ext.loudness.crestFactorDb : analysis.peakDb - analysis.rmsDb,
  };

  // Energy (plan: not RMS)
  const intensityValues = features.map((f) => f.intensity);
  const bassMean = ext ? meanOf(ext.bass) : 0.5;
  const drumMean = ext ? meanOf(ext.drums) : 0.5;
  const harmonicMean = ext ? meanOf(ext.harmonic) : 0.5;
  const vocalMean = ext ? meanOf(ext.vocal) : 0;
  const brightMean = ext ? meanOf(ext.brightness) : 0.5;
  const transientDensity = ext ? Math.min(1, (ext.onsetFlux.filter((v) => v > 0.3).length / Math.max(1, durationSec)) / 8) : 0.5;
  const arrangementDensity = ext ? meanOf(ext.bass.map((_, i) =>
    ((ext.bass[i] > 0.3 ? 1 : 0) + (ext.drums[i] > 0.3 ? 1 : 0) + (ext.harmonic[i] > 0.3 ? 1 : 0) + (ext.vocal[i] > 0.3 ? 1 : 0)) / 4)) : 0.5;
  const loudnessEnergy = Math.max(0, Math.min(1, (analysis.rmsDb + 60) / 60));
  const perceivedIntensityMean = intensityValues.length ? meanOf(intensityValues) : loudnessEnergy;
  const energy: EnergyAnalysis = {
    bass: bassMean, drums: drumMean, transientDensity, brightness: brightMean, harmonicDensity: harmonicMean,
    vocalPresence: vocalMean, rhythmicDensity: Math.min(1, onsetsPerBeat / 4), arrangementDensity,
    perceivedIntensity: perceivedIntensityMean, loudnessEnergy,
  };

  const spectral: SpectralAnalysis = ext ? ext.spectral : { centroidHz: 0, lowRatio: 0.33, midRatio: 0.34, highRatio: 0.33, flatness: 0.5, brightness: 0.5, muddiness: 0.3 };
  const bass: BassAnalysis = {
    level: bassMean,
    subRatio: ext ? ext.bassSummary.subRatio : 0.5,
    heaviness: ext ? Math.min(1, spectral.lowRatio * 2.5 * (0.5 + 0.5 * ext.bassSummary.subRatio)) : 0.5,
    kickStrength: ext ? ext.bassSummary.kickStrength : 0.5,
    melodic: ext ? ext.bassSummary.melodic : false,
    activity: tl(ext ? ext.bass : [], hop, extIsReal ? 0.85 : 0.3),
    confidence: extIsReal ? 0.85 : 0.3,
  };

  // Key
  const key = parseMusicalKey(analysis.musicalKey);
  const keyConfidence = key.mode === 'unknown' ? 0 : analysis.keyConfidence;
  const keyTimeline = extIsReal && ext && ext.chroma.length > 1 ? keyTimelineFromChroma(ext.chroma, ext.keyHopSec, durationSec) : undefined;
  if (keyTimeline && key.mode !== 'unknown') {
    // Alternatives for the whole-track key: the local keys that disagree with it.
    const others = new Map<string, number>();
    for (const s of keyTimeline) if (s.key.name !== key.name) others.set(s.key.name, Math.max(others.get(s.key.name) ?? 0, s.confidence));
    key.alternatives = [...others.entries()].map(([name, confidence]) => ({ name, confidence })).sort((a, b) => b.confidence - a.confidence).slice(0, 3);
  }

  // Tracker
  let tracker: TrackerMixAnalysis | undefined;
  if (song && Array.isArray(song.patterns) && song.patterns.length > 0) {
    try { tracker = analyzeTrackerSong(song, durationSec); } catch { tracker = undefined; }
  }

  const sectionConf = sections.length ? meanOf(sections.map((s) => s.confidence)) : 0;
  const analysisConfidence: AnalysisConfidence = {
    bpm: tempo.bpmConfidence,
    beatGrid: grids.beatGrid.confidence,
    downbeat: grids.downbeats.confidence,
    key: keyConfidence,
    section: sectionConf,
    cue: cues.confidence,
    vocal: extIsReal ? 0.45 : 0,
    bass: bass.confidence,
    tracker: tracker ? tracker.confidence : 0,
    overall: 0,
  };
  analysisConfidence.overall = Math.min(1,
    0.3 * analysisConfidence.beatGrid + 0.2 * analysisConfidence.downbeat + 0.15 * analysisConfidence.key +
    0.15 * analysisConfidence.section + 0.1 * analysisConfidence.cue + 0.1 * analysisConfidence.bass);

  const intensityTl = ext ? smooth(ext.bass.map((_, i) => perceivedIntensity({
    bass: ext.bass[i], drums: ext.drums[i], harmonic: ext.harmonic[i], brightness: ext.brightness[i],
    loudnessDb: ext.loudnessShortTermDb[i] ?? -100,
  })), 2) : [];

  return {
    id,
    durationSec,
    version: DJ_ANALYSIS_VERSION,
    bpm: tempo.bpm,
    bpmConfidence: tempo.bpmConfidence,
    tempoSource: mg ? 'module' : 'audio',
    beatGrid: grids.beatGrid,
    downbeats: grids.downbeats,
    meter: grids.meter,
    landmarks: grids.landmarks,
    key,
    keyConfidence,
    keyTimeline,
    tuning: undefined,
    loudness,
    energy,
    spectral,
    rhythmic,
    bass,
    danceability: analysis.genre?.danceability ?? 0.5,
    genre: analysis.genre ? { primary: analysis.genre.primary, subgenre: analysis.genre.subgenre, confidence: analysis.genre.confidence, mood: analysis.genre.mood } : undefined,
    sections,
    phrases,
    phraseLengthBars,
    arrangementEvents: events,
    cuePoints: cues.cuePoints,
    vocalActivity: tl(ext ? ext.vocal : [], hop, extIsReal ? 0.45 : 0),
    drumActivity: tl(ext ? ext.drums : [], hop, extIsReal ? 0.85 : 0.3),
    bassActivity: tl(ext ? ext.bass : [], hop, extIsReal ? 0.85 : 0.3),
    harmonicActivity: tl(ext ? ext.harmonic : [], hop, extIsReal ? 0.7 : 0.3),
    intensity: tl(intensityTl, hop, extIsReal ? 0.8 : 0.3),
    analysisConfidence,
    tracker,
  };
}

function profile(values: number[], parts = 8): number[] {
  if (values.length === 0) return new Array(parts).fill(0);
  const out: number[] = [];
  const size = values.length / parts;
  for (let p = 0; p < parts; p++) {
    const s = Math.floor(p * size);
    const e = Math.max(s + 1, Math.floor((p + 1) * size));
    out.push(meanOf(values.slice(s, e)));
  }
  return out;
}

/** The compact summary stored on a playlist track. */
/**
 * A playlist row's tempo, key, energy and length, from the track's one
 * analysis (the same DJTrackAnalysis the deck and the planners read; owner
 * juggling plan sections 2 and 31: one producer, and the key's confidence
 * travels in the summary). An unknown key or length writes none.
 */
export function playlistMetaFromSummary(summary: DJTrackSummary): { bpm: number; musicalKey?: string; energy: number; duration?: number } {
  return {
    bpm: summary.bpm, ...(summary.key ? { musicalKey: summary.key } : {}), energy: summary.energy.perceivedIntensity,
    ...(summary.durationSec > 0 ? { duration: summary.durationSec } : {}),
  };
}

/**
 * A track's real length in seconds from a render of `renderedSec`: the render
 * itself, unless it was capped (`renderCapSec`, the playlist analyser's
 * preview) and the module's own order walk (timeOrderPositions, the walk the
 * module grid reads) plays longer - then the walk's end. The one producer of
 * a track's length for its playlist row (JUGGLE-FOLLOWUPS c: rows of 0 s made
 * the set plan count 240 s per module).
 */
export function trackLengthSec(renderedSec: number, song?: TrackerSong | null, renderCapSec?: number): number {
  const capped = renderCapSec !== undefined && renderedSec >= renderCapSec - 0.5;
  if (!capped || !song || !Array.isArray(song.patterns) || song.patterns.length === 0) return renderedSec;
  try {
    const walk = timeOrderPositions(song);
    const end = walk.positions[walk.positions.length - 1]?.end ?? 0;
    return end > renderedSec ? end : renderedSec;
  } catch {
    return renderedSec;
  }
}

export function summarizeTrack(a: DJTrackAnalysis): DJTrackSummary {
  const intro = a.sections.find((s) => s.kind === 'intro');
  const outro = [...a.sections].reverse().find((s) => s.kind === 'outro');
  return {
    version: a.version,
    durationSec: a.durationSec,
    bpm: a.bpm,
    bpmConfidence: a.bpmConfidence,
    tempoHypotheses: a.rhythmic.tempoHypotheses,
    key: a.key.mode === 'unknown' ? null : a.key.name,
    keyConfidence: a.keyConfidence,
    keyMode: a.key.mode,
    energy: a.energy,
    loudness: { integratedDb: a.loudness.integratedDb, truePeakDb: a.loudness.truePeakDb, dynamicRangeDb: a.loudness.dynamicRangeDb },
    bassLevel: a.bass.level,
    bassHeaviness: a.bass.heaviness,
    vocalPresence: a.energy.vocalPresence,
    drumPattern: a.rhythmic.drumPattern,
    brightness: a.spectral.brightness,
    genre: a.genre?.subgenre || a.genre?.primary,
    introLengthSec: intro ? intro.end - intro.start : (a.cuePoints.firstDrums ?? 0),
    outroLengthSec: outro ? outro.end - outro.start : (a.cuePoints.outroStart !== undefined ? a.durationSec - a.cuePoints.outroStart : 0),
    hasDrop: a.sections.some((s) => s.kind === 'drop'),
    hasBreakdown: a.sections.some((s) => s.kind === 'breakdown'),
    cuePoints: a.cuePoints,
    phraseLengthBars: a.phraseLengthBars,
    sectionKinds: a.sections.map((s) => s.kind),
    confidence: a.analysisConfidence,
    tracker: !!a.tracker,
    vocalProfile: profile(a.vocalActivity.values),
    bassProfile: profile(a.bassActivity.values),
    intensityProfile: profile(a.intensity.values),
  };
}

/** The summary of a pipeline result (render + analysis), for the playlist track it came from. */
export function summaryFromPipeline(result: { duration: number; analysis?: PipelineResult['analysis'] }, id = 'track', song?: TrackerSong | null, renderCapSec?: number): DJTrackSummary | null {
  if (!result.analysis) return null;
  try {
    const summary = summarizeTrack(buildDJTrackAnalysis({ id, durationSec: result.duration, analysis: result.analysis, extended: result.analysis.extended ?? null, song: song ?? null, renderCapSec }));
    return { ...summary, durationSec: trackLengthSec(result.duration, song, renderCapSec) };
  } catch {
    return null;
  }
}

/** A summary for a track that only has the legacy playlist fields (bpm, key, energy). */
export function summaryFromLegacy(track: { bpm: number; musicalKey?: string; energy?: number; duration: number; rmsDb?: number; peakDb?: number }): DJTrackSummary {
  const key = parseMusicalKey(track.musicalKey);
  const e = track.energy ?? 0.5;
  const energy: EnergyAnalysis = {
    bass: e, drums: e, transientDensity: 0.5, brightness: 0.5, harmonicDensity: 0.5, vocalPresence: 0,
    rhythmicDensity: 0.5, arrangementDensity: 0.5, perceivedIntensity: e, loudnessEnergy: e,
  };
  const conf: AnalysisConfidence = { bpm: track.bpm > 0 ? 0.5 : 0, beatGrid: 0, downbeat: 0, key: key.mode === 'unknown' ? 0 : 0.5, section: 0, cue: 0, vocal: 0, bass: 0, tracker: 0, overall: 0.2 };
  return {
    version: 0,
    durationSec: track.duration,
    bpm: track.bpm,
    bpmConfidence: conf.bpm,
    tempoHypotheses: tempoHypotheses(track.bpm, 0.5, 1, null),
    key: key.mode === 'unknown' ? null : key.name,
    keyConfidence: conf.key,
    keyMode: key.mode,
    energy,
    loudness: { integratedDb: track.rmsDb ?? -14, truePeakDb: track.peakDb ?? -1, dynamicRangeDb: 0 },
    bassLevel: e,
    bassHeaviness: 0.5,
    vocalPresence: 0,
    drumPattern: 'unknown',
    brightness: 0.5,
    introLengthSec: 0,
    outroLengthSec: 0,
    hasDrop: false,
    hasBreakdown: false,
    cuePoints: {},
    phraseLengthBars: 8,
    sectionKinds: [],
    confidence: conf,
    tracker: false,
    vocalProfile: new Array(8).fill(0),
    bassProfile: new Array(8).fill(e),
    intensityProfile: new Array(8).fill(e),
  };
}
