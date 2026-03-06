/**
 * PreTrackerParser.ts - Parser for PreTracker (.prt) format modules
 *
 * PreTracker is a Commodore Amiga music tracker by Ratt that uses a simplified
 * 4-channel MOD-based format. PreTracker files are identified by magic bytes
 * "PRT" followed by a version byte (typically 0x1B for v1.x).
 *
 * Module Structure:
 * - Header: Song title (20 bytes), reserved (12 bytes)
 * - Pattern data: 4 channels × (up to 64 rows) × 4 bytes per note
 * - Sample data: Raw PCM audio follows patterns
 *
 * Phase 10: Minimal parser that extracts module metadata and creates
 * a TrackerModule structure. Full pattern/sample extraction deferred to Phase 12.
 */

import { TrackerModule, Instrument, Sample } from '../../types/tracker';

export class PreTrackerParser {
  /**
   * Parse PreTracker binary data and extract module metadata
   * @param data ArrayBuffer containing PreTracker file
   * @returns TrackerModule with minimal metadata
   */
  static parse(data: ArrayBuffer): TrackerModule {
    // Basic validation: PreTracker modules need at least a header
    // (magic bytes + song title + reserved = 36 bytes minimum)
    const MIN_SIZE = 36;
    if (data.byteLength < MIN_SIZE) {
      throw new Error(
        `Invalid PreTracker file: too small (${data.byteLength} bytes, minimum ${MIN_SIZE})`
      );
    }

    // For Phase 10, create minimal module structure.
    // Full format parsing deferred to Phase 12.

    const module: TrackerModule = {
      title: 'PreTracker Module',
      format: 'pretracker',
      bpm: 125,
      ticksPerLine: 6,
      channels: 4,
      orders: [0], // Single order for now
      patterns: [], // Empty - deferred to Phase 12
      instruments: this.extractInstruments(data),
      samples: this.extractSamples(data),
    };

    return module;
  }

  /**
   * Extract instrument metadata from PreTracker module
   * Phase 10: Returns stub instruments
   * @param data ArrayBuffer
   * @returns Array of instruments
   */
  private static extractInstruments(_data: ArrayBuffer): Instrument[] {
    // PreTracker instruments are minimal (mostly just sample references)
    // For Phase 10, create stubs; full extraction in Phase 12
    return [
      {
        id: 0,
        name: 'Instrument 1',
        type: 'sample',
        sample: 0,
      },
    ];
  }

  /**
   * Extract sample data from PreTracker module
   * Phase 10: Returns empty array
   * @param data ArrayBuffer
   * @returns Array of samples
   */
  private static extractSamples(_data: ArrayBuffer): Sample[] {
    // PreTracker samples are mostly just pointers in the module
    // For now, stub; full extraction deferred to Phase 12
    return [];
  }
}
