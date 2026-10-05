---
date: 2026-10-05
topic: Broken formats sweep - every owner verdict that is not "works", measured, fixed, re-measured; then a second sweep for pattern data
tags: [formats, jukebox, uade, sweep, ledger]
status: draft
---

# Broken formats sweep (2026-10-05)

Owner, 2026-10-05: "Work on all broken format. You are not done untill all
formats load and play again. When that is done do a second sweep fixing the
patterndata."

Source of truth for "broken": `tools/format-state.json` (owner's jukebox
verdicts, statuses silent / crashes / broken / partial). Keys are jukebox
index entry ids (`public/data/songs/index.json`). Finish line, sweep 1: every
key below either plays (headless render or browser measurement, named) or is
re-classified with evidence (not a song, missing corpus asset = owner).
Sweep 2: every key whose verdict is about the grid (Incorrect Pattern Data,
Frozen Patterns, Empty Patterns) shows the right data.

Headless measurement: `npm run sound-check` style run of
`tools/uade-audit/corpus-sweep.ts --dir public/data/songs --only <files>`
(results in the session scratchpad `broken-sweep.json`). Browser
measurement needs the owner's tab (relay has no browser at 2026-10-05 01:50).

## Map: owner verdict -> index entry -> headless verdict (from the 09-xx sweep of public/data/songs/formats)

