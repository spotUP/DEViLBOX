/**
 * A dub persona reaches for a channel's sound-shaping slot on the channel its
 * rule names, holds it for the rule's bars, and hands the user's own slot
 * back when it lets go.
 *
 * Owner, 2026-10-06: "make sure the dub personas use the sound shaping ones
 * properly per channel". The path is AutoDub's own: `chooseMove` over the
 * real RULES and persona → `autoDubGesture` (the hold length and sweep the
 * tick performs it with) → GestureEngine → DubRouter → the `channelShape`
 * move → ChannelRoutedEffects' override on that channel's PerChannelDubFx.
 * The router's fire and release events are what the performance journal and
 * the recorder consume, so they are asserted too.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { loadDubBus, makeDubBusRig, releaseDubBusRigClock } from '@/test/audio/dubBusRig';
import { realDelay } from '@/test/audio/realWebAudio';
import { vi } from 'vitest';
import type { AutoDubTickCtx } from '../AutoDub';
import type { ChannelRole } from '@/bridge/analysis/MusicAnalysis';
import type { AutoDubPersonaId } from '@/stores/useDubStore';
import { CHANNEL_SHAPE_KINDS, channelShapeNormFromValue } from '@/lib/dub/channelShape';

beforeAll(async () => { await loadDubBus(); }, 120_000);
afterAll(() => releaseDubBusRigClock());

const BPM = 120;
const BAR_MS = (60000 / BPM) * 4;

function ctxFor(persona: AutoDubPersonaId, getPersona: (id: AutoDubPersonaId) => AutoDubTickCtx['persona'], over: Partial<AutoDubTickCtx>): AutoDubTickCtx {
  return {
    bar: 0, barPos: 0, isNewBar: true, intensity: 0.8,
    persona: getPersona(persona),
    blacklist: new Set(), movesFiredThisBar: 0, wetFiredThisBar: 0, nextWetAllowedMs: -Infinity,
    moveLastFiredBar: new Map(), channelCount: 4,
    roles: ['bass', 'percussion', 'skank', 'lead'] as ChannelRole[],
    transientChannels: [], currentPattern: null, currentRow: 0, channelNames: [],
    densityByRole: new Map(), phraseIntensityMult: 1.0, lastGlobalFireBar: -99,
    eqSnapshot: null, inRiddimSection: false,
    // Only the shaping rules compete, so the test reads the persona's shaping
    // choice rather than whichever bus move the roll favoured.
    admitsMove: (id: string) => id === 'channelShape',
    ...over,
  } as AutoDubTickCtx;
}

async function setup() {
  // Imports first: the AutoDub chain sets up the app's audio modules as it
  // loads, and the rig must be the context Tone uses after that.
  const cre = await import('@engine/tone/ChannelRoutedEffects');
  const router = await import('../DubRouter');
  const autoDub = await import('../AutoDub');
  const { getPersona } = await import('../AutoDubPersonas');
  const { beginGesture } = await import('../GestureEngine');
  const { useMixerStore } = await import('@stores/useMixerStore');
  const rig = await makeDubBusRig(1);
  const mgr = cre.getChannelRoutedEffectsManager({} as never);
  mgr.setupDubBusWiring(rig.bus.inputNode, rig.bus);
  router.setDubBusForRouter(rig.bus);
  const fires: Array<{ invocationId: string; moveId: string; channelId?: number; origin?: string }> = [];
  const releases: string[] = [];
  const offFire = router.subscribeDubRouter((e) => { fires.push(e); });
  const offRelease = router.subscribeDubRelease((e) => { releases.push(e.invocationId); });
  await realDelay(50);
  // Registering the router's bus builds the app's ToneEngine for its audit
  // meters, and that engine claims Tone's context with a live one of its own.
  // The move's worklet effects are built in Tone's context, so give it back
  // to the rig the channel chains live in (in the app they are one context).
  const Tone = await import('tone');
  Tone.setContext(rig.ctx);
  const done = () => { offFire(); offRelease(); router.setDubBusForRouter(null); void mgr.dispose(); };
  return { mgr, autoDub, getPersona, beginGesture, useMixerStore, fires, releases, done };
}

describe('a dub persona shapes the channel its rule names, and lets go', () => {
  it('perry rings the drums for a bar, then the drum channel gets its own High Pass back', async () => {
    const t = await setup();
    // The user's own slot on the drums, and nothing on the bass.
    t.useMixerStore.getState().setChannelDubShape(1, 'hpf', 300);
    t.useMixerStore.getState().setChannelDubShape(0, 'off');

    const choice = t.autoDub.chooseMove(ctxFor('perry', t.getPersona, { bar: 3, barPos: 0.7, isNewBar: false }), () => 0.01);
    expect(choice?.moveId).toBe('channelShape');
    expect(choice?.channelId, 'the ring went to a channel that is not the drums').toBe(1);
    expect(CHANNEL_SHAPE_KINDS[choice!.params.effect]).toBe('ringMod');
    expect(choice!.params.amount).toBeCloseTo(channelShapeNormFromValue('ringMod', 120), 6);

    const { holdMs } = t.autoDub.autoDubGesture(choice!, BPM);
    expect(holdMs).toBe(BAR_MS);
    t.beginGesture({ moveId: choice!.moveId, channelId: choice!.channelId, params: choice!.params, holdMs, bpm: BPM, source: 'live', origin: 'ai' });
    vi.advanceTimersByTime(30);

    const held = t.mgr.getEffectiveChannelShape(1);
    expect([held.kind, held.heldByMove]).toEqual(['ringMod', true]);
    expect(Math.round(held.value)).toBe(120);
    expect(t.mgr.getPerChannelFx(1)?.shape.kind, 'the ring never reached the drum channel\'s stage').toBe('ringMod');
    expect(t.mgr.getEffectiveChannelShape(0).kind, 'another channel was shaped').toBe('off');
    expect(t.useMixerStore.getState().channels[1].dubShape, 'the move wrote over the user\'s slot').toBe('hpf');
    const fire = t.fires.find((f) => f.moveId === 'channelShape');
    expect(fire?.channelId).toBe(1);
    expect(fire?.origin).toBe('ai');

    vi.advanceTimersByTime(holdMs + 100);
    expect(t.releases, 'the hold never released').toContain(fire!.invocationId);
    const back = t.mgr.getEffectiveChannelShape(1);
    expect([back.kind, back.value, back.heldByMove]).toEqual(['hpf', 300, false]);
    expect(t.mgr.getPerChannelFx(1)?.shape.kind).toBe('hpf');
    t.done();
  }, 120_000);

  it('tubby sweeps a Low Pass on the bass at the phrase end and lands back where the bass was', async () => {
    const t = await setup();
    t.useMixerStore.getState().setChannelDubShape(0, 'off');
    t.useMixerStore.getState().setChannelDubShape(1, 'off');

    const choice = t.autoDub.chooseMove(ctxFor('tubby', t.getPersona, { bar: 7, barPos: 0, isNewBar: true }), () => 0.01);
    expect(choice?.moveId).toBe('channelShape');
    expect(choice?.channelId, 'the Low Pass went to a channel that is not the bass').toBe(0);
    expect(CHANNEL_SHAPE_KINDS[choice!.params.effect]).toBe('lpf');

    const { holdMs, automation } = t.autoDub.autoDubGesture(choice!, BPM);
    expect(automation?.shape).toBe('sweep');
    t.beginGesture({
      moveId: choice!.moveId, channelId: choice!.channelId, params: choice!.params, holdMs, bpm: BPM, source: 'live', origin: 'ai',
      shape: automation!.shape, automate: { param: automation!.param, from: automation!.from, to: automation!.to, curve: automation!.curve },
    });
    vi.advanceTimersByTime(30);
    const start = t.mgr.getEffectiveChannelShape(0);
    expect(start.kind).toBe('lpf');
    // The sweep starts at 1 kHz; 30 ms in it has begun to travel.
    expect(start.value).toBeGreaterThan(900);
    expect(start.value).toBeLessThanOrEqual(1000);

    vi.advanceTimersByTime(holdMs / 2 - 30);
    const mid = t.mgr.getEffectiveChannelShape(0);
    expect(mid.kind).toBe('lpf');
    expect(mid.value, 'the cutoff never travelled: the sweep did not reach the move').toBeLessThan(400);

    vi.advanceTimersByTime(holdMs / 2 + 100);
    expect(t.mgr.getEffectiveChannelShape(0)).toEqual({ kind: 'off', value: 0, heldByMove: false });
    vi.advanceTimersByTime(30);
    expect(t.mgr.getPerChannelFx(0)?.shape.kind).toBe('off');
    t.done();
  }, 120_000);
});
