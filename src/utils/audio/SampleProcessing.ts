/**
 * Offline sample processing utilities
 */

export interface ExciterOptions {
  drive: number;      // 0-100
  mix: number;        // 0-100
  frequency: number;  // 2000-10000 Hz
}

export interface ProcessedResult {
  buffer: AudioBuffer;
  dataUrl: string;
}

/**
 * Apply a DSP Spectral Exciter to an AudioBuffer
 */
export async function applySpectralExciter(
  buffer: AudioBuffer,
  options: ExciterOptions
): Promise<ProcessedResult> {
  const { drive, mix, frequency } = options;
  const targetSampleRate = Math.max(buffer.sampleRate, 44100);
  const targetLength = Math.ceil(buffer.duration * targetSampleRate);

  const offlineContext = new OfflineAudioContext(
    buffer.numberOfChannels,
    targetLength,
    targetSampleRate
  );

  const source = offlineContext.createBufferSource();
  source.buffer = buffer;

  const highPass = offlineContext.createBiquadFilter();
  highPass.type = 'highpass';
  highPass.frequency.value = frequency;
  highPass.Q.value = 0.707;

  const waveShaper = offlineContext.createWaveShaper();
  const curveSize = 8192;
  const curve = new Float32Array(curveSize);
  const k = drive / 5; // Slightly more aggressive harmonics
  
  for (let i = 0; i < curveSize; i++) {
    const x = (i * 2) / curveSize - 1;
    curve[i] = (1 + k) * x / (1 + k * Math.abs(x));
  }
  waveShaper.curve = curve;

  const airBoost = offlineContext.createBiquadFilter();
  airBoost.type = 'highshelf';
  airBoost.frequency.value = 8000;
  airBoost.gain.value = 4;

  const exciterGain = offlineContext.createGain();
  const mixRatio = mix / 100;
  exciterGain.gain.value = mixRatio;

  const dryGain = offlineContext.createGain();
  // Use power-constant mix logic to prevent clipping
  dryGain.gain.value = Math.sqrt(1 - mixRatio);

  source.connect(dryGain);
  dryGain.connect(offlineContext.destination);

  source.connect(highPass);
  highPass.connect(waveShaper);
  waveShaper.connect(airBoost);
  airBoost.connect(exciterGain);
  exciterGain.connect(offlineContext.destination);

  source.start(0);
  const renderedBuffer = await offlineContext.startRendering();
  const dataUrl = await bufferToDataUrl(renderedBuffer);
  
  return { buffer: renderedBuffer, dataUrl };
}

/**
 * Apply a Denoise process to remove low-level quantization noise
 */
export async function applyDenoise(
  buffer: AudioBuffer,
  threshold: number // -100 to 0 dB
): Promise<ProcessedResult> {
  const offlineContext = new OfflineAudioContext(
    buffer.numberOfChannels,
    buffer.length,
    buffer.sampleRate
  );

  const source = offlineContext.createBufferSource();
  source.buffer = buffer;

  const gate = offlineContext.createWaveShaper();
  const curveSize = 8192;
  const curve = new Float32Array(curveSize);
  const threshLinear = Math.pow(10, threshold / 20);
  const softEdge = threshLinear * 0.2; // Add a small knee to the gate
  
  for (let i = 0; i < curveSize; i++) {
    const x = (i * 2) / curveSize - 1;
    const absX = Math.abs(x);
    const sign = x < 0 ? -1 : 1;
    
    if (absX < threshLinear - softEdge) {
      curve[i] = 0;
    } else if (absX < threshLinear + softEdge) {
      // Soft knee interpolation
      const t = (absX - (threshLinear - softEdge)) / (softEdge * 2);
      curve[i] = sign * x * (t * t);
    } else {
      curve[i] = x;
    }
  }
  gate.curve = curve;

  source.connect(gate);
  gate.connect(offlineContext.destination);

  source.start(0);
  const renderedBuffer = await offlineContext.startRendering();
  const dataUrl = await bufferToDataUrl(renderedBuffer);
  
  return { buffer: renderedBuffer, dataUrl };
}

/**
 * Apply Pseudo-Stereo effect
 */
