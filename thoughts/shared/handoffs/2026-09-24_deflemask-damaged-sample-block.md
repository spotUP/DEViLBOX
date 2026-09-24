---
date: 2026-09-24
topic: DefleMask .dmf files that fail to load — damaged sample blocks
tags: [deflemask, dmf, furnace, wasm, file-import, jukebox]
status: implemented
---

# DefleMask .dmf load failures — root cause found, fix committed

## Resolution (second session, same day)

Committed. Beyond the plan below, the resumed session found and fixed three
more things, all measured:

- **`fmt::sprintf` was a pass-through stub** in both `stubs/fmt/printf.h` and
  `stubs/fileops_preempt.h`: every loader error built with it (142 call sites)
  reached the UI with its `%d` placeholders unfilled. The stub is now a small
  type-safe formatter; `fileops_preempt.h` includes it instead of duplicating it.
- **The zlib probe's complaint leaked into successful raw loads.** `load()`
  tries zlib first; on a file that is not zlib it records "incorrect header
  check", falls back to raw and succeeds — and the success path then reported
  the stale message as damage. `fileOpsCommon_patched.cpp` clears `lastError`
  in the `NotZlibException` catch.
- **Two pako pre-inflates in TS** (`FurnaceToSong.ts` and
  `FurnaceFileOps.ts`) predated the engine's own tolerant inflate (Apr 13 vs
  Apr 14) and were stricter than it: pako refuses 5 files the engine loads.
  Both removed, so the product path now equals the corpus-survey path.

Final survey: 1452 checksum-clean load, 308 damaged load (303 bad-checksum +
5 that pako could not inflate), 50 fail — all damaged before the sample block.
Regression test: `src/lib/import/__tests__/defleMaskDamagedSamples.test.ts`
(in `test:ci`), verified failing against HEAD's `dmf.cpp`. The warning reaches
the user as `notify.warning` from `parseFurnaceFileWasm`.


## Task

Close the last of the six jukebox format reports the owner raised. Four were
already fixed and pushed (`75c94925e` and earlier). Two remained:

1. `Darude - Sandstorm.dmf` fails to load — **this session's work**.
2. `lollypop-subgame 01.jo` needs `WantedTeam.bin`, which is not in the corpus.
   Nothing to do here until the file exists; the resolver is already wired for
   it (`c24b26c38`).

The owner said "proceed", so I took report 1.

## STOP — read this before building or committing

**The checked-out sources and the checked-in `.wasm` do not match.** The binary
at `public/furnace-fileops/FurnaceFileOps.wasm` (13:59 today) was built from the
`dmf.cpp` patch ONLY. Two later edits — `fileOpsCommon_patched.cpp` clearing
`lastError` at the top of `load()`, and `FurnaceFileOps.cpp` copying the engine
error into `g_errorBuf` on a SUCCESSFUL load — are on disk but **not compiled
in**. The rebuild that would have included them was interrupted.

First action on resuming:

```
cd furnace-fileops-wasm/build && emmake make -j8
```

It links straight into `public/furnace-fileops/`, takes about a minute, and
needs no cmake re-run. Then re-run the corpus survey below before committing
anything.

## The finding

The error was never about DMF version 24. That was **wrong** in the previous
ledger entry, and the entry naming `furnace-wasm/CMakeLists.txt` was reading the
wrong build directory entirely — `furnace-wasm` is the chips build. The DMF
loader is `furnace-fileops-wasm`, and its `CMakeLists.txt:45` has compiled
`fileOps/dmf.cpp` all along. Version 24 is inside `dmf.cpp`'s accepted range
(`>0x1b` is the rejection, line 117), and **739 version-24 files in the corpus
load without complaint.**

What actually happens: these files' zlib streams decompress to slightly fewer
bytes than were compressed. The deflate stream itself terminates cleanly and
consumes exactly `len-4` input bytes, leaving the 4-byte adler32 trailer — and
that trailer does not match. Everything up to the sample block reads correctly;
only the tail is short.

Measured on Sandstorm (decompressed size 855528):

```
sample 0  "darude sandstorm 2x.wav"     length 38888  data short by 1 byte
sample 1  "darude sandstorm 2x 2.wav"   length 39056  data short by 2 bytes
sample 2  "Darude-SandStorm Perc.wav"   length 24550  exact
sample 3  "ObermeimDMX.SD3.wav"         length  5014  exact
```

