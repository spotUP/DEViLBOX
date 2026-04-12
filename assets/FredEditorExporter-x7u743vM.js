import { f as fredEditorEncoder } from "./FredEditorEncoder-rSEnxCqL.js";
import "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function writeU32BE(view, off, val) {
  view.setUint32(off, val, false);
}
function writeU16BE(view, off, val) {
  view.setUint16(off, val, false);
}
function writeI16BE(view, off, val) {
  view.setInt16(off, val, false);
}
async function exportFredEditor(song) {
  var _a, _b, _c, _d;
  const warnings = [];
  const numChannels = 4;
  const encodedPatterns = [];
  const patternKeyToIdx = /* @__PURE__ */ new Map();
  const patMap = [];
  for (let p = 0; p < song.patterns.length; p++) {
    const pat = song.patterns[p];
    const chIndices = [];
    for (let ch = 0; ch < numChannels; ch++) {
      const rows = ((_a = pat.channels[ch]) == null ? void 0 : _a.rows) ?? [];
      const encoded = fredEditorEncoder.encodePattern(rows, ch);
      const key = Array.from(encoded).join(",");
      let idx = patternKeyToIdx.get(key);
      if (idx === void 0) {
        idx = encodedPatterns.length;
        patternKeyToIdx.set(key, idx);
        encodedPatterns.push(encoded);
      }
      chIndices.push(idx);
    }
    patMap.push(chIndices);
  }
  const patternOffsets = [];
  let patternStreamSize = 0;
  for (const enc of encodedPatterns) {
    patternOffsets.push(patternStreamSize);
    patternStreamSize += enc.length;
  }
  const songLen = song.songPositions.length;
  const trackDataEntries = [[], [], [], []];
  for (let pos = 0; pos < songLen; pos++) {
    const songPatIdx = song.songPositions[pos] ?? 0;
    const mapping = patMap[songPatIdx];
    for (let ch = 0; ch < numChannels; ch++) {
      const encIdx = mapping ? mapping[ch] : 0;
      trackDataEntries[ch].push(patternOffsets[encIdx] ?? 0);
    }
  }
  const trackTableSize = 1 * numChannels * 2;
  const trackTableOffsets = [];
  for (let ch = 0; ch < numChannels; ch++) {
    trackTableOffsets.push(trackTableSize + ch * songLen * 2);
  }
  const trackDataSize = trackTableSize + numChannels * songLen * 2;
  const sampleDefs = [];
  for (let i = 0; i < song.instruments.length; i++) {
    const inst = song.instruments[i];
    const fred = inst.fred;
    if (fred) {
      sampleDefs.push({
        pcmData: new Uint8Array(0),
        loopPtr: 0,
        length: 0,
        relative: fred.relative ?? 1024,
        vibratoDelay: fred.vibratoDelay ?? 0,
        vibratoSpeed: fred.vibratoSpeed ?? 0,
        vibratoDepth: fred.vibratoDepth ?? 0,
        envelopeVol: fred.envelopeVol ?? 64,
        attackSpeed: fred.attackSpeed ?? 0,
        attackVol: fred.attackVol ?? 64,
        decaySpeed: fred.decaySpeed ?? 0,
        decayVol: fred.decayVol ?? 0,
        sustainTime: fred.sustainTime ?? 0,
        releaseSpeed: fred.releaseSpeed ?? 0,
        releaseVol: fred.releaseVol ?? 0,
        arpeggio: fred.arpeggio ?? new Array(16).fill(0),
        arpeggioLimit: fred.arpeggioLimit ?? 0,
        arpeggioSpeed: fred.arpeggioSpeed ?? 0,
        type: 1,
        // PWM
        synchro: 0,
        pulseRateNeg: fred.pulseRateNeg ?? 0,
        pulseRatePos: fred.pulseRatePos ?? 0,
        pulseSpeed: fred.pulseSpeed ?? 0,
        pulsePosL: fred.pulsePosL ?? 0,
        pulsePosH: fred.pulsePosH ?? 0,
        pulseDelay: fred.pulseDelay ?? 0,
        pulseCounter: 0,
        blendRate: 0,
        blendDelay: 0,
        blendCounter: 0
      });
    } else if ((_b = inst.sample) == null ? void 0 : _b.audioBuffer) {
      const wav = new DataView(inst.sample.audioBuffer);
      let dataLen = 0;
      let dataOffset = 44;
      if (wav.byteLength >= 44) {
        dataLen = wav.getUint32(40, true);
        dataOffset = 44;
      }
      const frames = Math.floor(dataLen / 2);
      const pcm = new Uint8Array(frames);
      for (let j = 0; j < frames; j++) {
        if (dataOffset + j * 2 + 1 < wav.byteLength) {
          const s16 = wav.getInt16(dataOffset + j * 2, true);
          pcm[j] = s16 >> 8 & 255;
        }
      }
      const loopStart = ((_c = inst.sample) == null ? void 0 : _c.loopStart) ?? 0;
      const loopEnd = ((_d = inst.sample) == null ? void 0 : _d.loopEnd) ?? 0;
      const loopPtr = loopEnd > loopStart && loopStart > 0 ? loopStart : 0;
      sampleDefs.push({
        pcmData: pcm,
        loopPtr,
        length: pcm.length,
        relative: 1024,
        // default tuning
        vibratoDelay: 0,
        vibratoSpeed: 0,
        vibratoDepth: 0,
        envelopeVol: 64,
        attackSpeed: 1,
        attackVol: 64,
        decaySpeed: 0,
        decayVol: 0,
        sustainTime: 0,
        releaseSpeed: 0,
        releaseVol: 0,
        arpeggio: new Array(16).fill(0),
        arpeggioLimit: 0,
        arpeggioSpeed: 0,
        type: 0,
        // regular PCM
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
      });
    } else {
      sampleDefs.push({
        pcmData: new Uint8Array(0),
        loopPtr: 0,
        length: 0,
        relative: 1024,
        vibratoDelay: 0,
        vibratoSpeed: 0,
        vibratoDepth: 0,
        envelopeVol: 0,
        attackSpeed: 0,
        attackVol: 0,
        decaySpeed: 0,
        decayVol: 0,
        sustainTime: 0,
        releaseSpeed: 0,
        releaseVol: 0,
        arpeggio: new Array(16).fill(0),
        arpeggioLimit: 0,
        arpeggioSpeed: 0,
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
      });
      if (i < song.instruments.length) {
        warnings.push(`Instrument ${i + 1} "${inst.name}" has no sample data; exported as empty.`);
      }
    }
  }
  if (sampleDefs.length === 0) {
    warnings.push("No instruments found; file will have no samples.");
  }
  const dataPtr = 48;
  const basePtr = 48;
  const metadataStart = dataPtr + 2197;
  const tracksBase = dataPtr + 2830;
  const patternDataFileStart = tracksBase + trackDataSize;
  const patternDataOffset = patternDataFileStart - basePtr;
  const sampleDefsFileStart = patternDataFileStart + patternStreamSize;
  const sampleDataOffset = sampleDefsFileStart - basePtr;
  const sampleDefsSize = sampleDefs.length * 64;
  const pcmDataFileStart = sampleDefsFileStart + sampleDefsSize;
  let totalPcmSize = 0;
  for (const sd of sampleDefs) {
    totalPcmSize += sd.pcmData.length;
  }
  const totalSize = pcmDataFileStart + totalPcmSize;
  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);
  for (let i = 0; i < 4; i++) {
    writeU16BE(view, i * 4, 20218);
    writeU16BE(view, i * 4 + 2, 0);
  }
  const dataPtrDisplacement = dataPtr + 2197 - (16 + 2);
  writeU16BE(view, 16, 4666);
  writeU16BE(view, 18, dataPtrDisplacement & 65535);
  writeU16BE(view, 20, 45057);
  const basePtrDisplacement = basePtr - (28 + 6);
  writeU16BE(view, 28, 8522);
  writeU16BE(view, 30, 0);
  writeU16BE(view, 32, 18426);
  writeI16BE(view, 34, basePtrDisplacement);
  const numSongs = 1;
  output[metadataStart] = numSongs - 1;
  const speed = song.initialSpeed ?? 6;
  output[dataPtr + 2199] = speed & 255;
  writeU32BE(view, dataPtr + 2210, sampleDataOffset);
  writeU32BE(view, dataPtr + 2214, patternDataOffset);
  let tOff = tracksBase;
  for (let ch = 0; ch < numChannels; ch++) {
    writeU16BE(view, tOff, trackTableOffsets[ch]);
    tOff += 2;
  }
  for (let ch = 0; ch < numChannels; ch++) {
    for (let pos = 0; pos < songLen; pos++) {
      writeU16BE(view, tOff, trackDataEntries[ch][pos]);
      tOff += 2;
    }
  }
  let pOff = patternDataFileStart;
  for (const enc of encodedPatterns) {
    output.set(enc, pOff);
    pOff += enc.length;
  }
  let sOff = sampleDefsFileStart;
  let pcmAccum = 0;
  for (let i = 0; i < sampleDefs.length; i++) {
    const sd = sampleDefs[i];
    const pointer = sd.pcmData.length > 0 ? pcmDataFileStart + pcmAccum - basePtr : 0;
    writeU32BE(view, sOff, pointer);
    writeI16BE(view, sOff + 4, sd.loopPtr);
    writeU16BE(view, sOff + 6, sd.length >> 1);
    writeU16BE(view, sOff + 8, sd.relative);
    output[sOff + 10] = sd.vibratoDelay & 255;
    output[sOff + 11] = 0;
    output[sOff + 12] = sd.vibratoSpeed & 255;
    output[sOff + 13] = sd.vibratoDepth & 255;
    output[sOff + 14] = sd.envelopeVol & 255;
    output[sOff + 15] = sd.attackSpeed & 255;
    output[sOff + 16] = sd.attackVol & 255;
    output[sOff + 17] = sd.decaySpeed & 255;
    output[sOff + 18] = sd.decayVol & 255;
    output[sOff + 19] = sd.sustainTime & 255;
    output[sOff + 20] = sd.releaseSpeed & 255;
    output[sOff + 21] = sd.releaseVol & 255;
    for (let a = 0; a < 16; a++) {
      const arpVal = (sd.arpeggio[a] ?? 0) & 255;
      output[sOff + 22 + a] = arpVal;
    }
    output[sOff + 38] = sd.arpeggioSpeed & 255;
    output[sOff + 39] = sd.type & 255;
    output[sOff + 40] = sd.pulseRateNeg & 255;
    output[sOff + 41] = sd.pulseRatePos & 255;
    output[sOff + 42] = sd.pulseSpeed & 255;
    output[sOff + 43] = sd.pulsePosL & 255;
    output[sOff + 44] = sd.pulsePosH & 255;
    output[sOff + 45] = sd.pulseDelay & 255;
    output[sOff + 46] = sd.synchro & 255;
    output[sOff + 47] = sd.blendRate & 255;
    output[sOff + 48] = sd.blendDelay & 255;
    output[sOff + 49] = sd.pulseCounter & 255;
    output[sOff + 50] = sd.blendCounter & 255;
    output[sOff + 51] = sd.arpeggioLimit & 255;
    sOff += 64;
    pcmAccum += sd.pcmData.length;
  }
  let pcmOff = pcmDataFileStart;
  for (const sd of sampleDefs) {
    if (sd.pcmData.length > 0) {
      output.set(sd.pcmData, pcmOff);
      pcmOff += sd.pcmData.length;
    }
  }
  const baseName = (song.name || "untitled").replace(/[^a-zA-Z0-9_-]/g, "_");
  const blob = new Blob([output.buffer], { type: "application/octet-stream" });
  return {
    data: blob,
    filename: `${baseName}.fred`,
    warnings
  };
}
export {
  exportFredEditor
};
