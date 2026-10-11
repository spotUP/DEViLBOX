/**
 * One scratch action path (owner scratch plan sections 81, 82; D2; ledger
 * SCR-P2.9): the keyboard command, the pad action id, the tracker `Xnn`
 * effect and the MCP `execute_command` all reach `fireDjFx`, which is the
 * only caller of the deck pattern player. The old direct call path has no
 * callers left (static assertion over `src/`).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const holder = vi.hoisted(() => ({ deck: null as unknown }));

vi.mock('tone', async (orig) => {
  const actual = await orig<typeof import('tone')>();
  const raw = { currentTime: 0, sampleRate: 48000 };
  return { ...actual, now: () => raw.currentTime, getContext: () => ({ rawContext: raw, state: 'running' }) };
});
vi.mock('@/engine/dj/DJEngine', () => ({
  getDJEngine: () => ({ getDeck: () => holder.deck, mixer: { samplerInput: null } }),
  getDJEngineIfActive: () => holder.deck ? { getDeck: () => holder.deck } : null,
}));

import { fireDjFx, releaseDjFx, djFxFireCounts, clearDjFxFireLog, DJ_FX_ACTION_MAP, SCRATCH_FX_ACTIONS, getDjFxFireLog } from '@/engine/drumpad/DjFxActions';
import { SCRATCH_ACTION_TO_FX, fireScratchAction, scratchEffectToFx, fireScratchEffect, fxIdForPattern } from '../scratch/scratchActionMap';
import { djScratchChirp, djScratchStop } from '@/engine/keyboard/commands/djScratch';
import { SCRATCH_PATTERNS } from '../DJScratchEngine';
import { SCRATCH_GESTURE_IDS } from '../scratch/scratchGestureCatalog';
import { useDJStore } from '@/stores/useDJStore';
import type { ScratchActionId } from '@/types/drumpad';

function fakeDeck() {
  return {
    id: 'A' as const,
    patternCalls: [] as string[],
    stopCalls: 0,
    finishCalls: 0,
    playPattern(name: string) { this.patternCalls.push(name); },
    stopPattern() { this.stopCalls++; },
    finishPatternCycle() { this.finishCalls++; },
  };
}

describe('every scratch trigger fires the registry (SCR-P2.9)', () => {
  let deck: ReturnType<typeof fakeDeck>;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'] });
    clearDjFxFireLog();
    deck = fakeDeck();
    holder.deck = deck;
    useDJStore.getState().setDeckPattern('A', null);
  });
  afterEach(() => { vi.useRealTimers(); });

  it('keyboard command -> fireDjFx; pad id -> fireDjFx; Xnn -> fireDjFx; the deck pattern player is reached once per fire', () => {
    expect(djScratchChirp(true)).toBe(true);
    expect(djFxFireCounts.fx_scratch_chirp).toBe(1);
    expect(deck.patternCalls).toEqual(['Chirp']);
    expect(getDjFxFireLog().at(-1)).toMatchObject({ id: 'fx_scratch_chirp', source: 'keyboard', kind: 'fire', deck: 'A' });
    expect(djScratchChirp(false)).toBe(true);
    expect(deck.stopCalls).toBe(1);
    expect(getDjFxFireLog().at(-1)).toMatchObject({ id: 'fx_scratch_chirp', source: 'keyboard', kind: 'release' });

    expect(fireScratchAction('scratch_chirp', true, 'midi')).toBe(true);
    expect(djFxFireCounts.fx_scratch_chirp).toBe(2);
    expect(getDjFxFireLog().at(-1)).toMatchObject({ id: 'fx_scratch_chirp', source: 'midi', kind: 'fire' });
    fireScratchAction('scratch_chirp', false, 'midi');
    expect(deck.stopCalls).toBe(2);

    // Xnn: X07 = the seventh pattern slot (Chirp), X00 = stop
    expect(scratchEffectToFx(0x07)).toEqual({ id: 'fx_scratch_chirp', kind: 'fire' });
    expect(scratchEffectToFx(0x00)).toEqual({ id: 'fx_scratch_stop', kind: 'fire' });
    expect(scratchEffectToFx(0x10)).toBeNull(); // fader LFO nibble: not a gesture
    expect(fireScratchEffect(0x07, 'A')).toBe(true);
    expect(djFxFireCounts.fx_scratch_chirp).toBe(3);
    expect(getDjFxFireLog().at(-1)).toMatchObject({ id: 'fx_scratch_chirp', source: 'tracker', kind: 'fire', deck: 'A' });
    expect(deck.patternCalls).toEqual(['Chirp', 'Chirp', 'Chirp']);
    expect(fireScratchEffect(0x00, 'A')).toBe(true);
    expect(djFxFireCounts.fx_scratch_stop).toBe(1);

    // the keyboard toggle (what the MCP execute_command reaches) fires too
    expect(djScratchChirp()).toBe(true);
    expect(djFxFireCounts.fx_scratch_chirp).toBe(4);
    expect(djScratchStop()).toBe(true);
    expect(djFxFireCounts.fx_scratch_stop).toBe(2);
  });

  it('MCP execute_command reaches the same keyboard command by name', () => {
    const src = readFileSync(join(process.cwd(), 'src/hooks/useGlobalKeyboardHandler.ts'), 'utf8');
    expect(src).toMatch(/name: 'dj_scratch_chirp',\s*contexts: \['global'\],\s*handler: djScratchChirp/);
    const bridge = readFileSync(join(process.cwd(), 'src/bridge/handlers/writeHandlers.ts'), 'utf8');
    expect(bridge).toMatch(/registry\.execute\(commandName, 'global'\)/);
  });

  it('every ScratchActionId maps onto a registry id by pattern position; the fader LFO ids are not gestures', () => {
    const ids = Object.keys(SCRATCH_ACTION_TO_FX) as ScratchActionId[];
    expect(ids).toHaveLength(25);
    for (let i = 0; i < 19; i++) {
      expect(SCRATCH_ACTION_TO_FX[ids[i]!]).toBe(`fx_scratch_${SCRATCH_PATTERNS[i]!.gestureId}`);
      expect(fxIdForPattern(SCRATCH_PATTERNS[i]!.name)).toBe(`fx_scratch_${SCRATCH_PATTERNS[i]!.gestureId}`);
    }
    expect(SCRATCH_ACTION_TO_FX.scratch_stop).toBe('fx_scratch_stop');
    for (const id of ['fader_lfo_off', 'fader_lfo_1_4', 'fader_lfo_1_8', 'fader_lfo_1_16', 'fader_lfo_1_32'] as const) {
      expect(SCRATCH_ACTION_TO_FX[id]).toBeNull();
    }
    // Xnn covers every pattern slot: X01..X0F = slots 1-15, X20..X23 = slots 16-19
    for (let i = 0; i < SCRATCH_PATTERNS.length; i++) {
      const param = i < 15 ? i + 1 : 0x20 + (i - 15);
      expect(scratchEffectToFx(param), `slot ${i}`).toEqual({ id: `fx_scratch_${SCRATCH_PATTERNS[i]!.gestureId}`, kind: 'fire' });
    }
  });

  it('the registry carries all 27 gestures, stop, throw, cue, anchor, loop, record and release in the scratch category', () => {
    for (const g of SCRATCH_GESTURE_IDS) {
      const a = DJ_FX_ACTION_MAP[`fx_scratch_${g}` as keyof typeof DJ_FX_ACTION_MAP];
      expect(a, g).toBeDefined();
      expect(a.category).toBe('scratch');
      expect(a.mode).toBe('momentary');
    }
    for (const id of ['fx_scratch_stop', 'fx_scratch_throw', 'fx_scratch_cue', 'fx_scratch_anchor', 'fx_scratch_record', 'fx_scratch_release'] as const) {
      expect(DJ_FX_ACTION_MAP[id].mode, id).toBe('oneshot');
    }
    expect(DJ_FX_ACTION_MAP.fx_scratch_loop.mode).toBe('momentary');
    expect(SCRATCH_FX_ACTIONS).toHaveLength(27 + 7);
  });

  it('a release with finishCycle lets the cycle end instead of a hard stop (the DJ view buttons)', () => {
    fireDjFx('fx_scratch_baby', { deck: 'A', source: 'pad' });
    releaseDjFx('fx_scratch_baby', { deck: 'A', source: 'pad', finishCycle: true });
    expect(deck.finishCalls).toBe(1);
    expect(deck.stopCalls).toBe(0);
  });

  it('the old direct call path has 0 callers outside the registry and its engine seams (static grep over src/)', () => {
    const allowed = new Set([
      'src/engine/dj/DJActions.ts',          // the registry's deck seam (playDeckPattern / stopDeckPattern / finishDeckPatternCycle)
      'src/engine/drumpad/DjFxActions.ts',   // the one fire path
      'src/engine/dj/DeckEngine.ts',         // the method itself
      'src/engine/dj/DJScratchEngine.ts',    // the pattern player
    ]);
    // git grep, not a JS walk: reading all of src/ (~35 MB) in the test
    // process took 83 s on a loaded machine and timed out the push gate.
    // --untracked keeps a new, not yet added file in the scan.
    const pattern = String.raw`\b(deck|getDeck\([^)]*\))\.(playPattern|stopPattern|finishPatternCycle)\(|\b(playDeckPattern|stopDeckPattern|finishDeckPatternCycle)\(`;
    const res = spawnSync('git', ['grep', '--untracked', '-lP', pattern, '--',
      'src/*.ts', 'src/*.tsx', ':!*.test.ts', ':!*.test.tsx', ':!**/__tests__/**'], { cwd: process.cwd(), encoding: 'utf8' });
    // git grep exits 1 when nothing matches; anything else is a broken scan, not a pass
    expect(res.status === 0 || res.status === 1, res.stderr).toBe(true);
    const offenders = res.stdout.split('\n').filter((rel) => rel && !allowed.has(rel));
    expect(offenders).toEqual([]);
    // the Xnn effect goes through the sink DJEngine wires to the registry
    const deckSrc = readFileSync(join(process.cwd(), 'src/engine/dj/DeckEngine.ts'), 'utf8');
    expect(deckSrc).toMatch(/scratchEffectSink/);
    const engineSrc = readFileSync(join(process.cwd(), 'src/engine/dj/DJEngine.ts'), 'utf8');
    expect(engineSrc).toMatch(/setScratchEffectSink\(.*fireScratchEffect/s);
  });
});
