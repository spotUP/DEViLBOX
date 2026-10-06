---
date: 2026-10-06
topic: fix all open issues (owner: "fix all issues")
tags: [ledger, formats, dub, keyboard]
status: draft
---

# Fix all open issues - checklist

Owner, 2026-10-06 late: "fix all issues". Scope = every open DEFECT in
`2026-10-05-broken-formats-sweep.md` and in today's agent reports. Features
(MusicMaker native replayer, grid reverse-engineering phase 2, per-channel dub
effect slot, row preview) are NOT in scope without an explicit go.

Max 3 agents at once. Every commit through `scripts/commit-files.sh`, no
Co-Authored-By / Claude-Session lines, no push until the tree is clean.

## Batch U - ONE load / save / export path (owner 2026-10-06: "why is the jukebox not using our primary loading path? ... i have asked you so many times to unify all loading saving export paths")
Measured 2026-10-06 (grep of call sites, src/ excluding tests):
- Interactive: UnifiedFileLoader.loadFile -> 'pending-import' -> ImportModuleDialog -> useModuleImport -> importTrackerModule.
- Headless: bridge/handlers/writeHandlers.ts loadFile -> UnifiedFileLoader + its own ~100 lines of format routing to bypass the dialog. Used by the jukebox (JukeboxPanel.tsx:230) and MCP.
- DJ: parseModuleToSong called directly from 10 files (DJView, DJDeck, DJPlaylistModal/Panel, DJModlandBrowser, DJFileBrowser, DJTrackLoader, DJUADEPrerender, ...).
- Companions written out of band into the UADE FS (addCompanionFile) from 7 files (FilePreviewPanel, DJModlandBrowser, useImportDialog, prepareModuleImport, UADEParser, UADESynth, UADEEngine).
- [ ] U1 Research + plan: map every load, save and export entry point (load, autosave/restore, project save, native export, WAV/MP3/stems, DJ, MCP, tour, embed, tabs, collaboration sync) - doc thoughts/shared/research/2026-10-06_load-save-export-paths.md.
- [ ] U2 One song-open service: open(file, {companions, subsong, origin}) -> parse -> applySong; the import dialog becomes an optional UI step in front of the same call; jukebox, MCP, DJ, tour, drag-drop, Modland, embed all call it. Companions only travel with the call; addCompanionFile private to the UADE engine.
- [ ] U3 One save path and one export serializer per target (audit, then consolidate).
- [ ] U4 Structural guard test in test:ci: only the service may call parseModuleToSong / importTrackerModule / applySong / addCompanionFile (and the serializers); any new caller fails CI.

## Batch D - dub (running)
- [x] D1 Channel send audible: end-to-end guard channelSendEchoIsAudible.test.ts (8a899d711). -34 dB was return vs BASS-boosted master; echo sits -13.8 dB under the dry channel at Return 0.431, -5.9 dB on Tubby. No engine defect.
- [ ] D2 `everyDubToggleChangesEngineSong.test.ts` fails on Starve (and Liquid once), independent of sends fix.

## Batch F - feature (owner go 2026-10-06: "add the sound shaping ones per channel")
- [ ] F1 Per-channel pre-send effect slot replacing the filter dropdown (DubDeckStrip.tsx:1494): Off, High Pass, Low Pass, Ring Mod, Lo-fi, Wobble, Saturation; one effect per channel; reuse the bus's existing effect code; CustomSelect not <select>; space effects (echo, spring, plate, sweep, width) stay on the bus. Starts after D1 lands (same files).
- [ ] F2 Dub personas (AutoDub) use the per-channel shaping effects properly: read every relevant dub plan/research in thoughts/shared/ (persona, AutoDub, intention, channel roles, moves) to derive which persona reaches for which effect on which channel role and when; moves must target the channel slot, be recorded/replayed in the performance journal and dub lanes, and release cleanly. Owner 2026-10-06. Sources: plans/2026-09-22-dub-personas-completeness.md, 2026-09-17-dub-studio-revised-ai-performer-plan.md, 2026-09-17-dub-studio-master-implementation-plan.md, 2026-09-17-dub-studio-gap-reconciliation.md, 2026-09-23-autodub-rides-the-faders.md, 2026-09-23-dub-deck-channel-section.md, 2026-09-29-per-channel-dub-outputs.md, 2026-04-20-tracker-dub-bus-world-class.md, 2026-10-02-remaining-dub-and-fx-issues.md; research/2026-04-20_dub-sound-coloring.md. Same agent as F1, after F1.

