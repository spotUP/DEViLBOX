/**
 * UADEFormatAnalyzer.ts — Auto-discovers chip RAM parameter layouts for any UADE format.
 *
 * During the enhanced scan the worklet enables the Paula write log, which records
 * every AUDx register write together with the chip RAM address that sourced the
 * value (`g_uade_last_chip_read_addr` at write time).  After the scan completes,
 * this class drains the log and correlates each write's source address with the
 * sample pointers captured during the scan to produce per-instrument chip RAM maps.
 *
 * This works for ANY UADE-supported format without format-specific parsers.  The
 * resulting `uadeChipRam` info is consumed by the existing UADEChipEditor controls.
 */

import type { UADEEngine, PaulaLogEntry, UADEEnhancedScanData } from './UADEEngine';
import type { InstrumentConfig, UADEChipRamInfo } from '@/types/instrument';

/** Paula register indices (must match paula_log.h PAULA_REG_* constants) */
const PAULA_REG_LCH = 0;
const PAULA_REG_LCL = 1;
// const PAULA_REG_LEN = 2;  // not used in correlation yet
const PAULA_REG_PER = 3;
const PAULA_REG_VOL = 4;
// const PAULA_REG_DAT = 5;  // not used in correlation

/** Maximum chip RAM address considered valid (below custom chip registers at 0xDFF000) */
const CHIP_RAM_MAX = 0xDFF000;

export class UADEFormatAnalyzer {
  constructor(private engine: UADEEngine) {}

  /**
   * Drain the Paula log accumulated during the enhanced scan and correlate each
   * AUDxVOL/PER write's `sourceAddr` with the sample pointers known from `scanData`
   * to build `uadeChipRam` info on each instrument.
   *
   * Instruments that already have `uadeChipRam` set (native-route formats) are
   * left untouched.
   */
  async analyzeAndPopulate(
    instruments: InstrumentConfig[],
    scanData: UADEEnhancedScanData,
  ): Promise<void> {
    let log: PaulaLogEntry[];
    try {
      log = await this.engine.getPaulaLog();
    } catch {
      // Non-critical — older WASM without paula log support; silently skip.
      return;
    }

    if (log.length === 0) return;

    // Build a set of known sample pointers from the scan data.
    const knownSamplePtrs = new Set<number>(
      Object.keys(scanData.samples).map(Number),
    );

    // Group log entries by tick so we can correlate LC (sample pointer) writes
    // with VOL/PER writes that happen in the same "note trigger" tick window.
    const byTick = new Map<number, PaulaLogEntry[]>();
    for (const entry of log) {
      let arr = byTick.get(entry.tick);
      if (!arr) {
        arr = [];
        byTick.set(entry.tick, arr);
      }
      arr.push(entry);
    }

    // Per-instrument discoveries: instrSamplePtr → { volAddr, perAddr }
    const discoveries = new Map<
      number,
      { volAddr: number | null; perAddr: number | null; lcAddr: number }
    >();

    for (const [, entries] of byTick) {
      // For each channel, reconstruct AUDxLC from LCH+LCL writes in this tick.
      for (let ch = 0; ch < 4; ch++) {
        const chEntries = entries.filter(e => e.channel === ch);

        const lchEntry = chEntries.find(e => e.reg === PAULA_REG_LCH);
        const lclEntry = chEntries.find(e => e.reg === PAULA_REG_LCL);
        const volEntry = chEntries.find(e => e.reg === PAULA_REG_VOL);
        const perEntry = chEntries.find(e => e.reg === PAULA_REG_PER);

        if (!lchEntry || !lclEntry) continue;

        const lc = ((lchEntry.value << 16) | lclEntry.value) & 0xFFFFFFFE;
        if (lc === 0) continue;

        // Find which instrument this sample pointer maps to.
        const knownPtr = findMatchingPtr(lc, knownSamplePtrs);
        if (knownPtr === null) continue;

        // Collect source addresses, filtering out invalid ones.
        const volAddr =
          volEntry && isValidChipAddr(volEntry.sourceAddr)
            ? volEntry.sourceAddr
            : null;
        const perAddr =
          perEntry && isValidChipAddr(perEntry.sourceAddr)
            ? perEntry.sourceAddr
            : null;

        // Only update if we haven't seen this sample pointer yet, or if the new
        // data adds addresses we didn't have.
        const existing = discoveries.get(knownPtr);
        if (!existing) {
          discoveries.set(knownPtr, { volAddr, perAddr, lcAddr: lc });
        } else {
          if (volAddr !== null && existing.volAddr === null) {
            existing.volAddr = volAddr;
          }
          if (perAddr !== null && existing.perAddr === null) {
            existing.perAddr = perAddr;
          }
        }
      }
    }

    if (discoveries.size === 0) return;

    // Map sample pointer → instrument (using the same samplePtr stored in sample.uadeSamplePtr).
    for (const instr of instruments) {
      // Skip instruments that already have a fully-populated chip RAM map from a native parser.
      if (instr.uadeChipRam && Object.keys(instr.uadeChipRam.sections).length > 0) continue;
      // Skip non-sampler instruments.
      if (!instr.sample?.uadeSamplePtr) continue;

      const ptr = instr.sample.uadeSamplePtr;
      const disc = discoveries.get(ptr);
      if (!disc) continue;

      const sections: Record<string, number> = {};
      if (disc.volAddr !== null) sections['volume'] = disc.volAddr;
      if (disc.perAddr !== null) sections['period'] = disc.perAddr;
      sections['samplePtr'] = disc.lcAddr;

      const chipRam: UADEChipRamInfo = {
        moduleBase: 0,   // Unknown without further analysis
        moduleSize: 0,
        instrBase:  disc.lcAddr,
        instrSize:  8,   // Minimal — just the tracked bytes
        sections,
      };
      instr.uadeChipRam = chipRam;
    }
  }
}

/** Return `addr` if it is within the valid chip RAM range, else null. */
function isValidChipAddr(addr: number): boolean {
  return addr > 0 && addr < CHIP_RAM_MAX;
}

/**
 * Find a known sample pointer that matches `lc`.
 * Exact match first; also checks if `lc` is within a sample's range (loop reload case).
 */
function findMatchingPtr(lc: number, knownPtrs: Set<number>): number | null {
  if (knownPtrs.has(lc)) return lc;
  // Allow a small offset tolerance for loop-reload addressing.
  for (const ptr of knownPtrs) {
    if (lc >= ptr && lc < ptr + 0x20000) return ptr;
  }
  return null;
}
