---
date: 2026-03-24
topic: deep-format-audit-results
tags: [formats, amiga, uade, audit, regression]
status: draft
---

# Deep Format Audit Results — 2026-03-24

## WORKING WELL (proper format, patterns, instruments, audio)

| File | Format | Pats | Inst | Editor |
|------|--------|------|------|--------|
| anthrox.fc | Future Composer | 16 | 9 | classic |
| adept.smod | Future Composer | 8 | 5 | classic |
| action_section.aon | Art of Noise | 14 | 7 | classic |
| analogue_vibes.jam | JamCracker Pro | 5 | 8 | jamcracker |
| antidust.bp3 | SoundMon | 30 | 15 | classic |
| aquarivs.bp | SoundMon | 130 | 15 | classic |
| almighty.sa | Sonic Arranger | 132 | 10 | classic |
| anarchy.sid1 | SidMon 1 | 24 | 23 | classic |
| cannonfodder.tcb | TCB Tracker | 18 | 16 | classic |
| crusaders1.dm | Delta Music | 58 | 20 | classic |
| anthrox_intro.dm2 | Delta Music 2 | 20 | 6 | classic |
| cockwise.mug | Digital Mugician | 23 | 25 | classic |
| snickle.mug2 | Digital Mugician | 3 | 6 | classic |
| flight.dmu | Digital Mugician | 3 | 6 | classic |
| synth_corn.emod | Quadra Composer | 9 | 9 | classic |
| the_day_after.digi | DigiBooster | 30 | 31 | classic |
| invisibility.dbm | DigiBooster Pro | 51 | 22 | classic |
| aces_high.ahx | HivelyTracker | 74 | 34 | hively |
| hexplosion.hvl | HivelyTracker | 45 | 36 | hively |
| med.sadman | OctaMED | 36 | 18 | classic |
| funky nightmare.mmd1 | OctaMED | 30 | 12 | classic |
| bounty hunter.mmd3 | OctaMED | 20 | 12 | classic |
| universal monsters.mmd0 | OctaMED | 16 | 3 | classic |
| baseheads.ma | Music Assembler | 20 | 30 | classic |
| north_sea_inferno.sc | Sound Control | 62 | 15 | classic |
| symphonie_test.symmod | Symphonie Pro | 6 | 12 | classic |
| noname.stp | STPro II | 19 | 21 | classic |
| drwho_final4.dsym | Digital Symphony | 14 | 63 | classic |
| stereo_feeling.is20 | InStereo! 2 | 56 | 9 | classic |
| fantasi8.is | InStereo! | 204 | 18 | classic |
| knights_of_sky.gmc | Game Music Creator | 3 | 15 | classic |
| prehistoric_tale.hipc | Hippel-CoSo | 30 | 13 | classic |
| gettysburg.avp | Activision Pro | 2 | 10 | classic |
| doxtro3.dss | Digital Sound Studio | 19 | 31 | classic |
| space_sound.syn | Synthesis | 9 | 2 | classic |
| the_plague_game_end.cm | Custom Made | 8 | 7 | classic |
| viking_child.cm | Custom Made | 7 | 6 | classic |
| bomb jack.fred | Fred Editor | 25 | 6 | classic |
| rebels.fred | Fred Editor | 3 | 4 | classic |
| bottle popper.mms | MultiMedia Sound | 5 | 10 | classic |
| eco.gray | Fred Gray | 79 | 5 | classic |
| wicked.wb | Wally Beben | 41 | 23 | classic |
| dynamite_dux.core | Core Design | 3 | 7 | classic |
| astra_2.rk | Ron Klaren | 4 | 14 | classic |
| everton_fc.snk | Paul Summers | 79 | 2 | classic |
| kernel.ams | AMS/Velvet Studio | 35 | 7 | classic |
| african dreams.unic | UNIC Tracker | 20 | 31 | classic |
| hybris.fp | Future Player | 64 | 1 | classic |
| imploder_drums.fp | Future Player | 64 | 1 | classic |
| offroad.jpo | Jason Page Old | 8 | 16 | classic |
| hot.primemover_01 | Anders Øland | 10 | 8 | classic |
| wildwheels_ingame.jd | Special FX | 3 | 4 | classic |

## UADE STREAMING ONLY (audio works, minimal display data)

These formats are compiled 68k replayers — UADE handles audio but
pattern data can't be extracted by a parser. This is expected behavior.

