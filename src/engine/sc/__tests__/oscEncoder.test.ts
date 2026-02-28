// src/engine/sc/__tests__/oscEncoder.test.ts
import { describe, it, expect } from 'vitest';
import {
  encodeOSCMessage,
  oscLoadSynthDef,
  oscNewSynth,
  oscSetParams,
  oscFreeNode,
} from '../oscEncoder';

// ---------------------------------------------------------------------------
// Binary parsing helpers for high-level function tests
// ---------------------------------------------------------------------------

function readString(buf: Uint8Array, offset: number): { value: string; next: number } {
  let end = offset;
  while (end < buf.length && buf[end] !== 0) end++;
  const value = new TextDecoder().decode(buf.slice(offset, end));
  const next = offset + Math.ceil((end - offset + 1) / 4) * 4;
  return { value, next };
}

function readInt32(buf: Uint8Array, offset: number): number {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return view.getInt32(offset, false); // big-endian
}

function readFloat32(buf: Uint8Array, offset: number): number {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return view.getFloat32(offset, false); // big-endian
}

describe('encodeOSCMessage', () => {
  it('encodes address string padded to 4 bytes', () => {
    const msg = encodeOSCMessage('/a', []);
    // "/a\0\0" = 4 bytes, ",\0\0\0" = 4 bytes
    expect(msg.byteLength).toBe(8);
    expect(msg[0]).toBe(0x2f); // '/'
    expect(msg[1]).toBe(0x61); // 'a'
    expect(msg[2]).toBe(0);    // null terminator
    expect(msg[3]).toBe(0);    // padding
  });

  it('encodes int32 argument in big-endian', () => {
    const msg = encodeOSCMessage('/x', [{ type: 'i', value: 42 }]);
    const view = new DataView(msg.buffer);
    // Address "/x\0\0": 4 bytes, type tag ",i\0\0": 4 bytes, then int32
    const intVal = view.getInt32(8, false); // big-endian
    expect(intVal).toBe(42);
  });

  it('encodes float32 argument in big-endian', () => {
    const msg = encodeOSCMessage('/x', [{ type: 'f', value: 440.0 }]);
    const view = new DataView(msg.buffer);
    const fVal = view.getFloat32(8, false);
    expect(fVal).toBeCloseTo(440.0, 1);
  });

  it('encodes string argument padded to 4 bytes', () => {
    const msg = encodeOSCMessage('/x', [{ type: 's', value: 'hi' }]);
    // "hi\0\0" = 4 bytes
    expect(msg[8]).toBe(0x68); // 'h'
    expect(msg[9]).toBe(0x69); // 'i'
    expect(msg[10]).toBe(0);
    expect(msg[11]).toBe(0);
  });

  it('encodes blob with 4-byte size prefix padded to 4 bytes', () => {
    const data = new Uint8Array([1, 2, 3]);
    const msg = encodeOSCMessage('/x', [{ type: 'b', value: data }]);
    const view = new DataView(msg.buffer);
    // After address+type tag: int32 length = 3, then [1,2,3,0] padded
    const blobLen = view.getInt32(8, false);
    expect(blobLen).toBe(3);
    expect(msg[12]).toBe(1);
    expect(msg[13]).toBe(2);
    expect(msg[14]).toBe(3);
  });
});

