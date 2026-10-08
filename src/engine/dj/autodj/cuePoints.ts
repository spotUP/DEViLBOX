/**
 * Semantic cue points (plan section 7) and musical mix-point scoring (plan
 * section 46): where a track becomes useful to a DJ, not where it starts.
 *
 * Pure functions over sections, phrases, events and the bar features.
 */
import type { ArrangementEvent, DJCuePoints, DJPhrase, DJSection, GridLandmarks } from './types';
import type { BarFeatures } from './structure';

export interface MixPointScore {
  time: number;
  bar: number;
  score: number;
  reasons: string[];
}

export interface ActivityRefs { drums: number; bass: number; vocal: number }

/** Thresholds relative to the track: half of its own 90th percentile, never below 0.1. */
export function activityRefs(features: BarFeatures[]): ActivityRefs {
  const p90 = (key: 'drums' | 'bass' | 'vocal') => {
    const sorted = features.map((f) => f[key]).sort((a, b) => a - b);
    return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))] : 0;
  };
  return { drums: Math.max(0.1, 0.5 * p90('drums')), bass: Math.max(0.1, 0.5 * p90('bass')), vocal: Math.max(0.15, 0.5 * p90('vocal')) };
}

function activeFrom(features: BarFeatures[], bar: number, bars: number, key: 'drums' | 'bass' | 'vocal', threshold: number): number {
  let n = 0, hit = 0;
  for (let b = bar; b < Math.min(features.length, bar + bars); b++) { n++; if (features[b][key] >= threshold) hit++; }
  return n ? hit / n : 0;
}

function stability(features: BarFeatures[], bar: number, bars: number): number {
  let d = 0, n = 0;
  for (let b = bar + 1; b < Math.min(features.length, bar + bars); b++) {
    d += Math.abs(features[b].intensity - features[b - 1].intensity); n++;
  }
  return n ? Math.max(0, 1 - (d / n) * 5) : 1;
}

/**
 * Score a candidate mix-in bar (plan section 46): phrase begins, drums enter,
 * bass enters, vocals absent, harmonic density compatible (moderate),
 * arrangement stable. Technically possible (any bar) is not enough.
 */
export function scoreMixIn(features: BarFeatures[], phrases: DJPhrase[], bar: number, windowBars: number, refs: ActivityRefs = activityRefs(features)): MixPointScore {
  const reasons: string[] = [];
  let score = 0;
  const f = features[bar];
  if (!f) return { time: 0, bar, score: -1, reasons: ['no bar'] };
  const phraseStart = phrases.some((p) => p.startBar === bar);
  if (phraseStart) { score += 0.3; reasons.push('phrase begins'); }
  const drums = activeFrom(features, bar, windowBars, 'drums', refs.drums);
  if (drums > 0.75) { score += 0.25; reasons.push('drums present'); }
  const prevDrums = bar > 0 ? features[bar - 1].drums : 0;
  if (prevDrums < refs.drums && f.drums >= refs.drums) { score += 0.1; reasons.push('drums enter'); }
  const prevBass = bar > 0 ? features[bar - 1].bass : 0;
  if (prevBass < refs.bass && f.bass >= refs.bass) { score += 0.1; reasons.push('bass enters'); }
  const vocal = activeFrom(features, bar, windowBars, 'vocal', refs.vocal);
  if (vocal < 0.25) { score += 0.2; reasons.push('vocals absent'); } else { score -= 0.2 * vocal; reasons.push('vocals present'); }
  if (f.harmonic > 0.15 && f.harmonic < 0.8) { score += 0.05; reasons.push('harmonic density moderate'); }
  const stab = stability(features, bar, windowBars);
  score += 0.1 * stab;
  if (stab > 0.7) reasons.push('arrangement stable');
  return { time: f.start, bar, score, reasons };
}

/** Score a candidate mix-out bar: the outgoing phrase ends there, no vocals follow, drums keep going. */
export function scoreMixOut(features: BarFeatures[], phrases: DJPhrase[], bar: number, windowBars: number, outroStartBar: number | null, refs: ActivityRefs = activityRefs(features)): MixPointScore {
  const reasons: string[] = [];
  let score = 0;
  const f = features[bar];
  if (!f) return { time: 0, bar, score: -1, reasons: ['no bar'] };
  if (phrases.some((p) => p.startBar === bar)) { score += 0.3; reasons.push('outgoing phrase ends'); }
  const vocal = activeFrom(features, bar, windowBars, 'vocal', refs.vocal);
  if (vocal < 0.25) { score += 0.25; reasons.push('vocals absent'); } else { score -= 0.25 * vocal; reasons.push('vocals present'); }
  const drums = activeFrom(features, bar, windowBars, 'drums', refs.drums);
  if (drums > 0.5) { score += 0.2; reasons.push('drums keep the beat'); }
  const stab = stability(features, bar, windowBars);
  score += 0.15 * stab;
  if (stab > 0.7) reasons.push('arrangement stable');
  if (outroStartBar !== null && bar <= outroStartBar) { score += 0.1; reasons.push('before the outro'); }
  return { time: f.start, bar, score, reasons };
}

export interface CuePointInput {
  features: BarFeatures[];
  sections: DJSection[];
  phrases: DJPhrase[];
  events: ArrangementEvent[];
  landmarks: GridLandmarks;
  durationSec: number;
  phraseLengthBars: number;
}

