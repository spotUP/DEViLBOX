/**
 * ITFilter - WebAssembly port of Jeffrey Lim's Impulse Tracker Filter
 * Optimized version using raw memory access for maximum speed
 */

// Filter state
let y1: f32 = 0.0;
let y2: f32 = 0.0;
let f: f32 = 1.0;
let q: f32 = 0.0;

/**
 * Update filter coefficients
 */
export function updateCoefficients(cutoff: f32, resonance: f32, sampleRate: f32): void {
  const cutoffNorm = cutoff / 127.0;
  const freqHz = 100.0 * f32(Math.pow(100.0, f32(cutoffNorm)));
  
  f = 2.0 * f32(Math.sin(Math.PI * f32(freqHz) / sampleRate));
  q = 1.0 - (resonance / 127.0);
  
  if (f > 1.0) f = 1.0;
  if (q < 0.0) q = 0.0;
}

/**
 * Process a block of samples using raw pointers
 * @param inputPtr Pointer to the input Float32Array in WASM memory
 * @param outputPtr Pointer to the output Float32Array in WASM memory
 * @param len Number of samples to process
 */
export function processRaw(inputPtr: usize, outputPtr: usize, len: i32): void {
  const local_f = f;
  const local_q = q;
  let local_y1 = y1;
  let local_y2 = y2;

  for (let i = 0; i < len; i++) {
    // Read input from memory (Float32 = 4 bytes)
    const x = load<f32>(inputPtr + (<usize>i << 2));
    
    // Jeffrey Lim's IT Filter Math
    local_y1 = local_y1 + local_f * (x - local_y1) + local_q * (local_y1 - local_y2);
    local_y2 = local_y2 + local_f * (local_y1 - local_y2);
    
    // Safety check for stability
    if (!isFinite(local_y1)) local_y1 = 0;
    if (!isFinite(local_y2)) local_y2 = 0;

    // Store output to memory
    store<f32>(outputPtr + (<usize>i << 2), local_y2);
  }

  y1 = local_y1;
  y2 = local_y2;
}

/**
 * Reset filter state
 */
export function reset(): void {
  y1 = 0;
  y2 = 0;
}

/**
 * Initialize all WASM internal systems
 */
/**
 * RowTiming information for the scheduler
 */
class RowTiming {
  time: f32;
  speed: i32;
  bpm: f32;
  delay: i32;
}

/**
 * Port of computeRowTimings logic to WASM
 * Since we can't easily pass complex nested objects like Pattern into WASM yet,
 * we will start by providing helper functions for the math.
 */
export function calculateRowDuration(bpm: f32, speed: i32, delay: i32): f32 {
  const secondsPerTick: f32 = 2.5 / bpm;
  return secondsPerTick * <f32>speed * (1.0 + <f32>delay);
}

export * from './TB303';
export * from './Scheduler';
export * from './Periods';