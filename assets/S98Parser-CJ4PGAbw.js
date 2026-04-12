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
function freqToMidi(freq) {
  if (freq <= 0) return 0;
  const note = Math.round(12 * Math.log2(freq / 440) + 69);
  return Math.max(1, Math.min(96, note));
}
function opnFnumToNote(fnum, block, clock) {
  const freq = fnum * clock / (144 * (1 << 21 - block));
  return freqToMidi(freq);
}
function ayPeriodToNote(period, clock) {
  if (period <= 0) return 0;
  return freqToMidi(clock / (16 * period));
}
function sn76489CounterToNote(counter, clock) {
  if (counter <= 0) return 0;
  return freqToMidi(clock / (32 * counter));
}
function oplFnumToNote(fnum, block, clock) {
  const freq = fnum * clock / (72 * (1 << 20 - block));
  return freqToMidi(freq);
}
const KC_TO_SEMITONE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0];
function opmKeyCodeToNote(kc) {
  const octave = kc >> 4 & 7;
  const kcNote = Math.min(kc & 15, 11);
  const semi = KC_TO_SEMITONE[kcNote];
  return Math.max(1, Math.min(96, octave * 12 + semi + 12));
}
const S98_DEVICE_NONE = 0;
const S98_DEVICE_YM2149 = 1;
const S98_DEVICE_YM2203 = 2;
const S98_DEVICE_YM2612 = 3;
const S98_DEVICE_YM2608 = 4;
const S98_DEVICE_YM2151 = 5;
const S98_DEVICE_YM2413 = 6;
const S98_DEVICE_YM3526 = 7;
const S98_DEVICE_YM3812 = 8;
const S98_DEVICE_YMF262 = 9;
const S98_DEVICE_AY8910 = 15;
const S98_DEVICE_SN76489 = 16;
function parseS98Header(buf) {
  if (buf.length < 32) throw new Error("File too small for S98 header");
  const magic = String.fromCharCode(buf[0], buf[1], buf[2]);
  if (magic !== "S98") throw new Error("Not a valid S98 file");
  const versionChar = String.fromCharCode(buf[3]);
  const version = parseInt(versionChar, 10) || 0;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let timerNum = dv.getUint32(4, true);
  let timerDen = dv.getUint32(8, true);
  if (timerNum === 0) timerNum = 10;
  if (timerDen === 0) timerDen = 1e3;
  const tickInterval = timerNum / timerDen;
  const tagOffset = dv.getUint32(16, true);
  let dataOffset = dv.getUint32(20, true);
  const loopOffset = dv.getUint32(24, true);
  const devices = [];
  if (version >= 3) {
    let off = 28;
    while (off + 16 <= buf.length) {
      const devType = dv.getUint32(off, true);
      if (devType === S98_DEVICE_NONE) break;
      const clock = dv.getUint32(off + 4, true);
      const pan = dv.getUint32(off + 8, true);
      devices.push({ type: devType, clock, pan });
      off += 16;
    }
  } else if (version === 2) {
    const deviceCount = dv.getUint32(28, true);
    let off = 32;
    for (let i = 0; i < deviceCount && off + 16 <= buf.length; i++) {
      const devType = dv.getUint32(off, true);
      const clock = dv.getUint32(off + 4, true);
      const pan = dv.getUint32(off + 8, true);
      devices.push({ type: devType, clock, pan });
      off += 16;
    }
  }
  if (devices.length === 0) {
    devices.push({ type: S98_DEVICE_YM2149, clock: 4e6, pan: 0 });
  }
  if (dataOffset === 0) {
    if (version >= 3) {
      dataOffset = 28 + (devices.length + 1) * 16;
    } else if (version === 2) {
      dataOffset = 32 + devices.length * 16;
    } else {
      dataOffset = 32;
    }
  }
  return {
    version,
    timerNumerator: timerNum,
    timerDenominator: timerDen,
    tagOffset,
    dataOffset,
    loopOffset,
    devices,
    tickInterval
  };
}
function parseTags(buf, tagOffset) {
  const tags = { title: "", artist: "", game: "", year: "", comment: "" };
  if (tagOffset === 0 || tagOffset >= buf.length) return tags;
  let off = tagOffset;
  const marker = String.fromCharCode(buf[off], buf[off + 1], buf[off + 2], buf[off + 3], buf[off + 4]);
  if (marker !== "[S98]") return tags;
  off += 5;
  if (off < buf.length && buf[off] === 10) off++;
  else if (off + 1 < buf.length && buf[off] === 13 && buf[off + 1] === 10) off += 2;
  const remaining = buf.slice(off);
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: false }).decode(remaining);
  } catch {
    text = new TextDecoder("iso-8859-1").decode(remaining);
  }
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim().toLowerCase();
    const val = line.slice(eq + 1).trim();
    if (!val) continue;
    switch (key) {
      case "title":
        tags.title = val;
        break;
      case "artist":
        tags.artist = val;
        break;
      case "game":
        tags.game = val;
        break;
      case "year":
        tags.year = val;
        break;
      case "comment":
        tags.comment = val;
        break;
    }
  }
  return tags;
}
function deviceChannelCount(type) {
  switch (type) {
    case S98_DEVICE_YM2149:
      return 3;
    // 3 SSG
    case S98_DEVICE_YM2203:
      return 6;
    // 3 FM + 3 SSG
    case S98_DEVICE_YM2612:
      return 6;
    // 6 FM
    case S98_DEVICE_YM2608:
      return 11;
    // 6 FM + 3 SSG + rhythm + ADPCM
    case S98_DEVICE_YM2151:
      return 8;
    // 8 FM
    case S98_DEVICE_YM2413:
      return 9;
    // 9 FM (or 6 FM + 5 rhythm)
    case S98_DEVICE_YM3526:
      return 9;
    // 9 FM
    case S98_DEVICE_YM3812:
      return 9;
    // 9 FM
    case S98_DEVICE_YMF262:
      return 18;
    // 18 FM
    case S98_DEVICE_AY8910:
      return 3;
    // 3 SSG
    case S98_DEVICE_SN76489:
      return 4;
    // 3 tone + 1 noise
    default:
      return 3;
  }
}
function deviceName(type) {
  switch (type) {
    case S98_DEVICE_YM2149:
      return "YM2149 SSG";
    case S98_DEVICE_YM2203:
      return "YM2203 OPN";
    case S98_DEVICE_YM2612:
      return "YM2612 OPN2";
    case S98_DEVICE_YM2608:
      return "YM2608 OPNA";
    case S98_DEVICE_YM2151:
      return "YM2151 OPM";
    case S98_DEVICE_YM2413:
      return "YM2413 OPLL";
    case S98_DEVICE_YM3526:
      return "YM3526 OPL";
    case S98_DEVICE_YM3812:
      return "YM3812 OPL2";
    case S98_DEVICE_YMF262:
      return "YMF262 OPL3";
    case S98_DEVICE_AY8910:
      return "AY-3-8910";
    case S98_DEVICE_SN76489:
      return "SN76489";
    default:
      return `Device ${type}`;
  }
}
function deviceSynthType(type) {
  switch (type) {
    case S98_DEVICE_YM2149:
      return "FurnaceAY";
    case S98_DEVICE_YM2203:
      return "FurnaceOPN2203";
    case S98_DEVICE_YM2612:
      return "FurnaceOPN";
    case S98_DEVICE_YM2608:
      return "FurnaceOPNA";
    case S98_DEVICE_YM2151:
      return "FurnaceOPM";
    case S98_DEVICE_YM2413:
      return "FurnaceOPLL";
    case S98_DEVICE_YM3526:
      return "FurnaceOPL";
    case S98_DEVICE_YM3812:
      return "FurnaceOPL";
    case S98_DEVICE_YMF262:
      return "FurnaceOPL";
    case S98_DEVICE_AY8910:
      return "FurnaceAY";
    case S98_DEVICE_SN76489:
      return "FurnacePSG";
    default:
      return "FurnaceAY";
  }
}
function deviceChipType(type) {
  switch (type) {
    case S98_DEVICE_YM2149:
      return 6;
    case S98_DEVICE_YM2203:
      return 1;
    case S98_DEVICE_YM2612:
      return 1;
    case S98_DEVICE_YM2608:
      return 1;
    case S98_DEVICE_YM2151:
      return 33;
    case S98_DEVICE_YM2413:
      return 13;
    case S98_DEVICE_YM3526:
      return 14;
    case S98_DEVICE_YM3812:
      return 14;
    case S98_DEVICE_YMF262:
      return 14;
    case S98_DEVICE_AY8910:
      return 6;
    case S98_DEVICE_SN76489:
      return 0;
    default:
      return 6;
  }
}
function deviceOps(type) {
  switch (type) {
    case S98_DEVICE_YM2149:
    case S98_DEVICE_AY8910:
    case S98_DEVICE_SN76489:
      return 2;
    case S98_DEVICE_YM2413:
    case S98_DEVICE_YM3526:
    case S98_DEVICE_YM3812:
    case S98_DEVICE_YMF262:
      return 2;
    default:
      return 4;
  }
}
function buildInstruments(devices) {
  const instruments = [];
  const deviceLayouts = [];
  let nextId = 1;
  let nextCh = 0;
  for (let i = 0; i < devices.length; i++) {
    const dev = devices[i];
    const instIdx = instruments.length;
    const chCount = deviceChannelCount(dev.type);
    instruments.push({
      id: nextId++,
      name: deviceName(dev.type),
      type: "synth",
      synthType: deviceSynthType(dev.type),
      furnace: { ...DEFAULT_FURNACE, chipType: deviceChipType(dev.type), ops: deviceOps(dev.type) },
      effects: [],
      volume: 0,
      pan: 0
    });
    deviceLayouts.push({
      instIdx,
      chStart: nextCh,
      numChannels: chCount,
      type: dev.type,
      clock: dev.clock
    });
    nextCh += chCount;
  }
  if (instruments.length === 0) {
    instruments.push({
      id: 1,
      name: "SSG",
      type: "synth",
      synthType: "FurnaceAY",
      furnace: { ...DEFAULT_FURNACE, chipType: 6, ops: 2 },
      effects: [],
      volume: 0,
      pan: 0
    });
    deviceLayouts.push({ instIdx: 0, chStart: 0, numChannels: 3, type: S98_DEVICE_YM2149, clock: 4e6 });
    nextCh = 3;
  }
  return { instruments, deviceLayouts, totalChannels: Math.max(nextCh, 1) };
}
function walkCommands(buf, dataOffset, loopOffset, layouts, _tickInterval) {
  const events = [];
  let pos = dataOffset;
  let tick = 0;
  const opnStates = layouts.map((l) => {
    if (l.type === S98_DEVICE_YM2203 || l.type === S98_DEVICE_YM2608 || l.type === S98_DEVICE_YM2612) {
      const fmChs = l.type === S98_DEVICE_YM2612 ? 6 : l.type === S98_DEVICE_YM2608 ? 6 : 3;
      return {
        fnumLo: new Uint8Array(fmChs),
        fnumHi: new Uint8Array(fmChs),
        keyOn: new Uint8Array(fmChs),
        ssgPeriodLo: new Uint8Array(3),
        ssgPeriodHi: new Uint8Array(3),
        ssgPlaying: new Uint8Array(3)
      };
    }
    return null;
  });
  const opmStates = layouts.map(
    (l) => l.type === S98_DEVICE_YM2151 ? { keyCode: new Uint8Array(8), keyOn: new Uint8Array(8) } : null
  );
  const ayStates = layouts.map(
    (l) => l.type === S98_DEVICE_YM2149 || l.type === S98_DEVICE_AY8910 ? { periodLo: new Uint8Array(3), periodHi: new Uint8Array(3), playing: new Uint8Array(3) } : null
  );
  const oplStates = layouts.map((l) => {
    if (l.type === S98_DEVICE_YM2413 || l.type === S98_DEVICE_YM3526 || l.type === S98_DEVICE_YM3812 || l.type === S98_DEVICE_YMF262) {
      const chs = l.type === S98_DEVICE_YMF262 ? 18 : 9;
      return { fnumLo: new Uint8Array(chs), fnumHi: new Uint8Array(chs), keyOn: new Uint8Array(chs) };
    }
    return null;
  });
  const snStates = layouts.map(
    (l) => l.type === S98_DEVICE_SN76489 ? {
      counter: new Uint16Array(4),
      volume: new Uint8Array(4).fill(15),
      playing: new Uint8Array(4),
      latchCh: 0,
      latchTyp: 0
    } : null
  );
  const maxIterations = Math.min(buf.length * 2, 5e5);
  let iterations = 0;
  let looped = false;
  while (pos < buf.length && iterations++ < maxIterations) {
    const cmd = buf[pos++];
    if (cmd === 255) {
      tick++;
      continue;
    }
    if (cmd === 254) {
      if (pos + 4 > buf.length) break;
      const n = buf[pos] | buf[pos + 1] << 8 | buf[pos + 2] << 16 | buf[pos + 3] << 24 >>> 0;
      pos += 4;
      tick += n + 2;
      continue;
    }
    if (cmd === 253) {
      if (loopOffset > 0 && !looped) {
        pos = loopOffset;
        looped = true;
        continue;
      }
      break;
    }
    if (cmd <= 127) {
      if (pos + 2 > buf.length) break;
      const reg = buf[pos++];
      const val = buf[pos++];
      const deviceIdx = cmd >> 1;
      const port = cmd & 1;
      if (deviceIdx >= layouts.length) continue;
      const layout = layouts[deviceIdx];
      if (layout.type === S98_DEVICE_YM2612) {
        const st = opnStates[deviceIdx];
        const portBase = port === 1 ? 3 : 0;
        if (reg >= 160 && reg <= 162) {
          st.fnumLo[portBase + (reg - 160)] = val;
        } else if (reg >= 164 && reg <= 166) {
          st.fnumHi[portBase + (reg - 164)] = val;
        } else if (reg === 40 && port === 0) {
          const rawCh = val & 7;
          const ch = rawCh < 4 ? rawCh : rawCh - 1;
          if (ch < 6) {
            const on = (val & 240) !== 0;
            if (on !== (st.keyOn[ch] !== 0)) {
              const fnum = st.fnumLo[ch] | (st.fnumHi[ch] & 7) << 8;
              const block = st.fnumHi[ch] >> 3 & 7;
              const note = opnFnumToNote(fnum, block, layout.clock);
              events.push({ tick, ch: layout.chStart + ch, note, on, instIdx: layout.instIdx });
              st.keyOn[ch] = on ? 1 : 0;
            }
          }
        }
        continue;
      }
      if (layout.type === S98_DEVICE_YM2203) {
        const st = opnStates[deviceIdx];
        if (reg >= 160 && reg <= 162) {
          st.fnumLo[reg - 160] = val;
        } else if (reg >= 164 && reg <= 166) {
          st.fnumHi[reg - 164] = val;
        } else if (reg === 40) {
          const ch = val & 3;
          if (ch < 3) {
            const on = (val & 240) !== 0;
            if (on !== (st.keyOn[ch] !== 0)) {
              const fnum = st.fnumLo[ch] | (st.fnumHi[ch] & 7) << 8;
              const block = st.fnumHi[ch] >> 3 & 7;
              const note = opnFnumToNote(fnum, block, layout.clock);
              events.push({ tick, ch: layout.chStart + ch, note, on, instIdx: layout.instIdx });
              st.keyOn[ch] = on ? 1 : 0;
            }
          }
        } else if (reg <= 13) {
          handleSSGWrite(reg, val, st, layout, deviceIdx, tick, events);
        }
        continue;
      }
      if (layout.type === S98_DEVICE_YM2608) {
        const st = opnStates[deviceIdx];
        if (port === 0) {
          if (reg >= 160 && reg <= 162) {
            st.fnumLo[reg - 160] = val;
          } else if (reg >= 164 && reg <= 166) {
            st.fnumHi[reg - 164] = val;
          } else if (reg === 40) {
            const rawCh = val & 7;
            const ch = rawCh < 4 ? rawCh : rawCh - 1;
            if (ch < 6) {
              const on = (val & 240) !== 0;
              if (on !== (st.keyOn[ch] !== 0)) {
                const fnum = st.fnumLo[ch] | (st.fnumHi[ch] & 7) << 8;
                const block = st.fnumHi[ch] >> 3 & 7;
                const note = opnFnumToNote(fnum, block, layout.clock);
                events.push({ tick, ch: layout.chStart + ch, note, on, instIdx: layout.instIdx });
                st.keyOn[ch] = on ? 1 : 0;
              }
            }
          } else if (reg <= 13) {
            handleSSGWrite(reg, val, st, layout, deviceIdx, tick, events);
          }
        } else {
          if (reg >= 160 && reg <= 162) {
            st.fnumLo[3 + (reg - 160)] = val;
          } else if (reg >= 164 && reg <= 166) {
            st.fnumHi[3 + (reg - 164)] = val;
          }
        }
        continue;
      }
      if (layout.type === S98_DEVICE_YM2151) {
        const st = opmStates[deviceIdx];
        if (reg >= 40 && reg <= 47) {
          st.keyCode[reg - 40] = val;
        } else if (reg === 8) {
          const ch = val & 7;
          const on = (val & 120) !== 0;
          if (on !== (st.keyOn[ch] !== 0)) {
            const note = opmKeyCodeToNote(st.keyCode[ch]);
            events.push({ tick, ch: layout.chStart + ch, note, on, instIdx: layout.instIdx });
            st.keyOn[ch] = on ? 1 : 0;
          }
        }
        continue;
      }
      if (layout.type === S98_DEVICE_YM2149 || layout.type === S98_DEVICE_AY8910) {
        const st = ayStates[deviceIdx];
        if (reg === 0 || reg === 2 || reg === 4) {
          const ch = reg >> 1;
          st.periodLo[ch] = val;
          const period = st.periodLo[ch] | (st.periodHi[ch] & 15) << 8;
          if (period > 0 && st.playing[ch]) {
            const note = ayPeriodToNote(period, layout.clock);
            if (note > 0) {
              events.push({ tick, ch: layout.chStart + ch, note: 97, on: false, instIdx: layout.instIdx });
              events.push({ tick, ch: layout.chStart + ch, note, on: true, instIdx: layout.instIdx });
            }
          }
        } else if (reg === 1 || reg === 3 || reg === 5) {
          const ch = reg - 1 >> 1;
          st.periodHi[ch] = val & 15;
        } else if (reg === 8 || reg === 9 || reg === 10) {
          const ch = reg - 8;
          const volume = val & 31;
          if (volume > 0 && !st.playing[ch]) {
            const period = st.periodLo[ch] | (st.periodHi[ch] & 15) << 8;
            if (period > 0) {
              const note = ayPeriodToNote(period, layout.clock);
              if (note > 0) {
                events.push({ tick, ch: layout.chStart + ch, note, on: true, instIdx: layout.instIdx });
                st.playing[ch] = 1;
              }
            }
          } else if (volume === 0 && st.playing[ch]) {
            events.push({ tick, ch: layout.chStart + ch, note: 97, on: false, instIdx: layout.instIdx });
            st.playing[ch] = 0;
          }
        }
        continue;
      }
      if (layout.type === S98_DEVICE_YM3526 || layout.type === S98_DEVICE_YM3812 || layout.type === S98_DEVICE_YM2413) {
        const st = oplStates[deviceIdx];
        if (reg >= 160 && reg <= 168) {
          const ch = reg - 160;
          st.fnumLo[ch] = val;
        } else if (reg >= 176 && reg <= 184) {
          const ch = reg - 176;
          st.fnumHi[ch] = val;
          const keyOn = (val & 32) !== 0;
          if (keyOn !== (st.keyOn[ch] !== 0)) {
            const fnum = st.fnumLo[ch] | (val & 3) << 8;
            const block = val >> 2 & 7;
            const note = oplFnumToNote(fnum, block, layout.clock);
            events.push({ tick, ch: layout.chStart + ch, note, on: keyOn, instIdx: layout.instIdx });
            st.keyOn[ch] = keyOn ? 1 : 0;
          }
        }
        if (layout.type === S98_DEVICE_YM2413) {
          if (reg >= 16 && reg <= 24) {
            const ch = reg - 16;
            st.fnumLo[ch] = val;
          } else if (reg >= 32 && reg <= 40) {
            const ch = reg - 32;
            st.fnumHi[ch] = val;
            const keyOn = (val & 16) !== 0;
            if (keyOn !== (st.keyOn[ch] !== 0)) {
              const fnum = st.fnumLo[ch] | (val & 1) << 8;
              const block = val >> 1 & 7;
              const note = oplFnumToNote(fnum, block, layout.clock);
              events.push({ tick, ch: layout.chStart + ch, note, on: keyOn, instIdx: layout.instIdx });
              st.keyOn[ch] = keyOn ? 1 : 0;
            }
          }
        }
        continue;
      }
      if (layout.type === S98_DEVICE_YMF262) {
        const st = oplStates[deviceIdx];
        const chOff = port === 1 ? 9 : 0;
        if (reg >= 160 && reg <= 168) {
          st.fnumLo[chOff + (reg - 160)] = val;
        } else if (reg >= 176 && reg <= 184) {
          const ch = chOff + (reg - 176);
          st.fnumHi[ch] = val;
          const keyOn = (val & 32) !== 0;
          if (keyOn !== (st.keyOn[ch] !== 0)) {
            const fnum = st.fnumLo[ch] | (val & 3) << 8;
            const block = val >> 2 & 7;
            const note = oplFnumToNote(fnum, block, layout.clock);
            events.push({ tick, ch: layout.chStart + ch, note, on: keyOn, instIdx: layout.instIdx });
            st.keyOn[ch] = keyOn ? 1 : 0;
          }
        }
        continue;
      }
      if (layout.type === S98_DEVICE_SN76489) {
        handleSN76489Write(reg, snStates[deviceIdx], layout, tick, events);
        continue;
      }
    }
  }
  return events;
}
function handleSSGWrite(reg, val, st, layout, _deviceIdx, tick, events) {
  const fmChs = layout.type === S98_DEVICE_YM2608 ? 6 : 3;
  const ssgChStart = layout.chStart + fmChs;
  if (reg === 0 || reg === 2 || reg === 4) {
    const ch = reg >> 1;
    st.ssgPeriodLo[ch] = val;
    const period = st.ssgPeriodLo[ch] | (st.ssgPeriodHi[ch] & 15) << 8;
    if (period > 0 && st.ssgPlaying[ch]) {
      const ssgClock = layout.clock / 4;
      const note = ayPeriodToNote(period, ssgClock);
      if (note > 0) {
        events.push({ tick, ch: ssgChStart + ch, note: 97, on: false, instIdx: layout.instIdx });
        events.push({ tick, ch: ssgChStart + ch, note, on: true, instIdx: layout.instIdx });
      }
    }
  } else if (reg === 1 || reg === 3 || reg === 5) {
    const ch = reg - 1 >> 1;
    st.ssgPeriodHi[ch] = val & 15;
  } else if (reg === 8 || reg === 9 || reg === 10) {
    const ch = reg - 8;
    const volume = val & 31;
    const ssgClock = layout.clock / 4;
    if (volume > 0 && !st.ssgPlaying[ch]) {
      const period = st.ssgPeriodLo[ch] | (st.ssgPeriodHi[ch] & 15) << 8;
      if (period > 0) {
        const note = ayPeriodToNote(period, ssgClock);
        if (note > 0) {
          events.push({ tick, ch: ssgChStart + ch, note, on: true, instIdx: layout.instIdx });
          st.ssgPlaying[ch] = 1;
        }
      }
    } else if (volume === 0 && st.ssgPlaying[ch]) {
      events.push({ tick, ch: ssgChStart + ch, note: 97, on: false, instIdx: layout.instIdx });
      st.ssgPlaying[ch] = 0;
    }
  }
}
function handleSN76489Write(data, st, layout, tick, events) {
  if (data & 128) {
    st.latchCh = data >> 5 & 3;
    st.latchTyp = data >> 4 & 1;
    const lo = data & 15;
    if (st.latchTyp === 1) {
      const prevVol = st.volume[st.latchCh];
      st.volume[st.latchCh] = lo;
      if (st.latchCh < 3) {
        const outCh = layout.chStart + st.latchCh;
        if (lo === 15 && st.playing[st.latchCh]) {
          events.push({ tick, ch: outCh, note: 97, on: false, instIdx: layout.instIdx });
          st.playing[st.latchCh] = 0;
        } else if (lo < 15 && prevVol === 15 && st.counter[st.latchCh] > 0) {
          const note = sn76489CounterToNote(st.counter[st.latchCh], layout.clock);
          if (note > 0) {
            events.push({ tick, ch: outCh, note, on: true, instIdx: layout.instIdx });
            st.playing[st.latchCh] = 1;
          }
        }
      }
    } else {
      st.counter[st.latchCh] = st.counter[st.latchCh] & 1008 | lo;
    }
  } else {
    if (st.latchTyp === 0 && st.latchCh < 3) {
      st.counter[st.latchCh] = (data & 63) << 4 | st.counter[st.latchCh] & 15;
      if (st.volume[st.latchCh] < 15 && st.counter[st.latchCh] > 0) {
        const outCh = layout.chStart + st.latchCh;
        const note = sn76489CounterToNote(st.counter[st.latchCh], layout.clock);
        if (note > 0) {
          if (st.playing[st.latchCh]) {
            events.push({ tick, ch: outCh, note: 97, on: false, instIdx: layout.instIdx });
          }
          events.push({ tick, ch: outCh, note, on: true, instIdx: layout.instIdx });
          st.playing[st.latchCh] = 1;
        }
      }
    }
  }
}
const ROWS_PER_PATTERN = 64;
function eventsToPatterns(events, numCh, tickInterval, loopOffset) {
  if (events.length === 0) {
    return { patterns: [emptyPattern("p0", "Pattern 0", numCh, ROWS_PER_PATTERN)], loopPatternIdx: -1 };
  }
  const rowDuration = 1 / 60;
  const ticksPerRow = Math.max(1, Math.round(rowDuration / tickInterval));
  let maxTick = 0;
  for (const e of events) {
    if (e.tick > maxTick) maxTick = e.tick;
  }
  const MAX_PATTERNS = 256;
  const totalRows = Math.max(ROWS_PER_PATTERN, Math.ceil(maxTick / ticksPerRow) + 1);
  const numPatterns = Math.min(MAX_PATTERNS, Math.ceil(totalRows / ROWS_PER_PATTERN));
  const patterns = [];
  for (let p = 0; p < numPatterns; p++) {
    patterns.push(emptyPattern(`p${p}`, `Pattern ${p}`, numCh, ROWS_PER_PATTERN));
  }
  for (const ev of events) {
    const absRow = Math.floor(ev.tick / ticksPerRow);
    const patIdx = Math.min(Math.floor(absRow / ROWS_PER_PATTERN), numPatterns - 1);
    const row = Math.min(absRow % ROWS_PER_PATTERN, ROWS_PER_PATTERN - 1);
    const ch = Math.min(ev.ch, numCh - 1);
    const cell = patterns[patIdx].channels[ch].rows[row];
    if (ev.on && cell.note === 0) {
      cell.note = ev.note;
      cell.instrument = ev.instIdx + 1;
    } else if (!ev.on && cell.note === 0) {
      cell.note = 97;
    }
  }
  const loopPatternIdx = loopOffset > 0 ? 0 : -1;
  return { patterns, loopPatternIdx };
}
function parseS98File(buffer) {
  const buf = new Uint8Array(buffer);
  const header = parseS98Header(buf);
  const tags = parseTags(buf, header.tagOffset);
  const layout = buildInstruments(header.devices);
  const { instruments, deviceLayouts, totalChannels } = layout;
  const events = walkCommands(buf, header.dataOffset, header.loopOffset, deviceLayouts);
  const { patterns, loopPatternIdx } = eventsToPatterns(events, totalChannels, header.tickInterval, header.loopOffset);
  const songPositions = patterns.map((_, i) => i);
  const title = tags.title || tags.game || "S98 File";
  return {
    name: title + (tags.artist ? ` — ${tags.artist}` : ""),
    format: "S98",
    patterns,
    instruments,
    songPositions,
    songLength: patterns.length,
    restartPosition: loopPatternIdx >= 0 ? loopPatternIdx : 0,
    numChannels: totalChannels,
    initialSpeed: 6,
    initialBPM: 125
  };
}
export {
  parseS98File
};
