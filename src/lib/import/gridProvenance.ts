/**
 * Where every registry format's pattern grid comes from (G11, 2026-10-07).
 *
 * One table, one source of truth: src/engine/__tests__/gridProvenanceGuard.test.ts
 * walks FORMAT_REGISTRY and fails when a key is missing here, so a new parser
 * cannot ship an unlisted grid. Parser tests may import it too.
 *
 *  DIRECT         the parser decodes a stored pattern format (or hands it to libopenmpt).
 *  WALK           the grid is the replayer's own walk, held to an oracle by `oracleTest`.
 *  RECONSTRUCTED  a static guesser, heuristic track walker, UADE scan or stub grid that
 *                 falls to the scan. Needs a plan unit in
 *                 thoughts/shared/plans/2026-10-07-grid-from-replayer-walk.md.
 *  SCOPE          no grid by design (register log, player program): the scope view.
 *
 * Evidence per format (file:line, oracle, verdict):
 * thoughts/shared/research/2026-10-07_reconstructed-grids-audit.md
 *
 * Moving a format to WALK: add the oracle test, then move the key here. Moving
 * one to DIRECT/WALK from RECONSTRUCTED does not need the plan unit any more,
 * but tick the unit in the plan in the same commit.
 */

export type GridSource = 'DIRECT' | 'WALK' | 'RECONSTRUCTED' | 'SCOPE';

export interface GridProvenance {
  source: GridSource;
  /** WALK: repo-relative path of the test that holds the grid to the oracle. */
  oracleTest?: string;
  /** RECONSTRUCTED: plan unit id (U<n>, W2-<x> or G11-<key>) defined in the plan file. */
  planUnit?: string;
  /** SCOPE: why there is no grid. */
  reason?: string;
  /**
   * Owner's definition of fully editable (G16): export to the native format, load it again, it sounds
   * the same; edit a note, export, load, the edit is heard and nothing else moved. Held by
   * nativeExportReloadSoundsTheSame.test.ts for every key in EXPORT_ROUND_TRIP; absent = not yet under
   * the round trip (every unit must bring its format under it, plan bar item 9).
   */
  exportRoundTrip?: ExportRoundTrip;
  /** G19: a grid edit is heard on the next play (liveEditHeard.test.ts). */
  liveEdit?: LiveEditStatus;
  /** G24: a grid edit is heard while the song plays (liveEditHeard.test.ts, second table). */
  liveWhilePlaying?: LiveEditStatus;
}

export type ExportRoundTrip = 'pass' | 'fail' | 'n/a';

/**
 * Per-format status of the native export round trip (src/engine/__tests__/nativeExportReloadSoundsTheSame.test.ts,
 * which fails when a row here disagrees with its KNOWN defects). 'fail' rows name their plan unit there.
 */
export const EXPORT_ROUND_TRIP: Record<string, ExportRoundTrip> = {
  jochenHippel7V: 'pass',
  davidWhittaker: 'pass',
  robHubbard: 'pass',
  benDaglish: 'pass',
  jochenHippelST: 'pass',
  suntronic: 'fail',
  activisionPro: 'pass',
  fred: 'pass',
  actionamics: 'pass',
  soundMaster: 'pass',
  digitalSonixChrome: 'pass',
  sidmon1: 'pass',
};

/**
 * G19: is a grid edit heard on the next play? 'pass' = the module the engine is loaded with carries
 * the edit (and, where UADE can play it, its Paula stream moves); 'fail' = it does not (the row names its
 * plan unit in liveEditHeard.test.ts); 'n/a' = the TypeScript scheduler plays the grid itself. A key absent
 * from this table has no corpus song in the table run. Measured by src/engine/__tests__/liveEditHeard.test.ts.
 */
