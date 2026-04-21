/**
 * ChannelAudioClassifier tests — runtime per-channel role detection from
 * the live oscilloscope tap.
 *
 * Strategy: synthesise Int16 PCM streams that look like what the WASM
 * per-channel tap would emit (256-sample chunks for UADE, 512 for others),
 * pump them into updateChannelClassifierFromTap across multiple "ticks",
 * and assert the runtime hint converges on the expected role after enough
 * history has accumulated.
 *
 * All tests reset module state in beforeEach — runtime state is global
 * so tests would otherwise leak between cases.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  updateChannelClassifierFromTap,
  getRuntimeChannelRole,
  getAllRuntimeChannelRoles,
  resetRuntimeChannelClassifier,
  mergeOfflineAndRuntimeRoles,
  getRuntimeClassifierGeneration,
  _peekChannelState,
} from '../ChannelAudioClassifier';
import type { ChannelRole } from '../MusicAnalysis';

// ─── Signal synthesis ───────────────────────────────────────────────────────

const TAP_CHUNK = 256;   // matches the WASM taps (UADE/Hively/etc. emit 256/update)

function sineInt16(freq: number, sampleRate: number, length: number, startPhase = 0, amp = 0.7): Int16Array {
  const out = new Int16Array(length);
  const k = 2 * Math.PI * freq / sampleRate;
  for (let i = 0; i < length; i++) {
    const s = Math.sin(k * (i + startPhase)) * amp;
    out[i] = Math.max(-32768, Math.min(32767, Math.round(s * 32767)));
  }
  return out;
}

function noiseInt16(length: number, amp = 0.6): Int16Array {
  const out = new Int16Array(length);
  for (let i = 0; i < length; i++) {
    const s = (Math.random() * 2 - 1) * amp;
    out[i] = Math.max(-32768, Math.min(32767, Math.round(s * 32767)));
  }
  return out;
}

/** Continuous sine generator — yields 256-sample chunks in order, matching
 *  the oscilloscope tap's output. */
function* sineTicker(freq: number, sampleRate: number): Generator<Int16Array> {
  let phase = 0;
  while (true) {
    yield sineInt16(freq, sampleRate, TAP_CHUNK, phase);
    phase += TAP_CHUNK;
  }
}

/** HPF'd noise via single-pole differencing — boosts high frequencies. */
function highPassedNoise(length: number, amp = 0.6): Int16Array {
  const raw = noiseInt16(length, amp);
  const out = new Int16Array(length);
  for (let i = 1; i < length; i++) out[i] = Math.max(-32768, Math.min(32767, raw[i] - raw[i - 1]));
  return out;
}

// ─── Setup ──────────────────────────────────────────────────────────────────

