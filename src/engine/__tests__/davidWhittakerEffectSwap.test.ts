/** David Whittaker: an effect column changed to a different one-argument command is written in place (same two bytes). */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { walkDavidWhittaker, DW_WALK } from '@/lib/import/formats/DavidWhittakerWasmExtractor';
import { buildDWGridFromWalk, dwEventEffects, dwRowClock, SLOT_KEYS } from '@/lib/import/formats/davidWhittakerGrid';
import { applyDwGridEdits } from '@/lib/import/formats/davidWhittakerEdits';
import { installDwNodeFetch } from '@/lib/import/__tests__/helpers/dwNodeFetch';

let restore = () => {};
beforeAll(() => { restore = installDwNodeFetch(); });
afterAll(() => restore());

const KINDS: number[] = [DW_WALK.globalTranspose, DW_WALK.globalVolume, DW_WALK.speed, DW_WALK.globalFade, DW_WALK.volumeFade, DW_WALK.channelTranspose, DW_WALK.delaySpeed];

describe('David Whittaker effect column changed to another command', () => {
  for (const song of ['david-whittaker/garfield2+.dw']) {
    it(`${song}: same-length command swap reaches the module and re-walks as the new command`, async () => {
      const f = readFileSync(resolve(process.cwd(), 'public/data/songs', song));
      const src = f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer;
      expect.hasAssertions();
      const walk = await walkDavidWhittaker(src);
      const present = new Set(walk.events.filter((e) => KINDS.includes(e.kind)).map((e) => e.kind));
      const from = walk.events.find((e) => KINDS.includes(e.kind) && e.kind !== DW_WALK.speed && e.block !== 0xffffffff)!;
      const toKind = KINDS.find((k) => k !== from.kind && k !== DW_WALK.speed && present.has(k));
      expect(toKind).toBeDefined();
      const clock = dwRowClock(walk);
      const pats = buildDWGridFromWalk(walk).patterns;
      const row = clock.tickToRow(from.ptick).row;
      const cell = pats[Math.floor(row / 64)].channels[from.channel].rows[row % 64] as unknown as Record<string, number>;
      const to = walk.events.find((e) => e.kind === toKind)!;
      const slot = SLOT_KEYS.findIndex(([t]) => cell[t] === dwEventEffects(from)[0][0]);
      expect(slot).toBeGreaterThanOrEqual(0);
      const [kt, kv] = SLOT_KEYS[slot];
      cell[kt] = dwEventEffects(to)[0][0];
      cell[kv] = 5;
      const out = applyDwGridEdits(new Uint8Array(src), walk, pats);
      expect(out.warnings).toEqual([]);
      expect(out.patched).toBeGreaterThan(0);
      const at = from.block + from.pos;
      expect(out.data[at]).toBe(new Uint8Array(src)[to.block + to.pos]);
      expect(out.data[at + 1]).toBe(5);
      const walk2 = await walkDavidWhittaker(out.data.buffer.slice(0) as ArrayBuffer);
      expect(walk2.events.some((e) => e.block + e.pos === at && e.kind === toKind && e.a === 5)).toBe(true);
    });
  }
});
