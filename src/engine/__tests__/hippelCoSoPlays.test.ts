/**
 * A Jochen Hippel CoSo song (.hipc) plays sound.
 *
 * The CoSo parser hands the module to the native engine route keyed on
 * hippelFileData. That route resolved to the Hippel WASM, which was a
 * transpile of UADE's player shell: its InitPlayer jumped through UADE
 * callbacks that do not exist outside UADE, so it rendered RMS 0 for every
 * Hippel song (prehistoric_tale.hipc, 2026-09-28). The decoder that does play
 * Hippel's formats, libtfmxaudiodecoder, was already built into the TFMX WASM.
 *
 * This drives the route the song takes: parse the real file, pick the engine
 * the router starts for it, and render that engine's worklet with the bytes
 * the router loads, after the mixer's channel mask.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../..');
type Proc = {
  handleMessage(d: unknown): Promise<void>;
  process(i: Float32Array[][], o: Float32Array[][]): boolean;
};
let Processor: new () => Proc;
const posted: Array<{ type?: string }> = [];

beforeAll(() => {
  const src = readFileSync(resolve(ROOT, 'public/tfmx/TFMX.worklet.js'), 'utf8');
  const scope: Record<string, unknown> = {
    AudioWorkletProcessor: class { port = { postMessage: (m: { type?: string }) => posted.push(m), onmessage: null }; },
    registerProcessor: (_n: string, cls: new () => Proc) => { Processor = cls; },
    sampleRate: 44100,
    currentTime: 0,
  };
  // The shared per-voice stream WASMSingletonBase loads ahead of every engine worklet.
  new Function(readFileSync(resolve(ROOT, 'public/worklets/channel-stream.js'), 'utf8'))();
  new Function(...Object.keys(scope), src)(...Object.values(scope));
});

describe('a Hippel CoSo song', { timeout: 60000 }, () => {
  it('routes to the TFMX decoder and renders sound', async () => {
    const file = readFileSync(resolve(ROOT, 'public/data/songs/formats/prehistoric_tale.hipc'));
    const { parseHippelCoSoFile } = await import('@lib/import/formats/HippelCoSoParser');
    const song = await parseHippelCoSoFile(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), 'prehistoric_tale.hipc');

    const { WASM_ENGINES, shouldActivate } = await import('../replayer/NativeEngineRouting');
    const route = WASM_ENGINES.find((d) => shouldActivate(d, song))!;
    expect(route.key).toBe('Hippel');
    const { TFMXEngine } = await import('../tfmx/TFMXEngine');
    expect(await route.dynamicResolver!()).toBe(TFMXEngine);
    expect(route.getLoadArgs!(song)).toEqual([]);

    const p = new Processor();
    const versions = Object.getOwnPropertyDescriptor(process, 'versions')!;
    Object.defineProperty(process, 'versions', { value: {}, configurable: true });
    try {
      await p.handleMessage({
        type: 'init', sampleRate: 44100,
        wasmBinary: readFileSync(resolve(ROOT, 'public/tfmx/TFMX.wasm')),
        jsCode: readFileSync(resolve(ROOT, 'public/tfmx/TFMX.js'), 'utf8'),
      });
    } finally { Object.defineProperty(process, 'versions', versions); }
    await p.handleMessage({ type: 'loadModule', mdatBuffer: (song.hippelFileData as ArrayBuffer).slice(0), smplBuffer: null });
    expect(posted.find((m) => m.type === 'error'), JSON.stringify(posted)).toBeUndefined();
    // On load the mixer forwards its mask, bit N = 1 for an audible channel.
    // The engine translates it for the worklet; it once read the bits
    // inverted and muted all four voices of a song with none muted.
    const sent: Record<string, unknown>[] = [];
    TFMXEngine.prototype.setMuteMask.call({ sendMessage: (m: Record<string, unknown>) => sent.push(m) } as never, 0b1111);
    for (const m of sent) await p.handleMessage(m);
    await p.handleMessage({ type: 'modulePlay' });

    const rms = (secs: number) => {
      let acc = 0, cnt = 0;
      for (let b = 0; b < (44100 * secs) / 128; b++) {
        const l = new Float32Array(128), r = new Float32Array(128);
        p.process([], [[l, r]]);
        for (const v of l) acc += v * v;
        cnt += 128;
      }
      return Math.sqrt(acc / cnt);
    };
    // Measured 0.017-0.024 per second for this song; the dead engine gave 0.
    expect(rms(5)).toBeGreaterThan(0.005);

    // Each voice's own output reaches the oscilloscopes and the per-channel
    // role classifier; the TFMX engine sent none before.
    const osc = (posted as Array<{ type?: string; channels?: Int16Array[] }>).filter((m) => m.type === 'oscData');
    expect(osc.length).toBeGreaterThan(50);
    expect(osc[osc.length - 1].channels!.length).toBe(4);
    const voiceHeard = [0, 1, 2, 3].map((v) => osc.some((m) => m.channels![v].some((x) => x !== 0)));
    // Measured [true, true, false, false]: in the first five seconds only
    // voices 0 and 1 play; the track table brings 2 and 3 in later.
    expect(voiceHeard.slice(0, 2), JSON.stringify(voiceHeard)).toEqual([true, true]);

    // That stream is contiguous and reaches the runtime role classifier:
    // through the store into ChannelAudioTap, one unbroken run per voice.
    const { useOscilloscopeStore } = await import('@stores/useOscilloscopeStore');
    const { updateChannelClassifierFromTap, _peekChannelState, resetRuntimeChannelClassifier } = await import('@/bridge/analysis/ChannelAudioClassifier');
    const { latestChannelAudio } = await import('@/bridge/analysis/ChannelAudioTap');
    resetRuntimeChannelClassifier();
    const frames = osc.map((m) => (m as { frame?: number }).frame!);
    expect(frames.every((f, i) => i === 0 || f === frames[i - 1] + osc[i - 1].channels![0].length)).toBe(true);
    for (const m of osc) {
      const { channels, frame, sampleRate } = m as { channels: Int16Array[]; frame: number; sampleRate: number };
      useOscilloscopeStore.getState().updateChannelData(channels, frame, sampleRate);
      updateChannelClassifierFromTap(4);
    }
    expect(useOscilloscopeStore.getState().channelData[0]!.length).toBe(256); // the scopes' view
    expect(latestChannelAudio(0, 32768)).not.toBeNull();                     // CED's window
    expect(_peekChannelState(0)?.historyLen).toBeGreaterThan(0);

    // The grid follows playback: the worklet reports voice 0's step and read
    // offset, and the parser's cell spans turn the offset into a row.
    const { mapHippelCells } = await import('../hippel/rebuildHippelModule');
    const { hippelRowAt } = await import('../hippel/hippelCellSpans');
    const spans = mapHippelCells(song.hippelFileData as ArrayBuffer, song.instruments.length)!;
    const reports = (posted as Array<{ type?: string; step?: number; patternOffset?: number }>)
      .filter((m) => m.type === 'modulePosition' && (m.step ?? -1) >= 0);
    expect(reports.length).toBeGreaterThan(20);
    const at = reports.map((m) => `${m.step}:${hippelRowAt(spans, m.step!, m.patternOffset!)}`);
    // Measured: 0:0 1:1 1:2 ... 1:6 2:1 ... over five seconds. A step's row 0
    // is a -2 command the player reads together with row 1's note.
    expect(new Set(at).size, at.join(' ')).toBeGreaterThanOrEqual(8);
    expect(Math.max(...reports.map((m) => m.step!))).toBeGreaterThan(0);

    // A grid edit reloads the module. The reload continues where playback
    // was, and voices muted before it stay muted.
    const wasm = (p as unknown as { wasm: { _tfmx_get_samples_rendered(c: unknown): number }; ctx: unknown });
    const before = wasm.wasm._tfmx_get_samples_rendered(wasm.ctx);
    sent.length = 0;
    TFMXEngine.prototype.setMuteMask.call({ sendMessage: (m: Record<string, unknown>) => sent.push(m) } as never, 0);
    for (const m of sent) await p.handleMessage(m);
    await p.handleMessage({ type: 'reloadModule', mdatBuffer: (song.hippelFileData as ArrayBuffer).slice(0), smplBuffer: null });
    const after = wasm.wasm._tfmx_get_samples_rendered(wasm.ctx);
    expect(Math.abs(after - before)).toBeLessThan(44100 * 0.05);
    expect(rms(1)).toBe(0);
  });
});