export type LiveEditStatus = 'pass' | 'fail' | 'n/a';
export const LIVE_EDIT: Record<string, LiveEditStatus> = {
  '669': 'n/a',
  actionamics: 'pass',
  activisionPro: 'pass',
  amf: 'n/a',
  benDaglish: 'pass',
  cheesecutter: 'n/a',
  composer667: 'n/a',
  daveLowe: 'pass',
  davidWhittaker: 'pass',
  deltaMusic1: 'pass',
  deltaMusic2: 'pass',
  digi: 'pass',
  digitalSonixChrome: 'pass',
  digitalSoundStudio: 'pass',
  dtm: 'n/a',
  faceTheMusic: 'pass',
  far: 'n/a',
  fc: 'pass',
  fred: 'pass',
  fur: 'n/a',
  futurePlayer: 'pass',
  gdm: 'n/a',
  hippelCoso: 'pass',
  hvl: 'pass',
  inStereo2: 'pass',
  inStereoAmbiguous: 'pass',
  it: 'n/a',
  jamcracker: 'pass',
  jochenHippel7V: 'pass',
  jochenHippelST: 'pass',
  maxTrax: 'pass',
  mdl: 'n/a',
  med: 'n/a',
  mod: 'n/a',
  mtm: 'n/a',
  musicAssembler: 'pass',
  okt: 'pass',
  plm: 'n/a',
  psm: 'n/a',
  ptm: 'n/a',
  pumaTracker: 'pass',
  quadraComposer: 'pass',
  robHubbard: 'pass',
  rtm: 'n/a',
  s3m: 'n/a',
  sidFactory2: 'n/a',
  sidmon1: 'pass',
  sidmon2: 'pass',
  soundControl: 'pass',
  soundMaster: 'pass',
  soundPlayer: 'pass',
  soundmon: 'pass',
  sonicArranger: 'pass',
  stm: 'n/a',
  stp: 'n/a',
  stx: 'n/a',
  suntronic: 'pass',
  synthesis: 'pass',
  tcbTracker: 'pass',
  tfmMusicMaker: 'pass',
  tfmx: 'pass',
  ult: 'n/a',
  unic: 'n/a',
  xm: 'n/a',
};

/**
 * G24: is a grid edit heard WHILE the song plays (the next time the player reaches the row, no restart)?
 * Measured by the second table of liveEditHeard.test.ts: UADE plays the module, the edit goes through
 * sendCellEditsToEngine into chip RAM between two render chunks, and the Paula stream after it equals the
 * stream of the edited module played from the start. 'n/a' = the TypeScript scheduler plays the grid.
 * A key absent here is not measurable in node (a worklet engine, or no corpus song); LIVE_WHILE_PLAYING_WHY
 * names the reason a row is 'fail' or absent.
 */
export const LIVE_WHILE_PLAYING: Record<string, LiveEditStatus> = {
  // davidWhittaker: a native worklet engine, measured by davidWhittakerLiveSwap.test.ts (the real worklet and WASM, the store's own route).
  davidWhittaker: 'pass',
  // benDaglish: likewise, benDaglishLiveSwap.test.ts (note edits; the exporter writes no other BD edit).
  benDaglish: 'pass',
  digitalSonixChrome: 'pass',
  jochenHippelST: 'pass',
  // musicAssembler, pumaTracker, sidmon2: the same measurement (musicAssemblerLiveSwap, pumaTrackerLiveSwap, sidMon2LiveSwap .test.ts).
  musicAssembler: 'pass',
  pumaTracker: 'pass',
  robHubbard: 'pass',
  sidmon2: 'pass',
  soundMaster: 'pass',
  suntronic: 'fail',
  tcbTracker: 'fail',
};

/** Why a LIVE_WHILE_PLAYING row is 'fail', and why the other formats are not in the table (G24). */
export const LIVE_WHILE_PLAYING_WHY: Record<string, string> = {
  suntronic: 'the exported bytes are found in chip RAM (image at 0x20000, 0x100 records 0x2a000) and written there, but the stream does not move: the player reads a converted copy, not the file image',
  tcbTracker: 'the layout write changes the file bytes but no Paula event in 8 s of the first three patterns: UADE plays a converted copy of the TCB patterns',
  digi: 'UADE refuses the file (DigiBooster plays through the native engine only)',
};

/** Why a LIVE_EDIT row is 'fail' (plan unit in thoughts/shared/plans/2026-10-06-fix-all-open.md, G19). */
export const LIVE_EDIT_WHY: Record<string, string> = {
};

/**
 * G5: a note put on an EMPTY row reaches the exported module (it reloads with that note in that cell).
 * 'no' = the block has no room and the format's writer refuses it (re-encode and shift is the open work).
 */
