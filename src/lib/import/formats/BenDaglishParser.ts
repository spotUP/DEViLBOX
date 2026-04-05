/**
 * BenDaglishParser.ts — Ben Daglish Amiga music format (bd.*) native parser
 *
 * Ben Daglish composed music for many classic Amiga games including The Last
 * Ninja and Thing on a Spring. The module file is a single-file compiled 68k
 * Amiga executable combining the player code and music data.
 *
 * Detection (from UADE "Benn Daglishv3.asm", DTP_Check2 routine):
 *   1. word[0] == 0x6000  (BRA opcode)
 *   2. word at offset 2 (D1): non-zero, < 0x8000 (non-negative), even
 *   3. word at offset 4 == 0x6000
 *   4. word at offset 6 (D1): non-zero, < 0x8000, even
 *   5. word at offset 8 is skipped (addq.l #2, A0 — no comparison)
 *   6. word at offset 10 == 0x6000
 *   7. word at offset 12 (D1): non-zero, < 0x8000, even
 *   8. BRA target = 2 + u16BE(buf, 2)  (A1 = offset 2; add.w (A1), A1)
 *   9. u32BE(buf, target)      == 0x3F006100
 *  10. u16BE(buf, target + 6)  == 0x3D7C
 *  11. u16BE(buf, target + 12) == 0x41FA
 *
 * UADE eagleplayer.conf: BenDaglish  prefixes=bd
 * MI_MaxSamples: not declared in the InfoBuffer (no dc.l MI_MaxSamples in
 *   the assembly source). 8 placeholder instruments are used as a default.
 *
 * UADE handles actual audio playback. This parser extracts metadata only.
 *
 * Reference:
 *   third-party/uade-3.05/amigasrc/players/wanted_team/BennDaglish/Benn Daglishv3.asm
 * Reference parsers: JeroenTelParser.ts, JasonPageParser.ts
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';

// ── Constants ───────────────────────────────────────────────────────────────

/**
 * Default placeholder instrument count.
 *
 * MI_MaxSamples is not declared in the InfoBuffer for this format.
 * 8 is used as a reasonable default to give the TrackerSong some
 * representation without over-allocating.
 */
const DEFAULT_INSTRUMENTS = 8;

// ── Binary helpers ──────────────────────────────────────────────────────────

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (
    ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0
  );
}

// ── Format detection ────────────────────────────────────────────────────────

/**
 * Return true if the buffer passes the full DTP_Check2 detection algorithm
 * from Benn Daglishv3.asm.
 *
 * When `filename` is supplied the basename is checked for the expected UADE
 * prefix (`bd.`). If a prefix does not match, detection returns false
 * immediately to avoid false positives from unrelated formats. The binary
 * scan is always performed regardless of filename.
 *
 * @param buffer    Raw file bytes
 * @param filename  Original filename (optional; used for prefix check)
 */
