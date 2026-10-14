/**
 * RP-R: Enter on a stopped nuade song sounds the row the way playback does, rendered by the engine itself.
 *
 * The one reachability test of the engine row preview. Through the real window key handler (useTrackerInput, ProTracker
 * scheme), wicked.wb (Wally Beben: 202 of 786 notes have an instrument of ours, so the instrument path would be mostly
 * silent) is imported by the app's own import, stopped, the cursor put on position 3 row 8 and channel 2 muted through
 * the engine's mask. Enter then runs: playRow -> TrackerReplayer.previewRow -> previewNativeRow -> the row-preview client
 * over the host (in-process, as the worker runs it) -> a private nuade player renders the row -> NuadeEngine.playRowClip
 * -> the REAL Nuade.worklet.js (+ row-clip.js) plays it out of output 0, the scope stream and the meter feed.
 *
 * Asserted: (a) the sentinel - playRowClip ran once, the worklet posted rowClipStarted, the instrument path
 * (triggerNoteAttack) did not run; (b) the audio the worklet emitted equals a linear render of that row with the same
 * mask (max diff 0 before the 5 ms end fade) and sounds; (c) the channel meter fired for the unmuted channels that sound
 * in the row and never for channel 2; (d) channel 2's scope is flat while another channel's moves; (e) the cursor
 * stepped down by the edit step.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
// First: the store's binding to the replayer is then the mock below (imported after the real module, it bound the real one).
import '@/stores/useTrackerStore';
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { renderHook } from '@testing-library/react';
import { installNuadeRig, until, type Rig } from '@/engine/nuade/__tests__/nuadeEngineRig';
import { ROOT, stereoOutputs } from '@/engine/__tests__/workletHarness';
import { NuadeHeadless } from '@/engine/nuade/nuadeHeadless';
import { setNuadeProbe } from '@/engine/nuade/nuadeProbe';
import { WASMChannelOutputsEngine } from '@/engine/wasm/WASMSingletonBase';
import { registerChannelMeterSink, VU_ONSET_RISE } from '@/engine/tone/channelMeterFeed';
import { createRowPreviewHost } from '@/engine/rowPreview/rowPreviewHost';
import { createRowPreviewClient, transportOverHost, setRowPreviewClient } from '@/engine/rowPreview/rowPreviewClient';
import { NuadeRowAdapter } from '@/engine/rowPreview/adapters/nuadeAdapter';
import { RowPreviewStream } from '@/engine/rowPreview/rowPreviewStream';
import type { RowClip } from '@/engine/rowPreview/rowClip';

const toneEngine = vi.hoisted(() => {
  const spies = {
    ensureInstrumentReady: vi.fn(async () => {}),
    triggerNoteAttack: vi.fn(),
    triggerNoteRelease: vi.fn(),
    isChannelMuted: vi.fn((_ch: number) => false),
  };
  return new Proxy(spies, { get: (t, k) => (k in t ? t[k as keyof typeof t] : () => undefined) });
});
vi.mock('@/engine/ToneEngine', () => ({ getToneEngine: () => toneEngine }));
vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => {}, classifyInstruments: () => {} }) },
}));
vi.mock('@/stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/modland/ModlandDetector', () => ({ checkModlandFile: vi.fn(async () => ({ found: true })) }));

// The store hands its edits and the key handler its transport to the replayer; the real TrackerReplayer.previewRow runs on
// a minimal stand-in (it needs only the separation node and the routed-engine set), since the real class builds a Tone graph.
const stand = vi.hoisted(() => ({ replayer: null as unknown }));
vi.mock('@engine/TrackerReplayer', () => {
  const proxy = new Proxy({}, { get: (_t, k) => (k === 'previewRow' ? (stand.replayer as { previewRow: (...a: unknown[]) => unknown }).previewRow.bind(stand.replayer) : k === 'isPlaying' ? () => false : () => undefined) });
  return { getTrackerReplayer: () => proxy, peekTrackerReplayer: () => proxy };
});

import { useTrackerInput } from '@/hooks/tracker/useTrackerInput';
import { useTrackerStore, useCursorStore, useTransportStore } from '@stores';
import { useEditorStore } from '@stores/useEditorStore';
import { useMixerStore } from '@stores/useMixerStore';
import { getBehaviorForScheme } from '@engine/keyboard/EditorBehavior';
import { useOscilloscopeStore } from '@stores/useOscilloscopeStore';

const SONG = 'public/data/songs/wally-beben/wicked.wb';
const SR = 48000;
const press = (key: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

describe('Enter sounds the row through the song\'s engine (wicked.wb, stopped, channel 2 muted)', () => {
  let rig: Rig;
  let headless: NuadeHeadless;
  const meter = vi.fn();
  const levelFeed = vi.fn();
  beforeAll(async () => {
    rig = installNuadeRig();
    vi.spyOn(WASMChannelOutputsEngine.prototype as unknown as { afterPlay(): void }, 'afterPlay').mockImplementation(() => undefined);
    headless = await NuadeHeadless.create();
    setNuadeProbe(async (id, bytes, name) => headless.probeWith(id, bytes, name));
    registerChannelMeterSink({ updateRealtimeChannelLevels: levelFeed, triggerChannelMeter: meter });
    // The row-preview worker, in-process: the same host, over a transport that copies like a worker hop.
    setRowPreviewClient(createRowPreviewClient(transportOverHost(createRowPreviewHost({ Nuade: async () => new NuadeRowAdapter(headless) }))));
    const { TrackerReplayer } = await vi.importActual<typeof import('@engine/TrackerReplayer')>('@engine/TrackerReplayer');
    stand.replayer = { separationNode: { inputTone: {} }, routedNativeEngines: new Set<string>(), previewRow: TrackerReplayer.prototype.previewRow };
  }, 60_000);
  afterAll(async () => {
    setRowPreviewClient(null);
    const { NuadeEngine } = await import('@/engine/nuade/NuadeEngine');
    if (NuadeEngine.hasInstance()) NuadeEngine.getInstance().dispose();
    registerChannelMeterSink(null);
    rig.uninstall();
  });

  it('plays the engine\'s own render of the row: sentinel, samples equal playback\'s, meters and scopes follow the mask, cursor steps', async () => {
    const { useSettingsStore } = await import('@/stores/useSettingsStore');
    useSettingsStore.getState().setFormatEngine('wallyBeben' as never, 'nuade'); // pinned: the default is rollout data

    // The app's import: parse, stores, grid baseline.
    const bytes = new Uint8Array(readFileSync(resolve(ROOT, SONG)));
    const file = new File([bytes.slice().buffer as ArrayBuffer], basename(SONG));
    const { importTrackerModule } = await import('@/lib/song/songBranches');
    await importTrackerModule({
      metadata: { title: file.name, type: 'MOD', channels: -1, patterns: -1, orders: -1, instruments: -1, samples: -1, duration: 0 },
      arrayBuffer: await file.arrayBuffer(), file,
    } as never, { useLibopenmpt: true } as never);

    // Stopped, the pattern editor on position 3 row 8, the ProTracker scheme, edit step 1.
    useTransportStore.setState({ isPlaying: false });
    useEditorStore.setState({ recordMode: false, editStep: 1, activeBehavior: getBehaviorForScheme('protracker') });
    const tracker = useTrackerStore.getState();
    const { NuadeEngine: NuadeEngineClass } = await import('@/engine/nuade/NuadeEngine');
    // Channel 2 muted in the mixer, as the user does, before the song's engine exists: the mixer only tells engines it finds,
    // so the preview must hand the engine the mixer's mask itself (an engine that never played has not been told).
    if (NuadeEngineClass.hasInstance()) NuadeEngineClass.getInstance().dispose();
    useMixerStore.getState().setChannelMute(2, true);

    // A row where the muted channel 2 (voice 2) sounds in the engine's own render and another voice is loud enough to flash
    // its meter: found by asking a scratch stream for the rows of positions 3 on (the grid of a tick-followed song has a row
    // per player tick, so which voice sounds in which row is the player's to say).
    const { liveTrackerSong } = await import('@/lib/song/liveSong');
    const fmtStore = (await import('@/stores/useFormatStore')).useFormatStore.getState();
    const loadArgs = [fmtStore.nuadePlayerId, fmtStore.nuadeFileName, fmtStore.nuadeSubsong, fmtStore.uadeCompanionFiles];
    const scratch = new RowPreviewStream(new NuadeRowAdapter(headless));
    scratch.ensureOpen(bytes, loadArgs);
    const NuadeEngine = NuadeEngineClass;
    expect(NuadeEngine.hasInstance(), 'the mixer found no engine to tell').toBe(false);
    const engine = NuadeEngine.getInstance();
    expect(engine.rowClipMask, 'a fresh engine has heard of no mute').toBe(0xffffffff);
    const peakOf = (v: Float32Array) => v.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
    let POS = -1, ROW = -1;
    search: for (let pos = 3; pos < tracker.patternOrder.length; pos++) {
      const len = tracker.patterns[tracker.patternOrder[pos] ?? 0]!.length;
      for (let r = 0; r < len; r++) {
        const res = await scratch.request(engine.targetOf(liveTrackerSong(), pos, r), 0xffffffff);
        if (res.kind !== 'clip') continue;
        const peaks = res.clip.voices!.map(peakOf);
        if (peaks[2]! > 0.03 && peaks.some((p, v) => v !== 2 && p > VU_ONSET_RISE + 0.02)) { POS = pos; ROW = r; break search; }
      }
    }
    expect(ROW, 'a row where channel 2 and another voice sound').toBeGreaterThanOrEqual(0);
    const pattern = tracker.patterns[tracker.patternOrder[POS] ?? 0]!;
    useTrackerStore.setState({ currentPositionIndex: POS, currentPatternIndex: tracker.patternOrder[POS] ?? 0 });
    useCursorStore.getState().moveCursorToRow(ROW);
    useCursorStore.getState().moveCursorToChannel(0);

    // The engine, as the app has it before any play, with channel 2 muted through the mixer's mask.
    await engine.ready();
    const played: RowClip[] = [];
    const playRowClip = vi.spyOn(engine, 'playRowClip').mockImplementation(function (this: unknown, clip: RowClip) {
      played.push(clip);
      return (NuadeEngine.prototype.playRowClip as (c: RowClip) => void).call(engine, clip);
    });
    const outputs = rig.nodeOptions.at(-1)?.numberOfOutputs ?? 9;
    rig.posted.length = 0;

    expect(NuadeEngine.getInstance(), 'the engine the app resolves is the one the test holds').toBe(engine);
    const { unmount } = renderHook(() => useTrackerInput());
    press('Enter');
    await until(() => rig.posted.some((m) => m.type === 'rowClipStarted'), 60_000);

    // (a) the sentinel
    expect(playRowClip).toHaveBeenCalledTimes(1);
    expect(rig.posted.filter((m) => m.type === 'rowClipStarted')).toHaveLength(1);
    expect(toneEngine.triggerNoteAttack, 'the instrument path did not run').not.toHaveBeenCalled();
    expect(rig.posted.filter((m) => m.type === 'error')).toEqual([]);
    const clip = played[0]!;
    expect(clip.frames, 'a row of the one-tick grid is one player tick: 20 ms at 50 Hz').toBeGreaterThan(0);

    // The worklet plays it: pull until it is done, with the scope and meter posts.
    const got = new Float32Array(clip.frames * 2);
    let at = 0;
    for (let q = 0; q < Math.ceil(clip.frames / 128) + 4; q++) {
      const out = stereoOutputs(outputs);
      rig.proc().process([], out);
      for (let i = 0; i < 128 && at < clip.frames; i++, at++) { got[at * 2] = out[0]![0]![i]!; got[at * 2 + 1] = out[0]![1]![i]!; }
    }
    expect(rig.posted.some((m) => m.type === 'rowClipDone')).toBe(true);

    const MASK = engine.rowClipMask;
    expect((MASK & 0xf) >>> 0, 'the mask the clip was rendered with: voice 2 out, the others in').toBe(0b1011);
    // (b) playback's own render of that row with the same mask (a linear pass from the start, in 128-frame quanta)
    headless.reinit(); headless.clearFiles();
    const fmt = (await import('@/stores/useFormatStore')).useFormatStore.getState();
    headless.open(bytes, fmt.nuadeFileName ?? basename(SONG), fmt.nuadePlayerId!);
    headless.start(headless.defaultSubsong);
    headless.setMuteMask(MASK | 0);
    const ref = new Float32Array(clip.frames * 2);
    for (let f = 0; f < clip.startFrame + clip.frames; f += 128) {
      const r = headless.render(128, false);
      const lo = Math.max(clip.startFrame, f), hi = Math.min(clip.startFrame + clip.frames, f + r.frames);
      if (hi > lo) ref.set(r.stereo.subarray((lo - f) * 2, (hi - f) * 2), (lo - clip.startFrame) * 2);
    }
    const sounding = clip.frames - clip.fadeFrames;
    let maxDiff = 0, peak = 0;
    for (let i = 0; i < sounding * 2; i++) { maxDiff = Math.max(maxDiff, Math.abs(got[i]! - ref[i]!)); peak = Math.max(peak, Math.abs(got[i]!)); }
    expect(maxDiff, `output equals playback's render over ${sounding} frames`).toBe(0);
    expect(peak, 'the row sounds').toBeGreaterThan(0.01);
    console.info(`[RP-R] position ${POS} row ${ROW} of wicked.wb: ${clip.frames} frames from song frame ${clip.startFrame}, max diff ${maxDiff}, peak ${peak.toFixed(3)}`);

    // (c) meters: the voices of the clip that sound, except the muted one
    console.info('[RP-R] voice peaks', clip.voices!.map((v) => peakOf(v).toFixed(3)).join(' '));
    const sounds = (v: Float32Array) => peakOf(v) > 0.02;
    const sounding_voices = clip.voices!.map((v, i) => (sounds(v) ? i : -1)).filter((i) => i >= 0 && i !== 2);
    expect(sounding_voices.length, 'a voice other than channel 2 sounds in the row').toBeGreaterThan(0);
    expect(peakOf(clip.voices![2]!), 'the muted channel sounds in this row, so its mute is what keeps it dark').toBeGreaterThan(0.02);
    // The peak of a voice as played: its samples under the clip's end fade.
    const faded = (v: Float32Array) => v.reduce((m, x, i) => Math.max(m, Math.abs(x) * (i >= clip.frames - clip.fadeFrames ? (clip.frames - i) / clip.fadeFrames : 1)), 0);
    const levels = levelFeed.mock.calls.map((c) => c[0] as number[]);
    expect(levels.length).toBeGreaterThan(0);
    for (const v of sounding_voices) {
      expect(Math.max(...levels.map((l) => l[v] ?? 0)), `channel ${v} level`).toBeCloseTo(faded(clip.voices![v]!), 5);
    }
    expect(levels.every((l) => (l[2] ?? 0) === 0), 'the muted channel stays dark').toBe(true);
    // The note feed flashes the voices whose level jumps past the onset rise, as in playback; never the muted one.
    const metered = new Set(meter.mock.calls.map((c) => c[0] as number));
    for (const v of sounding_voices) if (peakOf(clip.voices![v]!) > VU_ONSET_RISE) expect(metered.has(v), `channel ${v} meter flash`).toBe(true);
    expect(metered.has(2), 'the muted channel does not flash').toBe(false);

    // (d) scopes: channel 2 flat, another channel moves
    const osc = rig.posted.filter((m) => m.type === 'oscData') as unknown as Array<{ channels: Int16Array[] }>;
    expect(osc.length).toBeGreaterThan(0);
    expect(osc.every((m) => m.channels[2]!.every((s) => s === 0)), 'muted channel scope is flat').toBe(true);
    expect(osc.some((m) => m.channels.some((c, i) => i !== 2 && c.some((s) => s !== 0))), 'a sounding channel scope moves').toBe(true);
    expect(useOscilloscopeStore.getState().channelData?.length ?? 1).toBeGreaterThan(0);

    // (e) the cursor stepped by the edit step
    expect(useCursorStore.getState().cursor.rowIndex).toBe((ROW + 1) % pattern.length);
    unmount();
    playRowClip.mockRestore();
  }, 240_000);
});
