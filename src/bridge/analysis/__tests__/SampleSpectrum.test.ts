/**
 * SampleSpectrum tests — offline FFT classification of raw PCM samples.
 *
 * Regression: the 2026-04-21 Auto-Dub bug left world-class-dub.mod with
 * zero detected 'bass' channels because classifyChannel's avgOctave <= 2.5
 * heuristic rejects Amiga-encoded bass (sitting in octave 3). This module
 * fixes that by analysing the PCM itself: a low-centroid, tonal, sustained
 * sample classifies as bass regardless of how the note is encoded or how
 * the instrument is named.
 *
 * All tests synthesise PCM in-memory — no fixtures, no fake audio context.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  decodeWavBytes,
  decodeWavDataUrl,
  extractSampleFeatures,
  classifyBySpectralFeatures,
  analyzeSampleForClassification,
  _clearSampleSpectrumCache,
} from '../SampleSpectrum';

// ─── Signal synthesis helpers ───────────────────────────────────────────────

function sineBuffer(freq: number, durationSec: number, sampleRate: number, amp = 0.8): Float32Array {
  const n = Math.floor(durationSec * sampleRate);
  const out = new Float32Array(n);
  const k = 2 * Math.PI * freq / sampleRate;
  for (let i = 0; i < n; i++) out[i] = Math.sin(k * i) * amp;
  return out;
}

function whiteNoise(durationSec: number, sampleRate: number, amp = 0.8): Float32Array {
  const n = Math.floor(durationSec * sampleRate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = (Math.random() * 2 - 1) * amp;
  return out;
}

function applyEnvelope(
  buf: Float32Array,
  attackMs: number,
  decayMs: number,
  sampleRate: number,
): Float32Array {
  const attackSamples = Math.max(1, Math.floor((attackMs / 1000) * sampleRate));
  const decayStart = attackSamples;
  const decayEnd = Math.min(buf.length, decayStart + Math.floor((decayMs / 1000) * sampleRate));
  for (let i = 0; i < attackSamples && i < buf.length; i++) {
    buf[i] *= i / attackSamples;
  }
  for (let i = decayStart; i < decayEnd; i++) {
    const t = (i - decayStart) / Math.max(1, decayEnd - decayStart);
    buf[i] *= 1 - t;
  }
  for (let i = decayEnd; i < buf.length; i++) buf[i] = 0;
  return buf;
}

function encodeWav16(pcm: Float32Array, sampleRate: number): Uint8Array {
  const frames = pcm.length;
  const dataSize = frames * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);
  const writeStr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);          // fmt chunk size
  view.setUint16(20, 1, true);           // PCM
  view.setUint16(22, 1, true);           // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true);           // block align
  view.setUint16(34, 16, true);          // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < frames; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(44 + i * 2, Math.round(s * 32767), true);
  }
  return new Uint8Array(buf);
}

function encodeWav8(pcm: Float32Array, sampleRate: number): Uint8Array {
  const frames = pcm.length;
  const dataSize = frames;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);
  const writeStr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < frames; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setUint8(44 + i, Math.round(s * 127) + 128);
  }
  return new Uint8Array(buf);
}

function bytesToDataUrl(bytes: Uint8Array): string {
  // Browser + Node both have btoa; use ASCII string conversion.
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = typeof btoa === 'function'
    ? btoa(bin)
    : Buffer.from(bin, 'binary').toString('base64');
  return `data:audio/wav;base64,${b64}`;
}

// ─── Decoder ────────────────────────────────────────────────────────────────

describe('decodeWavBytes', () => {
  it('decodes 16-bit PCM round-trip within quantisation error', () => {
    const src = sineBuffer(440, 0.05, 44100);
    const wav = encodeWav16(src, 44100);
    const decoded = decodeWavBytes(wav);
    expect(decoded).not.toBeNull();
    expect(decoded!.sampleRate).toBe(44100);
    expect(decoded!.pcm.length).toBe(src.length);
    for (let i = 0; i < src.length; i++) {
      expect(Math.abs(decoded!.pcm[i] - src[i])).toBeLessThan(1 / 16384);
    }
  });

  it('decodes 8-bit unsigned PCM round-trip within quantisation error', () => {
    const src = sineBuffer(440, 0.05, 22050);
    const wav = encodeWav8(src, 22050);
    const decoded = decodeWavBytes(wav);
    expect(decoded).not.toBeNull();
    expect(decoded!.sampleRate).toBe(22050);
    // 8-bit quantises to ~0.008 precision
    for (let i = 0; i < src.length; i++) {
      expect(Math.abs(decoded!.pcm[i] - src[i])).toBeLessThan(0.02);
    }
  });

  it('returns null for buffers shorter than the WAV header', () => {
    expect(decodeWavBytes(new Uint8Array(10))).toBeNull();
  });

  it('returns null for non-RIFF data', () => {
    const buf = new Uint8Array(100);
    buf[0] = 0x00; buf[1] = 0x00; buf[2] = 0x00; buf[3] = 0x00;
    expect(decodeWavBytes(buf)).toBeNull();
  });
});

describe('decodeWavDataUrl', () => {
  it('decodes a data:audio/wav;base64 URL', () => {
    const src = sineBuffer(220, 0.05, 22050);
    const url = bytesToDataUrl(encodeWav16(src, 22050));
    const decoded = decodeWavDataUrl(url);
    expect(decoded).not.toBeNull();
    expect(decoded!.sampleRate).toBe(22050);
  });

  it('returns null for non-data-URL strings', () => {
    expect(decodeWavDataUrl('https://example.com/sample.wav')).toBeNull();
    expect(decodeWavDataUrl('')).toBeNull();
    expect(decodeWavDataUrl(null)).toBeNull();
    expect(decodeWavDataUrl(undefined)).toBeNull();
  });
});

// ─── Feature extraction sanity ─────────────────────────────────────────────

describe('extractSampleFeatures', () => {
  it('reports low centroid + low flatness for a 110 Hz sine', () => {
    const pcm = sineBuffer(110, 0.5, 22050);
    const f = extractSampleFeatures(pcm, 22050);
    expect(f).not.toBeNull();
    expect(f!.centroidHz).toBeLessThan(400);
    expect(f!.flatness).toBeLessThan(0.2);
    expect(f!.peakHz).toBeGreaterThan(80);
    expect(f!.peakHz).toBeLessThan(140);
  });

  it('reports high flatness for white noise', () => {
    const pcm = whiteNoise(0.5, 22050);
    const f = extractSampleFeatures(pcm, 22050);
    expect(f).not.toBeNull();
    expect(f!.flatness).toBeGreaterThan(0.3);
  });

  it('reports high centroid for high-frequency noise', () => {
    // Pass white noise through a crude first-order high-pass by differentiating:
    //   y[n] = x[n] - x[n-1] → boosts highs.
    const x = whiteNoise(0.5, 22050);
    const hp = new Float32Array(x.length);
    for (let i = 1; i < x.length; i++) hp[i] = x[i] - x[i - 1];
    const f = extractSampleFeatures(hp, 22050);
    expect(f).not.toBeNull();
    expect(f!.centroidHz).toBeGreaterThan(3000);
  });

  it('short decay → percussive; long decay → sustained', () => {
    // Envelope-sweep the same white-noise source to compare envelope features.
    const kick = applyEnvelope(whiteNoise(0.3, 22050), 5, 80, 22050);
    const pad = applyEnvelope(sineBuffer(440, 1.5, 22050, 0.8), 50, 1200, 22050);
    const fKick = extractSampleFeatures(kick, 22050)!;
    const fPad = extractSampleFeatures(pad, 22050)!;
    expect(fKick.decayMs).toBeLessThan(300);
    expect(fPad.decayMs).toBeGreaterThan(500);
  });

  it('returns null for buffers too short to FFT', () => {
    expect(extractSampleFeatures(new Float32Array(32), 22050)).toBeNull();
    expect(extractSampleFeatures(new Float32Array(), 22050)).toBeNull();
  });
});

// ─── Classifier decisions ──────────────────────────────────────────────────

describe('classifyBySpectralFeatures (regression: non-empty bass detection)', () => {
  it('110 Hz sustained sine → bass (this was the world-class-dub failure mode)', () => {
    const pcm = sineBuffer(110, 1.0, 22050, 0.8);
    const f = extractSampleFeatures(pcm, 22050)!;
    const c = classifyBySpectralFeatures(f);
    expect(c.role).toBe('bass');
    expect(c.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it('55 Hz sine → bass subrole=sub', () => {
    const pcm = sineBuffer(55, 0.5, 22050, 0.8);
    const f = extractSampleFeatures(pcm, 22050)!;
    const c = classifyBySpectralFeatures(f);
    expect(c.role).toBe('bass');
    expect(c.subrole).toBe('sub');
  });

  it('short low-freq thump + click → percussion (kick)', () => {
    // Real kicks are a sub-bass sine thump + a broadband transient click,
    // with a fast amplitude decay. Synthesise exactly that.
    const sr = 22050;
    const dur = 0.2;
    const sub = sineBuffer(60, dur, sr, 0.9);   // 60 Hz body
    const noise = whiteNoise(dur, sr, 0.5);     // click layer
    const mix = new Float32Array(sub.length);
    for (let i = 0; i < sub.length; i++) mix[i] = sub[i] + noise[i];
    const kick = applyEnvelope(mix, 1, 60, sr);
    const f = extractSampleFeatures(kick, sr)!;
    const c = classifyBySpectralFeatures(f);
    expect(c.role).toBe('percussion');
  });

  it('short high-centroid noise burst → percussion (hat)', () => {
    // High-passed noise: differentiate + envelope
    const x = whiteNoise(0.1, 22050);
    const hp = new Float32Array(x.length);
    for (let i = 1; i < x.length; i++) hp[i] = x[i] - x[i - 1];
    const hat = applyEnvelope(hp, 1, 50, 22050);
    const f = extractSampleFeatures(hat, 22050)!;
    const c = classifyBySpectralFeatures(f);
    expect(c.role).toBe('percussion');
    expect(c.subrole).toBe('hat');
  });

  it('long tonal sine → pad', () => {
    const pad = applyEnvelope(sineBuffer(440, 2.0, 22050, 0.6), 200, 1500, 22050);
    const f = extractSampleFeatures(pad, 22050)!;
    const c = classifyBySpectralFeatures(f);
    expect(c.role).toBe('pad');
  });

  it('medium-decay tonal mid-range → lead', () => {
    const lead = applyEnvelope(sineBuffer(660, 0.5, 22050, 0.8), 10, 350, 22050);
    const f = extractSampleFeatures(lead, 22050)!;
    const c = classifyBySpectralFeatures(f);
    expect(c.role).toBe('lead');
  });
});

// ─── End-to-end pipeline ───────────────────────────────────────────────────

describe('analyzeSampleForClassification (end-to-end)', () => {
  beforeEach(() => _clearSampleSpectrumCache());

  it('classifies a 110 Hz WAV data URL as bass', () => {
    const url = bytesToDataUrl(encodeWav16(sineBuffer(110, 1.0, 22050), 22050));
    const r = analyzeSampleForClassification(url);
    expect(r).not.toBeNull();
    expect(r!.role).toBe('bass');
  });

  it('returns null for non-data-URL inputs', () => {
    expect(analyzeSampleForClassification(null)).toBeNull();
    expect(analyzeSampleForClassification(undefined)).toBeNull();
    expect(analyzeSampleForClassification('https://example.com/kick.wav')).toBeNull();
    expect(analyzeSampleForClassification('')).toBeNull();
  });

  it('caches by URL string — second call returns the same instance', () => {
    const url = bytesToDataUrl(encodeWav16(sineBuffer(220, 0.5, 22050), 22050));
    const a = analyzeSampleForClassification(url);
    const b = analyzeSampleForClassification(url);
    expect(a).toBe(b);
  });
});
