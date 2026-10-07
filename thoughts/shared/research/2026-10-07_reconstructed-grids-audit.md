---
date: 2026-10-07
topic: Reconstructed grids audit - every registry format classed DIRECT, WALK, RECONSTRUCTED or SCOPE (G11)
tags: [formats, grid, audit, reconstructed, guard, registry]
status: final
---

# Reconstructed grids audit (G11, 2026-10-07)

Owner: "find all reconstructed grids. we need to address all of them."

## Counted from

`FORMAT_REGISTRY` (src/lib/import/FormatRegistry.ts), read through tsx: **279 entries** (139 amiga-native, 67 uade-only, 34 pc-tracker, 28 chip-dump, 4 c64-chip, 4 libopenmpt, 2 furnace, 1 midi), 87 without a `nativeParser`. Parser dispatch is `parseModuleToSong` -> `tryRouteFormat` (parsers/AmigaFormatParsers.ts) -> UADEPrefixParsers.ts `UADE_ONLY_PREFIXES` (not exported; its prefixes reach the registry through the `uade_*` keys and `amiga_formats_catchall`). Source of the per-format evidence: thoughts/shared/research/2026-10-06_grid-provenance-per-format.md (232 rows, parsers run on the corpus, ledger scores), updated with everything landed 2026-10-07 and with the 61-format plan (2026-10-07-grid-from-replayer-walk.md).

## Counts (registry keys)

| Class | Keys | Meaning |
|---|---|---|
| DIRECT | 94 | decodes a stored pattern format, or libopenmpt does |
| WALK | 12 | the replayer's own walk, held to an oracle test (named in the table) |
| RECONSTRUCTED | 144 | static guesser, heuristic/linearised track walker, UADE scan, or a stub grid that falls to the UADE scan: 83 formats + the 61 `uade_*` keys |
| SCOPE | 29 | no grid by design (chip dumps, register logs, owner/blocked decisions) |

The 144: 25 keys sit under existing plan units (U7-U13, U16-U20, U24-U28), 58 under new units G11-<key> (including `amiga_formats_catchall`), 61 `uade_*` keys under G11-uade-only. src/lib/import/gridProvenance.ts is the authority.

## What "reconstructed" means here, and what it does not

- Reconstructed = the grid is not the stored data and not the player's walk. Includes: parser returns an empty/stub grid and the app falls to the UADE enhanced scan (withFallback.ts countNotes === 0), linearised command streams (Future Player, Ron Klaren, Music Assembler), quantised conversions (MIDI), register-dump conversions (AdPlug DRO/IMF, MDX, PMD).
- A decode that is merely buggy (SoundMon, Delta Music 1, InStereo, Sound Control, Anders Oland) stays DIRECT: the fix is a decode fix, tracked by the plan's class A units.
- Known limits: 84 DIRECT/RECONSTRUCTED rows of the 10-06 audit are tagged H (judged from code or header, no corpus song), not measured. The 12 WALK oracles are exact for the formats whose test says exact; reverifiedGridsArePlayersWalk.test.ts (note order only) is NOT used as a WALK oracle. Ben Daglish WALK covers sub-song 0 only. The `uade_*` keys were not routed one by one (a prefix may reach a native parser first); unit G11-uade-only starts with that mapping. Corpus counts are not repeated here.

## Reconstructed list

Plan units that already existed: Future Player (U7), Music Assembler (U8), MusicLine (U9), MusicMaker 8V (U10), Digital Mugician (U11), Ron Klaren (U12), Sawteeth (U13), Wally Beben (U16), Core Design (U17), Jesper Olsen Format 0 (U18), Tomy Tracker (U19), Images Music System (U20), Custom Made (U24), Infogrames (U25), Desire and Jason Page (U26), Ashley Hogg and Darius Zendeh (U27), the C-bin family (U28, new id for the existing Wave 10). New units G11-<key> (58) are tabled in the plan, section "G11 additions".

## Table (one row per registry key)

Evidence column: the 10-06 audit text (AmigaFormatParsers.ts line numbers are dispatch lines as of 10-06 and may have drifted); WALK rows name the oracle test in the Unit/oracle column; RECONSTRUCTED rows name the plan unit.

