/**
 * audioProcessing - Destructive AudioBuffer manipulation utilities
 * 1:1 implementations of FastTracker II sample processing routines
 */

/**
 * Resample an AudioBuffer to a new length using nearest-neighbor interpolation
 */
export const resampleBuffer = (buffer: AudioBuffer, ratio: number): AudioBuffer => {
  const newLength = Math.floor(buffer.length * ratio);
  const newBuffer = new AudioContext().createBuffer(
    buffer.numberOfChannels,
    newLength,
    buffer.sampleRate
  );

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const srcData = buffer.getChannelData(ch);
    const dstData = newBuffer.getChannelData(ch);
    
    for (let i = 0; i < newLength; i++) {
      const srcIdx = Math.floor(i / ratio);
      dstData[i] = srcData[srcIdx];
    }
  }

  return newBuffer;
};

/**
 * Apply linear fade in or out to an AudioBuffer
 */
export const applyFade = (
  buffer: AudioBuffer, 
  type: 'in' | 'out', 
  startPct: number
): AudioBuffer => {
  const newBuffer = copyBuffer(buffer);
  const startSample = Math.floor(startPct * buffer.length);
  const fadeLength = buffer.length - startSample;

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = newBuffer.getChannelData(ch);
    for (let i = startSample; i < buffer.length; i++) {
      const progress = (i - startSample) / fadeLength;
      const gain = type === 'in' ? progress : 1 - progress;
      data[i] *= gain;
    }
  }

  return newBuffer;
};

/**
 * Normalize AudioBuffer to 0dB (peak amplitude = 1.0)
 */
export const normalizeBuffer = (buffer: AudioBuffer): AudioBuffer => {
  const newBuffer = copyBuffer(buffer);
  let maxPeak = 0;

  // Find peak
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > maxPeak) maxPeak = abs;
    }
  }

  if (maxPeak === 0) return newBuffer;

  const gain = 1.0 / maxPeak;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = newBuffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      data[i] *= gain;
    }
  }

  return newBuffer;
};

/**
 * Apply destructive Echo/Delay effect to buffer
 */
export const applyEcho = (
  buffer: AudioBuffer,
  delayMs: number,
  feedback: number,
  addMemory: boolean
): AudioBuffer => {
  const delaySamples = Math.floor((delayMs / 1000) * buffer.sampleRate);
  const numEchoes = Math.ceil(Math.log(0.01) / Math.log(feedback));
  const tailLength = addMemory ? delaySamples * numEchoes : 0;
  
  const newLength = Math.min(buffer.length + tailLength, 10 * 1024 * 1024); // Cap at 10M samples
  const newBuffer = new AudioContext().createBuffer(
    buffer.numberOfChannels,
    newLength,
    buffer.sampleRate
  );

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const srcData = buffer.getChannelData(ch);
    const dstData = newBuffer.getChannelData(ch);
    
    // Copy original
    dstData.set(srcData);

    // Apply feedback delay
    for (let i = delaySamples; i < newLength; i++) {
      const delayedVal = dstData[i - delaySamples] * feedback;
      dstData[i] += delayedVal;
      // Clamp to prevent overflow clipping artifacts
      if (dstData[i] > 1) dstData[i] = 1;
      if (dstData[i] < -1) dstData[i] = -1;
    }
  }

  return newBuffer;
};

/**
 * Trim silence from start and end of buffer
 */
export const trimSilence = (buffer: AudioBuffer, threshold: number = 0.001): AudioBuffer => {
  let start = 0;
  let end = buffer.length - 1;

  // Find start
  findStart: for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      if (Math.abs(buffer.getChannelData(ch)[i]) > threshold) {
        start = i;
        break findStart;
      }
    }
  }

  // Find end
  findEnd: for (let i = buffer.length - 1; i >= start; i--) {
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      if (Math.abs(buffer.getChannelData(ch)[i]) > threshold) {
        end = i;
        break findEnd;
      }
    }
  }

  const newLength = end - start + 1;
  const newBuffer = new AudioContext().createBuffer(
    buffer.numberOfChannels,
    newLength,
    buffer.sampleRate
  );

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    newBuffer.getChannelData(ch).set(buffer.getChannelData(ch).subarray(start, end + 1));
  }

  return newBuffer;
};

