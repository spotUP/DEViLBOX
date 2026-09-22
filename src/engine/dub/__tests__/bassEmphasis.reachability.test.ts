/**
 * `bassEmphasis` fired through the PRODUCT'S entry point.
 *
 * The move is reached the way every surface reaches it — `DubRouter.fire`,
 * not the move object — so registering it in `moveTable.ts` and never calling
 * it cannot pass. The sentinel is the bus itself: a settings recorder that
 * enforces the same owned-key rule the real `DubBus` does, so the test proves
 * the writes LANDED rather than that they were attempted.
 *
 * What is asserted, in order of what would hurt most if it broke:
 *
 *   1. The gesture releases. A bass emphasis that does not hand the mix back
 *      is a permanently altered mix, and this repo has shipped holds that
 *      fired and never released. Both release paths are covered: `dispose`,
 *      and the envelope running out on its own with nobody holding it.
 *   2. The low end actually moved — the shelf gain rose, the corner landed in
 *      the plan's 80 to 120 Hz, the low-mid dipped.
 *   3. It refuses a target that is not the bass, and refuses no target at
 *      all, rather than boosting something arbitrary.
 *
 * The channel profiling is mocked to a FIXTURE, but the scores in it are
 * computed by the real `buildDubTargetProfile` — so "does this channel read
 * as the low end" is answered by the shipping judgement, not by a number
 * chosen to make the test pass.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildDubTargetProfile, type DubTargetProfile } from '@/lib/dub/dubTargetProfile';
import type { MusicalChannelProfile } from '@/lib/dub/musicalChannelProfile';
import { BASS_EMPHASIS_MIN_DB, BASS_EMPHASIS_MAX_DB } from '@/lib/dub/bassEmphasisShape';

// ── Channel fixtures: real profiles, real target scores ───────────────────
function chan(over: Partial<MusicalChannelProfile>): MusicalChannelProfile {
  const axis = <T,>(value: T) => ({ value, confidence: 0.9, source: 'notes' as const });
  return {
    channel: 0,
    instrumentFamily: axis('keys'),
    musicalFunction: axis('harmony'),
    rhythmicRole: axis('offbeat'),
    register: axis('mid'),
    importance: 0.5, density: 0.3, audibility: 0.8, repetition: 0.7,
    ...over,
  } as MusicalChannelProfile;
}

const BASS_CHANNEL = 0;
const SKANK_CHANNEL = 1;

const FIXTURE: DubTargetProfile[] = [
  buildDubTargetProfile(chan({
    channel: BASS_CHANNEL,
    instrumentFamily: { value: 'bass', confidence: 0.9, source: 'notes' },
    musicalFunction: { value: 'foundation', confidence: 0.9, source: 'notes' },
    register: { value: 'low', confidence: 0.9, source: 'notes' },
    rhythmicRole: { value: 'downbeat', confidence: 0.9, source: 'rhythm' },
    importance: 0.9, repetition: 0.85,
  })),
  buildDubTargetProfile(chan({ channel: SKANK_CHANNEL })),
];

vi.mock('../channelProfiles', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../channelProfiles')>();
  return { ...actual, getDubTargetProfiles: () => FIXTURE };
});

import { fire, setDubBusForRouter } from '../DubRouter';
import type { DubBus } from '../DubBus';
import { useTransportStore } from '@/stores/useTransportStore';

// ── The sentinel bus ──────────────────────────────────────────────────────
/**
 * Records what the move writes, and enforces the one rule that can silently
 * strand a boost: `DubBus` DROPS writes to keys a move currently owns. A
 * restore written while the claim is still held never lands, and the mix
 * keeps the boost. This mock reproduces that, so the test can only pass if
 * the move hands ownership back first.
 */
