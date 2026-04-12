/**
 * Pink Trombone AudioWorklet — self-contained vocal tract synthesizer.
 * Bundled from pink-trombone-mod (MIT license, Neil Thapen / chdh).
 * Supports 8 polyphonic voices with per-voice parameter control.
 */

// ── Utils ──────────────────────────────────────────────────────────────────
function clamp(x, min, max) {
  return x < min ? min : x > max ? max : x;
}

function moveTowards(current, target, amountUp, amountDown) {
  return current < target
    ? Math.min(current + amountUp, target)
    : Math.max(current - amountDown, target);
}

function createBiquadIirFilter(b0, b1, b2, a0, a1, a2) {
  const nb0 = b0 / a0, nb1 = b1 / a0, nb2 = b2 / a0;
  const na1 = a1 / a0, na2 = a2 / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => {
    const y = nb0 * x + nb1 * x1 + nb2 * x2 - na1 * y1 - na2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}

function createBandPassFilter(f0, q, sampleRate) {
  const w0 = 2 * Math.PI * f0 / sampleRate;
  const alpha = Math.sin(w0) / (2 * q);
  return createBiquadIirFilter(alpha, 0, -alpha, 1 + alpha, -2 * Math.cos(w0), 1 - alpha);
}

function createBufferedWhiteNoiseSource(bufferSize) {
  const buf = new Float64Array(bufferSize);
  for (let i = 0; i < bufferSize; i++) buf[i] = 2 * Math.random() - 1;
  let idx = 0;
  return () => { if (idx >= bufferSize) idx = 0; return buf[idx++]; };
}

function createFilteredNoiseSource(f0, q, sampleRate, bufferSize) {
  const wn = createBufferedWhiteNoiseSource(bufferSize);
  const filter = createBandPassFilter(f0, q, sampleRate);
  return () => filter(wn());
}

// ── NoiseGenerator (Simplex) ───────────────────────────────────────────────
const _grad3 = [
  [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
  [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
  [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]
];
const _p = [
  151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,
  103,30,69,142,8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,
  26,197,62,94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,
  87,174,20,125,136,171,168,68,175,74,165,71,134,139,48,27,166,77,
  146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,55,46,245,
  40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,
  18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,
  52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,
  59,227,47,16,58,17,182,189,28,42,223,183,170,213,119,248,152,2,44,
  154,163,70,221,153,101,155,167,43,172,9,129,22,39,253,19,98,108,
  110,79,113,224,232,178,185,112,104,218,246,97,228,251,34,242,193,
  238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,107,49,192,
  214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,138,
  236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180
];
const _perm = new Array(512);
const _gradP = new Array(512);

function noiseSeed(seed0) {
  let seed = seed0;
  if (seed > 0 && seed < 1) seed *= 65536;
  seed = Math.floor(seed);
  if (seed < 256) seed |= seed << 8;
  for (let i = 0; i < 256; i++) {
    const v = (i & 1) ? _p[i] ^ (seed & 255) : _p[i] ^ ((seed >> 8) & 255);
    _perm[i] = _perm[i + 256] = v;
    _gradP[i] = _gradP[i + 256] = _grad3[v % 12];
  }
}
noiseSeed(Date.now());

const _f2 = 0.5 * (Math.sqrt(3) - 1);
const _g2 = (3 - Math.sqrt(3)) / 6;

function simplex2(xin, yin) {
  const s = (xin + yin) * _f2;
  let i = Math.floor(xin + s), j = Math.floor(yin + s);
  const t = (i + j) * _g2;
  const x0 = xin - i + t, y0 = yin - j + t;
  const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
  const x1 = x0 - i1 + _g2, y1 = y0 - j1 + _g2;
  const x2 = x0 - 1 + 2 * _g2, y2 = y0 - 1 + 2 * _g2;
  i &= 255; j &= 255;
  const gi0 = _gradP[i + _perm[j]];
  const gi1 = _gradP[i + i1 + _perm[j + j1]];
  const gi2 = _gradP[i + 1 + _perm[j + 1]];
  let n0, n1, n2;
  let t0 = 0.5 - x0 * x0 - y0 * y0;
  n0 = t0 < 0 ? 0 : (t0 *= t0, t0 * t0 * (gi0[0] * x0 + gi0[1] * y0));
  let t1 = 0.5 - x1 * x1 - y1 * y1;
  n1 = t1 < 0 ? 0 : (t1 *= t1, t1 * t1 * (gi1[0] * x1 + gi1[1] * y1));
  let t2 = 0.5 - x2 * x2 - y2 * y2;
  n2 = t2 < 0 ? 0 : (t2 *= t2, t2 * t2 * (gi2[0] * x2 + gi2[1] * y2));
  return 70 * (n0 + n1 + n2);
}

function simplex1(x) { return simplex2(x * 1.2, -x * 0.7); }

// ── Glottis ────────────────────────────────────────────────────────────────
class Glottis {
  constructor(sampleRate) {
    this.alwaysVoice = true;
    this.autoWobble = false;
    this.isTouched = false;
    this.targetTenseness = 0.6;
    this.targetFrequency = 140;
    this.vibratoAmount = 0.005;
    this.vibratoFrequency = 6;
    this.sampleCount = 0;
    this.intensity = 0;
    this.loudness = 1;
    this.smoothFrequency = 140;
    this.timeInWaveform = 0;
    this.newTenseness = 0.6;
    this.oldTenseness = 0.6;
    this.newFrequency = 140;
    this.oldFrequency = 140;
    this.sampleRate = sampleRate;
    this.aspirationNoiseSource = createFilteredNoiseSource(500, 0.5, sampleRate, 0x8000);
    this.setupWaveform(0);
  }
  step(lambda) {
    const time = this.sampleCount / this.sampleRate;
    if (this.timeInWaveform > this.waveformLength) {
      this.timeInWaveform -= this.waveformLength;
      this.setupWaveform(lambda);
    }
    const out1 = this.normalizedLFWaveform(this.timeInWaveform / this.waveformLength);
    const aspirationNoise = this.aspirationNoiseSource();
    const aspiration1 = this.intensity * (1 - Math.sqrt(this.targetTenseness)) * this.getNoiseModulator() * aspirationNoise;
    const aspiration2 = aspiration1 * (0.2 + 0.02 * simplex1(time * 1.99));
    this.sampleCount++;
    this.timeInWaveform += 1 / this.sampleRate;
    return out1 + aspiration2;
  }
  getNoiseModulator() {
    const voiced = 0.1 + 0.2 * Math.max(0, Math.sin(Math.PI * 2 * this.timeInWaveform / this.waveformLength));
    return this.targetTenseness * this.intensity * voiced + (1 - this.targetTenseness * this.intensity) * 0.3;
  }
  adjustParameters(deltaTime) {
    const delta = deltaTime * this.sampleRate / 512;
    const oldTime = this.sampleCount / this.sampleRate;
    const newTime = oldTime + deltaTime;
    this.adjustIntensity(delta);
    this.calculateNewFrequency(newTime, delta);
    this.calculateNewTenseness(newTime);
  }
  calculateNewFrequency(time, delta) {
    if (this.intensity == 0) {
      this.smoothFrequency = this.targetFrequency;
    } else if (this.targetFrequency > this.smoothFrequency) {
      this.smoothFrequency = Math.min(this.smoothFrequency * (1 + 0.1 * delta), this.targetFrequency);
    } else if (this.targetFrequency < this.smoothFrequency) {
      this.smoothFrequency = Math.max(this.smoothFrequency / (1 + 0.1 * delta), this.targetFrequency);
    }
    this.oldFrequency = this.newFrequency;
    this.newFrequency = Math.max(10, this.smoothFrequency * (1 + this.calculateVibrato(time)));
  }
  calculateNewTenseness(time) {
    this.oldTenseness = this.newTenseness;
    this.newTenseness = Math.max(0, this.targetTenseness + 0.1 * simplex1(time * 0.46) + 0.05 * simplex1(time * 0.36));
    if (!this.isTouched && this.alwaysVoice) {
      this.newTenseness += (3 - this.targetTenseness) * (1 - this.intensity);
    }
  }
  adjustIntensity(delta) {
    if (this.isTouched || this.alwaysVoice) {
      this.intensity += 0.13 * delta;
    } else {
      this.intensity -= 0.05 * delta;
    }
    this.intensity = clamp(this.intensity, 0, 1);
  }
  calculateVibrato(time) {
    let vibrato = 0;
    vibrato += this.vibratoAmount * Math.sin(2 * Math.PI * time * this.vibratoFrequency);
    vibrato += 0.02 * simplex1(time * 4.07);
    vibrato += 0.04 * simplex1(time * 2.15);
    if (this.autoWobble) {
      vibrato += 0.2 * simplex1(time * 0.98);
      vibrato += 0.4 * simplex1(time * 0.5);
    }
    return vibrato;
  }
  setupWaveform(lambda) {
    const frequency = this.oldFrequency * (1 - lambda) + this.newFrequency * lambda;
    const tenseness = this.oldTenseness * (1 - lambda) + this.newTenseness * lambda;
    this.waveformLength = 1 / frequency;
    this.loudness = Math.pow(Math.max(0, tenseness), 0.25);
    const rd = clamp(3 * (1 - tenseness), 0.5, 2.7);
    const ra = -0.01 + 0.048 * rd;
    const rk = 0.224 + 0.118 * rd;
    const rg = (rk / 4) * (0.5 + 1.2 * rk) / (0.11 * rd - ra * (0.5 + 1.2 * rk));
    const ta = ra;
    const tp = 1 / (2 * rg);
    const te = tp + tp * rk;
    const epsilon = 1 / ta;
    const shift = Math.exp(-epsilon * (1 - te));
    const delta = 1 - shift;
    const rhsIntegral = ((1 / epsilon) * (shift - 1) + (1 - te) * shift) / delta;
    const totalLowerIntegral = rhsIntegral - (te - tp) / 2;
    const totalUpperIntegral = -totalLowerIntegral;
    const omega = Math.PI / tp;
    const s = Math.sin(omega * te);
    const y = -Math.PI * s * totalUpperIntegral / (tp * 2);
    const z = Math.log(y);
    const alpha = z / (tp / 2 - te);
    const e0 = -1 / (s * Math.exp(alpha * te));
    this.alpha = alpha;
    this.e0 = e0;
    this.epsilon = epsilon;
    this.shift = shift;
    this.delta = delta;
    this.te = te;
    this.omega = omega;
  }
  normalizedLFWaveform(t) {
    let output;
    if (t > this.te) {
      output = (-Math.exp(-this.epsilon * (t - this.te)) + this.shift) / this.delta;
    } else {
      output = this.e0 * Math.exp(this.alpha * t) * Math.sin(this.omega * t);
    }
    return output * this.intensity * this.loudness;
  }
}

// ── Tract ──────────────────────────────────────────────────────────────────
class Tract {
  constructor(glottis, tractSampleRate) {
    this.n = 44;
    this.bladeStart = 10;
    this.tipStart = 32;
    this.lipStart = 39;
    this.noseLength = 28;
    this.noseStart = this.n - this.noseLength + 1;
    this.glottalReflection = 0.75;
    this.lipReflection = -0.85;
    this.sampleCount = 0;
    this.time = 0;
    this.transients = [];
    this.turbulencePoints = [];
    this.glottis = glottis;
    this.tractSampleRate = tractSampleRate;
    this.fricationNoiseSource = createFilteredNoiseSource(1000, 0.5, tractSampleRate, 0x8000);
    this.diameter = new Float64Array(this.n);
    this.right = new Float64Array(this.n);
    this.left = new Float64Array(this.n);
    this.reflection = new Float64Array(this.n);
    this.newReflection = new Float64Array(this.n);
    this.junctionOutputRight = new Float64Array(this.n);
    this.junctionOutputLeft = new Float64Array(this.n + 1);
    this.maxAmplitude = new Float64Array(this.n);
    this.noseRight = new Float64Array(this.noseLength);
    this.noseLeft = new Float64Array(this.noseLength);
    this.noseJunctionOutputRight = new Float64Array(this.noseLength);
    this.noseJunctionOutputLeft = new Float64Array(this.noseLength + 1);
    this.noseReflection = new Float64Array(this.noseLength);
    this.noseDiameter = new Float64Array(this.noseLength);
    this.noseMaxAmplitude = new Float64Array(this.noseLength);
    this.newReflectionLeft = 0;
    this.newReflectionRight = 0;
    this.newReflectionNose = 0;
  }
  calculateNoseReflections() {
    const a = new Float64Array(this.noseLength);
    for (let i = 0; i < this.noseLength; i++) a[i] = Math.max(1E-6, this.noseDiameter[i] ** 2);
    for (let i = 1; i < this.noseLength; i++) this.noseReflection[i] = (a[i - 1] - a[i]) / (a[i - 1] + a[i]);
  }
  calculateNewBlockParameters() {
    this.calculateMainTractReflections();
    this.calculateNoseJunctionReflections();
  }
  calculateMainTractReflections() {
    const a = new Float64Array(this.n);
    for (let i = 0; i < this.n; i++) a[i] = this.diameter[i] ** 2;
    for (let i = 1; i < this.n; i++) {
      this.reflection[i] = this.newReflection[i];
      const sum = a[i - 1] + a[i];
      this.newReflection[i] = (Math.abs(sum) > 1E-6) ? (a[i - 1] - a[i]) / sum : 1;
    }
  }
  calculateNoseJunctionReflections() {
    this.reflectionLeft = this.newReflectionLeft;
    this.reflectionRight = this.newReflectionRight;
    this.reflectionNose = this.newReflectionNose;
    const velumA = this.noseDiameter[0] ** 2;
    const an0 = this.diameter[this.noseStart] ** 2;
    const an1 = this.diameter[this.noseStart + 1] ** 2;
    const sum = an0 + an1 + velumA;
    this.newReflectionLeft = (Math.abs(sum) > 1E-6) ? (2 * an0 - sum) / sum : 1;
    this.newReflectionRight = (Math.abs(sum) > 1E-6) ? (2 * an1 - sum) / sum : 1;
    this.newReflectionNose = (Math.abs(sum) > 1E-6) ? (2 * velumA - sum) / sum : 1;
  }
  step(glottalOutput, lambda) {
    this.processTransients();
    this.addTurbulenceNoise();
    this.junctionOutputRight[0] = this.left[0] * this.glottalReflection + glottalOutput;
    this.junctionOutputLeft[this.n] = this.right[this.n - 1] * this.lipReflection;
    for (let i = 1; i < this.n; i++) {
      const r = this.reflection[i] * (1 - lambda) + this.newReflection[i] * lambda;
      const w = r * (this.right[i - 1] + this.left[i]);
      this.junctionOutputRight[i] = this.right[i - 1] - w;
      this.junctionOutputLeft[i] = this.left[i] + w;
    }
    {
      const i = this.noseStart;
      let r = this.newReflectionLeft * (1 - lambda) + this.reflectionLeft * lambda;
      this.junctionOutputLeft[i] = r * this.right[i - 1] + (1 + r) * (this.noseLeft[0] + this.left[i]);
      r = this.newReflectionRight * (1 - lambda) + this.reflectionRight * lambda;
      this.junctionOutputRight[i] = r * this.left[i] + (1 + r) * (this.right[i - 1] + this.noseLeft[0]);
      r = this.newReflectionNose * (1 - lambda) + this.reflectionNose * lambda;
      this.noseJunctionOutputRight[0] = r * this.noseLeft[0] + (1 + r) * (this.left[i] + this.right[i - 1]);
    }
    for (let i = 0; i < this.n; i++) {
      const right = this.junctionOutputRight[i] * 0.999;
      const left = this.junctionOutputLeft[i + 1] * 0.999;
      this.right[i] = right;
      this.left[i] = left;
      const amplitude = Math.abs(right + left);
      this.maxAmplitude[i] = Math.max(this.maxAmplitude[i] *= 0.9999, amplitude);
    }
    const lipOutput = this.right[this.n - 1];
    this.noseJunctionOutputLeft[this.noseLength] = this.noseRight[this.noseLength - 1] * this.lipReflection;
    for (let i = 1; i < this.noseLength; i++) {
      const w = this.noseReflection[i] * (this.noseRight[i - 1] + this.noseLeft[i]);
      this.noseJunctionOutputRight[i] = this.noseRight[i - 1] - w;
      this.noseJunctionOutputLeft[i] = this.noseLeft[i] + w;
    }
    for (let i = 0; i < this.noseLength; i++) {
      const right = this.noseJunctionOutputRight[i];
      const left = this.noseJunctionOutputLeft[i + 1];
      this.noseRight[i] = right;
      this.noseLeft[i] = left;
      const amplitude = Math.abs(right + left);
      this.noseMaxAmplitude[i] = Math.max(this.noseMaxAmplitude[i] *= 0.9999, amplitude);
    }
    const noseOutput = this.noseRight[this.noseLength - 1];
    this.sampleCount++;
    this.time = this.sampleCount / this.tractSampleRate;
    return lipOutput + noseOutput;
  }
  processTransients() {
    for (let i = this.transients.length - 1; i >= 0; i--) {
      const trans = this.transients[i];
      const timeAlive = this.time - trans.startTime;
      if (timeAlive > trans.lifeTime) { this.transients.splice(i, 1); continue; }
      const amplitude = trans.strength * Math.pow(2, -trans.exponent * timeAlive);
      this.right[trans.position] += amplitude / 2;
      this.left[trans.position] += amplitude / 2;
    }
  }
  addTurbulenceNoise() {
    const fricativeAttackTime = 0.1;
    for (const p of this.turbulencePoints) {
      if (p.position < 2 || p.position > this.n) continue;
      if (p.diameter <= 0) continue;
      let intensity;
      if (isNaN(p.endTime)) {
        intensity = clamp((this.time - p.startTime) / fricativeAttackTime, 0, 1);
      } else {
        intensity = clamp(1 - (this.time - p.endTime) / fricativeAttackTime, 0, 1);
      }
      if (intensity <= 0) continue;
      const turbulenceNoise = 0.66 * this.fricationNoiseSource() * intensity * this.glottis.getNoiseModulator();
      this.addTurbulenceNoiseAtPosition(turbulenceNoise, p.position, p.diameter);
    }
  }
  addTurbulenceNoiseAtPosition(turbulenceNoise, position, diameter) {
    const i = Math.floor(position);
    const delta = position - i;
    const thinness0 = clamp(8 * (0.7 - diameter), 0, 1);
    const openness = clamp(30 * (diameter - 0.3), 0, 1);
    const noise0 = turbulenceNoise * (1 - delta) * thinness0 * openness;
    const noise1 = turbulenceNoise * delta * thinness0 * openness;
    if (i + 1 < this.n) { this.right[i + 1] += noise0 / 2; this.left[i + 1] += noise0 / 2; }
    if (i + 2 < this.n) { this.right[i + 2] += noise1 / 2; this.left[i + 2] += noise1 / 2; }
  }
}

// ── TractShaper ────────────────────────────────────────────────────────────
const gridOffset = 1.7;

class TractShaper {
  constructor(tract) {
    this.movementSpeed = 15;
    this.velumOpenTarget = 0.4;
    this.velumClosedTarget = 0.01;
    this.lastObstruction = -1;
    this.tract = tract;
    this.targetDiameter = new Float64Array(tract.n);
    this.tongueIndex = 12.9;
    this.tongueDiameter = 2.43;
    this.shapeNose(true);
    tract.calculateNoseReflections();
    this.shapeNose(false);
    this.shapeMainTract();
  }
  shapeMainTract() {
    const tract = this.tract;
    for (let i = 0; i < tract.n; i++) {
      const d = this.getRestDiameter(i);
      tract.diameter[i] = d;
      this.targetDiameter[i] = d;
    }
  }
  getRestDiameter(i) {
    const tract = this.tract;
    if (i < 7) return 0.6;
    if (i < tract.bladeStart) return 1.1;
    if (i >= tract.lipStart) return 1.5;
    const t = 1.1 * Math.PI * (this.tongueIndex - i) / (tract.tipStart - tract.bladeStart);
    const fixedTongueDiameter = 2 + (this.tongueDiameter - 2) / 1.5;
    let curve = (1.5 - fixedTongueDiameter + gridOffset) * Math.cos(t);
    if (i == tract.bladeStart - 2 || i == tract.lipStart - 1) curve *= 0.8;
    if (i == tract.bladeStart || i == tract.lipStart - 2) curve *= 0.94;
    return 1.5 - curve;
  }
  adjustTractShape(deltaTime) {
    const tract = this.tract;
    const amount = deltaTime * this.movementSpeed;
    let newLastObstruction = -1;
    for (let i = 0; i < tract.n; i++) {
      const diameter = tract.diameter[i];
      const targetDiameter = this.targetDiameter[i];
      if (diameter <= 0) newLastObstruction = i;
      let slowReturn;
      if (i < tract.noseStart) slowReturn = 0.6;
      else if (i >= tract.tipStart) slowReturn = 1;
      else slowReturn = 0.6 + 0.4 * (i - tract.noseStart) / (tract.tipStart - tract.noseStart);
      tract.diameter[i] = moveTowards(diameter, targetDiameter, slowReturn * amount, 2 * amount);
    }
    if (this.lastObstruction > -1 && newLastObstruction == -1 && tract.noseDiameter[0] < 0.223) {
      this.addTransient(this.lastObstruction);
    }
    this.lastObstruction = newLastObstruction;
    tract.noseDiameter[0] = moveTowards(tract.noseDiameter[0], this.velumTarget, amount * 0.25, amount * 0.1);
  }
  addTransient(position) {
    this.tract.transients.push({
      position, startTime: this.tract.time,
      lifeTime: 0.2, strength: 0.3, exponent: 200
    });
  }
  shapeNose(velumOpen) {
    const tract = this.tract;
    this.velumTarget = velumOpen ? this.velumOpenTarget : this.velumClosedTarget;
    for (let i = 0; i < tract.noseLength; i++) {
      let diameter;
      const d = 2 * (i / tract.noseLength);
      if (i == 0) diameter = this.velumTarget;
      else if (d < 1) diameter = 0.4 + 1.6 * d;
      else diameter = 0.5 + 1.5 * (2 - d);
      diameter = Math.min(diameter, 1.9);
      tract.noseDiameter[i] = diameter;
    }
  }
}

// ── Synthesizer ────────────────────────────────────────────────────────────
const maxBlockLength = 512;

class Synthesizer {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;
    this.glottis = new Glottis(sampleRate);
    const tractSampleRate = 2 * sampleRate;
    this.tract = new Tract(this.glottis, tractSampleRate);
    this.tractShaper = new TractShaper(this.tract);
  }
  reset() { this.calculateNewBlockParameters(0); }
  synthesize(buf) {
    let p = 0;
    while (p < buf.length) {
      const blockLength = Math.min(maxBlockLength, buf.length - p);
      const blockBuf = buf.subarray(p, p + blockLength);
      this.synthesizeBlock(blockBuf);
      p += blockLength;
    }
  }
  synthesizeBlock(buf) {
    const n = buf.length;
    const deltaTime = n / this.sampleRate;
    this.calculateNewBlockParameters(deltaTime);
    for (let i = 0; i < n; i++) {
      const lambda1 = i / n;
      const lambda2 = (i + 0.5) / n;
      const glottalOutput = this.glottis.step(lambda1);
      const vocalOutput1 = this.tract.step(glottalOutput, lambda1);
      const vocalOutput2 = this.tract.step(glottalOutput, lambda2);
      buf[i] = (vocalOutput1 + vocalOutput2) * 0.125;
    }
  }
  calculateNewBlockParameters(deltaTime) {
    this.glottis.adjustParameters(deltaTime);
    this.tractShaper.adjustTractShape(deltaTime);
    this.tract.calculateNewBlockParameters();
  }
}

// ── Voice (per-note instance) ──────────────────────────────────────────────
class Voice {
  constructor(sampleRate) {
    this.synth = new Synthesizer(sampleRate);
    this.active = false;
    this.note = -1;
    this.velocity = 1;
    this.releaseGain = 1;
    this.releasing = false;
    this.releaseRate = 0; // gain decrease per sample
    // Disable auto-wobble for musical use
    this.synth.glottis.autoWobble = false;
    this.synth.glottis.alwaysVoice = false;
    this.synth.glottis.isTouched = false;
  }
  noteOn(note, velocity, params) {
    const freq = 440 * Math.pow(2, (note - 69) / 12);
    this.synth.glottis.targetFrequency = freq;
    this.synth.glottis.isTouched = true;
    this.synth.glottis.alwaysVoice = true;
    this.active = true;
    this.note = note;
    this.velocity = velocity;
    this.releaseGain = 1;
    this.releasing = false;
    this.applyParams(params);
  }
  noteOff(sampleRate) {
    this.releasing = true;
    // Fade out over ~30ms
    this.releaseRate = 1 / (sampleRate * 0.03);
    this.synth.glottis.isTouched = false;
    this.synth.glottis.alwaysVoice = false;
  }
  applyParams(params) {
    if (params.tenseness !== undefined)
      this.synth.glottis.targetTenseness = params.tenseness;
    if (params.tongueIndex !== undefined)
      this.synth.tractShaper.tongueIndex = params.tongueIndex;
    if (params.tongueDiameter !== undefined)
      this.synth.tractShaper.tongueDiameter = params.tongueDiameter;
    if (params.lipDiameter !== undefined) {
      // Set lip segments directly
      for (let i = this.synth.tract.lipStart; i < this.synth.tract.n; i++) {
        this.synth.tractShaper.targetDiameter[i] = params.lipDiameter;
      }
    }
    if (params.velumTarget !== undefined)
      this.synth.tractShaper.velumTarget = params.velumTarget;
    if (params.vibratoAmount !== undefined)
      this.synth.glottis.vibratoAmount = params.vibratoAmount;
    if (params.vibratoFrequency !== undefined)
      this.synth.glottis.vibratoFrequency = params.vibratoFrequency;
    if (params.constrictionIndex !== undefined && params.constrictionDiameter !== undefined) {
      // Apply constriction at a specific point in the tract
      const idx = Math.floor(params.constrictionIndex);
      if (idx >= 2 && idx < this.synth.tract.n - 2) {
        this.synth.tractShaper.targetDiameter[idx] = params.constrictionDiameter;
        this.synth.tractShaper.targetDiameter[idx - 1] = params.constrictionDiameter;
        this.synth.tractShaper.targetDiameter[idx + 1] = params.constrictionDiameter;
      }
    }
    // Update tongue shape after params change
    this.synth.tractShaper.shapeMainTract();
  }
}

// ── Processor ──────────────────────────────────────────────────────────────
const MAX_VOICES = 8;

class PinkTromboneProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.voices = [];
    for (let i = 0; i < MAX_VOICES; i++) {
      this.voices.push(new Voice(sampleRate));
    }
    this.params = {
      tenseness: 0.6,
      tongueIndex: 12.9,
      tongueDiameter: 2.43,
      lipDiameter: 1.5,
      velumTarget: 0.01,
      vibratoAmount: 0.005,
      vibratoFrequency: 6,
      constrictionIndex: 25,
      constrictionDiameter: 3,
    };
    this.port.onmessage = (e) => this.handleMessage(e.data);
    this.port.postMessage({ type: 'ready' });
  }

  handleMessage(msg) {
    switch (msg.type) {
      case 'noteOn': {
        const voice = this.allocateVoice(msg.note);
        voice.noteOn(msg.note, msg.velocity || 1, this.params);
        break;
      }
      case 'noteOff': {
        for (const v of this.voices) {
          if (v.active && v.note === msg.note) {
            v.noteOff(sampleRate);
          }
        }
        break;
      }
      case 'allNotesOff': {
        for (const v of this.voices) {
          if (v.active) v.noteOff(sampleRate);
        }
        break;
      }
      case 'param': {
        if (msg.key in this.params) {
          this.params[msg.key] = msg.value;
          // Apply to all active voices
          for (const v of this.voices) {
            if (v.active) v.applyParams({ [msg.key]: msg.value });
          }
        }
        break;
      }
      case 'params': {
        Object.assign(this.params, msg.params);
        for (const v of this.voices) {
          if (v.active) v.applyParams(msg.params);
        }
        break;
      }
      case 'pitchBend': {
        // msg.value is semitones offset
        for (const v of this.voices) {
          if (v.active && !v.releasing) {
            const freq = 440 * Math.pow(2, (v.note + msg.value - 69) / 12);
            v.synth.glottis.targetFrequency = freq;
          }
        }
        break;
      }
    }
  }

  allocateVoice(note) {
    // Reuse voice with same note
    for (const v of this.voices) {
      if (v.active && v.note === note) return v;
    }
    // Find inactive voice
    for (const v of this.voices) {
      if (!v.active) return v;
    }
    // Find releasing voice
    for (const v of this.voices) {
      if (v.releasing) return v;
    }
    // Steal oldest voice
    return this.voices[0];
  }

  process(inputs, outputs) {
    const output = outputs[0];
    if (!output || !output[0]) return true;
    const buf = output[0];
    const len = buf.length;

    // Clear output
    buf.fill(0);

    const tempBuf = new Float32Array(len);

    for (const voice of this.voices) {
      if (!voice.active) continue;

      // Render this voice
      tempBuf.fill(0);
      voice.synth.synthesize(tempBuf);

      // Mix into output with velocity and release envelope
      for (let i = 0; i < len; i++) {
        if (voice.releasing) {
          voice.releaseGain -= voice.releaseRate;
          if (voice.releaseGain <= 0) {
            voice.releaseGain = 0;
            voice.active = false;
            break;
          }
        }
        buf[i] += tempBuf[i] * voice.velocity * voice.releaseGain;
      }
    }

    return true;
  }
}

registerProcessor('pink-trombone-processor', PinkTromboneProcessor);
