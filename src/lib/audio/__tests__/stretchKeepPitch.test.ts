/**
 * Sample editor Speed with Keep Pitch: the DJ Key Lock stretcher in buffer-playback
 * mode with keepPitchSchedule. Drives the exact worklet files the browser loads,
 * offline in Node, the way stretchKeepPitch drives them in an OfflineAudioContext.
 */
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { PROJECT_ROOT } from '../../../../tools/uade-audit/uadeRenderCore';
import { loadWorklet, settle, RENDER_QUANTUM } from '../../../../tools/keylock/workletHost';
import { STRETCH_CONFIG } from '@engine/dj/DeckKeyLock';
import { keepPitchSchedule } from '../stretchKeepPitch';

const WORKLET_FILES = ['idleWhenBypassed.js', 'SignalsmithStretch.mjs'].map((f) => join(PROJECT_ROOT, 'public/signalsmith-stretch', f));
const SR = 48000;

/** Upward zero crossings per second over [from, to). */
function crossingRate(x: Float32Array, from: number, to: number): number {
  let n = 0;
  for (let i = from + 1; i < to; i++) if (x[i - 1] < 0 && x[i] >= 0) n++;
  return n / ((to - from) / SR);
}

describe('stretchKeepPitch', () => {
  it('stretches a 440 Hz sine 1.5x: length x1.5, pitch within 2%', async () => {
    const factor = 1.5;
    const src = Float32Array.from({ length: SR }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / SR));
    const length = Math.round(src.length * factor);

    const host = loadWorklet(WORKLET_FILES, SR);
    const proc = host.create('signalsmith-stretch', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
    for (let i = 0; i < 200 && !proc.port.received.some((m) => Array.isArray(m) && m[0] === 'ready'); i++) await settle(10);
    proc.port.send([1, 'configure', { ...STRETCH_CONFIG }]);
    proc.port.send([2, 'addBuffers', [src.slice(), src.slice()]]);
    proc.port.send([3, 'schedule', keepPitchSchedule(factor)]);

    const out = new Float32Array(Math.ceil(length / RENDER_QUANTUM) * RENDER_QUANTUM);
    const oL = new Float32Array(RENDER_QUANTUM); const oR = new Float32Array(RENDER_QUANTUM);
    for (let off = 0; off < out.length; off += RENDER_QUANTUM) {
      host.scope.currentFrame = off;
      host.scope.currentTime = off / SR;
      proc.process([], [[oL, oR]], {});
      out.set(oL, off);
    }
    const stretched = out.subarray(0, length);

    expect(stretched.length).toBe(Math.round(SR * 1.5));
    // Middle half: away from the start-up and the buffer end.
    const from = Math.round(length * 0.25); const to = Math.round(length * 0.75);
    let peak = 0; for (let i = from; i < to; i++) peak = Math.max(peak, Math.abs(stretched[i]));
    expect(peak, 'stretcher produced audio').toBeGreaterThan(0.1);
    const rate = crossingRate(stretched, from, to);
    expect(Math.abs(rate - 440) / 440).toBeLessThan(0.02);
  });
});
