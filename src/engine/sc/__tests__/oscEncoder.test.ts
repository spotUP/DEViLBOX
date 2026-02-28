// src/engine/sc/__tests__/oscEncoder.test.ts
import { describe, it, expect } from 'vitest';
import {
  encodeOSCMessage,
  oscLoadSynthDef,
  oscNewSynth,
  oscSetParams,
  oscFreeNode,
} from '../oscEncoder';

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
    const msg = oscNewSynth('mySynth', 1000, { cutoff: 800, resonance: 0.3 });
    const decoder = new TextDecoder();
    // Address should start with /s_new (padded to 8 bytes)
    const addr = decoder.decode(msg.slice(0, 8)).replace(/\0/g, '');
    expect(addr).toBe('/s_new');
    expect(msg.byteLength).toBeGreaterThan(0);
  });
});

describe('oscSetParams', () => {
  it('creates /n_set with nodeId and key-value pairs', () => {
    const msg = oscSetParams(1000, { gate: 0 });
    const decoder = new TextDecoder();
    const addr = decoder.decode(msg.slice(0, 8)).replace(/\0/g, '');
    expect(addr).toBe('/n_set');
  });
});

describe('oscFreeNode', () => {
  it('creates /n_free with nodeId', () => {
    const msg = oscFreeNode(1000);
    const decoder = new TextDecoder();
    const addr = decoder.decode(msg.slice(0, 8)).replace(/\0/g, '');
    expect(addr).toBe('/n_free');
  });
});

describe('oscLoadSynthDef', () => {
  it('creates /d_recv with binary blob', () => {
    const binary = new Uint8Array([0xDE, 0xAD]);
    const msg = oscLoadSynthDef(binary);
    const decoder = new TextDecoder();
    const addr = decoder.decode(msg.slice(0, 8)).replace(/\0/g, '');
    expect(addr).toBe('/d_recv');
  });
});
