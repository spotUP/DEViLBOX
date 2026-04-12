function writeWaveformByte(waveformData, localX, localY, width, height, prevIdx) {
  const x = Math.max(0, Math.min(width, localX));
  const y = Math.max(0, Math.min(height, localY));
  const WAVE_SIZE = Math.max(1, waveformData.length);
  const idx = Math.min(WAVE_SIZE - 1, Math.floor(x / width * WAVE_SIZE));
  const mid = height / 2;
  const signed = Math.round((mid - y) / (mid - 4) * 127);
  const clamped = Math.max(-127, Math.min(127, signed));
  const byte = clamped < 0 ? clamped + 256 : clamped;
  const next = new Uint8Array(waveformData);
  if (prevIdx >= 0 && Math.abs(idx - prevIdx) > 1) {
    const prevVal = next[prevIdx];
    const lo = Math.min(prevIdx, idx);
    const hi = Math.max(prevIdx, idx);
    for (let i = lo; i <= hi; i++) {
      const t = (i - lo) / (hi - lo);
      const interp = idx > prevIdx ? Math.round(prevVal + (byte - prevVal) * t) : Math.round(byte + (prevVal - byte) * t);
      next[i] = interp & 255;
    }
  } else {
    next[idx] = byte;
  }
  return { next, idx };
}
export {
  writeWaveformByte as w
};
