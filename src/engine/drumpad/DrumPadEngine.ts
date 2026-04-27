/**
 * DrumPadEngine - Audio playback engine for drum pads
 * Handles sample triggering with velocity, ADSR, filtering, and routing.
 * Supports per-pad effects chains (SpringReverb, SpaceEcho, TapeSaturation, etc.)
 * using Tone.js effect nodes connected inline with Web Audio routing.
 */

import * as Tone from 'tone';
import type { DrumPad } from '../../types/drumpad';
import type { DubBusSettings } from '../../types/dub';
import { createEffectChain } from '../factories/EffectFactory';
import type { DJMixerEngine } from '../dj/DJMixerEngine';
import type { DeckId } from '../dj/DeckEngine';
import { DubBus } from '../dub/DubBus';
import { setDubBusForRouter } from '../dub/DubRouter';
import { getToneEngine } from '../ToneEngine';
import { getNativeAudioNode } from '../../utils/audio-context';


interface VoiceState {
  source: AudioBufferSourceNode | null;
  gainNode: GainNode;
  filterNode: BiquadFilterNode | null;
  panNode: StereoPannerNode;
  // Per-voice dub send (null when pad.dubSend === 0). Held here so
  // cleanupVoice can disconnect it — otherwise we leak orphan GainNodes
  // connected to dubBusInput on every trigger and rely on GC to reclaim,
  // which under long sessions builds up audible CPU overhead.
  dubSendNode: GainNode | null;
  startTime: number;
  noteOffTime: number | null;
  velocity: number;
}

interface PadEffectsChain {
  inputGain: GainNode;
  effects: { disconnect(): void; dispose(): void }[];
  outputGain: GainNode;
  configHash: string; // detect when effects config changes
}

export class DrumPadEngine {
  private static readonly MAX_VOICES = 32; // Polyphony limit

  private context: AudioContext;
  private masterGain: GainNode;
  private voices: Map<number, VoiceState> = new Map();
  private outputs: Map<string, GainNode> = new Map();
  private muteGroups: Map<number, number> = new Map(); // padId -> muteGroup
  private reversedBufferCache: WeakMap<AudioBuffer, AudioBuffer> = new WeakMap();
  private pendingCleanupTimers: Map<number, ReturnType<typeof setTimeout>> = new Map();
  private padEffects: Map<number, PadEffectsChain> = new Map();
  private _disposed = false;

  // Dub bus — see src/engine/dub/DubBus.ts
  private dubBus!: DubBus;

  // Synth-pad dub sends. Keyed by padId; each entry taps the synth's effect
  // chain output (from ToneEngine) and routes it through a per-pad Gain into
  // the shared DubBus input. Lives as long as the pad's instrument lives.
  private synthPadDubSends: Map<number, {
    tap: GainNode;
    source: Tone.ToneAudioNode;
  }> = new Map();

  constructor(context: AudioContext, outputDestination?: AudioNode) {
    this.context = context;

    // Create master output — route to custom destination or default to context.destination.
    // Default gain is -6 dB (0.5): the DJ deck path auto-normalizes to
    // TARGET_RMS_DB = -14, while drumpad pads ship at native peak levels
    // (most oneshot presets at -4 dBFS). Without this cut, pad hits sat
    // ~10 dB above the deck bed and blew the PA. User can push it back up
    // at will — there's no separate master volume UI for the drumpad bus
    // yet, so a conservative default is the safer place to land.
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = 0.25;
    // Don't connect masterGain → destination directly — DubBus will connect
    // its vinylOutputNode (masterGain → vinylEffect → vinylOutputNode → dest)
    // so JA Press vinyl processes the complete mix, not just the dry signal.

    // Create separate output buses
    this.outputs.set('stereo', this.masterGain);
    ['out1', 'out2', 'out3', 'out4'].forEach(bus => {
      const gain = this.context.createGain();
      gain.connect(this.masterGain);
      this.outputs.set(bus, gain);
    });

    // Dub bus lives in its own class now — see src/engine/dub/DubBus.ts.
    this.dubBus = new DubBus(this.context, this.masterGain);
    // Connect post-master vinyl output to the actual audio destination.
    this.dubBus.getVinylOutputNode().connect(outputDestination ?? this.context.destination);

    // Register with the DubRouter so ANY view (tracker, DJ, drumpad) can
    // fire dub moves the moment the engine exists, without waiting for a
    // specific UI to mount. Previously only DubDeckStrip (a tracker-view
    // child) registered the bus — pressing the DJ view's DUB tab or a
    // drumpad dub-action pad from any other view logged "no bus
    // registered — … ignored (tracker view not mounted?)" and silently
    // dropped the move. 2026-04-20 fix.
    setDubBusForRouter(this.dubBus);
  }

