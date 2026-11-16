/** Record the playing Furnace AY song once and build the Vectrex cartridge from it (export dialog only: needs the audio worklet). */
import { useTransportStore, useTrackerStore } from '@stores';
import { ChipRecordingSession, parseRegisterLog } from '../ChipExporter';
import { VGM_SAMPLE_RATE } from '../dispatchRegCapture';
import type { RegisterWrite } from '../VGMExporter';
import { buildVectrexCartridge, fetchVectrexPlayer, type VectrexCartridgeResult } from './vectrexCartridge';

const MAX_RECORD_MS = 10 * 60 * 1000;

/** Rows and 50 Hz frames of one pass over the order list (constant speed; Fxx speed changes are not followed). */
export function orderPassLength(orderRows: readonly number[], speed: number): { rows: number; frames: number } {
  const rows = orderRows.reduce((n, r) => n + r, 0);
  return { rows, frames: rows * speed };
}

/** Writes of the first `frames` 50 Hz frames only (captureToFrames rounds a write to its nearest frame). */
export function cutToFrames(writes: readonly RegisterWrite[], frames: number, sampleRate: number): RegisterWrite[] {
  const origin = writes.reduce((m, w) => Math.min(m, w.timestamp), Infinity);
  return writes.filter((w) => (w.timestamp - origin) < (frames - 0.5) * sampleRate / 50);
}

export async function recordVectrexCartridge(title: string): Promise<VectrexCartridgeResult> {
  const transport = useTransportStore.getState();
  const wasPlaying = transport.isPlaying;
  const wasLooping = transport.isLooping;
  const { patterns, patternOrder } = useTrackerStore.getState();
  const pass = orderPassLength((patternOrder.length ? patternOrder : patterns.map((_, i) => i)).map((i) => patterns[i]?.length ?? 0), transport.speed);
  const session = new ChipRecordingSession();
  transport.setIsLooping(false);
  session.startRecording();
  if (!wasPlaying) await transport.play();
  const t0 = Date.now();
  // The Furnace engine wraps the order list instead of ending: stop after one pass.
  while (useTransportStore.getState().isPlaying && useTransportStore.getState().continuousRow < pass.rows && Date.now() - t0 < MAX_RECORD_MS) {
    await new Promise((r) => setTimeout(r, 200));
  }
  const log = await session.stopRecording();
  useTransportStore.getState().stop();
  useTransportStore.getState().setIsLooping(wasLooping);
  return buildVectrexCartridge(cutToFrames(parseRegisterLog(log), pass.frames, VGM_SAMPLE_RATE), VGM_SAMPLE_RATE, await fetchVectrexPlayer(), title);
}
