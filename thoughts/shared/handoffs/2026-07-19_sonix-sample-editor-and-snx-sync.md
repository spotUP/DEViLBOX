---
date: 2026-07-19
topic: sonix-sample-editor-and-snx-sync
tags: [sonix, snx, tiny, sample-editor, playback-sync]
status: implemented
---

# Sonix sample-editor fix (SHIPPED) + SNX sync drift (FIXED via tick-grid rewrite, uncommitted)

## UPDATE 2026-07-19 (latest) — SNX scroll speed FIXED (6 ticks/row quantization)

After the tick-grid rewrite the cursor synced but "the patterns just fly by": 1 grid row = 1
CIA tick, and the SNX driver ticks ~49 Hz (native probe `scratchpad/snx_rate_probe.c`), so the
grid scrolled ~49 rows/s — unreadable. Root abstraction: Amiga trackers never show one row per
CIA tick; a display row spans `speed` ticks (default 6). So the SNX grid is now quantized to
**`SNX_TICKS_PER_ROW` = 6** CIA ticks per display row → snx.theme 888-tick cycle = 148 rows
(3 patterns) scrolling at ~8 rows/s. Single source of truth in `sonixPosition.ts`.

- `parseSnxVoiceStream`: walks the CIA-tick clock, records note-ons at their onset tick, then
  quantizes to rows of `SNX_TICKS_PER_ROW` ticks (`row = floor(onsetTick / 6)`; first onset in a
  row wins, sub-row grace notes drop — that detail belongs in the deferred effect columns).
- `encodeSnxVoiceStream`: inverse — each row emits `WAIT(SNX_TICKS_PER_ROW)`; empty runs coalesce
  to one WAIT. parse→encode→parse is grid-identical (verified all 4 snx.theme voices).
- `sonixGlobalRowToPosition(nativeCounter, ticksPerRow)`: divides the native tick counter by the
  divisor before the 64-row divmod. `SonixEngine` passes `SNX_TICKS_PER_ROW` for SNX, `1` for
  SMUS/TINY (their counter is already per-row). No C/WASM change — C emits raw ticks, TS interprets.
- Raw byte carrier still reproduces unedited streams verbatim → SNX + TINY ratchet still
  byte-exact 100% (`encoderRoundtrip.harness` green).
- Regressions updated/added (all in test:ci, fail-on-revert): `sonixSnxTickGrid.test.ts` (148 rows
  / quantized semantics / grace collapse / 0x0000 no-op / round-trip) + `sonixPosition.test.ts`
  (ticks-per-row divisor: tick 64 → row 10 songPos 0 not songPos 1; pattern boundary at 384 ticks;
  SMUS/TINY untouched). 13 tests green, type-check clean.
- **LIVE-VERIFIED** real Chrome: snx.theme loads 4 ch / **3 patterns** (was 14 under 1-row/tick) /
  5 instruments, audio plays peak 0.19, no console errors. NOT committed, NOT pushed.

## UPDATE 2026-07-19 (later session) — SNX sync FIXED (option b + tick-grid rewrite)

The position-feedback wiring (option b) was implemented AND the parser was rewritten to a
tick-grid so the cursor tracks native audio exactly. Root of the residual "scrolls super
fast" after the first feedback attempt: the SNX parser modelled **one grid row per opcode**,
but the driver only advances time (a CIA tick) on a **WAIT** opcode. Note-on / instrument /
volume / tempo / `0x0000` spend 0 ticks. So the parser inflated the grid (snx.theme: 1058
rows, channels unequal) vs the driver's real 889-tick cycle, and the free/native cursor raced
through phantom blank rows.

**Fix (tick-grid, data-format level — the correct abstraction):**
- `parseSnxVoiceStream` (SonixMusicDriverParser.ts) rewritten: opcodes accumulate into a
  `pending` cell; only `WAIT n` emits rows (1 trigger + n-1 holds); `0x0000` is a 0-tick
  no-op. Result: **all 4 snx.theme voices = 888 rows, aligned** (native probe: driver cycle
  = 889 ticks / display_row 0..888; grid holds the 888 real rows 0..887, the 888 is a 1-tick
  end-of-loop wrap). `parseSnxVoiceStream` now exported for the regression.
- `encodeSnxVoiceStream` (SonixMusicDriverEncoder.ts) rewritten as the tick-grid inverse:
  note + following hold rows → NOTE word + one `WAIT(duration)`; rest run → bare WAIT; a
  single empty row is WAIT 1 (`0xC001`), **never** `0x0000` (0-tick under the new parser).
  Raw-block carrier still emits unedited streams verbatim → ratchet stays byte-exact
  (harness green; `sonixMusicDriver` + `sonixMusicDriverTiny` still `byteExact:true`).
- SMUS (`IffSmusParser`) + TINY (`parseTinyVoiceStream`) were **already tick-coherent**
  (duration-expanded rows; WASM `display_row++` per note-step/beat matches). No C change,
  no WASM rebuild needed this session.
- Regression `src/lib/import/formats/__tests__/sonixSnxTickGrid.test.ts` (in test:ci,
  fails-on-revert verified — 4/4 fail on the phantom-row model): (1) all 4 voices equal &
  ==888; (2) note+WAIT n = n rows; (3) `0x0000` emits no row; (4) parse→encode→parse
  grid-identical over real snx.theme.
