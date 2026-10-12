/**
 * Settings Store - Global engine & audio configuration
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist } from 'zustand/middleware';

import type { FormatEngineChoice, UADEImportMode, FormatEnginePreferences } from '@/types/formatEngine';
import type { SidChipModelSetting } from '@/lib/sid/SIDHeaderParser';
export type { FormatEngineChoice, UADEImportMode, FormatEnginePreferences };


/**
 * C64 SID player engine selection (5 engines available from DeepSID).
 */
export type SIDEngineType = 'jssid' | 'websid' | 'tinyrsid' | 'websidplay' | 'jsidplay2';


interface SettingsStore {
  // Engine Settings
  amigaLimits: boolean;      // Clamp periods to 113-856 (MOD/S3M/IT)
  linearInterpolation: boolean; // Enable linear interpolation for sample playback
  masterTuning: number;      // Master tuning in Hz (default 440)

  // Format Engine Preferences
  formatEngine: FormatEnginePreferences;
  
  // C64 SID Engine
  sidEngine: SIDEngineType;  // Default SID player engine (websid recommended)
  /** SID Settings chip model: the header's ('auto') or a forced 6581 / 8580, for every SID engine. */
  sidChipModel: SidChipModelSetting;
  
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
  headphonesMode: boolean;      // Snap stereo separation to 35% + enable SID Haas reduction

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
  maxHeadroomMode: boolean; // Max Headroom glitchy AI head behavior in VJ view

  // Startup jingle
  welcomeJingleEnabled: boolean;
  /** A subsong that ends (silence) starts the next one of the file; off = the song stops, as before. */
  autoAdvanceSubsongs: boolean;
  /** Master FX channel buttons take effect on the next bar line of the playing song. */
  masterFxQuantize: boolean;

