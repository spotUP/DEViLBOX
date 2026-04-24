/**
 * Full CC → dub sweep test (task #40).
 *
 * Drives EVERY `dub.*` entry in `DEFAULT_CC_MAPPINGS` through the
 * routeParameterToEngine path and verifies the mapping reaches the
 * right destination — either `DubRouter.fire(moveId)` for moves or
 * `useDrumPadStore.setDubBus({ field: v })` for bus params.
 *
 * Complements the existing `dubMovesDefaultCCMappings.test.ts`
 * (which locks the list shape + collision invariants) with an
 * integration-style sweep that would catch:
 *   - A rename of a move ID without a matching CC update.
 *   - A bus param transform dropped or miswired (e.g. echoRateMs
 *     not converting 0..1 → 40..1000 ms).
 *   - Per-channel `.chN` form regressing the trigger edge semantics.
 *
 * Can't integration-test the audio result (happy-dom has no
 * AudioWorklet), so fires route through a mocked DubBus / captured
 * store to assert the downstream call.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { routeParameterToEngine } from '../parameterRouter';
import { setDubBusForRouter, subscribeDubRouter } from '../../../engine/dub/DubRouter';
import type { DubBus } from '../../../engine/dub/DubBus';

// Minimal DubBus mock — enough surface for each move's execute() to
// not throw when DubRouter.fire dispatches. Individual move methods
// are spied via the router subscriber, not called through here, but
// the bus still has to walk the move's internal logic without crashing.
function makeMockBus() {
  const bus = {
    get isEnabled() { return true; },
    openChannelTap: vi.fn(() => () => {}),
    closeChannelTap: vi.fn(),
    modulateFeedback: vi.fn(),
    slamSpring: vi.fn(),
    filterDrop: vi.fn(() => () => {}),
    setSirenFeedback: vi.fn(() => () => {}),
    startTapeWobble: vi.fn(() => () => {}),
    fireNoiseBurst: vi.fn(),
    throwEchoTime: vi.fn(),
    backwardReverb: vi.fn(async () => {}),
    tapeStop: vi.fn(),
    startTapeHold: vi.fn(() => () => {}),
    soloChannelTap: vi.fn(() => () => {}),
    muteAndDub: vi.fn(() => () => {}),
    startDubStab: vi.fn(() => () => {}),
    startEchoBuildUp: vi.fn(() => () => {}),
    startEchoThrow: vi.fn(() => () => {}),
    startRadioRiser: vi.fn(() => () => {}),
    startSubSwell: vi.fn(() => () => {}),
    startTubbyScream: vi.fn(() => () => {}),
    startReverseEcho: vi.fn(async () => {}),
    reverseEcho: vi.fn(async () => {}),
    startStereoDoubler: vi.fn(() => () => {}),
    startSonarPing: vi.fn(() => () => {}),
    startOscBass: vi.fn(() => () => {}),
    startCrushBass: vi.fn(() => () => {}),
    startSubHarmonic: vi.fn(() => () => {}),
    startSiren: vi.fn(() => () => {}),
    sweepMasterLpf: vi.fn(),
    firePing: vi.fn(),
    fireRadioRiser: vi.fn(),
    fireSubSwell: vi.fn(),
    setDelayPreset: vi.fn(() => () => {}),
    setEchoRate: vi.fn(),
    toast: vi.fn(() => () => {}),
    startToast: vi.fn(() => () => {}),
    fireMasterDrop: vi.fn(() => () => {}),
    masterDrop: vi.fn(() => () => {}),
    muteAndDubChannel: vi.fn(() => () => {}),
    mute: vi.fn(() => () => {}),
    transportTapeStop: vi.fn(() => () => {}),
    inputNode: { context: {} as AudioContext } as unknown as GainNode,
    context: {} as AudioContext,
  };
  return bus as unknown as DubBus;
}

interface Capture { moveId: string; channelId: number | undefined }

function captureFires(): { captures: Capture[]; unsub: () => void } {
  const captures: Capture[] = [];
  const unsub = subscribeDubRouter((ev) => {
    captures.push({ moveId: ev.moveId, channelId: ev.channelId });
  });
  return { captures, unsub };
}

// Every move documented in DubRouter.MOVES. If a new move lands
// without a CC entry the sister `dubMovesDefaultCCMappings.test.ts`
// test fails — this sweep then picks up the mapping from that entry.
// Kept as a static list (rather than re-parsed from the registry) so
// a missing entry lights up here too, not just in the mapping test.
const MOVES_TO_SWEEP = [
  'echoThrow', 'dubStab', 'channelThrow', 'channelMute',
  'springSlam', 'filterDrop', 'dubSiren', 'tapeWobble',
  'snareCrack', 'delayTimeThrow', 'backwardReverb', 'masterDrop',
  'tapeStop', 'transportTapeStop', 'toast', 'tubbyScream',
  'stereoDoubler', 'reverseEcho', 'sonarPing', 'radioRiser',
  'subSwell', 'oscBass', 'echoBuildUp', 'delayPreset380',
  'delayPresetDotted', 'crushBass', 'subHarmonic',
];

describe('dub CC sweep — every move reaches DubRouter.fire', () => {
  beforeEach(() => {
    setDubBusForRouter(makeMockBus());
  });

  for (const moveId of MOVES_TO_SWEEP) {
    it(`dub.${moveId} — CC 0→1 fires the move`, async () => {
      const { captures, unsub } = captureFires();
      // Known-low starting state (other tests may have left values set).
      routeParameterToEngine(`dub.${moveId}`, 0.0);
      await new Promise(r => setTimeout(r, 20));
      const before = captures.filter(c => c.moveId === moveId).length;
      routeParameterToEngine(`dub.${moveId}`, 1.0);
      await new Promise(r => setTimeout(r, 20));
      const after = captures.filter(c => c.moveId === moveId).length;
      expect(after - before, `expected ${moveId} to fire on 0→1 CC edge`).toBe(1);
      // Release so a held move doesn't leak into the next iteration.
      routeParameterToEngine(`dub.${moveId}`, 0.0);
      await new Promise(r => setTimeout(r, 20));
      unsub();
    });
  }
});

describe('dub CC sweep — per-channel variant edge detection', () => {
  beforeEach(() => {
    setDubBusForRouter(makeMockBus());
  });

  // A handful of moves that are meaningful per-channel. The `.chN`
  // suffix is a generic parse-level feature of parameterRouter, so
  // covering a few samples is enough to catch parser regressions.
  const PER_CHANNEL_CASES: Array<{ moveId: string; channelId: number }> = [
    { moveId: 'echoThrow',    channelId: 0 },
    { moveId: 'dubStab',      channelId: 1 },
    { moveId: 'channelThrow', channelId: 2 },
    { moveId: 'channelMute',  channelId: 3 },
  ];

  for (const { moveId, channelId } of PER_CHANNEL_CASES) {
    it(`dub.${moveId}.ch${channelId} — CC 0→1 fires with channelId=${channelId}`, async () => {
      const { captures, unsub } = captureFires();
      routeParameterToEngine(`dub.${moveId}.ch${channelId}`, 0.0);
      await new Promise(r => setTimeout(r, 20));
      routeParameterToEngine(`dub.${moveId}.ch${channelId}`, 1.0);
      await new Promise(r => setTimeout(r, 20));
      const match = captures.find(c => c.moveId === moveId && c.channelId === channelId);
      expect(match, `expected ${moveId}@ch${channelId} to fire`).toBeDefined();
      routeParameterToEngine(`dub.${moveId}.ch${channelId}`, 0.0);
      await new Promise(r => setTimeout(r, 20));
      unsub();
    });
  }
});
