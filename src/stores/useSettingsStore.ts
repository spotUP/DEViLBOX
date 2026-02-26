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
  uade: UADEImportMode;        // UADE-only formats → enhanced (editable) vs classic (playback-only)
}

interface SettingsStore {
  // Engine Settings
  amigaLimits: boolean;      // Clamp periods to 113-856 (MOD/S3M/IT)
  linearInterpolation: boolean; // Enable linear interpolation for sample playback
  masterTuning: number;      // Master tuning in Hz (default 440)

  // Format Engine Preferences
  formatEngine: FormatEnginePreferences;

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

  // Render Mode
  renderMode: 'dom' | 'webgl';  // UI rendering: 'dom' = React/Tailwind, 'webgl' = PixiJS

  // Actions
  setAmigaLimits: (enabled: boolean) => void;
  setLinearInterpolation: (enabled: boolean) => void;
  setMasterTuning: (hz: number) => void;
  setFormatEngine: (format: keyof FormatEnginePreferences, engine: FormatEngineChoice | UADEImportMode) => void;
  setPerformanceQuality: (quality: 'high' | 'medium' | 'low') => void;
  setUseBLEP: (enabled: boolean) => void;
  setStereoSeparation: (percent: number) => void;
  setStereoSeparationMode: (mode: 'pt2' | 'modplug') => void;
  setModplugSeparation: (percent: number) => void;
  setMidiPolyphonic: (enabled: boolean) => void;
  setTrackerVisualBg: (enabled: boolean) => void;
  setTrackerVisualMode: (mode: number) => void;
  setRenderMode: (mode: 'dom' | 'webgl') => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    immer((set) => ({
      // Initial state
      amigaLimits: false,
      linearInterpolation: true,
      masterTuning: 440,
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
        benDaglish: 'native',   // BenDaglishParser — dedicated Ben Daglish support
        sonicArranger: 'native', // SonicArrangerParser — dedicated Sonic Arranger support
        inStereo1: 'native',    // InStereo1Parser — dedicated InStereo! 1.0 support
        inStereo2: 'native',    // InStereo2Parser — dedicated InStereo! 2.0 support
        pumaTracker: 'native',      // PumaTrackerParser — dedicated PumaTracker support
        synthesis: 'native',        // SynthesisParser — dedicated Synthesis support
        musicAssembler: 'native',   // MusicAssemblerParser — dedicated Music Assembler support
        digitalSoundStudio: 'native', // DigitalSoundStudioParser — dedicated Digital Sound Studio support
        digitalSymphony: 'native',    // DigitalSymphonyParser — dedicated Digital Symphony support
        imagoOrpheus: 'native',     // ImagoOrpheusParser — dedicated Imago Orpheus support
        cdfm67: 'native',           // CDFM67Parser — dedicated CDFM Composer 670 support
        easyTrax: 'native',         // EasyTraxParser — dedicated EasyTrax support
        karlMorton: 'native',       // KarlMortonParser — dedicated Karl Morton Music Format support
        ams: 'native',              // AMSParser — Extreme's Tracker / Velvet Studio support
        xTracker: 'native',         // XTrackerParser — dedicated X-Tracker DMF support
        xmf: 'native',              // XMFParser — dedicated Astroidea XMF support
        uax: 'native',              // UAXParser — Unreal Audio Package sound ripper
        graoumfTracker2: 'native',  // GraoumfTracker2Parser — dedicated Graoumf Tracker 1/2 support
        symphoniePro: 'native',     // SymphonieProParser — dedicated Symphonie Pro support
        chuckBiscuits: 'native',    // ChuckBiscuitsParser — dedicated Chuck Biscuits / Black Artist support
        speedySystem: 'uade',       // SpeedySystemParser — prefer UADE (DOC RAM samples required)
        tronic: 'uade',             // TronicParser — no native parser; always UADE
        digiBoosterPro: 'native',   // DigiBoosterProParser — dedicated DigiBooster Pro (.dbm) support
        gameMusicCreator: 'uade',   // GameMusicCreatorParser — prefer UADE (complex synthesis)
        faceTheMusic: 'native',     // FaceTheMusicParser — native parser available
        soundControl: 'native',     // SoundControlParser — native parser available
        soundFactory: 'native',     // SoundFactoryParser — native parser available
        actionamics: 'native',      // ActionamicsParser — native parser available
        activisionPro: 'native',    // ActivisionProParser — native parser available
        ronKlaren: 'native',        // RonKlarenParser — native parser available
        deltaMusic1: 'native',  // DeltaMusic1Parser — native parser available
        pt36: 'native',         // PT36Parser — native parser available
        uade: 'enhanced',           // UADE formats — enhanced (editable) by default
      },
      performanceQuality: 'high',
      useBLEP: false,  // Default: BLEP disabled (enable in Settings for band-limited synthesis)
      stereoSeparation: 20,  // Default: 20% (classic Amiga-style narrow separation)
      stereoSeparationMode: 'pt2' as const,
      modplugSeparation: 100,       // Default: 100% = normal stereo (identity)
      midiPolyphonic: true,  // Default: polyphonic enabled for better jamming
      trackerVisualBg: false,  // Default: off
      trackerVisualMode: 0,    // Default: spectrum bars
      renderMode: 'dom' as const,  // Default: DOM rendering

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

      setRenderMode: (renderMode) =>
        set((state) => {
          state.renderMode = renderMode;
        }),
    })),
    {
      name: 'devilbox-settings',
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
        renderMode: state.renderMode,
      }),
    }
  )
);
