/**
 * Settings Store - Global engine & audio configuration
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist } from 'zustand/middleware';

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

/**
 * C64 SID player engine selection (5 engines available from DeepSID).
 */
export type SIDEngineType = 'jssid' | 'websid' | 'tinyrsid' | 'websidplay' | 'jsidplay2';

export interface CRTParams {
  scanlineIntensity: number;  // 0–1
  scanlineCount:     number;  // 50–1200
  adaptiveIntensity: number;  // 0–1
  brightness:        number;  // 0.6–1.8
  contrast:          number;  // 0.6–1.8
  saturation:        number;  // 0–2
  bloomIntensity:    number;  // 0–1.5
  bloomThreshold:    number;  // 0–1
  rgbShift:          number;  // 0–1
  vignetteStrength:  number;  // 0–2
  curvature:         number;  // 0–0.5
  flickerStrength:   number;  // 0–0.15
}

export const CRT_DEFAULT_PARAMS: CRTParams = {
  scanlineIntensity: 0.15,
  scanlineCount:     400,
  adaptiveIntensity: 0.5,
  brightness:        1.1,
  contrast:          1.05,
  saturation:        1.1,
  bloomIntensity:    0.2,
  bloomThreshold:    0.5,
  rgbShift:          0.0,
  vignetteStrength:  0.3,
  curvature:         0.15,
  flickerStrength:   0.01,
};

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
  chuckBiscuits: FormatEngineChoice;      // .cba → ChuckBiscuitsParser vs UADE
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

interface SettingsStore {
  // Engine Settings
  amigaLimits: boolean;      // Clamp periods to 113-856 (MOD/S3M/IT)
  linearInterpolation: boolean; // Enable linear interpolation for sample playback
  masterTuning: number;      // Master tuning in Hz (default 440)

  // Format Engine Preferences
  formatEngine: FormatEnginePreferences;
  
  // C64 SID Engine
  sidEngine: SIDEngineType;  // Default SID player engine (websid recommended)
  
  // SID Hardware Output
  sidHardwareMode: 'off' | 'asid' | 'webusb';  // Hardware output transport
  asidEnabled: boolean;          // Enable ASID hardware output (legacy, kept for compat)
  asidDeviceId: string | null;   // Selected MIDI device ID
  asidDeviceAddress: number;     // ASID device address (0x4D for USB-SID-Pico)
  webusbClockRate: number;       // 0=default, 1=PAL, 2=NTSC, 3=DREAN
  webusbStereo: boolean;         // Mono (false) or stereo (true)

  // Audio Settings
  performanceQuality: 'high' | 'medium' | 'low';
  useBLEP: boolean;          // Enable BLEP (Band-Limited Step) synthesis to reduce aliasing
  stereoSeparation: number;  // 0-100% stereo separation (20 = Amiga default, 100 = full)
  stereoSeparationMode: 'pt2' | 'modplug';
  modplugSeparation: number;    // 0–200% (OpenMPT scale; 0=mono, 100=normal, 200=enhanced)

  // MIDI Settings
  midiPolyphonic: boolean;   // Enable polyphonic MIDI playback (multiple simultaneous notes)

  // Visual Settings
  trackerVisualBg: boolean;  // Enable WebGL visual background behind tracker pattern
  trackerVisualMode: number; // Current visualizer mode index (0-5)
  channelColorBlend: number; // Channel color background tint opacity (0-100, default 8)
  vjPatternOverlay: boolean; // Show pattern data overlay on VJ view
  vuMeterMode: 'trigger' | 'realtime'; // VU meter mode: trigger=note-on, realtime=continuous audio levels
  vuMeterStyle: 'segments' | 'fill'; // VU meter style: segments=LED bars, fill=solid background
  vuMeterSwing: boolean; // Enable sine wave swing animation on VU meters
  vuMeterMirror: boolean; // Mirror VU meters downward (from top of pattern editor)
  customBannerImage: string | null; // Base64 data URL for custom banner image
  wobbleWindows: boolean; // Compiz-style wobbly windows in GL UI
  maxHeadroomMode: boolean; // Max Headroom glitchy AI head behavior in VJ view

