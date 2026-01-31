/**
 * Scheduler - WASM accelerated timing calculations
 */

// Memory layout for RowTiming: [time(f32), speed(i32), bpm(f32), delay(i32)] = 16 bytes per row
const BYTES_PER_ROW = 16;

/**
 * Compute all row timings for a pattern in one pass
 * @param dataPtr Pointer to the input pattern data: [length(i32), initialSpeed(i32), initialBPM(f32), rowData...]
 * @param outputPtr Pointer to the output buffer for RowTiming structs
 */
export function computePatternTimings(dataPtr: usize, outputPtr: usize): void {
  const length = load<i32>(dataPtr);
  let currentSpeed = load<i32>(dataPtr + 4);
  let currentBPM = load<f32>(dataPtr + 8);
  let currentTime: f32 = 0.0;

  // Pattern data starts after the 12 bytes of header
  const rowDataStart = dataPtr + 12;

  for (let row = 0; row < length; row++) {
    // Read input row data (provided by JS as [hasSpeedChange(bool), newSpeed(i32), hasBPMChange(bool), newBPM(f32), delay(i32)])
    // For simplicity in this port, we'll assume JS pre-scanned the row for Fxx/EEx
    const offset = <usize>row * 20; // 20 bytes per input row data
    
    const hasSpeed = load<i32>(rowDataStart + offset);
    if (hasSpeed) currentSpeed = load<i32>(rowDataStart + offset + 4);
    
    const hasBPM = load<i32>(rowDataStart + offset + 8);
    if (hasBPM) currentBPM = load<f32>(rowDataStart + offset + 12);
    
    const delay = load<i32>(rowDataStart + offset + 16);

    // Write to output buffer
    const outOffset = <usize>row * BYTES_PER_ROW;
    store<f32>(outputPtr + outOffset, currentTime);
    store<i32>(outputPtr + outOffset + 4, currentSpeed);
    store<f32>(outputPtr + outOffset + 8, currentBPM);
    store<i32>(outputPtr + outOffset + 12, delay);

    // Calculate duration for next row
    const secondsPerTick: f32 = 2.5 / currentBPM;
    const rowDuration = secondsPerTick * <f32>currentSpeed * (1.0 + <f32>delay);
    currentTime += rowDuration;
  }
}
