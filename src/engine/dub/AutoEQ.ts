/**
 * AutoEQ — pure functions to compute a Fil4 EQ curve from audio analysis.
 *
 * Three stages:
 *   1. Genre baseline — maps genre + energy/danceability → base EQ curve
 *   2. Instrument modulation — additive deltas from CED instrument hints
 *   3. Spectral compensation — targeted cuts/boosts from frequencyPeaks data
 *
 * All functions are pure (no side effects, no store access).
 */

import type { Fil4Params } from '@/engine/effects/Fil4EqEffect';
import type { InstrumentHints } from '@/workers/dj-analysis.worker';
import type { FullAnalysisResult } from '@/stores/useTrackerAnalysisStore';

// ── Internal EQ curve representation ────────────────────────────────────────

interface BandParam {
  enabled: boolean;
  freq: number;
  gain: number;
  q?: number;    // for shelves / HP
  bw?: number;   // for parametric bands (bandwidth in octaves)
}

interface EQCurve {
  hp:  { enabled: boolean; freq: number; q: number };
  ls:  BandParam;
  p0:  BandParam;  // low-mid (P1)
  p1:  BandParam;  // presence (P2)
  p2:  BandParam;  // mid spare (P3)
  p3:  BandParam;  // air spare (P4)
  hs:  BandParam;
}

// ── Stage 1: Genre Baseline ──────────────────────────────────────────────────

interface GenreDef {
  subGain: number; subFreq: number; subQ: number;
  lowMidGain: number; lowMidFreq: number; lowMidQ: number;
  presenceGain: number; presenceFreq: number; presenceBw: number;
  airGain: number; airFreq: number; airQ: number;
  hpFreq: number;
}

const GENRE_DEFS: Record<string, GenreDef> = {
  'Reggae':     { subGain:4,   subFreq:70,  subQ:0.8, lowMidGain:-3,   lowMidFreq:320, lowMidQ:1.2, presenceGain:2,   presenceFreq:3000, presenceBw:1.5, airGain:2.5, airFreq:10000, airQ:0.8, hpFreq:28 },
  'Electronic': { subGain:3.5, subFreq:65,  subQ:0.8, lowMidGain:-2,   lowMidFreq:280, lowMidQ:1.0, presenceGain:1.5, presenceFreq:4000, presenceBw:1.5, airGain:3,   airFreq:12000, airQ:0.8, hpFreq:25 },
  'Hip-Hop':    { subGain:4,   subFreq:75,  subQ:0.8, lowMidGain:-2.5, lowMidFreq:300, lowMidQ:1.1, presenceGain:2,   presenceFreq:3500, presenceBw:1.5, airGain:2,   airFreq:12000, airQ:0.8, hpFreq:30 },
  'Rock':       { subGain:2,   subFreq:80,  subQ:0.9, lowMidGain:-1.5, lowMidFreq:350, lowMidQ:0.9, presenceGain:3,   presenceFreq:3500, presenceBw:1.2, airGain:2,   airFreq:10000, airQ:0.8, hpFreq:35 },
  'Jazz':       { subGain:1.5, subFreq:80,  subQ:0.9, lowMidGain:0,    lowMidFreq:300, lowMidQ:1.0, presenceGain:1,   presenceFreq:5000, presenceBw:2.0, airGain:1.5, airFreq:12000, airQ:0.8, hpFreq:25 },
  'Classical':  { subGain:1,   subFreq:80,  subQ:0.9, lowMidGain:0,    lowMidFreq:300, lowMidQ:1.0, presenceGain:0.5, presenceFreq:6000, presenceBw:2.0, airGain:2,   airFreq:14000, airQ:0.8, hpFreq:20 },
  'Blues':      { subGain:2.5, subFreq:75,  subQ:0.8, lowMidGain:-2,   lowMidFreq:300, lowMidQ:1.0, presenceGain:2,   presenceFreq:3000, presenceBw:1.5, airGain:2,   airFreq:10000, airQ:0.8, hpFreq:28 },
  'R&B / Soul': { subGain:2.5, subFreq:75,  subQ:0.8, lowMidGain:-2,   lowMidFreq:300, lowMidQ:1.0, presenceGain:2,   presenceFreq:3000, presenceBw:1.5, airGain:2,   airFreq:10000, airQ:0.8, hpFreq:28 },
  'Folk':       { subGain:1.5, subFreq:80,  subQ:0.9, lowMidGain:-1,   lowMidFreq:320, lowMidQ:0.9, presenceGain:1.5, presenceFreq:4000, presenceBw:1.8, airGain:1.5, airFreq:12000, airQ:0.8, hpFreq:30 },
  'Unknown':    { subGain:2,   subFreq:70,  subQ:0.8, lowMidGain:-1,   lowMidFreq:300, lowMidQ:1.0, presenceGain:1.5, presenceFreq:3000, presenceBw:1.5, airGain:2,   airFreq:10000, airQ:0.8, hpFreq:25 },
};

