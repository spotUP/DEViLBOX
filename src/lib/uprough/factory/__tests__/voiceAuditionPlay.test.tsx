/**
 * R2f-15b/c/d and R2f-61a/b/c: the factory panel plays each finished voice once, in build order, from the local bank;
 * chips play the real one-shot on click; a style with no local bank shows disabled chips and plays nothing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const starts: { length: number; data: Float32Array }[] = [];
// The factory cues (on by default, G16) are not under test here: only the audition one-shots are counted.
vi.mock('@/lib/uprough/factory/factorySfx', () => ({ playCue: () => undefined }));
vi.mock('@/utils/audio-context', () => {
  const dest = {};
  const ctx = {
    destination: dest,
    createBuffer: (_c: number, length: number) => {
      const data = new Float32Array(length);
      return { length, data, copyToChannel: (src: Float32Array) => data.set(src) };
    },
    createGain: () => ({ gain: { value: 1 }, connect: () => dest }),
    createBufferSource: () => {
      const node: { buffer: { length: number; data: Float32Array } | null; connect: (g: unknown) => unknown; start: () => void } = {
        buffer: null, connect: (g) => g, start: () => { if (node.buffer) starts.push(node.buffer); },
      };
      return node;
    },
  };
  return { getDevilboxAudioContext: () => ctx };
});
vi.mock('@/engine/uprough/drumBank', async (orig) => {
  const m = await orig<typeof import('@/engine/uprough/drumBank')>();
  return { ...m, songDrumBank: vi.fn(m.songDrumBank) };
});

import { FactoryPanel, NO_PREVIEW } from '@components/uprough/FactoryPanel';
import { useFactoryStore, factoryOnEvent } from '../useFactoryStore';
import { scriptedGenerateEvents } from '../scriptedRun';
import { bankVoice } from '../voiceAudition';
import { songDrumBank, type HipHopStyle } from '@/engine/uprough/drumBank';
import { peaks } from '@/engine/uprough/r2Peaks';
import type { R2Event } from '@/engine/uprough/r2Events';

const DRUMS = ['kick', 'snare', 'clap', 'ch', 'oh', 'rim', 'tom', 'conga', 'cowbell', 'shaker', 'tamb', 'metal', 'ride'];
const ATTACH = ['snare_accent', 'snare_ghost'];
const HATS = Array.from({ length: 8 }, (_, k) => `hat_${k}`);

/** The scripted run with the host's hat pool names, optionally with a different style on the start event. */
function events(style: HipHopStyle, seed: number, startStyle?: string): R2Event[] {
  return scriptedGenerateEvents(style, seed).map((e) => {
    if (e.type === 'hatpool') return { ...e, variants: HATS.map((name) => ({ name, peaks: peaks(new Float64Array(64)) })) };
    if (e.type === 'start' && startStyle) return { ...e, style: startStyle };
    return e;
  });
}

/** Which kept voice a played buffer is (length plus a sample probe). */
function nameOf(buf: { length: number; data: Float32Array }): string | undefined {
  return [...DRUMS, ...ATTACH, ...HATS].find((v) => {
    const k = bankVoice(v);
    if (!k || k.samples.length !== buf.length) return false;
    for (let i = 0; i < buf.length; i += 97) if (Math.abs(buf.data[i]! - k.samples[i]!) > 1e-6) return false;
    return true;
  });
}

function feed(evs: R2Event[]): void {
  act(() => { for (const ev of evs) factoryOnEvent(ev); });
}
/** Lets the act-1 timeline run to its end. */
function runClock(): void {
  act(() => { vi.advanceTimersByTime(60_000); });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout', 'clearTimeout'] });
  // A fake performance clock starts at 0, which the store reads as "not started".
  vi.advanceTimersByTime(5);
  starts.length = 0;
  useFactoryStore.getState().reset();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('voice audition', () => {
  it('act one plays each voice once in build order, and nothing for bass and melody', () => {
    render(<FactoryPanel />);
    const lanes: R2Event[] = (['bass', 'melody'] as const).map((lane, i) => ({
      seq: 900 + i, type: 'lane', section: 0, lane, peaks: peaks(new Float64Array(64)), born: peaks(new Float64Array(64)),
    }));
    feed([...events('trap', 3), ...lanes]);
    runClock();
    const played = starts.map(nameOf);
    expect(played.filter((v) => DRUMS.includes(v!))).toEqual(DRUMS);
    expect(played.filter((v) => ATTACH.includes(v!)).sort()).toEqual(ATTACH);
    // 13 drums + 2 attachments and no other start: no bass or melody one-shot exists.
    expect(starts).toHaveLength(15);
    expect(played.every((v) => v !== undefined)).toBe(true);
    expect(screen.getAllByText('First bar rendered with the song').length).toBeGreaterThan(0);
  });

  it('chips are buttons named "Play <voice>" and each click plays that voice\'s one-shot', () => {
    render(<FactoryPanel />);
    feed(events('trap', 3));
    runClock();
    starts.length = 0;
    for (const v of [...DRUMS, ...ATTACH]) {
      const before = starts.length;
      fireEvent.click(screen.getByRole('button', { name: `Play ${v.replace('_', ' ')}` }));
      expect(starts).toHaveLength(before + 1);
      expect(starts[before]!.length).toBe(bankVoice(v)!.samples.length);
      expect(nameOf(starts[before]!)).toBe(v);
    }
    starts.length = 0;
    for (const h of HATS) fireEvent.click(screen.getByRole('button', { name: `Play ${h.replace('_', ' ')}` }));
    expect(starts).toHaveLength(8);
    const hash = (b: { data: Float32Array }): number => b.data.reduce((a, x, i) => a + Math.abs(x) * ((i % 13) + 1), 0);
    expect(new Set(starts.map(hash)).size).toBe(8);
  });

  it('a host start event rebuilds the bank at its style and seed, and the click plays it', () => {
    const spy = vi.mocked(songDrumBank);
    spy.mockClear();
    render(<FactoryPanel />);
    feed(events('boom_bap', 11));
    expect(spy).toHaveBeenCalledWith('boom_bap', 22050, 11);
    runClock();
    starts.length = 0;
    fireEvent.click(screen.getByRole('button', { name: 'Play kick' }));
    expect(starts).toHaveLength(1);
    expect(nameOf(starts[0]!)).toBe('kick');
  });

  it('a style with no local bank shows disabled chips and plays nothing', () => {
    render(<FactoryPanel />);
    feed(events('trap', 3, 'not_a_listed_style'));
    runClock();
    expect(screen.getByText(NO_PREVIEW)).toBeTruthy();
    const chip = screen.getByRole('button', { name: 'Play kick' });
    expect(chip.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(chip);
    expect(starts).toHaveLength(0);
  });
});
