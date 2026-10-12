/**
 * Every deck pitch change must reach the audio engine. The audio changes only
 * through DJActions.setDeckPitch -> DeckEngine.setPitch; the keyboard pitch keys,
 * the sync keys, the fx pads, the vinyl view and the controller sync buttons all
 * wrote only the store (found 2026-10-08, after Auto DJ tempo sync had the same
 * defect). They worked only while a mounted DJDeck forwarded store pitch to the
 * engine, so a pitch that did not change the store value never sounded.
 * The store no longer has a pitch setter; the guard below keeps it that way.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { renderHook } from '@testing-library/react';

const h = vi.hoisted(() => ({
  pitchCalls: [] as Array<{ deck: string; semitones: number }>,
  keyHandler: null as null | ((n: unknown, e: KeyboardEvent) => boolean),
}));

vi.mock('@/engine/dj/DJEngine', () => {
  const deck = (id: string) => ({
    setPitch: (semitones: number) => { h.pitchCalls.push({ deck: id, semitones }); },
  });
  const decks: Record<string, ReturnType<typeof deck>> = { A: deck('A'), B: deck('B'), C: deck('C') };
  const engine = { getDeck: (id: string) => decks[id], deckA: decks.A, deckB: decks.B };
  return { getDJEngine: () => engine, getDJEngineIfActive: () => engine };
});
vi.mock('@/engine/keyboard/KeyboardRouter', () => ({
  registerViewHandler: (_view: string, fn: (n: unknown, e: KeyboardEvent) => boolean) => {
    h.keyHandler = fn;
    return () => { h.keyHandler = null; };
  },
}));

import { useDJStore } from '@/stores/useDJStore';
import { useDJKeyboardHandler } from '@/components/dj/DJKeyboardHandler';
import { routeDJParameter } from '@/midi/performance/parameterRouter';

const press = (key: string, shiftKey = false) =>
  h.keyHandler!({}, new KeyboardEvent('keydown', { key, shiftKey }));

describe('deck pitch reaches the engine from every entry', () => {
  beforeEach(() => {
    h.pitchCalls.length = 0;
    renderHook(() => useDJKeyboardHandler());
  });

  it('Shift+W (deck A pitch up) calls DeckEngine.setPitch', () => {
    expect(press('W', true)).toBe(true);
    const call = h.pitchCalls.find((c) => c.deck === 'A');
    expect(call, 'the keyboard pitch key never reached the deck engine').toBeDefined();
    expect(call!.semitones).toBeCloseTo(useDJStore.getState().decks.A.pitchOffset + 1, 6);
  });

  it('a MIDI pitch CC calls DeckEngine.setPitch immediately and the store on the next frame', async () => {
    routeDJParameter('dj.deckB.pitch', 0.5); // first CC seeds the relative baseline
    routeDJParameter('dj.deckB.pitch', 0.75);
    expect(h.pitchCalls.some((c) => c.deck === 'B')).toBe(true);
    const last = h.pitchCalls.filter((c) => c.deck === 'B').at(-1)!;
    await vi.waitFor(() => expect(useDJStore.getState().decks.B.pitchOffset).toBeCloseTo(last.semitones, 6));
  });
});

describe('no source file writes deck pitch to the store except DJActions', () => {
  it('the store has no pitch setter and nothing else assigns a deck pitchOffset', () => {
    const root = join(process.cwd(), 'src');
    const pattern =
      'store\\.setDeckPitch\\(|getState\\(\\)\\.setDeckPitch\\(|decks(\\.[A-Za-z]+|\\[[^]]+\\])\\.pitchOffset *=[^=]|setDeckState\\([^)]*pitchOffset *:';
    let out = '';
    try {
      // git grep reads the index (tracked + untracked, never ignored) instead of
      // walking the tree: a full-tree grep took over 30 s inside the push gate.
      out = execFileSync('git', ['grep', '--untracked', '-nE', pattern, '--', 'src/*.ts', 'src/*.tsx', ':!**/__tests__/**'], { encoding: 'utf-8', cwd: join(root, '..') });
    } catch { /* grep exits 1 on no match */ }
    const offenders = out.split('\n').filter((l) => l && !l.includes(join('engine', 'dj', 'DJActions.ts')));
    expect(offenders, 'deck pitch must go through DJActions.setDeckPitch (engine + store)').toEqual([]);
    const store = readFileSync(join(root, 'stores', 'useDJStore.ts'), 'utf-8');
    expect(store).not.toMatch(/\bsetDeckPitch\b/);
  }, 30000);
});
