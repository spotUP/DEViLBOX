const FIBONACCI = [
  0,
  1,
  3,
  6,
  10,
  15,
  21,
  28,
  -28,
  -21,
  -15,
  -10,
  -6,
  -3,
  -1,
  0
];
function clamp8(v) {
  return Math.max(-128, Math.min(127, v));
}
function readTag(view, offset) {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3)
  );
}
function isIFF8SVX(buffer) {
  if (buffer.byteLength < 12) return false;
  const view = new DataView(buffer);
  return readTag(view, 0) === "FORM" && readTag(view, 8) === "8SVX";
}
function parseIFF8SVX(buffer) {
  if (buffer.byteLength < 12) {
    throw new Error("File too short to be an IFF/8SVX file");
  }
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  if (readTag(view, 0) !== "FORM") {
    throw new Error("Not an IFF file — missing FORM header");
  }
  if (readTag(view, 8) !== "8SVX") {
    throw new Error(`Not an 8SVX file — FORM type is "${readTag(view, 8)}"`);
  }
  const formEnd = 8 + view.getUint32(4, false);
  let name = "";
  let sampleRate = 8287;
  let oneShotSamples = 0;
  let repeatSamples = 0;
  let compression = 0;
  let volume = 1;
  let octaves = 1;
  let pcm = null;
  let pos = 12;
  while (pos + 8 <= formEnd && pos + 8 <= buffer.byteLength) {
    const chunkId = readTag(view, pos);
    const chunkSize = view.getUint32(pos + 4, false);
    const dataStart = pos + 8;
    const dataEnd = dataStart + chunkSize;
    pos = dataEnd + (chunkSize & 1);
    if (dataEnd > buffer.byteLength) break;
    switch (chunkId) {
      case "VHDR": {
        if (chunkSize < 20) break;
        oneShotSamples = view.getUint32(dataStart, false);
        repeatSamples = view.getUint32(dataStart + 4, false);
        sampleRate = view.getUint16(dataStart + 12, false);
        octaves = view.getUint8(dataStart + 14);
        compression = view.getUint8(dataStart + 15);
        const rawVol = view.getUint32(dataStart + 16, false);
        volume = rawVol / 65536;
        break;
      }
      case "NAME": {
        let len = chunkSize;
        while (len > 0 && bytes[dataStart + len - 1] === 0) len--;
        name = String.fromCharCode(...Array.from(bytes.subarray(dataStart, dataStart + len)));
        break;
      }
      case "BODY": {
        if (compression === 1) {
          const outLen = chunkSize * 2;
          const decoded = new Int8Array(outLen);
          let last = 0;
          let di = 0;
          for (let i = dataStart; i < dataEnd; i++) {
            const b = bytes[i];
            last = clamp8(last + FIBONACCI[b >> 4 & 15]);
            decoded[di++] = last;
            last = clamp8(last + FIBONACCI[b & 15]);
            decoded[di++] = last;
          }
          pcm = decoded;
        } else {
          const raw = bytes.subarray(dataStart, dataEnd);
          pcm = new Int8Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
        }
        break;
      }
    }
  }
  if (!pcm) {
    throw new Error("8SVX file has no BODY chunk — no sample data found");
  }
  const loopStart = oneShotSamples < pcm.length ? oneShotSamples : 0;
  const loopEnd = repeatSamples > 0 && loopStart + repeatSamples <= pcm.length ? loopStart + repeatSamples : 0;
  const hasLoop = repeatSamples > 1;
  return {
    name,
    sampleRate: sampleRate > 0 ? sampleRate : 8287,
    pcm,
    loopStart,
    loopEnd,
    hasLoop,
    volume: Math.min(1, Math.max(0, volume)),
    octaves: Math.max(1, octaves)
  };
}
export {
  isIFF8SVX,
  parseIFF8SVX
};
