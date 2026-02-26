/**
 * PSMParser.ts — PSM16 and new PSM (ProTracker Studio / Epic MegaGames MASI) native parser
 *
 * There are TWO distinct PSM formats:
 *
 * 1. New PSM ("PSM ") — RIFF-like chunk-based format.
 *    Magic: "PSM " at offset 0, "FILE" at offset 8.
 *    Used by Epic MegaGames games (Jazz Jackrabbit, Zone 66, Radix, Pinball Fantasies, etc.)
 *    Some games use a Sinaria variant with slightly different effect encoding and sample headers.
 *
 * 2. PSM16 ("PSM\xFE") — Older flat-file format.
 *    Magic: "PSM\xFE" at offset 0.
 *    Used in older Epic MegaGames productions.
 *
 * Reference: Reference Code/openmpt-master/soundlib/Load_psm.cpp (authoritative)
 *
 * ── New PSM layout ────────────────────────────────────────────────────────────
 *   PSMFileHeader (12 bytes):
 *     formatID[4]   = "PSM "
 *     fileSize      uint32LE (filesize - 12)
 *     fileInfoID[4] = "FILE"
 *
 *   RIFF-like chunks (4-byte ID + 4-byte LE length):
 *     SDFT — "MAINSONG" magic (identifies new PSM)
 *     TITL — song title (space-padded)
 *     SONG — one per subsong; contains sub-chunks:
 *       OPLH — order list + channel settings
 *       PPAN — channel panning (Sinaria variant)
 *       PATT, DSAM — skipped
 *     DSMP — sample data
 *     PBOD — pattern data
 *
 *   SONG → OPLH opcodes:
 *     0x00 — end
 *     0x01 — order list entry (4-byte pattern ID "P0  "/"P13 " or "PATT0   " for Sinaria)
 *     0x02 — play range (skip 4 bytes)
 *     0x03 — jump loop (restart pos + skip 1)
 *     0x04 — jump line (restart pos)
 *     0x05 — channel flip (2 bytes: channel, type)
 *     0x06 — transpose (skip 1)
 *     0x07 — default speed (1 byte)
 *     0x08 — default tempo (1 byte)
 *     0x0C — sample map table (6 bytes; must be 00 FF 00 00 01 00)
 *     0x0D — channel panning (3 bytes: channel, pan, type)
 *     0x0E — channel volume (2 bytes: channel, vol)
 *
 *   PBOD pattern data:
 *     length uint32LE (same value appears twice)
 *     pattern ID (4 or 8 bytes)
 *     numRows uint16LE
 *     rows: each row starts with uint16LE rowSize, then rowSize-2 bytes of events
 *       each event: flags uint8, channel uint8, then conditionally note/instr/vol/effect bytes
 *
 *   DSMP sample data:
 *     PSMSampleHeader (96 bytes) then raw 8-bit delta-PCM
 *     (Sinaria uses PSMSinariaSampleHeader which is also 96 bytes)
 *
 * ── PSM16 layout ─────────────────────────────────────────────────────────────
 *   PSM16FileHeader (146 bytes):
 *     formatID[4]        = "PSM\xFE"
 *     songName[59]
 *     lineEnd            uint8 (0x1A)
 *     songType           uint8
 *     formatVersion      uint8 (0x10 or 0x01)
 *     patternVersion     uint8 (must be 0)
 *     songSpeed          uint8
 *     songTempo          uint8
 *     masterVolume       uint8
 *     songLength         uint16LE
 *     songOrders         uint16LE
 *     numPatterns        uint16LE
 *     numSamples         uint16LE
 *     numChannelsPlay    uint16LE
 *     numChannelsReal    uint16LE
 *     orderOffset        uint32LE (file offset - 4 from "PORD" magic)
 *     panOffset          uint32LE (file offset - 4 from "PPAN" magic)
 *     patOffset          uint32LE (file offset - 4 from "PPAT" magic)
 *     smpOffset          uint32LE (file offset - 4 from "PSAH" magic)
 *     commentsOffset     uint32LE
 *     patSize            uint32LE
 *     filler[40]
 *
 *   PSM16 patterns use separate channel flag byte (0 = end of row).
 *   PSM16 samples: PSM16SampleHeader (64 bytes each) then raw PCM at sampleHeader.offset.
 *
 * ── Effects (new PSM) ─────────────────────────────────────────────────────────
 *   0x01 fine vol up     0x02 vol up       0x03 fine vol down  0x04 vol down
 *   0x0B fine porta up   0x0C porta up     0x0D fine porta dn  0x0E porta down
 *   0x0F tone porta       0x10 t.porta+vsu  0x11 glissando      0x12 t.porta+vsd
 *   0x13 S3M S cmd        0x15 vibrato      0x16 vib waveform   0x17 vib+vol up
 *   0x18 vib+vol dn       0x1F tremolo      0x20 trem waveform
 *   0x29 3-byte offset    0x2A retrigger    0x2B note cut       0x2C note delay
 *   0x33 position jump    0x34 pattern brk  0x35 loop pattern   0x36 pattern delay
 *   0x3D speed            0x3E tempo        0x47 arpeggio        0x48 set finetune
 *   0x49 set balance
 *
 * ── Effects (PSM16) ────────────────────────────────────────────────────────────
 *   Offset by ~1 compared to new PSM but conceptually similar.
 *
 * ── Note mapping (new PSM, non-Sinaria) ──────────────────────────────────────
 *   raw note 0xFF = note-cut
 *   else if raw < 129: note = (raw & 0x0F) + 12 * (raw >> 4) + 13
 *   (This is BCD-encoded octave/semitone: high nibble = octave, low nibble = semitone)
 *
 * ── Note mapping (new PSM, Sinaria) ──────────────────────────────────────────
 *   if raw < 85: note = raw + 36
 *
 * ── Note mapping (PSM16) ──────────────────────────────────────────────────────
 *   note = raw + 36
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';

// ── Little-endian binary helpers ──────────────────────────────────────────────

function u8(buf: Uint8Array, off: number): number { return buf[off] ?? 0; }
function u16le(buf: Uint8Array, off: number): number {
  return (buf[off] ?? 0) | ((buf[off + 1] ?? 0) << 8);
}
function u32le(buf: Uint8Array, off: number): number {
  return ((buf[off] ?? 0) | ((buf[off + 1] ?? 0) << 8) | ((buf[off + 2] ?? 0) << 16) | ((buf[off + 3] ?? 0) << 24)) >>> 0;
}
function readString(buf: Uint8Array, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = buf[off + i] ?? 0;
    if (c === 0) break;
    if (c === 0x20 && s.length === 0) continue; // skip leading spaces
    s += (c >= 0x20 && c < 0x80) ? String.fromCharCode(c) : ' ';
  }
  return s.trimEnd();
}
function readSpacePadded(buf: Uint8Array, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = buf[off + i] ?? 0;
    if (c === 0) break;
    s += (c >= 0x20 && c < 0x80) ? String.fromCharCode(c) : ' ';
  }
  return s.trimEnd();
}
function magicMatch(buf: Uint8Array, off: number, magic: string): boolean {
  if (off + magic.length > buf.length) return false;
  for (let i = 0; i < magic.length; i++) {
    if (buf[off + i] !== magic.charCodeAt(i)) return false;
  }
  return true;
}

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Returns true if the buffer is a PSM file (either new PSM or PSM16).
 */
