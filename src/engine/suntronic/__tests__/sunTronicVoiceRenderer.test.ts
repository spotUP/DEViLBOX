/**
 * Regression: SunTronic Paula wavetable voice renderer.
 *
 * The renderer is the piece that makes a synth instrument AUDIBLE as its own
 * voice — the fix for "playing a synth instrument plays the whole song" (that
 * bug is the absence of any native voice, forcing whole-module UADE playback).
 * These pin the structural contract: a fixed-pitch synth voice produces a
 * non-silent PCM buffer of the requested length, deterministically; zero voice
 * volume is silent; a waveWordLen-0 instrument is silent. Sample-exact timbre
 * parity (types 1/3/else) is the separate UADE oracle's job.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSunTronicV13Score } from '@/lib/import/formats/SunTronicV13';
import { renderSunSynthPreview } from '../SunTronicVoiceRenderer';

function mule() {
  const buf = new Uint8Array(
    readFileSync(join(process.cwd(), 'public/data/songs/formats/SUNTronicTunes/mule.src')),
  );
  return parseSunTronicV13Score(buf);
}

describe('SunTronic Paula wavetable voice renderer', () => {
  it('renders exactly seconds*sampleRate samples', () => {
    const s0 = mule().synthInstruments[0];
    const out = renderSunSynthPreview(s0, { periodIndex: 36, seconds: 0.25, sampleRate: 8000 });
    expect(out.length).toBe(2000);
  });

  it('produces a non-silent voice for mule.src synth[0]', () => {
    const s0 = mule().synthInstruments[0];
    const out = renderSunSynthPreview(s0, { periodIndex: 36, seconds: 0.25, sampleRate: 22050 });
    expect(out.some((v) => v !== 0)).toBe(true);
    // all samples in-range
    expect(out.every((v) => v >= -1 && v <= 1)).toBe(true);
  });

  it('is deterministic for identical inputs', () => {
    const s0 = mule().synthInstruments[0];
    const a = renderSunSynthPreview(s0, { periodIndex: 36, seconds: 0.1, sampleRate: 22050 });
    const b = renderSunSynthPreview(s0, { periodIndex: 36, seconds: 0.1, sampleRate: 22050 });
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('zero voice volume → silence', () => {
    const s0 = mule().synthInstruments[0];
    const out = renderSunSynthPreview(s0, {
      periodIndex: 36, seconds: 0.1, sampleRate: 22050, voiceVolume: 0,
    });
    expect(out.every((v) => v === 0)).toBe(true);
  });

  it('waveWordLen-0 instrument → silence (no buffer to loop)', () => {
    const s0 = mule().synthInstruments[0];
    const silent = { ...s0, waveWordLen: 0, wave1: new Int8Array(0), wave2: new Int8Array(0) };
    const out = renderSunSynthPreview(silent, { periodIndex: 36, seconds: 0.1, sampleRate: 22050 });
    expect(out.every((v) => v === 0)).toBe(true);
  });
});
