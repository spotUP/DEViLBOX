---
date: 2026-07-08
topic: uade-editability-remaining-multisession-work
tags: [uade, editability, encoder, exporter, phase-3, phase-4, phase-5, backlog, multi-session]
status: final
---

# UADE editability — remaining multi-session work (post-digiBooster triage)

Companion to `2026-07-08_uade-variable-encoder-triage.md` (the evidence). This is the
forward-looking worklist: every remaining item that is **larger than one agent session**,
sized, sequenced, and pointed at the right references. Parent plan:
`thoughts/shared/plans/2026-07-07-uade-full-native-editability.md`.

## Ground truth (what "editable" means here, and the two round-trip harnesses)

There are TWO independent verification harnesses. Do not confuse them:

1. **Encoder harness** — `src/engine/uade/__tests__/encoderRoundtrip.harness.test.ts` +
   `encoderRoundtrip.ratchet.json`. Measures the **per-block chip-RAM editor**
   (`encodeCell` / `VariableLengthEncoder.encodePattern`) against the original bytes.
   This is the LIVE-EDIT path: user edits a cell → encode → poke chip RAM → the running
   68k replayer reads it on the next tick.
2. **Exporter harness** — `src/lib/export/__tests__/exporterRoundtrip.harness.test.ts` +
   `exporterRoundtrip.ratchet.json`. Measures the **full-file serializer**
   (`exportAs<Format>`). This is the SAVE/EXPORT path: whole song → native file.

A format can be "editable" via EITHER path. Several formats have a strong exporter but a
weak/absent encoder (or vice-versa). **Never fake a byte-exact/matchPct downward; add an
honest tier rather than loosening a ratchet** (house rule; the harnesses enforce
monotonic-improve).

House rules that bind all items below: root-cause only; every bug fix ships a regression
test wired into `test:ci` and revert-checked; `npm run type-check` (`tsc -b --force`) must
pass; real committed song fixtures only (never synthetic bytes); references in priority
order — UADE ASM (`third-party/uade-3.05/amigasrc/players/…`) > OpenMPT
(`third-party/openmpt-master/soundlib/Load_*.cpp` — clean upstream preferred if present
under `/Users/spot/Code/Reference Code/`) > NostalgicPlayer > libxmp. Never trust UADE
tick-reconstruction as pattern truth.

---

## A. Variable-encoder rewrites (the six ~0% encoders) — HIGHEST-VALUE, multi-session each

Root finding (probe evidence in the companion handoff): the six ~0% variable encoders are
**incomplete or non-invertible per-block encoders**, NOT case-B re-serializers. Byte-exact
is impossible AND a naive pattern-data tier would be circular or ~0. Each needs real work.
Split into two sub-tracks by root cause.

### A.1 — Interleaved PC-tracker formats: `it`, `s3m`, `xm`  (1 session each, or 1 for all-XM + research)

Problem: `VariableLengthEncoder.encodePattern(rows, channel)` is a **per-channel** API, but
IT/S3M/XM store a pattern as ONE block interleaving ALL channels per row (probe: IT block
fp=0 carries channel bytes `0x81..0x90`; the encoder emits only `0x81…`, ~1/N of the block).
So both byte-exact and parse→reparse fail structurally.

Decision to make FIRST (analyse-first): these are **libopenmpt** formats. They are not
edited by poking chip RAM (there is no 68k replayer). The per-block encoder is
**vestigial**. Two candidate levels:
- **(preferred, smaller) Route editability through the full-file exporter.** `XMExporter`
  already exists (`exportAsXM`). Add IT and S3M exporters (`ITExporter`, `S3MExporter`),
  wire them into `nativeExportRouter.ts` (`NAMED_EXPORTERS`) + `exporterFixtures.map.ts`,
  and REMOVE the `it/s3m/xm` entries from the ENCODER `fixtures.map.ts` (they measure a
  path that is not the contract). Removing them is allowed only if it does not GROW
  `unexercisedRegistered` — so also either delete the vestigial `registerVariableEncoder`
  for these ids OR keep them out of the registry. Confirm the ratchet's
  "unexercised only shrinks" guard still passes.
