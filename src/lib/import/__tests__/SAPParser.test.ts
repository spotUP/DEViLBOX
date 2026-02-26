import { describe, it, expect } from 'vitest';
import { isSAPFormat, parseSAPFile } from '../formats/SAPParser';

function makeSAP(): ArrayBuffer {
  const header = 'SAP\r\nAUTHOR "Test Author"\r\nNAME "Test SAP"\r\nDATE "2024"\r\nSONGS 3\r\nTYPE B\r\n';
  const enc = new TextEncoder().encode(header);
  const buf = new Uint8Array(enc.length + 2 + 16);
  buf.set(enc);
  buf[enc.length]     = 0xFF;
  buf[enc.length + 1] = 0xFF;
  return buf.buffer;
}

describe('SAPParser', () => {
  it('detects SAP by header magic', () => {
    expect(isSAPFormat(makeSAP())).toBe(true);
  });

  it('rejects non-SAP data', () => {
    const buf = new Uint8Array(16);
    expect(isSAPFormat(buf.buffer)).toBe(false);
  });

  it('parses name and POKEY instruments', async () => {
    const song = await parseSAPFile(makeSAP(), 'test.sap');
    expect(song.name).toContain('Test SAP');
    expect(song.instruments[0].synthType).toBe('FurnacePOKEY');
  });
});
