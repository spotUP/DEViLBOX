// @vitest-environment node
/**
 * SF3-5: FluidSynthHost — one shared worklet per AudioContext, slot
 * allocator, refcount with idle dispose. Fake worklet node; the real
 * WASM path is covered by fluidsynthMultiHost.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/utils/audio-context', () => ({
  getDevilboxAudioContext: () => { throw new Error('tests pass a context'); },
}));

interface FakeNode {
  options: { numberOfOutputs: number; outputChannelCount: number[] };
  posted: Array<Record<string, unknown>>;
  port: { postMessage(m: Record<string, unknown>): void; onmessage: ((e: { data: unknown }) => void) | null };
  connections: Array<{ dest: unknown; output?: number }>;
  connect(dest: unknown, output?: number): void;
  disconnect(): void;
  reply(data: Record<string, unknown>): void;
}

let nodes: FakeNode[];
let fetches: string[];
let addModules: number;

function makeCtx(): BaseAudioContext {
  const gain = () => ({ gain: { value: 1 }, connect() {}, disconnect() {} });
  return {
    sampleRate: 48000,
    destination: {},
    createGain: gain,
    audioWorklet: { addModule: async () => { addModules++; } },
  } as unknown as BaseAudioContext;
}

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

async function loadHost() {
  vi.resetModules();
  return import('../FluidSynthHost');
}

async function bootedHost(ctx = makeCtx()) {
  const mod = await loadHost();
  const host = mod.FluidSynthHost.acquire(ctx);
  await flush();
  const node = nodes[nodes.length - 1];
  node.reply({ type: 'ready' });
  await host.ready;
  await flush();
  node.reply({ type: 'sf2Loaded' });
  await host.sfReady;
  return { mod, host, node, ctx };
}

beforeEach(() => {
  nodes = [];
  fetches = [];
  addModules = 0;
  const g = globalThis as Record<string, unknown>;
  g.fetch = async (url: string) => {
    fetches.push(url);
    return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8), text: async () => '' };
  };
  g.AudioWorkletNode = class {
    options: FakeNode['options'];
    posted: FakeNode['posted'] = [];
    connections: FakeNode['connections'] = [];
    port: FakeNode['port'];
    constructor(_ctx: unknown, _name: string, options: FakeNode['options']) {
      this.options = options;
      this.port = { onmessage: null, postMessage: (m) => { this.posted.push(m); } };
      nodes.push(this as unknown as FakeNode);
    }
    connect(dest: unknown, output?: number) { this.connections.push({ dest, output }); }
    disconnect() {}
    reply(data: Record<string, unknown>) { this.port.onmessage?.({ data }); }
  };
});

afterEach(() => { vi.useRealTimers(); });

describe('FluidSynthHost', () => {
  it('shares one host, one addModule and one WASM fetch per context', async () => {
    const { FluidSynthHost } = await loadHost();
    const ctx = makeCtx();
    const a = FluidSynthHost.acquire(ctx);
    const b = FluidSynthHost.acquire(ctx);
    await flush();
    expect(a).toBe(b);
    expect(a.refCount).toBe(2);
    expect(nodes).toHaveLength(1);
    expect(addModules).toBe(1);
    expect(fetches.filter((u) => u.endsWith('FluidSynth.wasm'))).toHaveLength(1);

    const other = FluidSynthHost.acquire(makeCtx());
    await flush();
    expect(other).not.toBe(a);
    expect(addModules).toBe(2);
    // The WASM bytes are context-independent: still one fetch.
    expect(fetches.filter((u) => u.endsWith('FluidSynth.wasm'))).toHaveLength(1);
  });

  it('builds the worklet multi-output: G dry groups + the fx return', async () => {
    const { node, mod } = await bootedHost();
    expect(node.options.numberOfOutputs).toBe(mod.FLUID_GROUPS + 1);
    expect(node.options.outputChannelCount.every((c) => c === 2)).toBe(true);
    const init = node.posted.find((m) => m.type === 'init')!;
    expect(init).toMatchObject({ multi: true, audioGroups: mod.FLUID_GROUPS, midiChannels: mod.FLUID_GROUPS });
  });

  it('loads default.sf2 once on ready', async () => {
    const { node } = await bootedHost();
    expect(fetches.filter((u) => u.endsWith('default.sf2'))).toHaveLength(1);
    expect(node.posted.filter((m) => m.type === 'loadSF2')).toHaveLength(1);
  });

  it('holds messages until the SoundFont is in, then flushes them in order', async () => {
    const { FluidSynthHost } = await loadHost();
    const host = FluidSynthHost.acquire(makeCtx());
    host.post({ type: 'programChange', channel: 2, program: 33 });
    host.post({ type: 'noteOn', channel: 2, key: 40, velocity: 100 });
    await flush();
    const node = nodes[0];
    node.reply({ type: 'ready' });
    await flush();
    expect(node.posted.some((m) => m.type === 'noteOn')).toBe(false);
    node.reply({ type: 'sf2Loaded' });
    const types = node.posted.map((m) => m.type);
    expect(types.slice(types.indexOf('programChange'))).toEqual(['programChange', 'noteOn']);
  });

  it('allocates the lowest free slot, sets its channel type and reuses freed slots', async () => {
    const { host, node } = await bootedHost();
    expect(host.allocSlot(false)).toBe(0);
    expect(host.allocSlot(true)).toBe(1);
    expect(host.allocSlot(false)).toBe(2);
    expect(node.posted.filter((m) => m.type === 'setChannelType')).toEqual([
      { type: 'setChannelType', channel: 0, channelType: 0 },
      { type: 'setChannelType', channel: 1, channelType: 1 },
      { type: 'setChannelType', channel: 2, channelType: 0 },
    ]);
    host.freeSlot(1);
    expect(node.posted.at(-1)).toEqual({ type: 'allSoundsOff', channel: 1 });
    expect(host.allocSlot(false)).toBe(1);
  });

  it('warns and shares a slot when all groups are taken', async () => {
    const { host, mod } = await bootedHost();
    for (let i = 0; i < mod.FLUID_GROUPS; i++) host.allocSlot(false);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const slot = host.allocSlot(false);
    expect(warn).toHaveBeenCalledOnce();
    expect(slot).toBeGreaterThanOrEqual(0);
    expect(slot).toBeLessThan(mod.FLUID_GROUPS);
    expect(host.slotUsers(slot)).toBe(2);
    warn.mockRestore();
  });

  it('slotOutput is fed from worklet output s and reused', async () => {
    const { host, node } = await bootedHost();
    const out = host.slotOutput(5);
    expect(host.slotOutput(5)).toBe(out);
    expect(node.connections.some((c) => c.dest === out && c.output === 5)).toBe(true);
  });

  it('disposes after the idle delay at refcount 0; re-acquire in time keeps it', async () => {
    const { mod, host, node, ctx } = await bootedHost();
    vi.useFakeTimers();
    host.release();
    vi.advanceTimersByTime(mod.FLUID_IDLE_DISPOSE_MS - 1);
    expect(mod.FluidSynthHost.acquire(ctx)).toBe(host);
    vi.advanceTimersByTime(mod.FLUID_IDLE_DISPOSE_MS * 2);
    expect(host.isDisposed).toBe(false);

    host.release();
    vi.advanceTimersByTime(mod.FLUID_IDLE_DISPOSE_MS);
    expect(host.isDisposed).toBe(true);
    expect(node.posted.at(-1)).toEqual({ type: 'dispose' });
    expect(mod.FluidSynthHost.peek(ctx)).toBeUndefined();
    vi.useRealTimers();
    const fresh = mod.FluidSynthHost.acquire(ctx);
    expect(fresh).not.toBe(host);
  });
});
