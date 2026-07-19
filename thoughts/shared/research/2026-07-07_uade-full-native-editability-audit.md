---
date: 2026-07-07
topic: uade-full-native-editability-audit
tags: [uade, editability, export, wasm, architecture, audit]
status: final
---

# UADE Full Native Editability — Deep-Dive Audit (2026-07-07)

Question: we want ALL UADE formats fully editable as if in their native Amiga trackers —
full pattern data, synths, and native export. What exists, and what must improve?

Four parallel deep-dive agents surveyed: (1) UADE format landscape, (2) the editable-format
architecture recipe, (3) export + persistence, (4) WASM replayer engines. This doc is the
synthesis. Prior art it supersedes/extends: `2026-07-02_uade-only-format-inventory.md`,
`plans/2026-04-06-uade-full-editability.md`.

## 1. The two editability strategies (both proven, both needed)

- **Strategy A — chip-RAM editing.** Real 68k replayer runs in UADE WASM; parser attaches
  `uadePatternLayout` (fixed cells) or `uadeVariableLayout` (packed streams) from
  `src/engine/uade/UADEPatternEncoder.ts:21-66,168-238`. Edit → `encodeCell` →
  `UADEChipEditor.patchPatternCell` (`src/engine/uade/UADEChipEditor.ts:112-125`) → write
  into emulated chip RAM at `moduleBase + getCellFileOffset` (moduleBase = BE u32 @ chip
  `0x100`). Replayer reads the cell next tick — the edit IS the file. Export =
  `readEditedModule` dumps the edited module byte-for-byte. Latest exemplar: Tomy Tracker
  (`b068590f9`) — codec + parser decode + layout + label + byte-exact round-trip test,
  6 files, one session.
- **Strategy B — native port + synth param bridge.** Replayer transpiled/ported to its own
  WASM engine; synthesis params reflected out of and back into the running WASM. Gold
  standard: **Sonix** 4-layer bridge (WASM get/set C API → worklet messages → engine
  `onSynthParams`/`setSynthParams` → store bridge in `src/engine/registry/builtin/sonix.ts:44-67`).
  Cinter4 is the variant where the synth is reimplemented in TS (`cinter4SynthCore.ts`)
  with byte-exact parity lock-tests vs baked Amiga PCM.

Ground rule (from 2026-07-02 research, still valid): UADE trace/tick reconstruction can
NEVER produce round-trippable pattern data. Real editability = real parser reading the
format's own structures.

## 2. Current coverage (agent 1, exhaustive tables in agent output)

~175 UADE player formats. Tiers today:

| Tier | Count | What they have |
|---|---|---|
| Group 1: dedicated WASM engine + parser + encoder + exporter | ~30 | full fidelity (Hively, FC, JamCracker, MusicLine, SoundMon, SidMon1/2, DeltaMusic1/2, TFMX base, Sonic Arranger, …) |
| Group 2: parser + encoder + dedicated exporter, UADEEditable streaming audio | ~26 | TCB, GMC, HippelCoSo, SymphoniePro, AMOS, DigitalSymphony, MusicAssembler, PumaTracker, IFF-SMUS, KRIS, … |
| Group 3: uadePatternLayout + codec, export via generic chip-RAM readback | ~60 | CoreDesign, MarkCooksey, JasonPage, BenDaglish, RichardJoseph, WallyBeben, FashionTracker, TomyTracker, packers, … |
| Play-only (uade-only family / catchall regex) | ~35-40 prefixes | Tim Follin, Hippel base(hip/mcmd/sog), Beathoven, RiffRaff, HowieDavies, DavidHanney, EMS, Silmarils, SynthDream, VoodooSupreme, DariusZendeh, agi, … |

Format-state dashboard (tools/format-state.json, 1668 song entries): editability
full=68, chip-ram=453, read-only=69, none=48, untracked=681. patternQuality partial=45,
none=50.

