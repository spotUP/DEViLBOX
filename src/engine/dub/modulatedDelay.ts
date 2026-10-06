/**
 * A DelayNode whose delay time a sine LFO swings around a centre — the moving
 * tape head. The comb sweep (PerChannelDubFx) adds a feedback loop to it; the
 * channel Wobble (ChannelShapeStage) listens to it alone, which is pure
 * pitch wow.
 *
 * The oscillator never goes silent, so callers build one only while it is in
 * use and `release()` it afterwards (see PerChannelDubFx's sweep teardown).
 */

export interface ModulatedDelay {
  delay: DelayNode;
  lfo: OscillatorNode;
  lfoGain: GainNode;
  /** Stop the LFO and disconnect the three nodes. */
  release(): void;
}

export interface ModulatedDelayOptions {
  /** DelayNode capacity, seconds. */
  maxDelaySec: number;
  /** Delay the LFO swings around, seconds. */
  centreSec: number;
  rateHz: number;
  /** Peak swing either side of the centre, seconds. */
  depthSec: number;
}

export function buildModulatedDelay(ctx: BaseAudioContext, o: ModulatedDelayOptions): ModulatedDelay {
  const delay = ctx.createDelay(o.maxDelaySec);
  delay.delayTime.value = o.centreSec;
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = o.rateHz;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = o.depthSec;
  lfo.connect(lfoGain);
  lfoGain.connect(delay.delayTime);
  lfo.start();
  return {
    delay,
    lfo,
    lfoGain,
    release() {
      try { lfo.stop(); } catch { /* ok */ }
      for (const n of [lfo, lfoGain, delay]) {
        try { n.disconnect(); } catch { /* ok */ }
      }
    },
  };
}
