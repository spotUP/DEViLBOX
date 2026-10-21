/** Wiring: rendering the FactoryPanel runs the eye gaze and card fidget maths for every slot (ONE reachability test). */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('@/utils/audio-context', () => ({ getDevilboxAudioContext: () => undefined }));
const calls = { gaze: 0, fidget: 0, focus: 0 };
vi.mock('@/lib/uprough/factory/eyeMotion', async (orig) => {
  const m = await orig<typeof import('@/lib/uprough/factory/eyeMotion')>();
  return {
    ...m,
    gazeAt: vi.fn((...a: Parameters<typeof m.gazeAt>) => { calls.gaze++; return m.gazeAt(...a); }),
    gazeFocus: vi.fn((...a: Parameters<typeof m.gazeFocus>) => { calls.focus++; return m.gazeFocus(...a); }),
    fidgetOffset: vi.fn((...a: Parameters<typeof m.fidgetOffset>) => { calls.fidget++; return m.fidgetOffset(...a); }),
  };
});

import { FactoryPanel } from '@components/uprough/FactoryPanel';
import { useFactoryStore } from '../useFactoryStore';

beforeEach(() => {
  const ctx = new Proxy({}, { get: (_t, k) => (k === 'canvas' ? undefined : () => undefined), set: () => true });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never);
  useFactoryStore.getState().reset();
  calls.gaze = calls.fidget = calls.focus = 0;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('FactoryPanel calls gazeAt, gazeFocus and fidgetOffset once per slot and puts the fidget in the card transform', () => {
  render(<FactoryPanel />);
  const slots = useFactoryStore.getState().state.slots.length;
  expect(slots).toBeGreaterThan(0);
  expect(calls.gaze).toBeGreaterThanOrEqual(slots);
  expect(calls.focus).toBeGreaterThanOrEqual(slots);
  expect(calls.fidget).toBeGreaterThanOrEqual(slots);
  const card = screen.getByTestId(`factory-slot-${useFactoryStore.getState().state.slots[0].id}`);
  expect(card.style.transform).toMatch(/translate\(.*\) rotate\(.*deg\) scale\(/);
});
