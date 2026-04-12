import { D as DEFAULT_FURNACE } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function emptyCell() {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}
function emptyPattern(id, name, numCh, rows) {
  return {
    id,
    name,
    length: rows,
    channels: Array.from({ length: numCh }, (_, i) => ({
      id: `ch${i}`,
      name: `CH ${i + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: 0,
      instrumentId: null,
      color: null,
      rows: Array.from({ length: rows }, emptyCell)
    }))
  };
}
function readUtf16LEString(buf, off) {
  let text = "";
  let i = off;
  while (i + 1 < buf.length) {
    const lo = buf[i], hi = buf[i + 1];
    if (lo === 0 && hi === 0) {
      i += 2;
      break;
    }
    text += String.fromCharCode(lo | hi << 8);
    i += 2;
  }
  return { text, nextOff: i };
}
function ym2612FnumToNote(fnum, block) {
  const freq = fnum * 7670454 / (144 * (1 << 21 - block));
  if (freq <= 0) return 0;
  const note = Math.round(12 * Math.log2(freq / 440) + 69);
  return Math.max(1, Math.min(96, note));
}
function sn76489CounterToNote(counter, clock) {
  if (counter <= 0) return 0;
  const freq = clock / (32 * counter);
  if (freq <= 0) return 0;
  const note = Math.round(12 * Math.log2(freq / 440) + 69);
  return Math.max(1, Math.min(96, note));
}
const KC_TO_SEMITONE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0];
function opmKeyCodeToNote(kc) {
  const octave = kc >> 4 & 7;
  const kcNote = Math.min(kc & 15, 11);
  const semi = KC_TO_SEMITONE[kcNote];
  const midiNote = octave * 12 + semi + 12;
  return Math.max(1, Math.min(96, midiNote));
}
function parseGd3(buf, gd3Abs) {
  const magic = String.fromCharCode(buf[gd3Abs], buf[gd3Abs + 1], buf[gd3Abs + 2], buf[gd3Abs + 3]);
  if (magic !== "Gd3 ") return { trackName: "", gameName: "", systemName: "", author: "", date: "" };
  let off = gd3Abs + 12;
  const readStr = () => {
    const r = readUtf16LEString(buf, off);
    off = r.nextOff;
    return r.text;
  };
  const trackName = readStr();
  readStr();
  const gameName = readStr();
  readStr();
  const systemName = readStr();
  readStr();
  const author = readStr();
  readStr();
  const date = readStr();
  return { trackName, gameName, systemName, author, date };
}
function detectChips(dv, version) {
  const clk = (off) => dv.byteLength > off + 4 ? dv.getUint32(off, true) & 2147483647 : 0;
  return {
    sn76489: clk(12) > 0,
    ym2413: clk(16) > 0,
    ym2612: version >= 257 ? clk(44) > 0 : false,
    ym2151: version >= 257 ? clk(48) > 0 : false,
    ym2203: version >= 272 ? clk(68) > 0 : false,
    ym2608: version >= 272 ? clk(72) > 0 : false,
    ym2610: version >= 272 ? clk(76) > 0 : false,
    ym3812: version >= 272 ? clk(80) > 0 : false,
    ymf262: version >= 336 ? clk(92) > 0 : false,
    ay8910: version >= 337 ? clk(116) > 0 : false
  };
}
function buildInstruments(chips) {
  const insts = [];
  let id = 1;
  const add = (name, synthType, chipType, ops = 4) => {
    insts.push({
      id: id++,
      name,
      type: "synth",
      synthType,
      furnace: { ...DEFAULT_FURNACE, chipType, ops },
      effects: [],
      volume: 0,
      pan: 0
    });
  };
  let opn2InstIdx = -1;
  let opmInstIdx = -1;
  let snInstIdx = -1;
  if (chips.ym2612) {
    opn2InstIdx = insts.length;
    add("OPN2 FM", "FurnaceOPN", 1);
  }
  if (chips.ym2151) {
    opmInstIdx = insts.length;
    add("OPM FM", "FurnaceOPM", 33);
  }
  if (chips.ym2203) add("OPN FM", "FurnaceOPN2203", 1);
  if (chips.ym2608) add("OPNA FM", "FurnaceOPNA", 1);
  if (chips.ym2610) add("OPNB FM", "FurnaceOPNB", 1);
  if (chips.ym3812) add("OPL2 FM", "FurnaceOPL", 14, 2);
  if (chips.ymf262) add("OPL3 FM", "FurnaceOPL", 14, 2);
  if (chips.ym2413) add("OPLL FM", "FurnaceOPLL", 13, 2);
  if (chips.sn76489) {
    snInstIdx = insts.length;
    add("SN PSG", "FurnacePSG", 0, 2);
  }
  if (chips.ay8910) add("AY PSG", "FurnaceAY", 6, 2);
  if (insts.length === 0) {
    opn2InstIdx = 0;
    add("FM", "FurnaceOPN", 1);
  }
  let nextCh = 0;
  let opn2ChStart = -1;
  if (chips.ym2612 || opn2InstIdx >= 0) {
    opn2ChStart = nextCh;
    nextCh += 6;
  }
  let opmChStart = -1;
  if (chips.ym2151) {
    opmChStart = nextCh;
    nextCh += 8;
  }
  let snChStart = -1;
  if (chips.sn76489) {
    snChStart = nextCh;
    nextCh += 3;
  }
  const totalChannels = Math.max(nextCh, 1);
  return {
    instruments: insts,
    opn2ChStart,
    opmChStart,
    snChStart,
    opn2InstIdx,
    opmInstIdx,
    snInstIdx,
    totalChannels
  };
}
function walkCommands(buf, dataStart, _chips, opts) {
  const events = [];
  let pos = dataStart;
  let tick = 0;
  const opn2FnumLo = new Uint8Array(6);
  const opn2FnumHi = new Uint8Array(6);
  const opn2KeyOn = new Uint8Array(6);
  const opn2ChStart = opts.opn2ChStart >= 0 ? opts.opn2ChStart : 0;
  const opn2InstIdx = opts.opn2InstIdx >= 0 ? opts.opn2InstIdx : 0;
  const snCounter = new Uint16Array(4);
  const snVolume = new Uint8Array(4).fill(15);
  const snPlaying = new Uint8Array(4);
  let snLatchCh = 0;
  let snLatchTyp = 0;
  const opmKeyCode = new Uint8Array(8);
  const opmKeyOn = new Uint8Array(8);
  while (pos < buf.length) {
    const cmd = buf[pos++];
    if (cmd === 102) break;
    if (cmd === 98) {
      tick += 882;
      continue;
    }
    if (cmd === 99) {
      tick += 735;
      continue;
    }
    if (cmd === 97) {
      if (pos + 1 < buf.length) {
        tick += buf[pos] | buf[pos + 1] << 8;
        pos += 2;
      }
      continue;
    }
    if (cmd >= 112 && cmd <= 127) {
      tick += (cmd & 15) + 1;
      continue;
    }
    if (cmd === 79) {
      pos++;
      continue;
    }
    if (cmd === 80) {
      if (pos >= buf.length) break;
      const data = buf[pos++];
      if (data & 128) {
        snLatchCh = data >> 5 & 3;
        snLatchTyp = data >> 4 & 1;
        const lo = data & 15;
        if (snLatchTyp === 1) {
          const prevVol = snVolume[snLatchCh];
          snVolume[snLatchCh] = lo;
          if (opts.snChStart >= 0 && snLatchCh < 3) {
            const outCh = opts.snChStart + snLatchCh;
            if (lo === 15 && snPlaying[snLatchCh]) {
              events.push({ tick, ch: outCh, note: 97, on: false, instIdx: opts.snInstIdx });
              snPlaying[snLatchCh] = 0;
            } else if (lo < 15 && prevVol === 15 && snCounter[snLatchCh] > 0) {
              const note = sn76489CounterToNote(snCounter[snLatchCh], opts.snClock);
              if (note > 0) {
                events.push({ tick, ch: outCh, note, on: true, instIdx: opts.snInstIdx });
                snPlaying[snLatchCh] = 1;
              }
            }
          }
        } else {
          snCounter[snLatchCh] = snCounter[snLatchCh] & 1008 | lo;
        }
      } else {
        if (snLatchTyp === 0 && snLatchCh < 3) {
          snCounter[snLatchCh] = (data & 63) << 4 | snCounter[snLatchCh] & 15;
          if (opts.snChStart >= 0) {
            const outCh = opts.snChStart + snLatchCh;
            if (snVolume[snLatchCh] < 15 && snCounter[snLatchCh] > 0) {
              const note = sn76489CounterToNote(snCounter[snLatchCh], opts.snClock);
              if (note > 0) {
                if (snPlaying[snLatchCh]) {
                  events.push({ tick, ch: outCh, note: 97, on: false, instIdx: opts.snInstIdx });
                }
                events.push({ tick, ch: outCh, note, on: true, instIdx: opts.snInstIdx });
                snPlaying[snLatchCh] = 1;
              }
            }
          }
        }
      }
      continue;
    }
    if (cmd === 82 || cmd === 83) {
      if (pos + 1 >= buf.length) break;
      const reg = buf[pos++];
      const val = buf[pos++];
      const portBase = cmd === 83 ? 3 : 0;
      if (reg >= 160 && reg <= 162) {
        opn2FnumLo[portBase + (reg - 160)] = val;
      } else if (reg >= 164 && reg <= 166) {
        opn2FnumHi[portBase + (reg - 164)] = val;
      } else if (reg === 40) {
        const rawCh = val & 7;
        const ch = rawCh < 4 ? rawCh : rawCh - 1;
        if (ch < 6) {
          const on = (val & 240) !== 0;
          if (on !== (opn2KeyOn[ch] !== 0)) {
            const fnum = opn2FnumLo[ch] | (opn2FnumHi[ch] & 7) << 8;
            const block = opn2FnumHi[ch] >> 3 & 7;
            const outCh = opn2ChStart + ch;
            events.push({ tick, ch: outCh, note: ym2612FnumToNote(fnum, block), on, instIdx: opn2InstIdx });
            opn2KeyOn[ch] = on ? 1 : 0;
          }
        }
      }
      continue;
    }
    if (cmd === 84) {
      if (pos + 1 >= buf.length) break;
      const reg = buf[pos++];
      const val = buf[pos++];
      if (opts.opmChStart >= 0) {
        if (reg >= 40 && reg <= 47) {
          const ch = reg - 40;
          opmKeyCode[ch] = val;
        } else if (reg === 8) {
          const ch = val & 7;
          const on = (val & 120) !== 0;
          if (on !== (opmKeyOn[ch] !== 0)) {
            const note = opmKeyCodeToNote(opmKeyCode[ch]);
            const outCh = opts.opmChStart + ch;
            events.push({ tick, ch: outCh, note, on, instIdx: opts.opmInstIdx });
            opmKeyOn[ch] = on ? 1 : 0;
          }
        }
      }
      continue;
    }
    if (cmd >= 81 && cmd <= 95 || cmd >= 160 && cmd <= 191) {
      pos += 2;
      continue;
    }
    if (cmd === 103) {
      pos++;
      if (pos + 4 > buf.length) break;
      const len = buf[pos] | buf[pos + 1] << 8 | buf[pos + 2] << 16 | buf[pos + 3] << 24;
      pos += 4 + len;
      continue;
    }
    if (cmd >= 128 && cmd <= 143) {
      tick += cmd & 15;
      continue;
    }
    if (cmd >= 192 && cmd <= 223) {
      pos += 2;
      continue;
    }
  }
  return events;
}
const TICKS_PER_ROW = 735;
const MAX_ROWS = 256;
function eventsToPattern(events, numCh, numRows) {
  const pat = emptyPattern("p0", "Pattern 1", numCh, numRows);
  for (const ev of events) {
    const row = Math.min(Math.floor(ev.tick / TICKS_PER_ROW), numRows - 1);
    const ch = Math.min(ev.ch, numCh - 1);
    const cell = pat.channels[ch].rows[row];
    if (ev.on && cell.note === 0) {
      cell.note = ev.note;
      cell.instrument = ev.instIdx + 1;
    } else if (!ev.on && cell.note === 0) {
      cell.note = 97;
    }
  }
  return pat;
}
async function decompressGzip(buffer) {
  const ds = new DecompressionStream("gzip");
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();
  writer.write(new Uint8Array(buffer));
  writer.close();
  const chunks = [];
  let done = false;
  while (!done) {
    const { value, done: d } = await reader.read();
    if (value) chunks.push(value);
    done = d;
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out.buffer;
}
function isVGMFormat(buffer) {
  const b = new Uint8Array(buffer);
  return b.length >= 4 && b[0] === 86 && b[1] === 103 && b[2] === 109 && b[3] === 32;
}
async function parseVGMFile(buffer, filename) {
  const lowerName = filename.toLowerCase();
  let raw = buffer;
  const firstBytes = new Uint8Array(buffer);
  if (lowerName.endsWith(".vgz") || firstBytes[0] === 31 && firstBytes[1] === 139) {
    raw = await decompressGzip(buffer);
  }
  if (!isVGMFormat(raw)) throw new Error("Not a valid VGM file");
  const buf = new Uint8Array(raw);
  const dv = new DataView(raw);
  const version = dv.getUint32(8, true);
  const gd3RelOff = dv.getUint32(20, true);
  const gd3AbsOff = gd3RelOff > 0 ? 20 + gd3RelOff : 0;
  const snClock = dv.byteLength > 16 ? dv.getUint32(12, true) & 1073741823 : 0;
  let dataStart;
  if (version >= 336 && buf.length > 56) {
    const relOff = dv.getUint32(52, true);
    dataStart = relOff > 0 ? 52 + relOff : 64;
  } else {
    dataStart = 64;
  }
  const gd3 = gd3AbsOff > 0 && gd3AbsOff < buf.length ? parseGd3(buf, gd3AbsOff) : { trackName: "", gameName: "", author: "" };
  const chips = detectChips(dv, version);
  const layout = buildInstruments(chips);
  const {
    instruments,
    opn2ChStart,
    opmChStart,
    snChStart,
    opn2InstIdx,
    opmInstIdx,
    snInstIdx,
    totalChannels
  } = layout;
  const numCh = totalChannels;
  const opts = {
    snClock,
    snChStart,
    snInstIdx,
    opmChStart,
    opmInstIdx,
    opn2ChStart,
    opn2InstIdx
  };
  const events = walkCommands(buf, dataStart, chips, opts);
  const maxTick = events.length > 0 ? Math.max(...events.map((e) => e.tick)) : 0;
  const numRows = Math.min(MAX_ROWS, Math.max(64, Math.ceil(maxTick / TICKS_PER_ROW) + 1));
  const pattern = eventsToPattern(events, numCh, numRows);
  const title = gd3.trackName || gd3.gameName || filename.replace(/\.(vgm|vgz)$/i, "");
  return {
    name: title + (gd3.author ? ` — ${gd3.author}` : ""),
    format: "VGM",
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: numCh,
    initialSpeed: 6,
    initialBPM: 125
  };
}
export {
  isVGMFormat,
  parseVGMFile
};
