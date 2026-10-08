/**
 * Musical material selection for juggling (juggling plan sections 11-14, 36,
 * 37, 38): what each deck can contribute in a window, classified from the
 * analysis timelines and, for modules, the tracker's own events and the Dub
 * Deck's time-varying channel roles. Call and response: a window that
 * answers another without vocal collision or bass stacking.
 *
 * Pure.
 */
import { timelineAt, barIndexAt } from '../beatGrid';
import type { DJTrackAnalysis, TrackerMixEvent } from '../types';
import type { MaterialClass, MaterialWindow } from './juggleTypes';

function act(values: number[], hopSec: number, from: number, to: number): number {
  const v: number[] = [];
  for (let t = from; t < to; t += hopSec) v.push(timelineAt(values, hopSec, t));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
}

function peak(values: number[], hopSec: number, from: number, to: number): number {
  let m = 0;
  for (let t = from; t < to; t += hopSec) m = Math.max(m, timelineAt(values, hopSec, t));
  return m;
}

function p90(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * 0.9))];
}

/** Below this p90 the vocal proxy is noise, not a voice. */
export const VOCAL_REF_FLOOR = 0.35;

export interface MaterialRefs { drums: number; bass: number; vocal: number; harmonic: number; intensity: number }

export function materialRefs(a: DJTrackAnalysis): MaterialRefs {
  return {
    drums: Math.max(0.1, p90(a.drumActivity.values)), bass: Math.max(0.1, p90(a.bassActivity.values)),
    // The vocal proxy needs an absolute floor: a track without vocals has a p90 of noise (0.06 on a plain groove,
    // 0.63 on a track with vocals), and a relative reading would call every pad a voice.
    vocal: Math.max(VOCAL_REF_FLOOR, p90(a.vocalActivity.values)), harmonic: Math.max(0.1, p90(a.harmonicActivity.values)),
    intensity: Math.max(0.1, p90(a.intensity.values)),
  };
}

/** Tracker events inside the window, from the module's own structure. */
function trackerEventsIn(a: DJTrackAnalysis, from: number, to: number): TrackerMixEvent[] {
  return a.tracker ? a.tracker.events.filter((e) => e.time >= from && e.time < to) : [];
}

/** Which Dub Deck channel roles are active in the window (time-varying segments). */
function trackerRolesIn(a: DJTrackAnalysis, from: number, to: number): Set<string> {
  const roles = new Set<string>();
  if (!a.tracker) return roles;
  for (const seg of a.tracker.channelSegments) {
    if (seg.end <= from || seg.start >= to) continue;
    if (seg.musicalFunction && seg.musicalFunction !== 'silence' && seg.density > 0.05) roles.add(seg.musicalFunction);
  }
  return roles;
}

