---
date: 2026-07-07
topic: uade-full-native-editability
tags: [uade, editability, export, plan, multi-agent]
status: final
---

# Plan: All UADE Formats Fully Native-Editable

Input research: `thoughts/shared/research/2026-07-07_uade-full-native-editability-audit.md`
(read it first — it holds the file index, coverage tables, and defect details).

Goal: every UADE-played format editable as in its native Amiga tracker — real pattern
data, editable instruments/synths, byte-faithful native export — with automated proof.

Ordering rationale: fix data-loss bugs first (they corrupt work in ALREADY-editable
formats), then build the mass verification harness (turns everything after into a
ratchet), then unify the architecture (makes each new format a descriptor instead of six
scattered edits), then quality/coverage waves. Each phase is independently shippable; each
task is sized for one agent session and states its own verification.

House rules that bind every task: root-cause fixes only; every bug fix ships a regression
test wired into `test:ci` (revert-check it); `npm run type-check` must pass; real song
files as fixtures, never synthetic bytes; commit + push to main directly, no worktrees;
no emojis.

---

## Phase 0 — Stop the data loss (correctness bugs in shipped paths)

### Task 0.1 — Unify native-export dispatch (fixes MCP edit loss + stale duplicate)

Problem: `src/bridge/handlers/writeHandlers.ts:2582-2705` (MCP `export_native`) is a
stale, incomplete copy of `src/hooks/dialogs/useExportDialog.ts:267-517` (UI). MCP lacks
~16 dispatch branches AND the chip-RAM readback fallback, so MCP export of an edited
chip-RAM format returns the UN-edited original bytes.

Do:
1. Create `src/lib/export/nativeExportRouter.ts` exporting
   `exportNativeSong(song, opts): Promise<{data: Uint8Array, filename, companions?: {name, data}[]}>`.
   Move the ENTIRE UI dispatch logic there: named-format branches, the
   `layoutFormatId → {module, fn}` dynamic-import map (single copy), the Cinter
   save-vs-export decision (parameterized `{stripCinter}`), and the chip-RAM readback
   fallback (`UADEChipEditor.readEditedModule` when a `uadePatternLayout`/`uadeVariableLayout`
   exists and the UADE engine is live).
2. `useExportDialog.handleExportNative` and `writeHandlers.exportNative` become thin
   consumers. `FT2Toolbar.tsx:263-290` Cinter special-case calls the router too.
3. Keep the raw-bytes fallback LAST, and only when no layout exists.

Verify (automated): `npm run type-check`; new test
`src/lib/export/__tests__/nativeExportRouter.test.ts` — for each `layoutFormatId` in the
map, assert the router resolves a module (import succeeds, fn exists); regression test:
mock a live UADE engine + layout, edit one cell, assert router output ≠ original bytes.
Verify (manual): MCP `export_native` on an edited Tomy Tracker song returns edited bytes.

### Task 0.2 — Sync `BINARY_FILE_DATA_FIELDS` with TrackerSong (save round-trip)

Problem: `src/lib/export/exporters.ts:19-28` allowlists 30 `*FileData` fields;
`TrackerSong` (`src/engine/TrackerReplayer.ts:244-404`) has ~60. ~30 formats lose their
engine bytes on .dbx/IndexedDB save (full list in research §3.3).

Do: replace the hand list with a derived one. Add a single source of truth
`src/engine/formatFileDataFields.ts` exporting `FILE_DATA_FIELDS: (keyof TrackerSong)[]`
— generate initially by grepping TrackerSong for `FileData` fields (plus `cinter4RawData`,
`tfmxSmplData`, `startrekkerAMNtData`, `asapFilename`-adjacent buffers). Consume it in
`exporters.ts` (`getNativeEngineDataForExport`/`restoreNativeEngineData`) and anywhere
else that enumerates these fields (`useFormatStore` reset — check). Add a **completeness
test** that parses `TrackerReplayer.ts` (or uses a type-level check) and fails when a new
`*FileData` field is added to TrackerSong but not to the list.

Verify (automated): type-check; new test
`src/lib/export/__tests__/fileDataFieldsComplete.test.ts` (the ratchet above); extend
`src/hooks/__tests__/useProjectPersistence.test.ts` with a save→load round-trip for at
least one previously-missing format (e.g. soundMonFileData with the real
`antidust.bp3` fixture) asserting bytes survive.
Verify (manual): load a TFMX song, save project, reload — still plays.

### Task 0.3 — Serialize companion/sidecar files

