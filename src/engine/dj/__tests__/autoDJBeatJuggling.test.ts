/**
 * Beat juggling (juggling plan gates C-M, sections 47-49): the pattern
 * library, the executor on the shared musical clock, the planner's adaptive
 * choices, the safety governor, call and response from the Dub Deck channel
 * roles, doubles, loops, memory and a long simulated set. Everything runs on
 * virtual timers with a fake action sink - no audio, no speakers.
 */
import { describe, it, expect } from 'vitest';
import { VirtualTimers } from '../autodj/testing/setSimulator';
import { corpusAnalysis, type CorpusId } from '../autodj/testing/corpus';
import { executeJuggle, type JuggleActionSink, type JuggleClock, type SinkState } from '../autodj/juggle/juggleExecutor';
import { PATTERN_BUILDERS, PATTERN_INTENSITY, MODE_PATTERNS, type PatternParams } from '../autodj/juggle/jugglePatterns';
import { planJuggle, confidencePolicy, doubleOffset, patternBars, scoreJuggleQuality } from '../autodj/juggle/jugglePlanner';
import { findCallAndResponse, classifyWindow, upcomingWindows } from '../autodj/juggle/juggleMaterial';
import { DJJuggleController, analysisClock, type TickInput } from '../autodj/juggle/juggleController';
import { JUGGLE_PATTERN_TYPES, JUGGLE_ACTION_TYPES, type DJJuggleAction, type DJJugglePerformanceContext, type JuggleMode, type LibraryPatternType } from '../autodj/juggle/juggleTypes';
import type { DJTrackAnalysis, SetEnergyPhase } from '../autodj/types';

// ── Fakes: a sink that records, a clock from virtual time ───────────────────

interface Applied { action: DJJuggleAction; beat: number; crossfader: number }

function fakeSink(playing: { A: boolean; B: boolean }) {
  const applied: Applied[] = [];
  let crossfader = 0;
  const loops = { A: false, B: false };
  const sink: JuggleActionSink & { applied: Applied[]; crossfaderNow: () => number; loops: typeof loops; set: (v: number) => void } = {
    applied, loops, crossfaderNow: () => crossfader, set: (v) => { crossfader = v; },
    state(): SinkState { return { crossfader, playing: { ...playing }, audible: { A: playing.A && crossfader < 0.999, B: playing.B && crossfader > 0.001 }, loops: { ...loops } }; },
    apply(action, info) {
      const d = action.deck;
      switch (action.type) {
        case 'CutIn': case 'ReleaseDeck': crossfader = d === 'A' ? 0 : d === 'B' ? 1 : 0.5; break;
        case 'CutOut': crossfader = d === 'A' ? 1 : d === 'B' ? 0 : 0.5; break;
        case 'HoldDeck': crossfader = 0.5; break;
        case 'StartLoop': case 'LoopResize': case 'LoopRoll': if (d !== 'BOTH') loops[d] = true; break;
        case 'ExitLoop': if (d !== 'BOTH') loops[d] = false; break;
        case 'ResetDeck': if (d === 'BOTH') { loops.A = false; loops.B = false; } else loops[d] = false; break;
        default: break;
      }
      if (crossfader < 0 || crossfader > 1 || Number.isNaN(crossfader)) throw new Error(`invalid crossfader ${crossfader}`);
      applied.push({ action, beat: info.beatNow, crossfader });
    },
  };
  return sink;
}

const BEAT_SEC = 60 / 126;
function virtualClock(timers: VirtualTimers, beatSec = BEAT_SEC): JuggleClock { return { beatNow: () => timers.now() / 1000 / beatSec, beatSec: () => beatSec }; }

const params = (over: Partial<PatternParams> = {}): PatternParams => ({ primary: 'A', beatsPerBar: 4, intensity: 0.8, phraseBars: 8, confidence: 0.9, seed: 1, ...over });

async function run(patternType: LibraryPatternType, p: Partial<PatternParams> = {}, playing = { A: true, B: true }) {
  const timers = new VirtualTimers();
  const sink = fakeSink(playing);
  const pattern = PATTERN_BUILDERS[patternType](params(p));
  const startBeat = 8;
  const exec = executeJuggle(pattern, startBeat, { clock: virtualClock(timers), sink, timers, tickMs: 15 });
  await timers.run((startBeat + pattern.durationBars * 4 + 8) * BEAT_SEC * 1000);
  const result = await exec.done;
  return { timers, sink, pattern, exec, result, startBeat };
}

// ── Context builder for the planner ─────────────────────────────────────────

