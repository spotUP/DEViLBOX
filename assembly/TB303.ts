/**
 * TB303 - WebAssembly port of the Accurate TB-303 Engine
 * Based on Open303 DSP algorithms.
 */

// Math constants
const PI: f32 = 3.14159265358979323846;

class FilterState {
  y0: f32 = 0;
  y1: f32 = 0;
  y2: f32 = 0;
  y3: f32 = 0;
  y4: f32 = 0;
  hp_y1: f32 = 0; // Feedback highpass state
}

class EnvelopeState {
  main: f32 = 0;
  amp: f32 = 0;
  rc1: f32 = 0;
  rc2: f32 = 0;
}

class TB303State {
  // Config/Params
  cutoff: f32 = 500.0;
  resonance: f32 = 0.5;
  envMod: f32 = 0.5;
  decay: f32 = 0.5;
  accent: f32 = 0.5;
  waveform: f32 = 0; // 0 = saw, 1 = square
  
  // Oscillator
  phase: f32 = 0;
  phaseInc: f32 = 0;
  
  // Internal State
  filter: FilterState = new FilterState();
  env: EnvelopeState = new EnvelopeState();
  
  // Coefficients
  b0: f32 = 0;
  k: f32 = 0;
  g: f32 = 0;
  decayCoeff: f32 = 0.999;
  
  active: bool = false;
  
  constructor() {}
}

// Memory mapping for multiple instances
const MAX_VOICES = 16;
const voices = new Array<TB303State>(MAX_VOICES);

/**
 * Initialize voices (internal call)
 */
export function initEngine(): void {
  for (let i = 0; i < MAX_VOICES; i++) {
    voices[i] = new TB303State();
  }
}

/**
 * Initialize a voice with a specific sample rate
 */
export function initVoice(index: i32, sampleRate: f32): void {
  if (index < 0 || index >= MAX_VOICES) return;
  const v = voices[index];
  v.active = true;
  // Initialize default coefficients
  updateVoiceParams(index, 500.0, 0.5, 0.5, 0.5, 0.5, 0, sampleRate);
}

/**
 * Update parameters for a specific voice
 */
export function updateVoiceParams(
  index: i32, 
  cutoff: f32, 
  resonance: f32, 
  envMod: f32, 
  decay: f32, 
  accent: f32, 
  waveform: f32,
  sampleRate: f32
): void {
  if (index < 0 || index >= MAX_VOICES) return;
  const v = voices[index];
  
  v.cutoff = cutoff;
  v.resonance = resonance;
  v.envMod = envMod;
  v.decay = decay;
  v.accent = accent;
  v.waveform = waveform;

  // Calculate Filter Coefficients (Open303 algorithm)
  const wc = 2.0 * PI * cutoff / sampleRate;
  const fx = wc * 0.70710678118 / (2.0 * PI); // wc * 1/sqrt(2) / 2pi

  // b0 = (0.00045522346 + 6.1922189 * fx) / (1.0 + 12.358354 * fx + 4.4156345 * fx^2)
  v.b0 = f32((0.00045522346 + 6.1922189 * <f64>fx) / (1.0 + 12.358354 * <f64>fx + 4.4156345 * <f64>fx * <f64>fx));

  // k factor (6th order polynomial)
  v.k = f32(<f64>fx * (<f64>fx * (<f64>fx * (<f64>fx * (<f64>fx * (<f64>fx + 7198.6997) - 5837.7917) - 476.47308) + 614.95611) + 213.87126) + 16.998792);

  // Resonance skewing
  const rSkew = (1.0 - Math.exp(-3.0 * <f64>resonance)) / (1.0 - Math.exp(-3.0));
  
  // Output gain & Feedback
  v.g = v.k * (1.0 / 17.0);
  v.g = (v.g - 1.0) * f32(rSkew) + 1.0;
  v.g = v.g * (1.0 + f32(rSkew));
  v.k = v.k * f32(rSkew);
  
  // Decay coefficient
  // Map 0-1 to 200ms - 2000ms
  const decayTime = 0.2 + (decay * 1.8);
  v.decayCoeff = f32(Math.exp(-1.0 / (<f64>decayTime * <f64>sampleRate)));
}

/**
 * Process audio for a specific voice
 */
export function processVoice(index: i32, outputPtr: usize, len: i32, freq: f32, isNoteOn: bool, sampleRate: f32): void {
  if (index < 0 || index >= MAX_VOICES) return;
  const v = voices[index];
  
  v.phaseInc = freq / sampleRate;
  
  for (let i = 0; i < len; i++) {
    // 1. Update Phase
    v.phase += v.phaseInc;
    if (v.phase >= 1.0) v.phase -= 1.0;
    
    // 2. Simple Saw/Square Generator
    let osc: f32 = 0;
    if (v.waveform < 0.5) {
      osc = 2.0 * v.phase - 1.0; // Saw
    } else {
      osc = v.phase < 0.5 ? 1.0 : -1.0; // Square
    }
    
    // 3. Update Envelopes
    if (isNoteOn) {
      v.env.main = 1.0;
      v.env.amp = 1.0;
    }
    v.env.main *= v.decayCoeff;
    v.env.amp *= 0.9999;
    
    // 4. Filter processing (Ladder)
    const fb = v.k * v.filter.y4;
    v.filter.y0 = osc - fb;
    v.filter.y1 += v.b0 * (v.filter.y0 - v.filter.y1);
    v.filter.y2 += v.b0 * (v.filter.y1 - v.filter.y2);
    v.filter.y3 += v.b0 * (v.filter.y2 - v.filter.y3);
    v.filter.y4 += v.b0 * (v.filter.y3 - v.filter.y4);
    
    let sample = v.filter.y4 * v.g * v.env.amp;
    
    // Safety check
    if (!isFinite(sample)) sample = 0;
    
    store<f32>(outputPtr + (<usize>i << 2), sample);
  }
}