export async function applyPseudoStereo(
  buffer: AudioBuffer,
  width: number
): Promise<ProcessedResult> {
  const offlineContext = new OfflineAudioContext(2, buffer.length, buffer.sampleRate);
  const source = offlineContext.createBufferSource();
  source.buffer = buffer;

  const leftGain = offlineContext.createGain();
  const rightGain = offlineContext.createGain();
  const delay = offlineContext.createDelay(0.1);
  
  // Haas effect: 10-35ms
  delay.delayTime.value = 0.01 + (width / 100) * 0.025;

  source.connect(leftGain);
  leftGain.connect(offlineContext.destination);

  source.connect(delay);
  delay.connect(rightGain);
  rightGain.connect(offlineContext.destination);

  source.start(0);
  const renderedBuffer = await offlineContext.startRendering();
  const dataUrl = await bufferToDataUrl(renderedBuffer);
  
  return { buffer: renderedBuffer, dataUrl };
}

/**
 * Sharpen transients
 */
export async function applyTransientSharpening(
  buffer: AudioBuffer,
  amount: number
): Promise<ProcessedResult> {
  const offlineContext = new OfflineAudioContext(
    buffer.numberOfChannels,
    buffer.length,
    buffer.sampleRate
  );

  const source = offlineContext.createBufferSource();
  source.buffer = buffer;

  const hp = offlineContext.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 3000;
  hp.Q.value = 1.5;

  const transientGain = offlineContext.createGain();
  transientGain.gain.value = (amount / 100) * 1.5;

  const dryGain = offlineContext.createGain();
  dryGain.gain.value = 1.0;

  source.connect(dryGain);
  dryGain.connect(offlineContext.destination);

  source.connect(hp);
  hp.connect(transientGain);
  transientGain.connect(offlineContext.destination);

  source.start(0);
  const renderedBuffer = await offlineContext.startRendering();
  const dataUrl = await bufferToDataUrl(renderedBuffer);
  
  return { buffer: renderedBuffer, dataUrl };
}

/**
 * Apply Normalization
 */
export async function applyNormalization(
  buffer: AudioBuffer
): Promise<ProcessedResult> {
  const numChannels = buffer.numberOfChannels;
  const length = buffer.length;
  
  let maxPeak = 0;
  for (let c = 0; c < numChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > maxPeak) maxPeak = abs;
    }
  }

  if (maxPeak === 0) return { buffer, dataUrl: await bufferToDataUrl(buffer) };
  const gain = 0.99 / maxPeak; // Leave a tiny bit of headroom

  const offlineContext = new OfflineAudioContext(numChannels, length, buffer.sampleRate);
  const source = offlineContext.createBufferSource();
  source.buffer = buffer;
  const gainNode = offlineContext.createGain();
  gainNode.gain.value = gain;

  source.connect(gainNode);
  gainNode.connect(offlineContext.destination);

  source.start(0);
  const renderedBuffer = await offlineContext.startRendering();
  const dataUrl = await bufferToDataUrl(renderedBuffer);
  
  return { buffer: renderedBuffer, dataUrl };
}

/**
 * Trim silence from start and end
 */
export async function applyTrimSilence(
  buffer: AudioBuffer,
  threshold: number = -60
): Promise<ProcessedResult> {
  const numChannels = buffer.numberOfChannels;
  const length = buffer.length;
  const threshLinear = Math.pow(10, threshold / 20);
  
  let start = length;
  let end = 0;

  // Check all channels for the earliest start and latest end
  for (let c = 0; c < numChannels; c++) {
    const data = buffer.getChannelData(c);
    
    let cStart = 0;
    while (cStart < length && Math.abs(data[cStart]) < threshLinear) cStart++;
    if (cStart < start) start = cStart;

    let cEnd = length - 1;
    while (cEnd > 0 && Math.abs(data[cEnd]) < threshLinear) cEnd--;
    if (cEnd > end) end = cEnd;
  }
  
  const newLength = end - start + 1;
  if (newLength <= 0) return { buffer, dataUrl: await bufferToDataUrl(buffer) };

  const offlineContext = new OfflineAudioContext(numChannels, newLength, buffer.sampleRate);
  const source = offlineContext.createBufferSource();
  source.buffer = buffer;

  source.connect(offlineContext.destination);
  source.start(0, start / buffer.sampleRate);
  
  const renderedBuffer = await offlineContext.startRendering();
  const dataUrl = await bufferToDataUrl(renderedBuffer);
  
  return { buffer: renderedBuffer, dataUrl };
}

