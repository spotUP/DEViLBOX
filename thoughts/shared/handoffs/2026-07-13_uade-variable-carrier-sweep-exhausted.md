---
date: 2026-07-13
topic: uade-variable-format-raw-block-carrier-sweep
tags: [uade, editability, byte-exact, ratchet, variable-patterns, phase3]
status: implemented
---

# UADE variable-format raw-block carrier sweep — EXHAUSTED

> **UPDATE 2026-07-13 (later): SWEEP TERMINALLY COMPLETE.** After this handoff was
> written, two more formats previously flagged "carrier-impossible" were fixed via
> block-graph enumeration and **pushed**: steveTurner `fb038fb0b`, futurePlayer
> `0fe206d68` (origin/main now `0fe206d68`). Every format whose parser decodes real
> block/event structure is now byte-exact. The remaining **21 stubs + klystrack** hit
> a verified terminal wall: they are **compiled per-module 68k players** (each file is
> a raw 68k executable that is its own player — no fixed on-disk score layout). The
> UADE dynamic tracer (built `45b7568eb`) locates their read working-set but cannot
> mechanically decompose it (no monotonic score cursor — see
> `research/2026-07-12_uade-opaque-tracer-wall.md`), and sunTronic RE recon confirmed
> the class: editability would require per-*module* 68k decompilation for a still-
> non-editable result = forbidden. These formats already PLAY correctly via UADE
> (audio + native sample extraction). **No further work is worthwhile on this bucket.**
> Full detail: memory `project_uade_variable_carrier_sweep`.
>
> **UPDATE 2026-07-13 (later still): klystrack FIXED — sweep now 100% closed.** The
> one format wrongly filed as "WASM-managed, no real offsets" turned out to be a real
> linear chunked .kt stream; the JS parser had merely punted decoding to WASM. Mirrored
> `mus_load_song_RW` (klystrack-wasm/common/music.c) linearly in JS to recover each
> pattern's real [offset,size), applied the raw-block carrier: `f316804e0` klystrack
> 0.0000 → byte-exact 1.0 (87 patterns), validated by an EOF-cursor oracle. LOCAL/
> unpushed. **Every carrier-tractable UADE format is now byte-exact.** The remaining 21
> are compiled-per-module 68k players (terminal — play-only via UADE; would need
> per-module disassembly, not authorized). The byte-exact-editable sweep is DONE.

## Task

Standing `/loop` directive: **"keep going untill all formats are done"** — UADE Phase 3 byte-exact codec sweep. Make every UADE music format round-trip byte-exact in the `encoderRoundtrip` ratchet so modules are fully editable (unedited re-export = identical bytes).

Governing architectural decision (user-chosen earlier): **structural raw-block carrier** — variable-length pattern formats carry their original packed pattern-block bytes, emit verbatim when unedited, re-pack via the format's encoder when edited.

## Recent changes (this session, 2026-07-13)

Three formats moved lossy → byte-exact. All **LOCAL / unpushed** (deploy needs explicit user auth).

| Format | Ratchet before | after | Commit | Class |
|--------|---------------|-------|--------|-------|
| ams | 0.0286 | 1.0 | `8567ed63c` | whole-pattern, both parse paths (AMS1+AMS2) |
| hivelyHVL | 0.3037 | 1.0 | `eb1a39d00` | per-track |
| iffSmus | 0.0000 | 1.0 | `6d663696d` | per-channel |

Each: single-format ratchet diff, regression test in `test:ci` glob (fails-on-revert), `npm run type-check` clean, pre-commit `test:ci` passed.

Prior sessions (also unpushed) via same mechanism: xm, s3m, it, ult, stx, gdm, ptm, mdl, rtm, digiBoosterPro, + mod (grid). **14 commits unpushed** on `main` (`origin/main..HEAD`), oldest = `c0e1fe969 fix(mod)`.

## The mechanism (reference)

`UADEVariablePatternLayout` (in `src/engine/uade/UADEPatternEncoder.ts`) gained:
- `blockRawBytes?: Uint8Array[]` — original packed byte slice per block, from REAL file offsets
- `blockRows?: TrackerCell[][]` — deep-copied decoded baseline per block

`encodeVariableBlock(layout, fp, rows, channel)` returns `blockRawBytes[fp]` verbatim when `rowsUnedited(rows, blockRows[fp])`, else `layout.encoder.encodePattern(rows, channel)`. Helpers `cellFieldsEqual` / `rowsUnedited` compare note/instrument/volume/effTyp/eff/effTyp2/eff2.

