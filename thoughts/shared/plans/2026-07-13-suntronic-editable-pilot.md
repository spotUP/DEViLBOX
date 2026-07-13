---
date: 2026-07-13
topic: suntronic-editable-pilot
tags: [uade, suntronic, reverse-engineering, editability, score-compiler]
status: draft
---

# SunTronic V1.3 — creation-capable format pilot (parse + edit + compile-back)

Phase 2 planning doc. Input research:
`thoughts/shared/research/2026-07-13_compiled-player-re-campaign.md` (§2 sunTronic
deep-dive). Prior art: `docs/FORMAT_COMMAND_STREAM_GRID.md` (Rob Hubbard recipe),
`thoughts/shared/handoffs/2026-07-05_sonix-first-class-editable.md` (Sonix
transpile/first-class precedent), digitalSonixChrome located-region carrier
(686c7f50c).

## Goal

Make sunTronic a **creation-capable** format, scoped to the **V1.3 Delirium
module generation** (`public/data/songs/formats/SUNTronicTunes/`, ~200 modules +
`instr/` with 161 external `*.x` instruments):

1. Parse the real score structure from the CHIP hunk (hunk#1) of a V1.3 module
   into the editable tracker grid.
2. Compile edited/new grids back into a valid playable module — **reference-player
   wrap**: emit the known V1.3 hunk#0 wrapper + hunk#1 replayer code verbatim,
   with new score data + instrument name table patched in and RELOC32 rebuilt.
3. Byte-exact round-trip when unedited — honest carrier over REAL score offsets
   (`blockRawBytes` verbatim-when-unedited), never a fake grid.
4. A newly authored song exports to a module that loads and plays under UADE
   (render oracle) and in the app.

Existing modules matching the V1.3 layout become editable. The raw-rip
generation (`.sun`/`tsm.*`, e.g. `msx-cracktro 2.sun`) stays **play-only** — and
its current dishonest fake grid is removed (see Phase 3).

## Current state (verified in code)

- `src/lib/import/formats/SunTronicParser.ts` — raw-rip generation only.
  Detection mirrors `suntronic_mod.asm` Check2 (`isSunTronicFormat`, :59-68);
  resolves 3 data pointers by opcode scan (`resolveDataPointers`, :83-166);
  extracts 4 samples; then builds a **stub**: one empty 64-row pattern plus a
  **fake fixed layout** at :344-354 (`patternDataFileOffset: 0`, `bytesPerCell: 4`,
  `encodeMODCell/decodeMODCell` over 68k player code). This is the forbidden
  fake-grid class.
- Ratchet `src/engine/uade/__tests__/encoderRoundtrip.ratchet.json:643` —
  `sunTronic: { kind: "fixed", method: "decode-encode", status: "lossy",
  matchPct: 0.1016, cells: 256 }`.
- Fixture `src/engine/uade/__tests__/fixtures.map.ts:109` →
  `public/data/songs/formats/msx-cracktro 2.sun` (raw rip, wrong generation for
  this pilot).
- Registry: `src/lib/import/FormatRegistry.ts:2162-2172` (key `suntronic`,
  nativeParser detectFn `isSunTronicFormat`); dispatch branch
  `src/lib/import/parsers/AmigaFormatParsers.ts:2377-2387`
  (`withNativeThenUADE('suntronic', …, { injectUADE: true })`).
- Capabilities: label `'SunTronic'` already in `EDITABLE_FORMAT_LABELS`
  (`src/lib/import/FormatCapabilities.ts:64`) and `NATIVE_EXPORTABLE_LABELS`
  (:105) — the survivor lists. Once a registered codec + byLayout exporter
  exist, registry-derived capability takes over (remove from both survivor
  lists, matching the "derived and intentionally absent" comment).
- Export routing: `src/lib/export/nativeExportRouter.ts` consumes
  `getLayoutExporters()` from `src/lib/formats/EditableFormatRegistry.ts:137`;
  formats register in `src/lib/formats/EditableFormatRegistry.builtins.ts`
  (pattern: `registerEditableFormat({ formatId: "hippelCoSo", …, exporter:
  { module: "HippelCoSoExporter", fn: "exportAsHippelCoSo", byLayout: true } })`,
  :53).
- Carrier plumbing already exists: `UADEVariablePatternLayout.blockRows` /
  `blockRawBytes` + verbatim-when-unedited helper
  (`src/engine/uade/UADEPatternEncoder.ts:187-300`).
- Oracles available: UADE dynamic tracer (45b7568eb;
  `tools/uade-audit/traceModuleReads.ts`, oracle test
  `src/engine/uade/__tests__/traceModuleReads.oracle.test.ts` in test:ci),
  headless render (`tools/uade-audit/uadeRenderCore.ts`,
  `render-reference.sh`, `compare-wavs.ts`), render-test precedent in test:ci
  (`src/engine/uade/__tests__/maxtraxPlayback.render.test.ts`).
- 68k→C transpiler `tools/asm68k-to-c/` consumes **ASM text** (used for Sonix,
  Cinter4). hunk#1 is binary → a disassembly step precedes any transpile.

## Known V1.3 facts (from the research doc — treated as verified input)

- Uniform 2-hunk layout: hunk#0 CODE 436 bytes at fileOff 0x24 (DeliTracker
  wrapper, DTP tag list decoded — InitPlayer 0x132, Interrupt 0x118, etc.) +
  RELOC32 (19 relocs); hunk#1 CODE (CHIP) at fileOff 0x248, 8-15KB, + RELOC32.