/**
 * Apply crossfade to loop boundary to eliminate clicks
 * Takes a portion of the audio before the loop end and mixes it with the loop start
 */
export const crossfadeLoop = (
  buffer: AudioBuffer,
  loopStartPct: number,
  xfadeLengthMs: number
): AudioBuffer => {
  const newBuffer = copyBuffer(buffer);
  const sampleRate = buffer.sampleRate;
  const xfadeSamples = Math.floor((xfadeLengthMs / 1000) * sampleRate);
  const loopStart = Math.floor(loopStartPct * buffer.length);
  
  if (xfadeSamples <= 0 || loopStart < xfadeSamples) return newBuffer;

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = newBuffer.getChannelData(ch);
    const loopEnd = buffer.length - 1;

    for (let i = 0; i < xfadeSamples; i++) {
      const targetIdx = loopStart + i;
      const sourceIdx = loopEnd - xfadeSamples + i;
      
      if (targetIdx >= buffer.length || sourceIdx < 0) break;

      // Linear crossfade
      const fraction = i / xfadeSamples;
      data[targetIdx] = (data[targetIdx] * fraction) + (data[sourceIdx] * (1 - fraction));
    }
  }

  return newBuffer;
};

/**
 * Utility: Deep copy an AudioBuffer
 */
export const copyBuffer = (buffer: AudioBuffer): AudioBuffer => {
  const newBuffer = new AudioContext().createBuffer(
    buffer.numberOfChannels,
    buffer.length,
    buffer.sampleRate
  );
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    newBuffer.getChannelData(ch).set(buffer.getChannelData(ch));
  }
  return newBuffer;
};

/**
 * Convert AudioBuffer to Data URL (WAV format)
 */
export const bufferToWaveDataUrl = async (buffer: AudioBuffer): Promise<string> => {
  const wavBlob = await bufferToWaveBlob(buffer);
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(wavBlob);
  });
};

const bufferToWaveBlob = (buffer: AudioBuffer): Promise<Blob> => {
  return new Promise((resolve) => {
    const length = buffer.length * buffer.numberOfChannels * 2 + 44;
    const arrayBuffer = new ArrayBuffer(length);
    const view = new DataView(arrayBuffer);
    const channels = [];
    const sampleRate = buffer.sampleRate;
    let offset = 0;
    let pos = 0;

    // write WAVE header
    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"
    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16); // length = 16
    setUint16(1); // PCM (uncompressed)
    setUint16(buffer.numberOfChannels);
    setUint32(sampleRate);
    setUint32(sampleRate * 2 * buffer.numberOfChannels); // avg. bytes/sec
    setUint16(buffer.numberOfChannels * 2); // block-align
    setUint16(16); // 16-bit
    setUint32(0x61746164); // "data" - chunk
    setUint32(length - pos - 4); // chunk length

    // write interleaved data
    for (let i = 0; i < buffer.numberOfChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }

    while (pos < length) {
      for (let i = 0; i < buffer.numberOfChannels; i++) {
        let sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
        sample = (sample < 0 ? sample * 0x8000 : sample * 0x7fff) | 0; // scale to 16-bit signed
        view.setInt16(pos, sample, true); // update data view
        pos += 2;
      }
      offset++;
    }

    resolve(new Blob([arrayBuffer], { type: 'audio/wav' }));

    function setUint16(data: number) {
      view.setUint16(pos, data, true);
      pos += 2;
    }

    function setUint32(data: number) {
      view.setUint32(pos, data, true);
      pos += 4;
    }
  });
};
