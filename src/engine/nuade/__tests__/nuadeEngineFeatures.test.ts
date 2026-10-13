/**
 * NE-6 scopes, NE-7 isolation / dub sends / mute, NE-8 live module swap, NE-9 VU into the meter feed, NE-10 edit port.
 * The real NuadeEngine and worklet and WASM (nuadeEngineRig.ts); only the browser is faked.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { installNuadeRig, until, type Rig } from './nuadeEngineRig';
import { songBuffer } from '../../__tests__/workletHarness';
import { NuadeEngine } from '../NuadeEngine';
import { WASMChannelOutputsEngine } from '@engine/wasm/WASMSingletonBase';
import { useOscilloscopeStore } from '@stores/useOscilloscopeStore';
import { registerChannelMeterSink } from '@engine/tone/channelMeterFeed';
import { createNuadeEditPort } from '../nuadeEditPort';
import { NuadeCap } from '../nuadeProtocol';

const MMDC = 'public/data/songs/formats/captain planet and the planeteers - title.mmdc';

describe('nuade engine features', () => {
  let rig: Rig;
  let engine: NuadeEngine;
  beforeAll(async () => {
    rig = installNuadeRig();
    vi.spyOn(WASMChannelOutputsEngine.prototype as unknown as { afterPlay(): void }, 'afterPlay').mockImplementation(() => undefined);
    engine = NuadeEngine.getInstance();
    await engine.ready();
    await engine.loadTune(songBuffer(MMDC), 'mmdc', 'captain.mmdc');
    await until(() => engine.loaded !== null);
  });
  afterAll(() => { engine.dispose(); registerChannelMeterSink(null); rig.uninstall(); });

  it('NE-6 scopes: moduleLoaded names the voices, playing fills the oscilloscope store with every voice', () => {
    const s = useOscilloscopeStore.getState();
    expect(s.numChannels).toBe(4);
    expect(s.channelNames).toEqual(['Voice 1', 'Voice 2', 'Voice 3', 'Voice 4']);
    engine.play();
    rig.render(2000);
    const data = useOscilloscopeStore.getState().channelData;
    expect(data.length).toBe(4);
    expect(data.filter((d) => d && d.some((v) => v !== 0)).length).toBeGreaterThanOrEqual(2);
    engine.stop();
  });

  it('NE-7 isolation and dub: a voice in a slot leaves the main mix and shows on the slot; enabled dub sends carry each voice; mask bit set = audible', () => {
    engine.play();
    engine.addIsolation(0, 0b0011);
    for (const c of [0, 1, 2, 3]) rig.proc().handleMessage!({ type: 'dubChannelEnable', channel: c });
    const iso = rig.render(1500);
    expect(iso.peaks[1]).toBeGreaterThan(0.01);                        // slot 0 carries voices 0 and 1
    expect(Math.max(...iso.peaks.slice(5, 9))).toBeGreaterThan(0.01);  // dub sends
    engine.removeIsolation(0);
    engine.setMuteMask(0b1111);
    expect(rig.render(300).peaks[0]).toBeGreaterThan(0.01);
    // Two voices isolated leave less in the main mix than none isolated.
    engine.stop(); engine.play();
    const all = rig.render(1500).peaks[0]!;
    engine.stop(); engine.addIsolation(0, 0b1111); engine.play();
    const none = rig.render(1500).peaks[0]!;
    expect(none).toBeLessThan(1e-6);
    expect(all).toBeGreaterThan(0.01);
    engine.removeIsolation(0);
    engine.stop();
  });

  it('NE-8 swapModule: the edited module is opened, sought to the frame already played and played on; swapDone.ms reports it', async () => {
    engine.play();
    rig.render(3750); // 10 s
    const before = (rig.proc() as unknown as { module: { _nw_position(): number } }).module._nw_position();
    const done = new Promise<number>((r) => engine.onSwapDone(r));
    engine.swapModule(songBuffer(MMDC));
    const ms = await done;
    expect(ms).toBeGreaterThanOrEqual(0);
    expect(ms).toBeLessThan(2000);
    expect(engine.lastSwapMs).toBe(ms);
    const after = (rig.proc() as unknown as { module: { _nw_position(): number } }).module._nw_position();
    expect(Math.abs(after - before)).toBeLessThan(2048);
    expect(rig.render(200).peaks[0]).toBeGreaterThan(0.001);
    engine.stop();
  });

  it('NE-9 VU: per-voice levels reach the channel meter feed while it plays', () => {
    const levels: number[][] = [];
    registerChannelMeterSink({ updateRealtimeChannelLevels: (l) => levels.push([...l]), triggerChannelMeter: () => undefined });
    engine.play();
    rig.render(800);
    engine.stop();
    expect(levels.length).toBeGreaterThan(5);
    expect(Math.max(...levels.flat())).toBeGreaterThan(0.01);
  });

  it('NE-10 edit port: null with the real player (StateRead only), present with CELL_WRITE and posting cellWrite', async () => {
    expect(engine.capabilities).toBe(NuadeCap.StateRead);
    expect(engine.editPort).toBeNull();
    // The real WASM refuses the write slot until upstream publishes an API.
    rig.posted.length = 0;
    rig.proc().handleMessage!({ type: 'cellWrite', pattern: 0, row: 0, channel: 0, values: [1, 2, 3, 4, 5] });
    expect(rig.posted.find((m) => m.type === 'writeResult')).toMatchObject({ op: 'cell', status: -52 });
    // A faked caps value turns the port on.
    const sent: unknown[] = [];
    const port = createNuadeEditPort(NuadeCap.StateRead | NuadeCap.CellWrite, (m) => sent.push(m));
    expect(port?.setCell).toBeTypeOf('function');
    expect(port?.setInstrumentParam).toBeUndefined();
    port!.setCell!(1, 2, 3, [9]);
    expect(sent).toEqual([{ type: 'cellWrite', pattern: 1, row: 2, channel: 3, values: [9] }]);
    expect(createNuadeEditPort(NuadeCap.StateRead, () => undefined)).toBeNull();
    // And the state read works.
    const bytes = await engine.readState(0, 16);
    expect(bytes.byteLength).toBe(16);
  });
});
