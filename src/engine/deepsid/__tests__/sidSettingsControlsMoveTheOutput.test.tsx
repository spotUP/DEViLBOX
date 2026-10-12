/**
 * Every SID Settings control moves what the SID engines play.
 *
 * Bug (SID-FOLLOWUP-2 c, owner 2026-10-13): Clock Speed Override, ASID
 * Hardware Output, Voice Mask and Audio Buffer Size were component state in
 * SIDSettingsTab - no store, no engine ever read them. Underneath, the engines
 * could not have honoured them either:
 *   - jsSID ran every tune on a PAL clock (no clock input at all), its ASID
 *     start looked for DeepSID's own port picker and threw without it, and its
 *     start() reset the voice mask to all voices;
 *   - JSIDPlay2's chip model and mute messages carried fields its worker does
 *     not read (chipModel / mute instead of userSidModel / value);
 *   - WebSID muted no voice (setVoiceMask only reached tinyrsid's enableVoices),
 *     and the mixer passed the SID only its first chip's 3 voices.
 *
 * Real jsSID (public/deepsid/jsSID-modified.js) and the real JSIDPlay2 worker
 * (WASM GC, in-process) render the output; WebSID's live engine is checked
 * against its backend contract (its WASM behaviour is djSidRenderFollowsSidSettings').
 */
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const holder = vi.hoisted(() => ({
  module: null as unknown,
  port: null as null | { name: string; sent: Uint8Array[]; send(d: Uint8Array): void },
  c64: null as unknown,
}));

vi.mock('../DeepSIDEngineManager', async (orig) => ({
  ...(await orig<typeof import('../DeepSIDEngineManager')>()),
  deepSIDManager: { loadEngine: async () => holder.module },
}));
vi.mock('@lib/sid/ASIDDeviceManager', () => ({
  getASIDDeviceManager: () => ({ init: async () => {}, getSelectedPort: () => holder.port }),
}));
vi.mock('@/engine/TrackerReplayer', () => ({
  getTrackerReplayer: () => ({ setChannelMuteMask() {}, getC64SIDEngine: () => holder.c64 }),
}));
// A native <select> per CustomSelect, so the test can pick an option.
vi.mock('@components/common/CustomSelect', () => ({
  CustomSelect: ({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) => (
    <select data-testid={`select-${options.map((o) => o.value).join('|')}`} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  ),
}));

import { render, fireEvent, cleanup } from '@testing-library/react';
import { C64SIDEngine } from '../../C64SIDEngine';
import { ScriptNodePlayerEngine } from '../engines/ScriptNodePlayerEngine';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useMixerStore } from '@/stores/useMixerStore';
import { useFormatStore } from '@/stores/useFormatStore';
import { SIDSettingsTab } from '@/components/dialogs/sid/SIDSettingsTab';

const DEEPSID = join(__dirname, '../../../../public/deepsid/');
const fixture = (f: string) => new Uint8Array(readFileSync(join(__dirname, '../../../lib/sid/__tests__/fixtures', f)));

interface StubCtx extends AudioContext { processors: { size: number; node: { onaudioprocess: ((e: unknown) => void) | null } }[] }

function stubContext(): StubCtx {
  const node = () => ({ connect() {}, disconnect() {}, gain: { value: 1 }, delayTime: { value: 0, setTargetAtTime() {} }, onaudioprocess: null });
  const processors: StubCtx['processors'] = [];
  return {
    sampleRate: 44100, state: 'running', currentTime: 0, destination: node(), processors,
    createGain: node, createChannelSplitter: node, createChannelMerger: node, createDelay: node,
    createScriptProcessor: (size: number) => { const n = node(); processors.push({ size, node: n }); return n; },
  } as unknown as StubCtx;
}

