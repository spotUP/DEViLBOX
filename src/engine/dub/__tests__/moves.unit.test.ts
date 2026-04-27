/**
 * Unit tests for the dub-move files under `src/engine/dub/moves/`.
 *
 * Each move is a small pure-ish function: take a `DubMoveContext` (bus,
 * channelId, params, bpm), call one or two DubBus methods, return either a
 * disposer or null. This test file stubs the bus (every method is a
 * `vi.fn()` returning another `vi.fn()` where a release callback is
 * expected) and asserts the wiring.
 *
 * What this guards (G14):
 *   - DSP-tweak regressions — if someone renames `bus.startSiren` and
 *     dubSiren still calls the old name, this fails.
 *   - Default-param bitrot — tests lock in every move's `defaults` record.
 *   - Disposer semantics — hold-move `dispose()` MUST invoke the bus's
 *     release callback. Trigger-moves-with-timers MUST cancel the timer
 *     on dispose so panic-releases don't leak callbacks.
 *   - channelId guards — per-channel moves MUST return null without
 *     touching the bus when channelId is undefined (otherwise they'd
 *     happen-to-target channel 0 silently).
 *
 * What this does NOT cover:
 *   - `transportTapeStop`, `masterDrop`, `toast`, `echoBuildUp` — each
 *     owns a multi-step timeline or cross-store coordination; they
 *     deserve dedicated integration tests.
 *   - Actual audio output — we're testing the call graph, not the DSP.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// The mixer store is touched by a couple of moves (channelMute). Mock it
// BEFORE any move import so the bare-module import of useMixerStore inside
// the move files resolves to our fake.
const mixerChannels: Array<{ muted: boolean; dubSend: number }> = [];
const mixerMutations = {
  setChannelMute: vi.fn(),
  setChannelDubSend: vi.fn(),
};
vi.mock('@/stores/useMixerStore', () => ({
  useMixerStore: {
    getState: () => ({
      channels: mixerChannels,
      setChannelMute: mixerMutations.setChannelMute,
      setChannelDubSend: mixerMutations.setChannelDubSend,
    }),
  },
}));

import { echoThrow } from '../moves/echoThrow';
import { dubStab } from '../moves/dubStab';
import { channelThrow } from '../moves/channelThrow';
import { channelMute } from '../moves/channelMute';
import { filterDrop } from '../moves/filterDrop';
import { dubSiren } from '../moves/dubSiren';
import { springSlam } from '../moves/springSlam';
import { snareCrack } from '../moves/snareCrack';
import { delayTimeThrow } from '../moves/delayTimeThrow';
import { oscBass } from '../moves/oscBass';
import { crushBass } from '../moves/crushBass';
import { subHarmonic } from '../moves/subHarmonic';
import { sonarPing } from '../moves/sonarPing';
import { radioRiser } from '../moves/radioRiser';
import { subSwell } from '../moves/subSwell';
import { tubbyScream } from '../moves/tubbyScream';
import { stereoDoubler } from '../moves/stereoDoubler';
import { reverseEcho } from '../moves/reverseEcho';
import { tapeWobble } from '../moves/tapeWobble';
import { tapeStop } from '../moves/tapeStop';
import { backwardReverb } from '../moves/backwardReverb';
import { delayPreset380, delayPresetDotted } from '../moves/delayPreset';
import { springKick } from '../moves/springKick';
import { delayPresetQuarter, delayPreset8th, delayPresetTriplet, delayPreset16th, delayPresetDoubler } from '../moves/delayPreset';
import { eqSweep } from '../moves/eqSweep';
import { ghostReverb } from '../moves/ghostReverb';
import { voltageStarve } from '../moves/voltageStarve';
import { ringMod } from '../moves/ringMod';
import { hpfRise } from '../moves/hpfRise';
import { madProfPingPong } from '../moves/madProfPingPong';

/**
 * A `DubBus` stub where every method under test is a spy. Methods that
 * return a "release" function in production return a fresh spy here so
 * the tests can assert disposer delegation. Anything the moves don't
 * call stays absent — an undefined-method call will throw loudly
 * instead of silently succeeding, which is what we want.
 */
