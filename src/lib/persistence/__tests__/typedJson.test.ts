import { describe, it, expect } from 'vitest';
import { toTypedJson, fromTypedJson } from '../typedJson';

describe('typedJson ArrayBuffer', () => {
  const bytes = [0, 1, 2, 250, 255, 7];
  const makeBuf = () => new Uint8Array(bytes).buffer as ArrayBuffer;

  it('round-trips an ArrayBuffer through JSON text', () => {
    const text = JSON.stringify(toTypedJson({ a: { patchData: makeBuf() } }));
    const back = fromTypedJson<{ a: { patchData: ArrayBuffer } }>(JSON.parse(text));
    expect(back.a.patchData).toBeInstanceOf(ArrayBuffer);
    expect(Array.from(new Uint8Array(back.a.patchData))).toEqual(bytes);
  });

  it('passes ArrayBuffers and views (structured-clone data) through unchanged', () => {
    const buf = makeBuf();
    const f32 = new Float32Array([1.5, 2.5]);
    const back = fromTypedJson<{ buf: ArrayBuffer; f32: Float32Array }>({ buf, f32 });
    expect(back.buf).toBe(buf);
    expect(back.f32).toBe(f32);
  });

  it('passes untagged plain objects through (old .dbx)', () => {
    expect(fromTypedJson({ a: [1, { b: 'x' }] })).toEqual({ a: [1, { b: 'x' }] });
  });
});