export function computeGenreBaseline(
  genrePrimary: string,
  energy: number,
  danceability: number,
): EQCurve {
  const key = Object.keys(GENRE_DEFS).find(k =>
    genrePrimary.toLowerCase().includes(k.toLowerCase())
  ) ?? 'Unknown';
  const g = GENRE_DEFS[key];

  const eScale = 0.85 + Math.max(0, Math.min(1, energy)) * 0.3;
  const dBonus = Math.max(0, Math.min(1, danceability)) * 0.1;

  return {
    hp:  { enabled: true,  freq: g.hpFreq, q: 0.7 },
    ls:  { enabled: true,  freq: g.subFreq,     gain: (g.subGain + dBonus) * eScale,      q: g.subQ },
    p0:  { enabled: g.lowMidGain !== 0, freq: g.lowMidFreq,   gain: g.lowMidGain,                   bw: g.lowMidQ },
    p1:  { enabled: true,  freq: g.presenceFreq, gain: (g.presenceGain + dBonus) * eScale, bw: g.presenceBw },
    p2:  { enabled: false, freq: 800,   gain: 0, bw: 1.0 },
    p3:  { enabled: false, freq: 8000,  gain: 0, bw: 2.0 },
    hs:  { enabled: true,  freq: g.airFreq,      gain: g.airGain * eScale,                  q: g.airQ },
  };
}

// ── Stage 2: Instrument Modulation ──────────────────────────────────────────

interface InstDeltas {
  subDelta: number;
  presenceDelta: number;
  presenceFreqDelta: number;
  airDelta: number;
  hpFreqDelta: number;
}

export function computeInstrumentModulation(hints: InstrumentHints): InstDeltas {
  let subDelta = 0, presenceDelta = 0, presenceFreqDelta = 0, airDelta = 0, hpFreqDelta = 0;

  if (hints.hasBass)                    { subDelta      += 0.5; hpFreqDelta       += 7; }
  if (hints.hasPercussion)              { presenceDelta += 1.0; hpFreqDelta       += 5; }
  if (hints.hasSynth)                   { airDelta      += 1.0; }
  if (hints.hasVoice)                   { presenceDelta -= 0.5; }
  if (hints.hasStrings || hints.hasBrass) { presenceDelta += 0.5; presenceFreqDelta += 2000; airDelta += 0.5; }
  if (hints.hasGuitar)                  { subDelta      += 0.5; presenceDelta     += 0.5;  presenceFreqDelta += 500; }
  if (hints.hasPiano)                   { presenceDelta += 0.5; presenceFreqDelta += 1000; airDelta += 1.0; }

  return { subDelta, presenceDelta, presenceFreqDelta, airDelta, hpFreqDelta };
}

function applyInstDeltas(curve: EQCurve, d: InstDeltas): EQCurve {
  const r = JSON.parse(JSON.stringify(curve)) as EQCurve;
  r.ls.gain  += d.subDelta;
  r.p1.gain  += d.presenceDelta;
  r.hs.gain  += d.airDelta;
  r.hp.freq   = Math.max(20, r.hp.freq + d.hpFreqDelta);
  r.p1.freq   = Math.min(8000, r.p1.freq + d.presenceFreqDelta * 0.5);
  if (r.ls.gain > 0) r.ls.enabled = true;
  if (r.hs.gain > 0) r.hs.enabled = true;
  if (r.p1.gain > 0) r.p1.enabled = true;
  return r;
}

// ── Stage 3: Spectral Compensation ──────────────────────────────────────────

export function computeSpectralCompensation(
  peaks: number[][],
  curve: EQCurve,
): EQCurve {
  if (!peaks || peaks.length < 3) return curve;

  const r = JSON.parse(JSON.stringify(curve)) as EQCurve;

  const regions: Array<{ band: 'p0' | 'p1' | 'p2' | 'p3'; minHz: number; maxHz: number; targetDb: number }> = [
    { band: 'p0', minHz: 200,  maxHz: 600,   targetDb: -3 },
    { band: 'p2', minHz: 600,  maxHz: 1800,  targetDb:  0 },
    { band: 'p1', minHz: 1800, maxHz: 6000,  targetDb:  0 },
    { band: 'p3', minHz: 6000, maxHz: 18000, targetDb:  2 },
  ];

  for (const region of regions) {
    const inRegion = peaks.filter(([f]) => f >= region.minHz && f < region.maxHz);
    if (inRegion.length === 0) continue;
    const avgDb   = inRegion.reduce((s, [, m]) => s + m, 0) / inRegion.length;
    const deviation = avgDb - region.targetDb;
    if (Math.abs(deviation) < 3) continue;

    const correction = Math.max(-2, Math.min(2, -deviation * 0.5));
    const centerHz   = inRegion.reduce((s, [f]) => s + f, 0) / inRegion.length;
    const b = region.band;

    if (!r[b].enabled) {
      r[b].enabled = true;
      r[b].gain    = correction;
      r[b].freq    = centerHz;
      r[b].bw      = 1.2;
    } else {
      r[b].gain = (r[b].gain ?? 0) + correction;
    }
    r[b].gain = Math.max(-6, Math.min(6, r[b].gain ?? 0));
  }

  return r;
}