  // Actions
  setAmigaLimits: (enabled: boolean) => void;
  setLinearInterpolation: (enabled: boolean) => void;
  setMasterTuning: (hz: number) => void;
  setFormatEngine: (format: keyof FormatEnginePreferences, engine: FormatEngineChoice | UADEImportMode) => void;
  setSidEngine: (engine: SIDEngineType) => void;
  setSidChipModel: (model: SidChipModelSetting) => void;
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
  setHeadphonesMode: (enabled: boolean) => void;
  setMidiPolyphonic: (enabled: boolean) => void;
  setTrackerVisualBg: (enabled: boolean) => void;
  setTrackerVisualMode: (mode: number) => void;
  setChannelColorBlend: (blend: number) => void;
  setVjPatternOverlay: (enabled: boolean) => void;
  setVuMeterMode: (mode: 'trigger' | 'realtime') => void;
  setVuMeterStyle: (style: 'segments' | 'fill') => void;
  setVuMeterSwing: (enabled: boolean) => void;
  setVuMeterMirror: (enabled: boolean) => void;
  setMaxHeadroomMode: (enabled: boolean) => void;
  setWelcomeJingleEnabled: (v: boolean) => void;
  setAutoAdvanceSubsongs: (v: boolean) => void;
  setMasterFxQuantize: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    immer((set) => ({
      // Initial state
      amigaLimits: false,
      linearInterpolation: true,
      masterTuning: 440,
      sidEngine: 'websid',  // Recommended default: fast + accurate WASM reSID
      sidChipModel: 'auto',
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
        imagoOrpheus: 'native',     // ImagoOrpheusParser — dedicated Imago Orpheus support  // PC format: UADE cannot play it (2026-10-05)
        cdfm67: 'native',           // CDFM67Parser — dedicated CDFM Composer 670 support  // PC format: UADE cannot play it (2026-10-05)
        easyTrax: 'native',         // EasyTraxParser — dedicated EasyTrax support  // PC format: UADE cannot play it (2026-10-05)
        karlMorton: 'native',       // KarlMortonParser — dedicated Karl Morton Music Format support  // PC format: UADE cannot play it (2026-10-05)
        ams: 'native',              // AMSParser — Extreme's Tracker / Velvet Studio support
        xTracker: 'uade',         // XTrackerParser — dedicated X-Tracker DMF support
        xmf: 'native',              // XMFParser — dedicated Astroidea XMF support  // PC format: UADE cannot play it (2026-10-05)
        uax: 'native',              // UAXParser — Unreal Audio Package sound ripper  // PC format: UADE cannot play it (2026-10-05)
        graoumfTracker2: 'uade',  // GraoumfTracker2Parser — dedicated Graoumf Tracker 1/2 support
        symphoniePro: 'native',     // SymphonieProParser — dedicated Symphonie Pro support
        chuckBiscuits: 'native',    // ChuckBiscuitsParser — dedicated Chuck Biscuits / Black Artist support  // Atari ST format: UADE (Amiga) cannot play it
        speedySystem: 'uade',       // SpeedySystemParser — prefer UADE (DOC RAM samples required)
        tronic: 'uade',             // TronicParser — no native parser; always UADE
        suntronic: 'native',        // SunTronicV13Parser — native editable engine (V1.3); UADE = offline oracle only
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
        jochenHippelST: 'native', // .hip/.mcmd: Amiga SOG/MCMD stub (libtfmxaudiodecoder) vs UADE; ST songs always decode
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
        composer667: 'native',        // Composer667Parser — dedicated Composer 667 support  // PC format: UADE cannot play it (2026-10-05)
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
      stereoSeparationMode: 'modplug' as const,
      modplugSeparation: 50,        // Default: 50/200 — equivalent rich mono for ModPlug mode
      headphonesMode: false,
      midiPolyphonic: true,  // Default: polyphonic enabled for better jamming
      trackerVisualBg: false,  // Default: off
      trackerVisualMode: 0,    // Default: spectrum bars
      channelColorBlend: 8,    // Default: 8% opacity for channel color tint
      vjPatternOverlay: true, // Default: on — pattern data visible in VJ view
      vuMeterMode: 'trigger' as const,  // Default: trigger-based VU (note-on)
      vuMeterStyle: 'segments' as const,  // Default: LED segment style
      vuMeterSwing: true,  // Default: sine wave swing enabled
      vuMeterMirror: false,  // Default: VU meters extend upward
      maxHeadroomMode: false,
      welcomeJingleEnabled: true,  // Play startup jingle on first interaction
      masterFxQuantize: true,      // Owner, 2026-10-08: channel on/offs in the master FX are quantized, switch on by default
      autoAdvanceSubsongs: true,   // Owner, 2026-10-05: "just skip to next subsong when it ends"

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

    setSidChipModel: (model) =>
      set((state) => {
        state.sidChipModel = model;
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

      setHeadphonesMode: (enabled) =>
        set((state) => {
          state.headphonesMode = enabled;
          // Snap stereo separation to a comfortable headphone level (35%)
          // when enabling; restore a sensible default when disabling.
          if (enabled) {
            state.stereoSeparation = 35;
            state.modplugSeparation = 35;
          } else {
            state.stereoSeparation = 25;
            state.modplugSeparation = 50;
          }
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

      setMaxHeadroomMode: (maxHeadroomMode) =>
        set((state) => {
          state.maxHeadroomMode = maxHeadroomMode;
        }),


    setWelcomeJingleEnabled: (v) =>
      set((state) => { state.welcomeJingleEnabled = v; }),
    setAutoAdvanceSubsongs: (v) =>
      set((state) => { state.autoAdvanceSubsongs = v; }),
    setMasterFxQuantize: (v) =>
      set((state) => { state.masterFxQuantize = v; }),
    })),
    {
      name: 'devilbox-settings',
      version: 13,
      migrate: (persistedState: unknown, version: number) => {
        const s = (persistedState ?? {}) as Record<string, unknown>;
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
        if (version < 12) {
          // v12: seven PC tracker formats (Imago Orpheus, CDFM 670, EasyTrax,
          // Karl Morton, XMF, UAX, Composer 667) defaulted to 'uade', an
          // Amiga player that cannot read them: every load went to UADE and
          // failed ("UADE could not play"). Flip a stored 'uade' to 'native'
          // (2026-10-05 broken-formats sweep).
          const fe = s.formatEngine as Record<string, unknown> | undefined;
          if (fe) {
            for (const key of ['imagoOrpheus', 'cdfm67', 'easyTrax', 'karlMorton', 'xmf', 'uax', 'composer667']) {
              if (fe[key] === 'uade') fe[key] = 'native';
            }
          }
        }
        if (version < 13) {
          // v13: Chuck Biscuits (.cba, Atari ST) defaulted to 'uade' while the
          // import route ignored the setting and always used libopenmpt; UADE
          // is an Amiga player and cannot play it. The route now honours the
          // setting, so a stored 'uade' becomes 'native'.
          const fe = s.formatEngine as Record<string, unknown> | undefined;
          if (fe && fe.chuckBiscuits === 'uade') fe.chuckBiscuits = 'native';
        }
        if (version < 8) {
          // v8: SunTronic default changed from 'uade' to 'native' (native
          // editable SunTronicV13 engine). Only flip users still at old default.
          const fe = s.formatEngine as Record<string, unknown> | undefined;
          if (fe && fe.suntronic === 'uade') fe.suntronic = 'native';
        }
        if (version < 9) {
          // v9: the WebGL UI render mode is gone, and with it the CRT shader,
          // the lens distortion and the wobbly windows it drew. Nothing reads
          // these keys any more, so drop them rather than carry them forward —
          // a stored `crtParams` would otherwise sit in every user's
          // localStorage for good, re-merged on every boot into a state shape
          // that no longer declares it.
          delete s.wobbleWindows;
          delete s.crtEnabled;
          delete s.crtParams;
          delete s.lensEnabled;
          delete s.lensPreset;
          delete s.lensParams;
        }
        if (version < 10) {
          // v10: stereo separation defaults to ModPlug rather than the PT-2
          // clone's LRRL. Flips anyone still holding the old default — which,
          // as with the v8 SunTronic and v4 PSM migrations before it, cannot
          // be told apart from a deliberate choice of 'pt2'. The setting is
          // one click away in Settings and the mode is named there.
          if (s.stereoSeparationMode === 'pt2') s.stereoSeparationMode = 'modplug';
        }
        if (version < 11) {
          // v11: Jochen Hippel 7V back to 'native'. A short-lived build
          // (38fdeef86, 2026-09-22) migrated every stored 'native' to 'uade'
          // because the native route then played silence; its revert removed
          // the migration but not the values it wrote. 7V now plays natively
          // through libtfmxaudiodecoder, and UADE is the last resort.
          const fe = s.formatEngine as Record<string, unknown> | undefined;
          if (fe && fe.jochenHippel7V === 'uade') fe.jochenHippel7V = 'native';
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
        maxHeadroomMode: state.maxHeadroomMode,
        sidHardwareMode: state.sidHardwareMode,
        sidEngine: state.sidEngine,
        // Additive: a save without it merges in the default ('auto'), no version bump.
        sidChipModel: state.sidChipModel,
        welcomeJingleEnabled: state.welcomeJingleEnabled,
        // Additive: a save without it merges in the default (on), no version bump.
        autoAdvanceSubsongs: state.autoAdvanceSubsongs,
        masterFxQuantize: state.masterFxQuantize,
      }),
    }
  )
);
