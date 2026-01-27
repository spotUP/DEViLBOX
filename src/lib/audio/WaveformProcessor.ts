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
}