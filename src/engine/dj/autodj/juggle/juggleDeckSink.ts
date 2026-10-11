/**
 * The real action sink (juggling plan sections 6, 20.2, 53, 56.4): every
 * juggle action lands on the same DJ actions the DJ view's buttons, keyboard
 * and MIDI use - crossfader, seeks, audio loops, EQ kills, the DjFx registry
 * (echo throw, reverb out, filter rise/release, filter reset) and the auto
 * sync. Nothing touches a deck or the mixer directly.
 */
import { getDJEngine } from '../../DJEngine';
import {
  clearDeckAudioLoop, seekDeckAudio, setCrossfader, setDeckAudioLoop, setDeckEQKillNow, setDeckFilter,
} from '../../DJActions';
import { beatJump, triggerHotCue } from '../../DJBeatJump';
import { bendToPhase, lockBarPhase, phaseErrorSec, syncBPMToOther } from '../../DJAutoSync';
import { fireDjFx, releaseDjFx } from '../../../drumpad/DjFxActions';
import { useDJStore } from '@/stores/useDJStore';
import type { DJJuggleAction } from './juggleTypes';
import type { JuggleActionSink, SinkState } from './juggleExecutor';

type AB = 'A' | 'B';

function deckPosition(deck: AB): number {
  try { return getDJEngine().getDeck(deck).audioPlayer.getPosition(); } catch { return useDJStore.getState().decks[deck].audioPosition; }
}

/** Snap a deck position back to the nearest bar start on its stored beat grid. */
function barStartBefore(deck: AB, pos: number): number {
  const grid = useDJStore.getState().decks[deck].beatGrid;
  const downbeats = grid?.downbeats;
  if (!downbeats || downbeats.length === 0) return pos;
  let lo = 0, hi = downbeats.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (downbeats[mid] <= pos) lo = mid; else hi = mid - 1; }
  return downbeats[lo] <= pos ? downbeats[lo] : pos;
}

function deckPlaying(deck: AB): boolean {
  try { return getDJEngine().getDeck(deck).isPlaying(); } catch { return useDJStore.getState().decks[deck].isPlaying; }
}

/**
 * Where a cue jump lands so the deck stays on the master's beat: the action
 * fires a hair before the beat it cuts on (or a tick late), so the deck lands
 * the same distance before (after) its target as the master is from that beat.
 */
export function phaseKeptTarget(targetSec: number, patternBeat: number, beatSec: number): number {
  return targetSec + (patternBeat - Math.round(patternBeat)) * beatSec;
}

export function crossfaderFor(deck: 'A' | 'B' | 'BOTH'): number { return deck === 'A' ? 0 : deck === 'B' ? 1 : 0.5; }