export type AddOnEmptyRow = 'pass' | 'fail' | 'n/a';
export const ADD_ON_EMPTY_ROW: Record<string, AddOnEmptyRow> = {
  '669': 'n/a',
  actionamics: 'pass',
  activisionPro: 'fail',
  amf: 'n/a',
  benDaglish: 'fail',
  cheesecutter: 'n/a',
  composer667: 'n/a',
  daveLowe: 'fail',
  davidWhittaker: 'pass',
  deltaMusic1: 'pass',
  deltaMusic2: 'pass',
  digi: 'pass',
  digitalSonixChrome: 'pass',
  digitalSoundStudio: 'pass',
  dtm: 'n/a',
  faceTheMusic: 'pass',
  far: 'n/a',
  fc: 'pass',
  fred: 'pass',
  fur: 'n/a',
  futurePlayer: 'fail',
  gdm: 'n/a',
  hippelCoso: 'fail',
  hvl: 'pass',
  inStereo2: 'pass',
  inStereoAmbiguous: 'pass',
  it: 'n/a',
  jamcracker: 'pass',
  jochenHippel7V: 'pass',
  jochenHippelST: 'pass',
  maxTrax: 'n/a',
  mdl: 'n/a',
  med: 'n/a',
  mod: 'n/a',
  mtm: 'n/a',
  musicAssembler: 'n/a',
  okt: 'pass',
  plm: 'n/a',
  psm: 'n/a',
  ptm: 'n/a',
  pumaTracker: 'pass',
  quadraComposer: 'pass',
  robHubbard: 'pass',
  rtm: 'n/a',
  s3m: 'n/a',
  sidFactory2: 'n/a',
  sidmon1: 'pass',
  sidmon2: 'fail',
  soundControl: 'fail',
  soundMaster: 'pass',
  soundPlayer: 'fail',
  soundmon: 'pass',
  sonicArranger: 'pass',
  stm: 'n/a',
  stp: 'n/a',
  stx: 'n/a',
  suntronic: 'pass',
  synthesis: 'pass',
  tcbTracker: 'pass',
  tfmMusicMaker: 'pass',
  tfmx: 'fail',
  ult: 'n/a',
  unic: 'n/a',
  xm: 'n/a',
};

export const GRID_PLAN_FILE = 'thoughts/shared/plans/2026-10-07-grid-from-replayer-walk.md';

/** Grid is the replayer's own walk; each entry names its oracle test. */
export const WALK_GRIDS: Record<string, string> = {
  sidmon1: 'src/engine/__tests__/sidmon1GridMatchesUade.test.ts',
  fred: 'src/lib/import/__tests__/fredEditorGridMatchesPlayer.test.ts',
  robHubbard: 'src/engine/__tests__/robHubbardGridIsPlayersWalk.test.ts',
  davidWhittaker: 'src/engine/__tests__/davidWhittakerGridVoices.test.ts',
  actionamics: 'src/engine/__tests__/actionamicsGridMatchesPlayer.test.ts',
  activisionPro: 'src/engine/__tests__/activisionProGridMatchesUade.test.ts',
  benDaglish: 'src/engine/__tests__/benDaglishGridMatchesPlayer.test.ts',
  soundMaster: 'src/engine/__tests__/soundMasterGridMatchesPlayer.test.ts',
  jochenHippelST: 'src/engine/__tests__/jochenHippelSTGridMatchesPlayer.test.ts',
  digitalSonixChrome: 'src/lib/import/__tests__/digitalSonixChromeGridMatchesPlayer.test.ts',
  jochenHippel7V: 'src/engine/__tests__/hippelTfmxGridMatchesPlayer.test.ts',
  suntronic: 'src/engine/__tests__/sunTronicGridMatchesPlayer.test.ts',
  futurePlayer: 'src/engine/__tests__/futurePlayerWalkMatchesPlayer.test.ts',
  musicAssembler: 'src/engine/__tests__/musicAssemblerWalkMatchesPlayer.test.ts',
};

