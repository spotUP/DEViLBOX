/**
 * Regression tests for the HVSC download normalizer.
 *
 * Guards the user-reported bug where `.sid` files downloaded from HVSC
 * arrived with the extension stripped ("Blasting Speaker" instead of
 * "Blasting_Speaker.sid") and failed the tracker-view load with
 * "unsupported file format" before any SID parser could run.
 *
 * Also guards the SidMon-1 / C64-SID disambiguation: `.sid` is a shared
 * extension, and bytes without PSID/RSID magic would fall through to the
 * SidMon fallback during dispatch, producing garbled playback. The
 * normalizer refuses non-SID bytes up front so HVSC downloads can never
 * be misrouted.
 */

import { describe, it, expect } from 'vitest';
import { normalizeHVSCDownload } from '../normalizeHVSCDownload';

function makeSIDBuffer(magic: 'PSID' | 'RSID' = 'PSID', extraBytes = 0): ArrayBuffer {
  const buf = new Uint8Array(4 + extraBytes);
  for (let i = 0; i < 4; i++) buf[i] = magic.charCodeAt(i);
  return buf.buffer;
}

describe('normalizeHVSCDownload', () => {
  describe('filename normalization', () => {
    it('appends `.sid` when the extension is missing', () => {
      const { filename } = normalizeHVSCDownload(makeSIDBuffer(), 'Blasting Speaker');
      expect(filename).toBe('Blasting Speaker.sid');
    });

    it('leaves a correctly-named file untouched', () => {
      const { filename } = normalizeHVSCDownload(makeSIDBuffer(), 'Commando.sid');
      expect(filename).toBe('Commando.sid');
    });

    it('is case-insensitive for the existing extension check', () => {
      const { filename } = normalizeHVSCDownload(makeSIDBuffer(), 'Turrican.SID');
      // Don't double-suffix.
      expect(filename).toBe('Turrican.SID');
    });

    it('handles names with spaces and punctuation (the reported case)', () => {
      const { filename } = normalizeHVSCDownload(makeSIDBuffer(), 'One Man and His Droid');
      expect(filename).toBe('One Man and His Droid.sid');
    });

    it('accepts names that happen to contain `.sid` mid-string only if suffix matches', () => {
      // A filename like "psid_demo" would not match; something like
      // "foo.sid.bak" also should not be treated as .sid.
      const { filename } = normalizeHVSCDownload(makeSIDBuffer(), 'foo.sid.bak');
      expect(filename).toBe('foo.sid.bak.sid');
    });
  });

  describe('magic-byte verification', () => {
    it('accepts PSID magic', () => {
      expect(() => normalizeHVSCDownload(makeSIDBuffer('PSID'), 'x.sid')).not.toThrow();
    });

    it('accepts RSID magic', () => {
      expect(() => normalizeHVSCDownload(makeSIDBuffer('RSID'), 'x.sid')).not.toThrow();
    });

    it('rejects buffers shorter than 4 bytes with byte-count in the message', () => {
      const tiny = new Uint8Array([0x50]).buffer;
      expect(() => normalizeHVSCDownload(tiny, 'x')).toThrow(/1 bytes/);
    });

    it('rejects zero-byte buffers', () => {
      expect(() => normalizeHVSCDownload(new ArrayBuffer(0), 'x')).toThrow(/0 bytes/);
    });

    it('rejects SidMon 1 magic — those bytes MUST NOT be routed via HVSC', () => {
      // SidMon 1 signature fragment at offset 0 (arbitrary non-PSID bytes).
      const mon = new Uint8Array([0x53, 0x49, 0x44, 0x20]); // "SID " — NOT PSID/RSID
      expect(() => normalizeHVSCDownload(mon.buffer, 'sidmon.sid')).toThrow(/PSID\/RSID/);
    });

    it('rejects arbitrary non-SID bytes (e.g. HTML error page from bad proxy)', () => {
      // "<!DO" — first 4 chars of an HTML error page.
      const html = new Uint8Array([0x3C, 0x21, 0x44, 0x4F]);
      expect(() => normalizeHVSCDownload(html.buffer, 'broken.sid')).toThrow(/magic/);
    });

    it('error mentions the observed magic so callers can surface it to the user', () => {
      const html = new Uint8Array([0x3C, 0x21, 0x44, 0x4F]);
      expect(() => normalizeHVSCDownload(html.buffer, 'x')).toThrow(/"<!DO"/);
    });
  });

  describe('idempotence', () => {
    it('round-tripping the output through the normalizer is a no-op', () => {
      const first = normalizeHVSCDownload(makeSIDBuffer(), 'Blasting Speaker');
      const second = normalizeHVSCDownload(first.buffer, first.filename);
      expect(second.filename).toBe(first.filename);
      expect(second.buffer).toBe(first.buffer);
    });
  });
});
