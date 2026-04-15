/**
 * Manual WAV → AudioBuffer parser that bypasses browser decodeAudioData.
 *
 * Some browsers reject valid WAVs with unusual sample rates (e.g. 8363 Hz
 * from Amiga MOD files) or very short samples. This parser reads the WAV
 * header directly and creates an AudioBuffer from the raw PCM data.
 */

/**
 * Check if an ArrayBuffer starts with a RIFF/WAVE header.
 */
export function isWavBuffer(data: ArrayBuffer): boolean {
  if (data.byteLength < 12) return false;
  const view = new DataView(data);
  const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  const wave = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
  return riff === 'RIFF' && wave === 'WAVE';
}

/**
 * Parse a WAV ArrayBuffer into an AudioBuffer WITHOUT using decodeAudioData.
 * Supports 8-bit unsigned, 16-bit signed, and 32-bit float PCM.
 */
export function parseWavToAudioBuffer(wavData: ArrayBuffer): AudioBuffer {
  const view = new DataView(wavData);

  if (!isWavBuffer(wavData)) {
    const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    throw new Error(`Not a WAV file (header "${magic}" instead of "RIFF")`);
  }

  const numChannels = view.getUint16(22, true);
  const sampleRate = view.getUint32(24, true);
  const bitsPerSample = view.getUint16(34, true);

  if (sampleRate === 0 || numChannels === 0 || bitsPerSample === 0) {
    throw new Error(`Invalid WAV: sr=${sampleRate} ch=${numChannels} bps=${bitsPerSample}`);
  }

  // Find 'data' chunk (skip past fmt, smpl, LIST, etc.)
  let dataOffset = 12;
  let dataSize = 0;
  while (dataOffset < view.byteLength - 8) {
    const chunkId = String.fromCharCode(
      view.getUint8(dataOffset), view.getUint8(dataOffset + 1),
      view.getUint8(dataOffset + 2), view.getUint8(dataOffset + 3)
    );
    const chunkSize = view.getUint32(dataOffset + 4, true);
    if (chunkId === 'data') {
      dataOffset += 8;
      dataSize = chunkSize;
      break;
    }
    dataOffset += 8 + chunkSize;
    // WAV chunks must be word-aligned
    if (dataOffset % 2 !== 0) dataOffset++;
  }

  if (dataSize === 0) throw new Error('WAV: data chunk not found or empty');

  const bytesPerSample = bitsPerSample / 8;
  const numSamples = Math.floor(dataSize / (bytesPerSample * numChannels));

  if (numSamples === 0) throw new Error('WAV: zero samples');

  const audioBuffer = new AudioBuffer({ numberOfChannels: numChannels, length: numSamples, sampleRate });

  for (let ch = 0; ch < numChannels; ch++) {
    const channelData = audioBuffer.getChannelData(ch);
    for (let i = 0; i < numSamples; i++) {
      const byteOff = dataOffset + (i * numChannels + ch) * bytesPerSample;
      if (byteOff + bytesPerSample > view.byteLength) break;
      if (bitsPerSample === 16) {
        channelData[i] = view.getInt16(byteOff, true) / 32768;
      } else if (bitsPerSample === 8) {
        channelData[i] = (view.getUint8(byteOff) - 128) / 128;
      } else if (bitsPerSample === 32) {
        channelData[i] = view.getFloat32(byteOff, true);
      } else if (bitsPerSample === 24) {
        // 24-bit signed: read 3 bytes, sign-extend
        const b0 = view.getUint8(byteOff);
        const b1 = view.getUint8(byteOff + 1);
        const b2 = view.getInt8(byteOff + 2); // signed for MSB
        channelData[i] = ((b2 << 16) | (b1 << 8) | b0) / 8388608;
      }
    }
  }

  return audioBuffer;
}