- (larger, not recommended) Change the variable-layout contract to a whole-pattern
  (all-channel) `encodePattern(pattern, channels[])` and rewrite these three encoders to
  emit the interleaved block. Only worth it if we ever want live chip-RAM editing for these
  (we do not — they are PC formats).

References: `third-party/openmpt-master/soundlib/Load_it.cpp`, `Load_s3m.cpp`,
`Load_xm.cpp` (pack/unpack of the mask-compressed pattern stream). Parsers:
`src/lib/import/formats/{ITParser,S3MParser,XMParser}.ts`.
Exporter round-trip today: `xm` exporter exists; measure it in the exporter harness and
ratchet honestly. `it`/`s3m` exporters: NEW.
Exit bar: exporter harness `pattern-match` ≥ (parser's own decode fidelity) for a real
`.it`/`.s3m`/`.xm` fixture; encoder-harness rows for these removed or honestly re-tiered.

### A.2 — `musicLine`  (1 session)

Problem: the variable encoder emits a **fixed 1536-byte grid** regardless of row count; the
native format is a packed variable-length stream (probe: orig 212 B for a 64-row pattern,
9 B for a 1-row pattern). Encoder never matches.

Note: a full-file `MusicLineExporter` ALREADY exists and round-trips **76.84%** in the
exporter harness (`exporterRoundtrip.ratchet.json` → `musicLine`). So editability partly
exists via export. Two tasks:
1. Fix/raise the `MusicLineExporter` from 76.84% toward its true max (read
   `src/lib/import/formats/MusicLineParser.ts` for the packed-stream framing; reference
   `/Users/spot/Code/Reference Code/musicline-vasm` — the original vasm source is vendored).
   Regression test + revert-check.
2. Decide the fate of the per-block `MusicLineEncoder` (rewrite to the packed stream, or
   drop it as vestigial like A.1 if editing is export-only).
Exit bar: `MusicLineExporter` pattern-match materially > 0.7684 with a documented true max.

### A.3 — Amiga per-step-transpose synth formats: `benDaglish`, `hippelCoSo`  (1-2 sessions each)

Problem (both): the parser bakes a **per-song-step transpose** into the decoded cell note
(`BenDaglishParser`: `transposedNote = (note + transpose) & 0x7F`; `HippelCoSoParser`:
`cosoNoteToXM(noteVal, trackTransp)`). The same pattern block is shared across steps with
DIFFERENT transposes, so a per-block encoder that only sees the baked note cannot recover
the stored note. They also drop non-note framing (BD `0x80+` sample-mapping commands;
CoSo `fd/fe` loop/repeat commands) — losing instrument assignment and loop structure.

`hippelCoSo` already has a full-file exporter (`exportAsHippelCoSo`, **99.32%** in the
exporter harness, with a regression test) — that IS its editability contract today. So the
per-block CoSo encoder is largely redundant.

Options per format:
- **(preferred)** Treat the full-file exporter as the editability contract. hippelCoSo is
  done (99%). benDaglish has NO exporter yet → write `BenDaglishExporter` (reference the
  BD replayer ASM + `BenDaglishParser.ts` track/step model: notes 0-0x7E, `0x7F` rest,
  `0x80+` sample map, `0xFF` end; per-step transpose lives in the song-step table, not the
  track block). Wire into the router + fixtures + exporter harness. Regression + revert.
- (larger) Make the variable layout carry the per-step transpose into the encoder and
  preserve `0x80+`/`fd/fe` framing so live chip-RAM edits are byte-faithful. Only needed if
  we want in-place editing of the running replayer for these; otherwise export covers it.

References: BD replayer + `src/lib/import/formats/BenDaglishParser.ts`; CoSo replayer +
`src/lib/import/formats/HippelCoSoParser.ts` (lines ~446-636 build the variable layout).
Exit bar: benDaglish exporter pattern-match high (document its true max — expect < 100%
because the per-step transpose + `0x80+` sample-map recovery is inherently constrained);
per-block encoders removed-or-honestly-tiered as in A.1.

---

## B. digiBooster follow-up (optional, small but blocked on a fixture)

digiBooster exporter is at its **true max 99.94%** for the committed fixture (LANDED:
regression test + `docs/formats/DigiBooster.md`). The residual is octave-(-1) notes that
DBM0 cannot store, present only because the fixture is a DigiBooster 1.x `.digi` baked into
a DBM0 export. To close the gap honestly:
- Add a real native **`.dbm`** (DigiBooster Pro) fixture whose notes are all ≥ C-0. Its
  export should then be much closer to byte-exact. Add it to `exporterFixtures.map.ts`.
- (Deeper, out of scope) The DEViLBOX DBM0 parser decodes notes as linear `raw + 12`, but
  OpenMPT `Load_dbm.cpp` decodes packed nibbles `((note>>4)*12)+(note&0xF)+13`. If a real
  `.dbm` fixture round-trips poorly, the parser note-base is wrong — a shipped-playback
  correctness fix (own task; changes pitch; needs lock-step care).

---

## C. Remaining lossy encoders/exporters below byte-exact (Phase-3 continuation)

The ratchets list many formats still `lossy`/`pattern-match`. These are the next
mechanical-but-real Phase-3 targets (one session each; read the parser + reference, find
which cells mis-round-trip, fix at root, ratchet up, regression + revert). Not exhaustive —
regenerate the ratchet report for the live list. High-value examples pulled from
`encoderRoundtrip.ratchet.json` (fixed-cell codecs, so byte-exact is the real exit bar):

- `midiLoriciel` 0%, `glueMon` 0%, `ronKlaren` 0%, `sidmon1` 0%, `soundControl` 0%,
  `soundFactory` 0%, `plm` 0% — all `decode-encode` fixed codecs at 0%: the decodeCell/
  encodeCell pair is not an inverse. Each is a contained bug hunt.
- `format669` 0.26%, `stm` 0.17%, `digitalMugician` 0.52%, `infogrames` 0.8% — near-zero
  fixed codecs.
- Mid-range worth raising: `customMade` 6.6%, `quartet` 6.3%, `far` 10.2%,
  `sonicArrangerSas` 12.9%, `scumm` 13.3%, `tfmx` 14.7%, `markII` 16.8%.
- Exporter side (`exporterRoundtrip.ratchet.json`): `digitalMugician` exporter 77.9%,
  `musicLine` 76.84% (see A.2), plus any `reparse-error`/`export-error` rows.

Method note: for `encode-parsed` rows (layout has no decodeCell) a sub-100% can be parser
normalization, not a codec bug — verify before "fixing".

---

## D. Missing fixtures (blocks measurement, not a code fix) — 1 session batch

`exporterRoundtrip.ratchet.json` → `missingFixture` currently includes `digitalSymphony`
(and the encoder ratchet's `unexercisedRegistered` lists ~40 registered encoders with no
fixture: `aProSys, actionamics, amf, amosMusicBank, artAndMagic, c67, chuckBiscuits,
composer667, digiBooster, digitalSymphony, dmf, dsm_dyn, dss, dtm_204, dtm_pt, gmc,
graoumfTracker2_gtk4/5, ice, imf, ims, inStereo1, karlMorton, kris, leggless,
med_mmd0/1, mfp, mt2, octamed_mmd0/1, oktalyzer, psm, pt36, sawteeth, sonixMusicDriver,
soundFactoryStub, startrekkerAM, stk, wantedTeamDaveLowe, xmf`). For each: find a real
committed song that yields that layout/exporter, add it to the fixtures map, regenerate the
ratchet (`DEVILBOX_GEN_RATCHET=1`), review the diff (must not drop / must not grow
unexercised), commit. This converts "unmeasured" into an honest baseline and unblocks the
Phase-3 fixes above. The set may only SHRINK (harness-enforced).

---

## E. Phase 4 — instrument / synth editability wave (multi-session, per parent plan §Phase 4)

Not started here. Two sub-tracks (see plan for detail):
- **4.A** Sample-instrument editing for chip-RAM formats (Tomy explicitly deferred sample
  editing): parse real sample descriptors (UADE ASM `SampleInit`), map struct fields to a
  `uadeInstrumentLayout` so instrument edits poke chip RAM like cells. Exemplars already
  wired: RobHubbard/DavidWhittaker/FC `*Controls.tsx` + `UADEChipEditor`.
- **4.B** Synth-param editing via `WasmSynthParamBridge` (Fred Editor, Ron Klaren, Sonic
  Arranger synth voices, DeltaMusic synth, Hippel, FC macros…). Sonix P7 (save edited
  params back to native `.instr`) is the first task and closes the open Sonix handoff item.
  Follow the `no-minimal-editors` rule (every struct field, bitfields broken out) and the
  `sonixSynthLiveEdit.test.ts` live-edit test pattern.

---

## F. Phase 5 — coverage wave (play-only → editable) (multi-session, per parent plan §Phase 5)

Not started here. Batches:
- **5.1** Routing quick-wins: `thx`→Hively, `hip`/`mcmd`/`sog`→native Hippel,
  `sa-p`/`lion`/`sa_old`→SonicArranger old path, `bfc`/`bsi`/`fc-bsi`→`FUCO` depacker in
  front of FCParser. Each: FormatRegistry route + fixture + detection test + harness entry.
- **5.2** ProWiz-packed MOD sweep (~26 packed-MOD prefixes → depack → MOD → full editing).
- **5.3.x** Data-format ports via the Tomy recipe (commit `b068590f9`): DavidHanney,
  FredGray, Quartet, SteveBarrett, ThomasHermann, KimChristensen, Desire, EMS, Medley,
  SUN-Tronic siblings, Silmarils, ForgottenWorlds, AMOS abk. One session each.
- **5.4.x** Compiled-replayer ports via the transpiler pipeline (`transpile-debug-68k-replayer`
  skill): Beathoven, RiffRaff, HowieDavies, Tim Follin, DariusZendeh/MarkII. Multi-session
  each; Tim Follin is the prestige pick.
- **5.5** Document the permanently-read-only set (`cus`/`cust`/`custom` arbitrary 68k;
  chip-dump families VGM/SID/SAP) so "all editable" has a defined boundary.

---

## G. Phase 6 — TFMX Pro / 7V / HD (own project, per parent plan §Phase 6)

Biggest remaining corpus (Hülsbeck: Turrican, Apidya…). Engine exists (`TFMXModule`, base
format only). Extend: Pro macros, 7-voice mode, HD sample handling; `TFMX7VEncoder` exists
but unverified. Needs its OWN research+plan cycle. Do not start inside the Phase-0-2 plan.

---

## Recommended sequencing

1. **D (missing fixtures)** first — cheap, unblocks honest measurement of everything else.
2. **A.1 / A.2 / A.3** — closes out the six ~0% encoders via the exporter-route decision
   (smaller than encoder rewrites; matches how the app actually edits these).
3. **C** — grind the lossy fixed codecs to byte-exact, one per session.
4. **B** — add a native `.dbm` fixture (optional).
5. **E / F** — the instrument/synth and coverage waves (largest; own mini-plans).
6. **G** — TFMX, separate project.

## Key files / entry points

- Encoder harness + ratchet: `src/engine/uade/__tests__/encoderRoundtrip.harness.test.ts`,
  `encoderRoundtrip.ratchet.json`, `fixtures.map.ts`.
- Exporter harness + ratchet: `src/lib/export/__tests__/exporterRoundtrip.harness.test.ts`,
  `exporterRoundtrip.ratchet.json`, `exporterFixtures.map.ts`.
- Regression tests: `src/lib/export/__tests__/exporterRoundtripRegressions.test.ts`
  (add each fix here — it is in `test:ci`).
- Encoder registry + contracts: `src/engine/uade/UADEPatternEncoder.ts`,
  `src/engine/uade/encoders/*Encoder.ts`, `encoders/index.ts`.
- Export router: `src/lib/export/nativeExportRouter.ts` (LAYOUT_EXPORTERS + NAMED_EXPORTERS).
- Docs per format: `docs/formats/*.md` (`docs/` is gitignored — force-add: `git add -f`).
- Parent plan: `thoughts/shared/plans/2026-07-07-uade-full-native-editability.md`.
- Prior triage (evidence): `thoughts/shared/handoffs/2026-07-08_uade-variable-encoder-triage.md`.
