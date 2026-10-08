/**
 * The deterministic Auto DJ test corpus (plan section 2, Gate A): the 15
 * track types as synthetic arrangements with known ground truth, analysed
 * through the real extended analysis and DJTrackAnalysis builder.
 *
 * Test support only.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { ChannelData, Pattern, TrackerCell } from '@/types/tracker';
import { computeExtendedAnalysis } from '../activityTimelines';
import { buildDJTrackAnalysis, summarizeTrack, type PipelineAnalysis } from '../trackAnalysis';
import type { DJTrackAnalysis, DJTrackSummary } from '../types';
import { renderSyntheticTrack, type SynthTrack, type SynthTrackSpec } from './synthTrack';

export type CorpusId =
  | 'steady' | 'longIntro' | 'longOutro' | 'vocals' | 'drops' | 'breakdowns' | 'fastBpm' | 'compatibleKey'
  | 'clashKey' | 'uncertainKey' | 'tracker' | 'unusual' | 'short' | 'silence' | 'variableEnergy';

const groove = (bars: number, extra: Partial<SynthTrackSpec['sections'][number]> = {}) =>
  ({ bars, kick: true, bass: true, hats: true, ...extra });

/** 15 track types, plan section 2 (A2.1-A2.15). Root 57 = A, 60 = C, 64 = E, 62 = D, 66 = F#. */
export const CORPUS_SPECS: Record<CorpusId, SynthTrackSpec> = {
  steady: { name: 'steady 4/4 electronic', bpm: 126, root: 57, mode: 'minor', sections: [groove(8), groove(8, { pad: true }), groove(8), groove(8, { pad: true })] },
  longIntro: { name: 'long intro', bpm: 124, root: 57, mode: 'minor', sections: [{ bars: 16, pad: true, level: 0.5 }, groove(8, { pad: true }), groove(16, { pad: true }), groove(8)] },
  longOutro: { name: 'long outro', bpm: 128, root: 64, mode: 'minor', sections: [groove(8), groove(16, { pad: true }), { bars: 16, pad: true, hats: true, level: 0.5 }, { bars: 8, pad: true, level: 0.3 }] },
  vocals: { name: 'vocals', bpm: 122, root: 60, mode: 'major', sections: [groove(8), groove(8, { vocal: true }), groove(8, { pad: true }), groove(8, { vocal: true }), groove(8)] },
  drops: { name: 'drops', bpm: 130, root: 57, mode: 'minor', sections: [groove(8, { pad: true }), { bars: 8, pad: true, hats: true, ramp: true }, groove(16, { pad: true }), { bars: 8, pad: true, hats: true, ramp: true }, groove(16, { pad: true })] },
  breakdowns: { name: 'breakdowns', bpm: 125, root: 57, mode: 'minor', sections: [groove(16, { pad: true }), { bars: 8, pad: true, level: 0.6 }, groove(16, { pad: true }), { bars: 8, pad: true, level: 0.6 }, groove(8, { pad: true })] },
  fastBpm: { name: 'large BPM difference', bpm: 174, root: 57, mode: 'minor', sections: [groove(16), groove(16, { pad: true }), groove(16)] },
  compatibleKey: { name: 'compatible key (E minor, 9A)', bpm: 126, root: 64, mode: 'minor', sections: [groove(8, { pad: true }), groove(16, { pad: true }), groove(8, { pad: true })] },
  clashKey: { name: 'incompatible key (F# major, 2B)', bpm: 126, root: 66, mode: 'major', sections: [groove(8, { pad: true }), groove(16, { pad: true }), groove(8, { pad: true })] },
  uncertainKey: { name: 'uncertain key (drums only)', bpm: 126, root: 57, mode: 'minor', sections: [{ bars: 16, kick: true, hats: true }, { bars: 16, kick: true, hats: true }] },
  tracker: { name: 'tracker module', bpm: 125, root: 57, mode: 'minor', sections: [{ bars: 4, pad: true, level: 0.6 }, groove(8), groove(8, { pad: true }), { bars: 4, hats: true, pad: true, level: 0.5 }, groove(8, { pad: true })] },
  unusual: { name: 'unusual arrangement (3/4, anacrusis, tempo change)', bpm: 120, root: 62, mode: 'major', beatsPerBar: 3, anacrusisBeats: 1, sections: [groove(12, { pad: true }), { bars: 6, pad: true, level: 0.5 }, groove(12, { pad: true })], tempoChangeAtBar: 18, tempoChangeRatio: 1.08 },
  short: { name: 'very short track', bpm: 128, root: 57, mode: 'minor', sections: [groove(8, { pad: true })] },
  silence: { name: 'silence inside', bpm: 126, root: 57, mode: 'minor', leadInSec: 2, sections: [groove(8), { bars: 4, silent: true }, groove(8, { pad: true }), { bars: 2, silent: true }] },
  variableEnergy: { name: 'highly variable energy', bpm: 127, root: 57, mode: 'minor', sections: [groove(4, { level: 1 }), { bars: 4, pad: true, level: 0.3 }, groove(4, { level: 0.9 }), { bars: 4, pad: true, hats: true, level: 0.4 }, groove(4, { pad: true }), { bars: 4, pad: true, level: 0.25 }, groove(8, { pad: true, level: 1 })] },
};

export const CORPUS_IDS = Object.keys(CORPUS_SPECS) as CorpusId[];