function buildFakeBus() {
  const release = {
    channelTap: vi.fn(),
    soloTap: vi.fn(),
    filterDrop: vi.fn(),
    siren: vi.fn(),
    oscBass: vi.fn(),
    crushBass: vi.fn(),
    subHarmonic: vi.fn(),
    tubbyScream: vi.fn(),
    stereoDoubler: vi.fn(),
    tapeWobble: vi.fn(),
    eqSweep: vi.fn(),
  };
  const bus = {
    openChannelTap: vi.fn().mockReturnValue(release.channelTap),
    soloChannelTap: vi.fn().mockReturnValue(release.soloTap),
    modulateFeedback: vi.fn(),
    filterDrop: vi.fn().mockReturnValue(release.filterDrop),
    startSiren: vi.fn().mockReturnValue(release.siren),
    startOscBass: vi.fn().mockReturnValue(release.oscBass),
    startCrushBass: vi.fn().mockReturnValue(release.crushBass),
    startSubHarmonic: vi.fn().mockReturnValue(release.subHarmonic),
    startTubbyScream: vi.fn().mockReturnValue(release.tubbyScream),
    startStereoDoubler: vi.fn().mockReturnValue(release.stereoDoubler),
    startTapeWobble: vi.fn().mockReturnValue(release.tapeWobble),
    fireNoiseBurst: vi.fn(),
    firePing: vi.fn(),
    fireRadioRiser: vi.fn(),
    fireSubSwell: vi.fn(),
    slamSpring: vi.fn(),
    kickSpring: vi.fn(),
    startHpfRise: vi.fn().mockReturnValue(vi.fn()),
    startPingPong: vi.fn().mockReturnValue(vi.fn()),
    startEQSweep: vi.fn().mockReturnValue(vi.fn()),
    throwEchoTime: vi.fn(),
    startTapeHold: vi.fn().mockReturnValue(vi.fn()),
    reverseEcho: vi.fn().mockResolvedValue(undefined),
    backwardReverb: vi.fn().mockResolvedValue(undefined),
    setEchoRate: vi.fn(),
    getEchoRateMs: vi.fn().mockReturnValue(300),
    setSettings: vi.fn(),
  };
  return { bus, release };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ctx(bus: any, extras: Partial<{ channelId: number; params: Record<string, number>; bpm: number }> = {}) {
  return {
    bus,
    channelId: extras.channelId,
    params: extras.params ?? {},
    bpm: extras.bpm ?? 120,
    source: 'live' as const,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  mixerChannels.length = 0;
  mixerMutations.setChannelMute.mockClear();
  mixerMutations.setChannelDubSend.mockClear();
});

// ── echoThrow ──────────────────────────────────────────────────────────────
describe('echoThrow', () => {
  it('returns null without touching the bus when channelId is undefined', () => {
    const { bus } = buildFakeBus();
    const r = echoThrow.execute(ctx(bus));
    expect(r).toBeNull();
    expect(bus.openChannelTap).not.toHaveBeenCalled();
  });

  it('opens the channel tap + boosts feedback with default params', () => {
    const { bus } = buildFakeBus();
    echoThrow.execute(ctx(bus, { channelId: 3, bpm: 120 }));
    expect(bus.openChannelTap).toHaveBeenCalledWith(3, 1.0, 0.005);
    // 0.5 beats at 120 BPM = 250 ms
    expect(bus.modulateFeedback).toHaveBeenCalledWith(0.15, 250);
  });

  it('honours custom throwBeats + feedbackBoost', () => {
    const { bus } = buildFakeBus();
    echoThrow.execute(ctx(bus, { channelId: 2, bpm: 100, params: { throwBeats: 1, feedbackBoost: 0.3 } }));
    // 1 beat at 100 BPM = 600 ms
    expect(bus.modulateFeedback).toHaveBeenCalledWith(0.3, 600);
  });

  it('closes the tap once the hold window elapses', () => {
    const { bus, release } = buildFakeBus();
    echoThrow.execute(ctx(bus, { channelId: 0, bpm: 120 }));
    vi.advanceTimersByTime(260);  // past 250 ms
    expect(release.channelTap).toHaveBeenCalled();
  });

  it('dispose cancels the pending close and closes immediately', () => {
    const { bus, release } = buildFakeBus();
    const disp = echoThrow.execute(ctx(bus, { channelId: 0 }));
    expect(release.channelTap).not.toHaveBeenCalled();
    disp!.dispose();
    expect(release.channelTap).toHaveBeenCalledTimes(1);
    // The timer callback, if not cancelled, would call close a second time.
    vi.runAllTimers();
    expect(release.channelTap).toHaveBeenCalledTimes(1);
  });
});

// ── dubStab ─────────────────────────────────────────────────────────────────
describe('dubStab', () => {
  it('uses a stronger feedback boost than echoThrow and lets it linger past the tap', () => {
    const { bus } = buildFakeBus();
    dubStab.execute(ctx(bus, { channelId: 1, bpm: 120 }));
    // 0.25 beats at 120 BPM = 125 ms tap; feedback lingers +300 ms.
    expect(bus.modulateFeedback).toHaveBeenCalledWith(0.4, 425);
  });

  it('returns null when channelId is undefined', () => {
    const { bus } = buildFakeBus();
    expect(dubStab.execute(ctx(bus))).toBeNull();
    expect(bus.openChannelTap).not.toHaveBeenCalled();
  });
});

// ── channelThrow ───────────────────────────────────────────────────────────
describe('channelThrow', () => {
  it('runs the signature "drop into the echo" 4-beat throw', () => {
    const { bus } = buildFakeBus();
    channelThrow.execute(ctx(bus, { channelId: 0, bpm: 120 }));
    expect(bus.openChannelTap).toHaveBeenCalledWith(0, 1.0, 0.010);
    // 4 beats at 120 = 2000 ms tap; feedback duration = 2000 + 600 = 2600.
    expect(bus.modulateFeedback).toHaveBeenCalledWith(0.30, 2600);
  });
});

// ── channelMute ────────────────────────────────────────────────────────────
describe('channelMute', () => {
  it('returns null without side-effects when channelId is undefined', () => {
    const { bus } = buildFakeBus();
    const r = channelMute.execute(ctx(bus));
    expect(r).toBeNull();
    expect(mixerMutations.setChannelMute).not.toHaveBeenCalled();
  });

  it('mutes the channel on fire and un-mutes on dispose when it was previously unmuted', () => {
    const { bus } = buildFakeBus();
    mixerChannels[2] = { muted: false, dubSend: 0 };
    const disp = channelMute.execute(ctx(bus, { channelId: 2 }));
    expect(mixerMutations.setChannelMute).toHaveBeenCalledWith(2, true);
    mixerMutations.setChannelMute.mockClear();
    disp!.dispose();
    expect(mixerMutations.setChannelMute).toHaveBeenCalledWith(2, false);
  });

  it('does NOT un-mute a channel that was already muted before the move fired', () => {
    const { bus } = buildFakeBus();
    mixerChannels[0] = { muted: true, dubSend: 0 };
    const disp = channelMute.execute(ctx(bus, { channelId: 0 }));
    expect(mixerMutations.setChannelMute).not.toHaveBeenCalled();
    disp!.dispose();
    expect(mixerMutations.setChannelMute).not.toHaveBeenCalled();
  });
});

// ── filterDrop ─────────────────────────────────────────────────────────────
describe('filterDrop', () => {
  it('sweeps the LPF with default params and no channel solo when channelId is undefined', () => {
    const { bus, release } = buildFakeBus();
    const disp = filterDrop.execute(ctx(bus));
    expect(bus.filterDrop).toHaveBeenCalledWith(220, 0.4, 0.6);
    expect(bus.soloChannelTap).not.toHaveBeenCalled();
    disp!.dispose();
    expect(release.filterDrop).toHaveBeenCalled();
  });

  it('solos the target channel tap AND releases both on dispose', () => {
    const { bus, release } = buildFakeBus();
    const disp = filterDrop.execute(ctx(bus, { channelId: 1 }));
    expect(bus.soloChannelTap).toHaveBeenCalledWith(1, 0.005);
    disp!.dispose();
    expect(release.filterDrop).toHaveBeenCalled();
    expect(release.soloTap).toHaveBeenCalled();
  });
});

// ── dubSiren ───────────────────────────────────────────────────────────────
describe('dubSiren', () => {
  it('starts the siren synth and returns its release as the disposer', () => {
    const { bus, release } = buildFakeBus();
    const disp = dubSiren.execute(ctx(bus));
    expect(bus.startSiren).toHaveBeenCalledTimes(1);
    disp!.dispose();
    expect(release.siren).toHaveBeenCalled();
  });
});

// ── springSlam ─────────────────────────────────────────────────────────────
describe('springSlam', () => {
  it('slams every channel when channelId is undefined', () => {
    const { bus } = buildFakeBus();
    const r = springSlam.execute(ctx(bus));
    expect(r).toBeNull();
    expect(bus.slamSpring).toHaveBeenCalledWith(1.0, 400);
    expect(bus.soloChannelTap).not.toHaveBeenCalled();
  });

  it('solos the target channel for the slam window, then releases the solo after holdMs', () => {
    const { bus, release } = buildFakeBus();
    springSlam.execute(ctx(bus, { channelId: 2 }));
    expect(bus.soloChannelTap).toHaveBeenCalledWith(2, 0.003);
    expect(release.soloTap).not.toHaveBeenCalled();
    vi.advanceTimersByTime(410);  // past 400 ms
    expect(release.soloTap).toHaveBeenCalled();
  });
});

// ── snareCrack / sonarPing / radioRiser / subSwell — one-shot generators ──
describe('snareCrack', () => {
  it('fires a noise burst with default shape', () => {
    const { bus } = buildFakeBus();
    snareCrack.execute(ctx(bus));
    expect(bus.fireNoiseBurst).toHaveBeenCalledWith(80, 1.0);
  });
});
describe('sonarPing', () => {
  it('fires a ping with default 1kHz / 200ms / 0.8 level', () => {
    const { bus } = buildFakeBus();
    sonarPing.execute(ctx(bus));
    expect(bus.firePing).toHaveBeenCalledWith(1000, 200, 0.8);
  });
});
describe('radioRiser', () => {
  it('sweeps 200→5000 Hz over default 1.2 s', () => {
    const { bus } = buildFakeBus();
    radioRiser.execute(ctx(bus));
    expect(bus.fireRadioRiser).toHaveBeenCalledWith(200, 5000, 1.2, 0.7);
  });
});
describe('subSwell', () => {
  it('fires a sub swell with default 55 Hz / 400 ms', () => {
    const { bus } = buildFakeBus();
    subSwell.execute(ctx(bus));
    expect(bus.fireSubSwell).toHaveBeenCalledWith(55, 400, 0.8);
  });
});

// ── delayTimeThrow ─────────────────────────────────────────────────────────
describe('delayTimeThrow', () => {
  it('passes all 4 timeline params to the bus in order', () => {
    const { bus } = buildFakeBus();
    delayTimeThrow.execute(ctx(bus, { params: { targetMs: 80, downMs: 100, holdMs: 250, upMs: 400 } }));
    expect(bus.throwEchoTime).toHaveBeenCalledWith(80, 100, 250, 400);
  });
});

// ── oscBass / crushBass / subHarmonic / tubbyScream / stereoDoubler / tapeWobble ──
describe.each([
  ['oscBass',       oscBass,       'startOscBass',       'oscBass',       { freq: 55, level: 0.9 }],
  ['crushBass',     crushBass,     'startCrushBass',     'crushBass',     { freq: 55, bits: 3, level: 0.55 }],
  ['subHarmonic',   subHarmonic,   'startSubHarmonic',   'subHarmonic',   { freq: 55, threshold: 0.035, level: 0.85 }],
  ['tubbyScream',   tubbyScream,   'startTubbyScream',   'tubbyScream',   { centerHz: 500, sweepHz: 900, sweepSec: 3.5, feedbackAmount: 1.3 }],
  ['stereoDoubler', stereoDoubler, 'startStereoDoubler', 'stereoDoubler', { delayMs: 25, feedback: 0.55, wet: 0.9 }],
  ['tapeWobble',    tapeWobble,    'startTapeWobble',    'tapeWobble',    { depthMs: 35, rateHz: 2.5 }],
] as const)('hold move %s', (_name, move, busMethod, releaseKey, expectedDefaults) => {
  it('calls the expected bus method with default params', () => {
    const { bus } = buildFakeBus();
    move.execute(ctx(bus));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spy = (bus as any)[busMethod];
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]).toEqual(Object.values(expectedDefaults));
  });

  it('delegates dispose to the bus-returned release fn', () => {
    const { bus, release } = buildFakeBus();
    const disp = move.execute(ctx(bus));
    disp!.dispose();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((release as any)[releaseKey]).toHaveBeenCalledTimes(1);
  });
});

