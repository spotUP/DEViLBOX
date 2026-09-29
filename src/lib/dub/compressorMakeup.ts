/**
 * The make-up gain a Web Audio DynamicsCompressorNode applies on its own.
 *
 * The spec (Web Audio API, DynamicsCompressorNode, "computing the makeup
 * gain") has every compressor raise its output by (1 / curve(1.0))^0.6 - the
 * inverse of what its static curve does to a full-scale signal, to the 0.6
 * power - and there is no way to turn it off. The dub bus's two compressors
 * (sidechain pump, glue) therefore ADDED level: measured 2026-09-30 with pink
 * noise at the defaults, +4.1 dB each, most of what made the echo return run
 * 11.5 dB over the bus input ("the echo/reverb is still on overdrive drowning
 * everything"). A trim of 1 / compressorMakeupGain(...) after each node
 * leaves it a compressor: unity below the threshold, less above.
 *
 * The curve is the spec's (and Chromium's DynamicsCompressorKernel): linear
 * below the threshold, an exponential knee from threshold to threshold+knee
 * whose constant k is fitted so the slope at the knee's end is 1/ratio, then
 * 1/ratio in dB above it.
 */

const dbToLin = (db: number) => Math.pow(10, db / 20);
const linToDb = (x: number) => (x > 0 ? 20 * Math.log10(x) : -1000);

interface Curve { linearThreshold: number; kneeThreshold: number; ykneeThresholdDb: number; slope: number; k: number }

function kneeCurve(x: number, linearThreshold: number, k: number): number {
  if (x < linearThreshold) return x;
  return linearThreshold + (1 - Math.exp(-k * (x - linearThreshold))) / k;
}

function saturate(x: number, c: Curve): number {
  if (x < c.linearThreshold) return x;
  if (x < c.kneeThreshold) return kneeCurve(x, c.linearThreshold, c.k);
  return dbToLin(c.ykneeThresholdDb + c.slope * (linToDb(x) - linToDb(c.kneeThreshold)));
}

/** Slope (dB out per dB in) of the knee curve at x, for knee constant k. */
function kneeSlopeAt(x: number, linearThreshold: number, k: number): number {
  if (x < linearThreshold) return 1;
  const x2 = x * 1.001;
  const y = kneeCurve(x, linearThreshold, k);
  const y2 = kneeCurve(x2, linearThreshold, k);
  return (linToDb(y2) - linToDb(y)) / (linToDb(x2) - linToDb(x));
}

/** The knee constant whose slope at the knee's end is `slope` (Chromium: kAtSlope, binary search). */
function kAtSlope(slope: number, linearThreshold: number, kneeThreshold: number): number {
  let minK = 0.1, maxK = 10000, k = 5;
  for (let i = 0; i < 15; i++) {
    const s = kneeSlopeAt(kneeThreshold, linearThreshold, k);
    if (s < slope) maxK = k; else minK = k;
    k = Math.sqrt(minK * maxK);
  }
  return k;
}

/** The linear make-up gain a DynamicsCompressorNode with these settings applies. */
export function compressorMakeupGain(thresholdDb: number, kneeDb: number, ratio: number): number {
  if (!(ratio > 1)) return 1; // 1:1 compresses nothing and makes nothing up
  const linearThreshold = dbToLin(thresholdDb);
  const kneeThreshold = dbToLin(thresholdDb + Math.max(0, kneeDb));
  const slope = 1 / ratio;
  const k = kneeDb > 0 ? kAtSlope(slope, linearThreshold, kneeThreshold) : 1e4;
  const c: Curve = {
    linearThreshold, kneeThreshold, slope, k,
    ykneeThresholdDb: linToDb(kneeCurve(kneeThreshold, linearThreshold, k)),
  };
  const fullRangeGain = saturate(1, c);
  return Math.pow(1 / fullRangeGain, 0.6);
}

/** The trim (linear) that cancels that make-up gain. */
export function compressorMakeupTrim(thresholdDb: number, kneeDb: number, ratio: number): number {
  return 1 / compressorMakeupGain(thresholdDb, kneeDb, ratio);
}