Problem: `sonixSidecarFiles` (TrackerSong:283) and `uadeCompanionFiles: Map`
(TrackerSong:383) never enter `SavedProject`/`SongExport` — two-file formats (Sonix
.instr/.ss, TFMX mdat+smpl, Richard Joseph, Jason Page) break on save/reload.

Do: add both to the export/restore path in `exporters.ts` (base64 the buffers; Map →
array of `{name, data}`), bump `SCHEMA_VERSION` in `useProjectPersistence.ts` WITH a
migration (older projects load, just without companions — do NOT hard-discard), and
restore into the format store + TrackerSong on load.

Verify (automated): persistence test — load the Sonix fixture
`public/data/songs/sonix-smus/ACE II/` (or `smus.wait2` + sidecars), save, reload,
assert `sonixSidecarFiles` non-empty and playback path receives them.
Verify (manual): save/reload an ACE II SMUS project; instruments still sound.

### Task 0.4 — Single chip-RAM write helper

Problem: 3 copy-pasted `patchPatternCell` call sites in `src/stores/useTrackerStore.ts`
(:179, :504, :692) + a divergent TFMX direct-write (:521-527).

Do: extract `writeCellToChipRam(song, patternIdx, row, ch, cell)` into
`src/engine/uade/UADEChipEditor.ts` (or a sibling util) handling the lazy-import +
engine-instance + fixed/variable/TFMX branches once. Replace all four sites.

Verify (automated): type-check; existing tomyTracker/synTracker round-trip tests still
pass; add a unit test that the helper routes fixed-layout vs TFMX correctly (mock engine).

---

## Phase 1 — Mass round-trip verification harness (the ratchet)

### Task 1.1 — Encoder round-trip harness over real fixtures

Problem: only 3 of ~90 codecs have byte-exact proof. "Editable" is unverified for the rest.

Do: build `src/engine/uade/__tests__/encoderRoundtrip.harness.test.ts`:
1. Iterate every encoder registered via `registerPatternEncoder`/`registerVariableEncoder`
   (export a registry-listing helper from `UADEPatternEncoder.ts`).
2. For each formatId, locate a real fixture: map formatId → sample file under
   `public/data/songs/` (create `src/engine/uade/__tests__/fixtures.map.ts`; where no
   fixture exists in-repo, mark `missing-fixture` — reported, not silently skipped).
3. Parse the fixture with its parser, then for every decoded cell:
   `encodeCell(decodeCell(bytes)) === bytes` byte-for-byte across the whole pattern
   region (Tomy-test generalized). Variable-length: `encodePattern(decodedRows)` equals
   the original pattern block.
4. Emit a per-format result table; test asserts a **ratchet file**
   (`src/engine/uade/__tests__/encoderRoundtrip.ratchet.json`) — formats currently
   byte-exact must stay byte-exact; known-lossy formats listed with their current match %
   may only improve. Modeled on the FORMAT_REGISTRY detection-test ratchet.

Verify (automated): harness in `test:ci`; ratchet committed; deliberately breaking
TomyTrackerEncoder (`*8`) fails.
Verify (manual): review the initial ratchet report — it IS the Phase 3 worklist.

### Task 1.2 — Exporter round-trip harness

Do: same pattern for the ~55 dedicated exporters: parse fixture → export → re-parse →
compare pattern data (and byte-compare where the format is deterministic). Start
byte-exact for formats whose exporter claims 1:1 (SynTracker model:
`synTrackerRoundtrip.test.ts`); note-data compare elsewhere; ratchet file again.

Verify (automated): in `test:ci`, ratchet committed.

### Task 1.3 — Fixture gap fill

Do: for every `missing-fixture` formatId from 1.1/1.2, pull one small real song from
Modland/local corpus into `public/data/songs/<format>/` (real songs only — house rule)
and add to the fixtures map. Track remaining gaps in the ratchet.

Verify: harness coverage count increases; no `missing-fixture` for any format labeled
editable in `FormatCapabilities.ts`.

---

## Phase 2 — Unify the architecture (descriptor registry)

### Task 2.1 — `EditableFormatDescriptor` registry

Problem: capability facts live in six places (research §4.1). Adding a format = six edits.