Infrastructure: 90 encoders in `src/engine/uade/encoders/` (88 registered),
`GenericEncoderFactory.ts` (declarative codecs, underused), 216 parsers, ~100 exporters,
60 `WASM_ENGINES` descriptors (`NativeEngineRouting.ts:90-841`), ~33 engines with live
cell-edit setters, ~35 with synth-param setters, 5 worklet-serialize engines.

## 3. Defects found (correctness bugs, fix first)

1. **MCP `export_native` silently loses chip-RAM edits.** UI path
   (`useExportDialog.ts:489-517`) has the `UADEChipEditor.readEditedModule` fallback; MCP
   path (`writeHandlers.ts:2694-2705`) falls back to RAW ORIGINAL BYTES. Any format
   without a dedicated exporter exports un-edited via MCP.
2. **MCP dispatcher is a stale duplicate of the UI dispatcher.** `writeHandlers.ts:2582-2688`
   missing ~16 branches the UI has (SynTracker, plain-MOD bake, musicLine, tfmx, fredEditor,
   deltaMusic1/2, sidmon1, sonicArranger, symphoniePro, …). Duplicated exporterMap literal.
3. **.dbx / IndexedDB save drops ~30 formats' engine bytes.** `BINARY_FILE_DATA_FIELDS`
   allowlist (`src/lib/export/exporters.ts:19-28`, 30 fields) vs ~60 `*FileData` fields on
   `TrackerSong` (`TrackerReplayer.ts:244-404`). Missing: cinter4FileData, tfmxFileData(+smpl),
   soundMonFileData, sonicArrangerFileData, robHubbardFileData, deltaMusic1/2, oktalyzer,
   inStereo1/2, quadraComposer, actionamics, activisionPro, synthesis, dss, soundFactory,
   faceTheMusic, davidWhittaker, digMug, coreDesign, soundControl, soundFx, gmc, voodoo,
   fredReplayer, adplug, cheeseCutter, pmd, fmplayer, mdxmini, … These formats do not
   survive project save/reload.
4. **Companion files not serialized.** `sonixSidecarFiles` (TrackerSong:283) and
   `uadeCompanionFiles: Map` (:383) never enter SavedProject/SongExport — two-file formats
   (Sonix .instr/.ss, TFMX mdat+smpl, RichardJoseph, JasonPage) lose companions on save.
5. **Schema-version hard-discard** (`useProjectPersistence.ts:546-553`): older projects
   silently dropped, violates the localStorage-migration house rule (rule speaks of
   localStorage; same principle applies to IDB).

## 4. Architecture debt (why adding formats is slower than it should be)

1. **No single editable-format capability object.** Facts scattered across SIX places:
   `uadePatternLayout` on the song, `SynthRegistry`, `EDITABLE_FORMAT_LABELS` +
   `NATIVE_EXPORTABLE_LABELS` hand-lists (~90% overlapping, `FormatCapabilities.ts:17-141`),
   and THREE export dispatchers (useExportDialog, writeHandlers, FT2Toolbar Cinter special-case).
   Capabilities should be DERIVED: encoder registered ⇒ editable; exporter registered ⇒
   exportable.
2. **Export routing triplicated** (UI chain + MCP chain + FT2Toolbar). One exporter
   registry keyed by formatId, consumed by all three.
3. **`patchPatternCell` call sites copy-pasted 3×** in `useTrackerStore.ts` (:179, :504,
   :692) + a fourth divergent TFMX direct-write path (:521-527).
4. **Synth param bridge is Sonix-bespoke.** No generic `WasmSynthParamBridge`; next synth
   format re-implements 4 layers by hand.
5. **Hand-written codecs where `GenericEncoderFactory` descriptors would do** — dozens of
   the 90 encoders are near-identical ProTracker/note-index shapes.

## 5. Fidelity debt (does "editable" actually round-trip?)

- Byte-exact round-trip tests exist for only **3** formats: SynTracker, TomyTracker,
  Cinter4 (+ Cinter golden-export). JamCracker/SoundMon/HippelCoSo tests tolerate 90-95%
  note match — lossy codecs pass. The other ~85 encoders and ~50 exporters have **zero**
  automated round-trip verification.
