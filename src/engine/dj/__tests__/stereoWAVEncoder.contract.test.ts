/**
 * Contract test: DJ pipeline WAV encoder MUST produce stereo output.
 *
 * The DJ pipeline pre-renders tracker formats to WAV for analysis and
 * hot-swap to DeckAudioPlayer. This WAV must be stereo so:
 *   1. Hard-panned tracker content isn't lost (e.g. Amiga L/R channels)
 *   2. Demucs stem separation gets proper stereo input
 *
 * Previous bug: encodePCMToWAV downmixed to mono, losing spatial information
 * and producing inferior stem separation results for tracker formats.
 *
 * We guard against regression by statically inspecting the encoder source.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const PIPELINE_PATH = path.resolve(__dirname, '../../dj/DJPipeline.ts');

describe('DJPipeline WAV encoder produces stereo output', () => {
  const source = fs.readFileSync(PIPELINE_PATH, 'utf-8');

  it('encodePCMToWAV uses numChannels = 2 (stereo)', () => {
    // The encoder function must use stereo channels, not mono
    expect(source).toContain('const numChannels = 2');
    expect(source).not.toMatch(/const numChannels = 1/);
  });

  it('encodePCMToWAV writes interleaved stereo samples', () => {
    // Stereo WAV requires interleaved L/R sample writes
    expect(source).toMatch(/Interleaved stereo/i);
  });

  it('encodePCMToWAV does NOT downmix to mono', () => {
    // Guard against re-introducing mono downmix
    expect(source).not.toMatch(/Mono downmix/i);
  });
});