const renderCache = new Map<CorpusId, SynthTrack>();
const analysisCache = new Map<CorpusId, DJTrackAnalysis>();

export function corpusTrack(id: CorpusId): SynthTrack {
  let t = renderCache.get(id);
  if (!t) { t = renderSyntheticTrack(CORPUS_SPECS[id]); renderCache.set(id, t); }
  return t;
}

const emptyCell = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

/** A tracker song whose structure matches the `tracker` corpus spec: pad intro, drums+bass, lead, break, full. */
export function corpusTrackerSong(): TrackerSong {
  const rows = 64;
  const channel = (i: number, name: string, fill: (r: number) => TrackerCell | null): ChannelData => ({
    id: `c${i}`, name, rows: Array.from({ length: rows }, (_, r) => fill(r) ?? emptyCell()),
    muted: false, solo: false, collapsed: false, volume: 100, pan: 0, instrumentId: i + 1, color: null,
  });
  const kick = (r: number) => (r % 16 === 0 ? { ...emptyCell(), note: 36, instrument: 1 } : r % 16 === 8 ? { ...emptyCell(), note: 38, instrument: 2 } : null);
  const hat = (r: number) => (r % 4 === 2 ? { ...emptyCell(), note: 60, instrument: 3 } : null);
  const bass = (r: number) => (r % 8 === 0 ? { ...emptyCell(), note: 13 + ((r >> 4) % 2) * 3, instrument: 4 } : null);
  const lead = (r: number) => (r % 2 === 0 ? { ...emptyCell(), note: 61 + [0, 7, 2, 9][(r >> 1) % 4], instrument: 5 } : null);
  const pad = (r: number) => (r % 32 === 0 ? { ...emptyCell(), note: 37, instrument: 6 } : null);
  const none = () => null;
  const mk = (id: string, name: string, chans: Array<(r: number) => TrackerCell | null>): Pattern => ({
    id, name, length: rows, channels: chans.map((f, i) => channel(i, ['Drums', 'Snare', 'Hat', 'Bass', 'Lead', 'Pad'][i] ?? `c${i}`, f)),
  });
  const patterns: Pattern[] = [
    mk('p0', 'intro', [none, none, none, none, none, pad]),
    mk('p1', 'groove', [kick, none, hat, bass, none, none]),
    mk('p2', 'lead', [kick, none, hat, bass, lead, pad]),
    mk('p3', 'break', [none, none, none, none, none, pad]),
    mk('p4', 'full', [kick, none, hat, bass, lead, pad]),
  ];
  return {
    name: 'corpus tracker', format: 'MOD', patterns, instruments: [], songPositions: [0, 1, 1, 2, 2, 3, 4, 4],
    songLength: 8, restartPosition: 0, numChannels: 6, initialSpeed: 6, initialBPM: 125,
  } as unknown as TrackerSong;
}

/** The legacy pipeline analysis for a synthetic track: ground-truth beats, essentia's first-beat downbeat assumption. */
export function corpusPipelineAnalysis(track: SynthTrack, overrides: Partial<PipelineAnalysis> = {}): PipelineAnalysis {
  const bpb = track.spec.beatsPerBar ?? 4;
  const legacyDownbeats = track.beats.filter((_, i) => i % bpb === 0);
  let sumSq = 0, peak = 0;
  for (let i = 0; i < track.pcm.length; i++) { const v = track.pcm[i]; sumSq += v * v; if (Math.abs(v) > peak) peak = Math.abs(v); }
  const rms = Math.sqrt(sumSq / track.pcm.length);
  const keyName = `${['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'][track.spec.root % 12]} ${track.spec.mode}`;
  return {
    bpm: track.spec.bpm,
    bpmConfidence: 0.9,
    beats: track.beats,
    downbeats: legacyDownbeats,
    timeSignature: bpb,
    musicalKey: keyName,
    keyConfidence: 0.85,
    frequencyPeaks: [[], [], []],
    rmsDb: 20 * Math.log10(rms || 1e-6),
    peakDb: 20 * Math.log10(peak || 1e-6),
    genre: { primary: 'Electronic', subgenre: 'Techno', confidence: 0.6, mood: 'Energetic', energy: Math.max(0, Math.min(1, (20 * Math.log10(rms || 1e-6) + 60) / 60)), danceability: 0.7 },
    ...overrides,
  };
}

export function corpusAnalysis(id: CorpusId): DJTrackAnalysis {
  let a = analysisCache.get(id);
  if (a) return a;
  const track = corpusTrack(id);
  const extended = computeExtendedAnalysis(track.pcm, track.sampleRate, { beats: track.beats });
  const overrides: Partial<PipelineAnalysis> = id === 'uncertainKey' ? { musicalKey: 'Unknown', keyConfidence: 0 } : {};
  a = buildDJTrackAnalysis({
    id,
    durationSec: track.durationSec,
    analysis: corpusPipelineAnalysis(track, overrides),
    extended: { ...extended },
    song: id === 'tracker' ? corpusTrackerSong() : null,
  });
  analysisCache.set(id, a);
  return a;
}

export function corpusSummary(id: CorpusId): DJTrackSummary {
  return summarizeTrack(corpusAnalysis(id));
}

/** Every corpus track, analysed. */
export function wholeCorpus(): Array<{ id: CorpusId; analysis: DJTrackAnalysis; summary: DJTrackSummary }> {
  return CORPUS_IDS.map((id) => ({ id, analysis: corpusAnalysis(id), summary: corpusSummary(id) }));
}
