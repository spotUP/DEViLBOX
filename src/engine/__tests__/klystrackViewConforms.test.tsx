/**
 * KLYS-CONFORM (owner 2026-10-15): "klystrack is totally weird, it doesn't follow our patterns, it has double
 * play buttons etc". Reported in Ocean Loader III.kt: its own Play/Stop, Export and Inst buttons next to the
 * app's, a "SEQUENCE (collapsed)" bar, a frozen matrix, dead channel scopes and VU meters, and channels drawn
 * out of step with what plays (KLYS-CHANNEL-ROW-OFFSET: every channel at channel 0's pattern row).
 *
 * Reachability: the real KlysView is rendered; its data hook loads the song into the real Klystrack worklet +
 * WASM (standing in only for the AudioWorkletNode), and every message the worklet posts goes through the real
 * KlysEngine message handler (song data -> the format store, position -> the tracker position as the
 * coordinator writes it, per-channel audio -> the scope store, levels -> the channel meters). The grid and the
 * matrix are captured at their shared components (PatternEditorCanvas, SongOrderMatrix).
 *
 * Oracle for the grid: the engine's own per-channel track status (klys_get_track_status: the pattern and step
 * each channel plays), read after every rendered block.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { startWorklet, songBuffer, stereoOutputs, loadSharedWorkletScripts } from './workletHarness';
import type { FormatChannel } from '@/components/shared/format-editor-types';

const captured = vi.hoisted(() => ({
  grid: [] as Array<{ formatChannels: FormatChannel[]; formatCurrentRow?: number; hideVUMeters?: boolean }>,
  gridMounted: 0,
  matrix: null as null | { currentRow?: number; collapsed?: boolean; onToggleCollapse?: unknown; onPositionClick?: unknown },
  matrixMounted: 0,
  engine: null as unknown,
}));

vi.mock('@/components/tracker/PatternEditorCanvas', async () => {
  const R = await import('react');
  return {
    PatternEditorCanvas: (p: { formatChannels: FormatChannel[]; formatCurrentRow?: number; hideVUMeters?: boolean }) => {
      R.useEffect(() => { captured.gridMounted++; return () => { captured.gridMounted--; }; }, []);
      captured.grid.push(p);
      return null;
    },
  };
});
vi.mock('@/components/shared/SongOrderMatrix', async () => {
  const R = await import('react');
  return {
    SongOrderMatrix: (p: { currentRow?: number; collapsed?: boolean }) => {
      R.useEffect(() => { captured.matrixMounted++; return () => { captured.matrixMounted--; }; }, []);
      captured.matrix = p;
      return null;
    },
  };
});
vi.mock('@/engine/klystrack/KlysEngine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/engine/klystrack/KlysEngine')>();
  const K = actual.KlysEngine as unknown as { getInstance: () => unknown; hasInstance: () => boolean };
  K.getInstance = () => captured.engine;
  K.hasInstance = () => !!captured.engine;
  return actual;
});
vi.mock('@/engine/ToneEngine', () => ({ getToneEngine: () => ({}) }));

import { KlysEngine, klysTransform } from '@/engine/klystrack/KlysEngine';
import { PositionCallbacks } from '@/engine/wasm/PositionCallbacks';
import { KlysView } from '@/components/klystrack/KlysView';
import { klysSequenceSteps, klysStepIndexAt } from '@/components/klystrack/klysAdapter';
import { parseKlystrack } from '@/lib/import/formats/KlysParser';
import { registerChannelMeterSink } from '@/engine/tone/channelMeterFeed';
import { useFormatStore } from '@stores/useFormatStore';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useTransportStore } from '@stores/useTransportStore';
import { useOscilloscopeStore } from '@stores/useOscilloscopeStore';

const SONG = 'public/data/songs/klystrack/Ocean Loader III.kt';

describe('the klystrack view', () => {
  it('Ocean Loader III.kt: main transport only, one order matrix that follows playback, every channel drawn at the row it plays, live scopes and meters', { timeout: 240_000 }, async () => {
    loadSharedWorkletScripts();
    const w = await startWorklet('klystrack', 'Klystrack', klysTransform);

    // The real KlysEngine message handler, fed by the real worklet.
    class FakeNode { port = { postMessage() {}, onmessage: null as null | ((e: { data: unknown }) => void) }; connect() {} disconnect() {} }
    (globalThis as { AudioWorkletNode?: unknown }).AudioWorkletNode = FakeNode;
    const connectedToSpeakers = vi.fn();
    const engine = Object.create(KlysEngine.prototype) as Record<string, unknown>;
    Object.assign(engine, {
      // currentTime is the worklet's rendered time: engine level reports are held against the context clock.
      audioContext: { sampleRate: 48000, get currentTime() { return (globalThis as { currentTime?: number }).currentTime ?? 0; } },
      output: { connect: connectedToSpeakers, context: { destination: {} } },
      _positions: new PositionCallbacks(), _songEndCallbacks: new Set(), _songDataCallbacks: new Set(),
      ready: async () => {},
    });
    (engine as unknown as { createNode(): void }).createNode();
    const port = (engine as unknown as { workletNode: FakeNode }).workletNode.port;
    const flush = () => { for (const m of (w.posted as unknown[]).splice(0)) port.onmessage!({ data: m }); };
    const loads: number[] = [];
    engine.loadSong = async (buf: ArrayBuffer) => { loads.push(buf.byteLength); await w.send({ type: 'loadSong', buffer: buf }); flush(); return {}; };
    captured.engine = engine;

    const levels: number[][] = [];
    registerChannelMeterSink({ updateRealtimeChannelLevels: (l) => levels.push(l), triggerChannelMeter() {} });

    // The song as the app loads it: parsed header + order list, file data for the engine.
    const song = parseKlystrack(songBuffer(SONG));
    useTrackerStore.getState().loadPatterns(song.patterns);
    useTrackerStore.getState().setPatternOrder(song.songPositions);
    useFormatStore.setState({ klysNative: song.klysNative!, klysFileData: song.klysFileData! });

    const view = render(<KlysView />);
    for (let i = 0; i < 50 && loads.length === 0; i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(loads.length, 'the view loaded the song into the engine for its data').toBe(1);
    const engineData = () => useFormatStore.getState().klysNative!.sequences.some((s) => s.entries.length > 1);
    for (let i = 0; i < 100 && !engineData(); i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(connectedToSpeakers, 'the view never routes engine audio itself').not.toHaveBeenCalled();
    const native = useFormatStore.getState().klysNative!;
    expect(native.sequences.some((s) => s.entries.length > 1), 'the engine song data reached the store').toBe(true);
    expect(native.instruments[0]?.fm, 'one builder: instruments carry their FM block').toBeTruthy();

    // No per-view transport, export or instrument surface; exactly one order matrix, never collapsed by the view.
    const buttons = [...view.container.querySelectorAll('button')].map((b) => b.textContent ?? '');
    expect(buttons.filter((t) => /play|stop|export|inst/i.test(t)), `view buttons: ${buttons.join(', ')}`).toEqual([]);
    expect(view.container.textContent ?? '').not.toMatch(/collapsed/i);
    expect(captured.matrixMounted, 'exactly one order matrix').toBe(1);
    expect(captured.matrix!.collapsed ?? false).toBe(false);
    expect(captured.matrix!.onToggleCollapse, 'collapse is not owned by the view').toBeUndefined();
    expect(captured.gridMounted, 'one pattern grid').toBe(1);
    expect(captured.grid[captured.grid.length - 1].hideVUMeters ?? false, 'the grid keeps its channel VU meters').toBe(false);

    // Play: the engine's positions drive the tracker position as the coordinator does.
    useTransportStore.setState({ isPlaying: true });
    const unsub = (engine as unknown as KlysEngine).onPositionUpdate((u) => {
      useTrackerStore.getState().setCurrentPosition(u.songPos, true);
      useTransportStore.setState({ currentRow: u.row });
    });
    await w.send({ type: 'play' });
    await w.send({ type: 'enableOsc' });
    const status = (w.proc as unknown as { wasm: { _malloc(n: number): number; _klys_get_track_status(p: number, n: number): number; _klys_get_song_position(): number; HEAPU8: Uint8Array } }).wasm;
    const statusPtr = status._malloc(6 * 32);
    const steps = klysSequenceSteps(native);
    const out = stereoOutputs(1);
    const matrixRows: number[] = [];
    let checkedCells = 0;
    let offsetCells = 0;
    for (let i = 0; i < 48000 * 8 / 128; i++) {
      w.proc.process([], out);
      act(() => flush());
      const songRow = status._klys_get_song_position();
      if (useTrackerStore.getState().currentPositionIndex !== songRow) continue; // the next report has not arrived yet
      matrixRows.push(captured.matrix!.currentRow!);
      expect(captured.matrix!.currentRow, `song row ${songRow}: the matrix highlights its step`).toBe(klysStepIndexAt(steps, songRow));
      const grid = captured.grid[captured.grid.length - 1];
      const n = status._klys_get_track_status(statusPtr, 32);
      const b = status.HEAPU8.subarray(statusPtr, statusPtr + n * 6);
      for (let ch = 0; ch < n; ch++) {
        const pat = b[ch * 6 + 2] | (b[ch * 6 + 3] << 8);
        const step = b[ch * 6 + 4] | (b[ch * 6 + 5] << 8);
        const entry = native.sequences[ch].entries.filter((e) => e.position <= songRow).pop();
        if (!entry || entry.pattern !== pat || step >= native.patterns[pat].numSteps) continue; // channel idle
        const want = native.patterns[pat].steps[step];
        const cell = grid.formatChannels[ch].rows[grid.formatCurrentRow!] as Record<string, number>;
        expect({ ch, songRow, note: cell.note, instrument: cell.instrument, command: cell.command })
          .toEqual({ ch, songRow, note: want.note, instrument: want.instrument, command: want.command });
        checkedCells++;
        if (step !== songRow - native.sequences[0].entries.filter((e) => e.position <= songRow).pop()!.position) offsetCells++;
      }
    }
    unsub();
    expect(checkedCells, 'cells compared against the engine').toBeGreaterThan(100);
    expect(offsetCells, 'some channels play at another offset than channel 0 (the KLYS-CHANNEL-ROW-OFFSET case)').toBeGreaterThan(0);
    const matrixMoves = matrixRows.filter((r, i) => i > 0 && r !== matrixRows[i - 1]).length;
    expect(matrixMoves, 'the matrix followed playback').toBeGreaterThan(0);
    expect(matrixMoves, 'one matrix step per sequence step, not per row').toBeLessThan(matrixRows.length / 8);

    // Scopes and meters: per-channel audio and levels from the engine.
    const scope = useOscilloscopeStore.getState();
    expect(scope.numChannels).toBe(native.channels);
    const sounding = scope.channelData.filter((d) => d && d.some((s) => Math.abs(s) > 300)).length;
    expect(sounding, 'channel scopes show audio').toBeGreaterThanOrEqual(3);
    // Level reports are held until their block is heard (ChannelMeterFeed.reportFromWorklet): let the held ones drain.
    for (let i = 0; i < 150 && levels.length === 0; i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    const peak = new Array(native.channels).fill(0);
    for (const l of levels) l.forEach((v, c) => { peak[c] = Math.max(peak[c], v); });
    expect(peak.filter((p) => p > 0.01).length, `channel meter peaks ${peak.map((p) => p.toFixed(3))}`).toBeGreaterThanOrEqual(3);

    view.unmount();
    registerChannelMeterSink(null);
  });
});
