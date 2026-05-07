import { describe, expect, it } from 'vitest';
import { KONTAKT_BRIDGE_MAGIC, parseKontaktAudioFrame } from '@engine/kontakt/protocol';

function buildFrame(left: number[], right: number[]): ArrayBuffer {
  const sampleCount = left.length;
  const buffer = new ArrayBuffer(8 + sampleCount * 4 * 2);
  const view = new DataView(buffer);
  view.setUint32(0, KONTAKT_BRIDGE_MAGIC, true);
  view.setUint32(4, sampleCount, true);
  const payload = new Float32Array(buffer, 8, sampleCount * 2);
  payload.set(left, 0);
  payload.set(right, sampleCount);
  return buffer;
}

describe('parseKontaktAudioFrame', () => {
  it('parses kontakt bridge stereo frames', () => {
    const frame = parseKontaktAudioFrame(buildFrame([0.25, -0.5], [0.75, 0.125]));

    expect(frame).not.toBeNull();
    expect(frame?.sampleCount).toBe(2);
    expect(Array.from(frame?.left ?? [])).toEqual([0.25, -0.5]);
    expect(Array.from(frame?.right ?? [])).toEqual([0.75, 0.125]);
  });

  it('rejects frames with the wrong magic number', () => {
    const buffer = buildFrame([0], [0]);
    new DataView(buffer).setUint32(0, 0x12345678, true);

    expect(parseKontaktAudioFrame(buffer)).toBeNull();
  });

  it('rejects truncated stereo payloads', () => {
    const buffer = buildFrame([0.5, 0.25], [0.125, 0.75]).slice(0, 12);

    expect(parseKontaktAudioFrame(buffer)).toBeNull();
  });
});