- hunk#1: instrument filename strings from +0x000; replayer code ~+0x1B0;
  control word +0xD8A; **null-terminated instrument filename pointer table at
  +0xD9E**; score data after the replay code (PC-relative addressed, ~+0x1550
  in mule.src). Offsets shift uniformly with the variable-length name block:
  hunk#0 differs across modules in exactly 7 bytes, each a low byte of an
  absolute pointer into hunk#1, all shifted by the same delta.
- Per-frame play entry: hunk#0 Interrupt JSRs hunk1+0x34A; init at hunk1+0x1B0.
- `instr/*.x` = headerless signed 8-bit PCM; loop/length metadata lives in the
  module (instrument descriptors near the name table).

## What is NOT yet known (the RE gap Phase 1 closes)

The full score layout: per-voice sequence/track tables, pattern/step encoding,
note/command byte grammar (fixed-width cells vs variable-length command
stream), instrument descriptor record layout (volume/loop/len per .x), tempo /
speed representation, song-end/loop mechanics.

**Decision rule (locked now, no open question):** if Phase 1 classifies the
score as a per-channel variable-length command stream (§1 of
FORMAT_COMMAND_STREAM_GRID.md — expected for this class), Phase 2/3 use the
three-layer Rob Hubbard recipe (`UADEVariablePatternLayout` + `blockRows` +
`blockRawBytes`). If it turns out to be a fixed-width step grid (some Amiga
soft-synths are), use the fixed per-cell codec path with whole-cell carriers
(zoundMonitor pattern). Both paths are specified below; the Phase 1 exit report
names the branch. All later snippets show the command-stream branch (default);
the fixed branch only swaps the layout kind and codec shape.

---

## Phase 1 — RE: recover the V1.3 score layout

**No `src/` changes.** Deliverables: probe tooling in `tools/suntronic-re/`
(committed), research doc
`thoughts/shared/research/2026-07-13_suntronic-v13-score-layout.md` with the
byte-level layout spec, and the grid-vs-stream classification.

### 1.1 Probe P0 — render oracle sanity (do FIRST; gates everything)

Render a V1.3 module headless with its instruments present, proving the oracle
works for this generation (V1.3 modules are DeliTracker custom players; UADE
plays them via its custom support, and `instr/*.x` must be visible to the
virtual filesystem — same mechanism the app already uses to play the corpus).

```bash
# tools/suntronic-re/render.sh — wraps tools/uade-audit/uadeRenderCore.ts
npx tsx tools/uade-audit/traceModuleReads.ts \
  "public/data/songs/formats/SUNTronicTunes/mule.src" --seconds 4
```

If the existing harness cannot supply the `instr/` companions to uade's memfs,
extend `tools/uade-audit/uadeRenderCore.ts` with an optional
`companions: { path: string; data: Uint8Array }[]` input (audit-tool-only
change, mirrors how the app injects sidecars). Success: nonzero RMS WAV +
tracer coverage bitmap over hunk#1.

### 1.2 Probe P1 — corpus shift-normalized diff