Sample 0's data block is 77775 bytes — an odd byte count for 16-bit data, which
cannot be right. One missing byte inside a sample makes every record after it
read as garbage: `dmf.cpp` read sample 1's length as 419430552, and the load
died with `EndOfFileException` → `lastError="incomplete file"` (`dmf.cpp:1209`).

### The correlation that settles it

Survey of all 1810 `.dmf` files under `public/data/songs/deflemask`, before any
fix:

| adler32 | result | has samples | count |
|---------|--------|-------------|-------|
| ok      | LOAD   | yes         | 503   |
| ok      | LOAD   | no          | 949   |
| BAD     | LOAD   | yes         | 40    |
| BAD     | FAIL   | yes         | 263   |
| BAD     | FAIL   | no          | 40    |
| inflate error | FAIL | —       | 15    |

**Every failure has a failed checksum. Not one checksum-clean file fails**, and
503 checksum-clean files carrying samples parse their sample blocks fine. The
sample-reading code is correct; the data is damaged. The bytes are not in the
file, so they cannot be recovered.

## The fix

`third-party/furnace-master/src/engine/fileOps/dmf.cpp` — the vendored copy is
edited in place, which is this repo's existing practice (`a668120fd` did the
same). Three changes inside the sample loop, all marked `DEViLBOX PATCH`:

1. Before each record, stop if fewer than 4 bytes remain.
2. An implausible length (the existing `length<0 || length>(1<<29L)` test) now
   **stops reading samples and keeps the song** instead of `return false`.
   `ds.sampleLen` is set to the number that survived.
3. Before the data read, the wanted byte count is clamped to what is left in
   the file, so a short final sample loses the end of one sound rather than the
   whole module.

After the loop, `lastError` is set to `"sample data is damaged — kept N of the
file's samples"` even though the load succeeds. `FurnaceFileOps.cpp` copies that
into `g_errorBuf` on success, `fileOpsCommon_patched.cpp` clears `lastError` at
the top of `load()` so a message from an earlier file cannot be mistaken for
this one's, and `src/lib/import/wasm/FurnaceFileOps.ts` returns it as a new
`loadWarning` field on `loadFurFileWasm`'s result.

### Result, measured

| | before | after |
|---|---|---|
| failures | 318 | 50 |
| `Darude - Sandstorm.dmf` | FAIL `incomplete file` | LOAD |
| checksum-clean files loading | 1452 | 1452 — no regression |

268 files recovered. The 50 that still fail are damaged **before** the sample
block: 11 report `file is corrupt or unreadable at effect columns` (the pattern
block), and 15 do not inflate at all. Those are a separate class and were not
touched.

## Critical references

- `third-party/furnace-master/src/engine/fileOps/dmf.cpp:910` — the sample loop,
  where all three patches live. `:117` is the version gate, `:1209` the
  `EndOfFileException` catch that produced the reported error.
- `furnace-fileops-wasm/CMakeLists.txt:45` — `dmf.cpp` is compiled; `:144` is the
  `EXPORTED_FUNCTIONS` list, which did **not** need changing (no new C symbol
  was added; the warning rides on the existing `fur_get_error`).
- `furnace-fileops-wasm/src/fileOpsCommon_patched.cpp:22` — `DivEngine::load`,
  the magic dispatch, and the pre-existing raw-deflate patch for bad checksums.
- `furnace-fileops-wasm/src/FurnaceFileOps.cpp:50` — `fur_load`.
- `src/lib/import/wasm/FurnaceFileOps.ts:151` — `loadFurFileWasm`, now returning
  `loadWarning`.
- `src/lib/import/ModuleLoader.ts:132` — the `.dmf` branch. **The warning is not
  surfaced to the user yet** (see Next Steps).
- `src/lib/import/formats/DefleMaskParser.ts` — a clean-room TS DMF parser
  covering versions 3-27. It parses Sandstorm's header, orders, instruments and
  patterns correctly, but **does not read samples at all**, so its success was
  not evidence the file was intact. `src/lib/import/parsers/DefleMaskToSong.ts`
  wraps it and has **no callers** — dead code, and a possible fallback if the
  WASM path ever needs one.

## Learnings

- **The vendored `third-party/furnace-master` is edited in place here.** There is
  also a `furnace-wasm/patches/*.patch` convention, but `dmf.cpp` has a prior
  in-tree edit, so in-tree is the established route for this file.