function ctxFor(over: Partial<DJJugglePerformanceContext> = {}, ids: { A: CorpusId; B: CorpusId } = { A: 'steady', B: 'compatibleKey' }): DJJugglePerformanceContext {
  const a = corpusAnalysis(ids.A), b = corpusAnalysis(ids.B);
  const deck = (d: 'A' | 'B', an: DJTrackAnalysis, id: string) => ({
    deck: d, trackId: id, position: 20, beatPhase: 0, barPhase: 0, beatIndex: 40, bpm: 126, key: an.key.name, keyConfidence: an.keyConfidence, section: an.sections.find((s) => s.start <= 20 && 20 < s.end),
    energy: 0.7, drumsActive: true, bassActive: true, vocalsActive: false, melodicActivity: 0.5, loop: null, analysisConfidence: 0.9, playing: true, analysis: an,
  });
  return {
    masterDeck: 'A', masterBeat: 40, masterBar: 10, phrasePosition: 0.25, phraseLengthBars: 8, beatsPerBar: 4,
    deckA: deck('A', a, ids.A), deckB: deck('B', b, ids.B), activeDeck: 'A', performanceMode: 'JUGGLE', energy: 0.7, targetEnergy: 0.8, setPhase: 'PEAK',
    phraseConfidence: 0.9, beatConfidence: 0.95, sectionConfidence: 0.8, deckSyncConfidence: 0.95, materialConfidence: 0.9,
    currentSection: a.sections.find((s) => s.start <= 20 && 20 < s.end), recentPatterns: [], intensity: 0, tension: 0.1, fallbackAvailable: true, sameTrackOnBothDecks: false,
    transitionApproachingSec: null, elapsedSec: 1800, juggledSec: 0, secondsSinceLastJuggle: Infinity, ...over,
  };
}

const PLAN = { mode: 'PERFORMER' as JuggleMode, intensityOverride: -1, seed: 3 };

// ── Gate C/E: the executor on exact beats ───────────────────────────────────

describe('juggle executor: patterns land on the beat through one sink', () => {
  it('JUG-PG-C: beat trading produces A B A B on exact musical beats, a layered payoff and a release', async () => {
    const { sink, result, startBeat } = await run('beatTrade');
    expect(result.completed).toBe(true);
    const cuts = sink.applied.filter((a) => a.action.type === 'CutIn');
    expect(cuts.slice(0, 4).map((c) => c.action.deck).join(' ')).toBe('A B A B');
    for (let i = 0; i < 4; i++) {
      expect(Math.abs(cuts[i].beat - (startBeat + i)), `cut ${i} on its beat`).toBeLessThan(0.05);
      expect(cuts[i].crossfader).toBe(i % 2 === 0 ? 0 : 1);
    }
    const hold = sink.applied.find((a) => a.action.type === 'HoldDeck');
    expect(hold?.crossfader).toBe(0.5);
    expect(sink.applied[sink.applied.length - 2].action.type).toBe('ReleaseDeck');
    expect(sink.crossfaderNow()).toBe(0);
    // Every executed action within one tick (15 ms = 0.03 beats) of its scheduled beat.
    for (const t of result.trace.filter((x) => x.status === 'executed')) expect(Math.abs((t.firedBeat ?? 0) - t.scheduledBeat)).toBeLessThan(0.05);
    expect(result.trace.every((t) => t.status === 'executed')).toBe(true);
  });

  it('JUG-PG-D: the escalating juggle trades 8 -> 4 -> 2 -> 1 bars -> beats, pays off and resolves back to the primary', async () => {
    const { sink, result, pattern } = await run('escalatingJuggle');
    expect(result.completed).toBe(true);
    const cuts = sink.applied.filter((a) => a.action.type === 'CutIn');
    // Fired beats carry at most one 15 ms tick (0.03 beats) of sampling jitter: round to the half beat.
    const gaps = cuts.slice(1).map((c, i) => Math.round((c.beat - cuts[i].beat) * 2) / 2);
    expect(gaps.slice(0, 8)).toEqual([32, 32, 16, 16, 8, 8, 4, 4]);
    expect(gaps.slice(8, 15).every((g) => g === 1)).toBe(true);
    expect(pattern.phases.map((p) => p.phase)).toEqual(['SETUP', 'ESTABLISH', 'INTENSIFY', 'PEAK', 'PAYOFF', 'RELEASE']);
    expect(sink.applied[sink.applied.length - 2].action.type).toBe('ReleaseDeck');
    expect(sink.crossfaderNow()).toBe(0);
  });

  it('JUG-PG-E: beat-level patterns stay phase-locked, keep one deck audible and the crossfader valid', async () => {
    for (const type of ['beatTrade', 'doubleBeat', 'transformer', 'dropAndReturn', 'barTrade', 'tightPhraseTrade'] as const) {
      const { sink, result, startBeat } = await run(type, { intensity: 0.9 });
      expect(result.completed, type).toBe(true);
      expect(result.fallbacks, `${type} never needed the no-silence fallback`).toBe(0);
      for (const a of sink.applied) {
        expect(a.crossfader >= 0 && a.crossfader <= 1, `${type} crossfader valid`).toBe(true);
        const st = sink.state();
        expect(st.audible.A || st.audible.B, `${type} one deck audible`).toBe(true);
        // Cuts land on the half-beat grid at worst.
        if (a.action.type === 'CutIn') expect(Math.abs(((a.beat - startBeat) * 2) - Math.round((a.beat - startBeat) * 2)), `${type} on the grid`).toBeLessThan(0.1);
      }
      // Actions in pattern order (section 47.6).
      const beats = result.trace.filter((t) => t.status === 'executed').map((t) => t.scheduledBeat);
      expect(beats).toEqual([...beats].sort((x, y) => x - y));
    }
  });

  it('JUG-S47.4 / S34: the governor blocks a cut to a deck that cannot sound and forces the safe deck when both fall silent', async () => {
    const { sink, result } = await run('beatTrade', {}, { A: true, B: false });
    expect(result.completed).toBe(true);
    const blocked = result.trace.filter((t) => t.status === 'blocked');
    expect(blocked.length).toBeGreaterThan(0);
    expect(blocked.every((t) => t.action.deck === 'B' && /not audible/.test(t.reason ?? ''))).toBe(true);
    for (const a of sink.applied) expect(a.crossfader, 'never cut away from the only playing deck').toBeLessThan(1);
  });

  it('JUG-S42.2 / S47.7: an abort mid-pattern resolves with a release to the primary, never a dead stop', async () => {
    const timers = new VirtualTimers();
    const sink = fakeSink({ A: true, B: true });
    const pattern = PATTERN_BUILDERS.barTrade(params());
    const exec = executeJuggle(pattern, 4, { clock: virtualClock(timers), sink, timers });
    await timers.run(9 * BEAT_SEC * 1000);
    expect(sink.crossfaderNow()).toBe(1);
    exec.abort('beat confidence dropped');
    const result = await exec.done;
    expect(result.completed).toBe(false);
    expect(result.reason).toBe('beat confidence dropped');
    expect(sink.applied[sink.applied.length - 2].action.type).toBe('ReleaseDeck');
    expect(sink.applied[sink.applied.length - 1].action.type).toBe('ResetDeck');
    expect(sink.crossfaderNow()).toBe(0);
    expect(result.trace.filter((t) => t.status === 'skipped').length).toBeGreaterThan(0);
    expect(timers.pending).toBe(0);
  });

  it('JUG-S32: the watchdog ends a pattern whose clock stalls', async () => {
    const timers = new VirtualTimers();
    const sink = fakeSink({ A: true, B: true });
    const pattern = PATTERN_BUILDERS.beatTrade(params());
    const stalled: JuggleClock = { beatNow: () => 0, beatSec: () => BEAT_SEC };
    const exec = executeJuggle(pattern, 0, { clock: stalled, sink, timers });
    await timers.run(60_000);
    const result = await exec.done;
    expect(result.completed).toBe(false);
    expect(result.reason).toMatch(/watchdog/);
    expect(timers.pending).toBe(0);
  });
});

