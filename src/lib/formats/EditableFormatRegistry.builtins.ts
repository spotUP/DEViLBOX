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

import { registerEditableFormat, setFormatInstruments } from './EditableFormatRegistry';
import type { SynthType } from '@typedefs/instrument';

registerEditableFormat({ formatId: "actionamics", label: "", newSong: { template: "templates/actionamics.ast", name: "Actionamics" }, patternCodec: { kind: "variable" }, exporter: { module: "ActionamicsExporter", fn: "exportActionamics", byLayout: true } });
registerEditableFormat({ formatId: "monotone", label: "MONOTONE", newSong: { template: "templates/monotone.mon" }, patternCodec: { kind: "fixed" }, exporter: { module: "MonotoneExporter", fn: "exportMonotone", byLayout: true } });
registerEditableFormat({ formatId: "ansiMusic", label: "ANSI Music", newSong: { template: "templates/ansimusic.ans" }, patternCodec: { kind: "fixed" }, exporter: { module: "AnsiMusicExporter", fn: "exportAnsiMusic" } });
registerEditableFormat({ formatId: "activisionPro", label: "Activision Pro", newSong: { template: "templates/activisionPro.avp" }, patternCodec: { kind: "fixed" }, exporter: { module: "ActivisionProExporter", fn: "exportActivisionPro", byLayout: true } });
registerEditableFormat({ formatId: "adplug", label: "AdPlug", newSong: { template: "templates/adplug.rad" }, exporter: { module: "AdPlugExporter", fn: "exportAdPlug" } });
registerEditableFormat({ formatId: "amf", label: "", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "amosMusicBank", label: "AMOS Music Bank", newSong: { template: "templates/amosMusicBank.abk" }, patternCodec: { kind: "variable" }, exporter: { module: "AMOSMusicBankExporter", fn: "exportAMOSMusicBank", ext: "abk", byLayout: true } });
registerEditableFormat({ formatId: "ams", label: "", patternCodec: { kind: "variable" } });
registerEditableFormat({ formatId: "aon", label: "Art of Noise", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "aProSys", label: "A-Pro-Sys", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "artAndMagic", label: "Art and Magic", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "benDaglish", label: "Ben Daglish", newSong: { template: "templates/benDaglish.bd", name: "Ben Daglish" }, patternCodec: { kind: "variable" }, exporter: { module: "BenDaglishExporter", fn: "exportBenDaglish", ext: "bd", byLayout: true } });
registerEditableFormat({ formatId: "c67", label: "", newSong: { template: "templates/c67.c67", name: "CDFM Composer 670" }, patternCodec: { kind: "variable" }, exporter: { module: "CDFM67Exporter", fn: "exportCDFM67", byLayout: true } });
registerEditableFormat({ formatId: "chuckBiscuits", label: "Chuck Biscuits", newSong: { template: "templates/chuckBiscuits.cba" }, patternCodec: { kind: "fixed" }, exporter: { module: "ChuckBiscuitsExporter", fn: "exportChuckBiscuits", byLayout: true } });
registerEditableFormat({ formatId: "composer667", label: "Composer 667", newSong: { template: "templates/composer667.667" }, patternCodec: { kind: "fixed" }, exporter: { module: "Composer667Exporter", fn: "exportComposer667", byLayout: true } });
registerEditableFormat({ formatId: "davidWhittaker", label: "David Whittaker", newSong: { template: "templates/davidWhittaker.dw" }, patternCodec: { kind: "fixed" }, exporter: { module: "DavidWhittakerExporter", fn: "exportDavidWhittaker", byLayout: true } });
registerEditableFormat({ formatId: "deltaMusic1", label: "Delta Music", newSong: { template: "templates/deltaMusic1.dm" }, patternCodec: { kind: "fixed" }, exporter: { module: "DeltaMusic1Exporter", fn: "exportDeltaMusic1", byLayout: true } });
registerEditableFormat({ formatId: "deltaMusic2", label: "Delta Music 2", newSong: { template: "templates/deltaMusic2.dm2" }, patternCodec: { kind: "fixed" }, exporter: { module: "DeltaMusic2Exporter", fn: "exportDeltaMusic2", byLayout: true } });
registerEditableFormat({ formatId: "digiBooster", label: "DigiBooster", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "digiBoosterPro", label: "DigiBooster Pro", newSong: { template: "templates/digiBoosterPro.dbm" }, patternCodec: { kind: "variable" }, exporter: { module: "DigiBoosterProExporter", fn: "exportDigiBoosterPro", byLayout: true } });
registerEditableFormat({ formatId: "digitalMugician", label: "Digital Mugician", newSong: { template: "templates/digitalMugician.dmu" }, patternCodec: { kind: "fixed" }, exporter: { module: "DigitalMugicianExporter", fn: "exportDigitalMugician", byLayout: true } });
registerEditableFormat({ formatId: "digitalSymphony", label: "Digital Symphony", newSong: { template: "templates/digitalSymphony.dsym" }, patternCodec: { kind: "variable" }, exporter: { module: "DigitalSymphonyExporter", fn: "exportDigitalSymphony", ext: "dsym", byLayout: true } });
registerEditableFormat({ formatId: "digitalSonixChrome", label: "", newSong: { template: "templates/digitalSonixChrome.dsc", name: "Digital Sonix Chrome" }, patternCodec: { kind: "fixed" }, exporter: { module: "DigitalSonixChromeExporter", fn: "exportDigitalSonixChrome", ext: "dsc", byLayout: true } });
registerEditableFormat({ formatId: "dmf", label: "", patternCodec: { kind: "variable" } });
registerEditableFormat({ formatId: "dsm_dyn", label: "", newSong: { template: "templates/dsm_dyn.dsm", name: "DSIK Sound Module" }, patternCodec: { kind: "fixed" }, exporter: { module: "DSMDynExporter", fn: "exportDSMDyn", byLayout: true } });
registerEditableFormat({ formatId: "dss", label: "Digital Sound Studio", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "dtm_204", label: "", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "dtm_pt", label: "", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "earAche", label: "EarAche", newSong: { template: "templates/earAche.ea", name: "EarAche" }, patternCodec: { kind: "fixed" }, exporter: { module: "EarAcheExporter", fn: "exportEarAche", byLayout: true } });
registerEditableFormat({ formatId: "faceTheMusic", label: "", newSong: { template: "templates/faceTheMusic.ftm", name: "Face the Music" }, patternCodec: { kind: "variable" }, exporter: { module: "FaceTheMusicExporter", fn: "exportFaceTheMusic", byLayout: true } });
registerEditableFormat({ formatId: "far", label: "", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "fredEditor", label: "Fred Editor", newSong: { template: "templates/fredEditor.fred" }, patternCodec: { kind: "variable" }, exporter: { module: "FredEditorExporter", fn: "exportFredEditor", byLayout: true } });
registerEditableFormat({ formatId: "futureComposer", label: "Future Composer", patternCodec: { kind: "fixed" }, newSong: { template: "templates/futurecomposer.fc" } });
registerEditableFormat({ formatId: "futurePlayer", label: "Future Player", newSong: { template: "templates/futurePlayer.fp" }, patternCodec: { kind: "variable" }, exporter: { module: "FuturePlayerExporter", fn: "exportAsFuturePlayer", byLayout: true } });
registerEditableFormat({ formatId: "gameMusicCreator", label: "Game Music Creator", newSong: { template: "templates/gameMusicCreator.gmc" }, patternCodec: { kind: "fixed" }, exporter: { module: "GameMusicCreatorExporter", fn: "exportGameMusicCreator", byLayout: true } });
registerEditableFormat({ formatId: "gdm", label: "", patternCodec: { kind: "variable" } });
registerEditableFormat({ formatId: "gmc", label: "Game Music Creator", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "graoumfTracker2_gt2", label: "Graoumf Tracker 2", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "graoumfTracker2_gtk4", label: "Graoumf Tracker 2", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "graoumfTracker2_gtk5", label: "Graoumf Tracker 2", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "hippelCoSo", label: "Hippel-CoSo", patternCodec: { kind: "variable" }, exporter: { module: "HippelCoSoExporter", fn: "exportAsHippelCoSo", byLayout: true }, newSong: { template: "templates/hippelCoSo.hipc", name: "Jochen Hippel CoSo" } });
registerEditableFormat({ formatId: "jochenHippelST", label: "", newSong: { template: "templates/jochenHippelST.hst", name: "Jochen Hippel ST" }, patternCodec: { kind: "fixed" }, exporter: { module: "JochenHippelSTExporter", fn: "exportJochenHippelST", byLayout: true } });
registerEditableFormat({ formatId: "hivelyAHX", label: "HivelyTracker", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "hivelyHVL", label: "HivelyTracker", patternCodec: { kind: "variable" } });
registerEditableFormat({ formatId: "ice", label: "IceTracker", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "iffSmus", label: "", newSong: { template: "templates/iffSmus.smus", name: "IFF SMUS" }, patternCodec: { kind: "variable" }, exporter: { module: "IffSmusExporter", fn: "exportIffSmus", byLayout: true } });
registerEditableFormat({ formatId: "imf", label: "", patternCodec: { kind: "variable" } });
registerEditableFormat({ formatId: "ims", label: "Image's Music System", newSong: { template: "templates/ims.ims" }, patternCodec: { kind: "fixed" }, exporter: { module: "IMSExporter", fn: "exportIMS", byLayout: true } });
registerEditableFormat({ formatId: "inStereo1", label: "InStereo! 1", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "inStereo2", label: "InStereo! 2", newSong: { template: "templates/inStereo2.is20" }, patternCodec: { kind: "fixed" }, exporter: { module: "InStereo2Exporter", fn: "exportInStereo2", byLayout: true } });
registerEditableFormat({ formatId: "it", label: "IT", patternCodec: { kind: "variable" } });
registerEditableFormat({ formatId: "jamCracker", label: "JamCracker Pro", patternCodec: { kind: "fixed" }, newSong: { template: "templates/jamcracker.jam" } });
registerEditableFormat({ formatId: "karlMorton", label: "", patternCodec: { kind: "variable" } });
registerEditableFormat({ formatId: "klystrack", label: "Klystrack", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "kris", label: "KRIS / ChipTracker", newSong: { template: "templates/kris.kris" }, patternCodec: { kind: "fixed" }, exporter: { module: "KRISExporter", fn: "exportKRIS", ext: "kris", byLayout: true } });
registerEditableFormat({ formatId: "leggless", label: "", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "markII", label: "Mark II", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "mdl", label: "", patternCodec: { kind: "variable" } });
registerEditableFormat({ formatId: "med_mmd0", label: "OctaMED", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "med_mmd1", label: "OctaMED", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "mfp", label: "Magnetic Fields Packer", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "mikeDavies", label: "Mike Davies", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "mod", label: "MOD", patternCodec: { kind: "fixed" }, newSong: { template: "templates/protracker.mod", name: "ProTracker MOD" } });
registerEditableFormat({ formatId: "mt2", label: "", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "mtm", label: "", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "musicAssembler", label: "Music Assembler", newSong: { template: "templates/musicAssembler.ma" }, patternCodec: { kind: "variable" }, exporter: { module: "MusicAssemblerExporter", fn: "exportAsMusicAssembler", byLayout: true } });
registerEditableFormat({ formatId: "musicLine", label: "MusicLine Editor", newSong: { template: "templates/musicLine.ml" }, patternCodec: { kind: "variable" }, exporter: { module: "MusicLineExporter", fn: "exportMusicLineFile", ext: "ml", byLayout: true } });
registerEditableFormat({ formatId: "nru", label: "", newSong: { template: "templates/nru.nru", name: "NoiseRunner" }, patternCodec: { kind: "fixed" }, exporter: { module: "NRUExporter", fn: "exportNRU", byLayout: true } });
registerEditableFormat({ formatId: "octamed_mmd0", label: "OctaMED", patternCodec: { kind: "fixed" }, newSong: { template: "templates/octamed.mmd0", name: "OctaMED MMD0" } });
registerEditableFormat({ formatId: "octamed_mmd1", label: "OctaMED", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "oktalyzer", label: "Oktalyzer", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "plm", label: "", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "preTracker", label: "PreTracker", exporter: { module: "PreTrackerExporter", fn: "exportAsPreTracker" } });
registerEditableFormat({ formatId: "psm", label: "", patternCodec: { kind: "variable" } });
registerEditableFormat({ formatId: "pt36", label: "ProTracker 3.6", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "ptm", label: "", patternCodec: { kind: "variable" } });
registerEditableFormat({ formatId: "pumaTracker", label: "Puma Tracker", patternCodec: { kind: "variable" }, newSong: { template: "templates/pumatracker.puma" }, exporter: { module: "PumaTrackerExporter", fn: "exportPumaTrackerFile" } });
registerEditableFormat({ formatId: "quadraComposer", label: "Quadra Composer", newSong: { template: "templates/quadraComposer.emod" }, patternCodec: { kind: "fixed" }, exporter: { module: "QuadraComposerExporter", fn: "exportQuadraComposer", byLayout: true } });
registerEditableFormat({ formatId: "robHubbard", label: "Rob Hubbard", newSong: { template: "templates/robHubbard.rh" }, patternCodec: { kind: "fixed" }, exporter: { module: "RobHubbardExporter", fn: "exportRobHubbard", byLayout: true } });
registerEditableFormat({ formatId: "ronKlaren", label: "Ron Klaren", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "rtm", label: "", patternCodec: { kind: "variable" } });
registerEditableFormat({ formatId: "s3m", label: "S3M", patternCodec: { kind: "variable" } });
registerEditableFormat({ formatId: "sawteeth", label: "Sawteeth", newSong: { template: "templates/sawteeth.st", name: "Sawteeth" }, patternCodec: { kind: "variable" }, exporter: { module: "SawteethExporter", fn: "exportSawteeth", byLayout: true } });
registerEditableFormat({ formatId: "scumm", label: "SCUMM", newSong: { template: "templates/scumm.scumm", name: "SCUMM" }, patternCodec: { kind: "fixed" }, exporter: { module: "SCUMMExporter", fn: "exportSCUMM", byLayout: true } });
registerEditableFormat({ formatId: "seanConnolly", label: "Sean Connolly", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "sidmon1", label: "", newSong: { template: "templates/sidmon1.sid1", name: "SidMon 1" }, exporter: { module: "SidMon1Exporter", fn: "exportSidMon1", byLayout: true } });
registerEditableFormat({ formatId: "sidMon1", label: "SidMon 1", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "sidMon2", label: "SidMon II", patternCodec: { kind: "variable" }, newSong: { template: "templates/sidmon2.sd2" } });
registerEditableFormat({ formatId: "sonicArranger", label: "Sonic Arranger", newSong: { template: "templates/sonicArranger.sa" }, patternCodec: { kind: "fixed" }, exporter: { module: "SonicArrangerExporter", fn: "exportSonicArranger", byLayout: true } });
registerEditableFormat({ formatId: "sonicArrangerSas", label: "Sonic Arranger SAS", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "sonixMusicDriver", label: "", patternCodec: { kind: "variable" }, synth: { synthType: "SonixSynth", controls: "SonixControls" } });
registerEditableFormat({ formatId: "soundControl", label: "Sound Control", newSong: { template: "templates/soundControl.sc" }, patternCodec: { kind: "fixed" }, exporter: { module: "SoundControlExporter", fn: "exportSoundControl", byLayout: true } });
registerEditableFormat({ formatId: "soundFactory", label: "Sound Factory", newSong: { template: "templates/soundFactory.psf" }, patternCodec: { kind: "fixed" }, exporter: { module: "SoundFactoryExporter", fn: "exportSoundFactory", byLayout: true } });
registerEditableFormat({ formatId: "soundFactoryStub", label: "", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "soundfx", label: "Sound-FX", newSong: { template: "templates/soundfx.sfx" }, patternCodec: { kind: "fixed" }, exporter: { module: "SoundFXExporter", fn: "exportSoundFX", byLayout: true } });
registerEditableFormat({ formatId: "soundMaster", label: "Sound Master", newSong: { template: "templates/soundMaster.sm3" }, patternCodec: { kind: "fixed" }, exporter: { module: "SoundMasterExporter", fn: "exportSoundMaster", byLayout: true } });
registerEditableFormat({ formatId: "soundMon", label: "SoundMon", patternCodec: { kind: "fixed" }, newSong: { template: "templates/soundmon.bp" }, exporter: { module: "SoundMonExporter", fn: "exportAsSoundMon" } });
registerEditableFormat({ formatId: "startrekkerAM", label: "", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "steveTurner", label: "", patternCodec: { kind: "variable" } });
registerEditableFormat({ formatId: "stk", label: "", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "stm", label: "", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "stp", label: "", newSong: { template: "templates/stp.stp", name: "SoundTracker Pro II" }, patternCodec: { kind: "fixed" }, exporter: { module: "STPExporter", fn: "exportSTP", byLayout: true } });
registerEditableFormat({ formatId: "stx", label: "", patternCodec: { kind: "variable" } });
registerEditableFormat({ formatId: "sunTronic", label: "SunTronic", newSong: { template: "templates/sunTronic.src" }, patternCodec: { kind: "variable" }, exporter: { module: "SunTronicExporter", fn: "exportAsSunTronic", byLayout: true, ext: "src" } });
registerEditableFormat({ formatId: "symphoniePro", label: "Symphonie Pro", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "synthDream", label: "SynthDream", patternCodec: { kind: "variable" }, exporter: { module: "SynthDreamExporter", fn: "exportSynthDream", byLayout: true } });
registerEditableFormat({ formatId: "riffRaff", label: "Riff Raff", patternCodec: { kind: "variable" }, exporter: { module: "RiffRaffExporter", fn: "exportRiffRaff", byLayout: true } });
registerEditableFormat({ formatId: "dynamicSynthesizer", label: "Dynamic Synthesizer", patternCodec: { kind: "variable" }, exporter: { module: "DynamicSynthesizerExporter", fn: "exportDynamicSynthesizer", byLayout: true } });
registerEditableFormat({ formatId: "synthesis", label: "Synthesis", newSong: { template: "templates/synthesis.syn" }, patternCodec: { kind: "fixed" }, exporter: { module: "SynthesisExporter", fn: "exportSynthesis", byLayout: true } });
registerEditableFormat({ formatId: "tcbTracker", label: "TCB Tracker", newSong: { template: "templates/tcbTracker.tcb" }, patternCodec: { kind: "fixed" }, exporter: { module: "TCBTrackerExporter", fn: "exportTCBTracker", byLayout: true } });
registerEditableFormat({ formatId: "tfmx", label: "TFMX", newSong: { template: "templates/tfmx.rocknroll" }, patternCodec: { kind: "fixed" }, exporter: { module: "TFMXExporter", fn: "exportTFMX", byLayout: true } });
registerEditableFormat({ formatId: "ult", label: "", patternCodec: { kind: "variable" } });
registerEditableFormat({ formatId: "unic", label: "", newSong: { template: "templates/unic.unic", name: "UNIC Tracker" }, patternCodec: { kind: "fixed" }, exporter: { module: "UNICExporter", fn: "exportUNIC", byLayout: true } });
registerEditableFormat({ formatId: "wantedTeamDaveLowe", label: "", patternCodec: { kind: "fixed" } });
registerEditableFormat({ formatId: "xm", label: "XM", patternCodec: { kind: "variable" } });
registerEditableFormat({ formatId: "xmf", label: "XMF", newSong: { template: "templates/xmf.xmf" }, patternCodec: { kind: "fixed" }, exporter: { module: "XMFExporter", fn: "exportXMF", byLayout: true } });
registerEditableFormat({ formatId: "zoundMonitor", label: "Zound Monitor", newSong: { template: "templates/zoundMonitor.sng" }, patternCodec: { kind: "fixed" }, exporter: { module: "ZoundMonitorExporter", fn: "exportZoundMonitor", byLayout: true } });

