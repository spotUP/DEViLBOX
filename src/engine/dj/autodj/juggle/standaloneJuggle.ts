/**
 * Stand-alone juggles on the idle deck (plan 2026-10-11-dj-juggling, P4.3,
 * P4.4; owner juggling plan sections 15-17, 25, 27, 43). Auto DJ stays
 * session-level (owner plan section 53): it asks this layer once per poll
 * and tells it when it needs the idle deck back; this layer owns the double
 * while it exists.
 *
 * Setup (owner plan section 16): load a double of the playing track (or the
 * pre-rendered next track) on the idle deck, cue it on the master's next
 * downbeat while it is stopped (a seek is right there), match its tempo,
 * start it on that bar, verify its heard beat phase, and only then let the
 * juggle controller plan with the two decks. While it runs, a rate bend
 * keeps it on the master's beat (never a seek of a playing deck). The
 * controller's pattern release hands back: the idle deck stops, the
 * crossfader sits on the master.
 */
import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine } from '../../DJEngine';
import type { DeckId } from '../../DeckEngine';
import { seekDeckAudio } from '../../DJActions';
import { getPhaseInfo, phaseAlign, quantizedPlay, syncBPMToOther } from '../../DJAutoSync';
import { engageAutoKeyLock, releaseAutoKeyLock, resetDeckAfterTransition } from '../transitionExecutor';
import { getDecisionLog } from '../decisionLog';
import type { DJTrackAnalysis } from '../types';
import { barIndexAt } from '../beatGrid';
import type { DJJuggleController, TickInput } from './juggleController';
import { juggleOpportunity, type JuggleOpportunity, type NextTrackOption } from './juggleOpportunity';
import type { JuggleTrigger, StandaloneSource } from './juggleTypes';

/** A double's heard beat phase within this of the master's counts as aligned (the P4 success criteria's 5 ms). */
export const STANDALONE_PHASE_VERIFIED_SEC = 0.005;

/** A track's best mix-in, snapped back to the start of its phrase: where a teased next track is cued. */
export function mixInPhraseStartOf(a: DJTrackAnalysis): number {
  const mixIn = a.cuePoints.bestMixIn ?? 0;
  const phrase = [...a.phrases].reverse().find((p) => p.start <= mixIn + 0.01);
  return phrase?.start ?? mixIn;
}

/** Index of the bar of a grid whose start is nearest to `t`. */
function nearestBar(a: DJTrackAnalysis, t: number): number {
  const bars = a.downbeats.bars;
  const i = barIndexAt(a.downbeats, t);
  return i + 1 < bars.length && Math.abs(bars[i + 1].start - t) < Math.abs(bars[i].start - t) ? i + 1 : i;
}

/**
 * Where a teased next track is cued when it starts on the master's bar at
 * `masterStartSec` (owner plan sections 9, 41: both tracks' phrases run
 * together): as many bars before one of its phrase starts (its mix-in
 * phrase, or a later one) as the master has bars left to its next phrase
 * start, so the two phrase grids meet there. Without a master phrase ahead,
 * the mix-in phrase start.
 */
export function teaseCueSec(master: DJTrackAnalysis, masterStartSec: number, incoming: DJTrackAnalysis): number {
  const mixIn = mixInPhraseStartOf(incoming);
  const startBar = nearestBar(master, masterStartSec);
  const next = master.phrases.find((p) => p.startBar >= startBar);
  if (!next) return mixIn;
  const barsLeft = next.startBar - startBar;
  const bars = incoming.downbeats.bars;
  for (const phrase of incoming.phrases) {
    if (phrase.start < mixIn - 0.01) continue;
    const cueBar = phrase.startBar - barsLeft;
    if (cueBar >= 0 && cueBar < bars.length) return bars[cueBar].start;
  }
  return mixIn;
}

export interface StandaloneDeps {
  controller: () => DJJuggleController;
  /** Auto DJ's deck roles now. */
  decks: () => { active: DeckId; idle: DeckId };
  deckPlaying: (deck: DeckId) => boolean;
  /** Null when Auto DJ can lend the idle deck now, else why not. */
  idleDeckBusy: (status: string) => string | null;
  /** The pre-rendered next track as a tease candidate (null: none). */
  nextOption: (input: TickInput) => NextTrackOption | null;
  /** Load the pre-rendered next track on the idle deck; Auto DJ marks it preloaded there. */
  loadNext: (deck: DeckId) => Promise<boolean>;
  loadDouble: (source: DeckId, target: DeckId) => Promise<boolean>;
}

