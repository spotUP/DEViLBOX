/**
 * BLEP Audio Worklet Processor
 *
 * Applies Band-Limited Step synthesis to reduce aliasing.
 * Uses the PT2-clone BLEP WASM module for processing.
 */

// Import BLEP WASM module (will be loaded before worklet registration)
// Note: The WASM module will be passed via processorOptions

class BlepProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    // BLEP state per channel (stereo = 2 channels)
    this.enabled = true;
    this.lastValues = [0, 0]; // Track last value per channel
    this.threshold = 0.0001; // Minimum delta to trigger BLEP

    // BLEP buffers (simple ring buffer implementation)
    this.buffers = [
      { data: new Float32Array(32), index: 0, samplesLeft: 0 },
      { data: new Float32Array(32), index: 0, samplesLeft: 0 }
    ];

    // Listen for parameter changes
    this.port.onmessage = (event) => {
      if (event.data.type === 'setEnabled') {
        this.enabled = event.data.value;
      } else if (event.data.type === 'reset') {
        this.reset();
      }
    };
  }

  /**
   * Reset BLEP state
   */
  reset() {
    this.lastValues = [0, 0];
    this.buffers.forEach(buf => {
      buf.data.fill(0);
      buf.index = 0;
      buf.samplesLeft = 0;
    });
  }

  /**
   * Add BLEP correction for a discontinuity
   * (Simplified version - full version would use MinBLEP table)
   */
  blepAdd(buffer, offset, amplitude) {
    // Simple implementation: add a small ramp to smooth the discontinuity
    // This is a simplified version - the full WASM version is more accurate
    const numSamples = 16; // BLEP_NS
    const scale = amplitude / numSamples;

    let idx = buffer.index;
    for (let i = 0; i < numSamples; i++) {
      buffer.data[idx] += scale * (numSamples - i) / numSamples;
      idx = (idx + 1) % buffer.data.length;
    }

    buffer.samplesLeft = numSamples;
  }

  /**
   * Apply BLEP correction to input sample
   */
  blepRun(buffer, input) {
    const output = input + buffer.data[buffer.index];
    buffer.data[buffer.index] = 0.0;

    buffer.index = (buffer.index + 1) % buffer.data.length;

    if (buffer.samplesLeft > 0) {
      buffer.samplesLeft--;
    }

    return output;
  }

  /**
   * Process audio
   */
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || !input.length) {
      return true;
    }

    // Process each channel
    for (let channel = 0; channel < input.length; channel++) {
      const inputChannel = input[channel];
      const outputChannel = output[channel];
      const buffer = this.buffers[channel];

      if (!inputChannel || !outputChannel) continue;

      for (let i = 0; i < inputChannel.length; i++) {
        let sample = inputChannel[i];

        if (this.enabled) {
          // Detect discontinuity
          const delta = this.lastValues[channel] - sample;
          if (Math.abs(delta) > this.threshold) {
            // Add BLEP correction
            this.blepAdd(buffer, 0.0, delta);
          }

          // Apply BLEP
          sample = this.blepRun(buffer, sample);

          this.lastValues[channel] = sample;
        }

        outputChannel[i] = sample;
      }
    }

    return true;
  }
}

registerProcessor('blep-processor', BlepProcessor);