Harness `roundTripVariable` (`src/engine/uade/__tests__/encoderRoundtrip.harness.test.ts:140`) **prefers `layout.blockRows[fp]`** as the rows source (line 151) → self-comparison → verbatim → byte-exact. Only counts blocks where `size > 0` (line 169).

Shared regression testkit: `src/lib/import/formats/__tests__/variableBlockCarrier.testkit.ts` — `describeVariableBlockCarrier(formatId, parseFn)` asserts (1) every unedited block reproduces byte-for-byte, (2) editing block cell 0 (`note = ((note%60)+25)`) → non-verbatim packer output. Pulls fixture via `ENCODER_FIXTURES.find(f => f.formatId === formatId)`. `ParseFn = (buffer: ArrayBuffer, filename: string) => TrackerSong | Promise<TrackerSong>`.

### Carrier snippet (whole-pattern)
Insert right before `const uadeVariableLayout: ... = {`:
```typescript
const blockRows: TrackerCell[][] = new Array(patFileAddrs.length);
const blockRawBytes: Uint8Array[] = new Array(patFileAddrs.length);
for (let fp = 0; fp < patFileAddrs.length; fp++) {
  blockRows[fp] = (patterns[fp]?.channels[0]?.rows ?? []).map((c) => ({ ...c }));
  blockRawBytes[fp] = bytes.slice(patFileAddrs[fp], patFileAddrs[fp] + patFileSizes[fp]);
}
```
Then add `blockRows,` + `blockRawBytes,` to the layout object. Per-track/channel variants build `blockRows[fp]` from that track/channel's decoded rows instead of `patterns[fp].channels[0]`.

## Critical references

- `src/engine/uade/UADEPatternEncoder.ts` — `encodeVariableBlock`, `rowsUnedited`, layout type.
- `src/engine/uade/__tests__/encoderRoundtrip.harness.test.ts:140` — `roundTripVariable`.
- `src/engine/uade/__tests__/encoderRoundtrip.ratchet.json` — results DB. Regenerate: `DEVILBOX_GEN_RATCHET=1 npx vitest run --config vite.config.ts src/engine/uade/__tests__/encoderRoundtrip.harness.test.ts`. Gate: byte-exact stays byte-exact, matchPct only improves.
- `src/lib/import/formats/__tests__/variableBlockCarrier.testkit.ts` — shared regression harness.
- This session's parser edits: `AMSParser.ts` (2 layouts ~1009 + ~1607), `HivelyParser.ts` (HVL layout ~802, `HivelyModule.rawBytes` field + set in `parseHVL`), `IffSmusParser.ts` (~629).

## Learnings

1. **`writeCellToChipRam` does NOT wire variable formats to runtime** — only fixed `uadePatternLayout` + TFMX. `rewriteVariablePattern` has no runtime caller. Carrier's value = codec FIDELITY measured by ratchet (unedited re-export byte-exact), which is exactly the scoped goal.
2. **HONESTY RULE** — carrier legit ONLY when: (1) offsets are REAL file positions, (2) size is a REAL block/record boundary, (3) carrier stores REAL bytes, (4) edits fall back to a real packer. If block sizes are FABRICATED (estimated), verbatim slice passes tautologically = **gaming = FORBIDDEN**.
3. **Verify agent NOT-candidate verdicts against the actual harness path.** An Explore agent flagged iffSmus NOT-a-candidate (pattern-synthesis misalignment: file has numCh TRAK chunks, patterns split 64-row). WRONG — harness ignores `trackMap` when `blockRows` present, so per-channel carrier (block = TRAK = channel, `blockRows[fp] = channelFlat[fp]`) works. Same skeptical re-check should apply to any future "NOT-candidate" call.
4. **HVL threading** — `buildHivelyPatternLayout(mod)` had no buffer in scope. Added `rawBytes?: Uint8Array` to `HivelyModule`, set `rawBytes: buf` in `parseHVL` return. Per-track blockRows decoded transpose=0 (canonical per-track view; positions apply transpose separately). AHX = separate fixed-layout path, untouched.
5. `version.json` ENOENT in vitest closeBundle output = known-harmless noise. Pre-commit `test:ci` slow (>2min) — commit lands but push may time out; re-run `git push` (pre-push only, fast).

## Remaining lossy formats — carrier EXHAUSTED

Every variable format with REAL per-block offsets+sizes is now byte-exact. Remaining lossy CANNOT use this carrier:

- **steveTurner** (`SteveTurnerParser.ts:608`) + **futurePlayer** (`FuturePlayerParser.ts:586`) — matchPct 0, 4 blocks. Pointer-graph replayers; `filePatternSizes` FABRICATED (`Math.max(numEvents*4, 64)`; source comments: "placeholder addresses" / "conservative estimate"). Carrier = tautological gaming, FORBIDDEN.
  - **PROBED 2026-07-13 (decisive):** neither has a per-voice/per-channel contiguous byte range. **futurePlayer** — each voice is a CALL-GRAPH: probe of `hybris.fp` shows voice 0 stitches rows from **1233 subroutine calls** spanning 0x1818–0x1ec1, many voices calling the SAME shared blocks (0x1818, 0x203c…). No contiguous voice block exists to slice; `[minTouched,maxTouched]` is an observed extent, not a structural boundary. **steveTurner** — each channel = an ordered position-list of SHARED blocks (`decodeChannel` walks a pos-list of block indices via `hdr.offtblOffset`); a channel's rows come from multiple shared blocks. Probe script: `scratchpad/fp_probe.mjs`.
  - **Honest fix is NOT a size-determination tweak — it's a layout RESTRUCTURE.** steveTurner: redefine file "pattern" = one BLOCK (real offset from offtbl, real size = next-block delta), carry block bytes, position-list = order; align harness to block-indexed not channel-step. futurePlayer: harder — flattening merged subroutine regions with args/loops; honest carrier = whole pattern-data region (union of touched bytes) with a full call-graph inverse encoder (does not exist). Both = fresh-context research+plan, NOT loop-tick.
- **klystrack** (`KlysParser.ts`, encode-parsed, 1357) — WASM-managed, FIXED layout, `patternDataFileOffset=0` (offsets computed by WASM callback). No file offsets to slice. Separate effort (extract real cell offsets).
- **21 decode-encode 256-cell stubs** — sunTronic, steveBarrett, specialFX, soundPlayer, sonicArrangerSas, seanConnolly, scumm, quartet, mikeDavies, markII, markCooksey, maniacsOfNoise, jesperOlsen, jasonPage, jasonBrooke, jankoMrsicFlogel, fredGray, desire, customMade, coreDesign, ashleyHogg. Generic `decodeMODCell` over raw bytes at offset 0 = fake grid. Carrier forbidden per prior full-scan finding.

## Next steps (ordered)

1. **futurePlayer / steveTurner real voice-stream sizing** (only remaining honest carrier path). Reverse-engineer stream termination: for FP, `voiceSeqPtrs` are code-relative — real size likely = `next voiceSeqPtr - this ptr`, or scan to an end-of-sequence opcode. If real (offset, size) pairs recoverable → drop the carrier honestly → byte-exact. Fresh-context format research task, NOT loop-tick code.
2. **klystrack** — extract real per-cell/per-pattern file offsets from the WASM path so a fixed-layout carrier (whole-cell, like the 256-stub-class fixes) or real offsets apply. Larger.
3. **256-cell stubs** — only path = UADE dynamic tracing (Task #5 territory) or decompiler experiment (Task #6, record-only). Both need research+plan phase. Do NOT carrier (gaming).
4. **PUSH** — 14 unpushed commits on `main`. Needs explicit user auth (`git push origin main` triggers CI+Hetzner deploy). Verify live via `version.json` buildHash after.

## Artifacts

- Memory: `memory/project_uade_variable_carrier_sweep.md` (mechanism + full format list + exhaustion boundary), indexed in `MEMORY.md` under "Upcoming / active".
- Related memories: `project_uade_stub_bucket_progress.md`, `project_uade_carrier_sweep_complete.md`, `project_uade_editability_todo.md`.
- Plan: `thoughts/shared/plans/2026-07-07-uade-full-native-editability.md` (Phase 3 = ratchet-driven lossy-codec fixes).

## Other notes

- Loop is dynamic-mode self-paced; ScheduleWakeup set (~1500s fallback) with prompt `/loop keep going untill all formats are done`. Next tick should tackle step 1 (futurePlayer sizing) in fresh context.
- Standing constraints: single-format ratchet diff per commit; every fix ships fails-on-revert regression in `test:ci`; NEVER edit shared `MODEncoder` (moves multiple ratchet entries — use local wrapper codecs); never `git add -A` / `--no-verify`; deploy needs explicit auth.