Do: create `src/lib/formats/EditableFormatRegistry.ts`:
```ts
interface EditableFormatDescriptor {
  formatId: string;             // === layoutFormatId
  label: string;                // FormatRegistry label
  patternCodec?: { kind: 'fixed' | 'variable' };   // auto-true when encoder registered
  exporter?: { module: string; fn: string; ext: string; companions?: boolean };
  synth?: { synthType: SynthType; controls: string }; // SynthRegistry link
  fixtures: string[];           // paths for the harnesses
}
```
Registration co-located with each encoder/exporter (side-effect import like SynthRegistry
builtins). Then:
1. `FormatCapabilities.getFormatCapabilities` DERIVES `isEditable` (encoder or synth
   registered) and `isNativeExportable` (exporter registered or chip-RAM layout) from the
   registry; `EDITABLE_FORMAT_LABELS`/`NATIVE_EXPORTABLE_LABELS` shrink to genuine
   special cases with a comment justifying each survivor.
2. `nativeExportRouter` (Task 0.1) reads its dispatch map from the registry.
3. Harness fixture map (Task 1.1) folds into `fixtures`.

Migration: mechanical, format-by-format; keep old lists until parity test passes.
Verify (automated): parity test — capabilities computed from registry equal the current
hand-list output for every label (snapshot before, compare after); type-check; full test:ci.

### Task 2.2 — Generic `WasmSynthParamBridge`

Problem: the Sonix 4-layer bridge (research §1 Strategy B) is bespoke; every synth format
re-implements it.

Do: extract `src/engine/replayer/WasmSynthParamBridge.ts`: a descriptor
`{ engineKey, paramSchema: {name, kind: 'u8'|'i16'|'i8[]'|... , setter, getter}[], matchKey }`
that generates: worklet message conventions (`postSynthParams`/`setSynthParams` payload
shape), engine-side mirror + `onSynthParams` callback, and the store bridge
(`updateInstrument` merge by `parameters.<matchKey>`). Port Sonix onto it (behavior
identical — `sonixSynthLiveEdit.test.ts` must stay green) as the proof.

Verify (automated): existing Sonix tests pass unchanged; new unit test for the bridge
with a mock worklet.
Verify (manual): MCP — load ACE II SMUS, play, turn a SonixControls knob, hear the change.

### Task 2.3 — Codec dedup via `GenericEncoderFactory`

Do: audit the 90 encoders; migrate mechanically-identical ProTracker-4-byte and
note-index codecs onto `registerGenericEncoder` descriptors. Round-trip harness (Task 1.1)
is the safety net — byte-exactness must not regress. Only migrate formats already
byte-exact in the ratchet; hand-written codecs that differ stay.

Verify (automated): ratchet unchanged or improved; encoder file count drops.

---

## Phase 3 — Pattern-quality wave (fix the lossy)

Input: the Phase 1 ratchet report. For every format below byte-exact:

### Task 3.x (one agent-session per format, repeatable template)

1. Read the ratchet diff for the format — WHICH cells mis-round-trip.
2. Read the UADE ASM source (`third-party/uade-3.05/amigasrc/players/…`) or reference
   parser (OpenMPT `Load_*.cpp` at `/Users/spot/Code/Reference Code/openmpt-master`,
   NostalgicPlayer) for the true cell semantics. NEVER guess; probe the real fixture.
3. Fix codec/parser at the root (note range, effect mapping, packed-stream framing).
4. Ratchet the format up; byte-exact is the exit bar unless the format itself is
   ambiguous (document why in `docs/formats/<Format>.md`).

Known first targets (tolerance tests admit loss today): HippelCoSo (90%), SoundMon (90%),
JamCracker (95%, note range 1-36 clamp), plus everything `patternQuality: partial` in
`tools/format-state.json` (45 entries).

Verify per task (automated): harness ratchet monotonically improves; regression test for
each fixed defect. Verify (manual): load fixture, edit a cell, export, re-import, cell
survives.

---

## Phase 4 — Instrument/synth editability wave

Two sub-tracks, template per format:

### Task 4.A.x — Sample-instrument editing for chip-RAM formats

For Group-3 formats shipping placeholder instruments (Tomy explicitly deferred this):
parse the real sample descriptors (UADE ASM `SampleInit`), extract PCM
(`createSamplerInstrument`), map instrument-struct fields (volume, loop, finetune) to a
`uadeInstrumentLayout` so edits poke chip RAM like pattern cells (existing exemplars:
RobHubbard/DavidWhittaker/FC `*Controls.tsx` already use `UADEChipEditor` writes).
Exit bar per format: instruments visible + audible + at least volume/loop editable +
survive export.

### Task 4.B.x — Synth-param editing via `WasmSynthParamBridge` (Task 2.2)