function makeSettingsBus() {
  const settings: Record<string, unknown> = {
    throwQuantize: 'off',
    masterBassPunchDb: 0,
    bassShelfFreqHz: 80,
    bassShelfQ: 0.9,
    midScoopGainDb: 0,
    midScoopFreqHz: 700,
  };
  const owned = new Map<string, number>();
  const writes: Array<Record<string, unknown>> = [];
  const dropped: string[] = [];

  const bus = {
    getSettings: () => ({ ...settings }),
    setSettings: (patch: Record<string, unknown>) => {
      const landed: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(patch)) {
        if (owned.has(k)) { dropped.push(k); continue; }
        settings[k] = v;
        landed[k] = v;
      }
      writes.push(landed);
    },
    claimSettingKeys: (keys: readonly string[]) => {
      for (const k of keys) owned.set(k, (owned.get(k) ?? 0) + 1);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        for (const k of keys) {
          const depth = (owned.get(k) ?? 1) - 1;
          if (depth <= 0) owned.delete(k); else owned.set(k, depth);
        }
      };
    },
  };
  return {
    bus: bus as unknown as DubBus,
    settings,
    writes,
    dropped,
    ownedNow: () => Array.from(owned.keys()),
  };
}

/** One bar in ms at the transport's tempo — what the move's envelope uses. */
function barMs(): number {
  const bpm = useTransportStore.getState().bpm || 120;
  return (60000 / Math.max(30, Math.min(300, bpm))) * 4;
}

