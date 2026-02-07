/**
 * BinaryWriter - Utility for writing binary data to an ArrayBuffer
 * Counterpart to BinaryReader for export operations
 */
export class BinaryWriter {
  private buffer: ArrayBuffer;
  private view: DataView;
  private offset: number = 0;
  private capacity: number;

  constructor(initialCapacity: number = 1024 * 1024) {
    this.capacity = initialCapacity;
    this.buffer = new ArrayBuffer(this.capacity);
    this.view = new DataView(this.buffer);
  }

  private ensureCapacity(additionalBytes: number): void {
    const required = this.offset + additionalBytes;
    if (required > this.capacity) {
      // Double capacity or use required size, whichever is larger
      const newCapacity = Math.max(this.capacity * 2, required);
      const newBuffer = new ArrayBuffer(newCapacity);
      new Uint8Array(newBuffer).set(new Uint8Array(this.buffer, 0, this.offset));
      this.buffer = newBuffer;
      this.view = new DataView(this.buffer);
      this.capacity = newCapacity;
    }
  }

  getOffset(): number {
    return this.offset;
  }

  setOffset(offset: number): void {
    this.offset = offset;
  }

  seek(offset: number): void {
    this.offset = offset;
  }

  skip(bytes: number): void {
    this.ensureCapacity(bytes);
    this.offset += bytes;
  }

  writeUint8(value: number): void {
    this.ensureCapacity(1);
    this.view.setUint8(this.offset, value & 0xFF);
    this.offset += 1;
  }

  writeInt8(value: number): void {
    this.ensureCapacity(1);
    this.view.setInt8(this.offset, value);
    this.offset += 1;
  }

  writeUint16(value: number, littleEndian: boolean = true): void {
    this.ensureCapacity(2);
    this.view.setUint16(this.offset, value & 0xFFFF, littleEndian);
    this.offset += 2;
  }

  writeInt16(value: number, littleEndian: boolean = true): void {
    this.ensureCapacity(2);
    this.view.setInt16(this.offset, value, littleEndian);
    this.offset += 2;
  }

  writeUint32(value: number, littleEndian: boolean = true): void {
    this.ensureCapacity(4);
    this.view.setUint32(this.offset, value >>> 0, littleEndian);
    this.offset += 4;
  }

  writeInt32(value: number, littleEndian: boolean = true): void {
    this.ensureCapacity(4);
    this.view.setInt32(this.offset, value, littleEndian);
    this.offset += 4;
  }

  writeFloat32(value: number, littleEndian: boolean = true): void {
    this.ensureCapacity(4);
    this.view.setFloat32(this.offset, value, littleEndian);
    this.offset += 4;
  }

  writeFloat64(value: number, littleEndian: boolean = true): void {
    this.ensureCapacity(8);
    this.view.setFloat64(this.offset, value, littleEndian);
    this.offset += 8;
  }

  /**
   * Write a fixed-length string, padding with zeros if shorter
   */
  writeString(str: string, fixedLength?: number): void {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    const length = fixedLength ?? bytes.length;
    this.ensureCapacity(length);

    const target = new Uint8Array(this.buffer, this.offset, length);
    target.fill(0);
    target.set(bytes.slice(0, length));
    this.offset += length;
  }

  /**
   * Write a null-terminated string
   */
  writeNullTerminatedString(str: string): void {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    this.ensureCapacity(bytes.length + 1);

    new Uint8Array(this.buffer, this.offset, bytes.length).set(bytes);
    this.offset += bytes.length;
    this.view.setUint8(this.offset, 0);
    this.offset += 1;
  }

  /**
   * Write a string prefixed with its length (1 byte length prefix)
   */
  writePrefixedString(str: string): void {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    const length = Math.min(bytes.length, 255);
    this.ensureCapacity(length + 1);

    this.view.setUint8(this.offset, length);
    this.offset += 1;
    new Uint8Array(this.buffer, this.offset, length).set(bytes.slice(0, length));
    this.offset += length;
  }

  /**
   * Write a string prefixed with its length (2 byte length prefix)
   */
  writePrefixedString16(str: string, littleEndian: boolean = true): void {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    const length = Math.min(bytes.length, 65535);
    this.ensureCapacity(length + 2);

    this.view.setUint16(this.offset, length, littleEndian);
    this.offset += 2;
    new Uint8Array(this.buffer, this.offset, length).set(bytes.slice(0, length));
    this.offset += length;
  }

  /**
   * Write a string prefixed with its length (4 byte length prefix)
   */
  writePrefixedString32(str: string, littleEndian: boolean = true): void {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    this.ensureCapacity(bytes.length + 4);

    this.view.setUint32(this.offset, bytes.length, littleEndian);
    this.offset += 4;
    new Uint8Array(this.buffer, this.offset, bytes.length).set(bytes);
    this.offset += bytes.length;
  }

  /**
   * Write raw bytes
   */
  writeBytes(bytes: Uint8Array | number[]): void {
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    this.ensureCapacity(data.length);
    new Uint8Array(this.buffer, this.offset, data.length).set(data);
    this.offset += data.length;
  }

  /**
   * Write a magic string (fixed ASCII characters)
   */
  writeMagic(magic: string): void {
    this.ensureCapacity(magic.length);
    for (let i = 0; i < magic.length; i++) {
      this.view.setUint8(this.offset + i, magic.charCodeAt(i));
    }
    this.offset += magic.length;
  }

  /**
   * Write zeros (padding)
   */
  writeZeros(count: number): void {
    this.ensureCapacity(count);
    new Uint8Array(this.buffer, this.offset, count).fill(0);
    this.offset += count;
  }

  /**
   * Get the written data as a Uint8Array
   */
  getBuffer(): Uint8Array {
    return new Uint8Array(this.buffer, 0, this.offset);
  }

  /**
   * Get the written data as an ArrayBuffer (trimmed to actual size)
   */
  getArrayBuffer(): ArrayBuffer {
    return this.buffer.slice(0, this.offset);
  }

  /**
   * Get the current size of written data
   */
  getSize(): number {
    return this.offset;
  }

  /**
   * Reset the writer to the beginning
   */
  reset(): void {
    this.offset = 0;
  }

  /**
   * Write at a specific offset without changing current position
   */
  writeUint32At(offset: number, value: number, littleEndian: boolean = true): void {
    this.view.setUint32(offset, value >>> 0, littleEndian);
  }

  writeUint16At(offset: number, value: number, littleEndian: boolean = true): void {
    this.view.setUint16(offset, value & 0xFFFF, littleEndian);
  }

  writeUint8At(offset: number, value: number): void {
    this.view.setUint8(offset, value & 0xFF);
  }
}