/** Pull `frames` frames of jsSID's mix (channel 0) through its ScriptProcessor. */
function pull(proc: StubCtx['processors'][number], frames: number): Float32Array {
  const out = new Float32Array(frames);
  const bufs = [0, 1, 2, 3].map(() => new Float32Array(proc.size));
  for (let o = 0; o < frames; o += proc.size) {
    proc.node.onaudioprocess!({ outputBuffer: { length: proc.size, numberOfChannels: 4, getChannelData: (c: number) => bufs[c] } });
    out.set(bufs[0].subarray(0, Math.min(proc.size, frames - o)), o);
  }
  return out;
}

/** A tune on jsSID through C64SIDEngine, playing; its mix and the ScriptProcessor it plays through. */
async function jssid(file: string, frames = 44100 * 2): Promise<{ out: Float32Array; size: number; engine: C64SIDEngine; ctx: StubCtx }> {
  useSettingsStore.setState({ sidEngine: 'jssid' });
  holder.module = jsSIDModule;
  const ctx = stubContext();
  const engine = new C64SIDEngine(fixture(file));
  await engine.init(ctx);
  await engine.play();
  const proc = ctx.processors[ctx.processors.length - 1];
  return { out: pull(proc, frames), size: proc.size, engine, ctx };
}

function diffDb(a: Float32Array, b: Float32Array): number {
  let e = 0, s = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) { e += (a[i] - b[i]) ** 2; s += a[i] ** 2; }
  return 10 * Math.log10(e / s);
}

/**
 * The JSIDPlay2 worker script, run in this process (WASM GC in Node), behind the Worker
 * interface. The WASM calls the worker's functions (processSamples...) by global name, so the
 * script runs in global scope, once; postMessage reaches the newest instance.
 */
let jsidHandler: ((e: { data: unknown }) => void) | null = null;
class InProcessJsidWorker {
  private listeners = new Set<(e: MessageEvent) => void>();
  constructor(_url: string) {
    const g = globalThis as unknown as Record<string, unknown>;
    g.postMessage = (m: unknown) => queueMicrotask(() => this.listeners.forEach((l) => l({ data: m } as MessageEvent)));
    if (!jsidHandler) {
      g.importScripts = (f: string) => (0, eval)(readFileSync(DEEPSID + f, 'utf8'));
      g.addEventListener = (_t: string, h: (e: { data: unknown }) => void) => { jsidHandler = h; };
      g.createImageBitmap = async () => ({});
      g.ImageData = class {};
      g.__jsidWasm = readFileSync(DEEPSID + 'jsidplay2-004.wasm');
      const code = readFileSync(DEEPSID + 'jsidplay2-004.wasm_gc-worker.js', 'utf8')
        .replace('TeaVM.wasmGC.load("jsidplay2-004.wasm"', 'TeaVM.wasmGC.load(globalThis.__jsidWasm')
        .replace('const eventMap', 'var instance; var eventMap');
      const add = g.addEventListener;
      (0, eval)(code);
      g.addEventListener = add;
    }
  }
  addEventListener(_t: string, l: (e: MessageEvent) => void) { this.listeners.add(l); }
  removeEventListener(_t: string, l: (e: MessageEvent) => void) { this.listeners.delete(l); }
  postMessage(m: unknown) { queueMicrotask(() => jsidHandler!({ data: m })); }
  terminate() {}
}

/** A tune on JSIDPlay2 through C64SIDEngine: the samples of `clocks` CLOCK events. */
async function jsidplay2(file: string, clocks = 150): Promise<{ out: Float32Array; engine: C64SIDEngine }> {
  useSettingsStore.setState({ sidEngine: 'jsidplay2' });
  holder.module = {};
  const engine = new C64SIDEngine(fixture(file));
  await engine.init(stubContext());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inner = (engine as any).engine;
  inner.sampleBufferL = [];
  for (let i = 0; i < clocks; i++) await inner.workerCall('CLOCK', {}, 'CLOCKED');
  await new Promise((r) => setTimeout(r, 0));
  const chunks: Float32Array[] = inner.sampleBufferL;
  const out = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return { out, engine };
}

const rms = (a: Float32Array) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);

