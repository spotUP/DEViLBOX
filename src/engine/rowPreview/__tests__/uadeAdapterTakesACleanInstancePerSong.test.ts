/**
 * A UADE reset reuses the instance's memory and some of the song before stays in it (a corpus song played after others on
 * one instance differed from itself on a clean one), so the adapter asks for a clean instance when a different song is about
 * to open, and resets in place for a restart or a re-open of the same song.
 */
import { describe, it, expect, vi } from 'vitest';
import { songBuffer } from '../../__tests__/workletHarness';
import { UadeRowAdapter } from '../adapters/uadeAdapter';
import { nodeUadeWasm } from './uadeNodeModule';

const RATE = 48000;
const song = (file: string) => new Uint8Array(songBuffer(file));
const args = (name: string) => [name, 0, false, undefined, { kind: 'frames' }];

describe('UadeRowAdapter instances', () => {
  it('makes a clean instance for another song, not for the same one', async () => {
    const make = vi.fn(() => nodeUadeWasm(RATE));
    const adapter = new UadeRowAdapter(await nodeUadeWasm(RATE), RATE, make);
    const a = song('public/data/songs/rob-hubbard/skateordie.rh');
    const b = song('public/data/songs/sound-master/rackney\'sisland 4.sm');

    await adapter.prepare(args('skateordie.rh'), a);
    expect(make, 'the first song opens on the instance the adapter was made with').not.toHaveBeenCalled();
    adapter.open(a, args('skateordie.rh'));
    adapter.advanceSilent(48000, 15);

    await adapter.prepare(args('skateordie.rh'), a);
    adapter.open(a, args('skateordie.rh'));
    expect(make, 'the same song again resets in place').not.toHaveBeenCalled();

    await adapter.prepare(args('rackney\'sisland 4.sm'), b);
    expect(make, 'another song gets a clean instance').toHaveBeenCalledTimes(1);
    adapter.open(b, args('rackney\'sisland 4.sm'));
    expect(adapter.renderChunk(128, 15).frames).toBe(128);
  }, 60_000);
});
