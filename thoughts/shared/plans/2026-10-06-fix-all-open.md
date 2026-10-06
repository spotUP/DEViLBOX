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
- [x] D2 `everyDubToggleChangesEngineSong.test.ts` fails on Starve (and Liquid once), independent of sends fix. DONE 6fe6cf9d1: not Starve - the off-vs-off noise floor moved -50..-41 dBFS because the rig left main-thread Math.random unseeded (SpaceEchoEffect wow rate) and Tone filled its noise caches on the first rig. Rig now seeds per rig + warms Tone noise caches; renders bit-identical (dubBusRigIsDeterministic.test.ts); toggle test also needs an absolute -45 dBFS change (all 9 toggles measure -30.1..-18.7).

## Batch F - feature (owner go 2026-10-06: "add the sound shaping ones per channel")
- [x] F1 Per-channel pre-send effect slot replacing the filter dropdown (DubDeckStrip.tsx:1494): Off, High Pass, Low Pass, Ring Mod, Lo-fi, Wobble, Saturation; one effect per channel; reuse the bus's existing effect code; CustomSelect not <select>; space effects (echo, spring, plate, sweep, width) stay on the bus. Starts after D1 lands (same files). DONE 03fca8625 (slot, stage, store+schema 24 migration, CustomSelect+Knob, reachability test channelShapeChangesOnlyItsSend) + 86626ec27 (channelShape move, dub.shapeSlot step lane record/replay, MCP set_channel_dub_send shape/shapeValue + get_dub_bus_state, router passes handle.update through).
- [x] F2 Dub personas (AutoDub) use the per-channel shaping effects properly: read every relevant dub plan/research in thoughts/shared/ (persona, AutoDub, intention, channel roles, moves) to derive which persona reaches for which effect on which channel role and when; moves must target the channel slot, be recorded/replayed in the performance journal and dub lanes, and release cleanly. Owner 2026-10-06. Sources: plans/2026-09-22-dub-personas-completeness.md, 2026-09-17-dub-studio-revised-ai-performer-plan.md, 2026-09-17-dub-studio-master-implementation-plan.md, 2026-09-17-dub-studio-gap-reconciliation.md, 2026-09-23-autodub-rides-the-faders.md, 2026-09-23-dub-deck-channel-section.md, 2026-09-29-per-channel-dub-outputs.md, 2026-04-20-tracker-dub-bus-world-class.md, 2026-10-02-remaining-dub-and-fx-issues.md; research/2026-04-20_dub-sound-coloring.md. Same agent as F1, after F1. DONE 29de266fd: 14 persona rules from the table below, test personaShapesItsChannel.

### F2 persona shaping table (derived 2026-10-06, before coding)
Sources: research/2026-04-20_dub-sound-coloring.md (:37 Tubby swept filters, :40 Scientist HPF sweeps on drum stems, :47/:150 Perry lo-fi/tape, :57 Mad Professor sub weight, :63-86 per-source EQ hygiene, :74 LPF 1000->300 Hz "treble all the way down"); plans 2026-09-22-dub-personas-completeness.md, 2026-09-17-dub-studio-revised-ai-performer-plan.md (:778, :1510-1522), 2026-09-17-dub-studio-master-implementation-plan.md (:1029), 2026-09-23-autodub-rides-the-faders.md (:84-107 cadence via variance / minBarsBetweenFires / densityBias). The docs name the GESTURE per persona; which channel role carries it is mostly inferred (marked *). Slot timings reuse the existing bus-move rule slots in AutoDub.ts RULES (hpfRise bar%4==1, filterDrop bar%8==7, eqSweep bar%4==2 barPos>.5, ringMod bar%4==3 barPos>.6, voltageStarve bar%8==5, tapeWobble bar%4==1).

Mechanism (no parallel system): one hold move `channelShape` {effect 1-6, amount 0-1}, registered like every move (router, kinds, colours, table slot 45, intentions TEXTURE, energy, MCP, keyboard, CC 86). Persona use = AutoDub RULES rows with `channelRole`, a `personas` filter, rule-level `params` and an optional rule-level `automate` (gesture sweep of `amount`), picked through intention/cooldown/weights like any rule; journaled through the router; the move borrows the slot (override stack in ChannelRoutedEffects) and hands the user's own slot back on release. Dry move (wet: false): it colours what a channel already sends.