let jsSIDModule: unknown;
beforeAll(() => {
  vi.stubGlobal('Worker', InProcessJsidWorker);
  vi.stubGlobal('alert', () => {});
  const code = readFileSync(DEEPSID + 'jsSID-modified.js', 'utf8');
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  jsSIDModule = { jsSID: new Function(`${code}\nreturn jsSID;`)() };
});

afterEach(() => {
  cleanup();
  useSettingsStore.setState({ sidChipModel: 'auto', sidClockSpeed: 'auto', sidBufferSize: 'auto', sidHardwareMode: 'off', asidEnabled: false });
  holder.port = null;
});

describe('SID Settings controls move the output', () => {
  it('the Settings tab writes each control where the engines read it (settings store, the song\'s channel mutes)', () => {
    useFormatStore.setState({ sidMetadata: { secondSID: true, thirdSID: false } as never });
    useSettingsStore.setState({ sidEngine: 'jssid' });
    const ui = render(<SIDSettingsTab />);
    fireEvent.change(ui.getByTestId('select-auto|PAL|NTSC'), { target: { value: 'NTSC' } });
    expect(useSettingsStore.getState().sidClockSpeed).toBe('NTSC');
    fireEvent.change(ui.getByTestId('select-auto|1024|2048|4096|8192|16384'), { target: { value: '4096' } });
    expect(useSettingsStore.getState().sidBufferSize).toBe(4096);
    fireEvent.click(ui.getByLabelText('ASID Hardware Output'));
    expect(useSettingsStore.getState()).toMatchObject({ asidEnabled: true, sidHardwareMode: 'asid' });
    // A 2SID has 6 voices; chip 2 voice 1 is the song's channel 4.
    fireEvent.click(ui.getByLabelText('Chip 2 Voice 1'));
    expect(useMixerStore.getState().channels[3].muted).toBe(true);
    useMixerStore.getState().setChannelMute(3, false);
  });

  it('clock: jsSID runs a forced NTSC on the NTSC machine (it ran every tune on PAL)', async () => {
    const pal = await jssid('Commando.sid');
    useSettingsStore.getState().setSidClockSpeed('NTSC');
    const ntsc = await jssid('Commando.sid');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((ntsc.engine as any).engine.jsSID.getclock()).toBe(1022727);
    expect(diffDb(pal.out, ntsc.out)).toBeGreaterThan(-10);
    useSettingsStore.getState().setSidClockSpeed('PAL');
    // Two PAL runs differ by jsSID's background noise only.
    expect(diffDb(pal.out, (await jssid('Commando.sid')).out)).toBeLessThan(-45);
  });

  it('clock, chip model and voice mutes: JSIDPlay2 (real worker) plays them', async () => {
    const auto = await jsidplay2('Commando.sid', 600);
    useSettingsStore.getState().setSidClockSpeed('NTSC');
    const ntsc = await jsidplay2('Commando.sid', 600);
    // A CLOCK runs a fixed number of CPU cycles: the NTSC machine's are 985248 / 1022727 = 0.963 as many
    // samples (counted in the worker's sample blocks, so within a block either way).
    const ratio = ntsc.out.length / auto.out.length;
    expect(ratio, String(ratio)).toBeGreaterThan(0.94);
    expect(ratio, String(ratio)).toBeLessThan(0.985);
    useSettingsStore.getState().setSidClockSpeed('auto');

    useSettingsStore.getState().setSidChipModel('8580');
    const as8580 = await jsidplay2('Commando.sid');
    expect(Math.abs(rms(as8580.out) / rms(auto.out) - 1)).toBeGreaterThan(0.05);
    useSettingsStore.getState().setSidChipModel('auto');

    const muted = await jsidplay2('Commando.sid', 0);
    muted.engine.setMuteMask(0); // every voice off
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inner = (muted.engine as any).engine;
    for (let i = 0; i < 150; i++) await inner.workerCall('CLOCK', {}, 'CLOCKED');
    const quiet = Float32Array.from((inner.sampleBufferL as Float32Array[]).flatMap((c) => Array.from(c)));
    // The first sample block still carries the opening frames; muted it is a seventh of the open level, unmuted the same.
    expect(rms(quiet)).toBeLessThan(rms(auto.out) * 0.25);
  }, 300_000);

  it('clock and voice mask: the live WebSID engine restarts the track on a forced clock and mutes through enableVoice', async () => {
    const calls: unknown[][] = [];
    const adapter = {
      setNTSC: (n: number) => calls.push(['setNTSC', n]),
      setSID6581: (n: number) => calls.push(['setSID6581', n]),
      enableVoice: (c: number, v: number, on: number) => calls.push(['enableVoice', c, v, on]),
      Module: { ccall: (name: string, _r: string, _t: string[], args: number[]) => calls.push([name, ...args]) },
    };
    const engine = new ScriptNodePlayerEngine(fixture('Commando.sid'), 'websid', { forceClock: 'NTSC', bufferSize: 2048 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = engine as any;
    e.adapter = adapter;
    e.player = { _initByUserGesture() {}, _onTrackReadyToPlay: () => {}, setVolume() {}, _prepareTrackForPlayback: () => true };
    await engine.play(stubContext());
    expect(calls.slice(0, 2)).toEqual([['setNTSC', 1], ['emu_set_subsong', 0]]);
    calls.length = 0;
    engine.setVoiceMask(4, true); // chip 2, voice 2
    expect(calls).toContainEqual(['enableVoice', 1, 1, 0]);
    expect(calls).toContainEqual(['enableVoice', 0, 0, 1]);
    // The buffer it asks the ScriptNodePlayer for.
    let size = 0;
    e.adapter = { setProcessorBufSize: (n: number) => { size = n; } };
    await e.createPlayer({ initialize: async () => {}, getInstance: () => ({}) });
    expect(size).toBe(2048);
  });

  it('buffer size: jsSID and JSIDPlay2 play through the forced ScriptProcessor size, their own on auto', async () => {
    expect((await jssid('Commando.sid', 1)).size).toBe(16384);
    useSettingsStore.getState().setSidBufferSize(4096);
    const forced = await jssid('Commando.sid', 4096);
    expect(forced.size).toBe(4096);

    const j = await jsidplay2('Commando.sid', 0);
    const ctx = stubContext();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (j.engine as any).engine.play(ctx);
    expect(ctx.processors[0].size).toBe(4096);
    j.engine.dispose();
  }, 300_000);

  it('ASID: jsSID sends the tune\'s register writes to the MIDI port as ASID SysEx when on, none when off', async () => {
    const port = { name: 'USB-SID-Pico', sent: [] as Uint8Array[], send(d: Uint8Array) { this.sent.push(d); } };
    holder.port = port;
    await jssid('Commando.sid', 44100);
    expect(port.sent.length).toBe(0);

    useSettingsStore.getState().setAsidEnabled(true);
    const on = await jssid('Commando.sid', 44100);
    expect(on.engine.isASIDActive()).toBe(true);
    expect(port.sent.length).toBeGreaterThan(10);
    expect(Array.from(port.sent[port.sent.length - 1].slice(0, 3))).toEqual([0xF0, 0x2D, 0x4E]);
  });

  it('voice mask: a mixer mute of a 2SID\'s second-chip voice reaches the playing tune (the mixer passed the first chip\'s 3 only)', async () => {
    const mixer = await import('@/stores/useMixerStore');
    await mixer.muteRegistryReady;
    const all = await jssid('Sparkster-Lakeside_2SID.sid', 1);
    holder.c64 = all.engine;
    const proc = all.ctx.processors[all.ctx.processors.length - 1];
    const before = pull(proc, 44100 * 2);

    const again = await jssid('Sparkster-Lakeside_2SID.sid', 1);
    holder.c64 = again.engine;
    useMixerStore.getState().setChannelMute(3, true);
    const after = pull(again.ctx.processors[again.ctx.processors.length - 1], 44100 * 2);
    useMixerStore.getState().setChannelMute(3, false);
    expect(diffDb(before, after)).toBeGreaterThan(-30);
  }, 120_000);
});