describe('oscNewSynth', () => {
  it('creates /s_new with defName, nodeId, addAction=0, group=0, then key-value pairs', () => {
    const msg = oscNewSynth('mySynth', 1001, { cutoff: 800, resonance: 0.3 });

    // --- Address ---
    const addr = readString(msg, 0);
    expect(addr.value).toBe('/s_new');

    // --- Type tag string ---
    // Args: s(defName) i(nodeId) i(addAction) i(targetId) s(key) f(val) s(key) f(val)
    // Expected tag: ",siiisfsf"
    const typeTag = readString(msg, addr.next);
    expect(typeTag.value).toBe(',siiisfsf');

    // --- Arguments ---
    let offset = typeTag.next;

    // defName: string 'mySynth'
    const defNameArg = readString(msg, offset);
    expect(defNameArg.value).toBe('mySynth');
    offset = defNameArg.next;

    // nodeId: int32 = 1001
    expect(readInt32(msg, offset)).toBe(1001);
    offset += 4;

    // addAction: int32 = 0
    expect(readInt32(msg, offset)).toBe(0);
    offset += 4;

    // targetId (root group): int32 = 0
    expect(readInt32(msg, offset)).toBe(0);
    offset += 4;

    // key 'cutoff': string
    const cutoffKey = readString(msg, offset);
    expect(cutoffKey.value).toBe('cutoff');
    offset = cutoffKey.next;

    // value 800.0: float32
    expect(readFloat32(msg, offset)).toBeCloseTo(800.0, 1);
    offset += 4;

    // key 'resonance': string
    const resonanceKey = readString(msg, offset);
    expect(resonanceKey.value).toBe('resonance');
    offset = resonanceKey.next;

    // value 0.3: float32
    expect(readFloat32(msg, offset)).toBeCloseTo(0.3, 5);
  });
});

describe('oscSetParams', () => {
  it('creates /n_set with nodeId and key-value pairs for two params', () => {
    const msg = oscSetParams(42, { freq: 440.0, amp: 0.75 });

    // --- Address ---
    const addr = readString(msg, 0);
    expect(addr.value).toBe('/n_set');

    // --- Type tag string ---
    // Args: i(nodeId) s(key) f(val) s(key) f(val) → ",isfsf"
    const typeTag = readString(msg, addr.next);
    expect(typeTag.value).toBe(',isfsf');

    // --- Arguments ---
    let offset = typeTag.next;

    // nodeId: int32 = 42
    expect(readInt32(msg, offset)).toBe(42);
    offset += 4;

    // key 'freq': string
    const freqKey = readString(msg, offset);
    expect(freqKey.value).toBe('freq');
    offset = freqKey.next;

    // value 440.0: float32
    expect(readFloat32(msg, offset)).toBeCloseTo(440.0, 1);
    offset += 4;

    // key 'amp': string
    const ampKey = readString(msg, offset);
    expect(ampKey.value).toBe('amp');
    offset = ampKey.next;

    // value 0.75: float32
    expect(readFloat32(msg, offset)).toBeCloseTo(0.75, 5);
  });
});

describe('oscFreeNode', () => {
  it('creates /n_free with nodeId as int32', () => {
    const msg = oscFreeNode(99);

    // --- Address ---
    const addr = readString(msg, 0);
    expect(addr.value).toBe('/n_free');

    // --- Type tag string ---
    // Args: i(nodeId) → ",i"
    const typeTag = readString(msg, addr.next);
    expect(typeTag.value).toBe(',i');

    // --- Arguments ---
    const offset = typeTag.next;

    // nodeId: int32 = 99
    expect(readInt32(msg, offset)).toBe(99);
  });
});

describe('oscLoadSynthDef', () => {
  it('creates /d_recv with binary blob including 4-byte big-endian length prefix', () => {
    const binary = new Uint8Array([0x53, 0x43, 0x67, 0x66]); // "SCgf"
    const msg = oscLoadSynthDef(binary);

    // --- Address ---
    const addr = readString(msg, 0);
    expect(addr.value).toBe('/d_recv');

    // --- Type tag string ---
    // Args: b(blob) → ",b"
    const typeTag = readString(msg, addr.next);
    expect(typeTag.value).toBe(',b');

    // --- Blob argument ---
    let offset = typeTag.next;

    // 4-byte big-endian length prefix = 4 (the blob is 4 bytes)
    expect(readInt32(msg, offset)).toBe(4);
    offset += 4;

    // Blob data: "SCgf"
    expect(msg[offset]).toBe(0x53); // 'S'
    expect(msg[offset + 1]).toBe(0x43); // 'C'
    expect(msg[offset + 2]).toBe(0x67); // 'g'
    expect(msg[offset + 3]).toBe(0x66); // 'f'
  });
});
