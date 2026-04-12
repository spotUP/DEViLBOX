import { c5 as registerVariableEncoder, c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function reverseXMToDMF(effTyp, eff) {
  let noteEff = 0, noteParam = 0, volEff = 0;
  switch (effTyp) {
    case 1:
      noteEff = 3;
      noteParam = eff;
      break;
    // Porta up
    case 2:
      noteEff = 4;
      noteParam = eff;
      break;
    // Porta down
    case 3:
      noteEff = 5;
      noteParam = eff;
      break;
    // Tone porta
    case 4:
      noteEff = 6;
      noteParam = eff;
      break;
    // Vibrato
    case 10:
      volEff = 1;
      noteParam = eff;
      break;
    // Volume slide
    case 9:
      noteEff = 9;
      noteParam = eff;
      break;
    // Sample offset
    case 11:
      noteEff = 11;
      noteParam = eff;
      break;
    // Position jump
    case 13:
      noteEff = 13;
      noteParam = eff;
      break;
    // Pattern break
    case 8:
      noteEff = 8;
      noteParam = eff;
      break;
  }
  return { noteEff, noteParam, volEff };
}
function encodeDMFChannel(rows, _channel) {
  const parts = [];
  for (let row = 0; row < rows.length; row++) {
    const cell = rows[row];
    const note = cell.note ?? 0;
    const instr = cell.instrument ?? 0;
    const vol = cell.volume ?? 0;
    const { noteEff, noteParam, volEff } = reverseXMToDMF(cell.effTyp ?? 0, cell.eff ?? 0);
    let info = 0;
    if (note !== 0) info |= 1;
    if (instr !== 0) info |= 2;
    if (noteEff !== 0) info |= 8;
    if (vol !== 0 || volEff !== 0) info |= 16;
    if (noteParam !== 0) info |= 64;
    parts.push(info);
    if (info & 1) {
      parts.push(note === 97 ? 255 : note);
    }
    if (info & 2) parts.push(instr);
    if (info & 8) parts.push(noteEff);
    if (info & 16) {
      parts.push(Math.min(255, vol * 4));
    }
    if (info & 64) parts.push(noteParam);
  }
  return new Uint8Array(parts);
}
const xTrackerEncoder = {
  formatId: "dmf",
  encodePattern(rows, channel) {
    return encodeDMFChannel(rows);
  }
};
registerVariableEncoder(xTrackerEncoder);
function u8(v, off) {
  return v.getUint8(off);
}
function u16le(v, off) {
  return v.getUint16(off, true);
}
function u32le(v, off) {
  return v.getUint32(off, true);
}
function readString(v, off, len) {
  let s = "";
  for (let i = 0; i < len; i++) {
    const c = v.getUint8(off + i);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.trim();
}
const FILE_HDR_SIZE = 66;
const CHUNK_HDR_SIZE = 8;
const ID_SEQU = charCode4("S", "E", "Q", "U");
const ID_PATT = charCode4("P", "A", "T", "T");
const ID_SMPI = charCode4("S", "M", "P", "I");
const ID_SMPD = charCode4("S", "M", "P", "D");
function charCode4(a, b, c, d) {
  return a.charCodeAt(0) | b.charCodeAt(0) << 8 | c.charCodeAt(0) << 16 | d.charCodeAt(0) << 24;
}
const SMP_LOOP = 1;
const SMP_16BIT = 2;
const SMP_COMP_MASK = 12;
const SMP_COMP1 = 4;
const PAT_GLOB_PACK = 128;
const PAT_GLOB_MASK = 63;
const PAT_COUNTER = 128;
const PAT_INSTR = 64;
const PAT_NOTE = 32;
const PAT_VOLUME = 16;
const PAT_INS_EFF = 8;
const PAT_NOTE_EFF = 4;
const PAT_VOL_EFF = 2;
const DMF_NOTE_CUT = 255;
const DMF_NOTE_OFF_XM = 97;
const NOTE_NOTECUT = 254;
const NOTE_KEYOFF = 253;
function isXTrackerFormat(bytes) {
  if (bytes.length < FILE_HDR_SIZE) return false;
  if (bytes[0] !== 68 || bytes[1] !== 68 || bytes[2] !== 77 || bytes[3] !== 70) {
    return false;
  }
  const version = bytes[4];
  return version >= 1 && version <= 10;
}
function readChunks(v, raw, fileVersion) {
  const chunks = /* @__PURE__ */ new Map();
  let pos = FILE_HDR_SIZE;
  const end = raw.length;
  while (pos + CHUNK_HDR_SIZE <= end) {
    const id = u32le(v, pos);
    let length = u32le(v, pos + 4);
    pos += CHUNK_HDR_SIZE;
    if (fileVersion === 3 && id === ID_SEQU) {
      const data2 = raw.subarray(pos, Math.min(pos + length, end));
      chunks.set(id, { id, data: data2 });
      pos += length + 2;
      continue;
    }
    if (fileVersion === 4 && id === ID_SEQU) {
      const data2 = raw.subarray(pos, Math.min(pos + length, end));
      chunks.set(id, { id, data: data2 });
      pos += length + 4;
      continue;
    }
    if (fileVersion < 8 && id === ID_SMPD) {
      length = end - pos;
    }
    const data = raw.subarray(pos, Math.min(pos + length, end));
    chunks.set(id, { id, data });
    pos += length;
  }
  return chunks;
}
function dmfUnpack(src, maxlen) {
  try {
    let readBit = function() {
      if (bitsLeft === 0) {
        if (bytePos >= src.length) throw new Error("eof");
        bitBuf = src[bytePos++];
        bitsLeft = 8;
      }
      bitsLeft--;
      return bitBuf >> bitsLeft & 1;
    }, readBits = function(n) {
      let result = 0;
      for (let i = 0; i < n; i++) {
        result = result << 1 | readBit();
      }
      return result;
    }, dmfNewNode = function() {
      const actnode = nodecount;
      if (actnode > 255) return;
      nodes[actnode].value = readBits(7);
      const isLeft = readBit() !== 0;
      const isRight = readBit() !== 0;
      const savedActnode = lastnode;
      nodecount++;
      lastnode = nodecount;
      if (isLeft) {
        nodes[savedActnode].left = lastnode;
        dmfNewNode();
      } else {
        nodes[savedActnode].left = -1;
      }
      lastnode = nodecount;
      if (isRight) {
        nodes[savedActnode].right = lastnode;
        dmfNewNode();
      } else {
        nodes[savedActnode].right = -1;
      }
    };
    let bytePos = 0;
    let bitBuf = 0;
    let bitsLeft = 0;
    const nodes = Array.from({ length: 256 }, () => ({ left: -1, right: -1, value: 0 }));
    let nodecount = 0;
    let lastnode = 0;
    dmfNewNode();
    if (nodes[0].left < 0 || nodes[0].right < 0) {
      return null;
    }
    const out = new Uint8Array(maxlen);
    let value = 0;
    let delta = 0;
    for (let i = 0; i < maxlen; i++) {
      let actnode = 0;
      const sign = readBit() !== 0;
      do {
        if (readBit()) {
          actnode = nodes[actnode].right;
        } else {
          actnode = nodes[actnode].left;
        }
        if (actnode > 255) break;
        delta = nodes[actnode].value;
      } while (nodes[actnode].left >= 0 && nodes[actnode].right >= 0);
      if (sign) delta ^= 255;
      value = value + delta & 255;
      out[i] = value;
    }
    return out;
  } catch {
    return null;
  }
}
function buildWAV16(pcmBytes, sampleRate) {
  const numFrames = pcmBytes.length >> 1;
  const dataSize = numFrames * 2;
  const fileSize = 44 + dataSize;
  const buf = new ArrayBuffer(fileSize);
  const view = new DataView(buf);
  const ws = (off, s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  ws(0, "RIFF");
  view.setUint32(4, fileSize - 8, true);
  ws(8, "WAVE");
  ws(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ws(36, "data");
  view.setUint32(40, dataSize, true);
  const dst = new Uint8Array(buf, 44);
  dst.set(pcmBytes.subarray(0, numFrames * 2));
  return buf;
}
function wavToDataUrl(wavBuf) {
  const bytes = new Uint8Array(wavBuf);
  let binary = "";
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(i, Math.min(i + CHUNK, bytes.length))));
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}
function dmfTempoToSpeedBPM(realBPMmode, tempoBPM, tempoTicks, beat) {
  if (realBPMmode && beat === 0) {
    return { speed: 6, bpm: 120 };
  }
  const tickspeed = realBPMmode ? Math.max(1, tempoBPM * beat * 2) : (tempoTicks + 1) * 30;
  let speed = 1;
  let bpm = 32;
  for (let s = 255; s >= 1; s--) {
    const t = Math.floor(tickspeed * s / 48);
    if (t >= 32 && t <= 255) {
      speed = s;
      bpm = t;
      break;
    }
  }
  bpm = Math.max(32, Math.min(255, bpm));
  speed = Math.max(1, speed);
  return { speed, bpm };
}
function dmfDelay2MPT(val, ticks) {
  const nv = Math.floor(val * ticks / 255);
  return Math.max(0, Math.min(15, nv));
}
function dmfVibrato2MPT(val, ticks) {
  const periodInTicks = Math.max(1, val >> 4) * ticks;
  const matchingPeriod = Math.max(1, Math.min(15, Math.floor(128 / periodInTicks)));
  return matchingPeriod << 4 | Math.max(1, val & 15);
}
function dmfTremor2MPT(val, ticks) {
  let ontime = val >> 4;
  let offtime = val & 15;
  ontime = Math.max(1, Math.min(15, Math.floor(ontime * ticks / 15)));
  offtime = Math.max(1, Math.min(15, Math.floor(offtime * ticks / 15)));
  return ontime << 4 | offtime;
}
function dmfPorta2MPT(val, ticks, hasFine) {
  if (val === 0) return 0;
  if (val <= 15 && hasFine || ticks < 2) return val | 240;
  return Math.max(1, Math.floor(val / (ticks - 1)));
}
function dmfSlide2MPT(val, ticks, up) {
  val = Math.max(1, Math.floor(val / 4));
  const isFine = val < 15 || ticks < 2;
  if (!isFine) {
    val = Math.max(1, Math.floor((val + ticks - 2) / (ticks - 1)));
  }
  if (up) return (isFine ? 15 : 0) | val << 4;
  else return (isFine ? 240 : 0) | val & 15;
}
function makeChannelState() {
  return {
    noteBuffer: 0,
    lastNote: 0,
    vibratoType: 8,
    tremoloType: 4,
    highOffset: 6,
    playDir: false
  };
}
const XM_NONE = 0;
const XM_PORTA_UP = 1;
const XM_PORTA_DOWN = 2;
const XM_TONE_PORTA = 3;
const XM_VIBRATO = 4;
const XM_TREMOR = 29;
const XM_OFFSET = 9;
const XM_VOL_SLIDE = 10;
const XM_RETRIG = 27;
const XM_PANNING8 = 8;
const XM_PAN_SLIDE = 25;
const XM_PANBRELLO = 26;
const XM_TEMPO = 15;
const XM_SPEED = 15;
const XM_S3MCMDEX = 19;
function convertDMFPattern(data, fileVersion, settings, numGlobalChannels) {
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let pos = 0;
  let numTracks;
  let beat;
  let numRows;
  if (fileVersion < 3) {
    if (data.length < 9) return null;
    numTracks = u8(v, pos);
    pos += 1;
    pos += 2;
    numRows = u16le(v, pos);
    pos += 2;
    pos += 4;
    beat = 0;
  } else {
    if (data.length < 8) return null;
    numTracks = u8(v, pos);
    pos += 1;
    beat = u8(v, pos);
    pos += 1;
    numRows = u16le(v, pos);
    pos += 2;
    pos += 4;
  }
  if (fileVersion < 6) beat = 0;
  numRows = Math.max(1, Math.min(numRows, 256));
  settings.beat = beat >> 4;
  const numChannels = Math.min(numGlobalChannels - 1, numTracks);
  const channelCounter = new Array(numChannels + 1).fill(0);
  const grid = Array.from(
    { length: numChannels + 1 },
    () => Array.from({ length: numRows }, () => ({
      note: 0,
      instrument: 0,
      volume: 0,
      effTyp: 0,
      eff: 0,
      effTyp2: 0,
      eff2: 0
    }))
  );
  let tempoChange = settings.realBPMmode;
  let writeDelay = 0;
  let initialSpeed;
  let initialBPM;
  for (let row = 0; row < numRows; row++) {
    if (pos >= data.length) break;
    if (channelCounter[0] === 0) {
      if (pos >= data.length) break;
      const globalInfo = u8(v, pos++);
      if ((globalInfo & PAT_GLOB_PACK) !== 0) {
        if (pos >= data.length) break;
        channelCounter[0] = u8(v, pos++);
      }
      const cmd = globalInfo & PAT_GLOB_MASK;
      let gd = 0;
      if (cmd !== 0) {
        if (pos >= data.length) break;
        gd = u8(v, pos++);
      }
      switch (cmd) {
        case 1:
          settings.realBPMmode = false;
          settings.tempoTicks = Math.max(1, gd);
          settings.tempoBPM = 0;
          tempoChange = true;
          break;
        case 2:
          if (gd !== 0) {
            settings.realBPMmode = true;
            settings.tempoBPM = gd;
            if (settings.beat !== 0) {
              settings.tempoTicks = gd * settings.beat * 15;
            }
            tempoChange = true;
          }
          break;
        case 3:
          settings.beat = gd >> 4;
          if (settings.beat !== 0) {
            tempoChange = settings.realBPMmode;
          } else {
            settings.realBPMmode = false;
          }
          break;
        case 4:
          writeDelay = gd;
          break;
        case 5:
          break;
        case 6:
          if (gd > 0) {
            const ref = settings.realBPMmode ? "bpm" : "ticks";
            if (ref === "bpm") {
              settings.tempoBPM = Math.min(255, settings.tempoBPM + gd);
            } else {
              settings.tempoTicks = Math.min(255, settings.tempoTicks + gd);
            }
            tempoChange = true;
          }
          break;
        case 7:
          if (gd > 0) {
            const ref = settings.realBPMmode ? "bpm" : "ticks";
            if (ref === "bpm") {
              settings.tempoBPM = Math.max(1, settings.tempoBPM - gd);
            } else {
              settings.tempoTicks = Math.max(1, settings.tempoTicks - gd);
            }
            tempoChange = true;
          }
          break;
      }
    } else {
      channelCounter[0]--;
    }
    let rowSpeed = 0;
    let rowBPM = 0;
    if (tempoChange) {
      if (!settings.realBPMmode || settings.beat !== 0) {
        const { speed, bpm } = dmfTempoToSpeedBPM(
          settings.realBPMmode,
          settings.tempoBPM,
          settings.tempoTicks,
          settings.beat
        );
        rowSpeed = speed;
        rowBPM = bpm;
        settings.internalTicks = Math.max(1, speed);
        tempoChange = false;
        if (row === 0) {
          initialSpeed = speed;
          initialBPM = bpm;
        }
      } else {
        tempoChange = false;
      }
    }
    if (rowSpeed > 0 || rowBPM > 0) {
      const gc = grid[0][row];
      if (rowSpeed > 0) {
        gc.effTyp = XM_SPEED;
        gc.eff = rowSpeed;
      }
      if (rowBPM > 0) {
        gc.effTyp2 = XM_TEMPO;
        gc.eff2 = rowBPM;
      }
    }
    if ((writeDelay & 240) !== 0) {
      const gc = grid[0][row];
      if (gc.effTyp === XM_NONE) {
        gc.effTyp = XM_S3MCMDEX;
        gc.eff = 224 | writeDelay >> 4;
      }
    }
    if ((writeDelay & 15) !== 0) {
      const param = Math.max(1, Math.min(15, Math.floor((writeDelay & 15) * settings.internalTicks / 15)));
      const gc = grid[0][row];
      if (gc.effTyp2 === XM_NONE) {
        gc.effTyp2 = XM_S3MCMDEX;
        gc.eff2 = 96 | param;
      }
    }
    writeDelay = 0;
    for (let chn = 1; chn <= numChannels; chn++) {
      if (channelCounter[chn] === 0) {
        if (pos >= data.length) break;
        const channelInfo = u8(v, pos++);
        if ((channelInfo & PAT_COUNTER) !== 0) {
          if (pos >= data.length) break;
          channelCounter[chn] = u8(v, pos++);
        }
        const cell = grid[chn][row];
        const cs = settings.channelStates[chn - 1];
        let slideNote = true;
        if ((channelInfo & PAT_INSTR) !== 0) {
          if (pos >= data.length) break;
          cell.instrument = u8(v, pos++);
          if (cell.instrument !== 0) slideNote = false;
        }
        if ((channelInfo & PAT_NOTE) !== 0) {
          if (pos >= data.length) break;
          const rawNote = u8(v, pos++);
          if (rawNote >= 1 && rawNote <= 108) {
            cell.note = Math.max(1, Math.min(120, rawNote + 24));
            cs.lastNote = cell.note;
          } else if (rawNote >= 129 && rawNote <= 236) {
            cs.noteBuffer = Math.max(1, Math.min(120, (rawNote & 127) + 24));
            cell.note = 0;
          } else if (rawNote === DMF_NOTE_CUT) {
            cell.note = NOTE_NOTECUT;
          }
        }
        if (cell.note === 0 && cell.instrument > 0) {
          cell.note = cs.lastNote;
          cell.instrument = 0;
        }
        if (cell.note >= 1 && cell.note <= 120) {
          cs.playDir = false;
        }
        let eff1 = XM_NONE;
        let p1 = 0;
        let eff2 = XM_NONE;
        let p2 = 0;
        let eff3 = XM_NONE;
        let p3 = 0;
        let hasVolume = false;
        let volValue = 0;
        if ((channelInfo & PAT_VOLUME) !== 0) {
          if (pos >= data.length) break;
          const raw = u8(v, pos++);
          volValue = Math.floor((raw + 2) / 4);
          hasVolume = true;
        }
        if ((channelInfo & PAT_INS_EFF) !== 0) {
          if (pos + 1 >= data.length) break;
          const cmd = u8(v, pos++);
          p1 = u8(v, pos++);
          switch (cmd) {
            case 1:
              cell.note = NOTE_NOTECUT;
              eff1 = XM_NONE;
              break;
            case 2:
              cell.note = NOTE_KEYOFF;
              eff1 = XM_NONE;
              break;
            case 3:
              cell.note = cs.lastNote;
              cs.playDir = false;
              eff1 = XM_NONE;
              break;
            case 4: {
              const delay = dmfDelay2MPT(p1, settings.internalTicks);
              if (delay > 0) {
                eff1 = XM_S3MCMDEX;
                p1 = 208 | delay;
              } else {
                eff1 = XM_NONE;
              }
              if (cell.note === 0) {
                cell.note = cs.lastNote;
                cs.playDir = false;
              }
              break;
            }
            case 5: {
              const rt = Math.max(1, dmfDelay2MPT(p1, settings.internalTicks));
              eff1 = XM_RETRIG;
              p1 = rt;
              cs.playDir = false;
              break;
            }
            case 6:
            case 7:
            case 8:
            case 9: {
              eff1 = XM_OFFSET;
              cs.highOffset = cmd;
              if (cell.note === 0) cell.note = cs.lastNote;
              cs.playDir = false;
              break;
            }
            case 10:
              eff1 = XM_S3MCMDEX;
              p1 = cs.playDir ? 158 : 159;
              cs.playDir = !cs.playDir;
              break;
            default:
              eff1 = XM_NONE;
              break;
          }
        }
        if ((channelInfo & PAT_NOTE_EFF) !== 0) {
          if (pos + 1 >= data.length) break;
          const cmd = u8(v, pos++);
          p2 = u8(v, pos++);
          switch (cmd) {
            case 1: {
              const signedP2 = p2 < 128 ? p2 : p2 - 256;
              const fine = Math.round(signedP2 * 8 / 128);
              if (cell.note >= 1 && cell.note <= 120) {
                cell.note = Math.max(1, Math.min(120, cell.note + fine));
              }
              eff2 = XM_NONE;
              break;
            }
            case 2: {
              const delay = dmfDelay2MPT(p2, settings.internalTicks);
              if (delay > 0) {
                eff2 = XM_S3MCMDEX;
                p2 = 208 | delay;
              } else {
                eff2 = XM_NONE;
              }
              break;
            }
            case 3:
              eff2 = 0;
              break;
            case 4:
              p2 = dmfPorta2MPT(p2, settings.internalTicks, true);
              eff2 = XM_PORTA_UP;
              break;
            case 5:
              p2 = dmfPorta2MPT(p2, settings.internalTicks, true);
              eff2 = XM_PORTA_DOWN;
              break;
            case 6:
              if (cell.note === 0) cell.note = cs.noteBuffer;
              p2 = dmfPorta2MPT(p2, settings.internalTicks, false);
              eff2 = XM_TONE_PORTA;
              break;
            case 7:
              cell.note = Math.max(1, Math.min(120, p2 + 25));
              eff2 = XM_TONE_PORTA;
              p2 = 255;
              break;
            case 8:
            case 9:
            case 10: {
              cs.vibratoType = cmd;
              eff2 = XM_VIBRATO;
              p2 = dmfVibrato2MPT(p2, settings.internalTicks);
              break;
            }
            case 11:
              p2 = dmfTremor2MPT(p2, settings.internalTicks);
              eff2 = XM_TREMOR;
              break;
            case 12: {
              const delay = dmfDelay2MPT(p2, settings.internalTicks);
              if (delay > 0) {
                eff2 = XM_S3MCMDEX;
                p2 = 192 | delay;
              } else {
                eff2 = XM_NONE;
                cell.note = NOTE_NOTECUT;
              }
              break;
            }
            default:
              eff2 = XM_NONE;
              break;
          }
        }
        if ((channelInfo & PAT_VOL_EFF) !== 0) {
          if (pos + 1 >= data.length) break;
          const cmd = u8(v, pos++);
          p3 = u8(v, pos++);
          switch (cmd) {
            case 1:
              p3 = dmfSlide2MPT(p3, settings.internalTicks, true);
              eff3 = XM_VOL_SLIDE;
              break;
            case 2:
              p3 = dmfSlide2MPT(p3, settings.internalTicks, false);
              eff3 = XM_VOL_SLIDE;
              break;
            case 3:
              p3 = dmfTremor2MPT(p3, settings.internalTicks);
              eff3 = XM_TREMOR;
              break;
            case 4:
            case 5:
            case 6: {
              cs.tremoloType = cmd;
              eff3 = 7;
              p3 = dmfVibrato2MPT(p3, settings.internalTicks);
              break;
            }
            case 7:
              eff3 = XM_PANNING8;
              break;
            case 8:
              p3 = dmfSlide2MPT(p3, settings.internalTicks, true);
              eff3 = XM_PAN_SLIDE;
              break;
            case 9:
              p3 = dmfSlide2MPT(p3, settings.internalTicks, false);
              eff3 = XM_PAN_SLIDE;
              break;
            case 10:
              eff3 = XM_PANBRELLO;
              p3 = dmfVibrato2MPT(p3, settings.internalTicks);
              break;
            default:
              eff3 = XM_NONE;
              break;
          }
        }
        if (slideNote && cell.note >= 1 && cell.note <= 120) {
          if (eff2 === XM_NONE) {
            eff2 = XM_TONE_PORTA;
            p2 = 255;
          } else if (eff3 === XM_NONE && eff2 !== XM_TONE_PORTA) {
            eff3 = XM_TONE_PORTA;
            p3 = 255;
          }
        }
        if (hasVolume) {
          cell.volume = volValue;
        }
        cell.effTyp = eff2;
        cell.eff = p2;
        cell.effTyp2 = eff3;
        cell.eff2 = p3;
        if (eff1 !== XM_NONE) {
          if (cell.effTyp2 === XM_NONE) {
            cell.effTyp2 = cell.effTyp;
            cell.eff2 = cell.eff;
          }
          cell.effTyp = eff1;
          cell.eff = p1;
        }
        if (cell.note === NOTE_NOTECUT) {
          cell.note = 254;
        } else if (cell.note === NOTE_KEYOFF) {
          cell.note = DMF_NOTE_OFF_XM;
        }
      } else {
        channelCounter[chn]--;
      }
    }
  }
  return {
    numRows,
    initialSpeed,
    initialBPM,
    channels: grid
  };
}
function parseXTrackerFile(bytes, filename) {
  try {
    return parseXTrackerFileInternal(bytes, filename);
  } catch {
    return null;
  }
}
function parseXTrackerFileInternal(bytes, filename) {
  if (!isXTrackerFormat(bytes)) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fileVersion = bytes[4];
  const songName = readString(v, 13, 30) || filename.replace(/\.[^/.]+$/i, "");
  const chunks = readChunks(v, bytes, fileVersion);
  const pattChunk = chunks.get(ID_PATT);
  if (!pattChunk) return null;
  const pv = new DataView(pattChunk.data.buffer, pattChunk.data.byteOffset, pattChunk.data.byteLength);
  if (pattChunk.data.length < 3) return null;
  const numPatterns = u16le(pv, 0);
  const numTracks = Math.max(1, Math.min(32, pattChunk.data[2]));
  const headerSize = fileVersion < 3 ? 9 : 8;
  const patternRawData = [];
  const dmfPatternFileAddrs = [];
  const dmfPatternFileSizes = [];
  {
    let ppos = 3;
    const pattBaseOffset = pattChunk.data.byteOffset;
    for (let p = 0; p < numPatterns; p++) {
      if (ppos + headerSize > pattChunk.data.length) break;
      const patLength = u32le(pv, ppos + headerSize - 4);
      const total = headerSize + patLength;
      if (ppos + total > pattChunk.data.length) break;
      dmfPatternFileAddrs.push(pattBaseOffset + ppos);
      dmfPatternFileSizes.push(total);
      patternRawData.push(pattChunk.data.subarray(ppos, ppos + total));
      ppos += total;
    }
  }
  const seqChunk = chunks.get(ID_SEQU);
  const orderList = [];
  let seqLoopStart = 0;
  let seqLoopEnd = 0;
  let hasSeqLoop = false;
  if (seqChunk) {
    const sv = new DataView(seqChunk.data.buffer, seqChunk.data.byteOffset, seqChunk.data.byteLength);
    let spos = 0;
    if (fileVersion >= 3 && spos + 2 <= seqChunk.data.length) {
      seqLoopStart = u16le(sv, spos);
      spos += 2;
    }
    if (fileVersion >= 4 && spos + 2 <= seqChunk.data.length) {
      seqLoopEnd = u16le(sv, spos);
      spos += 2;
      hasSeqLoop = true;
      if (fileVersion === 4 && seqLoopEnd === 0) hasSeqLoop = false;
    }
    while (spos + 2 <= seqChunk.data.length) {
      orderList.push(u16le(sv, spos));
      spos += 2;
    }
  }
  const smpiChunk = chunks.get(ID_SMPI);
  const smpdChunk = chunks.get(ID_SMPD);
  const sampleInfos = [];
  if (smpiChunk && smpiChunk.data.length >= 1) {
    const mi = new DataView(smpiChunk.data.buffer, smpiChunk.data.byteOffset, smpiChunk.data.byteLength);
    const numSamples = smpiChunk.data[0];
    let mpos = 1;
    for (let s = 0; s < numSamples; s++) {
      const nameLen = fileVersion < 2 ? 30 : mpos < smpiChunk.data.length ? smpiChunk.data[mpos++] : 0;
      if (mpos + nameLen > smpiChunk.data.length) break;
      const name = readString(mi, mpos, nameLen);
      mpos += nameLen;
      if (mpos + 16 > smpiChunk.data.length) break;
      const length = u32le(mi, mpos + 0);
      const loopStart = u32le(mi, mpos + 4);
      const loopEnd = u32le(mi, mpos + 8);
      const c3freq = u16le(mi, mpos + 10);
      const volume = smpiChunk.data[mpos + 12];
      const flags = smpiChunk.data[mpos + 13];
      mpos += 16;
      if (fileVersion >= 8) mpos += 8;
      mpos += fileVersion > 1 ? 6 : 2;
      sampleInfos.push({ name: name || `Sample ${s + 1}`, length, loopStart, loopEnd, c3freq, volume, flags });
    }
  }
  const samplePCM = [];
  if (smpdChunk) {
    const dv = new DataView(smpdChunk.data.buffer, smpdChunk.data.byteOffset, smpdChunk.data.byteLength);
    let dpos = 0;
    for (let s = 0; s < sampleInfos.length; s++) {
      if (dpos + 4 > smpdChunk.data.length) {
        samplePCM.push(null);
        continue;
      }
      const blockLen = u32le(dv, dpos);
      dpos += 4;
      if (dpos + blockLen > smpdChunk.data.length) {
        samplePCM.push(null);
        dpos += blockLen;
        continue;
      }
      const raw = smpdChunk.data.subarray(dpos, dpos + blockLen);
      dpos += blockLen;
      const info = sampleInfos[s];
      const comp = info.flags & SMP_COMP_MASK;
      if (blockLen === 0 || info.length === 0) {
        samplePCM.push(null);
        continue;
      }
      if (comp === SMP_COMP1) {
        const is16 = (info.flags & SMP_16BIT) !== 0;
        const uncompLen = is16 ? info.length * 2 : info.length;
        const decompressed = dmfUnpack(raw, uncompLen);
        samplePCM.push(decompressed);
      } else {
        samplePCM.push(raw.slice());
      }
    }
  }
  const instruments = [];
  for (let s = 0; s < sampleInfos.length; s++) {
    const info = sampleInfos[s];
    const id = s + 1;
    const pcm = samplePCM[s] ?? null;
    const is16 = (info.flags & SMP_16BIT) !== 0;
    const loop = (info.flags & SMP_LOOP) !== 0;
    const vol64 = info.volume === 0 ? 64 : Math.min(64, Math.floor((info.volume + 1) / 4));
    const c3freq = Math.max(1e3, Math.min(45e3, info.c3freq || 8363));
    if (!pcm || pcm.length === 0) {
      instruments.push({
        id,
        name: info.name,
        type: "sample",
        synthType: "Sampler",
        effects: [],
        volume: -60,
        pan: 0
      });
      continue;
    }
    if (is16) {
      let loopStartFrames = 0;
      let loopEndFrames = 0;
      if (loop) {
        loopStartFrames = Math.floor(info.loopStart / 2);
        loopEndFrames = Math.floor(info.loopEnd / 2);
        const maxFrames = Math.floor(pcm.length / 2);
        loopEndFrames = Math.min(loopEndFrames, maxFrames);
      }
      const hasLoop = loop && loopEndFrames > loopStartFrames;
      const wavBuf = buildWAV16(pcm, c3freq);
      const dataUrl = wavToDataUrl(wavBuf);
      instruments.push({
        id,
        name: info.name.replace(/\0/g, "").trim() || `Sample ${id}`,
        type: "sample",
        synthType: "Sampler",
        effects: [],
        volume: vol64 > 0 ? 20 * Math.log10(vol64 / 64) : -60,
        pan: 0,
        sample: {
          audioBuffer: wavBuf,
          url: dataUrl,
          baseNote: "C3",
          detune: 0,
          loop: hasLoop,
          loopType: hasLoop ? "forward" : "off",
          loopStart: loopStartFrames,
          loopEnd: loopEndFrames > 0 ? loopEndFrames : Math.floor(pcm.length / 2),
          sampleRate: c3freq,
          reverse: false,
          playbackRate: 1
        }
      });
    } else {
      let loopStartFrames = 0;
      let loopEndFrames = 0;
      if (loop) {
        loopStartFrames = info.loopStart;
        loopEndFrames = Math.min(info.loopEnd, pcm.length);
      }
      const loopEnd = loop && loopEndFrames > loopStartFrames ? loopEndFrames : 0;
      instruments.push(
        createSamplerInstrument(id, info.name, pcm, vol64, c3freq, loopStartFrames, loopEnd)
      );
    }
  }
  const numGlobalChannels = numTracks + 1;
  const settings = {
    realBPMmode: false,
    beat: 0,
    tempoTicks: 32,
    // X-Tracker default tick speed
    tempoBPM: 120,
    internalTicks: 6,
    channelStates: Array.from({ length: numTracks }, () => makeChannelState())
  };
  const { speed: initSpeed, bpm: initBPM } = dmfTempoToSpeedBPM(
    settings.realBPMmode,
    settings.tempoBPM,
    settings.tempoTicks,
    settings.beat
  );
  const convertedPatterns = [];
  for (const rawPat of patternRawData) {
    const cp = convertDMFPattern(rawPat, fileVersion, settings, numGlobalChannels);
    convertedPatterns.push(cp ?? { numRows: 64, channels: [] });
  }
  const patterns = [];
  const songPositions = [];
  for (let ordIdx = 0; ordIdx < orderList.length; ordIdx++) {
    const srcPat = orderList[ordIdx];
    const cp = srcPat < convertedPatterns.length ? convertedPatterns[srcPat] : null;
    const numRows = (cp == null ? void 0 : cp.numRows) ?? 64;
    const patIdx = patterns.length;
    const channelDataArr = [];
    for (let ch = 0; ch <= numTracks; ch++) {
      const cells = (cp == null ? void 0 : cp.channels[ch]) ?? Array.from({ length: numRows }, () => ({
        note: 0,
        instrument: 0,
        volume: 0,
        effTyp: 0,
        eff: 0,
        effTyp2: 0,
        eff2: 0
      }));
      channelDataArr.push({
        id: `channel-${ch}`,
        name: ch === 0 ? "Global" : `Channel ${ch}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: 0,
        instrumentId: null,
        color: null,
        rows: cells
      });
    }
    patterns.push({
      id: `pattern-${patIdx}`,
      name: `Pattern ${srcPat}`,
      length: numRows,
      channels: channelDataArr,
      importMetadata: {
        sourceFormat: "DMF",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: numTracks,
        originalPatternCount: patternRawData.length,
        originalInstrumentCount: sampleInfos.length
      }
    });
    songPositions.push(patIdx);
  }
  if (patterns.length === 0) {
    patterns.push({
      id: "pattern-0",
      name: "Pattern 0",
      length: 64,
      channels: Array.from({ length: numTracks + 1 }, (_, ch) => ({
        id: `channel-${ch}`,
        name: ch === 0 ? "Global" : `Channel ${ch}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: 0,
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
        sourceFormat: "DMF",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: numTracks,
        originalPatternCount: 0,
        originalInstrumentCount: sampleInfos.length
      }
    });
    songPositions.push(0);
  }
  const restartPosition = hasSeqLoop && seqLoopStart < songPositions.length ? seqLoopStart : 0;
  return {
    name: songName,
    format: "IT",
    // DMF effects map best to IT conventions
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition,
    numChannels: numTracks + 1,
    // +1 for global track
    initialSpeed: initSpeed,
    initialBPM: initBPM,
    linearPeriods: true,
    // X-Tracker uses linear slides
    uadeVariableLayout: {
      formatId: "dmf",
      numChannels: numTracks + 1,
      numFilePatterns: patternRawData.length,
      rowsPerPattern: 64,
      moduleSize: bytes.length,
      encoder: xTrackerEncoder,
      filePatternAddrs: dmfPatternFileAddrs,
      filePatternSizes: dmfPatternFileSizes,
      trackMap: Array.from(
        { length: patterns.length },
        (_, p) => Array.from({ length: numTracks + 1 }, (__, _ch) => p < patternRawData.length ? p : -1)
      )
    }
  };
}
export {
  isXTrackerFormat,
  parseXTrackerFile
};
