/**
 * Record the playing Furnace AY song and build the ZX Spectrum 128 .tap from it.
 * Capture needs the browser audio worklet, so this runs from the export dialog only.
 */
import { useFormatStore, useTransportStore } from '@stores';
import { ChipRecordingSession, parseRegisterLog } from '../ChipExporter';
import { VGM_SAMPLE_RATE } from '../dispatchRegCapture';
import type { RegisterWrite } from '../VGMExporter';
import { switchSubsong } from '../../tracker/subsongSwitch';
import { buildZxTap, fetchZxPlayer, type ZxTapResult } from './zxTap';

const MAX_RECORD_MS = 10 * 60 * 1000;

/** Play the current song once from the start (looping off) and return its AY writes. */
async function recordOnce(): Promise<RegisterWrite[]> {
  const transport = useTransportStore.getState();
  const session = new ChipRecordingSession();
  if (transport.isPlaying) transport.stop();
  transport.setIsLooping(false);
  session.startRecording();
  await transport.play();
  const t0 = Date.now();
  // Song end = the transport stops by itself (looping is off).
  while (useTransportStore.getState().isPlaying && Date.now() - t0 < MAX_RECORD_MS) {
    await new Promise((r) => setTimeout(r, 200));
  }
  const log = await session.stopRecording();
  useTransportStore.getState().stop();
  return parseRegisterLog(log);
}

/** Record every subsong of the song (one when it has none) into one tape; the player switches them with O and P. */
export async function recordZxTap(title: string, author = ''): Promise<ZxTapResult> {
  const wasLooping = useTransportStore.getState().isLooping;
  const fmt = useFormatStore.getState();
  const startSubsong = fmt.furnaceActiveSubsong;
  const indices = fmt.furnaceSubsongs?.length ? fmt.furnaceSubsongs.map((_, i) => i) : [startSubsong];
  const songs: RegisterWrite[][] = [];
  try {
    for (const i of indices) {
      if (indices.length > 1) await switchSubsong(i);
      songs.push(await recordOnce());
    }
  } finally {
    if (indices.length > 1) await switchSubsong(startSubsong);
    useTransportStore.getState().setIsLooping(wasLooping);
  }
  return buildZxTap(songs, VGM_SAMPLE_RATE, await fetchZxPlayer(), title, author);
}
