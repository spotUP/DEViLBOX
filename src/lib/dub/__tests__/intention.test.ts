import { describe, it, expect } from 'vitest';
import { IntentionPlanner } from '../intention';
import {
  PerformanceMemory,
  buildPerformanceContext,
  readWetEnergy,
  type ArrangementSnapshot,
} from '../performanceContext';
import type { ChannelEventSource } from '../musicalEvents';
import { buildMusicalChannelProfile } from '../musicalChannelProfile';

const TICKS_PER_ROW = 6;          // 4 rows/beat, 16 rows/bar, 256 rows/phrase
const ROWS_PER_BAR = 16;
const ROWS_PER_PHRASE = 256;

const CALM = { returnGain: 0.5, echoWet: 0.3, springWet: 0.1, echoIntensity: 0.3, extFeedbackGain: 0 };
const DRENCHED = { returnGain: 1, echoWet: 1, springWet: 1, echoIntensity: 0.5, extFeedbackGain: 0 };
const RUNAWAY = { returnGain: 0.9, echoWet: 0.6, springWet: 0.2, echoIntensity: 0.9, extFeedbackGain: 0.1 };

interface CtxOpts {
  row?: number;
  sources?: ChannelEventSource[];
  bus?: typeof CALM;
  gestures?: number;
  arrangement?: ArrangementSnapshot | null;
  memory?: PerformanceMemory;
  profiles?: ReadonlyMap<number, ReturnType<typeof buildMusicalChannelProfile>>;
}

function ctx(opts: CtxOpts = {}) {
  const memory = opts.memory ?? new PerformanceMemory();
  return buildPerformanceContext(memory, {
    row: opts.row ?? 0,
    ticksPerRow: TICKS_PER_ROW,
    bpm: 120,
    sources: opts.sources ?? [],
    channelProfiles: opts.profiles,
    arrangement: opts.arrangement ?? null,
    energy: readWetEnergy(opts.bus ?? CALM, opts.gestures ?? 0),
  });
}

/** A memory that has just seen the player fire something by hand. */
function memoryWithUserMove(row: number, moveId = 'echoThrow', channelId = 2) {
  const memory = new PerformanceMemory();
  memory.noteFire({
    invocationId: 'u1', moveId, channelId, row, timeSec: 1, source: 'live', isHold: false,
  });
  return memory;
}

describe('IntentionPlanner — REST is a decision, not a failed dice roll', () => {
  it('commits to a multi-bar rest and honours it on later ticks', () => {
    const planner = new IntentionPlanner({ restBars: 2, restEveryPhrases: 1 });
    const memory = new PerformanceMemory();

    // A busy phrase, then the phrase turns.
    memory.observePosition({ phrase: 0 });
    memory.noteFire({
      invocationId: 'a', moveId: 'echoThrow', row: 8, timeSec: 1, source: 'live', isHold: false,
    });
    memory.observePosition({ phrase: 1 });

    const atPhraseEdge = ctx({ row: ROWS_PER_PHRASE, memory });
    const first = planner.decide(atPhraseEdge);
    expect(first.intention).toBe('REST');
    expect(first.holdBars).toBe(2);
    expect(first.reason).toMatch(/taking space/);

    // A tick later, mid-rest: still resting, without re-deciding.
    const midRest = ctx({ row: ROWS_PER_PHRASE + ROWS_PER_BAR, memory });
    expect(planner.decide(midRest).intention).toBe('REST');
    expect(planner.isResting(Math.floor(midRest.position.bar))).toBe(true);

    // After the committed span, the performer is free again.
    const afterRest = ctx({ row: ROWS_PER_PHRASE + ROWS_PER_BAR * 2, memory });
    expect(planner.isResting(Math.floor(afterRest.position.bar))).toBe(false);
  });

  it('does not rest twice in consecutive phrases', () => {
    const planner = new IntentionPlanner({ restBars: 1, restEveryPhrases: 1 });
    const memory = new PerformanceMemory();
    memory.observePosition({ phrase: 0 });
    memory.noteFire({
      invocationId: 'a', moveId: 'echoThrow', row: 8, timeSec: 1, source: 'live', isHold: false,
    });
    memory.observePosition({ phrase: 1 });

    expect(planner.decide(ctx({ row: ROWS_PER_PHRASE, memory })).reason).toMatch(/taking space/);
    // Phrase 1 was also busy and turns over — but resting again immediately
    // would leave nothing to contrast with.
    memory.noteFire({
      invocationId: 'b', moveId: 'dubStab', row: ROWS_PER_PHRASE + 8, timeSec: 2, source: 'live', isHold: false,
    });
    memory.observePosition({ phrase: 2 });
    const next = planner.decide(ctx({ row: ROWS_PER_PHRASE * 2, memory }));
    expect(next.reason).not.toMatch(/taking space/);
  });

  it('does not rest after a phrase that was already silent', () => {
    const planner = new IntentionPlanner({ restBars: 2, restEveryPhrases: 1 });
    const memory = new PerformanceMemory();
    memory.observePosition({ phrase: 0 });   // nothing fired
    memory.observePosition({ phrase: 1 });
    const d = planner.decide(ctx({ row: ROWS_PER_PHRASE, memory }));
    expect(d.reason).not.toMatch(/taking space/);
  });

  it('a decision to do nothing right now still carries a reason', () => {
    const planner = new IntentionPlanner();
    const d = planner.decide(ctx({ row: 4 }));
    expect(d.intention).toBe('REST');
    expect(d.reason).toBe('nothing worth doing yet');
    expect(d.holdBars).toBe(1);
  });
});

