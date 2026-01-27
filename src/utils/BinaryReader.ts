/**
 * BinaryReader - Utility for reading binary data from ArrayBuffer/DataView
 */
export class BinaryReader {
  private view: DataView;
  private offset: number = 0;
  private size: number;

  constructor(buffer: ArrayBuffer | DataView) {
    if (buffer instanceof DataView) {
      this.view = buffer;
    } else {
      this.view = new DataView(buffer);
    }
    this.size = this.view.byteLength;
  }

  getOffset(): number {
    return this.offset;
  }

  setOffset(offset: number): void {
    this.offset = offset;
  }

  getSize(): number {
    return this.size;
  }

  seek(offset: number): void {
    this.offset = offset;
  }

  skip(bytes: number): void {
    this.offset += bytes;
  }

  isEOF(): boolean {
    return this.offset >= this.size;
  }

  readUint8(): number {
    const val = this.view.getUint8(this.offset);
    this.offset += 1;
    return val;
  }

  readInt8(): number {
    const val = this.view.getInt8(this.offset);
    this.offset += 1;
    return val;
  }

  readUint16(littleEndian: boolean = true): number {
    const val = this.view.getUint16(this.offset, littleEndian);
    this.offset += 2;
    return val;
  }

  readInt16(littleEndian: boolean = true): number {
    const val = this.view.getInt16(this.offset, littleEndian);
    this.offset += 2;
    return val;
  }

  readUint32(littleEndian: boolean = true): number {
    const val = this.view.getUint32(this.offset, littleEndian);
    this.offset += 4;
    return val;
  }

  readInt32(littleEndian: boolean = true): number {
    const val = this.view.getInt32(this.offset, littleEndian);
    this.offset += 4;
    return val;
  }

  readFloat32(littleEndian: boolean = true): number {
    const val = this.view.getFloat32(this.offset, littleEndian);
    this.offset += 4;
    return val;
  }

  readString(length: number): string {
    const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, length);
    this.offset += length;
    
    // Find null terminator
    let end = 0;
    while (end < length && bytes[end] !== 0) {
      end++;
    }
    
    return new TextDecoder().decode(bytes.slice(0, end));
  }

  readNullTerminatedString(): string {
    let length = 0;
    while (this.offset + length < this.size && this.view.getUint8(this.offset + length) !== 0) {
      length++;
    }
    const str = this.readString(length);
    if (this.offset < this.size) this.offset++; // skip null terminator
    return str;
  }

  /**
   * Read a string prefixed with its length (1 byte length prefix)
   */
  readPrefixedString(): string {
    const length = this.readUint8();
    if (length === 0) return '';
    return this.readString(length);
  }

  /**
   * Read a string prefixed with its length (2 byte length prefix)
   */
  readPrefixedString16(): string {
    const length = this.readUint16();
    if (length === 0) return '';
    return this.readString(length);
  }

  /**
   * Read a string prefixed with its length (4 byte length prefix)
   */
  readPrefixedString32(): string {
    const length = this.readUint32();
    if (length === 0) return '';
    return this.readString(length);
  }

  readBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, length);
    this.offset += length;
    return new Uint8Array(bytes); // Return a copy
  }

  readMagic(length: number): string {
    const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, length);
    this.offset += length;
    return Array.from(bytes).map(b => String.fromCharCode(b)).join('');
  }
}
