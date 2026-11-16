/** Record the playing Furnace AY song once and build the Vectrex cartridge from it (export dialog only: needs the audio worklet). */
import { useTransportStore } from '@stores';
import { ChipRecordingSession, parseRegisterLog } from '../ChipExporter';
import { VGM_SAMPLE_RATE } from '../dispatchRegCapture';
import { buildVectrexCartridge, fetchVectrexPlayer, type VectrexCartridgeResult } from './vectrexCartridge';

const MAX_RECORD_MS = 10 * 60 * 1000;

export async function recordVectrexCartridge(title: string): Promise<VectrexCartridgeResult> {
  const transport = useTransportStore.getState();
  const wasPlaying = transport.isPlaying;
  const wasLooping = transport.isLooping;
  const session = new ChipRecordingSession();
  transport.setIsLooping(false);
  session.startRecording();
  if (!wasPlaying) await transport.play();
  const t0 = Date.now();
  while (useTransportStore.getState().isPlaying && Date.now() - t0 < MAX_RECORD_MS) {
    await new Promise((r) => setTimeout(r, 200));
  }
  const log = await session.stopRecording();
  useTransportStore.getState().stop();
  useTransportStore.getState().setIsLooping(wasLooping);
  return buildVectrexCartridge(parseRegisterLog(log), VGM_SAMPLE_RATE, await fetchVectrexPlayer(), title);
}
