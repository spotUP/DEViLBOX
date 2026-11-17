/**
 * Bridge between a Furnace ADPCM voice's `userSample` (16-bit PCM + rate) and the sample editor,
 * which edits a WAV data URL (`parameters.sampleUrl`). The editor's `bufferToDataUrl` always writes
 * 16-bit PCM WAV at the buffer's own rate, so a Resample edit changes `rate` here and the module's
 * SMP2 rate (C-4 rate) and the chip upload follow it.
 */
import type { FurnaceUserSample } from '@/types/instrument/furnace';

const WAV_HEADER = 44;

function base64Of(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Mono 16-bit PCM WAV data URL of a user sample, at the sample's own rate. */
export function userSampleToWavDataUrl(sample: FurnaceUserSample): string {
  const dataSize = sample.data.length * 2;
  const wav = new Uint8Array(WAV_HEADER + dataSize);
  const v = new DataView(wav.buffer);
  const tag = (o: number, t: string) => { for (let i = 0; i < 4; i++) wav[o + i] = t.charCodeAt(i); };
  const rate = Math.round(sample.rate);
  tag(0, 'RIFF'); v.setUint32(4, 36 + dataSize, true); tag(8, 'WAVE'); tag(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  tag(36, 'data'); v.setUint32(40, dataSize, true);
  for (let i = 0; i < sample.data.length; i++) v.setInt16(WAV_HEADER + i * 2, sample.data[i], true);
  return `data:audio/wav;base64,${base64Of(wav)}`;
}

/** The sample editor's WAV data URL (16-bit PCM, any channel count) as a mono user sample: channel 0, the WAV's rate. */
export function userSampleFromWavDataUrl(url: string, name: string): FurnaceUserSample {
  const bin = atob(url.slice(url.indexOf(',') + 1));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const v = new DataView(bytes.buffer);
  if (bytes.length < WAV_HEADER || v.getUint16(34, true) !== 16) throw new Error('The edited sample is not 16-bit PCM WAV');
  const channels = v.getUint16(22, true);
  const frames = Math.floor(v.getUint32(40, true) / (2 * channels));
  const data = new Int16Array(frames);
  for (let i = 0; i < frames; i++) data[i] = v.getInt16(WAV_HEADER + i * 2 * channels, true);
  return { name, data, rate: v.getUint32(24, true) };
}
