/**
 * fixtures.map.ts — REAL committed song fixtures for the encoder round-trip harness.
 *
 * Each entry maps a layout formatId (the id a parser attaches to song.uadePatternLayout /
 * song.uadeVariableLayout) to a committed fixture under public/data/songs/. Populated
 * empirically: every path here was parsed via FormatRegistry detection + its native parser
 * and confirmed to produce a layout with the given formatId (measurement, not guesswork).
 *
 * House rule: real songs only, and only files tracked by git (untracked local songs fail
 * in CI). Where a registered encoder has no fixture that yields its layout, it is reported
 * by the harness as unexercised (see encoderRoundtrip.ratchet.json) rather than listed here.
 *
 * kind: 'fixed'    = per-cell layout (UADEPatternLayout, encodeCell/decodeCell)
 *       'variable' = whole-pattern layout (UADEVariablePatternLayout, encoder.encodePattern)
 */

export interface EncoderFixture {
  /** Layout formatId attached by the parser (song.uadePatternLayout|uadeVariableLayout). */
  formatId: string;
  /** Path relative to repo root of a committed real fixture. */
  fixture: string;
  /** Which layout kind the parser attaches for this fixture. */
  kind: 'fixed' | 'variable';
  /**
   * Optional explicit parser override for fixtures whose extension resolves to a
   * DISPATCHER in FormatRegistry rather than their own parser. Example: `.snx`/`.tiny`
   * share the `iffSmus` registry entry (parseFn `parseIffSmusFile`, which only handles
   * the FORM/SMUS sub-format); the real app routes binary SNX to `parseSonixFile`
   * (SonixMusicDriverParser) via customDispatch. This override names that real parser so
   * the harness measures the same codec the app uses — it points at existing app code,
   * it does not duplicate routing logic.
   */
  parser?: { module: string; parseFn: string };
}

