const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/main-BbV5VyEH.js","assets/client-DHYdgbIN.js","assets/vendor-ui-AJ7AT9BN.js","assets/vendor-react-Dgd_wxYf.js","assets/vendor-utils-a-Usm5Xm.js","assets/vendor-tone-48TQc1H3.js","assets/main-c6CPs1E0.css","assets/JamCrackerExporter-Bm1Nsd2L.js","assets/SoundMonExporter-FD_nnlBy.js","assets/UADEChipEditor-DnALwiXS.js","assets/SidMon2Exporter-CAyTYVHD.js","assets/Sd2Engine-BgIHLVPo.js","assets/MusicAssemblerExporter-D7HF2LHx.js","assets/MaEngine-E1EHjQty.js","assets/FuturePlayerExporter-dy63rnjn.js","assets/HippelCoSoExporter-C0Zi7hr-.js","assets/TFMXExporter-D2hAD6DC.js","assets/TFMXEncoder-CCEY1ckI.js","assets/FredEditorExporter-x7u743vM.js","assets/FredEditorEncoder-rSEnxCqL.js","assets/SoundFXExporter-B6AvOEWG.js","assets/SoundFXEncoder-BhznWvHj.js","assets/GameMusicCreatorExporter-4SrXED-M.js","assets/GameMusicCreatorEncoder-BgzDEazu.js","assets/QuadraComposerExporter-C011SLMw.js","assets/QuadraComposerEncoder-JE3-GGZi.js","assets/EarAcheExporter-B4kiZKB_.js","assets/EarAcheEncoder-DTpkdNs_.js","assets/ActionamicsExporter-CyWPt3ZT.js","assets/ActionamicsEncoder-CxUzspTM.js","assets/CDFM67Exporter-DX6fYUmH.js","assets/CDFM67Encoder-Dw1zKW5X.js","assets/ChuckBiscuitsExporter-PCRvg43g.js","assets/Composer667Exporter-bu99wWvs.js","assets/Composer667Encoder-o8O1EiUD.js","assets/IMSExporter-BpaTxWGa.js","assets/SCUMMExporter-Dk08VVdk.js","assets/SCUMMEncoder-DscPMg-Y.js","assets/XMFExporter-CCpAR7A8.js","assets/XMFEncoder-q5F4y1aF.js"])))=>i.map(i=>d[i]);
import { R as useTrackerStore, e as useInstrumentStore, az as useProjectStore, ax as useTransportStore, d9 as useAutomationStore, as as useAudioStore, a as useUIStore, aq as useFormatStore, aw as useEditorStore, da as exportSong, db as getOriginalModuleDataForExport, P as notify, dc as exportSFX, dd as exportInstrument, am as __vitePreload, $ as getToneEngine, de as detectFileFormat, df as importInstrument, dg as importSFX, dh as importSong } from "./main-BbV5VyEH.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { saveFurFileWasm } from "./FurnaceFileOps-c7uBibmq.js";
const SYNTH_TYPE_TO_ID = {
  "Synth": 1,
  "MonoSynth": 2,
  "DuoSynth": 3,
  "FMSynth": 4,
  "ToneAM": 5,
  "TB303": 10,
  "Sampler": 11,
  "WobbleBass": 12,
  "DubSiren": 13,
  "SpaceLaser": 14,
  "V2": 20,
  "Synare": 15,
  "DrumMachine": 16,
  "ChipSynth": 17
};
class NanoExporter {
  /**
   * Export the current project to a highly compressed binary string (Base64)
   */
  static export(instruments, patterns, patternOrder, bpm, speed) {
    const buffer = [];
    buffer.push(219, 88, 78, 33);
    buffer.push(1);
    buffer.push(Math.min(255, bpm));
    buffer.push(Math.min(255, speed));
    const usedInstrIds = this.getUsedInstrumentIds(patterns, patternOrder);
    const usedInstrConfigs = instruments.filter((i) => usedInstrIds.has(i.id));
    buffer.push(usedInstrConfigs.length);
    buffer.push(patternOrder.length);
    usedInstrConfigs.forEach((inst) => {
      buffer.push(inst.id);
      buffer.push(SYNTH_TYPE_TO_ID[inst.synthType] || 0);
      buffer.push(Math.round((inst.volume + 60) / 60 * 255));
      buffer.push(Math.round((inst.pan + 100) / 200 * 255));
      const params = this.packSynthParams(inst);
      params.forEach((p) => buffer.push(p));
    });
    patternOrder.forEach((pIdx) => buffer.push(pIdx));
    const uniquePatterns = Array.from(new Set(patternOrder));
    buffer.push(uniquePatterns.length);
    uniquePatterns.forEach((pIdx) => {
      const pattern = patterns[pIdx];
      if (!pattern) return;
      buffer.push(pIdx);
      buffer.push(pattern.length);
      for (let rIdx = 0; rIdx < pattern.length; rIdx++) {
        const activeCells = [];
        pattern.channels.forEach((channel, cIdx) => {
          const cell = channel.rows[rIdx];
          if (cell && this.isCellActive(cell)) {
            activeCells.push({ cell, channel: cIdx });
          }
        });
        if (activeCells.length === 0) {
          buffer.push(0);
          continue;
        }
        buffer.push(activeCells.length);
        activeCells.forEach(({ cell, channel }) => {
          let mask = 0;
          if (cell.note > 0) mask |= 8;
          if (cell.instrument > 0) mask |= 4;
          if (cell.volume > 0) mask |= 2;
          if (cell.effTyp > 0) mask |= 1;
          buffer.push(channel << 4 | mask);
          if (mask & 8) buffer.push(cell.note);
          if (mask & 4) buffer.push(cell.instrument);
          if (mask & 2) buffer.push(cell.volume);
          if (mask & 1) {
            buffer.push(cell.effTyp);
            buffer.push(cell.eff);
          }
        });
      }
    });
    return new Uint8Array(buffer);
  }
  static getUsedInstrumentIds(patterns, order) {
    const used = /* @__PURE__ */ new Set();
    order.forEach((pIdx) => {
      const pattern = patterns[pIdx];
      if (!pattern) return;
      pattern.channels.forEach((channel) => {
        channel.rows.forEach((cell) => {
          if (cell.instrument > 0) used.add(cell.instrument);
        });
      });
    });
    return used;
  }
  static isCellActive(cell) {
    return cell.note > 0 || cell.instrument > 0 || cell.volume > 0 || cell.effTyp > 0;
  }
  static packSynthParams(inst) {
    const res = new Array(8).fill(0);
    if (inst.synthType === "TB303" && inst.tb303) {
      res[0] = inst.tb303.filter.cutoff;
      res[1] = inst.tb303.filter.resonance;
      res[2] = inst.tb303.filterEnvelope.envMod;
      res[3] = inst.tb303.filterEnvelope.decay;
    } else if (inst.synthType === "SpaceLaser" && inst.spaceLaser) {
      res[0] = inst.spaceLaser.laser.sweepTime / 2e3 * 255;
      res[1] = inst.spaceLaser.fm.amount;
      res[2] = inst.spaceLaser.fm.ratio * 10;
      res[3] = inst.spaceLaser.filter.cutoff / 100;
    } else if (inst.synthType === "V2" && inst.v2) {
      res[0] = inst.v2.osc1.transpose + 64;
      res[1] = inst.v2.osc1.detune + 64;
      res[2] = inst.v2.filter1.cutoff;
      res[3] = inst.v2.filter1.resonance;
    }
    return res.map((v) => Math.floor(Math.min(255, Math.max(0, v))));
  }
}
const EXPORT_MODE_OPTIONS = [
  { value: "song", label: "Song (.dbx)" },
  { value: "sfx", label: "SFX (.sfx.json)" },
  { value: "instrument", label: "Instrument (.dbi)" },
  { value: "audio", label: "Audio (.wav)" },
  { value: "midi", label: "MIDI (.mid)" },
  { value: "xm", label: "XM Module (.xm)" },
  { value: "mod", label: "MOD Module (.mod)" },
  { value: "it", label: "IT Module (.it)" },
  { value: "s3m", label: "S3M Module (.s3m)" },
  { value: "chip", label: "Chip (.vgm/.nsf/...)" },
  { value: "nano", label: "Nano Binary (.dbn)" },
  { value: "native", label: "Native Format (with edits)" }
];
const FORMAT_EXTENSIONS = {
  song: ".dbx",
  sfx: ".sfx.json",
  instrument: ".dbi",
  audio: ".wav",
  midi: ".mid",
  xm: ".xm",
  mod: ".mod",
  it: ".it",
  s3m: ".s3m",
  chip: ".vgm",
  nano: ".dbn",
  native: "",
  fur: ".fur"
};
const CHIP_FORMAT_DESCRIPTIONS = {
  vgm: "Video Game Music — multi-chip, custom loop support",
  gym: "Genesis YM2612 — Sega Genesis/Mega Drive audio",
  nsf: "NES Sound Format — Nintendo 8-bit audio",
  gbs: "Game Boy Sound — original Game Boy audio",
  spc: "SPC700 — Super Nintendo audio processor",
  zsm: "ZSM — Commander X16 audio",
  sap: "SAP — Atari 8-bit POKEY audio",
  tiuna: "TIAUna — Atari 2600 TIA audio"
};
const CHIP_FORMATS = [
  { id: "vgm", label: "VGM", loop: "custom", ext: ".vgm" },
  { id: "gym", label: "GYM", loop: "none", ext: ".gym" },
  { id: "nsf", label: "NSF", loop: "auto", ext: ".nsf" },
  { id: "gbs", label: "GBS", loop: "auto", ext: ".gbs" },
  { id: "spc", label: "SPC", loop: "none", ext: ".spc" },
  { id: "zsm", label: "ZSM", loop: "none", ext: ".zsm" }
];
function useExportDialog({ isOpen }) {
  const patterns = useTrackerStore((s) => s.patterns);
  const currentPatternIndex = useTrackerStore((s) => s.currentPatternIndex);
  const importPattern = useTrackerStore((s) => s.importPattern);
  const setCurrentPattern = useTrackerStore((s) => s.setCurrentPattern);
  const loadPatterns = useTrackerStore((s) => s.loadPatterns);
  const instruments = useInstrumentStore((s) => s.instruments);
  const currentInstrumentId = useInstrumentStore((s) => s.currentInstrumentId);
  const addInstrument = useInstrumentStore((s) => s.addInstrument);
  const setCurrentInstrument = useInstrumentStore((s) => s.setCurrentInstrument);
  const loadInstruments = useInstrumentStore((s) => s.loadInstruments);
  const metadata = useProjectStore((s) => s.metadata);
  const setMetadata = useProjectStore((s) => s.setMetadata);
  const bpm = useTransportStore((s) => s.bpm);
  const setBPM = useTransportStore((s) => s.setBPM);
  const isPlaying = useTransportStore((s) => s.isPlaying);
  const stop = useTransportStore((s) => s.stop);
  const curves = useAutomationStore((s) => s.curves);
  const loadCurves = useAutomationStore((s) => s.loadCurves);
  const masterEffects = useAudioStore((s) => s.masterEffects);
  const setMasterEffects = useAudioStore((s) => s.setMasterEffects);
  const modalData = useUIStore((s) => s.modalData);
  const editorMode = useFormatStore((s) => s.editorMode);
  const originalModuleData = useFormatStore((s) => s.originalModuleData);
  const uadeEditableFileData = useFormatStore((s) => s.uadeEditableFileData);
  const uadeEditableFileName = useFormatStore((s) => s.uadeEditableFileName);
  const [dialogMode, setDialogMode] = reactExports.useState("export");
  const [exportMode, setExportMode] = reactExports.useState("song");
  const [options, setOptions] = reactExports.useState({
    includeAutomation: true,
    prettify: true
  });
  const [sfxName, setSfxName] = reactExports.useState("MySound");
  const [selectedPatternIndex, setSelectedPatternIndex] = reactExports.useState(currentPatternIndex);
  const [selectedInstrumentId, setSelectedInstrumentId] = reactExports.useState(currentInstrumentId || 0);
  const [isRendering, setIsRendering] = reactExports.useState(false);
  const [renderProgress, setRenderProgress] = reactExports.useState(0);
  reactExports.useEffect(() => {
    if (isOpen && (modalData == null ? void 0 : modalData.audioScope) === "arrangement") {
      setExportMode("audio");
    }
  }, [isOpen, modalData]);
  const handleExportSong = reactExports.useCallback((onClose) => {
    var _a, _b;
    const { patternOrder } = useTrackerStore.getState();
    const sequence = patternOrder.map((idx) => {
      var _a2;
      return (_a2 = patterns[idx]) == null ? void 0 : _a2.id;
    }).filter(Boolean);
    const automationData = {};
    patterns.forEach((pattern) => {
      pattern.channels.forEach((_channel, channelIndex) => {
        const channelCurves = curves.filter(
          (c) => c.patternId === pattern.id && c.channelIndex === channelIndex
        );
        if (channelCurves.length > 0) {
          if (!automationData[pattern.id]) automationData[pattern.id] = {};
          automationData[pattern.id][channelIndex] = channelCurves.reduce(
            (acc, curve) => {
              acc[curve.parameter] = curve;
              return acc;
            },
            {}
          );
        }
      });
    });
    const { speed } = useTransportStore.getState();
    const { linearPeriods } = useEditorStore.getState();
    const trackerFormat = (_b = (_a = patterns[0]) == null ? void 0 : _a.importMetadata) == null ? void 0 : _b.sourceFormat;
    exportSong(
      metadata,
      bpm,
      instruments,
      patterns,
      sequence,
      automationData,
      masterEffects,
      curves,
      options,
      void 0,
      { speed, trackerFormat, linearPeriods },
      patternOrder,
      getOriginalModuleDataForExport()
    );
    onClose();
  }, [patterns, curves, metadata, bpm, instruments, masterEffects, options]);
  const handleExportSFX = reactExports.useCallback((onClose) => {
    const pattern = patterns[selectedPatternIndex];
    const instrument = instruments.find((i) => i.id === selectedInstrumentId);
    if (!pattern || !instrument) {
      notify.warning("Please select a valid pattern and instrument");
      return;
    }
    exportSFX(sfxName, instrument, pattern, bpm, options);
    onClose();
  }, [patterns, instruments, selectedPatternIndex, selectedInstrumentId, sfxName, bpm, options]);
  const handleExportInstrument = reactExports.useCallback((onClose) => {
    const instrument = instruments.find((i) => i.id === selectedInstrumentId);
    if (!instrument) {
      notify.warning("Please select a valid instrument");
      return;
    }
    exportInstrument(instrument, options);
    onClose();
  }, [instruments, selectedInstrumentId, options]);
  const handleExportFur = reactExports.useCallback(async (downloadFn, onClose) => {
    const furBuffer = await saveFurFileWasm();
    const blob = new Blob([furBuffer], { type: "application/octet-stream" });
    const filename = `${metadata.name || "song"}.fur`;
    downloadFn(blob, filename);
    notify.success(`Furnace file "${filename}" exported successfully! (${furBuffer.byteLength} bytes)`);
    onClose();
  }, [metadata]);
  const handleExportNano = reactExports.useCallback((downloadFn, onClose) => {
    const sequence = patterns.map((_, idx) => idx);
    const nanoData = NanoExporter.export(instruments, patterns, sequence, bpm, 6);
    const blob = new Blob([new Uint8Array(nanoData)], { type: "application/octet-stream" });
    const filename = `${metadata.name || "song"}.dbn`;
    downloadFn(blob, filename);
    notify.success(`Nano binary exported! (${nanoData.length} bytes)`);
    onClose();
  }, [patterns, instruments, bpm, metadata]);
  const handleExportNative = reactExports.useCallback(async (downloadFn, onClose) => {
    var _a, _b, _c;
    const { getTrackerReplayer } = await __vitePreload(async () => {
      const { getTrackerReplayer: getTrackerReplayer2 } = await import("./main-BbV5VyEH.js").then((n) => n.j6);
      return { getTrackerReplayer: getTrackerReplayer2 };
    }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
    const song = getTrackerReplayer().getSong();
    if (!song) {
      notify.error("No song loaded");
      return;
    }
    const format = song.format;
    const layoutFmtId = ((_a = song.uadePatternLayout) == null ? void 0 : _a.formatId) || ((_b = song.uadeVariableLayout) == null ? void 0 : _b.formatId) || "";
    let result = null;
    const baseName = (song.name || "untitled").replace(/[^a-zA-Z0-9_-]/g, "_");
    const blobType = "application/octet-stream";
    if (format === "JamCracker") {
      const { exportAsJamCracker } = await __vitePreload(async () => {
        const { exportAsJamCracker: exportAsJamCracker2 } = await import("./JamCrackerExporter-Bm1Nsd2L.js");
        return { exportAsJamCracker: exportAsJamCracker2 };
      }, true ? __vite__mapDeps([7,0,1,2,3,4,5,6]) : void 0);
      result = await exportAsJamCracker(song);
    } else if (format === "SMON") {
      const { exportAsSoundMon } = await __vitePreload(async () => {
        const { exportAsSoundMon: exportAsSoundMon2 } = await import("./SoundMonExporter-FD_nnlBy.js");
        return { exportAsSoundMon: exportAsSoundMon2 };
      }, true ? __vite__mapDeps([8,9,0,1,2,3,4,5,6]) : void 0);
      result = await exportAsSoundMon(song);
    } else if (format === "MOD" && !layoutFmtId) {
      const { exportSongToMOD } = await __vitePreload(async () => {
        const { exportSongToMOD: exportSongToMOD2 } = await import("./modExport-CKzh04Ua.js");
        return { exportSongToMOD: exportSongToMOD2 };
      }, true ? [] : void 0);
      const modResult = await exportSongToMOD(song, { bakeSynths: true });
      result = { data: modResult.blob, filename: modResult.filename, warnings: modResult.warnings };
    } else if (format === "FC") {
      const { exportFC } = await __vitePreload(async () => {
        const { exportFC: exportFC2 } = await import("./FCExporter-CAwaVezs.js");
        return { exportFC: exportFC2 };
      }, true ? [] : void 0);
      const buf = exportFC(song);
      result = { data: new Blob([buf], { type: blobType }), filename: `${baseName}.fc`, warnings: [] };
    } else if (format === "SidMon2") {
      const { exportSidMon2File } = await __vitePreload(async () => {
        const { exportSidMon2File: exportSidMon2File2 } = await import("./SidMon2Exporter-CAyTYVHD.js");
        return { exportSidMon2File: exportSidMon2File2 };
      }, true ? __vite__mapDeps([10,11,0,1,2,3,4,5,6]) : void 0);
      const buf = await exportSidMon2File(song);
      result = { data: new Blob([buf], { type: blobType }), filename: `${baseName}.sd2`, warnings: [] };
    } else if (format === "PumaTracker") {
      const { exportPumaTrackerFile } = await __vitePreload(async () => {
        const { exportPumaTrackerFile: exportPumaTrackerFile2 } = await import("./PumaTrackerExporter-BrGn_mRA.js");
        return { exportPumaTrackerFile: exportPumaTrackerFile2 };
      }, true ? [] : void 0);
      const buf = exportPumaTrackerFile(song);
      result = { data: new Blob([buf], { type: blobType }), filename: `${baseName}.puma`, warnings: [] };
    } else if (format === "OctaMED") {
      const { exportMED } = await __vitePreload(async () => {
        const { exportMED: exportMED2 } = await import("./MEDExporter-C5dzZxI4.js");
        return { exportMED: exportMED2 };
      }, true ? [] : void 0);
      const buf = exportMED(song);
      result = { data: new Blob([buf], { type: blobType }), filename: `${baseName}.mmd0`, warnings: [] };
    } else if (format === "HVL" || format === "AHX" || layoutFmtId === "hivelyHVL" || layoutFmtId === "hivelyAHX") {
      const { exportAsHively } = await __vitePreload(async () => {
        const { exportAsHively: exportAsHively2 } = await import("./main-BbV5VyEH.js").then((n) => n.jv);
        return { exportAsHively: exportAsHively2 };
      }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
      const hvlFmt = format === "AHX" || layoutFmtId === "hivelyAHX" ? "ahx" : "hvl";
      result = exportAsHively(song, { format: hvlFmt, nativeOverride: useFormatStore.getState().hivelyNative });
    } else if (format === "DIGI" || layoutFmtId === "digiBooster") {
      const { exportDigiBooster } = await __vitePreload(async () => {
        const { exportDigiBooster: exportDigiBooster2 } = await import("./DigiBoosterExporter-B8oJIU6Q.js");
        return { exportDigiBooster: exportDigiBooster2 };
      }, true ? [] : void 0);
      const buf = exportDigiBooster(song);
      result = { data: new Blob([new Uint8Array(buf)], { type: blobType }), filename: `${baseName}.dbm`, warnings: [] };
    } else if (format === "OKT" || layoutFmtId === "oktalyzer") {
      const { exportOktalyzer } = await __vitePreload(async () => {
        const { exportOktalyzer: exportOktalyzer2 } = await import("./OktalyzerExporter-BLabO2-P.js");
        return { exportOktalyzer: exportOktalyzer2 };
      }, true ? [] : void 0);
      const buf = exportOktalyzer(song);
      result = { data: new Blob([new Uint8Array(buf)], { type: blobType }), filename: `${baseName}.okt`, warnings: [] };
    } else if (format === "KT" || layoutFmtId === "klystrack") {
      const { exportAsKlystrack } = await __vitePreload(async () => {
        const { exportAsKlystrack: exportAsKlystrack2 } = await import("./main-BbV5VyEH.js").then((n) => n.jz);
        return { exportAsKlystrack: exportAsKlystrack2 };
      }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
      result = await exportAsKlystrack(song);
    } else if (layoutFmtId === "musicLine") {
      const { exportMusicLineFile } = await __vitePreload(async () => {
        const { exportMusicLineFile: exportMusicLineFile2 } = await import("./main-BbV5VyEH.js").then((n) => n.jg);
        return { exportMusicLineFile: exportMusicLineFile2 };
      }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
      const buf = exportMusicLineFile(song);
      result = { data: new Blob([new Uint8Array(buf)], { type: blobType }), filename: `${baseName}.ml`, warnings: [] };
    } else if (layoutFmtId === "musicAssembler") {
      const { exportAsMusicAssembler } = await __vitePreload(async () => {
        const { exportAsMusicAssembler: exportAsMusicAssembler2 } = await import("./MusicAssemblerExporter-D7HF2LHx.js");
        return { exportAsMusicAssembler: exportAsMusicAssembler2 };
      }, true ? __vite__mapDeps([12,13,0,1,2,3,4,5,6]) : void 0);
      result = await exportAsMusicAssembler(song);
    } else if (layoutFmtId === "futurePlayer") {
      const { exportAsFuturePlayer } = await __vitePreload(async () => {
        const { exportAsFuturePlayer: exportAsFuturePlayer2 } = await import("./FuturePlayerExporter-dy63rnjn.js");
        return { exportAsFuturePlayer: exportAsFuturePlayer2 };
      }, true ? __vite__mapDeps([14,0,1,2,3,4,5,6]) : void 0);
      result = await exportAsFuturePlayer(song);
    } else if (layoutFmtId === "digitalSymphony") {
      const { exportDigitalSymphony } = await __vitePreload(async () => {
        const { exportDigitalSymphony: exportDigitalSymphony2 } = await import("./DigitalSymphonyExporter-52RDW08e.js");
        return { exportDigitalSymphony: exportDigitalSymphony2 };
      }, true ? [] : void 0);
      const buf = exportDigitalSymphony(song);
      result = { data: new Blob([new Uint8Array(buf)], { type: blobType }), filename: `${baseName}.dsym`, warnings: [] };
    } else if (layoutFmtId === "amosMusicBank") {
      const { exportAMOSMusicBank } = await __vitePreload(async () => {
        const { exportAMOSMusicBank: exportAMOSMusicBank2 } = await import("./AMOSMusicBankExporter-Bx1bVkvH.js");
        return { exportAMOSMusicBank: exportAMOSMusicBank2 };
      }, true ? [] : void 0);
      const buf = exportAMOSMusicBank(song);
      result = { data: new Blob([new Uint8Array(buf)], { type: blobType }), filename: `${baseName}.abk`, warnings: [] };
    } else if (layoutFmtId === "hippelCoSo") {
      const { exportAsHippelCoSo } = await __vitePreload(async () => {
        const { exportAsHippelCoSo: exportAsHippelCoSo2 } = await import("./HippelCoSoExporter-C0Zi7hr-.js");
        return { exportAsHippelCoSo: exportAsHippelCoSo2 };
      }, true ? __vite__mapDeps([15,9,0,1,2,3,4,5,6]) : void 0);
      result = await exportAsHippelCoSo(song);
    } else if (layoutFmtId === "symphoniePro" || song.symphonieFileData) {
      const { exportSymphonieProFile } = await __vitePreload(async () => {
        const { exportSymphonieProFile: exportSymphonieProFile2 } = await import("./SymphonieProExporter-ngOEuvf8.js");
        return { exportSymphonieProFile: exportSymphonieProFile2 };
      }, true ? [] : void 0);
      const buf = exportSymphonieProFile(song);
      result = { data: new Blob([new Uint8Array(buf)], { type: blobType }), filename: `${baseName}.symmod`, warnings: [] };
    } else if (format === "IS10" || layoutFmtId === "inStereo1") {
      const { exportInStereo1 } = await __vitePreload(async () => {
        const { exportInStereo1: exportInStereo12 } = await import("./InStereo1Exporter-Cxkntot5.js");
        return { exportInStereo1: exportInStereo12 };
      }, true ? [] : void 0);
      result = await exportInStereo1(song);
    } else if (layoutFmtId === "inStereo2") {
      const { exportInStereo2 } = await __vitePreload(async () => {
        const { exportInStereo2: exportInStereo22 } = await import("./InStereo2Exporter-BGJ6avAK.js");
        return { exportInStereo2: exportInStereo22 };
      }, true ? [] : void 0);
      result = await exportInStereo2(song);
    } else if (layoutFmtId === "deltaMusic1") {
      const { exportDeltaMusic1 } = await __vitePreload(async () => {
        const { exportDeltaMusic1: exportDeltaMusic12 } = await import("./DeltaMusic1Exporter-DFaEJIDT.js");
        return { exportDeltaMusic1: exportDeltaMusic12 };
      }, true ? [] : void 0);
      result = await exportDeltaMusic1(song);
    } else if (layoutFmtId === "deltaMusic2") {
      const { exportDeltaMusic2 } = await __vitePreload(async () => {
        const { exportDeltaMusic2: exportDeltaMusic22 } = await import("./DeltaMusic2Exporter-CnaAyV-8.js");
        return { exportDeltaMusic2: exportDeltaMusic22 };
      }, true ? [] : void 0);
      result = await exportDeltaMusic2(song);
    } else if (layoutFmtId === "digitalMugician") {
      const { exportDigitalMugician } = await __vitePreload(async () => {
        const { exportDigitalMugician: exportDigitalMugician2 } = await import("./DigitalMugicianExporter-4bYsLQYg.js");
        return { exportDigitalMugician: exportDigitalMugician2 };
      }, true ? [] : void 0);
      result = await exportDigitalMugician(song);
    } else if (layoutFmtId === "sidmon1") {
      const { exportSidMon1 } = await __vitePreload(async () => {
        const { exportSidMon1: exportSidMon12 } = await import("./SidMon1Exporter-B6fxupcB.js");
        return { exportSidMon1: exportSidMon12 };
      }, true ? [] : void 0);
      result = await exportSidMon1(song);
    } else if (layoutFmtId === "sonicArranger") {
      const { exportSonicArranger } = await __vitePreload(async () => {
        const { exportSonicArranger: exportSonicArranger2 } = await import("./SonicArrangerExporter-B1Jui2L_.js");
        return { exportSonicArranger: exportSonicArranger2 };
      }, true ? [] : void 0);
      result = await exportSonicArranger(song);
    } else if (layoutFmtId === "tfmx") {
      const { exportTFMX } = await __vitePreload(async () => {
        const { exportTFMX: exportTFMX2 } = await import("./TFMXExporter-D2hAD6DC.js");
        return { exportTFMX: exportTFMX2 };
      }, true ? __vite__mapDeps([16,17,0,1,2,3,4,5,6]) : void 0);
      result = await exportTFMX(song);
    } else if (layoutFmtId === "fredEditor") {
      const { exportFredEditor } = await __vitePreload(async () => {
        const { exportFredEditor: exportFredEditor2 } = await import("./FredEditorExporter-x7u743vM.js");
        return { exportFredEditor: exportFredEditor2 };
      }, true ? __vite__mapDeps([18,19,0,1,2,3,4,5,6]) : void 0);
      result = await exportFredEditor(song);
    } else if (layoutFmtId === "soundfx") {
      const { exportSoundFX } = await __vitePreload(async () => {
        const { exportSoundFX: exportSoundFX2 } = await import("./SoundFXExporter-B6AvOEWG.js");
        return { exportSoundFX: exportSoundFX2 };
      }, true ? __vite__mapDeps([20,21,0,1,2,3,4,5,6]) : void 0);
      result = await exportSoundFX(song);
    } else if (layoutFmtId === "tcbTracker") {
      const { exportTCBTracker } = await __vitePreload(async () => {
        const { exportTCBTracker: exportTCBTracker2 } = await import("./TCBTrackerExporter-pp9rw-uM.js");
        return { exportTCBTracker: exportTCBTracker2 };
      }, true ? [] : void 0);
      result = await exportTCBTracker(song);
    } else if (layoutFmtId === "gameMusicCreator") {
      const { exportGameMusicCreator } = await __vitePreload(async () => {
        const { exportGameMusicCreator: exportGameMusicCreator2 } = await import("./GameMusicCreatorExporter-4SrXED-M.js");
        return { exportGameMusicCreator: exportGameMusicCreator2 };
      }, true ? __vite__mapDeps([22,23,0,1,2,3,4,5,6]) : void 0);
      result = await exportGameMusicCreator(song);
    } else if (layoutFmtId === "quadraComposer") {
      const { exportQuadraComposer } = await __vitePreload(async () => {
        const { exportQuadraComposer: exportQuadraComposer2 } = await import("./QuadraComposerExporter-C011SLMw.js");
        return { exportQuadraComposer: exportQuadraComposer2 };
      }, true ? __vite__mapDeps([24,25,0,1,2,3,4,5,6]) : void 0);
      result = await exportQuadraComposer(song);
    } else if (layoutFmtId === "activisionPro") {
      const { exportActivisionPro } = await __vitePreload(async () => {
        const { exportActivisionPro: exportActivisionPro2 } = await import("./ActivisionProExporter-BAr3tAak.js");
        return { exportActivisionPro: exportActivisionPro2 };
      }, true ? [] : void 0);
      result = await exportActivisionPro(song);
    } else if (layoutFmtId === "digiBoosterPro") {
      const { exportDigiBoosterPro } = await __vitePreload(async () => {
        const { exportDigiBoosterPro: exportDigiBoosterPro2 } = await import("./DigiBoosterProExporter-GPsZsGfl.js");
        return { exportDigiBoosterPro: exportDigiBoosterPro2 };
      }, true ? [] : void 0);
      result = await exportDigiBoosterPro(song);
    } else if (layoutFmtId === "faceTheMusic") {
      const { exportFaceTheMusic } = await __vitePreload(async () => {
        const { exportFaceTheMusic: exportFaceTheMusic2 } = await import("./FaceTheMusicExporter-Dt2IfVl8.js");
        return { exportFaceTheMusic: exportFaceTheMusic2 };
      }, true ? [] : void 0);
      result = await exportFaceTheMusic(song);
    } else if (layoutFmtId === "sawteeth") {
      const { exportSawteeth } = await __vitePreload(async () => {
        const { exportSawteeth: exportSawteeth2 } = await import("./SawteethExporter-CdL8ZtSB.js");
        return { exportSawteeth: exportSawteeth2 };
      }, true ? [] : void 0);
      result = await exportSawteeth(song);
    } else if (layoutFmtId === "earAche") {
      const { exportEarAche } = await __vitePreload(async () => {
        const { exportEarAche: exportEarAche2 } = await import("./EarAcheExporter-B4kiZKB_.js");
        return { exportEarAche: exportEarAche2 };
      }, true ? __vite__mapDeps([26,27,0,1,2,3,4,5,6]) : void 0);
      result = await exportEarAche(song);
    } else if (layoutFmtId === "iffSmus") {
      const { exportIffSmus } = await __vitePreload(async () => {
        const { exportIffSmus: exportIffSmus2 } = await import("./IffSmusExporter-zExqCya_.js");
        return { exportIffSmus: exportIffSmus2 };
      }, true ? [] : void 0);
      result = await exportIffSmus(song);
    } else if (layoutFmtId === "actionamics") {
      const { exportActionamics } = await __vitePreload(async () => {
        const { exportActionamics: exportActionamics2 } = await import("./ActionamicsExporter-CyWPt3ZT.js");
        return { exportActionamics: exportActionamics2 };
      }, true ? __vite__mapDeps([28,29,0,1,2,3,4,5,6]) : void 0);
      result = await exportActionamics(song);
    } else if (layoutFmtId === "soundFactory") {
      const { exportSoundFactory } = await __vitePreload(async () => {
        const { exportSoundFactory: exportSoundFactory2 } = await import("./SoundFactoryExporter-AfCFg3rk.js");
        return { exportSoundFactory: exportSoundFactory2 };
      }, true ? [] : void 0);
      result = await exportSoundFactory(song);
    } else if (layoutFmtId === "synthesis") {
      const { exportSynthesis } = await __vitePreload(async () => {
        const { exportSynthesis: exportSynthesis2 } = await import("./SynthesisExporter-Ro1L70Fl.js");
        return { exportSynthesis: exportSynthesis2 };
      }, true ? [] : void 0);
      result = await exportSynthesis(song);
    } else if (layoutFmtId === "soundControl") {
      const { exportSoundControl } = await __vitePreload(async () => {
        const { exportSoundControl: exportSoundControl2 } = await import("./SoundControlExporter-CFlJIMzP.js");
        return { exportSoundControl: exportSoundControl2 };
      }, true ? [] : void 0);
      result = await exportSoundControl(song);
    } else if (layoutFmtId === "c67") {
      const { exportCDFM67 } = await __vitePreload(async () => {
        const { exportCDFM67: exportCDFM672 } = await import("./CDFM67Exporter-DX6fYUmH.js");
        return { exportCDFM67: exportCDFM672 };
      }, true ? __vite__mapDeps([30,31,0,1,2,3,4,5,6]) : void 0);
      result = await exportCDFM67(song);
    } else if (layoutFmtId === "zoundMonitor") {
      const { exportZoundMonitor } = await __vitePreload(async () => {
        const { exportZoundMonitor: exportZoundMonitor2 } = await import("./ZoundMonitorExporter-Bl0DWhIk.js");
        return { exportZoundMonitor: exportZoundMonitor2 };
      }, true ? [] : void 0);
      result = await exportZoundMonitor(song);
    } else if (layoutFmtId === "chuckBiscuits") {
      const { exportChuckBiscuits } = await __vitePreload(async () => {
        const { exportChuckBiscuits: exportChuckBiscuits2 } = await import("./ChuckBiscuitsExporter-PCRvg43g.js");
        return { exportChuckBiscuits: exportChuckBiscuits2 };
      }, true ? __vite__mapDeps([32,0,1,2,3,4,5,6]) : void 0);
      result = await exportChuckBiscuits(song);
    } else if (layoutFmtId === "composer667") {
      const { exportComposer667 } = await __vitePreload(async () => {
        const { exportComposer667: exportComposer6672 } = await import("./Composer667Exporter-bu99wWvs.js");
        return { exportComposer667: exportComposer6672 };
      }, true ? __vite__mapDeps([33,34,0,1,2,3,4,5,6]) : void 0);
      result = await exportComposer667(song);
    } else if (layoutFmtId === "kris") {
      const { exportKRIS } = await __vitePreload(async () => {
        const { exportKRIS: exportKRIS2 } = await import("./KRISExporter-CL0gVN3U.js");
        return { exportKRIS: exportKRIS2 };
      }, true ? [] : void 0);
      result = await exportKRIS(song);
    } else if (layoutFmtId === "nru") {
      const { exportNRU } = await __vitePreload(async () => {
        const { exportNRU: exportNRU2 } = await import("./NRUExporter-a2mvB_pu.js");
        return { exportNRU: exportNRU2 };
      }, true ? [] : void 0);
      result = await exportNRU(song);
    } else if (layoutFmtId === "ims") {
      const { exportIMS } = await __vitePreload(async () => {
        const { exportIMS: exportIMS2 } = await import("./IMSExporter-BpaTxWGa.js");
        return { exportIMS: exportIMS2 };
      }, true ? __vite__mapDeps([35,0,1,2,3,4,5,6]) : void 0);
      result = await exportIMS(song);
    } else if (layoutFmtId === "stp") {
      const { exportSTP } = await __vitePreload(async () => {
        const { exportSTP: exportSTP2 } = await import("./STPExporter-CW5HA83S.js");
        return { exportSTP: exportSTP2 };
      }, true ? [] : void 0);
      result = await exportSTP(song);
    } else if (layoutFmtId === "unic") {
      const { exportUNIC } = await __vitePreload(async () => {
        const { exportUNIC: exportUNIC2 } = await import("./UNICExporter-BEJRCG-h.js");
        return { exportUNIC: exportUNIC2 };
      }, true ? [] : void 0);
      result = await exportUNIC(song);
    } else if (layoutFmtId === "dsm_dyn") {
      const { exportDSMDyn } = await __vitePreload(async () => {
        const { exportDSMDyn: exportDSMDyn2 } = await import("./DSMDynExporter-j0ddPSuf.js");
        return { exportDSMDyn: exportDSMDyn2 };
      }, true ? [] : void 0);
      result = await exportDSMDyn(song);
    } else if (layoutFmtId === "scumm") {
      const { exportSCUMM } = await __vitePreload(async () => {
        const { exportSCUMM: exportSCUMM2 } = await import("./SCUMMExporter-Dk08VVdk.js");
        return { exportSCUMM: exportSCUMM2 };
      }, true ? __vite__mapDeps([36,37,0,1,2,3,4,5,6]) : void 0);
      result = await exportSCUMM(song);
    } else if (layoutFmtId === "xmf") {
      const { exportXMF } = await __vitePreload(async () => {
        const { exportXMF: exportXMF2 } = await import("./XMFExporter-CCpAR7A8.js");
        return { exportXMF: exportXMF2 };
      }, true ? __vite__mapDeps([38,39,0,1,2,3,4,5,6]) : void 0);
      result = await exportXMF(song);
    } else if (format === "AdPlug") {
      const { exportAdPlug } = await __vitePreload(async () => {
        const { exportAdPlug: exportAdPlug2 } = await import("./AdPlugExporter-DwxlB-cL.js");
        return { exportAdPlug: exportAdPlug2 };
      }, true ? [] : void 0);
      result = exportAdPlug(song, "rad");
    }
    if (!result) {
      try {
        const { UADEChipEditor } = await __vitePreload(async () => {
          const { UADEChipEditor: UADEChipEditor2 } = await import("./UADEChipEditor-DnALwiXS.js");
          return { UADEChipEditor: UADEChipEditor2 };
        }, true ? __vite__mapDeps([9,0,1,2,3,4,5,6]) : void 0);
        const { UADEEngine } = await __vitePreload(async () => {
          const { UADEEngine: UADEEngine2 } = await import("./main-BbV5VyEH.js").then((n) => n.iN);
          return { UADEEngine: UADEEngine2 };
        }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
        if (UADEEngine.hasInstance()) {
          const chipEditor = new UADEChipEditor(UADEEngine.getInstance());
          const fmtUadeData = useFormatStore.getState().uadeEditableFileData;
          const fmtUadeFileName = useFormatStore.getState().uadeEditableFileName;
          let moduleSize = (fmtUadeData == null ? void 0 : fmtUadeData.byteLength) ?? 0;
          if (moduleSize === 0) {
            const songInstruments = song.instruments || [];
            const chipInfo = (_c = songInstruments.find((i) => i.uadeChipRam)) == null ? void 0 : _c.uadeChipRam;
            moduleSize = (chipInfo == null ? void 0 : chipInfo.moduleSize) ?? 0;
          }
          if (moduleSize > 0) {
            const bytes = await chipEditor.readEditedModule(moduleSize);
            const ext = (fmtUadeFileName || song.name || "").split(".").pop() || "bin";
            const fname = `${baseName}.${ext}`;
            result = {
              data: new Blob([new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)], { type: blobType }),
              filename: fname,
              warnings: ["Exported via chip RAM readback — edits to pattern data are included"]
            };
          }
        }
      } catch {
      }
    }
    if (result) {
      downloadFn(result.data, result.filename);
      if (result.warnings.length > 0) {
        notify.warning(`Exported with warnings: ${result.warnings.join("; ")}`);
      } else {
        notify.success(`Native format exported: ${result.filename}`);
      }
    } else {
      notify.error("No native exporter available for this format");
    }
    onClose();
  }, []);
  const handleImportFile = reactExports.useCallback(async (file, onClose) => {
    if (isPlaying) {
      stop();
      const engine = getToneEngine();
      engine.releaseAll();
    }
    try {
      const format = await detectFileFormat(file);
      switch (format) {
        case "song": {
          const data = await importSong(file);
          if (data) {
            setMetadata(data.metadata);
            setBPM(data.bpm);
            loadPatterns(data.patterns);
            loadInstruments(data.instruments);
            if (data.automationCurves && data.automationCurves.length > 0) {
              loadCurves(data.automationCurves);
            } else if (data.automation) {
              const allCurves = [];
              Object.entries(data.automation).forEach(([, channels]) => {
                Object.entries(channels).forEach(([, params]) => {
                  Object.values(params).forEach((curve) => allCurves.push(curve));
                });
              });
              if (allCurves.length > 0) loadCurves(allCurves);
            }
            if (data.masterEffects && data.masterEffects.length > 0) setMasterEffects(data.masterEffects);
            notify.success(`Song "${data.metadata.name}" imported!`);
          }
          break;
        }
        case "sfx": {
          const data = await importSFX(file);
          if (data) {
            const patternIndex = importPattern(data.pattern);
            addInstrument(data.instrument);
            setCurrentPattern(patternIndex);
            setCurrentInstrument(data.instrument.id);
            notify.success(`SFX "${data.name}" imported!`);
          }
          break;
        }
        case "instrument": {
          const data = await importInstrument(file);
          if (data) {
            addInstrument(data.instrument);
            setCurrentInstrument(data.instrument.id);
            notify.success(`Instrument "${data.instrument.name}" imported!`);
          }
          break;
        }
        default:
          notify.error("Unknown or invalid file format");
      }
      onClose();
    } catch (error) {
      console.error("Import failed:", error);
      notify.error("Import failed: " + error.message);
    }
  }, [
    isPlaying,
    stop,
    setMetadata,
    setBPM,
    loadPatterns,
    loadInstruments,
    loadCurves,
    setMasterEffects,
    importPattern,
    addInstrument,
    setCurrentPattern,
    setCurrentInstrument
  ]);
  return {
    // Store bindings
    patterns,
    currentPatternIndex,
    instruments,
    currentInstrumentId,
    metadata,
    bpm,
    isPlaying,
    stop,
    curves,
    masterEffects,
    modalData,
    editorMode,
    originalModuleData,
    uadeEditableFileData,
    uadeEditableFileName,
    // Store setters (used by import handler internally, but also needed by dialog panels)
    setMetadata,
    setBPM,
    loadPatterns,
    loadInstruments,
    loadCurves,
    setMasterEffects,
    importPattern,
    addInstrument,
    setCurrentPattern,
    setCurrentInstrument,
    // Shared state
    dialogMode,
    setDialogMode,
    exportMode,
    setExportMode,
    options,
    setOptions,
    sfxName,
    setSfxName,
    selectedPatternIndex,
    setSelectedPatternIndex,
    selectedInstrumentId,
    setSelectedInstrumentId,
    isRendering,
    setIsRendering,
    renderProgress,
    setRenderProgress,
    // Shared handlers
    handleExportSong,
    handleExportSFX,
    handleExportInstrument,
    handleExportFur,
    handleExportNano,
    handleExportNative,
    handleImportFile
  };
}
export {
  CHIP_FORMATS as C,
  EXPORT_MODE_OPTIONS as E,
  FORMAT_EXTENSIONS as F,
  CHIP_FORMAT_DESCRIPTIONS as a,
  useExportDialog as u
};