// ── Gate H: loops, fills, transformer ───────────────────────────────────────

describe('loops, fills and transformer patterns', () => {
  it('JUG-PG-H: loop tightening goes 4 -> 2 -> 1 -> 1/2 -> 1/4 bars and exits on the bar with clean state', async () => {
    const { sink, result } = await run('loopTighten');
    expect(result.completed).toBe(true);
    const sizes = sink.applied.filter((a) => a.action.type === 'StartLoop' || a.action.type === 'LoopResize').map((a) => a.action.beats);
    expect(sizes).toEqual([16, 8, 4, 2, 1]);
    const exit = sink.applied.find((a) => a.action.type === 'ExitLoop');
    expect(exit && Math.abs((exit.beat - 8) % 4) < 0.05).toBe(true);
    expect(sink.loops.A).toBe(false);
    expect(sink.loops.B).toBe(false);
  });

  it('JUG-S20: the transformer is a pattern object the executor turns into crossfader gates', async () => {
    const { sink, pattern } = await run('transformer', { intensity: 0.9 });
    expect(pattern.actions.every((a) => JUGGLE_ACTION_TYPES.includes(a.type))).toBe(true);
    const cuts = sink.applied.filter((a) => a.action.type === 'CutIn');
    expect(cuts.length).toBe(16);
    expect(cuts.map((c) => c.action.deck).slice(0, 4).join('')).toBe('BABA');
  });

  it('JUG-S19 / S14: fill trading jumps the fill deck to the detected fill; drum/bass trading hands the low end over with EQ and restores it', async () => {
    const b = corpusAnalysis('drops');
    const fill = upcomingWindows(b, 'B', 0, 1, 40).find((w) => w.classes.includes('DRUM_FILL')) ?? classifyWindow(b, 'B', 4, 1);
    const ft = await run('fillTrade', { material: { fill } });
    expect(ft.result.completed).toBe(true);
    const jumps = ft.sink.applied.filter((a) => a.action.type === 'JumpToBar');
    expect(jumps.length).toBe(3);
    expect(jumps.every((j) => j.action.deck === 'B' && j.action.targetPosition === fill.startSec)).toBe(true);
    const db = await run('drumBassTrade');
    const types = db.sink.applied.map((a) => a.action.type);
    expect(types.filter((t) => t === 'EQCut').length).toBe(2);
    expect(types).toContain('BassSwap');
    expect(types.indexOf('EQRestore')).toBeGreaterThan(types.indexOf('BassSwap'));
    expect(db.pattern.roles.some((r) => r.A === 'LAYER' && r.B === 'LAYER')).toBe(true);
  });
});

// ── Gate F: call and response from the analysis and the tracker roles ────────

describe('call and response material', () => {
  it('JUG-PG-F: the response answers the call with a complementary class, never vocal on vocal, with an explanation', () => {
    const voice = corpusAnalysis('vocals');
    const answer = corpusAnalysis('drops');
    const cr = findCallAndResponse(voice, 'A', 30, answer, 'B', 0, 2);
    expect(cr).not.toBeNull();
    expect(cr!.reason).toMatch(/answered by B/);
    expect(cr!.call.classes.includes('VOCAL_HIT') && cr!.response.classes.includes('VOCAL_HIT')).toBe(false);
    expect(cr!.call.classes.includes('BASS_HIT') && cr!.response.classes.includes('BASS_HIT')).toBe(false);
  });

  it('JUG-S12 / S37 / S38 / S48.7: a tracker song offers its own events and time-varying channel roles as material', () => {
    const t = corpusAnalysis('tracker');
    expect(t.tracker).toBeTruthy();
    const windows = upcomingWindows(t, 'B', 0, 1, 60);
    const fromTracker = windows.filter((w) => w.source === 'tracker');
    expect(fromTracker.length, 'tracker-sourced windows').toBeGreaterThan(0);
    expect(fromTracker.some((w) => /tracker/.test(w.reason))).toBe(true);
    // The planner prefers tracker material: a call/response against the module scores the tracker component.
    const ctx = ctxFor({ setPhase: 'PEAK' }, { A: 'tracker', B: 'steady' });
    const d = planJuggle(ctx, { ...PLAN, mode: 'MUSICAL' });
    expect(d.candidates.find((c) => c.type === 'callResponse')?.components.tracker).toBe(1);
  });
});

