const PAULA_REG_LCH = 0;
const PAULA_REG_LCL = 1;
const PAULA_REG_PER = 3;
const PAULA_REG_VOL = 4;
const CHIP_RAM_MAX = 14675968;
class UADEFormatAnalyzer {
  engine;
  constructor(engine) {
    this.engine = engine;
  }
  /**
   * Drain the Paula log accumulated during the enhanced scan and correlate each
   * AUDxVOL/PER write's `sourceAddr` with the sample pointers known from `scanData`
   * to build `uadeChipRam` info on each instrument.
   *
   * Instruments that already have `uadeChipRam` set (native-route formats) are
   * left untouched.
   */
  async analyzeAndPopulate(instruments, scanData) {
    var _a;
    let log;
    try {
      log = await this.engine.getPaulaLog();
    } catch {
      return;
    }
    if (log.length === 0) return;
    const knownSamplePtrs = new Set(
      Object.keys(scanData.samples).map(Number)
    );
    const byTick = /* @__PURE__ */ new Map();
    for (const entry of log) {
      let arr = byTick.get(entry.tick);
      if (!arr) {
        arr = [];
        byTick.set(entry.tick, arr);
      }
      arr.push(entry);
    }
    const discoveries = /* @__PURE__ */ new Map();
    for (const [, entries] of byTick) {
      for (let ch = 0; ch < 4; ch++) {
        const chEntries = entries.filter((e) => e.channel === ch);
        const lchEntry = chEntries.find((e) => e.reg === PAULA_REG_LCH);
        const lclEntry = chEntries.find((e) => e.reg === PAULA_REG_LCL);
        const volEntry = chEntries.find((e) => e.reg === PAULA_REG_VOL);
        const perEntry = chEntries.find((e) => e.reg === PAULA_REG_PER);
        if (!lchEntry || !lclEntry) continue;
        const lc = (lchEntry.value << 16 | lclEntry.value) & 4294967294;
        if (lc === 0) continue;
        const knownPtr = findMatchingPtr(lc, knownSamplePtrs);
        if (knownPtr === null) continue;
        const volAddr = volEntry && isValidChipAddr(volEntry.sourceAddr) ? volEntry.sourceAddr : null;
        const perAddr = perEntry && isValidChipAddr(perEntry.sourceAddr) ? perEntry.sourceAddr : null;
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
    for (const instr of instruments) {
      if (instr.uadeChipRam && Object.keys(instr.uadeChipRam.sections).length > 0) continue;
      if (!((_a = instr.sample) == null ? void 0 : _a.uadeSamplePtr)) continue;
      const ptr = instr.sample.uadeSamplePtr;
      const disc = discoveries.get(ptr);
      if (!disc) continue;
      const sections = {};
      if (disc.volAddr !== null) sections["volume"] = disc.volAddr;
      if (disc.perAddr !== null) sections["period"] = disc.perAddr;
      sections["samplePtr"] = disc.lcAddr;
      const chipRam = {
        moduleBase: 0,
        // Unknown without further analysis
        moduleSize: 0,
        instrBase: disc.lcAddr,
        instrSize: 8,
        // Minimal — just the tracked bytes
        sections
      };
      instr.uadeChipRam = chipRam;
    }
  }
}
function isValidChipAddr(addr) {
  return addr > 0 && addr < CHIP_RAM_MAX;
}
function findMatchingPtr(lc, knownPtrs) {
  if (knownPtrs.has(lc)) return lc;
  for (const ptr of knownPtrs) {
    if (lc >= ptr && lc < ptr + 131072) return ptr;
  }
  return null;
}
export {
  UADEFormatAnalyzer
};
