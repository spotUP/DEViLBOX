/**
 * Plan item T2 — the dub cell-encoding contract.
 *
 * `DUB_MOVE_TABLE` index is the on-disk `.dbx` contract: a cell stores the
 * index, so reordering or removing an entry reinterprets every saved file.
 * These tests are the ratchet that makes that break loudly.
 *
 * They also guard the failure mode this area keeps producing: a slot pair gets
 * declared in one place and the other paths lag, so a cell either draws wrong
 * (xmEffectToString, 2026-09-18) or draws correctly and silently never fires
 * (DubEffectScanner's independent ceiling). Every path is asserted against the
 * SAME declared range.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  DUB_MOVE_TABLE,
  DUB_MOVE_TABLE_VERSION,
  DUB_MAX_ENCODABLE_MOVES,
  DUB_EFFECT_TYPE_MIN,
  DUB_EFFECT_TYPE_MAX,
  DUB_EFFECT_PARAM_STEP,
  encodeDubEffect,
  decodeDubEffect,
  isDubEffectTypeForDisplay,
  isDubMoveEffectSlot,
} from '../moveTable';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

describe('DUB_MOVE_TABLE — on-disk contract', () => {
  it('version matches length, so any append forces a deliberate bump', () => {
    expect(DUB_MOVE_TABLE.length).toBe(DUB_MOVE_TABLE_VERSION);
  });

  it('has no duplicate move ids — a duplicate would make decode ambiguous', () => {
    expect(new Set(DUB_MOVE_TABLE).size).toBe(DUB_MOVE_TABLE.length);
  });

  it('keeps the historical prefix byte-for-byte — append only, never reorder', () => {
    // Frozen 2026-09-18 at 37 entries. A saved .dbx stores indices, so if any
    // of these move, previously saved cells decode to a DIFFERENT move.
    // Appending past the end is fine and expected; changing this list is not.
    expect(DUB_MOVE_TABLE.slice(0, 37)).toEqual([
      'echoThrow', 'dubStab', 'filterDrop', 'dubSiren', 'springSlam',
      'channelMute', 'channelThrow', 'delayTimeThrow', 'tapeWobble', 'masterDrop',
      'snareCrack', 'tapeStop', 'backwardReverb', 'toast', 'transportTapeStop',
      'tubbyScream', 'stereoDoubler', 'reverseEcho', 'sonarPing', 'radioRiser',
      'subSwell', 'oscBass', 'echoBuildUp', 'delayPreset380', 'delayPresetDotted',
      'crushBass', 'subHarmonic', 'eqSweep', 'springKick', 'delayPresetQuarter',
      'delayPreset8th', 'delayPresetTriplet', 'delayPreset16th', 'delayPresetDoubler',
      'ghostReverb', 'voltageStarve', 'ringMod',
    ]);
  });

  it('fits inside the declared slot capacity', () => {
    expect(DUB_MOVE_TABLE.length).toBeLessThanOrEqual(DUB_MAX_ENCODABLE_MOVES);
  });
});

describe('encode → decode round-trip', () => {
  it('every table move survives a global round-trip', () => {
    for (const moveId of DUB_MOVE_TABLE) {
      const enc = encodeDubEffect(moveId);
      expect(enc, `no encoding for ${moveId}`).not.toBeNull();
      expect(decodeDubEffect(enc!.effTyp, enc!.eff)).toEqual({ moveId });
    }
  });

  it('every table move survives a per-channel round-trip on every channel', () => {
    for (const moveId of DUB_MOVE_TABLE) {
      for (const channelId of [0, 1, 7, 15]) {
        const enc = encodeDubEffect(moveId, channelId);
        expect(enc, `no encoding for ${moveId} ch${channelId}`).not.toBeNull();
        expect(decodeDubEffect(enc!.effTyp, enc!.eff)).toEqual({ moveId, channelId });
      }
    }
  });

  it('the seven moves appended in F2 are now encodable', () => {
    // These were live registry moves with their own modules but no table
    // index, so encodeDubEffect returned null and they could not be written
    // into a cell at all.
    for (const moveId of ['hpfRise', 'madProfPingPong', 'combSweep', 'versionDrop',
                          'skankEchoThrow', 'riddimSection', 'skankFloatThrow']) {
      expect(DUB_MOVE_TABLE).toContain(moveId);
      const enc = encodeDubEffect(moveId, 2);
      expect(enc, `${moveId} still not encodable`).not.toBeNull();
      expect(decodeDubEffect(enc!.effTyp, enc!.eff)).toEqual({ moveId, channelId: 2 });
    }
  });

  it('indices beyond the last entry decode to null rather than a wrong move', () => {
    // Highest nibble of the top pair, which the table does not reach.
    const enc = { effTyp: DUB_EFFECT_TYPE_MAX, eff: 0xf0 };
    expect(decodeDubEffect(enc.effTyp, enc.eff)).toBeNull();
  });

  it('rejects unknown moves and out-of-range channels', () => {
    expect(encodeDubEffect('notAMove')).toBeNull();
    expect(encodeDubEffect('echoThrow', -1)).toBeNull();
    expect(encodeDubEffect('echoThrow', 16)).toBeNull();
  });

  it('the param-step slot is not a move slot', () => {
    expect(isDubMoveEffectSlot(DUB_EFFECT_PARAM_STEP)).toBe(false);
    expect(decodeDubEffect(DUB_EFFECT_PARAM_STEP, 0x60)).toBeNull();
    // ...but it still renders as Z.
    expect(isDubEffectTypeForDisplay(DUB_EFFECT_PARAM_STEP)).toBe(true);
  });

  it('slot pairs partition the index space with no overlap', () => {
    // Each declared pair addresses exactly 16 indices; two moves 16 apart must
    // land on different effTyps, never the same slot with the same nibble.
    const seen = new Map<string, string>();
    for (const moveId of DUB_MOVE_TABLE) {
      const enc = encodeDubEffect(moveId)!;
      const key = `${enc.effTyp}:${enc.eff}`;
      expect(seen.has(key), `${moveId} collides with ${seen.get(key)}`).toBe(false);
      seen.set(key, moveId);
    }
  });
});

describe('every path covers the declared slot range', () => {
  it('the scanner dispatches the whole range — no independent ceiling', () => {
    // Regression: the scanner used to hardcode its own 36..40 max, so a new
    // slot pair produced cells that drew correctly and never fired.
    const src = read('engine/dub/DubEffectScanner.ts');
    expect(src).toContain('isDubEffectTypeForDisplay');
    expect(src).not.toMatch(/DUB_EFFECT_MAX\s*=/);
  });

  it('both grid renderers map every declared slot to Z and are sized for it', () => {
    for (const [file, arr] of [
      ['engine/renderer/TrackerCanvas2DRenderer.ts', 'EFFECT_CHARS_2D'],
      ['engine/renderer/TrackerGLRenderer.ts', 'EFFECT_CHARS'],
    ] as const) {
      const src = read(file);
      const sizeMatch = src.match(new RegExp(`const ${arr}: string\\[\\] = new Array\\((\\d+)\\)`));
      expect(sizeMatch, `${arr} declaration not found in ${file}`).not.toBeNull();
      expect(Number(sizeMatch![1]),
        `${arr} too small for slot ${DUB_EFFECT_TYPE_MAX}`).toBeGreaterThan(DUB_EFFECT_TYPE_MAX);
      for (let t = DUB_EFFECT_TYPE_MIN; t <= DUB_EFFECT_TYPE_MAX; t++) {
        expect(src, `${arr}[${t}] missing in ${file}`).toContain(`${arr}[${t}] = 'Z'`);
      }
    }
  });
});
