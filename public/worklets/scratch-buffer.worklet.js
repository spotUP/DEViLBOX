/**
 * scratch-buffer.worklet.js — Unified vinyl scratch engine
 *
 * Architecture inspired by terminatorX (Alexander König):
 *   - Single ring buffer continuously captures the master audio
 *   - When scratch is active, a UNIFIED playback processor reads the
 *     ring buffer at a signed rate (positive=forward, negative=backward)
 *   - Fractional-position tracking with CUBIC HERMITE interpolation
 *   - Per-sample rate smoothing with configurable inertia
 *   - Zero-crossing fade (1ms) at direction changes to prevent clicks
 *   - ALL scratch audio comes from the ring buffer (no live/buffer switching)
 *
 * Two processors share module-level ring buffers (one per deck):
 *   ScratchCaptureProcessor: continuously writes audio into ring buffer
 *   ScratchPlaybackProcessor: reads ring buffer at variable rate with interpolation
 *
 * Ring buffer: 120 s × sampleRate × 2 ch interleaved (L/R)
 */

const BUFFER_SECONDS = 120;

/**
 * Rate smoothing time constant in seconds.
 * 5ms balances between responsive feel and click-free transitions.
 * The worklet interpolates per-sample, so even with 60Hz rate updates
 * from the main thread, the audio is smooth.
 */
const RATE_SMOOTH_SEC = 0.005;

/**
 * Zero-crossing fade duration in samples (~1ms at 48kHz).
 * When rate crosses zero (direction change), we apply a short
 * linear crossfade to prevent discontinuities.
 */
const ZERO_FADE_SAMPLES = 48;

// Module-level shared state (one AudioWorkletGlobalScope per context), one
// slot per bufferId: each DeckScratchBuffer owns its id (DJ decks A/B/C = 0/1/2,
// tracker scratch = 3). Two capture nodes on one id interleave their blocks
// into one tape, so ids must never be shared.
const rings         = [];  // Float32Array per bufferId, lazy-initialized
const writePoss     = [];  // Current write position per bufferId (mod bufLen)
const totalWritten  = [];  // Total frames ever written per bufferId (never wraps)
const frozen        = [];  // Per-buffer freeze state (scratch in progress)
const sourceStopped = [];  // Per-buffer: the source is not playing, so its silence is not recorded

function getOrCreateRing(bufferId, sr) {
  if (!rings[bufferId]) {
    const frames = Math.round(sr * BUFFER_SECONDS);
    rings[bufferId] = new Float32Array(frames * 2); // interleaved L/R
    writePoss[bufferId] = 0;
    totalWritten[bufferId] = 0;
    frozen[bufferId] = false;
    sourceStopped[bufferId] = false;
  }
  return rings[bufferId];
}

/**
 * Cubic Hermite interpolation (4-point, 3rd order).
 * Gives smooth, alias-free interpolation for variable-rate playback.
 *
 * @param {number} y0 sample at pos-1
 * @param {number} y1 sample at pos (floor)
 * @param {number} y2 sample at pos+1
 * @param {number} y3 sample at pos+2
 * @param {number} t  fractional position [0..1)
 * @returns {number} interpolated value
 */
function hermite(y0, y1, y2, y3, t) {
  const c0 = y1;
  const c1 = 0.5 * (y2 - y0);
  const c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3;
  const c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
  return ((c3 * t + c2) * t + c1) * t + c0;
}

