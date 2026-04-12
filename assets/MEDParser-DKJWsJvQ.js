import { b$ as registerPatternEncoder, c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const MED_PERIODS = [
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
  113
];
function encodeMED4Cell(cell) {
  const out = new Uint8Array(4);
  const note = cell.note ?? 0;
  out[0] = note > 0 ? note & 255 : 0;
  out[1] = (cell.instrument ?? 0) & 255;
  out[2] = (cell.effTyp ?? 0) & 255;
  out[3] = (cell.eff ?? 0) & 255;
  return out;
}
function encodeMED3Cell(cell) {
  const out = new Uint8Array(3);
  const note = cell.note ?? 0;
  const instr = cell.instrument ?? 0;
  let period = 0;
  if (note > 0 && note >= 37) {
    const idx = note - 37;
    if (idx >= 0 && idx < MED_PERIODS.length) {
      period = MED_PERIODS[idx];
    }
  }
  out[0] = instr & 240 | period >> 8 & 15;
  out[1] = period & 255;
  out[2] = (instr & 15) << 4 | (cell.effTyp ?? 0) & 15;
  return out;
}
registerPatternEncoder("med_mmd1", () => encodeMED4Cell);
registerPatternEncoder("med_mmd0", () => encodeMED3Cell);
const TEXT_DECODER = new TextDecoder("iso-8859-1");
function str4(buf, offset) {
  return TEXT_DECODER.decode(buf.subarray(offset, offset + 4));
}
function readStr(buf, offset, len) {
  let end = offset;
  while (end < offset + len && buf[end] !== 0) end++;
  return TEXT_DECODER.decode(buf.subarray(offset, end)).replace(/\0/g, "").trim();
}
function u16(buf, off) {
  return buf[off] << 8 | buf[off + 1];
}
function u32(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function s8(buf, off) {
  const v = buf[off];
  return v >= 128 ? v - 256 : v;
}
function s16(buf, off) {
  const v = buf[off] << 8 | buf[off + 1];
  return v >= 32768 ? v - 65536 : v;
}
function parseMEDFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  const magic = str4(buf, 0);
  if (!["MMD0", "MMD1", "MMD2", "MMD3"].includes(magic)) {
    throw new Error(`Not a MED file: magic="${magic}"`);
  }
  const isMMD1Plus = magic !== "MMD0";
  const noteBaseTranspose = magic === "MMD3" ? 0 : 24;
  const songOffset = u32(buf, 8);
  const blockOffset = u32(buf, 16);
  const sampleArrOffset = u32(buf, 24);
  const expOffset = u32(buf, 32);
  const INSTR_HDR_SIZE = 8;
  const MAX_INSTRUMENTS = 63;
  let so = songOffset;
  const instrs = [];
  for (let i = 0; i < MAX_INSTRUMENTS; i++) {
    const base = so + i * INSTR_HDR_SIZE;
    if (base + INSTR_HDR_SIZE > buf.length) break;
    const loopStart = u16(buf, base + 0) * 2;
    const loopLength = u16(buf, base + 2) * 2;
    const volume = buf[base + 6];
    instrs.push({
      loopStart,
      loopLength,
      volume: volume || 64,
      finetune: 0
    });
  }
  so += MAX_INSTRUMENTS * INSTR_HDR_SIZE;
  const numBlocks = u16(buf, so);
  const songLen = u16(buf, so + 2);
  const playseq = [];
  for (let i = 0; i < 256; i++) playseq.push(buf[so + 4 + i]);
  const defTempo = u16(buf, so + 260);
  const playTranspose = s8(buf, so + 262);
  const medFlags = buf[so + 263];
  const medFlags2 = buf[so + 264];
  const tempo2 = buf[so + 265];
  const numSamples = buf[so + 283];
  const is8Ch = (medFlags & 64) !== 0;
  const bpmMode = (medFlags2 & 32) !== 0;
  const softwareMix = (medFlags2 & 128) !== 0;
  const rowsPerBeat = 1 + (medFlags2 & 31);
  let computedBPM;
  if (bpmMode && !is8Ch) {
    computedBPM = defTempo < 7 ? 111.5 : defTempo * rowsPerBeat / 4;
  } else if (is8Ch && defTempo > 0) {
    const MED_8CH_TEMPOS = [179, 164, 152, 141, 131, 123, 116, 110, 104, 99];
    computedBPM = MED_8CH_TEMPOS[Math.min(10, defTempo) - 1] ?? 125;
  } else if (!softwareMix && defTempo > 0 && defTempo <= 10) {
    computedBPM = 6 * 1773447 / 14500 / defTempo;
  } else if (softwareMix && defTempo < 8) {
    computedBPM = 157.86;
  } else {
    computedBPM = defTempo / 0.264;
  }
  const initialBPM = Math.max(32, Math.min(255, Math.round(computedBPM)));
  const blockPtrs = [];
  for (let i = 0; i < numBlocks; i++) {
    const ptr = u32(buf, blockOffset + i * 4);
    if (ptr > 0 && ptr < buf.length) blockPtrs.push(ptr);
  }
  let numChannels = 4;
  if (blockPtrs.length > 0) {
    numChannels = isMMD1Plus ? u16(buf, blockPtrs[0]) : buf[blockPtrs[0]];
    numChannels = Math.max(1, Math.min(64, numChannels));
  }
  const volHex = (medFlags & 16) !== 0;
  const tempoCtx = { is8Ch, bpmMode, softwareMix, rowsPerBeat, volHex };
  const trackerPatterns = [];
  const blockDataOffsets = [];
  for (let patIdx = 0; patIdx < blockPtrs.length; patIdx++) {
    const bptr = blockPtrs[patIdx];
    let nTracks;
    let nLines;
    let dataStart;
    if (isMMD1Plus) {
      nTracks = u16(buf, bptr);
      nLines = u16(buf, bptr + 2);
      dataStart = bptr + 8;
    } else {
      nTracks = buf[bptr];
      nLines = buf[bptr + 1];
      dataStart = bptr + 2;
    }
    const bytesPerCell = isMMD1Plus ? 4 : 3;
    blockDataOffsets.push({ dataStart, nTracks, nLines });
    const channels = Array.from({ length: nTracks }, (_, ch) => {
      const rows = [];
      for (let row = 0; row <= nLines; row++) {
        const offset = dataStart + (row * nTracks + ch) * bytesPerCell;
        if (offset + bytesPerCell > buf.length) {
          rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
          continue;
        }
        let note = 0, inst = 0, effTyp = 0, eff = 0;
        if (isMMD1Plus) {
          const rawNoteVal = buf[offset];
          inst = buf[offset + 1];
          const rawEff1 = buf[offset + 2];
          const rawParm = buf[offset + 3];
          if (rawNoteVal === 128) {
            note = 97;
          } else {
            const rawNote = rawNoteVal & 127;
            note = rawNote > 0 ? rawNote + noteBaseTranspose + playTranspose : 0;
          }
          const mapped1 = mapMEDEffect(rawEff1, rawParm, tempoCtx);
          effTyp = mapped1.effTyp;
          eff = mapped1.eff;
        } else {
          const raw0 = buf[offset];
          const raw1 = buf[offset + 1];
          const raw2 = buf[offset + 2];
          const rawNote = raw0 & 63;
          inst = raw1 >> 4 | (raw0 & 128) >> 3 | (raw0 & 64) >> 1;
          const rawEff = raw1 & 15;
          note = rawNote > 0 ? rawNote + noteBaseTranspose + playTranspose : 0;
          const { effTyp: e, eff: ev } = mapMEDEffect(rawEff, raw2, tempoCtx);
          effTyp = e;
          eff = ev;
        }
        rows.push({ note, instrument: inst, volume: 0, effTyp, eff, effTyp2: 0, eff2: 0 });
      }
      return {
        id: `channel-${ch}`,
        name: `Track ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: ch % 2 === 0 ? -25 : 25,
        instrumentId: null,
        color: null,
        rows
      };
    });
    trackerPatterns.push({
      id: `pattern-${patIdx}`,
      name: `Block ${patIdx}`,
      length: nLines + 1,
      channels,
      importMetadata: {
        sourceFormat: "MED",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: nTracks,
        originalPatternCount: numBlocks,
        originalInstrumentCount: numSamples || MAX_INSTRUMENTS
      }
    });
  }
  let instrNames = [];
  if (expOffset > 0 && expOffset < buf.length) {
    const instrInfoOff = u32(buf, expOffset + 16);
    const instrInfoEntries = u16(buf, expOffset + 20);
    const instrInfoSize = u16(buf, expOffset + 22);
    if (instrInfoOff > 0 && instrInfoOff < buf.length) {
      for (let i = 0; i < instrInfoEntries; i++) {
        const base = instrInfoOff + i * instrInfoSize;
        if (base + 40 > buf.length) break;
        instrNames.push(readStr(buf, base, 40));
      }
    }
  }
  const instrPtrs = [];
  if (sampleArrOffset > 0 && sampleArrOffset + numSamples * 4 <= buf.length) {
    for (let i = 0; i < numSamples; i++) {
      instrPtrs.push(u32(buf, sampleArrOffset + i * 4));
    }
  }
  const instruments = [];
  for (let i = 0; i < Math.min(MAX_INSTRUMENTS, numSamples || MAX_INSTRUMENTS); i++) {
    const instr = instrs[i];
    if (!instr) break;
    const name = instrNames[i] || `Instrument ${i + 1}`;
    const instrPtr = instrPtrs[i] || 0;
    let instrLength = 0;
    let instrType = 0;
    if (instrPtr > 0 && instrPtr + 6 <= buf.length) {
      instrLength = u32(buf, instrPtr);
      instrType = s16(buf, instrPtr + 4);
    }
    const isSynth = instrType < 0;
    if (isSynth) {
      const synthLen = instrLength;
      if (synthLen > 0 && instrPtr + 6 + synthLen <= buf.length) {
        const repWords = u16(buf, instrPtr + 10);
        const repLenWords = u16(buf, instrPtr + 12);
        const voltblLen = u16(buf, instrPtr + 14);
        const wftblLen = u16(buf, instrPtr + 16);
        const volspeed = buf[instrPtr + 18];
        const wfspeed = buf[instrPtr + 19];
        const wforms = u16(buf, instrPtr + 20);
        const loopStartBytes = repWords * 2;
        const loopLenBytes = repLenWords * 2;
        if (wforms === 65535 || wforms === 0 || wforms > 64) {
          const degenerateChipRam = {
            moduleBase: 0,
            moduleSize: buf.length,
            instrBase: instrPtr + 6,
            instrSize: synthLen,
            sections: {
              voltbl: instrPtr + 22,
              wftbl: instrPtr + 150,
              waveforms: instrPtr + 278
            }
          };
          instruments.push({
            id: i + 1,
            name,
            type: "synth",
            synthType: "OctaMEDSynth",
            octamed: {
              volume: instr.volume & 63,
              voltblSpeed: 0,
              wfSpeed: 0,
              vibratoSpeed: 0,
              loopStart: 0,
              loopLen: 0,
              voltbl: new Uint8Array(128).fill(255),
              wftbl: new Uint8Array(128).fill(255),
              waveforms: [new Int8Array(256)]
            },
            effects: [],
            volume: 0,
            pan: 0,
            uadeChipRam: degenerateChipRam
          });
          continue;
        }
        const voltbl = new Uint8Array(128).fill(255);
        const voltblCopy = Math.min(voltblLen, 128);
        for (let b = 0; b < voltblCopy; b++) voltbl[b] = buf[instrPtr + 22 + b];
        const wftbl = new Uint8Array(128).fill(255);
        const wftblCopy = Math.min(wftblLen, 128);
        for (let b = 0; b < wftblCopy; b++) wftbl[b] = buf[instrPtr + 150 + b];
        const waveforms = [];
        for (let w = 0; w < wforms; w++) {
          const ptrOff = instrPtr + 278 + w * 4;
          if (ptrOff + 4 > buf.length) break;
          const wfOffset = u32(buf, ptrOff);
          const wfAbs = instrPtr + wfOffset;
          if (wfAbs + 2 > buf.length) {
            waveforms.push(new Int8Array(256));
            continue;
          }
          const wfLenWords = u16(buf, wfAbs);
          const wfBytes = wfLenWords * 2;
          const dataStart = wfAbs + 2;
          if (dataStart + wfBytes > buf.length || wfBytes === 0) {
            waveforms.push(new Int8Array(256));
            continue;
          }
          const wf = new Int8Array(256);
          const copyLen = Math.min(wfBytes, 256);
          for (let b = 0; b < copyLen; b++) {
            const raw = buf[dataStart + b];
            wf[b] = raw >= 128 ? raw - 256 : raw;
          }
          waveforms.push(wf);
        }
        if (waveforms.length === 0) {
          waveforms.push(new Int8Array(256));
        }
        const octamedConfig = {
          volume: instr.volume & 63,
          voltblSpeed: volspeed,
          wfSpeed: wfspeed,
          vibratoSpeed: 0,
          // vibratoSpeed is per-note in OctaMED, not per-instrument
          loopStart: loopStartBytes,
          loopLen: loopLenBytes,
          voltbl,
          wftbl,
          waveforms
        };
        const octamedChipRam = {
          moduleBase: 0,
          moduleSize: buf.length,
          instrBase: instrPtr + 6,
          instrSize: synthLen,
          sections: {
            voltbl: instrPtr + 22,
            wftbl: instrPtr + 150,
            waveforms: instrPtr + 278
          }
        };
        instruments.push({
          id: i + 1,
          name,
          type: "synth",
          synthType: "OctaMEDSynth",
          octamed: octamedConfig,
          effects: [],
          volume: 0,
          pan: 0,
          uadeChipRam: octamedChipRam
        });
      } else {
        instruments.push({
          id: i + 1,
          name,
          type: "synth",
          synthType: "OctaMEDSynth",
          octamed: {
            volume: instr.volume & 63,
            voltblSpeed: 0,
            wfSpeed: 0,
            vibratoSpeed: 0,
            loopStart: 0,
            loopLen: 0,
            voltbl: new Uint8Array(128).fill(255),
            wftbl: new Uint8Array(128).fill(255),
            waveforms: [new Int8Array(256)]
          },
          effects: [],
          volume: 0,
          pan: 0
        });
      }
      continue;
    }
    const pcmBase = instrPtr > 0 ? instrPtr + 6 : 0;
    const len = pcmBase > 0 ? Math.min(instrLength, buf.length - pcmBase) : 0;
    const pcm = len > 0 ? buf.slice(pcmBase, pcmBase + len) : new Uint8Array(0);
    instruments.push(createSamplerInstrument(
      i + 1,
      name,
      pcm,
      instr.volume,
      8287,
      instr.loopStart,
      instr.loopStart + instr.loopLength
    ));
  }
  let songPositions;
  if (magic === "MMD2" || magic === "MMD3") {
    const playSeqTableOffset = u32(buf, so + 4);
    const sectionTableOffset = u32(buf, so + 8);
    const positions = [];
    if (sectionTableOffset > 0 && sectionTableOffset < buf.length && playSeqTableOffset > 0 && playSeqTableOffset < buf.length) {
      for (let si = 0; si < songLen; si++) {
        const sectionIdx = u16(buf, sectionTableOffset + si * 2);
        const ptrOff = playSeqTableOffset + sectionIdx * 4;
        if (ptrOff + 4 > buf.length) continue;
        const playSeqPtr = u32(buf, ptrOff);
        if (playSeqPtr === 0 || playSeqPtr >= buf.length) continue;
        if (playSeqPtr + 42 > buf.length) continue;
        const seqLen = u16(buf, playSeqPtr + 40);
        for (let pi = 0; pi < seqLen; pi++) {
          const patOff = playSeqPtr + 42 + pi * 2;
          if (patOff + 2 > buf.length) break;
          const patIdx = u16(buf, patOff);
          if (patIdx < 32768 && patIdx < trackerPatterns.length) {
            positions.push(patIdx);
          }
        }
      }
    }
    songPositions = positions.length > 0 ? positions : playseq.slice(0, Math.max(1, songLen));
  } else {
    songPositions = playseq.slice(0, Math.max(1, songLen));
  }
  const medBytesPerCell = isMMD1Plus ? 4 : 3;
  const uadePatternLayout = {
    formatId: isMMD1Plus ? "med_mmd1" : "med_mmd0",
    patternDataFileOffset: 0,
    // overridden by getCellFileOffset
    bytesPerCell: medBytesPerCell,
    rowsPerPattern: 64,
    numChannels,
    numPatterns: trackerPatterns.length,
    moduleSize: buffer.byteLength,
    encodeCell: isMMD1Plus ? encodeMED4Cell : encodeMED3Cell,
    getCellFileOffset: (pattern, row, channel) => {
      const info = blockDataOffsets[pattern];
      if (!info) return 0;
      return info.dataStart + (row * info.nTracks + channel) * medBytesPerCell;
    }
  };
  return {
    name: filename.replace(/\.[^/.]+$/, ""),
    format: magic,
    patterns: trackerPatterns,
    instruments: instruments.length > 0 ? instruments : [],
    songPositions,
    songLength: songLen || 1,
    restartPosition: 0,
    numChannels,
    initialSpeed: tempo2 || 6,
    initialBPM,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename,
    uadePatternLayout
  };
}
function medTempoToBPM(tempo, ctx) {
  if (ctx.bpmMode && !ctx.is8Ch) {
    if (tempo < 7) return 112;
    return Math.round(tempo * ctx.rowsPerBeat / 4);
  }
  if (ctx.is8Ch && tempo > 0) {
    const tempos = [179, 164, 152, 141, 131, 123, 116, 110, 104, 99];
    return tempos[Math.min(10, tempo) - 1] ?? 125;
  }
  if (!ctx.softwareMix && tempo > 0 && tempo <= 10) {
    return Math.round(6 * 1773447 / 14500 / tempo);
  }
  if (ctx.softwareMix && tempo < 8) {
    return 158;
  }
  return Math.round(tempo / 0.264);
}
function mapMEDEffect(cmd, param, ctx) {
  switch (cmd) {
    case 0:
      return { effTyp: 0, eff: param };
    // Arpeggio (or empty)
    case 1:
      return { effTyp: 1, eff: param };
    // Portamento up
    case 2:
      return { effTyp: 2, eff: param };
    // Portamento down
    case 3:
      return { effTyp: 3, eff: param };
    // Tone portamento
    case 4: {
      const vibratoDepth = Math.min((param & 15) * 2, 15);
      return { effTyp: 4, eff: param & 240 | vibratoDepth };
    }
    case 5:
      return { effTyp: 5, eff: param };
    // Tone porta + volume slide
    case 6:
      return { effTyp: 6, eff: param };
    // Vibrato + volume slide
    case 7:
      return { effTyp: 7, eff: param };
    // Tremolo
    case 8:
      return { effTyp: 8, eff: param };
    // Set panning
    case 9:
      if (param > 0 && param <= 32) return { effTyp: 15, eff: param };
      return { effTyp: 0, eff: 0 };
    case 10:
      return { effTyp: 10, eff: param };
    // Volume slide
    case 11:
      return { effTyp: 11, eff: param };
    // Position jump
    case 12: {
      let vol;
      if (!ctx.volHex && param < 153) {
        vol = (param >> 4) * 10 + (param & 15);
      } else {
        vol = Math.min(param & 127, 64);
      }
      return { effTyp: 12, eff: vol };
    }
    case 13:
      return { effTyp: 10, eff: param };
    // Volume slide (MED 0x0D = ProTracker 0x0A)
    case 14: {
      const sub = param >> 4 & 15;
      const val = param & 15;
      return { effTyp: 14, eff: sub << 4 | val };
    }
    case 15: {
      if (param === 0) return { effTyp: 13, eff: 0 };
      if (param <= 240) {
        if (param < 3) return { effTyp: 15, eff: 112 };
        const bpm = Math.max(32, Math.min(255, medTempoToBPM(param, ctx)));
        return { effTyp: 15, eff: bpm };
      }
      switch (param) {
        case 241:
          return { effTyp: 14, eff: 147 };
        // play note twice
        case 242:
          return { effTyp: 14, eff: 211 };
        // delay note
        case 243:
          return { effTyp: 14, eff: 146 };
        // play note three times
        case 248:
          return { effTyp: 14, eff: 1 };
        // filter off (E01)
        case 249:
          return { effTyp: 14, eff: 0 };
        // filter on (E00)
        default:
          return { effTyp: 0, eff: 0 };
      }
    }
    // MED extended commands (0x10+) — mirrors OpenMPT ConvertMEDEffect
    case 25:
      return { effTyp: 9, eff: param };
    // Sample offset (MED uses 0x19, not 0x09)
    case 29:
      return { effTyp: 13, eff: param };
    // Pattern break (hex param)
    case 30:
      return { effTyp: 14, eff: 224 | Math.min(param, 15) };
    // Repeat row (EEx)
    case 22:
      return { effTyp: 14, eff: 96 | param & 15 };
    // Loop (E6x)
    case 24:
      return { effTyp: 14, eff: 192 | param & 15 };
    // Stop note (ECx)
    case 26:
      return { effTyp: 14, eff: 160 | param & 15 };
    // Slide vol up once (EAx)
    case 27:
      return { effTyp: 14, eff: 176 | param & 15 };
    // Slide vol down once (EBx)
    case 31: {
      if (param & 240) return { effTyp: 14, eff: 208 | param >> 4 };
      if (param & 15) return { effTyp: 14, eff: 144 | param & 15 };
      return { effTyp: 0, eff: 0 };
    }
    default:
      return { effTyp: 0, eff: 0 };
  }
}
export {
  parseMEDFile
};