  // CRT Shader
  crtEnabled: boolean;
  crtParams:  CRTParams;

  // Lens Distortion
  lensEnabled: boolean;
  lensPreset:  string;   // LensPreset key
  lensParams:  { barrel: number; chromatic: number; vignette: number };

  // Render Mode
  renderMode: 'dom' | 'webgl';  // UI rendering: 'dom' = React/Tailwind, 'webgl' = PixiJS

  // Startup jingle
  welcomeJingleEnabled: boolean;

  // Actions
  setAmigaLimits: (enabled: boolean) => void;
  setLinearInterpolation: (enabled: boolean) => void;
  setMasterTuning: (hz: number) => void;
  setFormatEngine: (format: keyof FormatEnginePreferences, engine: FormatEngineChoice | UADEImportMode) => void;
  setSidEngine: (engine: SIDEngineType) => void;
  setSidHardwareMode: (mode: 'off' | 'asid' | 'webusb') => void;
  setAsidEnabled: (enabled: boolean) => void;
  setAsidDeviceId: (deviceId: string | null) => void;
  setAsidDeviceAddress: (address: number) => void;
  setWebusbClockRate: (rate: number) => void;
  setWebusbStereo: (stereo: boolean) => void;
  setPerformanceQuality: (quality: 'high' | 'medium' | 'low') => void;
  setUseBLEP: (enabled: boolean) => void;
  setStereoSeparation: (percent: number) => void;
  setStereoSeparationMode: (mode: 'pt2' | 'modplug') => void;
  setModplugSeparation: (percent: number) => void;
  setMidiPolyphonic: (enabled: boolean) => void;
  setTrackerVisualBg: (enabled: boolean) => void;
  setTrackerVisualMode: (mode: number) => void;
  setChannelColorBlend: (blend: number) => void;
  setVjPatternOverlay: (enabled: boolean) => void;
  setVuMeterMode: (mode: 'trigger' | 'realtime') => void;
  setVuMeterStyle: (style: 'segments' | 'fill') => void;
  setVuMeterSwing: (enabled: boolean) => void;
  setVuMeterMirror: (enabled: boolean) => void;
  setCustomBannerImage: (dataUrl: string | null) => void;
  setWobbleWindows: (enabled: boolean) => void;
  setMaxHeadroomMode: (enabled: boolean) => void;
  setRenderMode: (mode: 'dom' | 'webgl') => void;
  setWelcomeJingleEnabled: (v: boolean) => void;
  setCrtEnabled:  (enabled: boolean) => void;
  setCrtParam:    (param: keyof CRTParams, value: number) => void;
  resetCrtParams: () => void;
  setLensEnabled: (enabled: boolean) => void;
  setLensPreset:  (preset: string) => void;
  setLensParam:   (param: 'barrel' | 'chromatic' | 'vignette', value: number) => void;
  resetLensParams: () => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    immer((set) => ({
      // Initial state
      amigaLimits: false,
      linearInterpolation: true,
      masterTuning: 440,
      sidEngine: 'websid',  // Recommended default: fast + accurate WASM reSID
      formatEngine: {
        mod: 'native',      // libopenmpt — full sample extraction + effects
        hvl: 'native',      // HivelyParser — WebAudio synthesis
        med: 'native',      // MEDParser — dedicated OctaMED support
        fc: 'native',       // FCParser — full sample extraction + effects
        okt: 'native',      // OktalyzerParser — dedicated Oktalyzer support
        digi: 'native',     // DigiBoosterParser — dedicated DigiBooster support
        soundmon: 'native', // SoundMonParser — dedicated SoundMon support
        sidmon2: 'native',  // SidMon2Parser — dedicated SidMon II support
        fred: 'native',     // FredEditorParser — dedicated Fred Editor support
        soundfx: 'native',  // SoundFXParser — dedicated Sound-FX support
        mugician: 'native', // DigitalMugicianParser — dedicated Digital Mugician support
        tfmx: 'native',         // TFMXParser — dedicated Jochen Hippel TFMX support
        hippelCoso: 'native',   // HippelCoSoParser — dedicated Jochen Hippel CoSo support
        sidmon1: 'native',      // SidMon1Parser — dedicated SidMon 1.0 support
        davidWhittaker: 'native', // DavidWhittakerParser — dedicated David Whittaker support
        deltaMusic2: 'native',  // DeltaMusic2Parser — dedicated Delta Music 2.0 support
        artOfNoise: 'native',   // ArtOfNoiseParser — dedicated Art of Noise support
        benDaglish: 'uade',   // BenDaglishParser — dedicated Ben Daglish support
        sonicArranger: 'native', // SonicArrangerParser — dedicated Sonic Arranger support
        inStereo1: 'uade',    // InStereo1Parser — dedicated InStereo! 1.0 support
        inStereo2: 'uade',    // InStereo2Parser — dedicated InStereo! 2.0 support
        pumaTracker: 'native',      // PumaTrackerParser — dedicated PumaTracker support
        synthesis: 'uade',        // SynthesisParser — dedicated Synthesis support
        musicAssembler: 'native',   // MusicAssemblerParser — dedicated Music Assembler support
        digitalSoundStudio: 'native', // DigitalSoundStudioParser — dedicated Digital Sound Studio support
        digitalSymphony: 'native',    // DigitalSymphonyParser — dedicated Digital Symphony support
        imagoOrpheus: 'uade',     // ImagoOrpheusParser — dedicated Imago Orpheus support
        cdfm67: 'uade',           // CDFM67Parser — dedicated CDFM Composer 670 support
        easyTrax: 'uade',         // EasyTraxParser — dedicated EasyTrax support
        karlMorton: 'uade',       // KarlMortonParser — dedicated Karl Morton Music Format support
        ams: 'native',              // AMSParser — Extreme's Tracker / Velvet Studio support
        xTracker: 'uade',         // XTrackerParser — dedicated X-Tracker DMF support
        xmf: 'uade',              // XMFParser — dedicated Astroidea XMF support
        uax: 'uade',              // UAXParser — Unreal Audio Package sound ripper
        graoumfTracker2: 'uade',  // GraoumfTracker2Parser — dedicated Graoumf Tracker 1/2 support
        symphoniePro: 'native',     // SymphonieProParser — dedicated Symphonie Pro support
        chuckBiscuits: 'uade',    // ChuckBiscuitsParser — dedicated Chuck Biscuits / Black Artist support
        speedySystem: 'uade',       // SpeedySystemParser — prefer UADE (DOC RAM samples required)
        tronic: 'uade',             // TronicParser — no native parser; always UADE
        suntronic: 'uade',          // SunTronic/TSM — UADE only
        digiBoosterPro: 'native',   // DigiBoosterProParser — dedicated DigiBooster Pro (.dbm) support
        gameMusicCreator: 'uade',   // GameMusicCreatorParser — prefer UADE (complex synthesis)
        faceTheMusic: 'native',     // FaceTheMusicParser — native parser available
        soundControl: 'uade',     // SoundControlParser — native parser available
        soundFactory: 'native',   // SoundFactoryParser — native + UADE injection for 1:1 audio
        actionamics: 'native',      // ActionamicsParser — native parser available
        activisionPro: 'native',    // ActivisionProParser — native parser available
        ronKlaren: 'uade',        // RonKlarenParser — native parser available
        deltaMusic1: 'native',  // DeltaMusic1Parser — native parser available
        pt36: 'uade',         // PT36Parser — native parser available
        musicLine: 'native',      // MusicLineParser — native parser (magic-byte gated)
        medley: 'uade',         // MedleyParser — dedicated Medley support
        markCooksey: 'uade',    // MarkCookseyParser — dedicated Mark Cooksey support
        jeroenTel: 'uade',      // JeroenTelParser — dedicated Jeroen Tel support
        quartet: 'uade',        // QuartetParser — dedicated Quartet support
        soundMaster: 'uade',    // SoundMasterParser — dedicated SoundMaster support
        amosMusicBank: 'uade',  // AmosMusicBankParser — native only
        iceTracker: 'native',     // IceTrackerParser — native only
        zoundMonitor: 'uade',   // ZoundMonitorParser — dedicated ZoundMonitor support
        synthPack: 'uade',      // SynthPackParser — dedicated SynthPack support
        tcbTracker: 'uade',     // TCBTrackerParser — dedicated TCB Tracker support
        mmdc: 'uade',           // MMDCParser — dedicated MMDC support
        psa: 'uade',            // PSAParser — dedicated PSA support
        steveTurner: 'native',  // SteveTurnerParser — native parses patterns + subsongs, UADE handles audio
        tme: 'uade',            // TMEParser — dedicated TME support
        jasonBrooke: 'uade',    // JasonBrookeParser — dedicated Jason Brooke support
        laxity: 'uade',         // LaxityParser — dedicated Laxity support
        fredGray: 'uade',       // FredGrayParser — dedicated Fred Gray support
        musicMaker4V: 'uade',   // MusicMakerParser — dedicated Music Maker 4V support
        musicMaker8V: 'uade',   // MusicMakerParser — dedicated Music Maker 8V support
        maniacsOfNoise: 'native', // ManiacsOfNoiseParser — filename title + UADE classic audio
        ufo: 'uade',            // UFOParser — dedicated UFO/MicroProse support
        iffSmus: 'native',        // IffSmusParser — dedicated IFF SMUS support
        magneticFieldsPacker: 'uade', // MagneticFieldsPackerParser — dedicated MFP support
        richardJoseph: 'native',  // RichardJosephParser — dedicated Richard Joseph support
        daveLowe: 'uade',       // DaveLoweParser — dedicated Dave Lowe support
        lme: 'uade',            // LMEParser — dedicated Leggless Music Editor support
        jochenHippelST: 'native', // JochenHippelSTParser — Hippel WASM engine (libtfmxaudiodecoder)
        specialFX: 'uade',      // SpecialFXParser — dedicated Special FX ST support
        timeTracker: 'uade',          // TimeTrackerParser — dedicated TimeTracker support
        kris: 'native',                 // KRISParser — dedicated ChipTracker/KRIS support
        cinemaware: 'uade',           // CinemawareParser — dedicated Cinemaware support
        novoTradePacker: 'uade',      // NovoTradePackerParser — dedicated NovoPacker support
        alcatrazPacker: 'uade',       // AlcatrazPackerParser — dedicated Alcatraz Packer support
        bladePacker: 'uade',          // BladePackerParser — dedicated Blade Packer support
        tomyTracker: 'uade',          // TomyTrackerParser — dedicated Tomy Tracker support
        imagesMusicSystem: 'uade',    // ImagesMusicSystemParser — dedicated IMS prefix support
        fashionTracker: 'uade',       // FashionTrackerParser — dedicated Fashion Tracker support
        multiMediaSound: 'uade',      // MultiMediaSoundParser — dedicated MultiMedia Sound support
        seanConran: 'uade',           // SeanConranParser — dedicated Sean Conran support
        thomasHermann: 'uade',        // ThomasHermannParser — dedicated Thomas Hermann support
        titanicsPacker: 'uade',       // TitanicsPackerParser — dedicated Titanics Packer support
        krisHatlelid: 'uade',         // KrisHatlelidParser — dedicated Kris Hatlelid support
        ntsp: 'uade',                 // NTSPParser — dedicated NTSP System support
        moshPacker: 'uade',           // MoshPackerParser — dedicated Mosh Packer support
        coreDesign: 'uade',           // CoreDesignParser — dedicated Core Design support
        jankoMrsicFlogel: 'uade',     // JankoMrsicFlogelParser — dedicated JMF support
        soundPlayer: 'uade',          // SoundPlayerParser — dedicated Sound Player support
        nickPellingPacker: 'uade',    // NickPellingPackerParser — dedicated NPP support
        peterVerswyvelenPacker: 'uade', // PeterVerswyvelenPackerParser — dedicated PVP support
        wallyBeben: 'uade',           // WallyBebenParser — dedicated Wally Beben support
        steveBarrett: 'uade',         // SteveBarrettParser — dedicated Steve Barrett support
        paulSummers: 'native',          // PaulSummersParser — dedicated Paul Summers support
        desire: 'uade',               // DesireParser — dedicated Desire support
        martinWalker: 'native',         // MartinWalkerParser — dedicated Martin Walker support
        paulShields: 'uade',          // PaulShieldsParser — dedicated Paul Shields support
        paulRobotham: 'uade',         // PaulRobothamParser — dedicated Paul Robotham support
        pierreAdane: 'uade',          // PierreAdaneParser — dedicated Pierre Adane support
        anders0land: 'native',          // Anders0landParser — dedicated Anders 0land support
        andrewParton: 'uade',         // AndrewPartonParser — dedicated Andrew Parton support
        customMade: 'uade',           // CustomMadeParser — dedicated Custom Made support
        benDaglishSID: 'uade',        // BenDaglishSIDParser — dedicated Ben Daglish SID support
        digitalSonixChrome: 'uade',   // DigitalSonixChromeParser — dedicated DSC support
        jesperOlsen: 'uade',          // JesperOlsenParser — dedicated Jesper Olsen support
        kimChristensen: 'uade',       // KimChristensenParser — dedicated Kim Christensen support
        ashleyHogg: 'uade',           // AshleyHoggParser — dedicated Ashley Hogg support
        adpcmMono: 'uade',            // ADPCMmonoParser — dedicated ADPCM Mono support
        janneSalmijarvi: 'uade',      // JanneSalmijarviParser — dedicated Janne Salmijarvi support
        jochenHippel7V: 'native',       // JochenHippel7VParser — Hippel WASM engine (libtfmxaudiodecoder)
        maximumEffect: 'uade',        // MaximumEffectParser — dedicated Maximum Effect support
        midiLoriciel: 'native',         // MIDILoricielParser — dedicated MIDI Loriciel support
        onEscapee: 'uade',            // OnEscapeeParser — dedicated onEscapee support
        paulTonge: 'uade',            // PaulTongeParser — dedicated Paul Tonge support
        robHubbardST: 'uade',         // RobHubbardSTParser — dedicated Rob Hubbard ST support
        robHubbard: 'native',           // RobHubbardParser — dedicated Rob Hubbard support
        glueMonParser: 'uade',        // GlueMonParser — detection-only, UADE handles audio
        davidHanney: 'uade',          // DavidHanneyParser — detection-only, UADE handles audio
        futurePlayer: 'native',       // Native WASM replayer (transpiled 68k)
        jasonPage: 'uade',          // JasonPageParser — dedicated Jason Page support
        infogrames: 'uade',         // InfogramesParser — dedicated Infogrames support
        sawteeth: 'uade',           // SawteethParser — dedicated Sawteeth support
        fmTracker: 'native',        // FMTrackerParser — dedicated FM Tracker support (UADE can't play PC OPL formats)
        madTracker2: 'native',        // MadTracker2Parser — dedicated MadTracker 2 support
        psm: 'native',              // PSMParser — dedicated PSM/PSM16 support
        composer667: 'uade',        // Composer667Parser — dedicated Composer 667 support
        kt: 'native',                // KlysParser — native klystrack engine
        earAche: 'native',           // EarAcheParser — native pattern display + UADE classic audio
        scumm: 'native',             // SCUMMParser — native pattern display + UADE classic audio
        soprol: 'native',            // WantedTeamDaveLoweParser — SOPROL title + UADE classic audio
        riffRaff: 'native',          // WantedTeamDaveLoweParser — Riff Raff title + UADE classic audio
        howieDavies: 'native',       // WantedTeamDaveLoweParser — Howie Davies title + UADE classic audio
        beathovenSynthesizer: 'native', // WantedTeamDaveLoweParser — BSS title + UADE classic audio
        seanConnolly: 'native',      // SeanConnollyParser — title from embedded header + UADE classic audio
        dariusZendeh: 'native',      // SimpleAmigaStubParser — filename title + UADE classic audio
        silmarils: 'native',         // SimpleAmigaStubParser — filename title + UADE classic audio
        markII: 'native',            // SimpleAmigaStubParser — filename title + UADE classic audio
        artAndMagic: 'native',       // SimpleAmigaStubParser — filename title + UADE classic audio
        sonicArrangerSas: 'native',  // SimpleAmigaStubParser — filename title + UADE classic audio
        mikeDavies: 'native',        // SimpleAmigaStubParser — filename title + UADE classic audio
        aProSys: 'native',           // SimpleAmigaStubParser — filename title + UADE classic audio
        leggless: 'native',          // SimpleAmigaStubParser — filename title + UADE classic audio
        uade: 'enhanced',           // UADE formats — enhanced (editable) by default
      },
      performanceQuality: 'high',
      useBLEP: false,  // Default: BLEP disabled (enable in Settings for band-limited synthesis)
      stereoSeparation: 25,  // Default: 25% — rich mono (slight stereo cues, no harsh Amiga LRRL)
      stereoSeparationMode: 'pt2' as const,
      modplugSeparation: 50,        // Default: 50/200 — equivalent rich mono for ModPlug mode
      midiPolyphonic: true,  // Default: polyphonic enabled for better jamming
      trackerVisualBg: false,  // Default: off
      trackerVisualMode: 0,    // Default: spectrum bars
      channelColorBlend: 8,    // Default: 8% opacity for channel color tint
      vjPatternOverlay: true, // Default: on — pattern data visible in VJ view
      vuMeterMode: 'trigger' as const,  // Default: trigger-based VU (note-on)
      vuMeterStyle: 'segments' as const,  // Default: LED segment style
      vuMeterSwing: true,  // Default: sine wave swing enabled
      vuMeterMirror: false,  // Default: VU meters extend upward
      customBannerImage: null,  // No custom banner by default
      wobbleWindows: false,  // Wobbly windows disabled by default
      maxHeadroomMode: false,
      crtEnabled: false,
      crtParams:  { ...CRT_DEFAULT_PARAMS },
      lensEnabled: false,
      lensPreset: 'off',
      lensParams: { barrel: 0, chromatic: 0, vignette: 0 },
      renderMode: 'dom' as const,  // Default: DOM rendering (GL UI is experimental)
      welcomeJingleEnabled: true,  // Play startup jingle on first interaction

      // SID Hardware defaults
      sidHardwareMode: 'off' as const,
      asidEnabled: false,
      asidDeviceId: null,
      asidDeviceAddress: 0x4D,  // USB-SID-Pico default address
      webusbClockRate: 1,       // PAL by default
      webusbStereo: false,      // Mono by default

    // Actions
    setAmigaLimits: (amigaLimits) =>
      set((state) => {
        state.amigaLimits = amigaLimits;
      }),

    setLinearInterpolation: (linearInterpolation) =>
      set((state) => {
        state.linearInterpolation = linearInterpolation;
      }),

    setMasterTuning: (masterTuning) =>
      set((state) => {
        state.masterTuning = masterTuning;
      }),

    setFormatEngine: (format, engine) =>
      set((state) => {
        (state.formatEngine as Record<string, string>)[format] = engine;
      }),

    setSidEngine: (engine) =>
      set((state) => {
        state.sidEngine = engine;
      }),
      
    setSidHardwareMode: (sidHardwareMode) =>
      set((state) => {
        state.sidHardwareMode = sidHardwareMode;
        // Keep legacy asidEnabled in sync
        state.asidEnabled = sidHardwareMode === 'asid';
      }),

    setAsidEnabled: (asidEnabled) =>
      set((state) => {
        state.asidEnabled = asidEnabled;
        // Sync with new mode field
        if (asidEnabled && state.sidHardwareMode === 'off') {
          state.sidHardwareMode = 'asid';
        } else if (!asidEnabled && state.sidHardwareMode === 'asid') {
          state.sidHardwareMode = 'off';
        }
      }),
      
    setAsidDeviceId: (asidDeviceId) =>
      set((state) => {
        state.asidDeviceId = asidDeviceId;
      }),
      
    setAsidDeviceAddress: (asidDeviceAddress) =>
      set((state) => {
        state.asidDeviceAddress = asidDeviceAddress;
      }),

    setWebusbClockRate: (webusbClockRate) =>
      set((state) => {
        state.webusbClockRate = webusbClockRate;
      }),

    setWebusbStereo: (webusbStereo) =>
      set((state) => {
        state.webusbStereo = webusbStereo;
      }),

    setPerformanceQuality: (performanceQuality) =>
      set((state) => {
        state.performanceQuality = performanceQuality;
      }),

      setUseBLEP: (useBLEP) =>
        set((state) => {
          state.useBLEP = useBLEP;
        }),

      setStereoSeparation: (stereoSeparation) =>
        set((state) => {
          state.stereoSeparation = Math.max(0, Math.min(100, stereoSeparation));
        }),

      setStereoSeparationMode: (stereoSeparationMode) =>
        set((state) => {
          state.stereoSeparationMode = stereoSeparationMode;
        }),

      setModplugSeparation: (modplugSeparation) =>
        set((state) => {
          state.modplugSeparation = Math.max(0, Math.min(200, modplugSeparation));
        }),

      setMidiPolyphonic: (midiPolyphonic) =>
        set((state) => {
          state.midiPolyphonic = midiPolyphonic;
        }),

      setTrackerVisualBg: (trackerVisualBg) =>
        set((state) => {
          state.trackerVisualBg = trackerVisualBg;
        }),

      setTrackerVisualMode: (trackerVisualMode) =>
        set((state) => {
          state.trackerVisualMode = trackerVisualMode;
        }),

      setChannelColorBlend: (channelColorBlend) =>
        set((state) => {
          state.channelColorBlend = Math.max(0, Math.min(100, channelColorBlend));
        }),

      setVjPatternOverlay: (vjPatternOverlay) =>
        set((state) => {
          state.vjPatternOverlay = vjPatternOverlay;
        }),

      setVuMeterMode: (vuMeterMode) =>
        set((state) => {
          state.vuMeterMode = vuMeterMode;
        }),

      setVuMeterStyle: (vuMeterStyle) =>
        set((state) => {
          state.vuMeterStyle = vuMeterStyle;
        }),

      setVuMeterSwing: (vuMeterSwing) =>
        set((state) => {
          state.vuMeterSwing = vuMeterSwing;
        }),

      setVuMeterMirror: (vuMeterMirror) =>
        set((state) => {
          state.vuMeterMirror = vuMeterMirror;
        }),

      setCustomBannerImage: (customBannerImage) =>
        set((state) => {
          state.customBannerImage = customBannerImage;
        }),

      setWobbleWindows: (wobbleWindows) =>
        set((state) => {
          state.wobbleWindows = wobbleWindows;
        }),

      setMaxHeadroomMode: (maxHeadroomMode) =>
        set((state) => {
          state.maxHeadroomMode = maxHeadroomMode;
        }),

      setRenderMode: (renderMode) =>
        set((state) => {
          // Block WebGL mode on mobile phones — GL UI doesn't work on mobile
          if (renderMode === 'webgl' && /iPhone|iPod|Android.*Mobile/i.test(navigator.userAgent)) {
            return;
          }
          state.renderMode = renderMode;
        }),

    setWelcomeJingleEnabled: (v) =>
      set((state) => { state.welcomeJingleEnabled = v; }),

    setCrtEnabled: (crtEnabled) =>
      set((state) => { state.crtEnabled = crtEnabled; }),

    setCrtParam: (param, value) =>
      set((state) => { state.crtParams[param] = value; }),

    resetCrtParams: () =>
      set((state) => { state.crtParams = { ...CRT_DEFAULT_PARAMS }; }),

    setLensEnabled: (lensEnabled) =>
      set((state) => { state.lensEnabled = lensEnabled; }),

    setLensPreset: (preset) =>
      set((state) => { state.lensPreset = preset; }),

    setLensParam: (param, value) =>
      set((state) => { state.lensParams[param] = value; }),

    resetLensParams: () =>
      set((state) => { state.lensParams = { barrel: 0, chromatic: 0, vignette: 0 }; state.lensPreset = 'off'; }),
    })),
    {
      name: 'devilbox-settings',
      version: 6,
      migrate: (persistedState: unknown, version: number) => {
        const s = (persistedState ?? {}) as Record<string, unknown>;
        if (version < 2) {
          // v2: workbench becomes the default UI
          s.renderMode = 'dom';
        }
        if (version < 3) {
          // v3: 88 format engine defaults changed from 'native' to 'uade'.
          // Clear persisted formatEngine so all formats get fresh defaults.
          delete s.formatEngine;
        }
        if (version < 4) {
          // v4: PSM default changed from 'uade' to 'native' (native PSMParser).
          const fe = s.formatEngine as Record<string, unknown> | undefined;
          if (fe && fe.psm === 'uade') fe.psm = 'native';
        }
        if (version < 5) {
          // v5: Stereo separation default changed from 20 (Amiga narrow) to 50
          // (matches libopenmpt default 100/200). Only migrate if still at old default.
          if (s.stereoSeparation === 20) s.stereoSeparation = 50;
        }
        if (version < 6) {
          // v6: Stereo defaults to "rich mono" — 25% PT2 / 50 ModPlug.
          // Migrate users still at old v5 default (50/100).
          if (s.stereoSeparation === 50) s.stereoSeparation = 25;
          if (s.modplugSeparation === 100) s.modplugSeparation = 50;
        }
        return s;
      },
      // Deep-merge formatEngine so new keys added after initial save get their
      // default values rather than being undefined in existing localStorage data.
      merge: (persisted, current) => {
        const p = persisted as Partial<typeof current>;
        return {
          ...current,
          ...p,
          // Always use the hardcoded default for renderMode — never restore from storage
          renderMode: current.renderMode,
          formatEngine: {
            ...current.formatEngine,
            ...(p.formatEngine ?? {}),
          },
        };
      },
      partialize: (state) => ({
        amigaLimits: state.amigaLimits,
        linearInterpolation: state.linearInterpolation,
        masterTuning: state.masterTuning,
        formatEngine: state.formatEngine,
        performanceQuality: state.performanceQuality,
        useBLEP: state.useBLEP,
        stereoSeparation: state.stereoSeparation,
        stereoSeparationMode: state.stereoSeparationMode,
        modplugSeparation: state.modplugSeparation,
        midiPolyphonic: state.midiPolyphonic,
        trackerVisualBg: state.trackerVisualBg,
        trackerVisualMode: state.trackerVisualMode,
        channelColorBlend: state.channelColorBlend,
        vjPatternOverlay: state.vjPatternOverlay,
        vuMeterMode: state.vuMeterMode,
        vuMeterStyle: state.vuMeterStyle,
        vuMeterSwing: state.vuMeterSwing,
        vuMeterMirror: state.vuMeterMirror,
        customBannerImage: state.customBannerImage,
        wobbleWindows: state.wobbleWindows,
        maxHeadroomMode: state.maxHeadroomMode,
        crtEnabled: state.crtEnabled,
        crtParams:  state.crtParams,
        lensEnabled: state.lensEnabled,
        lensPreset:  state.lensPreset,
        lensParams:  state.lensParams,
        sidHardwareMode: state.sidHardwareMode,
        sidEngine: state.sidEngine,
        welcomeJingleEnabled: state.welcomeJingleEnabled,
        // renderMode intentionally not persisted — always start in DOM mode
      }),
    }
  )
);