describe('IntentionPlanner — safety and energy outrank taste', () => {
  it('RESETs when feedback reaches the ceiling, even with a snare approaching', () => {
    const planner = new IntentionPlanner();
    const d = planner.decide(ctx({
      row: 3,
      bus: RUNAWAY,
      sources: [{ channel: 1, onsets: [{ row: 4, strength: 1 }] }],
    }));
    expect(d.intention).toBe('RESET');
    expect(d.target.kind).toBe('mix');
  });

  it('gives SPACE instead of adding when the mix is already drenched', () => {
    const planner = new IntentionPlanner();
    expect(planner.decide(ctx({ row: 3, bus: DRENCHED })).intention).toBe('SPACE');
  });

  it('gives SPACE when two gestures are already in flight', () => {
    const planner = new IntentionPlanner();
    expect(planner.decide(ctx({ row: 3, gestures: 2 })).intention).toBe('SPACE');
  });
});

describe('IntentionPlanner — answering the player', () => {
  it('ANSWERs a move the user just made, on the channel they used', () => {
    const planner = new IntentionPlanner({ answerWithinRows: 8 });
    const d = planner.decide(ctx({ row: 6, memory: memoryWithUserMove(4) }));
    expect(d.intention).toBe('ANSWER');
    expect(d.target).toMatchObject({ kind: 'channel', channelId: 2 });
    expect(d.reason).toMatch(/the player fired echoThrow/);
  });

  it('stops answering once the move is out of the window', () => {
    const planner = new IntentionPlanner({ answerWithinRows: 8 });
    const d = planner.decide(ctx({ row: 40, memory: memoryWithUserMove(4) }));
    expect(d.intention).not.toBe('ANSWER');
  });

  it('does not answer the performer\'s own lane playback', () => {
    const memory = new PerformanceMemory();
    memory.noteFire({
      invocationId: 'l', moveId: 'echoThrow', channelId: 2, row: 4, timeSec: 1,
      source: 'lane', isHold: false,
    });
    const planner = new IntentionPlanner();
    expect(planner.decide(ctx({ row: 6, memory })).intention).not.toBe('ANSWER');
  });
});

