/**
 * scratch-deck-c.worklet.js - the Up Rough demo's Deck C scratch bus, sample for sample
 * (scratch null test, owner 2026-10-12 "make the demo and devilbox scratch 1:1").
 *
 * The demo renders its scratch layer offline at 22,050 Hz (`three_deck.render`): each stroke is
 * rendered whole (`scratch.render_gesture`, ported in `scratchRender.ts` on the main thread) and
 * summed into the bus at its start sample, then the bus runs
 *
 *   deck_c_eq        hp 200 (butter 2) -> + 0.20 bp 1-3 kHz (butter 2) -> lp 6000 (butter 4)
 *   scratch_channel  hp 160 -> + 0.22 bp 1.5-3 kHz -> tanh(x (1 + 3 drive)) -> tape delay 0.20 s fb 0.32
 *                    (damp 0.5, tanh(1.2 x) and a 2-sample 0.7 Hz wow in the loop), mix `delayMix`
 *                    -> (1 - room) x + room (0.6 short_plate + 0.4 dark_room) -> lp 5000 (butter 4)
 *   tail             + 0.22 dark_room
 *
 * Every stage is causal, so it runs here as the same recursions (scipy lfilter's transposed direct
 * form II, Schroeder combs and allpasses, the echo line), in float64, at the demo's rate: the bus
 * clock is 22,050 Hz whatever the context's rate, and the output is read from it through a
 * band-limited interpolator (a 32-tap Kaiser-windowed sinc, 512 phases, flat to 10 kHz): the demo's
 * 22,050 Hz render as a good playback resampler hears it. At the bus rate (the null test) it is the bus.
 *
 * The level: the demo's two whole-render gains (peak 0.75 in scratch_channel, the RMS match to the beat)
 * cancel into one, the layer at 0.60 x the beat's RMS. Live (`follow`), the bus hears decks A + B on its
 * input and holds its layer at 0.60 x their RMS (X6), each a mean square since the layer's first stroke,
 * the level gliding over ~1 s; without `follow` it stays at `level` (the null test). A routine planned whole
 * is shaped exactly instead ({ type: 'shape' / 'shapeLevel' }): three_deck's level and its duck on the beat's
 * transients, computed from the planned layer and the decks' audio before it plays.
 *
 * Modes: 'chain' - one bus through the routine's chain (three_deck, scratch_dj, a stored version with its
 * low pass); 'sections' - the overlay (render_scratch_section): a stroke names its section, each section
 * sums its strokes up to its end and runs its own `apply_fx`, its tail riding under the next section.
 *
 * Messages: { type: 'stroke', start, samples, section? } - a rendered stroke from bus sample `start`
 * (bus sample n = context time n / busRate); { type: 'level', value }; shape / shapeLevel; { type: 'clear' }.
 * processorOptions: { busRate, coeffs, mode, eq, room, delayMix, drive, tail, tap, level, follow }.
 */

/** scipy lfilter, one sample at a time (a[0] = 1, zero initial state). */
class Tdf2 {
  constructor(ba) {
    const n = Math.max(ba.b.length, ba.a.length);
    this.n = n;
    this.b = new Float64Array(n); this.a = new Float64Array(n);
    for (let i = 0; i < n; i++) { this.b[i] = (ba.b[i] || 0) / ba.a[0]; this.a[i] = (ba.a[i] || 0) / ba.a[0]; }
    this.z = new Float64Array(Math.max(1, n - 1));
  }
  f(x) {
    const n = this.n, b = this.b, a = this.a, z = this.z;
    if (n === 1) return x * b[0];
    const y = z[0] + b[0] * x;
    for (let k = 0; k < n - 2; k++) z[k] = z[k + 1] + x * b[k + 1] - y * a[k + 1];
    z[n - 2] = x * b[n - 1] - y * a[n - 1];
    return y;
  }
}

/** A sample history: x[i - d] for d <= size. */
class Line {
  constructor(size) { this.buf = new Float64Array(size + 1); this.i = 0; }
  push(v) { this.buf[this.i] = v; this.i = (this.i + 1) % this.buf.length; }
  /** The value pushed `d` pushes ago (d >= 1), 0 before the line has filled. */
  ago(d) { const L = this.buf.length; return this.buf[(this.i - d + L * 4) % L]; }
}