  /**
   * Attach a DJ mixer so dub-action pads can pull deck audio into the bus.
   * Connects each deck's pre-crossfader tap into the dub bus's deck-tap gain
   * nodes, and also reroutes the engine's master output through mixer.samplerInput
   * so MIDI-triggered pad audio lands in the DJ master chain.
   *
   * Safe to call after engine construction; can be called again to switch
   * mixers (previous connections are cleaned up first).
   */
  attachDJMixer(mixer: DJMixerEngine): void {
    // Delegate deck-tap wiring to DubBus.
    this.dubBus.attachDJMixer(mixer);
    // ALSO reroute the engine's master output through mixer.samplerInput so
    // that MIDI-triggered pad audio lands in the DJ master chain (master FX
    // + limiter). Otherwise the singleton engine used by useMIDIPadRouting
    // writes directly to ctx.destination, bypassing the DJ mix — that made
    // dub throws via MIDI sound totally different from touch-triggered ones.
    try {
      this.rerouteOutput(mixer.samplerInput);
    } catch (err) {
      console.warn('[DrumPadEngine] attachDJMixer: reroute to samplerInput failed:', err);
    }
    console.log('[DrumPadEngine] attachDJMixer: output→mixer.samplerInput');
  }

  /** Tear down the deck-tap connections to the attached mixer. */
  detachDJMixer(): void {
    this.dubBus.detachDJMixer();
    // Restore default output routing so pads still make sound when the DJ
    // view isn't active. Prefer ToneEngine's `masterEffectsInput` so drum
    // pads + dub bus keep flowing through the export tap (matches the
    // default path in useMIDIPadRouting/getOrCreateEngine). Falls back to
    // ctx.destination if Tone isn't ready.
    try {
      const tone = getToneEngine();
      const native = getNativeAudioNode(tone.masterEffectsInput);
      this.rerouteOutput(native ?? this.context.destination);
    } catch {
      try { this.rerouteOutput(this.context.destination); } catch { /* ok */ }
    }
  }

  // ─── Dub Action API — thin delegators to DubBus ───────────────────────────

  /**
   * Open a deck tap to `amount` immediately (short ramp for click-safety),
   * hold until the returned releaser is called, then fade to 0 over
   * `releaseSec`. If the bus is disabled, returns a no-op releaser.
   */
  openDeckTap(deck: DeckId | 'ALL', amount = 1.0, attackSec = 0.005, releaseSec = 0.08): () => void {
    return this.dubBus.openDeckTap(deck, amount, attackSec, releaseSec);
  }

  throwDeck(deck: DeckId | 'ALL', amount = 1.0, holdSec = 0.15, releaseSec = 0.25): void {
    this.dubBus.throwDeck(deck, amount, holdSec, releaseSec);
  }

  muteAndDub(deck: DeckId, amount = 1.0, releaseSec = 0.35): () => void {
    return this.dubBus.muteAndDub(deck, amount, releaseSec);
  }

  setSirenFeedback(amount: number, rampSec = 0.08): () => void {
    return this.dubBus.setSirenFeedback(amount, rampSec);
  }

  startSiren(): () => void {
    return this.dubBus.startSiren();
  }

  dubPanic(): void { this.dubBus.dubPanic(); }

  filterDrop(targetHz = 300, downSec = 0.4, upSec = 0.6): () => void {
    return this.dubBus.filterDrop(targetHz, downSec, upSec);
  }

  getDubBusInput(): AudioNode { return this.dubBus.inputNode; }

  /** Expose the DubBus instance so ChannelEffectsManager can register channel taps. */
  getDubBus(): DubBus { return this.dubBus; }

