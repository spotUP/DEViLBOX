/**
 * PatternAccessor - Format-dispatching row accessor
 *
 * Abstracts the replayer and editors from knowing which data model is in use.
 * For classic (MOD/XM/IT/S3M), reads from flattened Pattern[].
 * For Furnace, reads from per-channel pattern pools via 2D order matrix.
 * For HivelyTracker, reads from reusable track pool with per-position transpose.
 */

import type {
  TrackerCell,
  Pattern,
  FurnaceNativeData,
  FurnaceRow,
  HivelyNativeData,
  HivelyNativeStep,
} from '@/types';
import { EMPTY_CELL } from '@/types';

export type AccessorMode = 'classic' | 'furnace' | 'hively';

export class PatternAccessor {
  private mode: AccessorMode = 'classic';

  // Classic data
  private patterns: Pattern[] = [];
  private songPositions: number[] = [];

  // Furnace native data
  private furnaceNative: FurnaceNativeData | null = null;

  // Hively native data
  private hivelyNative: HivelyNativeData | null = null;

  /**
   * Configure for classic (MOD/XM/IT/S3M) pattern access.
   */
  setClassic(patterns: Pattern[], songPositions: number[]): void {
    this.mode = 'classic';
    this.patterns = patterns;
    this.songPositions = songPositions;
    this.furnaceNative = null;
    this.hivelyNative = null;
  }

  /**
   * Configure for Furnace native pattern access.
   * Classic data is still kept for fallback (grid/pianoroll views).
   */
  setFurnace(native: FurnaceNativeData, patterns: Pattern[], songPositions: number[]): void {
    this.mode = 'furnace';
    this.furnaceNative = native;
    this.patterns = patterns;
    this.songPositions = songPositions;
    this.hivelyNative = null;
  }

  /**
   * Configure for HivelyTracker native pattern access.
   * Classic data is still kept for fallback (grid/pianoroll views).
   */
  setHively(native: HivelyNativeData, patterns: Pattern[], songPositions: number[]): void {
    this.mode = 'hively';
    this.hivelyNative = native;
    this.patterns = patterns;
    this.songPositions = songPositions;
    this.furnaceNative = null;
  }

  getMode(): AccessorMode {
    return this.mode;
  }

  /**
   * Get a row from the pattern data, dispatching based on format.
   * Returns a TrackerCell for the replayer to consume.
   */
  getRow(position: number, row: number, channel: number): TrackerCell {
    switch (this.mode) {
      case 'furnace':
        return this.getFurnaceRow(position, row, channel);
      case 'hively':
        return this.getHivelyRow(position, row, channel);
      default:
        return this.getClassicRow(position, row, channel);
    }
  }

  /**
   * Get the pattern length for a given position.
   */
  getPatternLength(position: number): number {
    switch (this.mode) {
      case 'furnace': {
        if (!this.furnaceNative) return 64;
        const sub = this.furnaceNative.subsongs[this.furnaceNative.activeSubsong];
        return sub?.patLen ?? 64;
      }
      case 'hively':
        return this.hivelyNative?.trackLength ?? 64;
      default: {
        const patNum = this.songPositions[position];
        return this.patterns[patNum]?.length ?? 64;
      }
    }
  }

  /**
   * Get the number of channels.
   */
  getChannelCount(): number {
    switch (this.mode) {
      case 'furnace': {
        if (!this.furnaceNative) return 0;
        const sub = this.furnaceNative.subsongs[this.furnaceNative.activeSubsong];
        return sub?.channels.length ?? 0;
      }
      case 'hively':
        return this.hivelyNative?.channels ?? 0;
      default: {
        const patNum = this.songPositions[0];
        return this.patterns[patNum]?.channels.length ?? 0;
      }
    }
  }

  /**
   * Get the order length (number of positions in the song).
   */
  getOrderLength(): number {
    switch (this.mode) {
      case 'furnace': {
        if (!this.furnaceNative) return 0;
        const sub = this.furnaceNative.subsongs[this.furnaceNative.activeSubsong];
        return sub?.ordersLen ?? 0;
      }
      case 'hively':
        return this.hivelyNative?.positions.length ?? 0;
      default:
        return this.songPositions.length;
    }
  }

  /**
   * Get the number of effect columns for a channel.
   */
  getEffectColumns(channel: number): number {
    switch (this.mode) {
      case 'furnace': {
        if (!this.furnaceNative) return 2;
        const sub = this.furnaceNative.subsongs[this.furnaceNative.activeSubsong];
        return sub?.channels[channel]?.effectCols ?? 2;
      }
      case 'hively':
        return 2; // HVL always has fx + fxb
      default:
        return 2; // Classic DEViLBOX: effTyp/eff + effTyp2/eff2
    }
  }