- **`furnace-wasm` and `furnace-fileops-wasm` are different builds.** The former
  is chips, the latter file parsing. The earlier claim that "no fileOps sources
  are compiled" came from grepping the chips build and is false for the loader.
- **The wasm can be driven from Node**, which is far faster than MCP for a corpus
  sweep. The build is web-only, so `locateFile` does not work — pass the bytes:
  `createFurnaceFileOps({ wasmBinary: fs.readFileSync(path) })`. The harness
  used is in the session scratchpad as `dmfprobe.mjs` / `dmfall.mjs`; it imports
  `FurnaceFileOps.js` through a `data:` URL with an appended `export default`.
- **`printf` works for instrumenting this build.** `stubs/ta-log.h` makes every
  `logD`/`logI`/`logE` a no-op, so adding milestone `printf("… tell=%d", (int)reader.tell())`
  calls and rebuilding is the way to find where a parse diverges. That is what
  located the sample block in about two builds.
- **A rebuild from the committed sources reproduced the shipped binary exactly**
  (`git status` clean after the first rebuild), so the build is deterministic
  and the binary was not stale.
- **A bad adler32 does not by itself prove corruption** — 40 files load fine
  with one. It took the odd-length sample block to prove data was actually
  missing.

## Next steps, in order

1. **Rebuild** (`cd furnace-fileops-wasm/build && emmake make -j8`) so the binary
   includes the `lastError` clearing and the success-path warning. Without it,
   `loadWarning` will always be empty.
2. **Re-run the corpus survey** and confirm the numbers above still hold —
   especially that the 1452 checksum-clean files all still load, since clearing
   `lastError` at the top of `load()` touches every format, not just DMF.
3. **Surface the warning.** `ModuleLoader.ts:132`'s `.dmf` branch should pass
   `loadWarning` through and raise `notify.warning(...)` so a partly-damaged file
   says so instead of loading silently short. This is the direct continuation of
   the owner's earlier ask for better reporting when songs fail to load.
4. **Write the regression test.** House rule: it must fail before the fix and
   pass after. The natural shape is a vitest case that feeds
   `Darude - Sandstorm.dmf` to `loadFurFileWasm` and asserts it loads with a
   non-empty `loadWarning` — but check first whether the WASM can be driven from
   the vitest environment, since the module is loaded through a `<script>` tag
   (`FurnaceFileOps.ts:19`). If not, test the pure part: a small fixture that
   exercises the clamp arithmetic, plus the Node harness kept as a tool.
5. **Type-check** (`npm run type-check`) — not yet run against the
   `loadWarning` addition.
6. **Commit and push.** Four files plus the rebuilt binary:
   `third-party/furnace-master/src/engine/fileOps/dmf.cpp`,
   `furnace-fileops-wasm/src/FurnaceFileOps.cpp`,
   `furnace-fileops-wasm/src/fileOpsCommon_patched.cpp`,
   `src/lib/import/wasm/FurnaceFileOps.ts`,
   `public/furnace-fileops/FurnaceFileOps.wasm` (and `.js` if it changed).
   Add files by name — the working tree also holds unrelated modified submodule
   pointers and an untracked `FXChainPlayer-Releases-1.3.11/` directory that must
   not be swept in.
7. **Ask the owner to listen.** Load `Darude - Sandstorm.dmf` in the tracker at
   `http://localhost:5174` and confirm it plays. A PASS is audible music with
   the FM parts intact; the PCM drums may be missing or cut short, which is
   expected — those bytes are not in the file.

## Other notes

- Still open from the six reports: `zrimay.dss` (Digital Sound Studio) needs the
  owner's ears — the reported delay is gone (16 ms to first audio, was 3.7 s),
  but whether audio and grid still drift is a listening call.
- Also still open and untouched: T08's remaining 17 engines, T14/T15 (need the
  X-Touch), T16-T21, T23-T27, and a listening sweep of the ~36 other
  `PAULA_SYNTH_TYPES` members for anything now **muffled**, which would mean
  double-filtering after `ef6f58954`.
- Two background shells are still running from earlier: the dev stack
  (`npm run dev:fullstack`) and the Maschine bridge. There is also a `Wait for
  run` until-loop whose target job has long finished — it can be stopped.