// ---------------------------------------------------------------------------
// ScratchCaptureProcessor — taps audio and writes to ring buffer
// ---------------------------------------------------------------------------
class ScratchCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.bufferId     = (options.processorOptions && options.processorOptions.bufferId) ?? 0;
    this.bufferFrames = Math.round(sampleRate * BUFFER_SECONDS);
    this.ring         = getOrCreateRing(this.bufferId, sampleRate);

    // Report write position to main thread every ~50ms
    this._reportEvery       = Math.round(sampleRate * 0.05);
    this._framesSinceReport = 0;
    this._debugPeak = 0;

    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'freeze') {
        frozen[this.bufferId] = true;
      } else if (d.type === 'unfreeze') {
        frozen[this.bufferId] = false;
      } else if (d.type === 'sourceRunning') {
        // A stopped deck's capture would otherwise fill the tape with silence
        // and carry the write position (the needle) away from its last audio.
        sourceStopped[this.bufferId] = !d.running;
      } else if (d.type === 'reset') {
        // Clear the ring buffer and reset counters — call when a new song starts
        // so scratch never plays back audio from a previous song.
        const ring = rings[this.bufferId];
        if (ring) ring.fill(0);
        writePoss[this.bufferId]    = 0;
        totalWritten[this.bufferId] = 0;
        frozen[this.bufferId]       = false;
      }
    };
  }

  process(inputs, outputs) {
    const inp    = inputs[0];
    const out    = outputs[0];
    const frames = (out[0] && out[0].length) ? out[0].length : 128;
    const ring   = this.ring;
    const bf     = this.bufferFrames;
    const isFrozen = frozen[this.bufferId] || sourceStopped[this.bufferId];
    let   wp     = writePoss[this.bufferId];

    let blockPeak = 0;
    for (let i = 0; i < frames; i++) {
      const L = (inp[0] && inp[0][i] !== undefined) ? inp[0][i] : 0;
      const R = (inp[1] && inp[1][i] !== undefined) ? inp[1][i] : 0;

      const absL = Math.abs(L);
      const absR = Math.abs(R);
      if (absL > blockPeak) blockPeak = absL;
      if (absR > blockPeak) blockPeak = absR;

      if (!isFrozen) {
        ring[wp * 2]     = L;
        ring[wp * 2 + 1] = R;
        wp = (wp + 1) % bf;
      }

      // Pass through to output (capture node output usually not connected)
      if (out[0]) out[0][i] = L;
      if (out[1]) out[1][i] = R;
    }

    if (blockPeak > this._debugPeak) this._debugPeak = blockPeak;

    if (!isFrozen) {
      writePoss[this.bufferId] = wp;
      totalWritten[this.bufferId] += frames;
    }

    this._framesSinceReport += frames;
    if (this._framesSinceReport >= this._reportEvery) {
      this._framesSinceReport = 0;
      this.port.postMessage({
        type: 'writePos',
        pos: writePoss[this.bufferId],
        frozen: isFrozen,
        inputPeak: this._debugPeak,
      });
      this._debugPeak = 0;
    }

    return true;
  }
}

