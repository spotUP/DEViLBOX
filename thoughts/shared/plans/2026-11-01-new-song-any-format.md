---
date: 2026-11-01
status: planned
topic: New Song in any editable format
---

# New Song in any editable format

## Goal

The New Song wizard and MCP `new_song` start a blank song that IS a song in the chosen format: the format's
own editor mode, its own replayer, and a native export that reloads. Today a "ProTracker" preset only
renames channels on a generic song (see research below).

## Decisions (user, 2026-11-01)

- Registry-driven: the format list comes from EditableFormatRegistry, not from SYSTEM_PRESETS. Chip presets stay
  a separate "System" group.
- Mechanism: one blank native file per format in `public/templates/`, named by the descriptor's `newSong`
  field, loaded through `openSong({kind:'bytes', name, bytes}, {origin:'new-song'})`. Same path as a dropped
  file; no second apply path (memory: single load/save path).
- Scope: all 50 descriptors that have an `exporter`, plus ANSI Music after its exporter exists (N9).
- `SystemPreset.templateFile` is deleted; the descriptor's `newSong` is the single source of truth.

## Research facts

- Exporter classes: `scratchpad/exporter-scratch-vs-patch.md` (session 0daff102). 30 SCRATCH, 12 PATCH
  (actionamics, monotone, activisionPro, fredEditor, futurePlayer, musicAssembler, sidmon1, preTracker,
  benDaglish, digitalSonixChrome, jochenHippelST, soundMaster), 8 MIXED (davidWhittaker, robHubbard, scumm,
  sunTronic, tfmx, soundControl, faceTheMusic, iffSmus; scratch path unplayable for the first 4, robHubbard and
  scumm inferred).
- Existing unused templates: protracker.mod, futurecomposer.fc, hippelcoso.coso, jamcracker.jam, octamed.mmd0,
  pumatracker.puma, sidmon2.sd2, soundmon.bp.
- `startNewSong` (src/lib/song/startNewSong.ts) = addTab + applySystemPreset; never touches bytes.
- MCP `new_song` (src/bridge/handlers/writeHandlers.ts:274) only does `startNewSong('empty', false, '')`.
- `openSong` at src/lib/song/openSong.ts:377; `OpenOptions.origin` required.

## Checklist

- [x] N0 Unblock the push: `.mon` name clash (MONOTONE entry stole Maniacs of Noise files by name; harness
      4/4 failed). Fixed in e87b8ba27: MoN keeps the name-only answer, detectFormatFromContent picks MONOTONE
      by its 9-byte header. Push of 14 commits verified by ls-remote: pending.

Wiring facts found while starting N1/N2: openSong loads into the CURRENT tab (no addTab inside), so
`format` = addTab() then openSong. OpenOrigin has no 'new-song' yet (openSong.ts:82); START_BY_ORIGIN and
INTERACTIVE_ORIGINS need the new key (headless, no autostart).

- [x] N1 Descriptor field. `EditableFormatDescriptor.newSong?: { template: string /* path under public/templates */ }`
      in src/lib/formats/EditableFormatRegistry.ts. A helper `listNewSongFormats()` returns descriptors with label
      + newSong, sorted by label.
      Status: done (uncommitted): `newSong {template; name?}`, `listNewSongFormats()` sorted by name.
- [x] N2 startNewSong takes a format. New signature `startNewSong(req: {kind:'empty'} | {kind:'preset', presetId,
      loadInstruments} | {kind:'format', formatId})`. `format`: fetch template bytes, addTab, then
      `openSong({kind:'bytes', name: <template basename>, bytes}, {origin:'new-song'})`. Song name cleared to
      "Untitled". Add 'new-song' to the origin union if missing.
      Status: done (uncommitted): `startNewSong(req)`; origin `new-song` (headless, no autostart).
- [x] N3 Wizard "Format" group. useNewSongWizard + NewSongWizard: first group "Formats" from
      listNewSongFormats(), then existing system preset groups. Search covers both. Full English labels.
      Status: done (uncommitted): step 1 card "Song Format or System", "Song Formats" group first.
- [x] N4 MCP `new_song` gets optional `format` (formatId) and `preset` params; unknown id returns an error
      listing valid ids.
      Status: done (uncommitted): `format`/`preset`/`loadInstruments`; unknown id returns validFormats/validPresets, no tab.
- [x] N5 Delete `templateFile` from SystemPreset and its 8 values in src/constants/systemPresets.ts.
      Status: done (uncommitted): field and 8 values removed; the 8 templates moved to descriptors.