describe('IntentionPlanner — musical structure', () => {
  it('marks a TRANSITION at the end of the last bar of a phrase', () => {
    const planner = new IntentionPlanner();
    // Bar 15 of a 16-bar phrase, three quarters through the bar.
    const row = ROWS_PER_BAR * 15 + 12;
    expect(planner.decide(ctx({ row })).intention).toBe('TRANSITION');
  });

  it('marks a TRANSITION when the pattern order is about to turn', () => {
    const planner = new IntentionPlanner();
    const arrangement: ArrangementSnapshot = {
      orderIndex: 30, orderLength: 31, patternIndex: 11,
      patternRows: 64, isLastInOrder: true, patternChangesNext: false,
    };
    expect(planner.decide(ctx({ row: 13, arrangement })).intention).toBe('TRANSITION');
  });

  it('ACCENTs a strong onset that has not sounded yet', () => {
    const planner = new IntentionPlanner({ accentWindow: '1/8', accentStrength: 0.5 });
    const d = planner.decide(ctx({
      row: 2,
      sources: [{ channel: 1, onsets: [{ row: 3, strength: 0.9 }] }],
    }));
    expect(d.intention).toBe('ACCENT');
    expect(d.target).toMatchObject({ kind: 'channel', channelId: 1 });
  });

  it('ignores an onset too weak to be worth accenting', () => {
    const planner = new IntentionPlanner({ accentStrength: 0.5 });
    const d = planner.decide(ctx({
      row: 2,
      sources: [{ channel: 1, onsets: [{ row: 3, strength: 0.2 }] }],
    }));
    expect(d.intention).not.toBe('ACCENT');
  });

  it('prefers the backbeat channel when two onsets compete', () => {
    const backbeat = buildMusicalChannelProfile(
      { channel: 1 },
      { rhythmicRole: 'backbeat', instrumentFamily: 'drums' },
    );
    const planner = new IntentionPlanner({ accentStrength: 0.4 });
    const d = planner.decide(ctx({
      row: 2,
      sources: [
        { channel: 0, onsets: [{ row: 3, strength: 0.7 }] },
        { channel: 1, onsets: [{ row: 3, strength: 0.6 }], profile: backbeat },
      ],
    }));
    expect(d.target).toMatchObject({ channelId: 1 });
  });

  it('BUILDs through the second half of a phrase while the mix is still dry', () => {
    const planner = new IntentionPlanner();
    const row = ROWS_PER_PHRASE / 2 + ROWS_PER_BAR;   // past halfway, not at an edge
    const d = planner.decide(ctx({
      row,
      bus: { returnGain: 0.2, echoWet: 0.2, springWet: 0, echoIntensity: 0.2, extFeedbackGain: 0 },
    }));
    expect(d.intention).toBe('BUILD');
  });

  it('fills with TEXTURE after a long stretch of nothing', () => {
    const planner = new IntentionPlanner({ textureAfterRows: 16 });
    const memory = new PerformanceMemory();
    memory.noteFire({
      invocationId: 'a', moveId: 'dubStab', row: 0, timeSec: 0, source: 'lane', isHold: false,
    });
    const d = planner.decide(ctx({ row: 40, memory }));
    expect(d.intention).toBe('TEXTURE');
  });
});

describe('IntentionPlanner — lifecycle', () => {
  it('drops a rest commitment on reset, because the transport moved', () => {
    const planner = new IntentionPlanner({ restBars: 4, restEveryPhrases: 1 });
    const memory = new PerformanceMemory();
    memory.observePosition({ phrase: 0 });
    memory.noteFire({
      invocationId: 'a', moveId: 'echoThrow', row: 8, timeSec: 1, source: 'live', isHold: false,
    });
    memory.observePosition({ phrase: 1 });
    planner.decide(ctx({ row: ROWS_PER_PHRASE, memory }));
    expect(planner.isResting(16)).toBe(true);
    planner.reset();
    expect(planner.isResting(16)).toBe(false);
  });

  it('takes persona policy overrides', () => {
    const planner = new IntentionPlanner({ restBars: 8 });
    expect(planner.getPolicy().restBars).toBe(8);
    planner.setPolicy({ restBars: 3 });
    expect(planner.getPolicy().restBars).toBe(3);
    expect(planner.getPolicy().restEveryPhrases).toBe(2);   // untouched default
  });
});
