/**
 * Record the playing Furnace QuadTone (ZX Spectrum beeper) song and build the 128K .tap from it.
 * Capture needs the browser audio worklet (it snapshots the chip's register pool after every tick), so this runs from the export dialog only.
 */
import { useFormatStore, useTransportStore, useTrackerStore } from '@stores';
import { FurnaceDispatchEngine } from '../../../engine/furnace-dispatch/FurnaceDispatchEngine';
import { orderPassLength } from '../vectrex/vectrexCapture';
import { buildZxBeeperTap, fetchZxBeeperPlayer } from './zxTap';
import { encodeQuadTone, quadToneFramesFromBatches, quadToneSampleBits, QUADTONE_PLATFORM } from './zxQuadToneData';

const MAX_RECORD_MS = 10 * 60 * 1000;

export interface ZxQuadToneTapResult { tap: Uint8Array; seconds: number; records: number; warnings: string[] }

export async function recordZxQuadToneTap(title = 'devilbox', author = ''): Promise<ZxQuadToneTapResult> {
  const fmt = useFormatStore.getState();
  const chipIndex = fmt.furnaceNative?.chipIds.indexOf(QUADTONE_PLATFORM) ?? -1;
  if (chipIndex < 0) throw new Error('This song has no ZX Spectrum QuadTone beeper chip.');
  const transport = useTransportStore.getState();
  const { patterns, patternOrder } = useTrackerStore.getState();
  const pass = orderPassLength(patterns, patternOrder.length ? patternOrder : patterns.map((_, i) => i), transport.speed);
  const wasPlaying = transport.isPlaying;
  const wasLooping = transport.isLooping;
  const d = FurnaceDispatchEngine.getInstance();
  try {
    if (wasPlaying) transport.stop();
    transport.setIsLooping(false);
    d.startRegCapture();
    await transport.play();
    const t0 = Date.now();
    // The Furnace engine wraps the order list instead of ending: stop after one pass.
    while (useTransportStore.getState().isPlaying && useTransportStore.getState().continuousRow < pass.rows && Date.now() - t0 < MAX_RECORD_MS) {
      await new Promise((r) => setTimeout(r, 200));
    }
    d.stopRegCapture();
    await new Promise((r) => setTimeout(r, 100)); // the last tick's batch may still be in flight
  } finally {
    useTransportStore.getState().stop();
    useTransportStore.getState().setIsLooping(wasLooping);
  }
  const frames = quadToneFramesFromBatches(d.getRegCaptureBatches());
  if (!frames.length) throw new Error('Nothing was recorded. Play the song once to unlock audio, then export again.');
  const player = await fetchZxBeeperPlayer('quadtone');
  const samples = (useFormatStore.getState().furnaceSamples ?? []).map(quadToneSampleBits);
  const data = encodeQuadTone({ chipFlags: fmt.furnaceNative?.chipFlags?.[chipIndex], frames, samples }, player.loadAddress + player.dataOffset);
  const tap = buildZxBeeperTap(player, data.drums, data.banks, title, author);
  return { tap, seconds: data.seconds, records: data.records, warnings: data.warnings };
}