/** Bind the executor to the DJ actions. `lastSet` lets the controller tell our crossfader moves from the user's. */
export function createDeckJuggleSink(): JuggleActionSink & { lastCrossfader: () => number | null } {
  let lastCrossfader: number | null = null;
  const loopStart: Record<AB, number | null> = { A: null, B: null };
  const move = (v: number): void => { lastCrossfader = v; setCrossfader(v); };
  const loop = (deck: AB, beats: number, beatSec: number): void => {
    const start = loopStart[deck] ?? barStartBefore(deck, deckPosition(deck));
    loopStart[deck] = start;
    setDeckAudioLoop(deck, start, start + beats * beatSec);
  };
  /** Filter position each deck had before the pattern first moved it: what every exit path hands back. */
  const filterBefore: Partial<Record<AB, number>> = {};
  const noteFilter = (deck: AB): void => {
    if (filterBefore[deck] !== undefined) return;
    let pos = useDJStore.getState().decks[deck].filterPosition;
    try { pos = getDJEngine().getDeck(deck).getFilterPosition(); } catch { /* engine not ready: the store value */ }
    filterBefore[deck] = pos;
  };
  const restoreFilter = (deck: AB): void => {
    releaseDjFx('fx_deck_filter_rise', { deck, source: 'autodj' });
    releaseDjFx('fx_deck_filter_release', { deck, source: 'autodj' });
    setDeckFilter(deck, filterBefore[deck] ?? 0);
    delete filterBefore[deck];
  };
  const reset = (deck: AB): void => {
    clearDeckAudioLoop(deck); loopStart[deck] = null;
    setDeckEQKillNow(deck, 'low', false);
    releaseDjFx('fx_deck_echo_throw', { deck, source: 'autodj' });
    restoreFilter(deck);
  };
  return {
    restore(): void { for (const d of ['A', 'B'] as const) if (filterBefore[d] !== undefined) restoreFilter(d); },
    phaseError(deck: AB): number | null {
      try { return phaseErrorSec(deck, deck === 'A' ? 'B' : 'A', 'bar'); } catch { return null; }
    },
    lastCrossfader: () => lastCrossfader,
    state(): SinkState {
      const s = useDJStore.getState();
      const cf = s.crossfaderPosition;
      return {
        crossfader: cf,
        playing: { A: s.decks.A.isPlaying, B: s.decks.B.isPlaying },
        audible: { A: s.decks.A.isPlaying && cf < 0.999, B: s.decks.B.isPlaying && cf > 0.001 },
        loops: { A: s.decks.A.loopActive, B: s.decks.B.loopActive },
      };
    },
    apply(action: DJJuggleAction, info): void {
      const d = action.deck === 'BOTH' ? null : action.deck;
      switch (action.type) {
        case 'CutIn': move(crossfaderFor(action.deck)); break;
        case 'CutOut': case 'CrossfadeFrom': move(crossfaderFor(d === 'A' ? 'B' : d === 'B' ? 'A' : 'BOTH')); break;
        case 'CrossfadeTo': move(action.targetPosition ?? crossfaderFor(action.deck)); break;
        case 'HoldDeck': move(0.5); break;
        case 'ReleaseDeck': move(crossfaderFor(action.deck)); break;
        case 'TriggerCue': if (d) triggerHotCue(d, Math.round(action.targetPosition ?? 0)); break;
        case 'JumpToBeat': if (d) beatJump(d, action.beats ?? 0); break;
        // A cue jump to the call / response / fill material: musically a jump (a needle drop on the bar
        // the deck is cut in on, the deck silent until then), so a seek - landed on the master's phase.
        case 'JumpToBar': if (d && action.targetPosition !== undefined) seekDeckAudio(d, Math.max(0, phaseKeptTarget(action.targetPosition, info.patternBeat, info.beatSec))); break;
        case 'StartLoop': if (d) { loopStart[d] = null; loop(d, action.beats ?? 4, info.beatSec); } break;
        case 'LoopResize': if (d) loop(d, action.beats ?? 4, info.beatSec); break;
        case 'LoopRoll': if (d) { loopStart[d] = null; loop(d, action.beats ?? 1, info.beatSec); } break;
        case 'ExitLoop': if (d) { clearDeckAudioLoop(d); loopStart[d] = null; } break;
        case 'FilterIn': if (d) { noteFilter(d); fireDjFx('fx_deck_filter_rise', { deck: d, beats: action.durationBeats ?? 8, amount: action.strength, source: 'autodj' }); } break;
        case 'FilterOut': if (d) { noteFilter(d); fireDjFx('fx_deck_filter_release', { deck: d, beats: action.durationBeats ?? 4, source: 'autodj' }); } break;
        case 'EQCut': if (d) setDeckEQKillNow(d, 'low', true); break;
        case 'EQRestore': if (d) setDeckEQKillNow(d, 'low', false); break;
        case 'BassSwap': if (d) { setDeckEQKillNow(d === 'A' ? 'B' : 'A', 'low', true); setDeckEQKillNow(d, 'low', false); } break;
        case 'EchoThrow': if (d) fireDjFx('fx_deck_echo_throw', { deck: d, beats: action.durationBeats ?? 2, amount: action.strength ?? 0.6, source: 'autodj' }); break;
        case 'ReverbThrow': if (d) fireDjFx('fx_deck_reverb_out', { deck: d, beats: action.durationBeats ?? 4, amount: action.strength ?? 0.5, source: 'autodj' }); break;
        case 'ResetDeck': if (d) reset(d); else { reset('A'); reset('B'); } break;
        // Owner plan section 16 (audit row 9): the incoming locks to the master's bars while it is not heard -
        // a bend within half a beat, else one exact re-cue (an audible deck is only ever bent).
        case 'PhaseLock': {
          if (!d) break;
          const cf = useDJStore.getState().crossfaderPosition;
          const heard = d === 'A' ? cf < 0.999 : cf > 0.001;
          lockBarPhase(d, d === 'A' ? 'B' : 'A', !heard);
          break;
        }
        case 'ResyncDeck': {
          // A double's copy sits `beats` ahead of the other deck, measured from where that deck is now
          // (the planned position is stale by the time the pattern starts). Within half a beat the
          // playing copy is bent there (never a seek); further is a re-cue of the silent copy - a cue
          // jump by intent - and lands exactly.
          if (!d) break;
          const o = d === 'A' ? 'B' : 'A';
          try { syncBPMToOther(d, o); } catch { /* grid missing: the governor blocks doubles without a grid */ }
          if (action.targetPosition === undefined) break;
          const want = deckPosition(o) + (action.beats ?? 0) * info.beatSec;
          const error = want - deckPosition(d);
          if (deckPlaying(d) && Math.abs(error) <= info.beatSec / 2) bendToPhase(d, error);
          else seekDeckAudio(d, Math.max(0, want));
          break;
        }
      }
    },
  };
}