interface State {
  phase: 'loading' | 'cued' | 'running';
  trigger: JuggleTrigger;
  source: StandaloneSource;
  deck: DeckId;
  /** Tells a load or a queued start that this juggle was ended meanwhile. */
  gen: number;
  startedCount: number;
  runningSince: number;
  phraseSec: number;
  reason: string;
  /** The idle deck's file once loaded: a different one means the user took the deck. */
  fileName: string | null;
  /** The heard beat phase was measured on the master's (owner plan section 16: verify, then juggle). */
  verified: boolean;
}

export class StandaloneJuggle {
  private state: State | null = null;
  private gen = 0;
  private deps: StandaloneDeps;

  constructor(deps: StandaloneDeps) { this.deps = deps; }

  /** What the idle deck holds now: a double, a teased next track, or nothing of this layer's. */
  source(): StandaloneSource | null { return this.state?.source ?? null; }
  active(): boolean { return this.state !== null; }
  /** Set up but not yet verified: the controller must not plan with the decks yet. */
  verifying(): boolean { return !!this.state && !this.state.verified; }

  /** One deck plays and Auto DJ lends the idle one: set up a juggle when the music asks for one. */
  consider(status: string, input: TickInput): void {
    const j = this.deps.controller();
    if (this.state) return;
    const { idle } = this.deps.decks();
    let note = this.deps.idleDeckBusy(status);
    if (note === null && this.deps.deckPlaying(idle)) { j.setStandalone(null, null); return; } // two decks play: the controller plans with them
    if (note === null) {
      const why: string[] = [];
      const ctx = j.buildContext(input);
      const op = juggleOpportunity(ctx, j.getMode(), this.deps.nextOption(input), why, { intensityOverride: useDJStore.getState().autoDJJuggleIntensity });
      if (op) {
        const master = ctx.masterDeck === 'A' ? ctx.deckA : ctx.deckB;
        void this.start(op, (ctx.phraseLengthBars * ctx.beatsPerBar * 60) / Math.max(60, master.bpm || 120));
        return;
      }
      note = why[0] ?? null;
    }
    j.setStandalone(null, note);
  }

  private publish(): void {
    const s = this.state;
    this.deps.controller().setStandalone(s ? { trigger: s.trigger, source: s.source, phase: s.phase, deck: s.deck === 'B' ? 'B' : 'A' } : null);
  }

  private is(gen: number): boolean { return this.state?.gen === gen; }

  private async start(op: JuggleOpportunity, phraseSec: number): Promise<void> {
    const gen = ++this.gen;
    const { active, idle } = this.deps.decks();
    const j = this.deps.controller();
    this.state = { phase: 'loading', trigger: op.trigger, source: op.source, deck: idle, gen, startedCount: j.counts.started, runningSince: 0, phraseSec, reason: op.reason, fileName: null, verified: false };
    this.publish();
    // The crowd hears the master only until a pattern cuts the double in.
    const masterCf = active === 'A' ? 0 : 1;
    try { getDJEngine().setCrossfader(masterCf); } catch { /* engine not ready */ }
    useDJStore.getState().setCrossfader(masterCf);

    let loaded = false;
    try {
      loaded = op.source === 'double' ? await this.deps.loadDouble(active, idle) : await this.deps.loadNext(idle);
    } catch (err) {
      console.warn('[StandaloneJuggle] load failed:', err);
    }
    if (!this.is(gen)) return;
    if (!loaded) { this.end('load failed'); return; }
    this.state!.fileName = useDJStore.getState().decks[idle].fileName;

    // Owner plan section 16 steps 1-3: a reliable beat (the master's grid), the same beat, the bar phase.
    // A teased next track starts on the master's next bar, cued so its phrases meet the master's (sections 9, 41).
    const analysis = useDJStore.getState().decks[idle].trackAnalysis;
    const masterAnalysis = useDJStore.getState().decks[active].trackAnalysis;
    const startSec = this.nextDownbeatOf(active);
    const cue = op.source === 'double' ? startSec
      : !analysis ? null
      : masterAnalysis && startSec !== null ? teaseCueSec(masterAnalysis, startSec, analysis) : mixInPhraseStartOf(analysis);
    if (cue !== null) seekDeckAudio(idle, cue);
    let semitones = 0;
    try { semitones = syncBPMToOther(idle, active); } catch { /* grid missing */ }
    engageAutoKeyLock(idle === 'B' ? 'B' : 'A', Math.abs(semitones) > 0.5);
    this.state!.phase = 'cued';
    this.publish();

    await quantizedPlay(idle, 'bar', { cancelled: () => !this.is(gen) });
    if (!this.is(gen)) return;
    this.state!.phase = 'running';
    this.state!.runningSince = Date.now();
    this.publish();
  }

