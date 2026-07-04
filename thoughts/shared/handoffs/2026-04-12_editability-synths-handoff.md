---
date: 2026-04-12
topic: editability-expansion-synths-handoff
tags: [editability, synths, chip-ram, test-songs, registry]
status: final
---

# Editability Expansion + Synth Registry Handoff — 2026-04-12 (session 2)

## What Was Done

### 5 commits pushed to main:

1. **`bcb5208`** — 65 more formats editable + 3 demoscene synths registered
   - Added 57 compiled 68k + 8 newly-wired formats to `EDITABLE_FORMAT_LABELS` and `NATIVE_EXPORTABLE_LABELS`
   - SunTronic: added `nativeParser` to existing registry entry
   - GlueMon, Sean Connolly: promoted from prefix-only to full entries with `nativeParser`
   - Art and Magic, Mike Davies, Mark II, Sonic Arranger SAS, A-Pro-Sys: new entries via SimpleAmigaStubParser
   - Created `src/engine/registry/sdk/demoscene.ts` — WaveSabreSynth, OidosSynth, TunefishSynth in SynthRegistry
   - Editability: 81% → **92%** (521 → ~585 of 638)

2. **`a788fb8`** — Fixed chip RAM pattern reader frozen array mutation
   - `UADEChipRAMPatternReader.ts` — build new pattern objects via `.map()` and update via `store.loadPatterns()` instead of mutating frozen Zustand state

3. **`e8b5a6b`** — 166 test songs directory from Reference Music collection
   - `public/data/test-songs/` — one file per format, organized by slug

4. **`aaabae1`** — Added MOD, XM, IT, S3M, FUR, SID, VGM test songs
   - Total: **173 format directories**

5. **`15a27ba`** — Fixed pre-existing type errors blocking `dev.sh`
   - CheeseCutterControls, ChannelRoutedEffects, SidMonAdapter, GTUltraAdapter

### Infrastructure:
- Symlink at `server/data/public/songs/test-songs` → `public/data/test-songs/` makes files browsable from DEViLBOX UI
- Discovered `getPatternEncoder` registry is dead code — inline `encodeCell` on `uadePatternLayout` is what's actually used

## Key Finding: Chip RAM Reader Limitations

The chip RAM reader fix (frozen array bug) works — **no more crashes**. But patterns remain empty for compiled 68k formats because:

- `patternDataFileOffset: 0` in compiled formats is meaningless — the 68k replayer relocates data in chip RAM
- The reader works for packed MOD variants where pattern data is at a known file offset
- For compiled formats (Rob Hubbard, David Whittaker, etc.), the pattern data is embedded in machine code at unknown chip RAM addresses
- These formats rely on their native parser to extract patterns at parse time, NOT chip RAM reading post-load

**Root cause of empty patterns for compiled 68k:** The native parsers for most compiled formats create stub/empty patterns because they can't locate pattern data in the binary. The chip RAM reader was meant to fill these in after UADE unpacks, but the `patternDataFileOffset` doesn't map to chip RAM layout.

**To actually get patterns for compiled 68k formats**, you'd need to:
1. After UADE loads, scan chip RAM for pattern data signatures
2. Or reverse-engineer each format's 68k code to find where patterns are unpacked to
3. Or intercept the 68k CPU's memory writes during the first few ticks to identify pattern data regions

## Untested
- The 65 newly-editable formats — need browser verification that they show "editable" in the UI
- Smoke test still stale from April 11
- Soak test not started

## Next Steps (gig April 18 — 6 days)
1. **Browser-test editability** — load a few of the newly-editable formats, verify pattern editor shows "editable" badge
2. **Re-run smoke test** — `npx tsx tools/playback-smoke-test.ts --local-only`
3. **Soak test** — 2+ hour sustained playback test
4. **Consider**: is the chip RAM reader worth pursuing further for compiled 68k, or are those formats at ceiling?

## Key Files Changed
| File | Change |
|------|--------|
| `src/lib/import/FormatCapabilities.ts` | +65 labels in EDITABLE + EXPORTABLE sets |
| `src/lib/import/FormatRegistry.ts` | 7 new/promoted entries, 7 prefix-only entries removed |
| `src/engine/registry/sdk/demoscene.ts` | NEW — WaveSabre/Oidos/Tunefish registration |
| `src/engine/registry/sdk/index.ts` | Lazy loader for demoscene synths |
| `src/engine/uade/UADEChipRAMPatternReader.ts` | Immutable store update fix |
| `public/data/test-songs/` | 173 format directories with test files |
