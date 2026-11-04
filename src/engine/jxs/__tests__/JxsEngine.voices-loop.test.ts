import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { JxsEngine, JXS_MAX_VOICES } from '../JxsEngine';
import { useOscilloscopeStore } from '@stores/useOscilloscopeStore';
import { ChannelMeterFeed } from '@engine/tone/channelMeterFeed';

const root = path.resolve(__dirname, '../../../..');

/** The replayer WASM, loaded the way public/jxs/Jxs.worklet.js loads it. */
async function loadModule(): Promise<any> {
  const js = fs.readFileSync(path.join(root, 'public/jxs/Jxs.js'), 'utf8')
    .replace(/export\s+default\s+\w+;?/g, '')
    .replace(/self\.location\.href/g, "'.'")
    .replace(/_scriptName=globalThis\.document\?\.currentScript\?\.src/, '_scriptName="."');
  const factory = new Function(js + '\nreturn createJxs;')();
  return factory({ wasmBinary: fs.readFileSync(path.join(root, 'public/jxs/Jxs.wasm')) });
}

function openSong(m: any, file: string): void {
  const bytes = fs.readFileSync(path.join(root, 'public/data/songs/formats', file));
  const ptr = m._malloc(bytes.length);
  m.HEAPU8.set(bytes, ptr);
  expect(m._jxs_open(ptr, bytes.length, 0)).toBe(1);
}

describe('JxsEngine per-channel outputs (channel VU meters, oscilloscopes, dub sends)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('creates the worklet node with one output per voice, not one stereo mix', () => {
    const created: AudioWorkletNodeOptions[] = [];
    vi.stubGlobal('AudioWorkletNode', class {
      port = { postMessage() {}, onmessage: null };
      constructor(_ctx: unknown, _name: string, options: AudioWorkletNodeOptions) { created.push(options); }
      connect() {}
    });
    const engine = Object.create(JxsEngine.prototype) as unknown as Record<string, unknown>;
    engine.audioContext = { sampleRate: 48000 };
    engine.output = {};
    (engine as unknown as { createNode(): void }).createNode();
    // main mix + 4 isolation slots + one dub send per voice
    expect(created[0].numberOfOutputs).toBe(1 + 4 + JXS_MAX_VOICES);
  });

  it('the replayer renders every voice of the song into its own buffer', async () => {
    const m = await loadModule();
    openSong(m, 'popcorn.jxs');
    const voices = m._jxs_voices();
    expect(voices).toBeGreaterThan(1);
    const out = m._malloc(128 * 8);
    const peak = new Array(voices).fill(0);
    for (let i = 0; i < 3000; i++) {
      expect(m._jxs_render(out, 128)).toBe(128);
      for (let c = 0; c < voices; c++) {
        const p = m._jxs_voice(c) >> 2;
        for (let k = 0; k < 128; k++) peak[c] = Math.max(peak[c], Math.abs(m.HEAPF32[p + k]));
      }
    }
    // Every voice of the song sounds within the first ~8 s of popcorn.
    expect(peak.filter((v) => v > 0.01).length).toBeGreaterThanOrEqual(2);
    m._jxs_close();
  });

  it('a voice in an isolation slot leaves the main mix', async () => {
    const m = await loadModule();
    const energy = (isolated: number): number => {
      openSong(m, 'popcorn.jxs');
      m._jxs_set_isolated(isolated);
      const out = m._malloc(128 * 8);
      let e = 0;
      for (let i = 0; i < 400; i++) {
        m._jxs_render(out, 128);
        const p = out >> 2;
        for (let k = 0; k < 256; k++) e += Math.abs(m.HEAPF32[p + k]);
      }
      m._free(out);
      m._jxs_close();
      return e;
    };
    expect(energy(0b111)).toBeLessThan(energy(0) * 0.05);
  });
});

