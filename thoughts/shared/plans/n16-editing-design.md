---
date: 2026-11-02
status: design approved 2026-11-02 (D1-D6 answered), not started
task: N16 (ledger thoughts/shared/plans/2026-11-01-new-song-any-format.md line 116)
inputs: n16-magplaysid-survey.md, n16-p1-p3-result.md
---
# N16: a traced SID song that plays after edit

## Problem

`parseSIDFile` (SIDParser.ts + sidTraceDecode.ts) now yields instruments, gated
notes and a fitted grid, but the song plays from `c64SidFileData` through
`C64SIDEngine` (NativeEngineRouting.ts:791, `suppressNotes = true`). The grid is
a picture of the compiled tune; editing a cell changes nothing audible. The
traced instruments are `synthType: 'C64SID'`, which InstrumentFactory.ts:220
maps to `return null` (no synth: "audio handled by C64SIDEngine"). So there is
no path today where a traced note makes a sound.

## What exists (searched: C64SID, jsSID, reSID, websid, SIDPlayer, c64SidFileData, register write, GTSongData, Cpu6502)

| piece | file | what it can do for this |
|---|---|---|
| C64SIDEngine + deepsid engines (websid / jssid / jsidplay2 / ScriptNodePlayer) | src/engine/C64SIDEngine.ts, src/engine/deepsid/** | plays compiled 6502 code only; RAM read/write, no "play this register stream" API |
| SF2Engine | NativeEngineRouting.ts:804 | live edit of SID Factory II driver data only |
| FurnaceDispatchSynth, `FurnaceC64` / `FurnaceSID6581` / `FurnaceSID8580` | InstrumentFactory.ts:239, furnace-dispatch/ | per-note SID voice with Furnace macros (wave, duty, cutoff, arp); filter is per-chip, driven from instrument/effects |
| GoatTracker 2 model + writer | src/lib/import/formats/GoatTrackerSid.ts (`GTSongData`, `GTInstrument`, wave/pulse/filter/speed tables, `writeGoatTrackerSng`, `goatTrackerSongBytes`) | exact model of a table-driven C64 player: per-frame wave program with note offsets, pulse program, filter program, hard restart, gatetimer, firstwave |
| GTUltra engine (WASM, reSID inside) | src/engine/gtultra/*, public/gtultra/GTUltra.wasm, gtultra-wasm/src | plays/edits GT songs live; exports `gt_save_sng`, `gt_export_sid`, `gt_export_prg`, `gt_get_sid_registers`, `gt_set_sid_count`, `gt_set_multiplier`; ASID per-register callback (`onAsidWrite`); loads headless in vitest (src/engine/__tests__/gtultraRendersCorpus.test.ts via loadWebBundle) |
| GT open route | src/lib/song/openSong.ts:166 (`classifySong`), src/lib/song/songBranches.ts:259 | a GT2/GT1-compiled .sid already opens as a GT song in the GTUltra editor (`engine.goatTrackerData`) |
| Cpu6502 trace | src/lib/import/cpu/Cpu6502.ts, SIDParser.ts (FRAMES = 18000) | per-frame VoiceFrame snapshot per voice (freq, pulse, control, AD, SR, cutoff, resRoute, modeVol) |
| .dbx save of `goatTrackerData` | src/lib/export/exporters.ts:224 | binary field already persisted |

## (1) Engine: chosen = GTUltra, via trace -> GoatTracker song

The traced song becomes a `GTSongData` (instruments + wave/pulse/filter tables +
orderlists + patterns), written with `writeGoatTrackerSng`, and opens exactly
like a GoatTracker-compiled SID does today: `engine.goatTrackerData`, GTUltra
editor, GTUltra engine. No new engine.

Why this and not the others:
- **Furnace C64 instruments in the tracker grid**: plays per note, but a C64
  player's sound is a per-frame *table program* (wave nibble sequence with
  note offsets, pulse sweeps, a global filter program shared by voices,
  hard restart before gate-on). Furnace macros cover wave/duty/cutoff per
  instrument, not the global filter program nor GT-style hard restart; the
  match ceiling is lower and DEViLBOX would carry a second SID editing model
  next to GT. Rejected.
- **Register-stream replay / hybrid (original trace with edited rows
  substituted)**: no existing engine takes a register stream (only
  SIDHardwareManager.writeRegister for hardware); it would be a new parallel
  engine, and a substituted row still needs an instrument model to know what
  registers a new note writes, i.e. it needs the GT model anyway. Rejected
  (rule: reuse, never invent a parallel engine).
- **GT**: same family as the source (most C64 players are wave/pulse/filter
  table players), the editor, live engine, ASID output, .sng save and .sid
  export all exist, and the open route already has a "SID opens as GT song"
  precedent. Cost: GT's limits (63 instruments, 255 rows per table, one
  filter program at a time, 3 voices per SID).

## (2) Per-frame instrument data and how to measure it

What an instrument needs so the unedited song sounds like the original, all
derived from the per-voice VoiceFrame runs SIDParser already captures, per
gate-on segment (note start to next note start):
- AD / SR at gate-on; hard restart (gate off + AD/SR pokes N frames before the
  next gate-on) -> GT gatetimer + firstwave (+ the GT hard-restart ADSR
  setting in the settings block, `gtUltraSettingsBlock`).
- Wave program: per frame `control` (wave nibble + gate/ring/sync/test bits)
  and the pitch offset from the note's base frequency in semitones (arpeggio,
  drum pitch drops) or absolute note -> GT wave table rows (left = wave byte /
  delay / jump, right = relative or absolute note), with a loop jump where the
  sequence repeats.
- Pulse program: per frame 12-bit pulse -> GT pulse table: "set pulse" row,
  then "modulate speed S for T frames" rows found by run-length of constant
  deltas; loop jump.
- Filter program: per frame cutoff/resonance/route/mode -> GT filter table
  (set filter, modulate cutoff), started by the instrument whose gate-on
  coincides with the filter reset; global, so assigned to one voice's
  instruments.
- Vibrato / slides that remain in freq after the wave-table note offset is
  removed -> GT speed table + pattern commands 1/2/3/4 (portamento, toneport,
  vibrato). This is effect inference (survey item 6); the first cut leaves it
  to the unexplained share.
- Tempo: frames per row from `fitGrid` -> GT tempo; multispeed tunes need P4
  (call rate) -> `gt_set_multiplier`.
- Instruments are deduplicated on the full program (not the P1 summary
  signature), coarsened to 63, tables shared/compacted to fit 255 rows.

**Metric (P5, "% register writes explained")**: run the built .sng headless in
the GTUltra WASM (loadWebBundle, as gtultraRendersCorpus.test.ts does), step
one frame at a time (render 44100/50 samples, multiplier aware) and read
`gt_get_sid_registers` per frame; compare against the trace's per-frame
register snapshot (25 registers per chip). Score = share of
(frame, register) value *changes* in the original that the GT replay
reproduces at the same frame (+-1 frame tolerance for hard-restart and
note-start alignment, reported separately). Report per register class
(freq, pulse, control, ADSR, filter) so a low score names which table
builder is wrong. This is the regression gauge per tune and the gate for (3).
Note: GT rewrites registers in its own order within a frame; compare frame
snapshots, not write order.

## (3) When the product switches

Recommended (D2): **automatic by score at open time, no prompt, no button.**
`classifySong` / the GoatTracker branch build the traced GT song; if its P5
score is >= threshold (D3, recommended 90%) the SID opens as the GT song in
the GTUltra editor (playable, editable, unedited playback is the GT replay),
with a status line "Traced from <player or 'unknown player'>: 94% of register
changes reproduced" and the original kept (`c64SidFileData`) for an
"Play original" A/B toggle. Below threshold it opens as today (compiled
playback, read-only trace grid) with the score shown, so the user sees why it
is not editable. Switching engine on first edit was considered: the view would
have to change from the SID tracker grid to the GTUltra editor mid-edit and
the sound changes at the moment the user touches it, which reads as "my edit
broke the song". Rejected in the recommendation.

Cost note: tracing (18000 frames) plus building plus scoring at classify time
is expensive and `goatTrackerSongBytes` is called twice (classifySong and
songBranches). Reuse SIDPatternCache.ts (bump cache version, store the built
.sng bytes + score keyed by file hash) so the second call and later opens are
cache hits.

## (4) Save / export

- Project: .dbx stores `goatTrackerData` (the edited GT song) and
  `c64SidFileData` (the original, for A/B and re-trace). The binary field path
  exists (exporters.ts:224). Unverified: that a .dbx save pulls the *edited*
  song out of the WASM (`gt_save_sng`) rather than the bytes loaded at open;
  step 6 tests it.
- Native: .sng via GTUltra Save (`saveSng`), .sid / .prg via GTUltra export
  (`gt_export_sid`). This is a NEW compiled tune with the GoatTracker player,
  not the original player; the export dialog says so (D4).
- No write-back into the original player data (owner decision 2026-11-02).

## (5) Ordered steps (each with its proving test)

1. **Keep the trace frames.** SIDParser.ts exposes the per-voice VoiceFrame
   runs and per-frame register snapshot (pure function
   `traceSid(buffer) -> { voices, chipRegs, frameRate, chips }`), used by
   parseSIDFile and the new builder; no second trace loop.
   Test: existing sidTraceDecodesNotes.test.ts stays green (same notes,
   speed 6, 32 instruments on starfish).
2. **Table builders (pure).** New src/lib/import/formats/sidTraceToGoatTracker.ts:
   per note segment -> wave/pulse/filter programs -> deduped GT instruments and
   compacted tables; notes + fitGrid rows -> GT patterns (note 0x60+, rest
   0xBD, instrument column) and orderlists (reuse SIDParser pattern split /
   loop detect). Header attribution for any MagPlaySID-derived logic.
   Test: unit tests where it lives (sidTraceToGoatTracker.test.ts): a synthetic
   VoiceFrame run with a known arpeggio + pulse sweep builds the expected table
   rows; output passes `parseGoatTrackerSng(writeGoatTrackerSng(song))`
   round-trip.
3. **P5 scorer.** New src/lib/import/formats/sidTraceScore.ts: given the trace
   snapshot and a frame-stepped register reader, returns the per-class score.
   The GT reader lives in a test helper on loadWebBundle (GTUltra.wasm,
   `gt_load_sng`, `gt_play`, `gt_render_audio`, `gt_get_sid_registers`).
   Test: a GT2-compiled HVSC .sid from goatTrackerSidOpensAsSong.test.ts traced
   and rebuilt must score near 100% (its source IS a GT song): calibrates the
   scorer; starfish score is recorded, not asserted beyond a floor.
4. **Open route.** `goatTrackerSongBytes` (GoatTrackerSid.ts:814) gains the
   third case: not a GT1/GT2 build -> traced GT song if score >= threshold
   (cached in SIDPatternCache). classifySong and the GoatTracker branch stay
   the one routing rule (no new branch).
   Reachability test (THE one for the feature), through `openUserSong` like
   goatTrackerSidOpensAsSong.test.ts: dropping abaddon-starfish-test.sid
   lands in editorMode 'goattracker', `goatTrackerData` starts 'GTS5', the
   builder ran (call-count sentinel on the builder), instrument count and
   speed equal the trace's. Changes the assertion at that test's line 104
   (starfish is 'module' today) - update it deliberately.
5. **Edit is audible.** Test: headless GTUltra WASM on the opened song: set a
   pattern cell (`gt_set_pattern_cell`) to a different note, render the frame
   of that row, `gt_get_sid_registers` freq of that voice changes to the new
   note's frequency; the unedited copy keeps the original's.
6. **Save round-trip.** Test: open starfish, edit a cell, save .dbx, reopen:
   the edit is present and `c64SidFileData` is kept; .sng export bytes parse
   with the edit.
7. **UI.** Score status line + "Play original" toggle in GTToolbar (design
   system Button / Toggle, token classes); export dialog notice. Manual check
   in real Chrome on localhost:5174.
8. **Ledger + corpus gauge.** Record scores for the SIDs in public/data/songs/sid
   (resumable, rows to a JSON like sound-check) and tune builders on the
   lowest-scoring class. Only one real traced SID is in the repo; more HVSC
   test tunes are needed (D6).

## Owner decisions

- **D1 Engine for an edited traced SID.** (a) GoatTracker song in GTUltra
  (Recommended: reuses editor, engine, save, .sid export; trade-off: GT limits,
  user edits in the GT editor, not the generic tracker grid). (b) Furnace
  C64/SID6581 instruments with macros in the generic tracker grid (one editor
  for all formats; trade-off: lower match ceiling, no global filter program,
  second SID editing model). (c) Register-stream hybrid (closest to original
  when unedited; trade-off: new parallel engine, edits still need (a) or (b)).
- **D2 When it switches.** (a) Automatic at open by score, no prompt
  (Recommended: matches "automatic over button"; trade-off: a high-score tune
  plays the GT replay, not the original, until "Play original" is pressed).
  (b) Compiled playback, switch on first edit (exact until touched; trade-off:
  view and sound change under the user's hand). (c) Always traced, no gate
  (simplest; trade-off: badly traced tunes open sounding wrong).
- **D3 Threshold.** 90% (Recommended; MagPlaySID median 98.5% with a raw
  layer, GT has none, so expect lower) / 95% / no threshold, show score only.
- **D4 .sid export of a traced tune.** (a) Allowed, labelled "re-compiled
  with the GoatTracker player" (Recommended; trade-off: a file that is not the
  original's player circulates). (b) .sng and .dbx only.
- **D5 What the model misses (no raw layer in GT).** (a) Accept the loss,
  shown by the score (Recommended; no engine change). (b) Extend GTUltra WASM
  with a per-voice raw register override track (closer to lossless;
  trade-off: C change in the GT player, a format GoatTracker itself cannot
  open).
- **D6 Test corpus.** Add ~10 HVSC tunes of common unknown-to-us players
  (JCH, DMC, Hubbard, Laxity, SID-Wizard) under public/data/songs/sid
  (Recommended; trade-off: repo size, HVSC licence is redistribution-friendly
  but check) / keep starfish only.

## Risks

- Classify-time cost of trace + build + score (cache required, step 4).
- 2SID/3SID tunes: GTUltra has `gt_set_sid_count`; unverified that the GT
  model in GoatTrackerSid.ts carries more than 3 channels.
- Multispeed/CIA tunes need P4 before their grid and multiplier are right.
- Filter program attribution to one voice is a heuristic; filter class score
  will show it.

## Owner answers (2026-11-02)

- **D1:** GoatTracker song in GTUltra (recommended option).
- **D2:** Automatic at open by score, no prompt (recommended option).
- **D3:** 90% threshold (recommended option).
- **D5:** Raw override track, NOT the recommended "accept the loss". Extend the
  GTUltra C replayer with a per-frame raw SID register override track that
  carries the writes the GoatTracker model misses. The score is then measured
  with the override track on; the override share is reported separately so the
  table builders can still be tuned to need fewer overrides.
- **D4:** Export with an override player (recommended option after D5). Extend
  `gt_export_sid` to embed the override track plus a small 6502 player patch so
  the exported .sid keeps the full sound. It must be verified on a real SID
  player (MagPlaySID / sidplayfp), not only in the GTUltra WASM. The .sng save
  cannot carry the override track: .dbx carries it; the .sng export dialog says
  overrides are dropped.
- **D6:** Add ~10 real HVSC tunes to public/data/songs/sid (answered earlier).

New steps this adds to section (5): 5a override track in the GTUltra C code
(data layout, per-frame apply after the GT player, WASM rebuild, headless test
that an override row lands in `gt_get_sid_registers`); 5b `sidTraceToGoatTracker`
emits overrides for frames whose GT replay differs from the trace; 5c override
player patch in `gt_export_sid` with a test that plays the exported .sid in a
6502 + SID register emulator and compares with the trace.

## Test corpus added (D6, 2026-11-02)

Fetched through the local server route /api/hvsc/download into
public/data/songs/sid (player names from the DeepSID hvsc_files table):

| File | HVSC path | Player |
|------|-----------|--------|
| hubbard-commando.sid | MUSICIANS/H/Hubbard_Rob/Commando.sid | Rob_Hubbard |
| galway-wizball.sid | MUSICIANS/G/Galway_Martin/Wizball.sid | Martin_Galway |
| tel-cybernoid-futurecomposer.sid | MUSICIANS/T/Tel_Jeroen/Cybernoid.sid | MoN/FutureComposer |
| lees-last-ninja.sid | MUSICIANS/D/Daglish_Ben/Last_Ninja.sid | Anthony_Lees |
| eco-fog-goattracker2.sid | MUSICIANS/E/Eco/Fog.sid | GoatTracker_V2.x (score calibration) |
| proton-cybernoid-goattracker2.sid | MUSICIANS/P/Proton/Cybernoid.sid | GoatTracker_V2.x (score calibration) |
| jch-tyne-cheesecutter2.sid | MUSICIANS/J/JCH/Tyne.sid | CheeseCutter_2.x |
| bax-hc-dmc4.sid | MUSICIANS/B/Bax/HC.sid | DMC_V4.x |
| jch-awry-sidfactory2.sid | MUSICIANS/J/JCH/Awry.sid | SidFactory_II/Laxity |
| cmp-dns-jchnewplayer20.sid | MUSICIANS/C/CMP/DNS.sid | JCH_NewPlayer_V20 |
