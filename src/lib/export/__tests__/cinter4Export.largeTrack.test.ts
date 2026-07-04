/**
 * Cinter4 export must not overflow the stack on a long track.
 *
 * The songdata assembly used `out.push(...notesBytes)`; the note stream of a long
 * Cinter song is tens of thousands of bytes, and spreading that many arguments blows
 * the call stack ("Maximum call stack size exceeded"). That crashed the live
 * re-export on EVERY edit of a large Cinter song — pattern edits and note deletes
 * silently failed to reach playback/save.
 *
 * The real fixture (~9200 ticks) overflows the browser but not node's larger stack,
 * so this doubles the song walk (songlength 50, positions duplicated) to push the
 * note stream past node's spread limit too — fails before the fix, passes after.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { encodeCinter4FromMod } from '@/lib/export/Cinter4Exporter';

const FX = resolve(__dirname, 'fixtures/cinter4');

describe('Cinter4 export — long track (no stack overflow)', () => {
  it('encodes a doubled-length Cinter song without overflowing the call stack', () => {
    const mod = new Uint8Array(readFileSync(resolve(FX, 'CurtCool-BackInSpace.mod')));
    const big = mod.slice();
    // MOD layout: songlength @ 950, positions[128] @ 952. Double the walk by playing
    // the 25-position order twice → ~2× the note stream (past node's spread limit).
    const songlen = big[950];
    big[950] = Math.min(127, songlen * 2);
    for (let i = 0; i < songlen && songlen + i < 128; i++) big[952 + songlen + i] = big[952 + i];

    let res: ReturnType<typeof encodeCinter4FromMod> | null = null;
    expect(() => { res = encodeCinter4FromMod(big); }).not.toThrow();
    expect(res!.songdata.length).toBeGreaterThan(1000);

    // And the real fixture still encodes.
    expect(() => encodeCinter4FromMod(mod)).not.toThrow();
  });
});