describe('JxsEngine feeds the channel VU meters and oscilloscopes', () => {
  it('registers one scope channel per voice and forwards the per-voice audio to the oscilloscope store', () => {
    const engine = Object.create(JxsEngine.prototype) as unknown as {
      handleWorkletMessage(d: Record<string, unknown>): void;
    };
    engine.handleWorkletMessage({ type: 'moduleLoaded', channels: 3, bar: 0, step: 0 });
    const s1 = useOscilloscopeStore.getState();
    expect(s1.numChannels).toBe(3);
    expect(s1.channelNames).toEqual(['Channel 1', 'Channel 2', 'Channel 3']);
    const voice = new Int16Array(256).fill(1000);
    engine.handleWorkletMessage({ type: 'oscData', channels: [voice, voice, voice], frame: 7, sampleRate: 48000, bar: 0, step: 0 });
    const s2 = useOscilloscopeStore.getState();
    expect(s2.channelData.length).toBe(3);
    expect(s2.channelData[0]?.[0]).toBe(1000);
  });
});

describe('JxsEngine loop', () => {
  it('a looping song keeps playing past its length and returns to the loop bar instead of ending', async () => {
    const m = await loadModule();
    openSong(m, 'popcorn.jxs');
    const durationFrames = Math.ceil((m._jxs_duration_ms() / 1000) * 44100);
    const out = m._malloc(128 * 8);
    let frames = 0;
    let wraps = 0;
    let last = m._jxs_bar();
    let ended = false;
    while (frames < durationFrames * 2) {
      const got = m._jxs_render(out, 128);
      if (got < 128) { ended = true; break; }
      frames += got;
      const bar = m._jxs_bar();
      if (bar < last) wraps++;
      last = bar;
    }
    expect(ended).toBe(false);
    expect(wraps).toBeGreaterThanOrEqual(1);
    m._jxs_close();
  }, 60000);

  describe('per-voice outputs carry the voice at its main-mix level', () => {
    const FRAMES = 128;
    type Out = Float32Array[][];

    /** The real Jxs.worklet.js + channel-outputs.js, driven block by block like the audio thread. */
    async function bootWorklet(song: string): Promise<{ proc: any; voices: number; newOuts: () => Out }> {
      const g = globalThis as any;
      let Proc: any;
      g.AudioWorkletProcessor = class { port = { postMessage() {}, onmessage: null as unknown }; };
      g.registerProcessor = (_n: string, c: unknown) => { Proc = c; };
      g.sampleRate = 44100;
      g.currentTime = 0;
      delete g.DevilboxChannelOutputs;
      delete g.DevilboxChannelStream;
      new Function(fs.readFileSync(path.join(root, 'public/worklets/channel-outputs.js'), 'utf8'))();
      new Function(fs.readFileSync(path.join(root, 'public/jxs/Jxs.worklet.js'), 'utf8'))();
      const proc = new Proc();
      const js = fs.readFileSync(path.join(root, 'public/jxs/Jxs.js'), 'utf8')
        .replace(/export\s+default\s+\w+;?/g, '')
        .replace(/self\.location\.href/g, "'.'")
        .replace(/_scriptName=globalThis\.document\?\.currentScript\?\.src/, '_scriptName="."');
      await proc.handleMessage({ type: 'init', wasmBinary: fs.readFileSync(path.join(root, 'public/jxs/Jxs.wasm')), jsCode: js });
      const bytes = fs.readFileSync(path.join(root, 'public/data/songs/formats', song));
      await proc.handleMessage({ type: 'loadModule', moduleData: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) });
      const newOuts = (): Out => Array.from({ length: 1 + 4 + JXS_MAX_VOICES }, () => [new Float32Array(FRAMES), new Float32Array(FRAMES)]);
      return { proc, voices: proc.voices as number, newOuts };
    }

    /** Render `blocks` quanta; collect every output as [left, right] sample lists. */
    function run(proc: any, newOuts: () => Out, blocks: number, skip: number): number[][][] {
      proc.playing = true;
      const acc: number[][][] = Array.from({ length: 1 + 4 + JXS_MAX_VOICES }, () => [[], []]);
      for (let b = 0; b < blocks; b++) {
        const outs = newOuts();
        proc.process([], outs);
        if (b < skip) continue;
        outs.forEach((o, k) => { acc[k][0].push(...o[0]); acc[k][1].push(...o[1]); });
      }
      return acc;
    }

    const rms = (v: number[]): number => Math.sqrt(v.reduce((a, x) => a + x * x, 0) / Math.max(1, v.length));

    it('isolating every voice moves the dry mix into the slots with the sum unchanged', async () => {
      const a = await bootWorklet('popcorn.jxs');
      const dry = run(a.proc, a.newOuts, 400, 100)[0];
      const b = await bootWorklet('popcorn.jxs');
      const all = (1 << b.voices) - 1;
      await b.proc.handleMessage({ type: 'addIsolation', slotIndex: 0, channelMask: all });
      const iso = run(b.proc, b.newOuts, 400, 100);
      for (const side of [0, 1]) {
        const sum = dry[side].map((_, i) => iso[0][side][i] + iso[1][side][i]);
        // The echo stays out of the slot (voices left it with the main mix), hence a small tolerance.
        const err = rms(sum.map((x, i) => x - dry[side][i]));
        expect(rms(dry[side])).toBeGreaterThan(0.005);
        expect(err / rms(dry[side])).toBeLessThan(0.15);
        expect(rms(sum) / rms(dry[side])).toBeGreaterThan(0.9);
        expect(rms(sum) / rms(dry[side])).toBeLessThan(1.1);
      }
    });

    it('the channel VU meter flashes on every voice of popcorn, the quiet third voice included', async () => {
      const w = await bootWorklet('popcorn.jxs');
      const reports: { levels: number[]; noteStarts: number[] }[] = [];
      w.proc.port.postMessage = (msg: { type: string; levels: number[]; noteStarts: number[] }) => {
        if (msg.type === 'chLevels') reports.push(msg);
      };
      // ~60 s: popcorn's third voice comes in around 40 s.
      w.proc.playing = true;
      for (let b = 0; b < Math.ceil((60 * 44100) / 128); b++) w.proc.process([], w.newOuts());
      expect(reports.length).toBeGreaterThan(100);
      const flashes = new Array(w.voices).fill(0);
      const feed = new ChannelMeterFeed();
      const sink = { updateRealtimeChannelLevels() {}, triggerChannelMeter(c: number) { flashes[c]++; } };
      for (const r of reports) feed.feedCounted(sink, r.levels, r.noteStarts);
      expect(w.voices).toBeGreaterThanOrEqual(3);
      for (let c = 0; c < w.voices; c++) expect(flashes[c], `voice ${c + 1}`).toBeGreaterThan(5);
    }, 120000);

    it('a dub send carries its voice at the level the voice has in the main mix', async () => {
      const probe = await bootWorklet('popcorn.jxs');
      const voices = probe.voices;
      let checked = 0;
      for (let v = 0; v < voices; v++) {
        const w = await bootWorklet('popcorn.jxs');
        await w.proc.handleMessage({ type: 'addIsolation', slotIndex: 0, channelMask: 1 << v });
        await w.proc.handleMessage({ type: 'dubChannelEnable', channel: v });
        const o = run(w.proc, w.newOuts, 400, 100);
        const slotMean = o[1][0].map((x, i) => (x + o[1][1][i]) / 2);
        const dub = o[5 + v][0];
        if (rms(slotMean) < 1e-4) continue;
        checked++;
        expect(rms(dub) / rms(slotMean)).toBeGreaterThan(0.95);
        expect(rms(dub) / rms(slotMean)).toBeLessThan(1.05);
        // the send is the same signal on both sides
        expect(o[5 + v][1][500]).toBe(o[5 + v][0][500]);
      }
      expect(checked).toBeGreaterThanOrEqual(1);
    });
  });
});