// ── Gate G: doubles ─────────────────────────────────────────────────────────

describe('doubles', () => {
  it('JUG-PG-G / S16: the double resyncs the copy with an allowed offset, trades whole bars only and pays off aligned with one bass (owner plan sections 16, 17, 35)', async () => {
    const ctx = ctxFor({ sameTrackOnBothDecks: true }, { A: 'steady', B: 'steady' });
    const offset = doubleOffset(ctx, 5);
    expect([1, 2, 4, 8, 16]).toContain(offset);
    expect([4, 8, 16]).toContain(doubleOffset({ ...ctx, beatConfidence: 0.85 }, 5));
    const { sink, result } = await run('double', { double: { offsetBeats: offset, primaryPosition: 20 } });
    expect(result.completed).toBe(true);
    const resync = sink.applied.find((a) => a.action.type === 'ResyncDeck');
    expect(resync?.action.beats).toBe(offset);
    expect(resync?.action.targetPosition).toBe(20);
    const cuts = sink.applied.filter((a) => a.action.type === 'CutIn');
    for (const c of cuts) expect(Math.abs(c.beat - Math.round(c.beat))).toBeLessThan(0.05);
    // Phrase-level: every trade on a bar (the beat-level escalation is PERFORMER's beatTrade / transformer).
    const { pattern } = await run('double', { double: { offsetBeats: offset, primaryPosition: 20 } });
    for (const a of pattern.actions.filter((x) => x.type === 'CutIn')) expect(a.executeAtBeat % 4, `cut at pattern beat ${a.executeAtBeat}`).toBe(0);
    // Before the layer the silent copy is re-cued to zero offset, and the copy's bass is killed while both play.
    const hold = pattern.actions.find((a) => a.type === 'HoldDeck')!;
    const realign = pattern.actions.filter((a) => a.type === 'ResyncDeck').at(-1)!;
    expect(realign.beats).toBe(0);
    expect(realign.executeAtBeat).toBeLessThan(hold.executeAtBeat);
    const silentAtRealign = pattern.roles.filter((r) => r.beat <= realign.executeAtBeat).at(-1)!;
    expect(silentAtRealign.B).toBe('SILENT');
    const bassCut = pattern.actions.find((a) => a.type === 'EQCut');
    expect(bassCut?.deck).toBe('B');
    expect(bassCut!.executeAtBeat).toBeLessThanOrEqual(hold.executeAtBeat);
    const reset = pattern.actions.find((a) => a.type === 'ResetDeck' && a.deck === 'B');
    expect(reset!.executeAtBeat).toBeGreaterThan(hold.executeAtBeat);
  });

  it('JUG-S48.5: with the same track on both decks the planner only offers doubles and loop/beat work', () => {
    const d = planJuggle(ctxFor({ sameTrackOnBothDecks: true, lastJuggle: undefined }, { A: 'steady', B: 'steady' }), PLAN);
    expect(d.pattern).not.toBeNull();
    expect(['double', 'loopTighten', 'beatTrade', 'transformer']).toContain(d.pattern!.type);
    expect(d.candidates.find((c) => c.type === 'phraseTrade')?.blocked).toContain('same track: doubles only');
  });
});

// ── Owner plan section 44 / 35: the MUSICAL vocabulary ─────────────────────

describe('MUSICAL follows the owner\'s mode table', () => {
  it('MUSICAL is phrase trading plus call-response, fills and doubles: no beat cuts, and every layered moment has one bass owner', () => {
    expect([...MODE_PATTERNS.MUSICAL].sort()).toEqual(['callResponse', 'double', 'fillTrade', 'phraseTrade', 'tightPhraseTrade']);
    for (const type of MODE_PATTERNS.MUSICAL as LibraryPatternType[]) {
      const pattern = PATTERN_BUILDERS[type](params({ double: { offsetBeats: 4, primaryPosition: 20 } }));
      for (const a of pattern.actions.filter((x) => x.type === 'CutIn')) expect(a.executeAtBeat % 4, `${type}: cut at beat ${a.executeAtBeat}`).toBe(0);
      for (const hold of pattern.actions.filter((x) => x.type === 'HoldDeck')) {
        // A low band out on one deck at or before the layer, and not given back before it.
        const owner = pattern.actions.filter((x) => (x.type === 'EQCut' || x.type === 'BassSwap') && x.executeAtBeat <= hold.executeAtBeat).at(-1);
        expect(owner, `${type}: layer at beat ${hold.executeAtBeat} without a bass owner`).toBeDefined();
        const restored = pattern.actions.some((x) => (x.type === 'EQRestore' || x.type === 'ResetDeck') && (x.deck === owner!.deck || x.deck === 'BOTH') && x.executeAtBeat > owner!.executeAtBeat && x.executeAtBeat <= hold.executeAtBeat);
        expect(restored, `${type}: bass restored before the layer`).toBe(false);
      }
    }
  });
});