/** Classify a window of `bars` bars starting at `startSec`. */
export function classifyWindow(a: DJTrackAnalysis, deck: 'A' | 'B', startSec: number, bars: number, refs: MaterialRefs = materialRefs(a)): MaterialWindow {
  const beatSec = 60 / Math.max(60, a.bpm);
  const barSec = beatSec * (a.meter.beatsPerBar || 4);
  const endSec = Math.min(a.durationSec, startSec + bars * barSec);
  const hop = a.drumActivity.hopSec || 0.25;
  const drums = act(a.drumActivity.values, hop, startSec, endSec) / refs.drums;
  const bass = act(a.bassActivity.values, hop, startSec, endSec) / refs.bass;
  const vocal = act(a.vocalActivity.values, hop, startSec, endSec) / refs.vocal;
  const harmonic = act(a.harmonicActivity.values, hop, startSec, endSec) / refs.harmonic;
  const energy = act(a.intensity.values, hop, startSec, endSec) / refs.intensity;
  const drumPeak = peak(a.drumActivity.values, hop, startSec, endSec) / refs.drums;
  const section = a.sections.find((s) => s.start <= startSec && startSec < s.end);
  const events = trackerEventsIn(a, startSec, endSec);
  const roles = trackerRolesIn(a, startSec, endSec);
  const hasTracker = !!a.tracker && a.tracker.confidence > 0;
  const classes: MaterialClass[] = [];
  const reasons: string[] = [];
  const vocalConf = a.vocalActivity.confidence;

  if (energy < 0.05 || (section?.kind === 'silence')) { classes.push('SILENCE'); reasons.push('silent'); }
  if (section?.kind === 'drop' && Math.abs(section.start - startSec) < barSec) { classes.push('DROP'); reasons.push('section drop'); }
  if (events.some((e) => e.kind === 'DROP')) { classes.push('DROP'); reasons.push('tracker DROP'); }
  if (section?.kind === 'build' || section?.kind === 'pre-drop') { classes.push('BUILD'); reasons.push(`section ${section.kind}`); }
  if (section?.kind === 'breakdown' || events.some((e) => e.kind === 'BREAK') || (drums < 0.3 && harmonic > 0.4)) { classes.push('BREAK'); reasons.push(events.some((e) => e.kind === 'BREAK') ? 'tracker BREAK' : 'drums out, harmony on'); }
  if (events.some((e) => e.kind === 'FILL') || (drumPeak > 1.1 && drums > 0.6 && harmonic < 0.5)) { classes.push('DRUM_FILL'); reasons.push(events.some((e) => e.kind === 'FILL') ? 'tracker FILL' : 'drum peak'); }
  if ((bass > 0.6 && drums < 0.45) || (roles.has('bass') && !roles.has('rhythm'))) { classes.push('BASS_HIT'); reasons.push(roles.has('bass') ? 'tracker bass channel without drums' : 'bass without drums'); }
  if (vocalConf > 0 && vocal > 0.6) { classes.push('VOCAL_HIT'); reasons.push('vocal present'); }
  if (harmonic > 0.6 && vocal < 0.4 && drums < 0.5 && (!hasTracker || roles.has('melody') || roles.has('harmony'))) { classes.push('LEAD_HIT'); reasons.push(roles.has('melody') ? 'tracker melody channel' : 'melodic material'); }
  if (drums > 0.45 && bass < 0.4 && harmonic < 0.4) { classes.push('PERCUSSION_HIT'); reasons.push('percussion only'); }
  if (drums > 0.55 && bass > 0.5 && (harmonic > 0.3 || roles.has('harmony') || roles.has('melody'))) { classes.push('FULL_GROOVE'); reasons.push('full groove'); }
  if (classes.length === 0) { classes.push(drums > 0.45 ? 'PERCUSSION_HIT' : harmonic > 0.3 ? 'LEAD_HIT' : 'SILENCE'); reasons.push('by dominant band'); }

  const order: MaterialClass[] = ['SILENCE', 'DROP', 'DRUM_FILL', 'BREAK', 'BUILD', 'VOCAL_HIT', 'BASS_HIT', 'LEAD_HIT', 'FULL_GROOVE', 'PERCUSSION_HIT'];
  const primary = order.find((c) => classes.includes(c)) ?? classes[0];
  const importance = Math.min(1, 0.4 * energy + 0.3 * drums + 0.2 * bass + 0.1 * vocal) * (events.length ? 1.1 : 1);
  const confidence = Math.min(1, 0.5 * a.analysisConfidence.beatGrid + 0.3 * (section?.confidence ?? 0.4) + 0.2 * (hasTracker ? a.tracker!.confidence : vocalConf > 0 ? 0.6 : 0.4));
  return {
    deck, startSec, endSec, startBar: barIndexAt(a.downbeats, startSec), bars,
    drums: Math.min(1.5, drums), bass: Math.min(1.5, bass), percussionDensity: Math.min(1.5, drumPeak), melodic: Math.min(1.5, harmonic),
    vocal: Math.min(1.5, vocal), harmonic: Math.min(1.5, harmonic), spectralDensity: Math.min(1.5, (drums + bass + harmonic + vocal) / 4),
    energy: Math.min(1.5, energy), rhythmicDensity: a.rhythmic.onsetsPerBeat / 4, importance, confidence, classes, primary,
    source: events.length || roles.size ? 'tracker' : 'audio', reason: reasons.join(', '),
  };
}

