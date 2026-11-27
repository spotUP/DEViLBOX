/**
 * Offline time-stretch with the pitch kept: the DJ Key Lock stretcher
 * (Signalsmith Stretch, public/signalsmith-stretch) run in its buffer-playback
 * mode inside an OfflineAudioContext. The one stretch path in the app.
 */
import { DeckKeyLock, STRETCH_CONFIG, TONALITY_HZ } from '@engine/dj/DeckKeyLock';

/** Schedule for a length change by `factor` (output length = input length * factor), pitch unchanged. */
export const keepPitchSchedule = (factor: number) =>
  ({ active: true, rate: 1 / factor, semitones: 0, tonalityHz: TONALITY_HZ });

export async function stretchKeepPitch(buffer: AudioBuffer, factor: number): Promise<AudioBuffer> {
  if (!(factor > 0) || !Number.isFinite(factor)) throw new Error(`Invalid stretch factor ${factor}`);
  const channels = buffer.numberOfChannels;
  const length = Math.max(1, Math.round(buffer.length * factor));
  const ctx = new OfflineAudioContext(channels, length, buffer.sampleRate);
  const create = await DeckKeyLock.loadModule(ctx);
  // numberOfInputs 0: the processor plays the buffers added below instead of live input.
  const node = await create(ctx, { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [channels] });
  await node.configure(STRETCH_CONFIG);
  await node.addBuffers(Array.from({ length: channels }, (_, c) => buffer.getChannelData(c).slice()));
  await node.schedule(keepPitchSchedule(factor));
  node.connect(ctx.destination);
  return ctx.startRendering();
}