// ── Gate I/K/L: the adaptive planner ────────────────────────────────────────

describe('juggle planner: adaptive, safe, never random', () => {
  it('JUG-PG-I / S48.1: a standard 4/4 pair at the peak gets a pattern on a phrase boundary at least a bar ahead; opening gets none', () => {
    const d = planJuggle(ctxFor(), PLAN);
    expect(d.pattern).not.toBeNull();
    expect(d.startBeat - 40).toBeGreaterThanOrEqual(4);
    expect((d.startBeat - 40 + 8) % 32, 'phrase boundary').toBe(0);
    expect(d.reason).toMatch(/intensity/);
    const open = planJuggle(ctxFor({ setPhase: 'OPENING' }), PLAN);
    expect(open.pattern).toBeNull();
    expect(open.blocked.join()).toMatch(/OPENING/);
  });

  it('JUG-S48.2 / S23: a sparse pair (no drums on one deck) and a low energy get less aggressive patterns', () => {
    const dense = planJuggle(ctxFor(), PLAN);
    const sparse = planJuggle(ctxFor({ energy: 0.3, targetEnergy: 0.3, setPhase: 'CRUISING', deckB: { ...ctxFor().deckB, drumsActive: false } }), PLAN);
    expect(sparse.intensity).toBeLessThan(dense.intensity);
    expect(PATTERN_INTENSITY[sparse.pattern?.type ?? 'phraseTrade']).toBeLessThan(PATTERN_INTENSITY[dense.pattern!.type]);
  });

  it('JUG-S48.3 / S36: vocals on both decks block the juggle; a vocal on one deck steers away from layered patterns', () => {
    const both = planJuggle(ctxFor({ deckA: { ...ctxFor().deckA, vocalsActive: true }, deckB: { ...ctxFor().deckB, vocalsActive: true } }), PLAN);
    expect(both.pattern).toBeNull();
    expect(both.blocked).toContain('dense vocals on both decks');
    const one = planJuggle(ctxFor({ deckA: { ...ctxFor().deckA, vocalsActive: true } }), PLAN);
    expect(one.pattern).not.toBeNull();
    expect(one.candidates.find((c) => c.type === 'beatTrade')!.components.vocalFit).toBeLessThan(1);
  });

  it('JUG-S48.4 / S35: bass on both decks favours drum/bass trading with explicit ownership over layered beat trades', () => {
    const d = planJuggle(ctxFor({ setPhase: 'PEAKING' }), { ...PLAN, mode: 'MUSICAL' });
    const dbt = d.candidates.find((c) => c.type === 'drumBassTrade')!;
    const bt = d.candidates.find((c) => c.type === 'beatTrade')!;
    expect(dbt.components.bassFit).toBe(1);
    expect(bt.components.bassFit).toBeLessThan(dbt.components.bassFit);
  });

  it('JUG-S48.6 / S31: low confidence means a normal transition; moderate confidence means phrase trading only', () => {
    expect(confidencePolicy({ beatConfidence: 0.5, phraseConfidence: 0.9, deckSyncConfidence: 0.9, materialConfidence: 0.9 })).toBe('none');
    expect(confidencePolicy({ beatConfidence: 0.7, phraseConfidence: 0.7, deckSyncConfidence: 0.7, materialConfidence: 0.9 })).toBe('phrase');
    const low = planJuggle(ctxFor({ beatConfidence: 0.5 }), PLAN);
    expect(low.pattern).toBeNull();
    const mid = planJuggle(ctxFor({ beatConfidence: 0.7, deckSyncConfidence: 0.7, phraseConfidence: 0.7 }), PLAN);
    expect(mid.pattern).not.toBeNull();
    expect(['phraseTrade', 'tightPhraseTrade', 'callResponse', 'fillTrade', 'drumBassTrade', 'loopTighten']).toContain(mid.pattern!.type);
  });

  it('JUG-S47.8 / S29.2 / S50: history changes the choice - the last pattern never repeats at once and a badly scored pattern loses', () => {
    const first = planJuggle(ctxFor(), PLAN);
    const type = first.pattern!.type;
    const next = planJuggle(ctxFor({ lastJuggle: { patternType: type, durationBars: 4, intensity: 0.8, sourceTracks: [], successScore: 0.9, timestamp: 0, sequence: 'A B' }, recentPatterns: [{ patternType: type, durationBars: 4, intensity: 0.8, sourceTracks: [], successScore: 0.9, timestamp: 0, sequence: 'A B' }] }), PLAN);
    expect(next.pattern!.type).not.toBe(type);
    expect(next.candidates.find((c) => c.type === type)!.blocked).toContain('immediate repeat of the last pattern');
    const learned = planJuggle(ctxFor(), { ...PLAN, learned: (t) => (t === first.pattern!.type ? 0.05 : 0.9) });
    expect(learned.pattern!.type).not.toBe(first.pattern!.type);
  });

  it('JUG-S44: each mode draws from its own pattern set; SAFE is 8/4-bar trading, CHAOS still obeys confidence and safety', () => {
    expect(MODE_PATTERNS.SAFE).toEqual(['phraseTrade', 'tightPhraseTrade']);
    const safe = planJuggle(ctxFor({ setPhase: 'PEAK' }), { ...PLAN, mode: 'SAFE' });
    expect(['phraseTrade', 'tightPhraseTrade']).toContain(safe.pattern!.type);
    const chaosLow = planJuggle(ctxFor({ beatConfidence: 0.4 }), { ...PLAN, mode: 'CHAOS' });
    expect(chaosLow.pattern).toBeNull();
    const chaosVocal = planJuggle(ctxFor({ deckA: { ...ctxFor().deckA, vocalsActive: true }, deckB: { ...ctxFor().deckB, vocalsActive: true } }), { ...PLAN, mode: 'CHAOS' });
    expect(chaosVocal.pattern).toBeNull();
    expect(planJuggle(ctxFor(), { ...PLAN, mode: 'OFF' }).pattern).toBeNull();
  });

  it('JUG-S24 / S25: cooldown and budget keep the juggling occasional; a transition about to start blocks long patterns', () => {
    const cool = planJuggle(ctxFor({ secondsSinceLastJuggle: 10, lastJuggle: undefined }), PLAN);
    expect(cool.pattern).toBeNull();
    expect(cool.blocked.join()).toMatch(/cooldown/);
    const spent = planJuggle(ctxFor({ juggledSec: 1000, elapsedSec: 1800 }), PLAN);
    expect(spent.pattern).toBeNull();
    expect(spent.blocked.join()).toMatch(/budget/);
    const soon = planJuggle(ctxFor({ transitionApproachingSec: 60 }), PLAN);
    expect(soon.candidates.find((c) => c.type === 'escalatingJuggle')!.blocked.join()).toMatch(/bars/);
    expect(soon.pattern === null || patternBars(soon.pattern.type as LibraryPatternType, ctxFor()) <= 24).toBe(true);
    expect(planJuggle(ctxFor({ transitionApproachingSec: 10 }), PLAN).blocked).toContain('transition imminent');
  });

  it('JUG-S7 / S8 / S39: every pattern in the library carries a grammar, a sequence, explicit roles and resolves back to the primary', () => {
    for (const type of JUGGLE_PATTERN_TYPES) {
      const p = PATTERN_BUILDERS[type](params());
      expect(p.phases.length, type).toBeGreaterThan(0);
      expect(p.phases[p.phases.length - 1].phase, type).toBe('RELEASE');
      expect(p.sequence.length, type).toBeGreaterThan(0);
      expect(p.roles.length, type).toBeGreaterThan(0);
      expect(p.actions[p.actions.length - 2].type, `${type} releases`).toBe('ReleaseDeck');
      expect(p.actions.every((a) => a.executeAtBeat >= 0 && a.executeAtBeat <= p.durationBars * 4), type).toBe(true);
    }
    // Section 56.8: the meter drives the bar size.
    const waltz = PATTERN_BUILDERS.barTrade(params({ beatsPerBar: 3 }));
    expect(waltz.actions.filter((a) => a.type === 'CutIn')[1].executeAtBeat).toBe(3);
  });

  it('JUG-S52: the quality score rewards on-time, complete, safe juggles and penalises late, aborted ones', () => {
    const p = PATTERN_BUILDERS.beatTrade(params());
    const ctx = ctxFor();
    const good = scoreJuggleQuality(p, p.actions.map((a) => ({ action: a, scheduledBeat: a.executeAtBeat, firedBeat: a.executeAtBeat + 0.01, status: 'executed' as const })), ctx, { fallbacks: 0, aborted: false });
    const bad = scoreJuggleQuality(p, p.actions.map((a, i) => ({ action: a, scheduledBeat: a.executeAtBeat, firedBeat: a.executeAtBeat + 0.3, status: i % 2 ? 'blocked' as const : 'executed' as const })), ctx, { fallbacks: 1, aborted: true });
    expect(good.overall).toBeGreaterThan(bad.overall);
    expect(good.timing).toBeGreaterThan(0.9);
    expect(bad.safety).toBeLessThan(0.5);
  });
});

