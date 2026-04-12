const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/main-BbV5VyEH.js","assets/client-DHYdgbIN.js","assets/vendor-ui-AJ7AT9BN.js","assets/vendor-react-Dgd_wxYf.js","assets/vendor-utils-a-Usm5Xm.js","assets/vendor-tone-48TQc1H3.js","assets/main-c6CPs1E0.css"])))=>i.map(i=>d[i]);
import { bQ as createWavFile, bR as arrayBufferToBase64, am as __vitePreload } from "./main-BbV5VyEH.js";
import { loadModule, getModuleInfo, getMidiMacroString, parseSymphonieDSPMacro, getOrderList, getPatternNumRows, getPatternData, getInstrumentNames, getSampleNames, getSampleInfo, getSampleData, DSP_EFFECT_MARKER } from "./OpenMPTSoundlib-RubRPKN7.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function mapFormat(type) {
  switch (type.toUpperCase()) {
    case "MOD":
      return "MOD";
    case "XM":
      return "XM";
    case "IT":
      return "IT";
    case "S3M":
      return "S3M";
    // Amiga formats that DEViLBOX has native TrackerFormat entries for
    case "OKT":
      return "OKT";
    case "MED":
      return "MED";
    case "DIGI":
      return "DIGI";
    case "DBM":
      return "DBM";
    case "SFX":
      return "SFX";
    // All other PC/exotic formats → treat as IT-compatible for editing
    default:
      return "IT";
  }
}
function mapNote(openmptNote, format) {
  if (openmptNote === 0) return 0;
  if (openmptNote === 255) return 97;
  if (openmptNote === 254) return 97;
  if (openmptNote === 253) return 97;
  if (openmptNote >= 1 && openmptNote <= 120) {
    const offset = format === "MOD" ? 36 : 12;
    const adjusted = openmptNote - offset;
    return Math.max(1, Math.min(adjusted, 96));
  }
  return 0;
}
function mapVolumeColumn(volcmd, vol) {
  switch (volcmd) {
    case 0:
      return 0;
    // None
    case 1:
      return 16 + Math.min(vol, 64);
    // Volume set (0x10-0x50)
    case 2:
      return 192 + (vol >> 2);
    // Panning
    case 3:
      return 96 + vol;
    // Vol slide up
    case 4:
      return 112 + vol;
    // Vol slide down
    case 5:
      return 128 + vol;
    // Fine vol slide up
    case 6:
      return 144 + vol;
    // Fine vol slide down
    case 7:
      return 160 + vol;
    // Vibrato speed
    case 8:
      return 176 + vol;
    // Vibrato depth
    case 11:
      return 240 + vol;
    // Tone portamento
    default:
      return 0;
  }
}
function mapEffect(cmd, param) {
  switch (cmd) {
    case 0:
      return { effTyp: 0, eff: 0 };
    // CMD_NONE → empty
    case 1:
      return { effTyp: 0, eff: param };
    // CMD_ARPEGGIO → 0xy
    case 2:
      return { effTyp: 1, eff: param };
    // CMD_PORTAMENTOUP → 1xx
    case 3:
      return { effTyp: 2, eff: param };
    // CMD_PORTAMENTODOWN → 2xx
    case 4:
      return { effTyp: 3, eff: param };
    // CMD_TONEPORTAMENTO → 3xx
    case 5:
      return { effTyp: 4, eff: param };
    // CMD_VIBRATO → 4xy
    case 6:
      return { effTyp: 5, eff: param };
    // CMD_TONEPORTAVOL → 5xy
    case 7:
      return { effTyp: 6, eff: param };
    // CMD_VIBRATOVOL → 6xy
    case 8:
      return { effTyp: 7, eff: param };
    // CMD_TREMOLO → 7xy
    case 9:
      return { effTyp: 8, eff: param };
    // CMD_PANNING8 → 8xx
    case 10:
      return { effTyp: 9, eff: param };
    // CMD_OFFSET → 9xx
    case 11:
      return { effTyp: 10, eff: param };
    // CMD_VOLUMESLIDE → Axy
    case 12:
      return { effTyp: 11, eff: param };
    // CMD_POSITIONJUMP → Bxx
    case 13:
      return { effTyp: 12, eff: param };
    // CMD_VOLUME → Cxx
    case 14:
      return { effTyp: 13, eff: param };
    // CMD_PATTERNBREAK → Dxx
    case 15:
      return { effTyp: 27, eff: param };
    // CMD_RETRIG → Rxy (multi-retrig)
    case 16:
      return { effTyp: 15, eff: param };
    // CMD_SPEED → Fxx (speed < 0x20)
    case 17:
      return { effTyp: 15, eff: param };
    // CMD_TEMPO → Fxx (tempo >= 0x20)
    case 18:
      return { effTyp: 29, eff: param };
    // CMD_TREMOR → Txy
    case 19:
      return { effTyp: 14, eff: param };
    // CMD_MODCMDEX → Exy (extended)
    case 20:
      return { effTyp: 14, eff: param };
    case 21:
      return { effTyp: 0, eff: 0 };
    // CMD_CHANNELVOLUME (no XM equiv)
    case 22:
      return { effTyp: 0, eff: 0 };
    // CMD_CHANNELVOLSLIDE (no XM equiv)
    case 23:
      return { effTyp: 16, eff: param };
    // CMD_GLOBALVOLUME → Gxx
    case 24:
      return { effTyp: 17, eff: param };
    // CMD_GLOBALVOLSLIDE → Hxy
    case 25:
      return { effTyp: 20, eff: param };
    // CMD_KEYOFF → Kxx
    case 26:
      return { effTyp: 4, eff: param };
    // CMD_FINEVIBRATO → 4xy (approx)
    case 27:
      return { effTyp: 25, eff: param };
    // CMD_PANBRELLO → Yxy → Pxy (approx)
    case 28:
      return { effTyp: 33, eff: param };
    // CMD_XFINEPORTAUPDOWN → Xxx
    case 29:
      return { effTyp: 25, eff: param };
    // CMD_PANNINGSLIDE → Pxy
    case 30:
      return { effTyp: 21, eff: param };
    // CMD_SETENVPOSITION → Lxx
    case 31:
      return { effTyp: 0, eff: 0 };
    // CMD_MIDI — handled separately in buildChannelData
    default:
      return { effTyp: 0, eff: 0 };
  }
}
function buildChannelData(channelIdx, rows, numRows, format, dspMacroMap = /* @__PURE__ */ new Map()) {
  var _a;
  const cells = [];
  for (let r = 0; r < numRows; r++) {
    const cell = (_a = rows[r]) == null ? void 0 : _a[channelIdx];
    if (!cell) {
      cells.push({
        note: 0,
        instrument: 0,
        volume: 0,
        effTyp: 0,
        eff: 0,
        effTyp2: 0,
        eff2: 0
      });
      continue;
    }
    let effTyp = 0, eff = 0, effTyp2 = 0, eff2 = 0;
    if (cell.command === 31) {
      const macroIdx = cell.param >= 128 ? cell.param - 128 : cell.param;
      const dsp = dspMacroMap.get(macroIdx);
      if (dsp) {
        effTyp = DSP_EFFECT_MARKER;
        eff = dsp.bufLen;
        effTyp2 = DSP_EFFECT_MARKER + (dsp.type & 7);
        eff2 = dsp.feedback;
      }
    } else {
      const fx = mapEffect(cell.command, cell.param);
      effTyp = fx.effTyp;
      eff = fx.eff;
    }
    cells.push({
      note: mapNote(cell.note, format),
      instrument: cell.instrument,
      volume: mapVolumeColumn(cell.volcmd, cell.vol),
      effTyp,
      eff,
      effTyp2,
      eff2
    });
  }
  return {
    id: `ch-${channelIdx}`,
    name: `Ch ${channelIdx + 1}`,
    rows: cells,
    muted: false,
    solo: false,
    collapsed: false,
    volume: 100,
    pan: 0,
    instrumentId: null,
    color: null
  };
}
async function parseWithOpenMPT(buffer, filename) {
  const loaded = await loadModule(buffer);
  if (!loaded) {
    throw new Error(`OpenMPT: Failed to load ${filename}`);
  }
  try {
    const info = await getModuleInfo();
    const format = mapFormat(info.type);
    const isSymmod = info.type === "SymMOD" || filename.toLowerCase().endsWith(".symmod");
    const dspMacroMap = /* @__PURE__ */ new Map();
    if (isSymmod) {
      for (let i = 0; i < 128; i++) {
        const str = await getMidiMacroString(i);
        if (!str) continue;
        const dsp = parseSymphonieDSPMacro(str);
        if (dsp) dspMacroMap.set(i, dsp);
      }
    }
    const orderList = await getOrderList();
    const validOrders = orderList.filter((p) => p < 254);
    const patterns = [];
    const numPatterns = info.numPatterns;
    const numChannels = info.numChannels;
    for (let p = 0; p < numPatterns; p++) {
      const numRows = await getPatternNumRows(p);
      if (numRows === 0) {
        patterns.push({
          id: `pat-${p}`,
          name: `Pattern ${p}`,
          length: 64,
          channels: Array.from({ length: numChannels }, (_, c) => ({
            id: `ch-${c}`,
            name: `Ch ${c + 1}`,
            rows: Array.from({ length: 64 }, () => ({
              note: 0,
              instrument: 0,
              volume: 0,
              effTyp: 0,
              eff: 0,
              effTyp2: 0,
              eff2: 0
            })),
            muted: false,
            solo: false,
            collapsed: false,
            volume: 100,
            pan: 0,
            instrumentId: null,
            color: null
          }))
        });
        continue;
      }
      const cellData = await getPatternData(p);
      const channels = [];
      for (let c = 0; c < numChannels; c++) {
        channels.push(buildChannelData(c, cellData, numRows, format, dspMacroMap));
      }
      patterns.push({
        id: `pat-${p}`,
        name: `Pattern ${p}`,
        length: numRows,
        channels
      });
    }
    const instrumentNames = await getInstrumentNames();
    const sampleNames = await getSampleNames();
    const instruments = [];
    const hasInstruments = instrumentNames.length > 0 && info.numInstruments > 0;
    const count = hasInstruments ? instrumentNames.length : sampleNames.length;
    for (let i = 0; i < count; i++) {
      const name = hasInstruments ? instrumentNames[i] || `Instrument ${i + 1}` : sampleNames[i] || `Sample ${i + 1}`;
      const sampleIdx = i + 1;
      let sampleConfig;
      try {
        const smpInfo = await getSampleInfo(sampleIdx);
        if (smpInfo && smpInfo.length > 0) {
          const { data } = await getSampleData(sampleIdx);
          let audioBuffer;
          const c5Speed = smpInfo.c5Speed || 8363;
          const loopWav = smpInfo.hasLoop ? { start: smpInfo.loopStart, end: smpInfo.loopEnd } : void 0;
          if (data instanceof Int16Array && data.length > 0) {
            audioBuffer = createWavFile(data, c5Speed, loopWav);
          } else if (data instanceof Int8Array && data.length > 0) {
            const pcm16 = new Int16Array(data.length);
            for (let s = 0; s < data.length; s++) pcm16[s] = data[s] << 8;
            audioBuffer = createWavFile(pcm16, c5Speed, loopWav);
          } else {
            audioBuffer = new ArrayBuffer(0);
          }
          const sampleUrl = audioBuffer.byteLength > 0 ? `data:audio/wav;base64,${arrayBufferToBase64(audioBuffer)}` : "";
          const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
          const rootMidi = 72 + (smpInfo.relativeTone || 0);
          const toneBaseNote = `${NOTE_NAMES[(rootMidi % 12 + 12) % 12]}${Math.floor(rootMidi / 12) - 1}`;
          sampleConfig = {
            audioBuffer,
            url: sampleUrl,
            baseNote: toneBaseNote,
            detune: smpInfo.fineTune || 0,
            loop: smpInfo.hasLoop,
            loopType: smpInfo.pingPongLoop ? "pingpong" : smpInfo.hasLoop ? "forward" : "off",
            loopStart: smpInfo.loopStart,
            loopEnd: smpInfo.loopEnd,
            sustainLoop: smpInfo.hasSustainLoop,
            sustainLoopStart: smpInfo.sustainStart,
            sustainLoopEnd: smpInfo.sustainEnd,
            sampleRate: smpInfo.c5Speed || 8363,
            reverse: false,
            playbackRate: 1
          };
        }
      } catch {
      }
      instruments.push({
        id: i + 1,
        name,
        synthType: "Sampler",
        type: "sample",
        volume: 0,
        // 0 dB
        pan: 0,
        muted: false,
        solo: false,
        effects: [],
        sample: sampleConfig,
        modPlayback: {
          usePeriodPlayback: format === "MOD",
          periodMultiplier: 3546895,
          finetune: 0,
          relativeNote: 0
        },
        metadata: {
          modPlayback: {
            usePeriodPlayback: format === "MOD",
            periodMultiplier: 3546895,
            finetune: 0,
            defaultVolume: 64
          }
        }
      });
    }
    const song = {
      name: info.title || filename.replace(/\.[^.]+$/, ""),
      format,
      patterns,
      instruments,
      songPositions: validOrders,
      songLength: validOrders.length,
      restartPosition: 0,
      numChannels,
      initialSpeed: info.initialSpeed || 6,
      initialBPM: info.initialBPM || 125,
      linearPeriods: info.linearSlides,
      // Note offset is now baked into mapNote() per format — no display offset needed
      noteDisplayOffset: 0,
      // Store original file data for export fallback (return original binary)
      libopenmptFileData: buffer.slice(0)
    };
    const saveFormatMap = {
      MOD: "mod",
      XM: "xm",
      IT: "it",
      S3M: "s3m",
      MPTM: "it"
    };
    const { markLoaded } = await __vitePreload(async () => {
      const { markLoaded: markLoaded2 } = await import("./main-BbV5VyEH.js").then((n) => n.j7);
      return { markLoaded: markLoaded2 };
    }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
    markLoaded(saveFormatMap[format] || "it");
    return song;
  } finally {
  }
}
export {
  parseWithOpenMPT
};
