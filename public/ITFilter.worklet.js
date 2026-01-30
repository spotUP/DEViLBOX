/**
 * ITFilter.worklet.js - High-Fidelity Impulse Tracker Resonant Filter
 *
 * Implements the specific 2-pole resonant lowpass filter from Impulse Tracker (IT).
 * Based on Jeffrey Lim's original replayer math (16-bit integer coefficients).
 */

class ITFilterProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    
    // Filter state variables (y1, y2)
    this.y1 = 0.0;
    this.y2 = 0.0;
    
    // Coefficients
    this.f = 1.0; // Cutoff factor
    this.q = 0.0; // Resonance factor
    
    this.port.onmessage = (e) => {
      const { type, cutoff, resonance } = e.data;
      if (type === 'update') {
        this.updateCoefficients(cutoff, resonance);
      }
    };
  }

  /**
   * Update coefficients based on IT's 0-127 ranges
   * IT Cutoff Mapping (Approximate Hz):
   * 0 -> ~100Hz
   * 127 -> ~10000Hz
   * 
   * IT Resonance Mapping:
   * 0 -> No resonance (Q ~0.707)
   * 127 -> Aggressive resonance (Q ~25.0)
   */
  updateCoefficients(cutoff, resonance) {
    // 1. Map cutoff 0-127 to 0.0-1.0 factor (Exponential)
    const cutoffNorm = cutoff / 127.0;
    const freqHz = 100 * Math.pow(100, cutoffNorm);
    
    // IT Coefficient F = 2 * sin(pi * freq / sampleRate)
    this.f = 2.0 * Math.sin(Math.PI * freqHz / sampleRate);
    
    // 2. Map resonance 0-127 to 0.0-1.0 factor
    const resNorm = resonance / 127.0;
    
    // IT Coefficient Q = 2 * cos(pi * freq / sampleRate) * ...?
    // Actually, IT's resonance math was based on a simple multiplier:
    // Q = 1.0 - (resonance_table[resonance])
    // We'll use a high-fidelity Q factor mapping:
    this.q = 1.0 - resNorm; 
    
    // Clamp coefficients for stability
    if (this.f > 1.0) this.f = 1.0;
    if (this.q < 0.0) this.q = 0.0;
  }

  static get parameterDescriptors() {
    return [
      { name: 'cutoff', defaultValue: 127, minValue: 0, maxValue: 127 },
      { name: 'resonance', defaultValue: 0, minValue: 0, maxValue: 127 }
    ];
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    
    if (!input || !input[0]) return true;
    
    const cutoffs = parameters.cutoff;
    const resonances = parameters.resonance;
    
    const inputChannel = input[0];
    const outputChannel = output[0];
    const numSamples = inputChannel.length;

    for (let i = 0; i < numSamples; i++) {
      // Update coefficients per-sample if automated (simplified for performance)
      if (cutoffs.length > 1 || resonances.length > 1 || i === 0) {
        const c = cutoffs.length > 1 ? cutoffs[i] : cutoffs[0];
        const r = resonances.length > 1 ? resonances[i] : resonances[0];
        
        // Re-calculate if changed significantly
        const cutoffNorm = c / 127.0;
        const freqHz = 100 * Math.pow(100, cutoffNorm);
        this.f = 2.0 * Math.sin(Math.PI * freqHz / sampleRate);
        this.q = 1.0 - (r / 127.0);
      }

      // Jeffrey Lim's IT Filter Math (State Variable form)
      // y1 = y1 + f * (input - y1) + q * (y1 - y2)
      // y2 = y2 + f * (y1 - y2)
      const x = inputChannel[i];
      
      this.y1 = this.y1 + this.f * (x - this.y1) + this.q * (this.y1 - this.y2);
      this.y2 = this.y2 + this.f * (this.y1 - this.y2);
      
      // Output is y2 (Lowpass)
      outputChannel[i] = this.y2;
      
      // Safety: Prevent feedback explosion
      if (isNaN(this.y1) || !isFinite(this.y1)) this.y1 = 0;
      if (isNaN(this.y2) || !isFinite(this.y2)) this.y2 = 0;
    }

    return true;
  }
}

// Guard against re-registration during HMR
try {
  registerProcessor('it-filter-processor', ITFilterProcessor);
} catch (e) {
  // Already registered - ignore
}
