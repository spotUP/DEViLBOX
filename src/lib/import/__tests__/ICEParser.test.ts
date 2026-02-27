/**
 * ICEParser Tests
 *
 * API:
 *   isICEFormat(buffer: ArrayBuffer): boolean
 *
 * Magic: "MTN\0" or "IT10" at offset 1464, numOrders (byte 950) in range 1-128.
 * No reference music files found.
 */
import { describe, it, expect } from 'vitest';
import { isICEFormat } from '../formats/ICEParser';

function makeICEBuf(magic: string): ArrayBuffer {
  // Need at least 1468 bytes (magic offset + 4)
  const buf = new Uint8Array(2000);
  const m = magic === 'MTN' ? [0x4D,0x54,0x4E,0x00] : [0x49,0x54,0x31,0x30];
  buf[1464]=m[0]; buf[1465]=m[1]; buf[1466]=m[2]; buf[1467]=m[3];
  buf[950] = 4; // numOrders = 4
  return buf.buffer;
}

describe('isICEFormat', () => {
  it('detects MTN\0 (SoundTracker 2.6) buffer', () => {
    expect(isICEFormat(makeICEBuf('MTN'))).toBe(true);
  });

  it('detects IT10 (Ice Tracker) buffer', () => {
    expect(isICEFormat(makeICEBuf('IT10'))).toBe(true);
  });

  it('rejects an all-zero buffer', () => {
    expect(isICEFormat(new ArrayBuffer(2000))).toBe(false);
  });

  it('rejects a too-short buffer', () => {
    expect(isICEFormat(new ArrayBuffer(100))).toBe(false);
  });

  it('rejects when numOrders is 0', () => {
    const buf = new Uint8Array(makeICEBuf('MTN'));
    buf[950] = 0;
    expect(isICEFormat(buf.buffer)).toBe(false);
  });

  it('rejects when numOrders > 128', () => {
    const buf = new Uint8Array(makeICEBuf('IT10'));
    buf[950] = 200;
    expect(isICEFormat(buf.buffer)).toBe(false);
  });
});