## Batch L - load / route / companions
- [!] L1 `black glass ][ - muzik0.670`: not CDFM 670; format research, route. -- BLOCKED: header 06 0b 09 09 09 00 e9 28 ... is no known tracker signature (not CDFM 670, not libopenmpt); needs format RE or an owner pointer to the player
- [x] L2 `shortsong1.mod.nt`: StarTrekker companion loaded as the song. -- (index already excludes .nt; guard jukeboxIndexOffersNoCompanions a56417abc)
- [x] L3 `the punisher - title.psa`: UADE formatName Unknown, no route. -- (5d7837a94) UADE plays it (sweep PLAYS); only the label was empty
- [x] L4 `fm dance.fmt`: UADE probe in prepareModuleImport fails first. -- (86d132fdd, test wired 30eca11cc)
- [x] L5 `jpn.virocop-14`: SMP.virocop-14 not fetched (verify after b725128fe). -- (b725128fe + test d19046d9a)
- [x] L6 `boogie.mus`: UADE "module check failed" (Wanted Team misroute?). -- (86d132fdd, test wired 30eca11cc)
- [x] L7 A format asks UADE for `/uade/songplay` repeatedly (maxsubsong -1). -- (30eca11cc) lone .kh without songplay no longer offered; repeated songplay asks not reproduced headless
- [x] L8 Lone-file drop prompt omits the shared-bank name for `.dum`. -- (842361036)
- [x] L9 DJ loaders download TFMX partners twice (downloadTFMXCompanion + downloadUADECompanions). -- (d19046d9a)
- [x] L11 bob4e from the Modland file browser: bob4.ins listed by the index but absent from /uade at load (FilePreviewPanel pre-writes companions out of band). Priority. -- (a56417abc)
- [x] L12 Sonix fails to load (owner 2026-10-06). Suspect today's companion changes (b725128fe Modland loaders, Sonix Instruments/ targeting) and L11 load-path rework. -- (2c57eaf6a) jukebox resolved companions in the row dir, not the song dir
- [x] L10 MCP server Modland listing duplicates modlandApi subdirectory logic. -- (d19046d9a)

## Batch E - engines / runtime
- [x] E0 OWNER PASS 2026-10-06 (a9f6493f3: linearPitch flag index + song dispatch settings applied after chips exist) DefleMask after the mute fix: "instruments are off key and wobbly" (owner, 2026-10-06 late). Priority.
- [x] E1 (5ecb68119) Furnace C++ `furnace_dispatch_mute` has no channel bounds check (FurnaceDispatchWrapper.cpp:1287).
- [x] E2 NOT A BUG (2026-10-06): quickstart.fur is the upstream Furnace demo, byte-identical to third-party/furnace-master/demos/quickstart.fur; all 10 PATN blocks are empty (0xff end markers), parseFurnaceFile finds 0 notes in 1 order x 64 rows. A blank template, silent by design.
- [x] E3 OWNER PASS 2026-10-06 (73efa76d2) SAP warhawk plays double speed.
- [x] E4 already fixed by ff7c2bc35/6044bb25a (UADE /uade unlink via _songFiles, TrackerAudioCapture node release, reinit listener); tests uadeFilesystemDoesNotGrow, trackerAudioCaptureReleasesNodes, reinitListenerReleased; the last was outside test:ci and is wired in 3c5266f38.
- [x] E5 already fixed by 9b3f7b78b + e352af237 (worklets/text-codec.js loaded by WASMSingletonBase before every engine worklet; test workletTextCodecPrelude). Audit: of the worklets that call TextEncoder/TextDecoder, only Klystrack (via WASMSingletonBase) and the unused SC.worklet.js do; no gap left.
- [x] E6 already works: ZXTune songs (pt3 pt2 stc vtx psg asc ym ...) open in editor mode sc68 labelled ZXTune; regression test added in fdce04307 (scopeViewFormats via parseModuleToSong).
- [ ] E9 BLOCKED (not reproduced headless): MusicLine worklet+WASM render drax.ml at rms 0.148 with and without the text-codec prelude; routing picks MusicLine; the mute path is a no-op (shipped MusicLine.wasm does not export _ml_set_channel_on / _ml_get_channels_on, so setMuteMask cannot mute anything). Found: worklet "stop" unloads the song (ml_stop, songLoaded=false) so a bare play after stop is silent until a reload; startNativeEngines reloads, but pause->resume (supportsResume false) never does. Needs the owner console output to go further.
- [ ] E10 `aztec theme.amad` fails: ZXAY AMAD (Amadeus) payload, data for a replayer in DeliAY / AY_Emul, no available player implements it (only ZXAY EMUL plays via aylet). Research: does AY_Emul's open source or ZXTune implement AMAD? Port that replayer rather than marking unsupported; if none exists, say so with evidence.
- [ ] E8 Fashion Tracker: channel VUs do not trigger as they should (owner 2026-10-06). Check siblings that share its meter path (ChannelMeterFeed / trigger mode, b95cd92a0, 0f19eb8b2).
- [ ] E7 PARTIAL: audit done (see report): engines reporting own position = Hively, Klystrack, JamCracker, Hippel, Sonix, EaglePlayer, SidMon1, MusicLine, TFMX, Actionamics, ActivisionPro, Dss, FredReplayer2, UADE (+ Cinter4 through its own store feed). Getter exists in WASM but nothing reports: PreTracker, InStereo1, InStereo2, Synthesis, SonicArranger, TFM, StoneTracker, Pmdmini, Asap (ms only). Not implemented: each needs the getter mapped to the grid row and verified.

