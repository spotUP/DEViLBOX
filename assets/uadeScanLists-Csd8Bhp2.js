const SCAN_CRASH_EXTS = /* @__PURE__ */ new Set([
  "mon",
  // ManiacsOfNoise — enhanced scan crashes browser
  "sa",
  // SonicArranger compiled binary variant — JSR prolog, enhanced scan hangs
  "aps",
  // AProSys — ADRVPACK-packed binary; scan produces garbage rows
  "sas",
  // SonicArranger suffix-form compiled binary — scan crashes browser
  "mso",
  // Medley — enhanced scan crashes browser
  "ml",
  // Medley (alternate ext) — enhanced scan crashes browser
  "sun",
  // SunTronic/TSM — compiled 68k synth, enhanced scan corrupts engine
  "tsm",
  // SunTronic/TSM — suffix-form variant
  "thm",
  // ThomasHermann — scan crashes browser
  "sb",
  // SteveBarrett — scan crashes browser
  "ps"
  // PaulShields — scan crashes browser
]);
const SCAN_CRASH_PREFIXES = /* @__PURE__ */ new Set([
  "sas",
  // SonicArranger prefix-form — scan crashes browser
  "ash",
  // AshleyHogg — scan crashes browser
  "tsm",
  // SunTronic/TSM — scan corrupts engine state
  "thm",
  // ThomasHermann — scan crashes browser
  "sb",
  // SteveBarrett — scan crashes browser
  "ps"
  // PaulShields — scan crashes browser
]);
const SHORT_SCAN_EXTS = /* @__PURE__ */ new Set([
  "jpo",
  "jpold",
  "rh",
  "rhp",
  "mm4",
  "mm8",
  "sdata",
  "jd",
  "doda",
  "gray",
  "spl",
  "riff",
  "hd",
  "tw",
  "dz",
  "bss",
  "scn",
  "scumm",
  "rho",
  "dln",
  "core",
  "hot",
  "wb",
  "dh",
  "bd",
  "bds",
  "ex",
  "sm",
  "mok",
  "pvp",
  "dns",
  "vss",
  "synmod",
  "cus",
  "cust",
  "custom",
  "cm",
  "rk",
  "rkb",
  "mc",
  "mcr",
  "mco",
  // MarkCooksey
  "jmf",
  // JankoMrsicFlogel
  "kh",
  // KrisHatlelid
  "sng",
  // RichardJoseph (two-file .sng/.ins)
  "sjs",
  // SoundPlayer (two-file sjs.*+smp.*)
  "jpn",
  "jpnd",
  "jp"
  // JasonPage (two-file jpn.*+smp.*)
]);
const SHORT_SCAN_PREFIXES = /* @__PURE__ */ new Set([
  "dl_deli",
  "dln",
  "rh",
  "mm4",
  "mm8",
  "sdata",
  "jd",
  "doda",
  "gray",
  "fw",
  "spl",
  "riff",
  "hd",
  "tw",
  "dz",
  "bss",
  "scn",
  "scumm",
  "dns",
  "mk2",
  "mkii",
  "rho",
  "core",
  "hot",
  "wb",
  "dh",
  "bd",
  "bds",
  "ex",
  "sm",
  "mok",
  "pvp",
  "vss",
  "synmod",
  "cus",
  "cust",
  "custom",
  "cm",
  "rk",
  "rkb",
  "mc",
  "mcr",
  "mco",
  // MarkCooksey
  "jmf",
  // JankoMrsicFlogel
  "kh",
  // KrisHatlelid
  "mfp",
  // MagneticFieldsPacker
  "smp",
  // ThomasHermann companion prefix (smp.*)
  "sjs",
  // SoundPlayer
  "jpn",
  "jpnd",
  "jp",
  // JasonPage
  "sng"
  // RichardJoseph
]);
function shouldSkipScan(ext, prefix) {
  return SCAN_CRASH_EXTS.has(ext) || SCAN_CRASH_PREFIXES.has(prefix);
}
function isShortScan(ext, prefix) {
  return SHORT_SCAN_EXTS.has(ext) || SHORT_SCAN_PREFIXES.has(prefix);
}
export {
  SCAN_CRASH_EXTS,
  SCAN_CRASH_PREFIXES,
  SHORT_SCAN_EXTS,
  SHORT_SCAN_PREFIXES,
  isShortScan,
  shouldSkipScan
};
