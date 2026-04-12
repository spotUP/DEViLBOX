import { c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import { f as fredEditorEncoder } from "./FredEditorEncoder-rSEnxCqL.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function readUint32(view, off) {
  return view.getUint32(off, false);
}
function readInt16(view, off) {
  return view.getInt16(off, false);
}
function readUint16(view, off) {
  return view.getUint16(off, false);
}
function readUint8(view, off) {
  return view.getUint8(off);
}
function readInt8(view, off) {
  const v = view.getUint8(off);
  return v < 128 ? v : v - 256;
}
function feNoteToXM(feNote) {
  if (feNote < 1 || feNote > 72) return 0;
  return feNote + 12;
}
function isFredEditorFormat(buffer) {
  if (buffer.byteLength < 1024) return false;
  const view = new DataView(buffer);
  let hasJmp = true;
  for (let pos2 = 0; pos2 < 16; pos2 += 4) {
    const value = view.getUint16(pos2, false);
    if (value !== 20218) {
      hasJmp = false;
      break;
    }
  }
  if (!hasJmp) return false;
  let foundDataPtr = false;
  let foundBasePtr = false;
  let pos = 16;
  while (pos < 1024 && pos + 6 <= buffer.byteLength) {
    const value = view.getUint16(pos, false);
    if (value === 4666) {
      if (pos + 4 < buffer.byteLength) {
        const next = view.getUint16(pos + 4, false);
        if (next === 45057) {
          foundDataPtr = true;
        }
      }
    } else if (value === 8522) {
      if (pos + 4 < buffer.byteLength) {
        const next = view.getUint16(pos + 4, false);
        if (next === 18426) {
          foundBasePtr = true;
        }
      }
    }
    if (foundDataPtr && foundBasePtr) return true;
    pos += 2;
  }
  return foundBasePtr;
}
async function parseFredEditorFile(buffer, filename, moduleBase = 0) {
  const view = new DataView(buffer);
  const byteLength = buffer.byteLength;
  for (let pos2 = 0; pos2 < 16; pos2 += 4) {
    const value = view.getUint16(pos2, false);
    if (value !== 20218) {
      throw new Error("Not a Fred Editor file: missing jmp instructions");
    }
  }
  let dataPtr = 0;
  let basePtr = -1;
  let pos = 16;
  while (pos < 1024 && pos + 6 <= byteLength) {
    const value = view.getUint16(pos, false);
    if (value === 4666) {
      const offset = view.getUint16(pos + 2, false);
      const nextInstr = view.getUint16(pos + 4, false);
      if (nextInstr === 45057) {
        dataPtr = pos + 2 + offset - 2197;
      }
    } else if (value === 8522) {
      const nextPos = pos + 2;
      if (nextPos + 2 <= byteLength) {
        const nextInstr = view.getUint16(nextPos + 2, false);
        if (nextInstr === 18426) {
          if (pos + 8 <= byteLength) {
            const displacement = view.getInt16(pos + 6, false);
            basePtr = pos + 6 + displacement;
          }
          break;
        }
      }
    }
    pos += 2;
  }
  if (basePtr === -1) {
    throw new Error("Not a Fred Editor file: could not locate basePtr");
  }
  const sampleTableOffset = dataPtr + 2210;
  if (sampleTableOffset + 8 > byteLength) {
    throw new Error("Fred Editor: sample table offset out of bounds");
  }
  const sampleDataOffset = readUint32(view, sampleTableOffset);
  const sampleDefsStart = basePtr + sampleDataOffset;
  let readPos = sampleDefsStart;
  if (readPos >= byteLength) {
    throw new Error("Fred Editor: sample data position out of bounds");
  }
  const samples = [];
  let minSamplePointer = 2147483647;
  while (readPos + 64 <= byteLength) {
    const samplePointer = readUint32(view, readPos);
    if (samplePointer !== 0) {
      if (samplePointer < readPos && samplePointer !== 0 || samplePointer >= byteLength) {
        break;
      }
      if (samplePointer < minSamplePointer) {
        minSamplePointer = samplePointer;
      }
    }
    const sample = {
      pointer: samplePointer,
      loopPtr: readInt16(view, readPos + 4),
      length: readUint16(view, readPos + 6) << 1,
      relative: readUint16(view, readPos + 8),
      vibratoDelay: readUint8(view, readPos + 10),
      // skip 1 byte (readPos + 11)
      vibratoSpeed: readUint8(view, readPos + 12),
      vibratoDepth: readUint8(view, readPos + 13),
      envelopeVol: readUint8(view, readPos + 14),
      attackSpeed: readUint8(view, readPos + 15),
      attackVol: readUint8(view, readPos + 16),
      decaySpeed: readUint8(view, readPos + 17),
      decayVol: readUint8(view, readPos + 18),
      sustainTime: readUint8(view, readPos + 19),
      releaseSpeed: readUint8(view, readPos + 20),
      releaseVol: readUint8(view, readPos + 21),
      arpeggio: new Int8Array(16),
      arpeggioSpeed: 0,
      arpeggioLimit: 0,
      type: 0,
      synchro: 0,
      pulseRateNeg: 0,
      pulseRatePos: 0,
      pulseSpeed: 0,
      pulsePosL: 0,
      pulsePosH: 0,
      pulseDelay: 0,
      pulseCounter: 0,
      blendRate: 0,
      blendDelay: 0,
      blendCounter: 0
    };
    for (let i = 0; i < 16; i++) {
      sample.arpeggio[i] = readInt8(view, readPos + 22 + i);
    }
    sample.arpeggioSpeed = readUint8(view, readPos + 38);
    sample.type = readInt8(view, readPos + 39);
    sample.pulseRateNeg = readInt8(view, readPos + 40);
    sample.pulseRatePos = readUint8(view, readPos + 41);
    sample.pulseSpeed = readUint8(view, readPos + 42);
    sample.pulsePosL = readUint8(view, readPos + 43);
    sample.pulsePosH = readUint8(view, readPos + 44);
    sample.pulseDelay = readUint8(view, readPos + 45);
    sample.synchro = readUint8(view, readPos + 46);
    sample.blendRate = readUint8(view, readPos + 47);
    sample.blendDelay = readUint8(view, readPos + 48);
    sample.pulseCounter = readUint8(view, readPos + 49);
    sample.blendCounter = readUint8(view, readPos + 50);
    sample.arpeggioLimit = readUint8(view, readPos + 51);
    readPos += 64;
    samples.push(sample);
  }
  const pcmBase = minSamplePointer < 2147483647 ? basePtr + minSamplePointer : 0;
  const pcmData = pcmBase > 0 && pcmBase < byteLength ? new Uint8Array(buffer, pcmBase, byteLength - pcmBase) : new Uint8Array(0);
  if (pcmBase > 0) {
    for (const sample of samples) {
      if (sample.pointer > 0) {
        sample.pointer = basePtr + sample.pointer - pcmBase;
      }
    }
  }
  const patternDataOffset = readUint32(view, sampleTableOffset + 4);
  const patternStart = basePtr + patternDataOffset;
  const patternLen = sampleDataOffset - patternDataOffset;
  let patternBytes;
  if (patternLen > 0 && patternStart + patternLen <= byteLength) {
    patternBytes = new Uint8Array(buffer, patternStart, patternLen);
  } else {
    patternBytes = new Uint8Array(0);
  }
  const songCountOffset = dataPtr + 2197;
  if (songCountOffset >= byteLength) {
    throw new Error("Fred Editor: song count offset out of bounds");
  }
  const numSongs = readUint8(view, songCountOffset) + 1;
  const tracksBase = dataPtr + 2830;
  const tracksLen = patternStart - tracksBase;
  const songs = [];
  let trackTablePos = 0;
  for (let i = 0; i < numSongs; i++) {
    const song = {
      speed: 0,
      length: 0,
      tracks: []
    };
    for (let j = 0; j < 4; j++) {
      const trackOffset = tracksBase + trackTablePos;
      if (trackOffset + 2 > byteLength) break;
      const startOff = readUint16(view, trackOffset);
      let endOff;
      if (j === 3 && i === numSongs - 1) {
        endOff = tracksLen;
      } else {
        const nextOffset = tracksBase + trackTablePos + 2;
        if (nextOffset + 2 <= byteLength) {
          endOff = readUint16(view, nextOffset);
        } else {
          endOff = tracksLen;
        }
      }
      const trackEntries = endOff - startOff >> 1;
      if (trackEntries > song.length) song.length = trackEntries;
      const track = new Uint32Array(Math.max(0, trackEntries));
      for (let ptr = 0; ptr < trackEntries; ptr++) {
        const entryOff = tracksBase + startOff + ptr * 2;
        if (entryOff + 2 <= byteLength) {
          track[ptr] = readUint16(view, entryOff);
        }
      }
      song.tracks[j] = track;
      trackTablePos += 2;
    }
    const speedOffset = dataPtr + 2199 + i;
    if (speedOffset < byteLength) {
      song.speed = readUint8(view, speedOffset);
    }
    if (song.speed === 0) song.speed = 6;
    songs.push(song);
  }
  const instruments = [];
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const instId = i + 1;
    const name = `Sample ${i + 1}`;
    const instrFileOffset = sampleDefsStart + i * 64;
    const chipRam = {
      moduleBase,
      moduleSize: buffer.byteLength,
      instrBase: moduleBase + instrFileOffset,
      instrSize: 64,
      sections: {
        dataBase: moduleBase + dataPtr,
        fileBase: moduleBase + basePtr,
        sampleDefs: moduleBase + sampleDefsStart,
        patternData: moduleBase + patternStart,
        trackData: moduleBase + tracksBase
      }
    };
    if (sample.length > 0 && sample.pointer >= 0 && sample.type === 0) {
      const start = sample.pointer;
      const end = start + sample.length;
      if (end <= pcmData.length) {
        const pcm = pcmData.slice(start, end);
        let loopStart = 0;
        let loopEnd = 0;
        if (sample.loopPtr > 0) {
          loopStart = sample.loopPtr;
          loopEnd = sample.length;
        }
        const instr = createSamplerInstrument(
          instId,
          name,
          pcm,
          Math.min(64, sample.envelopeVol || 64),
          8287,
          loopStart,
          loopEnd
        );
        instr.uadeChipRam = chipRam;
        instruments.push(instr);
      } else {
        const instr = makePlaceholderInstrument(instId, name);
        instr.uadeChipRam = chipRam;
        instruments.push(instr);
      }
    } else if (sample.type === 1) {
      const fredCfg = {
        envelopeVol: sample.envelopeVol,
        attackSpeed: sample.attackSpeed,
        attackVol: sample.attackVol,
        decaySpeed: sample.decaySpeed,
        decayVol: sample.decayVol,
        sustainTime: sample.sustainTime,
        releaseSpeed: sample.releaseSpeed,
        releaseVol: sample.releaseVol,
        vibratoDelay: sample.vibratoDelay,
        vibratoSpeed: sample.vibratoSpeed,
        vibratoDepth: sample.vibratoDepth,
        arpeggio: Array.from(sample.arpeggio),
        arpeggioLimit: sample.arpeggioLimit,
        arpeggioSpeed: sample.arpeggioSpeed,
        pulseRateNeg: sample.pulseRateNeg,
        pulseRatePos: sample.pulseRatePos,
        pulseSpeed: sample.pulseSpeed,
        pulsePosL: sample.pulsePosL,
        pulsePosH: sample.pulsePosH,
        pulseDelay: sample.pulseDelay,
        relative: sample.relative
      };
      instruments.push({
        id: instId,
        name: `${name} (PWM)`,
        type: "synth",
        synthType: "FredSynth",
        fred: fredCfg,
        effects: [],
        volume: -6,
        pan: 0,
        uadeChipRam: chipRam
      });
    } else if (sample.type === 2) {
      const start = sample.pointer;
      const end = start + sample.length;
      if (sample.length > 0 && start >= 0 && end <= pcmData.length) {
        const pcm = pcmData.slice(start, end);
        const instr = createSamplerInstrument(
          instId,
          `${name} (Blend)`,
          pcm,
          Math.min(64, sample.envelopeVol || 64),
          8287,
          0,
          0
        );
        instr.uadeChipRam = chipRam;
        instruments.push(instr);
      } else {
        const instr = makePlaceholderInstrument(instId, `${name} (Blend)`);
        instr.uadeChipRam = chipRam;
        instruments.push(instr);
      }
    } else {
      const instr = makePlaceholderInstrument(instId, name);
      instr.uadeChipRam = chipRam;
      instruments.push(instr);
    }
  }
  if (instruments.length === 0) {
    instruments.push(makePlaceholderInstrument(1, "Default"));
  }
  const trackerPatterns = [];
  const songPositions = [];
  const activeSong = songs.length > 0 ? songs[0] : null;
  if (activeSong && patternBytes.length > 0) {
    const speed = activeSong.speed || 6;
    const maxTrackLen = activeSong.length;
    for (let trackPos = 0; trackPos < maxTrackLen; trackPos++) {
      const channelRows = [[], [], [], []];
      for (let ch = 0; ch < 4; ch++) {
        const track = activeSong.tracks[ch];
        if (!track || trackPos >= track.length) {
          for (let row = 0; row < 64; row++) {
            channelRows[ch].push(emptyCell());
          }
          continue;
        }
        const patOffset = track[trackPos];
        if (patOffset === 65535) {
          for (let row = 0; row < 64; row++) {
            channelRows[ch].push(emptyCell());
          }
          continue;
        }
        if (patOffset > 32767) {
          for (let row = 0; row < 64; row++) {
            channelRows[ch].push(emptyCell());
          }
          continue;
        }
        const rows = decodePatternStream(patternBytes, patOffset, speed, samples);
        for (const row of rows) {
          channelRows[ch].push(row);
        }
      }
      const maxRows = Math.max(
        ...channelRows.map((r) => r.length),
        1
      );
      const patternLength = Math.min(maxRows, 64);
      for (let ch = 0; ch < 4; ch++) {
        while (channelRows[ch].length < patternLength) {
          channelRows[ch].push(emptyCell());
        }
        if (channelRows[ch].length > patternLength) {
          channelRows[ch].length = patternLength;
        }
      }
      const channels = channelRows.map((rows, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: ch === 0 || ch === 3 ? -50 : 50,
        // Amiga LRRL hard stereo
        instrumentId: null,
        color: null,
        rows
      }));
      const patIdx = trackerPatterns.length;
      trackerPatterns.push({
        id: `pattern-${patIdx}`,
        name: `Pattern ${patIdx}`,
        length: patternLength,
        channels,
        importMetadata: {
          sourceFormat: "MOD",
          sourceFile: filename,
          importedAt: (/* @__PURE__ */ new Date()).toISOString(),
          originalChannelCount: 4,
          originalPatternCount: maxTrackLen,
          originalInstrumentCount: samples.length
        }
      });
      songPositions.push(patIdx);
    }
  }
  if (trackerPatterns.length === 0) {
    trackerPatterns.push(makeEmptyPattern(filename));
    songPositions.push(0);
  }
  const moduleName = filename.replace(/\.[^/.]+$/, "");
  const initialSpeed = (activeSong == null ? void 0 : activeSong.speed) || 6;
  const uniqueOffsets = [];
  const offsetToIdx = /* @__PURE__ */ new Map();
  if (activeSong && patternBytes.length > 0) {
    const maxTrackLen = activeSong.length;
    for (let trackPos = 0; trackPos < maxTrackLen; trackPos++) {
      for (let ch = 0; ch < 4; ch++) {
        const track = activeSong.tracks[ch];
        if (!track || trackPos >= track.length) continue;
        const patOffset = track[trackPos];
        if (patOffset >= 32768) continue;
        if (!offsetToIdx.has(patOffset)) {
          offsetToIdx.set(patOffset, uniqueOffsets.length);
          uniqueOffsets.push(patOffset);
        }
      }
    }
  }
  const filePatternAddrs = [];
  const filePatternSizes = [];
  for (const off of uniqueOffsets) {
    filePatternAddrs.push(patternStart + off);
    let pos2 = off;
    while (pos2 < patternBytes.length) {
      const val = patternBytes[pos2];
      pos2++;
      if (val === 128) break;
      if (val === 131) pos2++;
      else if (val === 130) pos2++;
      else if (val === 129) pos2 += 3;
    }
    filePatternSizes.push(pos2 - off);
  }
  const trackMap = [];
  if (activeSong) {
    const maxTrackLen = activeSong.length;
    for (let trackPos = 0; trackPos < maxTrackLen; trackPos++) {
      const chPats = [];
      for (let ch = 0; ch < 4; ch++) {
        const track = activeSong.tracks[ch];
        if (!track || trackPos >= track.length) {
          chPats.push(-1);
          continue;
        }
        const patOffset = track[trackPos];
        if (patOffset >= 32768) {
          chPats.push(-1);
          continue;
        }
        chPats.push(offsetToIdx.get(patOffset) ?? -1);
      }
      trackMap.push(chPats);
    }
  }
  const variableLayout = {
    formatId: "fredEditor",
    numChannels: 4,
    numFilePatterns: uniqueOffsets.length,
    rowsPerPattern: 64,
    moduleSize: buffer.byteLength,
    encoder: fredEditorEncoder,
    filePatternAddrs,
    filePatternSizes,
    trackMap
  };
  return {
    name: moduleName,
    format: "MOD",
    patterns: trackerPatterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename,
    uadeVariableLayout: variableLayout,
    // WASM engine playback (replaces UADE)
    fredEditorWasmFileData: buffer.slice(0)
  };
}
function decodePatternStream(patternBytes, startOffset, initialSpeed, samples) {
  const rows = [];
  let pos = startOffset;
  let currentSample = 0;
  let speed = initialSpeed;
  let portaSpeed = 0;
  let portaNote = 0;
  let portaDelay = 0;
  const maxRows = 64;
  while (pos < patternBytes.length && rows.length < maxRows) {
    const value = patternBytes[pos] < 128 ? patternBytes[pos] : patternBytes[pos] - 256;
    pos++;
    if (value > 0 && value <= 127) {
      const xmNote = feNoteToXM(value);
      const instrument = currentSample + 1;
      const smp = currentSample < samples.length ? samples[currentSample] : null;
      let vol = 0;
      if (smp) {
        vol = Math.min(64, smp.attackVol || smp.envelopeVol || 64);
      }
      const xmVolume = 16 + vol;
      let effTyp = 0;
      let eff = 0;
      let effTyp2 = 0;
      let eff2 = 0;
      if (smp && smp.arpeggioLimit > 0 && smp.arpeggio[0] !== 0) {
        const arp1 = Math.abs(smp.arpeggio[0]) & 15;
        const arp2 = smp.arpeggioLimit > 1 ? Math.abs(smp.arpeggio[1]) & 15 : 0;
        if (arp1 > 0 || arp2 > 0) {
          effTyp = 0;
          eff = arp1 << 4 | arp2;
        }
      }
      let noteToUse = xmNote;
      if (portaDelay === 0 && portaSpeed > 0) {
        const pNote = feNoteToXM(portaNote);
        if (pNote > 0 && pNote !== xmNote) {
          effTyp = 3;
          eff = Math.min(portaSpeed, 255);
          effTyp2 = 0;
          eff2 = 0;
          noteToUse = pNote;
        }
      }
      if (smp && smp.vibratoSpeed > 0 && smp.vibratoDepth > 0 && effTyp === 0) {
        effTyp = 4;
        const vSpeed = Math.min(smp.vibratoSpeed, 15);
        const vDepth = Math.min(smp.vibratoDepth, 15);
        eff = vSpeed << 4 | vDepth;
      }
      rows.push({
        note: noteToUse,
        instrument,
        volume: xmVolume,
        effTyp,
        eff,
        effTyp2,
        eff2
      });
    } else if (value < 0) {
      switch (value) {
        case -125: {
          if (pos < patternBytes.length) {
            currentSample = patternBytes[pos];
            pos++;
          }
          break;
        }
        case -126: {
          if (pos < patternBytes.length) {
            speed = patternBytes[pos];
            pos++;
            const cell = emptyCell();
            cell.effTyp = 15;
            cell.eff = speed;
            rows.push(cell);
          }
          break;
        }
        case -127: {
          if (pos + 2 < patternBytes.length) {
            portaSpeed = patternBytes[pos] * speed;
            portaNote = patternBytes[pos + 1];
            portaDelay = patternBytes[pos + 2] * speed;
            pos += 3;
          }
          break;
        }
        case -124: {
          rows.push({
            note: 97,
            instrument: 0,
            volume: 0,
            effTyp: 0,
            eff: 0,
            effTyp2: 0,
            eff2: 0
          });
          break;
        }
        case -128: {
          return rows;
        }
        default: {
          const duration = Math.abs(value);
          const emptyRows = Math.min(duration - 1, maxRows - rows.length);
          for (let d = 0; d < emptyRows; d++) {
            rows.push(emptyCell());
          }
          break;
        }
      }
    } else {
      rows.push(emptyCell());
    }
  }
  return rows;
}
function emptyCell() {
  return {
    note: 0,
    instrument: 0,
    volume: 0,
    effTyp: 0,
    eff: 0,
    effTyp2: 0,
    eff2: 0
  };
}
function makePlaceholderInstrument(id, name) {
  return {
    id,
    name,
    type: "synth",
    synthType: "Synth",
    effects: [],
    volume: -6,
    pan: 0
  };
}
function makeEmptyPattern(filename) {
  return {
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
      // Amiga LRRL hard stereo
      instrumentId: null,
      color: null,
      rows: Array.from({ length: 64 }, () => emptyCell())
    })),
    importMetadata: {
      sourceFormat: "MOD",
      sourceFile: filename,
      importedAt: (/* @__PURE__ */ new Date()).toISOString(),
      originalChannelCount: 4,
      originalPatternCount: 0,
      originalInstrumentCount: 0
    }
  };
}
export {
  isFredEditorFormat,
  parseFredEditorFile
};