| Persona | Effect | Role | When | Hold | Amount | Release |
|---|---|---|---|---|---|---|
| tubby (+custom) | High Pass | skank* | new bar, bar%4==1 | 1 bar | sweep 255 Hz -> 2.1 kHz -> back | swept back, slot returns (6 ms duck) |
| tubby (+custom) | Low Pass | bass* | new bar, bar%8==7 (phrase end) | 1 bar | sweep 1 kHz -> 300 Hz -> back | swept back, slot returns |
| tubby (+custom) | Saturation | bass* | new bar, bar%8==0 | 2 bars | drive 50% flat | slot returns |
| scientist | High Pass | percussion | barPos>.5, bar%4==2 | 1 bar | sweep 300 Hz -> 5 kHz -> back | swept back, slot returns |
| scientist | Low Pass | bass* | new bar, bar%8==7 | 1 bar | sweep 1 kHz -> 300 Hz -> back | swept back, slot returns |
| scientist | Ring Mod | percussion* | barPos>.6, bar%4==3, intensity>.5 | 1 bar | 80 Hz flat | snap (slot returns) |
| perry | Ring Mod | percussion | barPos>.6, bar%4==3, intensity>.5 | 1 bar | 120 Hz flat | snap |
| perry | Lo-fi | skank* | new bar, bar%8==5, intensity>.6 | 1 bar | 4 bits flat | snap to clean |
| perry | Wobble | lead* | new bar, bar%4==1, intensity>.35 | 2 bars | 3.7 ms depth flat | slot returns |
| madProfessor | High Pass | lead* | barPos>.5, bar%4==2 | 2 bars | slow sweep 500 Hz -> 4 kHz -> back | swept back, slot returns |
| madProfessor | Wobble | pad* | new bar, bar%8==0 | 2 bars | gentle 1.8 ms flat | slot returns |
| madProfessor | Saturation | bass* | new bar, bar%8==4 | 2 bars | drive 30% flat | slot returns |
| jammy | Low Pass | bass* | new bar, bar%8==0 | 1 bar | hard cut ~200 Hz flat | snap |
| jammy | Lo-fi | percussion* | new bar, bar%16==8 | 1 bar | 8 bits flat | snap |

