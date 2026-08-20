/**
 * tms5220FrameBuffer.ts — pack TMS5220Frame[] into the 12-byte frame buffer
 * format consumed by the MAME engine's loadFrameBuffer/speakFrameBuffer API.
 *
 * Each frame is 12 bytes: [energy_idx, pitch_idx, k0..k9]. Frames are expanded
 * by durationMs (25 ms per MAME frame). Single source of truth for the packing —
 * consumed by both the browser synth (TMS5220Synth) and the headless render
 * tools (tools/tms5220-audit).
 */
import type { TMS5220Frame } from './tms5220PhonemeMap';

// K index max values per coefficient (from KBITS: 5,5,4,4,4,4,4,3,3,3)
export const FRAME_K_MAX = [31, 31, 15, 15, 15, 15, 15, 7, 7, 7];

export interface PackedFrameBuffer {
  data: Uint8Array;
  numFrames: number;
}

/** How many 25 ms MAME frames a TMS5220Frame occupies. */
export function frameCountForDuration(durationMs: number): number {
  return Math.max(1, Math.round(durationMs / 25));
}

export function packFrameBuffer(frames: TMS5220Frame[]): PackedFrameBuffer {
  // First pass: count total MAME frames needed
  let totalFrames = 0;
  for (const frame of frames) totalFrames += frameCountForDuration(frame.durationMs);

  // Add a silence frame at the end so the engine ramps down cleanly
  totalFrames += 1;

  const data = new Uint8Array(totalFrames * 12);
  let offset = 0;

  for (const frame of frames) {
    const count = frameCountForDuration(frame.durationMs);
    // Clamp to valid table ranges: energy [1,14] (0=silence, 15=stop), pitch [0,31]
    const energyIdx = Math.min(Math.max(frame.energy, 1), 14);
    const pitchIdx = frame.unvoiced ? 0 : Math.min(Math.max(frame.pitch, 0), 31);
    const k = frame.k;

    for (let i = 0; i < count; i++) {
      data[offset] = energyIdx;
      data[offset + 1] = pitchIdx;
      for (let ki = 0; ki < 10; ki++) {
        data[offset + 2 + ki] = Math.min(Math.max(k[ki] ?? 0, 0), FRAME_K_MAX[ki]);
      }
      offset += 12;
    }
  }

  // Final silence frame (energy=0) to end speech cleanly
  data[offset] = 0; // energy 0 = silence
  // pitch and K default to 0 (already zeroed)

  return { data, numFrames: totalFrames };
}