## Batch K - keyboard voices
- [ ] K0 PRIORITY, recurring: TB-303 (DB303) audio "goes flat during knob pulls" - owner: regression "for the 100th time". Fix the root cause AND add the missing permanent guard: no test drives a knob drag through the real path (Knob -> parameterRouter/fast-path -> DB303 worklet) and checks the audio. Guard = rapid knob sweep on cutoff/resonance/env mod/decay/accent while a pattern plays, assert no dropout, no level collapse, no pitch change vs the same render without the sweep; in test:ci. Bisect which commit broke it (docs/CONTROL_PATTERNS.md knob perf invariants; 7f43955f9, 7f56a56ec, recent ToneEngine/keyboard changes 7a6840350). Measure what "flat" is (pitch drop vs dull/compressed vs silence) before fixing.
- [ ] K1 SidMon 2 keys reach the generic Sampler; wire SidMonSynth (NATIVE_AUDITION_SYNTHS + isWASMSynth), keep the sample editor.
- [ ] K2 Silent synth stubs: DigMug, DavidWhittaker, SonicArranger, InStereo1/2, DeltaMusic1/2, StartrekkerAM synth classes; TFMX Pro instruments.
- [ ] K3 Whole-song synths start/stop the song on any key: KlysSynth, MaxTraxSynth, PreTrackerSynth, SymphonieSynth, UADESynth.
- [ ] K4 Sampler base note may be one octave under the grid for Amiga samples (measure).

## Batch P - parsers / editing
- [ ] P1 `apb.dw` shows 1 instrument of 4 used.
- [ ] P2 `insects_in_space.jt` shows 2 of 16.
- [ ] P3 Hippel CoSo grid instrument omits track-table sound transpose.
- [ ] P4 OctaMED synth vol-table F4/FA and wave-table F7 not modelled.
- [ ] P5 Track-index engines may get the grid's pattern index for edits (SoundMon, DigMug, SonicArranger, DM1/2, InStereo1/2, Synthesis).
- [ ] P6 Undo/redo and macro paste reach no engine.

## Batch T - tests
- [ ] T1 `src/__tests__/format-parsers.test.ts`: 4 cases fail on missing `.test-formats` fixtures.

## Owner only
- [ ] O1 Trailer rewrite of unpushed commits: blocked on permission.
- [ ] O2 Open questions: "P and T activates filters" meaning; Fred hard cut on key-up OK?; SidMon note naming (recommend keep).
- [ ] O3 Push, once agents' WIP is committed and type-check is clean.