- Native probe (throwaway) `scratchpad/snx_ticks_probe.c` compiled sonix.c directly to
  measure the 889-tick cycle ground truth.

**Type-check clean. All sonix suites green (25 tests). NOT committed, NOT pushed.**
Only remaining check: **live MCP in real Chrome** (browser was not connected this session) —
load snx.theme, confirm cursor now tracks audio, then `stop`.

---

# Sonix sample-editor fix (SHIPPED) + SNX sync drift (root-caused, unfixed) — original entry

## Task(s)

1. **(DONE, PUSHED)** Sample-based Sonix instruments dead-ended at "This instrument
   has no Sonix synth parameters (sample-based instrument)." when clicking Edit.
   Make them route to the normal editable sample editor.
2. **(DONE — no fix needed)** "if its the same for suntronic fix it there as well" —
   SunTronic sample instruments already get `synthType:'Sampler'` (correct route);
   its dead-end is a separate SYNTH-instrument routing gap, out of scope.
3. **(DONE)** Verify SNX loads + plays after the change. Confirmed audible.
4. **(ROOT-CAUSED, NO FIX YET)** "it looped now but the patterns dont feel synced" —
   SNX visual pattern cursor drifts from the audio.

## Recent Changes (this session)

- **Commit `f6bebb5c8`** fix(sonix): read full TINY instrument-name table across
  empty-slot gaps.
- **Commit `92fb40f4b`** fix(sonix): route sample-based instruments to the sample
  editor. **Both PUSHED to origin/main.** (verified: `origin/main == HEAD == 92fb40f4b`)
  - `src/lib/import/formats/SonixMusicDriverParser.ts`:
    - New helpers: `buildSonixCompanionLookup`, `readSnxTailNames`,
      `resolveSonixSamplePcm`, `placeholderSonixSynth`, `buildSonixInstruments`.
    - `parseSnxBinary` + `parseTinyBinary` take `companionFiles?`; build instruments
      via `.instr` header classification — `parseSonixSynthInstr()` non-null → keep
      `SonixSynth`; else decode `.ss` PCM via `createSamplerInstrument()` (8287 Hz).
    - Two sample companion shapes handled: SampledSound (`.ss` shares basename) and
      32-byte type-2 reference (`be16@2==2`, 4-char `.ss` name @4, e.g. cu01→USA1).
    - SNX names read from TAIL name-table after the 4 voice streams; TINY from 0x40.
  - `src/lib/import/formats/__tests__/sonixSampleInstrument.test.ts` (NEW, in test:ci,
    fails-on-revert): TINY type-2 (cu01→USA1) + SNX SampledSound (organ) → Sampler
    with `data:audio/wav;base64,` url.

## Learnings

- Sonix native playback routing (`NativeEngineRouting.ts:220-241`) activates on
  `sonixFileData` existence with `suppressNotes:true` — **synthType-independent**.
  So restamping sample voices `Sampler` does NOT affect audio. Confirmed: SNX capture
  peak 0.202 audible after change.
- **SNX SYNC ROOT CAUSE (Explore agent a95653ba6c0fe992b):** the display pattern
  cursor is a **free-running TS scheduler clock** (`TrackerReplayer.ts` ~2830) driven
  at the parser's **hardcoded** `initialBPM:125 / initialSpeed:6`
  (`SonixMusicDriverParser.ts:721-722`). The native C engine plays audio at the file's
  REAL tempo (SNX speed word, file bytes 16-17; see `sonix.c:713`/`1230`) and exposes
  **NO playback-position API**. Sonix is excluded from the position-sync path
  (`NativeEngineRouting.ts:1119-1136`, which keys off `onPositionUpdate`). Open-loop →
  cursor drifts. snx.theme speed word = 255 (loop 120). Audio is correct; only the
  highlighted row is wrong — display-fidelity issue, not audio.

## Next Steps (SNX sync — pick a fix, get go-ahead, ship fails-on-revert test)

- **(a) cheap/partial, data-format level:** derive `initialBPM/initialSpeed` from the
  SNX/TINY speed word (bytes 16-17) at parse time instead of hardcoding 125/6. Still
  open-loop; fails on mid-song tempo-change opcodes (`0x82nn`) and any tick-model
  mismatch. Band-aid — snaps a free-running clock closer, doesn't close the loop.
- **(b) TRUE ROOT FIX, position-feedback level (RECOMMENDED):** expose a native
  playback-position (tick/row) from `SonixEngine` (C already tracks it), add
  `onPositionUpdate`, wire into `NativeEngineRouting.ts:1119-1136` like every other
  native engine. Grid is tick-per-row so native tick → cursor row is direct. Correct
  for tempo changes + speed word. Cost: C API + WASM rebuild + routing wiring.
  **Present both, recommend (b), await user choice before editing.**

## Artifacts

- Commits `f6bebb5c8`, `92fb40f4b` (origin/main).
- This handoff.

## Other Notes

- MCP debugging: DEViLBOX MCP + real Chrome only (never Playwright). Live-capture is
  two-phase (captureId → poll); use `export_wav` for native engines; read big WAV
  results via python3 base64-decode (peak/rms), not Read.
- `export_wav` live-capture honors mixer mute (proven earlier) — useful for native
  voice isolation; `solo_channel` does NOT reach native capture.
