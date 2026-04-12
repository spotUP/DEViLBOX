const symbol = Symbol;
const mappingJoin = ", ";
const channelMappings = (() => {
  const front = "front";
  const side = "side";
  const rear = "rear";
  const left = "left";
  const center = "center";
  const right = "right";
  return ["", front + " ", side + " ", rear + " "].map(
    (x) => [
      [left, right],
      [left, right, center],
      [left, center, right],
      [center, left, right],
      [center]
    ].flatMap((y) => y.map((z) => x + z).join(mappingJoin))
  );
})();
const lfe = "LFE";
const monophonic = "monophonic (mono)";
const stereo = "stereo";
const surround = "surround";
const getChannelMapping = (channelCount, ...mappings) => `${[
  monophonic,
  stereo,
  `linear ${surround}`,
  "quadraphonic",
  `5.0 ${surround}`,
  `5.1 ${surround}`,
  `6.1 ${surround}`,
  `7.1 ${surround}`
][channelCount - 1]} (${mappings.join(mappingJoin)})`;
const vorbisOpusChannelMapping = [
  monophonic,
  getChannelMapping(2, channelMappings[0][0]),
  getChannelMapping(3, channelMappings[0][2]),
  getChannelMapping(4, channelMappings[1][0], channelMappings[3][0]),
  getChannelMapping(5, channelMappings[1][2], channelMappings[3][0]),
  getChannelMapping(6, channelMappings[1][2], channelMappings[3][0], lfe),
  getChannelMapping(7, channelMappings[1][2], channelMappings[2][0], channelMappings[3][4], lfe),
  getChannelMapping(8, channelMappings[1][2], channelMappings[2][0], channelMappings[3][0], lfe)
];
const rate192000 = 192e3;
const rate176400 = 176400;
const rate96000 = 96e3;
const rate88200 = 88200;
const rate64000 = 64e3;
const rate48000 = 48e3;
const rate44100 = 44100;
const rate32000 = 32e3;
const rate24000 = 24e3;
const rate22050 = 22050;
const rate16000 = 16e3;
const rate12000 = 12e3;
const rate11025 = 11025;
const rate8000 = 8e3;
const rate7350 = 7350;
const absoluteGranulePosition = "absoluteGranulePosition";
const bandwidth = "bandwidth";
const bitDepth = "bitDepth";
const bitrate = "bitrate";
const bitrateMaximum = bitrate + "Maximum";
const bitrateMinimum = bitrate + "Minimum";
const bitrateNominal = bitrate + "Nominal";
const buffer = "buffer";
const bufferFullness = buffer + "Fullness";
const codec = "codec";
const codecFrames$1 = codec + "Frames";
const coupledStreamCount = "coupledStreamCount";
const crc = "crc";
const crc16 = crc + "16";
const crc32 = crc + "32";
const data$1 = "data";
const description = "description";
const duration = "duration";
const emphasis = "emphasis";
const hasOpusPadding = "hasOpusPadding";
const header$1 = "header";
const isContinuedPacket = "isContinuedPacket";
const isCopyrighted = "isCopyrighted";
const isFirstPage = "isFirstPage";
const isHome = "isHome";
const isLastPage$1 = "isLastPage";
const isOriginal = "isOriginal";
const isPrivate = "isPrivate";
const isVbr = "isVbr";
const layer = "layer";
const length = "length";
const mode = "mode";
const modeExtension = mode + "Extension";
const mpeg = "mpeg";
const mpegVersion = mpeg + "Version";
const numberAACFrames = "numberAACFrames";
const outputGain = "outputGain";
const preSkip = "preSkip";
const profile = "profile";
const profileBits = symbol();
const protection = "protection";
const rawData = "rawData";
const segments = "segments";
const subarray = "subarray";
const version = "version";
const vorbis = "vorbis";
const vorbisComments = vorbis + "Comments";
const vorbisSetup$1 = vorbis + "Setup";
const block = "block";
const blockingStrategy = block + "ingStrategy";
const blockingStrategyBits = symbol();
const blockSize = block + "Size";
const blocksize0 = block + "size0";
const blocksize1 = block + "size1";
const blockSizeBits = symbol();
const channel = "channel";
const channelMappingFamily = channel + "MappingFamily";
const channelMappingTable = channel + "MappingTable";
const channelMode = channel + "Mode";
const channelModeBits = symbol();
const channels = channel + "s";
const copyright = "copyright";
const copyrightId = copyright + "Id";
const copyrightIdStart = copyright + "IdStart";
const frame = "frame";
const frameCount = frame + "Count";
const frameLength = frame + "Length";
const Number$1 = "Number";
const frameNumber = frame + Number$1;
const framePadding = frame + "Padding";
const frameSize = frame + "Size";
const Rate = "Rate";
const inputSampleRate = "inputSample" + Rate;
const page = "page";
const pageChecksum = page + "Checksum";
const pageSegmentBytes = symbol();
const pageSegmentTable = page + "SegmentTable";
const pageSequenceNumber = page + "Sequence" + Number$1;
const sample = "sample";
const sampleNumber = sample + Number$1;
const sampleRate = sample + Rate;
const sampleRateBits = symbol();
const samples = sample + "s";
const stream = "stream";
const streamCount = stream + "Count";
const streamInfo = stream + "Info";
const streamSerialNumber = stream + "Serial" + Number$1;
const streamStructureVersion = stream + "StructureVersion";
const total = "total";
const totalBytesOut = total + "BytesOut";
const totalDuration = total + "Duration";
const totalSamples$1 = total + "Samples";
const readRawData = symbol();
const incrementRawData = symbol();
const mapCodecFrameStats = symbol();
const mapFrameStats = symbol();
const logWarning = symbol();
const logError$1 = symbol();
const syncFrame = symbol();
const fixedLengthFrameSync = symbol();
const getHeader = symbol();
const setHeader = symbol();
const getFrame = symbol();
const parseFrame = symbol();
const parseOggPage = symbol();
const checkCodecUpdate = symbol();
const reset = symbol();
const enable = symbol();
const getHeaderFromUint8Array = symbol();
const checkFrameFooterCrc16 = symbol();
const uint8Array = Uint8Array;
const dataView = DataView;
const reserved = "reserved";
const bad = "bad";
const free = "free";
const none = "none";
const sixteenBitCRC = "16bit CRC";
const getCrcTable = (crcTable, crcInitialValueFunction, crcFunction) => {
  for (let byte = 0; byte < crcTable[length]; byte++) {
    let crc2 = crcInitialValueFunction(byte);
    for (let bit = 8; bit > 0; bit--) crc2 = crcFunction(crc2);
    crcTable[byte] = crc2;
  }
  return crcTable;
};
const crc8Table = getCrcTable(
  new uint8Array(256),
  (b) => b,
  (crc2) => crc2 & 128 ? 7 ^ crc2 << 1 : crc2 << 1
);
const flacCrc16Table = [
  getCrcTable(
    new Uint16Array(256),
    (b) => b << 8,
    (crc2) => crc2 << 1 ^ (crc2 & 1 << 15 ? 32773 : 0)
  )
];
const crc32Table = [
  getCrcTable(
    new Uint32Array(256),
    (b) => b,
    (crc2) => crc2 >>> 1 ^ (crc2 & 1) * 3988292384
  )
];
for (let i = 0; i < 15; i++) {
  flacCrc16Table.push(new Uint16Array(256));
  crc32Table.push(new Uint32Array(256));
  for (let j = 0; j <= 255; j++) {
    flacCrc16Table[i + 1][j] = flacCrc16Table[0][flacCrc16Table[i][j] >>> 8] ^ flacCrc16Table[i][j] << 8;
    crc32Table[i + 1][j] = crc32Table[i][j] >>> 8 ^ crc32Table[0][crc32Table[i][j] & 255];
  }
}
const crc8 = (data2) => {
  let crc2 = 0;
  const dataLength = data2[length];
  for (let i = 0; i !== dataLength; i++) crc2 = crc8Table[crc2 ^ data2[i]];
  return crc2;
};
const flacCrc16 = (data2) => {
  const dataLength = data2[length];
  const crcChunkSize = dataLength - 16;
  let crc2 = 0;
  let i = 0;
  while (i <= crcChunkSize) {
    crc2 ^= data2[i++] << 8 | data2[i++];
    crc2 = flacCrc16Table[15][crc2 >> 8] ^ flacCrc16Table[14][crc2 & 255] ^ flacCrc16Table[13][data2[i++]] ^ flacCrc16Table[12][data2[i++]] ^ flacCrc16Table[11][data2[i++]] ^ flacCrc16Table[10][data2[i++]] ^ flacCrc16Table[9][data2[i++]] ^ flacCrc16Table[8][data2[i++]] ^ flacCrc16Table[7][data2[i++]] ^ flacCrc16Table[6][data2[i++]] ^ flacCrc16Table[5][data2[i++]] ^ flacCrc16Table[4][data2[i++]] ^ flacCrc16Table[3][data2[i++]] ^ flacCrc16Table[2][data2[i++]] ^ flacCrc16Table[1][data2[i++]] ^ flacCrc16Table[0][data2[i++]];
  }
  while (i !== dataLength)
    crc2 = (crc2 & 255) << 8 ^ flacCrc16Table[0][crc2 >> 8 ^ data2[i++]];
  return crc2;
};
const crc32Function = (data2) => {
  const dataLength = data2[length];
  const crcChunkSize = dataLength - 16;
  let crc2 = 0;
  let i = 0;
  while (i <= crcChunkSize)
    crc2 = crc32Table[15][(data2[i++] ^ crc2) & 255] ^ crc32Table[14][(data2[i++] ^ crc2 >>> 8) & 255] ^ crc32Table[13][(data2[i++] ^ crc2 >>> 16) & 255] ^ crc32Table[12][data2[i++] ^ crc2 >>> 24] ^ crc32Table[11][data2[i++]] ^ crc32Table[10][data2[i++]] ^ crc32Table[9][data2[i++]] ^ crc32Table[8][data2[i++]] ^ crc32Table[7][data2[i++]] ^ crc32Table[6][data2[i++]] ^ crc32Table[5][data2[i++]] ^ crc32Table[4][data2[i++]] ^ crc32Table[3][data2[i++]] ^ crc32Table[2][data2[i++]] ^ crc32Table[1][data2[i++]] ^ crc32Table[0][data2[i++]];
  while (i !== dataLength)
    crc2 = crc32Table[0][(crc2 ^ data2[i++]) & 255] ^ crc2 >>> 8;
  return crc2 ^ -1;
};
const concatBuffers = (...buffers) => {
  const buffer2 = new uint8Array(
    buffers.reduce((acc, buf) => acc + buf[length], 0)
  );
  buffers.reduce((offset, buf) => {
    buffer2.set(buf, offset);
    return offset + buf[length];
  }, 0);
  return buffer2;
};
const bytesToString = (bytes) => String.fromCharCode(...bytes);
const reverseTable = [0, 8, 4, 12, 2, 10, 6, 14, 1, 9, 5, 13, 3, 11, 7, 15];
const reverse = (val) => reverseTable[val & 15] << 4 | reverseTable[val >> 4];
class BitReader {
  constructor(data2) {
    this._data = data2;
    this._pos = data2[length] * 8;
  }
  set position(position) {
    this._pos = position;
  }
  get position() {
    return this._pos;
  }
  read(bits) {
    const byte = Math.floor(this._pos / 8);
    const bit = this._pos % 8;
    this._pos -= bits;
    const window = (reverse(this._data[byte - 1]) << 8) + reverse(this._data[byte]);
    return window >> 7 - bit & 255;
  }
}
const readInt64le = (view, offset) => {
  try {
    return view.getBigInt64(offset, true);
  } catch {
    const sign = view.getUint8(offset + 7) & 128 ? -1 : 1;
    let firstPart = view.getUint32(offset, true);
    let secondPart = view.getUint32(offset + 4, true);
    if (sign === -1) {
      firstPart = ~firstPart + 1;
      secondPart = ~secondPart + 1;
    }
    if (secondPart > 1048575) {
      console.warn("This platform does not support BigInt");
    }
    return sign * (firstPart + secondPart * 2 ** 32);
  }
};
class HeaderCache {
  constructor(onCodecHeader, onCodecUpdate) {
    this._onCodecHeader = onCodecHeader;
    this._onCodecUpdate = onCodecUpdate;
    this[reset]();
  }
  [enable]() {
    this._isEnabled = true;
  }
  [reset]() {
    this._headerCache = /* @__PURE__ */ new Map();
    this._codecUpdateData = /* @__PURE__ */ new WeakMap();
    this._codecHeaderSent = false;
    this._codecShouldUpdate = false;
    this._bitrate = null;
    this._isEnabled = false;
  }
  [checkCodecUpdate](bitrate2, totalDuration2) {
    if (this._onCodecUpdate) {
      if (this._bitrate !== bitrate2) {
        this._bitrate = bitrate2;
        this._codecShouldUpdate = true;
      }
      const codecData = this._codecUpdateData.get(
        this._headerCache.get(this._currentHeader)
      );
      if (this._codecShouldUpdate && codecData) {
        this._onCodecUpdate(
          {
            bitrate: bitrate2,
            ...codecData
          },
          totalDuration2
        );
      }
      this._codecShouldUpdate = false;
    }
  }
  [getHeader](key) {
    const header2 = this._headerCache.get(key);
    if (header2) {
      this._updateCurrentHeader(key);
    }
    return header2;
  }
  [setHeader](key, header2, codecUpdateFields) {
    if (this._isEnabled) {
      if (!this._codecHeaderSent) {
        this._onCodecHeader({ ...header2 });
        this._codecHeaderSent = true;
      }
      this._updateCurrentHeader(key);
      this._headerCache.set(key, header2);
      this._codecUpdateData.set(header2, codecUpdateFields);
    }
  }
  _updateCurrentHeader(key) {
    if (this._onCodecUpdate && key !== this._currentHeader) {
      this._codecShouldUpdate = true;
      this._currentHeader = key;
    }
  }
}
const headerStore = /* @__PURE__ */ new WeakMap();
const frameStore = /* @__PURE__ */ new WeakMap();
class Parser {
  constructor(codecParser, headerCache) {
    this._codecParser = codecParser;
    this._headerCache = headerCache;
  }
  *[syncFrame]() {
    let frameData;
    do {
      frameData = yield* this.Frame[getFrame](
        this._codecParser,
        this._headerCache,
        0
      );
      if (frameData) return frameData;
      this._codecParser[incrementRawData](1);
    } while (true);
  }
  /**
   * @description Searches for Frames within bytes containing a sequence of known codec frames.
   * @param {boolean} ignoreNextFrame Set to true to return frames even if the next frame may not exist at the expected location
   * @returns {Frame}
   */
  *[fixedLengthFrameSync](ignoreNextFrame) {
    let frameData = yield* this[syncFrame]();
    const frameLength2 = frameStore.get(frameData)[length];
    if (ignoreNextFrame || this._codecParser._flushing || // check if there is a frame right after this one
    (yield* this.Header[getHeader](
      this._codecParser,
      this._headerCache,
      frameLength2
    ))) {
      this._headerCache[enable]();
      this._codecParser[incrementRawData](frameLength2);
      this._codecParser[mapFrameStats](frameData);
      return frameData;
    }
    this._codecParser[logWarning](
      `Missing ${frame} at ${frameLength2} bytes from current position.`,
      `Dropping current ${frame} and trying again.`
    );
    this._headerCache[reset]();
    this._codecParser[incrementRawData](1);
  }
}
class Frame {
  constructor(headerValue, dataValue) {
    frameStore.set(this, { [header$1]: headerValue });
    this[data$1] = dataValue;
  }
}
class CodecFrame extends Frame {
  static *[getFrame](Header, Frame2, codecParser, headerCache, readOffset) {
    const headerValue = yield* Header[getHeader](
      codecParser,
      headerCache,
      readOffset
    );
    if (headerValue) {
      const frameLengthValue = headerStore.get(headerValue)[frameLength];
      const samplesValue = headerStore.get(headerValue)[samples];
      const frame2 = (yield* codecParser[readRawData](
        frameLengthValue,
        readOffset
      ))[subarray](0, frameLengthValue);
      return new Frame2(headerValue, frame2, samplesValue);
    } else {
      return null;
    }
  }
  constructor(headerValue, dataValue, samplesValue) {
    super(headerValue, dataValue);
    this[header$1] = headerValue;
    this[samples] = samplesValue;
    this[duration] = samplesValue / headerValue[sampleRate] * 1e3;
    this[frameNumber] = null;
    this[totalBytesOut] = null;
    this[totalSamples$1] = null;
    this[totalDuration] = null;
    frameStore.get(this)[length] = dataValue[length];
  }
}
const unsynchronizationFlag = "unsynchronizationFlag";
const extendedHeaderFlag = "extendedHeaderFlag";
const experimentalFlag = "experimentalFlag";
const footerPresent = "footerPresent";
class ID3v2 {
  static *getID3v2Header(codecParser, headerCache, readOffset) {
    const headerLength = 10;
    const header2 = {};
    let data2 = yield* codecParser[readRawData](3, readOffset);
    if (data2[0] !== 73 || data2[1] !== 68 || data2[2] !== 51) return null;
    data2 = yield* codecParser[readRawData](headerLength, readOffset);
    header2[version] = `id3v2.${data2[3]}.${data2[4]}`;
    if (data2[5] & 15) return null;
    header2[unsynchronizationFlag] = !!(data2[5] & 128);
    header2[extendedHeaderFlag] = !!(data2[5] & 64);
    header2[experimentalFlag] = !!(data2[5] & 32);
    header2[footerPresent] = !!(data2[5] & 16);
    if (data2[6] & 128 || data2[7] & 128 || data2[8] & 128 || data2[9] & 128)
      return null;
    const dataLength = data2[6] << 21 | data2[7] << 14 | data2[8] << 7 | data2[9];
    header2[length] = headerLength + dataLength;
    return new ID3v2(header2);
  }
  constructor(header2) {
    this[version] = header2[version];
    this[unsynchronizationFlag] = header2[unsynchronizationFlag];
    this[extendedHeaderFlag] = header2[extendedHeaderFlag];
    this[experimentalFlag] = header2[experimentalFlag];
    this[footerPresent] = header2[footerPresent];
    this[length] = header2[length];
  }
}
class CodecHeader {
  /**
   * @private
   */
  constructor(header2) {
    headerStore.set(this, header2);
    this[bitDepth] = header2[bitDepth];
    this[bitrate] = null;
    this[channels] = header2[channels];
    this[channelMode] = header2[channelMode];
    this[sampleRate] = header2[sampleRate];
  }
}
const bitrateMatrix = {
  // bits | V1,L1 | V1,L2 | V1,L3 | V2,L1 | V2,L2 & L3
  0: [free, free, free, free, free],
  16: [32, 32, 32, 32, 8],
  // 0b00100000: [64,   48,  40,  48,  16,],
  // 0b00110000: [96,   56,  48,  56,  24,],
  // 0b01000000: [128,  64,  56,  64,  32,],
  // 0b01010000: [160,  80,  64,  80,  40,],
  // 0b01100000: [192,  96,  80,  96,  48,],
  // 0b01110000: [224, 112,  96, 112,  56,],
  // 0b10000000: [256, 128, 112, 128,  64,],
  // 0b10010000: [288, 160, 128, 144,  80,],
  // 0b10100000: [320, 192, 160, 160,  96,],
  // 0b10110000: [352, 224, 192, 176, 112,],
  // 0b11000000: [384, 256, 224, 192, 128,],
  // 0b11010000: [416, 320, 256, 224, 144,],
  // 0b11100000: [448, 384, 320, 256, 160,],
  240: [bad, bad, bad, bad, bad]
};
const calcBitrate = (idx, interval, intervalOffset) => 8 * ((idx + intervalOffset) % interval + interval) * (1 << (idx + intervalOffset) / interval) - 8 * interval * (interval / 8 | 0);
for (let i = 2; i < 15; i++)
  bitrateMatrix[i << 4] = [
    i * 32,
    //                V1,L1
    calcBitrate(i, 4, 0),
    //  V1,L2
    calcBitrate(i, 4, -1),
    // V1,L3
    calcBitrate(i, 8, 4),
    //  V2,L1
    calcBitrate(i, 8, 0)
    //  V2,L2 & L3
  ];