  /**
   * Route a synth pad's post-effects audio into the dub bus at `amount` gain.
   * Called by useMIDIPadRouting after triggering a synth pad with dubSend > 0.
   *
   * The tap lives for the life of the instrument; repeat calls update the send
   * gain in place (for live dubSend knob changes). Passing `amount <= 0`, or
   * calling detachSynthPadDubSend, removes the tap.
   *
   * Silently no-ops when the bus is disabled or when the instrument's effect
   * chain hasn't been built yet (the caller will retry on the next trigger).
   */
  attachSynthPadDubSend(padId: number, instrumentId: number, amount: number): void {
    if (!this.dubBus.isEnabled || amount <= 0) {
      this.detachSynthPadDubSend(padId);
      return;
    }
    const instOutput = getToneEngine().getInstrumentChainOutput(instrumentId);
    if (!instOutput) return; // chain not built yet — caller retries next trigger

    // A mini-drain may be in flight from the previous pad's release — if so,
    // abort it so the user's echoIntensity + springWet come back RIGHT NOW.
    // Otherwise this new pad would play for up to ~1 s with zero echo while
    // the drain window ran to completion, which makes fast playing feel dead.
    this.dubBus.abortMiniDrain();

    const existing = this.synthPadDubSends.get(padId);
    if (existing && existing.source === instOutput) {
      // Same instrument — just update the send gain in place.
      existing.tap.gain.setTargetAtTime(amount, this.context.currentTime, 0.02);
      return;
    }
    // Instrument changed (or first attach) — tear down any stale tap.
    if (existing) {
      try { existing.tap.disconnect(); } catch { /* ok */ }
      this.synthPadDubSends.delete(padId);
    }

    const tap = this.context.createGain();
    tap.gain.value = amount;
    try {
      Tone.connect(instOutput, tap as unknown as Tone.InputNode);
      tap.connect(this.dubBus.inputNode);
      this.synthPadDubSends.set(padId, { tap, source: instOutput });
    } catch (err) {
      console.warn(`[DrumPadEngine] attachSynthPadDubSend pad ${padId}: connect failed`, err);
      try { tap.disconnect(); } catch { /* ok */ }
    }
  }

  /**
   * Remove a pad's synth dub-bus tap. Fades the send gain to 0 over `fadeSec`
   * (default 100ms — enough to avoid a click, short enough to actually cut
   * the bass tail) then disconnects the tap. Immediate disconnect via
   * `fadeSec = 0` for the hard-panic case.
   *
   * Why the fade: without it, any synth with internal reverb/delay keeps
   * feeding the dub bus long after the note releases — the echo never gets
   * a chance to decay because new input keeps arriving. With this fade the
   * bus stops receiving signal ~100ms after the pad release, and the echo
   * tail then decays on its own at its natural rate.
   *
   * When the last synth tap on the bus detaches AND no dub-action releasers
   * are active, trigger the bus's mini-drain so the echo's recirculating
   * energy snaps to zero for a 180ms window. Without this, rapid-fire stress
   * testing accumulates energy in the echo's internal feedback loop that
   * keeps ringing (the "pulsating bass tail after 20s" the user reported)
   * long after every pad has released.
   */
  detachSynthPadDubSend(padId: number, fadeSec = 0.1): void {
    const existing = this.synthPadDubSends.get(padId);
    if (!existing) return;
    this.synthPadDubSends.delete(padId);
    const { tap } = existing;
    const finishDisconnect = () => {
      try { tap.disconnect(); } catch { /* ok */ }
      // If this was the last synth tap, mini-drain the bus so any accumulated
      // echo energy stops ringing. Safe no-op when dub actions are in flight —
      // the mini-drain checks for that.
      if (this.synthPadDubSends.size === 0) {
        try { this.dubBus.miniDrainIfIdle(); } catch { /* ok */ }
      }
    };
    if (fadeSec <= 0) {
      finishDisconnect();
      return;
    }
    const now = this.context.currentTime;
    try {
      tap.gain.cancelScheduledValues(now);
      tap.gain.setValueAtTime(tap.gain.value, now);
      tap.gain.linearRampToValueAtTime(0, now + fadeSec);
    } catch { /* ok */ }
    setTimeout(finishDisconnect, Math.ceil(fadeSec * 1000) + 20);
  }

  setDubBusSettings(settings: Partial<DubBusSettings>): void {
    this.dubBus.setSettings(settings);
  }

