import { c5 as registerVariableEncoder, bR as arrayBufferToBase64 } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function xmNoteToS2(xmNote) {
  if (xmNote <= 0 || xmNote > 96) return 0;
  const s2 = xmNote - 12;
  return s2 >= 1 && s2 <= 72 ? s2 : 0;
}
function xmEffectToS2(effTyp, eff) {
  switch (effTyp) {
    case 0:
      return eff !== 0 ? [112, eff] : null;
    // Arpeggio
    case 1:
      return [113, eff];
    // Porta up
    case 2:
      return [114, eff];
    // Porta down
    case 3:
      return null;
    // Tone porta — handled separately as note-slide
    case 10:
      if ((eff & 240) !== 0) return [115, eff >> 4 & 15];
      return [116, eff & 15];
    // Down
    case 12:
      return [124, Math.min(eff, 64)];
    // Set volume
    case 15:
      return [127, eff & 15];
    // Set speed
    default:
      return null;
  }
}
function s8(value) {
  return value < 0 ? value + 256 : value & 255;
}
const sidMon2Encoder = {
  formatId: "sidMon2",
  encodePattern(rows) {
    const buf = [];
    for (const cell of rows) {
      const note = xmNoteToS2(cell.note);
      const sample = cell.instrument;
      const s2eff = xmEffectToS2(cell.effTyp, cell.eff);
      const isSpeed = cell.effTyp === 15 && cell.eff > 0 && cell.eff < 32;
      const speed = isSpeed ? cell.eff : 0;
      if (note > 0) {
        buf.push(s8(note));
        if (speed > 0 && sample === 0 && !s2eff) {
          buf.push(s8(~speed));
        } else if (sample > 0) {
          buf.push(s8(sample));
          if (speed > 0 && !s2eff) {
            buf.push(s8(~speed));
          } else if (s2eff) {
            buf.push(s8(s2eff[0]));
            buf.push(s2eff[1] & 255);
          } else {
            buf.push(s8(0));
            buf.push(0);
          }
        } else if (s2eff && s2eff[0] >= 112) {
          buf.push(s8(s2eff[0]));
          buf.push(s2eff[1] & 255);
        } else {
          buf.push(s8(0));
          buf.push(0);
        }
      } else if (speed > 0 && !s2eff) {
        buf.push(s8(~speed));
      } else if (s2eff) {
        if (s2eff[0] >= 112) {
          buf.push(s8(s2eff[0]));
          buf.push(s2eff[1] & 255);
        } else {
          buf.push(s8(0));
          buf.push(s8(s2eff[0]));
          buf.push(s2eff[1] & 255);
        }
      } else {
        buf.push(s8(0));
        buf.push(s8(0));
        buf.push(0);
      }
    }
    return new Uint8Array(buf);
  }
};
registerVariableEncoder(sidMon2Encoder);
function pcm8ToWavDataUrl(pcm, sampleRate = 8363) {
  const n = pcm.length;
  const buf = new ArrayBuffer(44 + n);
  const v = new DataView(buf);
  const w = (off, s) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };
  w(0, "RIFF");
  v.setUint32(4, 36 + n, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  w(36, "data");
  v.setUint32(40, n, true);
  const dst = new Uint8Array(buf, 44);
  for (let i = 0; i < n; i++) dst[i] = pcm[i] + 128 & 255;
  return `data:audio/wav;base64,${arrayBufferToBase64(buf)}`;
}
const PERIODS = [
  0,
  5760,
  5424,
  5120,
  4832,
  4560,
  4304,
  4064,
  3840,
  3616,
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
  1808,
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
  904,
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
  95
];
function readString(data, offset, length) {
  let s = "";
  for (let i = 0; i < length; i++) {
    const c = data[offset + i];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}
function readUbyte(data, pos) {
  return data[pos];
}
function readByte(data, pos) {
  const v = data[pos];
  return v < 128 ? v : v - 256;
}
function readUshort(data, pos) {
  return data[pos] << 8 | data[pos + 1];
}
function readShort(data, pos) {
  const v = data[pos] << 8 | data[pos + 1];
  return v < 32768 ? v : v - 65536;
}
function readUint(data, pos) {
  return (data[pos] << 24 | data[pos + 1] << 16 | data[pos + 2] << 8 | data[pos + 3]) >>> 0;
}
function sidmonPeriodToXMNote(period) {
  if (period <= 0) return 0;
  let bestIdx = 1;
  let bestDist = Math.abs(PERIODS[1] - period);
  for (let i = 2; i <= 72; i++) {
    const d = Math.abs(PERIODS[i] - period);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx + 12;
}
function sidmonNoteToXM(note, transpose) {
  if (note <= 0 || note > 72) return 0;
  const transposed = note + transpose;
  if (transposed < 1 || transposed > 72) return 0;
  const period = PERIODS[transposed];
  if (!period) return 0;
  return sidmonPeriodToXMNote(period);
}
async function parseSidMon2File(buffer, filename, moduleBase = 0) {
  const data = new Uint8Array(buffer);
  const magic = readString(data, 58, 28);
  if (magic !== "SIDMON II - THE MIDI VERSION") {
    throw new Error(`Not a SidMon II file: magic="${magic}"`);
  }
  let pos = 2;
  const length = readUbyte(data, pos);
  pos++;
  const speedDef = readUbyte(data, pos);
  pos++;
  const sampleCount = readUshort(data, pos) >> 6;
  pos += 2;
  const trackDataLen = readUint(data, 14);
  const waveDataLen = readUint(data, 26);
  pos = 90;
  const trackLen = trackDataLen;
  const tracks = new Array(trackLen);
  let higher = 0;
  for (let i = 0; i < trackLen; i++) {
    const step = { pattern: 0, transpose: 0, soundTranspose: 0 };
    step.pattern = readUbyte(data, pos);
    pos++;
    if (step.pattern > higher) higher = step.pattern;
    tracks[i] = step;
  }
  for (let i = 0; i < trackLen; i++) {
    tracks[i].transpose = readByte(data, pos);
    pos++;
  }
  for (let i = 0; i < trackLen; i++) {
    tracks[i].soundTranspose = readByte(data, pos);
    pos++;
  }
  const instrPosition = pos;
  const numInstruments = (waveDataLen >> 5) + 1;
  const instruments = new Array(numInstruments);
  instruments[0] = {
    wave: 0,
    waveLen: 0,
    waveSpeed: 0,
    waveDelay: 0,
    arpeggio: 0,
    arpeggioLen: 0,
    arpeggioSpeed: 0,
    arpeggioDelay: 0,
    vibrato: 0,
    vibratoLen: 0,
    vibratoSpeed: 0,
    vibratoDelay: 0,
    pitchBend: 0,
    pitchBendDelay: 0,
    attackMax: 0,
    attackSpeed: 0,
    decayMin: 0,
    decaySpeed: 0,
    sustain: 0,
    releaseMin: 0,
    releaseSpeed: 0
  };
  pos = instrPosition;
  for (let i = 1; i < numInstruments; i++) {
    const wave = readUbyte(data, pos) << 4;
    pos++;
    const waveLen = readUbyte(data, pos);
    pos++;
    const waveSpeed = readUbyte(data, pos);
    pos++;
    const waveDelay = readUbyte(data, pos);
    pos++;
    const arpeggio = readUbyte(data, pos) << 4;
    pos++;
    const arpeggioLen2 = readUbyte(data, pos);
    pos++;
    const arpeggioSpeed = readUbyte(data, pos);
    pos++;
    const arpeggioDelay = readUbyte(data, pos);
    pos++;
    const vibrato = readUbyte(data, pos) << 4;
    pos++;
    const vibratoLen2 = readUbyte(data, pos);
    pos++;
    const vibratoSpeed = readUbyte(data, pos);
    pos++;
    const vibratoDelay = readUbyte(data, pos);
    pos++;
    const pitchBend = readByte(data, pos);
    pos++;
    const pitchBendDelay = readUbyte(data, pos);
    pos++;
    pos++;
    pos++;
    const attackMax = readUbyte(data, pos);
    pos++;
    const attackSpeed = readUbyte(data, pos);
    pos++;
    const decayMin = readUbyte(data, pos);
    pos++;
    const decaySpeed = readUbyte(data, pos);
    pos++;
    const sustain = readUbyte(data, pos);
    pos++;
    const releaseMin = readUbyte(data, pos);
    pos++;
    const releaseSpeed = readUbyte(data, pos);
    pos++;
    pos += 9;
    instruments[i] = {
      wave,
      waveLen,
      waveSpeed,
      waveDelay,
      arpeggio,
      arpeggioLen: arpeggioLen2,
      arpeggioSpeed,
      arpeggioDelay,
      vibrato,
      vibratoLen: vibratoLen2,
      vibratoSpeed,
      vibratoDelay,
      pitchBend,
      pitchBendDelay,
      attackMax,
      attackSpeed,
      decayMin,
      decaySpeed,
      sustain,
      releaseMin,
      releaseSpeed
    };
  }
  const wavePosition = pos;
  const waveTotalLen = readUint(data, 30);
  const waves = new Uint8Array(waveTotalLen);
  pos = wavePosition;
  for (let i = 0; i < waveTotalLen; i++) {
    waves[i] = readUbyte(data, pos);
    pos++;
  }
  const arpeggioPosition = pos;
  const arpeggioLen = readUint(data, 34);
  const arpeggios = new Int8Array(arpeggioLen);
  pos = arpeggioPosition;
  for (let i = 0; i < arpeggioLen; i++) {
    arpeggios[i] = readByte(data, pos);
    pos++;
  }
  const vibratoPosition = pos;
  const vibratoLen = readUint(data, 38);
  const vibratos = new Int8Array(vibratoLen);
  pos = vibratoPosition;
  for (let i = 0; i < vibratoLen; i++) {
    vibratos[i] = readByte(data, pos);
    pos++;
  }
  const samples = new Array(sampleCount);
  let sampleDataPosition = 0;
  for (let i = 0; i < sampleCount; i++) {
    pos += 4;
    const smpLength = readUshort(data, pos) << 1;
    pos += 2;
    const smpLoop = readUshort(data, pos) << 1;
    pos += 2;
    const smpRepeat = readUshort(data, pos) << 1;
    pos += 2;
    const negStart = sampleDataPosition + (readUshort(data, pos) << 1);
    pos += 2;
    const negLen = readUshort(data, pos) << 1;
    pos += 2;
    const negSpeed = readUshort(data, pos);
    pos += 2;
    const negDir = readUshort(data, pos);
    pos += 2;
    const negOffset = readShort(data, pos);
    pos += 2;
    const negPos = readUint(data, pos);
    pos += 4;
    const negCtr = readUshort(data, pos);
    pos += 2;
    pos += 6;
    const smpName = readString(data, pos, 32);
    pos += 32;
    samples[i] = {
      name: smpName,
      length: smpLength,
      loop: smpLoop,
      repeat: smpRepeat,
      pointer: sampleDataPosition,
      loopPtr: sampleDataPosition + smpLoop,
      negStart,
      negLen,
      negSpeed,
      negDir,
      negOffset,
      negPos,
      negCtr
    };
    sampleDataPosition += smpLength;
  }
  const numPointers = higher + 1;
  const pointers = new Uint16Array(numPointers + 1);
  const origPointerByteOffsets = new Uint16Array(numPointers + 1);
  for (let i = 0; i < numPointers; i++) {
    pointers[i] = readUshort(data, pos);
    origPointerByteOffsets[i] = pointers[i];
    pos += 2;
  }
  const patternDataStart = pos;
  const patternDataLen = readUint(data, 50);
  const patternRows = [];
  let rowIdx = 0;
  let pointerJ = 0;
  for (let i = 0; i < patternDataLen; ) {
    while (pointerJ < numPointers && patternDataStart + pointers[pointerJ] === pos) {
      pointers[pointerJ] = rowIdx;
      pointerJ++;
    }
    const row = { note: 0, sample: 0, effect: 0, param: 0, speed: 0 };
    const value = readByte(data, pos);
    pos++;
    i++;
    if (value === 0) {
      row.effect = readByte(data, pos);
      pos++;
      i++;
      row.param = readUbyte(data, pos);
      pos++;
      i++;
    } else if (value < 0) {
      row.speed = ~value;
    } else if (value < 112) {
      row.note = value;
      const next = readByte(data, pos);
      pos++;
      i++;
      if (next < 0) {
        row.speed = ~next;
      } else if (next < 112) {
        row.sample = next;
        const next2 = readByte(data, pos);
        pos++;
        i++;
        if (next2 < 0) {
          row.speed = ~next2;
        } else {
          row.effect = next2;
          row.param = readUbyte(data, pos);
          pos++;
          i++;
        }
      } else {
        row.effect = next;
        row.param = readUbyte(data, pos);
        pos++;
        i++;
      }
    } else {
      row.effect = value;
      row.param = readUbyte(data, pos);
      pos++;
      i++;
    }
    patternRows[rowIdx++] = row;
  }
  for (let k = pointerJ; k <= numPointers; k++) {
    pointers[k] = patternRows.length;
  }
  origPointerByteOffsets[numPointers] = patternDataLen;
  if ((pos & 1) !== 0) pos++;
  const sampleDataStart = pos;
  const samplePCMs = [];
  for (let i = 0; i < sampleCount; i++) {
    const smp = samples[i];
    if (smp.length > 0 && sampleDataStart + smp.pointer + smp.length <= data.length) {
      samplePCMs.push(data.slice(sampleDataStart + smp.pointer, sampleDataStart + smp.pointer + smp.length));
    } else {
      samplePCMs.push(new Uint8Array(0));
    }
  }
  const trackOrigPatterns = new Uint8Array(trackLen);
  for (let i = 0; i < trackLen; i++) {
    trackOrigPatterns[i] = tracks[i].pattern;
  }
  for (let i = 0; i < trackLen; i++) {
    tracks[i].pattern = pointers[tracks[i].pattern];
  }
  const songLength = length + 1;
  const trackerInstruments = [];
  for (let i = 1; i < numInstruments; i++) {
    const instr = instruments[i];
    const firstWaveIdx = instr.wave < waves.length ? waves[instr.wave] : -1;
    const pcm = firstWaveIdx >= 0 && firstWaveIdx < sampleCount && samplePCMs[firstWaveIdx].length > 0 ? samplePCMs[firstWaveIdx] : void 0;
    const smp = firstWaveIdx >= 0 && firstWaveIdx < sampleCount ? samples[firstWaveIdx] : null;
    const attack = Math.max(0, Math.min(15, 15 - Math.floor(instr.attackSpeed * 16 / 256)));
    const decay = Math.max(0, Math.min(15, 15 - Math.floor(instr.decaySpeed * 16 / 256)));
    const sustain = Math.max(0, Math.min(15, Math.round(instr.decayMin * 15 / 255)));
    const release = Math.max(0, Math.min(15, 15 - Math.floor(instr.releaseSpeed * 16 / 256)));
    const arpTable = [];
    const arpStart = instr.arpeggio;
    for (let a = 0; a < 8; a++) {
      arpTable.push(arpStart + a < arpeggios.length ? arpeggios[arpStart + a] : 0);
    }
    const vibDelay = Math.min(255, instr.vibratoDelay);
    const vibSpeed = Math.min(63, instr.vibratoSpeed);
    const vibDepth = Math.min(63, instr.vibratoLen);
    const loopStart = smp && smp.repeat > 2 ? smp.loop : 0;
    const loopLength = smp && smp.repeat > 2 ? smp.repeat : 0;
    const config = {
      type: "pcm",
      waveform: 1,
      // sawtooth (unused for pcm type)
      pulseWidth: 128,
      attack,
      decay,
      sustain,
      release,
      arpTable,
      arpSpeed: Math.min(15, instr.arpeggioSpeed),
      vibDelay,
      vibSpeed,
      vibDepth,
      filterCutoff: 255,
      filterResonance: 0,
      filterMode: 0,
      pcmData: pcm,
      loopStart,
      loopLength
    };
    const uadeChipRam = {
      moduleBase,
      moduleSize: buffer.byteLength,
      instrBase: moduleBase + instrPosition + (i - 1) * 32,
      instrSize: 32,
      sections: {
        instrTable: moduleBase + instrPosition,
        waveTable: moduleBase + wavePosition,
        arpeggioTable: moduleBase + arpeggioPosition,
        vibratoTable: moduleBase + vibratoPosition,
        sampleData: moduleBase + sampleDataStart
      }
    };
    const sampleUrl = pcm && pcm.length > 0 ? pcm8ToWavDataUrl(pcm) : void 0;
    const loopEnabled = loopLength > 2 && loopStart >= 0;
    trackerInstruments.push({
      id: i,
      name: (smp == null ? void 0 : smp.name) || `Instrument ${i}`,
      type: "synth",
      synthType: "SidMonSynth",
      sidMon: config,
      uadeChipRam,
      effects: [],
      volume: -6,
      pan: 0,
      ...sampleUrl ? {
        sample: {
          url: sampleUrl,
          sampleRate: 8363,
          baseNote: "C4",
          detune: 0,
          loop: loopEnabled,
          loopType: loopEnabled ? "forward" : "off",
          loopStart,
          loopEnd: loopEnabled ? loopStart + loopLength : 0,
          reverse: false,
          playbackRate: 1
        },
        parameters: { sampleUrl }
      } : {}
    });
  }
  const MAX_PATTERN_LEN = 256;
  let currentPatternLen = 64;
  const trackerPatterns = [];
  const voiceStates = Array.from({ length: 4 }, () => ({
    step: null,
    patternPtr: 0,
    speed: 0,
    note: 0,
    instrument: 0,
    instr: instruments[0],
    volume: 0,
    adsrPos: 0,
    sustainCtr: 0
  }));
  let globalSpeed = speedDef;
  for (let trackPos = 0; trackPos < songLength; trackPos++) {
    const channelRows = [[], [], [], []];
    currentPatternLen = 64;
    for (let patRow = 0; patRow < MAX_PATTERN_LEN && patRow < currentPatternLen; patRow++) {
      for (let ch = 0; ch < 4; ch++) {
        const voice = voiceStates[ch];
        let noteTriggered = false;
        let effectType = 0;
        let effectParam = 0;
        let xmNote = 0;
        let instrId = 0;
        if (patRow === 0) {
          const trackIdx = trackPos + ch * songLength;
          if (trackIdx < tracks.length) {
            voice.step = tracks[trackIdx];
            voice.patternPtr = voice.step.pattern;
          }
          voice.speed = 0;
        }
        voice.speed--;
        if (voice.speed < 0) {
          const rowData = voice.patternPtr < patternRows.length ? patternRows[voice.patternPtr] : null;
          if (rowData) {
            voice.patternPtr++;
            voice.speed = rowData.speed;
            if (rowData.note > 0) {
              noteTriggered = true;
              const step = voice.step;
              const transpose = step ? step.transpose : 0;
              const soundTranspose = step ? step.soundTranspose : 0;
              voice.note = rowData.note + transpose;
              if (rowData.sample > 0) {
                voice.instrument = rowData.sample;
                const instrIdx = voice.instrument + soundTranspose;
                if (instrIdx >= 0 && instrIdx < numInstruments) {
                  voice.instr = instruments[instrIdx];
                  instrId = instrIdx;
                }
              }
              xmNote = sidmonNoteToXM(voice.note, 0);
              voice.adsrPos = 4;
              voice.volume = 0;
              voice.sustainCtr = 0;
            }
            if (rowData.effect) {
              const eff = rowData.effect;
              const param = rowData.param;
              switch (eff) {
                case 112:
                  effectType = 0;
                  effectParam = param;
                  break;
                case 113:
                  effectType = 1;
                  effectParam = param;
                  break;
                case 114:
                  effectType = 2;
                  effectParam = param;
                  break;
                case 115:
                  effectType = 10;
                  effectParam = (param & 15) << 4;
                  break;
                case 116:
                  effectType = 10;
                  effectParam = param & 15;
                  break;
                case 117:
                  break;
                case 118:
                  if (param !== 0) {
                    currentPatternLen = param;
                  }
                  break;
                case 124:
                  effectType = 12;
                  effectParam = Math.min(param, 64);
                  break;
                case 127:
                  effectType = 15;
                  effectParam = param & 15;
                  if (effectParam > 0) globalSpeed = effectParam;
                  break;
                default:
                  if (eff > 0 && eff < 112 && param > 0) {
                    effectType = 3;
                    effectParam = param;
                  }
                  break;
              }
            }
          }
        }
        const instr = voice.instr;
        switch (voice.adsrPos) {
          case 4:
            voice.volume += instr.attackSpeed;
            if (voice.volume >= instr.attackMax) {
              voice.volume = instr.attackMax;
              voice.adsrPos = 3;
            }
            break;
          case 3:
            if (!instr.decaySpeed) {
              voice.adsrPos = 2;
            } else {
              voice.volume -= instr.decaySpeed;
              if (voice.volume <= instr.decayMin) {
                voice.volume = instr.decayMin;
                voice.adsrPos = 2;
              }
            }
            break;
          case 2:
            if (voice.sustainCtr >= instr.sustain) {
              voice.adsrPos = 1;
            } else {
              voice.sustainCtr++;
            }
            break;
          case 1:
            voice.volume -= instr.releaseSpeed;
            if (voice.volume <= instr.releaseMin) {
              voice.volume = instr.releaseMin;
              voice.adsrPos = 0;
            }
            break;
        }
        const clampedVol = Math.max(0, Math.min(255, voice.volume));
        const xmVol = noteTriggered ? 16 + Math.min(64, clampedVol >> 2) : 0;
        channelRows[ch].push({
          note: xmNote,
          instrument: instrId,
          volume: xmVol,
          effTyp: effectType,
          eff: effectParam,
          effTyp2: 0,
          eff2: 0
        });
      }
    }
    if (trackPos === 0) {
      const cell = channelRows[0][0];
      if (cell.effTyp === 0 && cell.eff === 0) {
        cell.effTyp = 15;
        cell.eff = globalSpeed;
      }
    }
    trackerPatterns.push({
      id: `pattern-${trackPos}`,
      name: `Pattern ${trackPos}`,
      length: channelRows[0].length,
      // Use actual row count (may differ from 64 due to 0x76 effect)
      channels: channelRows.map((rows, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: ch === 0 || ch === 3 ? -50 : 50,
        // Amiga LRRL panning
        instrumentId: null,
        color: null,
        rows
      })),
      importMetadata: {
        sourceFormat: "SIDMON2",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: 4,
        originalPatternCount: numPointers,
        originalInstrumentCount: numInstruments - 1
      }
    });
  }
  if (trackerPatterns.length === 0) {
    trackerPatterns.push({
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
        pan: ch === 0 || ch === 3 ? -50 : 50,
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
        sourceFormat: "SIDMON2",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: 4,
        originalPatternCount: 0,
        originalInstrumentCount: 0
      }
    });
  }
  const moduleName = filename.replace(/\.[^/.]+$/, "");
  const filePatternAddrs = [];
  const filePatternSizes = [];
  for (let i = 0; i < numPointers; i++) {
    filePatternAddrs.push(patternDataStart + origPointerByteOffsets[i]);
    const nextOff = i + 1 < numPointers ? origPointerByteOffsets[i + 1] : patternDataLen;
    filePatternSizes.push(Math.max(0, nextOff - origPointerByteOffsets[i]));
  }
  const trackMap = [];
  for (let trackPos = 0; trackPos < songLength; trackPos++) {
    const chPats = [];
    for (let ch = 0; ch < 4; ch++) {
      const trackIdx = trackPos + ch * songLength;
      const filePatIdx = trackIdx < trackLen ? trackOrigPatterns[trackIdx] : -1;
      chPats.push(filePatIdx < numPointers ? filePatIdx : -1);
    }
    trackMap.push(chPats);
  }
  const variableLayout = {
    formatId: "sidMon2",
    numChannels: 4,
    numFilePatterns: numPointers,
    rowsPerPattern: 64,
    moduleSize: buffer.byteLength,
    encoder: sidMon2Encoder,
    filePatternAddrs,
    filePatternSizes,
    trackMap
  };
  return {
    name: moduleName,
    format: "MOD",
    patterns: trackerPatterns,
    instruments: trackerInstruments,
    songPositions: trackerPatterns.map((_, i) => i),
    songLength: trackerPatterns.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: speedDef || 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename,
    sd2FileData: buffer.slice(0),
    uadeVariableLayout: variableLayout
  };
}
export {
  parseSidMon2File
};