// ── Gate J/K/L/M + S49: the controller over a simulated set ─────────────────

interface SimDeck { id: CorpusId; start: number; playing: boolean }

function simController(timers: VirtualTimers, decks: Record<'A' | 'B', SimDeck>, opts: { mode: JuggleMode; seed?: number; intensity?: number }) {
  const playing = { A: decks.A.playing, B: decks.B.playing };
  const sink = fakeSink(playing);
  const analyses = { A: corpusAnalysis(decks.A.id), B: corpusAnalysis(decks.B.id) };
  const pos = (d: 'A' | 'B') => { const a = analyses[d]; return (decks[d].start + timers.now() / 1000) % Math.max(1, a.durationSec - 1); };
  const c = new DJJuggleController({
    sink, timers, now: () => timers.now(), positionOf: pos, seed: opts.seed ?? 1,
    clockFor: (_d, analysis, position) => analysisClock(analysis, position),
  });
  c.setMode(opts.mode);
  if (opts.intensity !== undefined) c.setIntensity(opts.intensity);
  const input = (over: Partial<TickInput> = {}): TickInput => ({
    masterDeck: 'A', setPhase: 'PEAK', energy: 0.7, targetEnergy: 0.8, performanceMode: 'JUGGLE', transitionApproachingSec: null,
    decks: {
      A: { trackId: decks.A.id, analysis: analyses.A, positionSec: pos('A'), playing: playing.A, bpm: analyses.A.bpm },
      B: { trackId: decks.B.id, analysis: analyses.B, positionSec: pos('B'), playing: playing.B, bpm: analyses.B.bpm },
    },
    ...over,
  });
  return { c, sink, playing, input, pos, analyses };
}

