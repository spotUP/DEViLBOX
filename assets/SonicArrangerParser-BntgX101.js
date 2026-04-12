import { b$ as registerPatternEncoder, c2 as createSamplerInstrument, dx as DEFAULT_SONIC_ARRANGER } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function encodeSonicArrangerCell(cell) {
  const out = new Uint8Array(4);
  const xmNote = cell.note ?? 0;
  if (xmNote === 97) {
    out[0] = 127;
  } else if (xmNote > 0) {
    out[0] = Math.max(1, Math.min(108, xmNote + 12));
  } else {
    out[0] = 0;
  }
  out[1] = (cell.instrument ?? 0) & 255;
  const arpTable = cell.saArpTable ?? 0;
  const saEffect = cell.saEffect ?? 0;
  out[2] = (arpTable & 3) << 4 | saEffect & 15;
  const saEffectArg = cell.saEffectArg ?? 0;
  out[3] = saEffectArg & 255;
  return out;
}
registerPatternEncoder("sonicArranger", () => encodeSonicArrangerCell);
function u8(v, off) {
  return v.getUint8(off);
}
function i8(v, off) {
  return v.getInt8(off);
}
function u16(v, off) {
  return v.getUint16(off, false);
}
function u32(v, off) {
  return v.getUint32(off, false);
}
function i32(v, off) {
  return v.getInt32(off, false);
}
function readMark(v, off) {
  let s = "";
  for (let i = 0; i < 4; i++) s += String.fromCharCode(v.getUint8(off + i));
  return s;
}
function readString(v, off, len) {
  let s = "";
  for (let i = 0; i < len; i++) {
    const ch = v.getUint8(off + i);
    if (ch === 0) break;
    s += String.fromCharCode(ch);
  }
  return s.trim();
}
const SA_PERIOD_TABLE = [
  0,
  13696,
  12928,
  12192,
  11520,
  10848,
  10240,
  9664,
  9120,
  8608,
  8128,
  7680,
  7248,
  6848,
  6464,
  6096,
  5760,
  5424,
  5120,
  4832,
  4560,
  4304,
  4064,
  3840,
  3624,
  3424,
  3232,
  3048,
  2880,
  2712,
  2560,
  2416,
  2280,
  2152,
  2032,
  1920,
  1812,
  1712,
  1616,
  1524,
  1440,
  1356,
  1280,
  1208,
  1140,
  1076,
  1016,
  960,
  906,
  856,
  808,
  762,
  720,
  678,
  640,
  604,
  570,
  538,
  508,
  480,
  453,
  428,
  404,
  381,
  360,
  339,
  320,
  302,
  285,
  269,
  254,
  240,
  226,
  214,
  202,
  190,
  180,
  170,
  160,
  151,
  143,
  135,
  127,
  120,
  113,
  107,
  101,
  95,
  90,
  85,
  80,
  75,
  71,
  67,
  63,
  60,
  56,
  53,
  50,
  47,
  45,
  42,
  40,
  37,
  35,
  33,
  31,
  30,
  28
];
function saNote2XM(note) {
  if (note === 0) return 0;
  if (note === 127 || note === 128) return 97;
  const xm = note - 36;
  return xm >= 1 && xm <= 96 ? xm : 0;
}
function saNotePeriod(xmNote) {
  if (xmNote <= 0 || xmNote >= 97) return void 0;
  const saIdx = xmNote + 36;
  return saIdx >= 1 && saIdx <= 108 ? SA_PERIOD_TABLE[saIdx] : void 0;
}
function isSonicArrangerFormat(buffer) {
  if (buffer.byteLength < 8) return false;
  const v = new DataView(buffer);
  let magic = "";
  for (let i = 0; i < 8; i++) magic += String.fromCharCode(v.getUint8(i));
  if (magic === "SOARV1.0") return true;
  if (buffer.byteLength < 50) return false;
  const w0 = v.getUint16(0, false);
  if (w0 !== 20218) return false;
  const d1 = v.getUint16(2, false);
  if (d1 === 0) return false;
  if (d1 & 32768) return false;
  if (d1 & 1) return false;
  const leaOffset = 6 + d1;
  if (leaOffset + 2 > buffer.byteLength) return false;
  return v.getUint16(leaOffset, false) === 16890;
}
async function parseSonicArrangerFile(buffer, filename) {
  const v = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  if (buffer.byteLength < 8) throw new Error("SonicArranger: file too small");
  let magic = "";
  for (let i = 0; i < 8; i++) magic += String.fromCharCode(v.getUint8(i));
  let songBase = 0;
  let useOffsetTable = false;
  if (magic !== "SOARV1.0") {
    if (v.getUint16(0, false) !== 20218) {
      throw new Error(`SonicArranger: unrecognised format (magic="${magic}")`);
    }
    const d1 = v.getUint16(2, false);
    const leaOff = d1 + 8;
    if (leaOff + 2 > buffer.byteLength) throw new Error("SonicArranger: 4EFA binary too small");
    const d2 = v.getUint16(leaOff, false);
    songBase = leaOff + d2;
    if (songBase + 32 > buffer.byteLength) throw new Error("SonicArranger: 4EFA song data out of bounds");
    useOffsetTable = true;
  }
  if (buffer.byteLength < songBase + 16) throw new Error("SonicArranger: file too small");
  let pos;
  let numSubSongs;
  if (useOffsetTable) {
    const offSTBL = u32(v, songBase + 0);
    const offOVTB = u32(v, songBase + 4);
    numSubSongs = Math.floor((offOVTB - offSTBL) / 12);
    pos = songBase + offSTBL;
  } else {
    pos = 8;
    if (readMark(v, pos) !== "STBL") throw new Error("SonicArranger: missing STBL chunk");
    pos += 4;
    numSubSongs = u32(v, pos);
    pos += 4;
  }
  const subSongs = [];
  for (let i = 0; i < numSubSongs; i++) {
    const ss = {
      startSpeed: u16(v, pos),
      rowsPerTrack: u16(v, pos + 2),
      firstPosition: u16(v, pos + 4),
      lastPosition: u16(v, pos + 6),
      restartPosition: u16(v, pos + 8),
      tempo: u16(v, pos + 10)
    };
    pos += 12;
    if (ss.lastPosition !== 65535 && ss.restartPosition !== 65535) {
      subSongs.push(ss);
    }
  }
  const song = subSongs[0] ?? {
    startSpeed: 6,
    rowsPerTrack: 64,
    firstPosition: 0,
    lastPosition: 0,
    restartPosition: 0,
    tempo: 50
  };
  let numPositions;
  if (useOffsetTable) {
    const offOVTB = u32(v, songBase + 4);
    const offNTBL = u32(v, songBase + 8);
    numPositions = Math.floor((offNTBL - offOVTB) / 16);
    pos = songBase + offOVTB;
  } else {
    if (readMark(v, pos) !== "OVTB") throw new Error("SonicArranger: missing OVTB chunk");
    pos += 4;
    numPositions = u32(v, pos);
    pos += 4;
  }
  const positions = [];
  for (let p = 0; p < numPositions; p++) {
    const chans = [];
    for (let ch = 0; ch < 4; ch++) {
      chans.push({
        startTrackRow: u16(v, pos),
        soundTranspose: i8(v, pos + 2),
        noteTranspose: i8(v, pos + 3)
      });
      pos += 4;
    }
    positions.push(chans);
  }
  let numTrackRows;
  if (useOffsetTable) {
    const offNTBL = u32(v, songBase + 8);
    const offINST = u32(v, songBase + 12);
    numTrackRows = Math.floor((offINST - offNTBL) / 4);
    pos = songBase + offNTBL;
  } else {
    if (readMark(v, pos) !== "NTBL") throw new Error("SonicArranger: missing NTBL chunk");
    pos += 4;
    numTrackRows = u32(v, pos);
    pos += 4;
  }
  const ntblDataOffset = pos;
  const trackLines = [];
  for (let i = 0; i < numTrackRows; i++) {
    const b0 = u8(v, pos);
    const b1 = u8(v, pos + 1);
    const b2 = u8(v, pos + 2);
    const b3 = u8(v, pos + 3);
    trackLines.push({
      note: b0,
      instr: b1,
      disableSoundTranspose: (b2 & 128) !== 0,
      disableNoteTranspose: (b2 & 64) !== 0,
      arpeggioTable: (b2 & 48) >> 4,
      effect: b2 & 15,
      effArg: b3
    });
    pos += 4;
  }
  let numInstruments;
  if (useOffsetTable) {
    const offINST = u32(v, songBase + 12);
    const offSYWT = u32(v, songBase + 16);
    numInstruments = Math.floor((offSYWT - offINST) / 152);
    pos = songBase + offINST;
  } else {
    if (readMark(v, pos) !== "INST") throw new Error("SonicArranger: missing INST chunk");
    pos += 4;
    numInstruments = u32(v, pos);
    pos += 4;
  }
  const instTableStart = pos;
  const saInstruments = [];
  for (let i = 0; i < numInstruments; i++) {
    const base = pos;
    const isSynth = u16(v, base) !== 0;
    const waveformNumber = u16(v, base + 2);
    const waveformLength = u16(v, base + 4);
    const repeatLength = u16(v, base + 6);
    const volume = u16(v, base + 16) & 255;
    const fineTuning = v.getInt16(base + 18, false);
    const portamentoSpeed = u16(v, base + 20);
    const vibratoDelay = u16(v, base + 22);
    const vibratoSpeed = u16(v, base + 24);
    const vibratoLevel = u16(v, base + 26);
    const amfNumber = u16(v, base + 28);
    const amfDelay = u16(v, base + 30);
    const amfLength = u16(v, base + 32);
    const amfRepeat = u16(v, base + 34);
    const adsrNumber = u16(v, base + 36);
    const adsrDelay = u16(v, base + 38);
    const adsrLength = u16(v, base + 40);
    const adsrRepeat = u16(v, base + 42);
    const sustainPoint = u16(v, base + 44);
    const sustainDelay = u16(v, base + 46);
    const effectArg1 = u16(v, base + 64);
    const effect = u16(v, base + 66);
    const effectArg2 = u16(v, base + 68);
    const effectArg3 = u16(v, base + 70);
    const effectDelay = u16(v, base + 72);
    const arpeggios = [];
    for (let a = 0; a < 3; a++) {
      const arpBase = base + 74 + a * 16;
      const arpLen = u8(v, arpBase);
      const arpRepeat = u8(v, arpBase + 1);
      const arpValues = [];
      for (let j = 0; j < 14; j++) {
        arpValues.push(i8(v, arpBase + 2 + j));
      }
      arpeggios.push({ length: arpLen, repeat: arpRepeat, values: arpValues });
    }
    const name = readString(v, base + 122, 30) || `Instrument ${i + 1}`;
    saInstruments.push({
      isSynth,
      waveformNumber,
      waveformLength,
      repeatLength,
      volume: Math.min(volume, 64),
      fineTuning,
      portamentoSpeed,
      vibratoDelay,
      vibratoSpeed,
      vibratoLevel,
      amfNumber,
      amfDelay,
      amfLength,
      amfRepeat,
      adsrNumber,
      adsrDelay,
      adsrLength,
      adsrRepeat,
      sustainPoint,
      sustainDelay,
      effectArg1,
      effect,
      effectArg2,
      effectArg3,
      effectDelay,
      arpeggios,
      name
    });
    pos += 152;
  }
  if (useOffsetTable) {
    pos = songBase + u32(v, songBase + 28);
  } else {
    if (readMark(v, pos) !== "SD8B") throw new Error("SonicArranger: missing SD8B chunk");
    pos += 4;
  }
  const numSamples = i32(v, pos);
  pos += 4;
  const samplePCM = [];
  if (numSamples > 0) {
    if (!useOffsetTable) {
      pos += numSamples * 38;
    }
    const sampleLengths = [];
    for (let i = 0; i < numSamples; i++) {
      sampleLengths.push(u32(v, pos));
      pos += 4;
    }
    for (let i = 0; i < numSamples; i++) {
      const len = sampleLengths[i];
      if (len > 0 && pos + len <= buffer.byteLength) {
        samplePCM.push(bytes.slice(pos, pos + len));
        pos += len;
      } else {
        samplePCM.push(null);
        pos += len;
      }
    }
  }
  const waveformData = [];
  {
    let numWaveforms;
    if (useOffsetTable) {
      const offSYWT = u32(v, songBase + 16);
      const offSYAR = u32(v, songBase + 20);
      numWaveforms = Math.floor((offSYAR - offSYWT) / 128);
      pos = songBase + offSYWT;
    } else if (pos + 4 <= buffer.byteLength && readMark(v, pos) === "SYWT") {
      pos += 4;
      numWaveforms = u32(v, pos);
      pos += 4;
    } else {
      numWaveforms = 0;
    }
    for (let i = 0; i < numWaveforms; i++) {
      if (pos + 128 <= buffer.byteLength) {
        waveformData.push(bytes.slice(pos, pos + 128));
        pos += 128;
      } else {
        waveformData.push(null);
        pos += 128;
      }
    }
  }
  const adsrTables = [];
  let syarFileOffset = -1;
  {
    let numAdsrTables;
    if (useOffsetTable) {
      const offSYAR = u32(v, songBase + 20);
      const offSYAF = u32(v, songBase + 24);
      numAdsrTables = Math.floor((offSYAF - offSYAR) / 128);
      pos = songBase + offSYAR;
    } else if (pos + 4 <= buffer.byteLength && readMark(v, pos) === "SYAR") {
      pos += 4;
      numAdsrTables = u32(v, pos);
      pos += 4;
    } else {
      numAdsrTables = 0;
    }
    if (numAdsrTables > 0) syarFileOffset = pos;
    for (let i = 0; i < numAdsrTables; i++) {
      const table = [];
      for (let j = 0; j < 128; j++) {
        table.push(u8(v, pos + j));
      }
      adsrTables.push(table);
      pos += 128;
    }
  }
  const amfTables = [];
  let syafFileOffset = -1;
  {
    let numAmfTables;
    if (useOffsetTable) {
      const offSYAF = u32(v, songBase + 24);
      const offSD8B = u32(v, songBase + 28);
      numAmfTables = Math.floor((offSD8B - offSYAF) / 128);
      pos = songBase + offSYAF;
    } else if (pos + 4 <= buffer.byteLength && readMark(v, pos) === "SYAF") {
      pos += 4;
      numAmfTables = u32(v, pos);
      pos += 4;
    } else {
      numAmfTables = 0;
    }
    if (numAmfTables > 0) syafFileOffset = pos;
    for (let i = 0; i < numAmfTables; i++) {
      const table = [];
      for (let j = 0; j < 128; j++) {
        table.push(i8(v, pos + j));
      }
      amfTables.push(table);
      pos += 128;
    }
  }
  const instruments = [];
  for (let i = 0; i < numInstruments; i++) {
    const inst = saInstruments[i];
    const id = i + 1;
    const instrBase = instTableStart + i * 152;
    const chipRam = {
      moduleBase: 0,
      moduleSize: bytes.length,
      instrBase,
      instrSize: 152,
      sections: {
        instTable: instTableStart,
        ...syarFileOffset >= 0 ? { syarBase: syarFileOffset } : {},
        ...syafFileOffset >= 0 ? { syafBase: syafFileOffset } : {},
        numAdsrTables: adsrTables.length,
        numAmfTables: amfTables.length
      }
    };
    if (!inst.isSynth) {
      const pcm = inst.waveformNumber < samplePCM.length ? samplePCM[inst.waveformNumber] : null;
      if (!pcm || pcm.length === 0) {
        instruments.push({
          id,
          name: inst.name,
          type: "sample",
          synthType: "Sampler",
          effects: [],
          volume: -60,
          pan: 0,
          uadeChipRam: chipRam
        });
      } else {
        let loopStart = 0, loopEnd = 0;
        if (inst.repeatLength !== 1 && inst.waveformLength !== 0) {
          if (inst.repeatLength === 0) {
            loopStart = 0;
            loopEnd = pcm.length;
          } else {
            loopStart = inst.waveformLength * 2;
            loopEnd = inst.waveformLength * 2 + inst.repeatLength * 2;
            loopEnd = Math.min(loopEnd, pcm.length);
          }
        }
        instruments.push({
          // sampleRate = PAL_CLOCK / 214 = 16574 Hz (period 214 = SA note 73 = XM 61 = C5).
          // With rawPeriod stored on cells, the replayer computes:
          //   rate = PAL_CLOCK / rawPeriod / sampleRate
          // e.g. SA note 49 (period 856): rate = 3546895/856/16574 ≈ 0.25 = 2 octaves down from C5.
          ...createSamplerInstrument(id, inst.name, pcm, inst.volume, 16574, loopStart, loopEnd),
          uadeChipRam: chipRam
        });
      }
    } else {
      const wf = inst.waveformNumber < waveformData.length ? waveformData[inst.waveformNumber] : null;
      const allWaveforms = waveformData.map(
        (wfData) => wfData ? Array.from(wfData).map((b) => b > 127 ? b - 256 : b) : new Array(128).fill(0)
      );
      const saConfig = {
        ...DEFAULT_SONIC_ARRANGER,
        volume: inst.volume,
        fineTuning: inst.fineTuning,
        waveformNumber: inst.waveformNumber,
        waveformLength: inst.waveformLength,
        portamentoSpeed: inst.portamentoSpeed,
        vibratoDelay: inst.vibratoDelay,
        vibratoSpeed: inst.vibratoSpeed,
        vibratoLevel: inst.vibratoLevel,
        amfNumber: inst.amfNumber,
        amfDelay: inst.amfDelay,
        amfLength: inst.amfLength,
        amfRepeat: inst.amfRepeat,
        adsrNumber: inst.adsrNumber,
        adsrDelay: inst.adsrDelay,
        adsrLength: inst.adsrLength,
        adsrRepeat: inst.adsrRepeat,
        sustainPoint: inst.sustainPoint,
        sustainDelay: inst.sustainDelay,
        effect: inst.effect,
        effectArg1: inst.effectArg1,
        effectArg2: inst.effectArg2,
        effectArg3: inst.effectArg3,
        effectDelay: inst.effectDelay,
        arpeggios: inst.arpeggios,
        waveformData: wf ? Array.from(wf).map((b) => b > 127 ? b - 256 : b) : new Array(128).fill(0),
        adsrTable: inst.adsrNumber < adsrTables.length ? adsrTables[inst.adsrNumber] : new Array(128).fill(255),
        amfTable: inst.amfNumber < amfTables.length ? amfTables[inst.amfNumber] : new Array(128).fill(0),
        allWaveforms,
        name: inst.name
      };
      instruments.push({
        id,
        name: inst.name,
        type: "synth",
        synthType: "SonicArrangerSynth",
        effects: [],
        volume: 0,
        pan: 0,
        sonicArranger: saConfig,
        uadeChipRam: chipRam
      });
    }
  }
  function saEffectToXM(eff, arg) {
    let effTyp = 0, effVal = 0, volCol = 0;
    switch (eff) {
      case 0:
        if (arg !== 0) {
          effTyp = 0;
          effVal = arg;
        }
        break;
      // Effects 1, 2, 4, 7, 8, A are routed directly to WASM synth via replayer.
      // They are stored in saEffect/saEffectArg fields, not mapped to XM effects.
      case 1:
      // SetSlideSpeed — handled by WASM paramId 16
      case 2:
      // RestartAdsr — handled by WASM paramId 13
      case 4:
      // SetVibrato — handled by WASM paramId 12
      case 7:
      // SetPortamento — handled by WASM paramId 15
      case 8:
      // SkipPortamento — handled by WASM paramId 14
      case 10:
        break;
      // no XM mapping; raw values stored in TrackerCell.saEffect/saEffectArg
      case 6:
        effTyp = 16;
        effVal = Math.min(arg, 64);
        break;
      case 11:
        effTyp = 11;
        effVal = arg;
        break;
      case 12:
        volCol = 16 + Math.min(arg, 64);
        break;
      case 13:
        effTyp = 13;
        effVal = 0;
        break;
      case 14:
        effTyp = 14;
        effVal = arg & 1;
        break;
      case 15:
        effTyp = 15;
        effVal = arg;
        break;
    }
    return { effTyp, eff: effVal, volCol };
  }
  const defaultRowsPerTrack = Math.max(1, song.rowsPerTrack);
  const PANNING = [-50, 50, 50, -50];
  const first = Math.min(song.firstPosition, positions.length - 1);
  const last = Math.min(song.lastPosition, positions.length - 1);
  const positionTrackLen = /* @__PURE__ */ new Map();
  let runningTrackLen = defaultRowsPerTrack;
  for (let pidx = first; pidx <= last; pidx++) {
    const posEntry = positions[pidx];
    if (!posEntry) continue;
    let currentLen = runningTrackLen;
    let actualRows = 0;
    for (let row = 0; row < 128; row++) {
      for (let ch = 0; ch < 4; ch++) {
        const tlidx = posEntry[ch].startTrackRow + row;
        if (tlidx < trackLines.length) {
          const tl = trackLines[tlidx];
          if (tl.effect === 9 && tl.effArg > 0 && tl.effArg <= 64) {
            currentLen = tl.effArg;
          }
        }
      }
      actualRows = row + 1;
      if (row + 1 >= currentLen) break;
    }
    positionTrackLen.set(pidx, actualRows);
    runningTrackLen = currentLen;
  }
  for (let pidx = 0; pidx < positions.length; pidx++) {
    if (!positionTrackLen.has(pidx)) {
      positionTrackLen.set(pidx, defaultRowsPerTrack);
    }
  }
  const builtPatterns = [];
  for (let pidx = 0; pidx < positions.length; pidx++) {
    const posEntry = positions[pidx];
    const trackLen = positionTrackLen.get(pidx) ?? defaultRowsPerTrack;
    const channels = Array.from({ length: 4 }, (_, ch) => {
      const posCh = posEntry[ch];
      const rowBase = posCh.startTrackRow;
      const noteTranspose = posCh.noteTranspose;
      const soundTranspose = posCh.soundTranspose;
      const rows = [];
      for (let row = 0; row < trackLen; row++) {
        const tlidx = rowBase + row;
        const tl = tlidx < trackLines.length ? trackLines[tlidx] : null;
        if (!tl || tl.note === 0 && tl.instr === 0 && tl.effect === 0 && tl.effArg === 0) {
          rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0, saArpTable: (tl == null ? void 0 : tl.arpeggioTable) ?? 0, saEffect: 0, saEffectArg: 0 });
          continue;
        }
        let xmNote = saNote2XM(tl.note);
        if (xmNote > 0 && xmNote < 97 && !tl.disableNoteTranspose && noteTranspose !== 0) {
          xmNote = Math.max(1, Math.min(96, xmNote + noteTranspose));
        }
        const isForceQuiet = tl.note === 127;
        let instrNum = tl.instr > 0 ? tl.instr : 0;
        if (instrNum > 0 && !tl.disableSoundTranspose && soundTranspose !== 0) {
          instrNum = instrNum + soundTranspose;
          if (instrNum < 1) instrNum = 0;
        }
        let { effTyp, eff: effVal, volCol } = saEffectToXM(tl.effect, tl.effArg);
        if (isForceQuiet && volCol === 0) {
          volCol = 16;
        }
        if (effTyp === 11 && first > 0) {
          effVal = Math.max(0, effVal - first);
        }
        const saPeriod = saNotePeriod(xmNote);
        rows.push({
          note: xmNote,
          instrument: instrNum,
          volume: volCol,
          effTyp,
          eff: effVal,
          effTyp2: 0,
          eff2: 0,
          ...saPeriod ? { period: saPeriod } : {},
          saArpTable: tl.arpeggioTable,
          saEffect: tl.effect,
          saEffectArg: tl.effArg
        });
      }
      return {
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: PANNING[ch],
        instrumentId: null,
        color: null,
        rows
      };
    });
    builtPatterns.push({
      id: `pattern-${pidx}`,
      name: `Pattern ${pidx}`,
      length: trackLen,
      channels,
      importMetadata: {
        sourceFormat: "SonicArranger",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: 4,
        originalPatternCount: positions.length,
        originalInstrumentCount: numInstruments
      }
    });
  }
  if (builtPatterns.length === 0) {
    builtPatterns.push({
      id: "pattern-0",
      name: "Pattern 0",
      length: 64,
      channels: Array.from({ length: 4 }, (_, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: PANNING[ch],
        instrumentId: null,
        color: null,
        rows: Array.from({ length: 64 }, () => ({
          note: 0,
          instrument: 0,
          volume: 0,
          effTyp: 0,
          eff: 0,
          effTyp2: 0,
          eff2: 0
        }))
      })),
      importMetadata: {
        sourceFormat: "SonicArranger",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: 4,
        originalPatternCount: 0,
        originalInstrumentCount: 0
      }
    });
  }
  const songPositions = [];
  for (let p = first; p <= last; p++) songPositions.push(p);
  if (songPositions.length === 0) songPositions.push(0);
  const initialBPM = song.tempo > 0 ? Math.max(32, Math.min(255, Math.round(song.tempo * 125 / 50))) : 125;
  const restartPos = Math.min(
    Math.max(0, song.restartPosition - first),
    songPositions.length - 1
  );
  const moduleName = filename.replace(/\.[^/.]+$/, "");
  const uadePatternLayout = {
    formatId: "sonicArranger",
    patternDataFileOffset: ntblDataOffset,
    bytesPerCell: 4,
    rowsPerPattern: defaultRowsPerTrack,
    numChannels: 4,
    numPatterns: builtPatterns.length,
    moduleSize: buffer.byteLength,
    encodeCell: encodeSonicArrangerCell,
    getCellFileOffset: (pattern, row, channel) => {
      const posEntry = positions[pattern];
      if (!posEntry) return 0;
      const startRow = posEntry[channel].startTrackRow;
      const rowIdx = startRow + row;
      if (rowIdx < 0 || rowIdx >= numTrackRows) return 0;
      return ntblDataOffset + rowIdx * 4;
    }
  };
  return {
    name: moduleName,
    format: "MOD",
    patterns: builtPatterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: restartPos,
    numChannels: 4,
    initialSpeed: Math.max(1, song.startSpeed),
    initialBPM,
    linearPeriods: false,
    uadePatternLayout
  };
}
export {
  isSonicArrangerFormat,
  parseSonicArrangerFile
};