/** synth_dsp `reverb(x, kind, mix=1.0, decay)` as a stream: pre-delay, four damped combs averaged, two allpasses. */
class Schroeder {
  constructor(rate, kind, decay) {
    const cfg = kind === 'plate'
      ? { combs: [[0.022, 0.80], [0.029, 0.78], [0.034, 0.77], [0.038, 0.75]], pre: 0.002, damp: 0.1 }
      : { combs: [[0.030, 0.72], [0.037, 0.70], [0.041, 0.68], [0.044, 0.66]], pre: 0.005, damp: 0.2 };
    this.pre = Math.trunc(cfg.pre * rate);
    this.preLine = new Line(Math.max(1, this.pre));
    this.damp = cfg.damp;
    this.combs = cfg.combs.map(([sec, g]) => {
      const d = Math.max(1, Math.trunc(sec * rate));
      return { d, fb: Math.min(0.96, g * decay), line: new Line(d), v: 0 };
    });
    this.ap = [Math.trunc(0.005 * rate), Math.trunc(0.0017 * rate)].map((d) => ({ d, x: new Line(d), y: new Line(d) }));
  }
  step(x) {
    let xp;
    if (this.pre > 0) { xp = this.preLine.ago(this.pre); this.preLine.push(x); } else xp = x;
    let wet = 0;
    for (const c of this.combs) {
      const yd = c.line.ago(c.d);
      c.v = this.damp ? (1 - this.damp) * yd + this.damp * c.v : yd;
      const y = xp + c.fb * c.v;
      c.line.push(y);
      wet = wet + y;
    }
    wet = wet / this.combs.length;
    for (const a of this.ap) {
      const out = -0.7 * wet + (a.x.ago(a.d) + 0.7 * a.y.ago(a.d));
      a.x.push(wet); a.y.push(out);
      wet = out;
    }
    return wet;
  }
}

/** synth_dsp `delay(kind="tape")` as a stream: (1 - mix) x + mix buf, buf[i] = x[i] + fb tanh(1.2 lp(buf[i - dd])). */
class TapeDelay {
  constructor(rate, sec, fb, mix, damp) {
    this.rate = rate;
    this.d = Math.max(1, Math.trunc(sec * rate));
    this.fb = fb; this.mix = mix; this.damp = Math.max(damp, 0.35);
    this.line = new Line(this.d + 3);
    this.lp = 0;
  }
  step(x, i) {
    let b = x;
    if (i >= this.d) {
      const dd = this.d + Math.trunc(2.0 * Math.sin(2 * Math.PI * 0.7 * i / this.rate));
      // buf[i - dd]: the line holds buf up to i - 1
      let v = i - dd >= 0 ? this.line.ago(dd) : 0.0;
      this.lp = (1 - this.damp) * v + this.damp * this.lp;
      v = Math.tanh(1.2 * this.lp);
      b = b + this.fb * v;
    }
    this.line.push(b);
    return (1 - this.mix) * x + this.mix * b;
  }
}

/** The upsampler's kernel: TAPS-tap windowed sinc at PHASES fractional offsets (Kaiser beta 8, cutoff 0.95 x the bus Nyquist). */
const TAPS = 64, PHASES = 512, CUT = 0.95;
function besselI0(x) { let s = 1, t = 1; for (let k = 1; k < 40; k++) { t *= (x / (2 * k)) ** 2; s += t; if (t < 1e-17 * s) break; } return s; }
const KERNEL = (() => {
  const k = new Float64Array((PHASES + 1) * TAPS), beta = 9, i0b = besselI0(beta), half = TAPS / 2;
  for (let p = 0; p <= PHASES; p++) {
    const fr = p / PHASES;
    let sum = 0;
    for (let j = 0; j < TAPS; j++) {
      // tap j weights bus sample (n - half + 1 + j) for an output at n + fr
      const x = j - half + 1 - fr;
      const sinc = x === 0 ? 1 : Math.sin(Math.PI * CUT * x) / (Math.PI * CUT * x);
      const r = x / half;
      const w = Math.abs(r) >= 1 ? 0 : besselI0(beta * Math.sqrt(1 - r * r)) / i0b;
      k[p * TAPS + j] = CUT * sinc * w; sum += k[p * TAPS + j];
    }
    for (let j = 0; j < TAPS; j++) k[p * TAPS + j] /= sum;
  }
  return k;
})();

/**
 * One overlay section (scratch.render_scratch_section): its strokes summed from the section's first bus
 * sample and cut at its end (`out[:bars x bar_len]`), then `apply_fx(profile fx)` on that sum - hp, lp,
 * tanh(x (1 + 4 drive)), a tape delay (fb .25, damp .4), a room (decay .5) - with its own filter state,
 * and the output as long as the demo's: the section, + 4 delay lengths, + 0.12 s of room.
 */