export function isPSMFormat(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  // New PSM: "PSM " at 0, "FILE" at 8
  if (magicMatch(bytes, 0, 'PSM ') && magicMatch(bytes, 8, 'FILE')) return true;
  // PSM16: "PSM\xFE" at 0 + 0x1A at offset 63
  if (magicMatch(bytes, 0, 'PSM\xFE') && bytes.length >= 146) {
    // Validate PSM16 header
    if (u8(bytes, 63) !== 0x1A) return false;
    const fmtVer = u8(bytes, 65);
    if (fmtVer !== 0x10 && fmtVer !== 0x01) return false;
    return true;
  }
  return false;
}

// ── Main parser ───────────────────────────────────────────────────────────────

/**
 * Parse a PSM (new or PSM16) file into a TrackerSong.
 * Returns null on any validation failure (never throws).
 */
export function parsePSMFile(bytes: Uint8Array, filename: string): TrackerSong | null {
  try {
    if (bytes.length < 4) return null;
    if (magicMatch(bytes, 0, 'PSM ')) return _parseNewPSM(bytes, filename);
    if (magicMatch(bytes, 0, 'PSM\xFE')) return _parsePSM16(bytes, filename);
    return null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// NEW PSM
// ─────────────────────────────────────────────────────────────────────────────

interface PSMChunkRef { id: string; start: number; size: number; }

/** Read all top-level chunks from new PSM file (after the 12-byte file header). */
function readNewPSMChunks(bytes: Uint8Array): PSMChunkRef[] {
  const chunks: PSMChunkRef[] = [];
  let pos = 12; // skip PSMFileHeader
  while (pos + 8 <= bytes.length) {
    const id = String.fromCharCode(u8(bytes, pos), u8(bytes, pos + 1), u8(bytes, pos + 2), u8(bytes, pos + 3));
    const size = u32le(bytes, pos + 4);
    chunks.push({ id, start: pos + 8, size });
    pos += 8 + size;
  }
  return chunks;
}

/** Read sub-chunks within a chunk body. */
function readSubChunks(bytes: Uint8Array, start: number, size: number): PSMChunkRef[] {
  const chunks: PSMChunkRef[] = [];
  let pos = start;
  const end = start + size;
  while (pos + 8 <= end) {
    const id = String.fromCharCode(u8(bytes, pos), u8(bytes, pos + 1), u8(bytes, pos + 2), u8(bytes, pos + 3));
    const csize = u32le(bytes, pos + 4);
    chunks.push({ id, start: pos + 8, size: csize });
    pos += 8 + csize;
  }
  return chunks;
}

/**
 * Read a pattern ID like "P0  " or "P13 " (non-Sinaria) or "PATT0   " (Sinaria).
 * Returns { patIndex, isSinaria }.
 */
function readPSMPatternIndex(bytes: Uint8Array, pos: number, sinariaHint: boolean): { patIndex: number; isSinaria: boolean; consumed: number } {
  if (pos + 4 > bytes.length) return { patIndex: 0, isSinaria: sinariaHint, consumed: 0 };
  const id4 = String.fromCharCode(u8(bytes, pos), u8(bytes, pos + 1), u8(bytes, pos + 2), u8(bytes, pos + 3));
  if (id4 === 'PATT') {
    // Sinaria: 8-byte ID "PATT0   "
    if (pos + 8 > bytes.length) return { patIndex: 0, isSinaria: true, consumed: 8 };
    // Read digits after "PATT"
    let numStr = '';
    for (let i = 4; i < 8; i++) {
      const c = u8(bytes, pos + i);
      if (c >= 0x30 && c <= 0x39) numStr += String.fromCharCode(c);
      else break;
    }
    const patIndex = numStr ? parseInt(numStr, 10) : 0;
    return { patIndex, isSinaria: true, consumed: 8 };
  } else {
    // Normal: "P" + digits, space-padded to 4 bytes
    // OpenMPT reads 4 bytes and parses from offset 1 ("P" skip)
    let numStr = '';
    for (let i = 1; i < 4; i++) {
      const c = u8(bytes, pos + i);
      if (c >= 0x30 && c <= 0x39) numStr += String.fromCharCode(c);
      else break;
    }
    const patIndex = numStr ? parseInt(numStr, 10) : 0;
    return { patIndex, isSinaria: sinariaHint, consumed: 4 };
  }
}

/** Convert portamento parameter for new PSM (non-Sinaria). */
function convertPSMPorta(param: number, sinaria: boolean): number {
  if (sinaria) return param;
  if (param < 4) return (param | 0xF0);
  return (param >> 2);
}

/** Convert new PSM effect to (effTyp, eff). */
function convertNewPSMEffect(cmd: number, param: number, sinaria: boolean, _bytes: Uint8Array, _pos: number): { effTyp: number; eff: number; extra: number } {
  // extra = number of extra bytes consumed beyond the 2 already read (cmd + param)
  let effTyp = 0, eff = 0, extra = 0;
  switch (cmd) {
    // Volume slides
    case 0x01: // fine volslide up
      effTyp = 0x0A;
      eff = sinaria ? ((param << 4) | 0x0F) : (((param & 0x1E) << 3) | 0x0F);
      break;
    case 0x02: // volslide up
      effTyp = 0x0A;
      eff = sinaria ? (0xF0 & (param << 4)) : (0xF0 & (param << 3));
      break;
    case 0x03: // fine volslide down
      effTyp = 0x0A;
      eff = sinaria ? (param | 0xF0) : (0xF0 | (param >> 1));
      break;
    case 0x04: // volslide down
      effTyp = 0x0A;
      if (sinaria) eff = param & 0x0F;
      else eff = (param < 2) ? (param | 0xF0) : ((param >> 1) & 0x0F);
      break;

    // Portamento
    case 0x0B: // fine porta up
      effTyp = 0x01; eff = 0xF0 | convertPSMPorta(param, sinaria); break;
    case 0x0C: // porta up
      effTyp = 0x01; eff = convertPSMPorta(param, sinaria); break;
    case 0x0D: // fine porta down
      effTyp = 0x02; eff = 0xF0 | convertPSMPorta(param, sinaria); break;
    case 0x0E: // porta down
      effTyp = 0x02; eff = convertPSMPorta(param, sinaria); break;
    case 0x0F: // tone portamento
      effTyp = 0x03; eff = sinaria ? param : (param >> 2); break;
    case 0x10: // tone porta + volslide up
      effTyp = 0x05; eff = param & 0xF0; break; // tone porta vol
    case 0x11: // glissando control
      effTyp = 0x13; eff = 0x10 | (param & 0x01); break;
    case 0x12: // tone porta + volslide down
      effTyp = 0x05; eff = (param >> 4) & 0x0F; break;

    // Vibrato
    case 0x15: // vibrato
      effTyp = 0x04; eff = param; break;
    case 0x16: // vibrato waveform
      effTyp = 0x13; eff = 0x30 | (param & 0x0F); break;
    case 0x17: // vibrato + vol up
      effTyp = 0x06; eff = 0xF0 | param; break;
    case 0x18: // vibrato + vol down
      effTyp = 0x06; eff = param; break;

    // Tremolo
    case 0x1F: // tremolo
      effTyp = 0x07; eff = param; break;
    case 0x20: // tremolo waveform
      effTyp = 0x13; eff = 0x40 | (param & 0x0F); break;

    // Sample commands
    case 0x29: // 3-byte offset — read extra byte, use middle byte (param)
      effTyp = 0x09;
      // We read cmd + param, then 2 more bytes, use the first (param)
      eff = param;
      extra = 2;
      break;
    case 0x2A: // retrigger
      effTyp = 0x1B; eff = param; break;
    case 0x2B: // note cut
      effTyp = 0x13; eff = 0xC0 | (param & 0x0F); break;
    case 0x2C: // note delay
      effTyp = 0x13; eff = 0xD0 | (param & 0x0F); break;

    // Position change
    case 0x33: // position jump
      effTyp = 0x0B; eff = param / 2; extra = 1; break;
    case 0x34: // pattern break
      effTyp = 0x0D; eff = 0; break;
    case 0x35: // loop pattern
      effTyp = 0x13; eff = 0xB0 | (param & 0x0F); break;
    case 0x36: // pattern delay
      effTyp = 0x13; eff = 0xE0 | (param & 0x0F); break;

    // Speed
    case 0x3D: effTyp = 0x0F; eff = param; break; // speed
    case 0x3E: effTyp = 0x0F; eff = param; break; // tempo

    // Misc
    case 0x47: effTyp = 0x00; eff = param; break; // arpeggio
    case 0x48: effTyp = 0x13; eff = 0x20 | (param & 0x0F); break; // finetune
    case 0x49: effTyp = 0x13; eff = 0x80 | (param & 0x0F); break; // balance

    default:
      effTyp = 0; eff = 0; break;
  }
  return { effTyp, eff, extra };
}

/** Convert new PSM note byte to our note index. */
function convertNewPSMNote(raw: number, sinaria: boolean): number {
  if (sinaria) {
    if (raw < 85) return raw + 36;
    return 0;
  }
  if (raw === 0xFF) return 121; // note cut
  if (raw >= 129) return 0;
  // BCD: high nibble = octave (0-9), low nibble = semitone (0-11)
  const note = (raw & 0x0F) + 12 * (raw >> 4) + 13;
  return Math.max(1, Math.min(120, note));
}

function _parseNewPSM(bytes: Uint8Array, filename: string): TrackerSong | null {
  if (!magicMatch(bytes, 0, 'PSM ') || !magicMatch(bytes, 8, 'FILE')) return null;

  const allChunks = readNewPSMChunks(bytes);

  // Validate SDFT chunk
  const sdft = allChunks.find(c => c.id === 'SDFT');
  if (!sdft || !magicMatch(bytes, sdft.start, 'MAINSONG')) return null;

  // Count channels from SONG headers
  const songChunks = allChunks.filter(c => c.id === 'SONG');
  if (songChunks.length === 0) return null;

  let numChannels = 0;
  for (const sc of songChunks) {
    if (sc.start + 11 > bytes.length) continue;
    // PSMSongHeader: songType[9], compression uint8, numChannels uint8
    const compression = u8(bytes, sc.start + 9);
    if (compression !== 0x01) return null;
    const nc = u8(bytes, sc.start + 10);
    numChannels = Math.max(numChannels, nc);
  }
  if (numChannels === 0 || numChannels > 64) return null;

  // Song title
  const titleChunk = allChunks.find(c => c.id === 'TITL');
  let songName = '';
  if (titleChunk) {
    songName = readSpacePadded(bytes, titleChunk.start, titleChunk.size);
  }

  // Sinaria format detection + order/panning parsing
  let sinariaFormat = false;
  let initialSpeed = 6;
  let initialBPM   = 125;
  const songPositions: number[] = [];
  let restartPosition = 0;

  // Channel panning (index 0-based channel → pan value 0..255, center=128)
  const channelPanning: number[] = Array(numChannels).fill(128);

  for (const sc of songChunks) {
    if (sc.start + 11 > bytes.length) continue;

    // Read song type name for the sequence name (we ignore it, just parse OPLH/PPAN)
    const subChunks = readSubChunks(bytes, sc.start + 11, sc.size - 11);

    for (const sub of subChunks) {
      if (sub.id === 'OPLH') {
        if (sub.size < 9) continue;
        // Skip first 2 bytes (total sub-chunk count)
        let sp = sub.start + 2;
        const subEnd = sub.start + sub.size;
        let chunkCount = 0;
        let firstOrderChunk = 0xFFFF;

        while (sp < subEnd) {
          if (sp >= bytes.length) break;
          const opcode = u8(bytes, sp++);
          if (opcode === 0) break;

          switch (opcode) {
            case 0x01: { // Order list entry
              const { patIndex, isSinaria, consumed } = readPSMPatternIndex(bytes, sp, sinariaFormat);
              if (isSinaria) sinariaFormat = true;
              sp += consumed;
              const finalPat = (patIndex === 0xFF) ? 0xFFFF : (patIndex === 0xFE) ? 0xFFFE : patIndex;
              if (finalPat < 0xFFFE) songPositions.push(finalPat);
              if (firstOrderChunk === 0xFFFF) firstOrderChunk = chunkCount;
              break;
            }
            case 0x02: // play range — skip 4
              sp += 4;
              break;
            case 0x03: { // jump loop
              if (sp + 2 > bytes.length) break;
              const restartChunk = u16le(bytes, sp);
              sp += 2 + 1; // skip 1 extra byte
              if (restartChunk >= firstOrderChunk) {
                restartPosition = restartChunk - firstOrderChunk;
              }
              break;
            }
            case 0x04: { // jump line (restart)
              if (sp + 2 > bytes.length) break;
              const restartChunk = u16le(bytes, sp);
              sp += 2;
              if (restartChunk >= firstOrderChunk) {
                restartPosition = restartChunk - firstOrderChunk;
              }
              break;
            }
            case 0x05: { // channel flip
              if (sp + 2 > bytes.length) break;
              const [chn, type] = [u8(bytes, sp), u8(bytes, sp + 1)];
              sp += 2;
              if (chn < numChannels) {
                if (type === 0) channelPanning[chn] = channelPanning[chn]; // use existing pan
                else if (type === 4) channelPanning[chn] = 128; // center
              }
              break;
            }
            case 0x06: sp += 1; break; // transpose — skip
            case 0x07: // speed
              if (sp < bytes.length) initialSpeed = Math.max(1, u8(bytes, sp++));
              break;
            case 0x08: // tempo
              if (sp < bytes.length) initialBPM = Math.max(32, u8(bytes, sp++));
              break;
            case 0x0C: { // sample map table — must be "00 FF 00 00 01 00"
              if (sp + 6 > bytes.length) return null;
              const m = [u8(bytes, sp), u8(bytes, sp+1), u8(bytes, sp+2), u8(bytes, sp+3), u8(bytes, sp+4), u8(bytes, sp+5)];
              if (m[0] !== 0x00 || m[1] !== 0xFF || m[2] !== 0x00 || m[3] !== 0x00 || m[4] !== 0x01 || m[5] !== 0x00) return null;
              sp += 6;
              break;
            }
            case 0x0D: { // channel panning
              if (sp + 3 > bytes.length) break;
              const [chn, pan, type] = [u8(bytes, sp), u8(bytes, sp+1), u8(bytes, sp+2)];
              sp += 3;
              if (chn < numChannels) {
                if (type === 0) channelPanning[chn] = pan ^ 128; // XOR 128 as per OpenMPT
                else if (type === 2) channelPanning[chn] = 128;  // surround → center
                else if (type === 4) channelPanning[chn] = 128;  // center
              }
              break;
            }
            case 0x0E: { // channel volume
              if (sp + 2 > bytes.length) break;
              sp += 2; // skip (channel, vol) — not used for pattern display
              break;
            }
            default:
              return null; // unknown opcode
          }
          chunkCount++;
        }
      } else if (sub.id === 'PPAN') {
        // Sinaria panning table
        let sp = sub.start;
        for (let ch = 0; ch < numChannels; ch++) {
          if (sp + 2 > bytes.length) break;
          const [type, pan] = [u8(bytes, sp), u8(bytes, sp + 1)];
          sp += 2;
          if (type === 0) channelPanning[ch] = pan ^ 128;
          else if (type === 2) channelPanning[ch] = 128;
          else if (type === 4) channelPanning[ch] = 128;
        }
      }
    }
  }

  if (songPositions.length === 0) return null;

  // ── Samples ────────────────────────────────────────────────────────────────
  // We don't play back PSM samples here, but we extract names for instrument list.
  const sampleNames: Map<number, string> = new Map();
  const dsmpChunks = allChunks.filter(c => c.id === 'DSMP');

  for (const dsmp of dsmpChunks) {
    // Both PSMSampleHeader and PSMSinariaSampleHeader are 96 bytes
    if (dsmp.start + 96 > bytes.length) continue;
    let sampleNumber: number;
    let sampleName: string;
    if (!sinariaFormat) {
      // PSMSampleHeader: flags(1), fileName[8], sampleID[4], sampleName[33], unknown1[6], sampleNumber(2), ...
      sampleNumber = u16le(bytes, dsmp.start + 52) + 1; // sampleNumber at offset 52
      sampleName   = readString(bytes, dsmp.start + 13, 33); // sampleName at offset 13
    } else {
      // PSMSinariaSampleHeader: flags(1), fileName[8], sampleID[8], sampleName[33], unknown1[6], sampleNumber(2), ...
      sampleNumber = u16le(bytes, dsmp.start + 56) + 1; // sampleNumber at offset 56
      sampleName   = readString(bytes, dsmp.start + 17, 33); // sampleName at offset 17
    }
    if (sampleNumber > 0 && sampleNumber < 256) {
      sampleNames.set(sampleNumber, sampleName);
    }
  }

  // ── Instruments ────────────────────────────────────────────────────────────
  const maxSample = sampleNames.size > 0 ? Math.max(...sampleNames.keys()) : 0;
  const instruments: InstrumentConfig[] = [];
  for (let i = 1; i <= Math.max(maxSample, 1); i++) {
    instruments.push({
      id:        i,
      name:      sampleNames.get(i) || `Sample ${i}`,
      type:      'sample' as const,
      synthType: 'Sampler' as const,
      effects:   [],
      volume:    0,
      pan:       0,
    } as unknown as InstrumentConfig);
  }

  // ── Patterns ───────────────────────────────────────────────────────────────
  const patternMap: Map<number, Pattern> = new Map();
  const pbodChunks = allChunks.filter(c => c.id === 'PBOD');

  for (const pbod of pbodChunks) {
    if (pbod.size < 8) continue;
    let pp = pbod.start;

    // Verify: first 4 bytes = chunk length (same as outer size)
    const innerLen = u32le(bytes, pp);
    if (innerLen !== pbod.size) continue;
    pp += 4;

    // Read pattern index
    const { patIndex, consumed } = readPSMPatternIndex(bytes, pp, sinariaFormat);
    pp += consumed;
    if (pp + 2 > bytes.length) continue;

    const numRows = u16le(bytes, pp);
    pp += 2;

    const clampedRows = Math.min(numRows, 256);
    if (clampedRows === 0) continue;

    // Build cell grid
    const cellGrid: TrackerCell[][] = Array.from({ length: clampedRows }, (): TrackerCell[] =>
      Array.from({ length: numChannels }, (): TrackerCell => ({
        note: 0, instrument: 0, volume: 0,
        effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
      }))
    );

    for (let row = 0; row < clampedRows; row++) {
      if (pp + 2 > bytes.length) break;
      const rowSize = u16le(bytes, pp);
      pp += 2;
      if (rowSize <= 2) continue;

      const rowEnd = pp + (rowSize - 2);
      if (rowEnd > bytes.length) break;

      while (pp + 2 <= rowEnd) {
        const flagByte = u8(bytes, pp);
        const channel  = u8(bytes, pp + 1);
        pp += 2;

        const ch = Math.min(channel, numChannels - 1);
        const cell = cellGrid[row][ch];

        if (flagByte & 0x80) { // note
          if (pp < rowEnd) {
            cell.note = convertNewPSMNote(u8(bytes, pp++), sinariaFormat);
          }
        }
        if (flagByte & 0x40) { // instrument
          if (pp < rowEnd) {
            cell.instrument = u8(bytes, pp++) + 1;
          }
        }
        if (flagByte & 0x20) { // volume
          if (pp < rowEnd) {
            const vol = u8(bytes, pp++);
            // PSM vol 0..127 → 0..64: (min(vol,127)+1)/2
            cell.volume = Math.round((Math.min(vol, 127) + 1) / 2);
          }
        }
        if (flagByte & 0x10) { // effect
          if (pp + 2 <= rowEnd) {
            const cmd   = u8(bytes, pp);
            const param = u8(bytes, pp + 1);
            pp += 2;
            const { effTyp, eff, extra } = convertNewPSMEffect(cmd, param, sinariaFormat, bytes, pp);
            cell.effTyp = effTyp;
            cell.eff    = eff;
            pp += extra;
            if (pp > rowEnd) pp = rowEnd;
          }
        }
      }

      pp = rowEnd;
    }

    // Build pattern object
    const channels: ChannelData[] = Array.from({ length: numChannels }, (_, ch) => {
      // Pan: convert 0..255 center=128 → -100..100 center=0
      const rawPan = channelPanning[ch] ?? 128;
      const pan = Math.round(((rawPan - 128) / 128) * 100);
      return {
        id:           `channel-${ch}`,
        name:         `Channel ${ch + 1}`,
        muted:        false,
        solo:         false,
        collapsed:    false,
        volume:       100,
        pan,
        instrumentId: null,
        color:        null,
        rows:         cellGrid.map(r => r[ch]),
      };
    });

    patternMap.set(patIndex, {
      id:      `pattern-${patIndex}`,
      name:    `Pattern ${patIndex}`,
      length:  clampedRows,
      channels,
      importMetadata: {
        sourceFormat:            sinariaFormat ? 'PSM (Sinaria)' : 'PSM',
        sourceFile:              filename,
        importedAt:              new Date().toISOString(),
        originalChannelCount:    numChannels,
        originalPatternCount:    pbodChunks.length,
        originalInstrumentCount: instruments.length,
      },
    });
  }

  // Build final pattern list, filling gaps with empty patterns
  const maxPatIdx = Math.max(...songPositions, 0);
  const patterns: Pattern[] = [];
  for (let i = 0; i <= maxPatIdx; i++) {
    const existing = patternMap.get(i);
    if (existing) {
      patterns.push(existing);
    } else {
      patterns.push(makeEmptyPatternPSM(i, 64, numChannels, filename, pbodChunks.length, instruments.length));
    }
  }

  if (patterns.length === 0) {
    patterns.push(makeEmptyPatternPSM(0, 64, numChannels, filename, 0, instruments.length));
  }
  if (instruments.length === 0) {
    instruments.push({
      id:        1,
      name:      'Sample 1',
      type:      'sample' as const,
      synthType: 'Sampler' as const,
      effects:   [],
      volume:    0,
      pan:       0,
    } as unknown as InstrumentConfig);
  }

  const baseName = filename.replace(/\.[^/.]+$/, '');

  return {
    name:            songName.trim() || baseName,
    format:          'S3M' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength:      songPositions.length,
    restartPosition: Math.min(restartPosition, songPositions.length - 1),
    numChannels,
    initialSpeed,
    initialBPM,
    linearPeriods:   false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PSM16
// ─────────────────────────────────────────────────────────────────────────────

/** PSM16FileHeader offsets:
 *  0:   formatID[4]    = "PSM\xFE"
 *  4:   songName[59]
 *  63:  lineEnd        = 0x1A
 *  64:  songType
 *  65:  formatVersion  = 0x10 or 0x01
 *  66:  patternVersion = 0 (only supported)
 *  67:  songSpeed
 *  68:  songTempo
 *  69:  masterVolume
 *  70:  songLength     uint16LE
 *  72:  songOrders     uint16LE
 *  74:  numPatterns    uint16LE
 *  76:  numSamples     uint16LE
 *  78:  numChannelsPlay uint16LE
 *  80:  numChannelsReal uint16LE
 *  82:  orderOffset    uint32LE
 *  86:  panOffset      uint32LE
 *  90:  patOffset      uint32LE
 *  94:  smpOffset      uint32LE
 *  98:  commentsOffset uint32LE
 * 102:  patSize        uint32LE
 * 106:  filler[40]
 * Total: 146 bytes
 */

function _parsePSM16(bytes: Uint8Array, filename: string): TrackerSong | null {
  if (bytes.length < 146) return null;
  if (!magicMatch(bytes, 0, 'PSM\xFE')) return null;
  if (u8(bytes, 63) !== 0x1A) return null;
  const formatVersion  = u8(bytes, 65);
  if (formatVersion !== 0x10 && formatVersion !== 0x01) return null;
  const patternVersion = u8(bytes, 66);
  if (patternVersion !== 0) return null;
  const songType = u8(bytes, 64);
  if ((songType & 3) !== 0) return null;

  const songName        = readSpacePadded(bytes, 4, 59);
  const songSpeed       = u8(bytes, 67);
  const songTempo       = u8(bytes, 68);
  let   masterVolume    = u8(bytes, 69);
  if (masterVolume === 255) masterVolume = 48;
  const songLength      = u16le(bytes, 70);
  const songOrders      = u16le(bytes, 72);
  const numPatterns     = u16le(bytes, 74);
  const numSamples      = u16le(bytes, 76);
  const numChannelsPlay = u16le(bytes, 78);
  const numChannelsReal = u16le(bytes, 80);
  const orderOffset     = u32le(bytes, 82);
  const panOffset       = u32le(bytes, 86);
  const patOffset       = u32le(bytes, 90);
  const smpOffset       = u32le(bytes, 94);

  if (numChannelsPlay > 32 || numChannelsReal > 32) return null;
  const numChannels = Math.max(numChannelsPlay, numChannelsReal);
  if (numChannels === 0) return null;

  // ── Orders ─────────────────────────────────────────────────────────────────
  const songPositions: number[] = [];
  if (orderOffset > 4) {
    const ordPos = orderOffset - 4;
    if (ordPos + 4 + songOrders <= bytes.length && magicMatch(bytes, ordPos, 'PORD')) {
      for (let i = 0; i < songOrders; i++) {
        songPositions.push(u8(bytes, ordPos + 4 + i));
      }
    }
  }
  if (songPositions.length === 0) {
    // Use songLength as fallback
    for (let i = 0; i < Math.min(songLength, 256); i++) songPositions.push(i);
  }

  // ── Channel panning ────────────────────────────────────────────────────────
  const channelPanning: number[] = Array(numChannels).fill(128);
  if (panOffset > 4) {
    const panPos = panOffset - 4;
    if (panPos + 4 <= bytes.length && magicMatch(bytes, panPos, 'PPAN')) {
      for (let i = 0; i < numChannels; i++) {
        if (panPos + 4 + i >= bytes.length) break;
        const raw = u8(bytes, panPos + 4 + i) & 0x0F;
        // 15 = left, 0 = right — map to 0..255 where 128=center
        channelPanning[i] = Math.round(((15 - raw) * 256 + 8) / 15);
      }
    }
  }

  // ── Samples ────────────────────────────────────────────────────────────────
  // PSM16SampleHeader is 64 bytes:
  //   filename[13], name[24], offset(4), memoffset(4), sampleNumber(2),
  //   flags(1), length(4), loopStart(4), loopEnd(4), finetune(1), volume(1), c2freq(2)
  // Total: 13+24+4+4+2+1+4+4+4+1+1+2 = 64 bytes
  const SAMPLE_HDR_SIZE = 64;
  const instruments: InstrumentConfig[] = [];

  if (smpOffset > 4) {
    const smpPos = smpOffset - 4;
    if (smpPos + 4 <= bytes.length && magicMatch(bytes, smpPos, 'PSAH')) {
      let sp = smpPos + 4;
      for (let s = 0; s < numSamples; s++) {
        if (sp + SAMPLE_HDR_SIZE > bytes.length) break;
        const sName      = readString(bytes, sp + 13, 24);
        const smpNumber  = u16le(bytes, sp + 41);
        sp += SAMPLE_HDR_SIZE;

        if (smpNumber > 0 && smpNumber < 256) {
          // Extend array if needed
          while (instruments.length < smpNumber) {
            const idx = instruments.length + 1;
            instruments.push({
              id:        idx,
              name:      `Sample ${idx}`,
              type:      'sample' as const,
              synthType: 'Sampler' as const,
              effects:   [],
              volume:    0,
              pan:       0,
            } as unknown as InstrumentConfig);
          }
          instruments[smpNumber - 1] = {
            id:        smpNumber,
            name:      sName || `Sample ${smpNumber}`,
            type:      'sample' as const,
            synthType: 'Sampler' as const,
            effects:   [],
            volume:    0,
            pan:       0,
          } as unknown as InstrumentConfig;
        }
      }
    }
  }

  // ── Patterns ────────────────────────────────────────────────────────────────
  // PSM16PatternHeader (4 bytes): size uint16LE, numRows uint8, numChans uint8
  // Pattern data is padded to 16 bytes.
  // Cell event bytes: chnFlag (0 = end-of-row), then note+instr, vol, effect
  const PSM16_PAT_HDR = 4;

  const patterns: Pattern[] = [];

  if (patOffset > 4) {
    const patPos = patOffset - 4;
    if (patPos + 4 <= bytes.length && magicMatch(bytes, patPos, 'PPAT')) {
      let pp = patPos + 4;

      for (let pat = 0; pat < numPatterns; pat++) {
        if (pp + PSM16_PAT_HDR > bytes.length) break;
        const patSize   = u16le(bytes, pp);
        const numRows   = u8(bytes, pp + 2);
        // const numChans  = u8(bytes, pp + 3); // not used — we use global numChannels
        pp += PSM16_PAT_HDR;

        if (patSize < PSM16_PAT_HDR) continue;

        // Pattern is padded to 16 bytes
        const bodySize = ((patSize + 15) & ~15) - PSM16_PAT_HDR;
        const bodyEnd  = pp + bodySize;
        if (bodyEnd > bytes.length) break;

        const clampedRows = Math.min(numRows, 256);
        const cellGrid: TrackerCell[][] = Array.from({ length: clampedRows }, (): TrackerCell[] =>
          Array.from({ length: numChannels }, (): TrackerCell => ({
            note: 0, instrument: 0, volume: 0,
            effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
          }))
        );

        let curRow = 0;
        let cp = pp;

        // Channel flag bits: bits 0-4 = channel (0-31), bit 7 = note+instr, bit 6 = vol, bit 5 = effect
        const CHAN_MASK  = 0x1F;
        const NOTE_FLAG  = 0x80;
        const VOL_FLAG   = 0x40;
        const EFF_FLAG   = 0x20;

        while (cp < bodyEnd && curRow < clampedRows) {
          const chnFlag = u8(bytes, cp++);
          if (chnFlag === 0) {
            curRow++;
            continue;
          }
          const ch = Math.min(chnFlag & CHAN_MASK, numChannels - 1);
          const cell = cellGrid[curRow][ch];

          if (chnFlag & NOTE_FLAG) {
            if (cp + 2 > bodyEnd) break;
            const rawNote = u8(bytes, cp++);
            const instr   = u8(bytes, cp++);
            cell.note      = Math.max(1, Math.min(120, rawNote + 36));
            cell.instrument = instr;
          }
          if (chnFlag & VOL_FLAG) {
            if (cp >= bodyEnd) break;
            const vol = u8(bytes, cp++);
            cell.volume = Math.min(64, vol);
          }
          if (chnFlag & EFF_FLAG) {
            if (cp + 2 > bodyEnd) break;
            const cmd   = u8(bytes, cp++);
            const param = u8(bytes, cp++);
            const { effTyp, eff } = convertPSM16Effect(cmd, param, bytes, cp);
            cell.effTyp = effTyp;
            cell.eff    = eff;
            // Check for 3-byte offset commands that consumed an extra byte
            if (cmd === 0x28) cp += 2; // already consumed above but re-consumed in function
          }
        }

        pp = bodyEnd;

        const channels: ChannelData[] = Array.from({ length: numChannels }, (_, ch) => {
          const rawPan = channelPanning[ch] ?? 128;
          const pan = Math.round(((rawPan - 128) / 128) * 100);
          return {
            id:           `channel-${ch}`,
            name:         `Channel ${ch + 1}`,
            muted:        false,
            solo:         false,
            collapsed:    false,
            volume:       100,
            pan,
            instrumentId: null,
            color:        null,
            rows:         cellGrid.map(r => r[ch]),
          };
        });

        patterns.push({
          id:      `pattern-${pat}`,
          name:    `Pattern ${pat}`,
          length:  clampedRows,
          channels,
          importMetadata: {
            sourceFormat:            'PSM16',
            sourceFile:              filename,
            importedAt:              new Date().toISOString(),
            originalChannelCount:    numChannels,
            originalPatternCount:    numPatterns,
            originalInstrumentCount: instruments.length,
          },
        });
      }
    }
  }

  if (patterns.length === 0) {
    patterns.push(makeEmptyPatternPSM(0, 64, numChannels, filename, 0, instruments.length));
  }
  if (instruments.length === 0) {
    instruments.push({
      id:        1,
      name:      'Sample 1',
      type:      'sample' as const,
      synthType: 'Sampler' as const,
      effects:   [],
      volume:    0,
      pan:       0,
    } as unknown as InstrumentConfig);
  }

  // Clamp song positions to available patterns
  const validPositions = songPositions.filter(p => p < patterns.length);
  const finalPositions = validPositions.length > 0 ? validPositions : [0];

  const baseName = filename.replace(/\.[^/.]+$/, '');

  return {
    name:            songName.trim() || baseName,
    format:          'S3M' as TrackerFormat,
    patterns,
    instruments,
    songPositions:   finalPositions,
    songLength:      finalPositions.length,
    restartPosition: 0,
    numChannels,
    initialSpeed:    Math.max(1, songSpeed),
    initialBPM:      Math.max(32, songTempo),
    linearPeriods:   false,
  };
}

/** Convert PSM16 effect to (effTyp, eff).
 *  PSM16 effect list is similar to new PSM but shifted by ~1 and missing some commands.
 */
function convertPSM16Effect(cmd: number, param: number, _bytes: Uint8Array, _pos: number): { effTyp: number; eff: number } {
  switch (cmd) {
    // Volume slides
    case 0x01: return { effTyp: 0x0A, eff: (param << 4) | 0x0F }; // fine volslide up
    case 0x02: return { effTyp: 0x0A, eff: (param << 4) & 0xF0 }; // volslide up
    case 0x03: return { effTyp: 0x0A, eff: 0xF0 | param };         // fine volslide down
    case 0x04: return { effTyp: 0x0A, eff: param & 0x0F };         // volslide down

    // Portamento
    case 0x0A: return { effTyp: 0x01, eff: 0xF0 | param };         // fine porta up
    case 0x0B: return { effTyp: 0x01, eff: param };                 // porta up
    case 0x0C: return { effTyp: 0x02, eff: param | 0xF0 };         // fine porta down
    case 0x0D: return { effTyp: 0x02, eff: param };                 // porta down
    case 0x0E: return { effTyp: 0x03, eff: param };                 // tone portamento
    case 0x0F: return { effTyp: 0x13, eff: 0x10 | (param & 0x0F) }; // glissando
    case 0x10: return { effTyp: 0x05, eff: param << 4 };            // tone porta + vol up
    case 0x11: return { effTyp: 0x05, eff: param & 0x0F };          // tone porta + vol dn

    // Vibrato
    case 0x14: return { effTyp: 0x04, eff: param };                 // vibrato
    case 0x15: return { effTyp: 0x13, eff: 0x30 | (param & 0x0F) }; // vib waveform
    case 0x16: return { effTyp: 0x06, eff: param << 4 };            // vib + vol up
    case 0x17: return { effTyp: 0x06, eff: param & 0x0F };          // vib + vol dn

    // Tremolo
    case 0x1E: return { effTyp: 0x07, eff: param };                 // tremolo
    case 0x1F: return { effTyp: 0x13, eff: 0x40 | (param & 0x0F) }; // trem waveform

    // Sample
    case 0x28: return { effTyp: 0x09, eff: param };                 // 3-byte offset (middle byte)
    case 0x29: return { effTyp: 0x1B, eff: param & 0x0F };          // retrigger
    case 0x2A: return { effTyp: 0x13, eff: 0xC0 | (param & 0x0F) }; // note cut
    case 0x2B: return { effTyp: 0x13, eff: 0xD0 | (param & 0x0F) }; // note delay

    // Position
    case 0x32: return { effTyp: 0x0B, eff: param };                 // position jump
    case 0x33: return { effTyp: 0x0D, eff: param };                 // pattern break
    case 0x34: return { effTyp: 0x13, eff: 0xB0 | (param & 0x0F) }; // loop
    case 0x35: return { effTyp: 0x13, eff: 0xE0 | (param & 0x0F) }; // pattern delay

    // Speed
    case 0x3C: return { effTyp: 0x0F, eff: param };                 // speed
    case 0x3D: return { effTyp: 0x0F, eff: param };                 // tempo

    // Misc
    case 0x46: return { effTyp: 0x00, eff: param };                 // arpeggio
    case 0x47: return { effTyp: 0x13, eff: 0x20 | (param & 0x0F) }; // finetune
    case 0x48: return { effTyp: 0x13, eff: 0x80 | (param & 0x0F) }; // balance

    default: return { effTyp: 0, eff: 0 };
  }
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function makeEmptyPatternPSM(
  idx: number,
  numRows: number,
  numChannels: number,
  filename: string,
  totalPats: number,
  numInstruments: number,
): Pattern {
  const emptyRow = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
  const channels: ChannelData[] = Array.from({ length: numChannels }, (_, ch) => ({
    id:           `channel-${ch}`,
    name:         `Channel ${ch + 1}`,
    muted:        false,
    solo:         false,
    collapsed:    false,
    volume:       100,
    pan:          0,
    instrumentId: null,
    color:        null,
    rows:         Array.from({ length: numRows }, emptyRow),
  }));
  return {
    id:      `pattern-${idx}`,
    name:    `Pattern ${idx}`,
    length:  numRows,
    channels,
    importMetadata: {
      sourceFormat:            'PSM',
      sourceFile:              filename,
      importedAt:              new Date().toISOString(),
      originalChannelCount:    numChannels,
      originalPatternCount:    totalPats,
      originalInstrumentCount: numInstruments,
    },
  };
}
