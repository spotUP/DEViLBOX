/**
 * The EQ tab's preset select shows the active curve.
 *
 * Owner, 2026-10-04: "when i select eq curve in the eq tab in the dub bus
 * the select button doesnt show the active one" - it was a one-shot
 * <select> that reset to its placeholder after applying (ledger L24).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup, screen } from '@testing-library/react';
import React from 'react';
import type { Fil4Params } from '@/engine/effects/Fil4EqEffect';

vi.mock('@/stores/useTrackerAnalysisStore', () => {
  const state = { analysisState: 'idle', error: null };
  const useTrackerAnalysisStore = Object.assign((sel: (s: typeof state) => unknown) => sel(state), { getState: () => state });
  return { useTrackerAnalysisStore };
});

/** The effect surface the panel uses, over plain parameters. */
function fakeEffect() {
  const params: Fil4Params = {
    hp: { enabled: false, freq: 25, q: 0.7 }, lp: { enabled: false, freq: 20000, q: 0.7 },
    ls: { enabled: false, freq: 80, gain: 0, q: 0.8 }, hs: { enabled: false, freq: 10000, gain: 0, q: 0.8 },
    p: [200, 500, 2000, 8000].map((f) => ({ enabled: false, freq: f, bw: 1.0, gain: 0 })), masterGain: 1,
  };
  // Listeners receive the parameters, as the real effect's 'params' event does.
  const listeners = new Set<(p: Fil4Params) => void>();
  const getParams = () => JSON.parse(JSON.stringify(params)) as Fil4Params;
  const emit = () => listeners.forEach((l) => l(getParams()));
  return {
    params,
    getParams,
    on: (_e: string, l: (p: Fil4Params) => void) => { listeners.add(l); },
    off: (_e: string, l: (p: Fil4Params) => void) => { listeners.delete(l); },
    setHP: (en: boolean, f: number, q: number) => { params.hp = { enabled: en, freq: f, q }; emit(); },
    setLP: (en: boolean, f: number, q: number) => { params.lp = { enabled: en, freq: f, q }; emit(); },
    setLowShelf: (en: boolean, f: number, g: number, q: number) => { params.ls = { enabled: en, freq: f, gain: g, q }; emit(); },
    setHighShelf: (en: boolean, f: number, g: number, q: number) => { params.hs = { enabled: en, freq: f, gain: g, q }; emit(); },
    setBand: (i: number, en: boolean, f: number, bw: number, g: number) => { params.p[i] = { enabled: en, freq: f, bw, gain: g }; emit(); },
    setMasterGain: (g: number) => { params.masterGain = g; emit(); },
    getMagnitude: () => Promise.resolve(new Float32Array(0)),
  };
}

describe('Fil4EqPanel preset select', () => {
  afterEach(cleanup);

  it('shows the genre just applied, and drops it after Flat', { timeout: 30000 }, async () => {
    const effect = fakeEffect();
    const { Fil4EqPanel } = await import('../Fil4EqPanel');
    render(React.createElement(Fil4EqPanel, { effect: effect as unknown as import('@/engine/effects/Fil4EqEffect').Fil4EqEffect }));
    expect(screen.getByText(/Select genre curve/)).toBeTruthy();
    fireEvent.click(screen.getByText(/Select genre curve/));
    fireEvent.click(screen.getByText('Reggae'));
    expect(effect.params.ls.enabled).toBe(true);
    expect(screen.getByText(/Reggae ▾/)).toBeTruthy();
    fireEvent.click(screen.getByText('Flat'));
    expect(screen.getByText(/Select genre curve/)).toBeTruthy();
  });
});