  // ── Classic Access ────────────────────────────

  private getClassicRow(position: number, row: number, channel: number): TrackerCell {
    const patNum = this.songPositions[position];
    const pattern = this.patterns[patNum];
    if (!pattern) return { ...EMPTY_CELL };
    const channelData = pattern.channels[channel];
    if (!channelData) return { ...EMPTY_CELL };
    return channelData.rows[row] ?? { ...EMPTY_CELL };
  }

  // ── Furnace Access ────────────────────────────

  private getFurnaceRow(position: number, row: number, channel: number): TrackerCell {
    if (!this.furnaceNative) return { ...EMPTY_CELL };
    const sub = this.furnaceNative.subsongs[this.furnaceNative.activeSubsong];
    if (!sub) return { ...EMPTY_CELL };

    // Get the pattern index for this channel at this position
    const patIdx = sub.orders[channel]?.[position];
    if (patIdx === undefined) return { ...EMPTY_CELL };

    // Get the pattern data from the channel's pattern pool
    const patData = sub.channels[channel]?.patterns.get(patIdx);
    if (!patData) return { ...EMPTY_CELL };

    const fRow = patData.rows[row];
    if (!fRow) return { ...EMPTY_CELL };

    return this.convertFurnaceRow(fRow);
  }

  /**
   * Convert a FurnaceRow to TrackerCell for the replayer.
   */
  private convertFurnaceRow(fRow: FurnaceRow): TrackerCell {
    // Map Furnace note values to XM note values
    let note = 0;
    if (fRow.note === -1 || fRow.note === 252) {
      note = 0; // Empty / null
    } else if (fRow.note === 253) {
      note = 97; // Note off
    } else if (fRow.note === 254 || fRow.note === 255) {
      note = 97; // Release / macro-release → treat as note off for now
    } else if (fRow.note >= 0 && fRow.note < 180) {
      // Furnace note: octave * 12 + semitone
      // XM note: (octave * 12) + semitone + 1, range 1-96
      note = Math.min(96, Math.max(1, fRow.note + 1));
    }

    // Map instrument (-1 = empty → 0, 0-based → 1-based for XM)
    const instrument = fRow.ins === -1 ? 0 : fRow.ins + 1;

    // Map volume (-1 = empty → 0, 0-127 → 0x10-0x50 volume column)
    let volume = 0;
    if (fRow.vol !== -1) {
      // Scale 0-127 to 0-64, then shift to XM volume column range 0x10-0x50
      volume = 0x10 + Math.round((fRow.vol / 127) * 64);
    }

    // Map effects (up to 2 effect pairs for XM compatibility)
    const eff0 = fRow.effects[0];
    const eff1 = fRow.effects[1];

    return {
      note,
      instrument,
      volume,
      effTyp: eff0?.cmd ?? 0,
      eff: eff0?.val ?? 0,
      effTyp2: eff1?.cmd ?? 0,
      eff2: eff1?.val ?? 0,
    };
  }

  // ── Hively Access ─────────────────────────────

  private getHivelyRow(position: number, row: number, channel: number): TrackerCell {
    if (!this.hivelyNative) return { ...EMPTY_CELL };

    const pos = this.hivelyNative.positions[position];
    if (!pos) return { ...EMPTY_CELL };

    const trackIdx = pos.track[channel];
    const transpose = pos.transpose[channel] ?? 0;

    const track = this.hivelyNative.tracks[trackIdx];
    if (!track) return { ...EMPTY_CELL };

    const step = track.steps[row];
    if (!step) return { ...EMPTY_CELL };

    return this.convertHivelyStep(step, transpose);
  }

  /**
   * Convert a HivelyNativeStep to TrackerCell, applying position transpose.
   */
  private convertHivelyStep(step: HivelyNativeStep, transpose: number): TrackerCell {
    // HVL note: 0=empty, 1-60 = C-0 to B-4
    // XM note: 0=empty, 1-96 = notes, 97=off
    let note = 0;
    if (step.note > 0 && step.note <= 60) {
      note = Math.min(96, Math.max(1, step.note + transpose));
    }

    // HVL instrument: 0=empty, 1-63
    const instrument = step.instrument;

    // Map HVL effects to XM effect space
    // HVL effects 0-15 map roughly to tracker effects
    const effTyp = step.fx;
    const eff = step.fxParam;
    const effTyp2 = step.fxb;
    const eff2 = step.fxbParam;

    return {
      note,
      instrument,
      volume: 0,
      effTyp,
      eff,
      effTyp2,
      eff2,
    };
  }
}