export function isBenDaglishFormat(buffer: ArrayBuffer, filename?: string): boolean {
  const buf = new Uint8Array(buffer);

  // ── Extension check (optional fast-reject) ───────────────────────────────
  // UADE eagleplayer.conf uses "bd." prefix (bd.corporation); modland uses
  // ".bd" suffix (corporation.bd). Accept both conventions.
  if (filename !== undefined) {
    const base = (filename.split('/').pop() ?? filename).toLowerCase();
    if (!base.endsWith('.bd') && !base.startsWith('bd.')) return false;
  }

  // Need at least 14 bytes for the header checks (through offset 12 + 2).
  if (buf.length < 14) return false;

  // word[0] == 0x6000 (BRA opcode)
  if (u16BE(buf, 0) !== 0x6000) return false;

  // word at offset 2: non-zero, < 0x8000 (positive), even
  const d1 = u16BE(buf, 2);
  if (d1 === 0 || d1 >= 0x8000 || (d1 & 1) !== 0) return false;

  // word at offset 4 == 0x6000
  if (u16BE(buf, 4) !== 0x6000) return false;

  // word at offset 6: non-zero, < 0x8000, even
  const d2 = u16BE(buf, 6);
  if (d2 === 0 || d2 >= 0x8000 || (d2 & 1) !== 0) return false;

  // offset 8 is skipped (addq.l #2, A0 in the assembly — no comparison)

  // word at offset 10 == 0x6000
  if (u16BE(buf, 10) !== 0x6000) return false;

  // word at offset 12: non-zero, < 0x8000, even
  const d3 = u16BE(buf, 12);
  if (d3 === 0 || d3 >= 0x8000 || (d3 & 1) !== 0) return false;

  // BRA target = 2 + d1
  //   A1 is set to offset 2 (move.l A0, A1 after incrementing A0 to offset 2),
  //   then add.w (A1), A1 adds d1 to give absolute offset 2 + d1.
  const target = 2 + d1;

  // Need 14 bytes at target (offsets target+0 through target+13)
  if (target + 13 >= buf.length) return false;

  if (u32BE(buf, target)      !== 0x3f006100) return false;
  if (u16BE(buf, target + 6)  !== 0x3d7c)     return false;
  if (u16BE(buf, target + 12) !== 0x41fa)      return false;

  return true;
}

// ── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse a Ben Daglish module file into a TrackerSong.
 *
 * The format is a compiled 68k Amiga executable; there is no public
 * specification of the internal layout beyond what the UADE EaglePlayer uses
 * for detection. This parser creates a metadata-only TrackerSong with
 * placeholder instruments. Actual audio playback is always delegated to UADE.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive module name)
 */
