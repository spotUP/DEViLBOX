---
date: 2026-10-08
topic: Jukebox listening grades - every song with a fault, to fix
tags: [jukebox, formats, grades, todo]
status: draft
---

# Jukebox grades - fault list (2026-10-08)

The owner listened to every jukebox song and graded it. The grades live in `tools/format-state.json` (served by the format tracker on :4444, never committed by standing rule); this file is the committed fix list derived from it, so the work is not lost. Regenerate from the json when grades change.

Entries in the tracker: 2011. With a fault: 319. Changed in today's grading pass: 184 of the faulted ones (318 entries changed in all).

Status counts: - 1558, works 307, crashes 91, silent 33, partial 13, broken 6, untested 3

Pattern quality counts: - 947, full 519, n/a 349, incorrect 72, partial 45, none 42, empty 27, out-of-sync 8, frozen 2

| Song key | Status | Pattern quality | Today | Notes |
|---|---|---|---|---|
| Goat Tracker Ultra-Jammer | silent |  | yes | Silent — $3GarysGlitteringSaliva_4x.sng · (jukebox 2026-10-02 21:23) |
| Goat Tracker Ultra-JasonPage | silent |  | yes | Silent — RType_Amiga2SID.sng · (jukebox 2026-10-02 21:24) |
| Goat Tracker Ultra-LMan | silent |  | yes | Silent — $3LMan-Rivalry-Dubs.sng · (jukebox 2026-10-02 21:24) |
| Goat Tracker Ultra-Linus | silent |  | yes | Silent — $3Cold-War-Generation.sng · (jukebox 2026-10-02 21:24) |
| SUNTronicTunes-unknown |  | incorrect | yes | Incorrect Pattern Data — Lightforce · (jukebox 2026-10-06 22:18) |
| actionamics | silent |  | yes | Silent — dynablaster.ast · (jukebox 2026-10-06 22:11) |
| activision-pro |  | incorrect | yes | cleared Wrong Sound — gettysburg.avp · (jukebox 2026-10-06 18:16) |
| adplug-a2m | works | partial |  | browser OK [AdLib Tracker 2] rms=0.0170 |
| adplug-adl |  | partial |  | browser OK [Westwood ADL (version 3)] rms=0.0001 |
| adplug-adt |  | partial |  | Not a real extension — AdLib Tracker uses .sng |
| adplug-adtrack |  | partial |  | Not a real extension — uses .sng |
| adplug-agd |  | partial |  | browser OK [HERAD System AGD (version 1, HSQ packed)] rms=0.0153 |
| adplug-amd | works | partial |  | browser OK [AMUSIC Adlib Tracker] rms=0.0553 |
| adplug-bam | works | partial |  | browser OK [Bob's Adlib Music] rms=0.0264 |
| adplug-bmf |  | partial |  | browser OK [xad: BMF Adlib Tracker] rms=0.0354 |
| adplug-cff |  | partial |  | browser OK [BoomTracker 4] rms=0.1960 |
| adplug-dfm | works | partial |  | browser OK [Digital-FM 1.1] rms=0.0334 |
| adplug-dmo |  | partial |  | browser OK [TwinTeam (packed S3M)] rms=0.1237 |
| adplug-dtm |  | partial |  | browser OK [DeFy Adlib Tracker] rms=0.0413 |
| adplug-got |  | partial |  | browser OK [God of Thunder Music] rms=0.0515 |
| adplug-ha2 |  | partial |  | HERAD HA2 — same player as sdb/sqx, verified working |
| adplug-herad |  | partial |  | Not a real extension — uses .hsq/.sqx/.sdb/.agd/.ha2 |
| adplug-hsp |  | partial |  | browser OK [HSC Adlib Composer / HSC-Tracker] rms=0.0363 |
| adplug-hsq |  | partial |  | HERAD HSQ — same player as sdb/sqx, verified working |
| adplug-hybrid |  | partial |  | XAD sub-format — uses .xad extension |
| adplug-hyp |  | partial |  | XAD sub-format — uses .xad extension |
| adplug-jbm | works | partial |  | browser OK [JBM Adlib Music] rms=0.0341 |
| adplug-ksm |  | partial |  | browser OK [Ken Silverman's Music Format] rms=0.0508 |
| adplug-laa | works | partial |  | browser OK [LucasArts AdLib MIDI] rms=0.0890 |
| adplug-mad |  | partial |  | browser OK [Mlat Adlib Tracker] rms=0.0125 |
| adplug-mdi |  | partial |  | browser OK [AdLib Visual Composer: MIDIPlay File] rms=0.0239 |
| adplug-mkj | works | partial |  | browser OK [MKJamz Audio File] rms=0.0525 |
| adplug-msc |  | partial |  | browser OK [AdLib MSCplay (version 0)] rms=0.0706 |
| adplug-mtk | works | partial |  | browser OK [MPU-401 Trakker] rms=0.0977 |
| adplug-mtr |  | partial |  | browser OK [Master Tracker (version 2)] rms=0.0941 |
| adplug-pis |  | partial |  | browser OK [Beni Tracker PIS module] rms=0.0238 |
| adplug-plx |  | partial |  | browser OK [PALLADIX Sound System] rms=0.0182 |
| adplug-psi |  | partial |  | XAD sub-format — uses .xad extension |
| adplug-rat |  | partial |  | XAD sub-format — uses .xad extension |
| adplug-raw | works | partial |  | browser OK [Raw AdLib Capture] rms=0.0090 |
| adplug-rix |  | partial |  | browser OK [Softstar RIX OPL Music Format] rms=0.0143 |
| adplug-rol | partial | partial |  | browser OK [AdLib Visual Composer] rms=0.0313 |
| adplug-sa2 | works | partial |  | browser OK [Surprise! Adlib Tracker 2 (version 9)] rms=0.0227 |
| adplug-sat | works | partial |  | browser OK [Surprise! Adlib Tracker 2 (version 1)] rms=0.1287 |
| adplug-sci | partial | partial |  | SCI format works — test file mismatch (ice_thnk.sci exists, kq1 march.sci not found) |
| adplug-sdb |  | partial |  | WASM OK, peak=11577 (HERAD Dune) |
| adplug-sng |  | partial |  | SNG format works — test file case mismatch (SONG1.sng exists) |
| adplug-sqx |  | partial |  | WASM OK, peak=20741 (HERAD KGB) |
| adplug-u6m |  | partial |  | Not a real extension — Ultima 6 uses .m |
| adplug-xad | works | partial |  | browser OK [xad: Domark Player] rms=0.0882 |
| adplug-xms | works | partial |  | browser OK [AMUSIC Adlib Tracker] rms=0.0264 |
| adplug-xsm |  | partial |  | browser OK [eXtra Simple Music] rms=0.0442 |
| anders0land | works | none |  | UADE engine (verified working) - no individual test file |
| audio-sculpt |  | none |  | AudioContext staleness fix (e2d9edf0e). UADE-backed, needs re-test. |
| ay | works | none |  | Parser exists, routing added. No test file available for live audit. |
| ay-amadeus | crashes |  | yes | Load Failed — aztec theme.amad · loadFile failed: aztec theme.amad: ZXAY AMAD (Amadeus) payload. The song is data for a replayer that lived in DeliAY / AY_Emul, not Z80 code, and no available player implements it; only Z |
| ay-strc | crashes | full | yes | Load Failed — mega mix 1.strc · loadFile failed: mega mix 1.strc: ZXAY STRC (structure) payload. The song is data for a replayer that lived in DeliAY / AY_Emul, not Z80 code, and no available player implements it; only Z |
| behringer-td-3 | crashes |  | yes | Load Failed — Acid Pattern 1.seq · loadFile failed: Acid Pattern 1.seq requires user confirmation before loading (format dialog suppressed) · (jukebox 2026-10-07 10:27) |
| ben-daglish |  | incorrect |  | Incorrect Pattern Data — motorhead-titleandingame.bd · (jukebox 2026-09-24 06:46) |
| ben-daglish-sid | works | incorrect | yes | Good — terramex.bds · (jukebox 2026-10-06 14:33) |
| bp-soundmon-2 | works | frozen | yes | Frozen Patterns — nicktune1.bp · (jukebox 2026-10-06 14:33) |
| bp-soundmon-3 |  | incorrect |  | Incorrect Pattern Data — testmod.bp3 · (jukebox 2026-09-24 06:46) |
| cheesecutter |  | incorrect |  | Incorrect Pattern Data — abaddon-trouble.ct · (jukebox 2026-09-24 05:17) |
| composer-670 |  | none | yes | smoke-test FAIL -- silent (rmsAvg=0.000000, rmsMax=0.000000, threshold=0.001) [audio=FAIL, inst=50/ok] (2026-10-05) |
| composer-670-cdfm | crashes |  | yes | Load Failed — black glass ][ - muzik0.670 · loadFile failed: UADE could not play: black glass ][ - muzik0.670 (ret=-1) / uade: [uade-wasm] Companion file written: /uade/bob4.ins (72188 bytes) / [uade-wasm] uade_request_a |
| cpsycle | works | none |  | Psycle modular tracker — Cpsycle WASM (Cpsycle.wasm) |
| custommade |  | incorrect |  | Incorrect Pattern Data — the viking child crack.cm · (jukebox 2026-09-24 06:47) |
| darius-zende |  | none |  | AudioContext staleness fix (e2d9edf0e). UADE-backed, needs re-test. |
| darius-zendeh |  | incorrect |  | Incorrect Pattern Data — crash and burn.dz · (jukebox 2026-09-24 06:47) |
| dave-lowe |  | incorrect |  | Incorrect Pattern Data — incredibleshrinkingsphere.dl · (jukebox 2026-09-24 06:47) |
| dave-lowe-new | crashes | incorrect | yes | Load Failed — m-bison.dln · loadFile failed: UADE could not play: m-bison.dln (Aborted(native code called abort()) RuntimeError: Aborted(native code called abort())     at abort (eval at _init (http://localhost:5174/uade |
| daveLowe | works | none |  | 10/10 |
| david-whittaker |  | incorrect |  | Incorrect Pattern Data — garfield2+.dw · (jukebox 2026-09-24 06:48) |
| deflemask | crashes | full | yes | smoke-test PASS -- rms=0.0516 [audio=ok, inst=4/ok] (2026-10-05) |
| deflemask-0xfroman | silent |  |  | Silent — Product01.dmf · (jukebox 2026-09-24 06:48) |
| deflemask-220hertz | silent |  |  | Silent — Andrew_haggles.dmf · (jukebox 2026-09-24 06:48) |
| deflemask-85NESplayer | silent |  |  | Silent — BA Round 1.dmf · (jukebox 2026-09-24 06:48) |
| deflemask-CrazySoundEnginer-unknown | crashes |  | yes | Load Failed — Midway YM2151 VOPM Collection.zip · loadFile failed: Unsupported file format: Midway YM2151 VOPM Collection.zip · (jukebox 2026-10-06 19:03) |
| deflemask-DevEd-dmf | silent |  | yes | Silent — 7_grand_cop.dmf · (jukebox 2026-10-06 19:05) |
| deflemask-DevEd-unknown | crashes |  | yes | Load Failed — perfume.dmw · loadFile failed: Unsupported file format: perfume.dmw · (jukebox 2026-10-06 19:04) |
| deflemask-MegaSphere-unknown | crashes |  | yes | Load Failed — font.fdm · loadFile failed: Unsupported file format: font.fdm · (jukebox 2026-10-06 19:05) |
| deflemask-Michirin9801 | crashes |  | yes | Load Failed — Asuka 120% - Kumi Theme (Remake).dmf · Missing required params: filename, data (base64) · (jukebox 2026-10-06 17:16) |
| delta-music |  | incorrect |  | Incorrect Pattern Data — triplex1.dm · (jukebox 2026-09-24 06:49) |
| desire | silent | incorrect | yes | smoke-test PASS -- rms=0.0001 [audio=ok, inst=4/ok, export=ok] (2026-10-05) |
| digital-mugician |  | incorrect |  | Incorrect Pattern Data — believe.dmu · (jukebox 2026-09-24 06:50) |
| digital-mugician-2 | silent |  |  | Silent — snickle.mug · (jukebox 2026-09-24 06:50) |
| digital-sonix-and-chrome |  | incorrect |  | Incorrect Pattern Data — dragon'sbreath ingame 1.dsc · (jukebox 2026-09-24 06:50) |
| digital-sonix-and-chrome-David Hanlon | silent | incorrect |  | Incorrect Pattern Data — dragon'sbreath dbfx.dsc · (jukebox 2026-09-24 06:50) |
| digital-symphony |  | incorrect |  | Incorrect Pattern Data — binary reality.dss · (jukebox 2026-09-24 06:50) |
| digital-tracker-dtm | crashes |  |  | Load Failed — sonic subspace.dtm · loadFile failed: AdPlug could not load: sonic subspace.dtm · (jukebox 2026-09-24 06:50) |
| disorder |  | none |  |  |
| dsm | broken | full |  | DSM v1 (RIFF) unsupported upstream — v2 works via libopenmpt |
| earache |  | incorrect |  | Incorrect Pattern Data — bladerunner.ea · (jukebox 2026-09-24 06:51) |
| euphony-Mondschein |  | empty | yes | Empty Patterns — Mondschein.eup · (jukebox 2026-10-06 19:06) |
| eupmini | works | none |  | FM Towns EUP — Eupmini WASM engine (Eupmini.wasm) |
| fashion-tracker |  | incorrect |  | Incorrect Pattern Data — ivory tover ii.ex · (jukebox 2026-09-24 06:51) |
| fmTracker | broken | full |  | Eagleplayer limit — test file 294 bytes, too small for UADE |
| forgotten-worlds | silent | incorrect |  | Incorrect Pattern Data — forgotten worlds intro.fw · (jukebox 2026-09-24 06:52) |
| formats-MusicMaker V8 Old | crashes |  | yes | Load Failed — best of guitars.sdata · loadFile failed: best of guitars.sdata: a MusicMaker song plays from its instruments - add best of guitars.ip (or best of guitars.i) beside it · (jukebox 2026-10-06 14:47) |
| formats-SUNTronicTunes-suntronic |  | incorrect | yes | Incorrect Pattern Data — Bass-test.src · (jukebox 2026-10-06 22:16) |
| formats-SUNTronicTunes-uade_ah | crashes |  | yes | Load Failed — ah · loadFile failed: Unsupported file format: ah · (jukebox 2026-10-02 21:17) |
| formats-SUNTronicTunes-unknown |  | incorrect | yes | Incorrect Pattern Data — Lightforce · (jukebox 2026-10-06 22:03) |
| formats-Scott Johnston-unknown | crashes |  | yes | Load Failed — smp.awesome · loadFile failed: UADE could not play: smp.awesome (ret=-1) / uade: protocol error: receiving in S state is forbidden / uadecore: Invalid input. Expected score name. / [uade-wasm] FATAL: unguar |
| formats-activisionPro |  | incorrect |  | Incorrect Pattern Data — gettysburg.avp · (jukebox 2026-09-24 06:52) |
| formats-adplug | crashes |  |  | Load Failed — astaris.imf · loadFile failed: AdPlug could not load: astaris.imf · (jukebox 2026-09-24 06:52) |
| formats-amiga_formats_catchall | crashes |  | yes | Load Failed — audiosculpture_smallest.adsc · loadFile failed: UADE could not play: audiosculpture_smallest.adsc (ret=-1) / uade: [uade-wasm] Companion file written: /uade/bob4.ins (72188 bytes) / [uade-wasm] uade_request |
| formats-anders0land |  | incorrect |  | Incorrect Pattern Data — hot.primemover_01 · (jukebox 2026-09-24 06:53) |
| formats-ashleyHogg |  | incorrect |  | Incorrect Pattern Data — ash.nobby_the_aardvark · (jukebox 2026-09-24 06:54) |
| formats-benDaglish | silent |  |  | Silent — mickey_mouse.bd · (jukebox 2026-09-24 06:54) |
| formats-benDaglishSID |  | incorrect |  | Incorrect Pattern Data — terramex.bds · (jukebox 2026-09-24 06:54) |
| formats-cdfm67 | crashes |  |  | Load Failed — amnesia_credits.c67 · loadFile failed: UADE could not play: amnesia_credits.c67 (ret=-1) / uade: protocol error: receiving in S state is forbidden / uadecore: Invalid input. Expected score name. / [uade-was |
| formats-coreDesign |  | incorrect |  | Incorrect Pattern Data — dynamite_dux.core · (jukebox 2026-09-24 08:02) |
| formats-daveLowe |  | incorrect |  | Incorrect Pattern Data — incredibleshrinkingsphere.dl · (jukebox 2026-09-24 08:04) |
| formats-davidWhittaker |  | incorrect |  | Incorrect Pattern Data — apb.dw · (jukebox 2026-09-24 08:04) |
| formats-deltaMusic1 | partial |  |  | Wrong Sound — crusaders1.dm · (jukebox 2026-09-24 08:05) |
| formats-desire | silent |  |  | Silent — batmanreturns.dsr · (jukebox 2026-09-24 08:06) |
| formats-digitalSonixChrome |  | incorrect |  | Incorrect Pattern Data — dragon'sbreath_fanfares.dsc · (jukebox 2026-09-24 08:06) |
| formats-digitalSoundStudio |  | incorrect |  | Incorrect Pattern Data — doxtro3.dss · (jukebox 2026-09-24 08:06) |
| formats-earAche |  | incorrect |  | Incorrect Pattern Data — skythebest.ea · (jukebox 2026-09-24 08:07) |
| formats-fc |  | incorrect |  | Incorrect Pattern Data — adept.smod · (jukebox 2026-09-24 08:08) |
| formats-fred |  | incorrect | yes | Incorrect Pattern Data — bomb jack.fred · (jukebox 2026-09-24 08:08) |
| formats-fredGray |  | incorrect |  | Incorrect Pattern Data — eco.gray · (jukebox 2026-09-24 08:08) |
| formats-futurePlayer |  | incorrect |  | Incorrect Pattern Data — hybris.fp · (jukebox 2026-09-24 08:08) |
| formats-gluemon |  | incorrect |  | Incorrect Pattern Data — memphis.glue · (jukebox 2026-09-24 08:10) |
| formats-hippelCoso | silent |  |  | Silent — prehistoric_tale.hipc · (jukebox 2026-09-24 08:10) |
| formats-iffSmus | silent |  |  | Silent — radiokomppi.smus · (jukebox 2026-09-24 08:10) |
| formats-imagoOrpheus | silent |  | yes | Silent — astaris.imf · (jukebox 2026-10-06 19:06) |
| formats-inStereoAmbiguous |  | incorrect |  | Incorrect Pattern Data — fantasi8.is · (jukebox 2026-09-25 10:19) |
| formats-jamcracker | works | incorrect | yes | Good — analogue_vibes.jam · (jukebox 2026-10-02 20:45) |
| formats-jankoMrsicFlogel |  | empty | yes | Empty Patterns — spacestation.jmf · (jukebox 2026-10-02 20:45) |
| formats-jasonBrooke |  | incorrect | yes | Incorrect Pattern Data — ikari_warriors.jb · (jukebox 2026-10-02 20:46) |
| formats-jasonPage | crashes | incorrect | yes | Load Failed — jpn.virocop-14 · loadFile failed: UADE could not play: jpn.virocop-14 (ret=-1) / uade: Warning: Supervisor stack may have been breached. / Warning: User stack may have been breached possibly by the supervis |
| formats-jeroenTel |  | incorrect | yes | Incorrect Pattern Data — insects_in_space.jt · (jukebox 2026-10-02 20:46) |
| formats-jesperOlsen | crashes | incorrect | yes | Load Failed — lollypop-subgame_01.jo · loadFile failed: UADE could not play: lollypop-subgame_01.jo (ret=-1) / uade: [uade-wasm] uade_request_amiga_file: file not found '/uade/WantedTeam.bin' / uade warning: Song ended p |
| formats-jochenHippelST | silent |  | yes | Silent — astaroth.sog · (jukebox 2026-10-02 20:47) |
| formats-karlMorton | crashes |  | yes | Load Failed — boogie.mus · loadFile failed: UADE could not play: boogie.mus (ret=-1) / uade: Warning: Supervisor stack may have been breached. / Warning: User stack may have been breached possibly by the supervisor stack |
| formats-krisHatlelid | silent |  | yes | Silent — hatlelid_smallest.kh · (jukebox 2026-10-02 20:47) |
| formats-mugician |  | incorrect | yes | Incorrect Pattern Data — cockwise.mug · (jukebox 2026-10-06 19:01) |
| formats-musicAssembler |  | incorrect | yes | Incorrect Pattern Data — baseheads.ma · (jukebox 2026-10-06 21:53) |
| formats-musicLine | silent | empty | yes | Frozen Patterns — harmonic disorder.ml · (jukebox 2026-10-06 21:53) |
| formats-organya | silent | empty | yes | Empty Patterns — cave_story_-_42_-_xxxx.org · (jukebox 2026-10-06 21:54) |
| formats-paulRobotham | silent | empty | yes | Empty Patterns — dawnpatrol-sad.dat · (jukebox 2026-10-06 21:54) |
| formats-paulShields |  | empty | yes | Empty Patterns — jug-hiscore.ps · (jukebox 2026-10-06 21:54) |
| formats-robHubbard |  | incorrect | yes | Incorrect Pattern Data — centurion_battle.rh · (jukebox 2026-10-02 21:13) |
| formats-ronKlaren |  | incorrect | yes | Incorrect Pattern Data — astra_2.rk · (jukebox 2026-10-02 21:13) |
| formats-sawteeth |  | incorrect | yes | Missing Notes — okolaNUKE.st · (jukebox 2026-10-06 21:57) |
| formats-seanConnolly |  | empty | yes | Empty Patterns — surf_ninjas.scn · (jukebox 2026-10-02 21:14) |
| formats-sidmon2 |  | out-of-sync | yes | Out Of Sync — bruno_time.sid2 · (jukebox 2026-10-06 21:58) |
| formats-sonicArranger |  | incorrect | yes | Incorrect Pattern Data — almighty.sa · (jukebox 2026-10-02 21:15) |
| formats-soundControl |  | incorrect | yes | Incorrect Pattern Data — north_sea_inferno.sc · (jukebox 2026-10-02 21:15) |
| formats-soundFactory |  | out-of-sync | yes | Out Of Sync — goldrunner.psf · (jukebox 2026-10-02 21:15) |
| formats-soundMaster |  | incorrect | yes | Incorrect Pattern Data — rackney'sisland_4.sm · (jukebox 2026-10-02 21:16) |
| formats-soundfx |  | incorrect | yes | Incorrect Pattern Data — operation_stealth.sfx · (jukebox 2026-10-02 21:16) |
| formats-speedySystem | crashes |  | yes | Load Failed — SnareDrum.ss · loadFile failed: UADE could not play: SnareDrum.ss (ret=-1) / uade: Warning: Supervisor stack may have been breached. / Warning: User stack may have been breached possibly by the supervisor s |
| formats-steveTurner |  | empty | yes | Empty Patterns — offroad.jpo · (jukebox 2026-10-02 21:17) |
| formats-suntronic |  | empty | yes | Empty Patterns — msx-cracktro 2.sun · (jukebox 2026-10-02 21:17) |
| formats-synthPack | crashes |  | yes | Load Failed — centerbase_soft.osp · loadFile failed: UADE could not play: centerbase_soft.osp (ret=-1) / uade: Warning: Supervisor stack may have been breached. / Warning: User stack may have been breached possibly by th |
| formats-synthesis |  | empty |  | Empty Patterns — space_sound.syn · (jukebox 2026-09-23 23:55) |
| formats-tcbTracker | silent |  | yes | Wrong Channel Meters — cannonfodder.tcb · (jukebox 2026-10-06 22:16) |
| formats-tfmx | silent |  | yes | Silent — mdat.rocknroll · (jukebox 2026-10-02 21:18) |
| formats-tme |  | empty | yes | Empty Patterns — 64_conversion.tme · (jukebox 2026-10-02 21:18) |
| formats-tomyTracker |  | incorrect | yes | Incorrect Pattern Data — irrepressible intro.sg · (jukebox 2026-10-02 21:19) |
| formats-uade_ast |  | incorrect |  | Incorrect Pattern Data — dynablaster.ast · (jukebox 2026-09-24 06:52) |
| formats-uade_bss |  | incorrect |  | Incorrect Pattern Data — beathoven_smallest.bss · (jukebox 2026-09-24 06:54) |
| formats-uade_cus | crashes | incorrect | yes | Load Failed — skyfox.cus · loadFile failed: UADE could not play: skyfox.cus (ret=-1) / uade: Warning: Supervisor stack may have been breached. / Warning: User stack may have been breached possibly by the supervisor stack |
| formats-uade_dh |  | incorrect |  | Incorrect Pattern Data — tearaway_thomas.dh · (jukebox 2026-09-24 08:04) |
| formats-uade_nt | crashes |  | yes | Load Failed — shortsong1.mod.nt · loadFile failed: UADE could not play: shortsong1.mod.nt (ret=-1) / uade: Warning: Supervisor stack may have been breached. / Warning: User stack may have been breached possibly by the su |
| formats-uade_sdr | crashes |  | yes | Load Failed — sdr.monsterbusiness_5 · loadFile failed: UADE could not play: sdr.monsterbusiness_5 (ret=-1) / uade: [uade-wasm] uade_request_amiga_file: file not found '/uade/SMP.monsterbusiness_5' / [uade-wasm] uade_requ |
| formats-uade_tf |  | incorrect | yes | Incorrect Pattern Data — follin_smallest.tf · (jukebox 2026-10-02 21:18) |
| formats-wallyBeben |  | incorrect | yes | Incorrect Pattern Data — wicked.wb · (jukebox 2026-10-02 21:19) |
| fred-gray |  | empty | yes | Empty Patterns — eco.gray · (jukebox 2026-10-02 21:19) |
| fredmon |  | incorrect | yes | Incorrect Pattern Data — fireworks ii.fred · (jukebox 2026-10-02 21:20) |
| furnace-msx |  | empty | yes | Empty Patterns — 2024 BOTB MSX-MUSIC GRINDCORE LIVE ON STAGE (MSX-MUSIC).fur · (jukebox 2026-10-07 12:26) |
| furnace-nes | crashes |  | yes | Load Failed — Byte-Sized Bop.fur · Failed to fetch · (jukebox 2026-10-07 12:26) |
| furnace-pc98 |  | incorrect | yes | Incorrect Pattern Data — Blue_Nebula.fur · (jukebox 2026-10-07 12:25) |
| furnace-pce | partial |  | yes | Wrong Sound — Contest thing 2025.fur · (jukebox 2026-10-07 12:25) |
| furnace-vic20 | partial |  | yes | Wrong Sound — BlueBolt.fur · (jukebox 2026-10-08 19:55) |
| furnace-virtualboy | partial |  | yes | Wrong Sound — 4_dimensionnal_goddess_of_existance.fur · (jukebox 2026-10-07 12:23) |
| furnace-wonderswan |  | out-of-sync | yes | Out Of Sync — Bullet_Hell.fur · (jukebox 2026-10-07 12:23) |
| furnace-ymz280b |  | empty | yes | Empty Patterns — evilevilsong.fur · (jukebox 2026-10-07 12:23) |
| future-composer-1.3 |  | out-of-sync | yes | Out Of Sync — commando.smod · (jukebox 2026-10-02 21:22) |
| future-composer-bsi |  | empty | yes | Empty Patterns — newtek.bsi · (jukebox 2026-10-02 21:22) |
| future-player |  | incorrect | yes | Incorrect Pattern Data — imploder drums.fp · (jukebox 2026-10-02 21:22) |
| gbs | works | none |  | Parser exists, routing added. No test file available for live audit. |
| general-digimusic | partial |  | yes | Wrong Sound — tilbury fair (remix).gdm · (jukebox 2026-10-02 21:23) |
| gluemon |  | incorrect | yes | Incorrect Pattern Data — gnu-song.glue · (jukebox 2026-10-02 21:23) |
| hes | works | none |  | Live audit: rms=0.0037 mode=classic. PC Engine HuC6280 emulation. |
| hippel |  | incorrect | yes | Incorrect Pattern Data — warp (ingame 2).hip · (jukebox 2026-10-02 21:25) |
| hippel-7v |  | incorrect | yes | Incorrect Pattern Data — lethalxcess-intro.hip7 · (jukebox 2026-10-02 21:25) |
| hippel-st |  | incorrect | yes | Incorrect Pattern Data — crown arabia.hst · (jukebox 2026-10-06 21:33) |
| hippel-st-coso | silent |  | yes | Silent — ghostbattle titletune.soc · (jukebox 2026-10-02 21:26) |
| iff-smus |  | none |  | UADE limitation — format not supported. All test files silent. |
| iff-smus-- unknown-speedySystem | crashes |  | yes | Load Failed — Saxophone.ss · loadFile failed: UADE could not play: Saxophone.ss (ret=-1) / uade: protocol error: receiving in S state is forbidden / uadecore: Invalid input. Expected score name. / [uade-wasm] FATAL: ungu |
| iff-smus-- unknown-unknown | crashes |  | yes | Load Failed — Sax.42.instr · loadFile failed: Unsupported file format: Sax.42.instr · (jukebox 2026-10-02 21:27) |
| iff-smus-Allister Brimble-speedySystem | crashes |  | yes | Load Failed — deeptrumpet1.ss · loadFile failed: UADE could not play: deeptrumpet1.ss (ret=-1) / uade: uade warning: Song ended prematurely due to error: module check failed / protocol error: receiving in S state is forb |
| iff-smus-Allister Brimble-unknown | crashes |  | yes | Load Failed — Ace2-2.instr · loadFile failed: Unsupported file format: Ace2-2.instr · (jukebox 2026-10-02 21:27) |
| iff-smus-Andreas Starr-iffSmus | silent |  | yes | Silent — Electric Dream.smus · (jukebox 2026-10-02 21:27) |
| images-music-system | partial | incorrect | yes | Incorrect Pattern Data — chip5.ims · (jukebox 2026-10-04 21:09) |
| infogrames-amiga_formats_catchall | crashes |  | yes | Load Failed — advantage tennis-intro.ins · loadFile failed: UADE could not play: advantage tennis-intro.ins (ret=-1) / uade: [uade-wasm] Companion file written: /uade/advantage tennis-intro.dum (2627 bytes) / [uade-wasm] |
| infogrames-infogrames |  | incorrect | yes | Incorrect Pattern Data — advantage tennis-intro.dum · (jukebox 2026-10-02 21:27) |
| instereo!-2.0 |  | incorrect | yes | Incorrect Pattern Data — spaceflight.is20 · (jukebox 2026-10-02 21:28) |
| ixalance | works | none |  | IXalance — dedicated WASM engine (Ixalance.wasm) |
| klystrack |  | out-of-sync | yes | Incorrect Pattern Data — Ocean Loader III.kt · (jukebox 2026-10-06 22:10) |
| kss | partial | none |  | KSS loads and plays briefly — MSX WASM engine timeout, known limitation |
| maniacs-of-n |  | none |  | AudioContext staleness fix (e2d9edf0e). UADE-backed, needs re-test. |
| maximumEffect | broken | full |  | Eagleplayer limit — UADE ret=-1 even with SMP companion |
| maxtrax | crashes |  | yes | Load Failed — antmusic.mxtx · (jukebox 2026-10-08 19:54) |
| mdx | works | none |  | Live audit: rms=2.1220 mode=classic. X68000 YM2151 FM via Furnace. |
| modland-aProSys | crashes |  | yes | Load Failed — A-Pro-Sys  (Modland) · (jukebox 2026-10-08 19:52) |
| modland-adpcmMono | crashes |  | yes | Load Failed — ADPCM Mono  (Modland) · (jukebox 2026-10-06 22:13) |
| modland-adplug | crashes |  | yes | Load Failed — AdPlug  (Modland) · (jukebox 2026-10-08 19:52) |
| modland-alcatrazPacker | crashes |  | yes | Load Failed — Alcatraz Packer  (Modland) · (jukebox 2026-10-08 19:52) |
| modland-amosMusicBank | crashes |  | yes | Load Failed — AMOS Music Bank  (Modland) · (jukebox 2026-10-08 19:52) |
| modland-andrewParton |  | out-of-sync | yes | Out Of Sync — civilization - alexander.mmd0 · (jukebox 2026-10-08 19:23) |
| modland-asap-native |  | empty | yes | Empty Patterns — Fantasy Zone - Prome.OPI · (jukebox 2026-10-08 19:24) |
| modland-bladePacker | crashes |  | yes | Load Failed — Blade Packer  (Modland) · (jukebox 2026-10-08 19:52) |
| modland-cinemaware | crashes |  | yes | Load Failed — Cinemaware  (Modland) · (jukebox 2026-10-08 19:52) |
| modland-cinter4 | crashes |  | yes | Load Failed — Cinter4  (Modland) · (jukebox 2026-10-08 19:52) |
| modland-cpsycle |  | empty | yes | Empty Patterns — chipzik (psyclefest 06).psy · (jukebox 2026-10-08 19:34) |
| modland-dsm | crashes |  | yes | Load Failed — DSIK Sound Module  (Modland) · (jukebox 2026-10-08 19:51) |
| modland-fmp | crashes |  | yes | Load Failed — FMP (PLAY6)  (Modland) · (jukebox 2026-10-08 19:49) |
| modland-iceTracker | crashes |  | yes | Load Failed — IceTracker  (Modland) · (jukebox 2026-10-08 19:47) |
| modland-inStereo1 | crashes |  | yes | Load Failed — InStereo! 1  (Modland) · (jukebox 2026-10-08 19:46) |
| modland-ixalance |  | empty | yes | Empty Patterns — andes.ixs · (jukebox 2026-10-08 19:44) |
| modland-janneSalmijarvi | crashes |  | yes | Load Failed — Janne Salmijärvi  (Modland) · (jukebox 2026-10-08 19:44) |
| modland-kris | crashes |  | yes | Load Failed —  ChipTracker  (Modland) · (jukebox 2026-10-08 19:44) |
| modland-laxity | silent | empty | yes | Empty Patterns — church organ.dss · (jukebox 2026-10-08 19:43) |
| modland-magneticFieldsPacker |  | out-of-sync | yes | Wrong Channel Meters — mfp.crystaldragon ingame · (jukebox 2026-10-08 19:43) |
| modland-maximumEffect | crashes |  | yes | Load Failed — SMP.set · UADE could not play: SMP.set (ret=-1) / uade: Warning: Supervisor stack may have been breached. / Warning: User stack may have been breached possibly by the supervisor stack. / [uade-wasm] Cannot  |
| modland-mo3 | crashes |  | yes | Load Failed — MO3 Compressed  (Modland) · (jukebox 2026-10-08 19:40) |
| modland-moshPacker | crashes |  | yes | Load Failed — Mosh Packer  (Modland) · (jukebox 2026-10-08 19:40) |
| modland-nickPellingPacker | crashes |  | yes | Load Failed — Nick Pelling Packer  (Modland) · (jukebox 2026-10-08 19:40) |
| modland-peterVerswyvelenPacker | crashes |  | yes | Load Failed — Peter Verswyvelen Packer  (Modland) · (jukebox 2026-10-08 19:38) |
| modland-pierreAdane | crashes |  | yes | Load Failed — smp.set · UADE could not play: smp.set (ret=-1) / uade: Illegal instruction: 4afc at 00001344 / Warning: Supervisor stack may have been breached. / Warning: User stack may have been breached possibly by the |
| modland-pmd | silent | empty | yes | Empty Patterns — ah01.m · (jukebox 2026-10-08 19:35) |
| modland-thomasHermann | crashes |  | yes | Load Failed — smp.blueangel69 · UADE could not play: smp.blueangel69 (ret=-1) / uade: [uade-wasm] Companion file written: /uade/thm.blueangel69 (11792 bytes) / [uade-wasm] Cannot play file: smp.blueangel69 (ret=0) / /uad |
| modland-titanicsPacker | crashes |  | yes | Load Failed — Titanic's Packer  (Modland) · (jukebox 2026-10-08 19:28) |
| modland-uade_agi | crashes |  | yes | Load Failed — Sierra AGI  (Modland) · (jukebox 2026-10-08 19:30) |
| modland-uade_bfc | crashes |  | yes | Load Failed — FutureComposer-BSI  (Modland) · (jukebox 2026-10-08 19:48) |
| modland-uade_bsi | silent | empty | yes | Empty Patterns — newtek.bsi · (jukebox 2026-10-08 19:15) |
| modland-uade_bvs | crashes |  | yes | Load Failed — Beathoven Synthesizer v2  (Modland) · (jukebox 2026-10-08 19:52) |
| modland-uade_cba | crashes |  | yes | Load Failed — ChipTracker Archive  (Modland) · (jukebox 2026-10-08 19:52) |
| modland-uade_dlw | crashes |  | yes | Load Failed — Dave Lowe WTD  (Modland) · (jukebox 2026-10-08 19:51) |
| modland-uade_emsv6 | partial |  | yes | Wrong Sound — perception.ems · (jukebox 2026-10-08 19:49) |
| modland-uade_fc_bsi | crashes |  | yes | Load Failed — FC-BSI  (Modland) · (jukebox 2026-10-08 19:49) |
| modland-uade_fredmon | crashes |  | yes | Load Failed — Fred Editor Monitor  (Modland) · (jukebox 2026-10-08 19:48) |
| modland-uade_fw | silent |  | yes | Silent — forgotten worlds intro2.fw · (jukebox 2026-10-08 19:49) |
| modland-uade_hn | partial |  | yes | Wrong Sound — hnn.it · (jukebox 2026-10-08 19:48) |
| modland-uade_mg | crashes |  | yes | Load Failed — Star.MGS · UADE could not play: Star.MGS (ret=-1) / uade: Warning: Supervisor stack may have been breached. / Warning: User stack may have been breached possibly by the supervisor stack. / Warning: Supervis |
| modland-uade_mtp2 | crashes |  | yes | Load Failed — MajorTom 2  (Modland) · (jukebox 2026-10-08 19:43) |
| modland-uade_ntsp | crashes |  | yes | Load Failed — NTSP  (Modland) · (jukebox 2026-10-08 19:39) |
| modland-uade_rkl |  | incorrect | yes | Incorrect Pattern Data — electricity.rk · (jukebox 2026-10-08 19:33) |
| modland-uade_sa_old | crashes |  | yes | Load Failed — Sonic Arranger Old  (Modland) · (jukebox 2026-10-08 19:29) |
| modland-uade_sa_p | partial |  | yes | Wrong Sound — panicaco.sa · (jukebox 2026-10-08 19:29) |
| modland-uade_sil | crashes |  | yes | Load Failed — Silmarils v2  (Modland) · (jukebox 2026-10-08 19:30) |
| modland-uade_sog | crashes |  | yes | Load Failed — sog.xm · UADE could not play: sog.xm (ret=-1) / uade: Warning: Supervisor stack may have been breached. / Warning: User stack may have been breached possibly by the supervisor stack. / Warning: Supervisor s |
| modland-uade_st | crashes |  | yes | Load Failed — SoundTracker prefix  (Modland) · (jukebox 2026-10-08 19:28) |
| modland-uade_sun | crashes |  | yes | Load Failed — SUN-Tronic  (Modland) · (jukebox 2026-10-08 19:28) |
| modland-uade_tfhd1_5 | crashes |  | yes | Load Failed — TFMX HD 1.5  (Modland) · (jukebox 2026-10-08 19:28) |
| modland-uade_tfhd7v | crashes |  | yes | Load Failed — TFMX HD 7V  (Modland) · (jukebox 2026-10-08 19:28) |
| modland-uade_tfhdpro | crashes |  | yes | Load Failed — TFMX HD Pro  (Modland) · (jukebox 2026-10-08 19:28) |
| modland-uade_tfmx1_5 | crashes |  | yes | Load Failed — TFMX 1.5  (Modland) · (jukebox 2026-10-08 19:28) |
| modland-uade_tfmx7v | crashes |  | yes | Load Failed — TFMX 7V  (Modland) · (jukebox 2026-10-08 19:28) |
| modland-uade_tfmxpro | crashes |  | yes | Load Failed — TFMX Pro  (Modland) · (jukebox 2026-10-08 19:28) |
| modland-uade_thx | crashes |  | yes | Load Failed — THX prefix  (Modland) · (jukebox 2026-10-08 19:52) |
| modland-uade_tomy | crashes |  | yes | Load Failed — TomyTracker  (Modland) · (jukebox 2026-10-08 19:28) |
| modland-ufo | crashes |  | yes | Load Failed — ufo.bbsong · UADE could not play: ufo.bbsong (ret=-1) / uade: Warning: Supervisor stack may have been breached. / Warning: User stack may have been breached possibly by the supervisor stack. / uade warning: |
| modland-wow | crashes |  | yes | Load Failed — Mod's Grave WOW  (Modland) · (jukebox 2026-10-08 19:40) |
| modland-zxtune | crashes |  | yes | Load Failed — ZXTune  (Modland) · (jukebox 2026-10-08 19:28) |
| multimedia-sound |  | empty | yes | Empty Patterns — bottle popper.mms · (jukebox 2026-10-02 21:28) |
| musicmaker-v8 |  | incorrect | yes | Incorrect Pattern Data — roetzmegoem.mm8 · (jukebox 2026-10-02 21:29) |
| musicmaker-v8-old | crashes |  | yes | Load Failed — moveback.ip.n · loadFile failed: Unsupported file format: moveback.ip.n · (jukebox 2026-10-02 21:29) |
| nsf | works | none |  | Live audit: rms=1.4394 mode=classic. Furnace NES chip emulation. |
| octamed-mmd3 |  | none |  | UADE limitation — only 1 test file, ret=-1. |
| organya | works | none |  | Double-routing fixed (cc81c3a73). Removed uadeEditableFileData from parser. |
| packed_etc | crashes |  | yes | Load Failed — gift of gods.p40a · (jukebox 2026-10-08 19:54) |
| peterVerswyvelenPacker | works | none |  | UADE engine (verified working) - no individual test file |
| piston-colla |  | none |  | LibopenmptEngine worklet error — likely AudioContext staleness (fixed e2d9edf0e). Needs re-test. |
| piston-collage |  | empty | yes | Empty Patterns — obj1263-1.ptcop · (jukebox 2026-10-06 22:17) |
| pollytracker |  | none |  | Timeout in smoke test — transient MCP issue, not a format bug. |
| pxtone | works | none |  | PxTone music tool — Pxtone WASM (Pxtone.wasm) |
| quartet | broken | full |  | Eagleplayer limit — UADE ret=-1, PCM playback not supported |
| riff-raff |  | none |  | UADE reload fixed (2df046105 poisoned-instance self-healing). Needs re-test. |
| robHubbardST | works | none |  | UADE engine (verified working) - no individual test file |
| s98 | works | none |  | Live audit: rms=0.0028 mode=classic. FM register dump playback. |
| sawteeth | works | none |  | UADE limitation — only 1 test file (okolaNUKE.st), ret=-1. |
| sc68 | silent | none | yes | smoke-test FAIL -- pattern 0 has no note cells after 3s (load decoded but pattern data is empty) [] (2026-10-05) |
| sean-connoll |  | none |  | UADE reload fixed (2df046105 poisoned-instance self-healing). Needs re-test. |
| sean-connolly |  | empty | yes | Empty Patterns — surf ninjas.scn · (jukebox 2026-10-02 21:30) |
| sean-conran |  | empty | yes | Empty Patterns — count duckula.scr · (jukebox 2026-10-02 21:30) |
| sid-factory-2 |  | out-of-sync | yes | Out Of Sync — Driver 11 Test - Filter.sf2 · (jukebox 2026-10-08 19:54) |
| silmarils |  | none |  | smoke-test PASS -- rms=0.0744 [audio=ok, inst=39/ok, export=ok] (2026-04-11) |
| sndh | works | none |  | Live audit: rms=0.9811. SNDH routed to parser (ICE-packed files detected). |
| sonix | crashes |  | yes | Load Failed — smusinfo · loadFile failed: Unsupported file format: smusinfo · (jukebox 2026-10-06 21:38) |
| sonix-miscellaneous-unknown | crashes |  | yes | Load Failed — amiga.kybd · loadFile failed: Unsupported file format: amiga.kybd · (jukebox 2026-10-06 21:38) |
| sonix-tools | crashes |  | yes | Load Failed — makecopy · loadFile failed: Unsupported file format: makecopy · (jukebox 2026-10-06 21:38) |
| spc | works | none |  | Parser exists, routing added. No test file available for live audit. |
| specialFX | works | none |  | 10/10 |
| speedySystem | works | none |  | UADE engine (verified working) - no individual test file |
| startrekker-am | crashes |  | yes | Load Failed — silent sleep.mod.nt · loadFile failed: UADE could not play: silent sleep.mod.nt (ret=-1) / uade: Warning: Supervisor stack may have been breached. / Warning: User stack may have been breached possibly by th |
| steve-barrett |  | empty | yes | Empty Patterns — street fighter.sb · (jukebox 2026-10-04 21:05) |
| stonetracker | crashes | none | yes | Load Failed — hypnosphere.spm · loadFile failed: Unsupported file format: hypnosphere.spm · (jukebox 2026-10-04 21:05) |
| studio-pixel---piyopiyo | silent |  | yes | Silent — obj0176-1.pmd · (jukebox 2026-10-04 21:05) |
| suntronic | crashes | full | yes | Load Failed — pseudo oops.sun · loadFile failed: UADE could not play: pseudo oops.sun (ret=-1) / uade: Warning: Supervisor stack may have been breached. / Warning: User stack may have been breached possibly by the superv |
| sunvox | crashes |  | yes | Load Failed — last blow.sunvox · (jukebox 2026-10-06 22:18) |
| symphonie |  | empty | yes | Empty Patterns — pas 2 jade.symmod · (jukebox 2026-10-06 22:18) |
| syntracker |  | frozen | yes | Frozen Patterns — autumn melodies.synmod · (jukebox 2026-10-04 21:06) |
| tcb-tracker |  | incorrect | yes | Incorrect Pattern Data — m-demo3 3.tcb · (jukebox 2026-10-04 21:07) |
| tfm-music-maker | crashes |  | yes | Load Failed — rainstorm.tfe · loadFile failed: Unsupported file format: rainstorm.tfe · (jukebox 2026-10-04 21:07) |
| tme | works | none |  | ch=4 pat=1 rms=0.0465 (thm+smp companion) |
| tss | crashes |  | yes | Load Failed — salamander boss.tss · (jukebox 2026-10-08 19:54) |
| vgm | works | none |  | Live audit: rms=1.7954 mode=classic. VGZ gzip decompression + Furnace chip emulation. |
| vgz |  | none |  |  |
| wally-beben |  | none |  | AudioContext staleness fix (e2d9edf0e). UADE-backed, needs re-test. |
| wavesabre | partial |  | yes | Wrong Sound — wavesabre-punqtured.xrns · (jukebox 2026-10-08 19:53) |
| xrns | broken | full |  | Renoise XML format — needs dedicated native parser, out of scope for chip audit |
| ym | broken | none |  | Added LHA archive unwrapping — .ym files now load correctly |
| zoundmonitor |  | none |  | AudioContext staleness fix (e2d9edf0e). UADE-backed, needs re-test. |
| zxtune | works | none |  | ZX Spectrum trackers — ZXTune WASM (Zxtune.wasm) |
