/**
 * Record the playing Furnace AY song and build the ZX Spectrum 128 .tap from it.
 * Capture needs the browser audio worklet, so this runs from the export dialog only.
 */
import { useTransportStore } from '@stores';
import { ChipRecordingSession, parseRegisterLog } from '../ChipExporter';
import { VGM_SAMPLE_RATE } from '../dispatchRegCapture';
import { buildZxTap, fetchZxPlayer, type ZxTapResult } from './zxTap';

const MAX_RECORD_MS = 10 * 60 * 1000;

/** Play the song once from the start (looping off), record the AY writes, restore the transport. */
export async function recordZxTap(title: string): Promise<ZxTapResult> {
  const transport = useTransportStore.getState();
  const wasPlaying = transport.isPlaying;
  const wasLooping = transport.isLooping;
  const session = new ChipRecordingSession();
  transport.setIsLooping(false);
  session.startRecording();
  if (!wasPlaying) await transport.play();
  const t0 = Date.now();
  // Song end = the transport stops by itself (looping is off).
  while (useTransportStore.getState().isPlaying && Date.now() - t0 < MAX_RECORD_MS) {
    await new Promise((r) => setTimeout(r, 200));
  }
  const log = await session.stopRecording();
  useTransportStore.getState().stop();
  useTransportStore.getState().setIsLooping(wasLooping);
  return buildZxTap(parseRegisterLog(log), VGM_SAMPLE_RATE, await fetchZxPlayer(), title);
}