- [x] F3 FIXED d7a948e52 (CustomSelect; test channelRoleUsesCustomSelect). Dub Deck channel card: the channel role dropdown is still a native <select>; use CustomSelect (project rule).

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
- [x] E9 FIXED (commits e2999d8bf, 78fa0d42f): pause sent stop which unloads the song (resume silent) -> pause keeps it, registry supportsPause/Resume; WASM now exports ml_set_channel_on/ml_get_channels_on; core only read the mask at tune init (now sets the channel flag live); isSongEnd skipped muted channels so mute-all ended the song. Not reproduced: the owner's exact first-play silence (headless renders); test musiclinePauseResumePlays + nativeEnginesMixerMask. Owner to confirm.
- [ ] E10 PORTED IN TREE, NOT COMMITTED - LICENCE UNRESOLVED: third-party/fxm/FXM.c says "License: unknown", upstream ArduinoFXMPlayer has no licence file; repo is public, so owner decides keep / ask author / clean-room before it is committed. Plays via aylet (aylet-wasm changes uncommitted). Also: grid shows only the first 300 frames (melody starts at frame 660). Was: `aztec theme.amad` fails: ZXAY AMAD (Amadeus) payload, data for a replayer in DeliAY / AY_Emul, no available player implements it (only ZXAY EMUL plays via aylet). Research: does AY_Emul's open source or ZXTune implement AMAD? Port that replayer rather than marking unsupported; if none exists, say so with evidence. Finding: ZXAYAMAD is the Amiga FXM-like (Fuxoft AY Language) AY subtype; implemented by Ayumi (rePlayer webAyumi FXM.c, 14.5 KB, based on Dovgalyuk ArduinoFXMPlayer + true-grue/ayumi), by AY_Emul and VortexTracker import. A ZXTune repo code search finds no AMAD handler. Port plan reported to owner.
- [x] E11 FIXED 15b54c500 (trackerViewMode stayed sunvox after a classic load; applyEditorMode now leaves it; test sunvoxViewModeLeftOnNextLoad). PRIORITY: after loading and playing a SunVox song the whole pattern display is dead, also for every format loaded after it (owner 2026-10-07). Something SunVox installs (position source, view mode, render loop, store subscription) is never torn down.
- [ ] E12 PARTIAL: Ma a6bdb4eef (meters never worked before; Ma.wasm 52->36 KB unverified), JamCracker 32ba100f3, SidMon1 22f2b96bd/49ee58426, PumaTracker 41bfc8fbe, FuturePlayer 32ba100f3; PreTracker, SteveTurner, ArtOfNoise unconfirmed. Was: Meter onset by level jump still misses retriggers on Ma, JamCracker, SidMon1, PumaTracker, FuturePlayer, PreTracker, SteveTurner, ArtOfNoise; move them to counted note starts (ChannelMeterFeed.feedCounted, 3b1ae297d).
- [x] E13 (cde690718) InStereo2: after a mid-song rows-per-track change the reported row can exceed the grid length.
- [ ] E14 BLOCKED (no rows exist): ASAP grid is a 16-row placeholder, libasap exposes only ASAP_GetPosition (ms), sequencing lives in 6502 code.
- [ ] E15 Pmdmini position: no real PC-98 PMD file in the repo; PMDParser puts one MML tick per row, ignores tempo/loops. Needs a real .m/.m2 (owner) then parser fix.
- [x] E8 FIXED (3b1ae297d) Soundtracker Pro II channel VUs wrong too (owner 2026-10-07; flag with the jukebox Wrong Channel Meters switch). Root cause: level-jump onset missed retriggers at unchanged volume / <50 ms / attack ramps; UADE core now counts Paula note starts (grid detector), Klystrack counts triggers, libopenmpt counts pattern-row notes (STP plays via libopenmpt); jukebox wrong-meters flags: klystrack (Ocean Loader III.kt), formats-stp (noname.stp). Siblings still on level onset: Ma, JamCracker, SidMon1, PumaTracker, FuturePlayer, PreTracker, SteveTurner, ArtOfNoise.
- [x] E8 FIXED (3b1ae297d) Fashion Tracker: channel VUs do not trigger as they should (owner 2026-10-06). Check siblings that share its meter path (ChannelMeterFeed / trigger mode, b95cd92a0, 0f19eb8b2). Root cause: level-jump onset missed retriggers at unchanged volume / <50 ms / attack ramps; UADE core now counts Paula note starts (grid detector), Klystrack counts triggers, libopenmpt counts pattern-row notes (STP plays via libopenmpt); jukebox wrong-meters flags: klystrack (Ocean Loader III.kt), formats-stp (noname.stp). Siblings still on level onset: Ma, JamCracker, SidMon1, PumaTracker, FuturePlayer, PreTracker, SteveTurner, ArtOfNoise.
- [ ] E7 7 of 8 FIXED, 1 BLOCKED: PreTracker 87217659f, InStereo1+2 4213e42ea, Synthesis/SonicArranger/TFM/StoneTracker d98a02cf1 (each verified against grid rows on a corpus song). Pmdmini blocked: repo has no real PC-98 PMD song (both .pmd are PiyoPiyo) and PMDParser grid is one MML tick per row, not the player clock. Asap (ms only) not done. PARTIAL: audit done (see report): engines reporting own position = Hively, Klystrack, JamCracker, Hippel, Sonix, EaglePlayer, SidMon1, MusicLine, TFMX, Actionamics, ActivisionPro, Dss, FredReplayer2, UADE (+ Cinter4 through its own store feed). Getter exists in WASM but nothing reports: PreTracker, InStereo1, InStereo2, Synthesis, SonicArranger, TFM, StoneTracker, Pmdmini, Asap (ms only). Not implemented: each needs the getter mapped to the grid row and verified.