class Section {
  constructor(rate, m) {
    this.start = m.start; this.end = m.end;
    this.hp = m.hp ? new Tdf2(m.hp) : null;
    this.lp = m.lp ? new Tdf2(m.lp) : null;
    this.k = m.drive ? 1.0 + m.drive * 4.0 : 0;
    this.delay = m.delayMix ? new TapeDelay(rate, m.delaySec ?? 0.18, 0.25, m.delayMix, 0.4) : null;
    this.revMix = m.reverbMix || 0;
    this.rev = this.revMix ? new Schroeder(rate, 'room', 0.5) : null;
    this.life = m.end + (this.delay ? 4 * this.delay.d : 0) + (this.rev ? Math.trunc(0.12 * rate) : 0);
    this.strokes = [];
  }
  /** Section output at bus sample i (i >= start). */
  step(i) {
    let x = 0;
    if (i < this.end) {
      for (let s = 0; s < this.strokes.length; s++) {
        const k = this.strokes[s], j = i - k.start;
        if (j >= 0 && j < k.samples.length) x = x + k.samples[j];
      }
    }
    let y = x;
    if (this.hp) y = this.hp.f(y);
    if (this.lp) y = this.lp.f(y);
    if (this.k) y = Math.tanh(this.k * y);
    if (this.delay) y = this.delay.step(y, i - this.start);
    if (this.rev) y = (1 - this.revMix) * y + this.revMix * this.rev.step(y);
    return { x, y };
  }
}

class ScratchDeckCProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};
    const c = o.coeffs;
    this.busRate = o.busRate || 22050;
    // 'chain': one bus through the routine's chain; 'sections': the overlay, a chain per section
    this.mode = o.mode || 'chain';
    this.eq = o.eq ?? true;
    this.room = o.room ?? 0.42;
    this.drive = o.drive ?? 0.09;
    this.tail = o.tail ?? 0.22;
    this.tap = o.tap ?? -1;
    this.level = o.level ?? 1;
    this.f = {};
    for (const k of Object.keys(c)) this.f[k] = new Tdf2(c[k]);
    this.delay = new TapeDelay(this.busRate, 0.20, 0.32, o.delayMix ?? 0.28, 0.5);
    this.plate = new Schroeder(this.busRate, 'plate', 0.7);
    this.dark = new Schroeder(this.busRate, 'room', 0.8);
    this.tailRoom = new Schroeder(this.busRate, 'room', 0.8);
    this.strokes = [];
    this.sections = new Map();
    // the live level (X6): 0.60 x rms(decks A + B, the input) / rms(the layer), both since the layer's first stroke
    this.follow = !!o.follow;
    this.beatSum = 0; this.beatN = 0;
    // the demo's whole-render level and duck for a planned span (three_deck.render), when the routine was shaped
    this.shapes = [];
    this.layerSum = 0; this.layerN = 0;
    this.levelCoef = Math.exp(-1 / (1 * this.busRate));
    this.started = false;
    // the bus clock: bus sample n is context time n / busRate
    this.bus = -1;
    // the last TAPS bus samples (the upsampler's window), newest at hist[(hi - 1) % TAPS]
    this.hist = new Float64Array(TAPS); this.hi = 0;
    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'stroke') {
        if (m.section) {
          let sec = this.sections.get(m.section.key);
          if (!sec) { sec = new Section(this.busRate, m.section); this.sections.set(m.section.key, sec); }
          sec.strokes.push({ start: Math.max(sec.start, m.start), samples: m.samples });
        } else this.strokes.push({ start: m.start, samples: m.samples });
      }
      else if (m.type === 'level') this.level = m.value;
      else if (m.type === 'shape') this.shapes.push({ start: m.start, level: null, duck: m.duck });
      else if (m.type === 'shapeLevel') { for (const sh of this.shapes) if (sh.start === m.start) sh.level = m.level; }
      else if (m.type === 'clear') { this.strokes = []; this.sections.clear(); }
    };
  }

  /** The overlay: every live section's output summed (a section's tail rides under the next). */
  sectionSample(i) {
    let x = 0, y = 0;
    for (const [key, sec] of this.sections) {
      if (i >= sec.life) { this.sections.delete(key); continue; }
      if (i < sec.start) continue;
      const r = sec.step(i);
      x += r.x; y += r.y;
    }
    if (this.tap === 0) return x;
    if (this.tap >= 1) return y;
    return this.follow ? y * this.followLevel(y, x) : y * this.level;
  }

  /** One bus sample: the strokes summed in arrival order, through the demo's chain. */
  busSample(i) {
    if (this.mode === 'sections') return this.sectionSample(i);
    let x = 0;
    for (let s = 0; s < this.strokes.length; s++) {
      const k = this.strokes[s], j = i - k.start;
      if (j >= 0 && j < k.samples.length) x = x + k.samples[j];
    }
    if (this.strokes.length) this.strokes = this.strokes.filter((k) => i - k.start < k.samples.length - 1);
    const f = this.f, tap = this.tap;
    if (tap === 0) return x;
    // deck_c_eq
    let y = x;
    if (this.eq) {
      y = f.eqHp.f(y);
      y = y + 0.2 * f.eqBp.f(y);
      y = f.eqLp.f(y);
    }
    if (tap === 1) return y;
    // scratch_channel
    y = f.chHp.f(y);
    if (tap === 2) return y;
    y = y + 0.22 * f.chBp.f(y);
    if (tap === 3) return y;
    y = Math.tanh(y * (1.0 + 3.0 * this.drive));
    if (tap === 4) return y;
    y = this.delay.step(y, i);
    if (tap === 5) return y;
    if (this.room) {
      const plate = f.plateHp.f(f.plateLp.f(this.plate.step(y)));
      const dark = f.darkLp.f(this.dark.step(y));
      const wet = 0.6 * plate + 0.4 * dark;
      y = (1 - this.room) * y + this.room * wet;
    }
    if (tap === 6) return y;
    y = f.chLp.f(y);
    if (tap === 7) return y;
    // the tail
    if (this.tail) y = y + this.tail * f.tailLp.f(this.tailRoom.step(y));
    if (tap === 8) return y;
    // a shaped span: the demo's level and duck, exactly; past its end the level holds and the duck lets go
    // (the duck arrives with the plan; until the planned layer's level does, the level follows decks A + B)
    for (let s = this.shapes.length - 1; s >= 0; s--) {
      const sh = this.shapes[s], j = i - sh.start;
      if (j < 0) continue;
      if (sh.level === null && this.follow) y = y * this.followLevel(y, x);
      const g = sh.level !== null ? sh.level : 1;
      return j < sh.duck.length ? y * g * sh.duck[j] : y * g;
    }
    if (this.follow) return y * this.followLevel(y, x);
    return y * this.level;
  }

  /**
   * three_deck's level, live (X6): 0.60 x rms(decks A + B) / rms(layer), each the mean square since the
   * layer's first stroke (the demo's whole-render means, as far as the set has played), the level gliding to
   * the ratio over ~1 s. Decks A + B arrive on the input (their channel outputs summed, a module deck too).
   */
  followLevel(y, x) {
    if (!this.started && x !== 0) this.started = true;
    if (this.started) {
      this.layerSum += y * y; this.layerN++;
      const layer = Math.sqrt(this.layerSum / this.layerN);
      const beat = this.beatN ? Math.sqrt(this.beatSum / this.beatN) : 0;
      if (layer > 1e-6 && beat > 1e-6) {
        const target = 0.60 * beat / layer;
        this.level = this.levelCoef * this.level + (1 - this.levelCoef) * target;
      }
    }
    return this.level;
  }

  /** Decks A + B (the input, mono as the demo reads a beat) into the level's mean square once the layer started. */
  takeBeat(input) {
    if (!this.follow || !this.started || !input || !input.length || !input[0]) return;
    const nch = input.length, n = input[0].length;
    for (let i = 0; i < n; i++) {
      let m = 0;
      for (let c = 0; c < nch; c++) m += input[c][i];
      m /= nch;
      this.beatSum += m * m;
    }
    this.beatN += n;
  }

  process(inputs, outputs) {
    this.takeBeat(inputs && inputs[0]);
    const out = outputs[0];
    const ch0 = out[0];
    if (!ch0) return true;
    if (sampleRate === this.busRate) {
      // the null test's rate: one bus sample per output sample
      for (let n = 0; n < ch0.length; n++) ch0[n] = this.busSample(currentFrame + n);
    } else {
      const ratio = this.busRate / sampleRate, half = TAPS / 2;
      for (let n = 0; n < ch0.length; n++) {
        const t = (currentFrame + n) * ratio; // bus position of this output sample
        const want = Math.floor(t);
        // the window runs to want + half: the bus is computed that far ahead (its strokes are already posted)
        if (this.bus < 0) this.bus = want + half - TAPS;
        while (this.bus < want + half) { this.bus++; this.hist[this.hi % TAPS] = this.busSample(this.bus); this.hi++; }
        const fp = (t - want) * PHASES, p = Math.floor(fp), pf = fp - p;
        let acc = 0;
        for (let j = 0; j < TAPS; j++) {
          const v = this.hist[(this.hi + j) % TAPS]; // oldest first: bus sample want - half + 1 + j
          const k0 = KERNEL[p * TAPS + j], k1 = KERNEL[(p + 1) * TAPS + j];
          acc += v * (k0 + (k1 - k0) * pf);
        }
        ch0[n] = acc;
      }
    }
    for (let c = 1; c < out.length; c++) out[c].set(ch0);
    return true;
  }
}

registerProcessor('scratch-deck-c', ScratchDeckCProcessor);