| Key | Class | Parser module | Unit / oracle / reason | Evidence |
|---|---|---|---|---|
| midi | RECONSTRUCTED | MIDIImporter | G11-midi | MIDIImporter.ts - MIDIImporter quantizes note events onto a row grid (options: quantize, pattern length); no native grid exists [h: IMPORTFAIL Cannot find module ] |
| fur | DIRECT | none |  | - - FurnaceSongParser: reads the .fur pattern/order/instrument tables |
| dmf | DIRECT | XTrackerParser |  | XTrackerParser.ts ; AmigaFormatParsers.ts:113 - DefleMask via Furnace DivEngine import (zlib DMF); X-Tracker DMF has own parser (pref default uade, AmigaFormatParsers.ts:113) [h: Darude - Sandstorm.dmf NULL] |
| hvl | DIRECT | HivelyParser |  | HivelyParser.ts ; AmigaFormatParsers.ts:95 - HivelyParser: tracks/positions/instruments (byte-exact AHX codec) [h: 74p/18944r/4024n] |
| okt | DIRECT | none |  | - - OktalyzerParser (withNativeDefault, AmigaFormatParsers.ts:170) |
| med | DIRECT | none |  | - - MEDParser / libopenmpt (AmigaFormatParsers.ts:178) |
| digi | DIRECT | none |  | - - DigiBoosterParser (DBMX/DBM0) else libopenmpt (AmigaFormatParsers.ts:195) |
| deltaMusic2 | DIRECT | DeltaMusic2Parser |  | DeltaMusic2Parser.ts ; AmigaFormatParsers.ts:220 - 4 tracks of [block,transpose] + 16-row blocks (DeltaMusic2Parser header); byte-exact codec [h: 112p/7168r/2008n] |
| fc | DIRECT | FCParser |  | FCParser.ts ; AmigaFormatParsers.ts:232 - FCParser: FC1.3/1.4 sequences+patterns; ledger S1 anthrox.fc 1.00/0.20/0.99/0.91 (ch1 open); FC-BSI/Follin return a stub (FCParser.ts:661-668) [h: 16p/2048r/773n] |
| soundmon | DIRECT | SoundMonParser |  | SoundMonParser.ts ; AmigaFormatParsers.ts:247 - SoundMonParser: song steps x 4 tracks + 3-byte rows; ledger S1 1.00/1.00/1.00/0.89; soundMonGridMatchesPlayer.test.ts [h: 16p/1024r/498n] |
| sidmon1 | WALK | SidMon1Parser | src/engine/__tests__/sidmon1GridMatchesUade.test.ts | walk held to oracle. SidMon1Parser.ts ; AmigaFormatParsers.ts:255 - SidMon1Parser (FlodJS S1Player) but ledger S2 anarchy.sid1 0.60/0.61/0.60 |
| sidmon2 | DIRECT | SidMon2Parser |  | SidMon2Parser.ts ; AmigaFormatParsers.ts:255 - SidMon2Parser: 3-pass interleaved tracks + variable-length patterns (S2Player.js) [h: 30p/7680r/1862n] |
| fred | WALK | FredEditorParser | src/lib/import/__tests__/fredEditorGridMatchesPlayer.test.ts | walk held to oracle. FredEditorParser.ts + FredEditorModule.ts + fredEditorGrid.ts - module decoded from the replayer's own structures (track |
| soundfx | DIRECT | SoundFXParser |  | SoundFXParser.ts ; AmigaFormatParsers.ts:308 - SoundFXParser: 64-row 4-byte rows; ledger S1 batdance.sfx 1.00/1.00/-/1.00 (effects 7-9 approximated, SoundFXParser.ts:501-525) [h: 10p/2560r/402n] |
| jamcracker | DIRECT | JamCrackerParser |  | JamCrackerParser.ts ; AmigaFormatParsers.ts:320 - JamCrackerParser: pattern table + 4-byte rows; byte-exact codec [h: 5p/1280r/638n] |
| quadraComposer | DIRECT | QuadraComposerParser |  | QuadraComposerParser.ts ; AmigaFormatParsers.ts:336 - QuadraComposerParser: IFF EMOD/PATT 4-byte cells [h: 9p/2064r/1106n] |
| amosMusicBank | DIRECT | AMOSMusicBankParser |  | AMOSMusicBankParser.ts ; AmigaFormatParsers.ts:349 - AMOSMusicBankParser: song playlists + command-based channel patterns (no corpus song; not measured) |
| sonicArranger | DIRECT | SonicArrangerParser |  | SonicArrangerParser.ts ; AmigaFormatParsers.ts:366 - SonicArrangerParser: STBL/OVTB/NTBL chunks; ledger S1 mega end.sa 1.00/0.98/0.98/0.95 [h: 132p/8448r/2542n] |
| inStereo2 | DIRECT | InStereo2Parser |  | InStereo2Parser.ts ; AmigaFormatParsers.ts:388 - InStereo2Parser: 4-byte cell; byte-exact codec [h: 82p/5248r/1633n] |
| inStereo1 | DIRECT | InStereo1Parser |  | InStereo1Parser.ts ; AmigaFormatParsers.ts:410 - InStereo1Parser: positions/track rows (NostalgicPlayer InStereo10Worker); no corpus song |
| inStereoAmbiguous | DIRECT | none |  | - - .is: routed by magic to InStereo1Parser/InStereo2Parser (AmigaFormatParsers.ts:431); fantasi8.is |
| hippelCoso | DIRECT | HippelCoSoParser |  | HippelCoSoParser.ts ; AmigaFormatParsers.ts:479 - HippelCoSoParser: command-stream recipe, byte-exact; not measured by gridVsPaula [h: 70p/4480r/2652n] |
| robHubbard | WALK | RobHubbardParser | src/engine/__tests__/robHubbardGridIsPlayersWalk.test.ts | walk held to oracle. RobHubbardParser.ts ; AmigaFormatParsers.ts:497 - RobHubbardParser: compiled-68k tables located by opcode scan; carrier  |
| tfmx | DIRECT | TFMXParser |  | TFMXParser.ts ; AmigaFormatParsers.ts:511 - TFMXParser: mdat pattern/track-step tables [h: 47p/10752r/1346n] |
| mugician | RECONSTRUCTED | DigitalMugicianParser | U11 | DigitalMugicianParser.ts ; AmigaFormatParsers.ts:543 - DigitalMugicianParser: fixed 7f9675391 (Mugician II = 7 voices, real notes); cockwise.mug was 0.25 before the fix, not re-scored in the ledger [h: 11p/2816r/714n] |
| davidWhittaker | WALK | DavidWhittakerParser | src/engine/__tests__/davidWhittakerGridVoices.test.ts | walk held to oracle. DavidWhittakerParser.ts ; AmigaFormatParsers.ts:629 - DavidWhittakerParser: heuristic scan (parser header); ledger S3: g |
| artOfNoise | DIRECT | ArtOfNoiseParser |  | ArtOfNoiseParser.ts ; AmigaFormatParsers.ts:650 - ArtOfNoiseParser: 4-byte cell; byte-exact codec [h: 14p/3584r/1564n] |
| cinter4 | SCOPE | Cinter4Parser | Cinter4Parser: sequence data left to the WASM replayer (Cint | Cinter4Parser.ts ; AmigaFormatParsers.ts:659 - Cinter4Parser: sequence data left to the WASM replayer (Cinter4Parser.ts header); no corpus song |
| digitalSymphony | DIRECT | DigitalSymphonyParser |  | DigitalSymphonyParser.ts - DigitalSymphonyParser: sequences + packed patterns; approximations for two effects (DigitalSymphonyParser.ts:1220,1267) [h: 14p/3584r/417n] |
| graoumfTracker2 | DIRECT | GraoumfTracker2Parser |  | GraoumfTracker2Parser.ts ; AmigaFormatParsers.ts:700 - gt2 via libopenmpt (AmigaFormatParsers.ts:694); gtk via GraoumfTracker2Parser [h: 36p/18432r/3316n] |
| symphoniePro | DIRECT | SymphonieProParser |  | SymphonieProParser.ts - .symmod via libopenmpt (AmigaFormatParsers.ts:714); SymphonieProParser exists (SymEvents) [h: 20p/17920r/574n] |
| digiBoosterPro | DIRECT | DigiBoosterProParser |  | DigiBoosterProParser.ts - libopenmpt Load_dbm.cpp (AmigaFormatParsers.ts:733) [h: 51p/58752r/3392n] |
| pumaTracker | DIRECT | PumaTrackerParser |  | PumaTrackerParser.ts ; AmigaFormatParsers.ts:745 - PumaTrackerParser (0.999 vs UADE per AmigaFormatParsers.ts:741 comment) [h: 15p/1920r/1218n] |
| synthesis | DIRECT | SynthesisParser |  | SynthesisParser.ts ; AmigaFormatParsers.ts:760 - SynthesisParser; harness: 4 notes / 576 rows on space_sound.syn (effect-heavy; not confirmed) [h: 9p/576r/4n] |
| digitalSoundStudio | DIRECT | DigitalSoundStudioParser |  | DigitalSoundStudioParser.ts ; AmigaFormatParsers.ts:769 - DigitalSoundStudioParser [h: 38p/9728r/2591n] |
| musicAssembler | RECONSTRUCTED | MusicAssemblerParser | U8 | MusicAssemblerParser.ts ; AmigaFormatParsers.ts:778 - MusicAssemblerParser (ma.asm in uade amigasrc) [h: 20p/1472r/455n] |
| chuckBiscuits | DIRECT | ChuckBiscuitsParser |  | ChuckBiscuitsParser.ts - .cba via libopenmpt Load_cba.cpp (AmigaFormatParsers.ts:807); ChuckBiscuitsParser itself returns a 100-channel empty grid [h: 1p/6400r/0n] |
| imagesMusicSystem | RECONSTRUCTED | ImagesMusicSystemParser | U20 | ImagesMusicSystemParser.ts - .ims via libopenmpt Load_ims.cpp (AmigaFormatParsers.ts:830); ImagesMusicSystemParser is an empty-grid stub (ledger S4 predates routing? not confirmed) [h: 1p/256r/0n] |
| iceTracker | DIRECT | ICEParser |  | ICEParser.ts - libopenmpt Load_ice.cpp (AmigaFormatParsers.ts:841); no corpus |
| musicLine | RECONSTRUCTED | MusicLineParser | U9 | MusicLineParser.ts ; AmigaFormatParsers.ts:859 - MusicLineParser: tune positions -> RLE PARTs (128 rows x 6 columns) [h: 29p/979r/402n] |
| gameMusicCreator | DIRECT | GameMusicCreatorParser |  | GameMusicCreatorParser.ts - libopenmpt Load_gmc.cpp (AmigaFormatParsers.ts:875); own parser byte-exact [h: 21p/5376r/752n] |
| faceTheMusic | DIRECT | FaceTheMusicParser |  | FaceTheMusicParser.ts ; AmigaFormatParsers.ts:886 - FaceTheMusicParser (own replayer); libopenmpt only on refusal [h: 59p/7552r/1949n] |
| sawteeth | RECONSTRUCTED | SawteethParser | U13 | SawteethParser.ts ; AmigaFormatParsers.ts:898 - SawteethParser: per-channel [part,transpose,damp] steps + parts [ins,effect,note] (SawteethWorker.cs) [h: 6p/1376r/514n] |
| soundControl | DIRECT | SoundControlParser |  | SoundControlParser.ts ; AmigaFormatParsers.ts:908 - SoundControlParser: track list + 4-byte note rows (spec .txt) [h: 62p/47988r/2360n] |
| soundFactory | RECONSTRUCTED | SoundFactoryParser | G11-soundFactory | SoundFactoryParser.ts ; AmigaFormatParsers.ts:916 - SoundFactoryParser: command stream (note/pause/...) per voice [h: 256p/65536r/2084n] |
| actionamics | WALK | ActionamicsParser | src/engine/__tests__/actionamicsGridMatchesPlayer.test.ts | walk held to oracle. ActionamicsParser.ts ; AmigaFormatParsers.ts:929 - ActionamicsParser (NostalgicPlayer ActionamicsWorker) |
| activisionPro | WALK | ActivisionProParser | src/engine/__tests__/activisionProGridMatchesUade.test.ts | walk held to oracle. ActivisionProParser.ts ; AmigaFormatParsers.ts:938 - ActivisionProParser: 1-byte cell idx into AVP_PERIODS; byte-exact [ |
| ronKlaren | RECONSTRUCTED | RonKlarenParser | U12 | RonKlarenParser.ts ; AmigaFormatParsers.ts:946 - RonKlarenParser: track command streams (note + wait count) found by opcode scan; sparse (125 notes / 3072 rows) [h: 12p/3072r/125n] |
| kris | DIRECT | KRISParser |  | KRISParser.ts - libopenmpt Load_kris.cpp (AmigaFormatParsers.ts:850); no corpus |
| deltaMusic1 | DIRECT | DeltaMusic1Parser |  | DeltaMusic1Parser.ts ; AmigaFormatParsers.ts:1446 - DeltaMusic1Parser; ledger S1 crusaders1.dm 0.96/0.92/1.00/0.99 [h: 58p/3712r/1505n] |
| ams | DIRECT | AMSParser |  | AMSParser.ts - libopenmpt Load_ams.cpp (AmigaFormatParsers.ts:1384) [h: 35p/71680r/2773n] |
| iffSmus | DIRECT | IffSmusParser |  | IffSmusParser.ts ; AmigaFormatParsers.ts:1394 - IffSmusParser/SonixMusicDriverParser: TRAK event stream onto a tick grid (duration table exact); 979 corpus songs [h: 63p/15920r/2308n] |
| magneticFieldsPacker | RECONSTRUCTED | MagneticFieldsPackerParser | G11-magneticFieldsPacker | MagneticFieldsPackerParser.ts ; AmigaFormatParsers.ts:1431 - detect+stub; two-file with smp.* |
| richardJoseph | DIRECT | RichardJosephParser |  | RichardJosephParser.ts ; AmigaFormatParsers.ts:1457 - RichardJosephParser: interleaved chunks, subsong table; no corpus song, not measured |
| speedySystem | RECONSTRUCTED | SpeedySystemParser | G11-speedySystem | SpeedySystemParser.ts ; AmigaFormatParsers.ts:1492 - SpeedySystemParser: detector/stub, 1 empty pattern -> UADE scan [h: 1p/256r/0n] |
| tronic | RECONSTRUCTED | TronicParser | G11-tronic | TronicParser.ts - detect only (44 lines) |
| medley | RECONSTRUCTED | MedleyParser | G11-medley | MedleyParser.ts ; AmigaFormatParsers.ts:1555 - detect+stub (MSOB); Medley.s source exists |
| daveLowe | DIRECT | DaveLoweParser |  | DaveLoweParser.ts ; AmigaFormatParsers.ts:1513 - DaveLoweParser: note/rest event words; ledger S1 1.00/0.99/1.00/1.00 [h: 203p/48896r/1430n] |
| lme | RECONSTRUCTED | LMEParser | G11-lme | LMEParser.ts ; AmigaFormatParsers.ts:1534 - LMEParser metadata only [h: 1p/256r/0n] |
| infogrames | RECONSTRUCTED | InfogramesParser | U25 | InfogramesParser.ts ; AmigaFormatParsers.ts:1675 - InfogramesParser: empty 1-channel grid -> scan (two-file .dum + .dum.set) [h: 1p/999r/0n] |
| pt36 | DIRECT | PT36Parser |  | PT36Parser.ts ; AmigaFormatParsers.ts:1478 - PT36Parser: raw MOD inside IFF PTDT |
| benDaglish | WALK | BenDaglishParser | src/engine/__tests__/benDaglishGridMatchesPlayer.test.ts | walk held to oracle. BenDaglishParser.ts ; AmigaFormatParsers.ts:817 - BenDaglishParser (1200 lines); ledger S2 mickey_mouse.bd 0.68/0.49/0.6 |
| markCooksey | RECONSTRUCTED | MarkCookseyParser | G11-markCooksey | MarkCookseyParser.ts ; AmigaFormatParsers.ts:1569 - stub [h: 1p/256r/0n] |
| jeroenTel | DIRECT | JeroenTelParser |  | JeroenTelParser.ts ; AmigaFormatParsers.ts:1579 - JeroenTelParser: track byte stream (Play_1 encoding); header text says metadata-only but harness finds 2381 notes; not measured [h: 67p/20352r/2381n] |
| quartet | RECONSTRUCTED | QuartetParser | G11-quartet | QuartetParser.ts - QuartetParser placeholder pattern (QuartetParser.ts:402-537) [h: 1p/256r/0n] |
| soundMaster | WALK | SoundMasterParser | src/engine/__tests__/soundMasterGridMatchesPlayer.test.ts | walk held to oracle. SoundMasterModule.ts + soundMasterGrid.ts + SoundMasterParser.ts - song decoded where the module's own replayer reads it |
| zoundMonitor | DIRECT | ZoundMonitorParser |  | ZoundMonitorParser.ts ; AmigaFormatParsers.ts:1621 - ZoundMonitorParser: u32 cell bitfield; byte-exact [h: 12p/1536r/795n] |
| synthPack | RECONSTRUCTED | SynthPackParser | G11-synthPack | SynthPackParser.ts ; AmigaFormatParsers.ts:2529 - detect+stub (93 lines; OBISYNTHPACK) [h: 1p/256r/0n] |
| tcbTracker | DIRECT | TCBTrackerParser |  | TCBTrackerParser.ts ; AmigaFormatParsers.ts:1638 - TCBTrackerParser (libopenmpt Load_tcb.cpp); ledger S1 m-demo3 3.tcb 0.94/1.00/0.99/1.00 [h: 32p/8192r/1894n] |
| mmdc | RECONSTRUCTED | MMDCParser | G11-mmdc | MMDCParser.ts ; AmigaFormatParsers.ts:1699 - detect+metadata |
| psa | RECONSTRUCTED | PSAParser | G11-psa | PSAParser.ts ; AmigaFormatParsers.ts:1687 - stub [h: 1p/256r/0n] |
| steveTurner | DIRECT | SteveTurnerParser |  | SteveTurnerParser.ts ; AmigaFormatParsers.ts:1713 - SteveTurnerParser: sequence table + offset-table pattern blocks [h: 20p/5120r/1736n] |
| tme | RECONSTRUCTED | TMEParser | G11-tme | TMEParser.ts ; AmigaFormatParsers.ts:1663 - stub [h: 1p/256r/0n] |
| jasonPage | RECONSTRUCTED | JasonPageParser | U26 | JasonPageParser.ts ; AmigaFormatParsers.ts:1648 - stub [h: 1p/256r/0n] |
| futurePlayer | RECONSTRUCTED | FuturePlayerParser | U7 | FuturePlayerParser.ts ; AmigaFormatParsers.ts:1630 - FuturePlayerParser: voice byte streams linearized; ledger S1 imploder drums.fp 0.94/0.77/1.00/0.92; shared-subroutine call graph flattened (carrier note) [h: 64p/16384r/5044n] |
| jasonBrooke | RECONSTRUCTED | JasonBrookeParser | U28 | JasonBrookeParser.ts - stub (86 lines) [h: 1p/256r/0n] |
| laxity | RECONSTRUCTED | LaxityParser | G11-laxity | LaxityParser.ts ; AmigaFormatParsers.ts:2563 - detect+stub |
| fredGray | RECONSTRUCTED | FredGrayParser | U28 | FredGrayParser.ts ; AmigaFormatParsers.ts:2539 - stub [h: 1p/256r/0n] |
| musicMaker | DIRECT | MusicMakerParser |  | MusicMakerParser.ts ; AmigaFormatParsers.ts:2586 - MusicMakerParser.parseMusicMakerSongFile: STD/EXT song grid as a view of the MusicMaker replayer (needs the .ip companion; harness threw without it) [h: best of guitars.sdata THRO |
| musicMaker4V | RECONSTRUCTED | MusicMakerParser | G11-musicMaker4V | MusicMakerParser.ts ; AmigaFormatParsers.ts:2593 - MusicMaker4V: FORM/MMV4 instruments only, 1 empty pattern [h: 1p/256r/0n] |
| musicMaker8V | RECONSTRUCTED | MusicMakerParser | U10 | MusicMakerParser.ts ; AmigaFormatParsers.ts:2609 - MusicMaker8V: FORM/MMV8 instruments only, 1 empty 8-channel pattern [h: 1p/512r/0n] |
| jochenHippelST | WALK | JochenHippelSTParser | src/engine/__tests__/jochenHippelSTGridMatchesPlayer.test.ts | walk held to oracle. JochenHippelSTModule.ts + JochenHippelSTSong.ts + JochenHippelSTParser.ts ; AmigaFormatParsers.ts (sog/soc/hst, mdst) -  |
| specialFX | RECONSTRUCTED | SpecialFXParser | G11-specialFX | SpecialFXParser.ts ; AmigaFormatParsers.ts:2518 - stub [h: 1p/256r/0n] |
| timeTracker | RECONSTRUCTED | TimeTrackerParser | G11-timeTracker | TimeTrackerParser.ts ; AmigaFormatParsers.ts:1720 - detect+stub |
| cinemaware | RECONSTRUCTED | CinemawareParser | G11-cinemaware | CinemawareParser.ts ; AmigaFormatParsers.ts:1744 - detect+stub |
| novoTradePacker | RECONSTRUCTED | NovoTradePackerParser | G11-novoTradePacker | NovoTradePackerParser.ts ; AmigaFormatParsers.ts:1757 - detect+stub |
| alcatrazPacker | RECONSTRUCTED | AlcatrazPackerParser | G11-alcatrazPacker | AlcatrazPackerParser.ts ; AmigaFormatParsers.ts:1768 - detect+stub |
| bladePacker | RECONSTRUCTED | BladePackerParser | G11-bladePacker | BladePackerParser.ts - detect+stub |
| tomyTracker | RECONSTRUCTED | TomyTrackerParser | U19 | TomyTrackerParser.ts ; AmigaFormatParsers.ts:1790 - TomyTrackerParser: fixed 4e4a1bd38 (note = byte3/2) after ledger S3 0.06; not re-scored since [h: 24p/6144r/2690n] |
| maxTrax | DIRECT | MaxTraxParser |  | MaxTraxParser.ts ; AmigaFormatParsers.ts:2190 - MaxTraxParser: score events -> lossless deriveGrid [h: 24p/27648r/2347n] |
| fashionTracker | DIRECT | FashionTrackerParser |  | FashionTrackerParser.ts ; AmigaFormatParsers.ts:1799 - FashionTrackerParser: located from player code; gridVsPaula 1.00 on all 4 channels (fashionTrackerGrid.test.ts) [h: 10p/2560r/449n] |
| multiMediaSound | RECONSTRUCTED | MultiMediaSoundParser | G11-multiMediaSound | MultiMediaSoundParser.ts ; AmigaFormatParsers.ts:1810 - stub [h: 1p/256r/0n] |
| seanConran | RECONSTRUCTED | SeanConranParser | G11-seanConran | SeanConranParser.ts ; AmigaFormatParsers.ts:1824 - stub [h: 1p/256r/0n] |
| thomasHermann | RECONSTRUCTED | ThomasHermannParser | G11-thomasHermann | ThomasHermannParser.ts ; AmigaFormatParsers.ts:1838 - detect+stub |
| titanicsPacker | RECONSTRUCTED | TitanicsPackerParser | G11-titanicsPacker | TitanicsPackerParser.ts - detect only |
| krisHatlelid | RECONSTRUCTED | KrisHatlelidParser | G11-krisHatlelid | KrisHatlelidParser.ts ; AmigaFormatParsers.ts:1732 - stub; scan grid scrolls and looks right (owner 2026-10-05) [h: 1p/256r/0n] |
| ntsp | RECONSTRUCTED | NTSPParser | G11-ntsp | NTSPParser.ts ; AmigaFormatParsers.ts:1870 - detect only |
| moshPacker | RECONSTRUCTED | MoshPackerParser | G11-moshPacker | MoshPackerParser.ts ; AmigaFormatParsers.ts:1889 - detect only |
| coreDesign | RECONSTRUCTED | CoreDesignParser | U17 | CoreDesignParser.ts ; AmigaFormatParsers.ts:1914 - stub; EaglePlayer plays, grid = UADE scan [h: 1p/256r/0n] |
| jankoMrsicFlogel | RECONSTRUCTED | JankoMrsicFlogelParser | G11-jankoMrsicFlogel | JankoMrsicFlogelParser.ts ; AmigaFormatParsers.ts:1923 - stub [h: 1p/256r/0n] |
| soundPlayer | DIRECT | SoundPlayerParser |  | SoundPlayerParser.ts + soundPlayerCodec.ts - 3-byte header + 12-byte rows walked per voice as the player does; byte-exact 31/31; gridVsPaula 1.00 on every channel of all 31 (2026-10-06_soundplayer-format.md) |
| nickPellingPacker | RECONSTRUCTED | NickPellingPackerParser | G11-nickPellingPacker | NickPellingPackerParser.ts ; AmigaFormatParsers.ts:1952 - detect+stub |
| peterVerswyvelenPacker | DIRECT | PeterVerswyvelenPackerParser |  | PeterVerswyvelenPackerParser.ts - PeterVerswyvelenPackerParser: PT-style packer header + patterns; no corpus, not measured |
| wallyBeben | RECONSTRUCTED | WallyBebenParser | U16 | WallyBebenParser.ts ; AmigaFormatParsers.ts:1968 - WallyBebenParser: voice sequences + phrase decode; ledger S2 wicked.wb 0.45/0.82/0.77/0.63; owner: grid bogus (ledger 2026-10-06) [h: 45p/2672r/786n] |
| steveBarrett | RECONSTRUCTED | SteveBarrettParser | G11-steveBarrett | SteveBarrettParser.ts ; AmigaFormatParsers.ts:1977 - stub [h: 1p/256r/0n] |
| paulSummers | RECONSTRUCTED | PaulSummersParser | G11-paulSummers | PaulSummersParser.ts - detect+stub (169 lines) [h: everton_fc_-_jingles.snk THROW] |
| desire | RECONSTRUCTED | DesireParser | U26 | DesireParser.ts ; AmigaFormatParsers.ts:1999 - stub [h: 1p/256r/0n] |
| martinWalker | RECONSTRUCTED | MartinWalkerParser | G11-martinWalker | MartinWalkerParser.ts ; AmigaFormatParsers.ts:2022 - stub; shares avp/mw route (AmigaFormatParsers.ts:2022) |
| paulShields | RECONSTRUCTED | PaulShieldsParser | G11-paulShields | PaulShieldsParser.ts ; AmigaFormatParsers.ts:2032 - stub: 1 channel x 98 rows from the located sequence region, 0 notes -> scan [h: 1p/98r/0n] |
| paulRobotham | RECONSTRUCTED | PaulRobothamParser | G11-paulRobotham | PaulRobothamParser.ts ; AmigaFormatParsers.ts:2047 - PaulRobothamParser: located per-voice 256-byte pattern streams, shown as 1 channel of raw note/command bytes (stub-bucket fix 9cc944d87) [h: 3p/768r/468n] |
| pierreAdane | RECONSTRUCTED | PierreAdaneParser | G11-pierreAdane | PierreAdaneParser.ts ; AmigaFormatParsers.ts:2056 - detect+stub |
| anders0land | DIRECT | Anders0landParser |  | Anders0landParser.ts ; AmigaFormatParsers.ts:2066 - Anders0landParser: mdt position lists + pattern byte streams; ledger S2 0.98/0.58/0.94/0.66; owner heard it right 2026-10-06 [h: 28p/7168r/1084n] |
| andrewParton | RECONSTRUCTED | AndrewPartonParser | G11-andrewParton | AndrewPartonParser.ts ; AmigaFormatParsers.ts:2076 - detect+stub |
| customMade | RECONSTRUCTED | CustomMadeParser | U24 | CustomMadeParser.ts ; AmigaFormatParsers.ts:2085 - stub (patterns embedded in 68k code) [h: 1p/256r/0n] |
| benDaglishSID | SCOPE | BenDaglishSIDParser | owner verdict Good, stub pattern opens the scope view (plan  | BenDaglishSIDParser.ts ; AmigaFormatParsers.ts:2096 - stub; EaglePlayer plays [h: 1p/192r/0n] |
| digitalSonixChrome | WALK | DigitalSonixChromeParser | src/lib/import/__tests__/digitalSonixChromeGridMatchesPlayer.test.ts | walk held to oracle. DigitalSonixChromeParser.ts ; AmigaFormatParsers.ts:2106 - 0 notes in 3 of 3 corpus files -> scan (sequence table only d |
| jesperOlsen | RECONSTRUCTED | JesperOlsenParser | U18 | JesperOlsenModule.ts + jesperOlsenGrid.ts + JesperOlsenParser.ts ; AmigaFormatParsers.ts (jo) - L/G songs DECODED from the song (driver model == UADE Paula writes and voice records, whole song; thoughts/shared/research/2026-10-06_ |
| kimChristensen | RECONSTRUCTED | KimChristensenParser | G11-kimChristensen | KimChristensenParser.ts ; AmigaFormatParsers.ts:2124 - detect+stub |
| ashleyHogg | RECONSTRUCTED | AshleyHoggParser | U27 | AshleyHoggParser.ts ; AmigaFormatParsers.ts:2135 - stub [h: 1p/256r/0n] |
| adpcmMono | RECONSTRUCTED | ADPCMmonoParser | G11-adpcmMono | ADPCMmonoParser.ts ; AmigaFormatParsers.ts:2143 - stub |
| janneSalmijarvi | RECONSTRUCTED | JanneSalmijarviParser | G11-janneSalmijarvi | JanneSalmijarviParser.ts ; AmigaFormatParsers.ts:2151 - stub |
| jochenHippel7V | WALK | JochenHippel7VParser | src/engine/__tests__/hippelTfmxGridMatchesPlayer.test.ts | walk held to oracle. JochenHippel7VParser.ts ; AmigaFormatParsers.ts:2161 - JochenHippel7VParser: TFMX-7V song, 2-byte rows, byte-exact [h: 2 |
| maximumEffect | RECONSTRUCTED | MaximumEffectParser | G11-maximumEffect | MaximumEffectParser.ts ; AmigaFormatParsers.ts:2244 - detect+stub |
| midiLoriciel | RECONSTRUCTED | MIDILoricielParser | G11-midiLoriciel | MIDILoricielParser.ts ; AmigaFormatParsers.ts:2254 - stub: grid over the SMF region, 0 notes in 2 of 2 corpus files -> scan (EaglePlayer plays) [h: 1p/27453r/0n] |
| onEscapee | RECONSTRUCTED | OnEscapeeParser | G11-onEscapee | OnEscapeeParser.ts ; AmigaFormatParsers.ts:2266 - detect+stub |
| paulTonge | RECONSTRUCTED | PaulTongeParser | G11-paulTonge | PaulTongeParser.ts ; AmigaFormatParsers.ts:2274 - detect+stub |
| robHubbardST | DIRECT | RobHubbardSTParser |  | RobHubbardSTParser.ts - RobHubbardSTParser: via UADE route NATIVE_ROUTES (needs moduleBase scan) [h: 3p/768r/516n] |
| maniacsOfNoise | RECONSTRUCTED | ManiacsOfNoiseParser | G11-maniacsOfNoise | ManiacsOfNoiseParser.ts ; AmigaFormatParsers.ts:2625 - stub; enhanced scan crashes (UADEParser.ts:1128) -> classic [h: 1p/256r/0n] |
| goatTracker | DIRECT | none |  | - - GTUltra: orderlists + patterns of the .sng |
| c64sid | SCOPE | SIDParser | SIDParser runs 6502 and intercepts SID writes (player progra | SIDParser.ts ; AmigaFormatParsers.ts:575 - SIDParser runs 6502 and intercepts SID writes (player program, register log) [h: 39p/7488r/5796n] |
| sidFactory2 | DIRECT | SIDFactory2Parser |  | SIDFactory2Parser.ts ; AmigaFormatParsers.ts:554 - SF2 driver tables: sequences + orderlists [h: 4p/384r/320n] |
| cheesecutter | DIRECT | CheeseCutterParser |  | CheeseCutterParser.ts ; AmigaFormatParsers.ts:565 - CheeseCutter track/pattern/instrument tables [h: 27p/4704r/2772n] |
| vgm | SCOPE | VGMParser | VGMParser rebuilds notes from chip register writes (register | VGMParser.ts - VGMParser rebuilds notes from chip register writes (register log) [h: 1p/768r/298n] |
| ym | SCOPE | ZxtuneParser | ZxtuneParser shell; engine plays [h: 17th.ym THROW fileName. | ZxtuneParser.ts ; AmigaFormatParsers.ts:2693 - ZxtuneParser shell; engine plays [h: 17th.ym THROW fileName.replace] |
| nsf | SCOPE | GameMusicParser | GameMusicParser: header only, scope view (parser comment) [h | GameMusicParser.ts - GameMusicParser: header only, scope view (parser comment) [h: 1p/320r/0n] |
| sap | SCOPE | SAPParser | SAPParser 6502 emulation of POKEY writes; scope view (ledger | SAPParser.ts - SAPParser 6502 emulation of POKEY writes; scope view (ledger: SAP/ASAP/AY/SNDH open in scope view) [h: 1p/900r/215n] |
| asap-native | SCOPE | AsapParser | AsapParser: metadata only; ASAP engine plays | AsapParser.ts - AsapParser: metadata only; ASAP engine plays |
| ay | SCOPE | AYParser | AYParser: AY registers per frame from aylet = register view  | AYParser.ts - AYParser: AY registers per frame from aylet = register view of the Z80 program [h: 1p/48r/0n] |
| ayStructured | SCOPE | AYParser | ZXAY STRC/AMAD payloads: parser refuses structured (data is  | AYParser.ts - ZXAY STRC/AMAD payloads: parser refuses structured (data is Z80 code); research 2026-10-04_ay-strc-amad.md [h: aztec theme.amad THROW aztec t] |
| s98 | SCOPE | S98Parser | S98Parser: header only; register log [h: 1p/64r/0n] | S98Parser.ts - S98Parser: header only; register log [h: 1p/64r/0n] |
| gbs | SCOPE | GameMusicParser | GameMusicParser header only [h: 1p/256r/0n] | GameMusicParser.ts - GameMusicParser header only [h: 1p/256r/0n] |
| hes | SCOPE | GameMusicParser | GameMusicParser header only [h: 1p/384r/0n] | GameMusicParser.ts - GameMusicParser header only [h: 1p/384r/0n] |
| kss | SCOPE | GameMusicParser | GameMusicParser header only [h: 1p/512r/0n] | GameMusicParser.ts - GameMusicParser header only [h: 1p/512r/0n] |
| spc | SCOPE | GameMusicParser | GameMusicParser header only [h: 1p/512r/0n] | GameMusicParser.ts - GameMusicParser header only [h: 1p/512r/0n] |
| gym | SCOPE | GameMusicParser | GameMusicParser header only [h: 1p/512r/0n] | GameMusicParser.ts - GameMusicParser header only [h: 1p/512r/0n] |
| mdx | RECONSTRUCTED | MDXParser | G11-mdx | MDXParser.ts - MDXParser decodes per-channel MML command streams (notes/rests/tempo/voice) onto a tick grid with Furnace-instrument mapping; coverage of LFO/OPM register commands NOT confirmed [h: 17p/9558r/1249n] |
| sndh | SCOPE | SNDHParser | SNDHParser reads tag header only; 68000 player program (psgp | SNDHParser.ts ; AmigaFormatParsers.ts:2685 - SNDHParser reads tag header only; 68000 player program (psgplay), scope view [h: 1p/192r/0n] |
| qsf | SCOPE | QsfParser | QsfParser: Z80 program + ROM; engine only | QsfParser.ts ; AmigaFormatParsers.ts:2674 - QsfParser: Z80 program + ROM; engine only |
| pmd | RECONSTRUCTED | PMDParser | G11-pmd | PMDParser.ts - PMDParser extracts notes from MML command streams onto a Furnace-instrument grid; approximate (not confirmed per command) |
| piyoPiyo | RECONSTRUCTED | PiyoPiyoParser | G11-piyoPiyo | PiyoPiyoParser.ts - PiyoPiyoParser: 4 tracks of 4-byte events; grid shows only the LOWEST key of each chord (PiyoPiyoParser.ts header) [h: 4p/1024r/426n] |
| stoneTracker | DIRECT | StoneTrackerParser |  | StoneTrackerParser.ts ; AmigaFormatParsers.ts:670 - StoneTrackerParser: SPM songs/track patterns/CTRL patterns (research 2026-10-05_stonetracker-replayer.md) [h: hypnosphere.spm THROW hypnosph] |
| tfmMusicMaker | DIRECT | TFMMusicMakerParser |  | TFMMusicMakerParser.ts - TFMMusicMakerParser: RLE-unpacked fixed header incl. patterns (ZXTune tfmmusicmaker.cpp) [h: 38p/16512r/5491n] |
| fmp | SCOPE | FmplayerParser | FmplayerParser: raw binary to engine, empty grid | FmplayerParser.ts - FmplayerParser: raw binary to engine, empty grid |
| adplug | RECONSTRUCTED | AdPlugParser | G11-adplug | AdPlugParser.ts - AdPlugParser: RAD/HSC/CMF/D00 native pattern import (A); DRO/IMF/A2M etc. are register-dump reconstructions (C); mixed |
| pxtone | SCOPE | none | PxtoneParser: minimal shell, one empty pattern, engine plays | - - PxtoneParser: minimal shell, one empty pattern, engine plays (event data exists but is not shown) |
| organya | SCOPE | none | OrganyaParser: minimal shell, one empty pattern | - - OrganyaParser: minimal shell, one empty pattern |
| eupmini | SCOPE | none | EupminiParser: minimal shell, one empty pattern | - - EupminiParser: minimal shell, one empty pattern |
| ixalance | SCOPE | none | IxalanceParser: minimal shell (format is IT-like with real p | - - IxalanceParser: minimal shell (format is IT-like with real patterns, not shown) |
| cpsycle | SCOPE | none | CpsycleParser: minimal shell (Psycle has real patterns, not  | - - CpsycleParser: minimal shell (Psycle has real patterns, not shown) |
| zxtune | SCOPE | none | ZxtuneParser: minimal shell, one empty pattern; engine plays | - - ZxtuneParser: minimal shell, one empty pattern; engine plays (PT3/PT2/STC/VTX... have real patterns, not shown) |
| v2m | SCOPE | none | no parser; V2 synth engine plays | - - no parser; V2 synth engine plays |
| composer667 | DIRECT | Composer667Parser |  | Composer667Parser.ts ; AmigaFormatParsers.ts:789 - Composer667Parser: pattern rows [h: 78p/39936r/4819n] |
| fmTracker | DIRECT | none |  | - - libopenmpt (Load_fmt.cpp) pattern export |
| imagoOrpheus | DIRECT | ImagoOrpheusParser |  | ImagoOrpheusParser.ts ; AmigaFormatParsers.ts:1228 - ImagoOrpheusParser / libopenmpt Load_imf.cpp [h: astaris.imf NULL] |
| cdfm67 | DIRECT | CDFM67Parser |  | CDFM67Parser.ts ; AmigaFormatParsers.ts:1245 - CDFM67Parser / libopenmpt Load_c67.cpp [h: 128p/106496r/244n] |
| easyTrax | DIRECT | EasyTraxParser |  | EasyTraxParser.ts ; AmigaFormatParsers.ts:1262 - EasyTraxParser / Load_etx.cpp |
| karlMorton | DIRECT | KarlMortonParser |  | KarlMortonParser.ts ; AmigaFormatParsers.ts:1280 - KarlMortonParser / Load_mus_km.cpp [h: boogie.mus NULL] |
| xmf | DIRECT | XMFParser |  | XMFParser.ts ; AmigaFormatParsers.ts:1307 - XMFParser / Load_xmf.cpp |
| uax | SCOPE | UAXParser | UAXParser: Unreal sound ripper, samples + one empty pattern  | UAXParser.ts ; AmigaFormatParsers.ts:1324 - UAXParser: Unreal sound ripper, samples + one empty pattern (no song) |
| madTracker2 | DIRECT | MadTracker2Parser |  | MadTracker2Parser.ts ; AmigaFormatParsers.ts:1346 - MadTracker2Parser / Load_mt2.cpp [h: finde somewhere to hide.mt2 NU] |
| psm | DIRECT | PSMParser |  | PSMParser.ts ; AmigaFormatParsers.ts:1366 - PSMParser / Load_psm.cpp [h: 23p/11776r/2601n] |
| unic | DIRECT | UNICParser |  | UNICParser.ts ; AmigaFormatParsers.ts:958 - UNICParser (3-byte cell, byte-exact codec) [h: 20p/5120r/1773n] |
| mtm | DIRECT | MTMParser |  | MTMParser.ts ; AmigaFormatParsers.ts:973 - MTMParser [h: 53p/40704r/8478n] |
| 669 | DIRECT | Format669Parser |  | Format669Parser.ts ; AmigaFormatParsers.ts:988 - Format669Parser [h: 78p/39936r/4819n] |
| far | DIRECT | FARParser |  | FARParser.ts ; AmigaFormatParsers.ts:1003 - FARParser [h: 29p/29696r/5820n] |
| plm | DIRECT | PLMParser |  | PLMParser.ts ; AmigaFormatParsers.ts:1018 - PLMParser [h: 32p/22363r/3798n] |
| ult | DIRECT | ULTParser |  | ULTParser.ts ; AmigaFormatParsers.ts:1033 - ULTParser [h: 31p/33728r/4283n] |
| rtm | DIRECT | RTMParser |  | RTMParser.ts ; AmigaFormatParsers.ts:1048 - RTMParser [h: 9p/2880r/523n] |
| dsm | DIRECT | DSMParser |  | DSMParser.ts ; AmigaFormatParsers.ts:1063 - DSMParser |
| dtm | DIRECT | DTMParser |  | DTMParser.ts ; AmigaFormatParsers.ts:1078 - DTMParser [h: 29p/29696r/1387n] |
| stm | DIRECT | STMParser |  | STMParser.ts ; AmigaFormatParsers.ts:1093 - STMParser [h: 32p/8192r/5171n] |
| stx | DIRECT | STXParser |  | STXParser.ts ; AmigaFormatParsers.ts:1108 - STXParser [h: 20p/5120r/3269n] |
| nru | DIRECT | NRUParser |  | NRUParser.ts ; AmigaFormatParsers.ts:1123 - NRUParser (4-byte cell, byte-exact) [h: 1p/256r/115n] |
| ptm | DIRECT | PTMParser |  | PTMParser.ts ; AmigaFormatParsers.ts:1138 - PTMParser [h: 27p/17280r/3517n] |
| gdm | DIRECT | GDMParser |  | GDMParser.ts ; AmigaFormatParsers.ts:1153 - GDMParser [h: 28p/28672r/1241n] |
| stk | DIRECT | STKParser |  | STKParser.ts ; AmigaFormatParsers.ts:1168 - STKParser |
| stp | DIRECT | STPParser |  | STPParser.ts ; AmigaFormatParsers.ts:1183 - STPParser [h: 19p/4864r/650n] |
| mdl | DIRECT | MDLParser |  | MDLParser.ts ; AmigaFormatParsers.ts:1198 - MDLParser [h: 44p/25344r/2545n] |
| amf | DIRECT | AMFParser |  | AMFParser.ts ; AmigaFormatParsers.ts:1213 - AMFParser [h: 27p/6912r/4380n] |
| j2b | DIRECT | none |  | - - libopenmpt (no native parser) |
| mo3 | DIRECT | none |  | - - libopenmpt (no native parser) |
| itp | DIRECT | none |  | - - libopenmpt Load_itp.cpp |
| nst | DIRECT | none |  | - - libopenmpt |
| wow | DIRECT | none |  | - - libopenmpt |
| ufo | RECONSTRUCTED | UFOParser | G11-ufo | UFOParser.ts ; AmigaFormatParsers.ts:1295 - detect only (93 lines) |
| kt | DIRECT | KlysParser |  | KlysParser.ts ; AmigaFormatParsers.ts:101 - KlysParser: klystrack patterns/sequences (native engine) [h: 2048p/524288r/0n] |
| earAche | RECONSTRUCTED | EarAcheParser | U28 | EarAcheParser.ts ; AmigaFormatParsers.ts:2574 - stub [h: 1p/1792r/0n] |
| scumm | RECONSTRUCTED | SCUMMParser | G11-scumm | SCUMMParser.ts ; AmigaFormatParsers.ts:2407 - stub [h: 1p/256r/0n] |
| suntronic | WALK | SunTronicParser | src/engine/__tests__/sunTronicGridMatchesPlayer.test.ts | walk held to oracle. SunTronicParser.ts ; AmigaFormatParsers.ts:2445 - V1.3 "Delirium" score executables: SunTronicV13 score decode (637 of 6 |
| gluemon | RECONSTRUCTED | GlueMonParser | U28 | GlueMonParser.ts ; AmigaFormatParsers.ts:2702 - GlueMonParser (5-byte cells); ledger S2 gnu-song.glue 0.64/0.10/0.86/0.95 - ch1 octave jumps [h: 6p/1536r/371n] |
| seanConnolly | RECONSTRUCTED | SeanConnollyParser | G11-seanConnolly | SeanConnollyParser.ts ; AmigaFormatParsers.ts:2352 - stub [h: 1p/256r/0n] |
| artAndMagic | RECONSTRUCTED | SimpleAmigaStubParser | G11-artAndMagic | SimpleAmigaStubParser.ts ; AmigaFormatParsers.ts:2723 - SimpleAmigaStubParser |
| mikeDavies | RECONSTRUCTED | SimpleAmigaStubParser | G11-mikeDavies | SimpleAmigaStubParser.ts - SimpleAmigaStubParser |
| markII | RECONSTRUCTED | SimpleAmigaStubParser | G11-markII | SimpleAmigaStubParser.ts ; AmigaFormatParsers.ts:2396 - SimpleAmigaStubParser [h: 1p/256r/0n] |
| sonicArrangerSas | RECONSTRUCTED | SimpleAmigaStubParser | G11-sonicArrangerSas | SimpleAmigaStubParser.ts - SimpleAmigaStubParser [h: 1p/256r/0n] |
| aProSys | RECONSTRUCTED | SimpleAmigaStubParser | G11-aProSys | SimpleAmigaStubParser.ts ; AmigaFormatParsers.ts:2418 - SimpleAmigaStubParser |
| xrns | DIRECT | XRNSParser |  | XRNSParser.ts - XRNSParser: Renoise XML patterns [h: tunefish-noremorse.xrns THROW ] |
| mod | DIRECT | MODParser |  | MODParser.ts - MODParser (PT/NT/ST patterns); UADE route also re-parses ProTracker/Noisetracker/Soundtracker via MODParser (UADEParser.ts:~527) [h: 39p/9984r/2985n] |
| xm | DIRECT | XMParser |  | XMParser.ts - XMParser [h: 32p/8192r/1966n] |
| it | DIRECT | ITParser |  | ITParser.ts - ITParser [h: 42p/66400r/8817n] |
| s3m | DIRECT | S3MParser |  | S3MParser.ts - S3MParser [h: 51p/52224r/16969n] |
| amiga_formats_catchall | RECONSTRUCTED | none | G11-amiga_formats_catchall | - - UADE_EXTENSIONS catch-all: no parser; UADEParser buildEnhancedSong/buildClassicSong from the Paula scan (its corpus songs are itemised in the UADE-only rows below) |
| uade_abk | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_agi | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_ast | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_bss | RECONSTRUCTED | none | U28 | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_bfc | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_bsi | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_fc_bsi | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_cus | SCOPE | none | UADE cannot run the player, no oracle can exist (plan D2) | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_cust | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_custom | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_dh | RECONSTRUCTED | none | U28 | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_dns | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_dz | RECONSTRUCTED | none | U27 | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_mkiio | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_mg | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_ems | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_emsv6 | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_fw | SCOPE | none | UADE renders it silent, no oracle can exist (plan D2) | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_hd | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_hn | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_thn | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_mtp2 | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_arp | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_hip | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_mcmd | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_sog | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_mok | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_mso | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_pn | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_riff | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_sa_p | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_lion | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_sa_old | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_sdr | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_spl | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_tw | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_sun | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_synmod | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_tf | RECONSTRUCTED | none | U28 | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_thx | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_tfhd1_5 | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_tfhd7v | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_tfhdpro | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_tfmx1_5 | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_tfmx7v | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_tfmxpro | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_vss | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_ah | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_bvs | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_cba | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_chip | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_cd | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_dlw | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_fp2 | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_fredmon | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_mxt | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_mxtx | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_nt | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_ntsp | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_psum | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_rhst | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_rkl | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_sc2 | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_sil | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_tomy | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_st | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
| uade_ins | RECONSTRUCTED | none | G11-uade-only | no native parser: UADE scan unless AmigaFormatParsers routes the prefix first (not verified per key) |
