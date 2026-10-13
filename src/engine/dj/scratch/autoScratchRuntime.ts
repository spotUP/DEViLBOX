/**
 * Auto Scratch on the real decks (owner plan `thoughts/shared/plans/2026-10-08-dj-view-scratch-plan.md`
 * sections 4, 44, 60, 81; ledger SCR-P7.6-P7.8): the one place that builds a `ScratchExecutor`
 * on a live deck - the deck's beat clock, the audio context's time, the DJ FX registry as the
 * one action path, the deck / mixer state probe, the deck's true re-cue - and that performs a
 * transition's scratch plan with its FX request. `DJAutoDJ` uses it; the creative modules never
 * touch the engine.
 */

import * as Tone from 'tone';
import { fireDjFx, releaseDjFx, type DjFxActionId } from '@/engine/drumpad/DjFxActions';
import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine } from '../DJEngine';
import { setCrossfader } from '../DJActions';
import { pitchedBpm } from '../DJAutoSync';
import { analysisClock } from '../autodj/juggle/juggleController';
import { realTimers } from '../autodj/executorTimers';
import type { DJTrackAnalysis } from '../autodj/types';
import { ScratchExecutor, type ScratchExecutorEvent } from './ScratchExecutor';
import { createScratchStateProbe } from './scratchSnapshot';
import { getScratchVoicePool, getScratchVoicePoolIfActive } from './scratchVoicePool';
import { loadTrackerSample, type TrackerSampleInstrument } from './trackerSampleSource';
import type { ChosenScratchSource, ScratchRoutineShape } from './DJScratchDJ';
import { routineShapeDecks } from './scratchDeckC';
import { computeCrossfaderGains } from '../DJMixerEngine';
import { getCachedAudioByFilename } from '../DJAudioCache';
import { loadScratchPhrase, type ScratchPhrase } from './scratchPhrase';
import type { TransitionScratchPlan } from './transitionScratch';
import type { ScratchEvent } from './scratchTypes';

type AB = 'A' | 'B';

/** Reachability sentinels (SCR-P7.6 / P7.R8). */
export const autoScratchRuntimeStats = { transitionScratches: 0, fxRequests: 0, moduleRenders: 0 };

/**
 * The tempo a deck plays `analysis` at: the analysis' own tempo (the one deck tempo, written by
 * `applyAnalysisToDeck`) at the deck's pitch. Never the store's `effectiveBPM` on its own: seven UI
 * loaders still write that from the audio detector (184.57 for a 93.75 module), and a clock at the
 * wrong tempo lands every scratch late or early by a growing margin (SCR-PHRASING-PARITY D9).
 */
export function deckTempoBpm(deck: AB, analysis: Pick<DJTrackAnalysis, 'bpm'>): number {
  return pitchedBpm(analysis.bpm, useDJStore.getState().decks[deck].pitchOffset || 0);
}

/** The executor on a live deck: its grid (`analysisClock` at the deck's tempo, `deckTempoBpm`) and the registry. */
export function createDeckScratchExecutor(deck: AB, analysis: DJTrackAnalysis, onEvent?: (e: ScratchExecutorEvent) => void, onError?: (err: unknown) => void): ScratchExecutor {
  const engine = getDJEngine();
  const position = (): number => { try { return engine.getDeck(deck).audioPlayer.getPosition(); } catch { return useDJStore.getState().decks[deck].audioPosition; } };
  return new ScratchExecutor({
    clock: analysisClock(analysis, position, () => deckTempoBpm(deck, analysis)),
    contextTime: () => (Tone.getContext().rawContext as BaseAudioContext).currentTime,
    fire: (id, opts) => fireDjFx(id, opts),
    release: (id, opts) => releaseDjFx(id, opts),
    probe: createScratchStateProbe(engine.getDeck(deck), { getCrossfader: () => useDJStore.getState().crossfaderPosition, setCrossfader }, null),
    recueDeck: (d, anchorSec) => engine.getDeck(d).recueScratch(anchorSec),
    timers: realTimers,
    onEvent,
    onError,
  });
}

/** Section 59 / P8.8: an engine error mid-scratch - every voice stopped now (the executor already released and restored its run). */
export function emergencyRelease(): void {
  try { getScratchVoicePoolIfActive()?.releaseAll(); } catch { /* the DJ goes on */ }
}

/** Get a chosen source ready: a tracker deck's sample is decoded into the voice pool (P5.6). */
export async function prepareScratchSource(chosen: ChosenScratchSource): Promise<void> {
  if (chosen.source.type !== 'TRACKER_SAMPLE') return;
  const { deck, sampleId } = chosen.source;
  const song = getDJEngine().getDeck(deck).replayer.getSong() as { instruments?: TrackerSampleInstrument[] } | null;
  const instrument = song?.instruments?.find((i) => String(i.id) === sampleId);
  if (!instrument) return;
  const pool = getScratchVoicePool();
  await loadTrackerSample(pool, Tone.getContext().rawContext as BaseAudioContext, deck, instrument);
}

/** Section 44: the FX a transition scratch asks for, through the registry (never the Dub engine directly). */
export function fxRequestAction(request: TransitionScratchPlan['fxRequest']): DjFxActionId | null {
  if (request === 'dubbed') return 'fx_dub_echo';
  if (request === 'transition') return 'fx_deck_echo_throw';
  return null;
}

