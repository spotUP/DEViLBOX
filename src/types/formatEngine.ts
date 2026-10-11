/**
 * Format engine preference types. A leaf module (no imports) so the filename
 * matcher, and through it the API server, can name them without pulling in
 * the settings store.
 */

/**
 * Format engine preference: which engine to use for formats supported by multiple paths.
 * 'native' = dedicated TypeScript parser (libopenmpt, HivelyParser, MEDParser, etc.)
 * 'uade'   = UADE 68k emulation (authentic Amiga hardware playback via Paula chip)
 */
export type FormatEngineChoice = 'native' | 'uade';

/**
 * UADE import mode: how to handle UADE-only formats (130+ exotic Amiga formats).
 * 'enhanced' = Extract real PCM samples + detect effects → fully editable song
 * 'classic'  = UADE playback engine with display-only patterns
 */
export type UADEImportMode = 'enhanced' | 'classic';

export interface FormatEnginePreferences {
  mod: FormatEngineChoice;     // .mod → libopenmpt/MODParser vs UADE
  hvl: FormatEngineChoice;     // .hvl/.ahx → HivelyParser vs UADE
  med: FormatEngineChoice;     // .med/.mmd0-3 → MEDParser vs UADE
  fc: FormatEngineChoice;      // .fc/.fc13/.fc14/.sfc → FCParser vs UADE
  okt: FormatEngineChoice;     // .okt → OktalyzerParser vs UADE
  digi: FormatEngineChoice;    // .digi → DigiBoosterParser vs UADE
  soundmon: FormatEngineChoice; // .bp/.bp3/.sndmon → SoundMonParser vs UADE
  sidmon2: FormatEngineChoice;  // .sid2/.smn → SidMon2Parser vs UADE
  fred: FormatEngineChoice;     // .fred → FredEditorParser vs UADE
  soundfx: FormatEngineChoice;  // .sfx/.sfx13 → SoundFXParser vs UADE
  mugician: FormatEngineChoice;  // .dmu/.mug → DigitalMugicianParser vs UADE
  tfmx: FormatEngineChoice;    // .tfmx/.mdat/.tfx → TFMXParser vs UADE
  hippelCoso: FormatEngineChoice; // .hipc/.soc/.coso → HippelCoSoParser vs UADE
  sidmon1: FormatEngineChoice;    // .sid1/.smn (magic) → SidMon1Parser vs UADE
  davidWhittaker: FormatEngineChoice; // .dw/.dwold → DavidWhittakerParser vs UADE
  deltaMusic2: FormatEngineChoice;    // .dm2 → DeltaMusic2Parser vs UADE
  artOfNoise: FormatEngineChoice;     // .aon/.aon8 → ArtOfNoiseParser vs UADE
  benDaglish: FormatEngineChoice;     // bd.* → BenDaglishParser vs UADE
  sonicArranger: FormatEngineChoice;  // .sa/.sonic → SonicArrangerParser vs UADE
  inStereo1: FormatEngineChoice;      // .is/.is10 → InStereo1Parser vs UADE
  inStereo2: FormatEngineChoice;      // .is/.is20 → InStereo2Parser vs UADE
  pumaTracker: FormatEngineChoice;    // .puma → PumaTrackerParser vs UADE
  synthesis: FormatEngineChoice;      // .syn → SynthesisParser vs UADE
  musicAssembler: FormatEngineChoice; // .ma → MusicAssemblerParser vs UADE
  digitalSoundStudio: FormatEngineChoice; // .dss → DigitalSoundStudioParser vs UADE
  digitalSymphony: FormatEngineChoice;    // .dsym → DigitalSymphonyParser vs UADE
  imagoOrpheus: FormatEngineChoice;       // .imf → ImagoOrpheusParser vs OpenMPT
  cdfm67: FormatEngineChoice;             // .c67 → CDFM67Parser vs OpenMPT
  easyTrax: FormatEngineChoice;           // .etx → EasyTraxParser vs OpenMPT
  karlMorton: FormatEngineChoice;         // .mus → KarlMortonParser vs OpenMPT
  ams: FormatEngineChoice;                // .ams → AMSParser (Extreme's Tracker / Velvet Studio) vs UADE
  xTracker: FormatEngineChoice;           // .dmf (X-Tracker) → XTrackerParser vs UADE
  xmf: FormatEngineChoice;               // .xmf → XMFParser (Astroidea/Imperium Galactica)
  uax: FormatEngineChoice;               // .uax → UAXParser (Unreal Audio Package ripper)
  // Additional Amiga formats with native parsers
  graoumfTracker2: FormatEngineChoice;    // .gt2/.gtk → GraoumfTracker2Parser vs UADE
  symphoniePro: FormatEngineChoice;       // .symmod → SymphonieProParser vs UADE
  chuckBiscuits: FormatEngineChoice;      // .cba → ChuckBiscuitsParser vs libopenmpt (UADE cannot play it)
  speedySystem: FormatEngineChoice;       // .ss → SpeedySystemParser vs UADE
  tronic: FormatEngineChoice;             // .trc/.dp/.tro → TronicParser vs UADE
  suntronic: FormatEngineChoice;          // .sun/.tsm → SunTronic/TSM via UADE
  digiBoosterPro: FormatEngineChoice;     // .dbm → DigiBoosterProParser vs UADE
  gameMusicCreator: FormatEngineChoice;   // .gmc → GameMusicCreatorParser vs UADE
  faceTheMusic: FormatEngineChoice;       // .ftm → FaceTheMusicParser vs UADE
  soundControl: FormatEngineChoice;       // .sc/.sct → SoundControlParser vs UADE
  soundFactory: FormatEngineChoice;       // .psf → SoundFactoryParser vs UADE
  actionamics: FormatEngineChoice;        // .act → ActionamicsParser vs UADE
  activisionPro: FormatEngineChoice;      // .avp/.mw → ActivisionProParser vs UADE
  ronKlaren: FormatEngineChoice;          // .rk/.rkb → RonKlarenParser vs UADE
  deltaMusic1: FormatEngineChoice;    // .dm/.dm1 → DeltaMusic1Parser vs UADE
  pt36: FormatEngineChoice;           // FORM+MODL → PT36Parser vs libopenmpt
  // Newly wired parsers (2026-02-26 batch)
  musicLine: FormatEngineChoice;      // .ml → MusicLineParser (native only; falls through to medley if magic mismatch)
  medley: FormatEngineChoice;         // .ml → MedleyParser vs UADE
  markCooksey: FormatEngineChoice;    // mc.*/mcr.*/mco.* → MarkCookseyParser vs UADE
  jeroenTel: FormatEngineChoice;      // jt.*/mon_old.* → JeroenTelParser vs UADE
  quartet: FormatEngineChoice;        // qpa.*/sqt.*/qts.* → QuartetParser vs UADE
  soundMaster: FormatEngineChoice;    // sm.*/sm1.*/sm2.*/sm3.*/smpro.* → SoundMasterParser vs UADE
  amosMusicBank: FormatEngineChoice;  // .abk → AmosMusicBankParser (native only)
  iceTracker: FormatEngineChoice;     // .ice → IceTrackerParser (native only)
  zoundMonitor: FormatEngineChoice;   // sng.* → ZoundMonitorParser vs UADE
  synthPack: FormatEngineChoice;      // osp.* → SynthPackParser vs UADE
  tcbTracker: FormatEngineChoice;     // tcb.* → TCBTrackerParser vs UADE
  mmdc: FormatEngineChoice;           // mmdc.* → MMDCParser vs UADE
  psa: FormatEngineChoice;            // psa.* → PSAParser vs UADE
  steveTurner: FormatEngineChoice;    // jpo.*/jpold.* → SteveTurnerParser vs UADE
  tme: FormatEngineChoice;            // .tme/tme.* → TMEParser vs UADE
  jasonBrooke: FormatEngineChoice;    // jcb.*/jcbo.*/jb.* → JasonBrookeParser vs UADE
  laxity: FormatEngineChoice;         // powt.*/pt.* → LaxityParser vs UADE
  fredGray: FormatEngineChoice;       // gray.* → FredGrayParser vs UADE
  musicMaker4V: FormatEngineChoice;   // mm4.*/sdata.* → MusicMaker4V vs UADE
  musicMaker8V: FormatEngineChoice;   // mm8.* → MusicMaker8V vs UADE
  maniacsOfNoise: FormatEngineChoice; // mon.* → ManiacsOfNoiseParser vs UADE
  // Newly wired parsers (2026-02-27 batch)
  ufo: FormatEngineChoice;            // .ufo/.mus → UFOParser vs UADE
  iffSmus: FormatEngineChoice;        // .smus/.snx/.tiny → IffSmusParser vs UADE
  magneticFieldsPacker: FormatEngineChoice; // .mfp/mfp.* → MagneticFieldsPackerParser vs UADE
  richardJoseph: FormatEngineChoice;  // .rjp/rjp.* → RichardJosephParser vs UADE
  daveLowe: FormatEngineChoice;       // .dl/dl.*/dl_deli → DaveLoweParser vs UADE
  lme: FormatEngineChoice;            // .lme/lme.* → LMEParser vs UADE
  jochenHippelST: FormatEngineChoice; // mdst.* → JochenHippelSTParser vs UADE
  specialFX: FormatEngineChoice;      // doda.* → SpecialFXParser vs UADE
  // Newly wired parsers (2026-02-27 batch 3)
  timeTracker: FormatEngineChoice;      // tmk.* → TimeTrackerParser vs UADE
  kris: FormatEngineChoice;             // kris.* → KRISParser vs UADE
  cinemaware: FormatEngineChoice;       // cin.* → CinemawareParser vs UADE
  novoTradePacker: FormatEngineChoice;  // ntp.* → NovoTradePackerParser vs UADE
  alcatrazPacker: FormatEngineChoice;   // alp.* → AlcatrazPackerParser vs UADE
  bladePacker: FormatEngineChoice;      // uds.* → BladePackerParser vs UADE
  tomyTracker: FormatEngineChoice;      // sg.* → TomyTrackerParser vs UADE
  imagesMusicSystem: FormatEngineChoice; // ims.* (prefix form) → ImagesMusicSystemParser vs UADE
  fashionTracker: FormatEngineChoice;   // ex.* → FashionTrackerParser vs UADE
  multiMediaSound: FormatEngineChoice;  // mms.*/sfx20.* → MultiMediaSoundParser vs UADE
  seanConran: FormatEngineChoice;       // scr.* → SeanConranParser vs UADE
  thomasHermann: FormatEngineChoice;    // thm.* → ThomasHermannParser vs UADE
  titanicsPacker: FormatEngineChoice;   // tits.* → TitanicsPackerParser vs UADE
  krisHatlelid: FormatEngineChoice;     // kh.* → KrisHatlelidParser vs UADE
  ntsp: FormatEngineChoice;             // two.* → NTSPParser vs UADE
  moshPacker: FormatEngineChoice;       // mosh.* → MoshPackerParser vs UADE
  coreDesign: FormatEngineChoice;       // core.* → CoreDesignParser vs UADE
  jankoMrsicFlogel: FormatEngineChoice; // jmf.* → JankoMrsicFlogelParser vs UADE
  soundPlayer: FormatEngineChoice;      // sjs.* → SoundPlayerParser vs UADE
  nickPellingPacker: FormatEngineChoice; // npp.* → NickPellingPackerParser vs UADE
  peterVerswyvelenPacker: FormatEngineChoice; // pvp.* → PeterVerswyvelenPackerParser vs UADE
  wallyBeben: FormatEngineChoice;       // wb.* → WallyBebenParser vs UADE
  steveBarrett: FormatEngineChoice;     // sb.* → SteveBarrettParser vs UADE
  paulSummers: FormatEngineChoice;      // snk.* → PaulSummersParser vs UADE
  desire: FormatEngineChoice;           // dsr.* → DesireParser vs UADE
  martinWalker: FormatEngineChoice;     // avp.*/mw.* (prefix) → MartinWalkerParser vs UADE
  paulShields: FormatEngineChoice;      // ps.* → PaulShieldsParser vs UADE
  paulRobotham: FormatEngineChoice;     // dat.* → PaulRobothamParser vs UADE
  pierreAdane: FormatEngineChoice;      // pap.* → PierreAdaneParser vs UADE
  anders0land: FormatEngineChoice;      // hot.* → Anders0landParser vs UADE
  andrewParton: FormatEngineChoice;     // bye.* → AndrewPartonParser vs UADE
  customMade: FormatEngineChoice;       // cm.*/rk.*/rkb.* → CustomMadeParser vs UADE
  benDaglishSID: FormatEngineChoice;    // bds.* → BenDaglishSIDParser vs UADE
  digitalSonixChrome: FormatEngineChoice; // dsc.* → DigitalSonixChromeParser vs UADE
  jesperOlsen: FormatEngineChoice;      // jo.* → JesperOlsenParser vs UADE
  kimChristensen: FormatEngineChoice;   // kim.* → KimChristensenParser vs UADE
  ashleyHogg: FormatEngineChoice;       // ash.* → AshleyHoggParser vs UADE
  adpcmMono: FormatEngineChoice;        // adpcm.* → ADPCMmonoParser vs UADE
  janneSalmijarvi: FormatEngineChoice;  // js.* → JanneSalmijarviParser vs UADE
  jochenHippel7V: FormatEngineChoice;   // hip7.*/s7g.* → JochenHippel7VParser vs UADE
  maximumEffect: FormatEngineChoice;    // max.* → MaximumEffectParser vs UADE
  midiLoriciel: FormatEngineChoice;     // midi.* → MIDILoricielParser vs UADE
  onEscapee: FormatEngineChoice;        // one.* → OnEscapeeParser vs UADE
  paulTonge: FormatEngineChoice;        // pat.* → PaulTongeParser vs UADE
  robHubbardST: FormatEngineChoice;     // rho.* → RobHubbardSTParser vs UADE
  robHubbard: FormatEngineChoice;       // rh.* → RobHubbardParser vs UADE
  glueMonParser: FormatEngineChoice;    // glue.*/gm.* → GlueMonParser vs UADE
  davidHanney: FormatEngineChoice;      // dh.* → DavidHanneyParser vs UADE
  // Newly wired parsers (2026-02-27 batch 4)
  futurePlayer: FormatEngineChoice;     // .fp/fp.* → FuturePlayerParser vs UADE
  jasonPage: FormatEngineChoice;        // jpn.*/jpnd.*/jp.* → JasonPageParser vs UADE
  infogrames: FormatEngineChoice;       // .dum → InfogramesParser vs UADE
  sawteeth: FormatEngineChoice;         // .st → SawteethParser vs UADE
  fmTracker: FormatEngineChoice;        // .fmt → FMTrackerParser vs libopenmpt
  madTracker2: FormatEngineChoice;      // .mt2 → MadTracker2Parser vs libopenmpt
  psm: FormatEngineChoice;              // .psm → PSMParser vs libopenmpt
  composer667: FormatEngineChoice;      // .667 → Composer667Parser vs libopenmpt
  kt: FormatEngineChoice;               // .kt/.ki → KlysParser (native klystrack)
  earAche: FormatEngineChoice;          // .ea/ea.* → EarAcheParser vs UADE
  scumm: FormatEngineChoice;            // .scumm/scumm.* → SCUMMParser vs UADE
  // Wanted Team Dave Lowe-derived formats
  soprol: FormatEngineChoice;           // .spl/spl.* → WantedTeamDaveLoweParser vs UADE
  riffRaff: FormatEngineChoice;         // .riff/riff.* → WantedTeamDaveLoweParser vs UADE
  howieDavies: FormatEngineChoice;      // .hd/hd.* → WantedTeamDaveLoweParser vs UADE
  beathovenSynthesizer: FormatEngineChoice; // .bss/bss.* → WantedTeamDaveLoweParser vs UADE
  seanConnolly: FormatEngineChoice;     // .scn/scn.* → SeanConnollyParser vs UADE
  // Simple stub parsers (filename-based title, UADE classic audio)
  dariusZendeh: FormatEngineChoice;     // .dz/dz.* → SimpleAmigaStubParser vs UADE
  silmarils: FormatEngineChoice;        // .mok/mok.* → SimpleAmigaStubParser vs UADE
  markII: FormatEngineChoice;           // .mk2/mk2.* → SimpleAmigaStubParser vs UADE
  artAndMagic: FormatEngineChoice;      // .aam/aam.* → SimpleAmigaStubParser vs UADE
  sonicArrangerSas: FormatEngineChoice; // .sas/sas.* → SimpleAmigaStubParser vs UADE
  mikeDavies: FormatEngineChoice;       // .md/md.* → SimpleAmigaStubParser vs UADE
  aProSys: FormatEngineChoice;          // .aps/aps.* → SimpleAmigaStubParser vs UADE
  leggless: FormatEngineChoice;         // .lme/lme.* → SimpleAmigaStubParser vs UADE
  uade: UADEImportMode;        // UADE-only formats → enhanced (editable) vs classic (playback-only)
}
