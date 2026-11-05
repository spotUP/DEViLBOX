/**
 * Sound Factory instrument sample bytes for the Sampler.
 *
 * createSamplerInstrument -> pcm8ToWAV (AmigaUtils.ts) reads its input as raw
 * two's-complement 8-bit bytes (`b < 128 ? b : b - 256`), exactly what every
 * other Amiga parser passes: the file's own bytes. The Sound Factory parser used
 * to add 128 first (offset binary), which flips the sign bit of every sample:
 * a wave at +10 played as -118, every zero crossing became a jump of 128. That
 * is the "dirty and broken" instrument preview.
 */
export function soundFactoryPcmBytes(sampleData: Int8Array): Uint8Array {
  const bytes = new Uint8Array(sampleData.length);
  for (let i = 0; i < sampleData.length; i++) bytes[i] = sampleData[i] & 0xff;
  return bytes;
}