/** Scope view by design: no pattern grid exists or can exist. */
export const SCOPE_GRIDS: Record<string, string> = {
  cinter4: 'Cinter4Parser: sequence data left to the WASM replayer (Cinter4Parser.ts header); no corpus song',
  benDaglishSID: 'owner verdict Good, stub pattern opens the scope view (plan D3)',
  c64sid: 'SIDParser runs 6502 and intercepts SID writes (player program, register log) [h: 39p/7488r/5796n]',
  vgm: 'VGMParser rebuilds notes from chip register writes (register log) [h: 1p/768r/298n]',
  ym: 'ZxtuneParser shell; engine plays [h: 17th.ym THROW fileName.replace]',
  nsf: 'GameMusicParser: header only, scope view (parser comment) [h: 1p/320r/0n]',
  sap: 'SAPParser 6502 emulation of POKEY writes; scope view (ledger: SAP/ASAP/AY/SNDH open in scope view) [h: 1p/900r',
  'asap-native': 'AsapParser: metadata only; ASAP engine plays',
  ay: 'AYParser: AY registers per frame from aylet = register view of the Z80 program [h: 1p/48r/0n]',
  ayStructured: 'ZXAY STRC/AMAD payloads: parser refuses structured (data is Z80 code); research 2026-10-04_ay-strc-amad.md [h:',
  s98: 'S98Parser: header only; register log [h: 1p/64r/0n]',
  gbs: 'GameMusicParser header only [h: 1p/256r/0n]',
  hes: 'GameMusicParser header only [h: 1p/384r/0n]',
  kss: 'GameMusicParser header only [h: 1p/512r/0n]',
  spc: 'GameMusicParser header only [h: 1p/512r/0n]',
  gym: 'GameMusicParser header only [h: 1p/512r/0n]',
  sndh: 'SNDHParser reads tag header only; 68000 player program (psgplay), scope view [h: 1p/192r/0n]',
  qsf: 'QsfParser: Z80 program + ROM; engine only',
  fmp: 'FmplayerParser: raw binary to engine, empty grid',
  pxtone: 'PxtoneParser: minimal shell, one empty pattern, engine plays (event data exists but is not shown)',
  organya: 'OrganyaParser: minimal shell, one empty pattern',
  eupmini: 'EupminiParser: minimal shell, one empty pattern',
  ixalance: 'IxalanceParser: minimal shell (format is IT-like with real patterns, not shown)',
  cpsycle: 'CpsycleParser: minimal shell (Psycle has real patterns, not shown)',
  zxtune: 'ZxtuneParser: minimal shell, one empty pattern; engine plays (PT3/PT2/STC/VTX... have real patterns, not shown',
  v2m: 'no parser; V2 synth engine plays',
  uax: 'UAXParser: Unreal sound ripper, samples + one empty pattern (no song)',
  uade_cus: 'UADE cannot run the player, no oracle can exist (plan D2)',
  uade_fw: 'UADE renders it silent, no oracle can exist (plan D2)',
};

