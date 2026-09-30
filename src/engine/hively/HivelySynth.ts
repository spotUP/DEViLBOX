/**
 * HivelySynth.ts - DevilboxSynth wrapper for HivelyTracker engine
 *
 * Two modes of operation:
 * 1. Song playback: triggerAttack starts playback, triggerRelease stops.
 * 2. Standalone instrument: triggerAttack(note) sends note to WASM player.
 *
 * Mode is determined by whether an instrument config is set. When used as
 * a tracker instrument (via InstrumentFactory), it operates in standalone mode.
 */

import type { DevilboxSynth } from '@/types/synth';
import type { HivelyConfig } from '@/types/instrument';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';
import { HivelyEngine } from './HivelyEngine';

export class HivelySynth implements DevilboxSynth {
  readonly name = 'HivelySynth';
  readonly output: GainNode;

  private engine: HivelyEngine;
  private audioContext: AudioContext;
  private _disposed = false;
  private _playerHandle = -1;
  private _instrumentMode = false;
  private _pendingConfig: HivelyConfig | null = null;
  private _setupPromise: Promise<void> | null = null;
  /**
   * The one note waiting for the player to exist. Monophonic, so one slot.
   *
   * An attack that arrives while `_setupPromise` is still pending used to
   * re-fire itself from a bare `.then` — nothing could take it back. A
   * release in the meantime found `_playerHandle` still -1, fell into the
   * song-mode branch, and sent no noteOff; when setup finished the attack
   * landed on a player nobody would ever release. ToneEngine's song-load
   * pre-warm (attack, release 50 ms later) did exactly this on every AHX
   * load — 2026-09-23, "a ringing sound that dont go away" before Play.
   */
  private _queuedAttack: { note?: string | number; velocity?: number } | null = null;

  /**
   * Track whether the singleton engine output is already connected to a
   * HivelySynth output.  Only the FIRST instance bridges the engine audio
   * into the Tone.js graph — additional instances share the same routing
   * and avoid duplicate connections that would multiply the volume.
   */
  private _ownsEngineConnection = false;

  /**
   * Whether this instance carries the TUNE into the graph.
   *
   * The tune is one signal from a singleton engine. Every instance bridging it
   * would sum the same audio N times, so exactly one does — the comment above
   * has always said so, and this enforces it.
   */
  private _ownsTuneBridge = false;

  /** The instance currently bridging the tune, if any. */
  private static _tuneBridgeOwner: HivelySynth | null = null;

  /** Every instance that has not been disposed, so the tune can be handed on. */
  private static _liveInstances = new Set<HivelySynth>();

  constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();

    this.engine = HivelyEngine.getInstance();

    // Connect the engine's INSTRUMENT output to every HivelySynth instance.
    // The engine is a singleton, but each instrument slot needs its own output
    // for the mixer. Not only `engine.output`: that is the tune, and the host
    // mutes it on transport stop, which silenced every live note after a stop
    // while the players were summed into it (2026-09-23).
    this.engine.instrumentOutput.connect(this.output);
    this._ownsEngineConnection = true;

