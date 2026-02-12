/**
 * Minimal MessagePack Encoder/Decoder
 *
 * Implements just enough of the msgpack spec for NKS .nksf file format:
 * - nil, bool, int (positive/negative), float64, string, array, map
 *
 * Reference: https://github.com/msgpack/msgpack/blob/master/spec.md
 */

// ============================================================================
// Encoder
// ============================================================================

class MsgpackEncoder {
  private buffer: number[] = [];

  encode(value: unknown): Uint8Array {
    this.buffer = [];
    this.writeValue(value);
    return new Uint8Array(this.buffer);
  }

  private writeValue(value: unknown): void {
    if (value === null || value === undefined) {
      this.buffer.push(0xc0); // nil
    } else if (typeof value === 'boolean') {
      this.buffer.push(value ? 0xc3 : 0xc2);
    } else if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        this.writeInt(value);
      } else {
        this.writeFloat64(value);
      }
    } else if (typeof value === 'string') {
      this.writeString(value);
    } else if (Array.isArray(value)) {
      this.writeArray(value);
    } else if (typeof value === 'object') {
      this.writeMap(value as Record<string, unknown>);
    }
  }

  private writeInt(value: number): void {
    if (value >= 0) {
      if (value <= 0x7f) {
        // positive fixint
        this.buffer.push(value);
      } else if (value <= 0xff) {
        this.buffer.push(0xcc, value);
      } else if (value <= 0xffff) {
        this.buffer.push(0xcd, (value >> 8) & 0xff, value & 0xff);
      } else {
        this.buffer.push(0xce,
          (value >> 24) & 0xff, (value >> 16) & 0xff,
          (value >> 8) & 0xff, value & 0xff);
      }
    } else {
      if (value >= -32) {
        // negative fixint
        this.buffer.push(value & 0xff);
      } else if (value >= -128) {
        this.buffer.push(0xd0, value & 0xff);
      } else if (value >= -32768) {
        this.buffer.push(0xd1, (value >> 8) & 0xff, value & 0xff);
      } else {
        this.buffer.push(0xd2,
          (value >> 24) & 0xff, (value >> 16) & 0xff,
          (value >> 8) & 0xff, value & 0xff);
      }
    }
  }

  private writeFloat64(value: number): void {
    this.buffer.push(0xcb);
    const buf = new ArrayBuffer(8);
    new DataView(buf).setFloat64(0, value, false); // big-endian
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < 8; i++) this.buffer.push(bytes[i]);
  }

  private writeString(value: string): void {
    const encoded = new TextEncoder().encode(value);
    const len = encoded.length;
    if (len <= 31) {
      this.buffer.push(0xa0 | len); // fixstr
    } else if (len <= 0xff) {
      this.buffer.push(0xd9, len);
    } else if (len <= 0xffff) {
      this.buffer.push(0xda, (len >> 8) & 0xff, len & 0xff);
    } else {
      this.buffer.push(0xdb,
        (len >> 24) & 0xff, (len >> 16) & 0xff,
        (len >> 8) & 0xff, len & 0xff);
    }
    for (let i = 0; i < len; i++) this.buffer.push(encoded[i]);
  }

  private writeArray(value: unknown[]): void {
    const len = value.length;
    if (len <= 15) {
      this.buffer.push(0x90 | len); // fixarray
    } else if (len <= 0xffff) {
      this.buffer.push(0xdc, (len >> 8) & 0xff, len & 0xff);
    } else {
      this.buffer.push(0xdd,
        (len >> 24) & 0xff, (len >> 16) & 0xff,
        (len >> 8) & 0xff, len & 0xff);
    }
    for (const item of value) {
      this.writeValue(item);
    }
  }

  private writeMap(value: Record<string, unknown>): void {
    const keys = Object.keys(value);
    const len = keys.length;
    if (len <= 15) {
      this.buffer.push(0x80 | len); // fixmap
    } else if (len <= 0xffff) {
      this.buffer.push(0xde, (len >> 8) & 0xff, len & 0xff);
    } else {
      this.buffer.push(0xdf,
        (len >> 24) & 0xff, (len >> 16) & 0xff,
        (len >> 8) & 0xff, len & 0xff);
    }
    for (const key of keys) {
      this.writeString(key);
      this.writeValue(value[key]);
    }
  }
}

// ============================================================================
// Decoder
// ============================================================================

class MsgpackDecoder {
  private data!: Uint8Array;
  private view!: DataView;
  private offset = 0;

  decode(data: Uint8Array): unknown {
    this.data = data;
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    this.offset = 0;
    return this.readValue();
  }

