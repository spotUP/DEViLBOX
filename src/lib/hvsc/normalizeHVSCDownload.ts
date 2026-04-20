/**
 * Normalize an HVSC download before handing it to the tracker loader.
 *
 * HVSC search results sometimes come back with the extension stripped
 * ("Blasting Speaker" rather than "Blasting_Speaker.sid"). Without the
 * `.sid` suffix, `isSongFormat` returns false and the whole load rejects
 * before any SID parser can run.
 *
 * HVSC hosts only C64 PSID/RSID files, so the normalizer also verifies
 * the magic bytes. If the server ever hands back non-SID data (glitch,
 * wrong path, HTML error page, …) we refuse immediately rather than let
 * `.sid` dispatch route the bytes to the SidMon 1 fallback and produce
 * garbled playback — `.sid` is a shared extension between C64 PSID/RSID
 * and Amiga SidMon 1, disambiguated by magic bytes further down the
 * pipeline.
 *
 * Pure function — no side effects, throws on invalid input so callers can
 * catch and show a user-facing error.
 */

export interface NormalizedHVSCDownload {
  buffer: ArrayBuffer;
  filename: string;
}

export function normalizeHVSCDownload(
  buffer: ArrayBuffer,
  rawFilename: string,
): NormalizedHVSCDownload {
  if (buffer.byteLength < 4) {
    throw new Error(`HVSC returned ${buffer.byteLength} bytes — not a valid SID`);
  }
  const head = new Uint8Array(buffer, 0, 4);
  const magic = String.fromCharCode(head[0], head[1], head[2], head[3]);
  if (magic !== 'PSID' && magic !== 'RSID') {
    throw new Error(`HVSC returned "${magic}" magic — expected PSID/RSID, won't route to SidMon`);
  }
  // Ensure `.sid` extension. Idempotent — properly-named files pass through.
  const filename = /\.sid$/i.test(rawFilename) ? rawFilename : `${rawFilename}.sid`;
  return { buffer, filename };
}