- `EDITABLE_FORMAT_LABELS` overstates: many Group-3 labels have layouts whose decode
  quality was never audited (format-state patternQuality partial=45/none=50).
- Instrument/sample editing deferred for most chip-RAM formats (Tomy ships placeholder
  instruments); synth formats (Fred, RonKlaren, Beathoven-class) need Strategy B.

## 6. Coverage gaps (formats still play-only) — from 2026-07-02 priority + agent 1

- **Tier 1 routing wins (cheap):** thx→Hively; hip/mcmd/sog→native Hippel; sa-p/lion/sa_old
  →SonicArranger old-version parser; bfc/bsi→FC depacker; ~26 ProWiz-packed MOD variants
  →depack-to-MOD.
- **Tier 2 composer replayers (Tomy-recipe or transpiler):** Tim Follin (prestige),
  Darius Zendeh/MarkII, DavidHanney (DSNG/SEQU IFF — data format, easy), HowieDavies,
  RiffRaff, Beathoven (pattern data inside replay code — needs disassembly).
- **Tier 3 synth formats:** SynthDream, VoodooSupreme, DynamicSynthesizer, EMS, Medley,
  SUN-Tronic, SPL, Silmarils, ForgottenWorlds, AMOS abk, Pokeynoise, agi.
- **TFMX Pro/7V/HD:** biggest corpus (Hülsbeck), engine exists, weeks of feature work.
- **Never portable:** cus/cust/custom (arbitrary executables) — permanent UADE, read-only
  by design; document, don't chase.

## 7. Verdict

The machine is genuinely good — two proven strategies, 90 codecs, ~116 formats with some
editability, a repeatable one-session recipe (Tomy), and a lock-step verification culture.
What blocks "ALL formats fully native editable" is not more format grinding first; it is:

1. **Correctness:** save/export paths lose data TODAY for dozens of already-editable
   formats (§3). Fixing those multiplies the value of every existing codec.
2. **Verification:** without a mass round-trip harness, "editable" is unproven for ~85
   encoders. A harness turns format work from faith to ratchet.
3. **Unification:** a single EditableFormatDescriptor registry + derived capabilities +
   shared bridges makes each new format a descriptor, not 6 scattered edits.
4. Then coverage: routing quick-wins → data formats via Tomy recipe → synth formats via
   Sonix bridge → TFMX Pro/7V as its own project.

Plan: `thoughts/shared/plans/2026-07-07-uade-full-native-editability.md`.

## Key file index

- Layouts/codecs: `src/engine/uade/UADEPatternEncoder.ts`, `src/engine/uade/encoders/` (90),
  `src/engine/uade/GenericEncoderFactory.ts`, `src/engine/uade/UADEChipEditor.ts`
- Dispatch: `src/lib/import/formats/UADEParser.ts` (NATIVE_ROUTES :512),
  `src/lib/import/parsers/AmigaFormatParsers.ts`, `withFallback.ts`,
  `src/lib/import/FormatRegistry.ts:2304-2360` (uade-only)
- Capability: `src/lib/import/FormatCapabilities.ts:17-141`,
  `src/engine/replayer/NativeEngineRouting.ts:90-841`, `useFormatStore.applyEditorMode:769`
- Export: `src/hooks/dialogs/useExportDialog.ts:267-517`,
  `src/bridge/handlers/writeHandlers.ts:2527-2733`, `src/lib/export/` (~100)
- Persistence: `src/lib/export/exporters.ts:19-141`, `src/hooks/useProjectPersistence.ts`
- Synth bridge exemplars: `src/engine/registry/builtin/sonix.ts`, `SonixEngine.ts`,
  `public/sonix/Sonix.worklet.js:203-269`, `src/engine/cinter4/*`
- Tests: `src/__tests__/export-roundtrip.test.ts`, `tomyTrackerRoundtrip.test.ts`,
  `synTrackerRoundtrip.test.ts`, `tools/uade-audit/`, `tools/sonix-audit/lockstep.test.ts`
