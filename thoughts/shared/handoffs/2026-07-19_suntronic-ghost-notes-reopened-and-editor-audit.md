---
date: 2026-07-19
topic: suntronic-ghost-notes-reopened-and-editor-audit
tags: [suntronic, ghost-notes, oracle, instrument-editor, presets]
status: draft
---

# SunTronic — ghost notes REOPENED, editor/preset audit, honest scope reset

## Tasks

1. Commit + push the ghost-note fixes (user authorized). DONE — but message amended
   to stop overclaiming.
2. Reopened ghost notes in ch3 of `analgestic2.src` — user reported real
   played-but-blank / wrong grid cells, doubts display accuracy. DIAGNOSED,
   root-caused, NOT fixed yet.
3. Answer user's editor/preset questions (editor "looks mostly empty", add
   `instr/` to preset dropdown, rename "Synth xx"). AUDITED — requests rest on a
   wrong model; reported to user, awaiting direction.
4. TODOs recorded: globe.src ch4 silent; modern instrument visualization.

## Recent changes (this session)

- **PUSHED origin/main `823c89135`** — the ghost-note commit (was local
  `776c3f92b`). Amended the message before push: subject is now
  "fix(suntronic): stamp grid provenance, fix drin gate + reproject re-decode".
  Body explicitly SCOPES the claim to the displayed->pool direction and flags
  the played->displayed off-by-one as OPEN. The three fixes it carries are real
  and stand (provenance stamp / drin gate / reproject re-decode).
- **New file `tools/suntronic-re/probe-note-stream.ts`** (untracked) —
  coordinate-free display-fidelity oracle. Compares the ORDERED note-on
  subsequence per voice: grid (pattern-row order) vs player (fire order). No
  position/row keying. VALIDATED: `gliders.src` + `ballblaser.src` (byte-exact)
  MATCH exactly, so the oracle is trustworthy.
- Memory updated: `MEMORY.md` line 4 + `memory/project_suntronic_1to1_remaining.md`
  ghost section — corrected the "corpus CLEAN" overclaim, recorded oracle + root
  cause.

## Critical references

- `src/lib/import/formats/sunGroupCodec.ts:100-113` — `decodeSunGroup` note
  emission. `if (cell.note === 0)` → emits EXACTLY ONE display note per grammar
  group ("first note wins"). This is the grid side of the divergence.
- `src/engine/suntronic/SunTronicPlayer.ts:352-383` — `getNextNote`. Fires a
  note-on PER pitch byte (`rowRecorder` inside the loop, line 375). Gates:
  - line 360: `d0 < 0x80` → stages `v.stagedSel` (persists across groups, never
    reset to 0 after use).
  - line 363: `if (v.tie !== 0) continue;` — tie suppresses. **`v.tie` is DEAD
    CODE** — never assigned positive anywhere (init 0 line 320, only decremented
    line 635). Not the cause.
  - line 370-371: `const sel = v.stagedSel; if (sel === 0) continue;` — pitch
    byte with no staged instrument sets pitch but does NOT retrigger/record.
    This is the live gate.
- `src/lib/import/formats/SunTronicParser.ts:523-600` — `walkV13Voice`, the grid
  walk. Threads `curInstr` across groups but NOT `stagedSel`; calls
  `decodeSunGroup` once per row.
- `tools/suntronic-re/probe-note-stream.ts` — the validated oracle (run below).
- `tools/suntronic-re/probe-grid-vs-player-pos.ts` — the OLD probe. Do NOT trust:
  keys grid by `sunRowInBlock` vs player by position-row = mixed coordinate
  systems. Its "159 row-level ghosts / off-by-one" numbers are partly artifact.

## Root cause (ghost notes) — group→note cardinality mismatch

`decodeSunGroup` emits <=1 note per grammar group. The player fires note-on per
pitch byte, gated by `stagedSel != 0`. Consequences:
- A group with 2+ pitch bytes → player fires 2+ notes (same row), grid shows 1.
- A bare pitch byte with no staged instrument (glide target) → player silent
  (pitch change only), grid shows a fresh note = phantom.

`probe-note-stream.ts analgestic2.src` divergence points: ch0@8, ch1@812,
ch2@124, ch3@5. ch2 is the cleanest: 124 notes match, then grid has ONE extra
note (36) the player never fires, then realigns shifted → a phantom insertion.

## The fix (NOT done — next work item)

Thread the player's note-on gate into the grid walk so grid emission == player
emission, at the DECODE layer (no band-aid):
1. `walkV13Voice` must maintain `stagedSel` voice-state across groups (like
   `curInstr`) and pass it into `decodeSunGroup`.