/** Reconstructed grids, each with the plan unit that replaces it with a walk or a decode. */
export const RECONSTRUCTED_GRIDS: Record<string, string> = {
  midi: 'G11-midi',
  mugician: 'U11',
  imagesMusicSystem: 'U20',
  musicLine: 'U9',
  sawteeth: 'U13',
  soundFactory: 'G11-soundFactory',
  ronKlaren: 'U12',
  magneticFieldsPacker: 'G11-magneticFieldsPacker',
  speedySystem: 'G11-speedySystem',
  tronic: 'G11-tronic',
  medley: 'G11-medley',
  lme: 'G11-lme',
  infogrames: 'U25',
  markCooksey: 'G11-markCooksey',
  quartet: 'G11-quartet',
  synthPack: 'G11-synthPack',
  mmdc: 'G11-mmdc',
  psa: 'G11-psa',
  tme: 'G11-tme',
  jasonPage: 'U26',
  jasonBrooke: 'U28',
  laxity: 'G11-laxity',
  fredGray: 'U28',
  musicMaker4V: 'G11-musicMaker4V',
  musicMaker8V: 'U10',
  specialFX: 'G11-specialFX',
  timeTracker: 'G11-timeTracker',
  cinemaware: 'G11-cinemaware',
  novoTradePacker: 'G11-novoTradePacker',
  alcatrazPacker: 'G11-alcatrazPacker',
  bladePacker: 'G11-bladePacker',
  tomyTracker: 'U19',
  multiMediaSound: 'G11-multiMediaSound',
  seanConran: 'G11-seanConran',
  thomasHermann: 'G11-thomasHermann',
  titanicsPacker: 'G11-titanicsPacker',
  krisHatlelid: 'G11-krisHatlelid',
  ntsp: 'G11-ntsp',
  moshPacker: 'G11-moshPacker',
  coreDesign: 'U17',
  jankoMrsicFlogel: 'G11-jankoMrsicFlogel',
  nickPellingPacker: 'G11-nickPellingPacker',
  wallyBeben: 'U16',
  steveBarrett: 'G11-steveBarrett',
  paulSummers: 'G11-paulSummers',
  desire: 'U26',
  martinWalker: 'G11-martinWalker',
  paulShields: 'G11-paulShields',
  paulRobotham: 'G11-paulRobotham',
  pierreAdane: 'G11-pierreAdane',
  andrewParton: 'G11-andrewParton',
  customMade: 'U24',
  jesperOlsen: 'U18',
  kimChristensen: 'G11-kimChristensen',
  ashleyHogg: 'U27',
  adpcmMono: 'G11-adpcmMono',
  janneSalmijarvi: 'G11-janneSalmijarvi',
  maximumEffect: 'G11-maximumEffect',
  midiLoriciel: 'G11-midiLoriciel',
  onEscapee: 'G11-onEscapee',
  paulTonge: 'G11-paulTonge',
  maniacsOfNoise: 'G11-maniacsOfNoise',
  mdx: 'G11-mdx',
  pmd: 'G11-pmd',
  piyoPiyo: 'G11-piyoPiyo',
  adplug: 'G11-adplug',
  ufo: 'G11-ufo',
  earAche: 'U28',
  scumm: 'G11-scumm',
  gluemon: 'U28',
  seanConnolly: 'G11-seanConnolly',
  artAndMagic: 'G11-artAndMagic',
  mikeDavies: 'G11-mikeDavies',
  markII: 'G11-markII',
  sonicArrangerSas: 'G11-sonicArrangerSas',
  aProSys: 'G11-aProSys',
  amiga_formats_catchall: 'G11-amiga_formats_catchall',
  uade_abk: 'G11-uade-only',
  uade_agi: 'G11-uade-only',
  uade_ast: 'G11-uade-only',
  uade_bss: 'U28',
  uade_bfc: 'G11-uade-only',
  uade_bsi: 'G11-uade-only',
  uade_fc_bsi: 'G11-uade-only',
  uade_cust: 'G11-uade-only',
  uade_custom: 'G11-uade-only',
  uade_dh: 'U28',
  uade_dns: 'G11-uade-only',
  uade_dz: 'U27',
  uade_mkiio: 'G11-uade-only',
  uade_mg: 'G11-uade-only',
  uade_ems: 'G11-uade-only',
  uade_emsv6: 'G11-uade-only',
  uade_hd: 'G11-uade-only',
  uade_hn: 'G11-uade-only',
  uade_thn: 'G11-uade-only',
  uade_mtp2: 'G11-uade-only',
  uade_arp: 'G11-uade-only',
  uade_hip: 'G11-uade-only',
  uade_mcmd: 'G11-uade-only',
  uade_sog: 'G11-uade-only',
  uade_mok: 'G11-uade-only',
  uade_mso: 'G11-uade-only',
  uade_pn: 'G11-uade-only',
  uade_riff: 'G11-uade-only',
  uade_sa_p: 'G11-uade-only',
  uade_lion: 'G11-uade-only',
  uade_sa_old: 'G11-uade-only',
  uade_sdr: 'G11-uade-only',
  uade_spl: 'G11-uade-only',
  uade_tw: 'G11-uade-only',
  uade_sun: 'G11-uade-only',
  uade_synmod: 'G11-uade-only',
  uade_tf: 'U28',
  uade_thx: 'G11-uade-only',
  uade_tfhd1_5: 'G11-uade-only',
  uade_tfhd7v: 'G11-uade-only',
  uade_tfhdpro: 'G11-uade-only',
  uade_tfmx1_5: 'G11-uade-only',
  uade_tfmx7v: 'G11-uade-only',
  uade_tfmxpro: 'G11-uade-only',
  uade_vss: 'G11-uade-only',
  uade_ah: 'G11-uade-only',
  uade_bvs: 'G11-uade-only',
  uade_cba: 'G11-uade-only',
  uade_chip: 'G11-uade-only',
  uade_cd: 'G11-uade-only',
  uade_dlw: 'G11-uade-only',
  uade_fp2: 'G11-uade-only',
  uade_fredmon: 'G11-uade-only',
  uade_mxt: 'G11-uade-only',
  uade_mxtx: 'G11-uade-only',
  uade_nt: 'G11-uade-only',
  uade_ntsp: 'G11-uade-only',
  uade_psum: 'G11-uade-only',
  uade_rhst: 'G11-uade-only',
  uade_rkl: 'G11-uade-only',
  uade_sc2: 'G11-uade-only',
  uade_sil: 'G11-uade-only',
  uade_tomy: 'G11-uade-only',
  uade_st: 'G11-uade-only',
  uade_ins: 'G11-uade-only',
};