export async function parseBenDaglishFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  // ── Module name from filename ─────────────────────────────────────────────

  const baseName = filename.split('/').pop() ?? filename;
  // Strip ".bd" suffix or "bd." prefix (case-insensitive)
  const moduleName = baseName.replace(/\.bd$/i, '').replace(/^bd\./i, '') || baseName;

  // ── Extract real samples via SampleInfo1 table ────────────────────────────
  //
  // Algorithm from Benn Daglishv3.asm InitPlayer:
  // 1. Follow BRA at offset 0: target = 2 + u16BE(buf, 2)
  // 2. Scan forward from target for D040 D040 D040 41FA sequence
  // 3. SampleInfo1 = scanPos + 8 + s16(scanPos+8) (PC-relative LEA)
  // 4. SampleInfo1 has longword offsets to sample descriptors (null-terminated)
  // 5. Descriptor: u32(sampleOff) u32(loopOff) u16(lenWords) u16(loopLenWords)

  const buf = new Uint8Array(buffer);
  const instruments: InstrumentConfig[] = [];

  let samplesExtracted = false;
  const braTarget = 2 + u16BE(buf, 2);

  if (braTarget + 20 < buf.length) {
    // Scan for D040 D040 D040 41FA starting from BRA target
    let sampleInfo1Off = -1;
    for (let i = braTarget; i < Math.min(buf.length - 10, braTarget + 0x2000); i += 2) {
      if (u16BE(buf, i) === 0xD040 && u16BE(buf, i + 2) === 0xD040 &&
          u16BE(buf, i + 4) === 0xD040 && u16BE(buf, i + 6) === 0x41FA) {
        const disp = u16BE(buf, i + 8);
        const signedDisp = disp < 0x8000 ? disp : disp - 0x10000;
        sampleInfo1Off = (i + 8) + 2 + signedDisp;
        break;
      }
    }

    if (sampleInfo1Off > 0 && sampleInfo1Off < buf.length) {
      // Read sample index table: longword offsets from SampleInfo1, null-terminated
      const sampleDescs: number[] = [];
      for (let i = 0; i < 64; i++) {
        const off = sampleInfo1Off + i * 4;
        if (off + 4 > buf.length) break;
        const descOff = u32BE(buf, off);
        if (descOff === 0) break;
        sampleDescs.push(descOff);
      }

      for (let i = 0; i < sampleDescs.length; i++) {
        const descFileOff = sampleInfo1Off + sampleDescs[i];
        if (descFileOff + 12 > buf.length) continue;

        const sampleOff = u32BE(buf, descFileOff);
        const loopOff = u32BE(buf, descFileOff + 4);
        const lenWords = u16BE(buf, descFileOff + 8);
        const loopLenWords = u16BE(buf, descFileOff + 10);

        const pcmFileOff = sampleInfo1Off + sampleOff;
        const lenBytes = lenWords * 2;

        if (lenBytes > 0 && pcmFileOff > 0 && pcmFileOff + lenBytes <= buf.length) {
          // Check if it's IFF 8SVX (starts with "FORM")
          const isFORM = pcmFileOff + 4 <= buf.length &&
            buf[pcmFileOff] === 0x46 && buf[pcmFileOff + 1] === 0x4F &&
            buf[pcmFileOff + 2] === 0x52 && buf[pcmFileOff + 3] === 0x4D;

          let pcm: Uint8Array;
          if (isFORM) {
            // IFF 8SVX — find BODY chunk for raw PCM
            let foundBody = false;
            pcm = new Uint8Array(0);
            for (let j = pcmFileOff + 12; j < pcmFileOff + lenBytes - 8; j += 2) {
              if (buf[j] === 0x42 && buf[j + 1] === 0x4F && buf[j + 2] === 0x44 && buf[j + 3] === 0x59) {
                const bodyLen = u32BE(buf, j + 4);
                const bodyOff = j + 8;
                pcm = new Uint8Array(Math.min(bodyLen, buf.length - bodyOff));
                for (let k = 0; k < pcm.length; k++) pcm[k] = buf[bodyOff + k];
                foundBody = true;
                break;
              }
            }
            if (!foundBody) {
              pcm = new Uint8Array(lenBytes);
              for (let k = 0; k < lenBytes; k++) pcm[k] = buf[pcmFileOff + k];
            }
          } else {
            pcm = new Uint8Array(lenBytes);
            for (let k = 0; k < lenBytes; k++) pcm[k] = buf[pcmFileOff + k];
          }

          const hasLoop = sampleOff !== loopOff && loopLenWords > 0;
          const loopStartBytes = hasLoop ? (sampleInfo1Off + loopOff) - pcmFileOff : 0;
          const loopEndBytes = hasLoop ? loopStartBytes + loopLenWords * 2 : 0;

          instruments.push(createSamplerInstrument(
            i + 1, `BD Sample ${i + 1}`, pcm, 64, 8287,
            Math.max(0, loopStartBytes), Math.max(0, loopEndBytes)
          ));
          samplesExtracted = true;
        }
      }
    }
  }

  // Fallback: placeholder instruments if extraction failed
  if (!samplesExtracted || instruments.length === 0) {
    instruments.length = 0;
    for (let i = 0; i < DEFAULT_INSTRUMENTS; i++) {
      instruments.push({
        id: i + 1,
        name: `BD Sample ${i + 1}`,
        type: 'synth' as const,
        synthType: 'Synth' as const,
        effects: [],
        volume: 0,
        pan: 0,
      } as InstrumentConfig);
    }
  }

  // ── Empty pattern (placeholder — UADE handles actual audio) ───────────────

  const emptyRows = Array.from({ length: 64 }, () => ({
    note: 0,
    instrument: 0,
    volume: 0,
    effTyp: 0,
    eff: 0,
    effTyp2: 0,
    eff2: 0,
  }));

  const pattern = {
    id: 'pattern-0',
    name: 'Pattern 0',
    length: 64,
    channels: Array.from({ length: 4 }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null,
      color: null,
      rows: emptyRows,
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const,
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: 4,
      originalPatternCount: 1,
      originalInstrumentCount: DEFAULT_INSTRUMENTS,
    },
  };

  return {
    name: `${moduleName} [Ben Daglish]`,
    format: 'MOD' as TrackerFormat,
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    bdFileData: buffer.slice(0),
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
  };
}
