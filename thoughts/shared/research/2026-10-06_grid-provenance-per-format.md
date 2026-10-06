---
date: 2026-10-06
topic: Grid provenance per format - how each format's pattern grid is built today, and the reverse-engineering work list
tags: [formats, patterns, grid, uade, reverse-engineering, research, work-list]
status: draft
---

# Grid provenance per format (2026-10-06)

Owner, 2026-10-06: a huge amount of pattern data is "really bad guesstimates ...
we will never get correct data if we dont do this format by format and reverse the
formats to get the real non estimated data". This is the work list. Documentary:
what IS, no code changed.

## Classes

- **A DECODED** - the parser reads the format's own song/sequence/pattern/track structures and emits those notes.
- **B PARTIAL** - decodes some structure but fills/approximates (heuristic layout, quantised events, dropped chord notes) or has a ledger score showing voices that diverge.
- **C ESTIMATED** - the grid is UADE's Paula scan (`buildEnhancedSong` / `buildClassicSong`, UADEParser.ts:1337-1410) because there is no parser, the parser is a detector/stub that returns 0 notes (withFallback.ts:125 and :199 fall through to `callUADE` on `countNotes === 0`), or a placeholder.
- **D NO GRID** - scope view / whole-song engine (register logs, player programs, empty shell grid). Out of scope.

Proof tag after the class: `L` = ledger gridVsPaula score or a grid-matches-player test exists; `N` = I ran the parser on the corpus file(s) and it emitted notes (no Paula score); `N0` = ran it, 0 notes (so the app shows the scan grid); `H` = judged from code/header only (no corpus song; NOT measured).

## Counts

Rows (registry entries + the UADE-only formats that have no registry entry): **232**.

| class | rows | corpus songs (index.json `total`) |
|---|---|---|
| A decoded | 110 | 3772 |
| B partial | 14 | 67 (43 of them are MIDI, which has no native grid) |
| C estimated | 82 | 168 |
| D no grid | 26 | 254 |

Corpus songs sum to less than the 4480 in index.json: entries with `formatKey` null (218 songs: SUNTronicTunes duplicates, behringer, deflemask unknowns, sunvox, tss, sonix tools) are not attributed to a row. Index `total` is songs per entry; `files` lists are truncated to 6; the same tune often sits in both `formats/` and its own directory, so small counts include duplicates. A is dominated by `dmf` (1810), `iffSmus` (979), `fur` (453), `suntronic` (272); C is small in songs (168) but large in formats: 82 rows are Amiga formats whose grid is the Paula scan.

## Method and where I looked

