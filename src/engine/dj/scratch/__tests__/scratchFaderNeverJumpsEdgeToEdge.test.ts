/**
 * Owner 2026-10-14: "the auto scratch fader does hard jumps to the left/right edges - not humanly possible".
 * The Deck C fader lane drew the stroke's GAIN, which a battle fader switches inside its 3 % cut-in zone in
 * 1-3 ms (the demo's click-safe ramp), so the lane teleported edge to edge in about 1 ms. The hand's position is
 * now its own track from the same fader spans (`faderPositionFromPattern`): it crosses the cut-in zone while the
 * gain ramps and keeps that speed over the whole throw (ramp / cut-in = 33 ms at velocity 1, 100 ms at 0).
 *
 * Driven through the demo's stroke renderer (`renderGesture`, what the voice pool renders) and the Deck C motion
 * timeline (`DeckCMotion.sampleAt`, what the fader lane reads every frame).
 */
import { describe, expect, it } from 'vitest';
import { DEMO_GESTURES, DEMO_RATE, demoGestureSteps, renderGesture, type DemoSource } from '../scratchRender';
import { DeckCMotion } from '../deckCMotion';

/** Fastest human full throw allowed: the velocity-1 hand (1 ms ramp across a 3 % cut-in = 33.3 ms). */
const MIN_THROW_MS = 33;
const SAMPLES_PER_MS = DEMO_RATE / 1000;

function source(): DemoSource {
  const n = 3 * DEMO_RATE;
  const sig = new Float64Array(n);
  let x = 12345;
  for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; sig[i] = (x / 0x7fffffff) * 2 - 1; }
  return { sig, anchor: DEMO_RATE, safe: [0, n - 1] };
}

describe('scratch fader travel', () => {
  it('scratch fader never jumps edge to edge faster than a human hand', () => {
    const src = source();
    const stepSec = 60 / (92 * 4);
    const motion = new DeckCMotion();
    let at = 0;
    const strokes: Array<{ name: string; start: number; end: number }> = [];
    for (const name of Object.keys(DEMO_GESTURES)) {
      for (const velocity of [1, 0]) {
        const r = renderGesture(src, name, demoGestureSteps(name) * stepSec, DEMO_RATE, { velocity, seed: 0 });
        motion.addStroke(at, r.viz);
        strokes.push({ name: `${name} v${velocity}`, start: at, end: at + r.viz.fade.length });
        at += r.viz.fade.length + DEMO_RATE / 10;
      }
    }
    motion.addNeedle(at, DEMO_RATE / 2);
    strokes.push({ name: 'needle', start: at, end: at + DEMO_RATE / 2 });
    at += DEMO_RATE;

    const lane = new Float64Array(at);
    const gain = new Float64Array(at);
    for (let s = 0; s < at; s++) { const m = motion.sampleAt(s); lane[s] = m.position; gain[s] = m.fade; }

    // the fastest lane move over any 1 ms, per stroke
    const lag = Math.round(SAMPLES_PER_MS);
    let worst = { name: '', perMs: 0 };
    for (const st of strokes) {
      for (let s = Math.max(lag, st.start); s < Math.min(at, st.end + lag); s++) {
        const d = Math.abs(lane[s]! - lane[s - lag]!);
        if (d > worst.perMs) worst = { name: st.name, perMs: d };
      }
    }
    expect(worst.perMs, `fastest 1 ms move: ${worst.name}`).toBeLessThanOrEqual(1 / MIN_THROW_MS);

    // the hand still travels: open strokes reach the open edge, and it is at the closed edge wherever the gain is cut
    for (const st of strokes) {
      let peak = 0;
      for (let s = st.start; s < st.end; s++) peak = Math.max(peak, lane[s]!);
      if (st.name.startsWith('baby ') || st.name === 'needle') expect(peak, st.name).toBeGreaterThan(0.99);
    }
    for (let s = 0; s < at; s++) if (gain[s] === 0) expect(lane[s], `sample ${s}`).toBeLessThan(0.05);
  }, 60_000);
});
