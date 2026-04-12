function scan9xxOffsets(pattern, instrumentIndex) {
  const offsets = /* @__PURE__ */ new Set();
  for (const channel of pattern.channels) {
    for (const cell of channel.rows) {
      const cellInst = cell.instrument;
      if (cellInst !== 0 && cellInst !== instrumentIndex) continue;
      if (cell.effTyp === 9 && cell.eff > 0) {
        offsets.add(cell.eff);
      }
      if (cell.effTyp2 === 9 && cell.eff2 > 0) {
        offsets.add(cell.eff2);
      }
      for (let i = 3; i <= 8; i++) {
        const typ = cell[`effTyp${i}`];
        const param = cell[`eff${i}`];
        if (typ === 9 && param > 0) {
          offsets.add(param);
        }
      }
    }
  }
  return Array.from(offsets).sort((a, b) => a - b);
}
function calculateTargetDurationMs(bpm, speed, rows) {
  const msPerTick = 2500 / bpm;
  return msPerTick * speed * rows;
}
async function resampleToFit(source, targetDurationMs) {
  const originalDurationMs = source.length / source.sampleRate * 1e3;
  const ratio = targetDurationMs / originalDurationMs;
  const outputLength = Math.round(source.length * ratio);
  const offlineCtx = new OfflineAudioContext(
    source.numberOfChannels,
    outputLength,
    source.sampleRate
  );
  const bufferSource = offlineCtx.createBufferSource();
  bufferSource.buffer = source;
  bufferSource.playbackRate.value = 1 / ratio;
  bufferSource.connect(offlineCtx.destination);
  bufferSource.start(0);
  const rendered = await offlineCtx.startRendering();
  return {
    buffer: rendered,
    originalDurationMs,
    targetDurationMs,
    ratio
  };
}
function hannWindow(i, size) {
  return 0.5 * (1 - Math.cos(2 * Math.PI * i / (size - 1)));
}
function crossCorrelate(a, aOffset, b, bOffset, length) {
  let num = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < length; i++) {
    const ai = aOffset + i < a.length ? a[aOffset + i] : 0;
    const bi = bOffset + i < b.length ? b[bOffset + i] : 0;
    num += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  const denom = Math.sqrt(normA * normB);
  return denom > 0 ? num / denom : 0;
}
async function timeStretchToFit(source, targetDurationMs) {
  const originalDurationMs = source.length / source.sampleRate * 1e3;
  const ratio = targetDurationMs / originalDurationMs;
  const WINDOW_SIZE = 2048;
  const HOP_IN = 512;
  const HOP_OUT = Math.round(HOP_IN * ratio);
  const SEARCH_RANGE = 64;
  const numChannels = source.numberOfChannels;
  const outputLength = Math.round(source.length * ratio);
  const outputBuffer = new AudioBuffer({
    numberOfChannels: numChannels,
    length: outputLength,
    sampleRate: source.sampleRate
  });
  for (let ch = 0; ch < numChannels; ch++) {
    const input = source.getChannelData(ch);
    const output = new Float32Array(outputLength);
    const normAcc = new Float32Array(outputLength);
    const window = new Float32Array(WINDOW_SIZE);
    for (let i = 0; i < WINDOW_SIZE; i++) {
      window[i] = hannWindow(i, WINDOW_SIZE);
    }
    let inputPos = 0;
    let outputPos = 0;
    while (outputPos + WINDOW_SIZE <= outputLength) {
      const searchStart = Math.max(0, inputPos - SEARCH_RANGE);
      const searchEnd = Math.min(input.length - WINDOW_SIZE, inputPos + SEARCH_RANGE);
      let bestOffset = inputPos;
      let bestCorr = -Infinity;
      if (outputPos > 0 && searchEnd >= searchStart) {
        for (let s = searchStart; s <= searchEnd; s++) {
          const overlapLen = Math.min(HOP_OUT, outputPos, WINDOW_SIZE - HOP_OUT);
          if (overlapLen <= 0) {
            bestOffset = inputPos;
            break;
          }
          const corr = crossCorrelate(
            output,
            outputPos - overlapLen,
            input,
            s,
            overlapLen
          );
          if (corr > bestCorr) {
            bestCorr = corr;
            bestOffset = s;
          }
        }
      } else {
        bestOffset = Math.max(0, Math.min(inputPos, input.length - WINDOW_SIZE));
      }
      for (let i = 0; i < WINDOW_SIZE; i++) {
        const outIdx = outputPos + i;
        if (outIdx >= outputLength) break;
        const inIdx = bestOffset + i;
        const sample = inIdx < input.length ? input[inIdx] : 0;
        const w = window[i];
        output[outIdx] += sample * w;
        normAcc[outIdx] += w * w;
      }
      inputPos += HOP_IN;
      outputPos += HOP_OUT;
    }
    for (let i = 0; i < outputLength; i++) {
      if (normAcc[i] > 1e-4) {
        output[i] /= normAcc[i];
      }
    }
    outputBuffer.copyToChannel(output, ch);
  }
  return {
    buffer: outputBuffer,
    originalDurationMs,
    targetDurationMs,
    ratio
  };
}
async function previewBeatSync(source, params) {
  const targetDurationMs = calculateTargetDurationMs(params.bpm, params.speed, params.targetRows);
  if (params.method === "resample") {
    return resampleToFit(source, targetDurationMs);
  } else {
    return timeStretchToFit(source, targetDurationMs);
  }
}
export {
  calculateTargetDurationMs as c,
  previewBeatSync as p,
  scan9xxOffsets as s
};