// ── tapeStop ───────────────────────────────────────────────────────────────
describe('tapeStop', () => {
  it('calls startTapeHold with default 0.4s sweep and returns a disposer', () => {
    const { bus } = buildFakeBus();
    const result = tapeStop.execute(ctx(bus));
    expect(bus.startTapeHold).toHaveBeenCalledWith(0.4);
    expect(result).not.toBeNull();
    expect(typeof result?.dispose).toBe('function');
  });
  it('calling dispose invokes the bus release', () => {
    const { bus } = buildFakeBus();
    const result = tapeStop.execute(ctx(bus));
    result?.dispose();
    const releaseFn = (bus.startTapeHold as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(releaseFn).toHaveBeenCalledTimes(1);
  });
});

// ── reverseEcho / backwardReverb — fire-and-forget promises ───────────────
describe('reverseEcho', () => {
  it('fires with default duration + amount and returns null', () => {
    const { bus } = buildFakeBus();
    const r = reverseEcho.execute(ctx(bus));
    expect(r).toBeNull();
    expect(bus.reverseEcho).toHaveBeenCalledWith(0.4, 1.2);
  });
});
describe('backwardReverb', () => {
  it('captures the last 0.8s by default', () => {
    const { bus } = buildFakeBus();
    backwardReverb.execute(ctx(bus));
    expect(bus.backwardReverb).toHaveBeenCalledWith(0.8);
  });
});

// ── delayPreset* — toggle moves: set rate on activate, restore on dispose ──
describe('delayPreset380', () => {
  it('snaps echo rate to 380 ms and returns a disposer that restores', () => {
    const { bus } = buildFakeBus();
    bus.getEchoRateMs.mockReturnValue(300);
    const r = delayPreset380.execute(ctx(bus, { bpm: 99 }));
    expect(bus.setEchoRate).toHaveBeenCalledWith(380);
    expect(r).toHaveProperty('dispose');
    r!.dispose();
    expect(bus.setEchoRate).toHaveBeenLastCalledWith(300);
  });
});

describe('delayPresetDotted', () => {
  it('computes dotted-eighth in ms from BPM (120 → 750) and restores on dispose', () => {
    const { bus } = buildFakeBus();
    bus.getEchoRateMs.mockReturnValue(300);
    const r = delayPresetDotted.execute(ctx(bus, { bpm: 120 }));
    expect(bus.setEchoRate).toHaveBeenCalledWith(750);
    r!.dispose();
    expect(bus.setEchoRate).toHaveBeenLastCalledWith(300);
  });

  it('clamps very low BPM so the rate does not become absurd', () => {
    const { bus } = buildFakeBus();
    delayPresetDotted.execute(ctx(bus, { bpm: 10 }));
    // Clamped to 30 BPM: 60000 / 30 × 1.5 = 3000
    expect(bus.setEchoRate).toHaveBeenCalledWith(3000);
  });
});

// ── springKick — broadband impulse into spring tank ─────────────────────
describe('springKick', () => {
  it('calls kickSpring with default amount and holdMs', () => {
    const { bus } = buildFakeBus();
    const r = springKick.execute(ctx(bus));
    expect(bus.kickSpring).toHaveBeenCalledWith(1.0, 600);
    expect(r).toBeNull();
  });

  it('passes custom params when provided', () => {
    const { bus } = buildFakeBus();
    springKick.execute(ctx(bus, { params: { amount: 0.5, holdMs: 300 } }));
    expect(bus.kickSpring).toHaveBeenCalledWith(0.5, 300);
  });
});

// ── eqSweep — hold move that sweeps return EQ frequency ─────────────────
describe('eqSweep', () => {
  it('calls startEQSweep and returns a disposer that calls stop', () => {
    const { bus } = buildFakeBus();
    const stopper = vi.fn();
    bus.startEQSweep.mockReturnValue(stopper);
    const r = eqSweep.execute(ctx(bus));
    expect(bus.startEQSweep).toHaveBeenCalled();
    expect(r).toHaveProperty('dispose');
    r!.dispose();
    expect(stopper).toHaveBeenCalled();
  });
});

// ── BPM-synced delay preset bank ────────────────────────────────────────
describe('delayPresetQuarter', () => {
  it('computes quarter-note delay from BPM (120 → 500ms) and restores on dispose', () => {
    const { bus } = buildFakeBus();
    const r = delayPresetQuarter.execute(ctx(bus, { bpm: 120 }));
    expect(bus.setEchoRate).toHaveBeenCalledWith(500);
    expect(r).toHaveProperty('dispose');
  });
});

describe('delayPreset8th', () => {
  it('computes eighth-note delay from BPM (120 → 250ms) and restores on dispose', () => {
    const { bus } = buildFakeBus();
    const r = delayPreset8th.execute(ctx(bus, { bpm: 120 }));
    expect(bus.setEchoRate).toHaveBeenCalledWith(250);
    expect(r).toHaveProperty('dispose');
  });
});

describe('delayPresetTriplet', () => {
  it('computes triplet quarter delay from BPM (120 → 333ms)', () => {
    const { bus } = buildFakeBus();
    delayPresetTriplet.execute(ctx(bus, { bpm: 120 }));
    // 60000 / 120 × (2/3) = 333.33...
    const ms = bus.setEchoRate.mock.calls[0][0];
    expect(ms).toBeCloseTo(333.33, 0);
  });
});

describe('delayPreset16th', () => {
  it('computes sixteenth-note delay from BPM (120 → 125ms) and restores on dispose', () => {
    const { bus } = buildFakeBus();
    const r = delayPreset16th.execute(ctx(bus, { bpm: 120 }));
    expect(bus.setEchoRate).toHaveBeenCalledWith(125);
    expect(r).toHaveProperty('dispose');
  });
});

describe('delayPresetDoubler', () => {
  it('snaps to 25ms slapback regardless of BPM and restores on dispose', () => {
    const { bus } = buildFakeBus();
    const r = delayPresetDoubler.execute(ctx(bus, { bpm: 140 }));
    expect(bus.setEchoRate).toHaveBeenCalledWith(25);
    expect(r).toHaveProperty('dispose');
  });
});

// ─── Phase 2 moves ───────────────────────────────────────────────────────

describe('ghostReverb', () => {
  beforeEach(() => {
    mixerChannels.length = 0;
    mixerChannels.push({ muted: false, dubSend: 0.3 });
    mixerMutations.setChannelMute.mockClear();
    mixerMutations.setChannelDubSend.mockClear();
  });

  it('ghosts all channels with non-zero sends when channelId is undefined', () => {
    const { bus } = buildFakeBus();
    // mixerChannels[0] has dubSend: 0.3 (non-zero) — should be ghosted
    const result = ghostReverb.execute(ctx(bus, {}));
    expect(result).not.toBeNull();
    expect(mixerMutations.setChannelMute).toHaveBeenCalledWith(0, true);
    expect(mixerMutations.setChannelDubSend).toHaveBeenCalledWith(0, 1.0);
  });

  it('returns null when no channels have a send (nothing to ghost globally)', () => {
    const { bus } = buildFakeBus();
    mixerChannels[0].dubSend = 0;
    const result = ghostReverb.execute(ctx(bus, {}));
    expect(result).toBeNull();
  });

  it('mutes dry channel and cranks dub send to 1.0', () => {
    const { bus } = buildFakeBus();
    ghostReverb.execute(ctx(bus, { channelId: 0 }));
    expect(mixerMutations.setChannelMute).toHaveBeenCalledWith(0, true);
    expect(mixerMutations.setChannelDubSend).toHaveBeenCalledWith(0, 1.0);
  });

  it('dispose restores original mute state and dub send', () => {
    const { bus } = buildFakeBus();
    const handle = ghostReverb.execute(ctx(bus, { channelId: 0 }));
    expect(handle).not.toBeNull();
    handle!.dispose();
    // Restores to original: muted=false, dubSend=0.3
    expect(mixerMutations.setChannelMute).toHaveBeenLastCalledWith(0, false);
    expect(mixerMutations.setChannelDubSend).toHaveBeenLastCalledWith(0, 0.3);
  });
});

describe('voltageStarve', () => {
  it('enables lofi with default target bits on hold', () => {
    const { bus } = buildFakeBus();
    voltageStarve.execute(ctx(bus, {}));
    expect(bus.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({ lofiEnabled: true, lofiBits: 6 }),
    );
  });

  it('uses custom targetBits param', () => {
    const { bus } = buildFakeBus();
    voltageStarve.execute(ctx(bus, { params: { targetBits: 4 } }));
    expect(bus.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({ lofiEnabled: true, lofiBits: 4 }),
    );
  });

  it('dispose restores full quality (16 bits) and disables lofi', () => {
    const { bus } = buildFakeBus();
    const handle = voltageStarve.execute(ctx(bus, {}));
    expect(handle).not.toBeNull();
    handle!.dispose();
    expect(bus.setSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({ lofiEnabled: false, lofiBits: 16 }),
    );
  });
});

describe('ringMod', () => {
  it('enables ring mod with default freq and amount on hold', () => {
    const { bus } = buildFakeBus();
    ringMod.execute(ctx(bus, {}));
    expect(bus.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        ringModEnabled: true,
        ringModFreq: 440,
        ringModAmount: 0.5,
      }),
    );
  });

  it('uses custom freq and amount params', () => {
    const { bus } = buildFakeBus();
    ringMod.execute(ctx(bus, { params: { freq: 880, amount: 0.8 } }));
    expect(bus.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        ringModEnabled: true,
        ringModFreq: 880,
        ringModAmount: 0.8,
      }),
    );
  });

  it('dispose disables ring mod and zeroes amount', () => {
    const { bus } = buildFakeBus();
    const handle = ringMod.execute(ctx(bus, {}));
    expect(handle).not.toBeNull();
    handle!.dispose();
    expect(bus.setSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({ ringModEnabled: false, ringModAmount: 0 }),
    );
  });
});