  getDubBusSettings(): DubBusSettings { return this.dubBus.getSettings(); }

  /**
   * Reconnect master output to a different destination node.
   * Used when switching between standalone and DJ mixer routing.
   */
  rerouteOutput(destination: AudioNode): void {
    // Reroute at the vinylOutputNode level (not masterGain) so the
    // post-master vinyl chain stays active regardless of destination.
    // masterGain always feeds → vinylEffect → vinylOutputNode; only
    // vinylOutputNode's downstream target changes on reroute.
    const vinylOut = this.dubBus.getVinylOutputNode();
    vinylOut.disconnect();
    vinylOut.connect(destination);
  }

  /**
   * Set mute group assignments for all pads
   */
  setMuteGroups(pads: DrumPad[]): void {
    this.muteGroups.clear();
    for (const pad of pads) {
      if (pad.muteGroup > 0) {
        this.muteGroups.set(pad.id, pad.muteGroup);
      }
    }
  }

  /**
   * Build or update the per-pad effects chain.
   * Called lazily on trigger — caches by config hash to avoid rebuilding every hit.
   */
  private async ensurePadEffectsChain(pad: DrumPad): Promise<PadEffectsChain | null> {
    if (!pad.effects || pad.effects.length === 0) {
      // No effects — dispose any existing chain
      this.disposePadEffectsChain(pad.id);
      return null;
    }

    const hash = JSON.stringify(pad.effects.map(e => ({ t: e.type, e: e.enabled, w: e.wet, p: e.parameters })));
    const existing = this.padEffects.get(pad.id);
    if (existing && existing.configHash === hash) return existing;

    // Dispose old chain
    this.disposePadEffectsChain(pad.id);

    const outputBus = this.outputs.get(pad.output) || this.masterGain;

    // Create input/output gains for the chain
    const inputGain = this.context.createGain();
    const outputGain = this.context.createGain();
    outputGain.connect(outputBus);

    try {
      const effectNodes = await createEffectChain(pad.effects);

      if (effectNodes.length === 0) {
        inputGain.connect(outputGain);
      } else {
        // Connect: inputGain → first effect
        const first = effectNodes[0] as Tone.ToneAudioNode;
        Tone.connect(inputGain, first);

        // Chain effects together
        for (let i = 0; i < effectNodes.length - 1; i++) {
          const a = effectNodes[i] as Tone.ToneAudioNode;
          const b = effectNodes[i + 1] as Tone.ToneAudioNode;
          a.connect(b);
        }

        // Last effect → outputGain
        const last = effectNodes[effectNodes.length - 1] as Tone.ToneAudioNode;
        Tone.connect(last, outputGain);
      }

      const chain: PadEffectsChain = { inputGain, effects: effectNodes as any[], outputGain, configHash: hash };
      this.padEffects.set(pad.id, chain);
      return chain;
    } catch (err) {
      console.warn('[DrumPadEngine] Failed to create effects chain for pad', pad.id, err);
      inputGain.connect(outputGain);
      const chain: PadEffectsChain = { inputGain, effects: [], outputGain, configHash: hash };
      this.padEffects.set(pad.id, chain);
      return chain;
    }
  }

  /**
   * Dispose and remove a pad's effects chain.
   */
  private disposePadEffectsChain(padId: number): void {
    const chain = this.padEffects.get(padId);
    if (!chain) return;

    for (const fx of chain.effects) {
      try {
        (fx as Tone.ToneAudioNode).disconnect();
        fx.dispose();
      } catch { /* already disposed */ }
    }
    try { chain.inputGain.disconnect(); } catch { /* */ }
    try { chain.outputGain.disconnect(); } catch { /* */ }
    this.padEffects.delete(padId);
  }

