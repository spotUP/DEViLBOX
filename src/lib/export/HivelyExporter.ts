/**
 * HivelyExporter.ts - Binary-compatible .hvl/.ahx exporter
 *
 * Takes a TrackerSong (with HivelySynth instruments and hivelyMeta) and produces
 * binary data that HivelyTracker can load.
 *
 * Pattern Matrix Reconstruction:
 * DEViLBOX stores flat combined patterns. For HVL export, we extract each channel's
 * column into a separate track, deduplicate tracks, and build the position list.
 */

import type { TrackerCell } from '../../types/tracker';
import type { HivelyConfig } from '../../types/instrument';
import type { TrackerSong } from '@/engine/TrackerReplayer';

export interface HivelyExportOptions {
  format?: 'hvl' | 'ahx';
  moduleName?: string;
}

export interface HivelyExportResult {
  data: Blob;
  warnings: string[];
  filename: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const textEncoder = new TextEncoder();

/**
 * Hash a track for deduplication. Returns a string key.
 */
function hashTrack(steps: TrackerCell[], trackLength: number): string {
  const parts: string[] = [];
  for (let i = 0; i < trackLength; i++) {
    const s = steps[i];
    if (!s || (s.note === 0 && s.instrument === 0 && s.effTyp === 0 && s.eff === 0 && s.effTyp2 === 0 && s.eff2 === 0)) {
      parts.push('0');
    } else {
      parts.push(`${s.note}:${s.instrument}:${s.effTyp}:${s.eff}:${s.effTyp2}:${s.eff2}:${s.volume || 0}:${s.flag1 || 0}:${s.flag2 || 0}`);
    }
  }
  return parts.join(',');
}

/**
 * Reverse-map XM effect back to HVL effect.
 */
function reverseMapEffect(effTyp: number, eff: number, flag1?: number, flag2?: number): { fx: number; fxParam: number } {
  // Check for HVL-specific effects stored in flags
  if (flag1 !== undefined && flag1 !== 0 && effTyp === 0 && eff === 0) {
    return { fx: 0x4, fxParam: flag1 }; // Filter Override
  }
  if (flag2 !== undefined && flag2 !== 0 && effTyp === 0 && eff === 0) {
    return { fx: 0x9, fxParam: flag2 }; // Square Offset
  }

  switch (effTyp) {
    case 0x01: return { fx: 0x1, fxParam: eff }; // Port Up
    case 0x02: return { fx: 0x2, fxParam: eff }; // Port Down
    case 0x03: return { fx: 0x3, fxParam: eff }; // Tone Port
    case 0x05: return { fx: 0x5, fxParam: eff }; // TP + Vol
    case 0x08: return { fx: 0x7, fxParam: eff }; // Pan
    case 0x0A: return { fx: 0xA, fxParam: eff }; // Vol Slide
    case 0x0B: return { fx: 0xB, fxParam: eff }; // Position Jump
    case 0x0D: return { fx: 0xD, fxParam: eff }; // Pattern Break
    case 0x0E: return { fx: 0xE, fxParam: eff }; // Extended
    case 0x0F: return { fx: 0xF, fxParam: eff }; // Set Speed
    default: return { fx: 0, fxParam: 0 };
  }
}

// ── HVL Exporter ─────────────────────────────────────────────────────────────

export function exportAsHively(
  song: TrackerSong,
  options: HivelyExportOptions = {}
): HivelyExportResult {
  const warnings: string[] = [];
  const exportFormat = options.format ?? 'hvl';
  const isAHX = exportFormat === 'ahx';
  const moduleName = options.moduleName ?? song.name ?? 'Untitled';

  const numChannels = song.numChannels;
  if (isAHX && numChannels > 4) {
    warnings.push(`AHX format supports max 4 channels. Song has ${numChannels} channels — truncating.`);
  }
  const channelsToExport = isAHX ? Math.min(numChannels, 4) : numChannels;

  // Determine track length from patterns (use first pattern's row count)
  const trackLength = song.patterns[0]?.length ?? 64;
  if (trackLength > 64) {
    warnings.push(`Track length ${trackLength} exceeds HVL max of 64. Truncating.`);
  }
  const trkl = Math.min(trackLength, 64);

  // ── Extract and deduplicate tracks ──
  // For each pattern position, extract each channel's column as a track
  const trackMap = new Map<string, { steps: TrackerCell[]; index: number }>();
  const positionTracks: Array<{ trackIndices: number[]; transposes: number[] }> = [];

  // Always include an empty track as track 0
  const emptySteps: TrackerCell[] = Array.from({ length: trkl }, () => ({
    note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
  }));
  const emptyHash = hashTrack(emptySteps, trkl);
  trackMap.set(emptyHash, { steps: emptySteps, index: 0 });

  for (const patIdx of song.songPositions) {
    const pat = song.patterns[patIdx];
    if (!pat) continue;

    const trackIndices: number[] = [];
    const transposes: number[] = [];

    for (let ch = 0; ch < channelsToExport; ch++) {
      const channel = pat.channels[ch];
      if (!channel) {
        trackIndices.push(0); // empty track
        transposes.push(0);
        continue;
      }

      const steps = channel.rows.slice(0, trkl);
      // Pad if needed
      while (steps.length < trkl) {
        steps.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
      }

      const hash = hashTrack(steps, trkl);
      if (!trackMap.has(hash)) {
        trackMap.set(hash, { steps, index: trackMap.size });
      }
      trackIndices.push(trackMap.get(hash)!.index);
      transposes.push(0); // No transpose detection (simple approach)
    }

    positionTracks.push({ trackIndices, transposes });
  }

  // Build ordered track list
  const orderedTracks: TrackerCell[][] = Array.from({ length: trackMap.size });
  for (const { steps, index } of trackMap.values()) {
    orderedTracks[index] = steps;
  }

  const trkn = orderedTracks.length - 1; // Track count (0-indexed, track 0 is separate)
  const posn = positionTracks.length;
  const hasBlankTrack0 = true; // Track 0 is our empty track

  // ── Gather instruments ──
  const hivelyInstruments: Array<{ name: string; config: HivelyConfig | null }> = [];
  for (const inst of song.instruments) {
    hivelyInstruments.push({
      name: inst.name,
      config: inst.hively ?? null,
    });
  }
  const insn = hivelyInstruments.length;

  // ── Speed/tempo metadata ──
  const meta = song.hivelyMeta;
  const speedMultiplier = meta?.speedMultiplier ?? 1;
  const stereoMode = meta?.stereoMode ?? 2;
  const mixGain = meta?.mixGain ?? ((76 * 256) / 100); // Default gain for stereo mode 2
  const version = meta?.version ?? 1;
  const ssn = 0; // Subsongs not supported in export yet

  // ── Build string table (song name + instrument names, null-terminated) ──
  const stringParts: string[] = [moduleName];
  for (const inst of hivelyInstruments) {
    stringParts.push(inst.name);
  }
  const stringTable = stringParts.map(s => s + '\0').join('');
  const stringBytes = textEncoder.encode(stringTable);

  // ── Calculate file size ──
  let fileSize = 0;

  if (isAHX) {
    // AHX header: 14 bytes + subsongs + positions + tracks + instruments + strings
    fileSize += 14;
    fileSize += ssn * 2;
    fileSize += posn * channelsToExport * 2;
    // Track data: 3 bytes per step (no compression in AHX)
    for (let i = 0; i <= trkn; i++) {
      if (hasBlankTrack0 && i === 0) continue; // blank track0 not written
      fileSize += trkl * 3;
    }
    // Instruments: 22 bytes + 4 bytes per plist entry
    for (const inst of hivelyInstruments) {
      const plistLen = inst.config?.performanceList?.entries?.length ?? 0;
      fileSize += 22 + plistLen * 4;
    }
    fileSize += stringBytes.length;
  } else {
    // HVL header: 16 bytes
    fileSize += 16;
    fileSize += ssn * 2;
    fileSize += posn * channelsToExport * 2;
    // Track data: variable (1 byte for empty steps, 5 bytes for non-empty)
    for (let i = 0; i <= trkn; i++) {
      if (hasBlankTrack0 && i === 0) continue;
      const steps = orderedTracks[i];
      for (let j = 0; j < trkl; j++) {
        const s = steps[j];
        if (!s || (s.note === 0 && s.instrument === 0 && s.volume === 0 && s.effTyp === 0 && s.eff === 0 && s.effTyp2 === 0 && s.eff2 === 0 && !s.flag1 && !s.flag2)) {
          fileSize += 1; // 0x3f empty
        } else {
          fileSize += 5;
        }
      }
    }
    // Instruments: 22 bytes + 5 bytes per plist entry
    for (const inst of hivelyInstruments) {
      const plistLen = inst.config?.performanceList?.entries?.length ?? 0;
      fileSize += 22 + plistLen * 5;
    }
    fileSize += stringBytes.length;
  }

  // ── Write binary data ──
  const buf = new Uint8Array(fileSize);
  let offset = 0;

  // String table offset = end of binary data (before strings)
  const stringOffset = fileSize - stringBytes.length;

  if (isAHX) {
    // ── AHX Header ──
    buf[0] = 0x54; buf[1] = 0x48; buf[2] = 0x58; // "THX"
    buf[3] = 2; // Version 2

    // String offset (big-endian)
    buf[4] = (stringOffset >> 8) & 0xff;
    buf[5] = stringOffset & 0xff;

    // Flags: speed multiplier + position count high bits + blank track0
    const smBits = ((speedMultiplier - 1) & 3) << 5;
    const posnHi = (posn >> 8) & 0x0f;
    const blankBit = hasBlankTrack0 ? 0x80 : 0;
    buf[6] = blankBit | smBits | posnHi;
    buf[7] = posn & 0xff;

    // Restart position (big-endian)
    buf[8] = (song.restartPosition >> 8) & 0xff;
    buf[9] = song.restartPosition & 0xff;

    buf[10] = trkl;
    buf[11] = trkn;
    buf[12] = insn;
    buf[13] = ssn;

    offset = 14;

    // Subsongs (none for now)

    // Position list
    for (const pos of positionTracks) {
      for (let ch = 0; ch < channelsToExport; ch++) {
        buf[offset++] = pos.trackIndices[ch] ?? 0;
        buf[offset++] = pos.transposes[ch] ?? 0;
      }
    }

    // Tracks (3 bytes per step for AHX)
    for (let i = 0; i <= trkn; i++) {
      if (hasBlankTrack0 && i === 0) continue;
      const steps = orderedTracks[i];
      for (let j = 0; j < trkl; j++) {
        const s = steps[j];
        const note = s?.note ?? 0;
        const inst = s?.instrument ?? 0;

        // Primary effect only for AHX
        const eff1 = reverseMapEffect(s?.effTyp ?? 0, s?.eff ?? 0, s?.flag1, s?.flag2);
        // Handle volume column → set volume effect
        if ((s?.volume ?? 0) > 0 && eff1.fx === 0 && eff1.fxParam === 0) {
          eff1.fx = 0xC;
          eff1.fxParam = s!.volume;
        }

        // AHX packing: 3 bytes
        // byte 0: note (bits 7-2) | instrument high (bits 1-0)
        // byte 1: instrument low (bits 7-4) | effect (bits 3-0)
        // byte 2: effect parameter
        buf[offset++] = ((note & 0x3f) << 2) | ((inst >> 4) & 0x3);
        buf[offset++] = ((inst & 0xf) << 4) | (eff1.fx & 0xf);
        buf[offset++] = eff1.fxParam & 0xff;
      }
    }
  } else {
    // ── HVL Header ──
    buf[0] = 0x48; buf[1] = 0x56; buf[2] = 0x4c; // "HVL"
    buf[3] = version & 1;

    // String offset (big-endian)
    buf[4] = (stringOffset >> 8) & 0xff;
    buf[5] = stringOffset & 0xff;

    // Flags
    const smBits = ((speedMultiplier - 1) & 3) << 5;
    const posnHi = (posn >> 8) & 0x0f;
    const blankBit = hasBlankTrack0 ? 0x80 : 0;
    buf[6] = blankBit | smBits | posnHi;
    buf[7] = posn & 0xff;

    // Channel count + restart position
    const chnnBits = ((channelsToExport - 4) & 0x3f) << 2;
    const restartHi = (song.restartPosition >> 8) & 0x3;
    buf[8] = chnnBits | restartHi;
    buf[9] = song.restartPosition & 0xff;

    buf[10] = trkl;
    buf[11] = trkn;
    buf[12] = insn;
    buf[13] = ssn;

    // Mix gain (big-endian, stored as gain*100/256)
    const gainStored = Math.round((mixGain * 100) / 256);
    buf[14] = gainStored & 0xff;
    buf[15] = stereoMode & 0x0f;

    offset = 16;

    // Subsongs (none)

    // Position list
    for (const pos of positionTracks) {
      for (let ch = 0; ch < channelsToExport; ch++) {
        buf[offset++] = pos.trackIndices[ch] ?? 0;
        buf[offset++] = pos.transposes[ch] ?? 0;
      }
    }

    // Tracks (variable-length for HVL)
    for (let i = 0; i <= trkn; i++) {
      if (hasBlankTrack0 && i === 0) continue;
      const steps = orderedTracks[i];
      for (let j = 0; j < trkl; j++) {
        const s = steps[j];
        const note = s?.note ?? 0;
        const inst = s?.instrument ?? 0;

        const eff1 = reverseMapEffect(s?.effTyp ?? 0, s?.eff ?? 0, s?.flag1, s?.flag2);
        const eff2 = reverseMapEffect(s?.effTyp2 ?? 0, s?.eff2 ?? 0);

        // Handle volume column → set volume effect
        if ((s?.volume ?? 0) > 0 && eff1.fx === 0 && eff1.fxParam === 0) {
          eff1.fx = 0xC;
          eff1.fxParam = s!.volume;
        }

        // Check if empty
        if (note === 0 && inst === 0 && eff1.fx === 0 && eff1.fxParam === 0 && eff2.fx === 0 && eff2.fxParam === 0) {
          buf[offset++] = 0x3f; // Empty step marker
        } else {
          // HVL: 5 bytes per step
          buf[offset++] = note & 0xff;
          buf[offset++] = inst & 0xff;
          buf[offset++] = ((eff1.fx & 0xf) << 4) | (eff2.fx & 0xf);
          buf[offset++] = eff1.fxParam & 0xff;
          buf[offset++] = eff2.fxParam & 0xff;
        }
      }
    }
  }

  // ── Instruments ──
  for (const inst of hivelyInstruments) {
    const cfg = inst.config;
    const volume = cfg?.volume ?? 64;
    const waveLen = cfg?.waveLength ?? 3;
    const filterSpeed = cfg?.filterSpeed ?? 0;
    const filterLower = cfg?.filterLowerLimit ?? 0;
    const filterUpper = cfg?.filterUpperLimit ?? 0;
    const squareLower = cfg?.squareLowerLimit ?? 0;
    const squareUpper = cfg?.squareUpperLimit ?? 0;
    const squareSpeed = cfg?.squareSpeed ?? 0;
    const vibDelay = cfg?.vibratoDelay ?? 0;
    const vibSpeed = cfg?.vibratoSpeed ?? 0;
    const vibDepth = cfg?.vibratoDepth ?? 0;
    const hardCut = cfg?.hardCutRelease ?? false;
    const hardCutFrames = cfg?.hardCutReleaseFrames ?? 0;
    const env = cfg?.envelope ?? { aFrames: 1, aVolume: 64, dFrames: 1, dVolume: 64, sFrames: 1, rFrames: 1, rVolume: 0 };
    const plist = cfg?.performanceList ?? { speed: 1, entries: [] };

    // Byte 0: volume
    buf[offset++] = volume & 0xff;
    // Byte 1: waveLength (bits 2-0) | filterSpeed upper (bits 7-3)
    buf[offset++] = ((filterSpeed & 0x1f) << 3) | (waveLen & 0x07);
    // Bytes 2-8: envelope
    buf[offset++] = env.aFrames & 0xff;
    buf[offset++] = env.aVolume & 0xff;
    buf[offset++] = env.dFrames & 0xff;
    buf[offset++] = env.dVolume & 0xff;
    buf[offset++] = env.sFrames & 0xff;
    buf[offset++] = env.rFrames & 0xff;
    buf[offset++] = env.rVolume & 0xff;
    // Bytes 9-11: reserved
    buf[offset++] = 0;
    buf[offset++] = 0;
    buf[offset++] = 0;
    // Byte 12: filterLowerLimit (bits 6-0) | filterSpeed bit 5 (bit 7)
    buf[offset++] = (filterLower & 0x7f) | (((filterSpeed >> 5) & 1) << 7);
    // Byte 13: vibratoDelay
    buf[offset++] = vibDelay & 0xff;
    // Byte 14: hardCutRelease (bit 7) | hardCutReleaseFrames (bits 6-4) | vibratoDepth (bits 3-0)
    buf[offset++] = (hardCut ? 0x80 : 0) | ((hardCutFrames & 0x07) << 4) | (vibDepth & 0x0f);
    // Byte 15: vibratoSpeed
    buf[offset++] = vibSpeed & 0xff;
    // Bytes 16-18: square parameters
    buf[offset++] = squareLower & 0xff;
    buf[offset++] = squareUpper & 0xff;
    buf[offset++] = squareSpeed & 0xff;
    // Byte 19: filterUpperLimit (bits 5-0)
    buf[offset++] = filterUpper & 0x3f;
    // Byte 20: plist speed
    buf[offset++] = plist.speed & 0xff;
    // Byte 21: plist length
    buf[offset++] = plist.entries.length & 0xff;

    // Performance list entries
    for (const entry of plist.entries) {
      if (isAHX) {
        // AHX: 4 bytes per plist entry
        // Byte 0: FX[1] (bits 7-5) | FX[0] (bits 4-2) | waveform high (bits 1-0)
        let fx1Packed = entry.fx[1] & 0x07;
        if (entry.fx[1] === 12) fx1Packed = 6;
        if (entry.fx[1] === 15) fx1Packed = 7;
        let fx0Packed = entry.fx[0] & 0x07;
        if (entry.fx[0] === 12) fx0Packed = 6;
        if (entry.fx[0] === 15) fx0Packed = 7;
        const waveHi = (entry.waveform >> 1) & 3;
        buf[offset++] = (fx1Packed << 5) | (fx0Packed << 2) | waveHi;
        // Byte 1: waveform low (bit 7) | fixed (bit 6) | note (bits 5-0)
        buf[offset++] = ((entry.waveform & 1) << 7) | ((entry.fixed ? 1 : 0) << 6) | (entry.note & 0x3f);
        buf[offset++] = entry.fxParam[0] & 0xff;
        buf[offset++] = entry.fxParam[1] & 0xff;
      } else {
        // HVL: 5 bytes per plist entry
        // Byte 0: FX[0] (bits 3-0)
        buf[offset++] = entry.fx[0] & 0x0f;
        // Byte 1: FX[1] (bits 6-3) | waveform (bits 2-0)
        buf[offset++] = ((entry.fx[1] & 0x0f) << 3) | (entry.waveform & 0x07);
        // Byte 2: fixed (bit 6) | note (bits 5-0)
        buf[offset++] = ((entry.fixed ? 1 : 0) << 6) | (entry.note & 0x3f);
        buf[offset++] = entry.fxParam[0] & 0xff;
        buf[offset++] = entry.fxParam[1] & 0xff;
      }
    }
  }

  // ── String table ──
  buf.set(stringBytes, stringOffset);

  const blob = new Blob([buf], { type: 'application/octet-stream' });
  const filename = `${moduleName.replace(/[^a-zA-Z0-9_-]/g, '_')}.${exportFormat}`;

  return { data: blob, warnings, filename };
}
