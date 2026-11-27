import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { knobAngleY, faderOffset, dragToValue, KNOB_SWEEP } from '../control3DMapping';

describe('DJ 3D control mapping', () => {
  it('knob turns clockwise (seen from above) as the value rises', () => {
    expect(knobAngleY(0, -24, 6)).toBeCloseTo((0.5 - 0.8) * KNOB_SWEEP); // -24..6 at 0 = 80% of travel
    expect(knobAngleY(0.5, 0, 1)).toBeCloseTo(0); // mid = pointer at 12 o'clock
    // Pointer at 12 o'clock is -Z. Just above mid it must lean right (+X).
    const pointer = new THREE.Vector3(0, 0, -1).applyMatrix4(new THREE.Matrix4().makeRotationY(knobAngleY(0.6, 0, 1)));
    expect(pointer.x).toBeGreaterThan(0);
    // Minimum sits at 7 o'clock: left (-X) and toward the front (+Z).
    const atMin = new THREE.Vector3(0, 0, -1).applyMatrix4(new THREE.Matrix4().makeRotationY(knobAngleY(0, 0, 1)));
    expect(atMin.x).toBeLessThan(0);
    expect(atMin.z).toBeGreaterThan(0);
    expect(knobAngleY(99, 0, 1)).toBeCloseTo(-KNOB_SWEEP / 2); // clamped
  });

  it('channel fader: louder = toward the back (-Z), model rests at maximum', () => {
    const ch = { min: 0, max: 1.5, restValue: 1.5, travel: -5 };
    expect(faderOffset(1.5, ch)).toBeCloseTo(0);
    expect(faderOffset(0, ch)).toBeCloseTo(5); // silent = front end of the slot
    expect(faderOffset(1, ch)).toBeLessThan(faderOffset(0.5, ch));
  });

  it('crossfader: 0 = left (deck 1), 1 = right (deck 2)', () => {
    const xf = { min: 0, max: 1, restValue: 0.646, travel: 5 };
    expect(faderOffset(0, xf)).toBeLessThan(0);
    expect(faderOffset(1, xf)).toBeGreaterThan(0);
    expect(faderOffset(1, xf) - faderOffset(0, xf)).toBeCloseTo(5);
  });

  it('pitch fader matches the 2D slider: higher pitch = toward the back (-Z)', () => {
    const pitch = { min: -8, max: 8, restValue: 0, travel: -8 };
    expect(faderOffset(8, pitch)).toBeCloseTo(-4);
    expect(faderOffset(-8, pitch)).toBeCloseTo(4);
    expect(faderOffset(0, pitch)).toBeCloseTo(0);
  });

  it('dragging up or right raises the value and clamps', () => {
    expect(dragToValue(0.5, 75, 0, 1)).toBeCloseTo(1);
    expect(dragToValue(0.5, -30, 0, 1)).toBeCloseTo(0.3);
    expect(dragToValue(0, 60, -8, 8, 240)).toBeCloseTo(4);
    expect(dragToValue(0.9, 500, 0, 1)).toBe(1);
  });
});
