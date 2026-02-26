/**
 * ImagoOrpheusParser.ts — Imago Orpheus (.imf, .imff) format detector
 *
 * Imago Orpheus is a PC DOS 32-channel tracker by Lutz Roeder, released in
 * 1994. It supports FM synthesis (OPL2/OPL3) and PCM samples with volume and
 * panning envelopes, arpeggio, vibrato, tremolo, and other standard effects.
 * Files use linear (not logarithmic) period slides.
 *
 * Two versions exist:
 *   IM10  — Imago Orpheus 1.0 (earlier)
 *   IM20  — Imago Orpheus 2.0 (later; same structure with minor additions)
 *
 * File header layout (576 bytes, little-endian throughout):
 *   +0    title[32]         — song title, null-terminated ASCII
 *   +32   ordNum            (uint16LE, number of orders)
 *   +34   patNum            (uint16LE, number of patterns)
 *   +36   insNum            (uint16LE, number of instruments)
 *   +38   flags             (uint16LE; bit0 = linearSlides)
 *   +40   unused1[8]
 *   +48   tempo             (uint8, default Axx; 1–255)
 *   +49   bpm               (uint8, default Txx; 32–255)
 *   +50   master            (uint8, default master volume; 0–64)
 *   +51   amp               (uint8, amplification; 4–127)
 *   +52   unused2[8]
 *   +60   im10[4]           — magic: "IM10" or "IM20"
 *   +64   channels[32] × IMFChannel (16 bytes each = 512 bytes):
 *           +0  name[12]    — channel name (ASCIIZ, max 11 chars)
 *           +12 chorus      (uint8, 0–255)
 *           +13 reverb      (uint8, 0–255)
 *           +14 panning     (uint8, 0–255; 0x80=center)
 *           +15 status      (uint8; 0=enabled, 1=mute, 2=disabled)
 *   After header: ordNum × uint8 order list
 *   Then: patNum pattern blocks (each has a uint16LE row-count header)
 *   Then: insNum instrument blocks (complex FM+PCM structs)
 *
 * Reference: OpenMPT Load_imf.cpp (Storlek + Johannes Schultz)
 *            http://schismtracker.org/
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';

// ── Binary helpers ────────────────────────────────────────────────────────────

function readFourCC(v: DataView, off: number): string {
  return String.fromCharCode(
    v.getUint8(off),
    v.getUint8(off + 1),
    v.getUint8(off + 2),
    v.getUint8(off + 3),
  );
}

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Returns true if the buffer contains an Imago Orpheus module.
 * Detection: "IM10" or "IM20" at offset 60, and at least one active channel.
 */
export function isImagoOrpheusFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 576) return false;
  const v = new DataView(buffer);
  const magic = readFourCC(v, 60);
  if (magic !== 'IM10' && magic !== 'IM20') return false;

  // Verify at least one non-disabled channel
  for (let chn = 0; chn < 32; chn++) {
    const status = v.getUint8(64 + chn * 16 + 15);
    if (status < 2) return true;
    if (status > 2) return false; // invalid status → reject
  }
  return false; // all channels disabled
}

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Imago Orpheus uses FM synthesis (OPL2/OPL3) and complex envelope structures.
 * Native parsing is deferred to OpenMPT which implements the full IMF spec
 * including FM instruments and all Imago Orpheus effects.
 */
export async function parseImagoOrpheusFile(
  _buffer: ArrayBuffer,
  _filename: string,
): Promise<TrackerSong> {
  throw new Error('[ImagoOrpheusParser] Delegating to OpenMPT for full IMF/FM-synthesis support');
}