## Batch K - keyboard voices
- [ ] K0c DB303 N.Dec knob display lags a MIDI-driven decay (store devilFish.normalDecay not updated by parameterRouter); sound is right (f3bdd3c01). Fix in parameterRouter once its foreign WIP lands.
- [x] K0b FIXED f3bdd3c01 (DB303Synth.applyConfig sends decay or normalDecay only when changed; decayMidi case in db303KnobSweepKeepsAudio). DB303 decay knob dead on MIDI/automation paths: applyConfig ends with normalDecay = devilFish.normalDecay, overriding the decay it just set; parameterRouter writes only filterEnvelope.decay (agent aed7ccf, 2026-10-07). K0 guard committed 9e730ec92/935a58560 but K0 itself not reproduced: suspect DB303Synth DynamicsCompressor (-3 dB, 12:1, 727149898) pulling the level down when resonance/accent raise peaks - unmeasured.
- [ ] K0 PRIORITY, recurring: TB-303 (DB303) audio "goes flat during knob pulls" - owner: regression "for the 100th time". Fix the root cause AND add the missing permanent guard: no test drives a knob drag through the real path (Knob -> parameterRouter/fast-path -> DB303 worklet) and checks the audio. Guard = rapid knob sweep on cutoff/resonance/env mod/decay/accent while a pattern plays, assert no dropout, no level collapse, no pitch change vs the same render without the sweep; in test:ci. Bisect which commit broke it (docs/CONTROL_PATTERNS.md knob perf invariants; 7f43955f9, 7f56a56ec, recent ToneEngine/keyboard changes 7a6840350). Measure what "flat" is (pitch drop vs dull/compressed vs silence) before fixing.
- [x] K1 FIXED d52222288 (SidMonSynth songSlot -> Sd2Engine.noteOn; keyboardSidMon2Synth.test). SidMon 2 keys reach the generic Sampler; wire SidMonSynth (NATIVE_AUDITION_SYNTHS + isWASMSynth), keep the sample editor.
- [ ] K2 NOT STARTED (needs owner go-ahead per format: each is a replayer preview voice in C + wasm rebuild + oracle test, Hippel CoSo took ~570 lines; InStereo1/2, DeltaMusic1/2, DigMug, SonicArranger have other agents' uncommitted wasm/worklet edits in the same files). Silent synth stubs: DigMug, DavidWhittaker, SonicArranger, InStereo1/2, DeltaMusic1/2, StartrekkerAM synth classes; TFMX Pro instruments.
- [x] K3 FIXED 23032f437 (keys play nothing, notify once per player; wholeSongSynthKeys.test). Whole-song synths start/stop the song on any key: KlysSynth, MaxTraxSynth, PreTrackerSynth, SymphonieSynth, UADESynth.
- [x] K4 FIXED d264a01a0 (measured 0.500 kbd/song at 8287 Hz, 0.125-1.33 for other stored rates on 23 corpus songs; keyboardPeriod through ToneEngine; keyboardPeriodSamplers.test). Sampler base note may be one octave under the grid for Amiga samples (measure).

## Batch P - parsers / editing
- [x] P1 `apb.dw` shows 1 instrument of 4 used.
- [x] P2 `insects_in_space.jt` shows 2 of 16.
- [x] P3 Hippel CoSo grid instrument omits track-table sound transpose. (91f4f881a)
- [x] P4 OctaMED synth vol-table F4/FA and wave-table F7 not modelled. (9c66ba43d, UADE-checked)
- [x] P5 Track-index engines may get the grid's pattern index for edits (SoundMon, DigMug, SonicArranger, DM1/2, InStereo1/2, Synthesis).
- [x] P6 Undo/redo and macro paste reach no engine.

## Batch T - tests
- [x] T1 `src/__tests__/format-parsers.test.ts`: 4 cases fail on missing `.test-formats` fixtures.

## Owner only
- [ ] O1 Trailer rewrite of unpushed commits: blocked on permission.
- [ ] O2 Open questions: "P and T activates filters" meaning; Fred hard cut on key-up OK?; SidMon note naming (recommend keep).
- [ ] O3 Push, once agents' WIP is committed and type-check is clean.