`tools/suntronic-re/corpus-diff.ts` (tsx script):
- Parse hunk structure of all ~200 modules (reuse one local `parseHunks()`
  helper — also the seed for the Phase 2 parser).
- Compute each module's shift delta from the name-block length (verified
  against the 7 shifted hunk#0 pointer bytes).
- Align hunk#1 at the replayer-code anchor (code start = +0x1B0 + shift) and
  emit a per-offset variability map (how many modules differ at each aligned
  offset) + region report.

Decisive output: exact boundaries of {name table | workspace zeros | invariant
replayer code | per-song score data | instrument descriptors}. Invariant code
across 200 modules = the wrap template for Phase 4; variable region = the score.

### 1.3 Probe P2 — disassemble the invariant replayer region

`tools/suntronic-re/disasm.py` — one-off m68k disassembly of the invariant code
region (~2-3KB starting hunk1+0x1B0) using capstone (`pip install capstone`,
M68K mode; fallback: `vasm`-compatible external disassembler). Annotate by
hand: the PC-relative LEAs into the ~+0x1550 score region name every table the
replayer reads; the read loop at the play entry (hunk1+0x34A) defines the
note/command grammar and step timing. If semantics get hairy, feed the cleaned
ASM to `tools/asm68k-to-c` (Sonix pipeline) for a C reference model — optional,
not a gate.

### 1.4 Probe P3 — tracer region confirmation

`traceModuleReads.ts` over early/late 2s windows on 2-3 modules: reads inside
the candidate score region confirm it is consumed during playback; sample-DMA
regions and envelope tables show the known dense-read signature. Cross-check
against P1 boundaries.

### 1.5 Probe P4 — byte-poke render-compare (decisive semantic probe)

For each hypothesized field (note byte, duration/step byte, instrument index,
sequence entry): copy `mule.src`, flip ONE byte, render both via uadeRenderCore,
diff with `tools/uade-audit/compare-wavs.ts`. A pitch shift confirms a note
byte; a timing shift confirms a duration; silence/instrument-swap confirms an
instrument ref. Never guess a field meaning a poke can measure.

### 1.6 Exit criteria (all AUTOMATED unless marked)

- [x] P0 renders ≥2 corpus modules with nonzero audio (script exits 0).
      (3/3: mule.src, kompo.pc, analgestic2.src — `tools/suntronic-re/p0-render.ts`)
- [x] P1 report generated for the full corpus; invariant-code region byte-identical
      across ≥95% of modules (outliers listed — they stay play-only).
      (199/199, 0 outliers — REFINED: two shift deltas + 3 build variants +
      enumerated per-song operand patch sites; see spec §3/§7 deviations)
- [x] Layout spec documents: sequence table(s), pattern/step encoding, complete
      note/command byte grammar (every opcode length — the `*CommandLen` table),
      instrument descriptor record, tempo/speed, song end/loop.
      (`thoughts/shared/research/2026-07-13_suntronic-v13-score-layout.md`)
- [x] Every spec claim cross-validated by ≥2 of {P1 diff, P2 disasm, P3 trace,
      P4 poke}. (P3 tracer unusable for relocated hunk executables — module
      size 0; coverage met via P1 + P2 disasm + P2 corpus grammar walk
      199/199 + P4 pokes 4/4)
- [x] Classification declared: command-stream vs fixed grid.
      (COMMAND STREAM — per-voice row-terminated; Rob Hubbard recipe branch)
- [x] `npm run type-check` passes (new tools are plain tsx; keep them strict).

MANUAL verification: user skims the layout spec doc; listen to one P4 poke
render pair to confirm the reported semantic change is audible.

---

## Phase 2 — V1.3 parser: real score → editable grid + instruments