For synth formats with native WASM engines (Fred Editor, Ron Klaren, Sonic Arranger
synth voices, DeltaMusic synth, Hippel, FC macros…): declare the param schema, expose
WASM getters/setters (engine C already has ~35 with `setInstrumentParam` — wire through
the bridge), build the controls component per the no-minimal-editors rule (EVERY struct
field, bitfields broken out). Sonix P7 (save edited params back to native .instr) is the
first task in this track — it closes the open Sonix handoff item.

Verify per task (automated): live-edit unit test (the `sonixSynthLiveEdit.test.ts`
pattern — every instance receives applyConfig); export round-trip includes edited params.
Verify (manual, MCP): play fixture, turn knob, audible change; export, reload, param kept.

---

## Phase 5 — Coverage wave (play-only → editable)

### Task 5.1 — Routing quick-wins (one session, batch)

- `thx` → Hively engine (AHX sibling).
- `hip`/`mcmd`/`sog` → native Hippel engine.
- `sa-p`/`lion`/`sa_old` → SonicArranger old-version parser path.
- `bfc`/`bsi`/`fc-bsi` → depacker (`FUCO` unpack) in front of FCParser.
Each: FormatRegistry route + fixture + detection test + harness entry.

### Task 5.2 — ProWiz-packed MOD sweep (one session)

~26 packed-MOD prefixes: depack → MOD → full editing free. Wire depackers (reference:
ProWizard sources), route to MOD parser, fixtures + harness.

### Task 5.3.x — Data-format ports via the Tomy recipe (one session each)

Template (proven by commit b068590f9 — parser decode + codec + layout + label + byte-exact
round-trip + docs page): DavidHanney (DSNG/SEQU IFF chunks — easiest), FredGray (pointer
table), Quartet, SteveBarrett, ThomasHermann, KimChristensen, Desire, EMS, Medley,
SUN-Tronic/SynTracker siblings, Silmarils, ForgottenWorlds, AMOS abk.
Priority by corpus size; consult `docs/formats/*.md` + UADE ASM first (analyse-first rule).

### Task 5.4.x — Compiled-replayer ports via the transpiler pipeline (multi-session each)

For formats whose pattern data lives inside replay code (Beathoven, RiffRaff, HowieDavies,
Tim Follin, DariusZendeh/MarkII): use the `transpile-debug-68k-replayer` skill —
transpile (`tools/asm68k-to-c/`) → lock-step vs UADE (`tools/uade-audit/`,
`tools/sonix-audit/` model) → parser reading the replayer's own structures → WASM setters
→ serializer → round-trip proof. Tim Follin is the prestige pick; batch the small-corpus
composers to amortize pipeline setup.

### Task 5.5 — Document the permanently-read-only set

`cus`/`cust`/`custom` (arbitrary 68k executables) cannot be editable. Mark explicitly in
FormatCapabilities + a docs note so "all formats editable" has a defined, justified
boundary. Same for chip-dump families (VGM/SID/SAP/… — different feature, out of scope).

---

## Phase 6 — TFMX Pro / 7V / HD (own project)

Biggest remaining corpus (Hülsbeck: Turrican, Apidya…). Engine exists (TFMXModule, base
format only). Extend: Pro macros, 7-voice mode, HD sample handling; TFMX7VEncoder exists
but unverified. Needs its own research+plan cycle once Phases 0-2 land — do not start it
inside this plan.

---

## Success criteria (whole plan)

Automated:
- `npm run type-check` + full `test:ci` green at every phase boundary.
- Encoder + exporter harnesses in CI with ratchets; zero `missing-fixture` for
  editable-labeled formats; ratchet counts: byte-exact codecs from 3 → every fixed-cell
  format in Groups 1-3.
- Persistence round-trip tests cover all `*FileData` fields (completeness ratchet).
- MCP `export_native` and UI export produce identical bytes for the same song (shared
  router test).

Manual:
- Edit → export → reload → edit survives, spot-checked per phase in real Chrome via MCP.
- A previously play-only format (e.g. DavidHanney) loaded, pattern edited, exported,
  re-imported, played — full native-tracker loop.

## Agent execution notes

- One task per session; read this plan + the research doc first; each task lists its own
  verify steps — run them before claiming done.
- Fixtures are REAL songs (house rule). UADE ASM + OpenMPT/NostalgicPlayer are the
  references; `third-party/` is never authoritative.
- Never trust UADE tick-reconstruction as pattern truth (research §1 ground rule).
- Update the ratchet files in the same commit as the fix; never loosen a ratchet.
- Cross-session state: append progress to
  `thoughts/shared/handoffs/YYYY-MM-DD_uade-editability-<task>.md`.