```
silent   desire                                   formatKey=desire             files=1
           desire/batmanreturns.dsr                                     sweep=('SILENT', 'Desire', '')
silent   sap                                      NO INDEX ENTRY (gone)
silent   sc68                                     formatKey=sndh               files=1
           sc68/aprentice title.sc68                                    sweep=None
silent   hippel-st                                formatKey=jochenHippelST     files=1
           hippel-st/demo music10.sog                                   sweep=None
silent   formats-tcbTracker                       formatKey=tcbTracker         files=1
           formats/cannonfodder.tcb                                     sweep=('PLAYS', 'TCB Tracker', '')
silent   digital-sonix-and-chrome-David Hanlon    formatKey=digitalSonixChrome files=12
           digital-sonix-and-chrome/David Hanlon/dragon'sbreath dbfx.ds sweep=None
           digital-sonix-and-chrome/David Hanlon/dragon'sbreath demo 1. sweep=None
           digital-sonix-and-chrome/David Hanlon/dragon'sbreath demo 2. sweep=None
silent   forgotten-worlds                         formatKey=amiga_formats_catchall files=1
           forgotten-worlds/forgotten worlds intro.fw                   sweep=None
silent   deflemask-0xfroman                       formatKey=dmf                files=2
           deflemask/0xfroman/Product01.dmf                             sweep=None
           deflemask/0xfroman/Product02.dmf                             sweep=None
silent   deflemask-220hertz                       formatKey=dmf                files=1
           deflemask/220hertz/Andrew_haggles.dmf                        sweep=None
silent   deflemask-85NESplayer                    formatKey=dmf                files=9
           deflemask/85NESplayer/BA Round 1.dmf                         sweep=None
           deflemask/85NESplayer/DKC Title.dmf                          sweep=None
           deflemask/85NESplayer/G&WG Octopus.dmf                       sweep=None
silent   digital-mugician-2                       formatKey=mugician           files=1
           digital-mugician-2/snickle.mug                               sweep=None
silent   formats-amiga_formats_catchall           formatKey=amiga_formats_catchall files=5
           formats/audiosculpture_smallest.adsc                         sweep=('REFUSED', '', 'uade warning: Song ended prematurely due to error: module ch')
           formats/blazing_thunder.hd                                   sweep=('PLAYS', 'Howie Davies', '')
           formats/jamespond2aga-title.ins                              sweep=('REFUSED', '', '[uade-wasm] Cannot play file: jamespond2aga-title.ins (ret=0')
silent   formats-benDaglish                       formatKey=benDaglish         files=1
           formats/mickey_mouse.bd                                      sweep=('PLAYS', 'Benn Daglish', '')
silent   formats-uade_cus                         formatKey=uade_cus           files=1
           formats/skyfox.cus                                           sweep=('REFUSED', '', 'uade warning: Song ended prematurely due to error: score cra')
silent   formats-desire                           formatKey=desire             files=1
           formats/batmanreturns.dsr                                    sweep=('SILENT', 'Desire', '')
silent   formats-mugician                         formatKey=mugician           files=3
           formats/cockwise.mug                                         sweep=('PLAYS', 'Mugician II', '')
           formats/flight.dmu                                           sweep=('PLAYS', 'Mugician', '')
           formats/snickle.mug2                                         sweep=('PLAYS', 'Mugician II', '')
silent   formats-hippelCoso                       formatKey=hippelCoso         files=1
           formats/prehistoric_tale.hipc                                sweep=('PLAYS', 'Hippel-COSO', '')
silent   formats-iffSmus                          formatKey=iffSmus            files=1
           formats/radiokomppi.smus                                     sweep=('MISSING-COMPANION', '', "[uade-wasm] uade_request_amiga_file: file not found '/uade/I")
silent   formats-jochenHippelST                   formatKey=jochenHippelST     files=1
           formats/astaroth.sog                                         sweep=('REFUSED', '', 'uade warning: Song ended prematurely due to error: module ch')
silent   formats-krisHatlelid                     formatKey=krisHatlelid       files=1
           formats/hatlelid_smallest.kh                                 sweep=('INSTANT-END', 'Kris Hatlelid', '')
silent   formats-tfmx                             formatKey=tfmx               files=2
           formats/mdat.rocknroll                                       sweep=('MISSING-COMPANION', '', "[uade-wasm] uade_request_amiga_file: file not found '/uade/s")
           formats/mdat.turrican_bonus                                  sweep=('PLAYS', 'TFMX', '')
silent   Goat Tracker Ultra-Jammer                formatKey=zoundMonitor       files=5
           Goat Tracker Ultra/Jammer/$3GarysGlitteringSaliva_4x.sng     sweep=None
           Goat Tracker Ultra/Jammer/$3LastNight_Jammer.sng             sweep=None
           Goat Tracker Ultra/Jammer/$3TrippyTrappy.sng                 sweep=None
silent   Goat Tracker Ultra-JasonPage             formatKey=zoundMonitor       files=1
           Goat Tracker Ultra/JasonPage/RType_Amiga2SID.sng             sweep=None
silent   Goat Tracker Ultra-Linus                 formatKey=zoundMonitor       files=8
           Goat Tracker Ultra/Linus/$3Cold-War-Generation.sng           sweep=None
           Goat Tracker Ultra/Linus/$3Space_Beer.sng                    sweep=None
           Goat Tracker Ultra/Linus/$3childhood-ends.sng                sweep=None
silent   Goat Tracker Ultra-LMan                  formatKey=zoundMonitor       files=2
           Goat Tracker Ultra/LMan/$3LMan-Rivalry-Dubs.sng              sweep=None
           Goat Tracker Ultra/LMan/$3LMan-SID-Chip-Club-Menu.sng        sweep=None
silent   hippel-st-coso                           formatKey=hippelCoso         files=1
           hippel-st-coso/ghostbattle titletune.soc                     sweep=None
silent   iff-smus-Andreas Starr-iffSmus           NO INDEX ENTRY (gone)
silent   studio-pixel---piyopiyo                  formatKey=pmd                files=1
           studio-pixel---piyopiyo/obj0176-1.pmd                        sweep=None
crashes  fm-tracker                               formatKey=fmTracker          files=1
           fm-tracker/fm dance.fmt                                      sweep=None
crashes  stonetracker                             formatKey=None               files=1
           stonetracker/hypnosphere.spm                                 sweep=None
crashes  suntronic                                formatKey=suntronic          files=1
           suntronic/pseudo oops.sun                                    sweep=('REFUSED', '', 'uade warning: Song ended prematurely due to error: module ch')
crashes  ay-amadeus                               formatKey=None               files=1
           ay-amadeus/aztec theme.amad                                  sweep=None
crashes  ay-emul                                  formatKey=ay                 files=1
           ay-emul/spring.emul                                          sweep=None
crashes  ay-strc                                  formatKey=None               files=1
           ay-strc/mega mix 1.strc                                      sweep=None
crashes  deflemask                                formatKey=dmf                files=3
           deflemask/Darude - Sandstorm.dmf                             sweep=None
           deflemask/S_Stands_For_SID.dmf                               sweep=None
           deflemask/funky_4.dmf                                        sweep=None
crashes  follin-player-ii                         formatKey=uade_tf            files=1
           follin-player-ii/sly spy title.tf                            sweep=None
crashes  composer-670-cdfm                        formatKey=None               files=1
           composer-670-cdfm/black glass ][ - muzik0.670                sweep=None
crashes  delitracker-custom                       formatKey=uade_cus           files=1
           delitracker-custom/Skyfox.cus                                sweep=('REFUSED', '', 'uade warning: Song ended prematurely due to error: score cra')
crashes  digital-tracker-dtm                      formatKey=adplug             files=1
           digital-tracker-dtm/sonic subspace.dtm                       sweep=None
crashes  formats-adplug                           formatKey=adplug             files=1
           formats/astaris.imf                                          sweep=('NOT-UADE', 'chip-dump', '')
crashes  formats-cdfm67                           formatKey=cdfm67             files=1
           formats/amnesia_credits.c67                                  sweep=('NOT-UADE', 'native+libopenmpt', '')
crashes  formats-jesperOlsen                      formatKey=jesperOlsen        files=1
           formats/lollypop-subgame_01.jo                               sweep=('MISSING-COMPANION', '', "[uade-wasm] uade_request_amiga_file: file not found '/uade/W")
crashes  formats-karlMorton                       formatKey=karlMorton         files=3
           formats/boogie.mus                                           sweep=('NOT-UADE', 'native+libopenmpt', '')
           formats/comic.mus                                            sweep=('NOT-UADE', 'native+libopenmpt', '')
           formats/doink.mus                                            sweep=('NOT-UADE', 'native+libopenmpt', '')
crashes  formats-Scott Johnston-unknown           NO INDEX ENTRY (gone)
crashes  formats-speedySystem                     formatKey=speedySystem       files=2
           formats/SnareDrum.ss                                         sweep=('REFUSED', '', 'uade warning: Song ended prematurely due to error: module ch')
           formats/pauker_rap_2.ss                                      sweep=('PLAYS', 'Speedy System', '')
crashes  formats-SUNTronicTunes-uade_ah           NO INDEX ENTRY (gone)
crashes  formats-uade_sdr                         formatKey=uade_sdr           files=2
           formats/sdr.monsterbusiness_5                                sweep=('MISSING-COMPANION', '', "[uade-wasm] uade_request_amiga_file: file not found '/uade/S")
           formats/sdr.nobuddiesland_jigsaw                             sweep=('MISSING-COMPANION', '', "[uade-wasm] uade_request_amiga_file: file not found '/uade/S")
crashes  iff-smus-- unknown-unknown               NO INDEX ENTRY (gone)
crashes  iff-smus-- unknown-speedySystem          NO INDEX ENTRY (gone)
crashes  iff-smus-Allister Brimble-unknown        NO INDEX ENTRY (gone)
crashes  iff-smus-Allister Brimble-speedySystem   NO INDEX ENTRY (gone)
crashes  infogrames-amiga_formats_catchall        NO INDEX ENTRY (gone)
crashes  musicmaker-v8-old                        formatKey=None               files=1
           musicmaker-v8-old/moveback.ip.n                              sweep=('REFUSED', '', '[uade-wasm] Cannot play file: moveback.ip.n (ret=0)')
crashes  startrekker-am                           formatKey=uade_nt            files=1
           startrekker-am/silent sleep.mod.nt                           sweep=None
crashes  tfm-music-maker                          formatKey=None               files=1
           tfm-music-maker/rainstorm.tfe                                sweep=None
broken   maximumEffect                            NO INDEX ENTRY (gone)
broken   quartet                                  NO INDEX ENTRY (gone)
broken   dsm                                      NO INDEX ENTRY (gone)
broken   fmTracker                                NO INDEX ENTRY (gone)
broken   xrns                                     NO INDEX ENTRY (gone)
broken   ym                                       NO INDEX ENTRY (gone)
partial  kss                                      NO INDEX ENTRY (gone)
partial  adplug-rol                               NO INDEX ENTRY (gone)
partial  adplug-sci                               NO INDEX ENTRY (gone)
partial  anders-oland                             formatKey=anders0land        files=1
           anders-oland/primemover 07.hot                               sweep=None
partial  activision-pro                           formatKey=activisionPro      files=1
           activision-pro/gettysburg.avp                                sweep=('PLAYS', 'Martin Walker', '')
partial  formats-deltaMusic1                      formatKey=deltaMusic1        files=1
           formats/crusaders1.dm                                        sweep=('PLAYS', 'DeltaMusic', '')
partial  general-digimusic                        formatKey=gdm                files=1
           general-digimusic/tilbury fair (remix).gdm                   sweep=None
partial  images-music-system                      formatKey=imagesMusicSystem  files=1
           images-music-system/chip5.ims                                sweep=None
```