    // ...and the TUNE, which still needs a way in.
    //
    // This output is the only bridge Hively audio has into the mixer:
    // `NativeEngineRouting` reroutes the SYNTH, not the engine. Moving this
    // connection from `engine.output` to `engine.instrumentOutput` saved the
    // live notes and left the tune rendering into a gain node connected to
    // nothing — every .ahx and .hvl played silently while the rows advanced
    // (2026-09-24). Both belong here: the tune, which the host may mute on
    // stop, and the players, which it must not.
    this.bridgeTune();
    HivelySynth._liveInstances.add(this);
  }

  /** Take over carrying the tune, unless another live instance already does. */
  private bridgeTune(): void {
    if (HivelySynth._tuneBridgeOwner && !HivelySynth._tuneBridgeOwner._disposed) return;
    this.engine.output.connect(this.output);
    this._ownsTuneBridge = true;
    HivelySynth._tuneBridgeOwner = this;
  }

  async ensureInitialized(): Promise<void> {
    await this.engine.ready();
  }


  /**
   * Remember the instrument without setting up its player yet: the first note
   * sets it up (triggerAttack's lazy branch). For a synth created while a tune
   * is loaded - setting up a player per instrument then interfered with the
   * tune, so the factory skipped the config entirely, and a note on that
   * synth fell through to song mode and played the WHOLE SONG ("when i play an
   * instrument the whole song plays", 2026-09-30).
   */
  setPendingInstrument(config: HivelyConfig): void {
    if (!this._instrumentMode && !this._setupPromise) this._pendingConfig = config;
  }

  /**
   * Set up this synth for standalone instrument playback.
   * Call this with a HivelyConfig to enable per-note triggering.
   */
  async setInstrument(config: HivelyConfig): Promise<void> {
    this._pendingConfig = config;
    this._setupPromise = this._doSetInstrument(config);
    return this._setupPromise;
  }

  private async _doSetInstrument(config: HivelyConfig): Promise<void> {
    console.warn('[HivelySynth] setInstrument called, config entries:', config.performanceList.entries.length);
    this._instrumentMode = true;

    // Wait for engine to be ready
    await this.engine.ready();
    if (this._disposed) return;

    // Request player creation from worklet
    this.engine.sendMessage({ type: 'createPlayer' });

    // The handle will come back via a 'playerCreated' message.
    this._playerHandle = await this.engine.waitForPlayerHandle();
    if (this._disposed || this._playerHandle < 0) return;

    console.warn('[HivelySynth] player created, handle=' + this._playerHandle);

    // Serialize and upload instrument data to WASM
    const insBuffer = this.serializeInstrument(config);
    this.engine.sendMessage(
      { type: 'setInstrument', handle: this._playerHandle, buffer: insBuffer },
      [insBuffer]
    );
  }

  /** Serialize HivelyConfig to the 22-byte + plist binary format */
  private serializeInstrument(cfg: HivelyConfig): ArrayBuffer {
    const plistLen = cfg.performanceList.entries.length;
    const totalLen = 22 + plistLen * 5;
    const buf = new Uint8Array(totalLen);

    buf[0] = cfg.volume & 0xff;
    buf[1] = ((cfg.filterSpeed & 0x1f) << 3) | (cfg.waveLength & 0x07);
    buf[2] = cfg.envelope.aFrames & 0xff;
    buf[3] = cfg.envelope.aVolume & 0xff;
    buf[4] = cfg.envelope.dFrames & 0xff;
    buf[5] = cfg.envelope.dVolume & 0xff;
    buf[6] = cfg.envelope.sFrames & 0xff;
    buf[7] = cfg.envelope.rFrames & 0xff;
    buf[8] = cfg.envelope.rVolume & 0xff;
    buf[9] = 0; buf[10] = 0; buf[11] = 0; // reserved
    buf[12] = (cfg.filterLowerLimit & 0x7f) | (((cfg.filterSpeed >> 5) & 1) << 7);
    buf[13] = cfg.vibratoDelay & 0xff;
    buf[14] = (cfg.hardCutRelease ? 0x80 : 0) | ((cfg.hardCutReleaseFrames & 0x07) << 4) | (cfg.vibratoDepth & 0x0f);
    buf[15] = cfg.vibratoSpeed & 0xff;
    buf[16] = cfg.squareLowerLimit & 0xff;
    buf[17] = cfg.squareUpperLimit & 0xff;
    buf[18] = cfg.squareSpeed & 0xff;
    buf[19] = cfg.filterUpperLimit & 0x3f;
    buf[20] = cfg.performanceList.speed & 0xff;
    buf[21] = plistLen & 0xff;

    let offset = 22;
    for (const e of cfg.performanceList.entries) {
      buf[offset++] = e.fx[0] & 0x0f;
      buf[offset++] = ((e.fx[1] & 0x0f) << 3) | (e.waveform & 0x07);
      buf[offset++] = ((e.fixed ? 1 : 0) << 6) | (e.note & 0x3f);
      buf[offset++] = e.fxParam[0] & 0xff;
      buf[offset++] = e.fxParam[1] & 0xff;
    }

    return buf.buffer;
  }

  triggerAttack(note?: string | number, _time?: number, velocity?: number): void {
    if (this._disposed) return;

    // Lazy setup: if we have a pending config but haven't finished setup yet,
    // wait for setup then trigger the note
    if (!this._instrumentMode && this._pendingConfig && !this._setupPromise) {
      this.setInstrument(this._pendingConfig);
    }

    if (this._instrumentMode && this._playerHandle >= 0) {
      // Standalone instrument mode: trigger note on the WASM player
      let midiNote: number;
      if (typeof note === 'string') {
        midiNote = noteToMidi(note);
      } else if (typeof note === 'number') {
        midiNote = note;
      } else {
        midiNote = 36; // default to C-2
      }

      // Convert MIDI note to HVL note (HVL note 1 = C-0 = MIDI 0)
      // MIDI 0 = C-0 = HVL 1, MIDI 12 = C-1 = HVL 13, etc.
      const hvlNote = Math.max(1, Math.min(60, midiNote + 1));
      const vel = Math.max(64, Math.round((velocity ?? 1) * 127));

      this.engine.sendMessage({
        type: 'noteOn',
        handle: this._playerHandle,
        note: hvlNote,
        velocity: vel,
      });
    } else if (this._setupPromise) {
      // Setup still in progress — park this note until the player exists.
      // A release before then clears the slot, and only the note still in
      // the slot fires: a release must always be able to take an attack back.
      const queued = { note, velocity };
      this._queuedAttack = queued;
      this._setupPromise.then(() => {
        if (this._queuedAttack !== queued) return;
        this._queuedAttack = null;
        if (!this._disposed && this._playerHandle >= 0) {
          this.triggerAttack(queued.note, undefined, queued.velocity);
        }
      });
    } else {
      // Song playback mode
      this.engine.play();
    }
  }

  triggerRelease(_note?: string | number, _time?: number): void {
    if (this._disposed) return;

    // Whatever was waiting for the player is released before it ever plays.
    this._queuedAttack = null;

    if (this._instrumentMode) {
      // Instrument mode with no player yet: the queued attack is gone and
      // there is nothing on the worklet to stop. This is NOT a song stop —
      // the engine is a singleton, and stopping it here would halt whatever
      // tune it is playing for someone else.
      if (this._playerHandle >= 0) {
        this.engine.sendMessage({
          type: 'noteOff',
          handle: this._playerHandle,
        });
      }
    } else {
      this.engine.stop();
    }
  }

  /**
   * Release all voices / stop playback (panic button, song stop, etc.)
   */
  releaseAll(): void {
    this.triggerRelease();
  }

  set(param: string, value: number): void {
    switch (param) {
      case 'volume':
        this.output.gain.value = Math.max(0, Math.min(1, value));
        break;
      case 'filterSpeed':
        this._setAllVoices(0, Math.round(value * 64));
        break;
      case 'filterLower':
        this._setAllVoices(1, Math.round(value * 63));
        break;
      case 'filterUpper':
        this._setAllVoices(2, Math.round(value * 63));
        break;
      case 'vibratoSpeed':
        this._setAllVoices(3, Math.round(value * 63));
        break;
      case 'vibratoDepth':
        this._setAllVoices(4, Math.round(value * 15));
        break;
      case 'squareSpeed':
        this._setAllVoices(5, Math.round(value * 64));
        break;
      case 'pan':
        this._setAllVoices(6, Math.round(value * 255));
        break;
    }
  }

  /** Send a voice param to all channels (Hively has 4-8 channels) */
  private _setAllVoices(paramId: number, value: number): void {
    for (let ch = 0; ch < 8; ch++) {
      this.engine.sendMessage({ type: 'setVoiceParam', channel: ch, paramId, value });
    }
  }

  get(param: string): number | undefined {
    switch (param) {
      case 'volume':
        return this.output.gain.value;
    }
    return undefined;
  }

  getEngine(): HivelyEngine {
    return this.engine;
  }

  dispose(): void {
    this._disposed = true;

    if (this._instrumentMode && this._playerHandle >= 0) {
      this.engine.sendMessage({ type: 'destroyPlayer', handle: this._playerHandle });
      this._playerHandle = -1;
    }

    // Only disconnect THIS synth's output from the engine — never call
    // engine.output.disconnect() which would sever the singleton's
    // connection to all other destinations (synthBus, stereo separation, etc.).
    if (this._ownsEngineConnection) {
      try {
        this.engine.instrumentOutput.disconnect(this.output);
      } catch { /* may already be disconnected */ }
      this._ownsEngineConnection = false;
    }

    // Hand the tune to another live instance rather than letting it go quiet
    // because the instance that happened to own the bridge was disposed.
    if (this._ownsTuneBridge) {
      try {
        this.engine.output.disconnect(this.output);
      } catch { /* may already be disconnected */ }
      this._ownsTuneBridge = false;
      if (HivelySynth._tuneBridgeOwner === this) HivelySynth._tuneBridgeOwner = null;
      for (const other of HivelySynth._liveInstances) {
        if (other !== this && !other._disposed) { other.bridgeTune(); break; }
      }
    }
    HivelySynth._liveInstances.delete(this);
  }
}
