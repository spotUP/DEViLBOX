/**
 * Every FORMAT_REGISTRY entry with a declared `detectFn` must reject a
 * zero-filled buffer. False positives on an all-zero buffer are the most
 * common class of format-detection regression — silently cause the wrong
 * parser to claim a file that isn't theirs, producing wrong audio or
 * crashes downstream.
 *
 * This is a cheap per-format sanity test that scales to the whole registry.
 * CI-safe — no Reference Music, no live audio.
 */

import { describe, it, expect } from 'vitest';
import { FORMAT_REGISTRY } from '@/lib/import/FormatRegistry';

interface DetectRef {
  key: string;
  detectFn: string;
  module: string;
}

const formatsWithDetect: DetectRef[] = FORMAT_REGISTRY
  .filter((f) => f.nativeParser?.detectFn)
  .map((f) => ({
    key: f.key,
    detectFn: f.nativeParser!.detectFn!,
    module: f.nativeParser!.module,
  }));

/**
 * Known-broken formats — each entry is a real bug surfaced by this test
 * on 2026-04-20. Shape: key → reason.
 *
 * - MISSING_EXPORT: FORMAT_REGISTRY declares a `detectFn` that isn't
 *   exported from the parser module. Dispatch falls through silently.
 * - FALSE_POSITIVE: the detector returns true on a zero buffer, so it
 *   claims ownership of any all-zero file the user drops (or any garbage
 *   that happens to start with zeros).
 *
 * Fix by removing/correcting the `detectFn` in FormatRegistry.ts or
 * tightening the detection in the parser, then delete from this list —
 * the ratchet prevents new offenders without blocking progress on the
 * rest of the registry.
 */
const KNOWN_BROKEN = new Map<string, string>([
  ['musicLine',          'MISSING_EXPORT: isMusicLineFormat not exported from MusicLineParser'],
  ['richardJoseph',      'MISSING_EXPORT: isRichardJosephFormat not exported from RichardJosephParser'],
  ['digitalSonixChrome', 'MISSING_EXPORT: isDigitalSonixChromeFormat not exported from DigitalSonixChromeParser'],
  ['tronic',             'FALSE_POSITIVE: isTronicFormat claims an all-zero buffer'],
  ['qsf',                'FALSE_POSITIVE: isQsfFormat claims an all-zero buffer'],
]);

describe('FORMAT_REGISTRY — detection functions reject zero-filled buffers', () => {
  it('has enough formats-with-detect to be worth running (>= 15)', () => {
    expect(formatsWithDetect.length).toBeGreaterThanOrEqual(15);
  });

  for (const { key, detectFn, module } of formatsWithDetect) {
    const skipReason = KNOWN_BROKEN.get(key);
    const label = skipReason
      ? `${key}.${detectFn} [KNOWN BROKEN: ${skipReason}]`
      : `${key}.${detectFn} rejects a 4 KB zero buffer`;
    (skipReason ? it.skip : it)(label, async () => {
      const mod = (await import(/* @vite-ignore */ module)) as Record<string, unknown>;
      const fn = mod[detectFn];
      expect(typeof fn, `export ${detectFn} missing from ${module}`).toBe('function');
      const detect = fn as (buf: Uint8Array | ArrayBuffer) => boolean;

      const zeroBuf = new ArrayBuffer(4096);
      const zeroU8 = new Uint8Array(zeroBuf);

      // Some detectors accept ArrayBuffer, some Uint8Array. Call with
      // Uint8Array and fall back to ArrayBuffer on TypeError.
      let result: boolean;
      try {
        result = detect(zeroU8);
      } catch {
        result = detect(zeroBuf);
      }
      expect(result, `${key}.${detectFn} claimed a zero buffer`).toBe(false);
    });
  }

  it('KNOWN_BROKEN allowlist stays synced — every entry must still be in the registry', () => {
    const registryKeys = new Set(formatsWithDetect.map((f) => f.key));
    const stale = Array.from(KNOWN_BROKEN.keys()).filter((k) => !registryKeys.has(k));
    expect(
      stale,
      `KNOWN_BROKEN has entries not in FORMAT_REGISTRY: ${stale.join(', ')}. Remove them.`,
    ).toEqual([]);
  });
});