## Work ledger (sweep 1: load + play)

Measured 2026-10-05 01:50-02:10 with `corpus-sweep.ts --dir public/data/songs --only <71 files>` (scratchpad `broken-sweep.json`), parser probes and a UADE subsong probe. Status: TODO / DONE / OWNER (corpus asset or decision) / BROWSER (plays headless, the verdict needs the owner's tab) / ENGINE (no replayer exists; port needed).

| ID | Keys / files | Cause (measured) | Fix | Status |
|----|--------------|------------------|-----|--------|
| B1 | Goat Tracker Ultra-* (6 keys, 26 .sng) | Index formatKey zoundMonitor: `detectFormat` matched the prefix format's extension form before GoatTracker's `.sng` entry; the sweep rendered them through UADE (REFUSED). In the browser the loader already checked the GTS magic, so the owner's "Silent" is the GTUltra engine, not detection. | `detectFormatFromContent` (de67adeec); index rebuilt. Headless the GTUltra core loads all 26 corpus .sng, plays song 0 and renders from 0.00-0.04 s (peaks 0.56-1.01; `gtultraRendersCorpus.test.ts`, test:ci), so a silent browser is the routing around the engine. | DONE (detect, core proven); BROWSER (routing) |
| B2 | digital-tracker-dtm (`sonic subspace.dtm`) | 'D.T.' Digital Tracker went to the AdPlug streamer (`.dtm` in ADPLUG_WASM_EXTS) | content rule -> dtm (libopenmpt) | DONE; BROWSER |
| B3 | formats-adplug (`astaris.imf`) | Imago Orpheus ('IM10' at 60) went to AdPlug | content rule -> imagoOrpheus | DONE; BROWSER |
| B4 | composer-670-cdfm (`.670`) | no registry entry | cdfm67 answers to .670 | DONE; BROWSER |
| B5 | studio-pixel---piyopiyo, pmd (`obj0176-1.pmd`) | 'PMD' magic = Studio Pixel PiyoPiyo, not PC-98 PMD; no replayer existed | PiyoPiyo plays: `public/piyopiyo/PiyoPiyo.worklet.js` is a port of piyopiyo-rs (0BSD; its six drum samples copied with the licence), `PiyoPiyoEngine` (worklet without WASM; `wasmFile` now optional in the loader), `PiyoPiyoParser` draws the grid (4 tracks, one row per record, lowest key of each chord as the note, tempo from the wait) and carries `piyoPiyoFileData`; routed through WASM_ENGINES, the chip-dump route (magic before PC-98 PMD), mixer mute via `setMuteMask`. Headless: the worklet renders obj0176-1 from the start, the mask silences it (`piyoPiyoPlays.test.ts`); the route and grid (`piyoPiyoParser.test.ts`), both in test:ci. | DONE (headless); BROWSER (ear) |
| B6 | fm-tracker (`fm dance.fmt`) | "native parser" was a Tim Follin stub copy; detect never matched; libopenmpt supports FM Tracker | registry: no native parser, libopenmpt | DONE; BROWSER |
| B7 | stonetracker (`hypnosphere.spm`) | StoneTracker (Emmanuel Marty & Michael Lavaire, 1995-96): a two-file format, `SPM.<tune>` song + `SPS.<tune>` samples. The corpus file is byte-identical to `Modules/SPM.Hypnosphere` on Aminet's `mus/edit/stonefree2.lha`, which also ships its 440 KB `SPS.Hypnosphere` (now `stonetracker/hypnosphere.sps`; the resolver pairs spm/sps). No source replayer exists: playback is `Libs/StonePlayer.Library` (86,748-byte 68k shared library, stonefree1.lha); the player AutoDoc and C includes are in `Docs.LHS` / `Includes.LHS` / `CDev.LHS`, archives in StoneTracker's own packer format (`StonePlayer_Sys.` header), not LHA. UADE, libxmp, libopenmpt, FlodJS: none play it. | stoneTracker entry refuses by name; the sample half is in the corpus | ENGINE (transpile StonePlayer.Library through the asm68k route, after unpacking its docs with StonePacker.library under emulation) - OWNER decision |
| B8 | tfm-music-maker (`rainstorm.tfe`) | no entry; ZX Spectrum TurboFM editor; no replayer in reach | tfmMusicMaker entry, refuses by name | DONE (refusal); ENGINE (ZXTune has a TFE player) |
| B9 | suntronic (`pseudo oops.sun`) | Not a SunTronic raw rip: the detector mirrors the original player's DTP_Check2 (two variants, `tst.b $18(a6)` / `$10(a6)`); this file has `tst.b $7c0(a6)` and its `lea d16(pc),a6` displacement at offset 6 is `$ff4e` (negative), so the player's data block lies BEFORE the first byte of the file - a rip cut after its data, or another driver. UADE's SunTronic refuses it the same way ("module check failed"). | none: not a valid module as ripped | OWNER (asset) |
| B10 | desire, formats-desire (`batmanreturns.dsr`) | UADE plays it: subsong 1 (the default, subsongMin) is silent for 20.07 s then sounds (peak 0.15); subsongs 2-10 sound from 0.06 s (peaks 0.42-0.65). A 20 s silent default is what the owner heard as "Silent". | OWNER decision: start UADE modules on the first subsong that renders audio within N seconds (a scan the engine already does for the grid), or keep subsongMin and show the subsong picker | OWNER |
| B11 | forgotten-worlds (`forgotten worlds intro.fw`) | UADE's ForgottenWorlds_Game player accepts it and renders 25 s of silence (single subsong). UADE's own `doc/BUGS` (third-party/uade-3.05): "2005-10-29: Forgotten worlds intro doesn't work. (shd)" - this exact file is a 21-year-old open UADE bug. | none in DEViLBOX; UADE player bug | OWNER (accept / another file) |
| B12 | hippel-st-coso (`ghostbattle titletune.soc`), hippel-st / formats-jochenHippelST (`*.sog`) | Atari ST Hippel variants: UADE's Hippel-COSO renders silence (ST sound chip, YM2149), `.sog` fail the Hippel-ST module check. The owner's five `crown *.hst` PLAY in UADE's Hippel-ST (added to the corpus, de67adeec). | .hst: DONE. .soc/.sog: need an Atari ST YM replayer (sc68/sndh engine class) | DONE (.hst); ENGINE (.soc/.sog) |
| B13 | delitracker-custom, formats-uade_cus (`skyfox.cus`) | UADE "score crashed": known custom-module eagleplayer limit since 2026-03 (research 2026-07-10) | none here; UADE limitation | OWNER (accept) |
| B14 | formats-amiga_formats_catchall (`audiosculpture_smallest.adsc`), formats-speedySystem (`SnareDrum.ss`), musicmaker-v8-old (`moveback.ip.n`), `jamespond2aga-title.ins` | `.adsc` needs its `.adsc.as` instrument file (research 2026-09-22); `SnareDrum.ss` is PCM (an instrument, not a song); `moveback.ip.n` is 576 bytes of text; `.ins` with 'RJP1' is a Richard Joseph song part without its `smp.` samples | not songs / missing sidecars | OWNER (assets) |
| B15 | deflemask (4 keys, 12 .dmf; corpus has 24) | jukebox 09-24: "DefleMask import requires Furnace WASM engine (WASM error: Fur...". Headless 2026-10-05: every .dmf in the corpus imports through the Furnace file-ops WASM with patterns, instruments and notes (`defleMaskCorpusParses.test.ts`, test:ci). The import half is fixed since; playback through the Furnace dispatch engine needs the tab. | corpus import test added | DONE (import); BROWSER (play) |
| B16 | sc68 (`aprentice title.sc68`) | sndh engine (sc68 wasm) silent per owner. Headless the core takes the file and renders from 0.00 s (peak 0.34; `sc68RendersCorpus.test.ts`, test:ci), so a silent browser is the routing around the engine. | core proven | BROWSER (routing) |
| B17 | sap | No .sap was in the corpus; the tracker said POKEY WASM "known silent". `sap/chop suey.sap` fetched from modland (Slight Atari Player / Adam Billyard, 1.3 KB); the ASAP core loads it and renders from 0.00 s headless (peak 0.63; `asapRendersCorpus.test.ts`, test:ci). | corpus file + core test | DONE (core proven); BROWSER |
| B18 | ay-amadeus, ay-strc | ZXAY STRC/AMAD payloads need the AY_Emul/DeliAY host replayer (F15 research); aylet plays EMUL only | refuses by name (F15) | ENGINE |
| B19 | formats-tfmx (`mdat.rocknroll`), formats-iffSmus (`radiokomppi.smus`), formats-jesperOlsen (`lollypop-subgame_01.jo`), formats-uade_sdr (2), startrekker-am (`silent sleep.mod.nt`), formats-krisHatlelid (`.kh`) | MISSING-COMPANION: `smpl.rocknroll`, `Instruments/`, `WantedTeam.*`, `SMP.monsterbusiness_5` / `SMP.nobuddiesland_jigsaw`, the `.mod` for the `.nt`, Kris Hatlelid `songplay` (F16) - none in the corpus | put the sidecars in the corpus | OWNER (assets) |
| B20 | formats-tcbTracker, formats-mugician, digital-mugician-2, formats-hippelCoso, formats-benDaglish, digital-sonix-and-chrome (3), follin-player-ii, formats-amiga_formats_catchall (`blazing_thunder.hd`), formats-deltaMusic1, activision-pro, anders-oland, images-music-system, formats-tfmx (`mdat.turrican_bonus`), formats-speedySystem (`pauker_rap_2.ss`) | PLAYS headless in UADE (peaks 0.06-0.68); the owner's silent / wrong-sound verdicts are from 2026-09-24, before the routing fixes of F20-F28 | re-listen | BROWSER |
| B21 | formats-karlMorton (`boogie.mus`), formats-cdfm67 (`amnesia_credits.c67`), general-digimusic (`.gdm`) | native parsers parse (c67: 128 patterns, 244 notes); the 09-24 "UADE could not play" came from the libopenmpt metadata failure fixed in F14 | re-listen | BROWSER |
| B22 | keys with no index entry: sap, iff-smus-Andreas Starr, formats-Scott Johnston, formats-SUNTronicTunes-uade_ah, iff-smus-* (instr/ss), infogrames (.ins), maximumEffect, quartet, dsm, fmTracker (old), xrns, ym, kss, adplug-rol, adplug-sci | entries removed by the F11/F12 companion rules (instrument files were listed as songs) or audit keys without a corpus song | mark in the tracker: not a song / no test file | OWNER (tracker verdicts) |
| B23 | deflemask corpus (1810 .dmf, not in the owner's verdicts) | `DMF_ALL=1` headless import sweep 2026-10-05: 1759 import, 52 refused by Furnace's own loader: 33 "file is corrupt or unreadable at effect columns", 4 "... at wavetables", 7 "incomplete file", 3 "pattern length is too large", 2 "not a compatible song", 1 "system not supported", 1 "order out of range", 2 import with zero notes. Measured: all 52 are damaged zlib streams. The 33 "at effect columns" ones decode to the end with a wrong adler and version 24 on the same systems as 1,000+ passing files, so their content is garbage from bit errors in the stream, not a loader gap; the "incomplete" ones hit "invalid distance too far back" (truncated). 301 passing files also carry a wrong adler and import fine (the lenient inflater). | none: damaged downloads; replace from a clean source | OWNER (assets) |


## Browser re-check (needs the owner's tab at http://localhost:5174, audio unlocked)

Everything below plays or imports headless; the owner's verdict needs the real engines in the tab. One command (the canonical smoke test, `--files` mode added 2026-10-05):

```
npx tsx tools/playback-smoke-test.ts --push-results --files="Goat Tracker Ultra/LMan/\$3LMan-SID-Chip-Club-Menu.sng,Goat Tracker Ultra/Jammer/\$3GarysGlitteringSaliva_4x.sng,Goat Tracker Ultra/JasonPage/RType_Amiga2SID.sng,Goat Tracker Ultra/Linus/\$3Cold-War-Generation.sng,deflemask/Darude - Sandstorm.dmf,deflemask/0xfroman/Product01.dmf,deflemask/220hertz/Andrew_haggles.dmf,deflemask/85NESplayer/BA Round 1.dmf,sc68/aprentice title.sc68,digital-tracker-dtm/sonic subspace.dtm,formats/astaris.imf,composer-670-cdfm/black glass ][ - muzik0.670,fm-tracker/fm dance.fmt,formats/amnesia_credits.c67,formats/boogie.mus,general-digimusic/tilbury fair (remix).gdm,formats/cannonfodder.tcb,formats/cockwise.mug,digital-mugician-2/snickle.mug,formats/prehistoric_tale.hipc,formats/mickey_mouse.bd,digital-sonix-and-chrome/David Hanlon/dragon'sbreath dbfx.dsc,follin-player-ii/sly spy title.tf,formats/blazing_thunder.hd,formats/crusaders1.dm,activision-pro/gettysburg.avp,anders-oland/primemover 07.hot,images-music-system/chip5.ims,formats/mdat.turrican_bonus,formats/pauker_rap_2.ss,desire/batmanreturns.dsr,hippel-st/crown arabia.hst,ay-emul/spring.emul,studio-pixel---piyopiyo/obj0176-1.pmd,sap/chop suey.sap"
```

PASS = audible (rmsAvg above the smoke test's silence threshold) with no critical console error, pushed to the tracker as `works`; a FAIL row names the file and the level, and that row is the next ledger item.

## Work ledger (sweep 2: pattern data)

Instrument: `tools/uade-audit/gridVsPaula.ts` (2026-10-05). It renders the file through UADE with the Paula write log on, turns AUDxPER writes into a note sequence per voice, takes the grid's note sequence per channel from the registry's own parser, and scores the longest common subsequence of the two INTERVAL sequences (semitone steps), so an octave or base offset does not matter but carrier bytes shown as notes score near zero. 1.00 = the grid is the tune the player plays; a low score names the parser. Companions resolve as in the app. Crusaders1.dm (DeltaMusic 1, "Wrong Sound"): 0.96 / 0.92 / 1.00 / 0.99 - the grid is right.

| ID | Keys | Cause | Fix | Status |
|----|------|-------|-----|--------|
| S1 | GRID RIGHT (score per channel): sonicArranger `mega end.sa` 1.00/0.98/0.98/0.95; tcbTracker `m-demo3 3.tcb` 0.94/1.00/0.99/1.00; deltaMusic1 `crusaders1.dm` 0.96/0.92/1.00/0.99; soundmon `nicktune1.bp` 1.00/1.00/1.00/0.89; soundfx `batdance.sfx` 1.00/1.00/-/1.00; daveLowe `incredibleshrinkingsphere.dl` 1.00/0.99/1.00/1.00; futurePlayer `imploder drums.fp` 0.94/0.77/1.00/0.92; fc `anthrox.fc` 1.00/0.20/0.99/0.91 | The grid is the tune the player plays. A "Wrong Sound" / "Incorrect Pattern Data" verdict on these is the mix, the cursor sync or a stale 09-24 listen, not the parser. | none (parser) | BROWSER / OWNER (F23 re-listen) |
| S2 | PARTLY RIGHT: wallyBeben `wicked.wb` 0.45/0.82/0.77/0.63; benDaglish `mickey_mouse.bd` 0.68/0.49/0.65/-; sidmon1 `anarchy.sid1` 0.60/0.61/0.60/0.55; fred `fireworks ii.fred` 0.89/0.44/0.71/0.88; anders0land `hot.primemover_01` 0.98/0.58/0.94/0.66; gluemon `gnu-song.glue` 0.64/0.10/0.86/0.95 | One or two voices diverge: in each the Paula voice carries arpeggio / vibrato / portamento steps (sidmon1 voice 2: 3057 period writes in 15 s) or the parser shows a sequence/transpose the player applies differently (glue ch1: octave jumps in the grid the player never writes). Needs per-format reading. | TODO per format, worst channel first | TODO |
| S3 | WRONG: tomyTracker `inconvenient intro.sg` 0.06/0.14/0.08/0.05 (dense grid, different melodies - sequence or transpose not applied); davidWhittaker `apb.dw`: NOT the decoder - the module has 8 songs and the parser draws `songs[0]` (a two-voice jingle: 8/64/0/0 events, scores 1.00/1.00/-/-), while UADE's default subsong plays `songs[1]` (parser song 1 scores 0.93/0.75/0.97/0.98 against the same render; the module-read trace covers song 1's track lists at 2352-2541). On `garfield2+.dw` neither song 0 (0.51-0.65) nor song 1 (0.62-0.69) is clean, so the song-index rule is not a plain off-by-one; UADE's DavidWhittaker player is binary-only in uade-3.05 (no amigasrc), so the rule must be measured on more modules or the player disassembled; mugician `cockwise.mug` 0.25 and channel 3 empty (Mugician II layout?); fashionTracker `ivory tover ii.ex` 0.44-0.49 with a note on every row of every channel (3263 per channel: carrier bytes shown as notes) | Parser defects. | TODO: dw (recipe exists), mug, sg, ex | TODO |
| S4 | EMPTY STUB: digitalSonixChrome `dragon'sbreath*.dsc` (3 files), imagesMusicSystem `chip5.ims` | The parser returns one empty 64-row placeholder with the file as `uadeEditableFileData`; F6 (7060474cf) now falls through to the UADE scan grid when the stub has no notes. The owner's "Incorrect Pattern Data" predates F6. | F6 | BROWSER (scan grid) |
| S5 | NO NATIVE PARSER: uade_tf `sly spy title.tf`, soundControl, activisionPro `gettysburg.avp`, ronKlaren, inStereo2 | UADE-only formats; the grid is the scan grid (F6). "Incorrect" = the heuristic scan, by design | none | OWNER (accept scan grid, or a parser per format) |
| S6 | forgotten-worlds `.fw` | UADE renders silence (B11, UADE's own bug) so no grid can be checked | none | OWNER |

## Owner answers 2026-10-05 (morning)

- MDX hang after e665a0ab3: owner tests at :5174 (load mdx/1943kaia.mdx, Play); push held until then.
- UADE starting subsong: FIRST AUDIBLE - start on the first subsong that renders sound within a few seconds (Desire batmanreturns.dsr: subsong 1 silent 20 s).
- Ports approved: TFM Music Maker (ZXTune .tfe player + YM2203), StoneTracker (68k StonePlayer.Library via asm68k), Hippel ST .sog/.soc (Atari ST YM).
- Missing sidecars: owner finds them and drops them in; then wire + re-sweep those rows.
- Subagent rule (global): smallest model that can do the job; haiku for running tests/sweeps.

## UADE corpus sweep + SMUS (2026-10-05, late morning)

- Corpus-wide UADE sweep (`test-data/uade-corpus-sweep-all.json`, 15232 files): 1478 PLAYS, 10984 COMPANION, 594 NOT-UADE. REFUSED 1938 = 1810 DefleMask + PC/native formats UADE cannot read (hvl, dbm, ams, mmd3, gt2, dsym, ftm, symmod, kt, TD-3 .seq) - not failures, those play on their own engines. Real UADE gaps: MISSING-COMPANION assets (owner list), `fuzzball-title.fred` (Fred variant, 4efa0012 header, UADE module check fails), MusicMaker V8 Old .sdata/.ip pairs (routed to the 4-voice player), SHORT SunTronicTunes rows (native engine plays them), ashleyHogg ends early (genuine length unverified).
- SMUS: the app plays .smus through the native Sonix engine, not UADE. Headless Sonix sweep of all 749 corpus SMUS (instruments from the song's or parent's Instruments/): 739 play in 4 s; 6 more play after a long silent intro (Cold mind, Beware, SPREADMAXI2, CharOfFire, beating like this, boing 747 - peaks 0.07-0.24 within 20 s). Not playing: `dwarftune2.smus` is NOT broken - every track opens with 15 whole-note rests at 115 bpm (about 31 s of written silence; all 6 instruments present), `Pump Up Maxi!.smus` ("truncated chunk": damaged file), `formats/radiokomppi.smus` (no instruments: asset). `iff-smus/Bambaataa Mix (Juz.J).smus` was a byte-identical stray copy at the root without its Instruments/; removed, the Juz.J/ copy plays. The UADE sweep's 179 bad SMUS rows do not apply to the app.

- MusicMaker V8 Old: UADE's player opens `<tune>.i`; the resolver now registers `<tune>.ip` under that name (e3f20427d). moveback.sdata PLAYS (rms 0.070); best of guitars.sdata is a 6-channel MusicMaker song (header 'Best of guitars/6chl'); UADE ships only the MusicMaker-4V and -8V players and both reject it at the module check, with and without its `.ip.l` list file under every candidate name. UADE gap; needs a MusicMaker replayer of our own (OWNER decision).
- Fred `fuzzball-title.fred`: UADE refuses it, but the app plays .fred through FredReplayer2 natively - measured in the tab rms 0.089. Not a defect.
- TFM Music Maker: plays in the tab (owner by ear: "plays correct"); channel VU meters missing -> per-channel taps being added (subagent).

## Measuring-tool bug (open, 2026-10-05)

After a `hard_reload` of the tab, `get_audio_level`, the silence detector's node levels and every master meter read 0 while the owner hears the song (confirmed twice by ear: rainstorm.tfe). Before reloads the same tool measured fine (TFM 0.051, MDX 0.6). AudioDataBus taps `Tone.getDestination()`'s input once; guarding it to the live context (SynthBaker/preview switch Tone to an OfflineAudioContext) did NOT change the reading, so that is not the cause - reverted. Until fixed, browser verdicts after a reload come from the owner's ear; headless tests stay the numeric proof.
  Narrowed: `get_audio_context_info.contexts` (added) shows Tone and the level tap BOTH on the live context; a tracker-voiced MOD measures rms 0.158 after the same reload. Only native-engine songs (TFM, StoneTracker, Fred, Desire) read 0 while audible. They connect `instance.output -> attachDryGain(dry) -> [Amiga output stage] -> separation.inputTone -> masterInput`. Next probe: per-node levels on that path (dry gain value, Paula stage in/out) via a bridge field, not guesses.