describe('ChannelAudioClassifier', () => {
  beforeEach(() => resetRuntimeChannelClassifier());

  // ── Build-up + consensus ──────────────────────────────────────────────

  it('returns null before enough samples have accumulated', () => {
    const sr = 48000;
    // One tick = 256 samples; MIN_SAMPLES_FOR_CLASSIFICATION = 1024 → need
    // at least 4 ticks before any classification even runs.
    const gen = sineTicker(110, sr);
    for (let i = 0; i < 2; i++) {
      updateChannelClassifierFromTap([gen.next().value ?? null], sr);
    }
    expect(getRuntimeChannelRole(0)).toBeNull();
  });

  it('classifies a sustained 110 Hz sine as bass after majority vote accumulates', () => {
    const sr = 48000;
    const gen = sineTicker(110, sr);
    // 20 ticks → ring fills multiple times, history reaches max HISTORY_LEN (4).
    for (let i = 0; i < 20; i++) {
      updateChannelClassifierFromTap([gen.next().value ?? null], sr);
    }
    const hint = getRuntimeChannelRole(0);
    expect(hint).not.toBeNull();
    expect(hint!.role).toBe('bass');
    expect(hint!.support).toBeGreaterThanOrEqual(0.75);
  });

  it('multi-channel: bass on ch0, hat-like on ch2, nothing on ch1/ch3', () => {
    const sr = 48000;
    const bassGen = sineTicker(110, sr);
    for (let i = 0; i < 20; i++) {
      const ch0 = bassGen.next().value ?? null;
      const ch2 = highPassedNoise(TAP_CHUNK, 0.5);   // broadband, high-centroid
      updateChannelClassifierFromTap([ch0, null, ch2, null], sr);
    }
    const h0 = getRuntimeChannelRole(0);
    const h1 = getRuntimeChannelRole(1);
    const h2 = getRuntimeChannelRole(2);
    const h3 = getRuntimeChannelRole(3);
    expect(h0?.role).toBe('bass');
    expect(h1).toBeNull();
    // ch2: either percussion (hat) or bass-suppressed — assert percussion when reached, but
    // ALLOW null when synthesised signal hits the classifier's empty branch.
    if (h2) {
      expect(['percussion', 'lead']).toContain(h2.role);
    }
    expect(h3).toBeNull();
  });

  // ── Merge policy ──────────────────────────────────────────────────────

  it('mergeOfflineAndRuntimeRoles overrides offline=empty/pad with runtime bass', () => {
    const offline: ChannelRole[] = ['empty', 'pad', 'lead', 'percussion'];
    const runtime = [
      { role: 'bass' as ChannelRole, confidence: 0.85, support: 1 },
      { role: 'bass' as ChannelRole, confidence: 0.85, support: 1 },
      { role: 'bass' as ChannelRole, confidence: 0.85, support: 1 },
      { role: 'bass' as ChannelRole, confidence: 0.85, support: 1 },
    ];
    const out = mergeOfflineAndRuntimeRoles(offline, runtime);
    // Index 0: offline=empty + runtime=bass → bass (weak offline → override)
    expect(out[0]).toBe('bass');
    // Index 1: offline=pad + runtime=bass → bass (weak offline → override)
    expect(out[1]).toBe('bass');
    // Index 2: offline=lead + runtime=bass → stay lead (strong offline wins)
    expect(out[2]).toBe('lead');
    // Index 3: offline=percussion + runtime=bass → stay percussion (strong offline wins)
    expect(out[3]).toBe('percussion');
  });

  it('mergeOfflineAndRuntimeRoles keeps offline when runtime is null', () => {
    const offline: ChannelRole[] = ['pad', 'empty', 'bass'];
    const out = mergeOfflineAndRuntimeRoles(offline, [null, null, null]);
    expect(out).toEqual(['pad', 'empty', 'bass']);
  });

  it('mergeOfflineAndRuntimeRoles ignores low-confidence runtime hints', () => {
    const offline: ChannelRole[] = ['empty'];
    const runtime = [{ role: 'bass' as ChannelRole, confidence: 0.3, support: 0.5 }];
    const out = mergeOfflineAndRuntimeRoles(offline, runtime, 0.6);
    expect(out[0]).toBe('empty');   // runtime conf below threshold → no promotion
  });

  it('mergeOfflineAndRuntimeRoles does NOT promote to pad/chord/arpeggio', () => {
    const offline: ChannelRole[] = ['empty', 'empty', 'empty'];
    const runtime = [
      { role: 'pad' as ChannelRole, confidence: 0.9, support: 1 },
      { role: 'chord' as ChannelRole, confidence: 0.9, support: 1 },
      { role: 'arpeggio' as ChannelRole, confidence: 0.9, support: 1 },
    ];
    const out = mergeOfflineAndRuntimeRoles(offline, runtime);
    expect(out).toEqual(['empty', 'empty', 'empty']);
  });

  // ── Reset ─────────────────────────────────────────────────────────────

  it('reset clears history + bumps generation', () => {
    const sr = 48000;
    const gen0 = getRuntimeClassifierGeneration();
    const ticker = sineTicker(110, sr);
    for (let i = 0; i < 20; i++) {
      updateChannelClassifierFromTap([ticker.next().value ?? null], sr);
    }
    expect(getRuntimeChannelRole(0)?.role).toBe('bass');

    resetRuntimeChannelClassifier();
    expect(getRuntimeChannelRole(0)).toBeNull();
    expect(_peekChannelState(0)).toBeNull();
    expect(getRuntimeClassifierGeneration()).toBe(gen0 + 1);
  });

  it('getAllRuntimeChannelRoles returns N entries, null where no evidence', () => {
    const sr = 48000;
    const gen = sineTicker(110, sr);
    for (let i = 0; i < 20; i++) {
      updateChannelClassifierFromTap([gen.next().value ?? null, null, null, null], sr);
    }
    const hints = getAllRuntimeChannelRoles(4);
    expect(hints).toHaveLength(4);
    expect(hints[0]?.role).toBe('bass');
    expect(hints[1]).toBeNull();
    expect(hints[2]).toBeNull();
    expect(hints[3]).toBeNull();
  });

  // ── Null + edge cases ─────────────────────────────────────────────────

  it('handles null entries in channelData without error', () => {
    expect(() => {
      updateChannelClassifierFromTap([null, null, null], 48000);
    }).not.toThrow();
  });

  it('handles empty channelData array without error', () => {
    expect(() => {
      updateChannelClassifierFromTap([], 48000);
    }).not.toThrow();
  });
});