/**
 * Reverse the AudioBuffer
 */
export async function applyReverse(
  buffer: AudioBuffer
): Promise<ProcessedResult> {
  const numChannels = buffer.numberOfChannels;
  const length = buffer.length;
  
  const newBuffer = new AudioBuffer({
    length,
    numberOfChannels: numChannels,
    sampleRate: buffer.sampleRate
  });

  for (let c = 0; c < numChannels; c++) {
    const input = buffer.getChannelData(c);
    const output = newBuffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      output[i] = input[length - 1 - i];
    }
  }
  
  return { buffer: newBuffer, dataUrl: await bufferToDataUrl(newBuffer) };
}

/**
 * Convert AudioBuffer to Data URL (WAV format)
 */
export async function bufferToDataUrl(buffer: AudioBuffer): Promise<string> {
  const wavBytes = bufferToWav(buffer);
  const blob = new Blob([wavBytes], { type: 'audio/wav' });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Simple WAV encoder for AudioBuffer
 */
function bufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  
  const bufferLength = buffer.length;
  const dataSize = bufferLength * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;
  
  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);
  
  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  
  const offset = 44;
  const channelData = [];
  for (let i = 0; i < numChannels; i++) {
    channelData.push(buffer.getChannelData(i));
  }
  
  let index = 0;
  for (let i = 0; i < bufferLength; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      let sample = channelData[channel][i];
      sample = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset + index, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      index += 2;
    }
  }
  
  return arrayBuffer;
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Convert to 8-bit using AmigaPal algorithm for perfect Amiga samples
 *
 * This algorithm from AmigaPal by echolevel:
 * 1. Normalizes to peak (maximizes SNR)
 * 2. Converts to 8-bit signed (-128 to 127)
 * 3. Applies proper quantization for authentic Amiga sound
 *
 * Perfect for ProTracker MODs and retro game audio!
 * Reference: https://github.com/echolevel/AmigaPal
 */
export async function applyAmigaPal8Bit(
  buffer: AudioBuffer
): Promise<ProcessedResult> {
  const numChannels = buffer.numberOfChannels;
  const length = buffer.length;
  const sampleRate = buffer.sampleRate;

  // Step 1: Find peak for normalization (just like AmigaPal)
  let maxPeak = 0;
  for (let c = 0; c < numChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > maxPeak) maxPeak = abs;
    }
  }

  // Create output buffer
  const processedBuffer = new AudioBuffer({
    length,
    numberOfChannels: numChannels,
    sampleRate
  });

  // Step 2: Normalize and convert to 8-bit for each channel
  for (let c = 0; c < numChannels; c++) {
    const inputData = buffer.getChannelData(c);
    const outputData = processedBuffer.getChannelData(c);

    for (let i = 0; i < length; i++) {
      // Normalize to peak (max SNR, just like AmigaPal line 827)
      let normalized = maxPeak > 0 ? inputData[i] / maxPeak : inputData[i];

      // Clamp to -1 to 1 (AmigaPal lines 828-832)
      normalized = Math.max(-1, Math.min(1, normalized));

      // Convert to 8-bit signed: multiply by 128 and round (AmigaPal line 839)
      let int8 = Math.round(normalized * 128);

      // Clamp to 8-bit range (AmigaPal lines 840-845)
      int8 = Math.max(-128, Math.min(127, int8));

      // Convert back to float32 with 8-bit quantization
      // This simulates the bit-depth reduction (AmigaPal lines 886-887)
      const step = Math.pow(0.5, 8); // 1/256
      outputData[i] = step * Math.floor((int8 / 128) / step);
    }
  }

  const dataUrl = await bufferToDataUrl(processedBuffer);
  return { buffer: processedBuffer, dataUrl };
}
