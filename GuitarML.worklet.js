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
    // For LSTM with 40 units: h = [40], c = [40]
    this.h = new Float32Array(40).fill(0);
    this.c = new Float32Array(40).fill(0);

    // Model weights (will be loaded from JSON)
    this.weights = {
      // Input-to-hidden weights [160 x inputSize]
      // 160 = 4 gates * 40 units (LSTM gates: input, forget, cell, output)
      lstm_Wih: null,

      // Hidden-to-hidden weights [160 x 40]
      lstm_Whh: null,

      // LSTM biases
      lstm_bih: null, // [160]
      lstm_bhh: null, // [160]

      // Dense (linear) output layer
      dense_W: null,  // [1 x 40]
      dense_b: null,  // [1]
    };

    // Parameters
    this.gain = 0.0;           // dB, -18 to +18 (for non-conditioned)
    this.condition = 0.5;      // 0-1 (for conditioned models)
    this.dryWet = 1.0;         // 0-1, mix control
    this.enabled = true;

    // DC blocker (one-pole highpass ~20Hz)
    this.dcBlocker_x1 = 0.0;
    this.dcBlocker_y1 = 0.0;
    this.dcBlocker_coeff = 0.0;

    // Sample rate correction filter (high shelf)
    // Used when process sample rate != model sample rate
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

      // Load weights from state_dict
      // PyTorch format: weights are [out_features, in_features]
      // We need to transpose them for our processing

      // LSTM weights (input-to-hidden)
      // Shape: [160, inputSize] in PyTorch, we need [inputSize][160]
      const wih = state_dict['rec.weight_ih_l0'];
      this.weights.lstm_Wih = this.transposeWeights(wih, this.inputSize, 160);

      // LSTM weights (hidden-to-hidden)
      // Shape: [160, 40] in PyTorch, we need [40][160]
      const whh = state_dict['rec.weight_hh_l0'];
      this.weights.lstm_Whh = this.transposeWeights(whh, 40, 160);

      // LSTM biases
      this.weights.lstm_bih = this.flattenWeights(state_dict['rec.bias_ih_l0']);
      this.weights.lstm_bhh = this.flattenWeights(state_dict['rec.bias_hh_l0']);

      // Dense layer weights
      // Shape: [1, 40] in PyTorch, we need [40]
      const denseW = state_dict['lin.weight'];
      this.weights.dense_W = this.flattenWeights(denseW);

      // Dense bias
      this.weights.dense_b = this.flattenWeights(state_dict['lin.bias']);

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
   * Transpose weight matrix from PyTorch format to our format
   */
  transposeWeights(weights, rows, cols) {
    // PyTorch stores as [cols][rows], we want [rows][cols]
    const transposed = [];
    for (let r = 0; r < rows; r++) {
      transposed[r] = new Float32Array(cols);
      for (let c = 0; c < cols; c++) {
        transposed[r][c] = weights[c][r];
      }
    }
    return transposed;
  }

  /**
   * Flatten 1D or 2D weight array to Float32Array
   */
  flattenWeights(weights) {
    if (Array.isArray(weights[0])) {
      // 2D array, flatten it
      const flat = [];
      for (let i = 0; i < weights.length; i++) {
        for (let j = 0; j < weights[i].length; j++) {
          flat.push(weights[i][j]);
        }
      }
      return new Float32Array(flat);
    } else {
      // Already 1D
      return new Float32Array(weights);
    }
  }

  /**
   * Initialize DC blocker (one-pole highpass at 20Hz)
   */
  initDCBlocker(sampleRate) {
    const fc = 20.0; // 20Hz cutoff
    this.dcBlocker_coeff = Math.exp(-2.0 * Math.PI * fc / sampleRate);
    this.dcBlocker_x1 = 0.0;
    this.dcBlocker_y1 = 0.0;
  }

  /**
   * Initialize sample rate correction filter (high shelf)
   * Reduces high frequencies when process SR > model SR
   */
  initSRCFilter(sampleRate) {
    const cutoff = 8100.0;
    const Q = 0.7071; // Butterworth
    const gain = (sampleRate < this.modelSampleRate * 1.1) ? 1.0 : 0.25;

    // High shelf filter coefficients
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
  }

  /**
   * LSTM forward pass (single sample)
   *
   * LSTM equations:
   * i_t = σ(W_ii * x_t + b_ii + W_hi * h_{t-1} + b_hi)  [input gate]
   * f_t = σ(W_if * x_t + b_if + W_hf * h_{t-1} + b_hf)  [forget gate]
   * g_t = tanh(W_ig * x_t + b_ig + W_hg * h_{t-1} + b_hg)  [cell gate]
   * o_t = σ(W_io * x_t + b_io + W_ho * h_{t-1} + b_ho)  [output gate]
   * c_t = f_t ⊙ c_{t-1} + i_t ⊙ g_t  [cell state]
   * h_t = o_t ⊙ tanh(c_t)  [hidden state]
   *
   * where σ is sigmoid, ⊙ is element-wise multiplication
   */
  processSampleLSTM(input) {
    const H = this.hiddenSize; // 40

    // Compute input gates (i), forget gates (f), cell gates (g), output gates (o)
    // All computed together in one pass through weight matrices
    // Weight layout: [i_0...i_39, f_0...f_39, g_0...g_39, o_0...o_39] = 160 total

    const gates = new Float32Array(160); // 4 * 40

    // Compute W_ih * x + b_ih
    for (let i = 0; i < 160; i++) {
      let sum = this.weights.lstm_bih[i];

      if (this.inputSize === 1) {
        // Non-conditioned: single input
        sum += this.weights.lstm_Wih[0][i] * input;
      } else {
        // Conditioned: two inputs (audio + condition)
        sum += this.weights.lstm_Wih[0][i] * input;
        sum += this.weights.lstm_Wih[1][i] * this.condition;
      }

      gates[i] = sum;
    }

    // Add W_hh * h + b_hh
    for (let i = 0; i < 160; i++) {
      let sum = this.weights.lstm_bhh[i];

      for (let j = 0; j < H; j++) {
        sum += this.weights.lstm_Whh[j][i] * this.h[j];
      }

      gates[i] += sum;
    }

    // Apply activation functions and update cell/hidden states
    // PyTorch LSTM layout: [input, forget, cell, output]
    for (let i = 0; i < H; i++) {
      const i_gate = this.sigmoid(gates[i]);           // input gate
      const f_gate = this.sigmoid(gates[H + i]);       // forget gate
      const g_gate = Math.tanh(gates[2 * H + i]);      // cell gate
      const o_gate = this.sigmoid(gates[3 * H + i]);   // output gate

      // Update cell state
      this.c[i] = f_gate * this.c[i] + i_gate * g_gate;

      // Update hidden state
      this.h[i] = o_gate * Math.tanh(this.c[i]);
    }

    // Dense layer: output = W * h + b
    let output = this.weights.dense_b[0];
    for (let i = 0; i < H; i++) {
      output += this.weights.dense_W[i] * this.h[i];
    }

    return output;
  }

  /**
   * Sigmoid activation
   */
  sigmoid(x) {
    return 1.0 / (1.0 + Math.exp(-x));
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
   * Process audio block
   */
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || !input[0] || !this.modelLoaded || !this.enabled) {
      // Bypass: copy input to output
      if (input && input[0] && output && output[0]) {
        output[0].set(input[0]);
      }
      return true;
    }

    const inputChannel = input[0];
    const outputChannel = output[0];
    const numSamples = inputChannel.length;

    // Apply input gain (for non-conditioned models)
    let inputGain = 1.0;
    if (this.modelType === 'lstm40_nocond') {
      // Convert dB to linear, with 12dB reduction to match reference
      inputGain = Math.pow(10, (this.gain - 12.0) / 20.0);
    }

    // Process each sample
    for (let i = 0; i < numSamples; i++) {
      const dry = inputChannel[i];

      // Apply input gain
      let sample = dry * inputGain;

      // LSTM processing
      sample = this.processSampleLSTM(sample);

      // Sample rate correction filter
      if (this.useSRCFilter) {
        sample = this.srcFilter(sample);
      }

      // DC blocker
      sample = this.dcBlock(sample);

      // Dry/wet mix
      const wet = sample;
      outputChannel[i] = dry * (1.0 - this.dryWet) + wet * this.dryWet;
    }

    return true;
  }
}

// Guard against re-registration during HMR
try {
  registerProcessor('guitarml-processor', GuitarMLProcessor);
} catch (e) {
  // Already registered - ignore
}