describe('hpfRise', () => {
  it('calls startHpfRise with default peakHz and holdMs', () => {
    const { bus } = buildFakeBus();
    hpfRise.execute(ctx(bus, {}));
    expect(bus.startHpfRise).toHaveBeenCalledWith(2000, 1000);
  });

  it('forwards custom peakHz and holdMs from params', () => {
    const { bus } = buildFakeBus();
    hpfRise.execute(ctx(bus, { params: { peakHz: 5000, holdMs: 500 } }));
    expect(bus.startHpfRise).toHaveBeenCalledWith(5000, 500);
  });

  it('returns a handle with dispose that calls the startHpfRise release fn', () => {
    const releaseFn = vi.fn();
    const { bus } = buildFakeBus();
    bus.startHpfRise.mockReturnValue(releaseFn);
    const handle = hpfRise.execute(ctx(bus, {}));
    expect(handle).not.toBeNull();
    handle!.dispose();
    expect(releaseFn).toHaveBeenCalled();
  });
});

describe('madProfPingPong', () => {
  it('calls startPingPong with default L/R delays, feedback, and wet', () => {
    const { bus } = buildFakeBus();
    madProfPingPong.execute(ctx(bus, {}));
    expect(bus.startPingPong).toHaveBeenCalledWith(337, 450, 0.5, 0.7);
  });

  it('forwards custom params to startPingPong', () => {
    const { bus } = buildFakeBus();
    madProfPingPong.execute(ctx(bus, { params: { lMs: 200, rMs: 300, feedback: 0.6, wet: 0.8 } }));
    expect(bus.startPingPong).toHaveBeenCalledWith(200, 300, 0.6, 0.8);
  });

  it('returns a handle with dispose that calls the startPingPong release fn', () => {
    const releaseFn = vi.fn();
    const { bus } = buildFakeBus();
    bus.startPingPong.mockReturnValue(releaseFn);
    const handle = madProfPingPong.execute(ctx(bus, {}));
    expect(handle).not.toBeNull();
    handle!.dispose();
    expect(releaseFn).toHaveBeenCalled();
  });
});