// -- Instrument kinds each format can hold (N14). Formats not listed stay unlocked.
// Sample-only trackers hold sampled instruments; synth trackers add their own
// engine kind (native and WASM variants). Verified against every fixture by
// src/lib/formats/__tests__/formatInstrumentSets.test.ts.
const SAMPLED: SynthType[] = ['Sampler', 'Player'];
const SAMPLE_ONLY = ['c67', 'chuckBiscuits', 'composer667', 'digiBoosterPro', 'digitalSymphony', 'dsm_dyn', 'iffSmus', 'ims', 'kris', 'mod', 'stp', 'tcbTracker', 'unic', 'xmf', 'amosMusicBank'];
for (const id of SAMPLE_ONLY) setFormatInstruments(id, SAMPLED);
const WITH_SYNTH: Record<string, SynthType[]> = {
  activisionPro: ['ActivisionProWasmSynth'],
  actionamics: ['ActionamicsWasmSynth'],
  benDaglish: ['BenDaglishSynth'],
  davidWhittaker: ['DavidWhittakerSynth', 'DavidWhittakerWasmSynth'],
  deltaMusic1: ['DeltaMusic1Synth', 'DeltaMusic1WasmSynth', 'Synth'],
  deltaMusic2: ['DeltaMusic2Synth', 'DeltaMusic2WasmSynth'],
  digitalMugician: ['DigMugSynth', 'DigMugWasmSynth'],
  digitalSonixChrome: ['SonixSynth'],
  faceTheMusic: ['FaceTheMusicWasmSynth'],
  fredEditor: ['FredSynth', 'FredReplayerWasmSynth2'],
  futureComposer: ['FCSynth', 'FutureComposerWasmSynth'],
  futurePlayer: ['FuturePlayerSynth'],
  hippelCoSo: ['HippelCoSoSynth', 'HippelSynth'],
  jochenHippelST: ['HippelStSynth', 'HippelSynth'],
  inStereo2: ['InStereo2Synth', 'InStereo2WasmSynth'],
  jamCracker: ['JamCrackerSynth'],
  monotone: ['MonotoneWasmSynth'],
  musicAssembler: ['MusicAssemblerSynth'],
  musicLine: ['MusicLineSynth'],
  gameMusicCreator: ['GmcWasmSynth'],
  soundfx: ['SoundFxWasmSynth'],
  med_mmd0: ['OctaMEDSynth'],
  octamed_mmd0: ['OctaMEDSynth'],
  pumaTracker: ['PumaTrackerSynth'],
  quadraComposer: ['QuadraComposerWasmSynth'],
  robHubbard: ['RobHubbardSynth'],
  sawteeth: ['SawteethSynth'],
  sidmon1: ['SidMon1Synth'],
  sidMon2: ['SidMonSynth', 'SidMon2Synth'],
  sonicArranger: ['SonicArrangerSynth', 'SonicArrangerWasmSynth'],
  soundControl: ['SoundControlWasmSynth'],
  soundMon: ['SoundMonSynth', 'SoundMonWasmSynth', 'Synth'],
  sunTronic: ['SunTronicSynth', 'Synth'],
  tfmx: ['TFMXSynth', 'TFMXModuleSynth'],
};
for (const [id, types] of Object.entries(WITH_SYNTH)) setFormatInstruments(id, [...SAMPLED, ...types]);