  /**
   * Get or lazily create a reversed copy of an AudioBuffer
   */
  private getReversedBuffer(buffer: AudioBuffer): AudioBuffer {
    const cached = this.reversedBufferCache.get(buffer);
    if (cached) return cached;

    const reversed = this.context.createBuffer(
      buffer.numberOfChannels,
      buffer.length,
      buffer.sampleRate
    );
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const src = buffer.getChannelData(ch);
      const dst = reversed.getChannelData(ch);
      for (let i = 0; i < src.length; i++) {
        dst[i] = src[src.length - 1 - i];
      }
    }
    this.reversedBufferCache.set(buffer, reversed);
    return reversed;
  }

  /**
   * Trigger a pad with velocity
   */
  triggerPad(pad: DrumPad, velocity: number): void {
    // Select sample: check velocity layers first, fall back to main sample
    let sampleBuffer = pad.sample?.audioBuffer ?? null;
    let layerLevelOffset = 0;

    if (pad.layers.length > 0) {
      const matchingLayer = pad.layers.find(
        l => velocity >= l.velocityRange[0] && velocity <= l.velocityRange[1]
      );
      if (matchingLayer?.sample?.audioBuffer) {
        sampleBuffer = matchingLayer.sample.audioBuffer;
        layerLevelOffset = matchingLayer.levelOffset;
      }
    }

    if (!sampleBuffer) return;

    // Handle reverse: use reversed buffer
    if (pad.reverse) {
      sampleBuffer = this.getReversedBuffer(sampleBuffer);
    }

    // Mute group choking: stop all voices in the same non-zero mute group
    if (pad.muteGroup > 0) {
      for (const [otherPadId, otherGroup] of this.muteGroups.entries()) {
        if (otherGroup === pad.muteGroup && otherPadId !== pad.id) {
          this.stopPad(otherPadId);
        }
      }
    }

    // Stop any existing voice for this pad. Use an immediate hard-stop
    // (sync teardown) instead of the ramped stopPad so rapid-fire retriggers
    // don't leave a ~60 ms cleanup timer hanging that will later kill the
    // brand-new voice we're about to create. Previously this sequence races:
    //   1. stopPad(pad.id) → schedules cleanupVoice in 60 ms
    //   2. voices.set(pad.id, newVoice)
    //   3. 60 ms timer fires → cleanupVoice(pad.id) reads THE NEW voice and
    //      disconnects/stops it → pad goes silent after 60 ms.
    // Same hazard with onended from the OLD source firing after replacement.
    // Hard-stopping up-front kills the prior voice synchronously and cancels
    // any pending cleanup, leaving the voices map clean before we populate it.
    this.hardStopVoice(pad.id);

    // Enforce polyphony limit with voice stealing
    if (this.voices.size >= DrumPadEngine.MAX_VOICES) {
      this.stealOldestVoice();
    }

    const now = this.context.currentTime;
    const useFilter = pad.filterType !== 'off';

    // Create audio nodes — skip filter when not needed
    const source = this.context.createBufferSource();
    const gainNode = this.context.createGain();
    const panNode = this.context.createStereoPanner();
    let filterNode: BiquadFilterNode | null = null;

    // Configure source
    source.buffer = sampleBuffer;

    // Pitch: tune is ±120, where 10 units = 1 semitone (MPC-style fine tuning)
    const veloFactor = velocity / 127;
    const inverseVeloFactor = 1 - veloFactor;
    const pitchMod = (pad.veloToPitch / 100) * veloFactor * 12;
    const totalTune = pad.tune / 10 + pitchMod;
    if (totalTune !== 0) {
      source.playbackRate.value = Math.pow(2, totalTune / 12);
    }

    // Configure filter (only if active)
    if (useFilter) {
      filterNode = this.context.createBiquadFilter();
      switch (pad.filterType) {
        case 'lpf': filterNode.type = 'lowpass'; break;
        case 'hpf': filterNode.type = 'highpass'; break;
        case 'bpf': filterNode.type = 'bandpass'; break;
      }

      const veloCutoffMod = (pad.veloToFilter / 100) * veloFactor;
      const baseCutoff = pad.cutoff;
      const modulatedCutoff = baseCutoff + veloCutoffMod * (20000 - baseCutoff);

      filterNode.frequency.value = Math.min(20000, Math.max(20, modulatedCutoff));
      filterNode.Q.value = (pad.resonance / 100) * 20;

      // Filter envelope sweep (MPC-style)
      if (pad.filterEnvAmount > 0) {
        const envDepth = (pad.filterEnvAmount / 100) * (20000 - modulatedCutoff);
        const fAttackTime = (pad.filterAttack / 100) * 3;
        const fDecayTime = (pad.filterDecay / 100) * 2.6;
        const peakCutoff = Math.min(20000, modulatedCutoff + envDepth);

        filterNode.frequency.setValueAtTime(modulatedCutoff, now);
        filterNode.frequency.linearRampToValueAtTime(peakCutoff, now + fAttackTime);
        filterNode.frequency.exponentialRampToValueAtTime(
          Math.max(20, modulatedCutoff),
          now + fAttackTime + fDecayTime
        );
      }
    }

    // Configure pan (skip if centered)
    if (pad.pan !== 0) {
      panNode.pan.value = pad.pan / 64;
    }

    // Velocity-to-level: controls how much velocity affects amplitude
    const veloLevelAmount = pad.veloToLevel / 100;
    const velocityScale = 1 - veloLevelAmount * inverseVeloFactor;
    const levelScale = pad.level / 127;
    const layerScale = layerLevelOffset !== 0 ? Math.pow(10, layerLevelOffset / 20) : 1;
    const targetGain = velocityScale * levelScale * layerScale;

    // Velocity-to-attack modulation: higher velocity = shorter attack
    const baseAttack = pad.attack / 1000;
    const veloAttackMod = (pad.veloToAttack / 100) * inverseVeloFactor;
    const attackTime = baseAttack * (1 + veloAttackMod * 2);

    const decayTime = pad.decay / 1000;
    const sustainLevel = (pad.sustain / 100) * targetGain;

    // ADSR envelope — use setValueAtTime for instant-attack pads to avoid ramp overhead
    if (attackTime < 0.001) {
      gainNode.gain.setValueAtTime(targetGain, now);
    } else {
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(targetGain, now + attackTime);
    }
    gainNode.gain.linearRampToValueAtTime(sustainLevel, now + attackTime + decayTime);

    // Connect nodes — route through effects chain if pad has effects
    const effectsChain = this.padEffects.get(pad.id);
    const outputBus = this.outputs.get(pad.output) || this.masterGain;
    if (filterNode) {
      source.connect(filterNode);
      filterNode.connect(panNode);
    } else {
      source.connect(panNode);
    }
    panNode.connect(gainNode);

    // The "final" node for this voice — whatever comes after the pad's FX
    // chain (if any) and before the dry bus. Both the dry send and the
    // dub-bus send tap off this node. We tap POST-FX so the pad's EQ/Sat
    // colors the send too; matches the subjective "this pad + X% more echo".
    let voiceOutput: AudioNode = gainNode;
    if (effectsChain) {
      gainNode.connect(effectsChain.inputGain);
      voiceOutput = effectsChain.outputGain;
      // effectsChain.outputGain is already connected to outputBus inside
      // ensurePadEffectsChain(), so the dry path is done.
    } else {
      gainNode.connect(outputBus);
    }

    // Per-voice dub send — tap post-FX, held on voice state so cleanupVoice
    // can disconnect it deterministically instead of waiting for GC. Under
    // high polyphony a GC-only strategy accumulated hundreds of orphan
    // GainNodes in a long session; explicit disconnect keeps the audio graph
    // lean for hours of live use.
    let dubSendNode: GainNode | null = null;
    if (this.dubBus.isEnabled && (pad.dubSend ?? 0) > 0) {
      dubSendNode = this.context.createGain();
      dubSendNode.gain.value = pad.dubSend!;
      voiceOutput.connect(dubSendNode);
      dubSendNode.connect(this.dubBus.inputNode);
    }

    // Lazily build effects chain for next trigger if pad has effects but no chain yet
    if (pad.effects && pad.effects.length > 0 && !effectsChain) {
      this.ensurePadEffectsChain(pad).catch(() => {});
    }

    // Calculate sample start/end offsets
    const veloStartMod = (pad.veloToStart / 100) * inverseVeloFactor;
    let effectiveStart = pad.sampleStart + veloStartMod * (pad.sampleEnd - pad.sampleStart);
    effectiveStart = Math.min(effectiveStart, pad.sampleEnd - 0.01);

    let startOffset: number;
    let playDuration: number;
    if (pad.reverse) {
      startOffset = (1 - pad.sampleEnd) * sampleBuffer.duration;
      playDuration = (pad.sampleEnd - effectiveStart) * sampleBuffer.duration;
    } else {
      startOffset = effectiveStart * sampleBuffer.duration;
      playDuration = (pad.sampleEnd - effectiveStart) * sampleBuffer.duration;
    }

    // Start playback — schedule at 0 (now) for minimum latency
    source.start(0, startOffset, playDuration);

    // Store voice state
    const voice: VoiceState = {
      source,
      gainNode,
      filterNode: filterNode!,
      panNode,
      dubSendNode,
      startTime: now,
      noteOffTime: null,
      velocity,
    };

    // Auto-cleanup via onended (no extra silent-buffer timer node).
    // Guard against voice replacement: if a newer voice has taken this pad's
    // slot (e.g. rapid-fire retrigger), our onended must NOT tear that one
    // down. Identity check on the source handles this cleanly.
    source.onended = () => {
      const current = this.voices.get(pad.id);
      if (current?.source === source) {
        this.cleanupVoice(pad.id);
      } else {
        // Stale onended — our source was replaced. Best-effort disconnect
        // the local nodes so they're immediately GC-eligible.
        try { source.disconnect(); } catch { /* ok */ }
        try { gainNode.disconnect(); } catch { /* ok */ }
        try { filterNode?.disconnect(); } catch { /* ok */ }
        try { panNode.disconnect(); } catch { /* ok */ }
        try { dubSendNode?.disconnect(); } catch { /* ok */ }
      }
    };

    this.voices.set(pad.id, voice);
  }

  /**
   * Synchronously stop and disconnect a pad's current voice — no ramp, no
   * timer. Used by `triggerPad` on retrigger so the replacement voice we're
   * about to insert into the voices map isn't racing a 60 ms cleanup timer
   * scheduled by the previous `stopPad` call. A tiny click is acceptable
   * here; the alternative (the previous silent-after-60 ms bug) was worse.
   */
  private hardStopVoice(padId: number): void {
    // Cancel any scheduled soft-stop cleanup timer first so it can't run
    // against the voice we're about to insert.
    const pending = this.pendingCleanupTimers.get(padId);
    if (pending) {
      clearTimeout(pending);
      this.pendingCleanupTimers.delete(padId);
    }
    const voice = this.voices.get(padId);
    if (!voice) return;
    // Delete BEFORE disconnect so any onended that fires synchronously from
    // source.stop() below sees no entry and short-circuits.
    this.voices.delete(padId);
    try {
      voice.gainNode.gain.cancelScheduledValues(this.context.currentTime);
      voice.gainNode.gain.setValueAtTime(0, this.context.currentTime);
    } catch { /* ok */ }
    try { voice.source?.stop(); } catch { /* already stopped */ }
    try { voice.source?.disconnect(); } catch { /* ok */ }
    try { voice.gainNode.disconnect(); } catch { /* ok */ }
    try { voice.filterNode?.disconnect(); } catch { /* ok */ }
    try { voice.panNode.disconnect(); } catch { /* ok */ }
    try { voice.dubSendNode?.disconnect(); } catch { /* ok */ }
  }

  /**
   * Stop a pad (note off). Optional releaseTime in seconds for sustain mode pads.
   */
  stopPad(padId: number, releaseTime?: number): void {
    const voice = this.voices.get(padId);
    if (!voice || voice.noteOffTime !== null) {
      return;
    }

    const now = this.context.currentTime;
    voice.noteOffTime = now;

    const fadeTime = releaseTime ?? 0.01; // Default 10ms for fast choke

    // Release envelope (linear ramp to 0)
    voice.gainNode.gain.cancelScheduledValues(now);
    voice.gainNode.gain.setValueAtTime(voice.gainNode.gain.value, now);
    voice.gainNode.gain.linearRampToValueAtTime(0, now + fadeTime);

    // Cleanup after fade completes. Snapshot the voice identity so the timer
    // only tears down THIS voice — if another triggerPad inserts a new voice
    // into this slot before the timer fires, we leave it alone.
    const pendingSource = voice.source;
    // Clear any earlier pending cleanup for this pad before replacing it.
    const prior = this.pendingCleanupTimers.get(padId);
    if (prior) clearTimeout(prior);
    const timer = setTimeout(() => {
      this.pendingCleanupTimers.delete(padId);
      const cur = this.voices.get(padId);
      if (cur?.source === pendingSource) {
        this.cleanupVoice(padId);
      }
      // else: voice was replaced by a newer trigger — leave it alone.
    }, (fadeTime + 0.05) * 1000);
    this.pendingCleanupTimers.set(padId, timer);
  }

  /**
   * Steal the oldest voice when polyphony limit is reached
   */
  private stealOldestVoice(): void {
    if (this.voices.size === 0) return;

    // Find the voice with the oldest start time
    let oldestPadId: number | null = null;
    let oldestStartTime = Infinity;

    for (const [padId, voice] of this.voices.entries()) {
      if (voice.startTime < oldestStartTime) {
        oldestStartTime = voice.startTime;
        oldestPadId = padId;
      }
    }

    if (oldestPadId !== null) {
      // Stop the oldest voice to make room
      this.stopPad(oldestPadId);
    }
  }

  /**
   * Clean up voice resources (now race-condition safe)
   */
  private cleanupVoice(padId: number): void {
    if (this._disposed) return;
    const voice = this.voices.get(padId);
    if (!voice) {
      return;
    }

    this.voices.delete(padId);

    try {
      voice.source?.disconnect();
      voice.gainNode.disconnect();
      voice.filterNode?.disconnect();
      voice.panNode.disconnect();
      // Disconnect the per-voice dub send so the GainNode is eligible for
      // immediate GC instead of lingering attached to dubBusInput.
      voice.dubSendNode?.disconnect();
      voice.source?.stop();
    } catch {
      // Ignore errors from already-stopped sources
    }
  }

  /**
   * Set master level
   */
  setMasterLevel(level: number): void {
    this.masterGain.gain.value = level / 127;
  }

  /** Set master gain directly in linear units (0..N). */
  setMasterVolume(value: number): void {
    this.masterGain.gain.setTargetAtTime(Math.max(0, Math.min(4, value)), this.context.currentTime, 0.01);
  }

  /** Read master gain (linear units). */
  getMasterVolume(): number {
    return this.masterGain.gain.value;
  }

  /**
   * Set output bus level
   */
  setOutputLevel(bus: string, level: number): void {
    const output = this.outputs.get(bus);
    if (output) {
      output.gain.value = level / 127;
    }
  }

  /**
   * Stop all voices
   */
  stopAll(): void {
    const padIds = Array.from(this.voices.keys());
    padIds.forEach(padId => this.stopPad(padId));
  }

  /**
   * Cleanup and release resources
   */
  dispose(): void {
    this._disposed = true;
    // Cancel all pending async cleanup timers
    this.pendingCleanupTimers.forEach(t => clearTimeout(t));
    this.pendingCleanupTimers.clear();
    // Dispose all pad effects chains
    for (const padId of this.padEffects.keys()) {
      this.disposePadEffectsChain(padId);
    }
    // Synchronously disconnect all voices
    for (const [, voice] of this.voices) {
      try {
        voice.source?.disconnect();
        voice.gainNode.disconnect();
        voice.filterNode?.disconnect();
        voice.panNode.disconnect();
        voice.source?.stop();
      } catch { /* ignore */ }
    }
    this.voices.clear();
    // Tear down the dub bus — this disconnects + disposes all bus nodes,
    // detaches from any mixer, and cancels all in-flight timers/releasers.
    try { setDubBusForRouter(null); } catch { /* ok */ }
    try { this.dubBus.dispose(); } catch { /* ok */ }
    this.masterGain.disconnect();
    this.outputs.forEach(output => output.disconnect());
    this.outputs.clear();
  }

  /**
   * Pre-build effects chains for all pads that have effects.
   * Call after pad config changes (e.g., applying FX preset from context menu).
   */
  async updatePadEffects(pads: DrumPad[]): Promise<void> {
    for (const pad of pads) {
      if (pad.effects && pad.effects.length > 0) {
        await this.ensurePadEffectsChain(pad);
      } else {
        this.disposePadEffectsChain(pad.id);
      }
    }
  }

  /**
   * Get a voice's filter node for real-time modulation (joystick etc.)
   * Returns null if pad has no active voice or no filter.
   */
  getVoiceFilter(padId: number): BiquadFilterNode | null {
    return this.voices.get(padId)?.filterNode ?? null;
  }
}