const v1Layer1 = 0;
const v1Layer2 = 1;
const v1Layer3 = 2;
const v2Layer1 = 3;
const v2Layer23 = 4;
const bands = "bands ";
const to31 = " to 31";
const layer12ModeExtensions = {
  0: bands + 4 + to31,
  16: bands + 8 + to31,
  32: bands + 12 + to31,
  48: bands + 16 + to31
};
const bitrateIndex = "bitrateIndex";
const v2 = "v2";
const v1 = "v1";
const intensityStereo = "Intensity stereo ";
const msStereo = ", MS stereo ";
const on = "on";
const off = "off";
const layer3ModeExtensions = {
  0: intensityStereo + off + msStereo + off,
  16: intensityStereo + on + msStereo + off,
  32: intensityStereo + off + msStereo + on,
  48: intensityStereo + on + msStereo + on
};
const layersValues = {
  0: { [description]: reserved },
  2: {
    [description]: "Layer III",
    [framePadding]: 1,
    [modeExtension]: layer3ModeExtensions,
    [v1]: {
      [bitrateIndex]: v1Layer3,
      [samples]: 1152
    },
    [v2]: {
      [bitrateIndex]: v2Layer23,
      [samples]: 576
    }
  },
  4: {
    [description]: "Layer II",
    [framePadding]: 1,
    [modeExtension]: layer12ModeExtensions,
    [samples]: 1152,
    [v1]: {
      [bitrateIndex]: v1Layer2
    },
    [v2]: {
      [bitrateIndex]: v2Layer23
    }
  },
  6: {
    [description]: "Layer I",
    [framePadding]: 4,
    [modeExtension]: layer12ModeExtensions,
    [samples]: 384,
    [v1]: {
      [bitrateIndex]: v1Layer1
    },
    [v2]: {
      [bitrateIndex]: v2Layer1
    }
  }
};
const mpegVersionDescription = "MPEG Version ";
const isoIec = "ISO/IEC ";
const mpegVersions = {
  0: {
    [description]: `${mpegVersionDescription}2.5 (later extension of MPEG 2)`,
    [layer]: v2,
    [sampleRate]: {
      0: rate11025,
      4: rate12000,
      8: rate8000,
      12: reserved
    }
  },
  8: { [description]: reserved },
  16: {
    [description]: `${mpegVersionDescription}2 (${isoIec}13818-3)`,
    [layer]: v2,
    [sampleRate]: {
      0: rate22050,
      4: rate24000,
      8: rate16000,
      12: reserved
    }
  },
  24: {
    [description]: `${mpegVersionDescription}1 (${isoIec}11172-3)`,
    [layer]: v1,
    [sampleRate]: {
      0: rate44100,
      4: rate48000,
      8: rate32000,
      12: reserved
    }
  },
  length
};
const protectionValues$1 = {
  0: sixteenBitCRC,
  1: none
};
const emphasisValues = {
  0: none,
  1: "50/15 ms",
  2: reserved,
  3: "CCIT J.17"
};
const channelModes = {
  0: { [channels]: 2, [description]: stereo },
  64: { [channels]: 2, [description]: "joint " + stereo },
  128: { [channels]: 2, [description]: "dual channel" },
  192: { [channels]: 1, [description]: monophonic }
};
class MPEGHeader extends CodecHeader {
  static *[getHeader](codecParser, headerCache, readOffset) {
    const header2 = {};
    const id3v2Header = yield* ID3v2.getID3v2Header(
      codecParser,
      headerCache,
      readOffset
    );
    if (id3v2Header) {
      yield* codecParser[readRawData](id3v2Header[length], readOffset);
      codecParser[incrementRawData](id3v2Header[length]);
    }
    const data2 = yield* codecParser[readRawData](4, readOffset);
    const key = bytesToString(data2[subarray](0, 4));
    const cachedHeader = headerCache[getHeader](key);
    if (cachedHeader) return new MPEGHeader(cachedHeader);
    if (data2[0] !== 255 || data2[1] < 224) return null;
    const mpegVersionValues2 = mpegVersions[data2[1] & 24];
    if (mpegVersionValues2[description] === reserved) return null;
    const layerBits = data2[1] & 6;
    if (layersValues[layerBits][description] === reserved) return null;
    const layerValues2 = {
      ...layersValues[layerBits],
      ...layersValues[layerBits][mpegVersionValues2[layer]]
    };
    header2[mpegVersion] = mpegVersionValues2[description];
    header2[layer] = layerValues2[description];
    header2[samples] = layerValues2[samples];
    header2[protection] = protectionValues$1[data2[1] & 1];
    header2[length] = 4;
    header2[bitrate] = bitrateMatrix[data2[2] & 240][layerValues2[bitrateIndex]];
    if (header2[bitrate] === bad) return null;
    header2[sampleRate] = mpegVersionValues2[sampleRate][data2[2] & 12];
    if (header2[sampleRate] === reserved) return null;
    header2[framePadding] = data2[2] & 2 && layerValues2[framePadding];
    header2[isPrivate] = !!(data2[2] & 1);
    header2[frameLength] = Math.floor(
      125 * header2[bitrate] * header2[samples] / header2[sampleRate] + header2[framePadding]
    );
    if (!header2[frameLength]) return null;
    const channelModeBits2 = data2[3] & 192;
    header2[channelMode] = channelModes[channelModeBits2][description];
    header2[channels] = channelModes[channelModeBits2][channels];
    header2[modeExtension] = layerValues2[modeExtension][data2[3] & 48];
    header2[isCopyrighted] = !!(data2[3] & 8);
    header2[isOriginal] = !!(data2[3] & 4);
    header2[emphasis] = emphasisValues[data2[3] & 3];
    if (header2[emphasis] === reserved) return null;
    header2[bitDepth] = 16;
    {
      const { length: length2, frameLength: frameLength2, samples: samples2, ...codecUpdateFields } = header2;
      headerCache[setHeader](key, header2, codecUpdateFields);
    }
    return new MPEGHeader(header2);
  }
  /**
   * @private
   * Call MPEGHeader.getHeader(Array<Uint8>) to get instance
   */
  constructor(header2) {
    super(header2);
    this[bitrate] = header2[bitrate];
    this[emphasis] = header2[emphasis];
    this[framePadding] = header2[framePadding];
    this[isCopyrighted] = header2[isCopyrighted];
    this[isOriginal] = header2[isOriginal];
    this[isPrivate] = header2[isPrivate];
    this[layer] = header2[layer];
    this[modeExtension] = header2[modeExtension];
    this[mpegVersion] = header2[mpegVersion];
    this[protection] = header2[protection];
  }
}
class MPEGFrame extends CodecFrame {
  static *[getFrame](codecParser, headerCache, readOffset) {
    return yield* super[getFrame](
      MPEGHeader,
      MPEGFrame,
      codecParser,
      headerCache,
      readOffset
    );
  }
  constructor(header2, frame2, samples2) {
    super(header2, frame2, samples2);
  }
}
class MPEGParser extends Parser {
  constructor(codecParser, headerCache, onCodec) {
    super(codecParser, headerCache);
    this.Frame = MPEGFrame;
    this.Header = MPEGHeader;
    onCodec(this[codec]);
  }
  get [codec]() {
    return mpeg;
  }
  *[parseFrame]() {
    return yield* this[fixedLengthFrameSync]();
  }
}
const mpegVersionValues = {
  0: "MPEG-4",
  8: "MPEG-2"
};
const layerValues = {
  0: "valid",
  2: bad,
  4: bad,
  6: bad
};
const protectionValues = {
  0: sixteenBitCRC,
  1: none
};
const profileValues = {
  0: "AAC Main",
  64: "AAC LC (Low Complexity)",
  128: "AAC SSR (Scalable Sample Rate)",
  192: "AAC LTP (Long Term Prediction)"
};
const sampleRates = {
  0: rate96000,
  4: rate88200,
  8: rate64000,
  12: rate48000,
  16: rate44100,
  20: rate32000,
  24: rate24000,
  28: rate22050,
  32: rate16000,
  36: rate12000,
  40: rate11025,
  44: rate8000,
  48: rate7350,
  52: reserved,
  56: reserved,
  60: "frequency is written explicitly"
};
const channelModeValues = {
  0: { [channels]: 0, [description]: "Defined in AOT Specific Config" },
  /*
  'monophonic (mono)'
  'stereo (left, right)'
  'linear surround (front center, front left, front right)'
  'quadraphonic (front center, front left, front right, rear center)'
  '5.0 surround (front center, front left, front right, rear left, rear right)'
  '5.1 surround (front center, front left, front right, rear left, rear right, LFE)'
  '7.1 surround (front center, front left, front right, side left, side right, rear left, rear right, LFE)'
  */
  64: { [channels]: 1, [description]: monophonic },
  128: { [channels]: 2, [description]: getChannelMapping(2, channelMappings[0][0]) },
  192: { [channels]: 3, [description]: getChannelMapping(3, channelMappings[1][3]) },
  256: { [channels]: 4, [description]: getChannelMapping(4, channelMappings[1][3], channelMappings[3][4]) },
  320: { [channels]: 5, [description]: getChannelMapping(5, channelMappings[1][3], channelMappings[3][0]) },
  384: { [channels]: 6, [description]: getChannelMapping(6, channelMappings[1][3], channelMappings[3][0], lfe) },
  448: { [channels]: 8, [description]: getChannelMapping(8, channelMappings[1][3], channelMappings[2][0], channelMappings[3][0], lfe) }
};
class AACHeader extends CodecHeader {
  static *[getHeader](codecParser, headerCache, readOffset) {
    const header2 = {};
    const data2 = yield* codecParser[readRawData](7, readOffset);
    const key = bytesToString([
      data2[0],
      data2[1],
      data2[2],
      data2[3] & 252 | data2[6] & 3
      // frame length, buffer fullness varies so don't cache it
    ]);
    const cachedHeader = headerCache[getHeader](key);
    if (!cachedHeader) {
      if (data2[0] !== 255 || data2[1] < 240) return null;
      header2[mpegVersion] = mpegVersionValues[data2[1] & 8];
      header2[layer] = layerValues[data2[1] & 6];
      if (header2[layer] === bad) return null;
      const protectionBit = data2[1] & 1;
      header2[protection] = protectionValues[protectionBit];
      header2[length] = protectionBit ? 7 : 9;
      header2[profileBits] = data2[2] & 192;
      header2[sampleRateBits] = data2[2] & 60;
      const privateBit = data2[2] & 2;
      header2[profile] = profileValues[header2[profileBits]];
      header2[sampleRate] = sampleRates[header2[sampleRateBits]];
      if (header2[sampleRate] === reserved) return null;
      header2[isPrivate] = !!privateBit;
      header2[channelModeBits] = (data2[2] << 8 | data2[3]) & 448;
      header2[channelMode] = channelModeValues[header2[channelModeBits]][description];
      header2[channels] = channelModeValues[header2[channelModeBits]][channels];
      header2[isOriginal] = !!(data2[3] & 32);
      header2[isHome] = !!(data2[3] & 8);
      header2[copyrightId] = !!(data2[3] & 8);
      header2[copyrightIdStart] = !!(data2[3] & 4);
      header2[bitDepth] = 16;
      header2[samples] = 1024;
      header2[numberAACFrames] = data2[6] & 3;
      {
        const {
          length: length2,
          channelModeBits: channelModeBits2,
          profileBits: profileBits2,
          sampleRateBits: sampleRateBits2,
          frameLength: frameLength2,
          samples: samples2,
          numberAACFrames: numberAACFrames2,
          ...codecUpdateFields
        } = header2;
        headerCache[setHeader](key, header2, codecUpdateFields);
      }
    } else {
      Object.assign(header2, cachedHeader);
    }
    header2[frameLength] = (data2[3] << 11 | data2[4] << 3 | data2[5] >> 5) & 8191;
    if (!header2[frameLength]) return null;
    const bufferFullnessBits = (data2[5] << 6 | data2[6] >> 2) & 2047;
    header2[bufferFullness] = bufferFullnessBits === 2047 ? "VBR" : bufferFullnessBits;
    return new AACHeader(header2);
  }
  /**
   * @private
   * Call AACHeader.getHeader(Array<Uint8>) to get instance
   */
  constructor(header2) {
    super(header2);
    this[copyrightId] = header2[copyrightId];
    this[copyrightIdStart] = header2[copyrightIdStart];
    this[bufferFullness] = header2[bufferFullness];
    this[isHome] = header2[isHome];
    this[isOriginal] = header2[isOriginal];
    this[isPrivate] = header2[isPrivate];
    this[layer] = header2[layer];
    this[length] = header2[length];
    this[mpegVersion] = header2[mpegVersion];
    this[numberAACFrames] = header2[numberAACFrames];
    this[profile] = header2[profile];
    this[protection] = header2[protection];
  }
  get audioSpecificConfig() {
    const header2 = headerStore.get(this);
    const audioSpecificConfig = header2[profileBits] + 64 << 5 | header2[sampleRateBits] << 5 | header2[channelModeBits] >> 3;
    const bytes = new uint8Array(2);
    new dataView(bytes[buffer]).setUint16(0, audioSpecificConfig, false);
    return bytes;
  }
}
class AACFrame extends CodecFrame {
  static *[getFrame](codecParser, headerCache, readOffset) {
    return yield* super[getFrame](
      AACHeader,
      AACFrame,
      codecParser,
      headerCache,
      readOffset
    );
  }
  constructor(header2, frame2, samples2) {
    super(header2, frame2, samples2);
  }
}
class AACParser extends Parser {
  constructor(codecParser, headerCache, onCodec) {
    super(codecParser, headerCache);
    this.Frame = AACFrame;
    this.Header = AACHeader;
    onCodec(this[codec]);
  }
  get [codec]() {
    return "aac";
  }
  *[parseFrame]() {
    return yield* this[fixedLengthFrameSync]();
  }
}
class FLACFrame extends CodecFrame {
  static _getFrameFooterCrc16(data2) {
    return (data2[data2[length] - 2] << 8) + data2[data2[length] - 1];
  }
  // check frame footer crc
  // https://xiph.org/flac/format.html#frame_footer
  static [checkFrameFooterCrc16](data2) {
    const expectedCrc16 = FLACFrame._getFrameFooterCrc16(data2);
    const actualCrc16 = flacCrc16(data2[subarray](0, -2));
    return expectedCrc16 === actualCrc16;
  }
  constructor(data2, header2, streamInfoValue) {
    header2[streamInfo] = streamInfoValue;
    header2[crc16] = FLACFrame._getFrameFooterCrc16(data2);
    super(header2, data2, headerStore.get(header2)[samples]);
  }
}
const getFromStreamInfo = "get from STREAMINFO metadata block";
const blockingStrategyValues = {
  0: "Fixed",
  1: "Variable"
};
const blockSizeValues = {
  0: reserved,
  16: 192
  // 0b00100000: 576,
  // 0b00110000: 1152,
  // 0b01000000: 2304,
  // 0b01010000: 4608,
  // 0b01100000: "8-bit (blocksize-1) from end of header",
  // 0b01110000: "16-bit (blocksize-1) from end of header",
  // 0b10000000: 256,
  // 0b10010000: 512,
  // 0b10100000: 1024,
  // 0b10110000: 2048,
  // 0b11000000: 4096,
  // 0b11010000: 8192,
  // 0b11100000: 16384,
  // 0b11110000: 32768,
};
for (let i = 2; i < 16; i++)
  blockSizeValues[i << 4] = i < 6 ? 576 * 2 ** (i - 2) : 2 ** i;
