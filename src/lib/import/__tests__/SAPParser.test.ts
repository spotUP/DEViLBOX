import { describe, it, expect } from 'vitest';
import { isSAPFormat, parseSAPFile } from '../formats/SAPParser';

describe('SAPParser', () => {
  it('detects valid SAP by magic bytes', () => {
    const bytes = new TextEncoder().encode('SAP\r\n');
    expect(isSAPFormat(bytes.buffer)).toBe(true);
  });

  it('rejects non-SAP data', () => {
    expect(isSAPFormat(new Uint8Array([0x00, 0x01, 0x02]).buffer)).toBe(false);
  });

  it('parses SAP header metadata', async () => {
    // Build a minimal SAP file with header only (no playable code, but valid structure)
    const header = 'SAP\r\nNAME "Test Song"\r\nAUTHOR "Tester"\r\nDATE "2026"\r\nSONGS 2\r\n';
    const headerBytes = new TextEncoder().encode(header);
    const terminator = new Uint8Array([0xFF, 0xFF]);
    const buf = new Uint8Array(headerBytes.length + terminator.length);
    buf.set(headerBytes);
    buf.set(terminator, headerBytes.length);

    const song = await parseSAPFile(buf.buffer, 'test.sap');
    expect(song.name).toContain('Test Song');
    expect(song.name).toContain('Tester');
    expect(song.songLength).toBe(2);
    expect(song.numChannels).toBe(4);
  });
});
