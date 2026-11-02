import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FpGrowError, FpHunkModule, cloneHeader, copyStreamRange, fpStreamRanges } from '../fpModuleGrow';
import { FP_WALK, walkFuturePlayer } from '../fpWalk';

// Hybris: a real song with blocks played from many places; the template no longer shares blocks
const bytes = new Uint8Array(readFileSync(join(process.cwd(), 'public/data/songs/formats/hybris.fp')));
const rd32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

describe('fpModuleGrow', () => {
  it('rebuilds an untouched module byte for byte', () => {
    expect(Buffer.from(FpHunkModule.parse(bytes).build()).equals(Buffer.from(bytes))).toBe(true);
  });

  it('refuses a file that is not one code hunk with a RELOC32 table', () => {
    expect(() => FpHunkModule.parse(new Uint8Array(64))).toThrow(FpGrowError);
    expect(() => FpHunkModule.parse(bytes.slice(0, 200))).toThrow(FpGrowError);
  });

  it('grows: a copy of the block with the split, only the one reference moved to it, size words and pointer table follow', () => {
    const mod = FpHunkModule.parse(bytes);
    const before = mod.relocs.length;
    const ranges = fpStreamRanges(mod.code);
    // every pointer to a header whose stream starts the range: the callers that play it
    const callersOf = ([start]: [number, number]) => mod.relocs.filter((o) => { const h = rd32(mod.code, o); return h + 12 <= mod.code.length && rd32(mod.code, h + 8) === start; });
    // a rest the song plays, inside a range played from more than one place
    const rest = walkFuturePlayer(mod.code, 0)!.events.find((e) => e.kind === FP_WALK.rest && callersOf(ranges.find(([a, z]) => e.off >= a && e.off + 2 <= z)!).length > 1)!;
    expect(rest, 'a rest in a shared block').toBeDefined();
    const off = rest.off;
    const [start, end] = ranges.find(([a, z]) => off >= a && off + 2 <= z)!;
    const callers = callersOf([start, end]);
    const restBytes = Array.from(mod.code.slice(off, off + 2));
    const kept = callers.slice(1).map((o) => [o, rd32(mod.code, o)]);
    const { map } = copyStreamRange(mod, start, end, [{ off, bytes: [37, 1, 0, 1], relocAt: [] }]);
    const header = cloneHeader(mod, callers[0], map(start));
    expect(rd32(mod.code, callers[0]), 'the one reference points at the cloned header').toBe(header);
    expect(rd32(mod.code, header + 8), 'the cloned header enters the copy').toBe(map(start));
    expect(Array.from(mod.code.slice(map(off), map(off) + 4))).toEqual([37, 1, 0, 1]);
    for (const [o, v] of kept) expect(rd32(mod.code, o), `the caller at ${o} still plays the original`).toBe(v);
    expect(Array.from(mod.code.slice(off, off + 2)), 'the original block is untouched').toEqual(restBytes);
    const out = mod.build();
    expect(rd32(out, 28)).toBe(mod.code.length / 4);
    expect(rd32(out, 20) & 0x3fffffff).toBe(mod.code.length / 4);
    expect(FpHunkModule.parse(out).relocs.length).toBe(mod.relocs.length);
    expect(mod.relocs.length).toBeGreaterThan(before);
  });
});