const sampleRateValues = {
  0: getFromStreamInfo,
  1: rate88200,
  2: rate176400,
  3: rate192000,
  4: rate8000,
  5: rate16000,
  6: rate22050,
  7: rate24000,
  8: rate32000,
  9: rate44100,
  10: rate48000,
  11: rate96000,
  // 0b00001100: "8-bit sample rate (in kHz) from end of header",
  // 0b00001101: "16-bit sample rate (in Hz) from end of header",
  // 0b00001110: "16-bit sample rate (in tens of Hz) from end of header",
  15: bad
};
const channelAssignments = {
  /*'
  'monophonic (mono)'
  'stereo (left, right)'
  'linear surround (left, right, center)'
  'quadraphonic (front left, front right, rear left, rear right)'
  '5.0 surround (front left, front right, front center, rear left, rear right)'
  '5.1 surround (front left, front right, front center, LFE, rear left, rear right)'
  '6.1 surround (front left, front right, front center, LFE, rear center, side left, side right)'
  '7.1 surround (front left, front right, front center, LFE, rear left, rear right, side left, side right)'
  */
  0: { [channels]: 1, [description]: monophonic },
  16: { [channels]: 2, [description]: getChannelMapping(2, channelMappings[0][0]) },
  32: { [channels]: 3, [description]: getChannelMapping(3, channelMappings[0][1]) },
  48: { [channels]: 4, [description]: getChannelMapping(4, channelMappings[1][0], channelMappings[3][0]) },
  64: { [channels]: 5, [description]: getChannelMapping(5, channelMappings[1][1], channelMappings[3][0]) },
  80: { [channels]: 6, [description]: getChannelMapping(6, channelMappings[1][1], lfe, channelMappings[3][0]) },
  96: { [channels]: 7, [description]: getChannelMapping(7, channelMappings[1][1], lfe, channelMappings[3][4], channelMappings[2][0]) },
  112: { [channels]: 8, [description]: getChannelMapping(8, channelMappings[1][1], lfe, channelMappings[3][0], channelMappings[2][0]) },
  128: { [channels]: 2, [description]: `${stereo} (left, diff)` },
  144: { [channels]: 2, [description]: `${stereo} (diff, right)` },
  160: { [channels]: 2, [description]: `${stereo} (avg, diff)` },
  176: reserved,
  192: reserved,
  208: reserved,
  224: reserved,
  240: reserved
};
const bitDepthValues = {
  0: getFromStreamInfo,
  2: 8,
  4: 12,
  6: reserved,
  8: 16,
  10: 20,
  12: 24,
  14: reserved
};
class FLACHeader extends CodecHeader {
  // https://datatracker.ietf.org/doc/html/rfc3629#section-3
  //    Char. number range  |        UTF-8 octet sequence
  //    (hexadecimal)    |              (binary)
  // --------------------+---------------------------------------------
  // 0000 0000-0000 007F | 0xxxxxxx
  // 0000 0080-0000 07FF | 110xxxxx 10xxxxxx
  // 0000 0800-0000 FFFF | 1110xxxx 10xxxxxx 10xxxxxx
  // 0001 0000-0010 FFFF | 11110xxx 10xxxxxx 10xxxxxx 10xxxxxx
  static _decodeUTF8Int(data2) {
    if (data2[0] > 254) {
      return null;
    }
    if (data2[0] < 128) return { value: data2[0], length: 1 };
    let length2 = 1;
    for (let zeroMask = 64; zeroMask & data2[0]; zeroMask >>= 1) length2++;
    let idx = length2 - 1, value = 0, shift = 0;
    for (; idx > 0; shift += 6, idx--) {
      if ((data2[idx] & 192) !== 128) {
        return null;
      }
      value |= (data2[idx] & 63) << shift;
    }
    value |= (data2[idx] & 127 >> length2) << shift;
    return { value, length: length2 };
  }
  static [getHeaderFromUint8Array](data2, headerCache) {
    const codecParserStub = {
      [readRawData]: function* () {
        return data2;
      }
    };
    return FLACHeader[getHeader](codecParserStub, headerCache, 0).next().value;
  }
  static *[getHeader](codecParser, headerCache, readOffset) {
    let data2 = yield* codecParser[readRawData](6, readOffset);
    if (data2[0] !== 255 || !(data2[1] === 248 || data2[1] === 249)) {
      return null;
    }
    const header2 = {};
    const key = bytesToString(data2[subarray](0, 4));
    const cachedHeader = headerCache[getHeader](key);
    if (!cachedHeader) {
      header2[blockingStrategyBits] = data2[1] & 1;
      header2[blockingStrategy] = blockingStrategyValues[header2[blockingStrategyBits]];
      header2[blockSizeBits] = data2[2] & 240;
      header2[sampleRateBits] = data2[2] & 15;
      header2[blockSize] = blockSizeValues[header2[blockSizeBits]];
      if (header2[blockSize] === reserved) {
        return null;
      }
      header2[sampleRate] = sampleRateValues[header2[sampleRateBits]];
      if (header2[sampleRate] === bad) {
        return null;
      }
      if (data2[3] & 1) {
        return null;
      }
      const channelAssignment = channelAssignments[data2[3] & 240];
      if (channelAssignment === reserved) {
        return null;
      }
      header2[channels] = channelAssignment[channels];
      header2[channelMode] = channelAssignment[description];
      header2[bitDepth] = bitDepthValues[data2[3] & 14];
      if (header2[bitDepth] === reserved) {
        return null;
      }
    } else {
      Object.assign(header2, cachedHeader);
    }
    header2[length] = 5;
    data2 = yield* codecParser[readRawData](header2[length] + 8, readOffset);
    const decodedUtf8 = FLACHeader._decodeUTF8Int(data2[subarray](4));
    if (!decodedUtf8) {
      return null;
    }
    if (header2[blockingStrategyBits]) {
      header2[sampleNumber] = decodedUtf8.value;
    } else {
      header2[frameNumber] = decodedUtf8.value;
    }
    header2[length] += decodedUtf8[length];
    if (header2[blockSizeBits] === 96) {
      if (data2[length] < header2[length])
        data2 = yield* codecParser[readRawData](header2[length], readOffset);
      header2[blockSize] = data2[header2[length] - 1] + 1;
      header2[length] += 1;
    } else if (header2[blockSizeBits] === 112) {
      if (data2[length] < header2[length])
        data2 = yield* codecParser[readRawData](header2[length], readOffset);
      header2[blockSize] = (data2[header2[length] - 1] << 8) + data2[header2[length]] + 1;
      header2[length] += 2;
    }
    header2[samples] = header2[blockSize];
    if (header2[sampleRateBits] === 12) {
      if (data2[length] < header2[length])
        data2 = yield* codecParser[readRawData](header2[length], readOffset);
      header2[sampleRate] = data2[header2[length] - 1] * 1e3;
      header2[length] += 1;
    } else if (header2[sampleRateBits] === 13) {
      if (data2[length] < header2[length])
        data2 = yield* codecParser[readRawData](header2[length], readOffset);
      header2[sampleRate] = (data2[header2[length] - 1] << 8) + data2[header2[length]];
      header2[length] += 2;
    } else if (header2[sampleRateBits] === 14) {
      if (data2[length] < header2[length])
        data2 = yield* codecParser[readRawData](header2[length], readOffset);
      header2[sampleRate] = ((data2[header2[length] - 1] << 8) + data2[header2[length]]) * 10;
      header2[length] += 2;
    }
    if (data2[length] < header2[length])
      data2 = yield* codecParser[readRawData](header2[length], readOffset);
    header2[crc] = data2[header2[length] - 1];
    if (header2[crc] !== crc8(data2[subarray](0, header2[length] - 1))) {
      return null;
    }
    {
      if (!cachedHeader) {
        const {
          blockingStrategyBits: blockingStrategyBits2,
          frameNumber: frameNumber2,
          sampleNumber: sampleNumber2,
          samples: samples2,
          sampleRateBits: sampleRateBits2,
          blockSizeBits: blockSizeBits2,
          crc: crc2,
          length: length2,
          ...codecUpdateFields
        } = header2;
        headerCache[setHeader](key, header2, codecUpdateFields);
      }
    }
    return new FLACHeader(header2);
  }
  /**
   * @private
   * Call FLACHeader.getHeader(Array<Uint8>) to get instance
   */
  constructor(header2) {
    super(header2);
    this[crc16] = null;
    this[blockingStrategy] = header2[blockingStrategy];
    this[blockSize] = header2[blockSize];
    this[frameNumber] = header2[frameNumber];
    this[sampleNumber] = header2[sampleNumber];
    this[streamInfo] = null;
  }
}
const MIN_FLAC_FRAME_SIZE = 2;
const MAX_FLAC_FRAME_SIZE = 512 * 1024;
class FLACParser extends Parser {
  constructor(codecParser, headerCache, onCodec) {
    super(codecParser, headerCache);
    this.Frame = FLACFrame;
    this.Header = FLACHeader;
    onCodec(this[codec]);
  }
  get [codec]() {
    return "flac";
  }
  *_getNextFrameSyncOffset(offset) {
    const data2 = yield* this._codecParser[readRawData](2, 0);
    const dataLength = data2[length] - 2;
    while (offset < dataLength) {
      const firstByte = data2[offset];
      if (firstByte === 255) {
        const secondByte = data2[offset + 1];
        if (secondByte === 248 || secondByte === 249) break;
        if (secondByte !== 255) offset++;
      }
      offset++;
    }
    return offset;
  }
  *[parseFrame]() {
    do {
      const header2 = yield* FLACHeader[getHeader](
        this._codecParser,
        this._headerCache,
        0
      );
      if (header2) {
        let nextHeaderOffset = headerStore.get(header2)[length] + MIN_FLAC_FRAME_SIZE;
        while (nextHeaderOffset <= MAX_FLAC_FRAME_SIZE) {
          if (this._codecParser._flushing || (yield* FLACHeader[getHeader](
            this._codecParser,
            this._headerCache,
            nextHeaderOffset
          ))) {
            let frameData = yield* this._codecParser[readRawData](nextHeaderOffset);
            if (!this._codecParser._flushing)
              frameData = frameData[subarray](0, nextHeaderOffset);
            if (FLACFrame[checkFrameFooterCrc16](frameData)) {
              const frame2 = new FLACFrame(frameData, header2);
              this._headerCache[enable]();
              this._codecParser[incrementRawData](nextHeaderOffset);
              this._codecParser[mapFrameStats](frame2);
              return frame2;
            }
          }
          nextHeaderOffset = yield* this._getNextFrameSyncOffset(
            nextHeaderOffset + 1
          );
        }
        this._codecParser[logWarning](
          `Unable to sync FLAC frame after searching ${nextHeaderOffset} bytes.`
        );
        this._codecParser[incrementRawData](nextHeaderOffset);
      } else {
        this._codecParser[incrementRawData](
          yield* this._getNextFrameSyncOffset(1)
        );
      }
    } while (true);
  }
  [parseOggPage](oggPage) {
    if (oggPage[pageSequenceNumber] === 0) {
      this._headerCache[enable]();
      this._streamInfo = oggPage[data$1][subarray](13);
    } else if (oggPage[pageSequenceNumber] === 1) ;
    else {
      oggPage[codecFrames$1] = frameStore.get(oggPage)[segments].map((segment) => {
        const header2 = FLACHeader[getHeaderFromUint8Array](
          segment,
          this._headerCache
        );
        if (header2) {
          return new FLACFrame(segment, header2, this._streamInfo);
        } else {
          this._codecParser[logWarning](
            "Failed to parse Ogg FLAC frame",
            "Skipping invalid FLAC frame"
          );
        }
      }).filter((frame2) => !!frame2);
    }
    return oggPage;
  }
}
class OggPageHeader {
  static *[getHeader](codecParser, headerCache, readOffset) {
    const header2 = {};
    let data2 = yield* codecParser[readRawData](28, readOffset);
    if (data2[0] !== 79 || // O
    data2[1] !== 103 || // g
    data2[2] !== 103 || // g
    data2[3] !== 83) {
      return null;
    }
    header2[streamStructureVersion] = data2[4];
    const zeros = data2[5] & 248;
    if (zeros) return null;
    header2[isLastPage$1] = !!(data2[5] & 4);
    header2[isFirstPage] = !!(data2[5] & 2);
    header2[isContinuedPacket] = !!(data2[5] & 1);
    const view = new dataView(uint8Array.from(data2[subarray](0, 28))[buffer]);
    header2[absoluteGranulePosition] = readInt64le(view, 6);
    header2[streamSerialNumber] = view.getInt32(14, true);
    header2[pageSequenceNumber] = view.getInt32(18, true);
    header2[pageChecksum] = view.getInt32(22, true);
    const pageSegmentTableLength = data2[26];
    header2[length] = pageSegmentTableLength + 27;
    data2 = yield* codecParser[readRawData](header2[length], readOffset);
    header2[frameLength] = 0;
    header2[pageSegmentTable] = [];
    header2[pageSegmentBytes] = uint8Array.from(
      data2[subarray](27, header2[length])
    );
    for (let i = 0, segmentLength = 0; i < pageSegmentTableLength; i++) {
      const segmentByte = header2[pageSegmentBytes][i];
      header2[frameLength] += segmentByte;
      segmentLength += segmentByte;
      if (segmentByte !== 255 || i === pageSegmentTableLength - 1) {
        header2[pageSegmentTable].push(segmentLength);
        segmentLength = 0;
      }
    }
    return new OggPageHeader(header2);
  }
  /**
   * @private
   * Call OggPageHeader.getHeader(Array<Uint8>) to get instance
   */
  constructor(header2) {
    headerStore.set(this, header2);
    this[absoluteGranulePosition] = header2[absoluteGranulePosition];
    this[isContinuedPacket] = header2[isContinuedPacket];
    this[isFirstPage] = header2[isFirstPage];
    this[isLastPage$1] = header2[isLastPage$1];
    this[pageSegmentTable] = header2[pageSegmentTable];
    this[pageSequenceNumber] = header2[pageSequenceNumber];
    this[pageChecksum] = header2[pageChecksum];
    this[streamSerialNumber] = header2[streamSerialNumber];
  }
}
class OggPage extends Frame {
  static *[getFrame](codecParser, headerCache, readOffset) {
    const header2 = yield* OggPageHeader[getHeader](
      codecParser,
      headerCache,
      readOffset
    );
    if (header2) {
      const frameLengthValue = headerStore.get(header2)[frameLength];
      const headerLength = headerStore.get(header2)[length];
      const totalLength = headerLength + frameLengthValue;
      const rawDataValue = (yield* codecParser[readRawData](totalLength, 0))[subarray](0, totalLength);
      const frame2 = rawDataValue[subarray](headerLength, totalLength);
      return new OggPage(header2, frame2, rawDataValue);
    } else {
      return null;
    }
  }
  constructor(header2, frame2, rawDataValue) {
    super(header2, frame2);
    frameStore.get(this)[length] = rawDataValue[length];
    this[codecFrames$1] = [];
    this[rawData] = rawDataValue;
    this[absoluteGranulePosition] = header2[absoluteGranulePosition];
    this[crc32] = header2[pageChecksum];
    this[duration] = 0;
    this[isContinuedPacket] = header2[isContinuedPacket];
    this[isFirstPage] = header2[isFirstPage];
    this[isLastPage$1] = header2[isLastPage$1];
    this[pageSequenceNumber] = header2[pageSequenceNumber];
    this[samples] = 0;
    this[streamSerialNumber] = header2[streamSerialNumber];
  }
}
class OpusFrame extends CodecFrame {
  constructor(data2, header2, samples2) {
    super(header2, data2, samples2);
  }
}
const channelMappingFamilies = {
  0: vorbisOpusChannelMapping.slice(0, 2),
  /*
  0: "monophonic (mono)"
  1: "stereo (left, right)"
  */
  1: vorbisOpusChannelMapping
  /*
  0: "monophonic (mono)"
  1: "stereo (left, right)"
  2: "linear surround (left, center, right)"
  3: "quadraphonic (front left, front right, rear left, rear right)"
  4: "5.0 surround (front left, front center, front right, rear left, rear right)"
  5: "5.1 surround (front left, front center, front right, rear left, rear right, LFE)"
  6: "6.1 surround (front left, front center, front right, side left, side right, rear center, LFE)"
  7: "7.1 surround (front left, front center, front right, side left, side right, rear left, rear right, LFE)"
  */
  // additional channel mappings are user defined
};
const silkOnly = "SILK-only";
const celtOnly = "CELT-only";
const hybrid = "Hybrid";
const narrowBand = "narrowband";
const mediumBand = "medium-band";
const wideBand = "wideband";
const superWideBand = "super-wideband";
const fullBand = "fullband";
const configTable = {
  0: { [mode]: silkOnly, [bandwidth]: narrowBand, [frameSize]: 10 },
  8: { [mode]: silkOnly, [bandwidth]: narrowBand, [frameSize]: 20 },
  16: { [mode]: silkOnly, [bandwidth]: narrowBand, [frameSize]: 40 },
  24: { [mode]: silkOnly, [bandwidth]: narrowBand, [frameSize]: 60 },
  32: { [mode]: silkOnly, [bandwidth]: mediumBand, [frameSize]: 10 },
  40: { [mode]: silkOnly, [bandwidth]: mediumBand, [frameSize]: 20 },
  48: { [mode]: silkOnly, [bandwidth]: mediumBand, [frameSize]: 40 },
  56: { [mode]: silkOnly, [bandwidth]: mediumBand, [frameSize]: 60 },
  64: { [mode]: silkOnly, [bandwidth]: wideBand, [frameSize]: 10 },
  72: { [mode]: silkOnly, [bandwidth]: wideBand, [frameSize]: 20 },
  80: { [mode]: silkOnly, [bandwidth]: wideBand, [frameSize]: 40 },
  88: { [mode]: silkOnly, [bandwidth]: wideBand, [frameSize]: 60 },
  96: { [mode]: hybrid, [bandwidth]: superWideBand, [frameSize]: 10 },
  104: { [mode]: hybrid, [bandwidth]: superWideBand, [frameSize]: 20 },
  112: { [mode]: hybrid, [bandwidth]: fullBand, [frameSize]: 10 },
  120: { [mode]: hybrid, [bandwidth]: fullBand, [frameSize]: 20 },
  128: { [mode]: celtOnly, [bandwidth]: narrowBand, [frameSize]: 2.5 },
  136: { [mode]: celtOnly, [bandwidth]: narrowBand, [frameSize]: 5 },
  144: { [mode]: celtOnly, [bandwidth]: narrowBand, [frameSize]: 10 },
  152: { [mode]: celtOnly, [bandwidth]: narrowBand, [frameSize]: 20 },
  160: { [mode]: celtOnly, [bandwidth]: wideBand, [frameSize]: 2.5 },
  168: { [mode]: celtOnly, [bandwidth]: wideBand, [frameSize]: 5 },
  176: { [mode]: celtOnly, [bandwidth]: wideBand, [frameSize]: 10 },
  184: { [mode]: celtOnly, [bandwidth]: wideBand, [frameSize]: 20 },
  192: { [mode]: celtOnly, [bandwidth]: superWideBand, [frameSize]: 2.5 },
  200: { [mode]: celtOnly, [bandwidth]: superWideBand, [frameSize]: 5 },
  208: { [mode]: celtOnly, [bandwidth]: superWideBand, [frameSize]: 10 },
  216: { [mode]: celtOnly, [bandwidth]: superWideBand, [frameSize]: 20 },
  224: { [mode]: celtOnly, [bandwidth]: fullBand, [frameSize]: 2.5 },
  232: { [mode]: celtOnly, [bandwidth]: fullBand, [frameSize]: 5 },
  240: { [mode]: celtOnly, [bandwidth]: fullBand, [frameSize]: 10 },
  248: { [mode]: celtOnly, [bandwidth]: fullBand, [frameSize]: 20 }
};
class OpusHeader extends CodecHeader {
  static [getHeaderFromUint8Array](dataValue, packetData, headerCache) {
    const header2 = {};
    header2[channels] = dataValue[9];
    header2[channelMappingFamily] = dataValue[18];
    header2[length] = header2[channelMappingFamily] !== 0 ? 21 + header2[channels] : 19;
    if (dataValue[length] < header2[length])
      throw new Error("Out of data while inside an Ogg Page");
    const packetMode = packetData[0] & 3;
    const packetLength = packetMode === 3 ? 2 : 1;
    const key = bytesToString(dataValue[subarray](0, header2[length])) + bytesToString(packetData[subarray](0, packetLength));
    const cachedHeader = headerCache[getHeader](key);
    if (cachedHeader) return new OpusHeader(cachedHeader);
    if (key.substr(0, 8) !== "OpusHead") {
      return null;
    }
    if (dataValue[8] !== 1) return null;
    header2[data$1] = uint8Array.from(dataValue[subarray](0, header2[length]));
    const view = new dataView(header2[data$1][buffer]);
    header2[bitDepth] = 16;
    header2[preSkip] = view.getUint16(10, true);
    header2[inputSampleRate] = view.getUint32(12, true);
    header2[sampleRate] = rate48000;
    header2[outputGain] = view.getInt16(16, true);
    if (header2[channelMappingFamily] in channelMappingFamilies) {
      header2[channelMode] = channelMappingFamilies[header2[channelMappingFamily]][header2[channels] - 1];
      if (!header2[channelMode]) return null;
    }
    if (header2[channelMappingFamily] !== 0) {
      header2[streamCount] = dataValue[19];
      header2[coupledStreamCount] = dataValue[20];
      header2[channelMappingTable] = [
        ...dataValue[subarray](21, header2[channels] + 21)
      ];
    }
    const packetConfig = configTable[248 & packetData[0]];
    header2[mode] = packetConfig[mode];
    header2[bandwidth] = packetConfig[bandwidth];
    header2[frameSize] = packetConfig[frameSize];
    switch (packetMode) {
      case 0:
        header2[frameCount] = 1;
        break;
      case 1:
      // 1: 2 frames in the packet, each with equal compressed size
      case 2:
        header2[frameCount] = 2;
        break;
      case 3:
        header2[isVbr] = !!(128 & packetData[1]);
        header2[hasOpusPadding] = !!(64 & packetData[1]);
        header2[frameCount] = 63 & packetData[1];
        break;
      default:
        return null;
    }
    {
      const {
        length: length2,
        data: headerData,
        channelMappingFamily: channelMappingFamily2,
        ...codecUpdateFields
      } = header2;
      headerCache[setHeader](key, header2, codecUpdateFields);
    }
    return new OpusHeader(header2);
  }
  /**
   * @private
   * Call OpusHeader.getHeader(Array<Uint8>) to get instance
   */
  constructor(header2) {
    super(header2);
    this[data$1] = header2[data$1];
    this[bandwidth] = header2[bandwidth];
    this[channelMappingFamily] = header2[channelMappingFamily];
    this[channelMappingTable] = header2[channelMappingTable];
    this[coupledStreamCount] = header2[coupledStreamCount];
    this[frameCount] = header2[frameCount];
    this[frameSize] = header2[frameSize];
    this[hasOpusPadding] = header2[hasOpusPadding];
    this[inputSampleRate] = header2[inputSampleRate];
    this[isVbr] = header2[isVbr];
    this[mode] = header2[mode];
    this[outputGain] = header2[outputGain];
    this[preSkip] = header2[preSkip];
    this[streamCount] = header2[streamCount];
  }
}
class OpusParser extends Parser {
  constructor(codecParser, headerCache, onCodec) {
    super(codecParser, headerCache);
    this.Frame = OpusFrame;
    this.Header = OpusHeader;
    onCodec(this[codec]);
    this._identificationHeader = null;
    this._preSkipRemaining = null;
  }
  get [codec]() {
    return "opus";
  }
  /**
   * @todo implement continued page support
   */
  [parseOggPage](oggPage) {
    if (oggPage[pageSequenceNumber] === 0) {
      this._headerCache[enable]();
      this._identificationHeader = oggPage[data$1];
    } else if (oggPage[pageSequenceNumber] === 1) ;
    else {
      oggPage[codecFrames$1] = frameStore.get(oggPage)[segments].map((segment) => {
        const header2 = OpusHeader[getHeaderFromUint8Array](
          this._identificationHeader,
          segment,
          this._headerCache
        );
        if (header2) {
          if (this._preSkipRemaining === null)
            this._preSkipRemaining = header2[preSkip];
          let samples2 = header2[frameSize] * header2[frameCount] / 1e3 * header2[sampleRate];
          if (this._preSkipRemaining > 0) {
            this._preSkipRemaining -= samples2;
            samples2 = this._preSkipRemaining < 0 ? -this._preSkipRemaining : 0;
          }
          return new OpusFrame(segment, header2, samples2);
        }
        this._codecParser[logError$1](
          "Failed to parse Ogg Opus Header",
          "Not a valid Ogg Opus file"
        );
      });
    }
    return oggPage;
  }
}
class VorbisFrame extends CodecFrame {
  constructor(data2, header2, samples2) {
    super(header2, data2, samples2);
  }
}
const blockSizes = {
  // 0b0110: 64,
  // 0b0111: 128,
  // 0b1000: 256,
  // 0b1001: 512,
  // 0b1010: 1024,
  // 0b1011: 2048,
  // 0b1100: 4096,
  // 0b1101: 8192
};
for (let i = 0; i < 8; i++) blockSizes[i + 6] = 2 ** (6 + i);
class VorbisHeader extends CodecHeader {
  static [getHeaderFromUint8Array](dataValue, headerCache, vorbisCommentsData, vorbisSetupData) {
    if (dataValue[length] < 30)
      throw new Error("Out of data while inside an Ogg Page");
    const key = bytesToString(dataValue[subarray](0, 30));
    const cachedHeader = headerCache[getHeader](key);
    if (cachedHeader) return new VorbisHeader(cachedHeader);
    const header2 = { [length]: 30 };
    if (key.substr(0, 7) !== "vorbis") {
      return null;
    }
    header2[data$1] = uint8Array.from(dataValue[subarray](0, 30));
    const view = new dataView(header2[data$1][buffer]);
    header2[version] = view.getUint32(7, true);
    if (header2[version] !== 0) return null;
    header2[channels] = dataValue[11];
    header2[channelMode] = vorbisOpusChannelMapping[header2[channels] - 1] || "application defined";
    header2[sampleRate] = view.getUint32(12, true);
    header2[bitrateMaximum] = view.getInt32(16, true);
    header2[bitrateNominal] = view.getInt32(20, true);
    header2[bitrateMinimum] = view.getInt32(24, true);
    header2[blocksize1] = blockSizes[(dataValue[28] & 240) >> 4];
    header2[blocksize0] = blockSizes[dataValue[28] & 15];
    if (header2[blocksize0] > header2[blocksize1]) return null;
    if (dataValue[29] !== 1) return null;
    header2[bitDepth] = 32;
    header2[vorbisSetup$1] = vorbisSetupData;
    header2[vorbisComments] = vorbisCommentsData;
    {
      const {
        length: length2,
        data: data2,
        version: version2,
        vorbisSetup: vorbisSetup2,
        vorbisComments: vorbisComments2,
        ...codecUpdateFields
      } = header2;
      headerCache[setHeader](key, header2, codecUpdateFields);
    }
    return new VorbisHeader(header2);
  }
  /**
   * @private
   * Call VorbisHeader.getHeader(Array<Uint8>) to get instance
   */
  constructor(header2) {
    super(header2);
    this[bitrateMaximum] = header2[bitrateMaximum];
    this[bitrateMinimum] = header2[bitrateMinimum];
    this[bitrateNominal] = header2[bitrateNominal];
    this[blocksize0] = header2[blocksize0];
    this[blocksize1] = header2[blocksize1];
    this[data$1] = header2[data$1];
    this[vorbisComments] = header2[vorbisComments];
    this[vorbisSetup$1] = header2[vorbisSetup$1];
  }
}
class VorbisParser extends Parser {
  constructor(codecParser, headerCache, onCodec) {
    super(codecParser, headerCache);
    this.Frame = VorbisFrame;
    onCodec(this[codec]);
    this._identificationHeader = null;
    this._setupComplete = false;
    this._prevBlockSize = null;
  }
  get [codec]() {
    return vorbis;
  }
  [parseOggPage](oggPage) {
    oggPage[codecFrames$1] = [];
    for (const oggPageSegment of frameStore.get(oggPage)[segments]) {
      if (oggPageSegment[0] === 1) {
        this._headerCache[enable]();
        this._identificationHeader = oggPage[data$1];
        this._setupComplete = false;
      } else if (oggPageSegment[0] === 3) {
        this._vorbisComments = oggPageSegment;
      } else if (oggPageSegment[0] === 5) {
        this._vorbisSetup = oggPageSegment;
        this._mode = this._parseSetupHeader(oggPageSegment);
        this._setupComplete = true;
      } else if (this._setupComplete) {
        const header2 = VorbisHeader[getHeaderFromUint8Array](
          this._identificationHeader,
          this._headerCache,
          this._vorbisComments,
          this._vorbisSetup
        );
        if (header2) {
          oggPage[codecFrames$1].push(
            new VorbisFrame(
              oggPageSegment,
              header2,
              this._getSamples(oggPageSegment, header2)
            )
          );
        } else {
          this._codecParser[logError](
            "Failed to parse Ogg Vorbis Header",
            "Not a valid Ogg Vorbis file"
          );
        }
      }
    }
    return oggPage;
  }
  _getSamples(segment, header2) {
    const blockFlag = this._mode.blockFlags[segment[0] >> 1 & this._mode.mask];
    const currentBlockSize = blockFlag ? header2[blocksize1] : header2[blocksize0];
    const samplesValue = this._prevBlockSize === null ? 0 : (this._prevBlockSize + currentBlockSize) / 4;
    this._prevBlockSize = currentBlockSize;
    return samplesValue;
  }
  // https://gitlab.xiph.org/xiph/liboggz/-/blob/master/src/liboggz/oggz_auto.c#L911
  // https://github.com/FFmpeg/FFmpeg/blob/master/libavcodec/vorbis_parser.c
  /*
   * This is the format of the mode data at the end of the packet for all
   * Vorbis Version 1 :
   *
   * [ 6:number_of_modes ]
   * [ 1:size | 16:window_type(0) | 16:transform_type(0) | 8:mapping ]
   * [ 1:size | 16:window_type(0) | 16:transform_type(0) | 8:mapping ]
   * [ 1:size | 16:window_type(0) | 16:transform_type(0) | 8:mapping ]
   * [ 1:framing(1) ]
   *
   * e.g.:
   *
   * MsB         LsB
   *              <-
   * 0 0 0 0 0 1 0 0
   * 0 0 1 0 0 0 0 0
   * 0 0 1 0 0 0 0 0
   * 0 0 1|0 0 0 0 0
   * 0 0 0 0|0|0 0 0
   * 0 0 0 0 0 0 0 0
   * 0 0 0 0|0 0 0 0
   * 0 0 0 0 0 0 0 0
   * 0 0 0 0|0 0 0 0
   * 0 0 0|1|0 0 0 0 |
   * 0 0 0 0 0 0 0 0 V
   * 0 0 0|0 0 0 0 0
   * 0 0 0 0 0 0 0 0
   * 0 0|1 0 0 0 0 0
   *
   * The simplest way to approach this is to start at the end
   * and read backwards to determine the mode configuration.
   *
   * liboggz and ffmpeg both use this method.
   */
  _parseSetupHeader(setup) {
    const bitReader = new BitReader(setup);
    const mode2 = {
      count: 0,
      blockFlags: []
    };
    while ((bitReader.read(1) & 1) !== 1) {
    }
    let modeBits;
    while (mode2.count < 64 && bitReader.position > 0) {
      reverse(bitReader.read(8));
      let currentByte = 0;
      while (bitReader.read(8) === 0 && currentByte++ < 3) {
      }
      if (currentByte === 4) {
        modeBits = bitReader.read(7);
        mode2.blockFlags.unshift(modeBits & 1);
        bitReader.position += 6;
        mode2.count++;
      } else {
        if (((reverse(modeBits) & 126) >> 1) + 1 !== mode2.count) {
          this._codecParser[logWarning](
            "vorbis derived mode count did not match actual mode count"
          );
        }
        break;
      }
    }
    mode2.mask = (1 << Math.log2(mode2.count)) - 1;
    return mode2;
  }
}
class OggStream {
  constructor(codecParser, headerCache, onCodec) {
    this._codecParser = codecParser;
    this._headerCache = headerCache;
    this._onCodec = onCodec;
    this._continuedPacket = new uint8Array();
    this._codec = null;
    this._isSupported = null;
    this._previousAbsoluteGranulePosition = null;
  }
  get [codec]() {
    return this._codec || "";
  }
  _updateCodec(codec2, Parser2) {
    if (this._codec !== codec2) {
      this._headerCache[reset]();
      this._parser = new Parser2(
        this._codecParser,
        this._headerCache,
        this._onCodec
      );
      this._codec = codec2;
    }
  }
  _checkCodecSupport({ data: data2 }) {
    const idString = bytesToString(data2[subarray](0, 8));
    switch (idString) {
      case "fishead\0":
        return false;
      // ignore ogg skeleton packets
      case "OpusHead":
        this._updateCodec("opus", OpusParser);
        return true;
      case (/^\x7fFLAC/.test(idString) && idString):
        this._updateCodec("flac", FLACParser);
        return true;
      case (/^\x01vorbis/.test(idString) && idString):
        this._updateCodec(vorbis, VorbisParser);
        return true;
      default:
        return false;
    }
  }
  _checkPageSequenceNumber(oggPage) {
    if (oggPage[pageSequenceNumber] !== this._pageSequenceNumber + 1 && this._pageSequenceNumber > 1 && oggPage[pageSequenceNumber] > 1) {
      this._codecParser[logWarning](
        "Unexpected gap in Ogg Page Sequence Number.",
        `Expected: ${this._pageSequenceNumber + 1}, Got: ${oggPage[pageSequenceNumber]}`
      );
    }
    this._pageSequenceNumber = oggPage[pageSequenceNumber];
  }
  _parsePage(oggPage) {
    if (this._isSupported === null) {
      this._pageSequenceNumber = oggPage[pageSequenceNumber];
      this._isSupported = this._checkCodecSupport(oggPage);
    }
    this._checkPageSequenceNumber(oggPage);
    const oggPageStore = frameStore.get(oggPage);
    const headerData = headerStore.get(oggPageStore[header$1]);
    let offset = 0;
    oggPageStore[segments] = headerData[pageSegmentTable].map(
      (segmentLength) => oggPage[data$1][subarray](offset, offset += segmentLength)
    );
    if (this._continuedPacket[length]) {
      oggPageStore[segments][0] = concatBuffers(
        this._continuedPacket,
        oggPageStore[segments][0]
      );
      this._continuedPacket = new uint8Array();
    }
    if (headerData[pageSegmentBytes][headerData[pageSegmentBytes][length] - 1] === 255) {
      this._continuedPacket = concatBuffers(
        this._continuedPacket,
        oggPageStore[segments].pop()
      );
    }
    if (this._previousAbsoluteGranulePosition !== null) {
      oggPage[samples] = Number(
        oggPage[absoluteGranulePosition] - this._previousAbsoluteGranulePosition
      );
    }
    this._previousAbsoluteGranulePosition = oggPage[absoluteGranulePosition];
    if (this._isSupported) {
      const frame2 = this._parser[parseOggPage](oggPage);
      this._codecParser[mapFrameStats](frame2);
      return frame2;
    } else {
      return oggPage;
    }
  }
}
class OggParser extends Parser {
  constructor(codecParser, headerCache, onCodec) {
    super(codecParser, headerCache);
    this._onCodec = onCodec;
    this.Frame = OggPage;
    this.Header = OggPageHeader;
    this._streams = /* @__PURE__ */ new Map();
    this._currentSerialNumber = null;
  }
  get [codec]() {
    const oggStream = this._streams.get(this._currentSerialNumber);
    return oggStream ? oggStream.codec : "";
  }
  *[parseFrame]() {
    const oggPage = yield* this[fixedLengthFrameSync](true);
    this._currentSerialNumber = oggPage[streamSerialNumber];
    let oggStream = this._streams.get(this._currentSerialNumber);
    if (!oggStream) {
      oggStream = new OggStream(
        this._codecParser,
        this._headerCache,
        this._onCodec
      );
      this._streams.set(this._currentSerialNumber, oggStream);
    }
    if (oggPage[isLastPage$1]) this._streams.delete(this._currentSerialNumber);
    return oggStream._parsePage(oggPage);
  }
}
const noOp = () => {
};
class CodecParser {
  constructor(mimeType2, {
    onCodec,
    onCodecHeader,
    onCodecUpdate,
    enableLogging = false,
    enableFrameCRC32 = true
  } = {}) {
    this._inputMimeType = mimeType2;
    this._onCodec = onCodec || noOp;
    this._onCodecHeader = onCodecHeader || noOp;
    this._onCodecUpdate = onCodecUpdate;
    this._enableLogging = enableLogging;
    this._crc32 = enableFrameCRC32 ? crc32Function : noOp;
    this[reset]();
  }
  /**
   * @public
   * @returns The detected codec
   */
  get [codec]() {
    return this._parser ? this._parser[codec] : "";
  }
  [reset]() {
    this._headerCache = new HeaderCache(
      this._onCodecHeader,
      this._onCodecUpdate
    );
    this._generator = this._getGenerator();
    this._generator.next();
  }
  /**
   * @public
   * @description Generator function that yields any buffered CodecFrames and resets the CodecParser
   * @returns {Iterable<CodecFrame|OggPage>} Iterator that operates over the codec data.
   * @yields {CodecFrame|OggPage} Parsed codec or ogg page data
   */
  *flush() {
    this._flushing = true;
    for (let i = this._generator.next(); i.value; i = this._generator.next()) {
      yield i.value;
    }
    this._flushing = false;
    this[reset]();
  }
  /**
   * @public
   * @description Generator function takes in a Uint8Array of data and returns a CodecFrame from the data for each iteration
   * @param {Uint8Array} chunk Next chunk of codec data to read
   * @returns {Iterable<CodecFrame|OggPage>} Iterator that operates over the codec data.
   * @yields {CodecFrame|OggPage} Parsed codec or ogg page data
   */
  *parseChunk(chunk) {
    for (let i = this._generator.next(chunk); i.value; i = this._generator.next()) {
      yield i.value;
    }
  }
  /**
   * @public
   * @description Parses an entire file and returns all of the contained frames.
   * @param {Uint8Array} fileData Coded data to read
   * @returns {Array<CodecFrame|OggPage>} CodecFrames
   */
  parseAll(fileData) {
    return [...this.parseChunk(fileData), ...this.flush()];
  }
  /**
   * @private
   */
  *_getGenerator() {
    if (this._inputMimeType.match(/aac/)) {
      this._parser = new AACParser(this, this._headerCache, this._onCodec);
    } else if (this._inputMimeType.match(/mpeg/)) {
      this._parser = new MPEGParser(this, this._headerCache, this._onCodec);
    } else if (this._inputMimeType.match(/flac/)) {
      this._parser = new FLACParser(this, this._headerCache, this._onCodec);
    } else if (this._inputMimeType.match(/ogg/)) {
      this._parser = new OggParser(this, this._headerCache, this._onCodec);
    } else {
      throw new Error(`Unsupported Codec ${mimeType}`);
    }
    this._frameNumber = 0;
    this._currentReadPosition = 0;
    this._totalBytesIn = 0;
    this._totalBytesOut = 0;
    this._totalSamples = 0;
    this._sampleRate = void 0;
    this._rawData = new Uint8Array(0);
    while (true) {
      const frame2 = yield* this._parser[parseFrame]();
      if (frame2) yield frame2;
    }
  }
  /**
   * @protected
   * @param {number} minSize Minimum bytes to have present in buffer
   * @returns {Uint8Array} rawData
   */
  *[readRawData](minSize = 0, readOffset = 0) {
    let rawData2;
    while (this._rawData[length] <= minSize + readOffset) {
      rawData2 = yield;
      if (this._flushing) return this._rawData[subarray](readOffset);
      if (rawData2) {
        this._totalBytesIn += rawData2[length];
        this._rawData = concatBuffers(this._rawData, rawData2);
      }
    }
    return this._rawData[subarray](readOffset);
  }
  /**
   * @protected
   * @param {number} increment Bytes to increment codec data
   */
  [incrementRawData](increment) {
    this._currentReadPosition += increment;
    this._rawData = this._rawData[subarray](increment);
  }
  /**
   * @protected
   */
  [mapCodecFrameStats](frame2) {
    this._sampleRate = frame2[header$1][sampleRate];
    frame2[header$1][bitrate] = frame2[duration] > 0 ? Math.round(frame2[data$1][length] / frame2[duration]) * 8 : 0;
    frame2[frameNumber] = this._frameNumber++;
    frame2[totalBytesOut] = this._totalBytesOut;
    frame2[totalSamples$1] = this._totalSamples;
    frame2[totalDuration] = this._totalSamples / this._sampleRate * 1e3;
    frame2[crc32] = this._crc32(frame2[data$1]);
    this._headerCache[checkCodecUpdate](
      frame2[header$1][bitrate],
      frame2[totalDuration]
    );
    this._totalBytesOut += frame2[data$1][length];
    this._totalSamples += frame2[samples];
  }
  /**
   * @protected
   */
  [mapFrameStats](frame2) {
    if (frame2[codecFrames$1]) {
      if (frame2[isLastPage$1]) {
        let absoluteGranulePositionSamples = frame2[samples];
        frame2[codecFrames$1].forEach((codecFrame) => {
          const untrimmedCodecSamples = codecFrame[samples];
          if (absoluteGranulePositionSamples < untrimmedCodecSamples) {
            codecFrame[samples] = absoluteGranulePositionSamples > 0 ? absoluteGranulePositionSamples : 0;
            codecFrame[duration] = codecFrame[samples] / codecFrame[header$1][sampleRate] * 1e3;
          }
          absoluteGranulePositionSamples -= untrimmedCodecSamples;
          this[mapCodecFrameStats](codecFrame);
        });
      } else {
        frame2[samples] = 0;
        frame2[codecFrames$1].forEach((codecFrame) => {
          frame2[samples] += codecFrame[samples];
          this[mapCodecFrameStats](codecFrame);
        });
      }
      frame2[duration] = frame2[samples] / this._sampleRate * 1e3 || 0;
      frame2[totalSamples$1] = this._totalSamples;
      frame2[totalDuration] = this._totalSamples / this._sampleRate * 1e3 || 0;
      frame2[totalBytesOut] = this._totalBytesOut;
    } else {
      this[mapCodecFrameStats](frame2);
    }
  }
  /**
   * @private
   */
  _log(logger, messages) {
    if (this._enableLogging) {
      const stats = [
        `${codec}:         ${this[codec]}`,
        `inputMimeType: ${this._inputMimeType}`,
        `readPosition:  ${this._currentReadPosition}`,
        `totalBytesIn:  ${this._totalBytesIn}`,
        `${totalBytesOut}: ${this._totalBytesOut}`
      ];
      const width = Math.max(...stats.map((s) => s[length]));
      messages.push(
        `--stats--${"-".repeat(width - 9)}`,
        ...stats,
        "-".repeat(width)
      );
      logger(
        "codec-parser",
        messages.reduce((acc, message) => acc + "\n  " + message, "")
      );
    }
  }
  /**
   * @protected
   */
  [logWarning](...messages) {
    this._log(console.warn, messages);
  }
  /**
   * @protected
   */
  [logError$1](...messages) {
    this._log(console.error, messages);
  }
}
const codecFrames = codecFrames$1;
const data = data$1;
const header = header$1;
const isLastPage = isLastPage$1;
const vorbisSetup = vorbisSetup$1;
const totalSamples = totalSamples$1;
export {
  CodecParser as C,
  codecFrames as c,
  data as d,
  header as h,
  isLastPage as i,
  totalSamples as t,
  vorbisSetup as v
};