/** Drive the controller like the Auto DJ poll: a tick every 500 ms of virtual time. */
async function drive(timers: VirtualTimers, c: DJJuggleController, input: (t: number) => TickInput, seconds: number, onTick?: (t: number) => void) {
  const end = timers.now() + seconds * 1000;
  while (timers.now() < end) {
    const next = Math.min(end, timers.now() + 500);
    await timers.run(next);
    c.tick(input(timers.now() / 1000));
    onTick?.(timers.now() / 1000);
  }
}

describe('juggle controller: a set with two decks', () => {
  it('JUG-PG-B / PG-J: both decks on one clock; the controller starts a juggle, performs it through the sink and returns to normal mixing', async () => {
    const timers = new VirtualTimers();
    const { c, sink, input } = simController(timers, { A: { id: 'steady', start: 10, playing: true }, B: { id: 'compatibleKey', start: 12, playing: true } }, { mode: 'PERFORMER' });
    const ctx = c.buildContext(input());
    expect(ctx.deckA.beatIndex).toBeGreaterThan(0);
    expect(ctx.deckB.beatIndex).toBeGreaterThan(0);
    expect(ctx.deckSyncConfidence).toBeGreaterThan(0.8);
    expect(ctx.beatConfidence).toBeGreaterThan(0.8);
    await drive(timers, c, () => input(), 90);
    while (c.isActive()) await drive(timers, c, () => input(), 10);
    expect(c.counts.started).toBeGreaterThanOrEqual(1);
    expect(c.counts.completed).toBeGreaterThanOrEqual(1);
    expect(sink.applied.filter((a) => a.action.type === 'CutIn').length).toBeGreaterThan(2);
    expect(c.isActive()).toBe(false);
    expect(sink.crossfaderNow()).toBe(0);
    const t = c.telemetry();
    expect(t.mode).toBe('PERFORMER');
    expect(t.history.length).toBeGreaterThanOrEqual(1);
    expect(t.reason.length).toBeGreaterThan(0);
    expect(c.events.map((e) => e.kind)).toEqual(expect.arrayContaining(['jugglePatternSelected', 'juggleStarted', 'juggleActionScheduled', 'juggleActionExecuted', 'juggleCompleted']));
  });

  it('JUG-S48.8 / S43: a user crossfader move mid-juggle yields - the pattern releases and the controller waits', async () => {
    const timers = new VirtualTimers();
    const { c, sink, input } = simController(timers, { A: { id: 'steady', start: 10, playing: true }, B: { id: 'compatibleKey', start: 12, playing: true } }, { mode: 'PERFORMER' });
    let moved = false;
    await drive(timers, c, () => input({ userControl: moved ? 'crossfader' : null }), 60, () => { if (c.isActive() && !moved && c.currentExecution()!.trace.length > 2) moved = true; });
    expect(moved).toBe(true);
    expect(c.counts.aborted).toBeGreaterThanOrEqual(1);
    expect(c.events.find((e) => e.kind === 'juggleAborted')?.reason).toMatch(/user control/);
    const releaseIdx = sink.applied.findIndex((a) => a.action.type === 'ReleaseDeck');
    expect(releaseIdx).toBeGreaterThan(0);
    expect(sink.applied[releaseIdx + 1].action.type).toBe('ResetDeck');
  });

  it('JUG-S48.9 / S33: a deck failure mid-juggle aborts safely and the emergency path leaves one audible deck', async () => {
    const timers = new VirtualTimers();
    const { c, sink, playing, input } = simController(timers, { A: { id: 'steady', start: 10, playing: true }, B: { id: 'compatibleKey', start: 12, playing: true } }, { mode: 'PERFORMER' });
    let failed = false;
    await drive(timers, c, () => input({ decks: { ...input().decks, B: { ...input().decks.B, playing: playing.B } } }), 60, () => { if (c.isActive() && !failed && c.currentExecution()!.trace.length > 1) { playing.B = false; failed = true; } });
    expect(failed).toBe(true);
    expect(c.events.find((e) => e.kind === 'juggleAborted')?.reason).toMatch(/deck failure/);
    expect(sink.state().audible.A).toBe(true);
    c.emergency('test');
    expect(sink.state().audible.A || sink.state().audible.B).toBe(true);
    expect(sink.applied[sink.applied.length - 1].action.type).toBe('ResetDeck');
  });

  it('JUG-PG-L: two seeds over the same set do not produce identical performances', async () => {
    const seqs: string[] = [];
    for (const seed of [1, 2]) {
      const timers = new VirtualTimers();
      const { c, input } = simController(timers, { A: { id: 'steady', start: 10, playing: true }, B: { id: 'compatibleKey', start: 12, playing: true } }, { mode: 'CHAOS', seed });
      await drive(timers, c, () => input(), 600);
      seqs.push(c.getHistory().map((h) => `${h.patternType}:${h.intensity.toFixed(2)}`).join(','));
      expect(c.getHistory().length).toBeGreaterThanOrEqual(2);
    }
    expect(seqs[0]).not.toBe(seqs[1]);
  }, 60_000);

  it('JUG-S48.10 / S49: an hour of juggling - no runaway, no immediate repeats, no stuck loops, no timers left, budget respected', async () => {
    const timers = new VirtualTimers();
    const { c, sink, input } = simController(timers, { A: { id: 'steady', start: 10, playing: true }, B: { id: 'compatibleKey', start: 12, playing: true } }, { mode: 'AGGRESSIVE', seed: 7 });
    const phases: SetEnergyPhase[] = ['BUILDING', 'CRUISING', 'PEAKING', 'PEAK', 'RELEASE', 'PEAK'];
    let maxPending = 0;
    await drive(timers, c, (t) => input({ setPhase: phases[Math.floor(t / 600) % phases.length] }), 3600, () => { maxPending = Math.max(maxPending, timers.pending); });
    // The hour may end inside a pattern: let it resolve, as the set would.
    while (c.isActive()) await drive(timers, c, () => input({ setPhase: 'PEAK' }), 10);
    const h = c.getHistory();
    expect(h.length).toBeGreaterThanOrEqual(6);
    for (let i = 1; i < h.length; i++) expect(h[i].patternType, `juggle ${i} differs from the previous`).not.toBe(h[i - 1].patternType);
    expect(c.counts.fallbacks, c.events.filter((e) => e.kind === 'juggleFallback' || e.kind === 'juggleActionBlocked').map((e) => `${e.reason} (${e.action?.type} ${e.action?.deck} @${e.beat.toFixed(2)} in ${e.pattern})`).join('; ')).toBe(0);
    expect(maxPending).toBeLessThanOrEqual(2);
    expect(timers.pending).toBe(0);
    expect(c.isActive()).toBe(false);
    expect(sink.loops.A || sink.loops.B).toBe(false);
    expect(sink.crossfaderNow()).toBe(0);
    const t = c.telemetry();
    expect(t.budget.juggledFraction).toBeLessThan(0.6);
    expect(t.history.length).toBe(5);
    const openCrossfaders = sink.applied.filter((a) => a.crossfader < 0 || a.crossfader > 1);
    expect(openCrossfaders.length).toBe(0);
  }, 120_000);
});