  private readValue(): unknown {
    if (this.offset >= this.data.length) return null;

    const byte = this.data[this.offset++];

    // positive fixint (0x00 - 0x7f)
    if (byte <= 0x7f) return byte;

    // fixmap (0x80 - 0x8f)
    if (byte >= 0x80 && byte <= 0x8f) return this.readMapEntries(byte & 0x0f);

    // fixarray (0x90 - 0x9f)
    if (byte >= 0x90 && byte <= 0x9f) return this.readArrayEntries(byte & 0x0f);

    // fixstr (0xa0 - 0xbf)
    if (byte >= 0xa0 && byte <= 0xbf) return this.readStringBytes(byte & 0x1f);

    // negative fixint (0xe0 - 0xff)
    if (byte >= 0xe0) return byte - 256;

    switch (byte) {
      case 0xc0: return null;       // nil
      case 0xc2: return false;      // false
      case 0xc3: return true;       // true

      // float 32
      case 0xca: {
        const val = this.view.getFloat32(this.offset, false);
        this.offset += 4;
        return val;
      }

      // float 64
      case 0xcb: {
        const val = this.view.getFloat64(this.offset, false);
        this.offset += 8;
        return val;
      }

      // uint 8
      case 0xcc: return this.data[this.offset++];

      // uint 16
      case 0xcd: {
        const val = this.view.getUint16(this.offset, false);
        this.offset += 2;
        return val;
      }

      // uint 32
      case 0xce: {
        const val = this.view.getUint32(this.offset, false);
        this.offset += 4;
        return val;
      }

      // int 8
      case 0xd0: {
        const val = this.view.getInt8(this.offset);
        this.offset += 1;
        return val;
      }

      // int 16
      case 0xd1: {
        const val = this.view.getInt16(this.offset, false);
        this.offset += 2;
        return val;
      }

      // int 32
      case 0xd2: {
        const val = this.view.getInt32(this.offset, false);
        this.offset += 4;
        return val;
      }

      // str 8
      case 0xd9: {
        const len = this.data[this.offset++];
        return this.readStringBytes(len);
      }

      // str 16
      case 0xda: {
        const len = this.view.getUint16(this.offset, false);
        this.offset += 2;
        return this.readStringBytes(len);
      }

      // str 32
      case 0xdb: {
        const len = this.view.getUint32(this.offset, false);
        this.offset += 4;
        return this.readStringBytes(len);
      }

      // array 16
      case 0xdc: {
        const len = this.view.getUint16(this.offset, false);
        this.offset += 2;
        return this.readArrayEntries(len);
      }

      // array 32
      case 0xdd: {
        const len = this.view.getUint32(this.offset, false);
        this.offset += 4;
        return this.readArrayEntries(len);
      }

      // map 16
      case 0xde: {
        const len = this.view.getUint16(this.offset, false);
        this.offset += 2;
        return this.readMapEntries(len);
      }

      // map 32
      case 0xdf: {
        const len = this.view.getUint32(this.offset, false);
        this.offset += 4;
        return this.readMapEntries(len);
      }

      // bin 8
      case 0xc4: {
        const len = this.data[this.offset++];
        return this.readBinaryBytes(len);
      }

      // bin 16
      case 0xc5: {
        const len = this.view.getUint16(this.offset, false);
        this.offset += 2;
        return this.readBinaryBytes(len);
      }

      // bin 32
      case 0xc6: {
        const len = this.view.getUint32(this.offset, false);
        this.offset += 4;
        return this.readBinaryBytes(len);
      }

      default:
        console.warn(`[msgpack] Unknown type byte: 0x${byte.toString(16)}`);
        return null;
    }
  }

  private readStringBytes(length: number): string {
    const bytes = this.data.subarray(this.offset, this.offset + length);
    this.offset += length;
    return new TextDecoder().decode(bytes);
  }

  private readBinaryBytes(length: number): Uint8Array {
    const bytes = this.data.slice(this.offset, this.offset + length);
    this.offset += length;
    return bytes;
  }

  private readArrayEntries(count: number): unknown[] {
    const result: unknown[] = [];
    for (let i = 0; i < count; i++) {
      result.push(this.readValue());
    }
    return result;
  }

  private readMapEntries(count: number): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (let i = 0; i < count; i++) {
      const key = String(this.readValue());
      result[key] = this.readValue();
    }
    return result;
  }
}

// ============================================================================
// Public API
// ============================================================================

const encoder = new MsgpackEncoder();
const decoder = new MsgpackDecoder();

/** Encode a JS value to msgpack binary format */
export function msgpackEncode(value: unknown): Uint8Array {
  return encoder.encode(value);
}

/** Decode msgpack binary data to a JS value */
export function msgpackDecode(data: Uint8Array): unknown {
  return decoder.decode(data);
}