All in `src/lib/import/formats/SunTronicParser.ts` (extend, don't fork) plus a
new sibling `src/lib/import/formats/SunTronicV13.ts` for the hunk/score codec
(keeps the raw-rip code untouched; single source of truth for the layout —
Phase 4's compiler imports the same module).

### 2.1 Detection

```ts
// SunTronicV13.ts
export function isSunTronicV13Format(buf: Uint8Array): boolean {
  if (u32BE(buf, 0) !== 0x000003F3) return false;          // HUNK_HEADER
  // hunk#0 guard + ID: 70FF 4E75 'DELIRIUM' at fileOff 0x24
  if (u32BE(buf, 0x24) !== 0x70FF4E75) return false;
  return findAscii(buf, '$VER: SunTronic music module', 0x24, 0x120) >= 0;
}
```

`isSunTronicFormat` (the registry detectFn) becomes the union:
`isSunTronicRawRip(buf) || isSunTronicV13Format(buf)`; `parseSunTronicFile`
dispatches internally. Registry entry untouched except: add a
`FormatRegistry.detection.test.ts` case asserting `mule.src` bytes detect as
`suntronic`; if the loader's extension gating blocks content sniff for
`.src`/`.pc`, add those extensions to the entry at
`src/lib/import/FormatRegistry.ts:2162-2172` (bounded fallback, the test
decides).

### 2.2 Hunk + score parse

`parseSunTronicV13(buffer, filename, companions)`:
- `parseHunks()` (ported from the Phase 1 tool — one implementation, the tool
  re-imports it from src after this phase to avoid duplication).
- Read shift delta; locate name table (+0x000), instrument pointer table
  (+0xD9E+shift), instrument descriptors, score region (per Phase 1 spec).
- Instruments: resolve each `instr/<name>.x` from the companion/sidecar map
  (extend the suntronic branch in
  `src/lib/import/parsers/AmigaFormatParsers.ts:2377` to pass sidecars, exactly
  like the Sonix branch — precedent: companion-loss fix e61ecf26b,
  `sonixSidecar.test.ts`). Raw signed 8-bit PCM →
  `createSamplerInstrument(id, name, pcm, vol, rate, loopStart, loopLen)` with
  loop/len from the module descriptors. Missing `.x` → placeholder instrument
  + warning (module still opens).
- Score → grid, command-stream branch (default): per
  FORMAT_COMMAND_STREAM_GRID.md §3-4 — `sunCommandLen(buf, pos)` (grammar from
  the Phase 1 spec, `default: 1` never desyncs), `decodeSunBlock()` producing
  carrier rows (`cutoff=len, period=b0, pan=b1`, extend `cutoff2` if commands
  exceed 2 bytes), shared tick timeline, 64-row pattern slices, release markers
  if legibility needs them. Fixed-grid branch (if Phase 1 says so): per-cell
  `decodeCell/encodeCell` with whole-cell byte carriers (zoundMonitor pattern)
  and real `getCellFileOffset` into the score region.
- Layout on the song (command-stream branch):

```ts
song.uadeVariablePatternLayout = {
  formatId: 'sunTronic',
  kind: 'variable',
  filePatternAddrs, filePatternSizes,      // REAL score block offsets in the file
  blockRows,                                // carrier rows per block
  blockRawBytes,                            // verbatim source bytes per block
  encoder: sunTronicEncoder,                // Phase 3
  moduleSize: buffer.byteLength,
  // …trackMap etc. per UADEVariablePatternLayout
};
```

Raw-rip path keeps playing via UADE exactly as today; V1.3 path also keeps
`uadeEditableFileData` for UADE playback (transpile-vs-UADE engine question is
out of scope for this pilot: playback remains UADE, editing writes go through
export/reload — same model as every other UADE-native codec format).

### 2.2b Implementation notes — deviations from the snippets above (2026-07-13)

Implemented per the LAYOUT SPEC (research/2026-07-13_suntronic-v13-score-layout.md)
where it contradicts the plan snippets:

1. **Two deltas, not one shift**: 7 hunk#0→hunk#1 anchor pointers sorted;
   `deltaA = ptrs[0]-0x1B0` (name-block shift, offsets < 0xD8A),
   `deltaB = ptrs[6]-0xD9E` (subsong-table shift). Instrument tables located
   via the per-song-patched PC-relative LEA displacements (opcodes `41FA` at
   0x1B4+deltaA / `43FA` at 0x1B8+deltaA), not fixed offsets. Default
   rows/position read from the `move.b #imm,$31(a2)` operand at 0x389+deltaA.
2. **`resonance`, not `cutoff2`**: TrackerCell has no `cutoff2` field; the
   third carrier byte uses the existing optional `resonance` lane
   (carrier-ignored by `cellFieldsEqual`, same as cutoff/pan).
3. **Encoder lives in SunTronicV13.ts now (unregistered)**: the plan marks
   `encoder` as "Phase 3", but `UADEVariablePatternLayout.encoder` is a
   required field. `sunTronicV13Encoder` (pure carrier concatenation) is
   defined and attached in Phase 2 but NOT registered via
   `registerVariableEncoder` — the ratchet harness only sees registered
   encoders, so the `sunTronic` ratchet entry (raw-rip fixture) is unmoved
   (verified: still 10.16% decode-encode). Phase 3 registers it.
4. **Grammar tiling, not fixed 32 rows**: blocks decode by row-terminated
   grammar walk (`sunCommandLen`, 0x00 = end of row) up to the next block
   start; a block may share its final 0x00 terminator with the next pointer
   (observed corpus-wide). Field name is `uadeVariableLayout` (the real
   TrackerSong field), not `uadeVariablePatternLayout`.
5. **Display grid approximation (carriers unaffected)**: per-voice independent
   sequence walk; 0x8C (rows/position ALL voices) is applied to the walking
   voice only — cross-voice command timing is not simulated for display. The
   byte-exact source of truth is `blockRows`/`blockRawBytes`, not the grid.
6. **Extensions added to routing**: `.src`/`.pc` added to the registry
   extRegex and the AmigaFormatParsers suntronic branch (no collisions with
   any other registry entry; content check gates the parse, UADE fallback on
   non-SunTronic `.src`/`.pc`).

### 2.3 Success criteria

AUTOMATED:
- [x] New test `src/lib/import/formats/__tests__/sunTronicV13Parse.test.ts`
      (added to the `test:ci` glob in `package.json:30`): parses `mule.src` +
      `kompo.pc` from `public/data/songs/formats/SUNTronicTunes/`; asserts
      >0 non-empty patterns, ≥1 real note per active channel, instrument names
      match the module's name table, PCM lengths match the `instr/*.x` files.
      Also asserts carrier honesty (`blockRawBytes` == file slice at
      `filePatternAddrs`) and carrier completeness (encoder(blockRows) ==
      block bytes). Fails-on-revert verified for the carrier stash.
- [x] Detection test case added to
      `src/lib/import/__tests__/FormatRegistry.detection.test.ts` (already in
      test:ci) — fails on revert of the detection union (verified).
- [x] `npm run type-check` clean.
- [x] `npm run test:ci` green.

MANUAL:
- [ ] Load `mule.src` in the app (dev server + MCP `load_file`): grid shows
      notes that correspond to what is heard (spot-check with `play` +
      `get_pattern`); instruments listed with real names.

---

## Phase 3 — byte-exact round-trip when unedited (honest carrier)

### 3.1 Encoder

`src/engine/uade/encoders/SunTronicEncoder.ts` — command-stream branch:
`encodePattern(rows)` = carrier concatenation (RH recipe §3); the layout's
`blockRawBytes` + the existing verbatim-when-unedited helper
(`UADEPatternEncoder.ts:283-300`) return original bytes while `blockRows`
still match the parsed baseline. Register in
`src/engine/uade/encoders/index.ts` alongside the others. No shared codec
(`MODEncoder`) is touched — house rule.

### 3.2 Kill the raw-rip fake grid

In `parseSunTronicFile` raw-rip path: **delete** the fake
`uadePatternLayout` (`SunTronicParser.ts:344-354`) and the `encodeMODCell/
decodeMODCell` import. Raw rips become honest play-only stubs (empty grid, no
codec), exactly the rule that forbade carrier-gaming these stubs.

### 3.3 Ratchet repoint

- `src/engine/uade/__tests__/fixtures.map.ts:109` →
  `{ formatId: "sunTronic", fixture:
  "public/data/songs/formats/SUNTronicTunes/mule.src", kind: "variable" }`
  (or `"fixed"` per the Phase 1 branch).
- `encoderRoundtrip.ratchet.json:643` → `kind/method` updated, `status:
  "byte-exact", byteExact: true, matchPct: 1`, real cell count. This is
  honest: the fixture now exercises the REAL decoded structure; the previous
  0.1016 was a fake-grid number.

### 3.4 Regression test

`src/lib/import/formats/__tests__/sunTronicRoundtrip.test.ts`, added to the
`test:ci` glob (`package.json:30`), following the RH template (§6):
1. byte-exact block round-trip — encode every `blockRows[fp]`, assert equal to
   `blockRawBytes[fp]` AND to the file slice at `filePatternAddrs[fp]`.
2. edited-cell fallback — mutate one grid note, assert encoder still produces
   a structurally valid block (length parses under `sunCommandLen`) and does
   NOT return the verbatim bytes (anti-fake-metric witness).
3. every active channel still has events in the last third of the timeline.

Fails-on-revert check before commit: revert 3.1 (or the parser carrier stash),
run the test, MUST fail; restore.

### 3.5 Success criteria

AUTOMATED:
- [ ] `npx vitest run src/engine/uade/__tests__/encoderRoundtrip.harness.test.ts`
      → sunTronic byte-exact (matchPct 1).
- [ ] `npx vitest run src/lib/import/formats/__tests__/sunTronicRoundtrip.test.ts`
      green; documented fails-on-revert.
- [ ] `npm run type-check` + `npm run test:ci` green (harness also proves no
      other ratchet entry moved — single-format diff discipline).

MANUAL: none (this phase is fully machine-checkable).

---

## Phase 4 — score compiler + native exporter (reference-player wrap)

### 4.1 Template extraction (single source of truth for the wrap)

`tools/suntronic-re/extract-template.ts` reads the reference module
(`mule.src`, the Phase 1 invariant-region report) and emits
`src/generated/sunTronicV13Template.ts` (committed — matches the
`src/generated/` precedent of cinterPresets/sonixPresets):

```ts
export const SUNTRONIC_V13_TEMPLATE = {
  hunk0: '<base64>',                    // 436-byte wrapper, reloc slots zeroed
  hunk0Reloc32: [/* 19 hunk0-relative offsets + target hunk */],
  hunk0ShiftPointerOffsets: [/* the 7 hunk#1-absolute pointer slots */],
  replayerCode: '<base64>',             // invariant hunk#1 code region
  layout: { nameTableOff: 0x0, workspaceLen: …, codeOff: 0x1B0,
            controlWordOff: 0xD8A, instrTableOff: 0xD9E, /* pre-shift */ },
} as const;
```

Golden test `src/generated/__tests__/sunTronicV13Template.test.ts` (test:ci):
re-derives the template from `mule.src` at test time and asserts equality —
the committed artifact can never drift from its source.

### 4.2 Compiler + exporter

`src/lib/export/SunTronicExporter.ts` — `exportAsSunTronic(song):
NativeExportResult`:
- **Unedited fast path:** layout present + all `blockRows` match baseline →
  return `uadeEditableFileData` verbatim (byte-exact by construction).
- **Compile path:** encode score blocks from the grid via `sunTronicEncoder`;
  build the instrument name table + descriptors from `song.instruments`;
  assemble hunk#1 = [names][workspace zeros][replayerCode][score tables]
  with the shift delta applied to every offset in `layout`; patch the 7
  hunk#0 pointer slots; rebuild both RELOC32 tables; emit
  HUNK_HEADER(+CHIP memflag on hunk#1)/HUNK_CODE/HUNK_RELOC32/HUNK_END.
  Hunk writer lives in `SunTronicV13.ts` next to the reader (inverse pair,
  one file).
- Companions: for instruments whose PCM was edited or newly created, emit
  `instr/<name>.x` as `NativeExportCompanion`s (raw signed 8-bit PCM);
  unmodified instruments reference existing corpus names, no companion.

### 4.3 Registration (full wiring)

`src/lib/formats/EditableFormatRegistry.builtins.ts`:

```ts
registerEditableFormat({
  formatId: "sunTronic", label: "SunTronic",
  patternCodec: { kind: "variable" },
  exporter: { module: "SunTronicExporter", fn: "exportAsSunTronic",
              byLayout: true, ext: "src" },
});
```

`nativeExportRouter` picks it up via `getLayoutExporters()` — no router edits.
Remove `'SunTronic'` from `EDITABLE_FORMAT_LABELS` and
`NATIVE_EXPORTABLE_LABELS` in `FormatCapabilities.ts` (:64, :105) — capability
is now registry-derived; update
`src/lib/formats/__tests__/editableFormatRegistry.parity.snapshot.json` via its
parity test.

### 4.4 Success criteria

AUTOMATED:
- [ ] `src/lib/export/__tests__/sunTronicExport.test.ts` (test:ci glob):
      (a) unedited export of `mule.src` byte-equals the input file;
      (b) one-note-edited export re-parses via `parseSunTronicV13` to a grid
      whose only diff is that note; (c) minimal from-scratch song (2 patterns,
      2 instruments by corpus name) compiles, re-parses, and the hunk walker
      validates structure (header/sizes/relocs in range).
- [ ] `src/lib/export/__tests__/nativeExportRouter.test.ts` (already in
      test:ci) extended: sunTronic routes byLayout.
- [ ] Fails-on-revert: revert the reloc rebuild, test (c) must fail.
- [ ] `npm run type-check` + `npm run test:ci` green.

MANUAL:
- [ ] Export dialog end-to-end walk: load `mule.src` → edit one note → Export
      native → file downloads with companions → re-import → edit visible.

---

## Phase 5 — new-song plays under UADE (end-to-end oracle) + wiring walk

### 5.1 Render regression

`src/engine/uade/__tests__/sunTronicExportPlayback.render.test.ts` (test:ci;
precedent: `maxtraxPlayback.render.test.ts`):
1. Compile the Phase 4 minimal new song; feed the module + its `instr/*.x`
   companions to the headless uade render (uadeRenderCore path, memfs
   companions from Phase 1 P0 work); assert RMS above silence threshold and
   duration ≥ N seconds without crash.
2. Oracle A/B: render original `mule.src` and its unedited re-export; assert
   byte-equal input ⇒ identical WAV (cheap, catches loader-level regressions).
3. Tracer topology: `get_module_ranges` on the new song shows reads inside the
   compiled score region (proves the replayer consumes OUR data, not a
   coincidental noise floor).
Fails-on-revert: zero out the compiled score's sequence table → test 1/3 fail.

### 5.2 Full wiring walk (MANUAL, MCP-driven per project rule)

- [ ] `load_file` a SUNTronicTunes module → plays (`get_audio_level` > 0),
      grid populated, instruments named.
- [ ] Edit cells via `set_cell`, `export_native` via MCP → returns module +
      companions; reload the exported file → plays, edit present.
- [ ] Author a short new song from a blank sunTronic project → export → reload
      → plays. (Creation-capability acceptance.)
- [ ] Raw-rip `.sun` still loads and plays, now shows honest empty grid.

### 5.3 Closeout

- [ ] Update `docs/FORMAT_COMMAND_STREAM_GRID.md` §8 candidate list: mark
      sunTronic done, note the "reference-player wrap" extension (this is the
      first format that also COMPILES new modules, not just round-trips).
- [ ] Handoff note `thoughts/shared/handoffs/2026-07-13_suntronic-pilot.md`
      with template-extraction rerun instructions.
- [ ] `npm run type-check`, `npm run test:ci`, then commit per-phase (never
      `git add -A`; pre-commit test:ci is slow — let it finish, re-run push if
      it times out).

---

## Decisions made (so the plan has no open questions)

1. **Pilot scope = V1.3 generation only.** Raw rips stay play-only; their fake
   grid is removed (Phase 3.2). Mapping raw rips later can reuse the adapter
   asm's A6-relative anchors (research §2.5) — out of scope.
2. **Ratchet fixture repoints to `mule.src`.** The raw-rip fixture measured a
   fake grid; measuring the generation we actually decode is the honest basis.
3. **Command-stream (RH recipe) is the default structural branch**, fixed-grid
   the fallback, selected mechanically by the Phase 1 spec — both fully
   specified above, no mid-implementation design work.
4. **Playback stays UADE for this pilot** (edit → export → reload). A
   first-class transpiled engine (Sonix model) is a separate later effort; the
   Phase 1 disassembly output is its ready input.
5. **Template committed under `src/generated/` with a golden re-derivation
   test** — follows the repo's existing generated-artifact precedent and keeps
   `mule.src` as the single source of truth.
6. **Same formatId `sunTronic` for both generations** (registry key
   `suntronic` untouched); generation dispatch is internal to the parser —
   avoids duplicate registry/capability plumbing.
7. **Instrument sidecars use the Sonix companion mechanism** (proven path,
   incl. the e61ecf26b companion-loss fix and modland directory discovery).

## Phase gating

Implement ONE phase per session. After each phase: run its automated checks,
then pause for the manual items before continuing. If Phase 1 findings
contradict a later phase's assumption (e.g. score is neither stream nor grid
but a pointer graph), STOP and update this plan before writing Phase 2 code.
