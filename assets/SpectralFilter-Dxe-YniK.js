import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports, N as RotateCcw } from "./vendor-ui-AJ7AT9BN.js";
import "./main-BbV5VyEH.js";
import "./DrawbarSlider-Dq9geM4g.js";
import { H as HarmonicBarsCanvas } from "./HarmonicBarsCanvas-tCyue1dW.js";
function toFloat(data, maxValue) {
  const out = new Float32Array(data.length);
  const mid = maxValue / 2;
  for (let i = 0; i < data.length; i++) {
    out[i] = (data[i] - mid) / mid;
  }
  return out;
}
function fromFloat(buf, maxValue) {
  const out = [];
  const mid = maxValue / 2;
  for (let i = 0; i < buf.length; i++) {
    const v = Math.round(buf[i] * mid + mid);
    out.push(Math.max(0, Math.min(maxValue, v)));
  }
  return out;
}
function dcRemove(data, maxValue) {
  if (data.length === 0) return data;
  let sum = 0;
  for (const v of data) sum += v;
  const mean = sum / data.length;
  const targetMean = maxValue / 2;
  const delta = targetMean - mean;
  return data.map((v) => Math.max(0, Math.min(maxValue, Math.round(v + delta))));
}
function normalize(data, maxValue) {
  const f = toFloat(data, maxValue);
  let peak = 0;
  for (let i = 0; i < f.length; i++) {
    const a = Math.abs(f[i]);
    if (a > peak) peak = a;
  }
  if (peak < 1e-3) return data;
  const gain = 1 / peak;
  const out = new Float32Array(f.length);
  for (let i = 0; i < f.length; i++) out[i] = f[i] * gain;
  return fromFloat(out, maxValue);
}
function resample(data, targetLen) {
  if (data.length === targetLen) return [...data];
  if (data.length === 0) return new Array(targetLen).fill(0);
  const result = [];
  const ratio = data.length / targetLen;
  for (let i = 0; i < targetLen; i++) {
    const srcPos = i * ratio;
    const srcIndex = Math.floor(srcPos);
    const frac = srcPos - srcIndex;
    const a = data[srcIndex];
    const b = data[(srcIndex + 1) % data.length];
    result.push(Math.round(a + (b - a) * frac));
  }
  return result;
}
function requantize(data, oldMax, newMax) {
  if (oldMax === newMax) return [...data];
  const scale = newMax / oldMax;
  return data.map((v) => Math.max(0, Math.min(newMax, Math.round(v * scale))));
}
function mirrorLeftToRight(data) {
  const out = [...data];
  const half = Math.floor(data.length / 2);
  for (let i = 0; i < half; i++) {
    out[data.length - 1 - i] = data[i];
  }
  return out;
}
function quarterWaveReflect(data, maxValue) {
  const len = data.length;
  const q = Math.floor(len / 4);
  const out = new Array(len).fill(0);
  const mid = maxValue / 2;
  for (let i = 0; i < q; i++) out[i] = data[i];
  for (let i = 0; i < q; i++) out[q + i] = data[q - 1 - i];
  for (let i = 0; i < q * 2; i++) {
    out[q * 2 + i] = Math.max(0, Math.min(maxValue, Math.round(2 * mid - out[i])));
  }
  return out;
}
function rotate(data, shift) {
  const len = data.length;
  if (len === 0) return data;
  const s = (shift % len + len) % len;
  return [...data.slice(s), ...data.slice(0, s)];
}
function phaseAlignToPeak(data) {
  if (data.length === 0) return data;
  let peakIdx = 0;
  let peakVal = data[0];
  for (let i = 1; i < data.length; i++) {
    if (data[i] > peakVal) {
      peakVal = data[i];
      peakIdx = i;
    }
  }
  return rotate(data, peakIdx);
}
function invert(data, maxValue) {
  return data.map((v) => maxValue - v);
}
function reverse(data) {
  return [...data].reverse();
}
function penInterpolate(data, fromIdx, toIdx, toValue, maxValue) {
  if (fromIdx < 0 || fromIdx >= data.length || toIdx < 0 || toIdx >= data.length) return data;
  if (fromIdx === toIdx) {
    const out2 = [...data];
    out2[toIdx] = Math.max(0, Math.min(maxValue, Math.round(toValue)));
    return out2;
  }
  const out = [...data];
  const fromValue = data[fromIdx];
  const step = toIdx > fromIdx ? 1 : -1;
  const dist = Math.abs(toIdx - fromIdx);
  for (let k = 0; k <= dist; k++) {
    const idx = fromIdx + step * k;
    const t = k / dist;
    const v = fromValue + (toValue - fromValue) * t;
    out[idx] = Math.max(0, Math.min(maxValue, Math.round(v)));
  }
  return out;
}
function applyChipTarget(data, currentMax, targetLen, targetMax) {
  const resampled = resample(data, targetLen);
  const requantized = requantize(resampled, currentMax, targetMax);
  return { data: requantized, len: targetLen, max: targetMax };
}
const HARMONIC_COUNT = 32;
function renderHarmonics(harmonics, length, maxValue) {
  const buf = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let v = 0;
    const phase = i / length * Math.PI * 2;
    for (let h = 0; h < harmonics.length; h++) {
      const amp = harmonics[h];
      if (amp === 0) continue;
      v += Math.sin(phase * (h + 1)) * amp;
    }
    buf[i] = v;
  }
  let peak = 0;
  for (let i = 0; i < buf.length; i++) {
    const a = Math.abs(buf[i]);
    if (a > peak) peak = a;
  }
  const gain = peak > 0 ? 1 / peak : 1;
  const mid = maxValue / 2;
  const out = [];
  for (let i = 0; i < buf.length; i++) {
    const n = buf[i] * gain;
    out.push(Math.max(0, Math.min(maxValue, Math.round(n * mid + mid))));
  }
  return out;
}
const HARMONIC_PRESETS = [
  { name: "Sine", values: [1, ...new Array(HARMONIC_COUNT - 1).fill(0)] },
  {
    name: "Square",
    values: Array.from({ length: HARMONIC_COUNT }, (_, i) => i % 2 === 0 ? 1 / (i + 1) : 0)
  },
  {
    name: "Saw",
    values: Array.from({ length: HARMONIC_COUNT }, (_, i) => 1 / (i + 1))
  },
  {
    name: "Triangle",
    values: Array.from(
      { length: HARMONIC_COUNT },
      (_, i) => i % 2 === 0 ? 1 / Math.pow(i + 1, 2) : 0
    )
  },
  { name: "Odd", values: Array.from({ length: HARMONIC_COUNT }, (_, i) => i % 2 === 0 ? 1 : 0) },
  { name: "Even", values: Array.from({ length: HARMONIC_COUNT }, (_, i) => i % 2 === 1 ? 1 : 0) }
];
const HarmonicPanel = ({
  harmonics,
  onHarmonicsChange,
  length,
  maxValue,
  onDataChange
}) => {
  const canvasWidth = 320;
  const canvasHeight = 160;
  const applyHarmonics = reactExports.useCallback(
    (newHarmonics) => {
      onHarmonicsChange(newHarmonics);
      const newData = renderHarmonics(newHarmonics, length, maxValue);
      onDataChange(newData);
    },
    [onHarmonicsChange, length, maxValue, onDataChange]
  );
  const handleDrag = reactExports.useCallback(
    (nx, ny) => {
      const idx = Math.max(0, Math.min(HARMONIC_COUNT - 1, Math.floor(nx * HARMONIC_COUNT)));
      const amp = Math.max(0, Math.min(1, ny));
      if (harmonics[idx] === amp) return;
      const newHarmonics = [...harmonics];
      newHarmonics[idx] = amp;
      applyHarmonics(newHarmonics);
    },
    [harmonics, applyHarmonics]
  );
  const clearHarmonics = reactExports.useCallback(() => {
    applyHarmonics(new Array(HARMONIC_COUNT).fill(0));
  }, [applyHarmonics]);
  const padded = reactExports.useMemo(() => {
    if (harmonics.length === HARMONIC_COUNT) return harmonics;
    const out = new Array(HARMONIC_COUNT).fill(0);
    for (let i = 0; i < Math.min(harmonics.length, HARMONIC_COUNT); i++) out[i] = harmonics[i];
    return out;
  }, [harmonics]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-2 p-2 bg-dark-bgSecondary rounded border border-dark-border", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] font-mono font-bold text-text-primary uppercase", children: "Additive / Harmonic" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/HarmonicPanel.tsx",
        lineNumber: 116,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: clearHarmonics,
          title: "Clear all harmonics",
          className: "p-1 rounded text-text-muted hover:text-text-primary border border-dark-border",
          children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(RotateCcw, { size: 12 }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/HarmonicPanel.tsx",
            lineNumber: 124,
            columnNumber: 11
          }, void 0)
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/HarmonicPanel.tsx",
          lineNumber: 119,
          columnNumber: 9
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/HarmonicPanel.tsx",
      lineNumber: 115,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      HarmonicBarsCanvas,
      {
        harmonics: padded,
        count: HARMONIC_COUNT,
        width: canvasWidth,
        height: canvasHeight,
        barColor: "rgba(34, 211, 238, 0.6)",
        highlightColor: "rgba(34, 211, 238, 1)",
        gradient: true,
        showLabels: true,
        onDrag: handleDrag
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/HarmonicPanel.tsx",
        lineNumber: 129,
        columnNumber: 9
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/HarmonicPanel.tsx",
      lineNumber: 128,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap items-center gap-1", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] font-mono text-text-muted uppercase mr-1", children: "Presets:" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/HarmonicPanel.tsx",
        lineNumber: 143,
        columnNumber: 9
      }, void 0),
      HARMONIC_PRESETS.map((preset) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => applyHarmonics(preset.values),
          className: "px-2 py-0.5 rounded text-[9px] font-mono bg-dark-bg text-text-muted hover:text-text-primary border border-dark-border hover:border-accent-highlight/50",
          children: preset.name
        },
        preset.name,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/HarmonicPanel.tsx",
          lineNumber: 145,
          columnNumber: 11
        },
        void 0
      ))
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/HarmonicPanel.tsx",
      lineNumber: 142,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-[9px] font-mono text-text-subtle", children: "Drag in the chart to set harmonic amplitudes. Wavetable updates live." }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/HarmonicPanel.tsx",
      lineNumber: 155,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/editors/wavetable/HarmonicPanel.tsx",
    lineNumber: 114,
    columnNumber: 5
  }, void 0);
};
function getPresetPoints(preset, cutoff = 2e3) {
  switch (preset) {
    case "lowpass":
      return [
        { frequency: 20, gain: 0 },
        { frequency: cutoff, gain: 0 },
        { frequency: cutoff * 1.5, gain: -60 },
        { frequency: 2e4, gain: -60 }
      ];
    case "highpass":
      return [
        { frequency: 20, gain: -60 },
        { frequency: cutoff * 0.67, gain: -60 },
        { frequency: cutoff, gain: 0 },
        { frequency: 2e4, gain: 0 }
      ];
    case "bandpass":
      return [
        { frequency: 20, gain: -60 },
        { frequency: cutoff * 0.75, gain: 0 },
        { frequency: cutoff, gain: 0 },
        { frequency: cutoff * 1.33, gain: 0 },
        { frequency: cutoff * 2, gain: -60 },
        { frequency: 2e4, gain: -60 }
      ];
    case "notch":
      return [
        { frequency: 20, gain: 0 },
        { frequency: cutoff * 0.75, gain: 0 },
        { frequency: cutoff, gain: -60 },
        { frequency: cutoff * 1.33, gain: 0 },
        { frequency: 2e4, gain: 0 }
      ];
    case "custom":
    default:
      return [
        { frequency: 20, gain: 0 },
        { frequency: 2e4, gain: 0 }
      ];
  }
}
function interpolateGain(points, frequency) {
  if (points.length === 0) return 0;
  const sorted = [...points].sort((a, b) => a.frequency - b.frequency);
  if (frequency <= sorted[0].frequency) return sorted[0].gain;
  if (frequency >= sorted[sorted.length - 1].frequency) return sorted[sorted.length - 1].gain;
  const logFreq = Math.log10(frequency);
  for (let i = 0; i < sorted.length - 1; i++) {
    const lo = sorted[i];
    const hi = sorted[i + 1];
    if (frequency >= lo.frequency && frequency <= hi.frequency) {
      const logLo = Math.log10(lo.frequency);
      const logHi = Math.log10(hi.frequency);
      const t = (logFreq - logLo) / (logHi - logLo);
      return lo.gain + t * (hi.gain - lo.gain);
    }
  }
  return sorted[sorted.length - 1].gain;
}
function buildGainCurve(points, fftSize, sampleRate) {
  const numBins = fftSize / 2 + 1;
  const curve = new Float32Array(numBins);
  for (let i = 0; i < numBins; i++) {
    const freq = i * sampleRate / fftSize;
    const dB = interpolateGain(points, freq === 0 ? 1e-6 : freq);
    curve[i] = Math.pow(10, dB / 20);
  }
  return curve;
}
function bitReversalPermutation(re, im) {
  const n = re.length;
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      const tmpR = re[i];
      re[i] = re[j];
      re[j] = tmpR;
      const tmpI = im[i];
      im[i] = im[j];
      im[j] = tmpI;
    }
  }
}
function fft(re, im) {
  const n = re.length;
  bitReversalPermutation(re, im);
  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1;
    const angleStep = -2 * Math.PI / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < halfLen; k++) {
        const angle = angleStep * k;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        const uR = re[i + k];
        const uI = im[i + k];
        const vR = re[i + k + halfLen] * cosA - im[i + k + halfLen] * sinA;
        const vI = re[i + k + halfLen] * sinA + im[i + k + halfLen] * cosA;
        re[i + k] = uR + vR;
        im[i + k] = uI + vI;
        re[i + k + halfLen] = uR - vR;
        im[i + k + halfLen] = uI - vI;
      }
    }
  }
}
function ifft(re, im) {
  const n = re.length;
  for (let i = 0; i < n; i++) {
    im[i] = -im[i];
  }
  fft(re, im);
  const scale = 1 / n;
  for (let i = 0; i < n; i++) {
    re[i] = re[i] * scale;
    im[i] = -im[i] * scale;
  }
}
function makeHannWindow(size) {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    w[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (size - 1)));
  }
  return w;
}
function applySpectralFilter(inputData, gainCurve, fftSize) {
  const hop = fftSize >> 2;
  const hann = makeHannWindow(fftSize);
  const output = new Float32Array(inputData.length + fftSize);
  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);
  for (let offset = 0; offset < inputData.length; offset += hop) {
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < fftSize; i++) {
      const idx = offset + i;
      re[i] = idx < inputData.length ? inputData[idx] * hann[i] : 0;
    }
    fft(re, im);
    const numBins = fftSize / 2 + 1;
    for (let b = 0; b < numBins; b++) {
      const g = gainCurve[b];
      re[b] *= g;
      im[b] *= g;
    }
    for (let b = 1; b < fftSize / 2; b++) {
      const mirror = fftSize - b;
      re[mirror] = re[b];
      im[mirror] = -im[b];
    }
    ifft(re, im);
    for (let i = 0; i < fftSize; i++) {
      output[offset + i] += re[i] * hann[i];
    }
  }
  const normFactor = 2 / 3;
  const result = new Float32Array(inputData.length);
  for (let i = 0; i < inputData.length; i++) {
    result[i] = output[i] * normFactor;
  }
  return result;
}
function computeSpectrum(inputData, fftSize) {
  const hann = makeHannWindow(fftSize);
  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);
  for (let i = 0; i < fftSize; i++) {
    re[i] = i < inputData.length ? inputData[i] * hann[i] : 0;
  }
  fft(re, im);
  const numBins = fftSize / 2 + 1;
  const spectrum = new Float32Array(numBins);
  for (let i = 0; i < numBins; i++) {
    const mag = Math.sqrt(re[i] * re[i] + im[i] * im[i]) / fftSize;
    spectrum[i] = mag > 1e-10 ? 20 * Math.log10(mag) : -120;
  }
  return spectrum;
}
function filterAudioBuffer(buffer, points, fftSize = 4096, selectionStart, selectionEnd) {
  const sampleRate = buffer.sampleRate;
  const numChannels = buffer.numberOfChannels;
  const totalSamples = buffer.length;
  const start = selectionStart ?? 0;
  const end = selectionEnd ?? totalSamples;
  const gainCurve = buildGainCurve(points, fftSize, sampleRate);
  const outChannels = [];
  for (let ch = 0; ch < numChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = new Float32Array(totalSamples);
    dst.set(src);
    const selectionLength = end - start;
    if (selectionLength > 0) {
      const region = new Float32Array(src.subarray(start, end));
      const filtered = applySpectralFilter(region, gainCurve, fftSize);
      dst.set(filtered, start);
    }
    outChannels.push(dst);
  }
  const outBuffer = new AudioBuffer({ numberOfChannels: numChannels, length: totalSamples, sampleRate });
  for (let ch = 0; ch < numChannels; ch++) {
    outBuffer.copyToChannel(outChannels[ch], ch);
  }
  return outBuffer;
}
export {
  HarmonicPanel as H,
  requantize as a,
  applyChipTarget as b,
  reverse as c,
  dcRemove as d,
  phaseAlignToPeak as e,
  fft as f,
  getPresetPoints as g,
  computeSpectrum as h,
  invert as i,
  interpolateGain as j,
  filterAudioBuffer as k,
  mirrorLeftToRight as m,
  normalize as n,
  penInterpolate as p,
  quarterWaveReflect as q,
  resample as r,
  toFloat as t
};
