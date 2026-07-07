/**
 * exporterFixtures.map.ts — REAL committed song fixtures for the EXPORTER round-trip
 * harness (Phase 1, Task 1.2). Sibling of the encoder harness's fixtures.map.ts, but
 * scoped to the dedicated exporters in src/lib/export/*Exporter.ts that the native
 * export router (src/lib/export/nativeExportRouter.ts) dispatches to.
 *
 * The exporter list itself is SOURCED from the router at test time:
 *   - LAYOUT_EXPORTERS  (keyed on song.uadePatternLayout.formatId) — enumerated live by
 *                        the harness importing that map; here we only supply a fixture per
 *                        layout formatId in LAYOUT_FIXTURES.
 *   - the named-format branches (keyed on song.format, e.g. JamCracker, SMON, MOD, FC,
 *                        HVL/AHX, KT, …) — hand-listed in NAMED_EXPORTERS because they are
 *                        not keyed on a layout formatId.
 *
 * House rule: real songs only, and only files tracked by git (untracked local songs fail
 * in CI). Where a router branch has no committed fixture, it is recorded 'missing-fixture'
 * by the harness (explicit, never silently skipped) so Task 1.3 can fill the gap.
 *
 * Task-1.3 ownership: this file is EXPORTER-only and lives under src/lib/export/__tests__.
 * It does NOT touch the shared encoder fixtures.map.ts (that map is owned elsewhere). Some
 * paths here are shared with the encoder map by coincidence of format — that is fine, they
 * are independent read-only lookups.
 */

/**
 * layoutFormatId → committed fixture whose native parser attaches that layout. Only ids
 * with a real committed fixture appear; the rest are reported 'missing-fixture' by the
 * harness (it diffs these keys against LAYOUT_EXPORTERS from the router).
 */
export const LAYOUT_FIXTURES: Record<string, string> = {
  musicLine: 'public/data/songs/formats/harmonic disorder.ml',
  musicAssembler: 'public/data/songs/music-assembler/thanatos.ma',
  futurePlayer: 'public/data/songs/formats/hybris.fp',
  // NOTE: DigitalSymphony's native ext is .dsym; the only committed candidate
  // (binary reality.dss) is a DIFFERENT format (Digital Sound Studio) — omitted so the
  // harness reports digitalSymphony as missing-fixture rather than mis-attributing a
  // wrong-format parse failure. Task 1.3 to supply a real .dsym fixture.
  hippelCoSo: 'public/data/songs/formats/prehistoric_tale.hipc',
  inStereo2: 'public/data/songs/instereo!-2.0/spaceflight.is20',
  deltaMusic1: 'public/data/songs/delta-music/triplex1.dm',
  deltaMusic2: 'public/data/songs/delta-music-2/asperity megademo 3.dm2',
  digitalMugician: 'public/data/songs/digital-mugician/believe.dmu',
  sidmon1: 'public/data/songs/formats/anarchy.sid1',
  sonicArranger: 'public/data/songs/formats/almighty.sa',
  tfmx: 'public/data/songs/formats/mdat.rocknroll',
  fredEditor: 'public/data/songs/formats/bomb jack.fred',
  soundfx: 'public/data/songs/formats/operation_stealth.sfx',
  tcbTracker: 'public/data/songs/formats/cannonfodder.tcb',
  gameMusicCreator: 'public/data/songs/formats/knights_of_sky.gmc',
  quadraComposer: 'public/data/songs/formats/synth_corn.emod',
  activisionPro: 'public/data/songs/activision-pro/gettysburg.avp',
  digiBoosterPro: 'public/data/songs/digibooster-pro/invisibility.dbm',
  faceTheMusic: 'public/data/songs/face-the-music/rock.ftm',
  sawteeth: 'public/data/songs/sawteeth/okolaNUKE.st',
  earAche: 'public/data/songs/earache/bladerunner.ea',
  iffSmus: 'public/data/songs/formats/radiokomppi.smus',
  actionamics: 'public/data/songs/actionamics/dynablaster.ast',
  soundFactory: 'public/data/songs/soundfactory/im maien.psf',
  soundControl: 'public/data/songs/soundcontrol/north sea inferno ongame1.sc',
  c67: 'public/data/songs/formats/amnesia_credits.c67',
  zoundMonitor: 'public/data/songs/zoundmonitor/sonjavanveen.sng',
  composer667: 'public/data/songs/composer-667/sunset.667',
  nru: 'public/data/songs/formats/howiedavies.nru',
  ims: 'public/data/songs/images-music-system/chip5.ims',
  stp: 'public/data/songs/formats/noname.stp',
  unic: 'public/data/songs/formats/african dreams.unic',
  scumm: 'public/data/songs/formats/zaktitle.scumm',
  // No committed fixture found (reported missing-fixture by the harness — Task 1.3):
  //   amosMusicBank, synthesis, chuckBiscuits, kris, dsm_dyn, xmf, digitalSymphony (.dsym)
};

