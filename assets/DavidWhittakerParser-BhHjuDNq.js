import { b$ as registerPatternEncoder, dv as DEFAULT_DAVID_WHITTAKER } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const MOD_PERIODS = [
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
function xmNoteToPeriod(xmNote) {
  if (xmNote === 0) return 0;
  const periodIdx = xmNote - 37;
  if (periodIdx < 0 || periodIdx >= MOD_PERIODS.length) return 0;
  return MOD_PERIODS[periodIdx];
}
function encodeDavidWhittakerCell(cell) {
  const out = new Uint8Array(4);
  const period = xmNoteToPeriod(cell.note ?? 0);
  const instr = cell.instrument ?? 0;
  const effTyp = cell.effTyp ?? 0;
  const eff = cell.eff ?? 0;
  out[0] = instr & 240 | period >> 8 & 15;
  out[1] = period & 255;
  out[2] = (instr & 15) << 4 | effTyp & 15;
  out[3] = eff & 255;
  return out;
}
registerPatternEncoder("davidWhittaker", () => encodeDavidWhittakerCell);
function u8(buf, off) {
  if (off < 0 || off >= buf.length) return 0;
  return buf[off] & 255;
}
function s8(buf, off) {
  const v = u8(buf, off);
  return v < 128 ? v : v - 256;
}
function u16BE(buf, off) {
  if (off + 1 >= buf.length) return 0;
  return (buf[off] & 255) << 8 | buf[off + 1] & 255;
}
function s16BE(buf, off) {
  const v = u16BE(buf, off);
  return v < 32768 ? v : v - 65536;
}
function u32BE(buf, off) {
  if (off + 3 >= buf.length) return 0;
  return (buf[off] & 255) * 16777216 + ((buf[off + 1] & 255) << 16) + ((buf[off + 2] & 255) << 8) + (buf[off + 3] & 255);
}
function amigaIndexToTrackerNote(idx) {
  const n = idx + 25;
  return n >= 1 && n <= 96 ? n : 0;
}
function isDavidWhittakerFormat(buffer) {
  if (buffer.byteLength < 64) return false;
  const buf = new Uint8Array(buffer);
  const scanEnd = Math.min(buf.length - 4, 2048);
  for (let i = 0; i < scanEnd; i += 2) {
    const opcode = u16BE(buf, i);
    if (opcode === 18426) {
      return true;
    }
    if (i === 0 && opcode === 18663) {
      if (u16BE(buf, 4) === 24832) return true;
    }
  }
  return false;
}
function extractSequence(buf, offset, maxLen = 64) {
  const seq = [];
  let pos = offset;
  while (pos < buf.length && seq.length < maxLen) {
    const v = s8(buf, pos);
    seq.push(v);
    pos++;
    if (v === -128) {
      if (pos < buf.length) {
        seq.push(u8(buf, pos) & 127);
        pos++;
      }
      break;
    }
  }
  return seq;
}
function scanDWStructures(buf) {
  let base = 0;
  let variant = 0;
  let songsHeaders = 0;
  let size = 10;
  let periodTableOffset = 0;
  let frqseqsOffset = 0;
  let volseqsOffset = 0;
  let readLen = 2;
  let flag = false;
  let channels = 4;
  let pos = 0;
  if (u16BE(buf, 0) === 18663) {
    if (u16BE(buf, 4) === 24832) {
      const offset = u16BE(buf, 6);
      pos = 4 + 2 + offset;
      variant = 30;
    }
  }
  let safeLimit = 0;
  while (pos < buf.length - 20 && safeLimit++ < 4096) {
    const val = u16BE(buf, pos);
    pos += 2;
    if (val === 20085) break;
    switch (val) {
      case 18426: {
        const disp = s16BE(buf, pos);
        base = pos + disp;
        pos += 2;
        break;
      }
      case 24832: {
        pos += 2;
        if (u16BE(buf, pos - 4) === 24832) pos += 2;
        break;
      }
      case 49404: {
        size = u16BE(buf, pos);
        pos += 2;
        if (size === 18) {
          readLen = 4;
        } else {
          variant = 10;
        }
        if (u16BE(buf, pos) === 16890) {
          pos += 2;
          songsHeaders = pos + s16BE(buf, pos);
          pos += 2;
        }
        if (pos < buf.length && u16BE(buf, pos) === 4656) flag = true;
        break;
      }
      case 4656: {
        flag = true;
        pos -= 6;
        if (u16BE(buf, pos) === 16890) {
          pos += 2;
          songsHeaders = pos + s16BE(buf, pos);
          pos += 2;
        }
        pos += 4;
        break;
      }
      case 48764: {
        channels = u16BE(buf, pos);
        pos += 4;
        break;
      }
    }
    if (pos > buf.length - 4) break;
  }
  if (!base && !songsHeaders) return null;
  const songs = [];
  if (songsHeaders > 0 && songsHeaders < buf.length - 4) {
    let lower = 2147483647;
    let spos = songsHeaders;
    let songLimit = 0;
    while (spos < buf.length - 4 && songLimit++ < 64) {
      const song = { speed: 0, delay: 0, tracks: [] };
      if (flag) {
        song.speed = u8(buf, spos);
        spos++;
        song.delay = u8(buf, spos);
        spos++;
      } else {
        song.speed = u16BE(buf, spos);
        spos += 2;
      }
      if (song.speed > 255 || song.speed === 0) break;
      for (let ch = 0; ch < channels; ch++) {
        let trackPtr;
        if (readLen === 4) {
          trackPtr = base + u32BE(buf, spos);
          spos += 4;
        } else {
          trackPtr = base + u16BE(buf, spos);
          spos += 2;
        }
        if (trackPtr < lower) lower = trackPtr;
        song.tracks.push(trackPtr);
      }
      songs.push(song);
      if (lower - spos < size) break;
    }
  }
  let sampleInfoBase = songsHeaders;
  let sampleInfoSize = size;
  const samples = [];
  if (pos < buf.length - 20) {
    let sampleHeaders = 0;
    let sampleTotal = 0;
    let sampleSize = 0;
    let spos = pos;
    let limit2 = 0;
    while (spos < buf.length - 20 && limit2++ < 4096) {
      const val2 = u16BE(buf, spos);
      spos += 2;
      if (val2 === 20085) break;
      if (val2 === 19450 && !sampleHeaders) {
        const infoOff = spos + s16BE(buf, spos);
        spos += 2;
        spos++;
        sampleTotal = u8(buf, spos);
        spos++;
        const prevPos = spos;
        spos -= 10;
        const prev = u16BE(buf, spos);
        if (prev === 16890 || prev === 8314) {
          spos += 2;
          sampleHeaders = spos + u16BE(buf, spos);
        } else if (prev === 53500) {
          sampleHeaders = 64 + u16BE(buf, spos + 2);
          spos -= 18;
          sampleHeaders += spos + u16BE(buf, spos);
        }
        spos = prevPos;
        sampleInfoBase = infoOff;
      }
      if (val2 === 33987 && !sampleSize) {
        spos += 4;
        const sz = u16BE(buf, spos);
        if (sz === 56060) {
          sampleSize = u16BE(buf, spos + 2);
        } else if (sz === 56316) {
          sampleSize = u32BE(buf, spos + 2);
        }
        if (sampleSize === 12 && variant < 30) variant = 20;
        if (sampleHeaders && sampleTotal > 0) {
          sampleInfoBase = sampleHeaders;
          sampleInfoSize = sampleSize || size;
          let sh = sampleHeaders;
          for (let i = 0; i <= sampleTotal && sh + 6 < buf.length; i++) {
            const length = u32BE(buf, sh);
            if (length === 0 || length > 1048576) break;
            const tuningVal = u16BE(buf, sh + 4);
            if (tuningVal === 0) break;
            const relative = Math.floor(3579545 / tuningVal);
            samples.push({
              length,
              tuning: tuningVal,
              relative,
              volume: 64,
              loopPtr: 0,
              finetune: 0,
              volseqOffset: 0
            });
            sh += 6 + length;
          }
        }
        break;
      }
    }
  }
  if (samples.length === 0 && songsHeaders > 0) {
    let spos = songsHeaders;
    for (let i = 0; i < 64 && spos + 6 < buf.length; i++) {
      const length = u32BE(buf, spos);
      if (length === 0 || length > 1048576) break;
      const tuningVal = u16BE(buf, spos + 4);
      if (tuningVal === 0) break;
      const relative = Math.floor(3579545 / tuningVal);
      samples.push({
        length,
        tuning: tuningVal,
        relative,
        volume: 64,
        loopPtr: 0,
        finetune: 0,
        volseqOffset: 0
      });
      spos += size;
    }
  }
  pos = 0;
  let com2 = 176;
  let com3 = 160;
  let com4 = 144;
  safeLimit = 0;
  while (pos < buf.length - 4 && safeLimit++ < 8192) {
    const val = u16BE(buf, pos);
    pos += 2;
    switch (val) {
      case 12845: {
        const wval = u16BE(buf, pos);
        pos += 2;
        if (wval === 10 || wval === 12) {
          pos -= 8;
          if (u16BE(buf, pos) === 17914) {
            pos += 2;
            periodTableOffset = pos + s16BE(buf, pos);
            pos += 2;
          } else {
            pos += 6;
          }
        }
        break;
      }
      case 1024:
      // subi.b #x,d0
      case 1088:
      // subi.w #x,d0
      case 1536: {
        const wval = u16BE(buf, pos);
        pos += 2;
        if (wval === 192 || wval === 64) {
          com2 = 192;
          com3 = 176;
          com4 = 160;
        } else if (wval === com3) {
          pos += 2;
          if (u16BE(buf, pos) === 17914) {
            pos += 2;
            volseqsOffset = pos + s16BE(buf, pos);
            pos += 2;
          }
        } else if (wval === com4) {
          pos += 2;
          if (u16BE(buf, pos) === 17914) {
            pos += 2;
            frqseqsOffset = pos + s16BE(buf, pos);
            pos += 2;
          }
        }
        break;
      }
    }
  }
  const signedCom2 = com2 - 256;
  const signedCom3 = com3 - 256;
  const signedCom4 = com4 - 256;
  return {
    base,
    variant,
    periodTableOffset,
    frqseqsOffset,
    volseqsOffset,
    samples,
    sampleInfoBase,
    sampleInfoSize,
    songs,
    channels,
    readLen,
    flag,
    com2: signedCom2,
    com3: signedCom3,
    com4: signedCom4
  };
}
const MAX_PATTERN_EVENTS = 16384;
function parseDWChannelStream(buf, scan, song, channelIdx) {
  const events = [];
  const trackPtr = song.tracks[channelIdx];
  if (!trackPtr || trackPtr >= buf.length) return events;
  let globalSpeed = song.speed;
  let speed = globalSpeed;
  let currentSample = 1;
  let tick = 0;
  let trackPos = scan.readLen;
  let patternPos;
  if (scan.readLen === 4) {
    patternPos = u32BE(buf, trackPtr);
  } else {
    patternPos = scan.base + u16BE(buf, trackPtr);
  }
  if (patternPos < 0 || patternPos >= buf.length) return events;
  let safety = 0;
  while (safety++ < MAX_PATTERN_EVENTS) {
    if (patternPos < 0 || patternPos >= buf.length) break;
    const value = s8(buf, patternPos);
    patternPos++;
    if (value >= 0) {
      const trackerNote = amigaIndexToTrackerNote(value);
      events.push({
        tick,
        note: trackerNote || 49,
        // fallback to C-4
        instrument: currentSample,
        effTyp: 0,
        eff: 0
      });
      tick += speed;
    } else if (value >= -32) {
      speed = globalSpeed * (value + 33);
      if (speed <= 0) speed = globalSpeed;
    } else if (value >= scan.com2) {
      currentSample = value - scan.com2 + 1;
    } else if (value >= scan.com3) ;
    else if (value >= scan.com4) ;
    else {
      switch (value) {
        case -128: {
          if (trackPtr + trackPos >= buf.length) {
            safety = MAX_PATTERN_EVENTS;
            break;
          }
          let nextAddr;
          if (scan.readLen === 4) {
            nextAddr = u32BE(buf, trackPtr + trackPos);
          } else {
            nextAddr = u16BE(buf, trackPtr + trackPos);
          }
          if (!nextAddr) {
            safety = MAX_PATTERN_EVENTS;
            break;
          }
          if (scan.readLen === 4) {
            patternPos = nextAddr;
          } else {
            patternPos = scan.base + nextAddr;
          }
          trackPos += scan.readLen;
          break;
        }
        case -127:
          patternPos += 2;
          break;
        case -126:
          events.push({
            tick,
            note: 97,
            // XM note-off
            instrument: 0,
            effTyp: 0,
            eff: 0
          });
          tick += speed;
          break;
        case -125:
          break;
        case -124:
          safety = MAX_PATTERN_EVENTS;
          break;
        case -123:
          patternPos++;
          break;
        case -122:
          patternPos += 2;
          break;
        case -121:
          break;
        case -120:
          if (scan.variant >= 10 && scan.variant !== 21) patternPos++;
          break;
        case -119:
          if (scan.variant !== 21) patternPos += 2;
          break;
        case -118:
          if (scan.variant !== 31) {
            globalSpeed = u8(buf, patternPos);
            speed = globalSpeed;
          }
          patternPos++;
          break;
        case -117:
          patternPos++;
          break;
        case -116:
          patternPos++;
          break;
        default:
          safety = MAX_PATTERN_EVENTS;
          break;
      }
    }
  }
  return events;
}
function buildDWPatterns(channelEvents, numChannels) {
  const ROWS_PER_PATTERN = 64;
  const patterns = [];
  let maxTick = 0;
  for (const events of channelEvents) {
    for (const ev of events) {
      if (ev.tick > maxTick) maxTick = ev.tick;
    }
  }
  const totalRows = maxTick + 1;
  const numPatterns = Math.max(1, Math.ceil(totalRows / ROWS_PER_PATTERN));
  const patternLimit = Math.min(numPatterns, 256);
  for (let p = 0; p < patternLimit; p++) {
    const startTick = p * ROWS_PER_PATTERN;
    const channels = [];
    for (let ch = 0; ch < numChannels; ch++) {
      const rows = [];
      const events = channelEvents[ch] || [];
      for (let r = 0; r < ROWS_PER_PATTERN; r++) {
        const targetTick = startTick + r;
        const ev = events.find((e) => e.tick === targetTick);
        rows.push({
          note: (ev == null ? void 0 : ev.note) ?? 0,
          instrument: (ev == null ? void 0 : ev.instrument) ?? 0,
          volume: 0,
          effTyp: (ev == null ? void 0 : ev.effTyp) ?? 0,
          eff: (ev == null ? void 0 : ev.eff) ?? 0,
          effTyp2: 0,
          eff2: 0
        });
      }
      channels.push({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: ch === 0 || ch === 3 ? -50 : 50,
        instrumentId: null,
        color: null,
        rows
      });
    }
    patterns.push({
      id: `pattern-${p}`,
      name: `Pattern ${p}`,
      length: ROWS_PER_PATTERN,
      channels
    });
  }
  return patterns;
}
function parseDavidWhittakerFile(buffer, filename, moduleBase = 0) {
  const buf = new Uint8Array(buffer);
  const baseName = filename.replace(/\.[^.]+$/, "");
  let scanResult = null;
  try {
    scanResult = scanDWStructures(buf);
  } catch {
  }
  const instruments = [];
  if (scanResult && scanResult.samples.length > 0) {
    for (let i = 0; i < scanResult.samples.length; i++) {
      const sample = scanResult.samples[i];
      const volseq = [sample.volume & 63, -128, 0];
      const frqseq = [-128, 0];
      if (scanResult.frqseqsOffset > 0 && scanResult.frqseqsOffset < buf.length) {
        const seqPtr = scanResult.base + u16BE(buf, scanResult.frqseqsOffset + i * 2);
        if (seqPtr > 0 && seqPtr < buf.length) {
          const extracted = extractSequence(buf, seqPtr, 64);
          if (extracted.length > 0) {
            frqseq.splice(0, frqseq.length, ...extracted);
          }
        }
      }
      if (scanResult.volseqsOffset > 0 && scanResult.volseqsOffset < buf.length) {
        const seqPtr = scanResult.base + u16BE(buf, scanResult.volseqsOffset + i * 2);
        if (seqPtr > 0 && seqPtr < buf.length) {
          const extracted = extractSequence(buf, seqPtr, 64);
          if (extracted.length > 0) {
            volseq.splice(0, volseq.length, ...extracted);
          }
        }
      }
      const dwConfig = {
        defaultVolume: Math.min(64, sample.volume),
        relative: sample.relative > 0 ? sample.relative : 8364,
        vibratoSpeed: 0,
        vibratoDepth: 0,
        volseq,
        frqseq
      };
      const instrFileOffset = scanResult.sampleInfoBase + i * scanResult.sampleInfoSize;
      const chipRam = {
        moduleBase,
        moduleSize: buffer.byteLength,
        instrBase: moduleBase + instrFileOffset,
        instrSize: scanResult.sampleInfoSize,
        sections: {
          sampleInfoBase: moduleBase + scanResult.sampleInfoBase,
          base: moduleBase + scanResult.base,
          frqseqs: scanResult.frqseqsOffset > 0 ? moduleBase + scanResult.frqseqsOffset : 0,
          volseqs: scanResult.volseqsOffset > 0 ? moduleBase + scanResult.volseqsOffset : 0
        }
      };
      instruments.push({
        id: i + 1,
        name: `DW Inst ${i + 1}`,
        type: "synth",
        synthType: "DavidWhittakerSynth",
        davidWhittaker: dwConfig,
        uadeChipRam: chipRam,
        effects: [],
        volume: 0,
        pan: 0
      });
    }
  }
  if (instruments.length === 0) {
    instruments.push({
      id: 1,
      name: "DW Instrument",
      type: "synth",
      synthType: "DavidWhittakerSynth",
      davidWhittaker: { ...DEFAULT_DAVID_WHITTAKER },
      effects: [],
      volume: 0,
      pan: 0
    });
  }
  const CHANNELS = (scanResult == null ? void 0 : scanResult.channels) || 4;
  const ROWS = 64;
  let patterns = [];
  let songPositions = [0];
  let initialSpeed = 6;
  if (scanResult && scanResult.songs.length > 0) {
    const song = scanResult.songs[0];
    initialSpeed = song.speed || 6;
    const channelEvents = [];
    for (let ch = 0; ch < CHANNELS; ch++) {
      if (ch < song.tracks.length) {
        channelEvents.push(parseDWChannelStream(buf, scanResult, song, ch));
      } else {
        channelEvents.push([]);
      }
    }
    let totalNotes = 0;
    for (const events of channelEvents) {
      totalNotes += events.filter((e) => e.note > 0 && e.note < 97).length;
    }
    if (totalNotes > 0) {
      patterns = buildDWPatterns(channelEvents, CHANNELS);
      songPositions = patterns.map((_, i) => i);
    }
  }
  if (patterns.length === 0) {
    const channelData = [];
    for (let ch = 0; ch < CHANNELS; ch++) {
      const rows = [];
      for (let r = 0; r < ROWS; r++) {
        if (r === 0 && ch < instruments.length) {
          rows.push({
            note: 49,
            instrument: ch + 1,
            volume: 0,
            effTyp: 0,
            eff: 0,
            effTyp2: 0,
            eff2: 0
          });
        } else {
          rows.push({
            note: 0,
            instrument: 0,
            volume: 0,
            effTyp: 0,
            eff: 0,
            effTyp2: 0,
            eff2: 0
          });
        }
      }
      channelData.push({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: 0,
        instrumentId: null,
        color: null,
        rows
      });
    }
    patterns = [{
      id: "pattern-0",
      name: "Pattern 1",
      length: ROWS,
      channels: channelData
    }];
    songPositions = [0];
  }
  const uadePatternLayout = {
    formatId: "davidWhittaker",
    patternDataFileOffset: 0,
    bytesPerCell: 4,
    rowsPerPattern: ROWS,
    numChannels: CHANNELS,
    numPatterns: patterns.length,
    moduleSize: buffer.byteLength,
    encodeCell: encodeDavidWhittakerCell,
    getCellFileOffset: (pat, row, channel) => {
      const patternByteSize = ROWS * CHANNELS * 4;
      return pat * patternByteSize + row * CHANNELS * 4 + channel * 4;
    }
  };
  const extractInfo = patterns.length > 1 ? ` (${patterns.length} patterns extracted)` : "";
  return {
    name: `${baseName}${extractInfo}`,
    format: "XM",
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: CHANNELS,
    initialSpeed,
    initialBPM: 125,
    uadePatternLayout
  };
}
export {
  isDavidWhittakerFormat,
  parseDavidWhittakerFile
};
