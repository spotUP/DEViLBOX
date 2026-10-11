/**
 * The shapes of a transition's automation (Auto DJ plan sections 17-21; owner
 * juggling plan sections 14, 35, 42): crossfader laws, the high-pass rise and
 * the bass handover, as keyframe curves, and the one sampler that reads them.
 * The planner puts them in a plan, the executor plays them, and the legacy
 * transitions (DJQuantizedFX, used when no plan can be made) play the same
 * shapes - one law for a crossfade, a filter rise or a bass swap, whichever
 * path performs it.
 *
 * Pure.
 */
import type { AutomationCurve, CrossfadePlan, FilterPlan, TransitionStyle } from './types';

export const curve = (target: AutomationCurve['target'], keyframes: AutomationCurve['keyframes']): AutomationCurve => ({ target, keyframes });

/** A step from `from` to `to` on beat `at` (a kill switch): `from` until a hair before, `to` from there. */
export function stepCurve(target: AutomationCurve['target'], from: number, to: number, at: number): AutomationCurve {
  return at <= 0 ? curve(target, [{ beat: 0, value: to }]) : curve(target, [{ beat: 0, value: from }, { beat: Math.max(0, at - 0.01), value: from }, { beat: at, value: to }]);
}

/** Linear/ease/exp keyframe interpolation (the executor, the quality score and the legacy sweeps use the same function). */
export function sampleCurve(keyframes: Array<{ beat: number; value: number; curve?: 'linear' | 'ease' | 'exp' }>, beat: number): number {
  if (keyframes.length === 0) return 0;
  if (beat <= keyframes[0].beat) return keyframes[0].value;
  for (let i = 1; i < keyframes.length; i++) {
    const a = keyframes[i - 1], b = keyframes[i];
    if (beat <= b.beat) {
      const span = b.beat - a.beat;
      let t = span > 0 ? (beat - a.beat) / span : 1;
      if (b.curve === 'ease') t = t * t * (3 - 2 * t);
      else if (b.curve === 'exp') t = t * t;
      return a.value + (b.value - a.value) * t;
    }
  }
  return keyframes[keyframes.length - 1].value;
}

export function crossfadeFor(style: TransitionStyle, beats: number, toward: 0 | 1): CrossfadePlan {
  const from = toward === 1 ? 0 : 1;
  const to = toward;
  // A juggle transition's ladder has already traded onto the incoming when the release starts: the release lands as a cut.
  if (style === 'hardCut' || style === 'juggleTransition') return { curve: curve('crossfader', [{ beat: 0, value: from }, { beat: 0.01, value: to }]), lengthBeats: 0, law: 'cut' };
  if (style === 'echoOut' || style === 'reverbOut') {
    // The dry outgoing decays through the FX action; the tail returns before
    // the crossfader, so the fader rests at the centre for the tail length
    // (both decks at -3 dB) and completes in the last bar.
    const mid = from + (to - from) * 0.5;
    const tail = Math.max(2, beats - Math.min(4, beats));
    return { curve: curve('crossfader', [{ beat: 0, value: from }, { beat: Math.min(2, beats), value: mid, curve: 'ease' }, { beat: tail, value: mid }, { beat: beats, value: to, curve: 'ease' }]), lengthBeats: beats, law: 'equal-power' };
  }
  if (style === 'dropMix') {
    // Hold the outgoing until the last bar, then swing across so the drop owns the floor.
    return { curve: curve('crossfader', [{ beat: 0, value: from }, { beat: Math.max(0, beats - 4), value: from + (to - from) * 0.4, curve: 'ease' }, { beat: beats, value: to, curve: 'ease' }]), lengthBeats: beats, law: 'equal-power' };
  }
  return { curve: curve('crossfader', [{ beat: 0, value: from }, { beat: beats, value: to, curve: 'ease' }]), lengthBeats: beats, law: 'equal-power' };
}

export function filterFor(style: TransitionStyle, beats: number, withFilter: boolean, resonanceBase: number): FilterPlan {
  const none: FilterPlan = { kind: 'none', curves: [], resonance: resonanceBase };
  switch (style) {
    case 'filterBuild':
      return { kind: 'resonant-build', resonance: Math.max(resonanceBase, 2.5), curves: [
        curve('incoming.filter', [{ beat: 0, value: -0.8 }, { beat: beats, value: 0, curve: 'ease' }]),
        curve('outgoing.filter', [{ beat: 0, value: 0 }, { beat: beats * 0.75, value: -0.7, curve: 'ease' }, { beat: beats, value: -0.95, curve: 'ease' }]),
      ] };
    case 'filterRelease':
      return { kind: 'release', resonance: resonanceBase, curves: [
        curve('outgoing.filter', [{ beat: 0, value: 0 }, { beat: beats * 0.6, value: -0.55, curve: 'ease' }, { beat: beats, value: -0.95, curve: 'ease' }]),
        curve('incoming.filter', [{ beat: 0, value: 0.3 }, { beat: beats * 0.5, value: 0, curve: 'ease' }]),
      ] };
    case 'EQSwap':
      return { kind: 'filter-eq', resonance: resonanceBase, curves: [
        curve('outgoing.filter', [{ beat: 0, value: 0 }, { beat: beats, value: -0.6, curve: 'ease' }]),
      ] };
    case 'breakdownMix':
      return { kind: 'low-pass-sweep', resonance: resonanceBase, curves: [
        curve('incoming.filter', [{ beat: 0, value: 0.5 }, { beat: beats, value: 0, curve: 'ease' }]),
      ] };
    case 'hardCut': case 'echoOut': case 'reverbOut': case 'delayThrow': case 'juggleTransition':
      return none;
    default:
      if (!withFilter) return none;
      // Continuous high-pass on the outgoing, phrase-aware: most of the rise in the last phrase.
      return { kind: 'high-pass-sweep', resonance: resonanceBase, curves: [
        curve('outgoing.filter', [{ beat: 0, value: 0 }, { beat: beats * 0.5, value: -0.25, curve: 'ease' }, { beat: beats * 0.85, value: -0.6, curve: 'ease' }, { beat: beats, value: -0.9, curve: 'ease' }]),
      ] };
  }
}