Decision 2026-11-01 (after reading src/lib/export/__tests__/exporterRoundtrip.harness.test.ts): N6-N8 merge
into ONE generator. It reuses the harness's fixture parse (parseAs, extracted to a shared helper), clears every
pattern cell, trims the order to 1 position where the exporter accepts it, exports with the same exporter fn,
re-parses, and writes public/templates/<formatId>.<ext>. Works for SCRATCH, PATCH and MIXED alike because a real
fixture supplies the original bytes. Scope = every exporter target in that harness with a fixture (~57), plus
the 8 missing-fixture SCRATCH exporters built from a blank song. preTracker (store-dependent) stays open.

- [x] N6 (done: src/lib/export/__tests__/makeNewSongTemplates.test.ts, env DEVILBOX_GEN_TEMPLATES=1, resumable, DEVILBOX_GEN_FORCE=<id>; verdicts in 2026-11-01-new-song-templates.json) Template generator script `tools/make-new-song-templates.ts`: for SCRATCH formats, export a blank song
      (1 pattern, 1 empty instrument where the format requires one) with the format's exporter, write to
      public/templates/<formatId>.<ext>. Resumable: skips existing files unless `--force <id>`.
- [x] N7 (done: 45 descriptors carry newSong, 45 files in public/templates, every path exists) Templates for SCRATCH (30) via N6 + the 8 existing ones mapped to their descriptors.
- [ ] N8 (open, 2026-11-01 late: tfmx, unic, sunTronic templates written and descriptors added; robHubbard template written
      (generator now treats song-flow markers 0x0B/0x0D/RH songEnd/listRestart as empty) but descriptor held: robHubbardEdits
      adds a note only on a blank row inside a covering NOTE, so on the cleared template (all rests) no note can be typed.
      Next: let a note split a covering REST ([REST,n][note,dur-n]), regression test on the cleared template, then the
      descriptor. musicAssembler/futurePlayer and activisionPro: agents running.)
      Earlier: xmf, soundControl, chuckBiscuits, composer667, jochenHippelST done by agents batch A/B.  Hand-made templates for PATCH (12) and the 4 MIXED with unplayable scratch path: take a real song,
      empty it through our own editor/exporter where possible, else build bytes from the format spec. Record
      the source of each template in the template table below.
- [x] N9 (done: e2340f16e AnsiMusicExporter; template templates/ansimusic.ans) ANSI Music exporter (MML writer, inverse of the .ANS parser), registered as an exporter; then its template.
- [x] N10 (done: src/lib/song/__tests__/newSongTemplates.property.test.ts, 51 of 51 rows pass; mod is saved by OpenMPT so the row checks the router returns null; DW needs the node fetch of its WASM; the store graph is imported once in beforeAll because its first cold transform under vitest takes ~53 s, product export of DW measured 22 ms) Per-format property test (one parametrised test, CI glob): for every descriptor with newSong:
      template loads through openSong, editor mode = format, export returns bytes, re-import gives the same
      pattern count and channel count.
- [x] N11 (done: src/lib/song/__tests__/newSongInFormat.test.ts passes; both tests fail with the format branch disabled) Reachability test: drives `startNewSong({kind:'format', formatId:'mod'})` (the wizard's and MCP's
      only entry), spies openSong (call count 1), asserts the store song format and editor mode.
- [x] N12 (done 2026-11-02, live MCP in Chrome) Live MCP check in Chrome: new_song format=monotone and format=mod, write a note, play, audio level
      above 0, export_native round-trips. stop + release_all_notes. Results: monotone rms 0.2976, export 12127 bytes;
      ansiMusic rms 0.49, Untitled.ans 141 bytes; ims rms 0.1135, Untitled.ims after N12c fix (967295522);
      futurePlayer rms 0.15, Untitled.fp 27088 bytes (clickPerMillion 1097, not judged by ear);
      mod export via export_mod 2108 bytes with the typed cell, play silent because template sample 1 is empty.
