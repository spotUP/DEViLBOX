/**
 * Which chip the dispatch worklet sends a message to (getChip).
 *
 * A message for a platform with no running chip went to whichever chip came
 * first. That is how a song instrument's synth wrapper forced its patch onto
 * every channel of the song's chip, how an FM command could land on an
 * SN76489, and — for destroyChip — how the first chip's WASM handle was
 * destroyed while the map kept it, leaving the song playing on a freed
 * dispatch.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface Chip { handle: number }
interface Processor {
  chips: Map<number, Chip>;
  wasm: unknown;
  getChip(platformType?: number): Chip | null;
  handleMessage(data: Record<string, unknown>): Promise<void>;
}

let Processor: new () => Processor;

beforeAll(() => {
  const src = readFileSync(resolve(__dirname, '../../../../public/furnace-dispatch/FurnaceDispatch.worklet.js'), 'utf8');
  const scope: Record<string, unknown> = {
    AudioWorkletProcessor: class { port = { postMessage: () => {}, onmessage: null }; },
    registerProcessor: (_name: string, cls: new () => Processor) => { Processor = cls; },
    sampleRate: 48000,
    currentTime: 0,
  };
  new Function(...Object.keys(scope), src)(...Object.values(scope));
});

const YM2612 = 20, SMS = 4, GENESIS = 2, NES = 8, YM2151 = 19, ARCADE = 13;

/** The chips a DefleMask Genesis song runs: Furnace splits Genesis into its parts. */
function genesisSong(): Processor {
  const p = new Processor();
  p.chips = new Map([[YM2612, { handle: 100 }], [SMS, { handle: 200 }]]);
  return p;
}

describe('routing a message to a chip', () => {
  it('sends a Genesis FM instrument to the song\'s YM2612', () => {
    expect(genesisSong().getChip(GENESIS)?.handle).toBe(100);
  });

  it('sends an Arcade FM instrument to the song\'s YM2151', () => {
    const p = new Processor();
    p.chips = new Map([[SMS, { handle: 200 }], [YM2151, { handle: 300 }]]);
    expect(p.getChip(ARCADE)?.handle).toBe(300);
  });

  it('sends a chip\'s own messages to that chip', () => {
    expect(genesisSong().getChip(SMS)?.handle).toBe(200);
  });

  it('does not play a NES command on the song\'s YM2612', () => {
    expect(genesisSong().getChip(NES)).toBeNull();
  });

  it('sends a message that names no platform to the first chip', () => {
    expect(genesisSong().getChip(undefined)?.handle).toBe(100);
  });

  it('does not destroy a running chip when asked to destroy one that is not running', async () => {
    const p = genesisSong();
    const destroy = vi.fn();
    p.wasm = { destroy };
    await p.handleMessage({ type: 'destroyChip', platformType: GENESIS });
    expect(destroy).not.toHaveBeenCalled();
    expect([...p.chips.keys()]).toEqual([YM2612, SMS]);
  });
});