// ── The juggle transition's ladder as the owner plan asks (audit 2026-10-11 rows 9, 13, 14, 15, 16) ──

describe('juggle controller: the transition ladder follows the owner plan', () => {
  const ladderRun = async (opts: { mode?: JuggleMode; phaseError?: number; setPhase?: SetEnergyPhase; bpmB?: number; ladderBars?: number[] }) => {
    const timers = new VirtualTimers();
    const { c, sink, input } = simController(timers, { A: { id: 'steady', start: 15.2381, playing: true }, B: { id: 'compatibleKey', start: 0, playing: true } }, { mode: opts.mode ?? 'PERFORMER' });
    if (opts.phaseError !== undefined) (sink as JuggleActionSink).phaseError = () => opts.phaseError!;
    const base = input({ performanceMode: 'JUGGLE_TRANSITION', setPhase: opts.setPhase ?? 'PEAK' });
    if (opts.bpmB !== undefined) base.decks.B.bpm = opts.bpmB;
    const done = c.performLadder(base, { ladderBars: opts.ladderBars ?? [4, 2, 1, 1], target: 'B' });
    await timers.run(80_000);
    const result = await done;
    const cutsB = sink.applied.filter((a) => a.action.type === 'CutIn' && a.action.deck === 'B');
    return { c, sink, result, cutsB, pattern: c.currentExecution()?.pattern ?? c.getLastDecision()?.pattern ?? null };
  };

  it('section 16: the incoming whose bar phase is not verified before its first bar is never heard - the ladder releases', async () => {
    const off = await ladderRun({ phaseError: 0.05 });
    expect(off.result.completed).toBe(false);
    expect(off.result.reason).toContain('phase not verified');
    expect(off.cutsB).toHaveLength(0);
    // Locked first: the PhaseLock reaches the sink before any cut.
    expect(off.sink.applied[0].action.type).toBe('PhaseLock');
    const locked = await ladderRun({ phaseError: 0.002 });
    expect(locked.result.completed).toBe(true);
    expect(locked.cutsB.length).toBe(4);
  });

  it('sections 31, 44: MUSICAL never trades single bars, and moderate confidence at the ladder coarsens 1-bar rungs to 2 - the same length', async () => {
    const musical = await ladderRun({ mode: 'MUSICAL' });
    expect(musical.c.getLastDecision()?.pattern?.ladderBars).toEqual([4, 2, 2]);
    expect(musical.result.completed).toBe(true);
    // The incoming 1 % off the master: the decks' sync is no longer beat-level.
    const drift = await ladderRun({ bpmB: corpusAnalysis('compatibleKey').bpm * 1.01 });
    expect(drift.c.getLastDecision()?.pattern?.ladderBars).toEqual([4, 2, 2]);
    expect(drift.c.getLastDecision()?.reason).toContain('traded as 4-2-2');
    const performer = await ladderRun({});
    expect(performer.c.getLastDecision()?.pattern?.ladderBars).toEqual([4, 2, 1, 1]);
  });

  it('sections 24, 28: the juggle budget is checked again when the ladder starts - OPENING mixes normally', async () => {
    const opening = await ladderRun({ setPhase: 'OPENING' });
    expect(opening.result.completed).toBe(false);
    expect(opening.result.reason).toContain('set phase OPENING');
    expect(opening.sink.applied).toHaveLength(0);
  });
});
