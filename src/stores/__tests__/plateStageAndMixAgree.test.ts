/**
 * The Plate mix knob was a grey control that did nothing.
 *
 * The panel rendered the slider with `disabled={dubBus.plateStage === 'off'}`
 * and the store defaulted `plateStage` to `'off'`. So on arrival the knob was
 * inert and the stored mix was a fiction — it could read 70% while no plate
 * was wired to anything. Reported 2026-10-02 as "the value doesn't change when
 * I turn the plate mix knob".
 *
 * The engine was never at fault: driving the store to 0.2 and 0.65 moved the
 * plate send gain to 0.2 and 0.65 exactly. Store -> engine was always sound.
 * The break was in the control's own reachability.
 *
 * The fix is an invariant in the store, not a patch in the component: turning
 * a mix up while no stage is fitted fits the default stage, and fitting a stage
 * while the mix is zero gives it the documented audible default. Either order
 * of the two controls now ends with a plate you can hear.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useDrumPadStore } from '../useDrumPadStore';
import { DEFAULT_DUB_BUS } from '../../types/dub';
import { fitStageForMix, audiblePlateMix, DEFAULT_PLATE_STAGE } from '../../lib/dub/plateStage';

function reset(over: Partial<typeof DEFAULT_DUB_BUS> = {}) {
  useDrumPadStore.setState({
    dubBus: { ...DEFAULT_DUB_BUS, ...over },
    dubBusStash: null,
  });
}

describe('plate stage and plate mix cannot disagree', () => {
  beforeEach(() => reset);

  it('ships with a stage fitted, so the knob is live on arrival', () => {
    expect(DEFAULT_DUB_BUS.plateStage).not.toBe('off');
  });

  it('fits a stage when the mix is turned up with none fitted', () => {
    reset({ plateStage: 'off', plateStageMix: 0 });
    useDrumPadStore.getState().setDubBus({ plateStageMix: 0.7 });
    const s = useDrumPadStore.getState().dubBus;
    expect(s.plateStage, 'the mix moved but nothing was wired to receive it').toBe(DEFAULT_PLATE_STAGE);
    expect(s.plateStageMix).toBe(0.7);
  });

  it('leaves a deliberate silence alone', () => {
    // Turning the mix DOWN to zero is a real choice, not a request for a stage.
    reset({ plateStage: 'off' });
    useDrumPadStore.getState().setDubBus({ plateStageMix: 0 });
    expect(useDrumPadStore.getState().dubBus.plateStage).toBe('off');
  });

  it('gives a newly fitted stage an audible level', () => {
    reset({ plateStage: 'off', plateStageMix: 0 });
    useDrumPadStore.getState().setDubBus({ plateStage: 'dattorro' });
    const s = useDrumPadStore.getState().dubBus;
    expect(s.plateStage).toBe('dattorro');
    expect(s.plateStageMix, 'an installed plate at mix 0 is an inaudible effect').toBeGreaterThan(0);
  });

  it('respects an explicit mix when the stage is fitted in the same patch', () => {
    reset({ plateStage: 'off', plateStageMix: 0 });
    useDrumPadStore.getState().setDubBus({ plateStage: 'dattorro', plateStageMix: 0.2 });
    const s = useDrumPadStore.getState().dubBus;
    expect(s.plateStage).toBe('dattorro');
    expect(s.plateStageMix, 'an explicit mix in the same patch was overwritten').toBe(0.2);
  });

  it('round-trips through the panel in both directions', () => {
    // Off -> mix up -> stage comes on. Stage -> off -> mix remembered.
    reset({ plateStage: 'off', plateStageMix: 0 });
    useDrumPadStore.getState().setDubBus({ plateStageMix: 0.5 });
    expect(useDrumPadStore.getState().dubBus.plateStage).not.toBe('off');
    useDrumPadStore.getState().setDubBus({ plateStage: 'off' });
    useDrumPadStore.getState().setDubBus({ plateStage: 'madprofessor' });
    expect(useDrumPadStore.getState().dubBus.plateStageMix).toBe(0.5);
  });

  it('does not touch the plate when an unrelated setting changes', () => {
    reset({ plateStage: 'off', plateStageMix: 0.5 });
    useDrumPadStore.getState().setDubBus({ echoWet: 0.4 });
    const s = useDrumPadStore.getState().dubBus;
    expect(s.plateStage).toBe('off');
    expect(s.plateStageMix).toBe(0.5);
  });

  describe('the pure rules', () => {
    it('fitStageForMix only fires on a real raise', () => {
      const off = { ...DEFAULT_DUB_BUS, plateStage: 'off' as const, plateStageMix: 0 };
      expect(fitStageForMix(off, { plateStageMix: 0.9 }).plateStage).toBe(DEFAULT_PLATE_STAGE);
      expect(fitStageForMix(off, { plateStageMix: 0 }).plateStage).toBeUndefined();
      expect(fitStageForMix(off, { echoWet: 0.5 }).plateStage).toBeUndefined();
    });

    it('audiblePlateMix only fires when a stage is on and the mix is silent', () => {
      const off = { ...DEFAULT_DUB_BUS, plateStage: 'off' as const, plateStageMix: 0 };
      expect(audiblePlateMix(off, { plateStage: 'dattorro' }).plateStageMix).toBe(DEFAULT_DUB_BUS.plateStageMix);
      expect(audiblePlateMix(off, { plateStage: 'dattorro', plateStageMix: 0.4 }).plateStageMix).toBe(0.4);
      expect(audiblePlateMix(off, { echoWet: 0.5 }).plateStageMix).toBeUndefined();
    });
  });
});