export interface TransitionScratchHandle {
  done: Promise<{ completed: boolean; reason?: string }>;
  cancel(): void;
}

/**
 * Perform a transition's scratch (D8): schedule its events on an executor on the outgoing
 * deck's clock, fire its FX request once, resolve when every event has been released (or on
 * cancel, which gives back what the run touched).
 */
export function performTransitionScratch(
  scratch: TransitionScratchPlan,
  deck: AB,
  analysis: DJTrackAnalysis,
  deps: { executorFor?: (deck: AB, analysis: DJTrackAnalysis) => { schedule(e: ScratchEvent): unknown; cancel(): void; readonly active: number }; fire?: typeof fireDjFx } = {},
): TransitionScratchHandle {
  autoScratchRuntimeStats.transitionScratches++;
  const exec = (deps.executorFor ?? createDeckScratchExecutor)(deck, analysis);
  for (const e of scratch.events) exec.schedule(e);
  const action = fxRequestAction(scratch.fxRequest);
  if (action) {
    autoScratchRuntimeStats.fxRequests++;
    const beats = Math.max(1, scratch.endBeat - scratch.startBeat);
    (deps.fire ?? fireDjFx)(action, { deck, beats, source: 'autodj' });
  }
  let cancelled = false;
  let poll: unknown = null;
  const done = new Promise<{ completed: boolean; reason?: string }>((resolve) => {
    poll = realTimers.setInterval(() => {
      if (cancelled) { realTimers.clearInterval(poll); resolve({ completed: false, reason: 'cancelled' }); return; }
      if (exec.active === 0) { realTimers.clearInterval(poll); resolve({ completed: true }); }
    }, 50);
  });
  return {
    done,
    cancel: () => { if (cancelled) return; cancelled = true; exec.cancel(); },
  };
}

/**
 * R5 (owner decision 2026-10-13): a phrase WAV dropped on Deck C becomes Deck C's scratch records with the demo's
 * word cues (`loadScratchPhrase`) and the Auto Scratch phrase setting; the three-deck routine scratches it.
 */
export function loadDeckCPhrase(bytes: ArrayBuffer, fileName: string): ScratchPhrase {
  const phrase = loadScratchPhrase(getScratchVoicePool(), bytes, fileName);
  useDJStore.getState().setAutoDJConfig({ scratchPhrase: phrase });
  return phrase;
}

/** A module deck's render, decoded once per file (the DJ pipeline's render, cached by file name). */
const moduleRenders = new Map<string, Promise<AudioBuffer | null>>();

/**
 * X7 (owner decision 2026-10-13): a module deck (tracker playback, no buffer of its own) is read from its audio as
 * the DJ pipeline rendered it ahead - the render cached under its file name - so three_deck's exact duck and level
 * apply to it as to any deck. Null when the pipeline has not rendered it.
 */
export function moduleDeckRender(fileName: string, ctx: BaseAudioContext, read: (fileName: string) => Promise<{ audioData: ArrayBuffer } | null> = getCachedAudioByFilename): Promise<AudioBuffer | null> {
  let p = moduleRenders.get(fileName);
  if (!p) {
    p = read(fileName).then((c) => {
      if (!c || !c.audioData.byteLength) return null;
      autoScratchRuntimeStats.moduleRenders++;
      return ctx.decodeAudioData(c.audioData.slice(0));
    });
    moduleRenders.set(fileName, p);
    p.then((b) => { if (!b) moduleRenders.delete(fileName); }, () => moduleRenders.delete(fileName));
  }
  return p;
}

/**
 * The decks a planned scratch routine's level and duck read (X6), from the live decks and the mixer
 * (`routineShapeDecks`): a deck's own buffer, or a module deck's render read at the row the listener hears, at the
 * tempo it plays (X7).
 */
export async function scratchShapeDecks(shape: Pick<ScratchRoutineShape, 'deck' | 'startSec' | 'trackFromSec'>): Promise<Array<{ audio: AudioBuffer; trackFromSec: number; gain: number }> | null> {
  const engine = getDJEngine();
  const ctx = Tone.getContext().rawContext as BaseAudioContext;
  const deck = async (d: AB) => {
    const st = useDJStore.getState().decks[d];
    const de = engine.getDeck(d);
    const player = de.audioPlayer;
    const own = player.getAudioBuffer();
    if (own || st.playbackMode !== 'tracker' || !st.fileName) return { playing: st.isPlaying, audio: own, position: player.getPosition(), rate: player.getPlaybackRate() };
    const audio = await moduleDeckRender(st.fileName, ctx);
    const heard = de.getHeardTrackerState();
    const rate = st.detectedBPM > 0 && st.effectiveBPM > 0 ? st.effectiveBPM / st.detectedBPM : 1;
    return { playing: useDJStore.getState().decks[d].isPlaying, audio, position: (heard?.elapsedMs ?? 0) / 1000, rate };
  };
  const [a, b] = await Promise.all([deck('A'), deck('B')]);
  const st = useDJStore.getState();
  return routineShapeDecks(shape, { A: a, B: b }, computeCrossfaderGains(st.crossfaderPosition, st.crossfaderCurve), ctx.currentTime);
}