/** The windows of `bars` bars from the next phrase start on, up to `count` of them. */
export function upcomingWindows(a: DJTrackAnalysis, deck: 'A' | 'B', fromSec: number, bars: number, count: number): MaterialWindow[] {
  const refs = materialRefs(a);
  const beatSec = 60 / Math.max(60, a.bpm);
  const barSec = beatSec * (a.meter.beatsPerBar || 4);
  const starts: number[] = [];
  const phraseStarts = a.phrases.filter((p) => p.start >= fromSec - 1e-6).map((p) => p.start);
  const barStarts = a.downbeats.bars.filter((b) => b.start >= fromSec - 1e-6).map((b) => b.start);
  const base = phraseStarts.length ? phraseStarts : barStarts;
  for (const s of base) { if (starts.length >= count) break; if (s + bars * barSec <= a.durationSec + 0.5) starts.push(s); }
  if (starts.length === 0 && fromSec + bars * barSec <= a.durationSec) starts.push(fromSec);
  return starts.map((s) => classifyWindow(a, deck, s, bars, refs));
}

/** What answers what: a response class per call class, vocal-safe and bass-safe. */
export const RESPONSE_FOR: Record<MaterialClass, MaterialClass[]> = {
  DRUM_FILL: ['BASS_HIT', 'LEAD_HIT', 'VOCAL_HIT', 'PERCUSSION_HIT', 'FULL_GROOVE', 'BREAK'],
  BASS_HIT: ['DRUM_FILL', 'PERCUSSION_HIT', 'LEAD_HIT', 'VOCAL_HIT', 'BREAK'],
  VOCAL_HIT: ['PERCUSSION_HIT', 'DRUM_FILL', 'LEAD_HIT', 'BASS_HIT', 'BREAK', 'FULL_GROOVE', 'BUILD'],
  LEAD_HIT: ['DRUM_FILL', 'BASS_HIT', 'PERCUSSION_HIT', 'VOCAL_HIT', 'FULL_GROOVE'],
  PERCUSSION_HIT: ['BASS_HIT', 'LEAD_HIT', 'VOCAL_HIT', 'FULL_GROOVE', 'BREAK'],
  FULL_GROOVE: ['DRUM_FILL', 'BREAK', 'PERCUSSION_HIT', 'LEAD_HIT', 'BASS_HIT', 'VOCAL_HIT', 'BUILD'],
  BREAK: ['DRUM_FILL', 'FULL_GROOVE', 'DROP', 'PERCUSSION_HIT', 'BASS_HIT'],
  DROP: ['BREAK', 'PERCUSSION_HIT', 'DRUM_FILL', 'BUILD'],
  BUILD: ['DROP', 'FULL_GROOVE', 'DRUM_FILL'],
  SILENCE: ['FULL_GROOVE', 'DRUM_FILL', 'DROP'],
};

export interface ResponseChoice { call: MaterialWindow; response: MaterialWindow; reason: string; score: number }

/**
 * Find the best call/response pair: the call from the voice deck's upcoming
 * windows, the response from the other deck's, complementary classes, no
 * vocal against vocal, no two bass hits, tracker evidence preferred.
 */
export function findCallAndResponse(voice: DJTrackAnalysis, voiceDeck: 'A' | 'B', voiceFrom: number, responder: DJTrackAnalysis, responderDeck: 'A' | 'B', responderFrom: number, bars: number): ResponseChoice | null {
  const calls = upcomingWindows(voice, voiceDeck, voiceFrom, bars, 6);
  const answers = upcomingWindows(responder, responderDeck, responderFrom, bars, 10);
  let best: ResponseChoice | null = null;
  for (const call of calls) {
    if (call.primary === 'SILENCE') continue;
    for (const ans of answers) {
      if (ans.primary === 'SILENCE') continue;
      const wanted = RESPONSE_FOR[call.primary];
      const matchIdx = ans.classes.findIndex((c) => wanted.includes(c));
      if (matchIdx < 0) continue;
      // Vocal safety and bass safety (juggling plan sections 35, 36).
      if (call.classes.includes('VOCAL_HIT') && ans.classes.includes('VOCAL_HIT')) continue;
      if (call.classes.includes('BASS_HIT') && ans.classes.includes('BASS_HIT')) continue;
      let score = 1 - matchIdx * 0.15 + 0.2 * call.importance + 0.2 * ans.importance + 0.2 * Math.min(call.confidence, ans.confidence);
      if (call.source === 'tracker') score += 0.15;
      if (ans.source === 'tracker') score += 0.15;
      if (!best || score > best.score) {
        best = { call, response: ans, score, reason: `${voiceDeck} ${call.primary.toLowerCase().replace('_', ' ')} (${call.reason}) answered by ${responderDeck} ${ans.classes[matchIdx].toLowerCase().replace('_', ' ')} (${ans.reason})` };
      }
    }
  }
  return best;
}
