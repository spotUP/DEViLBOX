/**
 * The mixer's mute mask reaches these worklets the way the mixer builds it:
 * bit N SET = channel N AUDIBLE (useMixerStore forwardReplayerMuteMask).
 *
 * Eleven worklets read the bit the other way round (bit set = muted), so the
 * mixer's all-channels-on mask muted every channel the moment a user touched
 * solo or mute: ASAP had the same fault in its C wrapper (aeba7a72f). Each
 * case loads the real public/<dir>/*.worklet.js in a stand-in
 * AudioWorkletGlobalScope, gives it a recording stand-in for the WASM
 * exports it calls, posts the `setMuteMask` message, and reads what the
 * worklet told the engine core per channel.
 *
 * The WASM behind these is a per-channel gain/mute call, correct on its own;
 * the polarity lives in the worklet loop, so that is what is driven here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../..');

type Proc = {
  port: { onmessage: ((e: { data: unknown }) => void) | null };
  [k: string]: unknown;
};

function load(file: string): new () => Proc {
  let Processor!: new () => Proc;
  const scope: Record<string, unknown> = {
    AudioWorkletProcessor: class { port = { postMessage: () => {}, onmessage: null }; },
    registerProcessor: (_n: string, cls: new () => Proc) => { Processor = cls; },
    sampleRate: 48000, currentTime: 0,
  };
  new Function(...Object.keys(scope), readFileSync(resolve(ROOT, file), 'utf8'))(...Object.values(scope));
  return Processor;
}

async function post(p: Proc, msg: object): Promise<void> {
  await (p.port.onmessage as (e: { data: unknown }) => unknown)({ data: msg });
}

/** What the worklet last told the core, per channel (1 = audible, 0 = silent). */
type Recorder = { audible: Map<number, number>; read?: () => void };

function gainRecorder(p: Proc, setter: string, extra: Record<string, unknown> = {}): Recorder {
  const audible = new Map<number, number>();
  p.module = { [setter]: (ch: number, g: number) => audible.set(ch, g), ...extra };
  return { audible };
}
function muteRecorder(p: Proc, setter: string): Recorder {
  const audible = new Map<number, number>();
  p.module = { [setter]: (ch: number, muted: number) => audible.set(ch, muted ? 0 : 1) };
  return { audible };
}

interface Case {
  name: string;
  file: string;
  /** Install the stand-in core on the processor. */
  arm(p: Proc): Recorder;
  channels: number;
}

const cases: Case[] = [
  { name: 'Pxtone', file: 'public/pxtone/Pxtone.worklet.js', channels: 8,
    arm: (p) => gainRecorder(p, '_pxtone_set_channel_gain', { _pxtone_get_num_units: () => 8 }) },
  { name: 'Organya', file: 'public/organya/Organya.worklet.js', channels: 8,
    arm: (p) => gainRecorder(p, '_organya_set_channel_gain', { _organya_get_num_channels: () => 8 }) },
  { name: 'Sawteeth', file: 'public/sawteeth/Sawteeth.worklet.js', channels: 8,
    arm: (p) => gainRecorder(p, '_sawteeth_set_channel_gain', { _sawteeth_get_num_channels: () => 8 }) },
  { name: 'Ixalance', file: 'public/ixalance/Ixalance.worklet.js', channels: 8,
    arm: (p) => gainRecorder(p, '_ixalance_set_channel_gain') },
  { name: 'Cpsycle', file: 'public/cpsycle/Cpsycle.worklet.js', channels: 8,
    arm: (p) => gainRecorder(p, '_cpsycle_set_channel_gain') },
  { name: 'Sc68', file: 'public/sc68/Sc68.worklet.js', channels: 3,
    arm: (p) => gainRecorder(p, '_sc68_wasm_set_channel_gain') },
  { name: 'Eupmini', file: 'public/eupmini/Eupmini.worklet.js', channels: 8,
    arm: (p) => muteRecorder(p, '_eupmini_set_channel_mute') },
  { name: 'V2M', file: 'public/V2MPlayer.worklet.js', channels: 8,
    arm: (p) => { p.initialized = true; return gainRecorder(p, '_v2m_set_channel_gain'); } },
  { name: 'Symphonie', file: 'public/symphonie/Symphonie.worklet.js', channels: 8,
    arm: (p) => {
      const gains = new Array<number>(8).fill(-1);
      p._expander = { channelGains: gains };
      const audible = new Map<number, number>();
      return { audible, read: () => gains.forEach((g, i) => audible.set(i, g)) };
    } },
];

describe("the mixer's mask (bit set = channel audible) in the worklets that gate per channel", () => {
  for (const c of cases) {
    it(`${c.name}: all-on mask leaves every channel audible, mask 0 mutes all, 0b101 keeps channels 0 and 2`, async () => {
      const p = new (load(c.file))();
      const r = c.arm(p);
      const level = (ch: number) => { r.read?.(); return r.audible.get(ch); };

      await post(p, { type: 'setMuteMask', mask: 0xffffffff });
      for (let ch = 0; ch < c.channels; ch++) expect(level(ch), `ch${ch} all-on`).toBe(1);

      await post(p, { type: 'setMuteMask', mask: 0 });
      for (let ch = 0; ch < c.channels; ch++) expect(level(ch), `ch${ch} mask 0`).toBe(0);

      await post(p, { type: 'setMuteMask', mask: 0b101 });
      expect([level(0), level(1), level(2)]).toEqual([1, 0, 1]);
    });
  }

  it('HippelCoSo: the all-on mask renders every player, mask 0 renders none', async () => {
    const p = new (load('public/hippel-coso/HippelCoSo.worklet.js'))();
    const rendered: number[] = [];
    p.initialized = true;
    p.ctx = 1;
    p.wasm = {
      HEAPF32: new Float32Array(4096),
      _hc_render: (_ctx: number, h: number) => { rendered.push(h); },
    };
    p.players = { 0: { outPtrL: 0, outPtrR: 0 }, 1: { outPtrL: 0, outPtrR: 0 } };
    const run = () => {
      rendered.length = 0;
      (p as unknown as { process(i: unknown[], o: Float32Array[][]): boolean }).process([], [[new Float32Array(128), new Float32Array(128)]]);
      return [...rendered];
    };
    expect(run()).toEqual([0, 1]);                       // before any mask: everything audible
    await post(p, { type: 'setMuteMask', mask: 0xffffffff });
    expect(run()).toEqual([0, 1]);
    await post(p, { type: 'setMuteMask', mask: 0b10 });
    expect(run()).toEqual([1]);
    await post(p, { type: 'setMuteMask', mask: 0 });
    expect(run()).toEqual([]);
  });
});