2. `decodeSunGroup` must gate `cell.note` on the same conditions the player uses
   (`stagedSel != 0`), and handle multi-pitch-byte groups faithfully (the player
   fires one note-on per qualifying pitch byte — decide how the editable grid
   represents >1 note-on in one row-group; likely each becomes its own row, or
   the walk must advance rows to match).
3. Preserve the byte-exact `sunRaw` carrier + the existing reproject/provenance
   behavior — gliders/ballblaser must STAY matched.
4. Regression: `probe-note-stream.ts` MATCH on analgestic2 as a fails-on-revert
   test wired into test:ci; keep gliders/ballblaser MATCH as controls.

CAUTION: this changes `walkV13Voice` note output → re-run the corpus oracle over
all songs after, and re-check the provenance/reproject tests, before claiming
clean. Do NOT re-declare "corpus clean" without the coordinate-free oracle green
corpus-wide in BOTH directions.

## Editor / preset audit (verified in code)

- **No SunTronic instrument editor exists.** `grep "SunTronic"
  src/components/instruments/editors/ SynthTypeDispatcher.tsx` → empty. Edit
  falls through to the generic fallback → "looks mostly empty". The 15
  `SunTronicConfig` params (`src/types/sunTronicInstrument.ts:15-41`) are NOT
  exposed and NOT realtime. `SunTronicSynth.applyConfig/updateConfig`
  (`src/engine/suntronic/SunTronicSynth.ts:133-139`) exist but nothing in the
  edit path calls them.
- **No SunTronic preset dropdown.** The "Presets" tab in
  `AddInstrumentDialog.tsx` is the app-wide factory synth library
  (Helm/Surge/Dexed/NKS) for creating NEW instruments — unrelated to SunTronic.
- **"Synth N" names** (`SunTronicParser.ts:501`, also `SunTronic N` at 288/308/
  319) are per-song embedded instruments generated fresh at parse — not a shared
  renameable list.
- **`instr/*.x`** = raw signed-8-bit PCM sample companions for this format's
  sampled instruments; **`.synth`** = ASM patch sources. They already load
  automatically as a song's sampled instruments. NOT app synth presets — adding
  them to the factory dropdown is a category error.

User's literal request ("add instr/ to preset dropdown, rename Synth xx") cannot
be done as stated. What delivers the intent: (a) a dedicated SunTronic editor
exposing the 15 params live; (b) optionally a NEW SunTronic preset library built
from `.synth`/`.x` sources. Both are real work, not a rename.

## Learnings / gotchas

- The finish-line for a display-accuracy claim is BOTH directions
  (displayed->pool AND played->displayed), measured in ONE coordinate system. The
  displayed->pool-only metric gave false confidence.
- Build the oracle before the fix. `probe-note-stream.ts` is coordinate-free and
  self-validates on byte-exact control songs (gliders/ballblaser) — that's the
  pattern to reuse.
- Pre-push hook (`scripts/git-hooks/pre-push`) runs type-check + test:ci +
  test:compliance in PARALLEL and FLAKES under load (races on version.json
  generation — each test script regenerates it). All three pass standalone.
  Symptom: `git push` prints "error: failed to push some refs" with no `remote:`
  lines and the piped exit looks like 0. Fix = retry when the system is quiet
  (worked first retry). Real root fix would be serializing version.json
  generation, but out of scope this session.

## Artifacts

- Commit `823c89135` on origin/main (deploy triggered).
- `tools/suntronic-re/probe-note-stream.ts` (untracked — commit with the fix as
  its regression harness).
- Memory: `MEMORY.md` line 4, `memory/project_suntronic_1to1_remaining.md`.

## Next steps (ordered)

1. **Fix the ghost/cardinality bug** — thread `stagedSel` + per-pitch-byte
   emission through `walkV13Voice`/`decodeSunGroup`; regression via
   `probe-note-stream.ts` MATCH on analgestic2; re-run corpus oracle both
   directions; keep gliders/ballblaser controls green. HIGHEST value — this is
   the accuracy problem the user flagged.
2. **Build the SunTronic instrument editor** — expose the 15 `SunTronicConfig`
   params live (dedicated editor mode in `SynthTypeDispatcher` + wire
   `updateInstrumentRealtime` → `SunTronicSynth.applyConfig`). This is what "can
   we manipulate everything / editor looks empty" actually needs.
3. SunTronic preset library (from `.synth`/`.x`) + modern instrument
   visualization — larger design tasks, scope after 1-2.
4. TODO globe.src ch4 silent (decode vs render for voice 3).
5. MCP human smoke test (needs live browser + AudioContext unlock) — deferred.

## Other notes

- User authorized commit+push this session; only `823c89135` was pushed. The
  ghost fix (step 1) is NOT started — awaiting user direction on priority
  (ghost fix vs editor first).
- Do NOT build the preset dropdown as literally requested — confirmed category
  error; user informed.