  /** The master's next downbeat at least 50 ms ahead, in track seconds: where quantizedPlay starts the double. */
  private nextDownbeatOf(deck: DeckId): number | null {
    const downbeats = useDJStore.getState().decks[deck].beatGrid?.downbeats;
    if (!downbeats?.length) return null;
    let pos: number;
    try { pos = getDJEngine().getDeck(deck).getHeardPosition(); } catch { pos = useDJStore.getState().decks[deck].audioPosition; }
    return downbeats.find((d) => d > pos + 0.05) ?? null;
  }

  /**
   * Every poll: yield to the user (owner plan section 43), keep the idle
   * deck on the master's beat with a rate bend (beat phase, so a double's
   * whole-beat offset stays), verify the phase before the first pattern
   * (section 16 steps 5-6), hand back when the idle deck stopped or no
   * pattern started within two phrases.
   */
  hold(): void {
    const s = this.state;
    if (!s) return;
    const j = this.deps.controller();
    const decks = useDJStore.getState().decks;
    if (s.phase !== 'loading' && decks[s.deck].fileName !== s.fileName) { this.yield('the user loaded the idle deck'); return; }
    const masterCf = s.deck === 'A' ? 1 : 0;
    if (!j.isActive() && Math.abs(useDJStore.getState().crossfaderPosition - masterCf) > 0.05) { this.yield('user control: crossfader'); return; }
    if (s.phase !== 'running') return;
    if (!this.deps.deckPlaying(s.deck)) { this.end('the idle deck stopped'); return; }
    const started = j.counts.started > s.startedCount;
    if (!started && !j.isActive() && Date.now() - s.runningSince > 2 * s.phraseSec * 1000) { this.end('no pattern within two phrases'); return; }
    const master: DeckId = s.deck === 'A' ? 'B' : 'A';
    if (!s.verified) {
      const a = getPhaseInfo(master), b = getPhaseInfo(s.deck);
      const bpm = decks[master].beatGrid?.bpm || 120;
      if (a && b) {
        let d = a.beatPhase - b.beatPhase;
        if (d > 0.5) d -= 1;
        if (d < -0.5) d += 1;
        if (Math.abs((d * 60) / bpm) <= STANDALONE_PHASE_VERIFIED_SEC) { s.verified = true; this.publish(); }
      }
    }
    try { phaseAlign(s.deck, master, 'beat'); } catch { /* grid missing */ }
  }

  /** The juggle controller finished a pattern: the stand-alone juggle that started it hands back. */
  onPatternFinished(outcome: string): void {
    const s = this.state;
    if (s && s.phase === 'running' && this.deps.controller().counts.started > s.startedCount) this.end(outcome);
  }

  private log(s: State, outcome: string): void {
    getDecisionLog().record('JUGGLE', [`stand-alone ${s.source} on ${s.deck} (${s.trigger}): ${outcome}`, s.reason], { details: { trigger: s.trigger, source: s.source, phase: s.phase, outcome } });
  }

  /** The user took the idle deck: let go of it without touching it. */
  private yield(outcome: string): void {
    const s = this.state;
    if (!s) return;
    this.state = null;
    this.log(s, outcome);
    this.publish();
  }

  /**
   * Hand back to the playing deck: the pattern still running releases, the
   * idle deck stops and gets its own key lock and a clean channel back, the
   * crossfader sits on the master. A double stays loaded but stopped (the
   * next preload loads over it); a teased next track stays for its transition.
   */
  end(outcome: string): void {
    const s = this.state;
    if (!s) return;
    this.state = null;
    const j = this.deps.controller();
    if (j.isActive() && j.currentExecution()?.pattern.type !== 'transitionLadder') j.abort(`stand-alone juggle ended: ${outcome}`);
    const idle = s.deck;
    const ab = idle === 'B' ? 'B' : 'A';
    try { getDJEngine().getDeck(idle).stop(); } catch { /* engine not ready */ }
    useDJStore.getState().setDeckPlaying(idle, false);
    releaseAutoKeyLock(ab);
    try { resetDeckAfterTransition(ab); } catch { /* engine not ready */ }
    const cf = idle === 'A' ? 1 : 0;
    try { getDJEngine().setCrossfader(cf); } catch { /* engine not ready */ }
    useDJStore.getState().setCrossfader(cf);
    this.log(s, outcome);
    this.publish();
  }

  /** Auto DJ's swap completed: whatever this layer held is the transition's now. */
  forget(): void { this.state = null; }
}