/** Direct decodes of a stored pattern format (or libopenmpt). */
export const DIRECT_GRIDS: readonly string[] = [
  'fur', 'dmf', 'hvl', 'okt', 'med', 'digi', 'deltaMusic2', 'fc', 'soundmon', 'sidmon2', 'soundfx',
  'jamcracker', 'quadraComposer', 'amosMusicBank', 'sonicArranger', 'inStereo2', 'inStereo1',
  'inStereoAmbiguous', 'hippelCoso', 'tfmx', 'artOfNoise', 'digitalSymphony', 'graoumfTracker2',
  'symphoniePro', 'digiBoosterPro', 'pumaTracker', 'synthesis', 'digitalSoundStudio',
  'chuckBiscuits', 'iceTracker', 'gameMusicCreator', 'faceTheMusic', 'soundControl', 'kris',
  'deltaMusic1', 'ams', 'iffSmus', 'richardJoseph', 'daveLowe', 'pt36', 'jeroenTel',
  'zoundMonitor', 'tcbTracker', 'steveTurner', 'musicMaker', 'maxTrax', 'fashionTracker',
  'soundPlayer', 'peterVerswyvelenPacker', 'anders0land', 'robHubbardST', 'goatTracker',
  'sidFactory2', 'cheesecutter', 'stoneTracker', 'tfmMusicMaker', 'composer667', 'fmTracker',
  'imagoOrpheus', 'cdfm67', 'easyTrax', 'karlMorton', 'xmf', 'madTracker2', 'psm', 'unic', 'mtm',
  '669', 'far', 'plm', 'ult', 'rtm', 'dsm', 'dtm', 'stm', 'stx', 'nru', 'ptm', 'gdm', 'stk', 'stp',
  'mdl', 'amf', 'j2b', 'mo3', 'itp', 'nst', 'wow', 'kt', 'xrns', 'mod', 'xm', 'it', 's3m',
];

export function gridProvenanceOf(key: string): GridProvenance | null {
  const base = ((): GridProvenance | null => {
    if (key in WALK_GRIDS) return { source: 'WALK', oracleTest: WALK_GRIDS[key] };
    if (key in RECONSTRUCTED_GRIDS) return { source: 'RECONSTRUCTED', planUnit: RECONSTRUCTED_GRIDS[key] };
    if (key in SCOPE_GRIDS) return { source: 'SCOPE', reason: SCOPE_GRIDS[key] };
    if (DIRECT_GRIDS.includes(key)) return { source: 'DIRECT' };
    return null;
  })();
  if (!base) return base;
  return {
    ...base,
    ...(key in EXPORT_ROUND_TRIP ? { exportRoundTrip: EXPORT_ROUND_TRIP[key] } : {}),
    ...(key in LIVE_EDIT ? { liveEdit: LIVE_EDIT[key] } : {}),
    ...(key in LIVE_WHILE_PLAYING ? { liveWhilePlaying: LIVE_WHILE_PLAYING[key] } : {}),
  };
}
