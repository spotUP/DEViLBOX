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
 * start it on that bar, lock it to the master's bars while it is silent (a
 * bend, else an exact re-cue), verify its heard bar phase, and only then let
 * the juggle controller plan with the two decks. While it runs, a rate bend
 * keeps it on the master's beat (never a seek of a playing deck). The
 * controller's pattern release hands back: the idle deck stops, the
 * crossfader sits on the master.
 */
import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine } from '../../DJEngine';
import type { DeckId } from '../../DeckEngine';
import { seekDeckAudio } from '../../DJActions';
import { lockBarPhase, phaseAlign, phaseErrorSec, quantizedPlay, syncBPMToOther } from '../../DJAutoSync';
import { phaseUnverified } from './phaseVerification';
import { engageAutoKeyLock, releaseAutoKeyLock, resetDeckAfterTransition } from '../transitionExecutor';
import { getDecisionLog } from '../decisionLog';
import type { DJTrackAnalysis } from '../types';
import { barIndexAt } from '../beatGrid';
import type { DJJuggleController, TickInput } from './juggleController';
import { juggleOpportunity, type JuggleOpportunity, type NextTrackOption } from './juggleOpportunity';
import type { JuggleTrigger, StandaloneSource } from './juggleTypes';

/**
 * Owner plan section 16 steps 3 and 5: the idle deck's heard BAR phase is
 * within PHASE_VERIFIED_SEC of the other deck's - a copy a whole
 * beat off is on the beat but not on the bar, and is not verified. The
 * juggle layer's one verification rule (phaseVerification) on the bar-phase
 * measurement.
 */
export function idleBarPhaseVerified(idle: DeckId): boolean {
  const other: DeckId = idle === 'A' ? 'B' : 'A';
  return phaseUnverified({ phaseError: (d) => phaseErrorSec(d, d === idle ? other : idle, 'bar') }, idle === 'B' ? 'B' : 'A') === null;
}

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
  /** The heard bar phase was measured on the master's (owner plan section 16: verify, then juggle). */
  verified: boolean;
  /** Re-cues of the silent copy onto the master's bars during the setup, and when the last one landed (ms). */
  recues: number;
  lastRecueAt: number;
}

/** Re-cues of a double that still misses the master's bars before the setup gives up (owner plan section 16). */
export const DOUBLE_MAX_RECUES = 3;
/** A re-cue settles (the seek reaches the heard position) before the bar phase is measured again. */
const RECUE_SETTLE_MS = 250;

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
      // A pending Juggle Now skips the timing gates (owner decision 2026-10-12); the safety gates decide.
      const op = juggleOpportunity(ctx, j.getMode(), this.deps.nextOption(input), why, { intensityOverride: useDJStore.getState().autoDJJuggleIntensity, skipTiming: j.nowPending() });
      if (op) {
        const master = ctx.masterDeck === 'A' ? ctx.deckA : ctx.deckB;
        void this.start(op, (ctx.phraseLengthBars * ctx.beatsPerBar * 60) / Math.max(60, master.bpm || 120));
        return;
      }
      note = why[0] ?? null;
    }
    if (note !== null) j.refuseNow(`stand-alone: ${note}`);
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
    this.state = { phase: 'loading', trigger: op.trigger, source: op.source, deck: idle, gen, startedCount: j.counts.started, runningSince: 0, phraseSec, reason: op.reason, fileName: null, verified: false, recues: 0, lastRecueAt: 0 };
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
    if (!loaded) { this.fail('load failed'); return; }
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
   * Every poll: yield to the user (owner plan section 43); before the first
   * pattern lock the silent idle deck to the master's bars and verify its
   * bar phase (section 16 steps 3, 5, 6; it gives up after DOUBLE_MAX_RECUES
   * re-cues that do not land); once verified keep it on the master's beat
   * with a rate bend (beat phase, so a pattern's whole-beat offset stays); hand back when the idle deck stopped or no
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
    if (!started && !j.isActive() && Date.now() - s.runningSince > 2 * s.phraseSec * 1000) { this.fail('no pattern within two phrases'); return; }
    const master: DeckId = s.deck === 'A' ? 'B' : 'A';
    if (!s.verified) {
      if (Date.now() - s.lastRecueAt < RECUE_SETTLE_MS) return;
      if (idleBarPhaseVerified(s.deck)) { s.verified = true; this.publish(); return; }
      // Section 16 step 3 before step 5: the copy is silent (the fader holds the master, no pattern plans before
      // verification), so it is locked to the master's BARS - a bend within half a beat, else one exact re-cue.
      // A copy a whole beat off is on the beat but not on the bar: a beat-phase bend would keep it there.
      let did: ReturnType<typeof lockBarPhase> = 'none';
      try { did = lockBarPhase(s.deck, master, Math.abs(useDJStore.getState().crossfaderPosition - masterCf) < 0.001); } catch { /* grid missing */ }
      if (did === 'recue') {
        s.lastRecueAt = Date.now();
        if (++s.recues > DOUBLE_MAX_RECUES) this.fail(`the double's bar phase could not be corrected (${DOUBLE_MAX_RECUES} re-cues)`);
      }
      return;
    }
    // Verified: the copy stays on the master's beat (a pattern's whole-beat offsets stay).
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
    this.deps.controller().refuseNow(`stand-alone ${s.source} let go: ${outcome}`);
    this.log(s, outcome);
    this.publish();
  }

  /**
   * Hand back to the playing deck: the pattern still running releases, the
   * idle deck stops and gets its own key lock and a clean channel back, the
   * crossfader sits on the master. A double stays loaded but stopped (the
   * next preload loads over it); a teased next track stays loaded, and the transition loads it from its pre-render.
   */
  end(outcome: string): void {
    const s = this.state;
    if (!s) return;
    this.state = null;
    const j = this.deps.controller();
    j.refuseNow(`stand-alone ${s.source} ended before a pattern: ${outcome}`);
    if (j.isActive() && j.currentExecution()?.pattern.type !== 'transitionLadder') j.abort(`stand-alone juggle ended: ${outcome}`);
    const idle = s.deck;
    const ab = idle === 'B' ? 'B' : 'A';
    // The fader first, then the idle deck stops when that move has landed. A fader move is scheduled one
    // lookAhead (100 ms) ahead, a deck stop acts now: stopped first, the idle deck fell silent while the
    // crowd still heard it, a hole before the master's downbeat - the pattern's last cut heard late
    // (JUGGLE-LAST-CUT-LATE, live 2026-10-12).
    const cf = idle === 'A' ? 1 : 0;
    try { getDJEngine().setCrossfader(cf); } catch { /* engine not ready */ }
    useDJStore.getState().setCrossfader(cf);
    try { const engine = getDJEngine(); engine.getDeck(idle).stop(engine.mixer.crossfaderSettledAt()); } catch { /* engine not ready */ }
    useDJStore.getState().setDeckPlaying(idle, false);
    releaseAutoKeyLock(ab);
    try { resetDeckAfterTransition(ab); } catch { /* engine not ready */ }
    this.log(s, outcome);
    this.publish();
  }

  /**
   * The setup itself gave up (load failed, the bar phase could not be locked,
   * no pattern within two phrases): the attempt spends the juggle cooldown
   * (owner plan section 24), then hands back like any end. An end Auto DJ asks
   * for (a transition, the user, Auto DJ off) is not a failed setup.
   */
  private fail(outcome: string): void {
    this.deps.controller().noteFailedSetup();
    this.end(outcome);
  }

  /** Auto DJ's swap completed: whatever this layer held is the transition's now. */
  forget(): void { this.state = null; }
}