// ── Strength scaling ─────────────────────────────────────────────────────────

function scaleToStrength(curve: EQCurve, strength: number): EQCurve {
  const s = Math.max(0, Math.min(1, strength));
  return {
    hp:  { ...curve.hp },
    ls:  { ...curve.ls,  gain: (curve.ls.gain  ?? 0) * s },
    p0:  { ...curve.p0,  gain: (curve.p0.gain  ?? 0) * s },
    p1:  { ...curve.p1,  gain: (curve.p1.gain  ?? 0) * s },
    p2:  { ...curve.p2,  gain: (curve.p2.gain  ?? 0) * s },
    p3:  { ...curve.p3,  gain: (curve.p3.gain  ?? 0) * s },
    hs:  { ...curve.hs,  gain: (curve.hs.gain  ?? 0) * s },
  };
}

function curveToFil4Params(c: EQCurve): Partial<Fil4Params> {
  return {
    hp: { enabled: c.hp.enabled, freq: c.hp.freq, q: c.hp.q },
    ls: { enabled: c.ls.enabled, freq: c.ls.freq, gain: c.ls.gain ?? 0, q: c.ls.q ?? 0.8 },
    hs: { enabled: c.hs.enabled, freq: c.hs.freq, gain: c.hs.gain ?? 0, q: c.hs.q ?? 0.8 },
    p:  [
      { enabled: c.p0.enabled, freq: c.p0.freq, bw: c.p0.bw ?? 1.2, gain: c.p0.gain ?? 0 },
      { enabled: c.p1.enabled, freq: c.p1.freq, bw: c.p1.bw ?? 1.5, gain: c.p1.gain ?? 0 },
      { enabled: c.p2.enabled, freq: c.p2.freq, bw: c.p2.bw ?? 1.0, gain: c.p2.gain ?? 0 },
      { enabled: c.p3.enabled, freq: c.p3.freq, bw: c.p3.bw ?? 2.0, gain: c.p3.gain ?? 0 },
    ],
  };
}

// ── Lo-fi detection ──────────────────────────────────────────────────────────

const LOFI_MODES = new Set([
  'c64sid','sidfactory2','cheesecutter','goattracker','hively','klys','sc68','uade',
  'NSF','SID','SAP','VGM','YM','S98','furnace',
]);

const LOFI_SYNTHS = new Set([
  'C64SID','GTUltraSynth','SF2Synth','HivelySynth','KlysSynth',
  'ChipSynth','SidMonSynth','SidMon1Synth','FCSynth','FredSynth',
  'TFMXSynth','Furnace','ChiptuneModule','HippelCoSoSynth',
  'SoundMonSynth','DigMugSynth','DeltaMusic1Synth','DeltaMusic2Synth',
  'SonicArrangerSynth','JamCrackerSynth','PreTrackerSynth','FuturePlayerSynth','OctaMEDSynth',
]);

export function detectLoFiSources(
  editorMode: string,
  instruments: Array<{ synthType?: string }>,
): boolean {
  if (LOFI_MODES.has(editorMode)) return true;
  return instruments.some(i => i.synthType && LOFI_SYNTHS.has(i.synthType));
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface AutoEQResult {
  params: Partial<Fil4Params>;
  genre: string;
}

export function computeAutoEQ(
  analysis: FullAnalysisResult,
  hints: InstrumentHints,
  strength: number,
): AutoEQResult {
  const baseline   = computeGenreBaseline(
    analysis.genre.primary ?? 'Unknown',
    analysis.genre.energy ?? 0.5,
    analysis.genre.danceability ?? 0.5,
  );
  const instDeltas = computeInstrumentModulation(hints);
  const afterInst  = applyInstDeltas(baseline, instDeltas);
  const afterSpec  = computeSpectralCompensation(analysis.frequencyPeaks ?? [], afterInst);
  const scaled     = scaleToStrength(afterSpec, strength);

  return {
    params: curveToFil4Params(scaled),
    genre:  analysis.genre.primary || 'Unknown',
  };
}