describe('bassEmphasis through DubRouter.fire', () => {
  let rig: ReturnType<typeof makeSettingsBus>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    rig = makeSettingsBus();
    setDubBusForRouter(rig.bus);
  });

  afterEach(() => {
    setDubBusForRouter(null);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ── 1. It runs, and the low end moves ───────────────────────────────────

  it('lifts the low shelf on the bass channel — the code RAN', () => {
    const handle = fire('bassEmphasis', BASS_CHANNEL, {}, 'live');
    expect(handle, 'a hold move must hand back a disposer').not.toBeNull();

    // Sentinel: writes reached the bus at all.
    expect(rig.writes.length).toBeGreaterThan(0);

    // Let the eased attack complete.
    vi.advanceTimersByTime(barMs());

    const punch = rig.settings.masterBassPunchDb as number;
    expect(punch).toBeGreaterThanOrEqual(BASS_EMPHASIS_MIN_DB);
    expect(punch).toBeLessThanOrEqual(BASS_EMPHASIS_MAX_DB);

    handle!.dispose();
    vi.advanceTimersByTime(barMs() * 2);
  });

  it('eases in rather than switching — the shelf is still climbing early on', () => {
    const handle = fire('bassEmphasis', BASS_CHANNEL, {}, 'live');
    const bar = barMs();
    // A quarter of a two-bar gesture is the attack, so an eighth of a bar in
    // the shelf must be up but nowhere near the top.
    vi.advanceTimersByTime(bar / 8);
    const early = rig.settings.masterBassPunchDb as number;
    vi.advanceTimersByTime(bar);
    const full = rig.settings.masterBassPunchDb as number;

    expect(early).toBeGreaterThan(0);
    expect(early).toBeLessThan(full);

    handle!.dispose();
    vi.advanceTimersByTime(bar * 2);
  });

  it('puts the shelf corner inside the plan\'s 80 to 120 Hz', () => {
    const handle = fire('bassEmphasis', BASS_CHANNEL, {}, 'live');
    const hz = rig.settings.bassShelfFreqHz as number;
    expect(hz).toBeGreaterThanOrEqual(80);
    expect(hz).toBeLessThanOrEqual(120);
    handle!.dispose();
    vi.advanceTimersByTime(barMs() * 2);
  });

  it('cleans the low-mid so the lift can stay small', () => {
    const handle = fire('bassEmphasis', BASS_CHANNEL, {}, 'live');
    vi.advanceTimersByTime(barMs());
    const scoop = rig.settings.midScoopGainDb as number;
    const punch = rig.settings.masterBassPunchDb as number;
    expect(scoop).toBeLessThan(0);
    // A dip, not a tilt: it never takes out more than the shelf puts in.
    expect(Math.abs(scoop)).toBeLessThan(punch);
    handle!.dispose();
    vi.advanceTimersByTime(barMs() * 2);
  });

  // ── 2. It gives the mix back ────────────────────────────────────────────

  it('restores every borrowed setting on dispose', () => {
    const before = { ...rig.settings };
    const handle = fire('bassEmphasis', BASS_CHANNEL, {}, 'live');
    vi.advanceTimersByTime(barMs());
    expect(rig.settings.masterBassPunchDb).not.toBe(before.masterBassPunchDb);

    handle!.dispose();
    vi.advanceTimersByTime(barMs() * 2);

    expect(rig.settings.masterBassPunchDb).toBe(before.masterBassPunchDb);
    expect(rig.settings.bassShelfFreqHz).toBe(before.bassShelfFreqHz);
    expect(rig.settings.midScoopGainDb).toBe(before.midScoopGainDb);
    // And it let go of the keys, or nothing else could ever write them again.
    expect(rig.ownedNow()).toEqual([]);
  });

  it('releases itself when nobody disposes it — a hold cannot outlive its bars', () => {
    const before = { ...rig.settings };
    const handle = fire('bassEmphasis', BASS_CHANNEL, {}, 'live');
    expect(handle).not.toBeNull();

    vi.advanceTimersByTime(barMs());
    expect(rig.settings.masterBassPunchDb).not.toBe(before.masterBassPunchDb);

    // Two bars is the default gesture; give it three and touch nothing.
    vi.advanceTimersByTime(barMs() * 3);

    expect(rig.settings.masterBassPunchDb).toBe(before.masterBassPunchDb);
    expect(rig.settings.bassShelfFreqHz).toBe(before.bassShelfFreqHz);
    expect(rig.settings.midScoopGainDb).toBe(before.midScoopGainDb);
    expect(rig.ownedNow()).toEqual([]);
  });

  it('survives a dispose after it has already released itself', () => {
    const before = { ...rig.settings };
    const handle = fire('bassEmphasis', BASS_CHANNEL, {}, 'live');
    vi.advanceTimersByTime(barMs() * 4);
    expect(rig.settings.masterBassPunchDb).toBe(before.masterBassPunchDb);

    handle!.dispose();
    vi.advanceTimersByTime(barMs());
    expect(rig.settings.masterBassPunchDb).toBe(before.masterBassPunchDb);
  });

  it('releases even when disposed mid-attack, before the shelf reached the top', () => {
    const before = { ...rig.settings };
    const handle = fire('bassEmphasis', BASS_CHANNEL, {}, 'live');
    vi.advanceTimersByTime(barMs() / 8);
    handle!.dispose();
    vi.advanceTimersByTime(barMs() * 2);
    expect(rig.settings.masterBassPunchDb).toBe(before.masterBassPunchDb);
    expect(rig.settings.midScoopGainDb).toBe(before.midScoopGainDb);
  });

  // ── 3. It refuses anything that is not the bass ─────────────────────────

  it('does nothing to a channel that does not read as the low end', () => {
    // The fixture's judgement, not the test's: assert the skank really does
    // score below the bar before asserting the refusal.
    expect(FIXTURE[1].targets.bassEmphasis).toBeLessThan(0.6);

    const before = { ...rig.settings };
    const handle = fire('bassEmphasis', SKANK_CHANNEL, {}, 'live');

    expect(handle).toBeNull();
    expect(rig.writes).toEqual([]);
    expect(rig.settings).toEqual(before);
  });

  it('does nothing with no target at all', () => {
    const before = { ...rig.settings };
    const handle = fire('bassEmphasis', undefined, {}, 'live');
    expect(handle).toBeNull();
    expect(rig.writes).toEqual([]);
    expect(rig.settings).toEqual(before);
  });

  it('does nothing for a channel the song does not have', () => {
    const before = { ...rig.settings };
    const handle = fire('bassEmphasis', 11, {}, 'live');
    expect(handle).toBeNull();
    expect(rig.writes).toEqual([]);
    expect(rig.settings).toEqual(before);
  });

  // ── 4. The amount follows the budget, through the router's own params ───

  it('asks for a smaller lift when the caller reports no low-end headroom', () => {
    const roomy = fire('bassEmphasis', BASS_CHANNEL, { headroom: 1 }, 'live');
    vi.advanceTimersByTime(barMs());
    const withRoom = rig.settings.masterBassPunchDb as number;
    roomy!.dispose();
    vi.advanceTimersByTime(barMs() * 2);

    const tight = fire('bassEmphasis', BASS_CHANNEL, { headroom: 0 }, 'live');
    vi.advanceTimersByTime(barMs());
    const withoutRoom = rig.settings.masterBassPunchDb as number;
    tight!.dispose();
    vi.advanceTimersByTime(barMs() * 2);

    expect(withoutRoom).toBeLessThan(withRoom);
    expect(withoutRoom).toBeCloseTo(BASS_EMPHASIS_MIN_DB, 1);
  });
});
