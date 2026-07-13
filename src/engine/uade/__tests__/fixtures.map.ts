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
}

export const ENCODER_FIXTURES: EncoderFixture[] = [
  { formatId: "activisionPro", fixture: "public/data/songs/activision-pro/gettysburg.avp", kind: "fixed" },
  { formatId: "aon", fixture: "public/data/songs/art-of-noise/inside.blipp.aon", kind: "fixed" },
  { formatId: "ams", fixture: "public/data/songs/velvet-studio/kernel.ams", kind: "variable" },
  { formatId: "ashleyHogg", fixture: "public/data/songs/ashley-hogg/ash.nobby the aardvark", kind: "fixed" },
  { formatId: "deltaMusic2", fixture: "public/data/songs/delta-music-2/asperity megademo 3.dm2", kind: "fixed" },
  { formatId: "digiBoosterPro", fixture: "public/data/songs/digibooster-pro/invisibility.dbm", kind: "variable" },
  { formatId: "graoumfTracker2_gt2", fixture: "public/data/songs/graoumf-tracker-2/living-on-video.gt2", kind: "fixed" },
  { formatId: "inStereo2", fixture: "public/data/songs/instereo!-2.0/spaceflight.is20", kind: "fixed" },
  { formatId: "mikeDavies", fixture: "public/data/songs/mike-davies/strider.md", kind: "fixed" },
  { formatId: "musicAssembler", fixture: "public/data/songs/music-assembler/thanatos.ma", kind: "variable" },
  { formatId: "ronKlaren", fixture: "public/data/songs/ron-klaren/astra 2.rk", kind: "fixed" },
  { formatId: "soundControl", fixture: "public/data/songs/soundcontrol/north sea inferno ongame1.sc", kind: "fixed" },
  { formatId: "soundFactory", fixture: "public/data/songs/soundfactory/im maien.psf", kind: "fixed" },
  { formatId: "symphoniePro", fixture: "public/data/songs/symphonie/pas 2 jade.symmod", kind: "fixed" },
  { formatId: "synthesis", fixture: "public/data/songs/synthesis/space sound.syn", kind: "fixed" },
  { formatId: "benDaglish", fixture: "public/data/songs/ben-daglish/motorhead-titleandingame.bd", kind: "variable" },
  { formatId: "coreDesign", fixture: "public/data/songs/core-design/dynamite dux.core", kind: "fixed" },
  { formatId: "customMade", fixture: "public/data/songs/formats/cm.viking_child", kind: "fixed" },
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
  { formatId: "fredEditor", fixture: "public/data/songs/formats/bomb jack.fred", kind: "variable" },
  { formatId: "fredGray", fixture: "public/data/songs/formats/eco.gray", kind: "fixed" },
  { formatId: "futureComposer", fixture: "public/data/songs/formats/adept.smod", kind: "fixed" },
  { formatId: "futurePlayer", fixture: "public/data/songs/formats/hybris.fp", kind: "variable" },
  { formatId: "gameMusicCreator", fixture: "public/data/songs/formats/knights_of_sky.gmc", kind: "fixed" },
  { formatId: "gdm", fixture: "public/data/songs/formats/breakin's chipsong.gdm", kind: "variable" },
  { formatId: "glueMon", fixture: "public/data/songs/formats/memphis.glue", kind: "fixed" },
  { formatId: "hippelCoSo", fixture: "public/data/songs/formats/prehistoric_tale.hipc", kind: "variable" },
  { formatId: "hivelyAHX", fixture: "public/data/songs/ahx/amanda.ahx", kind: "fixed" },
  { formatId: "hivelyHVL", fixture: "public/data/songs/formats/hexplosion.hvl", kind: "variable" },
  { formatId: "iffSmus", fixture: "public/data/songs/formats/radiokomppi.smus", kind: "variable" },
  { formatId: "infogrames", fixture: "public/data/songs/formats/bob4e.dum", kind: "fixed" },
  { formatId: "it", fixture: "public/data/songs/formats/absm chain mod.it", kind: "variable" },
  { formatId: "jamCracker", fixture: "public/data/songs/formats/analogue_vibes.jam", kind: "fixed" },
  { formatId: "jankoMrsicFlogel", fixture: "public/data/songs/formats/spacestation.jmf", kind: "fixed" },
  { formatId: "jasonBrooke", fixture: "public/data/songs/formats/Scott Johnston/sjs.jb", kind: "fixed" },
  { formatId: "jasonPage", fixture: "public/data/songs/formats/jpn.virocop-14", kind: "fixed" },
  { formatId: "jesperOlsen", fixture: "public/data/songs/formats/lollypop-subgame_01.jo", kind: "fixed" },
  { formatId: "klystrack", fixture: "public/data/songs/klystrack/Ocean Loader III.kt", kind: "variable" },
  { formatId: "maniacsOfNoise", fixture: "public/data/songs/formats/gyroscope.mon", kind: "fixed" },
  { formatId: "markCooksey", fixture: "public/data/songs/formats/grand_national-title.mc", kind: "fixed" },
  { formatId: "markII", fixture: "public/data/songs/mark-ii/astarrsonix.mk2", kind: "fixed" },
  { formatId: "mdl", fixture: "public/data/songs/digi-trakker/rohadtjo.mdl", kind: "variable" },
  { formatId: "midiLoriciel", fixture: "public/data/songs/formats/Michel Winogradoff/MIDI.Bumpy'sArcadeFantasy", kind: "fixed" },
  { formatId: "mod", fixture: "public/data/songs/audio-sculpture/m.mod", kind: "fixed" },
  { formatId: "mtm", fixture: "public/data/songs/formats/anonymous in 4ce.mtm", kind: "fixed" },
  { formatId: "musicLine", fixture: "public/data/songs/formats/harmonic disorder.ml", kind: "variable" },
  { formatId: "nru", fixture: "public/data/songs/formats/howiedavies.nru", kind: "fixed" },
  { formatId: "paulRobotham", fixture: "public/data/songs/formats/dawnpatrol-sad.dat", kind: "fixed" },
  { formatId: "paulShields", fixture: "public/data/songs/formats/jug-hiscore.ps", kind: "fixed" },
  { formatId: "plm", fixture: "public/data/songs/disorder-tracker-2/hyper geckoo.plm", kind: "fixed" },
  { formatId: "ptm", fixture: "public/data/songs/formats/rew_vibr.ptm", kind: "variable" },
  { formatId: "pumaTracker", fixture: "public/data/songs/pumatracker/liquid kids - lv1a.puma", kind: "variable" },
  { formatId: "quadraComposer", fixture: "public/data/songs/formats/synth_corn.emod", kind: "fixed" },
  { formatId: "quartet", fixture: "public/data/songs/formats/warlock_the_avenger.sqt", kind: "fixed" },
  { formatId: "robHubbard", fixture: "public/data/songs/formats/centurion_battle.rh", kind: "variable" },
  { formatId: "rtm", fixture: "public/data/songs/formats/odyssey.rtm", kind: "variable" },
  { formatId: "s3m", fixture: "public/data/songs/formats/andante.s3m", kind: "variable" },
  { formatId: "scumm", fixture: "public/data/songs/formats/zaktitle.scumm", kind: "fixed" },
  { formatId: "seanConnolly", fixture: "public/data/songs/formats/surf_ninjas.scn", kind: "fixed" },
  { formatId: "sidmon1", fixture: "public/data/songs/formats/anarchy.sid1", kind: "fixed" },
  { formatId: "sidMon2", fixture: "public/data/songs/formats/bruno_time.sid2", kind: "variable" },
  { formatId: "sonicArranger", fixture: "public/data/songs/formats/almighty.sa", kind: "fixed" },
  { formatId: "sonicArrangerSas", fixture: "public/data/songs/speedy-a1-system/digital voyage.sas", kind: "fixed" },
  { formatId: "soundfx", fixture: "public/data/songs/formats/operation_stealth.sfx", kind: "fixed" },
  { formatId: "soundMon", fixture: "public/data/songs/bp-soundmon-2/nicktune1.bp", kind: "fixed" },
  { formatId: "soundPlayer", fixture: "public/data/songs/formats/Scott Johnston/sjs.awesome", kind: "fixed" },
  { formatId: "specialFX", fixture: "public/data/songs/formats/wildwheels_ingame.jd", kind: "fixed" },
  { formatId: "steveBarrett", fixture: "public/data/songs/formats/street_fighter.sb", kind: "fixed" },
  { formatId: "steveTurner", fixture: "public/data/songs/formats/offroad.jpo", kind: "variable" },
  { formatId: "stm", fixture: "public/data/songs/formats/slideshow i.stm", kind: "fixed" },
  { formatId: "stp", fixture: "public/data/songs/formats/noname.stp", kind: "fixed" },
  { formatId: "stx", fixture: "public/data/songs/formats/futurebrain.stx", kind: "variable" },
  { formatId: "sunTronic", fixture: "public/data/songs/formats/SUNTronicTunes/mule.src", kind: "variable" },
  { formatId: "tcbTracker", fixture: "public/data/songs/formats/cannonfodder.tcb", kind: "fixed" },
  { formatId: "tfmx", fixture: "public/data/songs/formats/mdat.rocknroll", kind: "fixed" },
  { formatId: "tfmx7v", fixture: "public/data/songs/formats/ghostbattle_gameover.hip7", kind: "fixed" },
  { formatId: "tomyTracker", fixture: "public/data/songs/formats/irrepressible intro.sg", kind: "fixed" },
  { formatId: "ult", fixture: "public/data/songs/formats/seasons.ult", kind: "variable" },
  { formatId: "unic", fixture: "public/data/songs/formats/african dreams.unic", kind: "fixed" },
  { formatId: "wallyBeben", fixture: "public/data/songs/formats/wicked.wb", kind: "fixed" },
  { formatId: "xm", fixture: "public/data/songs/formats/flo boarding - level 1.xm", kind: "variable" },
  { formatId: "zoundMonitor", fixture: "public/data/songs/zoundmonitor/sonjavanveen.sng", kind: "fixed" },
];
