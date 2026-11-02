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
- [x] N12e (2026-11-02) Future Player New Song opened as Hybris (owner report: "future player opens a future player song"). Live: 17 patterns, 1599 note cells. Cause: fpOnePassTemplate in makeNewSongTemplates.test.ts kept all 6 Hybris subsongs; only subsong 0 is blank, it probes silent, and chooseFileSubsong (fileSubsongs.ts) took the first subsong that sounds. Fix at the data: the generator zeroes the second subsong-table entry and drops its relocation, so the template holds one subsong; futurePlayer.fp regenerated (27088 to 27084 bytes). Test: newSongTemplateDispatch.test.ts now counts note cells after parseModuleToSong and asserts 0 for every template (old template: 1599, fails). Live after fix: 16 patterns of 64 rows, 0 notes; typed notes on instrument 1 play (rms max 0.012). The template still carries the unreachable Hybris streams of subsongs 1-5.
- [x] N12f davidWhittaker template opened with 130 note cells: it was byte-identical to the real song public/data/songs/formats/apb.dw. The generator missed it because it ran without the DW WASM node fetch, so the reparse showed no grid. Fixed in the generator (installDwNodeFetch plus dwBlankTemplate: every note byte becomes 0x82, the DW mute command that ends the row; 474 bytes patched, 45810 B kept). Now opens 1 pattern, 0 notes, 15 instruments, and the dispatch test is green with a fails-on-revert check. A typed note was silent live: the DW edit path counted only note bytes as slots, the parser called a walk without notes unmatched, and the import routed a 0-note grid to UADE. Fixed: mute bytes are note slots (isNoteSlot in davidWhittakerEdits.ts), the parser matches a walk of mutes, and the note-count UADE fallback in AmigaFormatParsers.ts is gone. Regression test davidWhittakerAddNote.test.ts fails with either fix reverted. Live: 0 notes on open, typed notes play (rms max 0.31).
- [x] N12g hippelCoSo template opened with 64 note cells: the hand-made 66 B file stored table pointers relative to the table, while CoSo uses absolute file offsets, so pattern 0 decoded header bytes as notes (the parser is correct). Replaced by public/templates/hippelCoSo.hipc (1196 B, generated from prehistoric_tale.hipc), with the path changed in EditableFormatRegistry.builtins.ts. Dispatch test green, fails-on-revert. Exporter fixed: buildCoSoFile wrote empty sample headers, no PCM and no TFMX block, and exportAsHippelCoSo never used song.hippelFileData. A loaded COSO song now goes through the shared rebuildHippelSong (rebuildHippelModule.ts), which patches edits into the source bytes. A refused edit falls back to the from-scratch writer, which now copies the source sample bank and writes the TFMX block at 0x20. prehistoric_tale roundtrip: 0 headers / 0 PCM bytes before, 4 / 23306 after. Template regenerated: 24932 B, 0 notes, 11 of 19 instruments on real PCM. Two tests in hippelCoSoRoundtrip fail when the fix is reverted. Live: opens with 0 notes over 30 patterns. Follow-up: a from-scratch CoSo song with no source module still writes empty sample sections, which COSO_init may reject (unverified).
- [x] N12h davidWhittaker: only rows that hold a mute byte (0, 6, 13, 19, ...) take a typed note in place. Rows 4, 8 and 12 are refused ("between them" / "outside the covering note's 2 unit wait"), and splitting fails because the template, built from apb.dw, is past the 32 KiB a 16-bit pointer reaches. The store shows the note but the replayer never plays it. Needs a template whose every grid row is a slot (small, speed aligned to the grid), or an edit path that can split there. PARTIAL 2026-11-02 (uncommitted): template now speed 1, delay 0, 1 unit waits, mutes -> 0x83 hold; edit path + parser take the hold as a slot; rows 0..7 take a note, rows 8.. alias row t-8 (voice 1 track has 8 slots and loops). Open: a 64-slot track per voice below 0x8000 (smaller source, e.g. garfield2+.dw, or rewrite the track region keeping subsong 0). Test 'a note typed on ANY row ...' in davidWhittakerAddNote.test.ts fails until then. Evidence: thoughts/shared/plans/n12h-dw-findings.md DECISION (owner 2026-11-02): rebuild the template from garfield2+.dw with a 64-slot track per subsong-0 voice. Queued until the N14/N15 survey agents report (2-agent cap). Agent 1 result 2026-11-02: INCOMPLETE. Generator code written (uncommitted, makeNewSongTemplates.test.ts dwEveryRowASlot from garfield2+.dw, 64-slot hold tracks, self-checks pass on built bytes) but the reparse hangs at 100% CPU >400 s inside parseDavidWhittakerFile before the grid step. Template not regenerated. Clue: appended position lists made dwSubsongCount 17 (orig 3; C replayer ends subsong table at lowest position list, davidwhittaker.c ~1186); in-place lists still hang. A parser that never returns on a malformed file is a product bug by itself: fix the loop bound at its root, regression test with the built bytes. Next agent: dump built bytes, time dwSubsongCount / walkDavidWhittaker per subsong / scanDWStructures / chooseFileSubsong. Details: n12h-dw-findings.md "Rebuild result". Order: N12h-2 then N13a-c when slots free. DONE 2026-11-02: first commit attempt failed (pre-commit: keyboardPreviewReplayers apb.dw/garfield2+ preview silent, because the preview voice also has position_list_length 0); guard narrowed to position_list_length == 0 && track_data == empty_track, WASM rebuilt, 123 of 123 affected tests pass, commit "Stop a David Whittaker voice with no track from hanging the replayer tick": replayer hang on voice with no track fixed in davidwhittaker.c read_track_commands; template rebuilt 14882 bytes; test davidWhittakerNoTrackVoice.
- [x] N12i hippelCoSo: a typed note on the blank template does not sound live. First play gave one blip (rms avg 0.000007, max 0.12), the second play was silent. The samples are in the file now (N12g), so the cause lies in the note write or the instrument used. FIXED 2026-11-02 (uncommitted): two causes. (1) buildCoSoFile wrote no all-zero end entry in the song table, so nuade's COSO player counted 0 subsongs and refused the template; songsSectionSize 6 -> 12, template regenerated (24938 B). (2) engineLoadArgs handed engines a Uint8Array for an edited module, NuadeEngine.loadTune transfer -> DataCloneError; now an ArrayBuffer copy. Tests: hippelCoSoTemplateTypedNoteSounds.test.ts + ArrayBuffer assertion in engineLoadArgsAreWhatPlayLoads.test.ts, both fail on revert. Live: C-3 instr 1 typed then Play, rms avg 0.0777 (max 0.154); second play rms avg 0.130. Open: note typed DURING play not measured. Evidence: thoughts/shared/plans/n12i-coso-findings.md
- [x] N12j (2026-11-02) digitalSymphony and kris: a typed note was silent. DSym: the parser dropped sample audio (its private LZW decoder was a stale duplicate; it now uses decompressDSymLZW and createSamplerInstrumentFromWav with signed finetune), and the exporter's output never reopened: compressDSymLZW wrote an END_OF_STREAM code the reader rejects, and the sample table wrote all 63 name lengths before the u24 lengths instead of interleaving them per sample (OpenMPT Load_dsym order). KRIS: chuckrock-style .mod files carrying KRIS at offset 952 now detect as 'kris', and the exporter writes .kris. Templates regenerated from real songs: digitalSymphony.dsym 58407 B (drwho_final4.dsym, 1 pattern), kris.kris 33952 B (chuck rock - chuckrock.mod). Tests: DSymLZW.test.ts, digitalSymphonyExportReopens.test.ts, detectFormatFromContent (kris), DigitalSymphonyParser sample audio, newSongTemplateDispatch 'opens with a sample'; each fails on revert. Ratchet: only the digitalSymphony and kris rows updated (pattern-match 1.0). Live: DSym typed C-3 inst 1 rms avg 0.41 (peak 1.09, clips 7193/M); KRIS rms max 0.19, peak 0.42.
- [ ] N13 Manual test by user (Blocked on me): wizard Formats group, pick 3 formats, play a typed note. Owner result 2026-11-02: typed notes play on KRIS and Digital Symphony samples; three defects below (N13a-c).
- [x] N13a KRIS New Song lists synth instruments that are silent (owner 2026-11-02). Find where they come from (template parse vs default instrument seeding); a KRIS song may only hold sample instruments. Ties to N14 allowed set. Regression test: KRIS template opens with no instrument a typed note cannot sound. DONE 9c24efc07: all-zero header = empty slot; 31 -> 8 instruments. Live audio unverified (owner test).
- [x] N13b Digital Symphony New Song lists many empty samples (owner 2026-11-02). Check: are they the template's fixed 63 slots shown as instruments? Decide with the product rule for other sample formats (MOD template shows how many?); fix at parser/template level, not by hiding in the UI. DONE 9c24efc07: trailing empty slots dropped, template compacted; 63 -> 4.
- [x] N13c Hippel CoSo New Song "with instruments" choice: no instrument makes any sound (owner 2026-11-02). Empty choice not tested by owner. Measure with MCP: load template, trigger_note per instrument, get_audio_level; find whether instrument data or the replayer path is missing. Regression test through the product import. PARTIAL 9c24efc07: samp() gives every system preset a saw Sampler (audible). Owner 2026-11-02 chose native CoSo starters: real HippelCoSoSynth instruments from a real CoSo song, exportable natively. DONE (commit pending): 4 HippelCoSoSynth starters from "wings of death (level 3).hipc" instruments 1, 2, 3, 5, frozen in src/constants/data/hippelCosoStarters.json; HippelCoSoExporter builds the sample bank from instrument samples when no module is loaded; tests src/constants/__tests__/hippelCosoStarters.test.ts (4 fail with old starters). Write-up thoughts/shared/plans/n13c-result.md.
- [x] N13d CoSo preset-path New Song carries no layout id, so nativeExportRouter does not route it to the CoSo exporter (wizard preset to export not wired). Set the CoSo layout id on preset-path songs; reachability test drives the wizard preset path through exportNativeSong. Found by N13c agent 2026-11-02. Done 2026-11-02: startGenericSong sets uadeVariableLayout from PRESET_VARIABLE_LAYOUT (uade_hippelcoso -> emptyHippelCoSoLayout); test newSongPresetCosoExport drives startNewSong preset path then exportNativeSong, asserts exportAsHippelCoSo ran and output starts COSO (failed before fix).
- [ ] N13e Same gap for the other AMIGA_UADE_PRESET_IDS presets (uade_tfmx, uade_tfmx7, uade_soundmon, uade_sidmon2, uade_futurecomposer, uade_octamed, uade_jamcracker, uade_pumatracker): preset-path song has no layout id, router finds no exporter. Each needs its own empty-layout builder added to PRESET_VARIABLE_LAYOUT in src/lib/song/startNewSong.ts; first check each starter is exportable at all. Found by N13d agent 2026-11-02. PARTIAL c0e2f9843: 4 of 8 done (tfmx, soundmon, futurecomposer, jamcracker). Open: uade_tfmx7 (router needs hippelFileData, no tfmx7v LAYOUT_EXPORTERS entry), uade_sidmon2 (SidMon2Exporter.ts:53 needs Sd2Engine or sd2FileData), uade_pumatracker (PumaTrackerExporter.ts:203-206 needs pumaTrackerFileData), uade_octamed (router checks OctaMED, parser emits MED). Owner 2026-11-02: fix all four; sonnet agent running.
- [x] N13f Wizard search hid David Whittaker: filter matched only the display name, so "dw" found nothing. Fix: newSongFormatMatches() in EditableFormatRegistry.ts matches name, formatId and template extension; NewSongWizard consumes it. Test src/lib/formats/__tests__/newSongFormatSearch.test.ts. Reported by owner 2026-11-02 during manual tests. Owner live 2026-11-02: "dw" finds David Whittaker. Commit pending the test run. DONE a03a0a4fe.
- Order 2026-11-02: N13a-c before S1b/N16/N15, because they break shipped New Song templates.
- [x] N13g Wizard search "coso" listed the CoSo system preset three times (owner 2026-11-02). Cause: getGroupedPresets sliced each group from its start id to the next group's start id; start ids sid6581 and tildearrow_sound_unit do not exist, so Console and Other ran to the array end (180 group slots for 105 presets), and scc/n163 out of order emptied Konami. Fix: start ids corrected (sms, c64_6581, tia, namco, msm5232, vera, sound_unit), each group ends at the next start in array order, a missing start id throws. Test src/constants/__tests__/groupedPresets.test.ts. DONE 9f78095fb; owner retest pending (expect 2 hits).
- [~] N14 (owner live 2026-11-02: locked synth pickers PASS) (owner request 2026-11-02) A format-specific project (New Song in a native format) disables every synth/instrument type the format cannot hold, on every instrument-creation path, so the user cannot create an incompatible instrument. Survey: thoughts/shared/plans/n14-synth-lock-survey.md. Constraint (owner 2026-11-02): some formats hold both synth and sample instruments; the gate is a SET of allowed kinds per format, never one kind. Decision (owner 2026-11-02): the lock applies on EVERY format load (dropped/opened file too, not only New Song): one activeFormatId set on any format load, cleared on generic project/reset. Design (survey): descriptor field instruments.allowed (set; undefined = unlocked), pure isSynthAllowed/allowedSynthTypes beside EditableFormatRegistry, store chokepoints createInstrument/addInstrument/updateInstrument/clone + convert-type (~useInstrumentStore.ts:203) reject, pickers filter via useAllowedSynthTypes(); one reachability test: startNewSong then MCP create_instrument with an incompatible type is rejected. Implemented 2026-11-02 (n14-synth-lock-result.md): lock set in applyEditorMode (reached from applySong.ts:198, the shared load path); 52 formats locked, 9 unlocked; store, MCP and 3 pickers gated; reachability test formatLocksSynthTypes.test.ts. Open: David Whittaker set untested against its template (N12h); LoadPresetModal / FurnacePresetBrowser / InstrumentList / EditInstrumentModal not filtered (store refuses with warning); deltaMusic1, soundMon, sunTronic allow generic Synth because their parsers emit it instead of native types.
- [ ] N15 (owner request 2026-11-02) Every New Song format has its own synth/instrument type available, with rich instrument presets. Survey: thoughts/shared/plans/n15-format-synth-presets-survey.md. Constraint (owner 2026-11-02): a format that holds both synth and sample instruments needs both available, each with presets. Survey result (2026-11-02, 57 formats): 17 OK, 8 have preset data not wired, 2 few presets (sidMon2, adplug), 22 native synth with zero presets, 2 maybe missing SynthType (soundFactory, synthesis), 6 unknown. Verified: 217 presets in src/constants/presets/nostalgicplayer/*.ts (13 files) are dead code, wrong shape {name,category,params}; only comment references elsewhere. getPresetsForSynthType (src/constants/synthPresets/allPresets.ts:30) has no tracker-native synth case; LoadPresetModal reads PRESET_CATEGORIES unfiltered by format. Plan, after N14 lands (shares allowedSynthTypes): (a) convert nostalgicplayer presets to InstrumentPreset, add getPresetsForSynthType cases, preset browser filtered by the N14 allowed set; (b) the 22 zero-preset native synths get presets extracted from real songs' instruments with their real names (no invented names, no faked assets); (c) resolve soundFactory/synthesis SynthType and the 6 unknown rows.
- [~] N16 (owner request 2026-11-02) Port everything usable from MagPlaySID (https://magnarharestad.github.io/MagPlaySID/) to improve SID format parsing and editing: it shows full pattern display for many SID formats, we do not. Step 1: survey agent (sonnet, read-only) writes thoughts/shared/plans/n16-magplaysid-survey.md: source repo and LICENCE (porting needs a compatible licence), list of SID formats/players it decodes to patterns, how (per-player parsers vs emulation trace), per format what DEViLBOX has today (parser, pattern grid, editability), port candidates ranked. Step 2: port per format with tests. Survey result (2026-11-02, thoughts/shared/plans/n16-magplaysid-survey.md): MagPlaySID is GPL-2.0-or-later C#; DEViLBOX is GPL-3.0-or-later (LICENSE, package.json), so translating its code is allowed (keep attribution headers). It has ONE generic decoder (cycle-exact C64 trace of SID register writes + heuristics), no per-player parsers, read-only. DEViLBOX SIDParser.ts already traces but yields bare notes, no instruments, not editable; GoatTracker 1/2 static parsers are ahead. Port order: P1 trace-inferred instruments (ADSR, wave/pulse/filter programs); P2 gate-based note segmentation snapped to recovered note table; P3 row-grid fitting replacing detectSpeed; P4 cycle-exact CIA/NMI/raster/RSID/multispeed; P5 per-tune '% register changes explained' metric as importer regression gauge. Editing of compiled SIDs needs per-player static parsers (sidid scan to rank players), not from MagPlaySID. Owner decision 2026-11-02 (AskUserQuestion): revive tracing for EDITING (reverses the 2026-10-08 S1 decline): P1-P5 feed an editable traced song for unknown players; edits stay inside DEViLBOX (no write-back to compiled player data). S1b runs in parallel (existing-editor players + DMC editor design). Order after N12h/N14 agents finish: S1b existing-editor agent + DMC editor design agent, then N16 P1-P3, N15. Agent cap 2. P1-P3 done 2026-11-02 (n16-p1-p3-result.md): sidTraceDecode.ts; starfish 32 instruments, speed 6, gate-segmented notes. Open: instruments are static C64SID configs (no per-frame wave/pulse/filter tables), playback still from c64SidFileData; funk tempo, shifting grids, effect inference, P4, P5; editing design (traced song playable after edit) not started; only one real traced SID in repo for tests. Design 2026-11-02: thoughts/shared/plans/n16-editing-design.md. Owner answers: D1 GoatTracker/GTUltra, D2 automatic at open by score, D3 90%, D5 raw override track in GTUltra C (not accept-loss), D4 .sid export embeds the override player (verify on a real SID player), D6 ~10 HVSC tunes. Next: fetch the SIDs, then steps 1-3 (traceSid, sidTraceToGoatTracker, sidTraceScore). Status 2026-11-02 late: 10 HVSC tunes committed (4e1ebdce9). Steps 1-3 code written, UNCOMMITTED (SIDParser.ts traceSid, sidTraceToGoatTracker.ts, sidTraceScore.ts, two tests; agent reports 14 of 14 pass, type-check clean). Result: thoughts/shared/plans/n16-steps1-3-result.md. All 11 tunes score 8-21 percent exact; the two GoatTracker calibration tunes (eco-fog .128, proton .211) score low too, so the builder or scorer timing model is wrong. Next: root-cause step (GT wave/pulse row timing vs GTUltra C source, first-row alignment, lag search wider than -3..3, filter owner rule, 63-program limit) until eco-fog and proton score high; only then steps 4-5 and 5a-5c. 2026-11-02 14:55: steps 1-3 committed as measurement tooling (271640321, tests pass, type-check clean). Root-cause agent (opus) running on GT timing (firstwave $09 / gatetimer / HR ADSR at note start, filter owner, lag cap); output thoughts/shared/plans/n16-gt-timing-rootcause.md. N13d agent (sonnet) running in parallel. Owner 2026-11-02: starfish .sid loads with oscilloscope only, no pattern editor, no instruments: expected until steps 4-7 land (opens as module today).

## Template table

| formatId | template | source | re-parse by generator |
|----------|----------|--------|-----------------------|
| actionamics | templates/actionamics.ast | pre-existing template | not re-checked |
| adplug | templates/adplug.rad | pre-existing template | not re-checked |
| amosMusicBank | templates/amosMusicBank.abk | pre-existing template | not re-checked |
| ansiMusic | templates/ansimusic.ans | AnsiMusicExporter, blank 64-row song (S/ansi-blank.ts) | 1 pattern, 0 cells |
| benDaglish | templates/benDaglish.bd | pre-existing template | not re-checked |
| c67 | templates/c67.c67 | pre-existing template | not re-checked |
| davidWhittaker | templates/davidWhittaker.dw | pre-existing template | owner live 2026-11-02: typed notes play, playback runs on |
| deltaMusic1 | templates/deltaMusic1.dm | pre-existing template | not re-checked |
| deltaMusic2 | templates/deltaMusic2.dm2 | pre-existing template | not re-checked |
| digiBoosterPro | templates/digiBoosterPro.dbm | pre-existing template | not re-checked |
| digitalMugician | templates/digitalMugician.dmu | pre-existing template | not re-checked |
| digitalSonixChrome | templates/digitalSonixChrome.dsc | pre-existing template | not re-checked |
| digitalSymphony | templates/digitalSymphony.dsym | drwho_final4.dsym, 1 pattern, 58407 B | typed note sounds (N12j) |
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
| kris | templates/kris.kris | chuck rock - chuckrock.mod, 33952 B | typed note sounds (N12j) |
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
