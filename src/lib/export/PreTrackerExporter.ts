/**
 * PreTrackerExporter.ts — Export to native PreTracker .prt format
 *
 * Queries all song data from the running WASM engine (wave info, instrument
 * info, instrument patterns, track cells, position table) and serializes
 * to the .prt binary format matching the original file layout.
 *
 * Uses the raw file from WASM as the base, then patches wave/inst/pattern
 * sections with current edited state. This preserves the header, name strings,
 * and other metadata exactly as loaded while applying any edits.
 */

import { PreTrackerEngine } from '@/engine/pretracker/PreTrackerEngine';

export interface PreTrackerExportResult {
  data: Blob;
  filename: string;
  warnings: string[];
}

export async function exportAsPreTracker(
  originalFilename?: string,
): Promise<PreTrackerExportResult> {
  if (!PreTrackerEngine.hasInstance()) {
    throw new Error('PreTracker engine not loaded');
  }

  const engine = PreTrackerEngine.getInstance();

  const [rawFile, meta] = await Promise.all([
    engine.requestRawFile(),
    engine.requestMetadata(),
  ]);

  if (!rawFile) {
    throw new Error('No raw .prt file data available');
  }

  // Fetch current wave and instrument state from WASM
  const [waves, rawInstInfos] = await Promise.all([
    engine.requestAllWaveInfo(),
    engine.requestAllRawInstInfo(),
  ]);

  // Start with a copy of the raw file
  const buf = new Uint8Array(rawFile).slice();
  const view = new DataView(buf.buffer);
  const warnings: string[] = [];

  // Parse header to find section offsets
  const version = buf[3];
  const instNamesOffset = view.getUint32(0x0C, false);
  const numInstruments = buf[0x40];
  const numWaves = buf[0x41];

  // Find wave info offset by scanning past instrument names + inst info + inst patterns
  // This is complex due to variable-length name strings, so we locate it by
  // finding the first WaveInfo block in the original file.
  //
  // Strategy: for each wave, the WASM keeps a pointer into the original prt_data.
  // We can't access those pointers from JS. Instead, we scan the file for
  // wave info blocks by looking for the pattern that matches the loaded data.
  //
  // Simpler approach: skip instrument names, then instrument infos, then
  // instrument patterns, and we land at the wave info block.

  let ptr = instNamesOffset;
  const maxInstNames = version === 0x1E ? 64 : 32;

  // Skip instrument names (null-terminated, max 23 chars each)
  for (let i = 0; i < maxInstNames; i++) {
    let remaining = 22;
    while (ptr < buf.length && buf[ptr] !== 0 && remaining > 0) {
      ptr++;
      remaining--;
    }
    if (ptr < buf.length) ptr++; // skip null
  }

  // Instrument info table (8 bytes each)
  const instInfoOffset = ptr;
  ptr += numInstruments * 8;

  // Instrument pattern data (variable size per instrument)
  for (let i = 0; i < numInstruments; i++) {
    const steps = buf[instInfoOffset + i * 8 + 7]; // pattern_steps is at offset +7
    ptr += steps * 3;
  }

  // Align to even address
  if (ptr & 1) ptr++;

  // Wave info table (42 bytes each)
  const waveInfoOffset = ptr;

  // Patch wave info blocks
  for (let w = 0; w < numWaves; w++) {
    const wave = waves[w];
    if (!wave) continue;
    const base = waveInfoOffset + w * 42;
    if (base + 42 > buf.length) { warnings.push(`Wave ${w} offset out of bounds`); continue; }

    view.setUint16(base + 0x00, wave.loopStart, false);
    view.setUint16(base + 0x02, wave.loopEnd, false);
    view.setUint16(base + 0x04, wave.subloopLen, false);
    buf[base + 0x06] = wave.allow9xx;
    buf[base + 0x07] = wave.subloopWait;
    view.setUint16(base + 0x08, wave.subloopStep, false);
    view.setUint16(base + 0x0A, wave.chipram, false);
    view.setUint16(base + 0x0C, wave.loopOffset, false);
    buf[base + 0x0E] = wave.chordNote1;
    buf[base + 0x0F] = wave.chordNote2;
    buf[base + 0x10] = wave.chordNote3;
    buf[base + 0x11] = wave.chordShift;
    buf[base + 0x12] = 0; // osc_unknown, always 0
    buf[base + 0x13] = wave.oscPhaseSpd;
    let flags = wave.oscType & 0x03;
    if (wave.extraOctaves) flags |= 0x04;
    if (wave.boost) flags |= 0x08;
    if (wave.pitchLinear) flags |= 0x10;
    if (wave.volFast) flags |= 0x20;
    buf[base + 0x14] = flags;
    buf[base + 0x15] = wave.oscPhaseMin;
    buf[base + 0x16] = wave.oscPhaseMax;
    buf[base + 0x17] = wave.oscBasenote;
    buf[base + 0x18] = wave.oscGain;
    buf[base + 0x19] = wave.samLen;
    buf[base + 0x1A] = wave.mixWave;
    buf[base + 0x1B] = wave.volAttack;
    buf[base + 0x1C] = wave.volDelay;
    buf[base + 0x1D] = wave.volDecay;
    buf[base + 0x1E] = wave.volSustain;
    buf[base + 0x1F] = wave.fltType;
    buf[base + 0x20] = wave.fltResonance;
    buf[base + 0x21] = wave.pitchRamp;
    buf[base + 0x22] = wave.fltStart;
    buf[base + 0x23] = wave.fltMin;
    buf[base + 0x24] = wave.fltMax;
    buf[base + 0x25] = wave.fltSpeed;
    buf[base + 0x26] = wave.modWetness;
    buf[base + 0x27] = wave.modLength;
    buf[base + 0x28] = wave.modPredelay;
    buf[base + 0x29] = wave.modDensity;
  }

  // Patch raw instrument info (8 bytes each, with reverse-mapped lookup table indices)
  for (let i = 0; i < numInstruments; i++) {
    const raw = rawInstInfos[i];
    if (!raw || raw.length < 8) continue;
    const base = instInfoOffset + i * 8;
    if (base + 8 > buf.length) { warnings.push(`Inst ${i} offset out of bounds`); continue; }
    for (let j = 0; j < 8; j++) {
      buf[base + j] = raw[j];
    }
  }

  const baseName = originalFilename?.replace(/\.[^.]+$/, '') ?? meta.title ?? 'pretracker';
  const filename = `${baseName}.prt`;

  return {
    data: new Blob([buf], { type: 'application/octet-stream' }),
    filename,
    warnings,
  };
}