export interface NamedExporterTarget {
  /** Stable ratchet key. */
  id: string;
  /** Human label / which router branch fires. */
  label: string;
  /** Committed fixture, or undefined => missing-fixture. */
  fixture?: string;
  /** True when the exporter reads live zustand stores rather than the passed song. */
  storeDependent?: boolean;
}

/**
 * Named-format router branches (dispatchNativeExport in nativeExportRouter.ts). These are
 * keyed on song.format (or an explicit layoutFormatId check), not on LAYOUT_EXPORTERS.
 */
export const NAMED_EXPORTERS: NamedExporterTarget[] = [
  { id: 'jamCracker', label: 'JamCracker (JamCrackerExporter)', fixture: 'public/data/songs/formats/analogue_vibes.jam' },
  { id: 'soundMon', label: 'SMON (SoundMonExporter)', fixture: 'public/data/songs/bp-soundmon-2/nicktune1.bp' },
  { id: 'synTracker', label: 'SynTracker (SynTrackerExporter)', fixture: 'public/data/songs/syntracker/autumn melodies.synmod' },
  { id: 'mod', label: 'MOD bake (modExport)', fixture: 'public/data/songs/audio-sculpture/m.mod' },
  { id: 'fc', label: 'FC (FCExporter)', fixture: 'public/data/songs/formats/anthrox.fc' },
  { id: 'sidMon2', label: 'SidMon2 (SidMon2Exporter)', fixture: 'public/data/songs/formats/bruno_time.sid2' },
  { id: 'pumaTracker', label: 'PumaTracker (PumaTrackerExporter)', fixture: 'public/data/songs/pumatracker/liquid kids - lv1a.puma' },
  { id: 'octaMED', label: 'OctaMED (MEDExporter)', fixture: 'public/data/songs/octamed-mmd0/universal monsters - title.mmd0' },
  { id: 'hivelyHVL', label: 'HVL (HivelyExporter)', fixture: 'public/data/songs/formats/hexplosion.hvl' },
  { id: 'hivelyAHX', label: 'AHX (HivelyExporter)', fixture: 'public/data/songs/ahx/amanda.ahx' },
  { id: 'digiBooster', label: 'DIGI (DigiBoosterExporter)', fixture: 'public/data/songs/digibooster/the day after.digi' },
  { id: 'oktalyzer', label: 'OKT (OktalyzerExporter)', fixture: 'public/data/songs/oktalyzer/les granges brulees.okta' },
  { id: 'klystrack', label: 'KT (KlysExporter)', fixture: 'public/data/songs/klystrack/Ocean Loader III.kt' },
  { id: 'inStereo1', label: 'IS10 (InStereo1Exporter)', fixture: 'public/data/songs/instereo!/fantasi8.is' },
  { id: 'symphoniePro', label: 'Symphonie (SymphonieProExporter)', fixture: 'public/data/songs/symphonie/pas 2 jade.symmod' },
  // Store-dependent: reads useTrackerStore/useInstrumentStore, not the passed song. Headless
  // it exports from empty stores; kept for completeness, measured honestly.
  { id: 'preTracker', label: 'PreTracker (PreTrackerExporter, store-dependent)', fixture: 'public/data/songs/pretracker/the little things.prt', storeDependent: true },
  // No committed fixture found (reported missing-fixture — Task 1.3):
  { id: 'adPlug', label: 'AdPlug (AdPlugExporter)', fixture: undefined },
];
