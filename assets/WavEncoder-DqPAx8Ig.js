function encodeWav(sample) {
  const { pcmData, sampleRate, channels } = sample;
  const numSamples = pcmData.length;
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * bytesPerSample;
  const fileSize = 44 + dataSize;
  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);
  writeString(view, 0, "RIFF");
  view.setUint32(4, fileSize - 8, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const sample2 = Math.max(-1, Math.min(1, pcmData[i]));
    const int16 = Math.round(sample2 * 32767);
    view.setInt16(offset, int16, true);
    offset += 2;
  }
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return `data:audio/wav;base64,${base64}`;
}
function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
function encodeSamplesToWav(samples) {
  return samples.map((sample) => encodeWav(sample));
}
export {
  encodeSamplesToWav,
  encodeWav
};
