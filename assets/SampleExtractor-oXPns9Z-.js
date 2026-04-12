function detectFormat(data) {
  if (data.length > 1084) {
    const sig = String.fromCharCode(data[1080], data[1081], data[1082], data[1083]);
    if (["M.K.", "M!K!", "4CHN", "6CHN", "8CHN", "FLT4", "FLT8"].includes(sig)) {
      return "MOD";
    }
    if (sig.match(/^\d\dCH$/)) {
      return "MOD";
    }
  }
  if (data.length > 17) {
    const xmSig = String.fromCharCode(...data.slice(0, 17));
    if (xmSig === "Extended Module: ") {
      return "XM";
    }
  }
  if (data.length > 48 && data[44] === 26 && data[45] === 16) {
    if (data[29] === 16) {
      return "S3M";
    }
  }
  if (data.length > 4) {
    const itSig = String.fromCharCode(data[0], data[1], data[2], data[3]);
    if (itSig === "IMPM") {
      return "IT";
    }
  }
  return null;
}
function readString(data, offset, length) {
  let str = "";
  for (let i = 0; i < length; i++) {
    const char = data[offset + i];
    if (char === 0) break;
    str += String.fromCharCode(char);
  }
  return str.trim();
}
function readWord(data, offset) {
  return data[offset] | data[offset + 1] << 8;
}
function readDword(data, offset) {
  return data[offset] | data[offset + 1] << 8 | data[offset + 2] << 16 | data[offset + 3] << 24;
}
function extractMOD(data) {
  const title = readString(data, 0, 20);
  const samples = [];
  const sampleHeaders = [];
  for (let i = 0; i < 31; i++) {
    const offset = 20 + i * 30;
    const name = readString(data, offset, 22);
    const length = (data[offset + 22] << 8 | data[offset + 23]) * 2;
    const fineTune = data[offset + 24] & 15;
    const volume = data[offset + 25];
    const loopStart = (data[offset + 26] << 8 | data[offset + 27]) * 2;
    const loopLength = (data[offset + 28] << 8 | data[offset + 29]) * 2;
    sampleHeaders.push({ name, length, fineTune, volume, loopStart, loopLength });
  }
  const songLength = data[950];
  const patternOrder = data.slice(952, 952 + 128);
  let maxPattern = 0;
  for (let i = 0; i < songLength; i++) {
    if (patternOrder[i] > maxPattern) {
      maxPattern = patternOrder[i];
    }
  }
  const sig = String.fromCharCode(data[1080], data[1081], data[1082], data[1083]);
  let numChannels = 4;
  if (sig === "6CHN") numChannels = 6;
  else if (sig === "8CHN" || sig === "FLT8") numChannels = 8;
  else if (sig.match(/^\d\dCH$/)) {
    numChannels = parseInt(sig.substring(0, 2), 10);
  }
  const patternDataSize = (maxPattern + 1) * 64 * numChannels * 4;
  let sampleDataOffset = 1084 + patternDataSize;
  for (let i = 0; i < 31; i++) {
    const header = sampleHeaders[i];
    if (header.length === 0) continue;
    const pcmData = new Float32Array(header.length);
    for (let j = 0; j < header.length; j++) {
      const byte = data[sampleDataOffset + j];
      const signed = byte > 127 ? byte - 256 : byte;
      pcmData[j] = signed / 128;
    }
    let loopType = "none";
    if (header.loopLength > 2) {
      loopType = "forward";
    }
    samples.push({
      name: header.name || `Sample ${i + 1}`,
      sampleRate: 8363,
      // Standard Amiga sample rate
      channels: 1,
      bitDepth: 8,
      pcmData,
      loopStart: header.loopStart,
      loopEnd: header.loopStart + header.loopLength,
      loopType,
      baseNote: "C-4",
      fineTune: header.fineTune > 7 ? header.fineTune - 16 : header.fineTune,
      volume: header.volume
    });
    sampleDataOffset += header.length;
  }
  return { samples, format: "MOD", title };
}
function extractXM(data) {
  const title = readString(data, 17, 20);
  const samples = [];
  const headerSize = readDword(data, 60);
  const numInstruments = readWord(data, 72);
  let offset = 60 + headerSize;
  for (let instIdx = 0; instIdx < numInstruments; instIdx++) {
    if (offset >= data.length) break;
    const instHeaderSize = readDword(data, offset);
    const instName = readString(data, offset + 4, 22);
    const numSamples = readWord(data, offset + 27);
    if (numSamples === 0) {
      offset += instHeaderSize;
      continue;
    }
    const sampleHeaderSize = readDword(data, offset + 29);
    offset += instHeaderSize;
    const sampleInfos = [];
    for (let smpIdx = 0; smpIdx < numSamples; smpIdx++) {
      if (offset + 40 > data.length) break;
      sampleInfos.push({
        length: readDword(data, offset),
        loopStart: readDword(data, offset + 4),
        loopLength: readDword(data, offset + 8),
        volume: data[offset + 12],
        fineTune: data[offset + 13] > 127 ? data[offset + 13] - 256 : data[offset + 13],
        type: data[offset + 14],
        pan: data[offset + 15],
        relNote: data[offset + 16] > 127 ? data[offset + 16] - 256 : data[offset + 16],
        name: readString(data, offset + 18, 22)
      });
      offset += sampleHeaderSize;
    }
    for (let smpIdx = 0; smpIdx < numSamples; smpIdx++) {
      const info = sampleInfos[smpIdx];
      if (info.length === 0) continue;
      const is16Bit = (info.type & 16) !== 0;
      const numSamples16 = is16Bit ? info.length / 2 : info.length;
      const pcmData = new Float32Array(numSamples16);
      if (is16Bit) {
        let prev = 0;
        for (let j = 0; j < numSamples16; j++) {
          const delta = readWord(data, offset + j * 2);
          const signed = delta > 32767 ? delta - 65536 : delta;
          prev += signed;
          if (prev > 32767) prev -= 65536;
          if (prev < -32768) prev += 65536;
          pcmData[j] = prev / 32768;
        }
        offset += info.length;
      } else {
        let prev = 0;
        for (let j = 0; j < info.length; j++) {
          const delta = data[offset + j];
          const signed = delta > 127 ? delta - 256 : delta;
          prev += signed;
          if (prev > 127) prev -= 256;
          if (prev < -128) prev += 256;
          pcmData[j] = prev / 128;
        }
        offset += info.length;
      }
      let loopType = "none";
      if ((info.type & 3) === 1) loopType = "forward";
      else if ((info.type & 3) === 2) loopType = "pingpong";
      samples.push({
        name: info.name || instName || `Sample ${samples.length + 1}`,
        sampleRate: 8363,
        // Will be adjusted by relNote
        channels: 1,
        bitDepth: is16Bit ? 16 : 8,
        pcmData,
        loopStart: is16Bit ? info.loopStart / 2 : info.loopStart,
        loopEnd: is16Bit ? (info.loopStart + info.loopLength) / 2 : info.loopStart + info.loopLength,
        loopType,
        baseNote: "C-4",
        fineTune: info.fineTune,
        volume: info.volume
      });
    }
  }
  return { samples, format: "XM", title };
}
function extractS3M(data) {
  const title = readString(data, 0, 28);
  const samples = [];
  const numInstruments = readWord(data, 34);
  const instrumentPointers = [];
  for (let i = 0; i < numInstruments; i++) {
    instrumentPointers.push(readWord(data, 96 + i * 2) * 16);
  }
  for (let i = 0; i < numInstruments; i++) {
    const instOffset = instrumentPointers[i];
    if (instOffset === 0 || instOffset >= data.length) continue;
    const type = data[instOffset];
    if (type !== 1) continue;
    const name = readString(data, instOffset + 48, 28);
    const length = readWord(data, instOffset + 16) | data[instOffset + 18] << 16;
    const loopStart = readWord(data, instOffset + 20) | data[instOffset + 22] << 16;
    const loopEnd = readWord(data, instOffset + 24) | data[instOffset + 26] << 16;
    const volume = data[instOffset + 28];
    const flags = data[instOffset + 31];
    const c4Speed = readDword(data, instOffset + 32);
    const samplePtrHigh = data[instOffset + 13];
    const samplePtrLow = readWord(data, instOffset + 14);
    const sampleOffset = (samplePtrHigh << 16 | samplePtrLow) * 16;
    if (length === 0 || sampleOffset >= data.length) continue;
    const is16Bit = (flags & 4) !== 0;
    const isStereo = (flags & 2) !== 0;
    const isLooped = (flags & 1) !== 0;
    const numChannels = isStereo ? 2 : 1;
    const bytesPerSample = is16Bit ? 2 : 1;
    const totalSamples = length / (bytesPerSample * numChannels);
    const pcmData = new Float32Array(totalSamples);
    if (is16Bit) {
      for (let j = 0; j < totalSamples; j++) {
        const val = readWord(data, sampleOffset + j * 2);
        pcmData[j] = (val - 32768) / 32768;
      }
    } else {
      for (let j = 0; j < totalSamples; j++) {
        const val = data[sampleOffset + j];
        pcmData[j] = (val - 128) / 128;
      }
    }
    samples.push({
      name: name || `Sample ${i + 1}`,
      sampleRate: c4Speed || 8363,
      channels: 1,
      // We only handle mono for now
      bitDepth: is16Bit ? 16 : 8,
      pcmData,
      // S3M stores loop points in bytes, convert to samples for 16-bit
      loopStart: isLooped ? is16Bit ? loopStart / 2 : loopStart : void 0,
      loopEnd: isLooped ? is16Bit ? loopEnd / 2 : loopEnd : void 0,
      loopType: isLooped ? "forward" : "none",
      baseNote: "C-4",
      volume
    });
  }
  return { samples, format: "S3M", title };
}
function extractIT(data) {
  const title = readString(data, 4, 26);
  const samples = [];
  const numOrders = readWord(data, 32);
  const numInstruments = readWord(data, 34);
  const numSamples = readWord(data, 36);
  const ordersStart = 192;
  const instPtrsStart = ordersStart + numOrders;
  const smpPtrsStart = instPtrsStart + numInstruments * 4;
  for (let i = 0; i < numSamples; i++) {
    const smpOffset = readDword(data, smpPtrsStart + i * 4);
    if (smpOffset === 0 || smpOffset + 80 > data.length) continue;
    const sig = String.fromCharCode(data[smpOffset], data[smpOffset + 1], data[smpOffset + 2], data[smpOffset + 3]);
    if (sig !== "IMPS") continue;
    const flags = data[smpOffset + 18];
    const convertFlags = data[smpOffset + 46];
    const name = readString(data, smpOffset + 20, 26);
    const defaultVol = data[smpOffset + 19];
    const length = readDword(data, smpOffset + 48);
    const loopBegin = readDword(data, smpOffset + 52);
    const loopEnd = readDword(data, smpOffset + 56);
    const c5Speed = readDword(data, smpOffset + 60);
    const samplePtr = readDword(data, smpOffset + 72);
    const hasSampleData = (flags & 1) !== 0;
    const is16Bit = (flags & 2) !== 0;
    const isStereo = (flags & 4) !== 0;
    const isCompressed = (flags & 8) !== 0;
    const isLooped = (flags & 16) !== 0;
    const isPingPong = (flags & 32) !== 0;
    const isSigned = (convertFlags & 1) !== 0;
    const isDeltaEncoded = (convertFlags & 4) !== 0;
    if (!hasSampleData || length === 0 || samplePtr === 0) continue;
    if (isCompressed) {
      continue;
    }
    const bytesPerSample = is16Bit ? 2 : 1;
    const numChannels = isStereo ? 2 : 1;
    const byteLength = length * bytesPerSample * numChannels;
    if (samplePtr + byteLength > data.length) continue;
    const pcmData = new Float32Array(length);
    if (is16Bit) {
      let prev = 0;
      for (let j = 0; j < length; j++) {
        let val = readWord(data, samplePtr + j * 2);
        if (isDeltaEncoded) {
          const signedDelta = val > 32767 ? val - 65536 : val;
          prev = prev + signedDelta & 65535;
          val = prev;
        }
        pcmData[j] = isSigned ? (val > 32767 ? val - 65536 : val) / 32768 : (val - 32768) / 32768;
      }
    } else {
      let prev = 0;
      for (let j = 0; j < length; j++) {
        let val = data[samplePtr + j];
        if (isDeltaEncoded) {
          const signedDelta = val > 127 ? val - 256 : val;
          prev = prev + signedDelta & 255;
          val = prev;
        }
        pcmData[j] = isSigned ? (val > 127 ? val - 256 : val) / 128 : (val - 128) / 128;
      }
    }
    let loopType = "none";
    if (isLooped) loopType = isPingPong ? "pingpong" : "forward";
    samples.push({
      name: name || `Sample ${i + 1}`,
      sampleRate: c5Speed || 8363,
      channels: 1,
      // Only mono extraction supported
      bitDepth: is16Bit ? 16 : 8,
      pcmData,
      loopStart: isLooped ? loopBegin : void 0,
      loopEnd: isLooped ? loopEnd : void 0,
      loopType,
      baseNote: "C-5",
      volume: defaultVol
    });
  }
  return { samples, format: "IT", title };
}
async function extractSamples(file) {
  const buffer = await file.arrayBuffer();
  const data = new Uint8Array(buffer);
  const format = detectFormat(data);
  if (!format) {
    throw new Error("Unknown or unsupported module format");
  }
  switch (format) {
    case "MOD":
      return extractMOD(data);
    case "XM":
      return extractXM(data);
    case "S3M":
      return extractS3M(data);
    case "IT":
      return extractIT(data);
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}
function canExtractSamples(filename) {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf("."));
  return [".mod", ".xm", ".s3m", ".it"].includes(ext);
}
export {
  canExtractSamples,
  extractSamples
};
