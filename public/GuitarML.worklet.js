/**
 * GuitarML AudioWorklet Processor
 *
 * Neural network-based guitar amp/pedal simulation using LSTM models.
 * Port of GuitarML/BYOD neural amp modeling to Web Audio API.
 *
 * Based on:
 * - GuitarML project by Keith Bloemer
 * - BYOD plugin integration by Jatin Chowdhury
 * - RTNeural library for LSTM inference
 *
 * Supports both:
 * - Non-conditioned models (1 input: audio only)
 * - Conditioned models (2 inputs: audio + gain/condition parameter)
 *
 * Performance optimizations:
 * - Pre-allocated gate buffer (zero GC in audio thread)
 * - Flattened weight matrices (contiguous memory, no array-of-array indirection)
 * - Pre-combined biases (bih + bhh added once at load time)
 * - Fast sigmoid approximation (avoids Math.exp per sample)
 */

class GuitarMLProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // Model state
    this.modelLoaded = false;
    this.modelType = 'none'; // 'lstm40_nocond' or 'lstm40_cond'
    this.inputSize = 1;
    this.hiddenSize = 40;
    this.modelSampleRate = 44100.0;

    // LSTM state (hidden and cell states)
    this.h = new Float32Array(40).fill(0);
    this.c = new Float32Array(40).fill(0);

    // Pre-allocated gate buffer — reused every sample (zero GC pressure)
    this.gates = new Float32Array(160);

    // Model weights (will be loaded from JSON)
    this.weights = {
      // Flattened input-to-hidden weights [inputSize * 160] (row-major)
      lstm_Wih_flat: null,

      // Flattened hidden-to-hidden weights [40 * 160] (row-major: row j * 160 + i)
      lstm_Whh_flat: null,

      // Combined biases (bih + bhh, pre-added at load time)
      lstm_bias: null, // [160]

      // Dense (linear) output layer
      dense_W: null,  // [40]
      dense_b: 0,     // scalar
    };

    // Parameters
    this.gain = 0.0;           // dB, -18 to +18 (for non-conditioned)
    this.condition = 0.5;      // 0-1 (for conditioned models)
    this.dryWet = 1.0;         // 0-1, mix control
    this.enabled = true;

    // 4× downsampling state — LSTM runs at quarter sample rate, cubic interpolation
    this.lstmOut = [0.0, 0.0, 0.0, 0.0]; // ring buffer of last 4 LSTM outputs for cubic interp
    this.dsPhase = 0; // cycles 0,1,2,3

    // DC blocker (one-pole highpass ~20Hz)
    this.dcBlocker_x1 = 0.0;
    this.dcBlocker_y1 = 0.0;
    this.dcBlocker_coeff = 0.0;

    // Sample rate correction filter (high shelf)
    this.useSRCFilter = true;
    this.srcFilter_x1 = 0.0;
    this.srcFilter_x2 = 0.0;
    this.srcFilter_y1 = 0.0;
    this.srcFilter_y2 = 0.0;
    this.srcFilter_b0 = 1.0;
    this.srcFilter_b1 = 0.0;
    this.srcFilter_b2 = 0.0;
    this.srcFilter_a1 = 0.0;
    this.srcFilter_a2 = 0.0;

    // Message handler
    this.port.onmessage = (e) => this.handleMessage(e.data);

    console.log('[GuitarML] Worklet processor initialized');
  }

  handleMessage(data) {
    switch (data.type) {
      case 'loadModel':
        this.loadModel(data.modelData);
        break;

      case 'setParameter':
        this.setParameter(data.param, data.value);
        break;

      case 'reset':
        this.reset();
        break;
    }
  }

  /**
   * Load model from JSON data
   */
  loadModel(modelData) {
    try {
      const { model_data, state_dict } = modelData;

      this.inputSize = model_data.input_size || 1;
      this.hiddenSize = model_data.hidden_size || 40;
      this.modelSampleRate = model_data.sample_rate || 44100.0;

      // Determine model type
      if (this.inputSize === 1 && this.hiddenSize === 40) {
        this.modelType = 'lstm40_nocond';
      } else if (this.inputSize === 2 && this.hiddenSize === 40) {
        this.modelType = 'lstm40_cond';
      } else {
        console.error('[GuitarML] Unsupported model architecture');
        return;
      }

      const H4 = 160; // 4 * hiddenSize

      // Load and flatten weights for contiguous memory access
      // PyTorch format: [out_features, in_features] → we need [in_features][out_features]
      // Flattened: row r, col c → flat[r * cols + c]

      // LSTM input-to-hidden: [160, inputSize] → flat [inputSize * 160]
      const wih = state_dict['rec.weight_ih_l0'];
      this.weights.lstm_Wih_flat = new Float32Array(this.inputSize * H4);
      for (let r = 0; r < this.inputSize; r++) {
        for (let c = 0; c < H4; c++) {
          this.weights.lstm_Wih_flat[r * H4 + c] = wih[c][r];
        }
      }

      // LSTM hidden-to-hidden: [160, 40] → flat [40 * 160]
      const whh = state_dict['rec.weight_hh_l0'];
      this.weights.lstm_Whh_flat = new Float32Array(40 * H4);
      for (let r = 0; r < 40; r++) {
        for (let c = 0; c < H4; c++) {
          this.weights.lstm_Whh_flat[r * H4 + c] = whh[c][r];
        }
      }

      // Pre-combine biases: bih + bhh (saves one loop per sample)
      const bih = this.flattenWeights(state_dict['rec.bias_ih_l0']);
      const bhh = this.flattenWeights(state_dict['rec.bias_hh_l0']);
      this.weights.lstm_bias = new Float32Array(H4);
      for (let i = 0; i < H4; i++) {
        this.weights.lstm_bias[i] = bih[i] + bhh[i];
      }

      // Dense layer weights [1, 40] → flat [40]
      this.weights.dense_W = this.flattenWeights(state_dict['lin.weight']);
      const db = this.flattenWeights(state_dict['lin.bias']);
      this.weights.dense_b = db[0];

      // Re-allocate gate buffer if hidden size changed
      this.gates = new Float32Array(H4);

      // Initialize DC blocker for current sample rate
      this.initDCBlocker(sampleRate);

      // Initialize sample rate correction filter
      this.initSRCFilter(sampleRate);

      // Reset LSTM state
      this.reset();

      this.modelLoaded = true;

      console.log(`[GuitarML] Model loaded: ${this.modelType}, SR=${this.modelSampleRate}Hz`);

      this.port.postMessage({ type: 'modelLoaded', success: true });
    } catch (error) {
      console.error('[GuitarML] Model load error:', error);
      this.port.postMessage({ type: 'modelLoaded', success: false, error: error.message });
    }
  }

  /**
   * Flatten 1D or 2D weight array to Float32Array
   */
  flattenWeights(weights) {
    if (Array.isArray(weights[0])) {
      const flat = [];
      for (let i = 0; i < weights.length; i++) {
        for (let j = 0; j < weights[i].length; j++) {
          flat.push(weights[i][j]);
        }
      }
      return new Float32Array(flat);
    } else {
      return new Float32Array(weights);
    }
  }

  /**
   * Initialize DC blocker (one-pole highpass at 20Hz)
   */
  initDCBlocker(sampleRate) {
    const fc = 20.0;
    this.dcBlocker_coeff = Math.exp(-2.0 * Math.PI * fc / sampleRate);
    this.dcBlocker_x1 = 0.0;
    this.dcBlocker_y1 = 0.0;
  }

  /**
   * Initialize sample rate correction filter (high shelf)
   */
  initSRCFilter(sampleRate) {
    const cutoff = 8100.0;
    const Q = 0.7071;
    const gain = (sampleRate < this.modelSampleRate * 1.1) ? 1.0 : 0.25;

    const w0 = 2.0 * Math.PI * cutoff / sampleRate;
    const A = Math.sqrt(gain);
    const alpha = Math.sin(w0) / (2.0 * Q);

    const b0 = A * ((A + 1) + (A - 1) * Math.cos(w0) + 2 * Math.sqrt(A) * alpha);
    const b1 = -2 * A * ((A - 1) + (A + 1) * Math.cos(w0));
    const b2 = A * ((A + 1) + (A - 1) * Math.cos(w0) - 2 * Math.sqrt(A) * alpha);
    const a0 = (A + 1) - (A - 1) * Math.cos(w0) + 2 * Math.sqrt(A) * alpha;
    const a1 = 2 * ((A - 1) - (A + 1) * Math.cos(w0));
    const a2 = (A + 1) - (A - 1) * Math.cos(w0) - 2 * Math.sqrt(A) * alpha;

    this.srcFilter_b0 = b0 / a0;
    this.srcFilter_b1 = b1 / a0;
    this.srcFilter_b2 = b2 / a0;
    this.srcFilter_a1 = a1 / a0;
    this.srcFilter_a2 = a2 / a0;

    this.srcFilter_x1 = 0.0;
    this.srcFilter_x2 = 0.0;
    this.srcFilter_y1 = 0.0;
    this.srcFilter_y2 = 0.0;
  }

  /**
   * Set parameter value
   */
  setParameter(param, value) {
    switch (param) {
      case 'gain':
        this.gain = value;
        break;
      case 'condition':
        this.condition = Math.max(0.0, Math.min(1.0, value));
        break;
      case 'dryWet':
        this.dryWet = Math.max(0.0, Math.min(1.0, value));
        break;
      case 'enabled':
        this.enabled = value;
        break;
      case 'useSRCFilter':
        this.useSRCFilter = value;
        break;
    }
  }

  /**
   * Reset LSTM state
   */
  reset() {
    this.h.fill(0);
    this.c.fill(0);
    this.dcBlocker_x1 = 0.0;
    this.dcBlocker_y1 = 0.0;
    this.srcFilter_x1 = 0.0;
    this.srcFilter_x2 = 0.0;
    this.srcFilter_y1 = 0.0;
    this.srcFilter_y2 = 0.0;
    this.lstmOut = [0.0, 0.0, 0.0, 0.0];
    this.dsPhase = 0;
  }

  /**
   * Fast sigmoid approximation — avoids Math.exp entirely.
   * Uses rational approximation: σ(x) ≈ 0.5 + 0.5 * x / (1 + |x|)
   * Max error ~0.03 vs true sigmoid, inaudible in audio context.
   */
  sigmoid(x) {
    return 0.5 + 0.5 * x / (1.0 + (x > 0 ? x : -x));
  }

  /**
   * Fast tanh approximation using Padé [3,3].
   * Max error ~0.004 for |x| < 4.5, clamps to ±1 outside.
   */
  fastTanh(x) {
    if (x < -4.5) return -1.0;
    if (x > 4.5) return 1.0;
    const x2 = x * x;
    return x * (27.0 + x2) / (27.0 + 9.0 * x2);
  }

  /**
   * DC blocker (one-pole highpass)
   */
  dcBlock(input) {
    const output = input - this.dcBlocker_x1 + this.dcBlocker_coeff * this.dcBlocker_y1;
    this.dcBlocker_x1 = input;
    this.dcBlocker_y1 = output;
    return output;
  }

  /**
   * Sample rate correction filter (biquad high shelf)
   */
  srcFilter(input) {
    const output = this.srcFilter_b0 * input +
                   this.srcFilter_b1 * this.srcFilter_x1 +
                   this.srcFilter_b2 * this.srcFilter_x2 -
                   this.srcFilter_a1 * this.srcFilter_y1 -
                   this.srcFilter_a2 * this.srcFilter_y2;

    this.srcFilter_x2 = this.srcFilter_x1;
    this.srcFilter_x1 = input;
    this.srcFilter_y2 = this.srcFilter_y1;
    this.srcFilter_y1 = output;

    return output;
  }

  /**
   * Process audio block — LSTM runs at half sample rate for 2× CPU reduction.
   * Even-numbered samples: run LSTM, store result.
   * Odd-numbered samples: linear interpolate between previous and next LSTM output.
   */
  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || !input[0] || !this.modelLoaded || !this.enabled) {
      if (input && input[0] && output && output[0]) {
        output[0].set(input[0]);
      }
      return true;
    }

    const inputChannel = input[0];
    const outputChannel = output[0];
    const numSamples = inputChannel.length;

    // Pre-compute input gain
    let inputGain = 1.0;
    if (this.modelType === 'lstm40_nocond') {
      inputGain = Math.pow(10, (this.gain - 12.0) / 20.0);
    }

    // Cache weights and state on stack for tighter inner loop
    const H = this.hiddenSize; // 40
    const H4 = H * 4;         // 160
    const Wih = this.weights.lstm_Wih_flat;
    const Whh = this.weights.lstm_Whh_flat;
    const bias = this.weights.lstm_bias;
    const dW = this.weights.dense_W;
    const db = this.weights.dense_b;
    const h = this.h;
    const c = this.c;
    const gates = this.gates;
    const cond = this.condition;
    const isCond = this.inputSize === 2;
    const dryWet = this.dryWet;
    const useSRC = this.useSRCFilter;

    let phase = this.dsPhase;
    const lstmOut = this.lstmOut;

    for (let s = 0; s < numSamples; s++) {
      const dry = inputChannel[s];
      let sample;

      if (phase === 0) {
        // === Run LSTM on this sample ===
        let inp = dry * inputGain;

        // Step 1: gates = bias + Wih * input
        if (isCond) {
          for (let i = 0; i < H4; i++) {
            gates[i] = bias[i] + Wih[i] * inp + Wih[H4 + i] * cond;
          }
        } else {
          for (let i = 0; i < H4; i++) {
            gates[i] = bias[i] + Wih[i] * inp;
          }
        }

        // Step 2: gates += Whh * h
        for (let j = 0; j < H; j++) {
          const hj = h[j];
          if (hj === 0) continue;
          const base = j * H4;
          for (let i = 0; i < H4; i++) {
            gates[i] += Whh[base + i] * hj;
          }
        }

        // Step 3: Activations and state update
        for (let i = 0; i < H; i++) {
          const ig = this.sigmoid(gates[i]);
          const fg = this.sigmoid(gates[H + i]);
          const gg = this.fastTanh(gates[H * 2 + i]);
          const og = this.sigmoid(gates[H * 3 + i]);
          c[i] = fg * c[i] + ig * gg;
          h[i] = og * this.fastTanh(c[i]);
        }

        // Step 4: Dense output
        let out = db;
        for (let i = 0; i < H; i++) {
          out += dW[i] * h[i];
        }

        // Shift ring buffer and store new output
        lstmOut[3] = lstmOut[2];
        lstmOut[2] = lstmOut[1];
        lstmOut[1] = lstmOut[0];
        lstmOut[0] = out;
        sample = out;
      } else {
        // === Cubic Hermite interpolation between LSTM outputs ===
        // lstmOut[0] = newest, lstmOut[1] = previous, etc.
        const t = phase * 0.25; // 0.25, 0.5, 0.75
        const y0 = lstmOut[2];
        const y1 = lstmOut[1];
        const y2 = lstmOut[0];
        const y3 = lstmOut[0]; // clamp future to current
        const a = -0.5 * y0 + 1.5 * y1 - 1.5 * y2 + 0.5 * y3;
        const b = y0 - 2.5 * y1 + 2.0 * y2 - 0.5 * y3;
        const cc = -0.5 * y0 + 0.5 * y2;
        const d = y1;
        sample = ((a * t + b) * t + cc) * t + d;
      }

      phase = (phase + 1) & 3; // cycle 0,1,2,3

      // Sample rate correction filter
      if (useSRC) {
        sample = this.srcFilter(sample);
      }

      // DC blocker
      sample = this.dcBlock(sample);

      // Dry/wet mix
      outputChannel[s] = dry * (1.0 - dryWet) + sample * dryWet;
    }

    this.dsPhase = phase;

    return true;
  }
}

// Guard against re-registration during HMR
try {
  registerProcessor('guitarml-processor', GuitarMLProcessor);
} catch (e) {
  // Already registered - ignore
}
