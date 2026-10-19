/**
 * Plays the server's Up Rough render of the tracker song. Uses the app's shared
 * AudioContext (the same one the sample browser decodes with); a second play
 * stops the first.
 */
import { getAudioContext } from '../../audio/AudioContextSingleton';

let current: AudioBufferSourceNode | null = null;

export function stopAudition(): void {
  if (!current) return;
  current.onended = null;
  try { current.stop(); } catch { /* already stopped */ }
  current.disconnect();
  current = null;
}

/** Decodes WAV bytes and plays them from the start, replacing any earlier audition. */
export async function playAudition(wav: ArrayBuffer): Promise<void> {
  const ctx = getAudioContext();
  const buffer = await ctx.decodeAudioData(wav);
  stopAudition();
  if (ctx.state === 'suspended') await ctx.resume();
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(ctx.destination);
  src.onended = () => { if (current === src) current = null; };
  current = src;
  src.start();
}