export function deriveCuePoints(input: CuePointInput): { cuePoints: DJCuePoints; confidence: number; mixIn: MixPointScore[]; mixOut: MixPointScore[] } {
  const { features, sections, phrases, events, landmarks, durationSec, phraseLengthBars } = input;
  const cue: DJCuePoints = {};
  if (features.length === 0) {
    cue.firstBeat = landmarks.firstMusicalBeat;
    cue.bestMixIn = landmarks.firstUsableMixPoint;
    cue.bestMixOut = Math.max(0, durationSec - 30);
    cue.finalBeat = durationSec;
    return { cuePoints: cue, confidence: 0.1, mixIn: [], mixOut: [] };
  }
  const refs = activityRefs(features);
  const first = (kind: ArrangementEvent['kind']) => events.find((e) => e.kind === kind);
  const firstSection = (kind: DJSection['kind']) => sections.find((s) => s.kind === kind);

  const firstNonSilent = features.find((f) => f.loudnessDb >= -60);
  cue.introStart = firstNonSilent ? firstNonSilent.start : 0;
  cue.firstBeat = landmarks.firstMusicalBeat;
  const drumsIn = first('drums-in');
  cue.firstDrums = drumsIn ? drumsIn.time : landmarks.firstUsableMixPoint;
  const bassIn = first('bass-in');
  if (bassIn) cue.firstBass = bassIn.time;
  const vocalIn = first('vocal-in');
  if (vocalIn) cue.firstVocal = vocalIn.time;

  // First full groove: the first phrase start where drums and bass both hold for a phrase.
  for (const p of phrases) {
    if (activeFrom(features, p.startBar, phraseLengthBars, 'drums', refs.drums) > 0.9 && activeFrom(features, p.startBar, phraseLengthBars, 'bass', refs.bass) > 0.75) {
      cue.firstFullGroove = p.start; break;
    }
  }
  const drop = firstSection('drop');
  if (drop) cue.firstDrop = drop.start;
  const brk = firstSection('breakdown');
  if (brk) cue.firstBreak = brk.start;
  const chorus = firstSection('chorus');
  if (chorus) cue.firstHook = chorus.start;
  else if (drop) cue.firstHook = drop.start;
  else {
    // Loudest repeated phrase.
    let best: DJPhrase | null = null;
    for (const p of phrases) {
      const e = features[p.startBar]?.intensity ?? 0;
      if (!best || e > (features[best.startBar]?.intensity ?? 0)) best = p;
    }
    if (best && best.startBar > 0) cue.firstHook = best.start;
  }

  const outro = [...sections].reverse().find((s) => s.kind === 'outro');
  const lastEnergyDown = [...events].reverse().find((e) => e.kind === 'energy-down');
  if (outro) cue.outroStart = outro.start;
  else if (lastEnergyDown && lastEnergyDown.time > durationSec * 0.6) cue.outroStart = lastEnergyDown.time;
  const outroStartBar = cue.outroStart !== undefined ? (features.findIndex((f) => f.start >= cue.outroStart!) >>> 0) : null;

  // Outro groove: the last phrase start with drums still going.
  for (let i = phrases.length - 1; i >= 0; i--) {
    const p = phrases[i];
    if (activeFrom(features, p.startBar, Math.min(phraseLengthBars, 4), 'drums', refs.drums) > 0.75) { cue.outroGroove = p.start; break; }
  }
  const lastAudible = [...features].reverse().find((f) => f.intensity > 0.1 && f.loudnessDb > -60);
  cue.finalBeat = lastAudible ? lastAudible.end : durationSec;

  // Best mix-in: phrase starts in the first 40 % of the track, earliest among the best.
  const inLimit = Math.max(1, Math.floor(features.length * 0.4));
  const mixIn = phrases.filter((p) => p.startBar < inLimit).map((p) => scoreMixIn(features, phrases, p.startBar, phraseLengthBars, refs));
  if (mixIn.length) {
    const top = Math.max(...mixIn.map((m) => m.score));
    const pick = mixIn.find((m) => m.score >= top - 0.05)!;
    cue.bestMixIn = pick.time;
  } else {
    cue.bestMixIn = landmarks.firstUsableMixPoint;
  }
  // Best mix-out: phrase starts in the last 40 %, before the final beat minus a phrase.
  const outStart = Math.floor(features.length * 0.6);
  const mixOut = phrases
    .filter((p) => p.startBar >= outStart && p.end <= (cue.finalBeat ?? durationSec))
    .map((p) => scoreMixOut(features, phrases, p.startBar, phraseLengthBars, outroStartBar, refs));
  if (mixOut.length) {
    let pick = mixOut[0];
    for (const m of mixOut) if (m.score > pick.score + 0.05) pick = m;
    cue.bestMixOut = pick.time;
  } else {
    cue.bestMixOut = Math.max(0, (cue.finalBeat ?? durationSec) - 8 * (features[0].end - features[0].start));
  }

  const sectionConf = sections.length ? sections.reduce((a, s) => a + s.confidence, 0) / sections.length : 0.3;
  const confidence = Math.min(1, 0.4 + 0.4 * sectionConf + (phrases.length ? 0.2 * phrases[0].confidence : 0));
  return { cuePoints: cue, confidence, mixIn, mixOut };
}
