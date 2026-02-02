/**
 * WaveformProcessor - Destructive audio buffer operations
 * 
 * Provides utility functions for modifying AudioBuffers:
 * - Reverse
 * - Normalize
 * - Invert Loop (Destructive EFx)
 * - Gain / Amplify
 */

export class WaveformProcessor {
  /**
   * Reverse an AudioBuffer
   */
  public static reverse(buffer: AudioBuffer): AudioBuffer {
    const numChannels = buffer.numberOfChannels;
    const length = buffer.length;
    const sampleRate = buffer.sampleRate;
    
    const newBuffer = new AudioBuffer({
      length,
      numberOfChannels: numChannels,
      sampleRate
    });

    for (let channel = 0; channel < numChannels; channel++) {
      const inputData = buffer.getChannelData(channel);
      const outputData = newBuffer.getChannelData(channel);
      
      for (let i = 0; i < length; i++) {
        outputData[i] = inputData[length - 1 - i];
      }
    }

    return newBuffer;
  }

  /**
   * Normalize an AudioBuffer
   */
  public static normalize(buffer: AudioBuffer): AudioBuffer {
    const numChannels = buffer.numberOfChannels;
    const length = buffer.length;
    const sampleRate = buffer.sampleRate;
    
    // Find peak amplitude
    let maxVal = 0;
    for (let channel = 0; channel < numChannels; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        const abs = Math.abs(data[i]);
        if (abs > maxVal) maxVal = abs;
      }
    }

    if (maxVal === 0 || maxVal === 1.0) return buffer;

    const scale = 1.0 / maxVal;
    const newBuffer = new AudioBuffer({
      length,
      numberOfChannels: numChannels,
      sampleRate
    });

    for (let channel = 0; channel < numChannels; channel++) {
      const inputData = buffer.getChannelData(channel);
      const outputData = newBuffer.getChannelData(channel);
      
      for (let i = 0; i < length; i++) {
        outputData[i] = inputData[i] * scale;
      }
    }

    return newBuffer;
  }

  /**
   * Destructive Invert Loop (Hardware-accurate EFx implementation)
   * Inverts the phase of the data in the loop area on every application.
   */
  public static invertLoop(buffer: AudioBuffer, start: number, end: number): AudioBuffer {
    const numChannels = buffer.numberOfChannels;
    const length = buffer.length;
    const sampleRate = buffer.sampleRate;
    
    const newBuffer = new AudioBuffer({
      length,
      numberOfChannels: numChannels,
      sampleRate
    });

    for (let channel = 0; channel < numChannels; channel++) {
      const inputData = buffer.getChannelData(channel);
      const outputData = newBuffer.getChannelData(channel);
      
      // Copy prefix
      for (let i = 0; i < start; i++) outputData[i] = inputData[i];
      
      // Invert loop section
      for (let i = start; i < end && i < length; i++) {
        outputData[i] = -inputData[i];
      }
      
      // Copy suffix
      for (let i = end; i < length; i++) outputData[i] = inputData[i];
    }

    return newBuffer;
  }

  /**
   * Apply gain to an AudioBuffer
   */
  public static applyGain(buffer: AudioBuffer, gain: number): AudioBuffer {
    const numChannels = buffer.numberOfChannels;
    const length = buffer.length;
    const sampleRate = buffer.sampleRate;
    
    const newBuffer = new AudioBuffer({
      length,
      numberOfChannels: numChannels,
      sampleRate
    });

    for (let channel = 0; channel < numChannels; channel++) {
      const inputData = buffer.getChannelData(channel);
      const outputData = newBuffer.getChannelData(channel);
      
      for (let i = 0; i < length; i++) {
        outputData[i] = inputData[i] * gain;
      }
    }

        return newBuffer;

      }

    

      /**

       * Convert AudioBuffer to WAV ArrayBuffer

       */

      public static async bufferToWav(buffer: AudioBuffer): Promise<ArrayBuffer> {

        const numChannels = buffer.numberOfChannels;

        const sampleRate = buffer.sampleRate;

        const format = 1; // PCM

        const bitDepth = 16;

        

        const numFrames = buffer.length;

        const bytesPerSample = bitDepth / 8;

        const blockAlign = numChannels * bytesPerSample;

        const byteRate = sampleRate * blockAlign;

        const dataSize = numFrames * blockAlign;

        const fileSize = 44 + dataSize;

        

        const arrayBuffer = new ArrayBuffer(fileSize);

        const view = new DataView(arrayBuffer);

        

        // RIFF identifier

        this.writeString(view, 0, 'RIFF');

        // file length

        view.setUint32(4, fileSize - 8, true);

        // RIFF type

        this.writeString(view, 8, 'WAVE');

        // format chunk identifier

        this.writeString(view, 12, 'fmt ');

        // format chunk length

        view.setUint32(16, 16, true);

        // sample format (raw)

        view.setUint16(20, format, true);

        // channel count

        view.setUint16(22, numChannels, true);

        // sample rate

        view.setUint32(24, sampleRate, true);

        // byte rate (sample rate * block align)

        view.setUint32(28, byteRate, true);

        // block align (channel count * bytes per sample)

        view.setUint16(32, blockAlign, true);

        // bits per sample

        view.setUint16(34, bitDepth, true);

        // data chunk identifier

        this.writeString(view, 36, 'data');

        // data chunk length

        view.setUint32(40, dataSize, true);

        

        // Write interleaved samples

        let offset = 44;

        for (let i = 0; i < numFrames; i++) {

          for (let channel = 0; channel < numChannels; channel++) {

            let sample = buffer.getChannelData(channel)[i];

            // Clip sample

            sample = Math.max(-1, Math.min(1, sample));

            // Scale to 16-bit signed int

            const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;

            view.setInt16(offset, intSample, true);

            offset += 2;

          }

        }

        

        return arrayBuffer;

      }

    

      private static writeString(view: DataView, offset: number, string: string): void {

        for (let i = 0; i < string.length; i++) {

          view.setUint8(offset + i, string.charCodeAt(i));

        }

      }

    }

    