| File | Format | Pats | Inst | Notes |
|------|--------|------|------|-------|
| ash.nobby_the_aardvark | Ashley Hogg | 1 | 1 | UADE streaming |
| tristar_cracktro.bss | Beathoven Synth | 1 | 4 | UADE streaming |
| pauker_rap_2.ss | Speedy System | 1 | 16 | UADE streaming |
| 64_conversion.tme | TME | 1 | 31 | UADE streaming |
| terramex.bds | Ben Daglish SID | 1 | 8 | UADE streaming |
| mickey_mouse.bd | Ben Daglish | 1 | 8 | UADE streaming |
| easystyleofmsx.mm4 | Music Maker 4V | 1 | 9 | UADE streaming |
| house2.mm8 | Music Maker 8V | 1 | 10 | UADE streaming |
| goldrunner.psf | Sound Factory | 1 | 4 | UADE streaming |
| jpn.virocop-14 | Jason Page | 1 | 32 | UADE streaming |
| centurion_battle.rh | Rob Hubbard | 1 | 1 | UADE streaming |
| cm.viking_child | Custom Made | 1 | 8 | UADE streaming, prefix format |
| operation_stealth.sfx | Sound-FX | 1 | 15 | UADE streaming, empty patterns |
| lme_test.lme | LME | 1 | 4 | UADE streaming |
| astaroth.sog | Hippel ST | 1 | 1 | UADE streaming |
| batmanreturns.dsr | Desire | 1 | 8 | UADE streaming |
| irrepressible intro.sg | TomyTracker | 1 | 30 | UADE streaming |
| dawnpatrol-sad.dat | Unknown | 1 | 1 | UADE catch-all |

## BROKEN — Needs Investigation

### Format detected wrong / Unknown
| File | Reported Format | Issue |
|------|----------------|-------|
| memphis.glue | Unknown | GlueMon parser not matching |
| dynablaster.ast | Unknown | ActionAmics parser not matching |
| ikari_warriors.jb | Unknown | Jason Brooke parser not matching |
| lollypop-subgame_01.jo | Unknown | Jesper Olsen parser not matching |
| spacestation.jmf | Unknown | Janko parser not matching |
| insects_in_space.jt | Unknown | Jeroen Tel parser not matching |
| blazing_thunder.hd | Unknown | Howie Davies parser not matching |
| gyroscope.mon | Unknown | Mon parser not matching |

### TFMX broken
| File | Issue |
|------|-------|
| mdat.turrican_bonus | patternLength=1, editorMode=classic, pattern pointers broken |
| mdat.rocknroll | Same — TFMX parser has fundamental pattern pointer issue |

### Low instrument count (possible regression)
| File | Format | Pats | Inst | Issue |
|------|--------|------|------|-------|
| apb.dw | David Whittaker | 1 | 1 | Parser returning minimal data |
| bruno_time.sid2 | SidMon II | 8 | 1 | Only 1 instrument extracted |

### Load errors
| File | Error |
|------|-------|
| harmonic disorder.ml | Failed to load module: ptr |
| warlock_the_avenger.sqt | Failed to load module: ptr |
| amnesia_credits.c67 | UADE ret=-1 |
| antmusic.mxtx | UADE ret=-1 |
| skyfox.cus | UADE ret=-1 |
| cave_story.org | Failed to load module: ptr |
| boogie.mus | Failed to load module: ptr |
| m-bison.dln | Loads but silent |
| follin_test.fp2 | UADE ret=-1 |
| jamespond2aga-title.ins | Unsupported (.ins not in registry) |
| unic.mk.eagleplayerintro | Unsupported (double-dot filename) |

## Summary

- **52 formats working well** — proper patterns, instruments, audio
- **18 UADE streaming** — audio works, no pattern display (expected for compiled replayers)
- **8 format detection failures** — parser exists but doesn't match the file
- **2 TFMX broken** — pattern pointer parsing issue
- **2 low instrument count** — possible parser regression
- **11 load errors** — UADE failures, missing format support, or libopenmpt issues

## Priority Fixes

1. **TFMX** — pattern pointer table stride is wrong (4-byte vs 16-byte entries)
2. **Format detection** — 8 parsers exist but aren't matching their test files (need magic byte / filename check fixes)
3. **"Failed to load module: ptr"** — libopenmpt WASM issue for .ml, .sqt, .org, .mus formats
4. **SidMon II** — instrument extraction only getting 1 instrument