- [x] N8-avp Activision Pro: blank template takes typed notes on every voice (commit 54997cb9e).
- [x] N8-ma (commit 1330a0653) Music Assembler: a note typed on any covered blank row is cut into the covering held-note or rest event; removal is written; note-off and instrument-only edits still warn. Rows before the voice's first event warn (no covering command). Commit pending (after FP agent).
- [x] N8-mon (commit b46c714d5) MONOTONE note 88 shows as a note (was note off); F00, note-off rows and Hz table pinned by monotoneDefects.test.ts as correct.
- [x] N8-fp Future Player (commit pending, 2026-11-02): notes typed inside long rests split the rest into a copied stream (no global repoint; only the one reference gets a cloned header; restart jumps in the copy enter the copy), a voice with no stream gets one that loops in step, replayed-row notes refused, grown module re-walked for length. Walker takes the whole-song restart as loop point; template loops to row 0 (27088 bytes). Open: no test proves per-occurrence split or no-repoint copy at grid level (template no longer shares blocks; needs a Hybris shared-block grid test).
- [x] N12a (2026-11-02, commits e1cb8aef1 + 651fb6662) Template dispatch: newSongTemplateDispatch.test.ts drives parseModuleToSong for every template with UADE mocked to throw. Fixed: ANSI template (rest-only, SO-terminated PLAY block) now detected; MONOTONE parsed directly (no injectUADE); isStubGrid() keeps an empty grid when the song is in an exportable format; registry learns carrier formats (fredEditor, actionamics, activisionPro) via songFormatId(); soundMon descriptor gained its exporter.
- [x] N12b (2026-11-02) Edit routing after a song switch: live, a note typed in a MOD New Song after a MONOTONE one played re-encoded the old MONOTONE module, so play sounded MONOTONE. Two causes. (1) unloadSong stopped the replayer but left it holding the outgoing song, and sendCellEdits picks the engine from the replayer's song; unloadSong now calls TrackerReplayer.releaseSong(), and sendCellEdits falls back to liveTrackerSong(). (2) addTab() started its blank-tab restore without waiting, so startNewSong's openSong ran with the restore in flight: the nested load skipped its unload and the blank song could land after the template. addTab() now returns the restore promise and both startNewSong paths await it (the generic path's queueMicrotask workaround is gone). Test: newSongEditRouting.test.ts (fails when the await is removed).
- [x] N12c (2026-11-02) IMS export: live, an IMS New Song played but exported as Untitled.mod. The .ims extension route in AmigaFormatParsers sent every file to OpenMPT, which labels the song MOD, so the export router picked the MOD writer and IMSParser (which carries the 'ims' chip-RAM layout) never ran. The route now uses withNativeThenUADE('imagesMusicSystem', IMSParser, injectUADE), like TomyTracker. Test: newSongTemplateDispatch.test.ts 'ims: the template exports as .ims' (fails with the old route). Live after fix: plays rms 0.11, export_native gives Untitled.ims.
- [x] N12d (2026-11-02) Sibling check of the N12c cause: .dbm, .dsym and .kris were also hard-routed to OpenMPT in AmigaFormatParsers. Before the fix, digiBoosterPro and digitalSymphony New Songs opened as classic XM with no native exporter, and kris failed to load in OpenMPT. Each now uses withNativeThenUADE with its own parser (ad2120cef). Test: newSongTemplateDispatch.test.ts judges all three templates and asserts the export extension (6 cases fail with the old route). Live after fix: export_native gives Untitled.dbm, Untitled.dsym, Untitled.kris; a typed DBM note plays (rms 0.09). The DSym and KRIS templates carry no sample data, so a typed note there is silent until a sample is loaded. Open: the first DBM play right after a hard reload measured silent once; the second play was audible (not reproduced). .ice still routes to OpenMPT; it has no New Song template.
- [ ] N13 Manual test by user (Blocked on me): wizard Formats group, pick 3 formats, play a typed note.

## Template table

| formatId | template | source | re-parse by generator |
|----------|----------|--------|-----------------------|
| actionamics | templates/actionamics.ast | pre-existing template | not re-checked |
| adplug | templates/adplug.rad | pre-existing template | not re-checked |
| amosMusicBank | templates/amosMusicBank.abk | pre-existing template | not re-checked |
| ansiMusic | templates/ansimusic.ans | AnsiMusicExporter, blank 64-row song (S/ansi-blank.ts) | 1 pattern, 0 cells |
| benDaglish | templates/benDaglish.bd | pre-existing template | not re-checked |
| c67 | templates/c67.c67 | pre-existing template | not re-checked |
| davidWhittaker | templates/davidWhittaker.dw | pre-existing template | not re-checked |
| deltaMusic1 | templates/deltaMusic1.dm | pre-existing template | not re-checked |
| deltaMusic2 | templates/deltaMusic2.dm2 | pre-existing template | not re-checked |
| digiBoosterPro | templates/digiBoosterPro.dbm | pre-existing template | not re-checked |
| digitalMugician | templates/digitalMugician.dmu | pre-existing template | not re-checked |
| digitalSonixChrome | templates/digitalSonixChrome.dsc | pre-existing template | not re-checked |
| digitalSymphony | templates/digitalSymphony.dsym | pre-existing template | not re-checked |
| dsm_dyn | templates/dsm_dyn.dsm | pre-existing template | not re-checked |
| earAche | templates/earAche.ea | pre-existing template | not re-checked |
| faceTheMusic | templates/faceTheMusic.ftm | pre-existing template | not re-checked |
| fredEditor | templates/fredEditor.fred | pre-existing template | not re-checked |
| futureComposer | templates/futurecomposer.fc | pre-existing template | not re-checked |
| gameMusicCreator | templates/gameMusicCreator.gmc | pre-existing template | not re-checked |
| hippelCoSo | templates/hippelcoso.coso | pre-existing template | not re-checked |
| iffSmus | templates/iffSmus.smus | pre-existing template | not re-checked |
| ims | templates/ims.ims | pre-existing template | not re-checked |
| inStereo2 | templates/inStereo2.is20 | pre-existing template | not re-checked |
| jamCracker | templates/jamcracker.jam | pre-existing template | not re-checked |
| kris | templates/kris.kris | pre-existing template | not re-checked |
| mod | templates/protracker.mod | pre-existing template | not re-checked |
| monotone | templates/monotone.mon | src/lib/import/__tests__/fixtures/monotone/PRELUDE.MON (cleared-all-patterns) | 0 cells |
| musicLine | templates/musicLine.ml | pre-existing template | not re-checked |
| nru | templates/nru.nru | pre-existing template | not re-checked |
| octamed_mmd0 | templates/octamed.mmd0 | pre-existing template | not re-checked |
| pumaTracker | templates/pumatracker.puma | pre-existing template | not re-checked |
| quadraComposer | templates/quadraComposer.emod | pre-existing template | not re-checked |
| sawteeth | templates/sawteeth.st | pre-existing template | not re-checked |
| scumm | templates/scumm.scumm | pre-existing template | real song zaktitle, not blank; SCUMMParser is a stub (0 notes) and isSCUMMFormat (byte 4 == 0x60) rejects it (byte 4 is 0x48), so UADE builds the grid; SCUMMExporter writes a synthetic 0x60 header. Excluded from newSongTemplateDispatch.test (NOT_JUDGED). Open. |
| sidMon2 | templates/sidmon2.sd2 | pre-existing template | not re-checked |
| sidmon1 | templates/sidmon1.sid1 | pre-existing template | not re-checked |
| sonicArranger | templates/sonicArranger.sa | pre-existing template | not re-checked |
| soundFactory | templates/soundFactory.psf | pre-existing template | not re-checked |
| soundMaster | templates/soundMaster.sm3 | pre-existing template | not re-checked |
| soundMon | templates/soundmon.bp | pre-existing template | not re-checked |
| soundfx | templates/soundfx.sfx | pre-existing template | not re-checked |
| stp | templates/stp.stp | pre-existing template | not re-checked |
| synthesis | templates/synthesis.syn | pre-existing template | not re-checked |
| tcbTracker | templates/tcbTracker.tcb | pre-existing template | not re-checked |
| chuckBiscuits | templates/chuckBiscuits.cba | generator, blank song (agent batch A) | 1 pattern, 0 cells |
| composer667 | templates/composer667.667 | generator from corpus song, patterns cleared; keeps the source samples (377 KB) | 0 cells |
| jochenHippelST | templates/jochenHippelST.hst | generator, fixture cleared; row 0 may keep initial volume and Fxx | 0 notes |
| soundControl | templates/soundControl.sc | generator, fixture cleared, grid baseline reset | 0 cells |
| xmf | templates/xmf.xmf | generator, blank song with one 64-frame silent sample (parser needs sample data) | 0 cells |
| zoundMonitor | templates/zoundMonitor.sng | pre-existing template | not re-checked |

Failed (N8, no template), 7: unic (isUNICFormat needs >=16 notes in the first pattern), tfmx (TFMXEncoder writes an
empty cell as a note), sunTronic (exporter re-emits from carriers and ignores song.patterns), robHubbard,
activisionPro, futurePlayer, musicAssembler (exporters patch original bytes; grid edits refuse note removal).
Details in 2026-11-01-new-song-templates.json. Decisions (user, 2026-11-01): activisionPro, futurePlayer, musicAssembler, robHubbard get real track/block
rewriters in their exporters (note removal and length changes export for real), then generated templates. tfmx:
TFMXEncoder writes an empty cell as the wait command, not a note. unic: accept a valid .unic header by extension.
sunTronic: build an authoring path from song.patterns.

## Order

N1, N5, N2, N11 (wiring proven with the existing protracker.mod), N3, N4, N6, N7, N10 (fails for missing
templates; drives N8), N8, N9, N12, N13.