// ---------------------------------------------------------------------------
// ScratchPlaybackProcessor — unified forward+backward scrub engine
//
// Inspired by terminatorX's render_scratch():
//   - Fractional position (double) into the ring buffer
//   - Per-sample: pos += smoothedRate
//   - Cubic Hermite interpolation (4-point)
//   - Zero-crossing fade at direction changes
//   - Rate smoothing via 1-pole exponential filter
//
// Rate is signed: +1.0 = normal forward, -1.0 = normal backward, 0 = stopped
// Rate controlled via postMessage from main thread.
// ---------------------------------------------------------------------------
class ScratchPlaybackProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.bufferId     = (options.processorOptions && options.processorOptions.bufferId) ?? 0;
    // Record mode (scratch record voice, owner scratch plan section 16): the
    // ring holds a STATIC record written by `load` (sized to the record, not
    // 120 s), read from `startAt` / `seek`, clamped to `bounds` (the record's
    // safe range: a hand on a record never runs off the sound), articulated by
    // a frame-accurate `rateCurve` and `faderWindows`, and reported with
    // `position` every 128 frames. The deck path below is untouched.
    this.isRecord     = !!(options.processorOptions && options.processorOptions.record);
    if (this.isRecord) {
      this.ring         = null;
      this.bufferFrames = 0;
      this.boundLo      = 0;
      this.boundHi      = 0;
      this.cuePos       = 0;     // frames: where `seek`/`startAt` put the head; a returning gesture re-cues here
      this.curve        = null;  // {points:[{frame,rate}], idx, frame, interpolate, loop, cycleFrames, returnToAnchor}
      this.fader        = null;  // {windows:[[open,close]], frame, cycleFrames, loop, rampStep}
      this.faderGain    = 1;     // current articulated gain (ramped)
      this.pendingSeek  = -1;    // frames: a seek waits for a 1 ms fade-out before the jump
      this.seekFade     = 0;
      this.clampCount   = 0;
      this._posSince    = 0;
      this.queue        = [];    // [{atFrame, d}] record-mode messages scheduled ahead (sample-accurate)
      this.seekDelay    = 0;
      this.stopAfter    = 0;
    } else {
      this.bufferFrames = Math.round(sampleRate * BUFFER_SECONDS);
      this.ring         = getOrCreateRing(this.bufferId, sampleRate);
    }

    this.active      = false;
    this.readPosF    = 0;     // fractional read position (sub-sample precision)
    this.targetRate  = 0;     // target playback rate from main thread
    this.smoothRate  = 0;     // smoothed rate (used per-sample for position advance)
    this.startPos    = 0;     // position at scratch start (for framesBack calc)
    this.frozenWP    = 0;     // write position frozen at scratch start (for loop clamping)
    this.validFrames = 0;     // valid captured frames in buffer at scratch start

    // Rate smoothing coefficient
    this.smoothAlpha = 1 - Math.exp(-1 / (RATE_SMOOTH_SEC * sampleRate));

    // Zero-crossing fade state
    this.fadeCounter = 0;    // countdown for fade (0 = no fade active)
    this.prevSign   = 0;     // sign of rate before zero crossing (-1, 0, +1)

    // Debug reporting
    this._reportEvery       = Math.round(sampleRate * 0.5); // every 500ms
    this._framesSinceReport = 0;

    this.port.onmessage = (e) => {
      const d = e.data;
      // Record mode: a message with `at` (context seconds) is applied at that
      // frame by processRecord, sample-accurately; without `at`, now.
      if (this.isRecord && typeof d.at === 'number' && d.at * sampleRate > currentFrame) {
        this.queue.push({ atFrame: Math.round(d.at * sampleRate), d });
        this.queue.sort((a, b) => a.atFrame - b.atFrame);
        return;
      }
      this._apply(d, 0);
    };
  }

  /** Apply a message; `offset` = frames into the current quantum it lands on (record mode). */
  _apply(d, offset) {
    {
      switch (d.type) {
        case 'start':
          this.ring         = getOrCreateRing(this.bufferId, sampleRate);
          this.bufferFrames = Math.round(sampleRate * BUFFER_SECONDS);
          this.startPos     = d.startPos;
          this.readPosF     = d.startPos;
          this.targetRate   = d.rate ?? 0;
          this.smoothRate   = d.rate ?? 0; // snap on start
          this.prevSign     = Math.sign(this.smoothRate);
          this.fadeCounter  = 0;
          this.frozenWP     = d.startPos;
          this.validFrames  = Math.min(totalWritten[this.bufferId], this.bufferFrames);
          this.active       = true;
          break;

        case 'setRate':
          this.targetRate = d.rate;
          break;

        case 'startFromWrite': {
          // anchor 'write': start AT the write position — the needle. A DJ
          // deck scratches backward from here while its forward motion comes
          // from the deck's own source (DeckEngine._switchToBackward).
          //
          // anchor 'middle' (default): position the read head at the MIDPOINT of all captured valid content.
          // This gives equal forward and backward scratch range:
          //   - Rate +1.0: reads from midpoint → WP (forward through recent audio)
          //   - Rate -1.0: reads from midpoint → history (backward through older audio)
          //   - Rate  0.0: stays at midpoint (correct hold/stopped scratch behavior)
          //
          // With a 120s ring buffer, once the song has played >2 minutes you get
          // a full 60s of forward AND backward range before hitting the buffer edge.
          // At 4× rate you get 15s of scratch in either direction — more than enough
          // for any realistic scratch session.
          this.ring         = getOrCreateRing(this.bufferId, sampleRate);
          this.bufferFrames = Math.round(sampleRate * BUFFER_SECONDS);
          const wp          = writePoss[this.bufferId];
          const bufLen      = this.bufferFrames;
          const captured    = Math.min(totalWritten[this.bufferId], bufLen);
          // Half of valid content — symmetric range in both directions.
          const halfValid   = Math.floor(captured / 2);
          this.startPos     = wp;
          this.readPosF     = d.anchor === 'write' ? wp : (wp - halfValid + bufLen) % bufLen;
          this.targetRate   = d.rate ?? 0;
          this.smoothRate   = d.rate ?? 0;
          this.prevSign     = Math.sign(this.smoothRate);
          this.fadeCounter  = 0;
          this.frozenWP     = wp;
          this.validFrames  = captured;
          this.active       = true;
          break;
        }

        case 'stop': {
          if (this.isRecord && offset > 0) { this.stopAfter = offset; break; }
          this.active = false;
          this.targetRate = 0;
          this.smoothRate = 0;
          if (this.isRecord) { this.curve = null; this.fader = null; this.pendingSeek = -1; this.seekFade = 0; }
          const bf = Math.max(1, this.bufferFrames);
          const framesBack = Math.round(
            ((this.startPos - this.readPosF) + bf) % bf
          );
          this.port.postMessage({ type: 'stopped', framesBack });
          break;
        }

        case 'snapRate':
          // Snap rate immediately (no smoothing) — used for initial engage
          this.targetRate = d.rate;
          this.smoothRate = d.rate;
          this.prevSign   = Math.sign(d.rate);
          break;

        case 'setRateAt':
          this.targetRate = d.rate;
          break;

        // ── Record mode (section 16) ──
        case 'load': {
          const left  = d.left;
          const right = d.right || d.left;
          const frames = left.length;
          const ring = new Float32Array(frames * 2);
          for (let i = 0; i < frames; i++) { ring[i * 2] = left[i]; ring[i * 2 + 1] = right[i]; }
          rings[this.bufferId]        = ring;
          writePoss[this.bufferId]    = 0;
          totalWritten[this.bufferId] = frames;
          frozen[this.bufferId]       = true;   // never captured over
          this.ring         = ring;
          this.bufferFrames = frames;
          this.boundLo      = 0;
          this.boundHi      = Math.max(0, frames - 1);
          this.active       = false;
          this.readPosF     = 0;
          this.cuePos       = 0;
          this.curve        = null;
          this.fader        = null;
          this.faderGain    = 1;
          this.pendingSeek  = -1;
          this.seekFade     = 0;
          this.clampCount   = 0;
          this.port.postMessage({ type: 'loaded', frames });
          break;
        }

        case 'bounds': {
          const hi = Math.max(0, this.bufferFrames - 1);
          this.boundLo = Math.max(0, Math.min(hi, Math.round(d.startFrames)));
          this.boundHi = Math.max(this.boundLo, Math.min(hi, Math.round(d.endFrames)));
          break;
        }

        case 'startAt': {
          // The reader advances by the rate BEFORE it interpolates (P0.6):
          // start at P - rate so the first sample out is ring[P] in either
          // direction.
          const p = this._clampPos(d.positionFrames);
          this.cuePos      = p;
          this.startPos    = p;
          this.readPosF    = p - (d.rate ?? 0);
          this.targetRate  = d.rate ?? 0;
          this.smoothRate  = d.rate ?? 0;
          this.prevSign    = Math.sign(this.smoothRate);
          this.fadeCounter = ZERO_FADE_SAMPLES;   // fade in: a cue is a needle drop
          this.pendingSeek = -1;
          this.seekFade    = 0;
          this.seekDelay   = offset;
          this.curve       = null;
          this.validFrames = this.bufferFrames;
          this.active      = true;
          break;
        }

        case 'seek': {
          const p = this._clampPos(d.positionFrames);
          this.cuePos = p;
          if (this.active) {
            // fade out over 1 ms, jump, fade in (a click-free re-cue, section 18)
            this.pendingSeek = p;
            this.seekFade    = ZERO_FADE_SAMPLES;
            this.seekDelay   = offset;
          } else {
            this.readPosF = p - this.smoothRate;
            this.startPos = p;
          }
          break;
        }

        case 'rateCurve': {
          // Frame-accurate rate automation: points relative to this message's
          // arrival; `loop` repeats every `cycleFrames`; `returnToAnchor`
          // re-cues to `cuePos` at every cycle end (section 11/18).
          const points = (d.points || []).map((p) => ({ frame: Math.max(0, Math.round(p.frame)), rate: +p.rate || 0 }));
          this.curve = {
            points,
            idx: 0,
            frame: -offset,
            interpolate: !!d.interpolate,
            loop: !!d.loop,
            cycleFrames: Math.max(1, Math.round(d.cycleFrames || (points.length ? points[points.length - 1].frame : 1))),
            returnToAnchor: !!d.returnToAnchor,
          };
          if (!this.active) {
            this.startPos    = this.cuePos;
            this.readPosF    = this.cuePos - this.smoothRate;
            this.prevSign    = 0;
            this.fadeCounter = ZERO_FADE_SAMPLES + offset;
            this.active      = true;
          }
          break;
        }

        case 'faderWindows': {
          // Open windows in frames relative to arrival; outside them the voice
          // is cut. Linear ramp of `rampFrames` on every edge (3 ms default).
          const windows = (d.windows || []).map((w) => [Math.max(0, Math.round(w[0])), Math.max(0, Math.round(w[1]))]).sort((a, b) => a[0] - b[0]);
          const rampFrames = Math.max(1, Math.round(d.rampFrames || sampleRate * 0.003));
          this.fader = {
            windows,
            frame: -offset,
            cycleFrames: Math.max(1, Math.round(d.cycleFrames || 1)),
            loop: !!d.loop,
            rampStep: 1 / rampFrames,
          };
          break;
        }

        case 'faderGain':
          // One static gain (0/1) with the same ramp; cancels window automation.
          this.fader = {
            windows: d.gain > 0.5 ? [[0, 0x7fffffff]] : [],
            frame: -offset, cycleFrames: 0x7fffffff, loop: false,
            rampStep: 1 / Math.max(1, Math.round(d.rampFrames || sampleRate * 0.003)),
          };
          break;
      }
    }
  }

  _clampPos(p) {
    const v = Math.round(+p || 0);
    return Math.max(this.boundLo, Math.min(this.boundHi, v));
  }

  /** Static-ring sample read: no wrap, silence outside the record. */
  getRecordSample(idx, ch) {
    if (idx < 0 || idx >= this.bufferFrames) return 0;
    return this.ring[idx * 2 + ch];
  }

  /** Record mode render: rate curve + fader windows + bounds clamp + position reports. */
  processRecord(outputs) {
    const out    = outputs[0];
    const frames = (out[0] && out[0].length) ? out[0].length : 128;
    // scheduled messages landing in this quantum, with their sample offset
    while (this.queue.length && this.queue[0].atFrame < currentFrame + frames) {
      const q = this.queue.shift();
      this._apply(q.d, Math.max(0, q.atFrame - currentFrame));
    }
    if (!this.active || !this.ring) {
      if (out[0]) out[0].fill(0);
      if (out[1]) out[1].fill(0);
      return true;
    }
    const alpha  = this.smoothAlpha;
    let   rate   = this.smoothRate;
    let   target = this.targetRate;
    let   fadeCounter = this.fadeCounter;
    let   prevSign    = this.prevSign;
    let   faderGain   = this.faderGain;
    const curve = this.curve;
    const fader = this.fader;

    for (let i = 0; i < frames; i++) {
      if (this.stopAfter > 0 && --this.stopAfter === 0) {
        this._apply({ type: 'stop' }, 0);
        for (let k = i; k < frames; k++) { if (out[0]) out[0][k] = 0; if (out[1]) out[1][k] = 0; }
        return true;
      }
      // ── rate curve ──
      if (curve && curve.frame >= 0) {
        const pts = curve.points;
        while (curve.idx < pts.length && pts[curve.idx].frame <= curve.frame) curve.idx++;
        if (curve.interpolate && curve.idx > 0 && curve.idx < pts.length) {
          const a = pts[curve.idx - 1], b = pts[curve.idx];
          const span = b.frame - a.frame;
          target = span > 0 ? a.rate + (b.rate - a.rate) * ((curve.frame - a.frame) / span) : b.rate;
        } else if (curve.idx > 0) {
          target = pts[curve.idx - 1].rate;
        } else if (pts.length) {
          target = pts[0].rate;
        }
      }
      if (curve) {
        curve.frame++;
        if (curve.frame >= curve.cycleFrames) {
          if (curve.loop) {
            curve.frame -= curve.cycleFrames;
            curve.idx = 0;
            if (curve.returnToAnchor) { this.pendingSeek = this.cuePos; this.seekFade = ZERO_FADE_SAMPLES; }
          } else {
            this.curve = null;
            const pts = curve.points;
            target = pts.length ? pts[pts.length - 1].rate : 0;
          }
        }
      }
      // ── fader windows ──
      let gate = faderGain >= 0.5 ? 1 : 0;
      if (fader && fader.frame >= 0) {
        gate = 0;
        const f = fader.frame;
        const ws = fader.windows;
        for (let w = 0; w < ws.length; w++) { if (f >= ws[w][0] && f < ws[w][1]) { gate = 1; break; } }
      }
      if (fader) {
        fader.frame++;
        if (fader.frame >= fader.cycleFrames) {
          if (fader.loop) fader.frame -= fader.cycleFrames;
          else fader.frame = fader.cycleFrames; // hold the final state
        }
      }
      if (faderGain < gate) faderGain = Math.min(gate, faderGain + (fader ? fader.rampStep : 1));
      else if (faderGain > gate) faderGain = Math.max(gate, faderGain - (fader ? fader.rampStep : 1));

      // ── rate smoothing + zero-crossing fade (shared with the deck path) ──
      rate += (target - rate) * alpha;
      const curSign = rate > 0.001 ? 1 : (rate < -0.001 ? -1 : 0);
      if (prevSign !== 0 && curSign !== 0 && curSign !== prevSign) fadeCounter = ZERO_FADE_SAMPLES;
      if (curSign !== 0) prevSign = curSign;
      let fadeGain = 1.0;
      if (fadeCounter > 0) { fadeGain = Math.max(0, 1.0 - (fadeCounter / ZERO_FADE_SAMPLES)); fadeCounter--; }

      // ── pending seek: (delay), fade out, jump, fade in ──
      if (this.pendingSeek >= 0 && this.seekDelay > 0) {
        this.seekDelay--;
      } else if (this.pendingSeek >= 0) {
        if (this.seekFade > 0) {
          fadeGain = Math.min(fadeGain, this.seekFade / ZERO_FADE_SAMPLES);
          this.seekFade--;
        }
        if (this.seekFade <= 0) {
          this.readPosF    = this.pendingSeek - rate;
          this.startPos    = this.pendingSeek;
          this.pendingSeek = -1;
          fadeCounter      = ZERO_FADE_SAMPLES;
          fadeGain         = 0;
        }
      }

      // ── advance + clamp to bounds (never off the sound) ──
      this.readPosF += rate;
      if (this.readPosF > this.boundHi) { this.readPosF = this.boundHi; this.clampCount++; }
      else if (this.readPosF < this.boundLo) { this.readPosF = this.boundLo; this.clampCount++; }

      const posI = Math.floor(this.readPosF);
      const frac = this.readPosF - posI;
      const L0 = this.getRecordSample(posI - 1, 0), L1 = this.getRecordSample(posI, 0);
      const L2 = this.getRecordSample(posI + 1, 0), L3 = this.getRecordSample(posI + 2, 0);
      const R0 = this.getRecordSample(posI - 1, 1), R1 = this.getRecordSample(posI, 1);
      const R2 = this.getRecordSample(posI + 1, 1), R3 = this.getRecordSample(posI + 2, 1);
      const g = fadeGain * faderGain;
      if (out[0]) out[0][i] = hermite(L0, L1, L2, L3, frac) * g;
      if (out[1]) out[1][i] = hermite(R0, R1, R2, R3, frac) * g;
    }

    this.smoothRate  = rate;
    this.targetRate  = target;
    this.fadeCounter = fadeCounter;
    this.prevSign    = prevSign;
    this.faderGain   = faderGain;

    this._posSince += frames;
    if (this._posSince >= 128) {
      this._posSince = 0;
      this.port.postMessage({
        type: 'position',
        frames: this.readPosF,
        rate: this.smoothRate,
        fader: this.faderGain,
        clamped: this.clampCount,
      });
    }
    return true;
  }

  /**
   * Read a sample from the ring buffer with wrapping.
   * @param {number} idx Integer frame index (may be negative or >= bufferFrames)
   * @param {number} ch  Channel offset (0=L, 1=R)
   * @returns {number} sample value
   */
  getSample(idx, ch) {
    const bf = this.bufferFrames;
    // Modular wrap (handles negative indices)
    let i = idx % bf;
    if (i < 0) i += bf;
    return this.ring[i * 2 + ch];
  }

  process(_inputs, outputs) {
    if (this.isRecord) return this.processRecord(outputs);

    const out    = outputs[0];
    const frames = (out[0] && out[0].length) ? out[0].length : 128;

    if (!this.active) {
      if (out[0]) out[0].fill(0);
      if (out[1]) out[1].fill(0);
      return true;
    }

    const target = this.targetRate;
    const alpha  = this.smoothAlpha;
    let   rate   = this.smoothRate;
    let   fadeCounter = this.fadeCounter;
    let   prevSign    = this.prevSign;

    for (let i = 0; i < frames; i++) {
      // ── Per-sample rate smoothing ──
      rate += (target - rate) * alpha;

      // ── Zero-crossing detection & fade ──
      const curSign = rate > 0.001 ? 1 : (rate < -0.001 ? -1 : 0);
      if (prevSign !== 0 && curSign !== 0 && curSign !== prevSign) {
        // Direction just reversed — start a fade
        fadeCounter = ZERO_FADE_SAMPLES;
      }
      if (curSign !== 0) prevSign = curSign;

      // Compute fade gain (1.0 normally, ramps 0→1 during fade)
      let fadeGain = 1.0;
      if (fadeCounter > 0) {
        fadeGain = 1.0 - (fadeCounter / ZERO_FADE_SAMPLES);
        fadeCounter--;
      }

      // ── Advance fractional position ──
      this.readPosF += rate;

      // Wrap (ring buffer is circular)
      const bf = this.bufferFrames;
      if (this.readPosF >= bf) this.readPosF -= bf;
      if (this.readPosF < 0)   this.readPosF += bf;

      // ── Cubic Hermite interpolation (4-point) ──
      const posI = Math.floor(this.readPosF);
      const frac = this.readPosF - posI;

      // Get 4 surrounding samples for each channel
      const L0 = this.getSample(posI - 1, 0);
      const L1 = this.getSample(posI,     0);
      const L2 = this.getSample(posI + 1, 0);
      const L3 = this.getSample(posI + 2, 0);

      const R0 = this.getSample(posI - 1, 1);
      const R1 = this.getSample(posI,     1);
      const R2 = this.getSample(posI + 1, 1);
      const R3 = this.getSample(posI + 2, 1);

      let outL = hermite(L0, L1, L2, L3, frac) * fadeGain;
      let outR = hermite(R0, R1, R2, R3, frac) * fadeGain;

      if (out[0]) out[0][i] = outL;
      if (out[1]) out[1][i] = outR;
    }

    this.smoothRate  = rate;
    this.fadeCounter = fadeCounter;
    this.prevSign    = prevSign;

    this._framesSinceReport += frames;
    if (this._framesSinceReport >= this._reportEvery) {
      this._framesSinceReport = 0;
      this.port.postMessage({
        type: 'debug-playback',
        readPos: this.readPosF,
        targetRate: this.targetRate,
        smoothRate: this.smoothRate,
        bufferFrames: this.bufferFrames,
      });
    }

    return true;
  }
}

registerProcessor('scratch-capture', ScratchCaptureProcessor);
registerProcessor('scratch-reverse', ScratchPlaybackProcessor);
