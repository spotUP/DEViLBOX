// src/lib/formats/EditableFormatRegistry.builtins.ts
/**
 * Built-in editable-format descriptors — imported for side effect at app and
 * test startup (mirrors src/engine/registry/builtin/index.ts). AUTO-GENERATED
 * shape: one registerEditableFormat call per formatId, merging the pattern-codec
 * registrations (src/engine/uade/encoders/*), the native exporters
 * (src/lib/export/*), and synth-voice links (SynthRegistry). Labels are the
 * exact FormatRegistry strings; an empty label means the descriptor is inert for
 * capability derivation (router still dispatches on formatId) — used where the
 * format's export/edit capability is intentionally not surfaced yet, preserving
 * historical FormatCapabilities behavior.
 */

import { registerEditableFormat } from './EditableFormatRegistry';

registerEditableFormat({ formatId: "actionamics", label: "", patternCodec: { kind: "variable" }, exporter: { module: "ActionamicsExporter", fn: "exportActionamics", byLayout: true } });
registerEditableFormat({ formatId: "activisionPro", label: "Activision Pro", patternCodec: { kind: "fixed" }, exporter: { module: "ActivisionProExporter", fn: "exportActivisionPro", byLayout: true } });
registerEditableFormat({ formatId: "adplug", label: "AdPlug", exporter: { module: "AdPlugExporter", fn: "exportAdPlug" } });
registerEditableFormat({ formatId: "amf", label: "", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "amosMusicBank", label: "AMOS Music Bank", patternCodec: { kind: "variable" }, exporter: { module: "AMOSMusicBankExporter", fn: "exportAMOSMusicBank", ext: "abk", byLayout: true } });
registerEditableFormat({ formatId: "ams", label: "", patternCodec: { kind: "variable" } });
registerEditableFormat({ formatId: "aon", label: "Art of Noise", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "aProSys", label: "A-Pro-Sys", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "artAndMagic", label: "Art and Magic", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "benDaglish", label: "", patternCodec: { kind: "variable" } });
registerEditableFormat({ formatId: "c67", label: "", patternCodec: { kind: "variable" }, exporter: { module: "CDFM67Exporter", fn: "exportCDFM67", byLayout: true } });
registerEditableFormat({ formatId: "chuckBiscuits", label: "Chuck Biscuits", patternCodec: { kind: "fixed" }, exporter: { module: "ChuckBiscuitsExporter", fn: "exportChuckBiscuits", byLayout: true } });
registerEditableFormat({ formatId: "composer667", label: "Composer 667", patternCodec: { kind: "fixed" }, exporter: { module: "Composer667Exporter", fn: "exportComposer667", byLayout: true } });
registerEditableFormat({ formatId: "davidWhittaker", label: "David Whittaker", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "deltaMusic1", label: "Delta Music", patternCodec: { kind: "fixed" }, exporter: { module: "DeltaMusic1Exporter", fn: "exportDeltaMusic1", byLayout: true } });
registerEditableFormat({ formatId: "deltaMusic2", label: "Delta Music 2", patternCodec: { kind: "fixed" }, exporter: { module: "DeltaMusic2Exporter", fn: "exportDeltaMusic2", byLayout: true } });
registerEditableFormat({ formatId: "digiBooster", label: "DigiBooster", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "digiBoosterPro", label: "DigiBooster Pro", patternCodec: { kind: "variable" }, exporter: { module: "DigiBoosterProExporter", fn: "exportDigiBoosterPro", byLayout: true } });
registerEditableFormat({ formatId: "digitalMugician", label: "Digital Mugician", patternCodec: { kind: "fixed" }, exporter: { module: "DigitalMugicianExporter", fn: "exportDigitalMugician", byLayout: true } });
registerEditableFormat({ formatId: "digitalSymphony", label: "Digital Symphony", patternCodec: { kind: "variable" }, exporter: { module: "DigitalSymphonyExporter", fn: "exportDigitalSymphony", ext: "dsym", byLayout: true } });
registerEditableFormat({ formatId: "dmf", label: "", patternCodec: { kind: "variable" } });
registerEditableFormat({ formatId: "dsm_dyn", label: "", patternCodec: { kind: "fixed" }, exporter: { module: "DSMDynExporter", fn: "exportDSMDyn", byLayout: true } });
registerEditableFormat({ formatId: "dss", label: "Digital Sound Studio", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "dtm_204", label: "", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "dtm_pt", label: "", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "earAche", label: "", patternCodec: { kind: "fixed" }, exporter: { module: "EarAcheExporter", fn: "exportEarAche", byLayout: true } });
registerEditableFormat({ formatId: "faceTheMusic", label: "", patternCodec: { kind: "variable" }, exporter: { module: "FaceTheMusicExporter", fn: "exportFaceTheMusic", byLayout: true } });
registerEditableFormat({ formatId: "far", label: "", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "fredEditor", label: "Fred Editor", patternCodec: { kind: "variable" }, exporter: { module: "FredEditorExporter", fn: "exportFredEditor", byLayout: true } });
registerEditableFormat({ formatId: "futureComposer", label: "Future Composer", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "futurePlayer", label: "Future Player", patternCodec: { kind: "variable" }, exporter: { module: "FuturePlayerExporter", fn: "exportAsFuturePlayer", byLayout: true } });
registerEditableFormat({ formatId: "gameMusicCreator", label: "Game Music Creator", patternCodec: { kind: "fixed" }, exporter: { module: "GameMusicCreatorExporter", fn: "exportGameMusicCreator", byLayout: true } });
registerEditableFormat({ formatId: "gdm", label: "", patternCodec: { kind: "variable" } });
registerEditableFormat({ formatId: "gmc", label: "Game Music Creator", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "graoumfTracker2_gt2", label: "Graoumf Tracker 2", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "graoumfTracker2_gtk4", label: "Graoumf Tracker 2", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "graoumfTracker2_gtk5", label: "Graoumf Tracker 2", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "hippelCoSo", label: "", patternCodec: { kind: "variable" }, exporter: { module: "HippelCoSoExporter", fn: "exportAsHippelCoSo", byLayout: true } });
registerEditableFormat({ formatId: "hivelyAHX", label: "HivelyTracker", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "hivelyHVL", label: "HivelyTracker", patternCodec: { kind: "variable" } });
registerEditableFormat({ formatId: "ice", label: "IceTracker", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "iffSmus", label: "", patternCodec: { kind: "variable" }, exporter: { module: "IffSmusExporter", fn: "exportIffSmus", byLayout: true } });
registerEditableFormat({ formatId: "imf", label: "", patternCodec: { kind: "variable" } });
registerEditableFormat({ formatId: "ims", label: "Image's Music System", patternCodec: { kind: "fixed" }, exporter: { module: "IMSExporter", fn: "exportIMS", byLayout: true } });
registerEditableFormat({ formatId: "inStereo1", label: "InStereo! 1", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "inStereo2", label: "InStereo! 2", patternCodec: { kind: "fixed" }, exporter: { module: "InStereo2Exporter", fn: "exportInStereo2", byLayout: true } });
registerEditableFormat({ formatId: "it", label: "IT", patternCodec: { kind: "variable" } });
registerEditableFormat({ formatId: "jamCracker", label: "JamCracker Pro", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "karlMorton", label: "", patternCodec: { kind: "variable" } });
registerEditableFormat({ formatId: "klystrack", label: "Klystrack", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "kris", label: "KRIS / ChipTracker", patternCodec: { kind: "fixed" }, exporter: { module: "KRISExporter", fn: "exportKRIS", byLayout: true } });
registerEditableFormat({ formatId: "leggless", label: "", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "markII", label: "Mark II", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "mdl", label: "", patternCodec: { kind: "variable" } });
registerEditableFormat({ formatId: "med_mmd0", label: "OctaMED", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "med_mmd1", label: "OctaMED", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "mfp", label: "Magnetic Fields Packer", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "mikeDavies", label: "Mike Davies", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "mod", label: "MOD", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "mt2", label: "", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "mtm", label: "", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "musicAssembler", label: "Music Assembler", patternCodec: { kind: "variable" }, exporter: { module: "MusicAssemblerExporter", fn: "exportAsMusicAssembler", byLayout: true } });
registerEditableFormat({ formatId: "musicLine", label: "MusicLine Editor", patternCodec: { kind: "variable" }, exporter: { module: "MusicLineExporter", fn: "exportMusicLineFile", ext: "ml", byLayout: true } });
registerEditableFormat({ formatId: "nru", label: "", patternCodec: { kind: "fixed" }, exporter: { module: "NRUExporter", fn: "exportNRU", byLayout: true } });
registerEditableFormat({ formatId: "octamed_mmd0", label: "OctaMED", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "octamed_mmd1", label: "OctaMED", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "oktalyzer", label: "Oktalyzer", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "plm", label: "", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "preTracker", label: "PreTracker", exporter: { module: "PreTrackerExporter", fn: "exportAsPreTracker" } });
registerEditableFormat({ formatId: "psm", label: "", patternCodec: { kind: "variable" } });
registerEditableFormat({ formatId: "pt36", label: "ProTracker 3.6", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "ptm", label: "", patternCodec: { kind: "variable" } });
registerEditableFormat({ formatId: "pumaTracker", label: "Puma Tracker", patternCodec: { kind: "variable" } });
registerEditableFormat({ formatId: "quadraComposer", label: "Quadra Composer", patternCodec: { kind: "fixed" }, exporter: { module: "QuadraComposerExporter", fn: "exportQuadraComposer", byLayout: true } });
registerEditableFormat({ formatId: "robHubbard", label: "Rob Hubbard", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "ronKlaren", label: "Ron Klaren", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "rtm", label: "", patternCodec: { kind: "variable" } });
registerEditableFormat({ formatId: "s3m", label: "S3M", patternCodec: { kind: "variable" } });
registerEditableFormat({ formatId: "sawteeth", label: "", patternCodec: { kind: "variable" }, exporter: { module: "SawteethExporter", fn: "exportSawteeth", byLayout: true } });
registerEditableFormat({ formatId: "scumm", label: "", patternCodec: { kind: "fixed" }, exporter: { module: "SCUMMExporter", fn: "exportSCUMM", byLayout: true } });
registerEditableFormat({ formatId: "seanConnolly", label: "Sean Connolly", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "sidmon1", label: "", exporter: { module: "SidMon1Exporter", fn: "exportSidMon1", byLayout: true } });
registerEditableFormat({ formatId: "sidMon1", label: "SidMon 1", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "sidMon2", label: "SidMon II", patternCodec: { kind: "variable" } });
registerEditableFormat({ formatId: "sonicArranger", label: "Sonic Arranger", patternCodec: { kind: "fixed" }, exporter: { module: "SonicArrangerExporter", fn: "exportSonicArranger", byLayout: true } });
registerEditableFormat({ formatId: "sonicArrangerSas", label: "Sonic Arranger SAS", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "sonixMusicDriver", label: "", patternCodec: { kind: "variable" }, synth: { synthType: "SonixSynth", controls: "SonixControls" } });
registerEditableFormat({ formatId: "soundControl", label: "Sound Control", patternCodec: { kind: "fixed" }, exporter: { module: "SoundControlExporter", fn: "exportSoundControl", byLayout: true } });
registerEditableFormat({ formatId: "soundFactory", label: "Sound Factory", patternCodec: { kind: "fixed" }, exporter: { module: "SoundFactoryExporter", fn: "exportSoundFactory", byLayout: true } });
registerEditableFormat({ formatId: "soundFactoryStub", label: "", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "soundfx", label: "Sound-FX", patternCodec: { kind: "fixed" }, exporter: { module: "SoundFXExporter", fn: "exportSoundFX", byLayout: true } });
registerEditableFormat({ formatId: "soundMon", label: "SoundMon", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "startrekkerAM", label: "", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "steveTurner", label: "", patternCodec: { kind: "variable" } });
registerEditableFormat({ formatId: "stk", label: "", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "stm", label: "", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "stp", label: "", patternCodec: { kind: "fixed" }, exporter: { module: "STPExporter", fn: "exportSTP", byLayout: true } });
registerEditableFormat({ formatId: "stx", label: "", patternCodec: { kind: "variable" } });
registerEditableFormat({ formatId: "symphoniePro", label: "Symphonie Pro", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "synthesis", label: "Synthesis", patternCodec: { kind: "fixed" }, exporter: { module: "SynthesisExporter", fn: "exportSynthesis", byLayout: true } });
registerEditableFormat({ formatId: "tcbTracker", label: "TCB Tracker", patternCodec: { kind: "fixed" }, exporter: { module: "TCBTrackerExporter", fn: "exportTCBTracker", byLayout: true } });
registerEditableFormat({ formatId: "tfmx", label: "TFMX", patternCodec: { kind: "fixed" }, exporter: { module: "TFMXExporter", fn: "exportTFMX", byLayout: true } });
registerEditableFormat({ formatId: "ult", label: "", patternCodec: { kind: "variable" } });
registerEditableFormat({ formatId: "unic", label: "", patternCodec: { kind: "fixed" }, exporter: { module: "UNICExporter", fn: "exportUNIC", byLayout: true } });
registerEditableFormat({ formatId: "wantedTeamDaveLowe", label: "", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "xm", label: "XM", patternCodec: { kind: "variable" } });
registerEditableFormat({ formatId: "xmf", label: "XMF", patternCodec: { kind: "fixed" }, exporter: { module: "XMFExporter", fn: "exportXMF", byLayout: true } });
registerEditableFormat({ formatId: "zoundMonitor", label: "Zound Monitor", patternCodec: { kind: "fixed" }, exporter: { module: "ZoundMonitorExporter", fn: "exportZoundMonitor", byLayout: true } });