export const ENCODER_FIXTURES: EncoderFixture[] = [
  // activisionPro left the harness: since 8c7aedfa0 its grid is the replayer's event stream and
  // cell edits are written into the event bytes by the module model, not by a UADE cell layout.
  { formatId: "aProSys", fixture: "public/data/songs/AProSys/action.aps", kind: "fixed" },
  { formatId: "peterVerswyvelenPacker", fixture: "public/data/songs/peter-verswyvelen/zarathrusta title.pvp", kind: "fixed" },
  { formatId: "dariusZendeh", fixture: "public/data/songs/darius-zendeh/crash and burn.dz", kind: "fixed", parser: { module: "@lib/import/formats/DariusZendehParser", parseFn: "parseDariusZendehFile" } },
  { formatId: "tronic", fixture: "public/data/songs/tronic/crystal.dp", kind: "fixed" },
  { formatId: "artOfNoise", fixture: "public/data/songs/art-of-noise/inside.blipp.aon", kind: "fixed" },
  { formatId: "artAndMagic", fixture: "public/data/songs/art-and-magic/agony-level1.aam", kind: "variable" },
  { formatId: "lme", fixture: "public/data/songs/leggless-music-editor/the punisher gameover.lme", kind: "fixed" },
  { formatId: "ams", fixture: "public/data/songs/velvet-studio/kernel.ams", kind: "variable" },
  { formatId: "ashleyHogg", fixture: "public/data/songs/ashley-hogg/ash.nobby the aardvark", kind: "variable" },
  { formatId: "krisHatlelid", fixture: "public/data/songs/kris-hatlelid/fiendish freddys - songs.kh", kind: "variable" },
  { formatId: "deltaMusic2", fixture: "public/data/songs/delta-music-2/asperity megademo 3.dm2", kind: "fixed" },
  { formatId: "digiBoosterPro", fixture: "public/data/songs/digibooster-pro/invisibility.dbm", kind: "variable" },
  { formatId: "graoumfTracker2_gt2", fixture: "public/data/songs/graoumf-tracker-2/living-on-video.gt2", kind: "fixed" },
  { formatId: "inStereo2", fixture: "public/data/songs/instereo!-2.0/spaceflight.is20", kind: "fixed" },
  { formatId: "medley", fixture: "public/data/songs/medley/combat.mso", kind: "variable", parser: { module: "@lib/import/formats/MedleyParser", parseFn: "parseMedleyFile" } },
  { formatId: "mikeDavies", fixture: "public/data/songs/mike-davies/strider.md", kind: "variable" },
  { formatId: "musicAssembler", fixture: "public/data/songs/music-assembler/thanatos.ma", kind: "variable" },
  { formatId: "ronKlaren", fixture: "public/data/songs/ron-klaren/astra 2.rk", kind: "fixed" },
  { formatId: "sonixMusicDriver", fixture: "public/data/songs/sonix/snx/A-10 Tank Killer/winning.snx", kind: "variable", parser: { module: "@lib/import/formats/SonixMusicDriverParser", parseFn: "parseSonixFile" } },
  { formatId: "sonixMusicDriverTiny", fixture: "public/data/songs/sonix/tiny/It Came From The Desert/maintitle.tiny", kind: "variable", parser: { module: "@lib/import/formats/SonixMusicDriverParser", parseFn: "parseSonixFile" } },
  { formatId: "soundControl", fixture: "public/data/songs/soundcontrol/north sea inferno ongame1.sc", kind: "fixed" },
  { formatId: "soundFactory", fixture: "public/data/songs/soundfactory/im maien.psf", kind: "fixed" },
  { formatId: "symphoniePro", fixture: "public/data/songs/symphonie/pas 2 jade.symmod", kind: "fixed" },
  { formatId: "synthesis", fixture: "public/data/songs/synthesis/space sound.syn", kind: "fixed" },
  { formatId: "benDaglish", fixture: "public/data/songs/ben-daglish/motorhead-titleandingame.bd", kind: "variable" },
  { formatId: "coreDesign", fixture: "public/data/songs/core-design/dynamite dux.core", kind: "fixed" },
  { formatId: "anders0land", fixture: "public/data/songs/anders-oland/primemover 07.hot", kind: "fixed" },
  { formatId: "customMade", fixture: "public/data/songs/custommade/cm.viking_child", kind: "fixed" },
  { formatId: "daveLowe", fixture: "public/data/songs/dave-lowe/incredibleshrinkingsphere.dl", kind: "variable" },
  { formatId: "davidWhittaker", fixture: "public/data/songs/david-whittaker/garfield2+.dw", kind: "variable" },
  { formatId: "deltaMusic1", fixture: "public/data/songs/delta-music/triplex1.dm", kind: "fixed" },
  { formatId: "desire", fixture: "public/data/songs/desire/batmanreturns.dsr", kind: "fixed" },
  { formatId: "digitalMugician", fixture: "public/data/songs/digital-mugician/believe.dmu", kind: "fixed" },
  { formatId: "digitalSonixChrome", fixture: "public/data/songs/digital-sonix-and-chrome/dragon'sbreath ingame 1.dsc", kind: "fixed" },
  { formatId: "earAche", fixture: "public/data/songs/earache/bladerunner.ea", kind: "fixed" },
  { formatId: "faceTheMusic", fixture: "public/data/songs/face-the-music/rock.ftm", kind: "variable" },
  { formatId: "far", fixture: "public/data/songs/farandole-composer/dark dreams.far", kind: "fixed" },
  { formatId: "fashionTracker", fixture: "public/data/songs/fashion-tracker/ivory tover ii.ex", kind: "fixed" },
  { formatId: "format669", fixture: "public/data/songs/composer-669/speed fighter.669", kind: "fixed" },
  { formatId: "fredGray", fixture: "public/data/songs/fred-gray/eco.gray", kind: "fixed" },
  { formatId: "futureComposer", fixture: "public/data/songs/future-composer-1.3/adept.smod", kind: "fixed" },
  { formatId: "futurePlayer", fixture: "public/data/songs/future-player/hybris.fp", kind: "variable" },
  { formatId: "gameMusicCreator", fixture: "public/data/songs/game-music-creator/knights_of_sky.gmc", kind: "fixed" },
  { formatId: "gdm", fixture: "public/data/songs/general-digimusic/breakin's chipsong.gdm", kind: "variable" },
  { formatId: "glueMon", fixture: "public/data/songs/gluemon/memphis.glue", kind: "fixed" },
  { formatId: "multiMediaSound", fixture: "public/data/songs/multimedia-sound/bottle popper.mms", kind: "fixed" },
  { formatId: "tme", fixture: "public/data/songs/the-musical-enlightenment/64 conversion.tme", kind: "fixed" },
  { formatId: "majortom", fixture: "public/data/songs/major-tom/pseudofever.arp", kind: "fixed" },
  { formatId: "hippelCoSo", fixture: "public/data/songs/hippel-coso/prehistoric_tale.hipc", kind: "variable" },
  { formatId: "hivelyAHX", fixture: "public/data/songs/ahx/amanda.ahx", kind: "fixed" },
  { formatId: "hivelyHVL", fixture: "public/data/songs/hivelytracker/hexplosion.hvl", kind: "variable" },
  { formatId: "iffSmus", fixture: "public/data/songs/iff-smus/radiokomppi.smus", kind: "variable" },
  { formatId: "infogrames", fixture: "public/data/songs/infogrames/bob4e.dum", kind: "fixed" },
  { formatId: "it", fixture: "public/data/songs/impulse-tracker/absm chain mod.it", kind: "variable" },
  { formatId: "jamCracker", fixture: "public/data/songs/jamcracker/analogue_vibes.jam", kind: "fixed" },
  { formatId: "jankoMrsicFlogel", fixture: "public/data/songs/janko-mrsic-flogel/spacestation.jmf", kind: "variable" },
  { formatId: "jasonBrooke", fixture: "public/data/songs/jason-brooke/ikari warriors.jb", kind: "variable" },
  { formatId: "jasonPage", fixture: "public/data/songs/jason-page/jpn.virocop-14", kind: "variable", parser: { module: "@lib/import/formats/JasonPageParser", parseFn: "parseJasonPageFile" } },
  { formatId: "klystrack", fixture: "public/data/songs/klystrack/Ocean Loader III.kt", kind: "variable" },
  { formatId: "maniacsOfNoise", fixture: "public/data/songs/maniacs-of-noise/gyroscope.mon", kind: "variable", parser: { module: "@lib/import/formats/ManiacsOfNoiseParser", parseFn: "parseManiacsOfNoiseFile" } },
  { formatId: "markCooksey", fixture: "public/data/songs/mark-cooksey/grand_national-title.mc", kind: "variable", parser: { module: "@lib/import/formats/MarkCookseyParser", parseFn: "parseMarkCookseyFile" } },
  { formatId: "markCooksey", fixture: "public/data/songs/mark-cooksey/mighty bombjack.mc", kind: "variable", parser: { module: "@lib/import/formats/MarkCookseyParser", parseFn: "parseMarkCookseyFile" } },
  { formatId: "markII", fixture: "public/data/songs/mark-ii/astarrsonix.mk2", kind: "variable" },
  { formatId: "mdl", fixture: "public/data/songs/digi-trakker/rohadtjo.mdl", kind: "variable" },
  { formatId: "mod", fixture: "public/data/songs/audio-sculpture/m.mod", kind: "fixed" },
  { formatId: "mtm", fixture: "public/data/songs/multi-tracker/anonymous in 4ce.mtm", kind: "fixed" },
  { formatId: "musicLine", fixture: "public/data/songs/musicline-editor/harmonic disorder.ml", kind: "variable" },
  { formatId: "nru", fixture: "public/data/songs/noiserunner/howiedavies.nru", kind: "fixed" },
  { formatId: "paulRobotham", fixture: "public/data/songs/paul-robotham/dawnpatrol-sad.dat", kind: "variable" },
  { formatId: "paulShields", fixture: "public/data/songs/paul-shields/jug-hiscore.ps", kind: "variable", parser: { module: "@lib/import/formats/PaulShieldsParser", parseFn: "parsePaulShieldsFile" } },
  { formatId: "paulShields", fixture: "public/data/songs/paul-shields/amigasoccer-1.ps", kind: "variable", parser: { module: "@lib/import/formats/PaulShieldsParser", parseFn: "parsePaulShieldsFile" } },
  { formatId: "paulShields", fixture: "public/data/songs/paul-shields/amnios-highscore.ps", kind: "variable", parser: { module: "@lib/import/formats/PaulShieldsParser", parseFn: "parsePaulShieldsFile" } },
  { formatId: "paulShields", fixture: "public/data/songs/paul-shields/airball-gameover.ps", kind: "variable", parser: { module: "@lib/import/formats/PaulShieldsParser", parseFn: "parsePaulShieldsFile" } },
  { formatId: "paulSummers", fixture: "public/data/songs/paul-summers/everton_fc_-_jingles.snk", kind: "variable", parser: { module: "@lib/import/formats/PaulSummersParser", parseFn: "parsePaulSummersFile" } },
  { formatId: "plm", fixture: "public/data/songs/disorder-tracker-2/hyper geckoo.plm", kind: "fixed" },
  { formatId: "psa", fixture: "public/data/songs/professional-sound-artists/the punisher - title.psa", kind: "fixed" },
  { formatId: "ptm", fixture: "public/data/songs/protracker-iff/rew_vibr.ptm", kind: "variable" },
  { formatId: "pumaTracker", fixture: "public/data/songs/pumatracker/liquid kids - lv1a.puma", kind: "variable" },
  { formatId: "quadraComposer", fixture: "public/data/songs/quadra-composer/synth_corn.emod", kind: "fixed" },
  { formatId: "quartet", fixture: "public/data/songs/quartet-psg/warlock_the_avenger.sqt", kind: "variable" },
  { formatId: "robHubbard", fixture: "public/data/songs/rob-hubbard/centurion_battle.rh", kind: "variable" },
  { formatId: "rtm", fixture: "public/data/songs/real-tracker/odyssey.rtm", kind: "variable" },
  { formatId: "s3m", fixture: "public/data/songs/s3m/andante.s3m", kind: "variable" },
  { formatId: "scumm", fixture: "public/data/songs/scumm/zaktitle.scumm", kind: "variable" },
  { formatId: "seanConnolly", fixture: "public/data/songs/sean-connolly/surf_ninjas.scn", kind: "variable" },
  { formatId: "seanConran", fixture: "public/data/songs/sean-conran/count_duckula.scr", kind: "variable" },
  { formatId: "benDaglishSID", fixture: "public/data/songs/ben-daglish-sid/terramex.bds", kind: "variable" },
  { formatId: "sidmon1", fixture: "public/data/songs/sidmon-1/anarchy.sid1", kind: "fixed" },
  { formatId: "sidMon2", fixture: "public/data/songs/sidmon-2/bruno_time.sid2", kind: "variable" },
  { formatId: "sonicArranger", fixture: "public/data/songs/sonic-arranger/almighty.sa", kind: "fixed" },
  { formatId: "sonicArrangerSas", fixture: "public/data/songs/speedy-a1-system/digital voyage.sas", kind: "variable" },
  { formatId: "soundfx", fixture: "public/data/songs/soundfx/operation_stealth.sfx", kind: "fixed" },
  { formatId: "soundMon", fixture: "public/data/songs/bp-soundmon-2/nicktune1.bp", kind: "fixed" },
  { formatId: "soundPlayer", fixture: "public/data/songs/scott-johnston/sjs.awesome", kind: "fixed" },
  { formatId: "specialFX", fixture: "public/data/songs/special-fx-st/wildwheels_ingame.jd", kind: "variable" },
  { formatId: "steveBarrett", fixture: "public/data/songs/steve-barrett/street_fighter.sb", kind: "variable" },
  { formatId: "steveTurner", fixture: "public/data/songs/steve-turner/offroad.jpo", kind: "variable" },
  { formatId: "stm", fixture: "public/data/songs/scream-tracker-2/slideshow i.stm", kind: "fixed" },
  { formatId: "stp", fixture: "public/data/songs/soundtracker-pro-ii/noname.stp", kind: "fixed" },
  { formatId: "stx", fixture: "public/data/songs/screamtracker-stmik/futurebrain.stx", kind: "variable" },
  { formatId: "sunTronic", fixture: "public/data/songs/suntronic/mule.src", kind: "variable" },
  { formatId: "tcbTracker", fixture: "public/data/songs/tcb-tracker/cannonfodder.tcb", kind: "fixed" },
  { formatId: "tfmx", fixture: "public/data/songs/tfmx/mdat.rocknroll", kind: "fixed" },
  { formatId: "tfmx7v", fixture: "public/data/songs/hippel-7v/ghostbattle_gameover.hip7", kind: "fixed" },
  { formatId: "tomyTracker", fixture: "public/data/songs/tomy-tracker/irrepressible intro.sg", kind: "fixed" },
  { formatId: "ult", fixture: "public/data/songs/ultra-tracker/seasons.ult", kind: "variable" },
  { formatId: "unic", fixture: "public/data/songs/unic-tracker/african dreams.unic", kind: "fixed" },
  { formatId: "wallyBeben", fixture: "public/data/songs/wally-beben/wicked.wb", kind: "fixed" },
  { formatId: "xm", fixture: "public/data/songs/xm/flo boarding - level 1.xm", kind: "variable" },
  { formatId: "zoundMonitor", fixture: "public/data/songs/zoundmonitor/sonjavanveen.sng", kind: "fixed" },
];