- Routing: `src/lib/import/parseModuleToSong.ts:106` -> `tryRouteFormat` (`src/lib/import/parsers/AmigaFormatParsers.ts`, 208 top-level dispatch blocks, line numbers in the table) -> `UADEPrefixParsers.ts` (`UADE_ONLY_PREFIXES`, catch-all) -> libopenmpt/UADE fallback. `withFallback.ts` (`withNativeThenUADE injectUADE`: native parser always runs; 0 notes -> UADE scan), `withEaglePlayer.ts` (grid from native parser or UADE scan; EaglePlayerEngine plays), `UADEParser.ts` (`NATIVE_ROUTES` by UADE format name :527-1040, `UADE_EXTENSIONS` :62-300, `buildEnhancedSong` :1973, `buildClassicSong` :2331).
- Measurement: I ran every registry native parser (`parseFn` from FormatRegistry.ts) in node (tsx, tsconfig.app.json) on up to 2 corpus files per format and counted patterns/rows/notes (the `[h: patterns/rows/notes]` tag in the evidence column). 47 registry formats have no corpus song (`corpus 0`); those are `H`.
- Ledger: `thoughts/shared/plans/2026-10-05-broken-formats-sweep.md` S1-S6 tables (gridVsPaula scores, `tools/uade-audit/gridVsPaula.ts`), later commits (fashionTracker f028924b3 -> 1.00, digitalMugician 7f9675391, tomyTracker 4e4a1bd38, deltaMusic1/soundMon naming 29fa4b92e/21f833ada), `thoughts/shared/research/2026-07-12_uade-stub-format-triage.md`, memory notes on the byte-exact codec sweep.
- Engines: `src/engine/replayer/wasmEngineRegistry.ts` descriptors (+ `src/engine/eagleplayer/eaglePlayerFormats.ts` for EaglePlayer ids). "UADE" = no dedicated engine.
- Source / spec: `third-party/uade-3.05/amigasrc/players/**` (player assembly: ~80 Wanted Team players (wanted_team/) + ambk, artofnoise, dz, ems, fred, gmc, hippel, hippel-coso, infogrames, ma, mark_cooksey_old, max_trax, med, medley, mon, music_maker, musicline_editor, pretracker, ps3m, sidmon1, soundmon, suntronic, tracker), `docs/formats/Replayers/**` (player sources), `docs/formats/*.txt` (data-separate specs, 22 files; the `*.md` there are DEViLBOX implementation notes, not specs), `Reference Code/FlodJS` (~17 JS player files), `Reference Code/NostalgicPlayer-main` (C# loaders/workers, ~40 module players), `third-party/openmpt-master/soundlib/Load_*.cpp` (libopenmpt loaders), `third-party/libtfmxaudiodecoder-main` (Hippel/TFMX), `thoughts/shared/research/*`. "binary only" = only the eagleplayer binary in `uade-3.05/players/`.

## Table (A, then B, C, D; one row per format)

| Format | key | class | evidence (file:line) | corpus songs | engine | spec / source in repo |
|---|---|---|---|---|---|---|
| Actionamics | actionamics | A/H | ActionamicsParser.ts ; AmigaFormatParsers.ts:929 - ActionamicsParser (NostalgicPlayer ActionamicsWorker) | 2 | ActionamicsReplayer | NostalgicPlayer Actionamics; spec .txt: docs/formats/Actionamics.txt |
| Activision Pro | activisionPro | A/N | ActivisionProParser.ts ; AmigaFormatParsers.ts:938 - ActivisionProParser: 1-byte cell idx into AVP_PERIODS; byte-exact [h: 67p/17152r/1112n] | 2 | ActivisionProReplayer | NostalgicPlayer ActivisionPro; spec .txt: docs/formats/Activision Pro.txt |
| AMOS Music Bank | amosMusicBank | A/H | AMOSMusicBankParser.ts ; AmigaFormatParsers.ts:349 - AMOSMusicBankParser: song playlists + command-based channel patterns (no corpus song; not measured) | 0 | UADE | NostalgicPlayer AmosMusicBank |
| AMS / Velvet Studio | ams | A/N | AMSParser.ts - libopenmpt Load_ams.cpp (AmigaFormatParsers.ts:1384) [h: 35p/71680r/2773n] | 2 | libopenmpt | openmpt Load_ams.cpp |
| Anders Øland | anders0land | A/L | Anders0landParser.ts ; AmigaFormatParsers.ts:2066 - Anders0landParser: mdt position lists + pattern byte streams; ledger S2 0.98/0.58/0.94/0.66; owner heard it right 2026-10-06 [h: 28p/7168r/1084n] | 4 | EaglePlayer | asm/src: amigasrc/wanted_team/Anders0land |
| Art of Noise | artOfNoise | A/N | ArtOfNoiseParser.ts ; AmigaFormatParsers.ts:650 - ArtOfNoiseParser: 4-byte cell; byte-exact codec [h: 14p/3584r/1564n] | 2 | ArtOfNoise | asm/src: amigasrc/artofnoise; NostalgicPlayer ArtOfNoise |
| Chuck Biscuits | chuckBiscuits | A/H | ChuckBiscuitsParser.ts - .cba via libopenmpt Load_cba.cpp (AmigaFormatParsers.ts:807); ChuckBiscuitsParser itself returns a 100-channel empty grid [h: 1p/6400r/0n] | 1 | libopenmpt | openmpt Load_cba.cpp |
| Dave Lowe | daveLowe | A/L | DaveLoweParser.ts ; AmigaFormatParsers.ts:1513 - DaveLoweParser: note/rest event words; ledger S1 1.00/0.99/1.00/1.00 [h: 203p/48896r/1430n] | 2 | EaglePlayer (.dl); UADE (dl_deli) | asm/src: amigasrc/wanted_team/DaveLowe |
| Delta Music | deltaMusic1 | A/L | DeltaMusic1Parser.ts ; AmigaFormatParsers.ts:1446 - DeltaMusic1Parser; ledger S1 crusaders1.dm 0.96/0.92/1.00/0.99 [h: 58p/3712r/1505n] | 2 | DeltaMusic1Replayer | Replayers/DeltaMusic; FlodJS D1Player.js; NostalgicPlayer DeltaMusic10 |
| Delta Music 2 | deltaMusic2 | A/N | DeltaMusic2Parser.ts ; AmigaFormatParsers.ts:220 - 4 tracks of [block,transpose] + 16-row blocks (DeltaMusic2Parser header); byte-exact codec [h: 112p/7168r/2008n] | 2 | DeltaMusic2Replayer | Replayers/DeltaMusic; FlodJS D2Player.js; NostalgicPlayer DeltaMusic20 |
| DigiBooster | digi | A/H | - - DigiBoosterParser (DBMX/DBM0) else libopenmpt (AmigaFormatParsers.ts:195) | 2 | libopenmpt | NostalgicPlayer DigiBooster; openmpt Load_digi.cpp |
| DigiBooster Pro | digiBoosterPro | A/N | DigiBoosterProParser.ts - libopenmpt Load_dbm.cpp (AmigaFormatParsers.ts:733) [h: 51p/58752r/3392n] | 2 | libopenmpt | NostalgicPlayer DigiBoosterPro; openmpt Load_dbm.cpp |
| Digital Sound Studio | digitalSoundStudio | A/N | DigitalSoundStudioParser.ts ; AmigaFormatParsers.ts:769 - DigitalSoundStudioParser [h: 38p/9728r/2591n] | 3 | DssReplayer | Replayers/DigitalSoundStudio; NostalgicPlayer DigitalSoundStudio |
| Digital Symphony | digitalSymphony | A/N | DigitalSymphonyParser.ts - DigitalSymphonyParser: sequences + packed patterns; approximations for two effects (DigitalSymphonyParser.ts:1220,1267) [h: 14p/3584r/417n] | 1 | libopenmpt | openmpt Load_dsym.cpp |
| Face the Music | faceTheMusic | A/N | FaceTheMusicParser.ts ; AmigaFormatParsers.ts:886 - FaceTheMusicParser (own replayer); libopenmpt only on refusal [h: 59p/7552r/1949n] | 2 | FaceTheMusicReplayer | Replayers/FaceTheMusic; NostalgicPlayer FaceTheMusic; openmpt Load_ftm.cpp |
| Fashion Tracker | fashionTracker | A/L | FashionTrackerParser.ts ; AmigaFormatParsers.ts:1799 - FashionTrackerParser: located from player code; gridVsPaula 1.00 on all 4 channels (fashionTrackerGrid.test.ts) [h: 10p/2560r/449n] | 1 | UADE | asm/src: amigasrc/wanted_team/FashionTracker-v1.0 |
| Future Composer | fc | A/L | FCParser.ts ; AmigaFormatParsers.ts:232 - FCParser: FC1.3/1.4 sequences+patterns; ledger S1 anthrox.fc 1.00/0.20/0.99/0.91 (ch1 open); FC-BSI/Follin return a stub (FCParser.ts:661-668) [h: 16p/2048r/773n] | 5 | FutureComposerReplayer | Replayers/FutureComposer; FlodJS FCPlayer.js; NostalgicPlayer FutureComposer; openmpt Load_fc.cpp; spec .txt: docs/formats/Future Composer.txt |
| Future Player | futurePlayer | A/L | FuturePlayerParser.ts ; AmigaFormatParsers.ts:1630 - FuturePlayerParser: voice byte streams linearized; ledger S1 imploder drums.fp 0.94/0.77/1.00/0.92; shared-subroutine call graph flattened (carrier note) [h: 64p/16384r/5044n] | 3 | FuturePlayer | asm/src: amigasrc/wanted_team/FuturePlayer; Replayers/FuturePlayer |
| Game Music Creator | gameMusicCreator | A/N | GameMusicCreatorParser.ts - libopenmpt Load_gmc.cpp (AmigaFormatParsers.ts:875); own parser byte-exact [h: 21p/5376r/752n] | 2 | libopenmpt | Replayers/GameMusicCreator; NostalgicPlayer GameMusicCreator; openmpt Load_gmc.cpp; spec .txt: docs/formats/Game Music Creator.txt |
| Graoumf Tracker 2 | graoumfTracker2 | A/N | GraoumfTracker2Parser.ts ; AmigaFormatParsers.ts:700 - gt2 via libopenmpt (AmigaFormatParsers.ts:694); gtk via GraoumfTracker2Parser [h: 36p/18432r/3316n] | 2 | libopenmpt | openmpt Load_gt2.cpp |
| Hippel-CoSo | hippelCoso | A/N | HippelCoSoParser.ts ; AmigaFormatParsers.ts:479 - HippelCoSoParser: command-stream recipe, byte-exact; not measured by gridVsPaula [h: 70p/4480r/2652n] | 2 | Hippel (TFMX engine) | asm/src: amigasrc/hippel-coso; FlodJS JHPlayer.js; NostalgicPlayer Hippel |
| HivelyTracker | hvl | A/N | HivelyParser.ts ; AmigaFormatParsers.ts:95 - HivelyParser: tracks/positions/instruments (byte-exact AHX codec) [h: 74p/18944r/4024n] | 4 | Hively | asm/src: third-party/hivelytracker-master; NostalgicPlayer HivelyTracker |
| IceTracker | iceTracker | A/H | ICEParser.ts - libopenmpt Load_ice.cpp (AmigaFormatParsers.ts:841); no corpus | 0 | libopenmpt | openmpt Load_ice.cpp |
| IFF SMUS | iffSmus | A/N | IffSmusParser.ts ; AmigaFormatParsers.ts:1394 - IffSmusParser/SonixMusicDriverParser: TRAK event stream onto a tick grid (duration table exact); 979 corpus songs [h: 63p/15920r/2308n] | 979 | Sonix | NostalgicPlayer IffSmus |
| Image's Music System | imagesMusicSystem | A/H | ImagesMusicSystemParser.ts - .ims via libopenmpt Load_ims.cpp (AmigaFormatParsers.ts:830); ImagesMusicSystemParser is an empty-grid stub (ledger S4 predates routing? not confirmed) [h: 1p/256r/0n] | 2 | libopenmpt | asm/src: amigasrc/wanted_team/ImagesMusicSystem; openmpt Load_ims.cpp |
| InStereo! 1 | inStereo1 | A/H | InStereo1Parser.ts ; AmigaFormatParsers.ts:410 - InStereo1Parser: positions/track rows (NostalgicPlayer InStereo10Worker); no corpus song | 0 | InStereo1Replayer | Replayers/InStereo; NostalgicPlayer InStereo10 |
| InStereo! 2 | inStereo2 | A/N | InStereo2Parser.ts ; AmigaFormatParsers.ts:388 - InStereo2Parser: 4-byte cell; byte-exact codec [h: 82p/5248r/1633n] | 2 | InStereo2Replayer | Replayers/InStereo; NostalgicPlayer InStereo20 |
| InStereo! | inStereoAmbiguous | A/H | - - .is: routed by magic to InStereo1Parser/InStereo2Parser (AmigaFormatParsers.ts:431); fantasi8.is | 2 | InStereo1/2Replayer | Replayers/InStereo |
| JamCracker Pro | jamcracker | A/N | JamCrackerParser.ts ; AmigaFormatParsers.ts:320 - JamCrackerParser: pattern table + 4-byte rows; byte-exact codec [h: 5p/1280r/638n] | 3 | JamCracker | Replayers/JamCracker; NostalgicPlayer JamCracker; spec .txt: docs/formats/JamCracker.txt |
| Jeroen Tel | jeroenTel | A/N | JeroenTelParser.ts ; AmigaFormatParsers.ts:1579 - JeroenTelParser: track byte stream (Play_1 encoding); header text says metadata-only but harness finds 2381 notes; not measured [h: 67p/20352r/2381n] | 2 | UADE | asm/src: amigasrc/wanted_team/JeroenTel |
| Jochen Hippel 7V | jochenHippel7V | A/N | JochenHippel7VParser.ts ; AmigaFormatParsers.ts:2161 - JochenHippel7VParser: TFMX-7V song, 2-byte rows, byte-exact [h: 207p/46368r/16398n] | 2 | Hippel (TFMX engine) | asm/src: amigasrc/wanted_team/Jochen_Hippel_7V; FlodJS JHPlayer.js; NostalgicPlayer Hippel |
| KRIS / ChipTracker | kris | A/H | KRISParser.ts - libopenmpt Load_kris.cpp (AmigaFormatParsers.ts:850); no corpus | 0 | libopenmpt | asm/src: amigasrc/wanted_team/ChipTracker; openmpt Load_kris.cpp |
| Klystrack | kt | A/H | KlysParser.ts ; AmigaFormatParsers.ts:101 - KlysParser: klystrack patterns/sequences (native engine) [h: 2048p/524288r/0n] | 1 | Klystrack | asm/src: Reference Code/klystrack-master |
| MaxTrax | maxTrax | A/N | MaxTraxParser.ts ; AmigaFormatParsers.ts:2190 - MaxTraxParser: score events -> lossless deriveGrid [h: 24p/27648r/2347n] | 5 | MaxTrax | asm/src: amigasrc/max_trax |
| OctaMED | med | A/H | - - MEDParser / libopenmpt (AmigaFormatParsers.ts:178) | 9 | libopenmpt | asm/src: amigasrc/med; NostalgicPlayer Med/OctaMed; openmpt Load_med.cpp |
| Digital Mugician | mugician | A/L | DigitalMugicianParser.ts ; AmigaFormatParsers.ts:543 - DigitalMugicianParser: fixed 7f9675391 (Mugician II = 7 voices, real notes); cockwise.mug was 0.25 before the fix, not re-scored in the ledger [h: 11p/2816r/714n] | 5 | DigMugReplayer | asm/src: amigasrc/wanted_team/Mugician; Replayers/DigitalMugician; FlodJS DMPlayer.js; NostalgicPlayer DigitalMugician; spec .txt: docs/formats/Digital Mugician.txt |
| Music Assembler | musicAssembler | A/N | MusicAssemblerParser.ts ; AmigaFormatParsers.ts:778 - MusicAssemblerParser (ma.asm in uade amigasrc) [h: 20p/1472r/455n] | 2 | MusicAssembler | NostalgicPlayer MusicAssembler |
| MusicLine Editor | musicLine | A/N | MusicLineParser.ts ; AmigaFormatParsers.ts:859 - MusicLineParser: tune positions -> RLE PARTs (128 rows x 6 columns) [h: 29p/979r/402n] | 2 | MusicLine | asm/src: amigasrc/musicline_editor |
| MusicMaker V8 | musicMaker | A/H | MusicMakerParser.ts ; AmigaFormatParsers.ts:2586 - MusicMakerParser.parseMusicMakerSongFile: STD/EXT song grid as a view of the MusicMaker replayer (needs the .ip companion; harness threw without it) [h: best of guitars.sdata THROW be] | 2 | MusicMaker | asm/src: amigasrc/music_maker |
| Oktalyzer | okt | A/H | - - OktalyzerParser (withNativeDefault, AmigaFormatParsers.ts:170) | 2 | OktalyzerReplayer | NostalgicPlayer Oktalyzer; openmpt Load_okt.cpp |
| Peter Verswyvelen Packer | peterVerswyvelenPacker | A/H | PeterVerswyvelenPackerParser.ts - PeterVerswyvelenPackerParser: PT-style packer header + patterns; no corpus, not measured | 0 | UADE | asm/src: amigasrc/wanted_team/PeterVerswyvelenPacker |
| ProTracker 3.6 | pt36 | A/H | PT36Parser.ts ; AmigaFormatParsers.ts:1478 - PT36Parser: raw MOD inside IFF PTDT | 0 | libopenmpt | openmpt Load_pt36.cpp |
| Puma Tracker | pumaTracker | A/L | PumaTrackerParser.ts ; AmigaFormatParsers.ts:745 - PumaTrackerParser (0.999 vs UADE per AmigaFormatParsers.ts:741 comment) [h: 15p/1920r/1218n] | 1 | PumaTracker | asm/src: amigasrc/wanted_team/PumaTracker; Replayers/PumaTracker; NostalgicPlayer PumaTracker; openmpt Load_puma.cpp; spec .txt: docs/formats/PumaTracker.txt |
| Quadra Composer | quadraComposer | A/N | QuadraComposerParser.ts ; AmigaFormatParsers.ts:336 - QuadraComposerParser: IFF EMOD/PATT 4-byte cells [h: 9p/2064r/1106n] | 2 | QuadraComposerReplayer | NostalgicPlayer QuadraComposer |
| Richard Joseph | richardJoseph | A/H | RichardJosephParser.ts ; AmigaFormatParsers.ts:1457 - RichardJosephParser: interleaved chunks, subsong table; no corpus song, not measured | 0 | UADE | asm/src: amigasrc/wanted_team/Richard Joseph |
| Rob Hubbard | robHubbard | A/N | RobHubbardParser.ts ; AmigaFormatParsers.ts:497 - RobHubbardParser: compiled-68k tables located by opcode scan; carrier recipe; not measured by gridVsPaula [h: 38p/9728r/7096n] | 2 | UADE | asm/src: amigasrc/wanted_team/RobHubbard; FlodJS RHPlayer.js |
| Rob Hubbard ST | robHubbardST | A/N | RobHubbardSTParser.ts - RobHubbardSTParser: via UADE route NATIVE_ROUTES (needs moduleBase scan) [h: 3p/768r/516n] | 2 | UADE | asm/src: amigasrc/wanted_team/RobHubbard_ST |
| Ron Klaren | ronKlaren | A/N | RonKlarenParser.ts ; AmigaFormatParsers.ts:946 - RonKlarenParser: track command streams (note + wait count) found by opcode scan; sparse (125 notes / 3072 rows) [h: 12p/3072r/125n] | 3 | RonKlarenReplayer | NostalgicPlayer RonKlaren |
| Sawteeth | sawteeth | A/N | SawteethParser.ts ; AmigaFormatParsers.ts:898 - SawteethParser: per-channel [part,transpose,damp] steps + parts [ins,effect,note] (SawteethWorker.cs) [h: 6p/1376r/514n] | 2 | Sawteeth | NostalgicPlayer Sawteeth |
| SidMon II | sidmon2 | A/N | SidMon2Parser.ts ; AmigaFormatParsers.ts:255 - SidMon2Parser: 3-pass interleaved tracks + variable-length patterns (S2Player.js) [h: 30p/7680r/1862n] | 2 | SidMon2 | FlodJS S2Player.js; NostalgicPlayer SidMon20 |
| Sonic Arranger | sonicArranger | A/L | SonicArrangerParser.ts ; AmigaFormatParsers.ts:366 - SonicArrangerParser: STBL/OVTB/NTBL chunks; ledger S1 mega end.sa 1.00/0.98/0.98/0.95 [h: 132p/8448r/2542n] | 2 | SonicArranger | asm/src: amigasrc/wanted_team/Sonic_Arranger; Replayers/SonicArranger; NostalgicPlayer SonicArranger; spec .txt: docs/formats/Sonic Arranger.txt |
| Sound Control | soundControl | A/N | SoundControlParser.ts ; AmigaFormatParsers.ts:908 - SoundControlParser: track list + 4-byte note rows (spec .txt) [h: 62p/47988r/2360n] | 2 | SoundControlReplayer | asm/src: amigasrc/wanted_team/Soundcontrol; NostalgicPlayer SoundControl; spec .txt: docs/formats/Sound Control.txt |
| Sound Factory | soundFactory | A/N | SoundFactoryParser.ts ; AmigaFormatParsers.ts:916 - SoundFactoryParser: command stream (note/pause/...) per voice [h: 256p/65536r/2084n] | 3 | SoundFactory2Replayer | asm/src: amigasrc/wanted_team/Soundfactory; Replayers/SoundFactory; NostalgicPlayer SoundFactory; spec .txt: docs/formats/Sound Factory.txt |
| Sound-FX | soundfx | A/L | SoundFXParser.ts ; AmigaFormatParsers.ts:308 - SoundFXParser: 64-row 4-byte rows; ledger S1 batdance.sfx 1.00/1.00/-/1.00 (effects 7-9 approximated, SoundFXParser.ts:501-525) [h: 10p/2560r/402n] | 3 | UADE | asm/src: amigasrc/wanted_team/SoundFX; Replayers/SoundFX; FlodJS FXPlayer.js; NostalgicPlayer SoundFx; openmpt Load_sfx.cpp |
| SoundMon | soundmon | A/L | SoundMonParser.ts ; AmigaFormatParsers.ts:247 - SoundMonParser: song steps x 4 tracks + 3-byte rows; ledger S1 1.00/1.00/1.00/0.89; soundMonGridMatchesPlayer.test.ts [h: 16p/1024r/498n] | 4 | SoundMonReplayer | asm/src: amigasrc/soundmon; Replayers/SoundMon; FlodJS BPPlayer.js; NostalgicPlayer SoundMon |
| Steve Turner | steveTurner | A/N | SteveTurnerParser.ts ; AmigaFormatParsers.ts:1713 - SteveTurnerParser: sequence table + offset-table pattern blocks [h: 20p/5120r/1736n] | 4 | SteveTurner | asm/src: amigasrc/wanted_team/SteveTurner |
| StoneTracker | stoneTracker | A/H | StoneTrackerParser.ts ; AmigaFormatParsers.ts:670 - StoneTrackerParser: SPM songs/track patterns/CTRL patterns (research 2026-10-05_stonetracker-replayer.md) [h: hypnosphere.spm THROW hypnosph] | 1 | StoneTracker | asm/src: third-party/stonetracker (authors StonePlayer includes) |
| SunTronic | suntronic | A/H | SunTronicParser.ts ; AmigaFormatParsers.ts:2445 - V1.3 "Delirium" score executables: SunTronicV13 score decode (637 of 642 corpus files); raw .sun/.tsm rips (5 files) are empty grids -> scan (C) [h: 1p/256r/0n] | 272 | SunTronicSong (V1.3); UADE for raw rips | asm/src: amigasrc/suntronic |
| Symphonie Pro | symphoniePro | A/N | SymphonieProParser.ts - .symmod via libopenmpt (AmigaFormatParsers.ts:714); SymphonieProParser exists (SymEvents) [h: 20p/17920r/574n] | 1 | libopenmpt | openmpt Load_symmod.cpp |
| Synthesis | synthesis | A/N | SynthesisParser.ts ; AmigaFormatParsers.ts:760 - SynthesisParser; harness: 4 notes / 576 rows on space_sound.syn (effect-heavy; not confirmed) [h: 9p/576r/4n] | 2 | SynthesisReplayer | Replayers/Synthesis; NostalgicPlayer Synthesis; spec .txt: docs/formats/Synthesis.txt |
| TCB Tracker | tcbTracker | A/L | TCBTrackerParser.ts ; AmigaFormatParsers.ts:1638 - TCBTrackerParser (libopenmpt Load_tcb.cpp); ledger S1 m-demo3 3.tcb 0.94/1.00/0.99/1.00 [h: 32p/8192r/1894n] | 2 | libopenmpt | asm/src: amigasrc/wanted_team/TCB Tracker; openmpt Load_tcb.cpp |
| TFMX | tfmx | A/N | TFMXParser.ts ; AmigaFormatParsers.ts:511 - TFMXParser: mdat pattern/track-step tables [h: 47p/10752r/1346n] | 3 | TFMXModule | asm/src: amigasrc/wanted_team/TFMX + libtfmxaudiodecoder; NostalgicPlayer Tfmx |
| Zound Monitor | zoundMonitor | A/N | ZoundMonitorParser.ts ; AmigaFormatParsers.ts:1621 - ZoundMonitorParser: u32 cell bitfield; byte-exact [h: 12p/1536r/795n] | 2 | UADE | asm/src: amigasrc/wanted_team/ZoundMonitor; Replayers/ZoundMon |
| CheeseCutter | cheesecutter | A/N | CheeseCutterParser.ts ; AmigaFormatParsers.ts:565 - CheeseCutter track/pattern/instrument tables [h: 27p/4704r/2772n] | 1 | CheeseCutter WASM | none found |
| GoatTracker | goatTracker | A/H | - - GTUltra: orderlists + patterns of the .sng | 27 | GTUltra | none found |
| SID Factory II | sidFactory2 | A/N | SIDFactory2Parser.ts ; AmigaFormatParsers.ts:554 - SF2 driver tables: sequences + orderlists [h: 4p/384r/320n] | 1 | SID engines | none found |
| TFM Music Maker | tfmMusicMaker | A/N | TFMMusicMakerParser.ts - TFMMusicMakerParser: RLE-unpacked fixed header incl. patterns (ZXTune tfmmusicmaker.cpp) [h: 38p/16512r/5491n] | 1 | TFM | asm/src: ZXTune tfmmusicmaker.cpp (third-party/zxtune?) |
| DefleMask / X-Tracker | dmf | A/H | XTrackerParser.ts ; AmigaFormatParsers.ts:113 - DefleMask via Furnace DivEngine import (zlib DMF); X-Tracker DMF has own parser (pref default uade, AmigaFormatParsers.ts:113) [h: Darude - Sandstorm.dmf NULL] | 1810 | Furnace | asm/src: third-party/furnace-master; openmpt Load_dmf.cpp(X-Tracker) |
| Furnace | fur | A/H | - - FurnaceSongParser: reads the .fur pattern/order/instrument tables | 453 | Furnace | asm/src: third-party/furnace-master |
| Impulse Tracker | it | A/N | ITParser.ts - ITParser [h: 42p/66400r/8817n] | 3 | libopenmpt | openmpt Load_it.cpp |
| ProTracker MOD | mod | A/N | MODParser.ts - MODParser (PT/NT/ST patterns); UADE route also re-parses ProTracker/Noisetracker/Soundtracker via MODParser (UADEParser.ts:~527) [h: 39p/9984r/2985n] | 26 | libopenmpt | openmpt Load_mod.cpp |
| ScreamTracker 3 | s3m | A/N | S3MParser.ts - S3MParser [h: 51p/52224r/16969n] | 4 | libopenmpt | openmpt Load_s3m.cpp |
| FastTracker II XM | xm | A/N | XMParser.ts - XMParser [h: 32p/8192r/1966n] | 2 | libopenmpt | openmpt Load_xm.cpp |
| Composer 669 | 669 | A/N | Format669Parser.ts ; AmigaFormatParsers.ts:988 - Format669Parser [h: 78p/39936r/4819n] | 2 | libopenmpt | openmpt Load_669.cpp |
| Advanced Music Format | amf | A/N | AMFParser.ts ; AmigaFormatParsers.ts:1213 - AMFParser [h: 27p/6912r/4380n] | 2 | libopenmpt | openmpt Load_amf.cpp |
| CDFM Composer 670 | cdfm67 | A/N | CDFM67Parser.ts ; AmigaFormatParsers.ts:1245 - CDFM67Parser / libopenmpt Load_c67.cpp [h: 128p/106496r/244n] | 2 | libopenmpt | openmpt Load_c67.cpp |
| Composer 667 | composer667 | A/N | Composer667Parser.ts ; AmigaFormatParsers.ts:789 - Composer667Parser: pattern rows [h: 78p/39936r/4819n] | 1 | libopenmpt | openmpt Load_667.cpp |
| DSIK Sound Module | dsm | A/H | DSMParser.ts ; AmigaFormatParsers.ts:1063 - DSMParser | 0 | libopenmpt | openmpt Load_dsm.cpp |
| Digital Tracker | dtm | A/N | DTMParser.ts ; AmigaFormatParsers.ts:1078 - DTMParser [h: 29p/29696r/1387n] | 1 | libopenmpt | openmpt Load_dtm.cpp |
| EasyTrax | easyTrax | A/H | EasyTraxParser.ts ; AmigaFormatParsers.ts:1262 - EasyTraxParser / Load_etx.cpp | 0 | libopenmpt | openmpt Load_etx.cpp |
| Farandole Composer | far | A/N | FARParser.ts ; AmigaFormatParsers.ts:1003 - FARParser [h: 29p/29696r/5820n] | 2 | libopenmpt | openmpt Load_far.cpp |
| FM Tracker | fmTracker | A/H | - - libopenmpt (Load_fmt.cpp) pattern export | 1 | libopenmpt | openmpt Load_fmt.cpp |
| General DigiMusic | gdm | A/N | GDMParser.ts ; AmigaFormatParsers.ts:1153 - GDMParser [h: 28p/28672r/1241n] | 2 | libopenmpt | openmpt Load_gdm.cpp |
| Imago Orpheus | imagoOrpheus | A/H | ImagoOrpheusParser.ts ; AmigaFormatParsers.ts:1228 - ImagoOrpheusParser / libopenmpt Load_imf.cpp [h: astaris.imf NULL] | 1 | libopenmpt | openmpt Load_imf.cpp |
| IT Project | itp | A/H | - - libopenmpt Load_itp.cpp | 0 | libopenmpt | none found |
| Galaxy Sound System | j2b | A/H | - - libopenmpt (no native parser) | 0 | libopenmpt | none found |
| Karl Morton | karlMorton | A/H | KarlMortonParser.ts ; AmigaFormatParsers.ts:1280 - KarlMortonParser / Load_mus_km.cpp [h: boogie.mus NULL] | 3 | libopenmpt | openmpt Load_mus_km.cpp |
| MadTracker 2 | madTracker2 | A/H | MadTracker2Parser.ts ; AmigaFormatParsers.ts:1346 - MadTracker2Parser / Load_mt2.cpp [h: finde somewhere to hide.mt2 NU] | 1 | libopenmpt | openmpt Load_mt2.cpp |
| DigiTrakker | mdl | A/N | MDLParser.ts ; AmigaFormatParsers.ts:1198 - MDLParser [h: 44p/25344r/2545n] | 2 | libopenmpt | openmpt Load_mdl.cpp |
| MO3 Compressed | mo3 | A/H | - - libopenmpt (no native parser) | 0 | libopenmpt | none found |
| MultiTracker | mtm | A/N | MTMParser.ts ; AmigaFormatParsers.ts:973 - MTMParser [h: 53p/40704r/8478n] | 2 | libopenmpt | openmpt Load_mtm.cpp |
| NoiseRunner | nru | A/N | NRUParser.ts ; AmigaFormatParsers.ts:1123 - NRUParser (4-byte cell, byte-exact) [h: 1p/256r/115n] | 1 | libopenmpt | openmpt Load_nru.cpp |
| NoiseTracker | nst | A/H | - - libopenmpt | 0 | libopenmpt | none found |
| Disorder Tracker 2 | plm | A/N | PLMParser.ts ; AmigaFormatParsers.ts:1018 - PLMParser [h: 32p/22363r/3798n] | 2 | libopenmpt | openmpt Load_plm.cpp |
| PSM | psm | A/N | PSMParser.ts ; AmigaFormatParsers.ts:1366 - PSMParser / Load_psm.cpp [h: 23p/11776r/2601n] | 1 | libopenmpt | openmpt Load_psm.cpp |
| PolyTracker | ptm | A/N | PTMParser.ts ; AmigaFormatParsers.ts:1138 - PTMParser [h: 27p/17280r/3517n] | 2 | libopenmpt | openmpt Load_ptm.cpp |
| Reality Tracker | rtm | A/N | RTMParser.ts ; AmigaFormatParsers.ts:1048 - RTMParser [h: 9p/2880r/523n] | 2 | libopenmpt | openmpt Load_rtm.cpp |
| Ultimate SoundTracker | stk | A/H | STKParser.ts ; AmigaFormatParsers.ts:1168 - STKParser | 0 | libopenmpt | openmpt Load_stk.cpp |
| ScreamTracker 2 | stm | A/N | STMParser.ts ; AmigaFormatParsers.ts:1093 - STMParser [h: 32p/8192r/5171n] | 2 | libopenmpt | openmpt Load_stm.cpp |
| SoundTracker Pro II | stp | A/N | STPParser.ts ; AmigaFormatParsers.ts:1183 - STPParser [h: 19p/4864r/650n] | 1 | libopenmpt | openmpt Load_stp.cpp |
| ScreamTracker STMIK | stx | A/N | STXParser.ts ; AmigaFormatParsers.ts:1108 - STXParser [h: 20p/5120r/3269n] | 1 | libopenmpt | Replayers/Players.txt |
| Ultra Tracker | ult | A/N | ULTParser.ts ; AmigaFormatParsers.ts:1033 - ULTParser [h: 31p/33728r/4283n] | 1 | libopenmpt | openmpt Load_ult.cpp |
| UNIC Tracker | unic | A/N | UNICParser.ts ; AmigaFormatParsers.ts:958 - UNICParser (3-byte cell, byte-exact codec) [h: 20p/5120r/1773n] | 2 | libopenmpt | openmpt Load_unic.cpp |
| Mod's Grave WOW | wow | A/H | - - libopenmpt | 0 | libopenmpt | none found |
| XMF | xmf | A/H | XMFParser.ts ; AmigaFormatParsers.ts:1307 - XMFParser / Load_xmf.cpp | 0 | libopenmpt | openmpt Load_xmf.cpp |
| Renoise | xrns | A/H | XRNSParser.ts - XRNSParser: Renoise XML patterns [h: tunefish-noremorse.xrns THROW ] | 3 | UADE | none found |
| Dave Lowe New | dln | A/H | DaveLoweNewParser (EaglePlayer, AmigaFormatParsers.ts:2012): 31 patterns / 426 notes on m-bison.dln; not measured by gridVsPaula | 2 | UADE | asm/src: amigasrc/wanted_team/DaveLoweNew |
| NoiseTracker .nt / ProTracker variants | nt | A/H | UADE route re-parses ProTracker/Noisetracker/Soundtracker via MODParser (UADEParser.ts:527); .nt companion files for StarTrekker AM | 2 | UADE | asm/src: amigasrc/tracker (mod15/mod32 players) |
| PreTracker | prt | A/H | PreTrackerParser: 24 patterns / 2590 notes on the little things.prt; PreTracker WASM engine | 1 | PreTracker | asm/src: amigasrc/pretracker (pretracker.s); research 2026-04-04_pretracker-replayer-decompile.md |
| SynTracker | synmod | A/H | SynTrackerParser (position lists 128x4 + patterns): 22 patterns / 668 notes on autumn melodies.synmod; reached only via UADEParser NATIVE_ROUTES "SynTracker" (UADEParser.ts:~1040) - route firing NOT confirmed, else scan (C) | 16 | UADE | binary only: uade players/SynTracker |
| Ben Daglish | benDaglish | B/L | BenDaglishParser.ts ; AmigaFormatParsers.ts:817 - BenDaglishParser (1200 lines); ledger S2 mickey_mouse.bd 0.68/0.49/0.65/- [h: 19p/27928r/1221n] | 2 | BenDaglish (BdEngine); EaglePlayer entry held | NostalgicPlayer BenDaglish; spec .txt: docs/formats/Ben Daglish.txt |
| David Whittaker | davidWhittaker | B/L | DavidWhittakerParser.ts ; AmigaFormatParsers.ts:629 - DavidWhittakerParser: heuristic scan (parser header); ledger S3: grid is song 0 of 8 while UADE plays song 1; garfield2+ 0.51-0.69 neither song clean [h: 68p/9788r/2588n] | 2 | DavidWhittakerReplayer | FlodJS DWPlayer.js; NostalgicPlayer DavidWhittaker |
| Fred Editor | fred | B/L | FredEditorParser.ts ; AmigaFormatParsers.ts:288 - FredEditorParser (FEPlayer.js); ledger S2 fireworks ii.fred 0.89/0.44/0.71/0.88 [h: 40p/9176r/2333n] | 4 | FredReplayer2 | asm/src: amigasrc/fred; Replayers/FredEditor; FlodJS FEPlayer.js; NostalgicPlayer Fred; spec .txt: docs/formats/Fred Editor.txt |
| GlueMon | gluemon | B/L | GlueMonParser.ts ; AmigaFormatParsers.ts:2702 - GlueMonParser (5-byte cells); ledger S2 gnu-song.glue 0.64/0.10/0.86/0.95 - ch1 octave jumps [h: 6p/1536r/371n] | 2 | UADE | binary only: uade players/GlueMon |
| Paul Robotham | paulRobotham | B/N | PaulRobothamParser.ts ; AmigaFormatParsers.ts:2047 - PaulRobothamParser: located per-voice 256-byte pattern streams, shown as 1 channel of raw note/command bytes (stub-bucket fix 9cc944d87) [h: 3p/768r/468n] | 2 | UADE | asm/src: amigasrc/wanted_team/PaulRobotham |
| SidMon 1 | sidmon1 | B/L | SidMon1Parser.ts ; AmigaFormatParsers.ts:255 - SidMon1Parser (FlodJS S1Player) but ledger S2 anarchy.sid1 0.60/0.61/0.60/0.55 - uniformly partial [h: 24p/1536r/888n] | 1 | SidMon1Replayer | asm/src: amigasrc/sidmon1; Replayers/SIDMon; FlodJS S1Player.js; NostalgicPlayer SidMon10 |
| Sound Master | soundMaster | B/N | SoundMasterParser.ts ; AmigaFormatParsers.ts:1605 - SoundMasterParser: "heuristic approach since the exact pattern" layout (SoundMasterParser.ts:388-431) [h: 3p/768r/688n] | 4 | UADE | asm/src: amigasrc/wanted_team/SoundMaster |
| Tomy Tracker | tomyTracker | B/L | TomyTrackerParser.ts ; AmigaFormatParsers.ts:1790 - TomyTrackerParser: fixed 4e4a1bd38 (note = byte3/2) after ledger S3 0.06; not re-scored since [h: 24p/6144r/2690n] | 2 | UADE | asm/src: amigasrc/wanted_team/TomyTracker |
| Wally Beben | wallyBeben | B/L | WallyBebenParser.ts ; AmigaFormatParsers.ts:1968 - WallyBebenParser: voice sequences + phrase decode; ledger S2 wicked.wb 0.45/0.82/0.77/0.63; owner: grid bogus (ledger 2026-10-06) [h: 45p/2672r/786n] | 2 | EaglePlayer | asm/src: amigasrc/wanted_team/WallyBeben |
| AdPlug | adplug | B/H | AdPlugParser.ts - AdPlugParser: RAD/HSC/CMF/D00 native pattern import (A); DRO/IMF/A2M etc. are register-dump reconstructions (C); mixed | 0 | UADE | none found |
| MDX | mdx | B/N | MDXParser.ts - MDXParser decodes per-channel MML command streams (notes/rests/tempo/voice) onto a tick grid with Furnace-instrument mapping; coverage of LFO/OPM register commands NOT confirmed [h: 17p/9558r/1249n] | 1 | Mdxmini | none found |
| PiyoPiyo | piyoPiyo | B/N | PiyoPiyoParser.ts - PiyoPiyoParser: 4 tracks of 4-byte events; grid shows only the LOWEST key of each chord (PiyoPiyoParser.ts header) [h: 4p/1024r/426n] | 2 | PiyoPiyo | none found |
| PMD | pmd | B/H | PMDParser.ts - PMDParser extracts notes from MML command streams onto a Furnace-instrument grid; approximate (not confirmed per command) | 0 | Pmdmini | none found |
| MIDI | midi | B/H | MIDIImporter.ts - MIDIImporter quantizes note events onto a row grid (options: quantize, pattern length); no native grid exists [h: IMPORTFAIL Cannot find module ] | 43 | none (sampler) | binary only: uade players/MIDI-Loriciel |
| A-Pro-Sys | aProSys | C/H | SimpleAmigaStubParser.ts ; AmigaFormatParsers.ts:2418 - SimpleAmigaStubParser | 0 | UADE | binary only: uade players/AProSys |
| ADPCM Mono | adpcmMono | C/H | ADPCMmonoParser.ts ; AmigaFormatParsers.ts:2143 - stub | 0 | UADE | asm/src: amigasrc/wanted_team/ADPCM_mono |
| Alcatraz Packer | alcatrazPacker | C/H | AlcatrazPackerParser.ts ; AmigaFormatParsers.ts:1768 - detect+stub | 0 | UADE | asm/src: amigasrc/wanted_team/Alcatraz_Packer |
| Amiga Format | amiga_formats_catchall | C/H | - - UADE_EXTENSIONS catch-all: no parser; UADEParser buildEnhancedSong/buildClassicSong from the Paula scan (its corpus songs are itemised in the UADE-only rows below) | 0 | UADE | none found |
| Andrew Parton | andrewParton | C/H | AndrewPartonParser.ts ; AmigaFormatParsers.ts:2076 - detect+stub | 0 | UADE | asm/src: amigasrc/wanted_team/Andrew Parton |
| Art and Magic | artAndMagic | C/H | SimpleAmigaStubParser.ts ; AmigaFormatParsers.ts:2723 - SimpleAmigaStubParser | 0 | UADE | binary only: uade players/ArtAndMagic |
| Ashley Hogg | ashleyHogg | C/N0 | AshleyHoggParser.ts ; AmigaFormatParsers.ts:2135 - stub [h: 1p/256r/0n] | 2 | UADE | asm/src: amigasrc/wanted_team/Ashley Hogg |
| Ben Daglish SID | benDaglishSID | C/N0 | BenDaglishSIDParser.ts ; AmigaFormatParsers.ts:2096 - stub; EaglePlayer plays [h: 1p/192r/0n] | 2 | EaglePlayer | binary only: uade players/BenDaglish-SID |
| Blade Packer | bladePacker | C/H | BladePackerParser.ts - detect+stub | 0 | UADE | asm/src: amigasrc/wanted_team/BladePacker |
| Cinemaware | cinemaware | C/H | CinemawareParser.ts ; AmigaFormatParsers.ts:1744 - detect+stub | 0 | UADE | asm/src: amigasrc/wanted_team/Cinemaware |
| Core Design | coreDesign | C/N0 | CoreDesignParser.ts ; AmigaFormatParsers.ts:1914 - stub; EaglePlayer plays, grid = UADE scan [h: 1p/256r/0n] | 2 | EaglePlayer | asm/src: amigasrc/wanted_team/CoreDesign |
| Custom Made | customMade | C/N0 | CustomMadeParser.ts ; AmigaFormatParsers.ts:2085 - stub (patterns embedded in 68k code) [h: 1p/256r/0n] | 4 | UADE | asm/src: amigasrc/wanted_team/CustomMade |
| Desire | desire | C/N0 | DesireParser.ts ; AmigaFormatParsers.ts:1999 - stub [h: 1p/256r/0n] | 2 | UADE | asm/src: amigasrc/wanted_team/Desire |
| Digital Sonix Chrome | digitalSonixChrome | C/N0 | DigitalSonixChromeParser.ts ; AmigaFormatParsers.ts:2106 - 0 notes in 3 of 3 corpus files -> scan (sequence table only decoded, 686c7f50c) [h: 4p/1024r/0n] | 14 | UADE | asm/src: amigasrc/wanted_team/DigitalSonixChrome_v1.asm |
| EarAche | earAche | C/N0 | EarAcheParser.ts ; AmigaFormatParsers.ts:2574 - stub [h: 1p/1792r/0n] | 2 | UADE | binary only: uade players/EarAche |
| Fred Gray | fredGray | C/N0 | FredGrayParser.ts ; AmigaFormatParsers.ts:2539 - stub [h: 1p/256r/0n] | 2 | UADE | binary only: uade players/FredGray |
| Infogrames | infogrames | C/N0 | InfogramesParser.ts ; AmigaFormatParsers.ts:1675 - InfogramesParser: empty 1-channel grid -> scan (two-file .dum + .dum.set) [h: 1p/999r/0n] | 2 | UADE | asm/src: amigasrc/infogrames |
| Janko Mrsic-Flogel | jankoMrsicFlogel | C/N0 | JankoMrsicFlogelParser.ts ; AmigaFormatParsers.ts:1923 - stub [h: 1p/256r/0n] | 2 | UADE | asm/src: amigasrc/wanted_team/JankoMrsic-Flogel |
| Janne Salmijärvi | janneSalmijarvi | C/H | JanneSalmijarviParser.ts ; AmigaFormatParsers.ts:2151 - stub | 0 | UADE | asm/src: amigasrc/wanted_team/Janne Salmijarvi Optimizer |
| Jason Brooke | jasonBrooke | C/N0 | JasonBrookeParser.ts - stub (86 lines) [h: 1p/256r/0n] | 4 | UADE | binary only: uade players/JasonBrooke |
| Jason Page | jasonPage | C/N0 | JasonPageParser.ts ; AmigaFormatParsers.ts:1648 - stub [h: 1p/256r/0n] | 2 | UADE | asm/src: amigasrc/wanted_team/JasonPage |
| Jesper Olsen | jesperOlsen | C/N0 | JesperOlsenParser.ts - stub [h: 1p/256r/0n] | 4 | UADE | asm/src: amigasrc/wanted_team/Jesper_Olsen |
| Jochen Hippel ST | jochenHippelST | C/N0 | JochenHippelSTParser.ts ; AmigaFormatParsers.ts:2170 - JochenHippelSTParser detection + stub; engine plays (libtfmxaudiodecoder) [h: 1p/256r/0n] | 8 | Hippel (TFMX engine) | asm/src: amigasrc/wanted_team/Jochen_Hippel_ST; NostalgicPlayer Hippel |
| Kim Christensen | kimChristensen | C/H | KimChristensenParser.ts ; AmigaFormatParsers.ts:2124 - detect+stub | 0 | UADE | asm/src: amigasrc/wanted_team/Kim Christensen |
| Kris Hatlelid | krisHatlelid | C/N0 | KrisHatlelidParser.ts ; AmigaFormatParsers.ts:1732 - stub; scan grid scrolls and looks right (owner 2026-10-05) [h: 1p/256r/0n] | 2 | UADE | asm/src: amigasrc/wanted_team/KrisHatlelid |
| Laxity | laxity | C/H | LaxityParser.ts ; AmigaFormatParsers.ts:2563 - detect+stub | 0 | UADE | binary only: uade players/Laxity |
| LME | lme | C/N0 | LMEParser.ts ; AmigaFormatParsers.ts:1534 - LMEParser metadata only [h: 1p/256r/0n] | 1 | UADE | asm/src: amigasrc/wanted_team/LME |
| Magnetic Fields Packer | magneticFieldsPacker | C/H | MagneticFieldsPackerParser.ts ; AmigaFormatParsers.ts:1431 - detect+stub; two-file with smp.* | 0 | UADE | asm/src: amigasrc/wanted_team/MagneticFieldsPacker |
| Maniacs of Noise | maniacsOfNoise | C/N0 | ManiacsOfNoiseParser.ts ; AmigaFormatParsers.ts:2625 - stub; enhanced scan crashes (UADEParser.ts:1128) -> classic [h: 1p/256r/0n] | 2 | UADE | binary only: uade players/ManiacsOfNoise |
| Mark Cooksey | markCooksey | C/N0 | MarkCookseyParser.ts ; AmigaFormatParsers.ts:1569 - stub [h: 1p/256r/0n] | 3 | UADE | asm/src: amigasrc/mark_cooksey_old |
| Mark II | markII | C/N0 | SimpleAmigaStubParser.ts ; AmigaFormatParsers.ts:2396 - SimpleAmigaStubParser [h: 1p/256r/0n] | 1 | UADE | Replayers/MarkII |
| Martin Walker | martinWalker | C/H | MartinWalkerParser.ts ; AmigaFormatParsers.ts:2022 - stub; shares avp/mw route (AmigaFormatParsers.ts:2022) | 0 | UADE | asm/src: amigasrc/wanted_team/MartinWalker |
| Maximum Effect | maximumEffect | C/H | MaximumEffectParser.ts ; AmigaFormatParsers.ts:2244 - detect+stub | 0 | UADE | asm/src: amigasrc/wanted_team/Maximum_Effect |
| Medley | medley | C/H | MedleyParser.ts ; AmigaFormatParsers.ts:1555 - detect+stub (MSOB); Medley.s source exists | 1 | UADE | asm/src: amigasrc/medley; Replayers/MedleySoundEditor |
| MIDI Loriciel | midiLoriciel | C/N0 | MIDILoricielParser.ts ; AmigaFormatParsers.ts:2254 - stub: grid over the SMF region, 0 notes in 2 of 2 corpus files -> scan (EaglePlayer plays) [h: 1p/27453r/0n] | 13 | EaglePlayer | asm/src: amigasrc/wanted_team/MIDI-Loriciel |
| Mike Davies | mikeDavies | C/H | SimpleAmigaStubParser.ts - SimpleAmigaStubParser | 0 | UADE | binary only: uade players/MikeDavies |
| MMDC | mmdc | C/H | MMDCParser.ts ; AmigaFormatParsers.ts:1699 - detect+metadata | 0 | UADE | asm/src: amigasrc/wanted_team/MMDC |
| Mosh Packer | moshPacker | C/H | MoshPackerParser.ts ; AmigaFormatParsers.ts:1889 - detect only | 0 | UADE | asm/src: amigasrc/wanted_team/Mosh Packer |
| MultiMedia Sound | multiMediaSound | C/N0 | MultiMediaSoundParser.ts ; AmigaFormatParsers.ts:1810 - stub [h: 1p/256r/0n] | 2 | UADE | asm/src: amigasrc/wanted_team/MultiMedia_Sound; Replayers/MultimediaSound |
| Music Maker 4V | musicMaker4V | C/N0 | MusicMakerParser.ts ; AmigaFormatParsers.ts:2593 - MusicMaker4V: FORM/MMV4 instruments only, 1 empty pattern [h: 1p/256r/0n] | 1 | UADE | asm/src: amigasrc/music_maker |
| Music Maker 8V | musicMaker8V | C/N0 | MusicMakerParser.ts ; AmigaFormatParsers.ts:2609 - MusicMaker8V: FORM/MMV8 instruments only, 1 empty 8-channel pattern [h: 1p/512r/0n] | 2 | UADE | asm/src: amigasrc/music_maker |
| Nick Pelling Packer | nickPellingPacker | C/H | NickPellingPackerParser.ts ; AmigaFormatParsers.ts:1952 - detect+stub | 0 | UADE | asm/src: amigasrc/wanted_team/Nick Pelling Packer |
| NovoTrade Packer | novoTradePacker | C/H | NovoTradePackerParser.ts ; AmigaFormatParsers.ts:1757 - detect+stub | 0 | UADE | asm/src: amigasrc/wanted_team/NovoTradePacker |
| NTSP | ntsp | C/H | NTSPParser.ts ; AmigaFormatParsers.ts:1870 - detect only | 0 | UADE | asm/src: amigasrc/wanted_team/NTSP-system |
| On Escapee | onEscapee | C/H | OnEscapeeParser.ts ; AmigaFormatParsers.ts:2266 - detect+stub | 0 | UADE | asm/src: amigasrc/wanted_team/onEscapee |
| Paul Shields | paulShields | C/N0 | PaulShieldsParser.ts ; AmigaFormatParsers.ts:2032 - stub: 1 channel x 98 rows from the located sequence region, 0 notes -> scan [h: 1p/98r/0n] | 2 | UADE | asm/src: amigasrc/wanted_team/PaulShields |
| Paul Summers | paulSummers | C/N0 | PaulSummersParser.ts - detect+stub (169 lines) [h: everton_fc_-_jingles.snk THROW] | 2 | UADE | asm/src: amigasrc/wanted_team/PaulSummers |
| Paul Tonge | paulTonge | C/H | PaulTongeParser.ts ; AmigaFormatParsers.ts:2274 - detect+stub | 0 | UADE | asm/src: amigasrc/wanted_team/Paul Tonge |
| Pierre Adane | pierreAdane | C/H | PierreAdaneParser.ts ; AmigaFormatParsers.ts:2056 - detect+stub | 0 | UADE | asm/src: amigasrc/wanted_team/PierreAdanePacker |
| Professional Sound Artists | psa | C/N0 | PSAParser.ts ; AmigaFormatParsers.ts:1687 - stub [h: 1p/256r/0n] | 2 | UADE | asm/src: amigasrc/wanted_team/PSA |
| Quartet | quartet | C/N0 | QuartetParser.ts - QuartetParser placeholder pattern (QuartetParser.ts:402-537) [h: 1p/256r/0n] | 2 | UADE | asm/src: amigasrc/wanted_team/Quartet; Replayers/Quartet |
| SCUMM | scumm | C/N0 | SCUMMParser.ts ; AmigaFormatParsers.ts:2407 - stub [h: 1p/256r/0n] | 1 | UADE | binary only: uade players/SCUMM |
| Sean Connolly | seanConnolly | C/N0 | SeanConnollyParser.ts ; AmigaFormatParsers.ts:2352 - stub [h: 1p/256r/0n] | 2 | UADE | binary only: uade players/SeanConnolly; amigasrc/ems (EMS player source, same player ASSUMED) |
| Sean Conran | seanConran | C/N0 | SeanConranParser.ts ; AmigaFormatParsers.ts:1824 - stub [h: 1p/256r/0n] | 2 | UADE | asm/src: amigasrc/wanted_team/SeanConran |
| Sonic Arranger SAS | sonicArrangerSas | C/N0 | SimpleAmigaStubParser.ts - SimpleAmigaStubParser [h: 1p/256r/0n] | 1 | UADE | binary only: uade players/SonicArranger |
| Sound Player | soundPlayer | A/L (2026-10-06, was C/N0) | SoundPlayerParser.ts + soundPlayerCodec.ts - 3-byte header + 12-byte rows walked per voice as the player does; byte-exact 31/31; gridVsPaula 1.00 on every channel of all 31 (2026-10-06_soundplayer-format.md) | 30 | EaglePlayer | asm/src: amigasrc/wanted_team/SoundPlayer |
| Special FX | specialFX | C/N0 | SpecialFXParser.ts ; AmigaFormatParsers.ts:2518 - stub [h: 1p/256r/0n] | 2 | UADE | asm/src: amigasrc/wanted_team/SpecialFX |
| Speedy System | speedySystem | C/N0 | SpeedySystemParser.ts ; AmigaFormatParsers.ts:1492 - SpeedySystemParser: detector/stub, 1 empty pattern -> UADE scan [h: 1p/256r/0n] | 3 | UADE | binary only: uade players/SpeedySystem |
| Steve Barrett | steveBarrett | C/N0 | SteveBarrettParser.ts ; AmigaFormatParsers.ts:1977 - stub [h: 1p/256r/0n] | 2 | UADE | asm/src: amigasrc/wanted_team/SteveBarrett |
| Synth Pack | synthPack | C/N0 | SynthPackParser.ts ; AmigaFormatParsers.ts:2529 - detect+stub (93 lines; OBISYNTHPACK) [h: 1p/256r/0n] | 2 | UADE | asm/src: amigasrc/wanted_team/Synth Pack |
| Thomas Hermann | thomasHermann | C/H | ThomasHermannParser.ts ; AmigaFormatParsers.ts:1838 - detect+stub | 0 | UADE | asm/src: amigasrc/wanted_team/ThomasHermann |
| Time Tracker | timeTracker | C/H | TimeTrackerParser.ts ; AmigaFormatParsers.ts:1720 - detect+stub | 0 | UADE | asm/src: amigasrc/wanted_team/TimeTracker |
| Titanic's Packer | titanicsPacker | C/H | TitanicsPackerParser.ts - detect only | 0 | UADE | asm/src: amigasrc/wanted_team/Titanics Packer |
| TME | tme | C/N0 | TMEParser.ts ; AmigaFormatParsers.ts:1663 - stub [h: 1p/256r/0n] | 2 | UADE | asm/src: amigasrc/wanted_team/TME; Replayers/TheMusicalEnlightment |
| Tronic | tronic | C/H | TronicParser.ts - detect only (44 lines) | 0 | UADE | binary only: uade players/Tronic |
| UFO | ufo | C/H | UFOParser.ts ; AmigaFormatParsers.ts:1295 - detect only (93 lines) | 0 | UADE | asm/src: amigasrc/wanted_team/UFO |
| Audio Sculpture | adsc | C/H | AmigaFormatParsers.ts:2203 direct UADE scan; StartrekkerAMParser exists (companion .nt) but is not the .adsc route | 2 | UADE | docs/formats/Replayers/AudioSculpture (player source) + binary |
| Beathoven Synthesizer | bss | C/H | stub parse (0 notes) -> scan; EaglePlayer plays | 3 | UADE | binary only: uade players/BeathovenSynthesizer |
| DeliTracker customs | cus | C/H | no parser; scan (CustomPlay) | 5 | UADE | binary only: uade players (per-tune customs) |
| David Hanney | dh | C/H | DavidHanneyParser stub (320 empty rows); scan; NATIVE_ROUTES returns null | 2 | UADE | binary only: uade players/DavidHanney |
| Darius Zendeh | dz | C/H | UADE_ONLY_PREFIXES: no parser, scan grid | 1 | UADE | asm/src: amigasrc/dz |
| Forgotten Worlds | fw | C/H | no parser; UADE render is silent for intro.fw (UADE bug) - scan unusable there | 3 | UADE | binary only: uade players/ForgottenWorlds_Game |
| Howie Davies | hd | C/H | WantedTeam stub (0 notes) -> scan; no EaglePlayer entry | 2 | UADE | binary only: uade players/HowieDavies |
| Jochen Hippel base (hip/mcmd) | hip | C/H | UADE_ONLY_PREFIXES hip./mcmd.: no parser, scan grid | 1 | UADE | asm/src: amigasrc/hippel (hip.asm, notes.txt) |
| Dynamic Synthesizer / EMS / Major Tom / AM-Composer / Pokeynoise / Sound Images / Sierra AGI / Dirk Bialluch | misc | C/H | UADE_ONLY_PREFIXES / UADE_EXTENSIONS: no parser; scan | 0 | UADE | asm/src: amigasrc/ems, amigasrc/dz (others none) |
| Silmarils | mok | C/H | SilmarilsParser unrouted (UADEParser NATIVE_ROUTES returns null); scan | 1 | UADE | binary only: uade players/Silmarils |
| ProWizard packers (np, pp, pru, pm, p4x, ...) | packed | C/H | UADE_ONLY_PREFIXES (~120 prefixes): no parser; scan grid of a depacked PT module (UADE ptk-prowiz binary) | 1 | UADE | binary only: uade players/PTK-Prowiz |
| Riff Raff | riff | C/H | stub (0 notes) -> scan | 3 | UADE | binary only: uade players/RiffRaff |
| Synth Dream | sdr | C/H | no parser; scan (ledger P4: UADE loads smp.set bank) | 5 | UADE | binary only: uade players/SynthDream |
| Sound Programming Language | spl | C/H | 41-line detector; scan | 0 | UADE | binary only: uade players/SoundProgrammingLanguage |
| Tim Follin / Follin Player II | tf | C/H | FCParser returns stubTrackerSong for Follin (FCParser.ts:661); scan | 2 | UADE | binary only: uade players/TimFollin |
| Voodoo Supreme Synthesizer | vss | C/H | 42-line detector; scan | 2 | UADE | spec .txt: NostalgicPlayer Format_Descriptions/Voodoo Supreme Synthesizer.txt; binary: uade players/VoodooSupremeSynthesizer |
| Cinter4 | cinter4 | D/- | Cinter4Parser.ts ; AmigaFormatParsers.ts:659 - Cinter4Parser: sequence data left to the WASM replayer (Cinter4Parser.ts header); no corpus song | 0 | Cinter4 | none found |
| C64 SID | c64sid | D/- | SIDParser.ts ; AmigaFormatParsers.ts:575 - SIDParser runs 6502 and intercepts SID writes (player program, register log) [h: 39p/7488r/5796n] | 2 | websid | none found |
| ASAP | asap-native | D/- | AsapParser.ts - AsapParser: metadata only; ASAP engine plays | 0 | Asap | none found |
| AY | ay | D/- | AYParser.ts - AYParser: AY registers per frame from aylet = register view of the Z80 program [h: 1p/48r/0n] | 1 | Aylet | none found |
| AY (STRC / AMAD) | ayStructured | D/- | AYParser.ts - ZXAY STRC/AMAD payloads: parser refuses structured (data is Z80 code); research 2026-10-04_ay-strc-amad.md [h: aztec theme.amad THROW aztec t] | 2 | none (refused) | none found |
| Psycle | cpsycle | D/- | - - CpsycleParser: minimal shell (Psycle has real patterns, not shown) | 0 | Cpsycle | none found |
| EUP | eupmini | D/- | - - EupminiParser: minimal shell, one empty pattern | 3 | Eupmini | none found |
| FMP (PLAY6) | fmp | D/- | FmplayerParser.ts - FmplayerParser: raw binary to engine, empty grid | 0 | Fmplayer | none found |
| GBS | gbs | D/- | GameMusicParser.ts - GameMusicParser header only [h: 1p/256r/0n] | 1 | Gme | none found |
| GYM | gym | D/- | GameMusicParser.ts - GameMusicParser header only [h: 1p/512r/0n] | 1 | Gme | none found |
| HES | hes | D/- | GameMusicParser.ts - GameMusicParser header only [h: 1p/384r/0n] | 1 | Gme | none found |
| IXS | ixalance | D/- | - - IxalanceParser: minimal shell (format is IT-like with real patterns, not shown) | 0 | Ixalance | none found |
| KSS | kss | D/- | GameMusicParser.ts - GameMusicParser header only [h: 1p/512r/0n] | 1 | Gme | none found |
| NSF | nsf | D/- | GameMusicParser.ts - GameMusicParser: header only, scope view (parser comment) [h: 1p/320r/0n] | 1 | Gme | none found |
| Organya | organya | D/- | - - OrganyaParser: minimal shell, one empty pattern | 2 | Organya | none found |
| PxTone | pxtone | D/- | - - PxtoneParser: minimal shell, one empty pattern, engine plays (event data exists but is not shown) | 2 | Pxtone | none found |
| QSF | qsf | D/- | QsfParser.ts ; AmigaFormatParsers.ts:2674 - QsfParser: Z80 program + ROM; engine only | 0 | Qsf | none found |
| S98 | s98 | D/- | S98Parser.ts - S98Parser: header only; register log [h: 1p/64r/0n] | 3 | S98 | none found |
| SAP | sap | D/- | SAPParser.ts - SAPParser 6502 emulation of POKEY writes; scope view (ledger: SAP/ASAP/AY/SNDH open in scope view) [h: 1p/900r/215n] | 4 | Asap | none found |
| SNDH/SC68 | sndh | D/- | SNDHParser.ts ; AmigaFormatParsers.ts:2685 - SNDHParser reads tag header only; 68000 player program (psgplay), scope view [h: 1p/192r/0n] | 223 | Psgplay | none found |
| SPC | spc | D/- | GameMusicParser.ts - GameMusicParser header only [h: 1p/512r/0n] | 1 | Gme | none found |
| V2M | v2m | D/- | - - no parser; V2 synth engine plays | 1 | V2M | none found |
| VGM | vgm | D/- | VGMParser.ts - VGMParser rebuilds notes from chip register writes (register log) [h: 1p/768r/298n] | 3 | Gme/- | none found |
| YM | ym | D/- | ZxtuneParser.ts ; AmigaFormatParsers.ts:2693 - ZxtuneParser shell; engine plays [h: 17th.ym THROW fileName.replace] | 2 | UADE | binary only: uade players/YM-2149 |
| ZXTune | zxtune | D/- | - - ZxtuneParser: minimal shell, one empty pattern; engine plays (PT3/PT2/STC/VTX... have real patterns, not shown) | 0 | Zxtune | none found |
| UAX | uax | D/- | UAXParser.ts ; AmigaFormatParsers.ts:1324 - UAXParser: Unreal sound ripper, samples + one empty pattern (no song) | 0 | UADE | openmpt Load_uax.cpp |

## Ranked work list (B and C; by corpus songs, then by whether player source exists)

Excluded from the ranking: `midi` (B, 43 songs: MIDI has no pattern grid, quantisation is the design), `adplug` (B, 0 songs: split the key instead), `amiga_formats_catchall` (the row only stands for the itemised UADE-only rows). Tags in each line: `[asm]` I read the player assembly, `[hdr]` taken from the parser/doc header (which was derived from the asm), `[triage]` from the 2026-07-12 stub triage, `[FlodJS]`/`[NP]` readable reference loader exists, `[ledger]`, `[?]` not traced - a structure line with `[?]` or `[hdr]` is a pointer for where to start, NOT a confirmed layout. Method for the compiled-68k ones (the player reads the module inside its own code, so there is no layout without executing it): `tools/uade-audit/traceModuleReads.ts` + `gridVsPaula.ts` as the acceptance score (1.00 = the grid is the tune the player plays).

1. **Sound Player** (`soundPlayer`, C, 30 songs; asm/src: amigasrc/wanted_team/SoundPlayer) - [asm+hdr] sjs.* = 15-byte header (b1 = count 11..160, b2 = 7|15 voice mode, b5 repeated at +5/+8/+11[/+14]) + the song data the Scott Johnston "SoundPlayer V4.05" (Lemmings CDTV) replay walks per voice; samples are IFF 8SVX FORMs in the sibling smp.* (InstallSamples). Pattern/sequence encoding NOT traced: start at src/SoundPlayer_v1.asm:764 (song init lbC0639D6), :893 (lbC063B6C), :1004 (play lbC063CE6).
2. **Digital Sonix Chrome** (`digitalSonixChrome`, C, 14 songs; asm/src: amigasrc/wanted_team/DigitalSonixChrome_v1.asm) - [asm] 12-byte header (+2 sample count, +3 length count, +4 song size, +8 sequence count), length x 6-byte entries (byte+4 == 0 marks a subsong), D3 x 4-byte SEQUENCE entries, then sample-info x 18, then PCM (DigitalSonixChrome_v1.asm:226-277). The parser draws the sequence table as the grid and gets 0 notes; entry semantics (note / duration / command) are in the replay routine after InstallSamples [?].
3. **MIDI Loriciel** (`midiLoriciel`, C, 13 songs; asm/src: amigasrc/wanted_team/MIDI-Loriciel) - [hdr] the module IS a standard MIDI file (MThd fmt 0/1 + MTrk chunks, MIDI-Loriciel_v*.asm Check2) + a SMPL.* bank; the grid = note-on/off + delta times of the MTrk events at the player's tempo; no player trace needed except ticks-per-row. Cheapest 13 songs on the list.
4. **Jochen Hippel ST** (`jochenHippelST`, C, 8 songs; asm/src: amigasrc/wanted_team/Jochen_Hippel_ST; NostalgicPlayer Hippel) - [hdr] TFMX-ST song (raw "TFMX", MCMD wrapper, or SOG wrapper): same position -> track-step -> 2-byte note/info row family as JochenHippel7VParser/TFMXParser (both already A); engine plays it via libtfmxaudiodecoder (Jochen/ tree = readable reference), NostalgicPlayer Hippel is a second.
5. **DeliTracker customs** (`cus`, C, 5 songs; binary only: uade players (per-tune customs)) - [?] DeliTracker "customs": each tune is its own compiled 68k player (CustomPlay) - no shared layout; per-tune trace (tools/uade-audit/traceModuleReads.ts) or skip.
6. **Synth Dream** (`sdr`, C, 5 songs; binary only: uade players/SynthDream) - [?] Synth Dream: binary-only player (uade players/SynthDream) + smp.set bank; no source; ledger P4: output is bassy clicks whatever the bank.
7. **Custom Made** (`customMade`, C, 4 songs; asm/src: amigasrc/wanted_team/CustomMade) - [triage] compiled 68k player + data (DeliTracker Custom HUNK exe >= 3001 bytes, or CustomMade binary); "patterns embedded in 68k code"; asm: wanted_team/CustomMade.
8. **Fred Editor** (`fred`, B, 4 songs; asm/src: amigasrc/fred; Replayers/FredEditor; FlodJS FEPlayer.js; NostalgicPlayer Fred; spec .txt: docs/formats/Fred Editor.txt) - [hdr+FlodJS] FEPlayer.js / NostalgicPlayer Fred: subsong -> 4 channel step lists (pattern, transpose) -> pattern byte streams with instrument/portamento/vibrato/arpeggio commands; ledger S2 fireworks ii.fred 0.89/0.44/0.71/0.88: voices 1 and 2 diverge (find which command the grid drops or mis-applies).
9. **Jesper Olsen** (`jesperOlsen`, C, 4 songs; asm/src: amigasrc/wanted_team/Jesper_Olsen) - [triage] compiled 68k player, 3 header variants (0, 1, -1); IFF samples work; pattern data inside the player code; asm: wanted_team/Jesper_Olsen. HARD.
10. **Sound Master** (`soundMaster`, B, 4 songs; asm/src: amigasrc/wanted_team/SoundMaster) - [hdr] BRA.W chain + player + data blob (Sound Master 1.0-3.0, Michiel Soede); SoundMasterParser.ts:388-431 finds patterns by heuristic; replace with the pointers the asm InitPlayer computes (Sound Master_v1.asm, MI_MaxSamples = 32).
11. **Jason Brooke** (`jasonBrooke`, C, 4 songs; binary only: uade players/JasonBrooke) - [?] prefix-only detection (jcbo/jcb/jb), binary player only (uade players/JasonBrooke), no asm; ledger: ikari_warriors.jb scan grid already 0.70 / tick-rebuilt 0.97. Trace-based.
12. **Mark Cooksey** (`markCooksey`, C, 3 songs; asm/src: amigasrc/mark_cooksey_old) - [triage] compiled player + data; old (mco) and new (mc/mcr) variants; asm: mark_cooksey_old + wanted_team/Mark_Cooksey_Don_Adan. OPAQUE per triage - trace-based.
13. **Beathoven Synthesizer** (`bss`, C, 3 songs; binary only: uade players/BeathovenSynthesizer) - [hdr] Wanted Team standard header (+0 $70FF4E75, +4 8-char magic, then pointers Play/Audio/InitSong/SampleInfo/.../songdata_size): a songdata block of known size exists; no asm in the repo (binary player only); EaglePlayer plays it; BeathovenSynthesizerParser.ts gives 0 notes.
14. **Forgotten Worlds** (`fw`, C, 3 songs; binary only: uade players/ForgottenWorlds_Game) - [?] Forgotten Worlds (FWMP, 4 voices); UADE renders intro.fw silent (UADE bug); replacements added (ledger P3).
15. **Riff Raff** (`riff`, C, 3 songs; binary only: uade players/RiffRaff) - [hdr] Wanted Team standard header, magic RIFFRAFF, pointers incl. songdata_size (RiffRaffParser.ts:1-12); songdata block located by header, content not decoded.
16. **Speedy System** (`speedySystem`, C, 3 songs; binary only: uade players/SpeedySystem) - [hdr] "SPEEDY-SYSTEM\0" magic at 0 (.ss) / heuristic header (.sas Speedy A1); compiled executable; binary only (uade players/SpeedySystem, SpeedyA1System).
17. **Audio Sculpture** (`adsc`, C, 2 songs; docs/formats/Replayers/AudioSculpture (player source) + binary) - [?] AudioSculpture; binary player (uade players/AudioSculpture), docs/formats/Replayers/AudioSculpture; StartrekkerAMParser reads companion .nt for the .mod pair only.
18. **Ashley Hogg** (`ashleyHogg`, C, 2 songs; asm/src: amigasrc/wanted_team/Ashley Hogg) - [hdr] compiled player, New (BRA chain + MOVEM.L + BSR + LEA $DFF000) and Old variants + ProTracker packing; asm: wanted_team/Ashley Hogg.
19. **Core Design** (`coreDesign`, C, 2 songs; asm/src: amigasrc/wanted_team/CoreDesign) - [triage] HUNK section-relative pointer chains mapped, samples extracted; pattern-table pointer not yet found; asm: wanted_team/CoreDesign (MEDIUM). EaglePlayer already plays it (34 subsongs on dynamite dux.core).
20. **Desire** (`desire`, C, 2 songs; asm/src: amigasrc/wanted_team/Desire) - [triage] opcode-discovery chain (0xE341/0x47FA) proven for samples; adjacent pointer likely the pattern table; asm: wanted_team/Desire (MEDIUM).
21. **Infogrames** (`infogrames`, C, 2 songs; asm/src: amigasrc/infogrames) - [asm hdr] two files (.dum + .dum.set); u16 at 0 = offset of a table, rel word at +2, tag byte 0x0F (Infogrames.asm CheckFormat; a RobHubbard2 relative); amigasrc/players/infogrames has the player source.
22. **Janko Mrsic-Flogel** (`jankoMrsicFlogel`, C, 2 songs; asm/src: amigasrc/wanted_team/JankoMrsic-Flogel) - [hdr] compiled HUNK exe with "J.FL" marker at 36; asm: wanted_team/JankoMrsic-Flogel; OPAQUE per triage.
23. **Jason Page** (`jasonPage`, C, 2 songs; asm/src: amigasrc/wanted_team/JasonPage) - [triage] compiled player (Gods, Assassin, Robocop 3); asm: wanted_team/JasonPage; OPAQUE. ledger: no score yet.
24. **Kris Hatlelid** (`krisHatlelid`, C, 2 songs; asm/src: amigasrc/wanted_team/KrisHatlelid) - [hdr] fixed-offset BE word/long checks; single-file and two-file variants split at +44; asm: wanted_team/KrisHatlelid. Owner: scan grid already looks right.
25. **MultiMedia Sound** (`multiMediaSound`, C, 2 songs; asm/src: amigasrc/wanted_team/MultiMedia_Sound; Replayers/MultimediaSound) - [hdr] 31 longword sample offsets (even, <= 0x20000), "SO31" at +124, voice count word at +128 (MultiMedia Sound_V1.asm Check2); player source exists (wanted_team/MultiMedia_Sound; docs/formats/Replayers/MultimediaSound).
26. **Music Maker 8V** (`musicMaker8V`, C, 2 songs; asm/src: amigasrc/music_maker) - [asm] FORM/MMV8 (SDAT song data, INST sample table, INAM names); the song grid is a view of the MusicMaker replayer (amigasrc/players/music_maker/MusicMaker8.asm); MusicMakerParser already draws the split .sdata/.ip song grid - reuse its decode for FORM/MMV8.
27. **Paul Robotham** (`paulRobotham`, B, 2 songs; asm/src: amigasrc/wanted_team/PaulRobotham) - [asm hdr] D1 voices, D2 sequence pointers, D3 pattern pointers; per-voice 256-byte note/command streams (note idx 0x1c-0x3e, 0x3f rest, 0x80+ commands); only the pattern region is shown, 1 channel; asm: wanted_team/PaulRobotham. EASY per triage.
28. **Paul Shields** (`paulShields`, C, 2 songs; asm/src: amigasrc/wanted_team/PaulShields) - [triage] 3 sub-variants, samples done, pattern structure undefined; asm: wanted_team/PaulShields. MEDIUM.
29. **Paul Summers** (`paulSummers`, C, 2 songs; asm/src: amigasrc/wanted_team/PaulSummers) - [hdr] detector scans for magic $46FC2700 + RTE ($4E73) from +650, size > 3000; asm: wanted_team/PaulSummers; content not decoded.
30. **Professional Sound Artists** (`psa`, C, 2 songs; asm/src: amigasrc/wanted_team/PSA) - [hdr] Professional Sound Artists; asm: wanted_team/PSA; content not decoded.
31. **Quartet** (`quartet`, C, 2 songs; asm/src: amigasrc/wanted_team/Quartet; Replayers/Quartet) - [triage+hdr] 3 variants (QPA Amiga, SQT PSG Atari, QTS ST DMA); pattern pointers calculated but never followed; asm: wanted_team/Quartet, docs/formats/Replayers/Quartet/PlayModule.S. MEDIUM.
32. **Sean Connolly** (`seanConnolly`, C, 2 songs; binary only: uade players/SeanConnolly; amigasrc/ems (EMS player source, same player ASSUMED)) - [hdr] EMS V3.01/3.18/5.xx self-contained exe (byte 0 = $60); amigasrc/players/ems has EMS player source (ems_new.s, ems_v6.txt) - the one OPAQUE-listed player with real source.
33. **Sean Conran** (`seanConran`, C, 2 songs; asm/src: amigasrc/wanted_team/SeanConran) - [hdr] compiled 68k exe; asm: wanted_team/SeanConran; content not decoded.
34. **Special FX** (`specialFX`, C, 2 songs; asm/src: amigasrc/wanted_team/SpecialFX) - [triage] "patterns in 68k code + data tables, ASM available" (wanted_team/SpecialFX, SpecialFX_ST). HARD.
35. **Steve Barrett** (`steveBarrett`, C, 2 songs; asm/src: amigasrc/wanted_team/SteveBarrett) - [triage] OPAQUE (4 BRA chain, MOVE.L #$DFF0A8); asm: wanted_team/SteveBarrett.
36. **Synth Pack** (`synthPack`, C, 2 songs; asm/src: amigasrc/wanted_team/Synth Pack) - [hdr] "OBISYNTHPACK" magic; asm: wanted_team/Synth Pack; content not decoded.
37. **TME** (`tme`, C, 2 songs; asm/src: amigasrc/wanted_team/TME; Replayers/TheMusicalEnlightment) - [hdr] >= 7000 bytes, patterns identified by $0000050F at 0x3C/0x40 or $00040B11 at 0x1284; asm: wanted_team/TME (+Replayers/TheMusicalEnlightment).
38. **Tomy Tracker** (`tomyTracker`, B, 2 songs; asm/src: amigasrc/wanted_team/TomyTracker) - [asm+ledger] size-based header: u32@0 == u32@4 = patterns end, (D2-704) % 1024 == 0 (1024-byte patterns); asm: wanted_team/TomyTracker; note = byte3/2 fixed 4e4a1bd38; ledger S3 0.06 not re-scored after the fix.
39. **Wally Beben** (`wallyBeben`, B, 2 songs; asm/src: amigasrc/wanted_team/WallyBeben) - [hdr+ledger] voice sequences (0xFF-terminated byte arrays, 4 per subsong) -> phrase/pattern data pointers; phrase bytes 0x24-0x7F are rest/hold (13bd3143f); ledger S2 wicked.wb 0.45/0.82/0.77/0.63, owner: grid bogus. asm: wanted_team/WallyBeben.
40. **Ben Daglish** (`benDaglish`, B, 2 songs; NostalgicPlayer BenDaglish; spec .txt: docs/formats/Ben Daglish.txt) - [hdr+ledger] compiled exe; track byte streams; ledger S2 mickey_mouse.bd 0.68/0.49/0.65/-; NostalgicPlayer BenDaglish + spec "Ben Daglish.txt" are data-separate references; BdEngine plays it.
41. **David Whittaker** (`davidWhittaker`, B, 2 songs; FlodJS DWPlayer.js; NostalgicPlayer DavidWhittaker) - [FlodJS DWPlayer.js + NP DavidWhittaker] relocatable 68k stub; sequence/volseq/frqseq tables located by opcode scan; ledger S3: grid draws song 0 of 8, UADE plays song 1 (apb.dw); garfield2+ neither clean -> the song-index rule is unknown (uade players/DavidWhittaker is binary-only, but DWPlayer.js and the NP worker are readable).
42. **Voodoo Supreme Synthesizer** (`vss`, C, 2 songs; spec .txt: NostalgicPlayer Format_Descriptions/Voodoo Supreme Synthesizer.txt; binary: uade players/VoodooSupremeSynthesizer) - [hdr] Voodoo Supreme Synthesizer (Tomas Partl 1993), synthesis-based, no PCM; spec .txt in NostalgicPlayer Format_Descriptions "Voodoo Supreme Synthesizer.txt" (data-separate format description exists).
43. **Ben Daglish SID** (`benDaglishSID`, C, 2 songs; binary only: uade players/BenDaglish-SID) - [hdr] HUNK exe with "DAGLISH!" at +36; EaglePlayer plays it; BenDaglishParser (A/B) shares the family - reuse its decode; no asm in amigasrc (binary only).
44. **David Hanney** (`dh`, C, 2 songs; binary only: uade players/DavidHanney) - [hdr] "DSNGSEQU" header: 256-byte header + INFO (num_channels at +4) + BLK chunks (DavidHanneyParser.ts:1-30); binary only (uade players/DavidHanney). A chunked layout = good candidate.
45. **EarAche** (`earAche`, C, 2 songs; binary only: uade players/EarAche) - [triage] magic EASO, encoding unknown, no asm (binary only). HARD.
46. **Fred Gray** (`fredGray`, C, 2 songs; binary only: uade players/FredGray) - [triage] OPAQUE; binary only (uade players/FredGray).
47. **GlueMon** (`gluemon`, B, 2 songs; binary only: uade players/GlueMon) - [hdr] 5-byte cells documented in the parser comment, "GLUE" magic; binary player only (uade players/GlueMon); ledger S2 gnu-song.glue ch1 0.10 (octave jumps in the grid the player never writes).
48. **Howie Davies** (`hd`, C, 2 songs; binary only: uade players/HowieDavies) - [hdr] Wanted Team standard header, magic H.DAVIES, songdata_size field (HowieDaviesParser.ts:1-14); content not decoded.
49. **Maniacs of Noise** (`maniacsOfNoise`, C, 2 songs; binary only: uade players/ManiacsOfNoise) - [triage] OPAQUE; binary only; enhanced scan crashes the browser (UADEParser.ts:1128).
50. **Tim Follin / Follin Player II** (`tf`, C, 2 songs; binary only: uade players/TimFollin) - [?] Follin Player II; FCParser.ts:661 returns a stub for it; binary only (uade players/TimFollin).
51. **PiyoPiyo** (`piyoPiyo`, B, 2 songs; none found) - [hdr] 4 tracks x `records` 4-byte events: bits 0-23 = 24 piano keys down (chord), bits 24-31 pan; the grid keeps only the lowest key of each chord (PiyoPiyoParser.ts:1-10). Fix = show all keys (extra columns/effect lanes). No RE needed.
52. **Darius Zendeh** (`dz`, C, 1 songs; asm/src: amigasrc/dz) - [asm] amigasrc/players/dz/DariusZendeh_mod.s (+StephenMifsud.txt) - Mark II prototype; source available.
53. **Jochen Hippel base (hip/mcmd)** (`hip`, C, 1 songs; asm/src: amigasrc/hippel (hip.asm, notes.txt)) - [asm] Hippel base player (amigasrc/players/hippel/hip.asm, notes.txt); family of JochenHippel*.
54. **LME** (`lme`, C, 1 songs; asm/src: amigasrc/wanted_team/LME) - [hdr] "LME" + version byte, u32 at +36 == 0; asm: wanted_team/LME.
55. **Mark II** (`markII`, C, 1 songs; Replayers/MarkII) - [asm] self-playing 68k exe (module IS the replayer); docs/formats/Replayers/MarkII has MarkI.s / MarkII.s / MarkIISoundSystem*.s; Mark I (MRK1) is data-driven with documented spec.
56. **Medley** (`medley`, C, 1 songs; asm/src: amigasrc/medley; Replayers/MedleySoundEditor) - [asm] "MSOB" + relative pointer at +4 (subsong count word at target-2); amigasrc/players/medley/Medley.s + Replayers/MedleySoundEditor/xplay.asm = full player source.
57. **Music Maker 4V** (`musicMaker4V`, C, 1 songs; asm/src: amigasrc/music_maker) - [asm] FORM/MMV4 same container as 8V; amigasrc/players/music_maker/MusicMaker4.asm; same reuse as 8V.
58. **SidMon 1** (`sidmon1`, B, 1 songs; asm/src: amigasrc/sidmon1; Replayers/SIDMon; FlodJS S1Player.js; NostalgicPlayer SidMon10) - [FlodJS S1Player.js + asm sidmon1/] position list -> track (pattern, transpose) per voice -> 5-byte rows; ledger S2 anarchy.sid1 0.60/0.61/0.60/0.55 uniform -> suspect transpose/note-base or pattern-length, not a single voice [?].
59. **Silmarils** (`mok`, C, 1 songs; binary only: uade players/Silmarils) - [hdr] Silmarils 3-voice MIDI-clone, built-in sample depacker; SilmarilsParser.ts is a 45-line detector.
60. **ProWizard packers (np, pp, pru, pm, p4x, ...)** (`packed`, C, 1 songs; binary only: uade players/PTK-Prowiz) - [?] ProWizard packers: UADE unpacks to a PT module (binary uade players/PTK-Prowiz); the depacked bytes are standard 31-sample ProTracker patterns - grid could be decoded from the unpacked module (UADE chip RAM) instead of the Paula scan.
61. **SCUMM** (`scumm`, C, 1 songs; binary only: uade players/SCUMM) - [hdr] BRA.W at +4; binary only.
62. **Sonic Arranger SAS** (`sonicArrangerSas`, C, 1 songs; binary only: uade players/SonicArranger) - [?] compiled "SAS" variant of Sonic Arranger (suffix form crashes the enhanced scan, UADEParser.ts:1140); the A-class SonicArrangerParser knows the chunk layout of the non-compiled form.
63. **MDX** (`mdx`, B, 1 songs; none found) - [hdr] per-channel MML command streams (notes 0x80-0xDF, rests, tempo, voice, volume, pan, LFO, repeats, OPM writes); mdxmini is the engine; command coverage of the grid unverified [?].
64. **ADPCM Mono** (`adpcmMono`, C, 0 songs; asm/src: amigasrc/wanted_team/ADPCM_mono) - [hdr] detector/stub; player asm in amigasrc (amigasrc/wanted_team/ADPCM_mono); content not decoded.
65. **Alcatraz Packer** (`alcatrazPacker`, C, 0 songs; asm/src: amigasrc/wanted_team/Alcatraz_Packer) - [hdr] detector/stub; player asm in amigasrc (amigasrc/wanted_team/Alcatraz_Packer); content not decoded.
66. **Andrew Parton** (`andrewParton`, C, 0 songs; asm/src: amigasrc/wanted_team/Andrew Parton) - [hdr] detector/stub; player asm in amigasrc (amigasrc/wanted_team/Andrew Parton); content not decoded.
67. **Blade Packer** (`bladePacker`, C, 0 songs; asm/src: amigasrc/wanted_team/BladePacker) - [hdr] detector/stub; player asm in amigasrc (amigasrc/wanted_team/BladePacker); content not decoded.
68. **Cinemaware** (`cinemaware`, C, 0 songs; asm/src: amigasrc/wanted_team/Cinemaware) - [hdr] detector/stub; player asm in amigasrc (amigasrc/wanted_team/Cinemaware); content not decoded.
69. **Janne Salmijärvi** (`janneSalmijarvi`, C, 0 songs; asm/src: amigasrc/wanted_team/Janne Salmijarvi Optimizer) - [hdr] detector/stub; player asm in amigasrc (amigasrc/wanted_team/Janne Salmijarvi Optimizer); content not decoded.
70. **Kim Christensen** (`kimChristensen`, C, 0 songs; asm/src: amigasrc/wanted_team/Kim Christensen) - [hdr] detector/stub; player asm in amigasrc (amigasrc/wanted_team/Kim Christensen); content not decoded.
71. **Magnetic Fields Packer** (`magneticFieldsPacker`, C, 0 songs; asm/src: amigasrc/wanted_team/MagneticFieldsPacker) - [hdr] detector/stub; player asm in amigasrc (amigasrc/wanted_team/MagneticFieldsPacker); content not decoded.
72. **Martin Walker** (`martinWalker`, C, 0 songs; asm/src: amigasrc/wanted_team/MartinWalker) - [hdr] detector/stub; player asm in amigasrc (amigasrc/wanted_team/MartinWalker); content not decoded.
73. **Maximum Effect** (`maximumEffect`, C, 0 songs; asm/src: amigasrc/wanted_team/Maximum_Effect) - [hdr] detector/stub; player asm in amigasrc (amigasrc/wanted_team/Maximum_Effect); content not decoded.
74. **MMDC** (`mmdc`, C, 0 songs; asm/src: amigasrc/wanted_team/MMDC) - [hdr] detector/stub; player asm in amigasrc (amigasrc/wanted_team/MMDC); content not decoded.
75. **Mosh Packer** (`moshPacker`, C, 0 songs; asm/src: amigasrc/wanted_team/Mosh Packer) - [hdr] detector/stub; player asm in amigasrc (amigasrc/wanted_team/Mosh Packer); content not decoded.
76. **Nick Pelling Packer** (`nickPellingPacker`, C, 0 songs; asm/src: amigasrc/wanted_team/Nick Pelling Packer) - [hdr] detector/stub; player asm in amigasrc (amigasrc/wanted_team/Nick Pelling Packer); content not decoded.
77. **NovoTrade Packer** (`novoTradePacker`, C, 0 songs; asm/src: amigasrc/wanted_team/NovoTradePacker) - [hdr] detector/stub; player asm in amigasrc (amigasrc/wanted_team/NovoTradePacker); content not decoded.
78. **NTSP** (`ntsp`, C, 0 songs; asm/src: amigasrc/wanted_team/NTSP-system) - [hdr] detector/stub; player asm in amigasrc (amigasrc/wanted_team/NTSP-system); content not decoded.
79. **On Escapee** (`onEscapee`, C, 0 songs; asm/src: amigasrc/wanted_team/onEscapee) - [hdr] detector/stub; player asm in amigasrc (amigasrc/wanted_team/onEscapee); content not decoded.
80. **Paul Tonge** (`paulTonge`, C, 0 songs; asm/src: amigasrc/wanted_team/Paul Tonge) - [hdr] detector/stub; player asm in amigasrc (amigasrc/wanted_team/Paul Tonge); content not decoded.
81. **Pierre Adane** (`pierreAdane`, C, 0 songs; asm/src: amigasrc/wanted_team/PierreAdanePacker) - [hdr] detector/stub; player asm in amigasrc (amigasrc/wanted_team/PierreAdanePacker); content not decoded.
82. **Thomas Hermann** (`thomasHermann`, C, 0 songs; asm/src: amigasrc/wanted_team/ThomasHermann) - [hdr] detector/stub; player asm in amigasrc (amigasrc/wanted_team/ThomasHermann); content not decoded.
83. **Time Tracker** (`timeTracker`, C, 0 songs; asm/src: amigasrc/wanted_team/TimeTracker) - [hdr] detector/stub; player asm in amigasrc (amigasrc/wanted_team/TimeTracker); content not decoded.
84. **Titanic's Packer** (`titanicsPacker`, C, 0 songs; asm/src: amigasrc/wanted_team/Titanics Packer) - [hdr] detector/stub; player asm in amigasrc (amigasrc/wanted_team/Titanics Packer); content not decoded.
85. **UFO** (`ufo`, C, 0 songs; asm/src: amigasrc/wanted_team/UFO) - [hdr] detector/stub; player asm in amigasrc (amigasrc/wanted_team/UFO); content not decoded.
86. **Dynamic Synthesizer / EMS / Major Tom / AM-Composer / Pokeynoise / Sound Images / Sierra AGI / Dirk Bialluch** (`misc`, C, 0 songs; asm/src: amigasrc/ems, amigasrc/dz (others none)) - [?] Dynamic Synthesizer (dns), EMS, Major Tom, AM-Composer, Pokeynoise, Sound Images, Sierra AGI, Dirk Bialluch: no parser; sources in amigasrc/players/{ems,dz} only.
87. **A-Pro-Sys** (`aProSys`, C, 0 songs; binary only: uade players/AProSys) - [?] detector/stub; no source found; trace-based.
88. **Art and Magic** (`artAndMagic`, C, 0 songs; binary only: uade players/ArtAndMagic) - [?] detector/stub; no source found; trace-based.
89. **Laxity** (`laxity`, C, 0 songs; binary only: uade players/Laxity) - [?] detector/stub; no source found; trace-based.
90. **Mike Davies** (`mikeDavies`, C, 0 songs; binary only: uade players/MikeDavies) - [?] detector/stub; no source found; trace-based.
91. **Sound Programming Language** (`spl`, C, 0 songs; binary only: uade players/SoundProgrammingLanguage) - [hdr] HUNK exe, Sound Programming Language (Holger Gehrmann 1987-88); 41-line detector.
92. **Tronic** (`tronic`, C, 0 songs; binary only: uade players/Tronic) - [?] detector/stub; no source found; trace-based.
93. **PMD** (`pmd`, B, 0 songs; none found) - [hdr] PMD MML streams, YM2608; engine pmdmini; grid built from the streams onto Furnace instruments - approximation level unverified [?].

## Not confirmed (and where I looked)

- B vs A for the `H`/`N`-tagged A rows is a judgment from code: a parser that emits notes can still draw them wrong (see S2/S3 rows). Only the `L` rows have a Paula score. Re-scoring every A row with gridVsPaula is the cheap way to find hidden Bs: run it per row, not as a sweep.
- `NATIVE_ROUTES` in UADEParser.ts (:527-1040) holds stub parsers keyed by UADE format name (e.g. 'FredGray', 'CoreDesign', 'SteveBarrett', 'SoundPlayer', 'JasonPage', 'Tronic', 'UFO', 'LegglessMusicEditor', ...). The return at :1089 accepts the native song unless it carries `uadeDeferredCapture`, with no note-count check. If UADE's `formatName` equals one of those keys, a stub's empty grid is returned instead of the scan grid, defeating the F6 fall-through (7060474cf; its test mocks `parseUADEFile`, so it does not cover this). I did not find out which names UADE reports at runtime. If it fires, those C rows are "empty grid", not "scan grid". One probe (load `eco.gray`, read `formatName`) settles it.
- `imagesMusicSystem`, `chuckBiscuits`, `iceTracker`, `kris`, `gameMusicCreator`, `ams`, `digitalSymphony`, `symphoniePro`, `digiBoosterPro`, `graoumfTracker2` are A through libopenmpt (AmigaFormatParsers.ts routes `.ims/.cba/.ice/.kris/.gmc/...` to `parseWithOpenMPT`); a `Load_*.cpp` for each exists in third-party/openmpt-master, but I did not run the wasm to confirm each corpus file loads. Ledger S4 (2026-10-05) still describes `chip5.ims` as an empty stub falling to the scan grid.
- `synmod` (SynTracker, 16 songs) is A only if UADEParser's `NATIVE_ROUTES['SynTracker']` fires; AmigaFormatParsers.ts:2389 sends it straight to `parseUADEFile`.
- `synthesis` emits 4 notes in 576 rows on `space_sound.syn`; correct if the tune is effect-driven, not checked against Paula.
- The player-structure lines in the work list were not traced to the replay loop except SoundPlayer and DigitalSonixChrome init sections; they say so.

## Found (not asked)

- `tools/format-state.json` `patternQuality` is not a usable provenance signal: it marks stubs `full` (e.g. adpcmMono "Unclassified format - defaulted to UADE stub" is `full`).
- Several formats that carry real pattern/event data show an EMPTY shell grid (class D): pxtone, organya, eupmini, ixalance (IT-like, up to 64 channels), cpsycle (Psycle), and the ZXTune family (PT3, PT2, STC, VTX ...). They are the cheapest "decoded grids" nobody asked for: their data is documented and the parsers already parse headers.
- Scan grids are not worthless: gridVsPaula on the generic scan route gave ikari_warriors.jb 0.70, antmusic.mxtx 0.77-0.93, crusaders1.dm 0.84-0.95 (ledger "Phase 2 candidate"); a tick-rebuilt grid scored 0.97 on ikari_warriors.jb and 0.71 on rebels.fred but 0.00 on anthrox.fc. Use gridVsPaula as the acceptance score per format, and keep the scan grid until a decoded grid beats it.
- Data-separate references exist for formats currently B: David Whittaker (`DWPlayer.js` + NostalgicPlayer DavidWhittaker; the memory note "binary-only" is true only of uade-3.05), Ben Daglish (spec `.txt` + NostalgicPlayer BenDaglish), Fred (FEPlayer.js), SidMon1 (S1Player.js + amigasrc/sidmon1).
- MusicMaker: the split `.sdata/.ip` song already has a real grid (A, via MusicMakerParser); the FORM/MMV4/MMV8 files in the same parser are stubs (C) - same decode can be reused.
- Medley and Sean Connolly (EMS) have full player source in `amigasrc/players/{medley,ems}` yet are C stubs; the "OPAQUE" triage label for Sean Connolly is out of date if ems is the same player (assumed from the names, not checked).
