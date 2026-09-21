/**
 * Reverse, Backward and Throw were dead, and the log said they were fine.
 *
 * Reported 2026-09-21 on every engine. The console looked healthy:
 *
 *     backwardReverb ▶ captureDur=0.8s
 *     backwardReverb snapshot received — frames=38400
 *
 * 38400 frames is exactly 0.8s at 48kHz, so the ring was the right SIZE. It was
 * full of zeros. The guard was `if (!frames)`, which tests the ring's length,
 * not whether anything is in it, so a capture of pure silence passed it and the
 * move played that silence back. Adding a peak check turned the same click into:
 *
 *     snapshot received — frames=38400 peak=0.00001
 *     abort — captured SILENCE (peak=7.51e-6); nothing is reaching bus.input
 *
 * The cause underneath: `rebuildDubConnections` decides which channels to
 * reconnect from `channelDubSendValues`, the ENGINE's own copy of the sends,
 * skipping any that are zero. The mixer store's values survive a song load; that
 * array does not. So a session whose sends were already up got an engine that
 * believed every send was zero, no channel tap opened, and `bus.input` stayed
 * silent — invisible to moves that generate their own sound, fatal to the three
 * that capture.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');
const BUS = read('engine/dub/DubBus.ts');
const ROUTED = read('engine/tone/ChannelRoutedEffects.ts');

describe('a capture knows whether it caught anything', () => {
  it('measures the captured peak, not only the frame count', () => {
    expect(BUS).toContain('function capturedPeak(');
    expect(BUS).toContain('CAPTURE_SILENCE_PEAK');
  });

  it('checks both capture moves, not just the one that was reported', () => {
    for (const move of ['backwardReverb', 'reverseEcho']) {
      const at = BUS.indexOf(`[DubBus] ${move} snapshot received`);
      expect(at, `${move} capture log not found`).toBeGreaterThan(-1);
      // The silence check must sit with the snapshot, before playback is set up.
      const region = BUS.slice(at, at + 900);
      expect(region, move).toContain('capPeak < CAPTURE_SILENCE_PEAK');
      expect(region, move).toContain('captured SILENCE');
    }
  });

  it('says where the audio is missing, rather than only that it is', () => {
    // "nothing is reaching bus.input" is the sentence that made the cause
    // findable; a bare "silent" would have sent the next person back to the
    // move's own gain staging.
    expect(BUS).toContain('nothing is reaching bus.input');
  });

  it('reports the peak in the success line too', () => {
    // So a quiet-but-not-silent capture is distinguishable from a healthy one
    // without adding another log.
    expect(BUS).toMatch(/snapshot received — frames=\$\{frames\} peak=/);
  });
});

describe('the engine takes the sends from the store, not from its own memory', () => {
  it('seeds the send values before deciding what to reconnect', () => {
    const at = ROUTED.indexOf('async rebuildDubConnections');
    expect(at).toBeGreaterThan(-1);
    const body = ROUTED.slice(at, at + 3000);
    const seed = body.indexOf('useMixerStore');
    const guard = body.indexOf('channelDubSendValues[ch] <= 0');
    expect(seed, 'store is never consulted').toBeGreaterThan(-1);
    expect(guard, 'reconnect guard not found').toBeGreaterThan(-1);
    // Order matters: seeding after the guard would change nothing at all.
    expect(seed).toBeLessThan(guard);
  });

  it('does not overwrite a send the engine already holds', () => {
    // The engine's value is the live one while a move is holding a channel
    // open; the store is only the resting position.
    const at = ROUTED.indexOf('async rebuildDubConnections');
    const body = ROUTED.slice(at, at + 3000);
    expect(body).toContain('this.channelDubSendValues[ch] <= 0');
  });

  it('survives the store being unavailable', () => {
    const at = ROUTED.indexOf('async rebuildDubConnections');
    const body = ROUTED.slice(at, at + 3000);
    expect(body).toMatch(/catch\s*\{[^}]*store unavailable/);
  });
});
